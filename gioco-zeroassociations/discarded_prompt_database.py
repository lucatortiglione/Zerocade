"""Copia degli scarti della preselezione e delle decisioni esplicite sui prompt.

Gli scarti automatici non sono giudizi semantici né divieti di usare una parola
come risposta. I rinvii DEFERRED restano in attesa, non sono scarti definitivi.
"""
from __future__ import annotations

import unified_db
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile

from prompt_database import DEFAULT_DB, ROOT
from semantic_rules import SEMANTIC_POLICY
from sqlite_prompt_runtime import SQLite, literal, publish_database
from validated_prompt_database import has_table, validate_record

DISCARDED_DB = ROOT/'prompt_scartati.sqlite3'
FILTERED_DB = ROOT/'prompt_filtrati.sqlite3'
ROLE = 'discarded-prompts-1'
SCHEMA = """
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
CREATE TABLE discarded_prompts(
 prompt TEXT PRIMARY KEY,reason TEXT NOT NULL,
 stage TEXT NOT NULL CHECK(stage IN ('AUTOMATIC_FILTER','EDITORIAL_DECISION')),
 zipf REAL,actor TEXT,decided_at TEXT,decision_history_id INTEGER
) STRICT;
CREATE INDEX discarded_by_reason ON discarded_prompts(stage,reason);
CREATE VIEW discarded_catalog AS SELECT * FROM discarded_prompts;
"""


def status(db):
    return {'output':str(db.path),
        'discarded_prompts':db.run('SELECT count(*) AS n FROM discarded_prompts;',rows=True)[0]['n'],
        'by_stage':db.run('SELECT stage,count(*) AS n FROM discarded_prompts GROUP BY stage;',rows=True),
        'by_reason':db.run('SELECT stage,reason,count(*) AS n FROM discarded_prompts GROUP BY stage,reason ORDER BY n DESC;',rows=True),
        'sqlite_version':db.run('SELECT sqlite_version() AS v;',rows=True)[0]['v']}


def sync_discarded(raw_path=DEFAULT_DB, filtered_path=FILTERED_DB, output=DISCARDED_DB):
    raw_path,filtered_path,output = (Path(p).resolve() for p in (raw_path,filtered_path,output))
    if output in {raw_path,filtered_path,ROOT/'prompt_validi.sqlite3',ROOT/'prompt.sqlite3'}:
        raise ValueError('Il database degli scarti deve essere un file distinto')
    if not unified_db.exists(raw_path) or not unified_db.exists(filtered_path):
        raise ValueError('Servono la raccolta e il database dei candidati filtrati')
    source = SQLite(raw_path)
    filtered = SQLite(filtered_path,source.executable)
    if unified_db.exists(output):
        old = SQLite(output,source.executable)
        if not has_table(old,'metadata') or not old.run(
                "SELECT value FROM metadata WHERE key='database_role' AND value="+literal(ROLE)+';',rows=True):
            raise ValueError('Destinazione esistente non gestita: scegliere un nuovo file')
    meta = {r['key']:r['value'] for r in filtered.run('SELECT * FROM metadata;',rows=True)}
    if Path(meta.get('source_db','')).resolve() != raw_path:
        raise ValueError('I filtri appartengono a una raccolta diversa: ricostruirli')
    # Una revisione positiva corrente prevale sui filtri automatici. Lo scarto
    # esplicito successivo prevale comunque sulla revisione precedente.
    reviewed = []
    if has_table(source,'prompt_validation_heads'):
        for row in source.run('SELECT v.record_json FROM prompt_validation_heads h '
                'JOIN prompt_validations v ON v.id=h.validation_id;',rows=True):
            record = json.loads(row['record_json'])
            try:
                validate_record(record)
                reviewed.append(record['prompt'])
            except ValueError:
                pass
    decision_table = has_table(source,'inventory_term_decisions')
    history_table = has_table(source,'inventory_decision_history')
    output.parent.mkdir(parents=True,exist_ok=True)
    handle,name = tempfile.mkstemp(prefix=output.stem+'.',suffix='.part',dir=output.parent)
    os.close(handle)
    temporary = Path(name)
    try:
        db = SQLite(temporary,source.executable)
        db.run(SCHEMA)
        statements = ['ATTACH DATABASE '+literal(raw_path.as_uri()+'?mode=ro')+' AS raw;',
            'ATTACH DATABASE '+literal(filtered_path.as_uri()+'?mode=ro')+' AS filt;',
            'BEGIN;', 'CREATE TEMP TABLE approved(prompt TEXT PRIMARY KEY);']
        statements += ['INSERT OR IGNORE INTO approved VALUES ('+literal(p)+');' for p in reviewed]
        # Controllo dentro la stessa fotografia SQLite usata per la copia.
        # Una raccolta cresciuta dopo i filtri contiene voci non ancora valutate:
        # non devono essere etichettate come scarti per semplice differenza.
        statements += ["CREATE TEMP TABLE snapshot_guard(ok INTEGER NOT NULL CHECK(ok=1));",
            'INSERT INTO snapshot_guard SELECT (SELECT count(*) FROM raw.inventory_terms)='
            '(SELECT remaining FROM filt.filter_steps WHERE step=0);']
        if 'inventory_snapshot_ids' in meta:
            statements.append("INSERT INTO snapshot_guard SELECT json("+literal(meta['inventory_snapshot_ids'])+
                ")=(SELECT json_group_array(id) FROM (SELECT id FROM raw.inventory_snapshots ORDER BY id));")
        decision_join = ('LEFT JOIN raw.inventory_term_decisions d ON d.prompt=t.prompt ' if decision_table else '')
        decision_exclusion = ("AND coalesce(d.decision,'COLLECTED') NOT IN ('DEFERRED','DISCARDED') " if decision_table else '')
        statements.append("INSERT INTO discarded_prompts(prompt,reason,stage,zipf) "
            "SELECT t.prompt,CASE WHEN r.reason IS NOT NULL THEN r.reason "
            "WHEN t.is_single_word=0 THEN 'non_parola_singola' "
            "WHEN t.has_lemma_evidence=0 THEN 'nessuna_prova_di_lemma' "
            "WHEN length(t.prompt)<2 OR length(t.prompt)>15 OR t.prompt GLOB '*[^a-zàèéìòù]*' "
            "THEN 'forma_non_canonica' ELSE 'sotto_soglia_familiarita' END,"
            "'AUTOMATIC_FILTER',r.zipf FROM raw.inventory_terms t "
            "LEFT JOIN filt.filtered_prompts f ON f.prompt=t.prompt "
            "LEFT JOIN filt.filter_rejections r ON r.prompt=t.prompt "
            "LEFT JOIN approved a ON a.prompt=t.prompt "+decision_join+
            "WHERE f.prompt IS NULL AND a.prompt IS NULL "+decision_exclusion+
            "AND (r.reason IS NULL OR r.reason<>'scartata_o_rimandata_nella_raccolta');")
        if decision_table:
            history = ("(SELECT max(h.id) FROM raw.inventory_decision_history h "
                       "WHERE h.subject_type='TERM' AND h.subject_id=d.prompt AND h.decision='DISCARDED')"
                       if history_table else 'NULL')
            statements.append("INSERT OR REPLACE INTO discarded_prompts "
                "SELECT d.prompt,d.reason,'EDITORIAL_DECISION',r.zipf,d.actor,d.decided_at,"+history+
                " FROM raw.inventory_term_decisions d LEFT JOIN filt.filter_rejections r ON r.prompt=d.prompt "
                "WHERE d.decision='DISCARDED';")
        for key,value in {'database_role':ROLE,'source_db':str(raw_path),'filtered_db':str(filtered_path),
                'filter_version':meta.get('filter_version','unknown'),'filter_created_at':meta.get('created_at','unknown'),
                'created_at':datetime.now(timezone.utc).isoformat(),'semantic_policy':SEMANTIC_POLICY,
                'automatic_rejections_are_semantic_reviews':'false','deferred_are_discarded':'false',
                'scope':'all_current_filter_exclusions_and_explicit_prompt_discards'}.items():
            statements.append('INSERT INTO metadata VALUES ('+literal(key)+','+literal(value)+');')
        statements.append('COMMIT;')
        try:
            db.run(''.join(statements))
        except RuntimeError as error:
            if 'snapshot_guard' in str(error) or 'CHECK constraint failed: ok=1' in str(error):
                raise ValueError('Raccolta cambiata dopo i filtri: eseguire prima filter_prompts.py build') from error
            raise
        if db.run('PRAGMA integrity_check;',rows=True) != [{'integrity_check':'ok'}]:
            raise ValueError('Errore di integrità nel database degli scarti')
        result = status(db)
        result['output'] = str(output)
        result['raw_entries_deleted'] = 0
        result['semantic_approval'] = False
        result['publish_method'] = publish_database(temporary,output,source.executable)
        return result
    finally:
        temporary.unlink(missing_ok=True)


def main(argv=None):
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=DEFAULT_DB)
    parser.add_argument('--filtered',type=Path,default=FILTERED_DB)
    parser.add_argument('--output',type=Path,default=DISCARDED_DB)
    parser.add_argument('command',choices=['sync','status'])
    args = parser.parse_args(argv)
    if args.command=='status' and not unified_db.exists(args.output):
        raise ValueError('DB degli scarti assente: eseguire sync')
    result = (sync_discarded(args.source,args.filtered,args.output) if args.command=='sync'
              else status(SQLite(args.output)))
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0


if __name__=='__main__':
    try:
        raise SystemExit(main())
    except (ValueError,RuntimeError,OSError) as error:
        print(str(error),file=sys.stderr)
        raise SystemExit(1)

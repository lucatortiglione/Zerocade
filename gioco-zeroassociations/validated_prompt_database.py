"""Copia controllata dall'inventario al DB delle voci valide, senza approvazioni automatiche.

I verbali devono provenire da una revisione reale già effettuata. I controlli
del programma verificano il contratto e l'integrità, non il significato.
prompt_validi.sqlite3 contiene i prompt validati insieme alle loro parole associate:
solo quelli con un bacino verificato del senso scelto. I prompt validati ancora senza
associazioni restano nella raccolta e sono copiati in prompt_filtrati.sqlite3
(filter_prompts.py, tabella validated_prompts).
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
import tempfile

from prompt_database import (DEFAULT_DB, ROOT, WORD, digest, import_reviewed,
    initialize, insert, load_categories, load_pools, required_text, review_policy,
    validate_pool)
from prompt_policy import load_prompt_policy
from semantic_rules import SEMANTIC_POLICY
from sqlite_prompt_runtime import SQLite, literal, publish_database

VALIDATED_DB = ROOT/'prompt_validi.sqlite3'
PROMPT_CHECKS = ('single_familiar_sense', 'prompt_language', 'canonical_form',
                 'familiarity', 'category_reviewed')
VALIDATED_SCHEMA = """
CREATE TABLE validated_prompts(
  prompt TEXT PRIMARY KEY, language TEXT NOT NULL CHECK(language IN ('it','common_loanword')),
  sense_description TEXT NOT NULL, pos TEXT NOT NULL CHECK(pos IN ('NOUN','VERB','ADJ')),
  category_id TEXT NOT NULL REFERENCES categories(category_id),
  validation_id TEXT NOT NULL, policy_version TEXT NOT NULL,
  source_db TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json))
) STRICT;
CREATE VIEW validated_catalog AS
 SELECT v.prompt,v.language,v.sense_description,v.pos,v.category_id,c.category_name,
 v.validation_id,v.policy_version,
 (SELECT count(*) FROM associations a JOIN senses s ON s.id=a.sense_id
  WHERE s.prompt=v.prompt AND s.description=v.sense_description) AS association_count
 FROM validated_prompts v JOIN categories c ON c.category_id=v.category_id;
"""


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def validate_record(record):
    """Accetta verbali di soli prompt o riusa verbali completi di bacini."""
    if not isinstance(record, dict):
        raise ValueError('Verbale non strutturato')
    if record.get('schema') == 'verified-pool-1':
        validate_pool(record)
        if not required_text(record['review'].get('category_rationale'), 20):
            raise ValueError('Motivazione della categoria mancante')
        return
    if record.get('schema') != 'verified-prompt-1':
        raise ValueError('Serve un verbale verified-prompt-1 o verified-pool-1')
    if not isinstance(record.get('prompt'), str) or not WORD.fullmatch(record['prompt']):
        raise ValueError('Prompt non canonico')
    if record.get('pos') not in {'NOUN', 'VERB', 'ADJ'}:
        raise ValueError('POS mancante')
    if not required_text(record.get('sense_description'), 15):
        raise ValueError('Accezione mancante')
    if record.get('category_id') not in load_categories():
        raise ValueError('Categoria assente dal catalogo')
    if record.get('prompt_language') not in {'it', 'common_loanword'}:
        raise ValueError('Lingua non verificata')
    if (record['prompt_language'] == 'common_loanword'
            and record['prompt'] not in load_prompt_policy()['common_loanwords']):
        raise ValueError('Prestito assente da common_loanwords')
    review = record.get('review')
    if not isinstance(review, dict):
        raise ValueError('Revisione documentata mancante')
    if (review.get('decision') != 'verified'
            or not required_text(review.get('reviewer'))
            or review.get('method') not in {'llm_editorial_review', 'human_editorial_review'}
            or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(review.get('reviewed_at', '')))
            or type(review.get('human_review')) is not bool
            or review['human_review'] != (review['method'] == 'human_editorial_review')
            or review.get('independent_gameplay_qa') is not False):
        raise ValueError('Revisione documentata incompleta')
    if (not re.fullmatch(r'[a-f0-9]{64}', str(review.get('directives_sha256', '')))
            or review_policy(review) != SEMANTIC_POLICY):
        raise ValueError('Revisione basata su regole differenti')
    if (not isinstance(review.get('checks'), dict)
            or any(review['checks'].get(k) is not True for k in PROMPT_CHECKS)):
        raise ValueError('Controlli del prompt incompleti')
    for field in ('prompt_rationale', 'category_rationale', 'familiarity_rationale'):
        if not required_text(review.get(field), 25):
            raise ValueError('Motivazione mancante: '+field)
    if not isinstance(record.get('evidence'), list) or not record['evidence']:
        raise ValueError('Provenienza mancante')
    for item in record['evidence']:
        if (not isinstance(item, dict)
                or any(not required_text(item.get(k)) for k in
                       ('source_id','source_url','url','license','attribution','scope','note'))
                or not re.fullmatch(r'[a-f0-9]{64}', str(item.get('snapshot_sha256', '')))):
            raise ValueError('Evidenza incompleta')
    if record.get('content_sha256') != digest({k:v for k,v in record.items() if k != 'content_sha256'}):
        raise ValueError('Prompt modificato dopo la revisione')


def has_table(db, name):
    return bool(db.run('SELECT name FROM sqlite_schema WHERE type=\'table\' AND name='+literal(name)+';', rows=True))


def register_reviews(db, records):
    """Archivia i verbali prima della copia. Nessuna selezione INTEGRATED equivale a revisione."""
    if not db.path.exists():
        raise ValueError('Database di raccolta assente')
    for record in records:
        validate_record(record)
    if len({r['prompt'] for r in records}) != len(records):
        raise ValueError('Prompt duplicato nel pacchetto di revisioni')
    # Deve essere una voce già raccolta o un bacino precedentemente revisionato.
    # Nei lotti grandi si controllano più parole per chiamata, prima di scrivere:
    # non si avviano due processi SQLite per ciascuno dei migliaia di prompt.
    inventory = has_table(db, 'inventory_terms')
    prompts = [r['prompt'] for r in records]
    for start in range(0,len(prompts),500):
        chunk = prompts[start:start+500]
        terms = '('+','.join(literal(p) for p in chunk)+')'
        queries = ['SELECT lemma AS prompt FROM prompts WHERE lemma IN '+terms]
        if inventory:
            queries.append('SELECT prompt FROM inventory_terms WHERE prompt IN '+terms)
        found = {r['prompt'] for r in db.run(' UNION '.join(queries)+';',rows=True)}
        missing = [p for p in chunk if p not in found]
        if missing:
            raise ValueError('Voce non presente nella raccolta: '+missing[0])
    db.run((ROOT/'prompt_validation_schema.sql').read_text(encoding='utf-8'))
    existing = {r['id'] for r in db.run('SELECT id FROM prompt_validations;', rows=True)}
    statements = ['BEGIN IMMEDIATE;']
    added = 0
    for record in records:
        key = record['content_sha256']
        if key in existing:
            continue  # Reimportare un vecchio verbale non ripristina una versione superata.
        added += 1
        statements.append(insert('prompt_validations', {'id':key,'prompt':record['prompt'],
            'recorded_at':utc_now(),'record_json':json.dumps(record,ensure_ascii=False)}))
        statements.append('INSERT INTO prompt_validation_heads VALUES ('+
            literal(record['prompt'])+','+literal(key)+') ON CONFLICT(prompt) DO UPDATE '
            'SET validation_id=excluded.validation_id;')
    statements.append('COMMIT;')
    db.run(''.join(statements))
    return {'review_records_processed':len(records), 'new_reviews':added}


def read_pack(path):
    records = [json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines() if line.strip()]
    if not records:
        raise ValueError('Pacchetto di revisioni vuoto')
    for record in records:
        validate_record(record)
    return records


def sync_validated(source, destination=VALIDATED_DB):
    """Ricostruisce atomicamente la copia valida; raccolta e storico non vengono cancellati."""
    destination = Path(destination).resolve()
    if destination == source.path.resolve():
        raise ValueError('Il DB delle voci valide deve essere distinto dalla raccolta')
    if not source.path.exists() or not has_table(source, 'prompt_validation_heads'):
        raise ValueError('Nessun registro di revisioni: importare prima i verbali')
    if destination.exists():
        owner = SQLite(destination, source.executable)
        if (not has_table(owner, 'metadata') or not owner.run(
                "SELECT value FROM metadata WHERE key='database_role' AND value='validated-prompts-1';", rows=True)):
            raise ValueError('Destinazione esistente non gestita: scegliere un nuovo file')
    # Una sola SELECT conserva una fotografia coerente di verbali e decisioni.
    decision_sql = ("COALESCE((SELECT decision FROM inventory_term_decisions d WHERE d.prompt=h.prompt),'COLLECTED')"
                    if has_table(source, 'inventory_term_decisions') else "'COLLECTED'")
    rows = source.run('SELECT h.prompt,v.id,v.record_json,'+decision_sql+' AS decision '
        'FROM prompt_validation_heads h JOIN prompt_validations v ON v.id=h.validation_id ORDER BY h.prompt;', rows=True)
    accepted, excluded = [], []
    for row in rows:
        try:
            if row['decision'] in {'DISCARDED', 'DEFERRED'}:
                raise ValueError('Decisione nella raccolta: '+row['decision'])
            record = json.loads(row['record_json'])
            validate_record(record)
            if row['id'] != record['content_sha256'] or row['prompt'] != record['prompt']:
                raise ValueError('Registro della revisione incoerente')
            accepted.append(record)
        except (ValueError, TypeError) as error:
            excluded.append({'prompt':row['prompt'], 'reason':str(error)})
    # Non deduplicare le risposte tra prompt: ogni coppia ha il proprio verbale.
    # Un prompt valido può non avere risposte. Si copiano solo bacini verificati
    # della medesima accezione/categoria/POS, mai pool di un altro senso.
    catalog = {r['prompt']:r for r in accepted}
    pools = []
    for pool in load_pools(source):
        entry = catalog.get(pool['prompt'])
        if not entry or any(pool[k] != entry[k] for k in ('sense_description','category_id','pos','prompt_language')):
            continue
        try:
            validate_pool(pool)
            pools.append(pool)
        except ValueError:
            pass  # La validità del prompt non approva un bacino obsoleto.
    # Qui vanno i prompt con le parole associate; gli altri validati sono in prompt_filtrati.sqlite3.
    with_pool = {pool['prompt'] for pool in pools}
    without_pool = sum(record['prompt'] not in with_pool for record in accepted)
    accepted = [record for record in accepted if record['prompt'] in with_pool]
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix=destination.stem+'.',suffix='.sqlite3',dir=destination.parent)
    import os
    os.close(handle)
    temporary = Path(name)
    pack = temporary.with_suffix('.jsonl')
    try:
        output = SQLite(temporary, source.executable)
        initialize(output)
        output.run(VALIDATED_SCHEMA)
        if pools:
            pack.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in pools),encoding='utf-8')
            import_reviewed(output, pack)
        statements = ['BEGIN IMMEDIATE;']
        for record in accepted:
            statements.append(insert('validated_prompts', {'prompt':record['prompt'],
                'language':record['prompt_language'],'sense_description':record['sense_description'],
                'pos':record['pos'],'category_id':record['category_id'],
                'validation_id':record['content_sha256'],'policy_version':SEMANTIC_POLICY,
                'source_db':str(source.path.resolve()),'record_json':json.dumps(record,ensure_ascii=False)}))
        for key,value in {'database_role':'validated-prompts-1','source_db':str(source.path.resolve()),
                          'copied_at':utc_now(),'semantic_policy':SEMANTIC_POLICY}.items():
            statements.append(insert('metadata', {'key':key,'value':value}))
        statements.append('COMMIT;')
        output.run(''.join(statements))
        if output.run('PRAGMA foreign_key_check;', rows=True):
            raise ValueError('Errore di integrità referenziale nella copia')
        if output.run('PRAGMA integrity_check;', rows=True) != [{'integrity_check':'ok'}]:
            raise ValueError('Errore di integrità nella copia')
        result = {'source':str(source.path.resolve()),'destination':str(destination),
            'valid_prompts':len(accepted),'verified_pools':len(pools),
            'validated_without_pool_in_filtered_db':without_pool,
            'associations':sum(len(p['answers']) for p in pools),'excluded':excluded,
            'raw_entries_deleted':0,'new_semantic_reviews_performed':0,
            'independent_gameplay_qa':False}
        result['publish_method'] = publish_database(temporary,destination,source.executable)
        return result
    finally:
        temporary.unlink(missing_ok=True)
        pack.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_DB)
    parser.add_argument('--destination', type=Path, default=VALIDATED_DB)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('adopt-pool-reviews', help='Riusa le revisioni editoriali dei bacini già presenti')
    imp = sub.add_parser('import-reviews', help='Registra verbali già effettuati, poi copia le voci valide')
    imp.add_argument('file', type=Path)
    pools = sub.add_parser('import-pools', help='Importa bacini revisionati nella raccolta e aggiorna il DB valido')
    pools.add_argument('file', type=Path)
    sub.add_parser('sync', help='Copia solo le voci con revisione valida corrente')
    sub.add_parser('status')
    args = parser.parse_args(argv)
    source = SQLite(args.source)
    if args.source.resolve() == args.destination.resolve():
        raise ValueError('Sorgente e destinazione devono essere distinte')
    if args.command == 'status':
        if not args.destination.exists():
            raise ValueError('DB delle voci valide assente: eseguire sync dopo la revisione')
        db = SQLite(args.destination)
        result = {'destination':str(args.destination), 'sqlite_version':db.run('SELECT sqlite_version() AS v;',rows=True)[0]['v']}
        for table in ('validated_prompts','prompts','associations'):
            result[table] = db.run('SELECT count(*) AS n FROM '+table+';',rows=True)[0]['n']
        result['foreign_key_errors'] = db.run('PRAGMA foreign_key_check;',rows=True)
        result['integrity_check'] = db.run('PRAGMA integrity_check;',rows=True)
    else:
        if args.command == 'adopt-pool-reviews':
            register_reviews(source, load_pools(source))
        elif args.command in ('import-reviews','import-pools'):
            records = read_pack(args.file)
            if args.command == 'import-pools':
                if any(r['schema'] != 'verified-pool-1' for r in records):
                    raise ValueError('import-pools richiede soltanto bacini completi')
                import_reviewed(source, args.file)
            register_reviews(source, records)
        result = sync_validated(source, args.destination)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError,RuntimeError,OSError) as error:
        print(str(error),file=sys.stderr)
        raise SystemExit(1)

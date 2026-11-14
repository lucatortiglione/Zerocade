"""Applica i controlli lessicali e NLP ai dati correnti dei DB di parole.

Le verifiche si salvano nello schema raw: non riscrivono fonti, decisioni,
bacini verificati o indici dei vettori. Gli input non selezionati dell'inventario
rimangono un archivio grezzo, non una banca di lemmi da correggere.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import gc
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from time import perf_counter
import unicodedata

from italian_nlp import ItalianAnalyzer, digest
from nlp_tools import write_json
from prompt_inventory import normalize, SINGLE_WORD
from inventory_evidence import upos
import json_store
import unified_db

ROOT = Path(__file__).resolve().parent.parent
GAMES = ROOT.parent / 'database/giochi.sqlite3'
LEXICAL_KINDS = {'wiktextract', 'hunspell', 'mythes', 'wordnet_tab', 'morphit',
                 'unimorph', 'glaffit', 'flex_it', 'conllu', 'tei_headwords', 'nvdb_text', 'xlsx_table'}
DDL = '''
CREATE TABLE IF NOT EXISTS raw__nlp_db_audit_runs(
 id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETE','FAILED')),
 report_json TEXT NOT NULL CHECK(json_valid(report_json))
) STRICT;
CREATE TABLE IF NOT EXISTS raw__nlp_db_audit_words(
 run_id TEXT NOT NULL REFERENCES raw__nlp_db_audit_runs(id), word TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 PRIMARY KEY(run_id,word)
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS raw__nlp_db_audit_findings(
 run_id TEXT NOT NULL REFERENCES raw__nlp_db_audit_runs(id), location TEXT NOT NULL,
 item_key TEXT NOT NULL, word TEXT NOT NULL, findings_json TEXT NOT NULL CHECK(json_valid(findings_json)),
 PRIMARY KEY(run_id,location,item_key)
) STRICT, WITHOUT ROWID;
'''


def readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def read_items(raw, games):
    """Ogni uso mantiene regole proprie: i tentativi possono essere forme flesse."""
    items, coverage = [], {}

    def collect(con, location, query, require_lemma=False, pos=None):
        count = 0
        for key, word, language, expected_pos, context in con.execute(query):
            items.append({'location': location, 'key': str(key), 'word': word,
                          'language': language, 'expected_pos': expected_pos or pos,
                          'require_lemma': require_lemma, 'context': context or ''})
            count += 1
        coverage[location] = count

    for schema in ('raw', 'game', 'validi'):
        collect(raw, f'parole_ita_raw#{schema}.prompts',
                f'SELECT p.lemma,p.lemma,p.language,s.pos,p.familiar_sense FROM {schema}__prompts p '
                f'LEFT JOIN {schema}__senses s ON s.prompt=p.lemma AND s.description=p.familiar_sense', True)
        collect(raw, f'parole_ita_raw#{schema}.associations',
                f"SELECT a.sense_id||'/'||a.word,a.word,'it',NULL,a.rationale FROM {schema}__associations a")
    collect(raw, 'parole_ita_raw#filtrati.filtered_prompts',
            'SELECT prompt,prompt,language,pos,gloss FROM filtrati__filtered_prompts', True)
    collect(raw, 'parole_ita_raw#filtrati.validated_prompts',
            'SELECT prompt,prompt,language,pos,sense_description FROM filtrati__validated_prompts', True)
    collect(raw, 'parole_ita_raw#candidati.prompts',
            'SELECT prompt,prompt,language,pos,sense_description FROM candidati__prompts', True)
    collect(raw, 'parole_ita_raw#validi.validated_prompts',
            'SELECT prompt,prompt,language,pos,sense_description FROM validi__validated_prompts', True)
    collect(raw, 'parole_ita_raw#finale.prompts',
            'SELECT id,prompt,language,pos,sense FROM finale__prompts', True)
    collect(raw, 'parole_ita_raw#finale.words', "SELECT id,word,'it',NULL,'' FROM finale__words")
    collect(raw, 'parole_ita_raw#finale.prompt_words',
            "SELECT a.prompt_id||'/'||a.word_id,w.word,'it',NULL,a.rationale "
            'FROM finale__prompt_words a JOIN finale__words w ON w.id=a.word_id')
    collect(games, 'giochi#associazioni.prompts',
            "SELECT id,prompt,'it',pos,sense FROM associazioni__prompts", True)
    # La tabella contiene anche nomi di gruppi: alcuni sono locuzioni o etichette
    # interne, non parole che la chat deve indovinare.
    collect(games, 'giochi#associazioni.words',
            "SELECT w.id,w.word,'it',NULL,'' FROM associazioni__words w "
            'WHERE w.id IN (SELECT word_id FROM associazioni__prompt_words)')
    for table, lemma in (('solutions', True), ('words', False)):
        collect(games, f'giochi#wordle.{table}',
                f"SELECT length||'/'||word,word,'it',NULL,'' FROM wordle__{table}", lemma)
    collect(games, 'giochi#context.vocab', "SELECT idx,word,'it',NULL,'' FROM context__vocab")
    collect(games, 'giochi#context.secrets', "SELECT word,word,'it',NULL,'' FROM context__secrets", True, 'NOUN')
    collect(games, 'giochi#parole.words', "SELECT word,word,'it',NULL,'' FROM parole__words")
    return items, coverage


def fold(word):
    return unicodedata.normalize('NFD', word).encode('ascii', 'ignore').decode()


def lexical_results(raw, words, folded_guesses):
    aliases = defaultdict(set)
    for (form,) in raw.execute("SELECT prompt FROM raw__inventory_terms WHERE length(prompt) BETWEEN 5 AND 8 "
                               "AND prompt GLOB '*[àèéìòù]*'"):
        if fold(form) in folded_guesses:
            aliases[fold(form)].add(form)
    wanted = words | {form for forms in aliases.values() for form in forms}
    raw.execute('CREATE TEMP TABLE audit_targets(word TEXT PRIMARY KEY) WITHOUT ROWID')
    raw.executemany('INSERT INTO audit_targets VALUES (?)', ((w,) for w in sorted(wanted)))
    results = {w: {'known_form': False, 'analyses': set(), 'sources': set()} for w in wanted}
    query = ("SELECT a.prompt,a.role,a.pos,a.lemma,s.source_key,s.kind "
             'FROM audit_targets t JOIN raw__inventory_current_attestations a ON a.prompt=t.word '
             'JOIN raw__inventory_snapshots v ON v.id=a.snapshot_id '
             'JOIN raw__inventory_sources s ON s.source_key=v.source_key')
    for word, role, pos, lemma, source, kind in raw.execute(query):
        if kind not in LEXICAL_KINDS:
            continue
        info = results[word]
        info['known_form'] = True
        info['sources'].add(source)
        if role in {'lemma', 'inflected_form', 'proper_name'}:
            lemma = normalize(lemma) or (word if role in {'lemma', 'proper_name'} else '')
            if lemma:
                info['analyses'].add((lemma, upos(kind, pos, role), pos, kind, role))
    for info in results.values():
        info['analyses'] = sorted(info['analyses'], key=lambda row: tuple(str(x) for x in row))
        info['sources'] = sorted(info['sources'])
    return results, {word: sorted(forms) for word, forms in aliases.items()}


def lexical_flags(item, info, aliases, all_results):
    word = normalize(item['word'])
    if not word or not SINGLE_WORD.fullmatch(word):
        return ['INVALID_SINGLE_WORD']
    flags = []
    known = info['known_form']
    if item['location'] == 'giochi#wordle.words' and not known:
        known = any(all_results[form]['known_form'] for form in aliases.get(word, []))
    if not known:
        flags.append('NO_LEXICAL_EVIDENCE')
    self_analyses = [row for row in info['analyses'] if row[0] == word and row[4] == 'lemma']
    if item['require_lemma'] and not self_analyses:
        flags.append('NO_LEMMA_EVIDENCE')
    if item['expected_pos'] and self_analyses:
        categories = {row[1] for row in self_analyses if row[1]}
        if item['expected_pos'] not in categories:
            flags.append('POS_NOT_ATTESTED' if categories else 'POS_UNRESOLVED')
    return flags


def context_flags(item, info, tokens):
    word = normalize(item['word'])
    matched = [t for t in tokens if normalize(t['text']) == word and not t['expanded_multiword']]
    flags = set()
    lemmas = {row[0] for row in info['analyses']}
    for token in matched:
        lemma = normalize(token['lemma'])
        if lemmas and lemma not in lemmas:
            flags.add('CONTEXT_LEMMA_NOT_ATTESTED')
        if item['require_lemma'] and lemma != word:
            flags.add('CONTEXT_NON_CANONICAL_LEMMA')
        if item['expected_pos'] and token['upos'] != item['expected_pos']:
            flags.add('CONTEXT_POS_DISAGREEMENT')
    return sorted(flags), matched


def analyze_contexts(writer, analyzer, contexts, inspect):
    """Riusa le analisi già presenti e salva lotti con transazioni brevi."""
    writer.execute('INSERT OR IGNORE INTO raw__nlp_models VALUES (?,?)',
                   (analyzer.model_id, json.dumps(analyzer.metadata, ensure_ascii=False)))
    writer.commit()
    cached = {text: (identifier, tokens) for text, identifier, tokens in writer.execute(
        'SELECT context,id,tokens_json FROM raw__nlp_analyses WHERE model_id=? AND scope=?',
        (analyzer.model_id, 'contextual')) if text in contexts}
    for text, (identifier, tokens) in cached.items():
        inspect(text, identifier, json.loads(tokens))
    pending = sorted(set(contexts) - set(cached))
    total = len(pending)
    for offset in range(0, total, 256):
        batch = pending[offset:offset + 256]
        analyses = list(analyzer.analyze_many(batch, batch_size=64))
        if len(analyses) != len(batch):
            raise RuntimeError('Analisi incompleta del lotto')
        records = []
        for result in analyses:
            identifier = digest([analyzer.model_id, result['text'], 'contextual'])
            records.append((identifier, analyzer.model_id, result['text'], 'contextual',
                            json.dumps(result['tokens'], ensure_ascii=False), datetime.now(timezone.utc).isoformat()))
            inspect(result['text'], identifier, result['tokens'])
        with writer:
            writer.executemany('INSERT OR IGNORE INTO raw__nlp_analyses VALUES (?,?,?,?,?,?)', records)
        if offset % 2048 == 0 or offset + len(batch) == total:
            print(json.dumps({'engine': analyzer.engine, 'analyzed': offset + len(batch),
                              'total': total, 'reused': len(cached)}), flush=True)
    return {'analyzed': total, 'reused': len(cached), 'model_id': analyzer.model_id}


def export_findings(raw_file, run_id, output):
    """Rapporto consultabile anche senza eseguire query sul DB di lavoro."""
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    con = readonly(raw_file)
    try:
        with path.open('w', encoding='utf-8-sig', newline='') as stream:
            fields = ['database_table', 'item_key', 'word', 'expected_pos', 'lexical_flags',
                      'spacy_flags', 'stanza_flags', 'models_agree', 'context']
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            for location, key, word, payload in con.execute(
                    'SELECT location,item_key,word,findings_json FROM raw__nlp_db_audit_findings '
                    'WHERE run_id=? ORDER BY location,word,item_key', (run_id,)):
                finding = json.loads(payload)
                writer.writerow({'database_table': location, 'item_key': key, 'word': word,
                                 'expected_pos': finding['expected_pos'],
                                 'lexical_flags': '|'.join(finding.get('lexical_flags', [])),
                                 'spacy_flags': '|'.join(finding.get('spacy', {}).get('flags', [])),
                                 'stanza_flags': '|'.join(finding.get('stanza', {}).get('flags', [])),
                                 'models_agree': finding.get('models_agree'), 'context': finding['context']})
    finally:
        con.close()
    return str(path.resolve())


def run(raw_file, games_file, output):
    start = perf_counter()
    raw, games = readonly(raw_file), readonly(games_file)
    try:
        items, coverage = read_items(raw, games)
        snapshots = raw.execute('SELECT h.source_key,h.snapshot_id,v.sha256 FROM raw__inventory_source_heads h '
                                'JOIN raw__inventory_snapshots v ON v.id=h.snapshot_id ORDER BY h.source_key').fetchall()
        inventory_count = raw.execute('SELECT count(*) FROM raw__inventory_terms').fetchone()[0]
        words = {normalize(item['word']) for item in items} - {None}
        folded_guesses = {item['word'] for item in items if item['location'] == 'giochi#wordle.words'}
        print(json.dumps({'stage': 'lexical', 'uses': len(items), 'distinct_words': len(words)}), flush=True)
        lexicon, aliases = lexical_results(raw, words, folded_guesses)
        selected_inventory_count = raw.execute(
            'SELECT count(*) FROM raw__inventory_terms i JOIN audit_targets t ON t.word=i.prompt').fetchone()[0]
        games_integrity = games.execute('PRAGMA quick_check').fetchall()
    finally:
        raw.close(); games.close()
    input_hash = hashlib.sha256()
    for item in items:
        input_hash.update(json.dumps(item, ensure_ascii=False, sort_keys=True).encode('utf-8'))
        input_hash.update(b'\n')
    manifest = {'selected_rows_sha256': input_hash.hexdigest(), 'active_snapshots': snapshots,
                'raw_database': str(Path(raw_file).resolve()), 'games_database': str(Path(games_file).resolve())}
    run_id = digest([manifest, datetime.now(timezone.utc).isoformat()])
    writer = sqlite3.connect(raw_file, timeout=60)
    writer.execute('PRAGMA foreign_keys=ON')
    writer.executescript(DDL)
    for table in ('raw__nlp_db_audit_words', 'raw__nlp_analyses'):  # documenti JSONB, viste come prima
        json_store.compact(writer, table)
    started = datetime.now(timezone.utc).isoformat()
    writer.execute('INSERT INTO raw__nlp_db_audit_runs VALUES (?,?,NULL,?,?)',
                   (run_id, started, 'RUNNING', json.dumps(manifest, ensure_ascii=False)))
    writer.commit()
    if Path(raw_file).resolve() == unified_db.UNIFIED.resolve():
        unified_db.register_objects('raw')
    findings = defaultdict(dict)
    contexts = defaultdict(list)
    lexical_counts = Counter()
    try:
        for index, item in enumerate(items):
            word = normalize(item['word'])
            info = lexicon.get(word, {'known_form': False, 'analyses': [], 'sources': []})
            flags = lexical_flags(item, info, aliases, lexicon)
            if flags:
                findings[index]['lexical_flags'] = flags
                lexical_counts.update(flags)
            if item['context'].strip():
                contexts[item['context']].append(index)
        simplemma = ItalianAnalyzer('simplemma')
        for word in sorted(words):
            info = lexicon[word]
            if not info['known_form'] and SINGLE_WORD.fullmatch(word):
                info['simplemma_candidate'] = simplemma.pipeline.lemmatize(word, lang='it')
                info['candidate_model_id'] = simplemma.model_id
        with writer:
            writer.execute('INSERT OR IGNORE INTO raw__nlp_models VALUES (?,?)',
                           (simplemma.model_id, json.dumps(simplemma.metadata, ensure_ascii=False)))
            writer.executemany('INSERT INTO raw__nlp_db_audit_words VALUES (?,?,?)',
                               ((run_id, word, json.dumps({**info, 'wordle_accent_aliases': aliases.get(word, [])},
                                                         ensure_ascii=False)) for word, info in lexicon.items()))
        spacy = ItalianAnalyzer('spacy')
        needed = set()
        context_seen = set()

        def inspect_spacy(text, identifier, tokens):
            for index in contexts[text]:
                item = items[index]
                info = lexicon.get(normalize(item['word']), {'analyses': []})
                flags, matched = context_flags(item, info, tokens)
                if matched:
                    context_seen.add(index)
                if flags:
                    findings[index]['spacy'] = {'analysis_id': identifier, 'flags': flags, 'tokens': matched}
                    needed.add(text)

        nlp_report = {'spacy': analyze_contexts(writer, spacy, contexts, inspect_spacy)}
        del spacy
        gc.collect()
        if needed:
            stanza = ItalianAnalyzer('stanza')

            def inspect_stanza(text, identifier, tokens):
                for index in contexts[text]:
                    if 'spacy' not in findings.get(index, {}):
                        continue
                    item = items[index]
                    flags, matched = context_flags(item, lexicon.get(normalize(item['word']), {'analyses': []}), tokens)
                    findings[index]['stanza'] = {'analysis_id': identifier, 'flags': flags, 'tokens': matched}
                    findings[index]['models_agree'] = (
                        [(t['lemma'], t['upos']) for t in findings[index]['spacy']['tokens']] ==
                        [(t['lemma'], t['upos']) for t in matched])

            nlp_report['stanza'] = analyze_contexts(writer, stanza, needed, inspect_stanza)
            del stanza
        location_counts = Counter(items[index]['location'] for index in findings)
        summary = {
            'run_id': run_id, 'status': 'COMPLETE', 'manifest': manifest,
            'coverage': {location: {'checked': count, 'flagged': location_counts[location]}
                         for location, count in coverage.items()},
            'selected_uses': len(items), 'distinct_selected_words': len(words),
            'lexical_words_with_evidence': sum(lexicon[w]['known_form'] for w in words),
            'lexical_flags': dict(lexical_counts), 'flagged_uses': len(findings),
            'distinct_flagged_words': len({items[i]['word'] for i in findings}),
            'context_documents': len(contexts), 'uses_with_target_in_context': len(context_seen),
            'context_flagged_uses': sum('spacy' in f for f in findings.values()), 'models': nlp_report,
            'simplemma_model_id': simplemma.model_id,
            'unselected_inventory_terms': inventory_count - selected_inventory_count,
            'unselected_inventory_policy': 'Raw titles and source lists are preserved; NLP does not certify isolated entries.',
            'games_quick_check': games_integrity, 'automatic_gameplay_changes': 0,
            'elapsed_seconds': perf_counter() - start, 'completed_at': datetime.now(timezone.utc).isoformat()}
        with writer:
            writer.executemany('INSERT INTO raw__nlp_db_audit_findings VALUES (?,?,?,?,?)',
                ((run_id, items[index]['location'], items[index]['key'], items[index]['word'],
                  json.dumps({'expected_pos': items[index]['expected_pos'], 'requires_lemma': items[index]['require_lemma'],
                              'context': items[index]['context'], **finding}, ensure_ascii=False))
                 for index, finding in findings.items()))
            writer.execute('UPDATE raw__nlp_db_audit_runs SET status=?,completed_at=?,report_json=? WHERE id=?',
                           ('COMPLETE', summary['completed_at'], json.dumps(summary, ensure_ascii=False), run_id))
        write_json(output, summary)
        export_findings(raw_file, run_id, Path(output).with_suffix('.csv'))
        return summary
    except BaseException as error:
        with writer:
            writer.execute('UPDATE raw__nlp_db_audit_runs SET status=?,report_json=? WHERE id=?',
                           ('FAILED', json.dumps({'manifest': manifest, 'error': str(error)}, ensure_ascii=False), run_id))
        raise
    finally:
        writer.close()


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--raw-db', type=Path, default=unified_db.UNIFIED)
    ap.add_argument('--games-db', type=Path, default=GAMES)
    ap.add_argument('--output', type=Path, default=ROOT / 'resources/nlp_db_audit_latest.json')
    args = ap.parse_args(argv)
    print(json.dumps(run(args.raw_db, args.games_db, args.output), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

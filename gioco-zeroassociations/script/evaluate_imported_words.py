"""Valuta le parole di un'importazione rispetto alle direttive dei singoli giochi.

Le valutazioni sono salvate nello schema raw. L'ammissione lessicale di un
tentativo e l'approvazione semantica di un bacino rimangono esiti distinti.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
import hashlib
from importlib import metadata, util
from itertools import combinations
import json
from pathlib import Path
import re
import sqlite3
import sys

from audit_word_databases import upos
from italian_nlp import digest
from nlp_tools import write_json
from prompt_inventory import normalize, SINGLE_WORD, source_family as family
from prompt_policy import load_prompt_policy, zipf_bound, zipf_matches
import json_store
import unified_db

ROOT = Path(__file__).resolve().parent.parent.parent
HERE = Path(__file__).resolve().parent.parent
IMPORT_REPORT = HERE / 'resources/inventory_morphology_import_20261114.json'
BASELINE = HERE / 'database-backups/parole_ita_raw_prima_import_morfologia_20261114T113626_476696.sqlite3'
OUTPUT = HERE / 'resources/new_words_utility_20261114.json'


def module(name, path):
    spec = util.spec_from_file_location(name, path)
    loaded = util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


wordle = module('utility_wordle', ROOT / 'gioco-zerowordle/script/build_wordle_bank.py')
context = wordle.bank
sys.path.insert(0, str(ROOT / 'gioco-parole/script'))
words_builder = module('utility_zerowords', ROOT / 'gioco-parole/script/build_lexicon.py')
from common import fold as fold_grid, load_blocklist, is_blocked, MIN_LEN, MAX_LEN  # noqa: E402

DIRECTIVES = {
    'zerowordle': ['gioco-zerowordle/README.md', 'gioco-zerowordle/script/build_wordle_bank.py',
                   'gioco-zerowordle/wordle_exclusions.txt'],
    'zerocontext': ['gioco-zerocontext/README.md', 'gioco-zerocontext/script/build_context_bank.py',
                    'gioco-zerocontext/script/build_context_data.py', 'gioco-zerocontext/context_bank_exclusions.txt'],
    'zerowords': ['gioco-parole/README.md', 'gioco-parole/ALGORITMO.md',
                  'gioco-parole/script/build_lexicon.py', 'gioco-parole/script/common.py',
                  'gioco-parole/tools/curve.json', 'gioco-parole/lexicon/blocklist_it.txt',
                  'gioco-parole/lexicon/it/not_in_grid.txt'],
    'zeroassociations': ['gioco-zeroassociations/REGOLE.md', 'gioco-zeroassociations/DIRETTIVA_INDIZI.md',
                         'gioco-zeroassociations/direttive_word_association_it_v3_6_0.md',
                         'gioco-zeroassociations/resources/prompt_policy.json', 'gioco-zeroassociations/script/filter_prompts.py'],
    'zerocatene': ['gioco-zerocatene/README.md', 'apps/server/src/chains.ts'],
    'zerodubbi': ['gioco-dilemmi/README.md'],
    'zeroquizz': ['gioco-quizzland/README.md', 'gioco-quizzland/GUIDA-DOMANDE.md'],
}
DDL = '''
CREATE TABLE IF NOT EXISTS raw__word_utility_runs(
 id TEXT PRIMARY KEY, evaluated_at TEXT NOT NULL,
 manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
 summary_json TEXT NOT NULL CHECK(json_valid(summary_json))
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS raw__word_utility_results(
 run_id TEXT NOT NULL REFERENCES raw__word_utility_runs(id), word TEXT NOT NULL,
 features_json TEXT NOT NULL CHECK(json_valid(features_json)),
 verdicts_json TEXT NOT NULL CHECK(json_valid(verdicts_json)),
 PRIMARY KEY(run_id,word)
) STRICT, WITHOUT ROWID;
'''


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def result(status, reason, **details):
    return {'status': status, 'reason': reason, **details}


def invalid_reasons(word):
    reasons = []
    if '\ufffd' in word: reasons.append('carattere_di_sostituzione')
    if any(c.isspace() for c in word): reasons.append('locuzione_o_piu_token')
    if "'" in word or '’' in word: reasons.append('apostrofo')
    if not SINGLE_WORD.fullmatch(word) and not reasons: reasons.append('caratteri_non_ammessi')
    return reasons


def exclusions(path, *, upper=False):
    return {word.upper() if upper else word for line in Path(path).read_text(encoding='utf-8').splitlines()
            for word in line.split('#')[0].split()}


def empty_wordle():
    return {'lemma': set(), 'infl': set(), 'inflL': {}, 'prop': set(), 'src': set(), 'tags': {}, 'kinds': set()}


def empty_context():
    return {'N': set(), 'A': set(), 'V': set(), 'O': set(), 'src': set(), 'inflN': {},
            'inflO': set(), 'prop': set(), 'tags': {}, 'udN': 0, 'udX': 0}


def wheel_support(words, seeds):
    """Ruote reali del lessico corrente che possono formare le nuove parole bonus."""
    wanted = {''.join(sorted(fold_grid(word))) for word in words if 4 <= len(word) <= 9}
    support = defaultdict(list)
    wheels = {''.join(sorted(seed)): seed for seed in sorted(seeds, reverse=True)}
    for letters, seed in wheels.items():
        made = {''.join(chars) for n in range(4, len(letters) + 1) for chars in combinations(letters, n)}
        for signature in wanted & made:
            if len(support[signature]) < 3: support[signature].append(seed)
    return dict(support)


def collect(con, new_words):
    canonical = {word for word in new_words if SINGLE_WORD.fullmatch(word)}
    con.execute('CREATE TEMP TABLE utility_targets(word TEXT PRIMARY KEY) WITHOUT ROWID')
    con.executemany('INSERT INTO utility_targets VALUES (?)', ((word,) for word in sorted(canonical)))
    info = {word: {'sources': set(), 'analyses': set(), 'wordle': empty_wordle(), 'context': empty_context()}
            for word in canonical}
    rows = con.execute('SELECT a.prompt,a.role,a.pos,a.lemma,s.source_key,s.kind FROM utility_targets t '
        'JOIN raw__inventory_current_attestations a ON a.prompt=t.word '
        'JOIN raw__inventory_snapshots v ON v.id=a.snapshot_id '
        'JOIN raw__inventory_sources s ON s.source_key=v.source_key')
    for word, role, tag, lemma, source, kind in rows:
        data = info[word]
        fam = family(source)
        pos = upos(kind, tag, role)
        lemma = normalize(lemma) or (word if role == 'lemma' else '')
        data['sources'].add(source)
        data['analyses'].add((lemma, pos, role, tag, source))
        wf, cf = data['wordle'], data['context']
        wf['src'].add(fam); cf['src'].add(fam)
        code = {'NOUN': 'N', 'ADJ': 'A', 'VERB': 'V', 'AUX': 'V'}.get(pos, 'O')
        wf['kinds'].add((code, fam))
        if role == 'lemma':
            wf['lemma'].add(fam); cf[code].add(fam)
        elif role == 'inflected_form':
            wf['infl'].add(fam)
            wf['inflL'].setdefault(lemma, set()).add(fam)
            if pos == 'NOUN': cf['inflN'].setdefault(lemma, set()).add(fam)
            else: cf['inflO'].add(fam)
        elif role == 'proper_name':
            wf['prop'].add(fam); cf['prop'].add(fam)
    return info


def assess(word, data, env):
    invalid = invalid_reasons(word)
    if invalid:
        verdicts = {game: {role: result('ESCLUSA_FORMATO', invalid[0]) for role in roles}
                    for game, roles in {'zerowordle': ['soluzione', 'tentativo'],
                                        'zerocontext': ['segreta', 'tentativo'],
                                        'zerowords': ['griglia', 'bonus'],
                                        'zeroassociations': ['prompt', 'risposta'],
                                        'zerocatene': ['nodo', 'indizio']}.items()}
        return {'invalid_reasons': invalid, 'zipf_it': None}, verdicts
    analyses = data['analyses']
    own = {pos for lemma, pos, role, tag, source in analyses if role == 'lemma' and lemma == word}
    categories = {pos for lemma, pos, role, tag, source in analyses if pos}
    lemmas = sorted({lemma for lemma, pos, role, tag, source in analyses if lemma})
    z = env['zipf'](word, 'it')
    wf, cf = data['wordle'], data['context']
    # I ranghi e le frequenze restano quelli delle risorse dedicate, non le
    # frequenze di Flex_it scambiate per conteggi OpenSubtitles.
    if word in env['ranks']:
        wf['wf'] = env['ranks'][word]; cf['wf'] = env['ranks'][word]
    if not 5 <= len(word) <= 8:
        solution = guess = result('ESCLUSA_LUNGHEZZA', 'richieste_5_8_lettere')
    else:
        ok, why = wordle.verdict(word, wf, dictionary_sources=env['dictionaries'], form_sources=env['forms'])
        guess = result('CANDIDATA_TENTATIVO' if ok else 'NON_AMMISSIBILE', why)
        solution = result('CANDIDATA_SOLUZIONE' if why == 'soluzione' and word not in env['wordle_excluded']
                          else 'NON_ADATTA_SOLUZIONE', 'esclusione_editoriale' if word in env['wordle_excluded'] else why)
    if not 4 <= len(word) <= 14:
        secret = result('ESCLUSA_LUNGHEZZA', 'richieste_4_14_lettere')
    elif word in env['context_excluded']:
        secret = result('ESCLUSA_EDITORIALE', 'context_bank_exclusions')
    else:
        tier = context.decide(word, cf, dictionary_sources=env['dictionaries'], morphology_sources=env['morphology'])
        secret = result('CANDIDATA_SEGRETA' if not tier.startswith('-') else 'NON_ADATTA_SEGRETA', tier)
    if not 3 <= len(word) <= 16:
        context_guess = result('ESCLUSA_LUNGHEZZA', 'vocab_3_16_lettere')
    elif word not in env['fasttext']:
        context_guess = result('NON_GIOCABILE', 'vettore_fasttext_assente')
    elif env['ranks'].get(word, 10**9) > env['vocab_size'] * 2:
        context_guess = result('NON_SELEZIONATA', 'fuori_fascia_frequenze_del_vocab')
    else:
        context_guess = result('CANDIDATA_VOCAB', 'vettore_e_frequenza_disponibili')
    key = fold_grid(word)
    permitted_pos = categories - {'PROPN', 'PUNCT', 'SYM', 'X', 'INTJ'}
    if not key or not MIN_LEN <= len(key) <= MAX_LEN:
        grid = bonus = result('ESCLUSA_LUNGHEZZA', 'lessico_4_10_lettere')
    elif is_blocked(key, env['blocklist']):
        grid = bonus = result('ESCLUSA_BLOCKLIST', 'blocklist_it')
    elif not permitted_pos:
        grid = bonus = result('DA_RIVEDERE_POS', 'nessuna_analisi_lessicale_ammessa')
    elif len(key) > env['max_wheel']:
        grid = bonus = result('NON_FORMABILE', 'ruota_massima_'+str(env['max_wheel']))
    else:
        supported = env['wheel_support'].get(''.join(sorted(key)), [])
        bonus = (result('DA_REVISIONARE_BONUS' if z == 0 and len({family(s) for s in data['sources']}) < 2 else 'CANDIDATA_BONUS',
                        'unica_fonte_senza_frequenza' if z == 0 and len({family(s) for s in data['sources']}) < 2 else 'forma_morfologica_attestata',
                        example_wheels=supported)
                 if supported else result('NON_FORMABILE', 'nessun_seme_del_lessico_puo_formarla'))
        if z < words_builder.MAIN_ZIPF:
            grid = result('SOLO_BONUS', 'zipf_inferiore_'+str(words_builder.MAIN_ZIPF))
        elif not word.isascii():
            grid = result('SOLO_BONUS', 'forma_accentata')
        elif key in env['not_in_grid']:
            grid = result('SOLO_BONUS', 'not_in_grid')
        elif not words_builder.italian_shape(key) or words_builder.english_noise(word):
            grid = result('SOLO_BONUS', 'forma_o_prevalenza_inglese')
        elif 'PROPN' in categories and (z < words_builder.NAME_ZIPF or not categories & {'NOUN', 'ADJ', 'ADV'}):
            grid = result('SOLO_BONUS', 'omografo_di_nome_proprio')
        else:
            grid = result('DA_RIVEDERE_GRIGLIA', 'controllare_clitici_e_forma_prima_del_lessico')
    if word in env['decisions']:
        prompt = answer = result('SOSPESA_DECISIONE', env['decisions'][word])
    elif not own & {'NOUN', 'VERB', 'ADJ'}:
        prompt = result('NON_ADATTA_PROMPT', 'nessuna_prova_di_lemma_di_contenuto')
        answer = result('VERIFICARE_LESSICALIZZAZIONE' if categories & {'NOUN', 'ADJ'} else 'SOLO_MORFOLOGIA',
                        'forma_flessa_non_approvata_come_risposta')
    else:
        reference = env['verb_references'].get(word, (z, word)) if 'VERB' in own else (z, word)
        prompt = result('ESCLUSA_LUNGHEZZA', 'prompt_2_15_lettere') if not 2 <= len(word) <= 15 else result('NON_ADATTA_PROMPT',
                        'familiarita_inferiore_soglia' if zipf_bound(env['policy'])[2] == '>=' else 'frequenza_superiore_soglia',
                        reference_form=reference[1], reference_zipf=reference[0]) if not zipf_matches(reference[0], env['policy']) else result(
                            'DA_REVISIONARE_SENSO', 'mancano_senso_familiare_categoria_e_bacino',
                            reference_form=reference[1], reference_zipf=reference[0])
        answer = result('DA_REVISIONARE_IN_COPPIA', 'mancano_prompt_senso_e_relazione_revisionata')
    node = result('RICHIEDE_BACINO_VERIFICATO', 'ogni_nodo_deve_essere_un_prompt_con_bacino') if prompt['status'] == 'DA_REVISIONARE_SENSO' else result(
        'NON_ADATTA_NODO', 'non_supera_requisiti_del_prompt')
    features = {'invalid_reasons': [], 'zipf_it': z, 'sources': sorted(data['sources']),
                'source_families': sorted({family(s) for s in data['sources']}),
                'analyses': sorted(analyses, key=str), 'lemmas': lemmas,
                'fasttext': word in env['fasttext'], 'numberbatch': word in env['numberbatch'],
                'lemmas_used_as_existing_answers': sorted(set(lemmas) & env['active_answers']),
                'already_in_games': {'wordle': wordle.fold(word) in env['active_wordle'],
                                    'context': word in env['active_context'], 'zerowords': key in env['active_words']}}
    return features, {'zerowordle': {'soluzione': solution, 'tentativo': guess},
                      'zerocontext': {'segreta': secret, 'tentativo': context_guess},
                      'zerowords': {'griglia': grid, 'bonus': bonus},
                      'zeroassociations': {'prompt': prompt, 'risposta': answer},
                      'zerocatene': {'nodo': node, 'indizio': answer}}


def export_csv(records, output):
    """Una sola riga per gli scarti di formato comuni a tutti i giochi."""
    with Path(output).open('w', encoding='utf-8-sig', newline='') as stream:
        out = csv.writer(stream)
        out.writerow(['word', 'game', 'role', 'status', 'reason', 'zipf_it', 'lemmas'])
        for identifier, word, feature_json, verdict_json in records:
            features, verdicts = json.loads(feature_json), json.loads(verdict_json)
            if features['invalid_reasons']:
                out.writerow([word, 'tutti', 'tutti', 'ESCLUSA_FORMATO', '|'.join(features['invalid_reasons']), '', ''])
                continue
            for game, roles in verdicts.items():
                for role, verdict in roles.items():
                    out.writerow([word, game, role, verdict['status'], verdict['reason'],
                                  features.get('zipf_it'), '|'.join(features.get('lemmas', []))])


def run(raw_file, baseline, import_report, output):
    from wordfreq import zipf_frequency
    imported = json.loads(Path(import_report).read_text(encoding='utf-8'))
    con = sqlite3.connect(Path(raw_file).resolve().as_uri() + '?mode=ro', uri=True)
    con.execute('ATTACH DATABASE ? AS before_import', (Path(baseline).resolve().as_uri() + '?mode=ro',))
    games = sqlite3.connect((ROOT / 'database/giochi.sqlite3').as_uri() + '?mode=ro', uri=True)
    try:
        assert con.execute('SELECT count(*) FROM before_import.raw__inventory_terms').fetchone()[0] == imported['before_words']
        new_words = [w for (w,) in con.execute('SELECT t.prompt FROM raw__inventory_terms t WHERE NOT EXISTS('
            'SELECT 1 FROM before_import.raw__inventory_terms b WHERE b.prompt=t.prompt) ORDER BY t.prompt')]
        if len(new_words) != imported['new_unique_words']:
            raise ValueError('Le differenze dal backup non corrispondono al lotto importato')
        snapshots = con.execute('SELECT h.source_key,h.snapshot_id,v.sha256 FROM raw__inventory_source_heads h '
                               'JOIN raw__inventory_snapshots v ON v.id=h.snapshot_id ORDER BY h.source_key').fetchall()
        active = {key: sha for key, identifier, sha in snapshots}
        for source in imported['sources']:
            if active.get(source['source']) != source['sha256']:
                raise ValueError('Snapshot attivo diverso dal lotto da valutare')
        print(json.dumps({'stage': 'attestations', 'new_words': len(new_words)}), flush=True)
        info = collect(con, new_words)
        ranks = {}
        with (HERE / 'resources/frequency_ranks_it.csv').open(encoding='utf-8-sig') as stream:
            for row in csv.DictReader(stream): ranks[row['lemma']] = int(row['rank'])
        dictionaries = {family(key) for key in context.DICT} | {'unimorph-ita'}
        env = {'zipf': zipf_frequency, 'ranks': ranks, 'dictionaries': dictionaries,
               'forms': dictionaries | {'libreoffice-it-dictionary'},
               'morphology': {'morphit-048-mirror', 'unimorph-ita', 'kaikki-itwiktionary'},
               'policy': load_prompt_policy(), 'blocklist': load_blocklist(),
               'not_in_grid': exclusions(ROOT / 'gioco-parole/lexicon/it/not_in_grid.txt', upper=True),
               'wordle_excluded': exclusions(ROOT / 'gioco-zerowordle/wordle_exclusions.txt'),
               'context_excluded': context.load_exclusions(), 'verb_references': {},
               'max_wheel': max(json.loads((ROOT / 'gioco-parole/tools/curve.json').read_text())['wheel']),
               'vocab_size': games.execute('SELECT count(*) FROM context__vocab').fetchone()[0],
               'active_wordle': {w for (w,) in games.execute('SELECT word FROM wordle__words')},
               'active_context': {w for (w,) in games.execute('SELECT word FROM context__vocab')},
               'active_words': {w for (w,) in games.execute('SELECT word FROM parole__words')},
               'active_answers': {w for (w,) in con.execute('SELECT DISTINCT word FROM raw__associations')},
               'decisions': dict(con.execute('SELECT prompt,decision FROM raw__inventory_term_decisions '
                                             "WHERE decision IN ('DISCARDED','DEFERRED')"))}
        curve = json.loads((ROOT / 'gioco-parole/tools/curve.json').read_text())
        seeds = {word for (word,) in games.execute('SELECT word FROM parole__words WHERE tier=? AND zipf>=?',
                                                  ('main', curve['rarity']['seedZipf']))
                 if min(curve['wheel']) <= len(word) <= max(curve['wheel'])}
        env['wheel_support'] = wheel_support(info, seeds)
        for key in ('fasttext', 'numberbatch'):
            env[key] = set((ROOT / 'gioco-zerocontext/.cache' / (key + '_it_words.txt')).read_text(encoding='utf-8').splitlines())
        verbs = {word for word, data in info.items() if any(
            lemma == word and pos == 'VERB' and role == 'lemma' for lemma, pos, role, tag, source in data['analyses'])}
        if verbs:
            con.execute('CREATE TEMP TABLE utility_verbs(word TEXT PRIMARY KEY) WITHOUT ROWID')
            con.executemany('INSERT INTO utility_verbs VALUES (?)', ((word,) for word in verbs))
            for form, lemma in con.execute('SELECT a.prompt,a.lemma FROM raw__inventory_attestation_rows a '
                                          'JOIN utility_verbs v ON v.word=a.lemma'):
                if SINGLE_WORD.fullmatch(form):
                    value = (zipf_frequency(form, 'it'), form)
                    if value > env['verb_references'].get(lemma, (-1, '')): env['verb_references'][lemma] = value
    finally:
        con.close(); games.close()
    manifest = {'import_report': str(Path(import_report).resolve()), 'baseline': str(Path(baseline).resolve()),
                'new_words_sha256': digest(new_words), 'active_snapshots': snapshots,
                'wordfreq_version': metadata.version('wordfreq'), 'evaluation_version': 1,
                'directives': {game: {path: file_hash(ROOT / path) for path in paths} for game, paths in DIRECTIVES.items()},
                'evaluation_code_sha256': file_hash(__file__),
                'normalization_code_sha256': file_hash(HERE / 'script/prompt_inventory.py'),
                'pos_mapping_code_sha256': file_hash(HERE / 'script/audit_word_databases.py'),
                'resources': {str(path.relative_to(ROOT)): file_hash(path) for path in [
                    HERE / 'resources/frequency_ranks_it.csv', ROOT / 'gioco-zerocontext/.cache/fasttext_it_words.txt',
                    ROOT / 'gioco-zerocontext/.cache/numberbatch_it_words.txt']},
                'active_game_word_sets': {key: digest(sorted(env[key])) for key in
                                         ('active_wordle', 'active_context', 'active_words', 'active_answers')},
                'seed_words_sha256': digest(sorted(seeds)),
                'raw_morphology_sha256': digest({word: sorted(data['analyses'], key=str) for word, data in info.items()}),
                'policy': 'Technical suitability; no automatic semantic or gameplay approval',
                'non_applicable': {'zerodubbi': 'Richiede dilemmi completi A/B, non lemmi.',
                                   'zeroquizz': 'Richiede domande con opzioni e risposta verificata, non lemmi.'}}
    run_id = digest(manifest)
    counts, reasons, candidates, new_candidates = defaultdict(Counter), defaultdict(Counter), defaultdict(set), defaultdict(set)
    invalid_counts = Counter()
    records, examples = [], defaultdict(list)
    print(json.dumps({'stage': 'evaluating', 'canonical_words': len(info)}), flush=True)
    for word in new_words:
        features, verdicts = assess(word, info.get(word), env)
        invalid_counts.update(features['invalid_reasons'])
        for game, roles in verdicts.items():
            for role, verdict in roles.items():
                key = game + '.' + role
                counts[key][verdict['status']] += 1
                reasons[key][verdict['reason']] += 1
                if verdict['status'].startswith(('CANDIDATA_', 'DA_REVISIONARE_', 'RICHIEDE_')):
                    normalized = fold_grid(word) if game == 'zerowords' else wordle.fold(word) if game == 'zerowordle' else word
                    candidates[key].add(normalized)
                    active = (env['active_words'] if game == 'zerowords' else env['active_wordle'] if game == 'zerowordle'
                              else env['active_context'] if game == 'zerocontext' else env['active_answers'])
                    if normalized not in active: new_candidates[key].add(normalized)
                    if len(examples[key]) < 20: examples[key].append(word)
        records.append((run_id, word, json.dumps(features, ensure_ascii=False, separators=(',', ':')),
                        json.dumps(verdicts, ensure_ascii=False, separators=(',', ':'))))
    summary = {'run_id': run_id, 'evaluated_at': datetime.now(timezone.utc).isoformat(),
               'new_words': len(new_words), 'single_words': len(info), 'invalid_format': len(new_words) - len(info),
               'format_issues': dict(invalid_counts), 'zero_frequency_single_words': sum(
                   env['zipf'](word, 'it') == 0 for word in info),
               'single_source_single_words': sum(len(data['sources']) == 1 for data in info.values()),
               'counts': {key: dict(value) for key, value in counts.items()},
               'reasons': {key: dict(value) for key, value in reasons.items()},
               'distinct_candidate_game_keys': {key: len(value) for key, value in candidates.items()},
               'new_candidate_game_keys': {key: len(value) for key, value in new_candidates.items()},
               'examples': dict(examples), 'non_applicable': manifest['non_applicable'], 'automatic_gameplay_changes': 0}
    writer = sqlite3.connect(raw_file)
    try:
        writer.execute('PRAGMA foreign_keys=ON')
        writer.executescript(DDL)
        json_store.compact(writer, 'raw__word_utility_results')  # verdetti in un dizionario JSONB, vista come prima
        with writer:
            writer.execute('INSERT OR IGNORE INTO raw__word_utility_runs VALUES (?,?,?,?)',
                           (run_id, summary['evaluated_at'], json.dumps(manifest, ensure_ascii=False), json.dumps(summary, ensure_ascii=False)))
            writer.executemany('INSERT OR IGNORE INTO raw__word_utility_results VALUES (?,?,?,?)', records)
        if Path(raw_file).resolve() == unified_db.UNIFIED.resolve(): unified_db.register_objects('raw')
    finally:
        writer.close()
    write_json(output, {'summary': summary, 'manifest': manifest})
    export_csv(records, Path(output).with_suffix('.csv'))
    return summary


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--raw-db', type=Path, default=unified_db.UNIFIED)
    ap.add_argument('--baseline', type=Path, default=BASELINE)
    ap.add_argument('--import-report', type=Path, default=IMPORT_REPORT)
    ap.add_argument('--output', type=Path, default=OUTPUT)
    args = ap.parse_args(argv)
    print(json.dumps(run(args.raw_db, args.baseline, args.import_report, args.output), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__': raise SystemExit(main())

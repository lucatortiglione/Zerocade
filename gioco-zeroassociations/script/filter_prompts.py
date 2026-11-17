"""Lo schema filtrati del DB di lavoro: le voci della raccolta che superano i filtri automatici.

Dalla raccolta (schema raw, sola lettura) tiene una voce solo se:

1. è una parola singola con prova di lemma, in forma canonica (2-15 lettere minuscole);
2. rispetta il limite wordfreq (Zipf) configurato in resources/prompt_policy.json
   (per un verbo vale la sua forma più frequente in Morph-it, come in script/prompt_policy.py), oppure è
   nel Nuovo vocabolario di base di De Mauro (NVdB), che raccoglie le parole note a tutti;
3. il Wikizionario italiano ha per essa un nome, un verbo o un aggettivo con almeno un senso
   «pulito»: definizione presente, non rimando a un'altra forma, senza etichette di registro
   (raro, arcaico, letterario, regionale, gergale, volgare, offensivo...). Una voce senza
   definizione vale solo se Morph-it ne conferma il lemma (segnalata senza_definizione);
4. non è soprattutto una parola grammaticale: i sensi da avverbio, preposizione, congiunzione,
   pronome, determinante o articolo non superano quelli da nome, verbo o aggettivo; non è un
   numerale;
5. non è un aggettivo che Morph-it conosce soltanto come participio di un verbo: «agitato»
   resta perché è anche aggettivo, «abbassato» no. Per i nomi vale il Wikizionario (Morph-it
   non conosce, per esempio, il nome «parmigiana»);
6. se ha la forma di un prestito (finisce in consonante o contiene j, k, w, x, y) è nella lista
   chiusa dei prestiti comuni;
7. la raccolta non l'ha scartata né rimandata (inventory_term_decisions).

Ogni voce tenuta conserva le prove (frequenza, appartenenza al NVdB, età di acquisizione ItAoA,
categorie, prima definizione, fonti) e alcune
segnalazioni per chi la rivede (probabile astratto, molti sensi, anche participio...). Le voci
familiari escluse restano in filter_rejections con il motivo; tutti gli scarti delle varie
fasi sono copiati nello schema scartati, distinguendo filtri e decisioni.
È una preselezione, non una
validazione: lo stato è FILTERED_AUTOMATIC e un prompt entra nel gioco solo con un verbale di
revisione (script/validated_prompt_database.py, import-reviewed). La tabella validated_prompts copia le
voci con verbale positivo corrente (senso e categoria scelti dal revisore); la vista review_state
distingue i candidati VALIDATO da quelli DA_RIVEDERE. Gli scartati e i rimandati non vi compaiono.

score-playability aggiunge, se c'è l'LLM locale, quanti giocatori simulati concordano sulle
associazioni (script/free_association_llm.py): un prompt con poche associazioni condivise gioca male.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
import unified_db
import sys
import tempfile
from typing import Callable

from prompt_policy import load_prompt_policy, zipf_bound, zipf_matches
from sqlite_prompt_runtime import publish_database

ROOT = Path(__file__).resolve().parent.parent
RAW_DB = unified_db.address('raw')
GAME_DB = unified_db.address('game')
FILTERED_DB = unified_db.address('filtrati')
FILTER_VERSION = 'prompt-filters-2026-11-09.3'

CANONICAL = re.compile(r'[a-zàèéìòù]{2,15}')
CONTENT_POS = {'noun': 'NOUN', 'verb': 'VERB', 'adj': 'ADJ'}
FUNCTION_POS = {'adv', 'prep', 'conj', 'pron', 'det', 'article', 'particle'}
REGISTER_TAGS = {'obsolete', 'archaic', 'rare', 'dialectal', 'regional', 'vulgar', 'offensive', 'slang',
                 'derogatory', 'literary', 'poetic'}
MISSING_GLOSS = re.compile(r'definizione mancante', re.IGNORECASE)
LOAN_SHAPE = re.compile(r'[jkwxy]|[^aeiouàèéìòù]$')
ABSTRACT = re.compile(r'(?:zione|sione|mento|ità|ezza|anza|enza|ismo|tudine)$')
MANY_SENSES = 5

SCHEMA = f"""
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE filtered_prompts(
  prompt TEXT PRIMARY KEY,
  language TEXT NOT NULL CHECK(language IN ('it','common_loanword')),
  pos TEXT NOT NULL CHECK(pos IN ('NOUN','VERB','ADJ')),
  pos_all TEXT NOT NULL,
  zipf REAL NOT NULL,
  senses INTEGER NOT NULL,
  gloss TEXT NOT NULL,
  sources INTEGER NOT NULL,
  flags TEXT NOT NULL CHECK(json_valid(flags)),
  nvdb INTEGER NOT NULL CHECK(nvdb IN (0,1)),
  aoa REAL,
  in_game INTEGER NOT NULL CHECK(in_game IN (0,1)),
  playability INTEGER,
  status TEXT NOT NULL CHECK(status='FILTERED_AUTOMATIC')
) STRICT;
CREATE INDEX filtered_by_zipf ON filtered_prompts(zipf DESC);
CREATE TABLE filter_rejections(
  prompt TEXT PRIMARY KEY, zipf REAL NOT NULL, reason TEXT NOT NULL
) STRICT;
CREATE TABLE filter_steps(step INTEGER PRIMARY KEY, description TEXT NOT NULL, remaining INTEGER NOT NULL) STRICT;
CREATE VIEW filtered_catalog AS
  SELECT prompt, pos, zipf, nvdb, aoa, gloss, flags, in_game, playability FROM filtered_prompts ORDER BY zipf DESC;
-- Copia delle voci con verbale di revisione positivo corrente nella raccolta (senso e categoria scelti
-- dal revisore). Le voci di filtered_prompts senza riga qui sono ancora candidati da rivedere.
CREATE TABLE validated_prompts(
  prompt TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  pos TEXT NOT NULL CHECK(pos IN ('NOUN','VERB','ADJ')),
  sense_description TEXT NOT NULL,
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  cluster_name TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  method TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  validation_id TEXT NOT NULL,
  passes_automatic_filters INTEGER NOT NULL CHECK(passes_automatic_filters IN (0,1))
) STRICT;
CREATE INDEX validated_by_category ON validated_prompts(category_id);
CREATE VIEW review_state AS
  SELECT f.prompt, f.pos, f.zipf, CASE WHEN v.prompt IS NULL THEN 'DA_RIVEDERE' ELSE 'VALIDATO' END AS state,
         v.sense_description, v.category_id, v.category_name
  FROM filtered_prompts f LEFT JOIN validated_prompts v ON v.prompt = f.prompt;
-- L'ordine di revisione: prima il vocabolario di base, poi le parole imparate da piccoli, poi le più frequenti.
CREATE VIEW review_order AS
  SELECT prompt, pos, zipf, nvdb, aoa, gloss, flags, in_game FROM filtered_prompts
  ORDER BY nvdb DESC, aoa IS NULL, aoa, zipf DESC;
"""


def wordfreq_zipf() -> Callable[[str], float]:
    from wordfreq import zipf_frequency
    return lambda word: zipf_frequency(word, 'it')


def clean_senses(details: dict) -> list[dict]:
    out = []
    for sense in details.get('senses', []):
        gloss = next((g for g in sense.get('glosses') or [] if g and g.strip()), '')
        if not gloss or MISSING_GLOSS.search(gloss) or sense.get('form_of'): continue
        if {*(sense.get('tags') or []), *(sense.get('raw_tags') or [])} & REGISTER_TAGS: continue
        out.append({**sense, 'gloss': gloss.strip()})
    return out


def judge(prompt: str, zipf: float, attestations: list[tuple], sources: dict[str, str], policy: dict,
          verb_zipf: float | None = None) -> dict:
    """Esito per una voce familiare: {'keep': bool, 'reason'|...}. attestations: (snapshot, role, pos, lemma, details)."""
    wiki = defaultdict(list)       # pos del Wikizionario -> sensi puliti
    undefined = set()              # pos del Wikizionario con la voce ma senza definizione
    function_senses = 0
    morph = []                     # (tag, lemma) di Morph-it
    for snapshot, role, pos, lemma, details in attestations:
        source = sources.get(snapshot, '')
        if source == 'kaikki-itwiktionary' and role == 'lemma':
            data = json.loads(details)
            senses = clean_senses(data)
            if pos in CONTENT_POS:
                wiki[CONTENT_POS[pos]] += senses
                if not senses and any(MISSING_GLOSS.search(' '.join(s.get('glosses') or [])) for s in data.get('senses', [])):
                    undefined.add(CONTENT_POS[pos])
            elif pos in FUNCTION_POS: function_senses += len(senses) or 1
        elif source.startswith('morphit'):
            morph.append((pos, lemma))
    morph_lemmas = {tag.split(':')[0].split('-')[0] for tag, lemma in morph if lemma == prompt}
    flags = []
    content = sum(len(v) for v in wiki.values())
    if not content:
        # Voce senza definizione: vale se Morph-it ne conferma il lemma nella stessa categoria.
        confirmed = [p for p in ('NOUN', 'ADJ', 'VER') if p in morph_lemmas and (p[:3] if p == 'VER' else p) in
                     {u[:3] if u == 'VERB' else u for u in undefined}]
        if not confirmed: return {'keep': False, 'reason': 'nessun_nome_verbo_aggettivo_nel_wikizionario'}
        pos = 'VERB' if confirmed[0] == 'VER' else confirmed[0]
        wiki[pos] = [{'gloss': ''}]
        flags.append('senza_definizione')
        content = 1
    if function_senses > content: return {'keep': False, 'reason': 'soprattutto_parola_grammaticale'}
    if any(tag in ('DET-NUM-CARD', 'PRO-NUM') for tag, _ in morph):
        return {'keep': False, 'reason': 'numerale'}
    if (set(wiki) == {'ADJ'} and morph and not morph_lemmas
            and all(tag.startswith('VER:part') for tag, _ in morph)):
        return {'keep': False, 'reason': 'solo_participio'}
    loan_shape = bool(LOAN_SHAPE.search(prompt))
    if loan_shape and prompt not in policy['common_loanwords']:
        return {'keep': False, 'reason': 'prestito_non_in_lista'}
    pos = max(wiki, key=lambda p: len(wiki[p]))
    if ABSTRACT.search(prompt): flags.append('astratto_probabile')
    if content >= MANY_SENSES: flags.append('molti_sensi')
    if function_senses: flags.append('anche_parola_grammaticale')
    if any(tag.startswith('VER:part') for tag, _ in morph): flags.append('anche_participio')
    if not morph: flags.append('senza_morfologia')
    elif not morph_lemmas: flags.append('morfologia_solo_forme')
    if verb_zipf is not None and verb_zipf > zipf: flags.append('frequenza_da_forma_verbale')
    return {'keep': True, 'language': 'common_loanword' if loan_shape else 'it', 'pos': pos,
            'pos_all': ','.join(sorted(wiki, key=lambda p: -len(wiki[p]))), 'zipf': round(max(zipf, verb_zipf or 0), 2),
            'senses': content, 'gloss': wiki[pos][0]['gloss'][:300],
            'sources': len({sources.get(a[0], a[0]) for a in attestations}), 'flags': flags}


def validated_records(raw: sqlite3.Connection, decided: set[str]) -> list[tuple]:
    """Verbali positivi correnti della raccolta, esclusi i prompt poi scartati o rimandati."""
    if not raw.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='prompt_validation_heads'").fetchone():
        return []
    from prompt_database import load_categories
    from validated_prompt_database import validate_record
    catalog = load_categories()
    out = []
    for prompt, key, text in raw.execute('SELECT h.prompt, v.id, v.record_json FROM prompt_validation_heads h '
                                         'JOIN prompt_validations v ON v.id = h.validation_id ORDER BY h.prompt'):
        if prompt in decided: continue
        record = json.loads(text)
        try: validate_record(record)
        except ValueError: continue  # Un verbale non più conforme non rende valida la voce.
        if record['prompt'] != prompt or record.get('content_sha256', key) != key: continue
        review, category = record['review'], catalog[record['category_id']]
        out.append((prompt, record['prompt_language'], record['pos'], record['sense_description'],
                    record['category_id'], category['category_name'], category['cluster_name'],
                    review['reviewer'], review['method'], review['reviewed_at'], key, None))
    return out


def build(raw_path: Path = RAW_DB, output: Path = FILTERED_DB, game_path: Path | None = GAME_DB,
          zipf: Callable[[str], float] | None = None, policy: dict | None = None) -> dict:
    raw_path, output = Path(raw_path).resolve(), Path(output).resolve()
    if any(unified_db.same_db(output, p) for p in (raw_path, game_path) if p):
        raise ValueError('Il DB dei filtrati deve essere distinto dalla raccolta e dai bacini')
    policy = policy or load_prompt_policy()
    zipf = zipf or wordfreq_zipf()
    raw = unified_db.connect(f'file:{raw_path.as_posix()}?mode=ro', uri=True)
    try:
        sources = dict(raw.execute('SELECT id, source_key FROM inventory_snapshots'))
        has_decisions = raw.execute(
            "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='inventory_term_decisions'").fetchone()
        decided = {p for (p,) in raw.execute(
            "SELECT prompt FROM inventory_term_decisions WHERE decision IN ('DISCARDED','DEFERRED')")} if has_decisions else set()
        steps = [('voci nella raccolta', raw.execute('SELECT count(*) FROM inventory_terms').fetchone()[0])]
        lemmas = [p for (p,) in raw.execute('SELECT prompt FROM inventory_terms WHERE is_single_word=1 AND has_lemma_evidence=1')]
        steps.append(('parola singola con prova di lemma', len(lemmas)))
        canonical = [p for p in lemmas if CANONICAL.fullmatch(p)]
        steps.append(('forma canonica, 2-15 lettere minuscole', len(canonical)))
        threshold_key, threshold, comparison = zipf_bound(policy)
        # Per un verbo conta la sua forma più frequente (prompt_policy.familiarity_reference).
        verb_forms = defaultdict(float)
        morph_snapshots = [s for s, key in sources.items() if key.startswith('morphit')]
        for snapshot in morph_snapshots:
            for form, lemma, tag in raw.execute(
                    'SELECT source_form, lemma, pos FROM inventory_attestations WHERE snapshot_id = ?', (snapshot,)):
                if tag.startswith('VER') and CANONICAL.fullmatch(form or ''):
                    verb_forms[lemma] = max(verb_forms[lemma], zipf(form))
        # Vocabolario di base (NVdB) ed età di acquisizione (ItAoA), se la raccolta li contiene.
        nvdb, aoa = set(), {}
        for snapshot, key in sources.items():
            if key.startswith('nvdb'):
                nvdb |= {p for (p,) in raw.execute('SELECT prompt FROM inventory_attestations WHERE snapshot_id = ?', (snapshot,))}
            elif key.startswith('itaoa'):
                for p, details in raw.execute('SELECT prompt, details_json FROM inventory_attestations WHERE snapshot_id = ?', (snapshot,)):
                    value = json.loads(details).get('aoa_mean')
                    if isinstance(value, (int, float)): aoa[p] = round(float(value), 2)
        familiar = [(p, z) for p in canonical
                    if zipf_matches(max(z := zipf(p), verb_forms.get(p, 0.0)), policy) or p in nvdb]
        steps.append((f'frequenza: Zipf {comparison} {threshold} (per i verbi la forma più frequente) o nel NVdB', len(familiar)))
        kept, rejected, reasons = [], [], Counter()
        query = 'SELECT snapshot_id, role, pos, lemma, details_json FROM inventory_attestations WHERE prompt = ?'
        for prompt, z in familiar:
            verdict = ({'keep': False, 'reason': 'scartata_o_rimandata_nella_raccolta'} if prompt in decided
                       else judge(prompt, z, raw.execute(query, (prompt,)).fetchall(), sources, policy,
                                  verb_forms.get(prompt)))
            if verdict['keep']:
                if not zipf_matches(max(z, verb_forms.get(prompt, 0.0)), policy): verdict['flags'].append('familiare_per_nvdb')
                verdict.update(nvdb=int(prompt in nvdb), aoa=aoa.get(prompt))
                kept.append((prompt, verdict))
            else:
                rejected.append((prompt, round(max(z, verb_forms.get(prompt, 0.0)), 2), verdict['reason']))
                reasons[verdict['reason']] += 1
        steps.append(('superano dizionario, morfologia, prestiti e decisioni', len(kept)))
        validated = validated_records(raw, decided)
    finally:
        raw.close()
    in_game = set()
    if game_path and unified_db.exists(Path(game_path)):
        game = unified_db.connect(f'file:{Path(game_path).resolve().as_posix()}?mode=ro', uri=True)
        try: in_game = {p for (p,) in game.execute('SELECT lemma FROM prompts')}
        finally: game.close()

    output.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix=output.stem+'.', suffix='.part', dir=output.parent)
    os.close(handle)
    temporary = Path(name)
    try:
        db = sqlite3.connect(temporary)
        try:
            db.executescript(SCHEMA)
            db.executemany('INSERT INTO filtered_prompts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)', [
                (p, v['language'], v['pos'], v['pos_all'], v['zipf'], v['senses'], v['gloss'], v['sources'],
                 json.dumps(v['flags']), v['nvdb'], v['aoa'], int(p in in_game), 'FILTERED_AUTOMATIC') for p, v in kept])
            kept_names = {p for p, _ in kept}
            db.executemany('INSERT INTO validated_prompts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                           [v[:-1] + (int(v[0] in kept_names),) for v in validated])
            db.executemany('INSERT INTO filter_rejections VALUES (?,?,?)', rejected)
            db.executemany('INSERT INTO filter_steps VALUES (?,?,?)', [(i, d, n) for i, (d, n) in enumerate(steps)])
            meta = {'filter_version': FILTER_VERSION, 'source_db': str(raw_path), 'created_at':
                    datetime.now(timezone.utc).isoformat(timespec='seconds'), 'prompt_policy_version': policy['version'],
                    threshold_key: str(threshold), 'zipf_comparison': comparison, 'semantic_approval': 'false',
                    'inventory_snapshot_ids':json.dumps(sorted(sources),separators=(',',':'))}
            db.executemany('INSERT INTO metadata VALUES (?,?)', meta.items())
            db.commit()
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise ValueError('Errore di integrità')
        finally:
            db.close()
        publish_database(temporary,output)
    finally:
        temporary.unlink(missing_ok=True)
    from discarded_prompt_database import sync_discarded
    discarded = sync_discarded(raw_path,output,unified_db.sibling(output,'scartati'))
    return {'output': str(output), 'kept': len(kept), 'validated_prompts': len(validated),
            'rejected_familiar': len(rejected),
            'discarded_db':discarded['output'],'discarded_prompts':discarded['discarded_prompts'],
            'rejection_reasons': dict(reasons.most_common()), 'steps': steps, 'semantic_approval': False}


def score_playability(path: Path, sample, limit: int, players: int = 8) -> int:
    """Per i `limit` prompt più frequenti senza punteggio: le parole su cui concorda almeno metà dei
    giocatori simulati (free_association_llm.propose)."""
    from free_association_llm import propose
    db = sqlite3.connect(path)
    try:
        todo = db.execute('SELECT prompt FROM filtered_prompts WHERE playability IS NULL ORDER BY zipf DESC LIMIT ?',
                          (limit,)).fetchall()
        for (prompt,) in todo:
            draft = propose(prompt, sample, k=players)
            db.execute('UPDATE filtered_prompts SET playability = ? WHERE prompt = ?', (len(draft['words']), prompt))
            db.commit()
        return len(todo)
    finally:
        db.close()


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--output', type=Path, default=FILTERED_DB)
    sub = ap.add_subparsers(dest='command', required=True)
    b = sub.add_parser('build', help='Ricostruisce lo schema filtrati dalla raccolta')
    b.add_argument('--source', type=Path, default=RAW_DB)
    b.add_argument('--game-db', type=Path, default=GAME_DB)
    sub.add_parser('status', help='Passaggi del filtro e conteggi')
    s = sub.add_parser('score-playability', help='Giocabilità simulata con l\'LLM locale')
    s.add_argument('--limit', type=int, default=100)
    s.add_argument('--players', type=int, default=8)
    s.add_argument('--endpoint', default='http://127.0.0.1:19472')
    s.add_argument('--model')
    args = ap.parse_args(argv)
    if args.command == 'build':
        print(json.dumps(build(args.source, args.output, args.game_db), ensure_ascii=False, indent=2))
    elif args.command == 'status':
        db = unified_db.connect(f'file:{args.output.resolve().as_posix()}?mode=ro', uri=True)
        try:
            print(json.dumps({
                'metadata': dict(db.execute('SELECT key, value FROM metadata')),
                'steps': [f'{n:>9,}  {d}' for d, n in db.execute('SELECT description, remaining FROM filter_steps ORDER BY step')],
                'by_pos': dict(db.execute('SELECT pos, count(*) FROM filtered_prompts GROUP BY pos')),
                'in_nvdb': db.execute('SELECT count(*) FROM filtered_prompts WHERE nvdb = 1').fetchone()[0],
                'with_aoa': db.execute('SELECT count(*) FROM filtered_prompts WHERE aoa IS NOT NULL').fetchone()[0],
                'scored': db.execute('SELECT count(*) FROM filtered_prompts WHERE playability IS NOT NULL').fetchone()[0],
            }, ensure_ascii=False, indent=2))
        finally:
            db.close()
    else:
        from free_association_llm import http_sampler
        print(json.dumps({'scored': score_playability(args.output, http_sampler(args.endpoint, args.model),
                                                      args.limit, args.players)}))


if __name__ == '__main__':
    main()

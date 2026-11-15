"""Archivio di soli bacini revisionati: importazione atomica, estrazione 7/8, SQL.

Nessun filtro automatico è un verificatore semantico. Il comando import-reviewed
controlla il contratto di una revisione già effettuata, non approva nuove parole.
"""
from __future__ import annotations

import unified_db
import argparse
import csv
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import random
import re
import secrets
import sys
import tempfile

from prompt_policy import load_prompt_policy
from semantic_rules import SEMANTIC_POLICY, SOURCE_ONLY_REASON, WORD_CHECKS
from sqlite_prompt_runtime import SQLite, VERSION, literal, publish_database
from taxonomy_source import DEFAULT_TAXONOMY, read_taxonomy_rows

ROOT = Path(__file__).resolve().parent.parent
# La raccolta: inventario, fonti, aggiornamenti, decisioni e bacini (gigabyte, fuori da Git).
DEFAULT_DB = unified_db.address('raw')
# Il database dei soli bacini verificati, quello che legge il gioco (versionato in Git).
GAME_DB = unified_db.address('game')
DIRECTIVES = ROOT/'direttive_word_association_it_v3_6_0.md'
# Hash delle direttive -> versione delle regole (semantic_rules.SEMANTIC_POLICY) che contenevano.
POLICY_VERSIONS = ROOT/'resources/policy_versions.json'
WORD = re.compile(r'[a-zàèéìòù]+')
POOL_CHECKS = ('single_familiar_sense', 'prompt_language', 'standalone_associations',
    'no_generic_fillers', 'no_forced_pos', 'source_polarity', 'constraints_reviewed')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(',', ':')).encode('utf-8')).hexdigest()


def directives_hash():
    return hashlib.sha256(DIRECTIVES.read_bytes()).hexdigest()


def known_directives():
    return json.loads(POLICY_VERSIONS.read_text(encoding='utf-8'))['directives_sha256']


def review_policy(review):
    """Le regole a cui risponde un verbale: policy_version dichiarata, oppure quella registrata
    per l'hash delle direttive che il revisore aveva. Un ritocco al testo delle direttive non
    cambia le regole e non invalida i bacini (register-directives); un cambio di regole fa
    salire SEMANTIC_POLICY e li manda tutti in revisione."""
    return review.get('policy_version') or known_directives().get(review.get('directives_sha256'))


def register_directives():
    """Registra l'hash attuale delle direttive sotto la versione attuale delle regole."""
    registry = json.loads(POLICY_VERSIONS.read_text(encoding='utf-8'))
    current = directives_hash()
    previous = registry['directives_sha256'].get(current)
    if previous and previous != SEMANTIC_POLICY:
        raise ValueError(f'Questo testo delle direttive è già registrato per {previous}')
    registry['directives_sha256'][current] = SEMANTIC_POLICY
    POLICY_VERSIONS.write_text(json.dumps(registry, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return {'directives_sha256': current, 'policy_version': SEMANTIC_POLICY}


def required_text(value, minimum=1):
    return isinstance(value, str) and len(value.strip()) >= minimum


def load_categories():
    rows=read_taxonomy_rows(DEFAULT_TAXONOMY)
    rows+=json.loads((ROOT/'resources/prompt_category_extensions.json').read_text(encoding='utf-8'))
    result={row['category_id']:{k:row[k] for k in ('category_id','category_name','cluster_id','cluster_name')} for row in rows}
    if len(result)!=len(rows):raise ValueError('ID categoria duplicati')
    return result


def validate_pool(pool, expected_directives=None):
    """Valida il verbale editoriale e i vincoli, senza simulare una revisione."""
    if not isinstance(pool,dict): raise ValueError('Bacino non strutturato come oggetto JSON')
    if pool.get('schema') != 'verified-pool-1': raise ValueError('Schema del bacino non riconosciuto')
    prompt = pool.get('prompt', '')
    if not isinstance(prompt,str) or not WORD.fullmatch(prompt): raise ValueError('Prompt non canonico')
    if pool.get('pos') not in {'NOUN', 'VERB', 'ADJ'}: raise ValueError('POS mancante')
    if not required_text(pool.get('sense_description'), 15): raise ValueError('Accezione mancante')
    if pool.get('prompt_language') not in {'it', 'common_loanword'}: raise ValueError('Lingua non verificata')
    if pool['prompt_language'] == 'common_loanword' and prompt not in load_prompt_policy()['common_loanwords']:
        raise ValueError('Prestito assente da common_loanwords')
    category = pool.get('category_id')
    if not isinstance(category,str) or category not in load_categories():
        raise ValueError('Categoria obbligatoria, da scegliere nel catalogo del DB')
    review = pool.get('review') or {}
    if not isinstance(review,dict): raise ValueError('Verbale non strutturato')
    if (review.get('decision') != 'verified' or not required_text(review.get('reviewer'))
            or review.get('method') not in {'llm_editorial_review', 'human_editorial_review'}
            or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', review.get('reviewed_at', ''))
            or type(review.get('human_review')) is not bool
            or review.get('human_review') != (review.get('method') == 'human_editorial_review')
            or review.get('independent_gameplay_qa') is not False):
        raise ValueError('Manca una revisione semantica preinserimento documentata')
    if not re.fullmatch(r'[a-f0-9]{64}', str(review.get('directives_sha256', ''))):
        raise ValueError('Hash delle direttive mancante nel verbale')
    if expected_directives is not None and review['directives_sha256'] != expected_directives:
        raise ValueError('Revisione basata su direttive differenti: rivalutare il bacino')
    if expected_directives is None and review_policy(review) != SEMANTIC_POLICY:
        raise ValueError('Revisione basata su direttive differenti: rivalutare il bacino')
    if not isinstance(review.get('checks'),dict) or any(review['checks'].get(check) is not True for check in POOL_CHECKS):
        raise ValueError('Controlli editoriali incompleti')
    if not required_text(review.get('prompt_rationale'), 25): raise ValueError('Motivazione del contesto mancante')
    evidence = pool.get('evidence')
    if not isinstance(evidence, list) or not evidence: raise ValueError('Provenienza mancante')
    for item in evidence:
        if not isinstance(item,dict): raise ValueError('Evidenza non strutturata')
        if any(not required_text(item.get(k)) for k in ('source_id', 'source_url', 'url', 'license', 'attribution', 'scope', 'note')):
            raise ValueError('Evidenza incompleta')
        if not re.fullmatch(r'[a-f0-9]{64}', item.get('snapshot_sha256', '')):
            raise ValueError('Hash della fonte mancante')
    answers = pool.get('answers')
    if not isinstance(answers, list) or not answers: raise ValueError('Bacino vuoto')
    if any(not isinstance(a,dict) for a in answers): raise ValueError('Risposta non strutturata')
    words = [a.get('word', '') for a in answers]
    if any(not isinstance(w,str) or not WORD.fullmatch(w) for w in words):
        raise ValueError('Risposta non canonica')
    if len(set(words)) != len(words) or prompt in words:
        raise ValueError('Risposte duplicate nello stesso bacino, non canoniche o uguali al prompt')
    if any(not required_text(a.get('rationale'),20) for a in answers):
        raise ValueError('Motivazione individuale mancante o breve')
    if len({a['rationale'] for a in answers}) != len(answers):
        raise ValueError('Motivazioni copiate tra risposte')
    for answer in answers:
        if (answer.get('decision') != 'accepted'
                or not isinstance(answer.get('checks'),dict)
                or any(answer['checks'].get(k) is not True for k in WORD_CHECKS)
                or not required_text(answer.get('rationale'), 20)
                or SOURCE_ONLY_REASON.fullmatch(answer['rationale'])
                or any(not required_text(answer.get(k)) for k in ('answer_sense', 'relation', 'meaning_group'))
                or answer.get('difficulty') not in {'easy', 'medium', 'hard', 'unrated'}
                or not required_text(answer.get('difficulty_basis'))):
            raise ValueError('Revisione individuale incompleta: '+answer.get('word', '?'))
    groups = set(a['meaning_group'] for a in answers)
    limits = pool.get('group_limits') or {}
    if not isinstance(limits,dict) or set(limits) != groups or any(type(n) is not int or n not in (1, 2) for n in limits.values()):
        raise ValueError('Limite esplicito richiesto per ciascun gruppo semantico')
    if not isinstance(pool.get('conflicts',[]),list): raise ValueError('Elenco dei conflitti non valido')
    for conflict in pool.get('conflicts', []):
        if not isinstance(conflict,dict): raise ValueError('Conflitto non strutturato')
        if (len(conflict.get('words', [])) != 2 or len(set(conflict['words'])) != 2
                or not set(conflict['words']) <= set(words) or not required_text(conflict.get('reason'), 15)):
            raise ValueError('Conflitto fra risposte non valido')
    if pool.get('content_sha256') != digest({k:v for k,v in pool.items() if k != 'content_sha256'}):
        raise ValueError('Bacino modificato dopo la revisione: hash non corrispondente')


def sample_pool(pool, count, seed, difficulties=None):
    """Ricerca di un sottoinsieme valido, con ordine mescolato dal seed.

    Non campiona uniformemente tutte le combinazioni ammissibili. Non accetta
    sinonimi arbitrariamente: gruppi e incompatibilità vengono dalla revisione.
    """
    if count not in (7, 8): raise ValueError('Numero di risposte consentito: 7 oppure 8')
    candidates = sorted((a for a in pool['answers'] if not difficulties or a['difficulty'] in difficulties),
                        key=lambda a:a['word'])
    rng = random.Random(digest([str(seed), pool['prompt'], pool['sense_description'], pool['content_sha256'], count]))
    rng.shuffle(candidates)
    forbidden = {frozenset(c['words']) for c in pool.get('conflicts', [])}
    selected = []; groups = Counter(); nodes = 0

    def search(start):
        nonlocal nodes
        nodes += 1
        if nodes > 100_000:
            raise ValueError('Ricerca oltre il limite tecnico: risultato inconclusivo, rivedere i vincoli')
        if len(selected) == count: return True
        if len(candidates)-start < count-len(selected): return False
        remaining = Counter(a['meaning_group'] for a in candidates[start:])
        if sum(min(n, pool['group_limits'][g]-groups[g]) for g,n in remaining.items()) < count-len(selected):
            return False
        for index in range(start, len(candidates)):
            answer = candidates[index]; group = answer['meaning_group']
            if groups[group] >= pool['group_limits'][group]: continue
            if any(frozenset([answer['word'], old['word']]) in forbidden for old in selected): continue
            selected.append(answer); groups[group] += 1
            if search(index+1): return True
            selected.pop(); groups[group] -= 1
        return False

    if not search(0): raise ValueError(f"{pool['prompt']}: impossibile estrarre {count} risposte con i vincoli e le difficoltà richiesti")
    return [a['word'] for a in selected]


def insert(table, values, *, ignore=False):
    return ('INSERT '+('OR IGNORE ' if ignore else '')+'INTO '+table+' ('+','.join(values)+') VALUES ('+
            ','.join(literal(v) for v in values.values())+');\n')


def initialize(db):
    db.path.parent.mkdir(parents=True, exist_ok=True)
    db.run((ROOT/'prompt_schema.sql').read_text(encoding='utf-8')+insert('metadata',
        {'key':'sqlite_version_required','value':VERSION}, ignore=True))
    statements=['BEGIN IMMEDIATE;']
    columns={r['name'] for r in db.run('PRAGMA table_info(prompts);',rows=True)}
    if 'category_id' not in columns:
        statements.append('ALTER TABLE prompts ADD COLUMN category_id TEXT REFERENCES categories(category_id);')
    for category in load_categories().values():
        statements.append(insert('categories',category,ignore=True))
    statements.append('UPDATE prompts SET category_id=(SELECT s.category_id FROM senses s '
        'WHERE s.prompt=prompts.lemma AND s.description=prompts.familiar_sense) '
        'WHERE category_id IS NULL AND EXISTS(SELECT 1 FROM senses s JOIN categories c ON c.category_id=s.category_id '
        'WHERE s.prompt=prompts.lemma AND s.description=prompts.familiar_sense);')
    # Anche il DB della prima versione, migrato senza cancellare dati, deve
    # rifiutare da ora categorie nulle o sconosciute su INSERT e UPDATE.
    for table in ('prompts','senses'):
        for event in ('INSERT','UPDATE'):
            statements.append(f'CREATE TRIGGER IF NOT EXISTS {table}_category_{event.lower()} BEFORE {event} ON {table} '
                "WHEN NEW.category_id IS NULL OR NOT EXISTS(SELECT 1 FROM categories WHERE category_id=NEW.category_id) "
                "BEGIN SELECT RAISE(ABORT,'Categoria obbligatoria e presente nel catalogo');END;")
    statements.append('CREATE VIEW IF NOT EXISTS prompt_catalog AS SELECT p.lemma AS prompt,c.category_id,c.category_name,'
        'c.cluster_id,c.cluster_name,s.description AS sense_description,count(a.word) AS association_count '
        'FROM prompts p JOIN categories c ON c.category_id=p.category_id '
        'JOIN senses s ON s.prompt=p.lemma AND s.description=p.familiar_sense '
        'JOIN associations a ON a.sense_id=s.id GROUP BY p.lemma;')
    statements.append('COMMIT;')
    db.run(''.join(statements))


def import_reviewed(db, path, *, expected_heads=None, new_prompts_only=False, expected_pool_reviews=None):
    pools = [json.loads(line) for line in Path(path).read_text(encoding='utf-8').split('\n') if line.strip()]
    # Tutte le verifiche PRIMA di inizializzare o scrivere il DB. Nessuna promozione
    # automatica delle proposte, nessuna importazione parziale dei pacchetti errati.
    for pool in pools: validate_pool(pool)
    keys = [(p['prompt'], p['sense_description']) for p in pools]
    if len(set(keys)) != len(keys): raise ValueError('Accezione duplicata nel pacchetto')
    if expected_heads is not None and set(expected_heads) != {p['prompt'] for p in pools}:
        raise ValueError('Servono i riferimenti di revisione per tutti i prompt del pacchetto')
    if expected_pool_reviews is not None and set(expected_pool_reviews) != {p['prompt'] for p in pools}:
        raise ValueError('Servono i riferimenti dei bacini per tutti i prompt del pacchetto')
    initialize(db)
    statements = ['BEGIN IMMEDIATE;\n']
    # I nuovi bacini possono essere preparati mentre un altro processo rivede
    # i prompt. Il controllo avviene nella stessa transazione che li inserisce:
    # non associare parole a una revisione ormai superata, né sostituire un
    # bacino creato nel frattempo da un altro revisore.
    if expected_heads is not None or new_prompts_only or expected_pool_reviews is not None:
        statements.append('CREATE TEMP TABLE association_import_guard(ok INTEGER NOT NULL CHECK(ok=1));')
        has_term_decisions = bool(db.run("SELECT 1 FROM sqlite_schema WHERE name='inventory_term_decisions' AND type='table';", rows=True))
        for pool in pools:
            prompt = literal(pool['prompt'])
            if has_term_decisions:
                statements.append('INSERT INTO association_import_guard SELECT NOT EXISTS('
                    "SELECT 1 FROM inventory_term_decisions WHERE decision IN ('DISCARDED','DEFERRED') AND prompt="+prompt+');')
            if expected_heads is not None:
                statements.append('INSERT INTO association_import_guard SELECT EXISTS('
                    'SELECT 1 FROM prompt_validation_heads WHERE prompt='+prompt+
                    ' AND validation_id='+literal(expected_heads[pool['prompt']])+');')
            if new_prompts_only:
                statements.append('INSERT INTO association_import_guard SELECT NOT EXISTS('
                    'SELECT 1 FROM prompts WHERE lemma='+prompt+');')
            if expected_pool_reviews is not None:
                previous = expected_pool_reviews[pool['prompt']]
                if previous is None:
                    statements.append('INSERT INTO association_import_guard SELECT NOT EXISTS('
                        'SELECT 1 FROM prompts WHERE lemma='+prompt+');')
                else:
                    statements.append('INSERT INTO association_import_guard SELECT EXISTS('
                        'SELECT 1 FROM prompts WHERE lemma='+prompt+' AND review_id='+literal(previous)+');')
    existing = {r['id'] for r in db.run('SELECT id FROM reviews;', rows=True)}
    for pool in pools:
        review_id = pool['content_sha256']
        if review_id in existing: continue
        review = pool['review']; sense_id = digest([pool['prompt'], pool['sense_description']])
        statements.append(insert('reviews', {'id':review_id, 'reviewer':review['reviewer'],
            'method':review['method'], 'reviewed_at':review['reviewed_at'],
            'directives_sha256':review['directives_sha256'], 'payload_sha256':review_id,
            'decision':'verified', 'human_review':review['human_review'], 'independent_gameplay_qa':False,
            'record_json':json.dumps(pool, ensure_ascii=False)}))
        statements.append('INSERT INTO prompts(lemma,language,familiar_sense,review_id,category_id) VALUES ('+
            ','.join(literal(v) for v in (pool['prompt'],pool['prompt_language'],pool['sense_description'],review_id,pool['category_id']))+
            ') ON CONFLICT(lemma) DO UPDATE SET category_id=excluded.category_id,review_id=excluded.review_id '
            'WHERE prompts.familiar_sense=excluded.familiar_sense;\n')
        # Un ampliamento è una NUOVA revisione dell'intero bacino. Il verbale
        # precedente resta nell'audit; il campionamento legge solo l'ultimo.
        statements.append('DELETE FROM conflicts WHERE sense_id='+literal(sense_id)+';\n')
        statements.append('DELETE FROM group_limits WHERE sense_id='+literal(sense_id)+';\n')
        statements.append('DELETE FROM associations WHERE sense_id='+literal(sense_id)+';\n')
        statements.append('INSERT INTO senses(id,prompt,description,pos,category_id,review_id) VALUES ('+
            ','.join(literal(v) for v in [sense_id,pool['prompt'],pool['sense_description'],pool['pos'],pool.get('category_id'),review_id])+
            ') ON CONFLICT(id) DO UPDATE SET pos=excluded.pos,category_id=excluded.category_id,review_id=excluded.review_id;\n')
        for answer in pool['answers']:
            statements.append(insert('associations', {'sense_id':sense_id, **{k:answer[k] for k in
                ('word','relation','rationale','answer_sense','meaning_group','difficulty','difficulty_basis')}, 'review_id':review_id}))
        for group, maximum in pool['group_limits'].items():
            statements.append(insert('group_limits', {'sense_id':sense_id,'meaning_group':group,'maximum':maximum}))
        for conflict in pool.get('conflicts', []):
            a,b = sorted(conflict['words'])
            statements.append(insert('conflicts', {'sense_id':sense_id,'word_a':a,'word_b':b,'reason':conflict['reason']}))
        for evidence in pool['evidence']:
            statements.append(insert('sources', {'id':evidence['source_id'],'url':evidence['source_url'],
                'license':evidence['license'],'attribution':evidence['attribution'],
                'snapshot_sha256':evidence['snapshot_sha256']}, ignore=True))
            statements.append(insert('evidence', {'review_id':review_id,'source_id':evidence['source_id'],
                **{k:evidence[k] for k in ('url','scope','note')}}, ignore=True))
    statements.append('COMMIT;')
    db.run(''.join(statements))
    return len(pools)


def pool_objects(db):
    """Bacini verificati e decisioni sulle voci, comprese le esclusioni.

    Le attestazioni e gli aggiornamenti integrali restano nel database operativo;
    per conservarli con le decisioni si usa script/inventory_updates.py backup.
    """
    keep = "(name NOT LIKE 'inventory%' OR name IN ('inventory_term_decisions','inventory_decision_history'))"
    if db.schema:
        # Nel DB unico sqlite_schema elenca gli oggetti di tutti gli schemi: quelli di questo sono nel registro.
        rows = db.run("SELECT name FROM zerodb_objects WHERE schema="+literal(db.schema)+
                      " AND type IN ('table','view') AND "+keep+" ORDER BY name;", rows=True)
    else:
        rows = db.run("SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND "+keep+
                      " AND name NOT LIKE 'sqlite%' ORDER BY name;", rows=True)
    return [r['name'] for r in rows]


def export_game_db(db, output=GAME_DB):
    """Ricostruisce `output` (lo schema game) con le sole tabelle di pool_objects della raccolta:
    bacini verificati, verbali, categorie e decisioni sulle voci, con schema, vincoli e viste.
    Sostituzione atomica: un errore lascia il file precedente com'era.

    Nel DB unico, quando la raccolta e la destinazione sono due schemi dello stesso file, la destinazione non è una
    copia: ha una vista per ogni oggetto di pool_objects sugli oggetti della raccolta (unified_db.link_schema), con
    le stesse righe sempre aggiornate."""
    output = Path(output).resolve()
    if output == db.path: raise ValueError('Il database dei bacini deve essere distinto dalla raccolta')
    target = unified_db.schema_of(output) if unified_db.active() else None
    if target and db.schema and target != db.schema:
        linked = unified_db.link_schema(target, db.schema, pool_objects(db))
        return {'output': str(output), 'source': str(db.path), 'pools': len(load_pools(SQLite(output, db.executable))),
                'views_on_source': linked['views']}
    output.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix=output.stem+'.', suffix='.part', dir=output.parent)
    os.close(handle)
    temporary = Path(name); sql = temporary.with_name(temporary.name+'.sql')
    try:
        db.dump(sql, pool_objects(db))
        game = SQLite(temporary, db.executable)
        game.run(sql.read_text(encoding='utf-8'))
        if game.run('PRAGMA integrity_check;', rows=True) != [{'integrity_check': 'ok'}]:
            raise ValueError('Errore di integrità nel database dei bacini')
        if game.run('PRAGMA foreign_key_check;', rows=True):
            raise ValueError('Errore di integrità referenziale nel database dei bacini')
        pools = len(load_pools(game))
        publish_database(temporary,output,db.executable)
        return {'output': str(output), 'source': str(db.path), 'pools': pools}
    finally:
        temporary.unlink(missing_ok=True)
        sql.unlink(missing_ok=True)


def load_pools(db):
    decisions=db.run("SELECT name FROM sqlite_schema WHERE type='table' AND name='inventory_term_decisions';",rows=True)
    exclusion=(" WHERE NOT EXISTS(SELECT 1 FROM inventory_term_decisions d WHERE d.prompt=s.prompt "
               "AND d.decision IN ('DISCARDED','DEFERRED'))" if decisions else '')
    rows = db.run('SELECT r.record_json FROM senses s JOIN reviews r ON r.id=s.review_id '
                  'JOIN prompts p ON p.lemma=s.prompt AND p.familiar_sense=s.description'+exclusion+' ORDER BY s.prompt,s.id;', rows=True)
    return [json.loads(row['record_json']) for row in rows]


def sample_database(db, mode, seed, difficulties=None):
    """Campiona ogni bacino: una parola estratta resta disponibile per gli altri prompt."""
    result = []; pending = []
    for pool in load_pools(db):
        try:
            validate_pool(pool)
            if mode == 'random':
                # Entrambe le cardinalità devono essere fattibili: nessun 8 -> 7 silenzioso.
                sample_pool(pool, 8, seed, difficulties)
                count = 7 + (int(digest([str(seed),pool['prompt'],'count']),16) % 2)
            else: count = int(mode)
            words = sample_pool(pool, count, seed, difficulties)
            result.append({'prompt':pool['prompt'], 'words':words, 'answer_count':count,
                'pool_sha256':pool['content_sha256'], 'sense_description':pool['sense_description'],
                'category_id':pool.get('category_id'), 'approval':False, 'independent_gameplay_qa':False})
        except ValueError as error:
            pending.append({'prompt':pool['prompt'], 'reason':str(error)})
    return {'schema':'sampled-pools-1','seed':str(seed),'mode':mode,
        'difficulty_filter':sorted(difficulties) if difficulties else 'all',
        'rows':result,'pending':pending,'csv_exported':False,'release_approved':False}


def sample_livecade(db, seed, count=None, category_id=None, difficulties=None):
    """Estrae prompt distinti e poi ESATTAMENTE sette risposte dai loro bacini."""
    if count is not None and (type(count) is not int or count<1):
        raise ValueError('Il numero di prompt richiesto deve essere positivo')
    categories=load_categories()
    if category_id is not None and category_id not in categories:raise ValueError('Categoria sconosciuta')
    payload=sample_database(db,'7',seed,difficulties)
    if category_id is not None:
        payload['rows']=[row for row in payload['rows'] if row['category_id']==category_id]
        # Un bacino insufficiente di un'altra categoria non appartiene alla richiesta.
        matching={p['prompt'] for p in load_pools(db) if p['category_id']==category_id}
        payload['pending']=[row for row in payload['pending'] if row['prompt'] in matching]
    rows=payload['rows']
    requested=count if count is not None else len(rows)
    if requested>len(rows):
        raise ValueError(f'Richiesti {requested} prompt distinti, disponibili {len(rows)} bacini verificati estraibili. Ampliare il DB; nessun prompt ripetuto per riempire il lotto.')
    rng=random.Random(digest([str(seed),'livecade-prompt-selection',category_id]))
    rows=sorted(rows,key=lambda r:r['prompt']);rng.shuffle(rows)
    payload.update({'target':'Livecade','answer_count':7,'requested_prompt_count':requested,
                    'available_prompt_count':len(rows),'category_filter':category_id,'rows':rows[:requested]})
    for row in payload['rows']:
        row.update({k:categories[row['category_id']][k] for k in ('category_name','cluster_id','cluster_name')})
    return payload


def export_csv(payload, directory):
    # Il task di produzione usa CSV standard a cinque colonne, senza dipendenze
    # spreadsheet nel progetto. Ogni estrazione resta un candidato per il gioco.
    import csv
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    number = 1
    for path in directory.iterdir():
        match = re.search(r'_(\d{4,})\.(?:csv|json)$', path.name)
        if match: number = max(number,int(match[1])+1)
    stem = f"word_association_it_{len(payload['rows'])}_candidati_{number:04d}"
    path = directory/(stem+'.csv'); report = directory/(stem+'.json')
    with path.open('x', encoding='utf-8', newline='') as stream:
        writer=csv.writer(stream, lineterminator='\n'); writer.writerow(['ref','source','language','prompt','words'])
        for row in payload['rows']: writer.writerow(['','ChatGPT','it',row['prompt'].upper(),'|'.join(row['words'])])
    with report.open('x', encoding='utf-8') as stream:
        json.dump(payload,stream,ensure_ascii=False,indent=2)
    return path


def main(argv=None):
    if hasattr(sys.stdout,'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--db',type=Path,default=DEFAULT_DB)
    ap.add_argument('--sqlite',type=Path)
    sub=ap.add_subparsers(dest='command',required=True)
    sub.add_parser('init')
    imp=sub.add_parser('import-reviewed'); imp.add_argument('file',type=Path)
    sub.add_parser('status')
    dump=sub.add_parser('dump',help="lo schema game: i soli bacini verificati, dalla raccolta")
    dump.add_argument('--output',type=Path,default=GAME_DB,help='Un .sql scrive invece il dump SQL in testo')
    sub.add_parser('register-directives',help='Dopo un ritocco al testo delle direttive che non cambia le regole')
    sample=sub.add_parser('sample'); sample.add_argument('--answers',choices=['7','8','random'],default='7')
    sample.add_argument('--seed',default=None); sample.add_argument('--difficulty',nargs='+',choices=['easy','medium','hard','unrated'])
    sample.add_argument('--output',type=Path,help='Directory CSV oppure percorso del JSON (non sovrascritto)')
    sample.add_argument('--format',choices=['json','csv'],default='json')
    sample.add_argument('--allow-partial',action='store_true',help='Esporta i bacini fattibili e dichiara gli altri nel rapporto')
    live=sub.add_parser('livecade',help='Lista Livecade: prompt distinti casuali e sette risposte per prompt')
    live.add_argument('--count',type=int,help='Numero di prompt distinti; senza limite usa tutti quelli estraibili')
    live.add_argument('--category',dest='category_id',help='ID categoria facoltativo, per esempio 008')
    live.add_argument('--seed');live.add_argument('--difficulty',nargs='+',choices=['easy','medium','hard','unrated'])
    live.add_argument('--output',type=Path,help='Directory CSV oppure percorso del JSON')
    live.add_argument('--format',choices=['json','csv'],default='csv')
    live.add_argument('--allow-partial',action='store_true')
    args=ap.parse_args(argv)
    if args.command=='register-directives':
        print(json.dumps(register_directives(),ensure_ascii=False)); return 0
    db=SQLite(args.db,args.sqlite)
    if args.command=='init': initialize(db); print(db.path)
    elif args.command=='import-reviewed':
        result={'reviewed_pools_processed':import_reviewed(db,args.file)}
        # I bacini verificati (schema game) seguono la raccolta: dopo un'importazione si aggiornano subito.
        if unified_db.same_db(db.path,DEFAULT_DB): result['game_db']=export_game_db(db)
        print(json.dumps(result,ensure_ascii=False))
    else:
        if not unified_db.exists(db.path): raise ValueError('Database assente: eseguire init e import-reviewed')
        if args.command=='dump':
            if args.output.suffix=='.sql': db.dump(args.output,pool_objects(db)); print(args.output)
            else: print(json.dumps(export_game_db(db,args.output),ensure_ascii=False))
        elif args.command=='status':
            counts={name:db.run('SELECT count(*) AS n FROM '+name+';',rows=True)[0]['n']
                for name in ('prompts','senses','associations','sources','reviews','categories')}
            counts['prompts_without_category']=db.run('SELECT count(*) AS n FROM prompts WHERE category_id IS NULL;',rows=True)[0]['n']
            counts['sqlite_version']=db.run('SELECT sqlite_version() AS v;',rows=True)[0]['v']
            counts['integrity_check']=db.run('PRAGMA integrity_check;',rows=True)
            counts['foreign_key_errors']=db.run('PRAGMA foreign_key_check;',rows=True)
            counts['human_reviews']=db.run('SELECT count(*) AS n FROM reviews WHERE human_review=1;',rows=True)[0]['n']
            if db.run("SELECT name FROM sqlite_schema WHERE type='table' AND name='inventory_terms';",rows=True):
                counts['inventory']=db.run('SELECT count(*) AS collected_prompts,sum(is_single_word) AS single_word_candidates '
                    'FROM inventory_terms;',rows=True)[0]
            counts['release_approved']=False
            print(json.dumps(counts,ensure_ascii=False,indent=2))
        elif args.command in ('sample','livecade'):
            seed=args.seed or secrets.token_hex(16)
            payload=(sample_livecade(db,seed,args.count,args.category_id,set(args.difficulty or []))
                if args.command=='livecade' else sample_database(db,args.answers,seed,set(args.difficulty or [])))
            if payload['pending'] and not args.allow_partial:
                print(json.dumps({'error':'Bacini insufficienti: nessun file esportato','pending':payload['pending']},ensure_ascii=False))
                return 2
            if not payload['rows']: raise ValueError('Nessun bacino estraibile: nessun file esportato')
            if args.format=='csv': print(export_csv(payload,args.output or ROOT/'database-exports'))
            else:
                output=args.output or ROOT/'database-exports'/('sample_'+secrets.token_hex(8)+'.json')
                output.parent.mkdir(parents=True,exist_ok=True)
                with output.open('x',encoding='utf-8') as stream: json.dump(payload,stream,ensure_ascii=False,indent=2)
                print(output)
    return 0


if __name__=='__main__':
    try: raise SystemExit(main())
    except (ValueError,RuntimeError,OSError) as error:
        print(str(error),file=sys.stderr); raise SystemExit(1)

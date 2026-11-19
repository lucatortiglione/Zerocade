"""§7: schema SQLite (lexemes + semantic_pair_scores) e vocabolario dalla tabella `parole` del RAW 2.0."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE lexemes(
  lexeme_id INTEGER PRIMARY KEY,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL DEFAULT '',
  sense_id TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'it',
  lexical_validity TEXT NOT NULL,
  source_id TEXT NOT NULL,
  UNIQUE(lemma, pos, sense_id, language)) STRICT;
CREATE TABLE semantic_pair_scores(
  source_lexeme_id INTEGER NOT NULL REFERENCES lexemes(lexeme_id),
  target_lexeme_id INTEGER NOT NULL REFERENCES lexemes(lexeme_id),
  model_version TEXT NOT NULL,
  score REAL,
  embedding_score REAL,
  pmi_svd_score REAL,
  conceptnet_score REAL,
  ppmi_score REAL,
  weight_coverage REAL NOT NULL,
  evidence_json TEXT NOT NULL,
  rank INTEGER NOT NULL,
  PRIMARY KEY(source_lexeme_id, target_lexeme_id, model_version)) STRICT, WITHOUT ROWID;
CREATE TABLE pipeline_meta(name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID;
"""


def load_vocabulary(raw_db, min_iwfs: float | None = None, single_word_only: bool = True):
    """Le parole della tabella `parole` del RAW 2.0 (sola lettura): sono quelle da associare, i candidati del ranking.
    Ritorna [(parola, lexical_validity)] in ordine alfabetico; la validità viene da `normalizzata` ('UNKNOWN' se la parola
    non vi compare): validità e familiarità restano attributi, non filtri. `min_iwfs` (opzionale) tiene solo le parole
    con IWFS sufficiente."""
    con = sqlite3.connect(f'file:{Path(raw_db).as_posix()}?mode=ro', uri=True)
    try:
        sql = ("SELECT p.parola, COALESCE(n.lexical_validity, 'UNKNOWN') FROM parole p "
               'LEFT JOIN normalizzata n ON n.parola = p.parola WHERE 1=1')
        args = []
        if single_word_only:
            sql += ' AND p.is_single_word=1'
        if min_iwfs is not None:
            sql += ' AND n.iwfs>=?'
            args.append(min_iwfs)
        return con.execute(sql + ' ORDER BY p.parola', args).fetchall()
    finally:
        con.close()


def load_queries(db, table='ZeroContext_Segrete'):
    """Parole da associare: la tabella ZeroContext_Segrete di giochi_v2 (sola lettura), in ordine di id."""
    con = sqlite3.connect(f'file:{Path(db).as_posix()}?mode=ro', uri=True)
    try:
        return [r[0] for r in con.execute(f'SELECT parola FROM {table} ORDER BY id')]
    finally:
        con.close()


def export_sqlite(pipeline, path, mode='balanced', top_n=1000, detail_top=20, validity: dict | None = None, source_id='parole',
                  queries=None, progress=None):
    """Scrive in un DB a parte (non in giochi_v2) i top-N delle parole `queries` (default: tutto il vocabolario).
    `rank` è la posizione (1 = più vicina). `evidence_json` è completo per i primi `detail_top`, '{}' oltre (il DB resterebbe enorme).
    I candidati sono le parole della tabella `parole`; le query sono le Segrete. Le query fuori vocabolario sono contate in pipeline_meta."""
    path = Path(path)
    if path.exists():
        path.unlink()
    con = sqlite3.connect(path)
    con.executescript(SCHEMA)
    ids = {}
    for i, lemma in enumerate(pipeline.vocab):
        ids[lemma] = i + 1
    con.executemany('INSERT INTO lexemes(lexeme_id,lemma,lexical_validity,source_id) VALUES (?,?,?,?)',
                    [(i, lemma, (validity or {}).get(lemma, 'UNKNOWN'), source_id) for lemma, i in ids.items()])
    version = f'{mode}:{pipeline.meta.get("build_id", "")}'
    total = 0
    known = [q for q in (queries if queries is not None else pipeline.vocab) if q in ids]
    missing = (len(queries) - len(known)) if queries is not None else 0
    for n, lemma in enumerate(known):
        if progress and n % 1000 == 0:
            progress(n, len(known))
        rows = []
        for rank, r in enumerate(pipeline.query(lemma, mode, top_n)['results'], 1):
            s = r['signals']
            rows.append((ids[lemma], ids[r['lemma']], version, r['score'], s['embedding'], s['pmi_svd'], s['conceptnet'],
                         s['ppmi_direct'], r['weight_coverage'],
                         json.dumps({'evidence': r['evidence'], 'availability': r['availability'], 'confidence': r['confidence']},
                                    ensure_ascii=False) if rank <= detail_top else '{}', rank))
        # una segreta alla volta: con 43.407 segrete non si tengono in memoria decine di milioni di righe
        con.executemany('INSERT INTO semantic_pair_scores VALUES (?,?,?,?,?,?,?,?,?,?,?)', rows)
        total += len(rows)
        if n % 500 == 499:
            con.commit()
    con.executemany('INSERT INTO pipeline_meta VALUES (?,?)',
                    [('model_version', version), ('score_calibrator_version', pipeline.cal.version),
                     ('score_is_calibrated', str(pipeline.cal.calibrated)),
                     ('query_source', 'ZeroContext_Segrete' if queries is not None else 'vocabolario'),
                     ('queries', str(len(known))), ('queries_not_in_vocabulary', str(missing)), ('meta', json.dumps(pipeline.meta, ensure_ascii=False))])
    con.commit()
    con.execute('VACUUM')
    con.close()
    return total

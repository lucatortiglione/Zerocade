"""Lettura dei candidati dall'export della Pipeline B (database/ZeroContext_Associazioni_PipelineB.sqlite3, sola lettura)."""
from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

from valutazione.common import connect_ro

CHUNK = 400   # segrete per interrogazione (il database pesa gigabyte: si legge a gruppi, solo le righe che servono)


@dataclass(frozen=True)
class Candidate:
    word: str
    score: float | None
    emb: float | None
    pmi: float | None
    cn: float | None
    ppmi: float | None
    rank: int
    vec_cos: float | None = None      # coseno con la segreta nei vettori del profilo (riordino/vectors.py)
    vec_rank: int | None = None       # posizione tra i vicini della segreta nei vettori: 1 = il più vicino
    in_export: bool = True            # False per i candidati che l'export non aveva e che vengono dai vettori
    abtt_cos: float | None = None     # coseno con la segreta nei vettori ABTT (riordino/signals.py)
    hub: float | None = None          # genericità del candidato nei vettori originali: coseno medio con i suoi K vicini
    hub_abtt: float | None = None     # idem nei vettori ABTT
    inv_rank: int | None = None       # posizione della segreta nella lista del candidato (se questo è una segreta dell'export), entro un tetto
    pos: str | None = None            # categoria grammaticale del candidato: NOUN, VERB, ADJ, ALTRO
    pos_same: bool | None = None      # stessa categoria della segreta


def read_candidates(export: Path, secrets: list[str]) -> dict[str, list[Candidate]]:
    """Per ogni segreta richiesta, i candidati dell'export nell'ordine del suo rank. Le segrete assenti dall'export non compaiono."""
    with closing(connect_ro(export)) as con:
        version = con.execute("SELECT value FROM pipeline_meta WHERE name = 'model_version'").fetchone()[0]
        id_of: dict[str, int] = {}
        lemma_of: dict[int, str] = {}
        for lexeme_id, lemma in con.execute('SELECT lexeme_id, lemma FROM lexemes'):
            lemma_of[lexeme_id] = lemma
            id_of.setdefault(lemma, lexeme_id)
        found: dict[str, list[Candidate]] = {}
        wanted = [s for s in dict.fromkeys(secrets) if s in id_of]
        for start in range(0, len(wanted), CHUNK):
            chunk = wanted[start:start + CHUNK]
            by_id = {id_of[s]: s for s in chunk}
            marks = ','.join('?' * len(by_id))
            rows = con.execute(
                'SELECT source_lexeme_id, target_lexeme_id, score, embedding_score, pmi_svd_score, conceptnet_score, ppmi_score, rank '
                f'FROM semantic_pair_scores WHERE model_version = ? AND source_lexeme_id IN ({marks}) ORDER BY source_lexeme_id, rank',
                (version, *by_id))
            for source, target, score, emb, pmi, cn, ppmi, rank in rows:
                word = lemma_of.get(target)
                if word:
                    found.setdefault(by_id[source], []).append(Candidate(word, score, emb, pmi, cn, ppmi, rank))
    return found

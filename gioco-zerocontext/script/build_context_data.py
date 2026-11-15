"""Prepara i dati di gioco di ZeroContext: parole segrete, parole giocabili, vettori e collegamenti.

Ingressi:
  .cache/fasttext_it_*.{txt,npy}        da script/fetch_vectors.py (vettori fastText italiani)
  .cache/numberbatch_it_*.{txt,npy}     da script/fetch_numberbatch.py (ConceptNet Numberbatch, italiano)
  zerocontext-it-bank.csv, -meta.csv    banca delle parole segrete (script/build_context_bank.py)
  ../gioco-zeroassociations/resources/frequency_ranks_it.csv  frequenze (wordfreq)
  schema associazioni di database/giochi.sqlite3              i bacini verificati di ZeroAssociazioni
  inventario di database/parole_ita_raw.sqlite3               lemmi e forme flesse attestati

Uscite (le legge il server di Zerocade, senza Python a runtime):
  schema context di database/giochi.sqlite3
    vocab    base per frequenza, banca e inventario attestato, senza i plurali puri (context_vocabulary.pure_plurals):
           le parole giocabili, nell'ordine dei vettori: ogni tentativo in chat è valido solo se è qui
    secrets  le parole che possono essere segrete (fascia base/comune/Livecade)
    links    per ogni parola segreta, le parole che ZeroAssociazioni le associa
    meta     numero di parole, dimensioni, link_boost
  data/vectors.bin  una riga per parola di vocab: DIM interi con segno (int8), già normalizzati, quindi il
                    prodotto scalare ordina come il coseno

Come nasce la classifica di un round. Ogni parola ha due vettori, uno per fonte. Di ognuno si toglie la media e le
prime direzioni principali (--top-pcs: quelle che rendono ogni parola un poco vicina a tutte le altre), poi lo si
porta a lunghezza 1. I due vettori si mettono uno dopo l'altro, pesati, così il prodotto scalare di due righe è la
media pesata dei due coseni (--numberbatch-weight). Una parola che Numberbatch non ha riceve il vettore stimato dal
suo fastText (regressione lineare sulle parole che li hanno entrambi). Infine le parole che ZeroAssociazioni associa
alla parola segreta (in un senso o nell'altro) salgono di --link-boost, in unità di coseno: il gioco lo somma al
prodotto scalare di quelle parole prima di ordinare (meta.link_boost, già nella scala dei vettori).

Uso:  python script/build_context_data.py [--vocab 60000] [--probe spiaggia pizza ...] [--dry-run]
"""
from __future__ import annotations

import argparse
from contextlib import closing
import csv
import hashlib
import json
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "database" / "script"))
import giochi  # noqa: E402
from context_vocabulary import WORD, inventory_vocab, pure_plurals
from hubness import STRENGTH as HUB_STRENGTH, hub_penalties

HERE = Path(__file__).resolve().parent.parent
CACHE = HERE / ".cache"
DATA = HERE / "data"
FREQ = HERE.parent / "gioco-zeroassociations" / "resources" / "frequency_ranks_it.csv"
BANK = HERE / "zerocontext-it-bank.csv"
META = HERE / "zerocontext-it-bank-meta.csv"
SECRET_TIERS = {"livecade", "base", "comune"}


def load_source(name: str) -> tuple[dict[str, int], np.ndarray]:
    """Le parole di una fonte (parola -> riga) e la matrice dei suoi vettori."""
    words = (CACHE / f"{name}_words.txt").read_text(encoding="utf-8").split("\n")
    mat = np.load(CACHE / f"{name}_vectors.npy")
    out: dict[str, int] = {}
    for i, w in enumerate(words):
        if w not in out and WORD.match(w):
            out[w] = i
    return out, mat


def build_vocab(index: dict[str, int], bank: list[str], size: int) -> list[str]:
    """Le parole giocabili: le più frequenti che hanno un vettore fastText, più la banca delle segrete."""
    vocab: list[str] = []
    seen: set[str] = set()

    def add(w: str) -> None:
        if w in index and w not in seen:
            seen.add(w)
            vocab.append(w)

    with FREQ.open(encoding="utf-8", newline="") as fh:
        rows = csv.reader(fh)
        next(rows)
        for lemma, rank in rows:
            if int(rank) > size * 2:
                break
            if WORD.match(lemma) and len(vocab) < size:
                add(lemma)
    for w in bank:  # ogni parola segreta deve essere anche giocabile
        add(w)
    return sorted(vocab)


def clean(vecs: np.ndarray, top_pcs: int) -> np.ndarray:
    """Senza la media e senza le prime direzioni principali ("all-but-the-top"), a lunghezza 1."""
    vecs = vecs.astype(np.float64)
    vecs -= vecs.mean(axis=0)
    if top_pcs > 0:
        _, directions = np.linalg.eigh(vecs.T @ vecs)  # autovalori in ordine crescente
        top = directions[:, -top_pcs:]
        vecs -= (vecs @ top) @ top.T
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    return (vecs / np.where(norms > 0, norms, 1)).astype(np.float32)


def impute(known: np.ndarray, target: np.ndarray, have: np.ndarray, ridge: float = 1.0) -> np.ndarray:
    """I vettori `target` che mancano (have falso), stimati da `known` con una regressione lineare sulle altre righe."""
    x, y = known[have].astype(np.float64), target[have].astype(np.float64)
    xm, ym = x.mean(axis=0), y.mean(axis=0)
    xc = x - xm
    weights = np.linalg.solve(xc.T @ xc + ridge * np.eye(x.shape[1]), xc.T @ (y - ym))
    out = target.astype(np.float64).copy()
    out[~have] = (known[~have].astype(np.float64) - xm) @ weights + ym
    return out


def source_vectors(vocab: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """I vettori grezzi di ogni parola nelle due fonti, e quali parole Numberbatch ha davvero."""
    ft_index, ft_mat = load_source("fasttext_it")
    nb_index, nb_mat = load_source("numberbatch_it")
    ft = ft_mat[[ft_index[w] for w in vocab]].astype(np.float32)
    have = np.array([w in nb_index for w in vocab])
    nb = np.zeros((len(vocab), nb_mat.shape[1]), dtype=np.float32)
    nb[have] = nb_mat[[nb_index[w] for w in vocab if w in nb_index]]
    return ft, impute(ft, nb, have).astype(np.float32), have


def combine(ft: np.ndarray, nb: np.ndarray, nb_weight: float, top_pcs: int) -> np.ndarray:
    """Una riga per parola, lunga 1: il prodotto scalare di due righe è (1-w)·cos fastText + w·cos Numberbatch."""
    parts = []
    if nb_weight < 1:
        parts.append(np.sqrt(1 - nb_weight) * clean(ft, top_pcs))
    if nb_weight > 0:
        parts.append(np.sqrt(nb_weight) * clean(nb, top_pcs))
    return np.hstack(parts)


def association_links(vocab: list[str], secrets: list[str]) -> list[tuple[int, int]]:
    """(indice della segreta, indice della parola associata), dai bacini verificati, nei due sensi."""
    idx = {w: i for i, w in enumerate(vocab)}
    secret = set(secrets)
    links: set[tuple[int, int]] = set()
    for prompt, word in giochi.association_pairs():
        if prompt == word or prompt not in idx or word not in idx:
            continue
        if prompt in secret:
            links.add((idx[prompt], idx[word]))
        if word in secret:
            links.add((idx[word], idx[prompt]))
    return sorted(links)


def quantize(vecs: np.ndarray) -> tuple[np.ndarray, float]:
    """I vettori come int8 e la scala usata: il prodotto scalare di due righe vale circa scala² per il coseno."""
    scale = 127 / np.percentile(np.abs(vecs), 99.99)
    return np.clip(np.rint(vecs * scale), -127, 127).astype(np.int8), float(scale)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--vocab", type=int, default=60_000, help="base per frequenza, a cui si aggiungono banca e inventario attestato")
    ap.add_argument("--numberbatch-weight", type=float, default=0.3, help="peso di Numberbatch nella media dei coseni (0-1)")
    ap.add_argument("--top-pcs", type=int, default=2, help="direzioni principali tolte a ogni fonte")
    ap.add_argument("--link-boost", type=float, default=0.15, help="quanto sale una parola associata, in unità di coseno")
    ap.add_argument("--hub-strength", type=float, default=HUB_STRENGTH, help="forza della penalità di genericità (0 = nessuna)")
    ap.add_argument("--probe", nargs="*", default=["spiaggia", "pizza", "ospedale"])
    ap.add_argument("--dry-run", action="store_true", help="stampa le prove senza scrivere nulla")
    args = ap.parse_args()
    if args.vocab <= 0 or not 0 <= args.numberbatch_weight <= 1 or args.top_pcs < 0:
        ap.error('Vocabolario positivo, peso Numberbatch fra 0 e 1, top-pcs non negativo')

    with BANK.open(encoding="utf-8-sig", newline="") as fh:
        bank = [r["word"] for r in csv.DictReader(fh)]
    with META.open(encoding="utf-8-sig", newline="") as fh:
        tier = {r["word"]: r["tier"] for r in csv.DictReader(fh)}

    index = load_source("fasttext_it")[0]
    base_vocab = build_vocab(index, bank, args.vocab)
    previous_vocab: set[str] = set()
    if giochi.FILE.exists():
        with closing(sqlite3.connect(giochi.FILE.resolve().as_uri()+'?mode=ro', uri=True)) as current:
            if current.execute("SELECT 1 FROM sqlite_schema WHERE name='context__vocab'").fetchone():
                previous_vocab = {w for w, in current.execute('SELECT word FROM context__vocab')}
    print('Selezione delle attestazioni lessicali correnti...', flush=True)
    attested, snapshots = inventory_vocab(index, HERE.parent / 'database/parole_ita_raw.sqlite3')
    vocab = sorted(set(base_vocab) | set(attested) | previous_vocab)
    # I plurali puri restano fuori (15/11/2026): vale il singolare; il plurale della segreta vince comunque.
    plurals = pure_plurals(vocab, HERE.parent / 'database/parole_ita_raw.sqlite3')
    vocab = [w for w in vocab if w not in plurals]
    seen = set(vocab)
    secrets = sorted(w for w in bank if w in seen and tier.get(w) in SECRET_TIERS)

    ft, nb, have = source_vectors(vocab)
    if not np.isfinite(ft).all() or not np.isfinite(nb).all():
        raise ValueError('Vettori non finiti')
    q, scale = quantize(combine(ft, nb, args.numberbatch_weight, args.top_pcs))
    if not np.any(q, axis=1).all():
        raise ValueError('Parole con vettore nullo')
    links = association_links(vocab, secrets)
    boost = int(round(args.link_boost * scale * scale))
    # Penalità di genericità (hubness.py): le parole vicine a tutto scendono in ogni classifica.
    hubs = hub_penalties(q, args.hub_strength)
    print(f"vocab {len(vocab)}  segrete {len(secrets)}  in Numberbatch {int(have.sum())} ({have.mean():.1%})")
    print(f"collegamenti {len(links)} per {len({s for s, _ in links})} segrete  link_boost {boost}  vectors.bin {q.nbytes / 1e6:.1f} MB")

    if not args.dry_run:
        DATA.mkdir(exist_ok=True)
        # Conserva la versione precedente prima di pubblicare DB e vettori allineati.
        backup = CACHE / 'backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup.mkdir(parents=True)
        if giochi.FILE.exists():
            with closing(sqlite3.connect(giochi.FILE)) as source, closing(sqlite3.connect(backup / 'giochi.sqlite3')) as target:
                source.backup(target)
        for name in ('vectors.bin', 'vocab.txt', 'secrets.txt', 'meta.json', 'links.json'):
            if (DATA / name).exists():
                shutil.copy2(DATA / name, backup / name)
        (DATA / "vectors.bin.part").write_bytes(q.tobytes())
        # Le parole (nell'ordine dei vettori), le segrete e i collegamenti vanno nel DB dei giochi, schema context
        # (database/giochi.sqlite3); i vettori restano in data/vectors.bin.
        meta = {"words": len(vocab), "dim": int(q.shape[1]), "secrets": len(secrets), "links": len(links), "link_boost": boost, "hub_strength": args.hub_strength}
        giochi.write_context(vocab, secrets, meta, links, hubs.tolist())
        (DATA / 'vectors.bin.part').replace(DATA / 'vectors.bin')
        (DATA / 'vocab.txt').write_text('\n'.join(vocab)+'\n', encoding='utf-8', newline='\n')
        (DATA / 'secrets.txt').write_text('\n'.join(secrets)+'\n', encoding='utf-8', newline='\n')
        (DATA / 'meta.json').write_text(json.dumps(meta, indent=2)+'\n', encoding='utf-8')
        linked_export: dict[str, list[int]] = {}
        for s, w in links:
            linked_export.setdefault(str(s), []).append(w)
        (DATA / 'links.json').write_text(json.dumps({'boost': boost, 'links': linked_export, 'hubs': hubs.tolist()})+'\n', encoding='utf-8')
        report = {'updated_at': datetime.now(timezone.utc).isoformat(),
                  'previous_words': len(previous_vocab), 'words': len(vocab),
                  'added': len(set(vocab)-previous_vocab), 'removed': len(previous_vocab-set(vocab)),
                  'secrets': len(secrets), 'dim': int(q.shape[1]),
                  'frequency_limit': args.vocab, 'attested_words': len(attested), 'excluded_pure_plurals': len(plurals),
                  'lexical_snapshots': snapshots,
                  'policy': 'Vocabolario per frequenza e banca, più lemmi e forme flesse con vettore: '
                            'Morph-it!/Flex_it, UniMorph o NVdB; altrimenti due famiglie lessicali indipendenti.',
                  'vocab_sha256': hashlib.sha256(('\n'.join(vocab)+'\n').encode()).hexdigest(),
                  'vectors_sha256': hashlib.sha256(q.tobytes()).hexdigest()}
        (HERE / 'reports').mkdir(exist_ok=True)
        (HERE / 'reports/vocabulary_update.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
        print(f"Pubblicate {len(vocab)} parole (+{report['added']}, -{report['removed']}); backup {backup}", flush=True)

    qf = q.astype(np.float32)
    idx = {w: i for i, w in enumerate(vocab)}
    linked: dict[int, list[int]] = {}
    for s, w in links:
        linked.setdefault(s, []).append(w)
    for probe in args.probe:
        if probe not in idx:
            print(probe, "non in vocab")
            continue
        sims = qf @ qf[idx[probe]]
        mine = linked.get(idx[probe], [])
        sims[mine] += boost
        sims[idx[probe]] = np.inf
        top = np.argsort(-sims)[1:21]
        # Con * le parole salite per un collegamento di ZeroAssociazioni.
        print(probe, "->", ", ".join(vocab[i] + ("*" if i in mine else "") for i in top))


if __name__ == "__main__":
    main()

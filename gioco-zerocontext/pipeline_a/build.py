"""CLI della Pipeline A: build (tutti i segnali), query, export.

  python -m pipeline_a.build build  --raw-db database/parole_ita_raw_2.0.sqlite3 --corpus corpus.txt --conceptnet assertions.csv.gz
  python -m pipeline_a.build query  mare --mode association
  python -m pipeline_a.build rank <segreta> <parola>   # posizione su tutto il vocabolario
  python -m pipeline_a.build export --db database/giochi_v2.sqlite3 --out database/ZeroContext_Associazioni_PipelineA.sqlite3

Le parole da associare (i candidati) sono quelle della tabella `parole` del RAW 2.0; le parole a cui associare (export)
sono quelle di `ZeroContext_Segrete` in giochi_v2. Il corpus (un documento per riga, o una cartella di
.txt) e il dump ConceptNet vanno forniti: nessuna licenza è presupposta. Senza di loro i segnali D/C/G risultano `missing`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import sys
from pathlib import Path

import numpy as np
from scipy import sparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent / 'script'))

from pipeline_a import VERSION  # noqa: E402
from pipeline_a.calibration import Calibrator  # noqa: E402
from pipeline_a.config import SIGNALS, Config  # noqa: E402
from pipeline_a.conceptnet import Graph, load_graph  # noqa: E402
from pipeline_a.cooccurrence import count_cooccurrences, ppmi, prune, sppmi  # noqa: E402
from pipeline_a.distributional import svd_vectors  # noqa: E402
from pipeline_a.embeddings import encode_bge_m3  # noqa: E402
from pipeline_a.ranker import Pipeline  # noqa: E402
from pipeline_a.store import export_sqlite, load_queries, load_vocabulary  # noqa: E402

TOKEN = re.compile(r'[a-zàèéìòù]+')
BACKENDS = {  # backend E → (cartella dei segnali, DB di export, model_id, dimensione)
    'bge-m3': ('pipeline_a', 'ZeroContext_Associazioni_PipelineA.sqlite3', 'bge-m3-pmi-svd-conceptnet-ppmi', 1024),
    'fasttext': ('pipeline_b', 'ZeroContext_Associazioni_PipelineB.sqlite3', 'fasttext-pmi-svd-conceptnet-ppmi', 300)}
FASTTEXT_MODEL = HERE.parent / '.cache' / 'cc.it.300.bin'   # facebook/fasttext-it-vectors, revisione verificata da context_subword


def default_out(backend):
    return HERE.parent / '.cache' / BACKENDS[backend][0]
DEFAULT_GIOCHI = HERE.parent.parent / 'database' / 'giochi_v2.sqlite3'
INPUT = HERE.parent / '.cache' / 'pipeline_a_input'   # corpus/ e conceptnet-assertions.csv(.gz), forniti dall'utente
DEFAULT_RAW = HERE.parent.parent / 'database' / 'parole_ita_raw_2.0.sqlite3'


def sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_documents(path, lemmas=None, stop=frozenset()):
    """Un documento per riga; una cartella è letta file per file (.txt). Lemmatizza con Morph-it (analisi univoche) se dato."""
    path = Path(path)
    files = sorted(path.rglob('*.txt')) if path.is_dir() else [path]
    for file in files:
        with file.open(encoding='utf-8') as f:
            for line in f:
                toks = TOKEN.findall(line.lower())
                yield [lemmas.get(t, t) for t in toks] if lemmas else toks


def calibration_sample(pipe_args, n_queries: int, seed: int):
    """Coppie fisse (query casuali del vocabolario × loro candidati) su cui stimare gli ECDF dei segnali (§6.1)."""
    pipe = Pipeline(*pipe_args)
    rng = np.random.default_rng(seed)
    queries = rng.choice(len(pipe.vocab), size=min(n_queries, len(pipe.vocab)), replace=False)
    samples = {s: [] for s in SIGNALS}
    for i in queries:
        cands, _ = pipe.candidates(int(i), pipe.config.top_k)
        if not len(cands):
            continue
        raw, _ = pipe.raw_signals(int(i), cands)
        for s in SIGNALS:
            samples[s].extend(raw[s][~np.isnan(raw[s])].tolist())
    return {s: np.array(v) for s, v in samples.items()}


def build(args):
    backend = args.backend
    args.out = args.out or default_out(backend)
    cfg = Config(window=args.window, svd_dim=args.svd_dim, seed=args.seed, bge_representation=args.representation,
                 min_pair_count=args.min_pair_count, min_target_count=args.min_target_count)
    rows = load_vocabulary(args.raw_db, args.min_iwfs)
    vocab = [w for w, _ in rows]
    validity = dict(rows)
    index = {w: i for i, w in enumerate(vocab)}
    n = len(vocab)
    print(f'vocabolario: {n} parole singole dalla tabella parole', flush=True)
    meta = {'pipeline_version': VERSION, 'model_id': BACKENDS[args.backend][2], 'backend': args.backend, 'raw_db': str(args.raw_db), 'vocab_table': 'parole', 'vocab_sha256': hashlib.sha256('\n'.join(vocab).encode()).hexdigest(),
            'python': platform.python_version(), 'signals_built': []}

    # E — BGE-M3
    if args.embeddings:
        emb = np.load(args.embeddings).astype(np.float32)
        assert emb.shape[0] == n, 'le righe di --embeddings devono seguire il vocabolario'
        meta['embedding'] = {'source': str(args.embeddings)}
    elif args.skip_embedding:
        emb = np.zeros((n, BACKENDS[backend][3]), np.float32)
    elif backend == 'fasttext':
        from pipeline_a.embeddings import encode_fasttext
        emb, info, oov = encode_fasttext(vocab, FASTTEXT_MODEL)
        meta['embedding'] = info
        meta['oov_subword_only'] = oov
    else:
        local = INPUT / 'bge-m3'
        model = str(local) if (local / 'config.json').exists() else cfg.bge_model
        emb, info = encode_bge_m3(vocab, cfg.bge_representation, model, max_length=cfg.bge_max_length, batch_size=args.batch_size)
        rev = INPUT / 'bge-m3-revision.txt'
        info['model_revision'] = rev.read_text().strip() if rev.exists() else 'unknown'
        meta['embedding'] = info
    if emb.any():
        meta['signals_built'].append('embedding')

    # D + C — corpus
    if args.corpus:
        lemmas = None
        if args.morphit:
            from context_lsa import lemma_map
            lemmas = lemma_map(args.morphit)
            meta['morphit_sha256'] = sha256(args.morphit)
        stop = frozenset(w.strip() for w in Path(args.stopwords).read_text(encoding='utf-8').split()) if args.stopwords else frozenset()
        X, targets = count_cooccurrences(read_documents(args.corpus, lemmas), index, cfg.window, stop)
        X, ok = prune(X, targets, cfg.min_pair_count, cfg.min_target_count)
        svd = svd_vectors(sppmi(X, cfg.k_shift, cfg.context_smoothing), cfg.svd_dim, cfg.svd_power, cfg.seed)
        P = ppmi(X, cfg.context_smoothing)
        meta['corpus'] = {'path': str(args.corpus), 'target_tokens': int(targets.sum()), 'targets_kept': int(ok.sum()),
                          'pairs_kept': int(X.nnz)}
        meta['signals_built'] += ['pmi_svd', 'ppmi_direct']
    else:
        svd, P = np.zeros((n, 1), np.float32), sparse.csr_matrix((n, n))

    # G — ConceptNet
    if args.conceptnet:
        edges, dropped = load_graph(args.conceptnet, set(vocab))
        graph = Graph(edges)
        meta['conceptnet'] = {'sha256': sha256(args.conceptnet), 'edges': len(edges), 'dropped': dropped}
        meta['signals_built'].append('conceptnet')
    else:
        graph = Graph({})

    pipe_args = (vocab, emb, svd, P, graph, Calibrator({s: np.array([0.0, 1.0]) for s in SIGNALS}, 'tmp', False), cfg, meta)
    samples = calibration_sample(pipe_args, args.calibration_queries, cfg.seed)
    # Gli ECDF sono stimati su un campione fisso di coppie candidate, NON su coppie annotate: `calibrated` resta False
    # finché non si fornisce un insieme annotato (§6.1, §11.1).
    meta['build_id'] = hashlib.sha256((meta['vocab_sha256'] + json.dumps(cfg.as_dict(), sort_keys=True)).encode()).hexdigest()[:12]
    cal = Calibrator(samples, f'ecdf-sample-{meta["build_id"]}', calibrated=False)
    pipe = Pipeline(vocab, emb, svd, P, graph, cal, cfg, meta)
    pipe.save(args.out)
    print(f'salvato in {args.out}; segnali: {meta["signals_built"]}')


def run_export(args):
    out = args.out or HERE.parent.parent / 'database' / BACKENDS[args.backend][1]
    queries = load_queries(args.db)
    n = export_sqlite(Pipeline.load(args.dir), out, args.mode, args.top, queries=queries,
                      progress=lambda i, t: print(f'{i}/{t}', flush=True))
    print(n, 'coppie scritte in', out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    b = sub.add_parser('build')
    b.add_argument('--raw-db', type=Path, default=DEFAULT_RAW)
    b.add_argument('--out', type=Path, default=None)
    b.add_argument('--min-iwfs', type=float, default=None)
    b.add_argument('--corpus', type=Path, default=INPUT / 'corpus' if (INPUT / 'corpus').exists() else None)
    b.add_argument('--morphit', type=Path, default=HERE.parent / '.cache' / 'morphit_048.txt')
    b.add_argument('--stopwords', type=Path)
    b.add_argument('--conceptnet', type=Path, default=next(iter(sorted(INPUT.glob('conceptnet-assertions.csv*'))), None))
    b.add_argument('--embeddings', type=Path, help='.npy già calcolato, righe nell\'ordine del vocabolario')
    b.add_argument('--batch-size', type=int, default=64)
    b.add_argument('--skip-embedding', action='store_true')
    b.add_argument('--representation', choices=['A', 'B'], default='A')
    b.add_argument('--window', type=int, default=5)
    b.add_argument('--svd-dim', type=int, default=256)
    b.add_argument('--min-pair-count', type=int, default=5)
    b.add_argument('--min-target-count', type=int, default=20)
    b.add_argument('--calibration-queries', type=int, default=500)
    b.add_argument('--seed', type=int, default=0)
    b.add_argument('--export-db', type=Path, default=None,
                   help='giochi_v2: a build finita esporta subito i top N per le parole di ZeroContext_Segrete')
    b.add_argument('--top', type=int, default=1000, help='con --export-db: quanti associati salvare per segreta')
    q = sub.add_parser('query')
    q.add_argument('lemma')
    q.add_argument('--dir', type=Path, default=None)
    q.add_argument('--mode', default='balanced', choices=['balanced', 'similarity', 'association'])
    q.add_argument('--top', type=int, default=20)
    r = sub.add_parser('rank', help='posizione di una parola nella classifica completa di una segreta')
    r.add_argument('secret')
    r.add_argument('word', nargs='?')
    r.add_argument('--dir', type=Path, default=None)
    r.add_argument('--mode', default='balanced', choices=['balanced', 'similarity', 'association'])
    e = sub.add_parser('export')
    e.add_argument('--dir', type=Path, default=None)
    e.add_argument('--out', type=Path, default=None)
    e.add_argument('--db', type=Path, default=DEFAULT_GIOCHI, help='giochi_v2: la tabella ZeroContext_Segrete dà le parole da associare')
    e.add_argument('--mode', default='balanced')
    e.add_argument('--top', type=int, default=1000)
    for p in (b, q, e, r):
        p.add_argument('--backend', choices=list(BACKENDS), default='bge-m3')
    args = ap.parse_args(argv)
    if args.cmd != 'build':
        args.dir = args.dir or default_out(args.backend)
    if args.cmd == 'build':
        build(args)
        if args.export_db:
            run_export(argparse.Namespace(dir=args.out or default_out(args.backend), out=None, db=args.export_db,
                                          mode='balanced', top=args.top, backend=args.backend))
    elif args.cmd == 'rank':
        pipe = Pipeline.load(args.dir)
        print(json.dumps(pipe.rank_of(args.secret, args.word, args.mode) if args.word else
                         {'secret': args.secret, 'of': int((pipe.ranks(args.secret, args.mode) > 0).sum())}, ensure_ascii=False))
    elif args.cmd == 'query':
        print(json.dumps(Pipeline.load(args.dir).query(args.lemma, args.mode, args.top), ensure_ascii=False, indent=1))
    else:
        run_export(args)

if __name__ == '__main__':
    main()

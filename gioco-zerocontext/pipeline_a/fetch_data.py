"""Scarica e prepara i dati esterni della Pipeline A in gioco-zerocontext/.cache/pipeline_a_input/ (ignorata da Git).

  conceptnet-assertions.csv.gz  solo le asserzioni con entrambi i nodi /c/it/ (da conceptnet-assertions-5.7.0, CC BY-SA 4.0)
  corpus/wikipedia_it_N.txt     Wikipedia italiana (wikimedia/wikipedia 20231101.it, CC BY-SA 4.0 / GFDL), un articolo per riga
  bge-m3/                       BAAI/bge-m3 (MIT), scaricato dal Hub con revisione registrata in bge-m3-revision.txt

Uso:  python pipeline_a/fetch_data.py [--shards 4] [--skip-bge]
Riprende i download interrotti; i file già pronti non vengono rifatti.
"""
from __future__ import annotations

import argparse
import gzip
import re
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
INPUT = HERE / '.cache' / 'pipeline_a_input'
RAW = INPUT / 'raw'
CONCEPTNET_URL = 'https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz'
WIKI_URL = 'https://huggingface.co/datasets/wikimedia/wikipedia/resolve/main/20231101.it/train-{n:05d}-of-00010.parquet'
BGE_REVISION = '5617a9f61b028005a4858fdac845db406aefb181'  # BAAI/bge-m3 al 18/11/2026


def download(url: str, dest: Path):
    """Scarica con ripresa (Range). Un file con `.done` accanto è considerato completo."""
    done = dest.with_name(dest.name + '.done')
    if done.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    have = dest.stat().st_size if dest.exists() else 0
    req = urllib.request.Request(url, headers={'Range': f'bytes={have}-'} if have else {})
    try:
        resp = urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        if e.code != 416:   # 416: già completo
            raise
    else:
        with resp, dest.open('ab' if have and resp.status == 206 else 'wb') as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
    done.write_text('ok')


def filter_conceptnet(src: Path, dest: Path):
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + '.part')
    kept = 0
    with gzip.open(src, 'rt', encoding='utf-8') as f, gzip.open(tmp, 'wt', encoding='utf-8', newline='') as out:
        for line in f:
            cols = line.split('\t', 4)
            if len(cols) == 5 and cols[2].startswith('/c/it/') and cols[3].startswith('/c/it/'):
                out.write(line)
                kept += 1
    tmp.replace(dest)
    print(f'ConceptNet: {kept} asserzioni it-it', flush=True)


def wiki_to_text(parquet: Path, dest: Path):
    if dest.exists():
        return
    import pyarrow.parquet as pq
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + '.part')
    n = 0
    with tmp.open('w', encoding='utf-8') as out:
        for batch in pq.ParquetFile(parquet).iter_batches(columns=['text'], batch_size=2000):
            for text in batch.column('text').to_pylist():
                out.write(re.sub(r'\s+', ' ', text).strip() + '\n')
                n += 1
    tmp.replace(dest)
    print(f'{dest.name}: {n} articoli', flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--shards', type=int, default=4, help='blocchi di Wikipedia italiana (su 10)')
    ap.add_argument('--skip-bge', action='store_true')
    args = ap.parse_args()
    cn = RAW / 'conceptnet-assertions-5.7.0.csv.gz'
    download(CONCEPTNET_URL, cn)
    filter_conceptnet(cn, INPUT / 'conceptnet-assertions.csv.gz')
    for n in range(args.shards):
        pq_file = RAW / f'wiki-it-{n}.parquet'
        download(WIKI_URL.format(n=n), pq_file)
        wiki_to_text(pq_file, INPUT / 'corpus' / f'wikipedia_it_{n}.txt')
    if not args.skip_bge:
        from huggingface_hub import snapshot_download
        path = snapshot_download('BAAI/bge-m3', revision=BGE_REVISION, local_dir=INPUT / 'bge-m3',
                                 allow_patterns=['*.json', 'pytorch_model.bin', 'sentencepiece.bpe.model', 'tokenizer*', '*.pt', 'modules.json'])
        (INPUT / 'bge-m3-revision.txt').write_text(BGE_REVISION + '\n')
        print('BGE-M3:', path)


if __name__ == '__main__':
    main()

"""fastText ufficiale: matrice di input completa, dizionario e sottoparole UTF-8."""
from __future__ import annotations

import struct
import urllib.request
from pathlib import Path
import numpy as np
from context_semantic_sources import sha

MODEL_REVISION = 'fa60a212cbd534be4af4a3d474e0c47fe3829c46'
MODEL_SHA = '222ec7ddd99c73c72d0d3b8b76aad6a90dba169b26d0ac28ab6b890fc42dc99f'
MODEL_SIZE = 7238392881
MODEL_URL = f'https://huggingface.co/facebook/fasttext-it-vectors/resolve/{MODEL_REVISION}/model.bin?download=true'


def acquire_model(path):
    path = Path(path)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        part = path.with_suffix('.bin.part')
        start = part.stat().st_size if part.exists() else 0
        request = urllib.request.Request(MODEL_URL, headers={'Range': f'bytes={start}-'} if start else {})
        with urllib.request.urlopen(request, timeout=120) as response:
            if start and response.status != 206:
                raise ValueError('Il server non consente di riprendere il modello FastText')
            with part.open('ab' if start else 'wb') as out:
                while block := response.read(8 << 20):
                    out.write(block)
        if part.stat().st_size != MODEL_SIZE or sha(part) != MODEL_SHA:
            raise ValueError('Download FastText non integro')
        part.replace(path)
    if path.stat().st_size != MODEL_SIZE or sha(path) != MODEL_SHA:
        raise ValueError('Modello FastText diverso dalla revisione verificata')
    return path


def fnv1a(value):
    # dictionary.cc usa int8_t: i byte UTF-8 >=128 vengono estesi con segno.
    h = 2166136261
    for b in value:
        h = ((h ^ (b if b < 128 else b - 256)) * 16777619) & 0xffffffff
    return h


def ngrams(word, minn, maxn, bucket):
    value = ('<' + word + '>').encode('utf-8')
    result = []
    for i, b in enumerate(value):
        if b & 0xc0 == 0x80:
            continue
        j, n = i, 1
        while j < len(value) and n <= maxn:
            j += 1
            while j < len(value) and value[j] & 0xc0 == 0x80:
                j += 1
            if n >= minn and not (n == 1 and (i == 0 or j == len(value))):
                result.append(fnv1a(value[i:j]) % bucket)
            n += 1
    return result


class SubwordModel:
    def __init__(self, path, wanted):
        self.path = Path(path)
        wanted = set(wanted)
        self.ids = {}
        with self.path.open('rb') as stream:
            if struct.unpack('<ii', stream.read(8)) != (793712314, 12):
                raise ValueError('Formato FastText non supportato')
            args = struct.unpack('<12id', stream.read(56))
            self.dim, self.bucket, self.minn, self.maxn = args[0], args[8], args[9], args[10]
            size, self.nwords, labels, _, prune = struct.unpack('<iiiqq', stream.read(28))
            if labels or size != self.nwords or prune != -1 or self.dim != 300 or self.bucket <= 0:
                raise ValueError('Dizionario FastText quantizzato/pruned o supervisionato non supportato')
            # BufferedReader evita milioni di syscall per i terminatori NUL.
            for i in range(size):
                word = bytearray()
                while (b := stream.read(1)) != b'\0':
                    if not b:
                        raise ValueError('Dizionario FastText troncato')
                    word.extend(b)
                stream.read(9)
                text = word.decode('utf-8', 'replace')
                if text in wanted:
                    self.ids[text] = i
            if stream.read(1) != b'\0':
                raise ValueError('Matrice FastText quantizzata non supportata')
            rows, dim = struct.unpack('<qq', stream.read(16))
            if rows != self.nwords + self.bucket or dim != self.dim:
                raise ValueError('Dimensioni FastText inattese')
            self.matrix = np.memmap(self.path, dtype='<f4', mode='r', offset=stream.tell(), shape=(rows, dim))

    def vector(self, word):
        ids = ([self.ids[word]] if word in self.ids else [])
        ids += [self.nwords + n for n in ngrams(word, self.minn, self.maxn, self.bucket)]
        if not ids:
            raise ValueError(f'FastText non produce sottoparole per {word}')
        return np.asarray(self.matrix[ids], dtype=np.float32).mean(axis=0)

    def encode(self, words):
        out = np.empty((len(words), self.dim), dtype=np.float32)
        for i, word in enumerate(words):
            out[i] = self.vector(word)
            if i % 10000 == 0:
                print(f'FastText subword: {i}/{len(words)}', flush=True)
        return out


def unit_rows(rows):
    rows = np.asarray(rows, dtype=np.float32)
    norms = np.linalg.norm(rows, axis=1, keepdims=True)
    if not np.isfinite(rows).all() or np.any(norms < 1e-12):
        raise ValueError('Vettori nulli o non finiti')
    return np.ascontiguousarray(rows / norms, dtype='<f4')

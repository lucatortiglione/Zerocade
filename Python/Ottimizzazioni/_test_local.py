"""Test offline senza scaricare modelli, su embeddings artificiali.
Eseguire con: python _test_local.py
"""
import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent


def artifact(folder, words, matrix):
    folder.mkdir(parents=True)
    matrix = np.asarray(matrix, dtype=np.float32)
    matrix /= np.maximum(np.linalg.norm(matrix, axis=1, keepdims=True), 1e-12)
    np.save(folder / 'embeddings.npy', matrix)
    with (folder / 'vocab_index.csv').open('w', encoding='utf8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['matrix_index', 'word', 'in_context__vocab', 'in_context__secrets',
                         'vocab_source_ids_json', 'secrets_source_ids_json'])
        for i,w in enumerate(words):
            writer.writerow([i,w,1,int(int(w.replace('parola','')) % 10==0),f'[{i}]','[]'])


def call(script, *args):
    p = subprocess.run([sys.executable, str(HERE / script), *map(str, args)],
                       capture_output=True, text=True)
    assert p.returncode == 0, f'{script}: {p.stdout}\n{p.stderr}'
    print(f'OK {script}: {p.stdout.strip()[-220:]}')


def main():
    rng = np.random.default_rng(42)
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        words = [f'parola{i}' for i in range(150)]
        a = rng.normal(size=(150, 16)).astype(np.float32)
        b = rng.normal(size=(150, 12)).astype(np.float32)
        artifact(root / 'bge', words, a)
        artifact(root / 'euro', words[::-1], b[::-1])
        with (root / 'pairs.csv').open('w', encoding='utf8', newline='') as f:
            f.write('word1,word2,score\nparola0,parola1,0.2\nparola0,parola2,0.8\nparola3,parola4,0.5\nparola2,parola1,0.1\n')
        call('01_abtt_bge.py', '--input', root/'bge', '--out',root/'abtt','--remove','3',
             '--fit-samples','120','--pairs-csv',root/'pairs.csv','--target','parola0')
        call('02_whitening_pca_bge.py','--input',root/'bge','--out',root/'pca',
             '--dims','8','--alpha','0.5','--fit-samples','120')
        call('03_ensemble_bge_eurodense.py','--bge',root/'bge','--euro',root/'euro',
             '--out',root/'ensemble','--weight-bge','0.6','--pairs-csv',root/'pairs.csv')
        x = np.load(root/'ensemble'/'embeddings.npy')
        assert x.shape == (150,28)
        aa = np.load(root/'bge'/'embeddings.npy')
        bb = np.load(root/'euro'/'embeddings.npy')[::-1]
        i,j = 3,5
        expected = 0.6 * (aa[i]@aa[j]) + 0.4 * (bb[i]@bb[j])
        assert np.isclose(x[i]@x[j],expected,atol=1e-6)
        assert np.allclose(np.linalg.norm(x,axis=1),1,atol=1e-6)
        assert np.allclose(np.linalg.norm(np.load(root/'abtt'/'embeddings.npy'),axis=1),1,atol=1e-6)
        assert np.load(root/'pca'/'embeddings.npy').shape == (150,8)
        from zc_bge_finetune_common import read_supervision, pair_keys
        (root/'train.csv').write_text('sentence1,sentence2,score\na,b,5\nc,d,0\ne,f,2\n',encoding='utf8')
        train=read_supervision(root/'train.csv')
        assert train[0][-1] == 1 and len(pair_keys(train)) == 3
        print('TUTTI I TEST OFFLINE SUPERATI')

if __name__ == '__main__':
    main()

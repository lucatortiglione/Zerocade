"""Criteri lessicali e geometrici della specifica semantica. Nessun accesso in scrittura ai DB."""
from __future__ import annotations

from collections import defaultdict
import math
import re
import urllib.request
import zipfile
import numpy as np
from context_subword import unit_rows
from context_semantic_sources import sha

NVDB_URL = 'https://raw.githubusercontent.com/pettarin/nvdb/b5fb7f8d916a426934bcd20adc84bf97ab5899f6/20170108.nvdb.pdf'
NVDB_SHA = 'eef743fbc8a71d5588f6aa746501e7b5bfba624c5ce4c0c01a6f6bdd83ed5d44'
LEXICONS = {
    'wn-data-ita.tab': ('https://raw.githubusercontent.com/omwn/omw-data/406bf83b3c507a3d1f26e88252d5d66893fd36bf/wns/ita/wn-data-ita.tab',
                        '251ac0097ef81a7ed0d283f6852953106a37dbb8c1b9f93d87079641c271eafa'),
    'wordnet.zip': ('https://raw.githubusercontent.com/nltk/nltk_data/550b6625bcef1f2abff2ff770a5a0d272c9c6b2a/packages/corpora/wordnet.zip',
                    'cbda5ea6eef7f36a97a43d4a75f85e07fccbb4f23657d27b4ccbc93e2646ab59')}
SUFFIXES = ('ite', 'osi', 'asi', 'ato', 'uro', 'morfismo', 'ectomia', 'terapia', 'metria', 'scopia', 'fagia', 'logia')


def aggregate_zipf(forms, frequency):
    values = [frequency(f) for f in set(forms)]
    values = [v for v in values if v > 0]  # wordfreq 0 indica assenza, non una frequenza osservata.
    if not values:
        return 0.0
    highest = max(values)
    return highest + math.log10(sum(10 ** (v - highest) for v in values))


def nvdb_classes(cache):
    import pymupdf
    path = cache / '20170108.nvdb.pdf'
    if not path.exists():
        urllib.request.urlretrieve(NVDB_URL, path)
    if sha(path) != NVDB_SHA:
        raise ValueError('PDF NVdB diverso dalla revisione verificata')
    text, styles = '', []
    with pymupdf.open(path) as document:
        for page in document:
            spans = [s for b in page.get_text('dict')['blocks'] if 'lines' in b for line in b['lines'] for s in line['spans']]
            for s in spans:
                if s['bbox'][1] < 250 and page.number == 0 or s['bbox'][1] < 40 or s['bbox'][1] > 805:
                    continue
                value = s['text']
                if text.endswith(('\u00ad', '-')):
                    text, styles = text[:-1], styles[:-1]
                elif text and not text.endswith(' '):
                    text += ' '; styles.append('')
                text += value
                styles.extend([s['font']] * len(value))
    classes = {}
    for match in re.finditer(r'\b([a-zàèéìòù]+)\s+(?=(?:s\.[mf]|v\.|agg\.|avv\.|prep\.|pron\.|inter\.|cong\.|art\.))', text):
        font = styles[match.start(1)]
        tier = 'FO' if 'Bold' in font else 'AD' if 'Italic' in font else 'AU'
        word = match[1]
        # Un lemma con un senso fondamentale resta escluso dai nuovi target.
        if classes.get(word) != 'FO':
            classes[word] = tier
    if classes.get('casa') != 'FO' or classes.get('abbaiare') != 'AD' or len(classes) < 5000:
        raise ValueError('Estrazione delle fasce NVdB non verificata')
    return classes, {'url': NVDB_URL, 'sha256': sha(path), 'classes': dict((t, sum(v == t for v in classes.values())) for t in ('FO', 'AU', 'AD')),
                     'method': 'fonti PDF: grassetto FO, corsivo AD, tondo AU; omografi FO prioritari'}


def lexical_graph(words, cache):
    index = {w: i for i, w in enumerate(words)}
    paths_by_name = {}
    for name, (url, expected) in LEXICONS.items():
        paths = sorted(cache.rglob(name))
        if not paths:
            destination = cache / 'semantic-sources' / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(destination.suffix + '.part')
            urllib.request.urlretrieve(url, temporary)
            if sha(temporary) != expected:
                raise ValueError(f'Fonte lessicale non integra: {name}')
            temporary.replace(destination)
            paths = [destination]
        if sha(paths[0]) != expected:
            raise ValueError(f'Fonte lessicale diversa dalla revisione verificata: {name}')
        paths_by_name[name] = paths[0]
    path = paths_by_name['wn-data-ita.tab']
    groups = defaultdict(set)
    for line in path.read_text(encoding='utf-8').splitlines():
        fields = line.split('\t')
        if len(fields) == 3 and fields[1].endswith(':lemma') and fields[2] in index:
            groups[fields[0]].add(index[fields[2]])
    synonyms, antonyms = set(), set()
    for group in groups.values():
        for a in group:
            for b in group:
                if a < b:
                    synonyms.add((a, b))
    wordnet = paths_by_name['wordnet.zip']
    with zipfile.ZipFile(wordnet) as archive:
        for name in archive.namelist():
            if name.rsplit('/', 1)[-1] not in {'data.noun', 'data.verb', 'data.adj', 'data.adv'}:
                continue
            for line in archive.read(name).decode('utf-8').splitlines():
                if not line or not line[0].isdigit():
                    continue
                f = line.split('|', 1)[0].split()
                pos = 'a' if f[2] == 's' else f[2]
                source = groups.get(f'{f[0]}-{pos}', ())
                at = 4 + 2 * int(f[3], 16)
                for j in range(int(f[at])):
                    pointer, offset, target_pos, _ = f[at + 1 + 4*j:at + 5 + 4*j]
                    if pointer == '!':
                        target = groups.get(f'{offset}-{target_pos}', ())
                        antonyms.update((min(a, b), max(a, b)) for a in source for b in target if a != b)
    synonyms.difference_update(antonyms)
    return sorted(synonyms), sorted(antonyms), {'omw_sha256': sha(path), 'wordnet_sha256': sha(wordnet),
        'sources': {name: url for name, (url, _) in LEXICONS.items()},
        'synonym_pairs': len(synonyms), 'antonym_pairs': len(antonyms), 'antonym_scope': 'synset (traduzioni italiane di relazioni PWN 3.0)'}


def retrofit(initial, synonyms, antonyms, iterations=10, attraction=.35, repulsion=.10):
    from scipy.sparse import coo_matrix
    n = len(initial)
    def adjacency(pairs):
        a = [x for p in pairs for x in p]
        b = [x for p in pairs for x in reversed(p)]
        mat = coo_matrix((np.ones(len(a), np.float32), (a, b)), shape=(n, n)).tocsr()
        degree = np.asarray(mat.sum(axis=1)).ravel()
        return mat.multiply((1 / np.maximum(1, degree))[:, None]).tocsr()
    positive, negative = adjacency(synonyms), adjacency(antonyms)
    q = unit_rows(initial)
    for _ in range(iterations):
        q = unit_rows(initial + attraction * (positive @ q) - repulsion * (negative @ q))
    return q


# Finestra ordinaria dal 16 novembre 2026 (ARCHITETTURA_VETTORI_SEMANTICI.md, §3.1): prima 2,00-2,40.
ORDINARY_FLOOR, ORDINARY_CEILING = 1.8, 2.5


def ordinary_lexical(zipf, tier, noun, verb=False):
    if tier == 'FO':
        return False
    return (ORDINARY_FLOOR <= zipf <= ORDINARY_CEILING or (tier == 'AD' and zipf < ORDINARY_FLOOR) or
            (tier == 'AU' and noun and ORDINARY_CEILING < zipf <= 3.2) or (verb and zipf >= ORDINARY_FLOOR))


def special_lexical(word, zipf, tier, domain):
    return tier != 'FO' and 1.85 <= zipf <= 2.05 and bool(domain) and not word.endswith(SUFFIXES)


def neighbourhoods(matrix, targets, frequencies, batch=128):
    if len(matrix) < 101:
        raise ValueError('Servono almeno 101 parole per D100')
    for start in range(0, len(targets), batch):
        if start % (batch * 20) == 0:
            print(f'Densità e ponti: {start}/{len(targets)} target', flush=True)
        ids = np.asarray(targets[start:start + batch])
        sims = matrix[ids] @ matrix.T
        sims[np.arange(len(ids)), ids] = -np.inf
        near = np.argpartition(sims, -100, axis=1)[:, -100:]
        values = np.take_along_axis(sims, near, axis=1)
        for i, ns, vs in zip(ids, near, values):
            yield int(i), float(vs.mean()), int(np.count_nonzero(frequencies[ns] >= 4)), int(np.count_nonzero(frequencies[ns] >= 3.8))

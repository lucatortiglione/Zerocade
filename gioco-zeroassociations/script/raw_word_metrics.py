"""Misure grezze per parola per l'IWFS (18/11/2026), da due file scaricati e conservati in cache.

- **Word Prevalence (`P`)**: Italian Crowdsourcing Project (Amenta, De Varda, Mandera, Keuleers, Brysbaert, Marelli; Behavior Research
  Methods 2025), file `ICP_prevalence.txt`: 130.495 parole, accuratezza media, numero di osservazioni (`nobs`) e prevalenza in scala z
  (stima come in Keuleers et al. 2015: `probit(0,005 + 0,99 · accuratezza)`, tra -2,58 e +2,58).
- **Contextual Diversity (`D`) e frequenza (`F`)**: SUBTLEX-IT (Crepaldi, Amenta, Pawel, Keuleers, Brysbaert), 517.564 forme dai
  sottotitoli di film e serie. `cd_count` è il numero di film distinti in cui compare la forma (Adelman et al. 2006); `freq_count` è la
  frequenza della forma e `dom_lemma_freq` quella del lemma dominante. Il file distingue maiuscole e minuscole: per una parola si
  prende il valore più alto fra le sue grafie (un limite inferiore).
  Limite dichiarato: la specifica IWFS indica per `D` un corpus documentale come PAISÀ; qui `D` usa i film di SUBTLEX-IT finché
  il conteggio per documenti di PAISÀ non è disponibile, e `D` ed `F` vengono dallo stesso corpus (sono quindi correlate)."""
import hashlib
import unicodedata
import urllib.request
from pathlib import Path

from collect_prompt_sources import CACHE

VERSION = 'raw-word-metrics-2'
METRICS_CACHE = CACHE / 'metrics'
SOURCES = {
    'prevalence': {
        'id': 'icp-prevalence',
        'name': 'Italian Crowdsourcing Project, Word Prevalence',
        'url': 'https://osf.io/download/v4scm/?view_only=20c718b7a8594fdba02256b475832597',
        'cache_file': 'ICP_prevalence.txt',
        'license': 'Nessuna licenza dichiarata nel readme (dati del progetto OSF e4x7w); citare Amenta et al. (2025)',
        'reference': 'https://osf.io/e4x7w/',
    },
    'subtlex': {
        'id': 'subtlex-it',
        'name': 'SUBTLEX-IT (cd_count, freq_count, dom_lemma_freq)',
        'url': 'https://osf.io/download/wtr39/',
        'cache_file': 'subtlex-it.csv',
        'license': 'CC BY-NC-SA (uso non commerciale), licenza del progetto OSF zg7sc',
        'reference': 'https://osf.io/zg7sc/',
    },
}


def fetch(spec, cache=METRICS_CACHE):
    """Il file in cache; lo scarica se manca. Restituisce (percorso, sha256)."""
    path = Path(cache) / spec['cache_file']
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(spec['url'], headers={'User-Agent': 'Zerocade-Italian-Word-Metrics/1.0 (local research)'})
        partial = path.with_suffix(path.suffix + '.part')
        try:
            with urllib.request.urlopen(request, timeout=120) as response, partial.open('wb') as stream:
                while block := response.read(1024 * 1024):
                    stream.write(block)
            partial.replace(path)
        finally:
            partial.unlink(missing_ok=True)
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    return path, digest.hexdigest()


def _key(word):
    return unicodedata.normalize('NFC', word).strip().casefold()


def read_prevalence(path):
    """{parola: (prevalenza z, accuratezza, osservazioni)} da `ICP_prevalence.txt` (spelling nobs accuracy prevalence)."""
    values = {}
    with Path(path).open(encoding='utf-8') as stream:
        header = next(stream).split()
        if header != ['spelling', 'nobs', 'accuracy', 'prevalence']:
            raise ValueError('ICP_prevalence.txt: intestazione non riconosciuta')
        for number, line in enumerate(stream, 2):
            cells = line.split()
            if not cells:
                continue
            if len(cells) != 4:
                raise ValueError(f'ICP_prevalence.txt: riga {number} non valida')
            values.setdefault(_key(cells[0]), (float(cells[3]), float(cells[2]), int(cells[1])))
    return values


def read_subtlex(path):
    """{parola: (film distinti, frequenza)} da `subtlex-it.csv` (latin-1, separatore «;»).

    La frequenza è quella del lemma quando la forma è il suo stesso lemma dominante (`offrire`: 16.263, non 1.766 della sola forma);
    altrimenti quella della forma."""
    values = {}
    with Path(path).open(encoding='latin-1') as stream:
        header = next(stream).rstrip('\r\n').split(';')
        try:
            word_c, freq_c, cd_c, lemma_c, lemma_freq_c = (header.index(n) for n in
                                                           ('wordform', 'freq_count', 'cd_count', 'dom_lemma', 'dom_lemma_freq'))
        except ValueError:
            raise ValueError('subtlex-it.csv: colonne wordform, freq_count, cd_count, dom_lemma, dom_lemma_freq non trovate') from None
        top = max(word_c, freq_c, cd_c, lemma_c, lemma_freq_c)
        for line in stream:
            cells = line.rstrip('\r\n').split(';')
            if len(cells) <= top or not cells[cd_c].isdigit() or not cells[freq_c].isdigit():
                continue
            key = _key(cells[word_c])
            frequency = int(cells[freq_c])
            if _key(cells[lemma_c]) == key and cells[lemma_freq_c].isdigit():
                frequency = max(frequency, int(cells[lemma_freq_c]))
            old = values.get(key, (0, 0))
            values[key] = (max(old[0], int(cells[cd_c])), max(old[1], frequency))
    return values


class WordMetrics:
    """Misure grezze: `prevalence` {parola: (z, accuratezza, nobs)} e `subtlex` {parola: (film, frequenza)}."""
    def __init__(self, prevalence, subtlex, sources=None):
        self.prevalence = prevalence
        self.subtlex = subtlex
        self.sources = sources or []

    def source_version(self, source_id):
        return next((s['sha256'][:12] for s in self.sources if s['id'] == source_id), None)


def load(cache=METRICS_CACHE):
    files = {name: fetch(spec, cache) for name, spec in SOURCES.items()}
    sources = [{'id': SOURCES[name]['id'], 'url': SOURCES[name]['url'], 'sha256': digest, 'license': SOURCES[name]['license']}
               for name, (_, digest) in files.items()]
    return WordMetrics(read_prevalence(files['prevalence'][0]), read_subtlex(files['subtlex'][0]), sources)

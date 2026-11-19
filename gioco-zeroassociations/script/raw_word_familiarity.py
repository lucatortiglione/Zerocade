"""Italian Word Familiarity Score (IWFS) per le parole di `normalizzata`, secondo `database/IWFS_Specifica_Indice_Familiarita_Italiano_v1.0.md`.

    IWFS = 0,50 · P + 0,30 · D + 0,20 · F          (ogni componente in scala 0-100, più alto = più familiare)

- `P` Word Prevalence (ICP): la prevalenza z del file è riportata a proporzione (Φ(z), cioè 0,005 + 0,99 · accuratezza) e a scala 0-100:
  conserva il significato probabilistico di quota di partecipanti che riconosce la parola.
- `D` Contextual Diversity (film distinti di SUBTLEX-IT) e `F` frequenza (lemma o forma, SUBTLEX-IT): rango percentile (a metà rango)
  sul lessico di riferimento, scala 0-100. Il lessico di riferimento è l'insieme delle parole di `normalizzata` con valore osservato
  maggiore di zero; la sua impronta fa parte della versione di normalizzazione, così i punteggi sono confrontabili solo a parità di versione.
- Dati mancanti (§6 della specifica): mai 0 per un dato mancante. `P` manca per le parole che l'ICP non ha sottoposto ai partecipanti
  (MISSING). `D` ed `F` vengono da un corpus completo: una parola assente da SUBTLEX-IT ha zero occorrenze osservate (OBSERVED, valore 0).
  Tre componenti → FULL; due → PARTIAL (pesi rinormalizzati sui soli presenti); una → DIAGNOSTIC; nessuna → UNAVAILABLE e IWFS NULL.
- La `confidence` dipende da copertura, numerosità del campione di `P` e validità lessicale, non solo dal numero di indicatori.
- Fasce provvisorie 85/65/40, da calibrare (§7): non sono la difficoltà di gioco.
Pesi e soglie sono ipotesi iniziali della specifica, non parametri validati."""
import hashlib
import math
from bisect import bisect_left, bisect_right

MODEL_VERSION = '1.0'
NORMALIZATION_VERSION = 'iwfs-norm-1'
WEIGHTS = {'prevalence': 0.50, 'contextual_diversity': 0.30, 'frequency': 0.20}
BANDS = ((85, 'MOLTO_FAMILIARE'), (65, 'FAMILIARE'), (40, 'POCO_FAMILIARE'), (0, 'RARA'))
METRIC_SOURCES = {'prevalence': 'icp-prevalence', 'contextual_diversity': 'subtlex-it', 'frequency': 'subtlex-it'}
# Fonti lessicografiche tracciabili (§5): una parola attestata da almeno una è VALID; le altre vanno riviste.
LEXICOGRAPHIC_SOURCES = frozenset({'liita-lemma-bank', 'complit-cnr', 'kaikki-itwiktionary', 'magic-ilc-cnr', 'nvdb-de-mauro-2016'})
MIN_PREVALENCE_SAMPLE = 30


def prevalence_percent(z):
    """Φ(z) · 100: da scala z a percentuale di partecipanti che riconoscono la parola."""
    return 100 * 0.5 * (1 + math.erf(z / math.sqrt(2)))


class Reference:
    """Rango percentile (a metà rango, 0-100) di un valore rispetto ai valori osservati e positivi del lessico di riferimento."""
    def __init__(self, values):
        self.values = sorted(values)

    def percentile(self, value):
        if value <= 0 or not self.values:
            return 0.0
        below, upto = bisect_left(self.values, value), bisect_right(self.values, value)
        return round(100 * (below + upto) / 2 / len(self.values), 2)


def band(iwfs):
    for floor, name in BANDS:
        if iwfs >= floor:
            return name


def lexical_validity(sources):
    return 'VALID' if sources & LEXICOGRAPHIC_SOURCES else 'REVIEW_REQUIRED' if sources else 'UNKNOWN'


def combine(components):
    """({metrica: valore 0-100 o None}) → (iwfs, stato)."""
    present = {m: v for m, v in components.items() if v is not None}
    if not present:
        return None, 'UNAVAILABLE'
    total = sum(WEIGHTS[m] for m in present)
    iwfs = round(sum(WEIGHTS[m] * v for m, v in present.items()) / total, 2)
    return iwfs, {3: 'FULL', 2: 'PARTIAL', 1: 'DIAGNOSTIC'}[len(present)]


def confidence(status, validity, sample):
    if status == 'UNAVAILABLE':
        return 'NONE'
    if status == 'FULL' and validity == 'VALID' and (sample or 0) >= MIN_PREVALENCE_SAMPLE:
        return 'HIGH'
    if status in {'FULL', 'PARTIAL'} and sample is not None and validity != 'UNKNOWN':
        return 'MEDIUM'
    return 'LOW'


def compute(words, sources_by_word, metrics):
    """Per ogni parola: riga di `normalizzata` e righe di `word_measurements`. `words` = [(parola, is_single_word)]."""
    reference_hash = hashlib.sha256('\n'.join(sorted(w for w, _ in words)).encode('utf-8')).hexdigest()[:12]
    normalization = f'{NORMALIZATION_VERSION}/{reference_hash}'
    raw = {w: metrics.subtlex.get(w, (0, 0)) for w, _ in words}  # assente da SUBTLEX-IT = zero osservato in un corpus coperto
    references = {'contextual_diversity': Reference(v[0] for v in raw.values() if v[0] > 0),
                  'frequency': Reference(v[1] for v in raw.values() if v[1] > 0)}
    counts = {'FULL': 0, 'PARTIAL': 0, 'DIAGNOSTIC': 0, 'UNAVAILABLE': 0}
    confidences, bands = {}, {}
    table, measurements = [], []
    for word, single in words:
        z, _, nobs = metrics.prevalence.get(word, (None, None, None))
        cd, frequency = raw[word]
        normalized = {'prevalence': None if z is None else round(prevalence_percent(z), 2),
                      'contextual_diversity': references['contextual_diversity'].percentile(cd),
                      'frequency': references['frequency'].percentile(frequency)}
        raws = {'prevalence': z, 'contextual_diversity': cd, 'frequency': frequency}
        for metric in WEIGHTS:
            source = METRIC_SOURCES[metric]
            measurements.append((word, metric, raws[metric], normalized[metric], 'MISSING' if raws[metric] is None else 'OBSERVED',
                                 nobs if metric == 'prevalence' else None, source, metrics.source_version(source), normalization))
        iwfs, status = combine(normalized)
        validity = lexical_validity(sources_by_word.get(word, set()))
        conf = confidence(status, validity, nobs)
        # Un solo indicatore è diagnostico, non un IWFS affidabile: niente fascia (§6, §7).
        family = band(iwfs) if status in {'FULL', 'PARTIAL'} else None
        counts[status] += 1
        confidences[conf] = confidences.get(conf, 0) + 1
        if family:
            bands[family] = bands.get(family, 0) + 1
        table.append((word, single, validity, z, cd, frequency, iwfs, status, conf, family))
    summary = {'model_version': MODEL_VERSION, 'normalization_version': normalization, 'weights': WEIGHTS,
               'words': len(words), 'status': counts, 'confidence': confidences, 'bands': bands,
               'with_word_prevalence': sum(1 for w, _ in words if w in metrics.prevalence),
               'with_contextual_diversity_gt0': sum(1 for v in raw.values() if v[0] > 0),
               'with_frequency_gt0': sum(1 for v in raw.values() if v[1] > 0)}
    return table, measurements, summary

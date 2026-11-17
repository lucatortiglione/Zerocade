# Architettura dei vettori semantici per ZeroContext — Italiano (90.000 parole)

**Versione:** 2.0.0 — 16 novembre 2026  
**Stato:** specifica tecnica e piano di implementazione; le soglie prestazionali richiedono benchmark sul sistema reale  
**Origine:** revisione e ampliamento di `ARCHITETTURA_VETTORI_SEMANTICI.md`  
**Ambito:** generazione offline, qualità linguistica, ordinamento delle parole, integrazione SQLite e runtime per giochi di prossimità semantica in italiano.

> **Principio guida.** Per un gioco in stile *Contexto / Semantle* la qualità non coincide con la sola similarità di significato: una buona classifica deve anche catturare associazioni, categorie, relazioni e intuizioni utili al giocatore. La complessità del modello è giustificata solo se migliora benchmark e partite reali.

## Indice

1. [Obiettivi, termini e criteri di successo](#1-obiettivi-termini-e-criteri-di-successo)
2. [Limiti dei modelli e implicazioni per il gioco](#2-limiti-dei-modelli-e-implicazioni-per-il-gioco)
3. [Architettura di riferimento](#3-architettura-di-riferimento)
4. [Modello lessicale e SQLite](#4-modello-lessicale-e-sqlite)
5. [Generazione degli embeddings candidati](#5-generazione-degli-embeddings-candidati)
6. [Gestione degli OOV e delle forme flesse](#6-gestione-degli-oov-e-delle-forme-flesse)
7. [Polisemia e rappresentazioni per accezione](#7-polisemia-e-rappresentazioni-per-accezione)
8. [Fusione delle classifiche](#8-fusione-delle-classifiche)
9. [Specializzazione lessicale: sinonimi, contrari, relazioni](#9-specializzazione-lessicale-sinonimi-contrari-relazioni)
10. [Runtime, ranking e caching per round](#10-runtime-ranking-e-caching-per-round)
11. [Formati, memoria e benchmark prestazionali](#11-formati-memoria-e-benchmark-prestazionali)
12. [Pipeline di build: implementazione di riferimento](#12-pipeline-di-build-implementazione-di-riferimento)
13. [Valutazione linguistica, ludica e regressioni](#13-valutazione-linguistica-ludica-e-regressioni)
14. [Riproducibilità, sicurezza e rilascio](#14-riproducibilità-sicurezza-e-rilascio)
15. [Piano di adozione per ZeroContext](#15-piano-di-adozione-per-zerocontext)
16. [Correzioni rispetto alla prima versione](#16-correzioni-rispetto-alla-prima-versione)
17. [Fonti e riferimenti](#17-fonti-e-riferimenti)
18. [Selezione delle segrete e curva termica](#18-selezione-delle-segrete-e-curva-termica)

---

## 1. Obiettivi, termini e criteri di successo

### 1.1 Requisiti funzionali

Il sistema parte da circa **90.000 voci italiane**, ma il numero finale delle voci giocabili (`N`) può differire a seguito di deduplicazioni, esclusioni, alias e gestione delle eccezioni lessicali. Non è un requisito che tutte le forme archiviate abbiano un rango indipendente.

- Ogni **bersaglio** selezionabile ha un ID lessicale stabile e una classifica riproducibile delle parole candidabili.
- Un **tentativo** viene normalizzato, verificato nel lessico e ricondotto a una forma canonica; solo allora riceve un rango.
- Il rango è **1 per il bersaglio**. Non sono ammessi pari merito: si applica uno spareggio deterministico per gli altri termini.
- Le varianti puramente flessive possono condividere la stessa voce giocabile; le forme con significato autonomo non devono essere cancellate automaticamente.
- Il ranking dev'essere **congelato per tutta la durata del round**, anche se il modello viene aggiornato sul server.
- Una build nuova non deve modificare i risultati di una partita già avviata.

### 1.2 Requisiti non funzionali

| Aspetto | Requisito | Metodo di verifica |
|---|---|---|
| Correttezza | Ranghi completi e univoci per il pool giocabile | Test automatico |
| Determinismo | Stesso bersaglio, stessa versione, stessi ranghi | Snapshot e hash |
| Tracciabilità | Ogni ranking associato a modello, lessico e parametri | Manifest di build |
| Prestazioni | Risposta al tentativo mediante lookup, senza inferenza | Benchmark end-to-end |
| Robustezza | Nessun vettore NaN, infinito o di norma nulla | Validazione build |
| Qualità | Miglioramento dimostrato rispetto alla baseline | Benchmark cieco e partite pilota |
| Manutenibilità | Ricostruzione e rollback senza alterare il database delle parole | Test di rilascio |

**Nota:** tempi come «meno di 3 ms» sono *ipotesi/obiettivi da verificare*, non caratteristiche garantite. È opportuno distinguere: calcolo del ranking a inizio round, lookup per tentativo, accesso DB e latenza percepita dai partecipanti.

### 1.3 Similarità, associazione e ranking

Siano `w` una parola candidata e `t` il bersaglio. Distinguiamo almeno:

- **Similarità semantica**: `cane`–`lupo`, `correre`–`camminare`.
- **Relazione tassonomica**: `cane`–`animale`.
- **Associazione tematica/funzionale**: `mare`–`spiaggia`, `chiave`–`serratura`.
- **Opposizione semantica**: `caldo`–`freddo`; stesso dominio, significato opposto.
- **Somiglianza ortografica/morfologica**: `casa`–`casetta`, che da sola non garantisce una buona associazione concettuale.

Il gioco deve rendere esplicito quale miscela di relazioni premia. Non considerare automaticamente un antonimo come «errore» né un sinonimo come «vicino» senza prove sperimentali.

---

## 2. Limiti dei modelli e implicazioni per il gioco

### 2.1 Modelli distribuzionali (Word2Vec, GloVe, FastText)

Riconoscono contesti d'uso; possono collocare vicino termini semanticamente opposti ma tematicamente collegati. Questo comportamento è talvolta utile per la modalità associativa. **Non esiste una soglia universale** (per esempio coseno `> 0,75`) oltre cui tutti gli antonimi diventano problematici: occorre misurare casi concreti.

### 2.2 Transformer su parole isolate

L'embedding di una parola isolata può essere insufficiente a separare accezioni e usi; si osservano talvolta anisotropia e concentrazione delle similarità, ma intensità e impatto dipendono da architettura, pooling, training e pre-processing. Non descrivere l'anisotropia come un collasso inevitabile per ogni modello.

### 2.3 Lemmi, parole rare e OOV

FastText `.bin` può produrre vettori per termini non presenti nel suo lessico usando sottoparole; questo garantisce una **rappresentazione numerica**, non la bontà semantica. Parole inventate, nomi propri o composti insoliti possono risultare fuorvianti. Vanno registrati origine e affidabilità del vettore.

### 2.4 Limitazione strutturale della distillazione

**Model2Vec** genera rappresentazioni statiche a partire da un modello più grande. Riduce l'inferenza ma **non conserva automaticamente l'intera capacità contestuale e la disambiguazione del modello sorgente**. Il modello distillato e il Transformer originale sono due candidati da confrontare, non due componenti intercambiabili.

---

## 3. Architettura di riferimento

### 3.1 Due percorsi separati: build e runtime

```text
             ┌──────────────────────────────────────────────┐
             │ LESSICO UNICO / SQLITE                       │
             │ parola, lemma, POS, alias, accezione, regole │
             └───────────────────────┬──────────────────────┘
                                     │ snapshot/versione
                                     ▼
             ┌──────────────────────────────────────────────┐
             │ BUILD OFFLINE                                │
             │ 1. pulizia + controlli lessicali             │
             │ 2. FastText / Model2Vec / Transformer        │
             │ 3. vettori float32 normalizzati             │
             │ 4. fusioni e specializzazioni sperimentali   │
             │ 5. benchmark + approvazione                  │
             │ 6. artefatti immutabili + manifest           │
             └───────────────────────┬──────────────────────┘
                                     │ rilascio atomico
                                     ▼
             ┌──────────────────────────────────────────────┐
             │ RUNTIME GIOCO                                │
             │ Inizio round: ranking totale del bersaglio   │
             │ Durante round: lookup ID → rango             │
             │ Fine round: telemetria e QA (no update live) │
             └──────────────────────────────────────────────┘
```

**Decisione architetturale:** al runtime non è obbligatorio mantenere una sola matrice di 300 dimensioni. Sono ammissibili due matrici indipendenti o un ranking preconfezionato; il confronto è prestazionale ed economico. Nel prototipo si evita l'inferenza online di Transformer.

### 3.2 Varianti da valutare (ablation)

| ID | Variante | Scopo | Stato iniziale |
|---|---|---|---|
| B0 | FastText italiano 300d | Baseline semplice, robusta alle forme | **Implementare per prima** |
| B1 | TF-IDF/PPMI + SVD su corpus italiano | Baseline corpus-driven, se disponibile un corpus adeguato | Opzionale |
| M1 | Model2Vec distillato multilingua | Embeddings statici alternativi | Esperimento |
| T1 | BGE-M3 1024d, parole isolate | Teacher/dense offline | Esperimento |
| T2 | BGE-M3, definizioni e accezioni | Disambiguazione lessicale selettiva | Esperimento |
| F1 | Fusione calibrata B0 + M1 o T1 | Combinare segnali differenti | Esperimento |
| S1 | F1 + specializzazione sinonimi | Migliorare vicini lessicali | Esperimento |
| S2 | S1 + vincoli sui contrari | Valutarne l'utilità **per il gioco** | Esperimento separato |

**Regola:** una variante entra in produzione soltanto dopo aver superato il protocollo di valutazione. Il solo fatto che un modello sia più moderno non è sufficiente.

---

## 4. Modello lessicale e SQLite

### 4.1 Separare lemma, forma scritta, parola giocabile e accezione

Un database condiviso da diversi giochi non deve presupporre che ogni `surface_form` sia una voce semantica indipendente. Definizioni:

- `lemma`: forma di dizionario e, ove necessario, categoria grammaticale (es. `pesca` sostantivo vs `pesca` forma verbale).
- `surface_form`: forma materialmente digitata o mostrata.
- `playable_entry`: unità classificata nel gioco, che può rappresentare una forma autonoma o una famiglia flessiva.
- `sense`: accezione di una voce, opzionale e con provenienza verificata.
- `alias`: grafia o forma che viene accettata come tentativo e risolta verso una sola voce giocabile.

Esempi: `cane` e `cani` possono avere un'unica entry; `nozze` deve conservare la propria identità; `braccio` e `braccia` richiedono una regola non automatica; `pesca` è un caso di omografia/polisemia da trattare separatamente.

### 4.2 Schema SQLite proposto (da adattare alle tabelle esistenti)

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lemma (
    lemma_id INTEGER PRIMARY KEY,
    lemma_text TEXT NOT NULL,
    pos TEXT NOT NULL,
    UNIQUE (lemma_text, pos)
);

CREATE TABLE IF NOT EXISTS playable_entry (
    entry_id INTEGER PRIMARY KEY,
    lemma_id INTEGER REFERENCES lemma(lemma_id),
    display_text TEXT NOT NULL,
    pos TEXT NOT NULL DEFAULT 'unknown',
    is_playable INTEGER NOT NULL DEFAULT 1 CHECK(is_playable IN (0,1)),
    is_target INTEGER NOT NULL DEFAULT 1 CHECK(is_target IN (0,1)),
    lexicalized_plural INTEGER NOT NULL DEFAULT 0 CHECK(lexicalized_plural IN (0,1)),
    frequency_zipf REAL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    UNIQUE (display_text, pos)
);

CREATE TABLE IF NOT EXISTS surface_alias (
    normalized_form TEXT PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES playable_entry(entry_id),
    alias_type TEXT NOT NULL,   -- inflection, spelling, approved_variant
    source TEXT,
    review_status TEXT NOT NULL DEFAULT 'approved'
);

CREATE TABLE IF NOT EXISTS sense (
    sense_id INTEGER PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES playable_entry(entry_id),
    gloss TEXT NOT NULL,
    source TEXT NOT NULL,
    sense_status TEXT NOT NULL DEFAULT 'reviewed'
);

CREATE TABLE IF NOT EXISTS vector_build (
    build_id TEXT PRIMARY KEY,
    vocab_hash TEXT NOT NULL,
    model_manifest_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('candidate','approved','retired'))
);

CREATE TABLE IF NOT EXISTS vector_row (
    build_id TEXT NOT NULL REFERENCES vector_build(build_id),
    row_index INTEGER NOT NULL,
    entry_id INTEGER NOT NULL REFERENCES playable_entry(entry_id),
    PRIMARY KEY (build_id, row_index),
    UNIQUE (build_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_playable
    ON playable_entry(is_playable, is_target);
```

**Vincolo cruciale:** `entry_id` non è la riga NumPy. La corrispondenza è sempre registrata in `vector_row` o nell'artefatto equivalente `entries.json`; non ricavarla dall'ordine alfabetico dopo il rilascio. Le chiavi `normalized_form` sono univoche: omografie autenticamente ambigue non devono essere risolte silenziosamente in un solo significato. In quei casi conservare un'unica voce ambigua oppure introdurre una disambiguazione esplicita nell'interfaccia.

Lo schema è un **contratto proposto**. Prima della migrazione verificare tabelle e foreign key già esistenti nel progetto: non eseguire `DROP TABLE` su dati di produzione.

### 4.3 Normalizzazione, accentazione e morfologia

Policy raccomandata:

1. Eliminare spazi laterali, uniformare maiuscole/minuscole con `casefold()` e applicare Unicode **NFC**; non eliminare indiscriminatamente accenti e apostrofi.
2. Conservare la forma originale da mostrare (`display_text`) e la chiave normalizzata da cercare.
3. Gestire grafie equivalenti con alias **approvati**, senza confondere omografi e forme diverse.
4. Riconoscere lemma e categoria grammaticale con un analizzatore morfologico, seguito da revisione di casi incerti.
5. Gestire i plurali con una **soluzione ibrida**: collassare solo le flessioni regolari semanticamente equivalenti, mantenere plurali lessicalizzati, collettivi e differenze di significato.
6. Non applicare un filtro «solo singolari» all'intero lessico senza audit degli effetti sui giochi che condividono lo stesso database.

```python
import unicodedata

def normalize_guess(raw: str) -> str:
    return unicodedata.normalize("NFC", raw.strip().casefold())
```

**Esempi di QA:** `cane/cani`, `gatto/gatti`, `ferie`, `nozze`, `braccio/braccia`, `uovo/uova`, `osso/ossa`, `pesca` (frutto/attività/forma verbale), `àncora/ancóra` se distinte dalla policy grafica. Non attribuire eccezioni automaticamente per somiglianza ortografica.

### 4.4 Regole di selezione del pool

- Separare `is_playable` (tentativi validi) e `is_target` (bersagli eleggibili).
- Ammissibilità, frequenza, volgarità, forme grammaticali e parole tecniche devono essere regole di gioco configurabili, non proprietà nascoste nel modello.
- Un alias rimanda al rango della sua voce canonica; non crea una posizione separata.
- Se una parola è esclusa dal gioco, l'embedding può comunque esistere in un archivio di ricerca, ma non entra nel ranking pubblico.
- La versione del pool non può cambiare in una partita in corso.

---

## 5. Generazione degli embeddings candidati

### 5.1 B0 — FastText italiano, baseline obbligatoria

Il modello binario `cc.it.300.bin` usa informazioni subword ed è adatto come punto di partenza. Il vettore di una parola dipende dai suoi componenti addestrati; la sua qualità semantica deve comunque essere misurata. Il modello `.vec` non sostituisce il `.bin` per la stessa gestione degli OOV.

```python
import fasttext
import numpy as np

ft = fasttext.load_model("models/cc.it.300.bin")
words = ["mare", "spiaggia", "caldo", "freddo"]
M = np.stack([ft.get_word_vector(w) for w in words]).astype(np.float32)

norms = np.linalg.norm(M, axis=1, keepdims=True)
if not np.isfinite(M).all() or (norms <= 1e-12).any():
    raise ValueError("Matrice FastText con valori non validi")
M /= norms
```

**Fonte:** risorse ufficiali FastText, modello italiano Common Crawl [R2]. Non assumere che «OOV gestito» significhi «vettore affidabile»: annotare sempre la provenienza delle voci problematiche.

### 5.2 M1 — Distillazione con Model2Vec

La documentazione corrente di Model2Vec descrive `pca_dims`, `sif_coefficient`, `quantize_to`; `pca_to_dimension` non è il parametro corretto. L'API è soggetta a versioni: **pinnare la release e controllare la firma in ambiente reale**. È possibile usare un modello compatibile con SentenceTransformers, ma le prestazioni sul lessico italiano vanno validate.

```python
# Dipendenza indicativa: pip install "model2vec[distill]"
from model2vec.distill import distill
from pathlib import Path
import numpy as np

words = [w.strip() for w in Path("words_90k.txt").read_text("utf-8").splitlines() if w.strip()]
static_model = distill(
    model_name="BAAI/bge-m3",
    vocabulary=words,          # vocab completo e versionato
    pca_dims=300,
    sif_coefficient=1e-4,
    quantize_to="float32",
)
static_model.save_pretrained("models/m2v-it-300d")
M_m2v = np.asarray(static_model.encode(words), dtype=np.float32)
```

**Attenzioni:**

- Per PCA a 300 dimensioni serve un vocabolario sufficientemente ampio e rappresentativo: il file `words_90k.txt` è un input versionato, derivato dal lessico giocabile e coerente con `entries.json`. Non riutilizzare il mini-esempio FastText di quattro parole.
- Il vocabolario fornito alla distillazione può influenzare stima di frequenza e riduzione dimensionale; il modello va ricreato quando cambia sostanzialmente.
- Il fatto che una stringa venga codificata non implica che abbia un significato affidabile nel modello distillato.
- Se la distillazione da uno specifico teacher non è compatibile con la versione installata, cambiare teacher o versione *documentando la scelta*, non sostituire senza dirlo il risultato con FastText.
- **Non fondere `M_m2v` e `M_fasttext` per somma delle coordinate**: le basi vettoriali non sono allineate.

### 5.3 T1 — Transformer denso offline

`BAAI/bge-m3` produce un embedding denso a **1.024 dimensioni** e supporta l'italiano come modello multilingue [R4]. Calcolarne i vettori una volta in build elimina il costo dell'inferenza durante la partita. Un teacher offline può quindi essere competitivo anche se lento nella generazione.

```python
# Dipendenza indicativa: pip install sentence-transformers
from sentence_transformers import SentenceTransformer

encoder = SentenceTransformer("BAAI/bge-m3", device="cuda")
M_teacher = encoder.encode(
    words,
    batch_size=64,                 # da tarare su VRAM disponibile
    normalize_embeddings=True,
    convert_to_numpy=True,
    show_progress_bar=True,
).astype("float32")
```

Questa procedura crea embeddings di **parole isolate**: non è una disambiguazione semantica. Si deve valutare separatamente la qualità degli embedding delle definizioni/contesti. Lo `device="cuda"` richiede ambiente CUDA funzionante; in assenza usare CPU.

### 5.4 B1 — Baseline statistica su corpus

Come controllo aggiuntivo, confrontare embedding costruiti con **co-occorrenze pesate / PPMI + SVD** oppure TF-IDF + TruncatedSVD su documenti **se il corpus contiene contesti appropriati**. TF-IDF di una lista di parole isolate non è equivalente a un buon modello distribuzionale; documentare dimensioni, segmentazione, frequenze minime e fonte del corpus.

### 5.5 Altre risorse da sperimentare

WordNet italiana o risorse lessicali equivalenti, ConceptNet e dizionari di definizioni possono offrire **relazioni e controlli**, non un sostituto immediato del corpus. Qualunque risorsa esterna richiede un audit preventivo di **licenza, copertura, affidabilità, versione e compatibilità con l'uso del gioco**.

---

## 6. Gestione degli OOV e delle forme flesse

Non trattare FastText come un «fallback matematico» da concatenare semplicemente a Model2Vec: il suo output è in uno spazio diverso. Le strategie ammesse sono:

1. **Modelli separati e late fusion:** FastText contribuisce sempre a un punteggio autonomo, anche per termini rari.
2. **Fallback per modello mancante:** usare solo il ranking di un modello alternativo per le coppie non valutabili, con regola dichiarata; la calibrazione cambia e va testata.
3. **Allineamento supervisionato:** solo se necessario, stimare una trasformazione su parole-ancora in comune (Procrustes ortogonale), e misurare errore e perdita di qualità. Il fatto che due matrici abbiano 300 colonne non le rende sommabili.

### 6.1 Metadati di copertura

Per ogni voce registrare, in build o nel report di controllo:

- `source_model`: quale modello ha prodotto il vettore;
- `vector_valid`: test numerici;
- `in_training_vocab`: quando l'informazione è effettivamente verificabile;
- `oov_subword`: derivazione subword verificata o «sconosciuto»;
- `low_confidence`: flag derivato da regole e verifica umana, **non** inventato dal valore della norma.

### 6.2 Test morfologici

Verificare che flessioni approvate condividano il rango della voce canonica a livello applicativo; **non** imporre artificialmente coseno 1 a tutti i plurali. Eccezioni lessicali e accezioni possono avere embeddings distinti.

---

## 7. Polisemia e rappresentazioni per accezione

### 7.1 Perché la media di template non basta

Per `pesca`, una media fra «frutto» e «attività di pesca» crea un centro ambiguo. Anche frasi genericamente definitorie come «Il concetto di X» possono introdurre rumore perché condividono molto testo. Il *prompt averaging* può essere un **esperimento di robustezza**, non la soluzione di riferimento alla polisemia.

### 7.2 Strategia a due livelli

- **Livello standard:** un vettore per voce giocabile, ricavato dal candidato migliore; sufficiente per parole monosemiche e una prima release.
- **Livello sense-aware:** per un sottoinsieme prioritario di termini ambigui, vettori di accezione calcolati da definizioni autentiche e contesti di utilizzo con provenienza verificata.

Esempi di rappresentazioni **separate**:

```text
pesca#frutto      → "La pesca è un frutto ..."  (definizione controllata)
pesca#attività    → "La pesca è un'attività ..." (definizione controllata)
```

Non generare definizioni definitive con un LLM senza revisione e diritto d'uso. Non usare automaticamente `max_cosine` fra tutte le accezioni, perché può avvicinare troppo un termine a temi non pertinenti e favorire le parole con molte accezioni.

### 7.3 Politiche di scoring per polisemia, da confrontare

- `primary_sense`: l'accezione approvata per il bersaglio durante il round.
- `weighted_senses`: media dei **punteggi** delle accezioni, con pesi determinati offline; poi calibrazione.
- `max_sense`: massimo fra accezioni, **solo** come variante sperimentale e con penalizzazione/controllo del numero di accezioni.
- `ambiguous_aggregate`: embedding generalista e flag per audit; più semplice per la prima versione.

La scelta dell'accezione del **bersaglio** deve essere stabile e possibilmente esplicita se modifica sensibilmente il ranking. Per una voce digitata ambigua, definire una politica unica e documentata: non selezionare in modo opportunistico l'accezione che produce il miglior punteggio senza test di equità.

---
## 8. Fusione delle classifiche

### 8.1 Non sommare vettori provenienti da spazi diversi

Siano `A ∈ R^(N×300)` (FastText) e `B ∈ R^(N×300)` (Model2Vec). L'operazione `normalize(α A + β B)` **non è giustificata** senza allineamento: le coordinate non rappresentano le stesse direzioni. La prima strategia da testare è una fusione **tardiva dei punteggi o dei ranghi**.

Per bersaglio `t` e modello `m`:

\[
s_m(w,t)=\frac{v_m(w)\cdot v_m(t)}{\|v_m(w)\|_2\,\|v_m(t)\|_2}
\]

I punteggi coseno possono avere distribuzioni diverse; occorre calibrarli. Due candidate:

**Fusione di score standardizzati per bersaglio** (esperimento F-score):

\[
z_m(w,t)=\frac{s_m(w,t)-\mu_m(t)}{\max(\sigma_m(t),\varepsilon)},
\qquad S(w,t)=\sum_m\lambda_m z_m(w,t)
\]

Con \(\lambda_m\ge0\) e \(\sum_m\lambda_m=1\). `μ` e `σ` sono calcolati sui candidati **giocabili del round**, non su selezioni arbitrarie.

**Reciprocal Rank Fusion** (esperimento F-rank):

\[
RRF(w,t)=\sum_m\frac{\lambda_m}{k+r_m(w,t)},\quad k>0
\]

Dove `r_m` è il rango intero del modello `m` con regola di spareggio deterministica. Valutare `k` (per esempio 20/60/100) su set di validazione; non fissarlo come «ottimale» senza misure.

### 8.2 Implementazione di riferimento: rank fusion esatta

```python
import numpy as np


def unit_rows(matrix: np.ndarray) -> np.ndarray:
    a = np.asarray(matrix, dtype=np.float32)
    if a.ndim != 2 or not np.isfinite(a).all():
        raise ValueError("Matrice non valida")
    norms = np.linalg.norm(a, axis=1, keepdims=True)
    if (norms < 1e-12).any():
        raise ValueError("Almeno un vettore ha norma nulla")
    return np.ascontiguousarray(a / norms, dtype=np.float32)


def ranks_from_scores(scores: np.ndarray, target_row: int) -> np.ndarray:
    """Ranghi 1..N; il bersaglio prevale su eventuali vettori identici."""
    scores = np.asarray(scores, dtype=np.float64)
    if scores.ndim != 1 or not np.isfinite(scores).all():
        raise ValueError("Punteggi non validi")
    n = len(scores)
    if not (0 <= target_row < n):
        raise IndexError("Bersaglio fuori intervallo")
    # Stable-sort: a pari score, vince l'indice di riga più basso.
    order = np.argsort(-scores, kind="stable")
    # Impone il rango 1 al bersaglio; non ne modifica il coseno originale.
    order = np.concatenate(([target_row], order[order != target_row]))
    ranks = np.empty(n, dtype=np.int32)
    ranks[order] = np.arange(1, n + 1, dtype=np.int32)
    return ranks


def fused_round_ranks(
    matrices: list[np.ndarray],
    target_row: int,
    weights: list[float],
    rrf_k: float = 60.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Matrici L2-normalizzate, allineate per voce, dimensioni indipendenti."""
    if not matrices or len(matrices) != len(weights):
        raise ValueError("Matrici e pesi incoerenti")
    if rrf_k <= 0:
        raise ValueError("rrf_k deve essere positivo")
    w = np.asarray(weights, dtype=np.float64)
    if not np.isfinite(w).all() or (w < 0).any() or w.sum() <= 0:
        raise ValueError("Pesi non validi")
    w /= w.sum()
    n = matrices[0].shape[0]
    fused = np.zeros(n, dtype=np.float64)
    for m, weight in zip(matrices, w):
        if m.ndim != 2 or m.shape[0] != n:
            raise ValueError("Le righe dei modelli devono coincidere")
        similarities = m @ m[target_row]
        model_ranks = ranks_from_scores(similarities, target_row)
        fused += weight / (rrf_k + model_ranks)
    return ranks_from_scores(fused, target_row), fused
```

**Precondizioni:** le matrici devono avere righe nello **stesso ordine delle stesse voci**, essere finite e già normalizzate in L2. Il codice è un riferimento corretto per un pool interamente giocabile; per la produzione usare gli indici `eligible_rows` e creare la classifica soltanto su quel sottoinsieme, oppure creare matrici che contengano esclusivamente il pool giocabile.

### 8.3 Calibrazione e scelta dei pesi

- Suddividere i bersagli in train/validation/test **senza sovrapposizioni** (e preferibilmente con controllo delle famiglie lessicali).
- Ottimizzare `λ`, `k`, eventuali correzioni lessicali **solo** su validation, senza guardare il test finale.
- Confrontare fusione RRF, score-z e ciascun modello singolo usando le stesse parole bersaglio.
- Se il guadagno è inferiore alla variabilità del test umano, preferire la variante più semplice.
- Aggiungere controlli di bias: frequenza delle parole, forma flessa, densità dei vicini e parole troppo facili o inevitabili.

### 8.4 Allineamento Procrustes: opzione, non default

Quando si intende davvero fondere coordinate, costruire un insieme indipendente di parole-ancora, normalizzare i vettori, stimare `R` ortogonale minimizzando `||A R - B||²` (a dimensioni compatibili), verificare su ancore tenute fuori e misurare la qualità dei ranking. Se degrada il gioco, restare alla late fusion.

---

## 9. Specializzazione lessicale: sinonimi, contrari, relazioni

### 9.1 Correzione metodologica

Il retrofitting classico di **Faruqui et al.** avvicina i vettori in un grafo di vincoli lessicali; la repulsione esplicita degli antonimi richiede un obiettivo specifico, come negli approcci **Counter-fitting** o **Attract-Repel** [R5–R7]. Non attribuire al retrofitting originale una separazione automatica degli opposti.

Per ZeroContext mantenere **tre esperimenti distinti**:

1. `no_retrofit` — spazio originale, come controllo.
2. `synonym_retrofit` — avvicina sinonimi approvati conservando i vettori iniziali.
3. `signed_specialization` — attrae sinonimi e respinge contrari **solo fino a un margine validato**, preservando l'associazione tematica quando utile.

**Non fondere indiscriminatamente i collegamenti di iperonimia (`cane`–`animale`) con quelli di sinonimia**: possono richiedere un'intensità diversa o soltanto una feature di ranking.

### 9.2 Obiettivo matematico proposto per variante specializzata

Siano `q_i` i vettori da addestrare e `v_i` i vettori originali L2-normalizzati. Per coppie fidate di sinonimi `E_syn` e contrari `E_ant`:

\[
L= \alpha\sum_i\|q_i-v_i\|_2^2
+\beta\sum_{(i,j)\in E_{syn}}\|q_i-q_j\|_2^2
+\gamma\sum_{(i,k)\in E_{ant}}\big[\max(0,\cos(q_i,q_k)-c_{max})\big]^2
\]

Dove `c_max` è la **similarità massima ammessa agli antonimi**, da selezionare tramite validazione, e non un valore universale. Il terzo termine interviene solo se i contrari sono troppo vicini; non obbliga a renderli semanticamente estranei. Se non serve al gioco, usare `γ=0`.

### 9.3 Implementazione coerente con l'obiettivo (PyTorch)

L'implementazione NumPy della versione precedente **non** calcolava il gradiente della funzione di perdita dichiarata. La seguente variante usa autodifferenziazione. È uno **scheletro sperimentale con regolarizzazione**, non un rilascio già validato.

```python
import numpy as np
import torch
import torch.nn.functional as F


def specialize_embeddings(
    base: np.ndarray,
    synonym_edges: np.ndarray,    # shape (E, 2), row indices
    antonym_edges: np.ndarray,    # shape (A, 2), row indices
    steps: int = 100,
    learning_rate: float = 1e-2,
    alpha: float = 1.0,
    beta: float = 0.1,
    gamma: float = 0.0,
    max_antonym_cos: float = 0.6,
    device: str = "cpu",
) -> np.ndarray:
    original = torch.tensor(base, dtype=torch.float32, device=device)
    original = F.normalize(original, p=2, dim=1)
    parameters = torch.nn.Parameter(original.detach().clone())
    optimizer = torch.optim.Adam([parameters], lr=learning_rate)

    def edge_tensor(edges):
        arr = np.asarray(edges, dtype=np.int64).reshape(-1, 2)
        if len(arr) and ((arr < 0).any() or (arr >= len(base)).any()):
            raise ValueError("Indice del grafo fuori intervallo")
        return torch.as_tensor(arr, dtype=torch.long, device=device)

    syn = edge_tensor(synonym_edges)
    ant = edge_tensor(antonym_edges)
    for _ in range(steps):
        optimizer.zero_grad()
        current = F.normalize(parameters, p=2, dim=1)
        # Mean (non sum) per evitare che la dimensione del grafo domini i pesi.
        loss = alpha * ((current - original) ** 2).sum(dim=1).mean()
        if len(syn):
            delta = current[syn[:, 0]] - current[syn[:, 1]]
            loss = loss + beta * (delta ** 2).sum(dim=1).mean()
        if len(ant) and gamma > 0:
            sims = (current[ant[:, 0]] * current[ant[:, 1]]).sum(dim=1)
            loss = loss + gamma * F.relu(sims - max_antonym_cos).square().mean()
        loss.backward()
        optimizer.step()

    with torch.no_grad():
        result = F.normalize(parameters, p=2, dim=1).cpu().numpy()
    return result.astype(np.float32)
```

**Controlli aggiuntivi richiesti prima dell'uso:** coppie deduplicate, rimozione self-loop, peso per affidabilità della fonte, controllo di duplicati tra sinonimi/contrari, grafi separati per POS e accezione, verifica di drift, early stopping su validazione, confronto con `gamma=0`, stabilità su seed differenti.

### 9.4 Grafi lessicali e proprietà delle relazioni

Per ogni arco memorizzare:

`source_entry_id`, `target_entry_id`, `relation_type` (`synonym`, `antonym`, `hypernym`, `related`), `sense_id` opzionale, `confidence`, `source_name`, `license`, `review_status`.

**Regole:**

- L'attrazione/repulsione forte è ammessa solo per coppie con accezione compatibile e conferma della relazione.
- Le coppie contrari come `caldo`–`freddo` devono essere valutate per **coerenza del gioco**, non per ottenere sempre coseno basso.
- I collegamenti di mera associazione non sono automaticamente sinonimi.
- Vietare correzioni manuali arbitrarie senza un test di regressione e una motivazione registrata.

---

## 10. Runtime, ranking e caching per round

### 10.1 Strategia predefinita: ranking una volta, lookup per ogni tentativo

Per un bersaglio `t` la similarità di una matrice L2-normalizzata è:

\[
s(w,t)=v(w)\cdot v(t)\,,\qquad \operatorname{rank}(w,t)=1+\#\{u:s(u,t)>s(w,t)\}
\]

In presenza di punteggi uguali occorre uno spareggio deterministico; la formula è quindi descrittiva, mentre l'implementazione usa sort stabile e bersaglio in posizione 1.

**A inizio round:**

1. Leggere `build_id`, snapshot del pool e `target_entry_id`.
2. Recuperare l'indice di riga canonico del bersaglio.
3. Calcolare il ranking di **tutte e sole le voci giocabili** (uno o più modelli).
4. Salvare `ranks[row]` e `build_id` nel contesto del round.
5. Durante il round, risolvere l'alias, recuperare la riga e leggere `ranks[row]`.
6. A fine round, mantenere telemetria aggregata utile a migliorare la qualità, senza alterare il risultato dei tentativi già effettuati.

### 10.2 Lookup di riferimento

```python
# ranks = array int32 del round; entry_to_row = mapping immutabile
# normalized_alias_to_entry = indice dei tentativi accettati

def score_guess(raw_guess, ranks, normalized_alias_to_entry, entry_to_row):
    normalized = normalize_guess(raw_guess)
    entry_id = normalized_alias_to_entry.get(normalized)
    if entry_id is None:
        return {"valid": False, "reason": "not_in_dictionary"}
    row = entry_to_row.get(entry_id)
    if row is None or ranks[row] == 0:
        return {"valid": False, "reason": "not_playable"}
    return {"valid": True, "entry_id": entry_id, "rank": int(ranks[row])}
```

`ranks[row]=0` è un possibile valore sentinella **solo se** il ranking contiene anche righe non giocabili. In un array ristretto al pool, ogni rango sarà positivo.

### 10.3 Caching e multiplayer

- **Cache per round:** `round_id → {build_id, target_id, ranks}`; isolare le partite simultanee.
- **Cache cross-round:** opzionale `build_id + pool_hash + target_id + fusion_config_hash`, utile se certi bersagli ricorrono; applicare un limite LRU.
- Non precalcolare indiscriminatamente tutte le classifiche `90.000 × 90.000`: a `int32` richiederebbero **32,4 GB decimali**, senza overhead né più varianti.
- Per tante partite contemporanee sullo stesso target e build è possibile condividere un array immutabile; non condividerlo se cambia il pool.
- La verifica del tentativo può fare lookup nel database oppure, meglio, in una mappa pre-caricata coerente con lo snapshot.

### 10.4 Determinismo e integrità

L'ordinamento deterministico deve essere definito in modo completo:

1. bersaglio sempre primo;
2. gli altri in ordine decrescente di punteggio finale;
3. a parità di punteggio, `entry_id` crescente **o** indice di riga crescente, dichiarato nel manifest;
4. nessun arrotondamento dei punteggi prima dell'ordinamento, a meno che sia una scelta esplicita di prodotto;
5. una volta avviato, il round non cambia versione in seguito a hot reload.

Per punteggi quasi identici possono verificarsi differenze tra BLAS/hardware o dtype. Se si richiede identità assoluta tra server differenti, validare l'ordine con test cross-platform o usare ranking serializzati per bersagli selezionati.

---

## 11. Formati, memoria e benchmark prestazionali

### 11.1 Matrici e indici

Per `N=90.000` e `d=300`, solo il payload numerico della matrice occupa:

| Formato | Byte | MB decimali | MiB binari |
|---|---:|---:|---:|
| Float32 (`90k×300`) | 108.000.000 | 108,0 | ≈103,0 |
| Float16 (`90k×300`) | 54.000.000 | 54,0 | ≈51,5 |
| Float32 (`90k×1024`) | 368.640.000 | 368,64 | ≈351,6 |
| 2 matrici Float32 300d | 216.000.000 | 216,0 | ≈206,0 |
| 1 ranking `int32` di 90k | 360.000 | 0,36 | ≈0,343 |

I file `.npy` hanno un piccolo header. Mapping JSON, SQLite, cache, allocazioni temporanee e memorie dei modelli sorgenti **non** sono inclusi.

**Scelte consigliate:**

- Costruire e validare in `float32`; salvare in `.npy` contiguo con manifest e hash.
- Valutare `float16` come **variante**: può introdurre collisioni e cambiamenti d'ordine, specialmente per punteggi molto vicini. Testare `Recall@K`, overlap top-K e rank displacement prima dell'adozione.
- Usare `np.load(path, mmap_mode="r")` per condividere letture e ridurre il caricamento immediato; le pagine effettivamente usate finiscono comunque nella cache di memoria del sistema operativo.
- Usare SQLite per **lessico e metadati**, non come percorso obbligato per rileggere 90.000 BLOB a ogni tentativo.
- FAISS `IndexFlatIP` è un'alternativa per vicini esatti/top-k; per un **ranking completo** su 90.000 candidati, dot product + sort rimane una baseline estremamente semplice da misurare. Un indice ANN approssimato non garantisce il rango esatto.

### 11.2 Come misurare davvero le prestazioni

Separare quattro tempi: `load_artifacts`, `start_round_compute_ranking`, `lookup_guess` e `request_end_to_end` (inclusi framework/server/DB). Niente numeri fissi «1,2 ms» o «38 ms» senza hardware, thread, metodo e protocollo.

```python
import time
import numpy as np


def benchmark_start_round(matrix, targets, warmups=10, repeats=5):
    """Misura il tempo dot+ranking completo; ms, non latenza HTTP."""
    matrix = unit_rows(matrix)
    for t in targets[:warmups]:
        ranks_from_scores(matrix @ matrix[t], int(t))
    samples_ms = []
    for _ in range(repeats):
        for t in targets:
            t0 = time.perf_counter_ns()
            ranks_from_scores(matrix @ matrix[int(t)], int(t))
            samples_ms.append((time.perf_counter_ns() - t0) / 1e6)
    return {
        "p50_ms": float(np.percentile(samples_ms, 50)),
        "p95_ms": float(np.percentile(samples_ms, 95)),
        "p99_ms": float(np.percentile(samples_ms, 99)),
        "n": len(samples_ms),
    }
```

**Protocollo minimo:** registrare CPU, RAM, sistema operativo, librerie, implementazione BLAS, numero di thread, dtype, warmup, 100+ bersagli eterogenei, ripetizioni, concorrenza, cache calda/fredda e percentili. Il test sopra è solo il nucleo tecnico: l'API deve essere misurata a parte.

---
## 12. Pipeline di build: implementazione di riferimento

### 12.1 Separare le responsabilità

Il codice originale eseguiva soltanto `FastText → retrofitting → salvataggio`, pur descrivendo una pipeline con Model2Vec e Transformer. La build v2 distingue esplicitamente:

```text
extract_lexicon           → entries.json e hash dell'ordine
build_fasttext            → fasttext.npy
build_model2vec           → model2vec.npy, opzionale
build_transformer         → teacher.npy, opzionale
validate_embeddings      → controlli L2, finitezza, righe, mapping
publish_artifacts        → snapshot/versione immutabile
start_round              → calcolo dei ranghi col modello approvato
score_guess              → lookup nel ranking congelato
```

L'approccio **base minimo eseguibile** è FastText; gli altri rami sono opzionali ma devono passare gli stessi controlli. La specializzazione lessicale non viene eseguita implicitamente in ogni build: è una trasformazione sperimentale esplicita, che produce una nuova matrice e un nuovo manifest.

### 12.2 Formato degli input

Preparare uno snapshot TSV UTF-8 del lessico giocabile, da SQLite o da una query congelata:

```text
entry_id\tdisplay_text
101\tacqua
102\talbero
103\tcane
104\tgatto
```

La prima riga è l'header, il file contiene **una riga per entry giocabile**, non una per alias o forma flessa. Gli `entry_id` sono positivi, univoci e stabili; `display_text` non è vuoto. Prima dell'estrazione gli alias vanno risolti a livello DB e le ambiguità bloccanti revisionate.

### 12.3 Script di build B0 completo

Questo file Python può essere salvato come `build_fasttext_runtime.py`. Genera una matrice FastText, mapping e manifest coerenti, verifica i vettori e pubblica in una directory nuova. **Non** pretende di eseguire Model2Vec o Transformer: le loro build sono descritte separatamente.

```python
#!/usr/bin/env python3
"""Build offline baseline FastText per ZeroContext.

Uso:
  python build_fasttext_runtime.py \
    --entries entries.tsv \
    --fasttext-model models/cc.it.300.bin \
    --output runtime_builds/b0_2026_11_16
"""
import argparse
import csv
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_payload(entries: list[dict]) -> bytes:
    return json.dumps(
        entries, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def read_entries(tsv: Path) -> list[dict]:
    with tsv.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        if reader.fieldnames != ["entry_id", "display_text"]:
            raise ValueError("Header richiesto: entry_id<TAB>display_text")
        entries = []
        for line in reader:
            entry = {
                "entry_id": int(line["entry_id"]),
                "display_text": line["display_text"].strip(),
            }
            if entry["entry_id"] <= 0 or not entry["display_text"]:
                raise ValueError("Entry non valida")
            entries.append(entry)
    if not entries:
        raise ValueError("Lessico vuoto")
    entries.sort(key=lambda x: x["entry_id"])
    ids = [x["entry_id"] for x in entries]
    if len(set(ids)) != len(ids):
        raise ValueError("entry_id duplicato")
    return entries


def normalize_rows(matrix: np.ndarray) -> np.ndarray:
    matrix = np.asarray(matrix, dtype=np.float32)
    if matrix.ndim != 2 or not np.isfinite(matrix).all():
        raise ValueError("Matrice non finita / forma non valida")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if (norms <= 1e-12).any():
        raise ValueError("Vettore nullo")
    matrix = matrix / norms
    return np.ascontiguousarray(matrix, dtype=np.float32)


def build(entries_path: Path, model_path: Path, output: Path) -> None:
    import fasttext  # caricato solo nella build offline

    if output.exists():
        raise FileExistsError(f"Build già esistente: {output}")
    if not entries_path.is_file() or not model_path.is_file():
        raise FileNotFoundError("Manca il TSV o il modello FastText")

    entries = read_entries(entries_path)
    vocab_bytes = canonical_payload(entries)
    vocab_hash = hashlib.sha256(vocab_bytes).hexdigest()
    model = fasttext.load_model(str(model_path))
    rows = [model.get_word_vector(e["display_text"]) for e in entries]
    matrix = normalize_rows(np.asarray(rows, dtype=np.float32))
    if matrix.shape != (len(entries), 300):
        raise ValueError(f"Atteso FastText 300d, trovato {matrix.shape}")

    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".build_", dir=output.parent))
    try:
        (stage / "entries.json").write_bytes(vocab_bytes)
        np.save(stage / "fasttext.npy", matrix, allow_pickle=False)
        manifest = {
            "schema_version": "2.0",
            "build_id": output.name,
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "model": "fasttext_cc_it_300_bin",
            "vocab_sha256": vocab_hash,
            "entries_count": len(entries),
            "shape": list(matrix.shape),
            "dtype": str(matrix.dtype),
            "row_order": "entry_id_ascending",
            "tie_policy": "target_first_then_row_ascending",
            "normalization": "L2_float32",
            "files": {
                "entries.json": sha256_file(stage / "entries.json"),
                "fasttext.npy": sha256_file(stage / "fasttext.npy"),
            },
            "source_model_path": str(model_path),
            "source_model_sha256": sha256_file(model_path),
            "validation_status": "pending_benchmark",
        }
        (stage / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(stage, output)  # stesso filesystem, path finale inesistente
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    print(f"Build generata: {output} | entries={len(entries)}")
    print(f"NB: validazione linguistica ancora necessaria; non pubblicare automaticamente.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--entries", required=True, type=Path)
    parser.add_argument("--fasttext-model", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    build(args.entries, args.fasttext_model, args.output)


if __name__ == "__main__":
    main()
```

**Caratteristiche e limiti dello script:**

- È eseguibile dopo installazione delle dipendenze e disponibilità del modello FastText; per 90.000 parole il modello sorgente può richiedere molta RAM nella fase di build.
- La riga NumPy viene dall'ordine crescente di `entry_id`, **mai** dall'ordine restituito in modo accidentale da SQLite.
- Il contenuto del modello sorgente è hashato per tracciabilità; l'hash di file molto grandi richiede I/O aggiuntivo durante la build.
- L'output è una **build candidata**, non è automaticamente approvata per essere attivata nel gioco.
- La pubblicazione atomica della directory è appropriata su filesystem locale e destinazione inesistente. Su network filesystem/Windows usare una procedura di deploy verificata e un puntatore di versione aggiornato solo dopo validazione.

### 12.4 Aggiunta opzionale di M1 e T1 (build offline)

Per **ogni** modello aggiuntivo, leggere `entries.json` della build base e generare `model2vec.npy` oppure `teacher.npy` nello stesso ordine:

```python
import json
from pathlib import Path
import numpy as np

build_dir = Path("runtime_builds/b0_2026_11_16")
entries = json.loads((build_dir / "entries.json").read_text("utf-8"))
words = [entry["display_text"] for entry in entries]

# ESEMPIO M1: la distillazione avviene una volta, offline.
from model2vec.distill import distill
m2v = distill(
    model_name="BAAI/bge-m3",
    vocabulary=words,
    pca_dims=300,
    sif_coefficient=1e-4,
    quantize_to="float32",
)
M_m2v = normalize_rows(np.asarray(m2v.encode(words), dtype=np.float32))
assert M_m2v.shape[0] == len(entries)
# Conservare in una build DERIVATA distinta, non alterare la baseline immutabile.
```

Per T1 il processo è analogo usando `SentenceTransformer.encode(...)`; nel manifest della build derivata registrare `parent_build_id`, teacher/versione/revisione Hugging Face, hash dei file, configurazione di pooling, matrice, scelte di precisione e dataset di validazione. **Non sovrascrivere** il manifest o gli artefatti di una build già pubblicata. Se la libreria non restituisce la dimensionalità richiesta, interrompere la build e revisionare la configurazione: non troncarsi le colonne da soli.

Per applicare una specializzazione, richiamare esplicitamente `specialize_embeddings(...)` del §9 soltanto su una **matrice scelta**, registrare i grafi e i parametri, confrontare `S1/S2` contro la relativa baseline e pubblicare una **versione derivata**.

### 12.5 Caricamento runtime con verifica di integrità

```python
import json
from pathlib import Path
import numpy as np


def load_baseline_build(build_dir: str):
    folder = Path(build_dir)
    manifest = json.loads((folder / "manifest.json").read_text("utf-8"))
    for name, expected_sha in manifest["files"].items():
        if sha256_file(folder / name) != expected_sha:
            raise ValueError(f"Artefatto corrotto: {name}")
    entries = json.loads((folder / "entries.json").read_text("utf-8"))
    matrix = np.load(folder / "fasttext.npy", mmap_mode="r", allow_pickle=False)
    if list(matrix.shape) != manifest["shape"]:
        raise ValueError("Dimensioni matrice incoerenti")
    if len(entries) != matrix.shape[0]:
        raise ValueError("Mapping righe errato")
    entry_to_row = {item["entry_id"]: i for i, item in enumerate(entries)}
    if len(entry_to_row) != len(entries):
        raise ValueError("IDs duplicati")
    return manifest, entries, matrix, entry_to_row
```

Nel progetto reale queste funzioni devono essere raccolte in moduli importabili. L'esempio `load_baseline_build` presuppone che `sha256_file` sia importata dal modulo di build; **non** è una licenza per saltare la verifica degli hash o caricare un file sconosciuto con `allow_pickle=True`.

### 12.6 Prove automatiche indispensabili

```python
import numpy as np


def test_ranking_invariants():
    M = unit_rows(np.array([
        [1.0, 0.0],
        [0.8, 0.6],
        [0.0, 1.0],
        [1.0, 0.0],  # vettore identico al bersaglio: tie
    ], dtype=np.float32))
    ranks = ranks_from_scores(M @ M[0], target_row=0)
    assert ranks[0] == 1
    assert sorted(ranks.tolist()) == [1, 2, 3, 4]
    assert ranks[3] == 2


def test_late_fusion_invariants():
    A = unit_rows(np.array([[1., 0.], [0.5, 0.866], [0., 1.]]))
    B = unit_rows(np.array([[1., 0.], [0., 1.], [0.8, 0.6]]))
    ranks, scores = fused_round_ranks([A, B], 0, [0.5, 0.5])
    assert ranks[0] == 1
    assert sorted(ranks.tolist()) == [1, 2, 3]
    assert np.isfinite(scores).all()


def test_morphology_lookup():
    # alias flessivo approvato: non occupa una seconda posizione
    aliases = {"cane": 103, "cani": 103}
    entry_to_row = {103: 0, 104: 1}
    ranks = np.array([1, 2], dtype=np.int32)
    assert score_guess(" CANI ", ranks, aliases, entry_to_row)["rank"] == 1
```

Eseguire anche test su vettori tutti nulli, `NaN/Inf`, righe non allineate, tentativi inesistenti, forme accentate, campioni con omografi, limiti del pool e aggiornamenti di build mentre un round è in corso. I test di codice **non sostituiscono** la validazione linguistica.

---

## 13. Valutazione linguistica, ludica e regressioni

### 13.1 Benchmark linguistici pubblici

Usare quando disponibili risorse italiane (o adattamenti tracciabili) di **SimLex-999** e **WordSim-353**, prestando attenzione al fatto che similarità e relatedness sono obiettivi diversi [R8]. Valutare copertura del lessico, omografi, lemmi e concordanza delle etichette. **Non inventare punteggi**: `Spearman ρ` e intervalli di confidenza vanno misurati.

Non ottimizzare un modello esclusivamente su un benchmark semantico se il gioco premia anche affinità funzionali e tematiche.

### 13.2 Benchmark interno ZeroContext

**Campione iniziale consigliato (da modificare in base ai risultati):** almeno 500 bersagli, stratificati per frequenza, categoria grammaticale, densità semantica, polisemia, domini tematici e difficoltà stimata. Mantenere un test finale cieco e separato dalle regolazioni.

Per ogni bersaglio valutare almeno:

1. **Top-10 e Top-50**: pertinenza umana delle parole più vicine.
2. **Fasce di classifica**: audit di campioni top-100, 101–1.000, fascia media e fondo.
3. **Relazioni problematiche**: antonimi, iperonimi, plurali, omografi e affinità solo ortografiche.
4. **Esperienza di gioco**: ragionevolezza dei suggerimenti, numero di tentativi, round troppo facili/difficili, parole «impossibili», feedback soggettivo.
5. **Equità e coerenza**: stesso tentativo = stesso rango nel round; nessun vantaggio dovuto a grafie alternative duplicate.

### 13.3 Rubrica di giudizio umano

La seguente scala è **proposta operativa**; deve essere spiegata ai revisori:

| Valore | Significato della relazione fra candidato e bersaglio |
|---:|---|
| 0 | Scollegata, ingannevole, solo assonanza/errore |
| 1 | Legame debole o molto indiretto |
| 2 | Associazione contestuale o tematica ragionevole |
| 3 | Legame forte, funzionale, gerarchico o concettuale |
| 4 | Legame immediato, molto vicino per il gioco |

Usare almeno due revisori su un sottoinsieme significativo e misurare accordo inter-valutatore. Etichettare anche il **tipo di relazione**: un antonimo può ottenere un valore elevato come associazione, pur non essendo un sinonimo. Evitare di confondere «vicino in classifica» con «corretto come sinonimo».

### 13.4 Metriche proposte

| Metrica | Che cosa evidenzia | Cautela |
|---|---|---|
| `Spearman ρ` | Allineamento a benchmark di giudizi umani | Dipende dalla copertura del dataset |
| `nDCG@10`, `nDCG@50` | Qualità del ranking con giudizi graduati | Richiede giudizi sui candidati, meglio se pool condiviso fra modelli |
| `Precision@K` o proporzione `relevance≥3` | Pertinenza percepita vicino al target | Dipende dalla soglia umana scelta |
| `Top-K overlap / Jaccard` | Stabilità tra modelli e versioni | Non è di per sé qualità |
| `Rank displacement` | Cambiamento di posizione di parole sentinella | Segmentare per frequenza/POS |
| `OOV error rate` | Punti deboli lessicali reali | Non usare la norma unitaria come proxy semantico |
| `Round completion / tentativi` | Difficoltà effettiva delle partite | Controllare esperienza dei giocatori e caratteristiche dei bersagli |
| `p50/p95/p99` | Tempo di calcolo e risposta | Specificare quale fase si misura |

**Attenzione a nDCG:** se si giudicano soltanto i top-10 di un modello, il confronto è distorto. Costruire un *pooled judging set* dai top-K di **tutti** i candidati e da campioni di altre fasce, poi calcolare le metriche sullo stesso insieme di giudizi. Per stime di nDCG su un intero ranking con giudizi incompleti, dichiarare esplicitamente l'approssimazione.

### 13.5 Esempio per nDCG@K su giudizi completi di un pool

```python
import numpy as np


def ndcg_at_k(relevance_in_rank_order, k=10):
    rel = np.asarray(relevance_in_rank_order, dtype=np.float64)
    if (rel < 0).any():
        raise ValueError("Rilevanze negative")
    k = min(k, len(rel))
    discounts = np.log2(np.arange(2, k + 2, dtype=np.float64))
    dcg = np.sum((np.power(2.0, rel[:k]) - 1.0) / discounts)
    ideal = np.sort(rel)[::-1]
    idcg = np.sum((np.power(2.0, ideal[:k]) - 1.0) / discounts)
    return float(dcg / idcg) if idcg > 0 else 0.0
```

Questa funzione presuppone che `rel` contenga la rilevanza **di tutti i candidati del pool valutato**, nell'ordine proposto dal modello; non alimentarla con valori mancanti trattati implicitamente come zero.

### 13.6 Soglie di accettazione: non inventarle

Le soglie non devono essere copiate dalla prima guida (`μcos` fra 0,05 e 0,15, OOV `cos≥0,65`, margini fissi sui contrari), perché non sono criteri universali. Definire prima un **baseline report** e poi obiettivi misurati.

**Gate minimo di qualità proposto:**

- nessun errore bloccante su shape, finitezza, mapping, hash, rango del bersaglio e unicità dei ranghi;
- copertura completa delle voci giocabili o esclusioni motivate;
- nessun peggioramento critico nelle parole sentinella e nei test lessicali obbligatori;
- una variante complessa deve ottenere un miglioramento misurabile rispetto a B0 nel benchmark umano o nella giocabilità, senza regressioni gravi;
- validazione finale su set cieco e registrazione dell'esito.

I valori numerici di `nDCG`, percentuali di accettazione e p95 verranno fissati **dopo il primo benchmark**, non prima.

### 13.7 Schede di regressione con esempi

Creare un file versionato `sentinel_pairs.csv` con colonne:

`target, candidate, relation, expected_behavior, priority, notes`.

Esempi da **ispezionare**, non imporre rigidamente:

- `caldo`–`freddo`–`tiepido` (antonimia vs gradazione);
- `mare`–`spiaggia`–`oceano` (associazione vs similarità);
- `cane`–`gatto`–`animale` (categoria e co-iponimi);
- `chiave`–`serratura` (funzione);
- `pesca`–`albicocca`–`amo` (polisemia);
- `braccio`–`braccia`, `osso`–`ossa` (morfologia e significato);
- `notte`–`giorno` (opposti con dominio comune).

Non trasformare queste sentinelle in vincoli di addestramento e contemporaneamente usarle come test cieco: si verificherebbe *data leakage*.

---
## 14. Riproducibilità, sicurezza e rilascio

### 14.1 Manifest minimo di build

Ogni release include almeno i dati seguenti (campi esemplificativi):

```json
{
  "schema_version": "2.0",
  "build_id": "f1_2026_11_16_abcd1234",
  "parent_build_id": "b0_2026_11_16",
  "status": "candidate",
  "vocab_sha256": "<hash reale al momento della build>",
  "entries_count": 90000,
  "model_components": [
    {
      "name": "fasttext",
      "model_revision": "<identificatore verificato>",
      "dimensions": 300,
      "weight": 0.50
    },
    {
      "name": "model2vec",
      "model_revision": "<identificatore verificato>",
      "dimensions": 300,
      "weight": 0.50
    }
  ],
  "fusion": {"type": "rrf", "k": 60.0},
  "normalization": "L2_float32",
  "tie_policy": "target_first_then_row_ascending",
  "benchmark_id": "<id report di validazione>",
  "files_sha256": {},
  "license_audit_id": "<id controllo licenze>"
}
```

I valori fra `<...>` sono **segnaposto documentali**, da riempire con dati verificati, non valori accettabili in un vero manifest. Non attivare una release che conservi segnaposto.

### 14.2 Riproducibilità

Registrare:

- versioni esatte di Python, NumPy, FastText, Model2Vec, PyTorch, Transformers/SentenceTransformers e FAISS se usato;
- checksum degli input, checkpoint del modello sorgente e dataset dei grafi;
- configurazione completa di pre-processing, tokenizzazione, lemmi/alias, politica plurali;
- seed per tutte le procedure stocastiche e note su determinismo CUDA/BLAS;
- shape/dtype/endianness, criterio di normalizzazione, mapping ordinato `entry_id → row`;
- hash degli artefatti, benchmark, annotatori/metodologia, decisione di rilascio;
- licenze di modelli, corpora, dizionari, grafi e definizioni.

### 14.3 Controlli di sicurezza e protezione dei dati

- Trattare i file scaricati e le definizioni esterne come **dati non attendibili**; preferire formati non eseguibili (`.npy` con `allow_pickle=False`, JSON validato) e fonti autorevoli.
- Evitare `trust_remote_code=True` salvo necessità documentata, provenienza verificata e ambiente isolato.
- Usare directory di output con permessi corretti; una build generata non deve poter sovrascrivere la produzione accidentalmente.
- Conservare nelle telemetrie soltanto i dati utili al miglioramento del ranking, applicando adeguata minimizzazione e policy di retention.
- Se il gioco rende pubblico il rango completo o molti tentativi, considerare l'eventuale ricostruibilità del bersaglio; la logica anti-cheat è separata dall'embedding.

### 14.4 Ciclo di rilascio e rollback

1. Generare build immutabile in area staging.
2. Eseguire QA numerico e lessicale.
3. Eseguire benchmark e ablation; redigere report con motivazioni della scelta.
4. Approvare `build_id` e aggiornare **un puntatore attivo** (non sostituire file in uso).
5. I nuovi round leggono il puntatore; i round avviati continuano con il vecchio `build_id`.
6. Monitorare metriche di qualità ed errori; se necessario riportare il puntatore alla versione precedente.
7. Archiviare manifest, artefatti e report per riprodurre qualsiasi round contestato.

### 14.5 Struttura suggerita del repository

```text
zerocontext-semantics/
├── docs/
│   └── ARCHITETTURA_VETTORI_SEMANTICI_v2.md
├── config/
│   ├── lexical_policy.yaml
│   ├── model_candidates.yaml
│   └── evaluation_protocol.yaml
├── src/
│   ├── lexicon_export.py
│   ├── build_fasttext_runtime.py
│   ├── build_model2vec.py
│   ├── build_teacher.py
│   ├── specialize.py
│   ├── fusion.py
│   ├── ranking.py
│   └── validate_artifacts.py
├── evaluation/
│   ├── targets_split.csv
│   ├── sentinel_pairs.csv
│   ├── judgments.csv
│   └── report_schema.json
├── tests/
│   ├── test_lexicon.py
│   ├── test_ranking.py
│   ├── test_model_mapping.py
│   ├── test_specialization.py
│   └── test_release.py
└── runtime_builds/
    └── <build_id>/
        ├── entries.json
        ├── *.npy
        └── manifest.json
```

Questa è una **struttura proposta**, non una descrizione verificata del repository attuale. L'integrazione reale richiede il confronto con il codice sorgente del gioco, la sua gestione degli ID e il suo sistema di round.

---

## 15. Piano di adozione per ZeroContext

| Fase | Attività | Output verificabile | Condizione di uscita |
|---|---|---|---|
| **P0 — Lessico** | Congelare entry/alias/POS, auditing plurali e omografie | Snapshot + hash + test | Mapping e regole approvati |
| **P1 — Baseline** | FastText 300d, `.npy`, manifest, ranking per round | Build B0 funzionante | Test numerici e round superati |
| **P2 — Benchmark** | Campione 500+ bersagli, giudizi e sentinelle | Report B0 e protocollo | Benchmark replicabile |
| **P3 — Candidati** | Model2Vec, teacher offline, statistico SVD | Build M1/T1/B1 | Confronto a parità di lessico |
| **P4 — Fusione** | RRF e score-z con pesi selezionati su validation | Build F1 | Guadagno sul test cieco |
| **P5 — Specializzazione** | Sinonimi, poi antonimi come ablation | Build S1/S2 | Nessuna regressione ludica grave |
| **P6 — Produzione** | Cache per round, monitoraggio e rollback | Release approvata | Prestazioni e qualità stabili |

### Decisioni architetturali iniziali raccomandate

1. **Partire da B0**, evitando di imporre subito Model2Vec, grafo di antonimi e FAISS.
2. **Tenere SQLite come lessico canonico**; matrici e manifest restano artefatti numerici separati.
3. **Calcolare il ranking una volta per round**; nessuna inferenza a ogni tentativo.
4. **Mantenere l'ibrido singolari/plurali**, con eccezioni lessicali verificabili.
5. **Scegliere la fusione in base a benchmark ciechi**, non a pesi arbitrari o al nome del modello.
6. **Gestire polisemia per priorità**, iniziando dalle parole che generano ranking più assurdi.
7. **Non introdurre repulsione dei contrari come regola universale**: verificarne l'effetto sulle associazioni.
8. **Preferire un sistema semplice e misurato** rispetto a un'architettura complessa non validata.

### Cosa significa «pronto per la produzione»

Questa guida è una **specifica tecnica con codice di riferimento**, non la prova che ogni variante sia già implementata o testata sull'applicazione esistente. La milestone P6 è raggiunta solo quando esistono una build approvata, test reali, un'integrazione funzionante e un piano di rollback esercitato.

---

## 16. Correzioni rispetto alla prima versione

| Area originale | Problema risolto nella v2 |
|---|---|
| Architettura «a tre stadi» con quattro blocchi | Sostituita con pipeline build/runtime e ablation esplicite |
| «Paradosso degli antonimi» come soglia fissa | Distinti significato, associazione e opposizione senza threshold inventate |
| «Collasso» inevitabile dei Transformer | Descritto come rischio misurabile, dipendente da modello e pooling |
| Model2Vec presentato come comprensione contestuale completa | Chiarito che produce rappresentazioni statiche |
| Parametri `pca_to_dimension`, `apply_zipf`, `use_subword` | Corretti nel percorso API illustrato con `pca_dims`, `sif_coefficient`, `quantize_to` |
| FastText descritto come fallback combinabile direttamente | Distinzione fra spazi separati, late fusion e allineamento sperimentale |
| Retrofitting con gradiente NumPy non coerente | Introduzione di loss esplicita e ottimizzatore PyTorch |
| Repulsione degli antonimi sempre desiderabile | Riformulata come esperimento confrontato con variante senza repulsione |
| Prompt averaging indicato come soluzione alla polisemia | Sostituito con approccio per accezione e review delle definizioni |
| Singolari/plurali non formalizzati | Schema lemma–entry–alias con eccezioni lessicalizzate |
| Matrice e mapping non versionati | `entry_id → row`, build immutabile, hash e manifest |
| Script finale che usava solo FastText ma prometteva modelli misti | Baseline B0 **esplicita**, build M1/T1 separate e fusione definita |
| Tempi `.npy`/FAISS/SQLite presentati come misure certe | Dimensioni esatte e protocollo benchmark, senza latenza inventata |
| Norme e coseni con threshold universali | Controlli invarianti + metriche stimate e benchmark ciechi |
| Validazione limitata a tre test | QA linguistico/ludico, nDCG, giudizi umani, sentinelle e release gate |
| Nessuna strategia multi-round | Ranking calcolato una volta e congelato durante la partita |

---

## 17. Fonti e riferimenti

Fonti controllate per questa revisione, consultate il **16 novembre 2026**. Link tecnici e accademici sono riportati per consentire verifiche alla versione effettivamente installata. Le impostazioni proposte per ZeroContext sono decisioni progettuali, **non risultati dimostrati dalle fonti**.

- **[R1] Model2Vec — Distillation API e parametri:** https://minish.ai/packages/model2vec/distillation/
- **[R2] FastText — Word vectors for 157 languages e OOV:** https://fasttext.cc/docs/en/crawl-vectors.html
- **[R3] Model2Vec — tecnica e limiti delle rappresentazioni statiche:** https://minish.ai/packages/model2vec/introduction/
- **[R4] BAAI/bge-m3 — model card, multilingua e 1024d:** https://huggingface.co/BAAI/bge-m3
- **[R5] Faruqui et al. (2015), *Retrofitting Word Vectors to Semantic Lexicons*:** https://aclanthology.org/N15-1184/
- **[R6] Mrkšić et al. (2016), *Counter-fitting Word Vectors to Linguistic Constraints*:** https://aclanthology.org/N16-1018/
- **[R7] Mrkšić et al., *Semantic Specialisation of Distributional Word Vector Spaces using Monolingual and Cross-Lingual Constraints* (Attract-Repel):** https://aclanthology.org/Q17-1022/
- **[R8] Dataset di similarità lessicale in più lingue, inclusa l'italiana:** https://lcl.uniroma1.it/similarity-datasets/
- **[R9] FAISS — indice `IndexFlatIP` esatto e caratteristiche degli indici:** https://github.com/facebookresearch/faiss/wiki/Faiss-indexes
- **[R10] NumPy — formati `.npy` e caricamento memory-mapped:** https://numpy.org/doc/stable/reference/generated/numpy.load.html

### Nota finale

Le scelte che determinano davvero la riuscita del gioco sono **qualità del lessico**, **giudizi di pertinenza umani**, **confronto tra rappresentazioni**, **politica di ranking**, **coerenza durante il round**. La pipeline numerica è un mezzo, non il criterio di qualità finale.

---

## 18. Selezione delle segrete e curva termica

Integrato dalla prima specifica semantica (16 novembre 2026), che non è più un file a parte. Le parti sulle
architetture dei vettori e sul retrofitting sono già nelle sezioni 5–9; qui restano i criteri che decidono **quali
parole possono essere segrete**, il punteggio termico e ciò che è stato sospeso.

### 18.1 Frequenza Zipf

La scala usata è quella standard di *wordfreq*: $\text{Zipf} = \log_{10}(\text{frequenza per miliardo di parole})$.
Il «$+3$» che compariva nella definizione iniziale era un refuso: esempi e somme delle frequenze verbali vanno letti
sulla scala standard.

### 18.2 Pool ordinario

Dal 16 novembre 2026 il pool ordinario include le parole con $1.80 \le \text{Zipf} \le 2.50$ (prima $[2.00, 2.40]$).
Il task *Zerocade : Generazione parole segrete* applica questa finestra. Il vocabolario di riferimento è il Nuovo
Vocabolario di Base di De Mauro (NVdB: fondamentale **FO**, alto uso **AU**, alta disponibilità **AD**), con queste regole:

| Caso | Regola |
| --- | --- |
| Parola **AD** con $\text{Zipf} < 1.80$ (*scolapasta, cavatappi, pinzetta*) | Promossa in deroga: la notorietà dell'oggetto comune prevale sulla bassa frequenza scritta |
| Sostantivo **AU** con $2.50 < \text{Zipf} \le 3.20$ (*cardine, perno, cerniera*) | Ammesso in deroga |
| Parola **FO** (circa $\text{Zipf} \ge 4.5$) | Esclusa dalle segrete, per non banalizzare la scalata |
| Verbo | Si usa la frequenza aggregata delle forme attestate (sotto): ammesso se $\text{Zipf}_{\text{att}} \ge 1.80$; la soluzione è l'infinito presente |
| Densità media dei 100 vicini | $D_{100}(w) = \frac{1}{100}\sum_{v \in \mathcal{N}_{100}(w)} \cos(\vec w, \vec v) \ge 0.45$ |
| Ponti semantici | Almeno **10** vicini tra i 100 con $\text{Zipf} \ge 4.0$ |

**Frequenza aggregata dei verbi.** Il solo infinito sottostima i verbi molto usati nelle loro flessioni. Detto
$\mathcal{F}_{\text{att}}(v)$ l'insieme delle forme flesse attestate nei corpora morfologici (*Morph-it!*, *CoLFIS*):

$$F_{\text{att}}(v) = \sum_{f \in \mathcal{F}_{\text{att}}(v)} 10^{\text{Zipf}(f)}, \qquad \text{Zipf}_{\text{att}}(v) = \log_{10} F_{\text{att}}(v)$$

Le forme si deduplicano, l'infinito compreso; una frequenza assente non viene inventata. Esempi: *ghermire*
($\text{Zipf}_{\text{att}} \approx 2.28$, infinito $\approx 1.92$), *lambire* ($\approx 2.35$, infinito $\approx 1.96$).
Esempi per categoria: *imbuto* ($\approx 2.32$, AD), *alambicco* ($\approx 2.38$, sostantivo concreto), *bruma* ($\approx 2.31$, astratto).

### 18.3 Curva termica

Il coseno si rimappa su una scala 0–100 per renderlo leggibile ai giocatori:

$$S = \left(\frac{\max(0, \cos(\vec u, \vec v) - s_0)}{1 - s_0}\right)^{\gamma} \times 100$$

Nei round ordinari $s_0 = 0.10$ e $\gamma = 1.15$. Classifica e temperatura usano il coseno puro, senza boost o
penalità aggiuntive; le posizioni restano visibili.

### 18.4 Round speciale (sospeso)

La prima specifica prevedeva un round speciale ogni nove round, con soluzioni a $\text{Zipf} \approx 1.90$. **È sospeso**:
tutte le segrete sono ordinarie, nono e diciottesimo round compresi; il server non lo attiva e la regia non lo offre.
Il codice survival resta per compatibilità e test. Se tornasse, i parametri previsti erano:

| Parametro | Valore |
| --- | --- |
| Finestra | $1.85 \le \text{Zipf} \le 2.05$ (verbi: $\text{Zipf}_{\text{att}}$ nella stessa finestra) |
| Fine round | $t \ge 180\ \text{s}$, oppure 100 tentativi validi e distinti, oppure risposta esatta |
| Densità e ponti | $D_{100} \ge 0.48$; almeno 15 vicini con $\text{Zipf} \ge 3.8$ |
| Curva termica | $s_0 = 0.07$, $\gamma = 1.05$ |
| Punteggio | $2500 \times \bigl(1 + 0.60\,\frac{180 - t}{180} + 0.40\,\frac{100 - N}{100}\bigr)$, massimo teorico 5.000 |
| Anti-monosettoriale | Scartati i suffissi tecnici (*-ite, -osi, -asi, -ato, -uro, -morfismo, -ectomia, -terapia, -metria, -scopia, -fagia, -logia*); ammessi solo domini espressivi (carattere e morale, stati d'animo, descrizioni evocative, manufatti non industriali: *pusillanime, inedia, caduco, chincaglieria*), accreditati in `resources/semantic-domains.json` |

Le quantità indicative di allora (circa 6.200 ordinarie e 520 speciali) erano stime, non risultati: non si abbassano
densità, ponti o soglie per raggiungerle. Il pool speciale conforme conteneva 3 lemmi (*monile, probità, suppellettile*).

### 18.5 Conservazione delle segrete

Vincolo dell'utente: **le segrete non diminuiscono**. Le vecchie soluzioni che non superano i filtri restano estraibili
nel pool ordinario, in deroga di compatibilità, e la deroga è registrata in `context__targets.details`. Le nuove
ammissioni applicano invece i filtri. La pubblicazione si blocca se manca anche una sola segreta precedente: il
controllo confronta i nomi, non i conteggi, quindi anche una sostituzione a numero invariato viene fermata. Prima
pubblicazione: 9.513 segrete, comprese tutte le 6.838 precedenti.

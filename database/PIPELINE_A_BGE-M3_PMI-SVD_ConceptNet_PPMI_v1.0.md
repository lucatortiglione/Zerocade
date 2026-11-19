# Pipeline A — BGE-M3 + PMI/SVD + ConceptNet + PPMI

> **Specifica tecnica v1.0 — 18 novembre 2026**  
> **Stato:** proposta progettuale, non benchmark validato.  
> **Scopo:** trovare e ordinare le parole italiane più vicine a un lemma, distinguendo *similarità semantica* e *associazione tematica*, con risultati riproducibili e spiegabili.

## 1. Obiettivo e confini

Questa pipeline combina **BGE-M3 (dense) + PMI/SVD + ConceptNet + PPMI** per ottenere, data una parola italiana, una classifica di termini semanticamente o concettualmente collegati. È pensata per giochi quali ZeroContext e Word Association, ma il nucleo deve restare indipendente dalle regole del singolo gioco.

**Non si deve confondere**: (a) la parola lessicalmente valida, (b) la parola semanticamente vicina, (c) una parola facile da indovinare. Validità e familiarità restano filtri o attributi separati, non sostituiti dal punteggio di somiglianza.

### Modalità di ricerca

- `similarity`: sinonimia, analogia e prossimità di significato; limita associazioni puramente occasionali.
- `association`: oggetti, azioni, luoghi e proprietà tipicamente collegati alla parola, anche se non sinonimi.
- `balanced` (**predefinita**): combina entrambi i segnali, con deduplicazione e controllo di qualità.

Esempio illustrativo, **non output misurato**: `mare` → simili: `oceano`; associati: `spiaggia`, `onda`, `barca`.

## 2. Architettura generale

```text
Dizionario canonico italiano (lemma, POS, accezione, licenza, frequenza)
             │
             ├─ validazione/normalizzazione linguistica
             │        (NFC, maiuscole, accenti, lemma/POS, stoplist)
             │
Corpus italiano autorizzato ── tokenizzazione/lemmatizzazione
             │                        │
             │                        ├─ conteggi parola-contesto
             │                        ├─ matrice PMI → SPPMI → SVD
             │                        └─ PPMI diretta
             │
BGE-M3 (dense, 1024d) ── embedding per lemma / accezione ── FAISS
             │
ConceptNet assertions ── grafo italiano filtrato
             │
             └─ retrieval separato top-K → unione candidati
                                      → filtri POS/lemmi/forme
                                      → scoring calibrato
                                      → reranking e diversificazione
                                      → output JSON / SQLite
```

**Unità del sistema:** `lemma + POS + (sense_id opzionale)`. Forme flesse diverse non devono essere trattate automaticamente come lemmi distinti. L'analisi POS può essere **ambigua** (`porta` può essere nome o forma verbale): conservare tutte le letture valide e applicare il filtro alla lettura richiesta, non alla superficie in modo indiscriminato.

## 3. Componenti del punteggio

| Sigla | Metodo | Cosa cattura | Uso nel ranking |
|---|---|---|---|
| `E` | **BGE-M3** | Vicinanza concettuale nei vettori neurali multilingue | Recupero di candidati e similarità coseno |
| `D` | **PMI + SVD** | Relazioni distribuzionali latenti e vicinanza di secondo ordine | Vicini densi in uno spazio creato sul corpus |
| `G` | **ConceptNet** | Relazioni esplicite tra concetti, comprese associazioni non sinonimiche | Bonus informato dal tipo di relazione |
| `C` | **PPMI diretta** | Forza dell'associazione di co-occorrenza osservata | Bonus di collocazione, senza riduzione SVD |

**Attenzione alla correlazione:** PMI+SVD e PPMI diretta derivano dagli stessi conteggi. Non sono quattro voti indipendenti: il guadagno reale della loro combinazione va verificato con uno studio di ablazione.

## 3A. Backend principale: BGE-M3

**Identificativo modello:** `BAAI/bge-m3` (documentato dall'autore come multilingue, embedding dense da **1024 dimensioni**; supporta anche sparse e multi-vector, non inclusi nella baseline per evitare un quinto segnale). Per questo progetto usare inizialmente il **solo dense embedding**. Modello pubblicato per retrieval di testi: **l'uso su lemmi isolati va validato empiricamente**.

### Strategie di rappresentazione da confrontare

- **A – lemma nudo (baseline):** `"mare"`.
- **B – contesto linguistico stabile:** `"Parola italiana: mare. Categoria grammaticale: sostantivo."`.
- **C – accezione esplicita:** definizione breve, se licenziata, per disambiguare la polisemia; **non confrontare** vettori lemma-nudo con vettori delle definizioni come se provenissero da una stessa distribuzione senza test.

Confrontare A/B/C sullo stesso benchmark. Per la baseline usare **una rappresentazione uniforme per tutti i lemmi** e `max_length` adeguato al testo (non servono 8192 token per una parola). Normalizzare L2 tutti i vettori prima dell'indicizzazione; prodotto scalare sui vettori normalizzati = coseno.

```python
# Esempio minimo di pre-calcolo della componente E.
# Da eseguire dopo aver installato il pacchetto e ottenuto il modello.
import numpy as np
from FlagEmbedding import BGEM3FlagModel

model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)
lemmas = ["mare", "oceano", "spiaggia"]
vecs = model.encode(lemmas, batch_size=16, max_length=64)["dense_vecs"]
vecs = np.asarray(vecs, dtype=np.float32)
vecs /= np.maximum(np.linalg.norm(vecs, axis=1, keepdims=True), 1e-12)
scores = vecs @ vecs[0]
```

- Su CPU, cambiare `use_fp16=False` se necessario; documentare device, versione del pacchetto e revisione del modello.
- Usare batching durante l'import e un indice FAISS su vettori normalizzati per retrieval top-K.
- Non usare come prova di superiorità per singole parole i punteggi di benchmark costruiti su frasi o documenti.
- La modalità `sparse` di BGE-M3 è una **sperimentazione separata**: includerla senza ablazione potrebbe duplicare la componente PMI/PPMI.

## 4. Semantica distribuzionale: PMI + SVD e PPMI

### 4.1 Corpus e matrice di co-occorrenza

1. Scegliere corpora italiani con provenienza e licenza documentate; registrare versioni e date.
2. Segmentare per documento; normalizzare Unicode NFC; lemmatizzare con POS disambiguato quando disponibile.
3. Costruire una matrice sparsa `X[w,c]` di conteggi parola-contesto; parametro iniziale: finestra simmetrica ±5 token, stopword rimosse **dai contesti**; confrontare anche ±2 e ±10.
4. Registrare `window_size`, tipo di contesto (`token` / `lemma` / `dependency`), soglia minima, pesi per distanza e numero di token analizzati.
5. Non accettare co-occorrenze con supporto insufficiente: partire con `min_pair_count=5`, `min_target_count=20`, quindi tarare su corpus e copertura effettivi.

Sia `N = Σ X[w,c]`, `X[w,*] = Σ_c X[w,c]` e `X[*,c] = Σ_w X[w,c]`:

```text
PMI(w,c) = ln( X[w,c] * N / (X[w,*] * X[*,c]) )
PPMI(w,c) = max(0, PMI(w,c))
SPPMI(w,c) = max(0, PMI(w,c) - ln(k_shift))
```

Le formule si applicano **solo alle coppie con conteggio > 0**. Non calcolare `ln(0)`; per quelle non osservate la matrice sparsa assume zero per il trattamento computazionale, **non** perché la vera PMI sia zero. Valutare marginali smussati / context distribution smoothing e soppressione di coppie rare e spurie.

### 4.2 PMI + SVD (componente `D`)

Per rendere stabile e trattabile la fattorizzazione della PMI su grandi vocabolari, la configurazione di riferimento usa **SPPMI-SVD**: è una variante operativa di PMI+SVD con troncamento dei valori negativi. Non equivale a fattorizzare tutti i valori firmati della PMI (che sarebbe un esperimento diverso).

```text
M[w,c] = SPPMI(w,c)                     # sparse, k_shift iniziale = 1
M ≈ U_d · Σ_d · V_dᵀ                   # randomized/truncated SVD
v_D(w) = normalize( U_d[w] · Σ_d^p )  # d=256, p=0.5 iniziali
D(w,v) = cosine( v_D(w), v_D(v) )
```

Testare `d ∈ {128, 256, 384}`, `p ∈ {0, 0.5, 1}` e `k_shift ∈ {1, 2, 5}` con un campione di validazione. Non costruire mai una matrice PMI densa `V×C`: usare CSR/CSC e SVD troncata.

### 4.3 PPMI diretta (componente `C`)

Conservare la matrice **PPMI non fattorizzata**, limitata ai contesti affidabili. Per una coppia di lemmi `(w,v)`, calcolare un segnale di associazione diretta dal valore di `PPMI(w,v)` quando `v` è un contesto ammesso di `w`; per finestre o grafi direzionali si possono aggregare entrambe le direzioni.

```text
C_raw(w,v) = log1p( max(PPMI(w,v), PPMI(v,w)) )
```

Se un contesto non è tra i possibili candidati, tale coppia non ha misura diretta; indicarlo come `missing`, **non** interpretarlo come prova di disassociazione. Per `association` usare la PPMI diretta come segnale forte; per `similarity` assegnarle peso minore. La sola PPMI può favorire co-occorrenze forti ma poco adatte a un gioco: verificare supporto, qualità lessicale e senso.

## 5. ConceptNet (componente `G`)

- Partire dagli *assertions dump* ufficiali; estrarre nodi con URI `/c/it/...` e conservare l'eventuale POS/termine multiword.
- Usare `RelatedTo`, `Synonym`, `IsA`, `PartOf`, `HasA`, `UsedFor`, `AtLocation`, `CapableOf`, `HasProperty` come famiglie iniziali, senza supporre copertura uniforme per l'italiano.
- `Antonym`, `DistinctFrom`, `NotDesires` e relazioni negative **non sono segnali positivi generici di vicinanza**; prevedere trattamento specifico per il gioco.
- Tenere `edge_weight`, fonte, relazione, direzione e provenienza. Scartare archi rumorosi, autocollegamenti e traduzioni problematiche.
- Calcolare `G_raw(w,v)` con un arco diretto pesato; opzionalmente includere cammini di 2 archi con forte penalità e vincolo di coerenza (non introdurre hub generici).
- Preferire uno scoring interpretabile: tipo di relazione + peso dell'arco + lunghezza del percorso; aggiungere Personalized PageRank solo dopo baseline e test.
- Se manca un nodo italiano, il segnale è **assente**, non zero. Non tradurre automaticamente in inglese senza un percorso di validazione separato.

Esempi di configurazione **iniziale e modificabile**: `RelatedTo=1.0`, `Synonym=1.0`, `UsedFor=0.9`, `AtLocation=0.8`, `IsA=0.75`, `PartOf=0.8`; cammini a due salti ×`0.4`. Il valore finale va calibrato per tipologia di gioco.

## 6. Classifica ibrida e punteggio

### 6.1 Pesi di partenza

```yaml
weights_initial:
  embedding: 0.35
  pmi_svd: 0.30
  conceptnet: 0.25
  ppmi_direct: 0.10
modes:
  balanced: baseline
  similarity: "promuovere embedding/PMI-SVD e relazioni di sinonimia"
  association: "promuovere ConceptNet/PPMI e relazioni funzionali"
```

Formula di base, **solo dopo calibrazione**:

```text
S(w,v) = 0.35 E_norm(w,v) + 0.30 D_norm(w,v)
       + 0.25 G_norm(w,v) + 0.10 C_norm(w,v)
```

Non sommare direttamente coseno, PPMI e pesi del grafo: scale, distribuzioni e percentuali di copertura differiscono. Normalizzare con una **trasformazione monotona per segnale**, stimata su un insieme di coppie italiano fisso e separato dal test (`ECDF` / percentili, oppure isotonic regression su dati annotati). La calibrazione per-query va usata solo come fallback documentato, perché i punteggi non sarebbero più comparabili tra query differenti.

### 6.2 Mancanze e confidenza

- Distinguere `observed`, `missing`, `excluded` e `unreliable` per ciascun segnale.
- Per segnali mancanti, calcolare uno score provvisorio rinormalizzando i **soli pesi disponibili**, ma riportare `weight_coverage`, `source_coverage` e `confidence`; non presentare il numero come pienamente affidabile.
- Se disponibile solo un segnale, consentire risposta `degraded` o astenersi secondo soglia configurabile; **mai** assegnare zero all'assenza.
- Richiedere almeno due famiglie non ridondanti (`embedding/distribuzionale` e `grafo` oppure giudizio validato) per un flag `high_confidence`.
- Affiancare il punteggio a `evidence` con provenienza ed eventuali relazioni esplicite. Il punteggio non è una probabilità che la parola sia corretta.

### 6.3 Recupero candidati e filtri

1. Cercare top-200 dal backend principale, top-200 da PMI-SVD, top-200 da PPMI diretta, fino a 200 vicini ConceptNet.
2. Unire per chiave canonica `(lemma, POS, sense_id)`, conservando tutti gli score originali.
3. Scartare query stessa, errori ortografici, forme non autonome, voci fuori lingua e stopword non giocabili.
4. Applicare politica per POS e flessioni **specifica del gioco**, non una regola rigida universale.
5. Calibrare, fondere e ordinare; facoltativamente diversificare con MMR per non avere dieci quasi-sinonimi.
6. Restituire `top_n`, ragioni, relazioni, copertura e modello/versione.

**Polisemia:** quando disponibili accezioni (`pesca` frutto/attività, `porta` NOUN/VERB), fare query con `sense_id` distinto. In assenza di accezione, restituire risultati con `sense_ambiguous=true` oppure richiedere contesto; non mescolare tacitamente interpretazioni incompatibili.

## 7. Specifica dati e API

### Input

```json
{
  "query": "mare",
  "pos": "NOUN",
  "sense_id": null,
  "mode": "balanced",
  "top_n": 20,
  "filters": {"italian_only": true, "allow_multiword": false}
}
```

### Output (esempio di struttura, punteggi fittizi)

```json
{
  "query": "mare",
  "model_id": "bge-m3-pmi-svd-conceptnet-ppmi",
  "version": "1.0.0",
  "mode": "balanced",
  "status": "ok",
  "results": [
    {
      "lemma": "spiaggia",
      "pos": "NOUN",
      "sense_id": null,
      "score": 0.82,
      "score_is_calibrated": false,
      "weight_coverage": 0.75,
      "confidence": "provisional",
      "signals": {"embedding": 0.73, "pmi_svd": 0.69, "conceptnet": null, "ppmi_direct": 0.81},
      "availability": {"embedding": "observed", "pmi_svd": "observed", "conceptnet": "missing", "ppmi_direct": "observed"},
      "evidence": ["cooccorrenza nel corpus"],
      "sense_ambiguous": false
    }
  ]
}
```

**Nota:** score e `weight_coverage` sopra sono esempi di formato, non misurazioni di `mare→spiaggia`. Lo score effettivo va ricavato dal calcolo e il flag `score_is_calibrated` deve essere `true` soltanto dopo calibrazione reale.

### Schema SQLite suggerito

```sql
CREATE TABLE lexemes (
  lexeme_id INTEGER PRIMARY KEY,
  lemma TEXT NOT NULL,
  pos TEXT NOT NULL,
  sense_id TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'it',
  lexical_validity TEXT NOT NULL,
  source_id TEXT NOT NULL,
  UNIQUE(lemma, pos, sense_id, language)
);
CREATE TABLE semantic_pair_scores (
  source_lexeme_id INTEGER NOT NULL,
  target_lexeme_id INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  score REAL,
  embedding_score REAL,
  pmi_svd_score REAL,
  conceptnet_score REAL,
  ppmi_score REAL,
  weight_coverage REAL NOT NULL,
  evidence_json TEXT NOT NULL,
  PRIMARY KEY(source_lexeme_id, target_lexeme_id, model_version),
  FOREIGN KEY(source_lexeme_id) REFERENCES lexemes(lexeme_id),
  FOREIGN KEY(target_lexeme_id) REFERENCES lexemes(lexeme_id)
);
```

Conservare i metadati per ogni sorgente, la licenza, lo snapshot dei dataset, le revisioni del corpus, `embedding_model_revision`, `score_calibrator_version`, e gli stati `missing`. La colonna `score` può essere `NULL` se insufficiente evidenza.

## 8. Piano di sperimentazione e benchmark

### Dataset di valutazione

- Creare almeno 200 lemmi di query pilota, poi 500+, stratificati per nomi/verbi/aggettivi, frequenza, polisemia, registro e domini.
- Valutare manualmente un pool di candidati prodotto da **tutti** i sistemi (pooling) con giudizi `0=errato`, `1=collegamento debole`, `2=pertinente`, `3=forte/naturale`.
- Separare training/calibrazione/test per *lemma di query*, evitando leakage da parole ripetute o coppie già annotate.
- Doppia annotazione a campione, disaccordi risolti da revisione; registrare accordo tra revisori.

### Metriche

| Metrica | Scopo |
|---|---|
| `nDCG@20` | Qualità dell'ordinamento con pertinenza graduata |
| `Precision@10` | Percentuale di candidati giudicati pertinenti nelle prime 10 |
| `Coverage@V` | Copertura dei lemmi del vocabolario |
| `POS error rate` | Errori grammaticali e flessionali |
| `Sense consistency` | Coerenza del significato della query |
| `Diversity@20` | Varietà delle relazioni senza perdita di rilevanza |
| `p50/p95 latency` | Prestazioni di risposta e tempi di costruzione |
| `human preference` | Preferenza tra liste prodotte da pipeline differenti |

**Ablazione obbligatoria:** testare i quattro singoli sistemi, le combinazioni a due/tre, il mix completo, `-PPMI`, `-PMI-SVD`, `-ConceptNet` e l'effetto della calibrazione. L'eventuale vantaggio della PPMI diretta sul PMI-SVD deve essere dimostrato, non presunto.

### Casi di collaudo qualitativo

- `pesca`: separare frutto e attività.
- `porta`: mantenere nome femminile anche se la forma ha lettura verbale.
- `mare`: valutare sinonimi, oggetti e contesti d'uso.
- `riso`: non mischiare cereale e risata senza contesto.
- Parole rare/tecniche: segnalare `low_coverage` e falsi positivi morfologici.
- Multiword: ammettere solo se il regolamento del gioco lo consente.

## 9. Integrazione nel gioco e requisiti operativi

- Calcolare offline embedding, SVD e liste top-K. In runtime usare indici ANN (es. FAISS) o liste precompute; per ConceptNet predisporre un grafo indicizzato.
- Separare il servizio semantico dal sistema di punteggio dei giocatori: la **vicinanza** non coincide automaticamente con la **validità di una risposta**.
- Regole personalizzabili per gioco: `allowed_pos`, `allow_inflections`, `allow_multiword`, `min_familiarity`, `relation_mode`, `difficulty_band`.
- Rendere i risultati spiegabili tramite componente prevalente e relazione (`RELATED_TO`, `COLLOCATION`, `DISTRIBUTIONAL`, ecc.).
- Riproducibilità: pin di versioni software e modello, seed, checksum dataset, hash del vocabolario, JSON di configurazione.
- Memoria: con 100.000 lemmi, soli vettori `float32` occupano circa **390,6 MiB (1024 dimensioni × 4 byte)**, esclusi indici, grafo, SVD e matrici sparse.
- Tempi e accelerazione dipendono da grandezza corpus, pre-elaborazione, GPU/CPU e modalità di indicizzazione: nessuna stima di tempi è garantita qui.

## 10. Licenze, sicurezza e qualità del lessico

- Verificare licenza di **ogni corpus**, del lessico, del modello e delle singole asserzioni importate prima di redistribuire i dati o usarli commercialmente.
- ConceptNet: licenza generale CC BY-SA 4.0, con metadati di provenienza da conservare; controllare i termini delle fonti incorporate e le regole di attribuzione.
- Evitare di fondere senza autorizzazione dataset con licenze incompatibili o `NC` in prodotti monetizzati.
- Filtrare contenuti offensivi, parole improprie e nomi propri secondo il contesto; non cancellare indiscriminatamente categorie linguistiche legittime dal dizionario condiviso.
- Tracciare le fonti: `source`, `license`, `dataset_revision`, `extraction_date`, `normalization_version`.

## 11. Criteri di accettazione della v1.0

1. Tutti e quattro i segnali funzionano separatamente e producono uno score + uno stato di disponibilità.
2. Il pipeline completo è ripetibile su due esecuzioni equivalenti.
3. Si forniscono top-20 per un set di test di almeno 200 query, con spiegazioni e POS.
4. Il benchmark confronta baseline e ablazioni: non approvare l'ibrido solo perché usa più metodi.
5. Input polisemici e omografi non vengono automaticamente collassati in un'unica accezione affidabile.
6. Un segnale assente non viene trattato come score zero.
7. Le sorgenti dati/risorse redistribuite hanno licenze documentate.
8. Ogni risultato include `model_version`, schema version e dati di audit.

## 12. Fonti primarie e documentazione

- [BAAI/bge-m3 – scheda ufficiale](https://huggingface.co/BAAI/bge-m3), architettura, modalità dense/sparse/multi-vector e esempi di utilizzo.
- [ConceptNet – dump ufficiali delle asserzioni](https://github.com/commonsense/conceptnet5/wiki/Downloads) e [licenza](https://conceptnet.io/c/en/downloading_information).
- [Levy & Goldberg, 2014 – Neural Word Embedding as Implicit Matrix Factorization](https://papers.nips.cc/paper_files/paper/2014/hash/feab05aa91085b7a8012516bc3533958-Abstract.html), riferimento per PMI/SGNS; per SVD su matrici PMI/PPMI consultare anche letteratura sulla semantica distribuzionale.
- [Scikit-learn: TruncatedSVD](https://scikit-learn.org/stable/modules/generated/sklearn.decomposition.TruncatedSVD.html), implementazione pratica per matrici sparse.
- [FAISS](https://github.com/facebookresearch/faiss), ricerca dei vicini approssimata o esatta in vettori.
- [LiITA Lemma Bank](https://github.com/LiITA-LOD/LiITA_LemmaBank), possibile sorgente del lessico canonico (verificare versione e licenza).

---

**Decisione progettuale:** i pesi 35/30/25/10 sono una baseline. L'architettura deve permettere di cambiarli per gioco e modalità dopo un benchmark annotato, non considerarli il risultato finale.

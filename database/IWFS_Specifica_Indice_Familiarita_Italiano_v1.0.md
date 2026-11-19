# IWFS — Italian Word Familiarity Score

**Specifica tecnica e proposta di implementazione — v1.0**  
**Data:** 18 novembre 2026  
**Ambito:** database lessicale italiano condiviso, ZeroContext, Word Hunt, Word Association e altri giochi linguistici.

> **Stato:** proposta progettuale. Formula, pesi e soglie sono ipotesi iniziali, **non parametri scientificamente validati**. Richiedono calibrazione empirica e controllo della copertura delle fonti.

## 1. Obiettivo

L'**Italian Word Familiarity Score (IWFS)** è un indice composito da **0 a 100** progettato per stimare **quanto una parola italiana sia conosciuta e riconoscibile da parlanti italiani**. Non misura l'esistenza linguistica della parola e non coincide con la difficoltà di indovinarla in uno specifico gioco.

Si mantengono **tre dimensioni separate**:

1. **Validità lessicale (`lexical_validity`)**: il lemma o la forma sono attestati e ammessi dalle regole?
2. **Familiarità (`familiarity_score`, IWFS)**: quanto è probabilmente conosciuta la parola?
3. **Difficoltà di gioco (`game_difficulty_score`)**: quanto è difficile indovinarla nel singolo gioco, dato il contesto e la meccanica?

**Principio inderogabile:** una parola non presente in un corpus o in un dataset di frequenza **non è automaticamente una parola inesistente**.

## 2. Indicatori principali e pesi iniziali

| Sigla | Indicatore | Peso | Che cosa misura | Fonte consigliata |
|---|---|---:|---|---|
| `P` | **Word Prevalence** | **50%** | Quota di partecipanti che riconosce o conosce una forma scritta | Italian Crowdsourcing Project (ICP) |
| `D` | **Contextual Diversity** | **30%** | Diffusione in documenti/contesti indipendenti, anziché mera ripetizione | Calcolo da corpus italiano documentato, es. PAISÀ |
| `F` | **Frequenza d'uso normalizzata** | **20%** | Frequenza di utilizzo in un corpus | SUBTLEX-IT e/o CoLFIS |

### 2.1 Formula iniziale

Dopo aver portato ogni componente su una scala confrontabile **[0, 100]** e nella stessa direzione (maggiore = più familiare):

```text
IWFS = 0.50 * P + 0.30 * D + 0.20 * F
```

**Nota metodologica:** i coefficienti 0,50/0,30/0,20 sono un punto di partenza operativo, **non** il risultato di un modello validato. La frequenza Zipf può essere usata per costruire `F`: non viene eliminata, ma non domina il punteggio.

### 2.2 Word Prevalence (`P`)

- Preferire una **misura empirica di prevalenza** basata sul riconoscimento da parte di persone reali.
- Se il dato è una percentuale di riconoscimento, convertirlo sulla scala 0–100 senza cambiare il significato statistico.
- Registrare **campione, definizione della misura, data e fonte**.
- **Non equiparare** automaticamente riconoscimento ortografico, comprensione semantica e capacità di usare la parola.

### 2.3 Contextual Diversity (`D`)

Misurare in quanti **documenti distinti** compare un lemma, evitando che molte ripetizioni in un singolo documento lo facciano apparire ingiustificatamente comune.

Esempio di indicatore grezzo:

```text
CD_documentale = documenti_distinti_con_lemma / documenti_totali_corpus
```

Requisiti:

- Corpus suddiviso in documenti e metadati d'origine, preferibilmente **bilanciato per generi**.
- Conteggio di documenti distinti per lemma; rendere esplicita la lemmatizzazione e il trattamento delle omografie.
- Valutare una **dispersione per generi** (parlato, narrativa, giornali, forum ecc.) come diagnostica aggiuntiva.
- Evitare confronti diretti tra corpora diversi: il valore dipende da dimensione e segmentazione dei documenti.

### 2.4 Frequenza normalizzata (`F`)

- Preferire una frequenza per milione di token e/o la sua trasformazione **Zipf**, quando disponibile.
- Documentare corpus, periodo, unità di conteggio, normalizzazione e copertura.
- Se si combinano SUBTLEX-IT e CoLFIS, normalizzarli separatamente, verificare la comparabilità e valutare un valore aggregato: **non mediare direttamente scale differenti**.
- Non confondere frequenza della **forma** con quella del **lemma**.

## 3. Normalizzazione dei componenti

Per `D` e `F` è raccomandato un passaggio di normalizzazione robusta.

**Procedura proposta:**

1. Fissare un **lessico di riferimento versionato** (`reference_lexicon_version`).
2. Definire per ogni metrica l'unità grezza e la trasformazione (es. logaritmica per frequenze fortemente asimmetriche).
3. Calcolare **ranghi percentili** sul lessico di riferimento, eventualmente stratificando per parte del discorso (POS) quando esistono distorsioni importanti.
4. Convertire il percentile in scala 0–100.
5. Congelare parametri, soglie e versione per rendere confrontabili i punteggi nel tempo.

**Attenzione:** un percentile **non** è la probabilità che un parlante conosca la parola. `P` può avere un significato probabilistico empirico se derivato da una percentuale osservata; `D` e `F` restano ranghi relativi.

Per parole rare con zero occorrenze, distinguere **zero osservato in un corpus coperto** da **dato mancante**.

## 4. Indicatori secondari (non inclusi nei pesi base)

| Indicatore | Informazione aggiuntiva | Utilizzo |
|---|---|---|
| **Age of Acquisition (AoA)** | Età di acquisizione stimata | Correzione sperimentale e analisi di facilità |
| **Recognition Time** | Tempo di riconoscimento | Stima di accessibilità lessicale |
| **Concreteness** | Concretezza del concetto | Difficoltà per descrizioni e rappresentazioni |
| **Imageability** | Facilità di evocare un'immagine mentale | Indizi visivi e associazioni |
| **Semantic Ambiguity** | Numero / incertezza dei significati | Giochi di associazione e contesto |
| **Word Length** | Numero di caratteri o lettere | Difficoltà meccanica in Word Hunt |
| **Success Rate** | Quota di risposte corrette | Calibrazione empirica per singolo gioco |
| **Response Time / Attempts** | Tempo e tentativi dei giocatori | Difficoltà reale, corretta per l'esposizione |

Non applicare penalità automatiche per la mancanza di AoA o di altre misure a copertura limitata. I correttivi possono essere sperimentati **soltanto dopo** la valutazione della loro capacità predittiva.

## 5. Validazione lessicale: fase distinta e preliminare

Prima di assegnare o usare IWFS, verificare:

1. **Attestazione** in almeno una fonte lessicografica tracciabile (es. LiITA, Wikizionario, CompL-it) e livello di attendibilità della fonte.
2. **Lemma canonico**, parte del discorso (`POS`) e analisi morfologica coerente.
3. **Forme flesse**: riconduzione al lemma secondo la politica del gioco (singolari/plurali, coniugazioni, eccezioni lessicalizzate).
4. **Grafia**: accenti, apostrofi, diacritici, maiuscole, varianti ortografiche e omografie.
5. **Ammissibilità**: nomi propri, forestierismi, regionalismi, arcaismi, tecnicismi, abbreviazioni e locuzioni secondo regole esplicite.
6. **Audit delle fonti e licenze** prima di distribuire o utilizzare commercialmente i dati.

Stati consigliati:

```text
VALID | REVIEW_REQUIRED | REJECTED | UNKNOWN
```

`UNKNOWN` o assenza dalle fonti disponibili non equivalgono a `REJECTED`.

## 6. Gestione rigorosa dei dati mancanti

Per ogni indicatore registrare separatamente:

- `value_raw`: misura osservata nel dataset originale.
- `value_normalized`: misura trasformata 0–100, oppure `NULL`.
- `status`: `OBSERVED`, `ESTIMATED`, `MISSING`, `NOT_APPLICABLE`.
- `source_id`, `source_version`, `normalization_version`.
- Eventuali statistiche di qualità o numerosità campionaria.

**Politica proposta:**

- **Tutti e tre presenti**: calcolare `IWFS_full` con i pesi standard.
- **Uno o più assenti**: non assegnare 0 al dato mancante. Calcolare eventualmente un **punteggio parziale** rinormalizzando i soli pesi disponibili, ma marcarlo `PARTIAL` e non renderlo direttamente equivalente a un `FULL`.
- **Solo un indicatore presente**: restituire un valore diagnostico, non un IWFS affidabile per classifiche definitive.
- **Nessun indicatore presente**: `IWFS = NULL` e `confidence = NONE`.

Esempio per due componenti presenti:

```text
IWFS_partial = SUM(w_i * x_i for i observed) / SUM(w_i for i observed)
```

La **confidence** deve riflettere copertura, qualità e incertezza delle fonti; non può essere determinata soltanto dal numero di indicatori presenti. Per applicazioni sensibili alla difficoltà, prevedere la revisione umana dei casi `PARTIAL`.

## 7. Fasce iniziali di familiarità

Le seguenti soglie sono **esempi di prodotto**, da calibrare su un campione rappresentativo e su dati reali.

| IWFS | Fascia proposta | Uso indicativo |
|---:|---|---|
| **85–100** | Molto familiare | Lessico molto accessibile |
| **65–84** | Familiare | Partite standard |
| **40–64** | Poco familiare | Round impegnativi |
| **0–39** | Rara / specialistica | Round avanzati, previa verifica |

**Non utilizzare direttamente queste fasce come difficoltà di gioco.** Una parola comune può essere difficile da indovinare in un puzzle specifico; viceversa una parola meno comune può essere resa facile da indizi molto informativi.

## 8. Difficoltà specifica per gioco

L'`IWFS` rappresenta una **proprietà lessicale di base**; la difficoltà effettiva dipende anche dalle regole e dal contesto.

- **ZeroContext**: familiarità della soluzione, ambiguità semantica, qualità delle associazioni, numero di risposte plausibili, progressione degli indizi.
- **Word Association**: familiarità del *prompt* mostrato e, separatamente, delle **sette parole da indovinare**. Non invertire questi ruoli; valutare anche la riconducibilità prompt→ciascuna risposta.
- **Word Hunt**: familiarità delle parole, lunghezza, struttura del tabellone, lettere ripetute, possibilità combinatorie e tempo disponibile.

Statistiche reali suggerite:

```text
success_rate = risposte_corrette / esposizioni_valide
median_response_time_ms = mediana_tempo_risposta
attempts_per_success = tentativi_validi / risposte_corrette
```

Condizionare le statistiche su **gioco, versione delle regole, modalità, indizi, durata del round e campione di utenti**. Prevedere una numerosità minima, intervalli di confidenza o stime con regolarizzazione per evitare classificazioni instabili su poche partite.

## 9. Schema dati consigliato

Esempio concettuale di record elaborato:

```json
{
  "lemma": "bicicletta",
  "pos": "NOUN",
  "lexical_validity": "VALID",
  "lexical_sources": ["LiITA", "Wikizionario"],
  "prevalence": { "value_raw": null, "value_normalized": null, "status": "MISSING", "source_id": "ICP" },
  "contextual_diversity": { "value_raw": null, "value_normalized": null, "status": "MISSING", "source_id": "PAISA" },
  "frequency": { "value_raw": null, "value_normalized": null, "status": "MISSING", "source_id": "SUBTLEX_IT" },
  "iwfs": null,
  "iwfs_status": "UNAVAILABLE",
  "confidence": "NONE",
  "iwfs_model_version": "1.0",
  "normalization_version": null,
  "game_difficulty": {}
}
```

I valori `null` sono **intenzionali**: l'esempio mostra la struttura, **non attribuisce misure inventate** alla parola.

Per un database SQLite condiviso è preferibile normalizzare la struttura in tabelle quali:

- `lemmas`: lemma canonico, lingua, POS, validazione e policy.
- `word_forms`: forme flesse, lemma associato, analisi morfologica.
- `lexical_sources`: dataset, versioni, licenze, citazioni, data import.
- `word_measurements`: lemma, tipo metrica, valore, stato, fonte, trasformazione.
- `word_scores`: IWFS, copertura, versione modello, confidence.
- `game_word_stats`: statistiche per gioco / modalità / versione.

L'indice del lemma deve tenere conto di omografi distinti per POS e, se necessario, per significato; la sola stringa normalizzata non basta a identificarli in tutti i casi.

## 10. Pipeline operativa

```text
IMPORT FONTI
  ↓
NORMALIZZAZIONE GRAFICA + LEMMATIZZAZIONE
  ↓
UNIONE PER LEMMA / POS + TRACCIAMENTO PROVENIENZA
  ↓
VALIDAZIONE LESSICALE (indipendente da IWFS)
  ↓
ACQUISIZIONE P, D, F
  ↓
NORMALIZZAZIONE VERSIONATA
  ↓
CALCOLO IWFS + STATO DATI + CONFIDENCE
  ↓
FASCE DI FAMILIARITÀ (provvisorie)
  ↓
GIOCHI + RACCOLTA TELEMETRIA
  ↓
CALIBRAZIONE DIFFICOLTÀ PER GIOCO
  ↓
REVISIONE PERIODICA PESI E SOGLIE
```

### 10.1 Verifiche di qualità minime

- Copertura percentuale per POS, frequenza, lunghezza, categoria lessicale e fonte.
- Percentuale di `FULL`, `PARTIAL`, `UNAVAILABLE` e conflitti tra fonti.
- Correlazione tra IWFS e accuratezza / tempo di risposta su dati **non usati per la taratura**.
- Analisi degli errori: tecnicismi, regionalismi, arcaismi, omografi, prestiti, nomi propri.
- Confronto con baseline **solo Zipf**, **solo prevalence**, e modello a tre fattori.
- Controllo della deriva nel tempo (nuove parole, slang, cambi d'uso).
- Test per evitare leakage tra training e validazione quando gli stessi termini compaiono in più round.

## 11. Strategia di taratura

1. Costruire un campione stratificato di parole comuni, medie e rare, differenziando nome/verbo/aggettivo.
2. Importare le misure disponibili e determinare la copertura reale di `P`, `D` e `F`.
3. Valutare gli indicatori **singolarmente** e in combinazione su giudizi umani o prove di riconoscimento.
4. Stimare pesi alternativi con regressione o modelli regolarizzati, adottandoli solo se migliorano la previsione fuori campione.
5. Derivare le soglie tramite quantili e risultati di gioco, poi testarle con utenti reali.
6. Versionare il modello e conservare i punteggi precedenti per confronti longitudinali.

### Criterio di adozione

Conservare la formula 50/30/20 finché non esiste evidenza quantitativa che un'altra combinazione generalizzi meglio. La semplicità è utile, ma deve essere esplicitamente **provvisoria**.

## 12. Fonti da verificare e integrare

- **Italian Crowdsourcing Project (ICP)** — dati psicoles­sicali, prevalenza e riconoscimento: <https://osf.io/e4x7w/>
- **PAISÀ** — corpus italiano, utile per stimare diversità contestuale: <https://www.corpusitaliano.it/>
- **SUBTLEX-IT** — frequenze dai sottotitoli: <https://lrlac.sissa.it/node/436>
- **CoLFIS (CNR)** — frequenze lessicali dell'italiano scritto: <https://www.cnr.it/it/banche-dati-istituti/banca-dati/521/colfis>
- **ItAoA** — età di acquisizione: <https://osf.io/3trg2>
- **LiITA Lemma Bank** — lemmario e POS: <https://github.com/LiITA-LOD/LiITA_LemmaBank>
- **Morph-it!** — morfologia e forme flesse: <https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it>
- **Wiktionary / Kaikki** — lessico strutturato: <https://kaikki.org/itwiktionary/Italiano/index.html>

> **Licenze e accesso:** verificare i termini applicabili a ogni *versione* e *file* prima dell'uso, in particolare per la distribuzione o la monetizzazione. La presenza di un link pubblico non implica riuso commerciale illimitato.

## 13. Decisioni progettuali riepilogative

| Tema | Decisione proposta |
|---|---|
| Nome | Italian Word Familiarity Score (**IWFS**) |
| Scala | 0–100, più alto = più familiare |
| Formula v1 | `0.50·P + 0.30·D + 0.20·F` |
| Zipf | Contributo a `F`, non unico validatore |
| Normalizzazione | Riferimento e trasformazioni versionati |
| Validità | Controllo separato, basato su fonti lessicografiche |
| Dati mancanti | `NULL` + stato esplicito; mai zero arbitrario |
| Valori parziali | Ammessi solo con etichetta e confidence |
| Fasce | 85/65/40 come soglie iniziali non validate |
| AoA, tempi, concretezza | Diagnostiche o correttivi dopo verifica empirica |
| Difficoltà dei giochi | Punteggio separato, calibrato con telemetria |
| Evoluzione | Test contro baseline e ritaratura su dati reali |

---

**Conclusione:** l'IWFS deve essere un **indicatore della familiarità**, non un certificato di validità e neppure una scorciatoia per attribuire la difficoltà di gioco. La combinazione proposta **Word Prevalence (50%) + Contextual Diversity (30%) + Frequenza (20%)** è una base implementabile e verificabile, da perfezionare con copertura dei dataset e risultati dei giocatori.

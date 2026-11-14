# Analisi morfologica italiana

La raccolta distingue le **attestazioni lessicali** dalle **previsioni dei modelli**.
Per una parola isolata si consultano le analisi attive del DB: `porta` può essere
sia il nome `porta` sia una forma di `portare`. Per scegliere un'analisi in una
frase si usa spaCy. Stanza serve al confronto; Simplemma propone lemmi con un
costo inferiore e non fornisce POS o caratteristiche morfologiche UD.

## Installazione e modelli

Dalla cartella `gioco-zeroassociations`, nell'ambiente Python 3.13 di generazione:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-generation.txt
.\.venv\Scripts\python.exe -m pip install -r requirements-nlp.txt
.\.venv\Scripts\python.exe -m spacy download it_core_news_md
.\.venv\Scripts\python.exe -B script/nlp_tools.py download-stanza
```

spaCy usa per impostazione predefinita `it_core_news_md`, già usato dal validatore.
Stanza usa `default_fast`: tokenizer combinato, espansore MWT `combined`, POS e
lemmatizzatore `combined_nocharlm`, eseguiti sulla CPU. Il comando di download
separato risolve i pacchetti ufficiali, compreso quello MWT che ha un nome diverso.
Simplemma usa il dizionario italiano incluso nella libreria.

Le analisi non scaricano automaticamente modelli e non cambiano motore quando
una dipendenza manca: restituiscono un errore con l'indicazione per installarla.
`--model` seleziona un altro modello spaCy o pacchetto Stanza; `--model-dir`
consente di usare una cartella Stanza specifica anche per il download.

Dipendenze di confronto fissate a Stanza 1.15.1 e Simplemma 2.0.0 dopo la verifica
delle release ufficiali. Per Stanza sono rilevanti il nuovo formato del
lemmatizzatore e le correzioni sugli offset e sui token composti; Simplemma 2.0
aggiorna dizionari e gestione degli apostrofi. Le dipendenze restano opzionali
per la generazione e non sono richieste dal server dei giochi.

## Consultazione delle parole isolate

```powershell
.\.venv\Scripts\python.exe -B script/nlp_tools.py lookup porta
```

Si leggono `inventory_current_attestations`, quindi soltanto gli snapshot attivi.
Il risultato conserva lemma, categoria originale, formato della fonte, ruolo,
snapshot e posizione nel file. Le analisi vengono raggruppate senza selezionare
un lemma vincente (`selected_lemma` rimane `null`). Una parola sconosciuta ha una
lista vuota. Le liste ortografiche senza lemma, le frequenze e i titoli non vengono
trasformati in analisi morfologiche. Non si carica alcun modello NLP.

Il lookup non autorizza da solo una risposta nel gioco: l'accettazione continua
a dipendere dal bacino verificato e dalle regole del gioco.

## Analisi dei testi e salvataggio

```powershell
.\.venv\Scripts\python.exe -B script/nlp_tools.py analyze --text "Chiudi la porta." --save
.\.venv\Scripts\python.exe -B script/nlp_tools.py analyze --text "Luca porta il pane." --engine stanza --save
.\.venv\Scripts\python.exe -B script/nlp_tools.py analyze --text "bambini" --scope isolated --engine simplemma
```

Ogni token porta forma, lemma, UPOS, XPOS, tratti morfologici e offset nel testo
originale. Simplemma restituisce POS vuote e morfologia vuota: non le deduce dal
lemma. Le espansioni Stanza come `del` → `di`, `il` conservano lo span originale
e il flag `expanded_multiword`, senza inventare offset delle parole sintetiche.
`context_used` è falso per Simplemma e per input di una sola parola.

Il risultato contiene `evidence_kind=model_prediction`, stato
`AWAITING_REVIEW`, versione della libreria, modello, configurazione e hash degli
artefatti effettivi. `--save` aggiunge `nlp_models` e `nlp_analyses` nello schema
`raw` del DB unico e conserva il testo originale. La stessa analisi è idempotente;
un altro modello o un'altra versione ha un'identità distinta. `--db` consente
di usare un DB di prova. Senza `--save` si produce soltanto il JSON.

Il validatore esistente usa lo stesso caricatore spaCy e aggiunge ai risultati
delle definizioni contesto, identità e versione del modello. I candidati ottenuti
da un modello restano previsioni da rivedere; non diventano attestazioni delle
fonti, decisioni editoriali o risposte ammesse automaticamente.

In Python, un'istanza `ItalianAnalyzer` può essere riutilizzata per più testi,
senza ricaricare il modello a ogni frase.
`analyze_many` elabora lotti in ordine, usando `pipe` di spaCy e `bulk_process`
di Stanza per evitare una chiamata separata alla pipeline per ogni frase.

## Applicazione ai database esistenti

```powershell
.\.venv\Scripts\python.exe -B script/audit_word_databases.py
```

Il comando legge le banche di parole di `database/giochi.sqlite3` (associazioni,
Wordle, Context e ZeroWords) e i corrispondenti dati selezionati di
`database/parole_ita_raw.sqlite3`: prompt, associazioni, filtrati, candidati,
validati e banca finale. I conteggi per tabella sono nel rapporto
`resources/nlp_db_audit_latest.json`.
Il file omonimo `.csv` contiene le singole segnalazioni con DB, tabella, parola,
contesto, controlli lessicali e confronto dei modelli.
Per le parole di ZeroAssociazioni sono controllate le risposte effettivamente
collegate ai prompt; i soli nomi interni dei gruppi non sono trattati come tentativi.

Per ogni parola conserva le alternative lessicali degli snapshot attivi. I
controlli rispettano il ruolo della parola: le soluzioni e i prompt richiedono
prova di lemma, i tentativi possono essere forme flesse, le segrete di Context
richiedono un sostantivo. La corrispondenza senza accenti si applica soltanto ai
tentativi Wordle, secondo le regole del gioco.

Sensi, definizioni e motivazioni già presenti sono elaborati da spaCy, una volta
per testo distinto; Stanza ricontrolla i testi per cui spaCy segnala un contrasto
con il lemma, la POS prevista o le attestazioni. Una definizione che non contiene
la parola controllata non ne certifica la POS: viene analizzata come testo, senza
attribuire al prompt la categoria di un altro token. Simplemma propone candidati
per le forme senza attestazioni, che restano da verificare.

L'esecuzione scrive nello schema `raw`:

- `nlp_db_audit_runs`: input, snapshot, copertura, modelli e stato dell'esecuzione;
- `nlp_db_audit_words`: esiti lessicali e candidati Simplemma, per parola;
- `nlp_db_audit_findings`: segnalazioni per DB, tabella e riga, collegate alle
  analisi contestuali di `nlp_analyses`.

Le segnalazioni sono verifiche tecniche da esaminare, non correzioni automatiche
di sensi o decisioni editoriali. Omonimi e analisi alternative rimangono disponibili.
Gli indici del vocabolario di Context e i bacini verificati non vengono riscritti.
Le voci grezze non selezionate (per esempio titoli o liste multilingue) mantengono
la loro natura di archivio delle fonti.

Il comando riutilizza le analisi dello stesso modello e contesto; salva lotti
con transazioni brevi. Un'esecuzione interrotta o fallita non risulta `COMPLETE`.
Per consultare le segnalazioni del rapporto, nel DB unico:

```sql
SELECT location, item_key, word, findings_json
FROM raw__nlp_db_audit_findings
WHERE run_id = 'ID_DEL_RAPPORTO'
ORDER BY location, word;
```

## Confronto dei motori

```powershell
.\.venv\Scripts\python.exe -B script/nlp_tools.py benchmark --output resources/nlp_smoke_results.json
```

`resources/nlp_gold_it.jsonl` contiene **12 frasi sintetiche di regressione**,
con omografi, plurali, accenti, apostrofi e un esempio di chat. Non costituisce
un campione rappresentativo del lessico o una revisione umana indipendente.
I risultati di questa verifica sono in `resources/nlp_smoke_results.json`.

Per confrontare la qualità su dati del progetto, passare `--gold FILE.jsonl` con
testi e annotazioni revisionati. Ogni riga ha questo formato (offset Python,
base zero, fine esclusa):

```json
{"id":"porta-verbo","text":"Luca porta il pane.","targets":[{"surface":"porta","start":5,"end":10,"lemma":"portare","upos":"VERB","morph":{"Number":"Sing","Person":"3"}}]}
```

`lemma` è obbligatorio; UPOS e tratti morfologici sono facoltativi. Per la
morfologia si valutano soltanto i tratti annotati. Il caricamento verifica che
superficie e offset corrispondano al testo e che gli ID siano unici.

Ogni motore viene eseguito in un processo distinto con gli stessi target. Il
rapporto distingue tempo di caricamento, inferenza dopo riscaldamento, picco
di memoria del processo, allineamento dei token, accuratezza ed errori.
Gli span mancanti o espansi contano come errori di allineamento; non vengono
scartati per migliorare il punteggio. Le misure non supportate da Simplemma
sono indicate con `supported=false` e `accuracy=null`.

Gli errori di caricamento di un motore restano nel rapporto e il comando termina
con codice 2. `--engines spacy simplemma` limita esplicitamente il confronto;
`--spacy-model` e `--stanza-model` selezionano i modelli da confrontare.

Riferimenti: [spaCy italiano](https://spacy.io/models/it),
[Stanza](https://stanfordnlp.github.io/stanza/combined_models.html),
[Simplemma](https://github.com/adbar/simplemma),
[release Stanza](https://github.com/stanfordnlp/stanza/releases),
[release Simplemma](https://github.com/adbar/simplemma/releases).

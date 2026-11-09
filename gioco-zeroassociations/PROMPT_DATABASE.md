# Database dei prompt italiani

Fonti, inventario, aggiornamenti e decisioni convivono in `prompt.sqlite3`:
vedere [la gestione del database unico](AGGIORNAMENTI_FONTI.md).

**Primo step corrente:** [raccogliere e inserire l'inventario dei prompt](PROMPT_INVENTORY.md).
La richiesta più recente consente di inserire i prompt raccolti nelle tabelle
`inventory_*`, prima di cercare le associazioni. La verifica preinserimento
descritta qui sotto riguarda la banca di gioco e le sue associazioni.

`prompt.sqlite3` è il database operativo (escluso da Git: con l'inventario pesa
gigabyte); `prompt.sql`, versionato, è il dump SQL UTF-8 dei **soli bacini
verificati**, con schema, verbali e attribuzioni, e permette di ricostruirli.
L'inventario `inventory_*` resta fuori dal dump e si ricostruisce dalle fonti
con `prompt_inventory.py collect`. Il gioco ZeroAssociazioni legge i bacini da
`prompt.sqlite3` in sola lettura, oppure da `prompt.sql` quando il database manca. Si usa un runtime
ufficiale SQLite **3.54.1**, verificato con SHA3-256 e installato nella cache
utente. Python e il motore SQLite del server non vengono modificati.

La banca è estendibile, senza promessa di esaustività della lingua italiana.
La raccolta iniziale usa il dizionario italiano di Wikizionario tramite
[Kaikki/Wiktextract](https://kaikki.org/itwiktionary/Italiano/) e i
[titoli Wikipedia in italiano](https://dumps.wikimedia.org/itwiki/20261101/).
Wikipedia comprende anche nomi propri e parole straniere: essere un titolo
non prova che una voce sia un prompt italiano adatto al gioco.

Stato del 9 novembre 2026: **102 prompt e 1.010 associazioni**, revisionati
editorialmente da ChatGPT prima dell'inserimento. Ogni prompt ha una categoria
e un bacino con almeno sette risposte estraibili. L'esportazione **Livecade usa
sempre sette parole casuali**; il bacino completo rimane nel database.
La raccolta separata comprende 52.666 lemmi distinti di dizionario e 451.733
titoli Wikipedia di una sola parola, per **478.328 proposte distinte complessive**
dopo deduplicazione. Non sono tutte parole italiane ammissibili: la verifica
delle proposte restanti è ancora da svolgere. Non è stata completata la lingua
italiana né la revisione dell'intero vecchio lotto da 5.000 prompt.
Il [rapporto locale](prompt_database_status.json) documenta i conteggi e il
ripristino effettivo del dump completo in un secondo database temporaneo.

## Verifica prima dell'inserimento

Le proposte rimangono nei JSONL `prompt-staging/`, esterni al database.
Nessuna parola estratta viene inserita automaticamente. Le traduzioni,
le cooccorrenze in definizioni e le relazioni lessicografiche a livello di voce
non diventano risposte approvate. Le fonti e gli output hanno hash e provenienza;
attribuzioni e condizioni del corpus accompagnano le evidenze importate.

Il revisore sceglie il senso familiare del prompt e controlla singolarmente
ogni associazione secondo le direttive. Documenta motivazione, senso della
risposta, relazione, lingua del prompt e vincoli di non ridondanza.
Un bacino verificato può contenere meno di sette parole: viene conservato,
ma non produce set finché non è stato ampliato quanto necessario.

`import-reviewed` verifica il contratto del verbale, gli hash e i vincoli.
**Non è un LLM e non dimostra automaticamente che una relazione sia sensata.**
Un file che si autodichiara verificato senza una revisione reale non è una fonte
valida. Il pacchetto iniziale documenta una revisione editoriale di ChatGPT;
non dichiara verifiche umane né QA indipendente di giocabilità.

Tutte le righe del pacchetto vengono controllate prima di avviare la transazione.
Una riga non conforme respinge il pacchetto. Il reimport dello stesso contenuto
è idempotente; un ampliamento richiede un nuovo verbale completo, conservando
quello precedente nell'audit.

Ogni verbale risponde a una **versione delle regole** (`SEMANTIC_POLICY` in
`semantic_rules.py`): dichiarata in `review.policy_version`, oppure ricavata
dall'hash delle direttive registrato in `resources/policy_versions.json`.
Un ritocco al testo delle direttive che non cambia le regole non invalida i
bacini: dopo la modifica si registra il nuovo testo con
`python -B prompt_database.py register-directives`. Un cambio di regole fa
salire `SEMANTIC_POLICY` e manda in rivalutazione tutti i bacini.

## Task VS Code

Aprire **Terminale → Esegui attività** e scegliere:

- **1. Prompt: raccogli e inserisci inventario da tutte le fonti registrate**:
  scarica o riusa le fonti e inserisce i prompt raccolti nelle tabelle
  `inventory_*`. Nessun Qwen, GPU o generazione di associazioni.
- **Prompt: stato dell'inventario raccolto**: mostra conteggi e provenienza.
- **Prompt: importa solo bacini già revisionati**: richiede il file JSONL
  con le revisioni già effettuate. Non esegue da solo la revisione semantica.
- **Livecade: genera lista (7 risposte per prompt)**: chiede quanti prompt
  distinti estrarre e un seed facoltativo, sceglie i prompt casualmente e per
  ognuno estrae sette risposte rispettando gruppi e conflitti.
- **Prompt: aggiorna prompt.sql dal database**: aggiorna il dump dei bacini
  verificati (senza inventario), da versionare dopo ogni importazione.
- **Prompt: stato e integrità del DB**: riporta conteggi e controlli SQLite.

I task usano l'ambiente `.venv` già presente. Le nuove utility richiedono solo
la libreria standard Python. Fuori da VS Code è possibile usare `python`.
Su sistemi diversi da Windows indicare `--sqlite /percorso/sqlite3` alla versione 3.54.1.

Esempi dalla cartella `gioco-zeroassociations`:

```powershell
python -B prompt_database.py import-reviewed resources/prompt_pools_reviewed_20261109.jsonl
python -B prompt_database.py status
python -B prompt_database.py livecade --count 50 --seed lotto-1
python -B prompt_database.py livecade --category 008 --seed panificazione
python -B prompt_database.py dump
```

I CSV a cinque colonne hanno suffisso progressivo da `0001`; non sovrascrivono
i precedenti. Un JSON affiancato documenta seed, accezioni, hash dei bacini e
prompt insufficienti. `--difficulty easy medium hard unrated` può filtrare
le risposte; senza filtro sono ammesse tutte le difficoltà. Le etichette del
pacchetto iniziale sono stime editoriali, **non risultati di test con giocatori**.

Il comando `livecade` usa tutti i prompt estraibili se `--count` è omesso.
Se il numero richiesto supera i bacini estraibili, l'esportazione si ferma:
non duplica prompt per raggiungere la quantità. Il parametro `--category`
filtra i prompt per categoria. Categoria e cluster accompagnano ciascun
record del rapporto JSON; il CSV conserva le cinque colonne richieste.

La scelta delle risposte non è uniforme fra tutte le combinazioni ammissibili: viene
mescolato l'ordine di ricerca, rispettando i vincoli. Il medesimo seed e bacino
riproducono lo stesso risultato. Il comando generico `sample` conserva le
vecchie modalità sperimentali 7/8 per analisi, ma non è il percorso Livecade.
Per impostazione predefinita un'insufficienza blocca l'intera esportazione,
con elenco dei prompt da ampliare; `--allow-partial` permette un lotto parziale
esplicitamente documentato. Il prompt non viene cancellato dal database.

La banca distingue accezioni, associazioni, motivazioni, difficoltà, evidenze,
verbali, gruppi e incompatibilità. Un prompt può conservare più accezioni
revisionate; il campionamento usa quella familiare indicata in `prompts`.
Il DB non contiene nuove proposte in attesa né pacchetti respinti.

## Categorie nel database

`categories` contiene ID, nome della categoria, ID e nome del cluster.
`prompts.category_id` e `senses.category_id` sono obbligatori e devono
corrispondere al catalogo. La migrazione preserva i dati e i verbali precedenti;
i trigger applicano lo stesso vincolo anche al database della prima versione.
La vista `prompt_catalog` mostra prompt, categoria, cluster, significato e
numero totale di associazioni. Esempio:

```sql
SELECT prompt, category_id, category_name, association_count
FROM prompt_catalog ORDER BY prompt;
```

Gli ID 001–172 mantengono la tassonomia precedente. Il catalogo DB aggiunge
sei categorie (173–178) documentate in
`resources/prompt_category_extensions.json`, per classificare contesti
generali senza forzarli in categorie specialistiche estranee.

I 51 nuovi bacini sono motivati singolarmente in
`resources/prompt_pool_expansion_20261109.json`. Le revisioni pronte per
l'importazione sono raccolte in `resources/prompt_pools_reviewed_20261109.jsonl`.
Le copie prima della migrazione sono in `database-backups/`.

## Ripristino

Da PowerShell, con un **nuovo** percorso di destinazione:

```powershell
$sqlitePrompt = Join-Path $env:LOCALAPPDATA 'Zerocade/sqlite-3.54.1/sqlite3.exe'
& $sqlitePrompt nuovo_prompt.sqlite3 '.read prompt.sql'
& $sqlitePrompt nuovo_prompt.sqlite3 'PRAGMA integrity_check;'
```

Il dump contiene anche i verbali editoriali e le attribuzioni, non l'inventario. I precedenti
CSV da 5.000 prompt, le bozze locali in quarantena e i generatori storici non
vengono importati o promossi automaticamente. La revisione di quei dati resta
un lavoro distinto; il nuovo database non significa che tutti i 5.000 siano corretti.

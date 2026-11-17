# Associazioni dei prompt filtrati: avanzamento e ripresa

> **Revisione documentale — 16 novembre 2026.** Le assegnazioni ad agenti e i lotti del 9–10 novembre sono registrazioni storiche, non lavorazioni attive in questa revisione. La copia di gioco attuale contiene 3.941 prompt e 58.551 collegamenti; per riprendere la coda occorre confrontare i registri locali e i bacini già importati, senza ripartire dai conteggi iniziali sotto.
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

## Stato del lavoro

La lavorazione del 9 novembre 2026 comprende cinque lotti editoriali centrali
(121 nuovi bacini e 1.382 associazioni) e tre code distinte assegnate agli
agenti dopo autorizzazione esplicita dell'utente. I conteggi aggiornati delle
copie pubblicate e dei risultati importati sono nel
[rapporto verificabile](resources/avanzamento_associazioni_filtrati_20261109.json).

Il lavoro sull'intera coda è **incompleto**. La fotografia iniziale comprende
9.823 candidati di `filtered_prompts`:

| Stato | Voci |
|---|---:|
| Con bacino revisionato prima della delega | 222 |
| Prompt già validato, associazioni da costruire prima della delega | 4.201 |
| Revisione del prompt ancora necessaria | 5.400 |

Un altro bacino preesistente è valido ma esterno a quella preselezione: per
questo il totale dei validi supera di uno la copertura della coda.

**Aggiornamento del 10 novembre 2026:** le 5.400 revisioni dei prompt ancora
necessarie (posizioni 2.500–7.899 della lista congelata) sono state completate
con la revisione editoriale LLM di Claude: 2.194 prompt validati, 2.951 scarti
e 255 rinvii (`DEFERRED`, fra cui 49 temi identitari o delicati da decidere a
mano). Bozze, decisioni e rapporti di importazione sono in
`prompt-staging/reviews/completion_20261109_claude/` (`decisions_02500_04525`,
`decisions_04525_07900`, `import_*.json`). Nessun candidato della coda resta in
`WAITING_PROMPT_REVIEW`; il lavoro rimanente riguarda le associazioni.
I numeri aggiornati sono in
[progress.json](prompt-staging/associations/filtered_20261109/progress.json).
La delega distribuisce i 9.601 candidati ancora da elaborare in tre parti:
3.201, 3.200 e 3.200 voci. Gli agenti salvano soltanto verbali e correzioni
nelle proprie cartelle; la scrittura dei database resta centrale. Il salvataggio
di una coda non garantisce che un processo continui dopo la fine della sessione.

I bacini sono ampliabili. Le parole registrate sono quelle effettivamente
giustificate nella revisione; non si dichiara esaurita la lingua italiana né
l'insieme di tutte le associazioni possibili.

## Lavorazione finale del 10 novembre 2026

La coda dei prompt validati ancora senza bacino (5.865 voci) è congelata in
`prompt-staging/associations/finale_20261110/`, divisa in sei partizioni per altrettanti
agenti (autorizzazione esplicita dell'utente) e in una partizione unica per la sola
modalità Qwen. Ogni prompt riceve tutte le associazioni valide trovate, di norma 12–20.
Le istruzioni degli agenti sono in `ISTRUZIONI_AGENTI.md`, nella stessa cartella.

| Passo | Comando o task VS Code |
|---|---|
| Scheda dei prossimi prompt di una partizione | `script/final_associations.py sheet shard_NN` |
| Foglio editoriale → lotto | `script/final_associations.py serialize shard_NN NNNN` |
| Bozze Qwen da rivedere | task «Associazioni: continua con Qwen (bozze, poi revisione)» |
| Solo Qwen, senza agenti | task «Associazioni: continua solo con Qwen (senza agenti)» |
| Importazione dei lotti rivisti | task «Associazioni: importa i lotti rivisti dagli agenti» |
| Database finale | task «Prompt: rigenera lo schema finale (prompt, parole, collegamenti)» |

Le bozze Qwen (`qwen/drafts.jsonl`) non sono approvazioni: il revisore verifica ogni
parola, scarta le difettose e aggiunge le mancanti; il serializzatore registra quante ne
ha tenute. La modalità solo Qwen esegue prima il pilota delle 32 coppie sul modello
configurato (`resources/association_draft_model.json`) e importa, a nome di Qwen, soltanto
se registra zero accettazioni e zero rifiuti errati; altrimenti i lotti restano in
`agent_outputs/qwen_solo/` da rivedere. Un bacino della sola modalità Qwen può essere
sostituito in seguito da una revisione editoriale completa dello stesso prompt.

## Materiale editoriale

I file `resources/associazioni_editoriali_20261109_01.txt` fino a `_05.txt`
contengono le decisioni di ChatGPT. Ogni riga conserva risposta, senso della
risposta, relazione, gruppo semantico e motivazione individuale.
I corrispondenti JSON delle annotazioni e i pacchetti
`resources/bacini_revisionati_20261109_01.jsonl` fino a `_05.jsonl`
conservano verbali, hash, provenienza e vincoli.

Le [risposte riesaminate](resources/risposte_riesaminate_20261109.json)
documentano proposte non mantenute, rinvii e sostituzioni. Queste decisioni
riguardano la singola coppia e non creano blacklist globali.

Sono state corrette le categorie di dieci prompt prima di costruirne i bacini:
`capello`, `bambola`, `pupazzo`, `giocattolo`, `scivolo`, `altalena`, `buio`,
`freddo`, `scatola`, `carta`. Le nuove revisioni preservano il riferimento al
verbale precedente. Le categorie 188 (giocattoli e gioco infantile) e 189
(contenitori e imballaggi), insieme alla 190 (azioni manuali e manipolazione
quotidiana degli oggetti), estendono il catalogo; gli ID 001–172 restano invariati.

I verbali degli agenti sono in
`prompt-staging/associations/filtered_20261109/agent_outputs/shard_01`,
`shard_02` e `shard_03`. Le correzioni sono nuovi verbali completi, con
`supersedes_file` oppure `corrects_file` e `correction_reason`; gli originali
non vengono riscritti. Gli artefatti e le ricevute dell'importazione centrale
sono in `central_imports/`, nella stessa cartella del lavoro.

La revisione è editoriale LLM, attribuita a ChatGPT. Non dichiara test umani
né QA indipendente di giocabilità. La difficoltà delle nuove risposte è
`unrated`, in attesa di calibrazione: non sono stati inventati dati di gioco.

## Procedura di ripresa

Dalla cartella `gioco-zeroassociations`:

```powershell
# Coda congelata delle entry da elaborare e stato corrente nella raccolta.
.venv/Scripts/python.exe -B script/association_catalog.py status
```

La fotografia è in `prompt-staging/associations/filtered_20261109/entries.jsonl`.
`entry_states.jsonl` identifica lo stato di ogni singolo prompt.
La preparazione ripetuta dello stesso lavoro conserva l'elenco iniziale.
Per aggiunte successive ai filtrati si prepara una nuova cartella di lavoro.

Per ogni candidato ancora da lavorare:

1. Risolvere, se necessario, la revisione del prompt con senso, POS, lingua e
   categoria documentati. Registrarla nella raccolta attraverso gli strumenti
   di revisione del progetto.
2. Proporre associazioni nello stesso significato e leggere ciascuna coppia
   secondo le direttive. Cercare alternative per le proposte deboli.
3. Registrare nel foglio editoriale soltanto le decisioni positive effettive;
   conservare separatamente le proposte respinte o ancora dubbie.
4. Controllare il bacino complessivo e assegnare gruppi e incompatibilità.
5. Compilare e importare il nuovo lotto già revisionato.

Formato del foglio editoriale:

```text
@ prompt
risposta | senso della risposta | relazione | gruppo_semantico | motivazione concreta della coppia
```

I comandi seguenti usano percorsi segnaposto da sostituire:

```powershell
# Converte decisioni già revisionate; non effettua una revisione semantica.
.venv/Scripts/python.exe -B script/association_catalog.py record-reviewed resources/NUOVO_LOTTO.txt --reviewer "NOME DEL REVISORE EFFETTIVO" --output resources/NUOVO_LOTTO.jsonl

# Importa e aggiorna copia valida e copia di gioco.
.venv/Scripts/python.exe -B script/association_catalog.py import-reviewed resources/NUOVO_LOTTO.jsonl

# Ricostruisce la fotografia dei filtrati e l'archivio degli scarti.
.venv/Scripts/python.exe -B script/filter_prompts.py build

# Ricalcola lo stato della coda.
.venv/Scripts/python.exe -B script/association_catalog.py status
```

`record-reviewed` assegna limite uno a ogni gruppo. Per decisioni più articolate,
limiti espliciti pari a due o conflitti, usare un'annotazione JSON strutturata
e `compile-reviewed`. Tutti gli elementi di un gruppo devono essere assegnati
editorialmente; il nome del gruppo non è un classificatore semantico.

## Controlli di importazione

Per importare un lotto di un agente già revisionato:

```powershell
.venv/Scripts/python.exe -B script/ingest_agent_associations.py prompt-staging/associations/filtered_20261109/agent_outputs/shard_01/batch_0001.jsonl

# Dopo gli aggiornamenti delle copie, rigenera il rapporto e controlla i bacini.
.venv/Scripts/python.exe -B script/association_progress.py
```

L'importatore sceglie l'ultima correzione esplicita indirizzata a quel lotto,
verifica appartenenza alla partizione, hash dell'input, direttive e autore.
Conserva il riferimento alla decisione originale per ogni prompt e controlla
che parole, significati e vincoli non siano stati modificati dal serializzatore.
Le correzioni di bacini già importati richiedono il riferimento esatto alla
revisione precedente nella stessa transazione SQLite. Una revisione esterna
intervenuta nel frattempo blocca la sostituzione.

Un bacino semanticamente valido può avere meno di sette scelte compatibili.
Resta nel database e viene segnalato come non estraibile per Livecade; il
campionatore lo salta. Si cercano ulteriori associazioni senza aggiungere
riempitivi e senza indebolire i gruppi di equivalenti.

[script/association_catalog.py](script/association_catalog.py) verifica il contratto del
bacino e il collegamento alle decisioni conservate: hash del foglio e delle
annotazioni, identità di parole e vincoli, attribuzione del revisore,
direttive e revisione corrente del prompt.

La scrittura controlla nella stessa transazione che il riferimento del prompt
sia ancora corrente, che non esistano decisioni bloccanti e che un altro
processo non abbia creato nel frattempo il bacino. Questo percorso è dedicato
ai nuovi bacini e non sovrascrive quelli già presenti.
La ripetizione di un'importazione già completata riconosce il contenuto
esistente; un errore nella copia derivata può essere risolto ripetendo il comando.

Prima delle nuove scritture si salva un backup delle tabelle del gioco e dei
registri di revisione in `database-backups/`. L'inventario originale resta
nella raccolta. Le copie vengono controllate mediante i controlli di integrità
SQLite previsti dagli strumenti esistenti.

Per ampliare un bacino già presente, produrre un nuovo verbale completo e
usare il percorso di aggiornamento descritto in [PROMPT_VALIDI.md](PROMPT_VALIDI.md).
Il precedente verbale rimane nell'audit.

Questi controlli tecnici richiedono una revisione editoriale autentica a monte.
Non valutano da soli se una frase sia vera o un'associazione naturale.
Le estrazioni casuali restano candidate fino alle verifiche di rilascio.

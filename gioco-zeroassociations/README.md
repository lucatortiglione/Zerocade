# ZeroAssociazioni: prompt e associazioni verificate

> **Revisione documentale — 16 novembre 2026.** La copia di gioco contiene 3.941 prompt, 11.847 parole e 58.551 collegamenti. I riferimenti a lotti e deleghe del 9 novembre descrivono la lavorazione storica; non indicano agenti attivi. Il DB di lavoro locale pesa circa 3,43 GB. ZeroContext ne riusa l'inventario e i sensi revisionati, mantenendo una banca di segrete distinta.
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

La tassonomia canonica è ora in [JSON](resources/taxonomy_it_v3_6_0.json), così
il checkout non dipende dai CSV locali ignorati da Git. Conserva le stesse 172
categorie e i 16 cluster, con provenienza e impronta del CSV originale. Archivio
e validatore condividono il lettore; l'opzione `--taxonomy` accetta ancora un CSV
esplicito, oltre al JSON.

Il gioco mostra una parola (il **prompt**) e la chat indovina **7 o 8 parole
collegate nascoste**. Questa cartella produce e verifica quei dati; il gioco è in
`apps/overlay/src/games/wordAssociation.ts` e li legge dal server.

La lavorazione storica della coda comprende cinque lotti centrali
e tre partizioni delegate, con verifica e importazione centrali.
I 102 bacini precedenti vengono confrontati per preservarne il contenuto.
I conteggi aggiornati sono in [stato e ripresa](ASSOCIAZIONI_FILTRATI.md) e nel
[rapporto verificabile](resources/avanzamento_associazioni_filtrati_20261109.json).

## Il ciclo

1. **Inventario**: raccogliere i prompt dalle fonti (`script/prompt_inventory.py collect`,
   [PROMPT_INVENTORY.md](PROMPT_INVENTORY.md)) e integrare, scartare o rimandare
   gli aggiornamenti e le singole voci (`script/inventory_updates.py`,
   [AGGIORNAMENTI_FONTI.md](AGGIORNAMENTI_FONTI.md)). Nessuna associazione.
   **Normalizzazione** (task «1a»): `script/normalize_words.py apply` registra i plurali puri come scartati
   (si tiene il singolare); poi il task 3 li toglie da filtrati e validi.
2. **Bacini**: per un prompt scelto, fissare il senso familiare e proporre le
   associazioni partendo dal concetto, non dalle definizioni (bozze:
   `script/free_association_llm.py propose`). Ogni parola si verifica con le [regole](REGOLE.md).
3. **Importazione**: `script/prompt_database.py import-reviewed` accetta solo bacini con
   verbale completo ([PROMPT_DATABASE.md](PROMPT_DATABASE.md)) nella raccolta
   (schema `raw`); lo schema `game`, i soli bacini, è fatto di viste sulla raccolta.
   `script/validated_prompt_database.py sync` ne ricava lo schema `validi`, la copia
   dei prompt validati insieme alle loro parole associate (solo quelli con un bacino).
   Sono schemi del DB unico `database/parole_ita_raw.sqlite3`; il gioco li vede dopo
   `python database/script/giochi.py aggiorna associazioni`.
4. **Gioco**: a ogni round il server estrae 7 o 8 parole dal bacino, rispettando
   gruppi di equivalenti e coppie incompatibili. Per Livecade: `livecade` (7 parole).
5. **Telemetria**: la dashboard scarica i CSV «Round» e «Tentativi» del gioco.
6. **Analisi**: `script/analyze_telemetry.py` misura la difficoltà di ogni parola, segnala
   quelle mai trovate e propone le parole che la chat scrive spesso. Le proposte
   tornano al punto 2: nessuna entra nel DB senza revisione.

`script/free_association_llm.py recall` simula i giocatori sui bacini già importati
(K giocatori indipendenti vedono solo il prompt): utile prima di avere dati veri,
ma resta una diagnosi.

## Comandi

Dalla cartella `gioco-zeroassociations`, con `.venv/Scripts/python.exe -B`:

| Comando | Cosa fa |
|---|---|
| `script/prompt_inventory.py collect` | Raccoglie l'inventario dei prompt (task «1. Prompt: raccogli…») |
| `script/aggiorna_parole_raw.py` | Task «ZeroCade : Aggiornamento parole RAW»: secondo DB `parole_ita_raw_2.0.sqlite3`, tabella `parole` senza duplicati, tutte le fonti e backup; [schema](../database/PAROLE_RAW_2.0.md) |
| `script/normalizza_parole_raw_v2.py` | Task «ZeroCade : Normalizzare parole RAW»: popola `normalizzata`, con eccezioni per femminili autonomi e plurali esclusivi/più comuni; [criteri](../database/PAROLE_RAW_2.0.md#normalizzazione-delle-forme-delle-parole) |
| `script/normalize_words.py plan` / `apply` | Normalizzazione: conta / registra i plurali puri come DISCARDED, con il singolare nel motivo (task «1a)Parole: normalizza…»); non tocca le decisioni di altri |
| `script/prompt_database.py import-reviewed FILE.jsonl` | Importa bacini già revisionati, tutto o niente |
| `script/prompt_database.py status` | Conteggi e integrità del DB |
| `script/prompt_database.py dump` | Ricrea lo schema `game`, viste sui bacini della raccolta (senza inventario); con `--output FILE` scrive i bacini in un DB a sé |
| `script/prompt_database.py livecade --count N` | CSV per Livecade: N prompt, 7 risposte ciascuno |
| `script/prompt_database.py register-directives` | Dopo un ritocco al testo delle direttive che non cambia le regole |
| `script/inventory_updates.py …` | Aggiornamenti delle fonti e decisioni sulle voci (task «Fonti: …» e «Voci: …») |
| `script/nlp_tools.py lookup / analyze / benchmark` | Analisi lessicali di parole isolate, previsioni contestuali e confronto spaCy/Stanza/Simplemma ([guida](ANALISI_NLP.md)) |
| `script/evaluate_imported_words.py` | Valuta le nuove parole per ogni gioco, con esiti nella raccolta e rapporto per ruolo ([risultati del lotto](VALUTAZIONE_NUOVE_PAROLE.md)) |
| `script/validated_prompt_database.py sync` | Rigenera lo schema `validi` dai verbali correnti |
| `script/analyze_telemetry.py --guesses T.csv --rounds R.csv --output rapporto.json --proposals proposte.jsonl` | Analisi della chat |
| `script/free_association_llm.py --output r.json recall` | Giocatori simulati sui bacini (LLM locale) |
| `script/free_association_llm.py --output b.jsonl propose mare sole` | Bozze di bacino per prompt nuovi |
| `script/qwen_associations.py drafts` | Bozze Qwen locali per i prompt senza bacino, da rivedere (task «Associazioni: continua con Qwen…») |
| `script/qwen_associations.py solo` | Solo Qwen: bozza e autoverifica; importa solo se il pilota delle associazioni è superato |
| `script/final_associations.py import` | Importa i lotti rivisti dagli agenti nella raccolta |
| `script/final_associations.py build --sync` | Rigenera lo schema `finale`: prompt, parole uniche e collegamenti |

`npm run test:associations`, dalla radice del progetto, esegue i test Python e quelli del gioco.

## Dove legge il gioco

Il server legge, in sola lettura, lo schema `associazioni` del DB dei giochi
(`database/giochi.sqlite3`, in Git): i soli bacini che il gioco usa, copiati dal DB
di lavoro con `python database/script/giochi.py aggiorna associazioni` (dalla radice del
progetto). Solo i prompt con revisione `verified`, nel senso indicato da
`prompts.familiar_sense`; mai quelli che la raccolta segna `DISCARDED` o `DEFERRED`.
Se la copia è indietro rispetto al DB di lavoro, il log del server lo dice. Senza lo
schema il server legge il DB di lavoro (`#validi`, poi `#game`, poi `#raw`). I bacini
nuovi compaiono dopo la copia e un riavvio di Zerocade. Il pacchetto Windows ha
soltanto `giochi.sqlite3`.

## Il DB unico

`database/parole_ita_raw.sqlite3` riunisce i sei DB storici in un solo file, uno **schema** ciascuno. In
SQLite lo schema è il prefisso `<schema>__` di tabelle, indici, viste e trigger: `raw`, `game`, `validi`,
`filtrati`, `finale`, `scartati`, più `candidati`, nato nel DB unico. Non è in Git (circa 3,43 GB al 16 novembre 2026). Si chiamava
`zeroassociazioni.sqlite3`. Sta nella cartella `database/` del repository (`unified_db.DB_DIR`), non accanto
agli script; [database/DB.md](../database/DB.md) spiega ogni file.

- I sei file storici sono stati cancellati il 13/11, dopo il confronto riga per riga con i loro schemi:
  `script/unified_db.py build`, che creava il DB unico copiandoli, non ha più da dove copiare. Va tenuta una
  copia di sicurezza del DB unico. `verify` confronta una tabella con il file d'origine solo se quel file
  c'è; `status` mostra schemi, oggetti e righe; `export SCHEMA FILE` riscrive uno schema come DB a sé.
- Gli script indicano uno schema come `database/parole_ita_raw.sqlite3#raw` (`unified_db.address('raw')`), la
  stessa scrittura del server. Il vecchio nome del file (`prompt_raw.sqlite3`, …), che compare nei metadati e
  nelle ricevute già scritti, indica ancora lo stesso schema (`unified_db.same_db`). L'SQL resta scritto coi
  nomi senza prefisso e viene riscritto al volo (`SQLite` in `script/sqlite_prompt_runtime.py`, `unified_db.connect`). Un
  file con un altro nome (le copie temporanee, i test) è un DB normale. Le copie ricostruite
  (`publish_database`) sostituiscono lo schema in una transazione.
- Il server legge la copia nello schema `associazioni` di `database/giochi.sqlite3`; senza, legge
  `parole_ita_raw.sqlite3#validi`, poi `#game`, poi `#raw`.
- `ZEROASSOC_DB=legacy` faceva tornare gli script ai vecchi file, che non ci sono più.

## File

Gli schemi del DB unico (fra parentesi il nome del file storico, che indica ancora lo stesso schema).

- `raw` (`prompt_raw.sqlite3`): la raccolta, database operativo (con l'inventario è quasi tutto il file).
- `game` (`prompt.sqlite3`): i bacini verificati e le decisioni sulle voci, come viste sulle tabelle di `raw`.
- `finale` (`prompt_finale.sqlite3`): la copia finale per prompt e parole. Tabelle `prompts`, `words`
  (ogni parola una sola volta) e `prompt_words` (collegamenti molti a molti, con motivazione
  per coppia); viste `prompt_word_list` e `word_usage`. Contiene solo bacini verificati.
- `validi` (`prompt_validi.sqlite3`): i prompt validati con le loro parole associate
  (si rigenera con `sync`).
- `filtrati` (`prompt_filtrati.sqlite3`): candidati preselezionati automaticamente e, nella tabella
  `validated_prompts`, le parole verificate come prompt (senso e categoria) ancora senza
  associazioni; la vista `review_state` separa `VALIDATO` da `DA_RIVEDERE`.
- `scartati` (`prompt_scartati.sqlite3`): scarti dei filtri e scarti espliciti, con motivo e
  provenienza; vedere [candidati, voci valide e scarti](PROMPT_SCARTATI.md).
- `candidati`: le parole dei filtrati giudicate buoni prompt; vedere [database/DB.md](../database/DB.md).
- `prompt_schema.sql`, `prompt_inventory_schema.sql`: schemi.
- `resources/policy_versions.json`: per ogni testo delle direttive, la versione
  delle regole (`SEMANTIC_POLICY`) con cui i bacini sono stati revisionati.
- `resources/prompt_policy.json`: prestiti comuni ammessi (lista chiusa) e soglia
  massima Zipf **≤ 2,2** per i termini italiani (dal 16 novembre 2026, versione `2026-11-16.2`).
  Restano le eccezioni NVdB e la frequenza di riferimento delle forme verbali attestate.
- `script/verified_pools.py`: lettura dei bacini e confronto delle parole, con le stesse
  regole del gioco (accenti, forme flesse).
- `script/validate_word_association_it_v3_6_0.py`: validatore tecnico dei CSV.
- [Direttive complete](direttive_word_association_it_v3_6_0.md) e
  [direttiva di pertinenza](DIRETTIVA_INDIZI.md): il riferimento normativo.
- [archivio](archivio/LEGGIMI.md): la vecchia estrazione dalle definizioni.

Nessun controllo automatico approva un'associazione: le revisioni dichiarano chi
le ha fatte (`human_review`) e i dati di gioco non sostituiscono la revisione.

La stessa risposta può essere usata per più prompt, anche nella stessa lista.
Ogni coppia ha una revisione e una motivazione proprie: `forno`, per esempio,
può appartenere sia a PANE sia a PIZZA. Il DB e l'estrazione vietano i duplicati
soltanto all'interno del singolo bacino o della sua estrazione.

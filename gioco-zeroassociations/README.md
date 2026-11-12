# ZeroAssociazioni: prompt e associazioni verificate

Il gioco mostra una parola (il **prompt**) e la chat indovina **7 o 8 parole
collegate nascoste**. Questa cartella produce e verifica quei dati; il gioco è in
`apps/overlay/src/games/wordAssociation.ts` e li legge dal server.

La costruzione dei bacini dell'intera coda è in corso: cinque lotti centrali
e tre agenti su partizioni distinte, con verifica e importazione centrali.
I 102 bacini precedenti vengono confrontati per preservarne il contenuto.
I conteggi aggiornati sono in [stato e ripresa](ASSOCIAZIONI_FILTRATI.md) e nel
[rapporto verificabile](resources/avanzamento_associazioni_filtrati_20261109.json).

## Il ciclo

1. **Inventario**: raccogliere i prompt dalle fonti (`prompt_inventory.py collect`,
   [PROMPT_INVENTORY.md](PROMPT_INVENTORY.md)) e integrare, scartare o rimandare
   gli aggiornamenti e le singole voci (`inventory_updates.py`,
   [AGGIORNAMENTI_FONTI.md](AGGIORNAMENTI_FONTI.md)). Nessuna associazione.
2. **Bacini**: per un prompt scelto, fissare il senso familiare e proporre le
   associazioni partendo dal concetto, non dalle definizioni (bozze:
   `free_association_llm.py propose`). Ogni parola si verifica con le [regole](REGOLE.md).
3. **Importazione**: `prompt_database.py import-reviewed` accetta solo bacini con
   verbale completo ([PROMPT_DATABASE.md](PROMPT_DATABASE.md)) nella raccolta
   `prompt_raw.sqlite3`, e aggiorna subito `prompt.sqlite3`, il database del gioco.
   `validated_prompt_database.py sync` ne ricava `prompt_validi.sqlite3`, la copia
   dei prompt validati insieme alle loro parole associate (solo quelli con un bacino).
4. **Gioco**: a ogni round il server estrae 7 o 8 parole dal bacino, rispettando
   gruppi di equivalenti e coppie incompatibili. Per Livecade: `livecade` (7 parole).
5. **Telemetria**: la dashboard scarica i CSV «Round» e «Tentativi» del gioco.
6. **Analisi**: `analyze_telemetry.py` misura la difficoltà di ogni parola, segnala
   quelle mai trovate e propone le parole che la chat scrive spesso. Le proposte
   tornano al punto 2: nessuna entra nel DB senza revisione.

`free_association_llm.py recall` simula i giocatori sui bacini già importati
(K giocatori indipendenti vedono solo il prompt): utile prima di avere dati veri,
ma resta una diagnosi.

## Comandi

Dalla cartella `gioco-zeroassociations`, con `.venv/Scripts/python.exe -B`:

| Comando | Cosa fa |
|---|---|
| `prompt_inventory.py collect` | Raccoglie l'inventario dei prompt (task «1. Prompt: raccogli…») |
| `prompt_database.py import-reviewed FILE.jsonl` | Importa bacini già revisionati, tutto o niente |
| `prompt_database.py status` | Conteggi e integrità del DB |
| `prompt_database.py dump` | Rigenera `prompt.sqlite3` dalla raccolta (solo bacini, senza inventario) |
| `prompt_database.py livecade --count N` | CSV per Livecade: N prompt, 7 risposte ciascuno |
| `prompt_database.py register-directives` | Dopo un ritocco al testo delle direttive che non cambia le regole |
| `inventory_updates.py …` | Aggiornamenti delle fonti e decisioni sulle voci (task «Fonti: …» e «Voci: …») |
| `validated_prompt_database.py sync` | Rigenera `prompt_validi.sqlite3` dai verbali correnti |
| `analyze_telemetry.py --guesses T.csv --rounds R.csv --output rapporto.json --proposals proposte.jsonl` | Analisi della chat |
| `free_association_llm.py --output r.json recall` | Giocatori simulati sui bacini (LLM locale) |
| `free_association_llm.py --output b.jsonl propose mare sole` | Bozze di bacino per prompt nuovi |
| `qwen_associations.py drafts` | Bozze Qwen locali per i prompt senza bacino, da rivedere (task «Associazioni: continua con Qwen…») |
| `qwen_associations.py solo` | Solo Qwen: bozza e autoverifica; importa solo se il pilota delle associazioni è superato |
| `final_associations.py import` | Importa i lotti rivisti dagli agenti nella raccolta |
| `final_associations.py build --sync` | Rigenera `prompt_finale.sqlite3`: prompt, parole uniche e collegamenti |

`npm run test:associations`, dalla radice del progetto, esegue i test Python e quelli del gioco.

## Dove legge il gioco

Il server usa, in sola lettura, la prima fonte che contiene bacini:
`prompt_validi.sqlite3`, poi `prompt.sqlite3` (in Git: un clone appena scaricato
ha già i prompt), poi la raccolta `prompt_raw.sqlite3`. Solo i prompt con
revisione `verified`, nel senso indicato da `prompts.familiar_sense`; mai quelli
che la raccolta segna `DISCARDED` o `DEFERRED`. Se `prompt.sqlite3` è indietro
rispetto alla raccolta, il log del server lo dice. I bacini nuovi compaiono al
riavvio di Zerocade. Il pacchetto Windows include un database ridotto ai soli bacini
(`zeroassociations.db`, circa 2 MB).

## Il DB unico

`zeroassociazioni.sqlite3` riunisce i sei DB qui sotto in un solo file, uno **schema** ciascuno. In SQLite
lo schema è il prefisso `<schema>__` di tabelle, indici, viste e trigger: `raw` (prompt_raw.sqlite3),
`game` (prompt.sqlite3), `validi`, `filtrati`, `finale`, `scartati`. Non è in Git (pesa gigabyte).

- `unified_db.py build` lo crea copiando i sei DB, che restano dove sono; `verify` confronta ogni
  tabella con il file d'origine (righe e contenuto) e solo allora il DB unico viene usato;
  `status` mostra schemi, oggetti e righe; `export SCHEMA FILE` riscrive uno schema come DB a sé.
- Gli script non cambiano: continuano a indicare `prompt_raw.sqlite3`, `prompt_validi.sqlite3`, …, e
  quel percorso significa lo schema corrispondente del DB unico. L'SQL resta scritto coi nomi senza
  prefisso e viene riscritto al volo (`SQLite` in `sqlite_prompt_runtime.py`, `unified_db.connect`). Un
  file con un altro nome (le copie temporanee, i test) è un DB normale. Le copie ricostruite
  (`publish_database`) sostituiscono lo schema in una transazione.
- Il server e il pacchetto Windows leggono `zeroassociazioni.sqlite3#validi`, poi `#game`, poi `#raw`.
- `ZEROASSOC_DB=legacy` fa tornare gli script ai vecchi file. I vecchi file non vengono più aggiornati
  quando il DB unico è in uso: si possono cancellare dopo `verify`, ma conviene conservarne una copia.

## File

- `prompt_raw.sqlite3`: la raccolta, database operativo unico, esclusa da Git (con
  l'inventario pesa gigabyte).
- `prompt.sqlite3`: i bacini verificati e le decisioni sulle voci, versionato: è il
  database del gioco.
- `prompt_finale.sqlite3`: la copia finale per prompt e parole. Tabelle `prompts`, `words`
  (ogni parola una sola volta) e `prompt_words` (collegamenti molti a molti, con motivazione
  per coppia); viste `prompt_word_list` e `word_usage`. Contiene solo bacini verificati.
- `prompt_validi.sqlite3`: i prompt validati con le loro parole associate, esclusa da Git
  (si rigenera con `sync`).
- `prompt_filtrati.sqlite3`: candidati preselezionati automaticamente e, nella tabella
  `validated_prompts`, le parole verificate come prompt (senso e categoria) ancora senza
  associazioni; la vista `review_state` separa `VALIDATO` da `DA_RIVEDERE`.
- `prompt_scartati.sqlite3`: scarti dei filtri e scarti espliciti, con motivo e
  provenienza; vedere [candidati, voci valide e scarti](PROMPT_SCARTATI.md).
- `prompt_schema.sql`, `prompt_inventory_schema.sql`: schemi.
- `resources/policy_versions.json`: per ogni testo delle direttive, la versione
  delle regole (`SEMANTIC_POLICY`) con cui i bacini sono stati revisionati.
- `resources/prompt_policy.json`: prestiti comuni ammessi (lista chiusa) e soglia
  di familiarità Zipf 3,0 per i termini italiani.
- `verified_pools.py`: lettura dei bacini e confronto delle parole, con le stesse
  regole del gioco (accenti, forme flesse).
- `validate_word_association_it_v3_6_0.py`: validatore tecnico dei CSV.
- [Direttive complete](direttive_word_association_it_v3_6_0.md) e
  [direttiva di pertinenza](DIRETTIVA_INDIZI.md): il riferimento normativo.
- [archivio](archivio/LEGGIMI.md): la vecchia estrazione dalle definizioni.

Nessun controllo automatico approva un'associazione: le revisioni dichiarano chi
le ha fatte (`human_review`) e i dati di gioco non sostituiscono la revisione.

La stessa risposta può essere usata per più prompt, anche nella stessa lista.
Ogni coppia ha una revisione e una motivazione proprie: `forno`, per esempio,
può appartenere sia a PANE sia a PIZZA. Il DB e l'estrazione vietano i duplicati
soltanto all'interno del singolo bacino o della sua estrazione.

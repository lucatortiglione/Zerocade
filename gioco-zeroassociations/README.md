# ZeroAssociazioni: prompt e associazioni verificate

Il gioco mostra una parola (il **prompt**) e la chat indovina **7 o 8 parole
collegate nascoste**. Questa cartella produce e verifica quei dati; il gioco è in
`apps/overlay/src/games/wordAssociation.ts` e li legge dal server.

## Il ciclo

1. **Inventario**: raccogliere i prompt dalle fonti (`prompt_inventory.py collect`,
   [PROMPT_INVENTORY.md](PROMPT_INVENTORY.md)) e integrare, scartare o rimandare
   gli aggiornamenti e le singole voci (`inventory_updates.py`,
   [AGGIORNAMENTI_FONTI.md](AGGIORNAMENTI_FONTI.md)). Nessuna associazione.
2. **Bacini**: per un prompt scelto, fissare il senso familiare e proporre le
   associazioni partendo dal concetto, non dalle definizioni (bozze:
   `free_association_llm.py propose`). Ogni parola si verifica con le [regole](REGOLE.md).
3. **Importazione**: `prompt_database.py import-reviewed` accetta solo bacini con
   verbale completo ([PROMPT_DATABASE.md](PROMPT_DATABASE.md)). Poi `dump`.
   `validated_prompt_database.py sync` ne ricava `prompt_validi.sqlite3`, la copia
   con i soli prompt validati e i loro bacini.
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
| `prompt_database.py dump` | Aggiorna `prompt.sql` (solo bacini, senza inventario) |
| `prompt_database.py livecade --count N` | CSV per Livecade: N prompt, 7 risposte ciascuno |
| `prompt_database.py register-directives` | Dopo un ritocco al testo delle direttive che non cambia le regole |
| `inventory_updates.py …` | Aggiornamenti delle fonti e decisioni sulle voci (task «Fonti: …» e «Voci: …») |
| `validated_prompt_database.py sync` | Rigenera `prompt_validi.sqlite3` dai verbali correnti |
| `analyze_telemetry.py --guesses T.csv --rounds R.csv --output rapporto.json --proposals proposte.jsonl` | Analisi della chat |
| `free_association_llm.py --output r.json recall` | Giocatori simulati sui bacini (LLM locale) |
| `free_association_llm.py --output b.jsonl propose mare sole` | Bozze di bacino per prompt nuovi |

`npm run test:associations`, dalla radice del progetto, esegue i test Python e quelli del gioco.

## Dove legge il gioco

Il server usa, in sola lettura, la prima fonte che contiene bacini:
`prompt_validi.sqlite3`, poi `prompt.sqlite3`, poi `prompt.sql` caricato in
memoria (un clone appena scaricato ha solo questo). Solo i prompt con revisione
`verified`, nel senso indicato da `prompts.familiar_sense`; mai quelli che la
raccolta segna `DISCARDED` o `DEFERRED`. I bacini nuovi compaiono al riavvio di
Zerocade. Il pacchetto Windows include un database ridotto ai soli bacini
(`zeroassociations.db`, circa 2 MB).

## File

- `prompt.sqlite3`: database operativo unico, escluso da Git (con l'inventario pesa gigabyte).
- `prompt.sql`: dump dei bacini verificati e delle decisioni sulle voci, versionato.
- `prompt_validi.sqlite3`: copia dei prompt validati, esclusa da Git (si rigenera con `sync`).
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

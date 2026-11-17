# Candidati, voci valide e scarti

> **Revisione documentale — 16 novembre 2026.** Le decisioni delle voci restano nel DB di lavoro e non vanno dedotte dalla sola assenza nella copia di gioco. Esclusione dai prompt, esclusione dalle segrete e mancata ammissione come tentativo sono ruoli diversi: rigenerare ZeroContext applica le proprie regole senza approvare automaticamente nuovi bacini di associazioni.
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

Tutti schemi del DB di lavoro `database/parole_ita_raw.sqlite3`.

| Schema | Contenuto | Utilizzo |
|---|---|---|
| `raw` | Raccolta completa, fonti, aggiornamenti e storico delle decisioni | Archivio principale, nessuna cancellazione per effetto dei filtri |
| `filtrati` | Candidati che superano i filtri automatici e, in `validated_prompts`, le parole verificate come prompt con senso e categoria | Base dei prompt da completare con le associazioni; `review_state` separa `VALIDATO` da `DA_RIVEDERE` |
| `validi` | Prompt validati insieme alle loro parole associate (bacino verificato) | Prompt completi, pronti per il gioco |
| `scartati` | Scarti automatici e scarti espliciti, con motivo | Consultazione e riconsiderazione, senza proporli come prompt utilizzabili |
| `game` | I bacini verificati, come viste sulla raccolta | Distribuzione dei bacini, distinta dall'inventario completo |

Nel DB degli scarti, `discarded_prompts` contiene una sola riga per prompt:

- `reason`: motivo dello scarto;
- `stage`: `AUTOMATIC_FILTER` per le esclusioni della preselezione,
  `EDITORIAL_DECISION` per uno scarto esplicito registrato nella raccolta;
- `zipf`: frequenza, se già disponibile nel risultato del filtro;
- `actor`, `decided_at`, `decision_history_id`: autore, data e riferimento allo
  storico per gli scarti espliciti.

`discarded_prompts` è una vista con queste colonne, e si legge e si scrive da lì.
Le coppie fase-motivo, poche centinaia per milioni di righe, stanno una volta sola
in `discarded_reasons`; le righe, in `discarded_rows`, ne portano il numero.

Gli scarti editoriali della revisione di Claude (candidati 7900–13245,
`script/editorial_review_claude.py`, cartella `prompt-staging/reviews/completion_20261109_claude`)
usano anche il motivo «tema sensibile» (direttive §9) e rinviano a revisione umana
le voci identitarie o discriminatorie delicate.

Le esclusioni automatiche includono anche le fasi iniziali: espressioni di più
parole, assenza di prova di lemma, forma non canonica e familiarità insufficiente.
Essere esclusa dai filtri non dimostra che una voce sia linguisticamente errata.
Una revisione positiva corrente prevale sul filtro; uno scarto esplicito
successivo può sospendere nuovamente il prompt. `DEFERRED` indica una voce da
rivedere: non viene classificata come scarto definitivo.

Lo scarto riguarda il suo uso **come prompt**. Non vieta di usare la stessa
parola come risposta pertinente per un altro prompt. Ogni coppia conserva la
propria verifica, come previsto dalle direttive sul riuso delle risposte.

La raccolta conserva tutti i dati e le decisioni precedenti. Per riconsiderare
una voce si registra una nuova decisione e si rigenerano le copie: non si
modifica direttamente il DB degli scarti. `INTEGRATED` annulla lo scarto
esplicito corrente, ma non equivale a una revisione semantica positiva e non
supera da solo eventuali altri motivi di esclusione automatica.

## Aggiornamento

`script/filter_prompts.py build` aggiorna automaticamente candidati e scarti.
`script/review_prompts.py import-decisions` aggiorna gli scarti dopo le decisioni del
revisore; anche il comando `script/inventory_updates.py decide-term` aggiorna la copia
degli scarti della raccolta principale. Un errore nella copia viene segnalato;
la decisione originale rimane salvata nella raccolta.

Per ricostruire soltanto gli scarti o consultarne i conteggi:

```powershell
.venv/Scripts/python.exe -B script/discarded_prompt_database.py sync
.venv/Scripts/python.exe -B script/discarded_prompt_database.py status
```

In VS Code: **Prompt: aggiorna DB degli scarti** e **Prompt: stato degli scarti**.
Se la raccolta è cambiata dopo la preselezione, eseguire prima il task dei
filtri. Le voci nuove non vengono scartate per semplice assenza da una vecchia
lista di candidati. La pubblicazione usa la sostituzione atomica del file;
se Windows la impedisce per un lettore aperto, usa una copia in transazione
tramite l'[Online Backup API di SQLite](https://www.sqlite.org/backup.html).
Un lock di scrittura produce un errore e lascia intatta la copia precedente.
Non è richiesto un LLM per questa copia.

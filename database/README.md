# Il DB dei giochi

`giochi.sqlite3` riunisce i dati dei giochi di parole in un solo file (53,00 MB nel workspace al 16 novembre 2026), versionato in Git,
con uno **schema** per gioco. SQLite non ha schemi dentro un file: lo schema è il prefisso `<schema>__` di tabelle,
indici, viste e trigger. Gli altri file `.sqlite3` di questa cartella, a che cosa servono e se servono ancora:
[DB.md](DB.md).

| Schema | Gioco | Contenuto | Chi lo scrive |
| --- | --- | --- | --- |
| `wordle` | ZeroWordle | `solutions`, `words` (5-8 lettere), `meta` | `gioco-zerowordle/script/build_wordle_bank.py` |
| `context` | ZeroContext | `vocab` (nell'ordine dei vettori), `secrets`, `targets` (pool, frequenze e deroghe), `links`, `hubs`, `meta` (revisione e file vettoriale attivo) | `gioco-zerocontext/script/build_context_semantic.py --publish`; generatore storico `build_context_data.py` |
| `associazioni` | ZeroAssociazioni, ZeroReazioniACatena | `prompts`, `words` (ogni parola una volta sola), `prompt_words` (i collegamenti), `meaning_groups`, `difficulties`, `conflicts`, `meta`: i bacini verificati, vedi sotto | `script/giochi.py aggiorna associazioni`, dal DB di lavoro `parole_ita_raw.sqlite3` |
| `parole` | ZeroWords | `words` (parola, Zipf, livello), `blocklist`, `meta` (capitoli e curva di difficoltà) | `script/giochi.py aggiorna parole`, dai file di `gioco-parole` |
| `contenuti` | gli altri giochi dell'overlay | `items` (gioco, posizione, elemento JSON) | `script/giochi.py aggiorna contenuti`, da `apps/server/src/content.seed.json` |

Restano fuori: le domande di ZeroQuizz, un gioco di domande e risposte e non di parole, che hanno un DB a sé
(`database/ZeroQuizz.sqlite3`, vedi sotto); la banca autonoma di ZeroLettere
(`database/ZeroLettere.sqlite3`: 5.661 indizi e risposte, vedi [README](../gioco-zerolettere/README.md));
i vettori di ZeroContext (`gioco-zerocontext/data/vectors.<sha256>.bin`: 112.713.600 byte per l'originale,
384.729.088 byte per ABTT,
selezionati dai metadati; procedura nel [README](../gioco-zerocontext/README.md)) e i dati della diretta (`apps/server/data/zerocade.db`: sessioni,
eventi, classifiche).

## Aggiornamento di tutte le parole RAW

Il task VS Code **ZeroCade : Aggiornamento parole RAW**, in
[`.vscode/tasks.json`](../.vscode/tasks.json), esegue
[`aggiorna_parole_raw.py`](../gioco-zeroassociations/script/aggiorna_parole_raw.py).
Elabora integralmente le 9 fonti del registro (dal 18/11/2026), senza limiti di righe o filtri Zipf;
scarta le parole straniere e i nomi di persona e cognomi.

Crea il secondo database **`parole_ita_raw_2.0.sqlite3`** e la tabella **`parole`**,
con una sola riga per parola normalizzata per Unicode, maiuscole e spazi. Conserva
le fonti in `fonti` e le appartenenze in `parole_fonti`. Raccoglie tutte le forme,
compresi i vecchi scarti editoriali; non applica esclusioni Zipf, di genere o numero (le applica il task Normalizzare).
Il task elimina emoji e voci non lessicali, ripulisce simboli decorativi come `#`
e unisce i duplicati risultanti mantenendo le fonti. [Criteri di pulizia](PAROLE_RAW_2.0.md#pulizia-dei-caratteri-nel-raw-20).
Prima di aggiornare un archivio già esistente crea un backup del secondo DB.
Il vecchio `parole_ita_raw.sqlite3` rimane separato. Non pubblica le banche dei giochi.
Prosegue dopo una fonte fallita e restituisce errore se una fonte non viene completata.

Catalogo completo: [FONTI_PAROLE_RAW.md](FONTI_PAROLE_RAW.md), con le 9 fonti
configurate e le richieste non aggiunte (GRADIT, Treccani, Zingarelli). Il rapporto progressivo è
`gioco-zeroassociations/reports/aggiornamento_parole_raw_2.0.json`.
Il nuovo DB contiene inizialmente **2.847.433 voci uniche** copiate dalla raccolta
locale, senza un nuovo download. Schema, comandi e query: [PAROLE_RAW_2.0.md](PAROLE_RAW_2.0.md).
La selezione delle forme segue la [politica di normalizzazione](PAROLE_RAW_2.0.md#normalizzazione-delle-forme-delle-parole):
maschile se esiste (il femminile solo senza maschile) e singolare, salvo il plurale più comune (`stoviglie`).
A ogni parola si associa l'[IWFS](PAROLE_RAW_2.0.md#italian-word-familiarity-score-iwfs-18112026), indice di familiarità da 0 a 100.
Il task **ZeroCade : Normalizzare parole RAW** popola la seconda tabella
`normalizzata` nel DB 2.0, mantenendo `parole` completa e registrando le varianti
escluse in `normalizzazione_esclusioni`.

## Come sono fatte le tabelle

Niente dati ripetuti dove si può evitare (13/11/2026: il file è passato da 33 a 18 MB con le stesse righe, poi a
11 MB quando le domande di ZeroQuizz sono passate nel loro DB):
- le tabelle grandi con una chiave primaria sono `WITHOUT ROWID`: le righe stanno in ordine di chiave, senza rowid
  e senza un indice a parte per la chiave. Hanno ancora
  il rowid solo tabelle di poche righe (i `meta`), dove non cambierebbe niente;
- `associazioni` ha solo quello che i giochi usano, 2,9 MB:

  | Tabella | Contenuto |
  | --- | --- |
  | `prompts` | 3.941 prompt: parola, categoria grammaticale, senso, categoria tematica, `ref` (l'id del bacino nella telemetria) e `review_id` (il verbale, per il `contentId` del server) |
  | `words` | 11.847 parole, ognuna una volta sola: le risposte e i nomi dei gruppi |
  | `prompt_words` | 58.551 collegamenti prompt–parola, con il gruppo di significato e la difficoltà |
  | `meaning_groups` | per ogni prompt, i gruppi e il massimo di risposte dello stesso gruppo in un round |
  | `difficulties` | `easy`, `medium`, `hard`, `unrated` |
  | `conflicts` | le coppie di risposte che non devono uscire insieme |

  Le chiavi sono numeri. Un gruppo ha per nome una parola, quasi sempre una delle risposte: collegamenti e gruppi
  portano il numero di quella parola. Sensi, verbali e prove restano nel DB di lavoro. `verify` confronta prompt,
  risposte, limiti e conflitti con lo schema `validi` di `parole_ita_raw.sqlite3`; dalle due parti il server
  costruisce gli stessi bacini, con lo stesso `contentId`;
- le chiavi esterne e i vincoli dell'origine (la difficoltà fra `easy`, `medium`, `hard`, `unrated`; un conflitto
  fra due parole del bacino) valgono anche nella copia: una riga che l'origine non accetterebbe fa fallire
  `aggiorna`.

Il server apre uno schema con viste temporanee sui nomi senza prefisso, per le tabelle e per le viste
(`apps/server/src/schema-db.ts`).

## Copie e origini

Il corpus `context` attivo al 16 novembre contiene **93.928 parole**, **9.513 segrete** e
tre profili di associazioni: originali (300 float32), TurboX e Harrier (256 float32).
La regia cambia profilo per stanza senza riavviare il server: vedi [PROFILI_ASSOCIAZIONI.md](../gioco-zerocontext/PROFILI_ASSOCIAZIONI.md).
I controlli strutturali passano; restano le regressioni semantiche documentate in [Python/README.md](../Python/README.md).
La pubblicazione conserva un backup consistente e sostituisce
solo questo schema; il file immutabile dei vettori esiste prima del commit che lo attiva.
Il servizio locale aggiornato può ricaricarlo con `POST /api/context/reload`; il primo passaggio dal vecchio motore richiede un riavvio del processo.
Per le altre copie resta la procedura `giochi.py aggiorna` descritta sotto.

`associazioni`, `parole` e `contenuti` sono copie: l'origine resta dove si lavora (il DB di lavoro di
ZeroAssociazioni, i file di ZeroWords, la banca in JSON). Dopo una modifica all'origine si ricopia lo schema con
`script/giochi.py aggiorna`. `verify` confronta ogni copia con la sua origine; per ZeroAssociazioni lo fa anche il server
all'avvio, e il log avvisa quando la copia è indietro.

## Come lo usano gli strumenti

Gli strumenti di ZeroDubbi non passano più da questo file: i dilemmi sono nel loro DB a sé,
`database/ZeroDubbi.sqlite3` (tabelle `dilemmi` e `testi`, come ZeroQuizz). `giochi.py` non li gestisce più.
Il server e il pacchetto Windows li leggono da lì; `ZEROCADE_BIVIO_DB` sposta il file. `gioco-dilemmi/script/domande.py`,
`from_livecade.py` e `to_livecade.py` usano la stessa variabile. Il vecchio `gioco-dilemmi/data/domande.db` non è più usato.

L'SQL degli strumenti di `giochi.sqlite3` resta scritto con i nomi senza prefisso e viene riscritto al volo
(`script/schemadb.py`). `ZEROCADE_GIOCHI_FILE` sposta il DB dei giochi, per esempio per provare su una copia.

Il server di Zerocade e il pacchetto Windows leggono `giochi.sqlite3` (`apps/server/src/schema-db.ts`), schema per
schema. Il pacchetto si rifiuta di partire se manca uno schema o se il file non è verificato.

## Comandi

```
python database/script/giochi.py build [--replace]   crea il file dai vecchi DB e dalle origini, poi lo verifica
python database/script/giochi.py aggiorna [SCHEMA…]  ricopia associazioni, parole e contenuti (tutti, senza nomi)
python database/script/giochi.py verify              confronta ogni schema con la sua origine
python database/script/giochi.py status              schemi, tabelle e righe
python database/script/giochi.py export SCHEMA FILE  uno schema come DB a sé, senza prefissi
python database/script/ottimizza_db.py analizza [DB…]  misure ed evidenze secondo DIRETTIVE.md, sola lettura
python database/script/ottimizza_db.py compatta [DB…]  VACUUM e optimize dove le pagine libere superano la soglia
python -m unittest discover -s database/script        i test
```

`ottimizza_db.py` applica l'ultima sezione di `DIRETTIVE.md` partendo dalle misure (task «7)Database: ottimizza
secondo le direttive»). `analizza` dà per ogni DB le pagine libere, l'integrità, le chiavi esterne orfane, le tabelle
e le colonne più pesanti e i punti delle direttive con la loro evidenza: §1 valori composti, §3 stringhe ripetute da
passare a una tabella di lookup, §6 `WITHOUT ROWID` con il peso dell'indice risparmiato, §7 tabelle senza chiave né
`UNIQUE`, §9 spazio da recuperare. Il peso di tabelle e indici viene da `dbstat` del `sqlite3.exe` ufficiale che
scaricano gli strumenti di ZeroAssociazioni; le stime per colonna vengono da un campione delle prime righe.
`compatta` interviene solo oltre il 10% o i 64 MB di pagine libere. La normalizzazione dello schema non è automatica:
si progetta tabella per tabella, con viste che conservano i vecchi nomi.

Per rinfrescare una copia si usa `aggiorna`.

## ZeroTaboo: `ZeroTaboo.sqlite3`

Il mazzo di ZeroTaboo è un DB a sé, in sola lettura per il server. Tabelle in italiano e normalizzate (chiavi intere, `STRICT`,
`WITHOUT ROWID` dove la chiave è composta): `categorie`, `livelli`, `stati`, `carte` (id stabile `A01`…`F10`), `revisioni`
(bersaglio, difficoltà iniziale e corrente, stato, qualità, nota), `parole` (ogni parola Taboo una volta sola), `revisione_taboo`
(esattamente cinque per revisione: `posizione` 1-5, chiave primaria e `UNIQUE`), `risposte` (alias approvati), `risposte_escluse`
(le risposte «da non accettare» del regolamento), `avvisi` (avvisi editoriali, mostrati e mai corretti da soli) e `meta`.
La vista `mazzo_corrente` dà l'ultima revisione di ogni carta nella forma di `ZEROTABOO.md` §11.

Lo scrive `gioco-zerotaboo/script/mazzo.py` (`parse`, `validate`, `import`, `verify`, `export`) da `gioco-zerotaboo/data/mazzo-v3.0.json`:
costruisce il file su un temporaneo, lo verifica e lo sostituisce. Lo legge e **rivalida** `apps/server/src/taboo-deck.ts`.

I dati delle partite e la telemetria non stanno qui ma nel DB operativo del server (`zerocade.db`, fuori da Git): tabelle `taboo_*`,
create da `apps/server/src/taboo-db.ts`. Le chiavi esterne non attraversano due file: un'esposizione salva `card_code` e
`card_revision`, e il caricatore verifica che esistano (l'unica eccezione, documentata, alle chiavi esterne).

## ZeroQuizz: `ZeroQuizz.sqlite3`

Le domande di ZeroQuizz sono un DB a sé, non uno schema di `giochi.sqlite3`: è un gioco di domande e risposte,
non di parole singole. Tabelle senza prefisso: `domande` (id, categoria, difficoltà 1-3, testo, spiegazione, posizione della risposta giusta, `ordine_fisso`, `attiva`, ordine), `opzioni` (da due a quattro risposte per domanda, nella loro posizione) e `categorie`.
- Ogni domanda ha un numero (`domande.n`), e le sue risposte portano quel numero, non l'id di una ventina di
  caratteri, scritto una volta sola in `domande`. `opzioni` è `WITHOUT ROWID`.
- La risposta giusta è una colonna della domanda (`domande.giusta`, la posizione 0-3 = A-D): una sola per
  costruzione, e una chiave esterna controllata al commit impedisce che indichi una posizione senza risposta.
- Le 6 categorie stanno in `categorie`.

Lo scrivono `gioco-quizzland/script/domande.py` (import ed export in CSV) e `revisione_risposte.py`; lo legge
`apps/server/src/quizzland.ts`, e il pacchetto Windows lo porta accanto al server (`app\ZeroQuizz.sqlite3`).
`ZEROCADE_QUIZZLAND_DB` indica un altro file, agli strumenti e al server. Un DB del formato di prima (un vecchio
backup in `gioco-quizzland/data/backup-revisione`) gli strumenti lo convertono da soli (`domande.py`, `migrate`).

## Architettura e ottimizzazioni del DB di lavoro

Il DB di lavoro, `parole_ita_raw.sqlite3`, è passato da 4,30 GB a 2,95 GB il 14/11/2026 (`VACUUM` incluso),
con le stesse righe in ogni tabella: 9.789.790 attestazioni e tutte le altre tabelle confrontate riga per riga con la
copia di sicurezza prima di sostituire il file. La copia è in `gioco-zeroassociations/database-backups/`, fuori da Git.

### Schemi e viste

Ogni schema è il prefisso `<schema>__` di tabelle, viste e trigger (`unified_db.py`). Le viste con i vecchi nomi
restituiscono gli stessi dati di prima: chi legge e chi scrive non è cambiato.

### Documenti JSON

Le colonne JSON pesavano circa 2,9 GB su 4,4. Ora ogni tabella JSON segue la stessa regola:

- **Un documento distinto, una volta sola.** Il documento va in una tabella dizionario (`…_details`, `…_results`,
  `…_documents`, `raw__nlp_analyses` con i token) in formato JSONB, il binario di SQLite; la riga porta solo il suo
  numero. Il contenuto resta quello originale, letto con `json()`.
- **Vista con il nome di prima.** Le tabelle compatte (`…_rows`) si leggono dalla vista che ricostruisce il JSON;
  gli strumenti scrivono nella vista e i trigger instradano i dati.
- **Attestazioni (`inventory_attestation_rows`).** Oltre al dizionario:
  - l'URL che è solo il prefisso della fonte più la forma (Wiktionary, Wikipedia, De Mauro, nel 94–100% delle righe)
    non si salva: la riga porta il numero del prefisso in `inventory_url_prefixes`, e la vista lo ricompone;
  - un documento che la vista non restituirebbe identico, carattere per carattere, resta testo nella riga, perché le
    impronte delle fonti (`inventory_updates`) si calcolano su quel testo.
- **Documenti brevi (fino a 128 byte)** nel dizionario, quelli lunghi nella riga, dove il dizionario non guadagna.

Le tabelle figlie con una chiave esterna verso una tabella convertita passano alla tabella compatta
(`json_store.compact`). Tutte le chiavi esterne si controllano prima del `COMMIT`, e un errore annulla tutto.

### Chiavi, tabelle e DDL

- Le tabelle grandi con chiave primaria sono `WITHOUT ROWID`.
- I valori che si ripetono (snapshot, ruoli, categorie grammaticali, prefissi URL) stanno in tabelle di lookup
  con chiave intera.
- `PRAGMA foreign_keys=ON` in ogni connessione che scrive.

### Ottimizzazioni misurate

| Intervento | Dove | Risultato |
| --- | --- | --- |
| Documenti identici in un dizionario | valutazioni, verdetti, risultati audit, morfologia | ~950 MB stimati |
| URL ricostruiti dal prefisso | attestazioni Wiktionary, Wikipedia, De Mauro | ~65 MB stimati |
| `VACUUM` dopo la conversione | intero file | da 5,63 GB a 2,95 GB |

Il risparmio del `VACUUM` è più alto della somma delle stime, perché le pagine delle vecchie tabelle restavano nel
file come spazio libero. Le stime vengono da un campione; il peso reale è quello misurato.

Non fatto: costanti per fonte fuori dalle righe (`language_claim`, `source_scope`, `definition_language`, circa
400 MB): avrebbe richiesto di ricostruire le chiavi del JSON nello stesso ordine, altrimenti le impronte delle fonti
cambierebbero. Non fatto neppure JSONB sulle attestazioni (circa il 9% del testo).

### Controlli

- `ottimizza_db.py analizza` (sola lettura) e `compatta` (`VACUUM` solo oltre il 10% o 64 MB di pagine libere), task 7.
- Verifiche su ogni conversione: numero di righe, confronto del contenuto, chiavi esterne, `quick_check`.
  Il `VACUUM` parte solo se la verifica passa.
- `giochi.py verify` e `unified_db.py verify --quick` dopo la migrazione: ok.

## Corpus semantico ZeroContext

Lo schema `context` comprende ora `targets`, con appartenenza ai pool ordinario/speciale,
frequenze, densità, ponti e deroghe per conservare le vecchie segrete. Il corpus ha 93.928
tentativi e 9.513 segrete; i vettori esterni dipendono dal profilo selezionato: originale 300 float32, ABTT 1.024 float32.
Gli schemi selezionabili sono `context_original` e `context_abtt`; TurboX e Harrier sono stati rimossi.
Le densità e i ponti della vecchia matrice sono archiviati nei dettagli e non ricalcolati per Harrier. La pubblicazione impedisce
la rimozione di segrete esistenti. I vecchi strumenti di riscrittura dello schema rifiutano
di sovrascrivere un corpus semantico privo di questa gestione dei target.
Dettagli in [IMPLEMENTAZIONE_VETTORI_SEMANTICI.md#segrete-domini-e-ricevute](../gioco-zerocontext/IMPLEMENTAZIONE_VETTORI_SEMANTICI.md#segrete-domini-e-ricevute).

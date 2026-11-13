# Il DB dei giochi

`giochi.sqlite3` riunisce i dati dei giochi di parole in un solo file piccolo (circa 11 MB), versionato in Git,
con uno **schema** per gioco. SQLite non ha schemi dentro un file: lo schema è il prefisso `<schema>__` di tabelle,
indici, viste e trigger. Gli altri file `.sqlite3` di questa cartella, a che cosa servono e se servono ancora:
[DB.md](DB.md).

| Schema | Gioco | Contenuto | Chi lo scrive |
| --- | --- | --- | --- |
| `dubbi` | ZeroDubbi | `dilemmi`, `testi` | `gioco-dilemmi/tools/domande.py` (e `from_livecade.py`) |
| `wordle` | ZeroWordle | `solutions`, `words` (5-8 lettere), `meta` | `gioco-zerowordle/build_wordle_bank.py` |
| `context` | ZeroContext | `vocab` (nell'ordine dei vettori), `secrets`, `meta` | `gioco-zerocontext/build_context_data.py` |
| `associazioni` | ZeroAssociazioni, ZeroReazioniACatena | `prompts`, `words` (ogni parola una volta sola), `prompt_words` (i collegamenti), `meaning_groups`, `difficulties`, `conflicts`, `meta`: i bacini verificati, vedi sotto | `giochi.py aggiorna associazioni`, dal DB di lavoro `parole_ita_raw.sqlite3` |
| `parole` | ZeroWords | `words` (parola, Zipf, livello), `blocklist`, `meta` (capitoli e curva di difficoltà) | `giochi.py aggiorna parole`, dai file di `gioco-parole` |
| `contenuti` | gli altri giochi dell'overlay | `items` (gioco, posizione, elemento JSON) | `giochi.py aggiorna contenuti`, da `apps/server/src/content.seed.json` |

Restano fuori: le domande di ZeroQuizz, un gioco di domande e risposte e non di parole, che hanno un DB a sé
(`database/ZeroQuizz.sqlite3`, vedi sotto); i vettori di ZeroContext (`gioco-zerocontext/data/vectors.bin`, 18 MB, si rigenerano con
`fetch_vectors.py` e `build_context_data.py`) e i dati della diretta (`apps/server/data/zerocade.db`: sessioni,
eventi, classifiche).

## Come sono fatte le tabelle

Niente dati ripetuti dove si può evitare (13/11/2026: il file è passato da 33 a 18 MB con le stesse righe, poi a
11 MB quando le domande di ZeroQuizz sono passate nel loro DB):
- le tabelle grandi con una chiave primaria sono `WITHOUT ROWID`: le righe stanno in ordine di chiave, senza rowid
  e senza un indice a parte per la chiave. Hanno ancora
  il rowid solo tabelle di poche righe (`dubbi`, i `meta`), dove non cambierebbe niente;
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

`associazioni`, `parole` e `contenuti` sono copie: l'origine resta dove si lavora (il DB di lavoro di
ZeroAssociazioni, i file di ZeroWords, la banca in JSON). Dopo una modifica all'origine si ricopia lo schema con
`giochi.py aggiorna`. `verify` confronta ogni copia con la sua origine; per ZeroAssociazioni lo fa anche il server
all'avvio, e il log avvisa quando la copia è indietro.

## Come lo usano gli strumenti

Gli strumenti di ZeroDubbi indicano il loro schema come `database/giochi.sqlite3#dubbi` (`giochi.address`), la
stessa scrittura del server (`schemadb.py`). L'SQL resta scritto con i nomi senza prefisso e viene riscritto al
volo; una tabella creata da uno strumento entra nello schema. Il percorso del vecchio DB a sé,
`gioco-dilemmi/data/domande.db`, indica ancora lo stesso schema. Il vecchio file non viene più aggiornato: serve
solo a `build --replace` e a `verify`, che senza di lui non confronta lo schema con l'origine e lo dice. Con `ZEROCADE_GIOCHI_DB=legacy` gli strumenti
tornano ai vecchi file; `ZEROCADE_GIOCHI_FILE` sposta il DB (per esempio per provare su una copia).

Il server di Zerocade e il pacchetto Windows leggono `giochi.sqlite3` (`apps/server/src/schema-db.ts`), schema
per schema; senza uno schema, la vecchia origine di quel gioco se c'è ancora (ZeroDubbi resta senza domande: il
suo vecchio DB non si aggiorna più). Il pacchetto si rifiuta di partire se manca uno
schema o se il file non è verificato.

## Comandi

```
python database/giochi.py build [--replace]   crea il file dai vecchi DB e dalle origini, poi lo verifica
python database/giochi.py aggiorna [SCHEMA…]  ricopia associazioni, parole e contenuti (tutti, senza nomi)
python database/giochi.py verify              confronta ogni schema con la sua origine
python database/giochi.py status              schemi, tabelle e righe
python database/giochi.py export SCHEMA FILE  uno schema come DB a sé, senza prefissi
python -m unittest discover -s database        i test
```

`build --replace` ricostruisce anche `dubbi` dal vecchio DB (`gioco-dilemmi/data/domande.db`), che non viene più
aggiornato: per rinfrescare una copia si usa `aggiorna`.

## ZeroQuizz: `ZeroQuizz.sqlite3`

Le domande di ZeroQuizz sono un DB a sé, non uno schema di `giochi.sqlite3`: è un gioco di domande e risposte,
non di parole singole. Tabelle senza prefisso: `domande` (id, categoria, difficoltà 1-3, testo, spiegazione, posizione della risposta giusta, `ordine_fisso`, `attiva`, ordine), `opzioni` (da due a quattro risposte per domanda, nella loro posizione) e `categorie`.
- Ogni domanda ha un numero (`domande.n`), e le sue risposte portano quel numero, non l'id di una ventina di
  caratteri, scritto una volta sola in `domande`. `opzioni` è `WITHOUT ROWID`.
- La risposta giusta è una colonna della domanda (`domande.giusta`, la posizione 0-3 = A-D): una sola per
  costruzione, e una chiave esterna controllata al commit impedisce che indichi una posizione senza risposta.
- Le 6 categorie stanno in `categorie`.

Lo scrivono `gioco-quizzland/tools/domande.py` (import ed export in CSV) e `revisione_risposte.py`; lo legge
`apps/server/src/quizzland.ts`, e il pacchetto Windows lo porta accanto al server (`app\ZeroQuizz.sqlite3`).
`ZEROCADE_QUIZZLAND_DB` indica un altro file, agli strumenti e al server. Un DB del formato di prima (un vecchio
backup in `gioco-quizzland/data/backup-revisione`) gli strumenti lo convertono da soli (`domande.py`, `migrate`).

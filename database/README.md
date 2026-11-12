# Il DB dei giochi

`giochi.sqlite3` riunisce i dati dei giochi in un solo file piccolo (circa 18 MB), versionato in Git, con uno
**schema** per gioco. SQLite non ha schemi dentro un file: lo schema è il prefisso `<schema>__` di tabelle,
indici, viste e trigger.

| Schema | Gioco | Contenuto | Chi lo scrive |
| --- | --- | --- | --- |
| `dubbi` | ZeroDubbi | `dilemmi`, `testi` | `gioco-dilemmi/tools/domande.py` (e `from_livecade.py`) |
| `quizz` | ZeroQuizz | `domande`, `opzioni` | `gioco-quizzland/tools/domande.py`, `revisione_risposte.py` |
| `wordle` | ZeroWordle | `solutions`, `words` (5-8 lettere), `meta` | `gioco-zerowordle/build_wordle_bank.py` |
| `context` | ZeroContext | `vocab` (nell'ordine dei vettori), `secrets`, `meta` | `gioco-zerocontext/build_context_data.py` |

Restano fuori: ZeroAssociazioni, che ha il suo DB unico (`gioco-zeroassociations/zeroassociazioni.sqlite3`,
gigabyte, non in Git); i vettori di ZeroContext (`gioco-zerocontext/data/vectors.bin`, 18 MB, si rigenerano con
`fetch_vectors.py` e `build_context_data.py`); i dati della diretta (`apps/server/data/zerocade.db`: sessioni,
eventi, classifiche).

## Come lo usano gli strumenti

Gli strumenti di ZeroDubbi e ZeroQuizz non sono cambiati: indicano ancora `data/domande.db`, e quel percorso
significa lo schema corrispondente di `giochi.sqlite3` (`schemadb.py`). L'SQL resta scritto con i nomi senza
prefisso e viene riscritto al volo; una tabella creata da uno strumento entra nello schema. I vecchi file
`domande.db` non vengono più aggiornati: si possono cancellare. Con `ZEROCADE_GIOCHI_DB=legacy` gli strumenti
tornano ai vecchi file; `ZEROCADE_GIOCHI_FILE` sposta il DB (per esempio per provare su una copia).

Il server di Zerocade e il pacchetto Windows leggono `giochi.sqlite3` (`apps/server/src/schema-db.ts`), schema
per schema; senza, i vecchi file.

## Comandi

```
python database/giochi.py build [--replace]   crea il file dai vecchi DB e dalle liste in testo, poi lo verifica
python database/giochi.py verify              confronta dubbi e quizz con i vecchi domande.db
python database/giochi.py status              schemi, tabelle e righe
python database/giochi.py export SCHEMA FILE  uno schema come DB a sé, senza prefissi
python -m unittest discover -s database        i test
```

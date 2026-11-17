# ZeroLettere: banca degli indizi

> **Revisione documentale — 16 novembre 2026.** Confermati nel database 5.661 indizi e 109 alternative. — una banca autonoma: importazione e verifica non aggiungono un gioco al catalogo, una rotta al server o un file al pacchetto Windows. Per il censimento di tutti i database vedere [DB.md](../database/DB.md).
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

Il CSV `livecade-missing-letters-it-bank-2026-11-14.csv` e la sua copia SQLite
`database/ZeroLettere.sqlite3` conservano indizi, risposte e alternative della banca.

Da questa cartella: `python script/import_csv.py`. Sono disponibili `--csv` e `--db`.
Una seconda importazione dello stesso file verifica i dati senza aggiungere righe;
un database esistente con dati diversi viene conservato e segnalato come errore.

| Tabella/vista | Contenuto |
| --- | --- |
| `entries` | Un indizio per riga, con risposta, `ref` originale e riferimenti alle classificazioni |
| `accepted_answers` | Le risposte alternative, una per riga, nell'ordine del CSV |
| `sources`, `languages`, `categories`, `difficulties` | I valori delle classificazioni, senza ripetizioni |
| `metadata` | Nome e SHA-256 del CSV, righe, data di importazione e versione SQLite |
| `csv_entries` | Vista leggibile con gli otto campi originali e `position`, posizione nel CSV da zero |

Per consultare tutto: `SELECT * FROM csv_entries ORDER BY position;`.
`also_accept` viene ricostruito dalla vista con il separatore originale `|`.
Le risposte uguali associate a indizi diversi restano voci distinte: l'identità
di una voce è il suo `ref`. Testo e accenti non vengono normalizzati o modificati.

Il database è autonomo; questa importazione prepara i dati senza cambiare il
caricamento dei giochi nel server o nel pacchetto Windows.

# Secondo archivio delle parole RAW

File: **`database/parole_ita_raw_2.0.sqlite3`**. Tabella su cui lavorare:
**`parole`**, colonna **`parola`**.

Il 16 novembre 2026 è stato inizializzato dalla raccolta locale esistente:

| Dato | Totale |
|---|---:|
| Voci uniche in `parole` | 2.847.433 |
| Fonti | 46 |
| Collegamenti parola/fonte | 7.273.769 |
| Acquisizioni archiviate | 49 |
| Dimensione iniziale del file | 631.037.952 byte |

Questa prima copia non ha effettuato un nuovo download. Il vecchio
`parole_ita_raw.sqlite3` è stato letto in sola lettura: conserva lavorazioni,
decisioni editoriali, normalizzazioni e bacini precedenti.

## Tabelle

| Tabella | Contenuto |
|---|---|
| `parole` | Una sola riga per voce; `parola` è chiave primaria e `is_single_word` distingue le parole singole dalle altre espressioni |
| `normalizzata` | Risultato della selezione di genere e numero, con riferimento alle parole originali |
| `normalizzazione_esclusioni` | Parole escluse dalla seconda tabella, sostituta, motivo e prove della decisione |
| `fonti` | ID, nome, formato, URL, licenza, attribuzione e configurazione delle fonti |
| `parole_fonti` | Provenienza multipla: una coppia univoca parola/fonte |
| `inventory_snapshots` | Versioni acquisite, hash SHA-256, URL effettivo nella configurazione e percorso del file originale |
| `inventory_http_cache` | ETag, Last-Modified e copie validate dei download |
| `meta` | Versione dello schema e origine dell'inizializzazione |
| `pulizia_parole` | Registro delle trasformazioni di caratteri e delle voci non lessicali rimosse |

La tabella `parole` raccoglie anche parole generiche, plurali e femminili.
Non applica filtri Zipf né importa i vecchi `DISCARDED`. I file originali nella
cache conservano i dati integrali delle fonti, inclusi dettagli morfologici;
il secondo DB conserva parole e provenienza, senza duplicare le revisioni editoriali.

## Task di aggiornamento

In VS Code: **Terminale → Esegui attività → ZeroCade : Aggiornamento parole RAW**.
Il task crea il file e le tabelle se mancano; poi controlla tutte le 46 fonti del
[registro](FONTI_PAROLE_RAW.md), senza un limite al numero di righe.

La deduplicazione usa Unicode compatibile, minuscole e spazi normalizzati: per esempio
` CASA `, `#casa` e `casa` producono la stessa voce. Gli accenti e gli apostrofi
linguistici vengono conservati. Emoji, faccine, URL, email e token numerici vengono
eliminati; i simboli decorativi vengono ripuliti senza concatenare parole distinte.
[Regole ed esempi della pulizia](PULIZIA_PAROLE_RAW.md).
Una parola presente in più fonti resta una sola riga, con più riferimenti in
`parole_fonti`. Le acquisizioni successive aggiungono parole e provenienza senza
cancellare le parole valide già raccolte. Una versione già importata viene riconosciuta dall'hash.

Ogni fonte viene importata in una transazione: un errore non lascia metà lista
nel DB. Le altre fonti vengono comunque tentate e il task segnala un esito non
completo se rimangono errori. Prima di aggiornare un file esistente ne crea un
backup in `gioco-zeroassociations/database-backups/parole_raw_2.0-<data>.sqlite3`.

Rapporto progressivo:
`gioco-zeroassociations/reports/aggiornamento_parole_raw_2.0.json`.

Il task mantiene tutte le forme; la selezione per i giochi è una fase successiva.
Il task **ZeroCade : Normalizzare parole RAW** popola `normalizzata` mantenendo
`parole` completa. Conserva femminili autonomi, plurali senza singolare e plurali
più frequenti; a parità di frequenza preferisce il singolare. Prima crea un backup.
[Criteri, gestione delle ambiguità e comandi](NORMALIZZAZIONE_PAROLE_RAW.md).
La ricostruzione è atomica e ripetibile. Le successive acquisizioni marcano
`meta.normalizzazione_stato` come `da_aggiornare`; rieseguire Normalizzare per
aggiornare il risultato. Il vecchio `normalize_words.py` rimane separato.

## Query utili

```sql
SELECT COUNT(*) FROM parole;
SELECT parola FROM parole ORDER BY parola;
SELECT parola FROM parole WHERE is_single_word = 1 ORDER BY parola;
SELECT parola FROM normalizzata ORDER BY parola;
SELECT parola, sostituita_da, motivo FROM normalizzazione_esclusioni ORDER BY parola;

SELECT f.nome, f.url
FROM parole_fonti pf JOIN fonti f ON f.id = pf.fonte_id
WHERE pf.parola = 'fare';
```

Per creare solo la struttura, senza download:

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/aggiorna_parole_raw.py --initialize-only
```

Per inizializzare dalla raccolta locale, con copie idempotenti:

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/aggiorna_parole_raw.py --seed-from database/parole_ita_raw.sqlite3 --initialize-only
```

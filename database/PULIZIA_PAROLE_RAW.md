# Pulizia dei caratteri nel RAW 2.0

Il task **ZeroCade : Aggiornamento parole RAW** pulisce ogni voce prima
dell'inserimento in `parole_ita_raw_2.0.sqlite3`, tabella `parole`.
Il codice condiviso è [raw_word_cleaning.py](../gioco-zeroassociations/script/raw_word_cleaning.py).

| Voce originale | Risultato |
|---|---|
| `#casa`, `@casa`, `casa!!!` | `casa` |
| `😀caffè❤️` | `caffè` |
| `😂`, `:-D`, `XD` | eliminata: nessuna parola |
| `cane/gatto`, `cane_gatto`, `cane-gatto` | `cane gatto`, conservando il confine fra parole |
| `l’acqua`, `po’` | `l'acqua`, `po'`, con apostrofo linguistico |
| URL, email, numeri e token alfanumerici come `h2o` | eliminati, senza inventare `ho` |

Sono conservati accenti e lettere latine. Sono normalizzati maiuscole, spazi,
varianti Unicode compatibili e apostrofi tipografici. Le lettere di altri alfabeti
non vengono trasformate arbitrariamente in frammenti latini. I simboli interni
diventano separatori, invece di concatenare parole che prima erano distinte.

Se due voci diventano uguali, resta una sola parola e si uniscono tutte le fonti.
La tabella `pulizia_parole` registra originale, risultato e motivo; `pulita=NULL`
indica una voce rimossa. I file originali delle fonti restano nella cache.

La prima esecuzione aggiorna anche il contenuto già presente, in una transazione
preceduta dal backup del DB. La pulizia è idempotente ed è versionata in
`meta.word_cleanup_version`. Una reinizializzazione dal vecchio RAW passa dalla
stessa procedura, per non reintrodurre simboli e faccine.

Per applicare soltanto la pulizia locale, senza scaricare le fonti:

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/aggiorna_parole_raw.py --cleanup-only
```

Una modifica della raccolta marca `normalizzata` come da aggiornare. Eseguire poi
**ZeroCade : Normalizzare parole RAW** per ricostruirla con i criteri di genere e
numero. Questa pulizia non è una valutazione editoriale e non applica soglie Zipf.

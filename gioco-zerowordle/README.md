# 🟩 ZeroWordle

La chat indovina insieme una parola nascosta. Ogni parola scritta in chat diventa una riga di tessere:

- **verde**: lettera giusta al posto giusto;
- **oro**: lettera presente nella parola, ma in un altro posto;
- **grigia**: lettera assente.

La regia sceglie la lunghezza: 5, 6, 7 o 8 lettere, oppure una a caso a ogni round. Sceglie anche quanti tentativi
ci sono (di base 6) e se si gioca a tempo. Quando nessuno ci arriva, la regia e i suggerimenti automatici possono
rivelare, trovare o escludere una lettera.

## Le parole

Stanno nello schema `wordle` di [`database/giochi.sqlite3`](../database/README.md):

| Tabella | Contenuto |
| --- | --- |
| `wordle__solutions` | 8.630 parole che possono essere la soluzione: lemmi italiani comuni, attestati da più dizionari, senza accenti, nomi propri o parole volgari |
| `wordle__words` | 105.310 parole ammesse come tentativo: le soluzioni più ogni forma italiana attestata da almeno due fonti (plurali, coniugazioni, parole rare) |
| `wordle__meta` | I conteggi per lunghezza |

Le parole sono in minuscolo, dalla a alla z. Un tentativo con l'accento vale come la stessa parola senza
(«città» vale «citta»); le parole accentate non sono mai la soluzione.

## Ricostruire le parole

Le parole vengono dall'inventario lessicale di ZeroAssociazioni (schema `raw` di
`database/parole_ita_raw.sqlite3`, fuori da Git, letto in sola lettura). Dalla cartella `gioco-zerowordle`:

```
python build_wordle_bank.py              riscrive lo schema wordle
python build_wordle_bank.py --report     anche i conteggi dei motivi di esclusione
python build_wordle_bank.py --sample 40  anche un campione di soluzioni per ogni lunghezza
```

Le soluzioni da togliere a mano vanno in [`wordle_exclusions.txt`](wordle_exclusions.txt): una o più parole per
riga, con `#` per i commenti.

## Nel codice

- Server: `apps/server/src/wordle.ts` legge lo schema `wordle`.
- Overlay: `apps/overlay/src/games/fiveLetters.ts` (la partita) e `apps/overlay/src/games/wordleLogic.ts` (il
  colore delle tessere).

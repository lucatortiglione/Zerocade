# 🔀 ZeroDubbi

«Preferiresti…?»: sullo schermo compaiono due scelte, A e B, e il pubblico vota scrivendo `A` o `B` in chat.
Allo scadere del tempo l'overlay rivela come si è diviso il voto. Ogni voto resta salvato sul PC, legato all'id
del dilemma. Nel codice il gioco si chiama ancora **Bivio**, il suo titolo provvisorio.

## Le domande

Stanno nello schema `dubbi` di [`database/giochi.sqlite3`](../database/README.md):

| Tabella | Contenuto |
| --- | --- |
| `dubbi__dilemmi` | id, categoria, difficoltà (`light` o `tough`), `esplicita`, ordine |
| `dubbi__testi` | per ogni dilemma e lingua, il testo di A e quello di B |

Ci sono 120 dilemmi, in italiano e in inglese, 10 per ognuna di 12 categorie: amici e famiglia, assurde, cibo,
dilemmi, fantasia, scuola e lavoro, social e tecnologia, soldi, sopravvivenza, sport, tempo e viaggi.

L'id di una domanda cancellata non va mai riusato: i voti salvati sono legati a quell'id.

## Strumenti

Dalla cartella `gioco-dilemmi`:

| Comando | Cosa fa |
| --- | --- |
| `python tools/domande.py export domande.csv` | Scrive tutte le domande in un CSV, da modificare in un foglio di calcolo |
| `python tools/domande.py import domande.csv` | Sostituisce tutte le domande dello schema con quelle del CSV |
| `python tools/domande.py stats` | Conteggi per categoria, difficoltà e lingua |
| `python tools/to_livecade.py … --lang it --out wyr_it.csv` | Le domande nel CSV di importazione di Livecade («Would You Rather»), una lingua per file |
| `python tools/from_livecade.py export_it.csv --dry-run` | Il contrario: importa un CSV di Livecade e dà id nuovi; salta le domande già presenti, anche con A e B invertite |
| `python tools/make_category_assets.py` | Rigenera icone, card e sfondi delle categorie in `assets/` |

Colonne del CSV: `id, categoria, difficolta, esplicita`, poi `it_a, it_b, en_a, en_b` (un'altra lingua sono altre
due colonne).

## File

| Percorso | Contenuto |
| --- | --- |
| `assets/` | Icone, card e sfondi delle 12 categorie, l'icona del gioco e `anteprima.html` per vederli tutti |
| `tools/` | Gli strumenti qui sopra |
| [`TODO.md`](TODO.md) | Il piano del gioco come app per telefono, con le decisioni ancora aperte |

## Nel codice

- Server: `apps/server/src/bivio.ts` legge lo schema `dubbi`. `ZEROCADE_BIVIO_DB` può indicare un altro DB
  (`file` oppure `file#schema`).
- Overlay: `apps/overlay/src/Bivio.tsx`.

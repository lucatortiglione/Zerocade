# 🧠 ZeroQuizz

Un quiz a quattro risposte: la chat risponde `A`, `B`, `C` o `D`, e chi indovina prima prende più punti. La regia ha
l'aiuto 50:50, il tempo extra e il passaggio alla domanda successiva. Nel codice il gioco si chiama ancora
**quizzland**.

## Le domande

Stanno nello schema `quizz` di [`database/giochi.sqlite3`](../database/README.md):

| Tabella | Contenuto |
| --- | --- |
| `quizz__domande` | id, categoria, difficoltà (1 facile, 2 media, 3 difficile), testo, spiegazione, posizione della risposta giusta, `ordine_fisso`, `attiva`, ordine |
| `quizz__opzioni` | da due a quattro risposte per domanda, nella loro posizione |
| `quizz__categorie` | i nomi delle categorie |

Ci sono 26.715 domande, di cui 26.372 in gioco (`attiva = 1`):

| Categoria | Domande |
| --- | ---: |
| scienze | 13.659 |
| curiosità | 8.056 |
| cultura | 4.978 |
| logica, numeri, trabocchetti | 22 |

`ordine_fisso = 1` vuol dire che le risposte non si mescolano (per esempio Primo, Secondo, Terzo). La regia può
scegliere le categorie e la difficoltà; [GUIDA-DOMANDE.md](GUIDA-DOMANDE.md) spiega come si scrive una buona
domanda.

## Da dove vengono

Buona parte delle domande viene da fonti aperte, tradotte in italiano. Ogni fonte ha la sua cartella in
`data/fonti`, con la licenza in `LICENZA.md`:

| Fonte | Licenza | Categoria | In gioco |
| --- | --- | --- | :---: |
| Open Trivia Database (`opentdb`) | CC BY-SA 4.0 | cultura | sì |
| AI2 Reasoning Challenge (`arc`) | CC BY-SA 4.0 | scienze | sì |
| The Trivia API (`triviaapi`) | CC BY-NC 4.0: niente dirette monetizzate senza il piano a pagamento | curiosità | no |
| OpenBookQA (`openbookqa`, AI2) | licenza dei contenuti non nota | scienze | no |
| API Ninjas (`apininjas`) | chiave gratuita, solo uso personale | curiosità | no |

## Strumenti

Dalla cartella `gioco-quizzland`:

| Comando | Cosa fa |
| --- | --- |
| `python tools/domande.py export domande.csv` | Scrive tutte le domande in un CSV, da modificare in un foglio di calcolo |
| `python tools/domande.py import domande.csv` | Sostituisce tutte le domande dello schema con quelle del CSV |
| `python tools/domande.py stats` | Conteggi per categoria e difficoltà, e i problemi trovati |
| `python tools/fonti.py download FONTE` | Scarica le domande di una fonte in `data/fonti/FONTE` |
| `python tools/fonti.py nuove [FONTE]` | Quante domande nuove ha una fonte, senza scaricarle |
| `python tools/fonti.py csv domande.csv` | Un CSV con tutte le domande, tradotte comprese, da passare a `domande.py import` |
| `python tools/traduci_fonti.py arc openbookqa` | Completa le traduzioni mancanti con Google Traduttore; poi vanno rilette |
| `python tools/verifica_pubblico.py` | Controlla le domande adatte al pubblico italiano e scrive `data/REVISIONE-DOMANDE.md` |
| `python tools/revisione_risposte.py audit` | Cerca risposte sospette, da leggere una per una |
| `python tools/revisione_risposte.py apply` / `restore` | Applica o annulla le correzioni decise in `data/correzioni-risposte.json`, con un backup prima |
| `python tools/make_backdrop.py` | Rigenera lo sfondo `assets/sfondo.svg` |

Colonne del CSV: `id, categoria, difficolta, ordine_fisso, attiva, domanda, a, b, c, d, giusta` (la lettera della
risposta giusta) e `spiegazione`. Le colonne `c` e `d` restano vuote per le domande con meno risposte.

## File

| Percorso | Contenuto |
| --- | --- |
| [`GUIDA-DOMANDE.md`](GUIDA-DOMANDE.md) | Come si scrivono le domande |
| `data/fonti/` | Le domande originali delle fonti, le traduzioni e le licenze |
| `data/REVISIONE-DOMANDE.md`, `data/domande-escluse.json` | Le domande tolte dal gioco e il perché |
| `data/REVISIONE-RISPOSTE.md`, `data/audit-risposte.json`, `data/correzioni-risposte.json` | La revisione delle risposte: segnalazioni e correzioni |
| `assets/sfondo.svg` | Lo sfondo del gioco |

## Nel codice

- Server: `apps/server/src/quizzland.ts` legge lo schema `quizz` all'avvio. `ZEROCADE_QUIZZLAND_DB` può indicare
  un altro DB (`file` oppure `file#schema`).
- Overlay: `apps/overlay/src/Quizzland.tsx`.

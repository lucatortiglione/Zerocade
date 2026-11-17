# 🧠 ZeroQuizz

> **Revisione documentale — 16 novembre 2026.** Nel DB locale sono presenti **26.715 domande, tutte attive**. I rapporti del 6 novembre descrivono revisioni precedenti: in particolare le 26.372 attive di `REVISIONE-RISPOSTE.md` non sono il conteggio corrente. Questa verifica riguarda conteggi e attivazione, senza certificare la correttezza di ogni domanda o aggiornare le condizioni delle fonti.
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

Un quiz a quattro risposte: la chat risponde `A`, `B`, `C` o `D`, e chi indovina prima prende più punti. La regia ha
l'aiuto 50:50, il tempo extra e il passaggio alla domanda successiva. Nel codice il gioco si chiama ancora
**quizzland**.

## Le domande

Stanno in un DB a sé, [`database/ZeroQuizz.sqlite3`](../database/README.md#zeroquizz-zeroquizzsqlite3): è un gioco di
domande e risposte, non di parole come quelli di `database/giochi.sqlite3`.

| Tabella | Contenuto |
| --- | --- |
| `domande` | id, categoria, difficoltà (1 facile, 2 media, 3 difficile), testo, spiegazione, posizione della risposta giusta, `ordine_fisso`, `attiva`, ordine |
| `opzioni` | da due a quattro risposte per domanda, nella loro posizione |
| `categorie` | i nomi delle categorie |

Ci sono 26.715 domande, tutte in gioco (`attiva = 1`; con `attiva = 0` una domanda resta fuori):

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

| Fonte | Licenza | Categoria | Domande |
| --- | --- | --- | ---: |
| The Trivia API (`triviaapi`) | CC BY-NC 4.0: niente dirette monetizzate senza il piano a pagamento | curiosità | 8.000 |
| AI2 Reasoning Challenge (`arc`) | CC BY-SA 4.0 | scienze | 7.709 |
| OpenBookQA (`openbookqa`, AI2) | licenza dei contenuti non nota | scienze | 5.950 |
| Open Trivia Database (`opentdb`) | CC BY-SA 4.0 | cultura | 4.978 |
| API Ninjas (`apininjas`) | chiave gratuita, solo uso personale | curiosità | 56 |

Sono tutte in gioco. **Attenzione:** `fonti.py` importa come non attive le domande di The Trivia API, OpenBookQA e API
Ninjas, per le loro licenze, ma nel DB sono attive. Prima di una diretta monetizzata va deciso se tenerle.

## Strumenti

Dalla cartella `gioco-quizzland`:

| Comando | Cosa fa |
| --- | --- |
| `python script/domande.py export domande.csv` | Scrive tutte le domande in un CSV, da modificare in un foglio di calcolo |
| `python script/domande.py import domande.csv` | Sostituisce tutte le domande del DB con quelle del CSV |
| `python script/domande.py stats` | Conteggi per categoria e difficoltà, e i problemi trovati |
| `python script/fonti.py download FONTE` | Scarica le domande di una fonte in `data/fonti/FONTE` |
| `python script/fonti.py nuove [FONTE]` | Quante domande nuove ha una fonte, senza scaricarle |
| `python script/fonti.py csv domande.csv` | Un CSV con tutte le domande, tradotte comprese, da passare a `domande.py import` |
| `python script/traduci_fonti.py arc openbookqa` | Completa le traduzioni mancanti con Google Traduttore; poi vanno rilette |
| `python script/verifica_pubblico.py` | Controlla le domande adatte al pubblico italiano e scrive `data/REVISIONE-DOMANDE.md` |
| `python script/revisione_risposte.py audit` | Cerca risposte sospette, da leggere una per una |
| `python script/revisione_risposte.py apply` / `restore` | Applica o annulla le correzioni decise in `data/correzioni-risposte.json`, con un backup prima |
| `python script/make_backdrop.py` | Rigenera lo sfondo `assets/sfondo.svg` |

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

- Server: `apps/server/src/quizzland.ts` legge `database/ZeroQuizz.sqlite3` all'avvio (nel pacchetto Windows,
  `app\ZeroQuizz.sqlite3`). `ZEROCADE_QUIZZLAND_DB` può indicare un altro DB, al server e agli strumenti.
- Overlay: `apps/overlay/src/Quizzland.tsx`.

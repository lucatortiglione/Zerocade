# 🎯 ZeroContext

C'è una parola segreta da trovare. Ogni parola che la chat scrive riceve una posizione secondo quanto il suo
significato è vicino a quello della parola segreta: 1 è la parola segreta, 2 la più vicina, e così via. La chat si
avvicina un tentativo dopo l'altro. «Rivela più vicino» mostra una parola più vicina di tutte quelle già trovate.

## Come funziona

Ogni parola giocabile ha un vettore (fastText italiano, `cc.it.300`) che ne rappresenta il significato. L'overlay
scarica una volta dal server parole e vettori (`/api/context/…`). A ogni round ordina tutte le parole giocabili per
vicinanza alla parola segreta, e la posizione in quella classifica è il punteggio di ogni tentativo. Non c'è una
lista di parole «vicine» da imparare. Una parola che non è tra quelle giocabili non vale.

## I dati

| Dove | Contenuto | In Git |
| --- | --- | :---: |
| schema `context` di [`database/giochi.sqlite3`](../database/README.md) | `context__vocab`, le parole giocabili; `context__secrets`, quelle che possono essere segrete; `context__meta`, i conteggi | sì |
| `data/vectors.bin` | Un vettore per ogni parola giocabile (int8, già normalizzati), 18 MB | no |
| `livecade-context-it-bank.csv` | L'esportazione della banca di Livecade, il punto di partenza: non si modifica mai | sì |
| `zerocontext-it-bank-aggiunte.csv` | Le parole nuove: sostantivi italiani comuni presi dall'inventario di ZeroAssociazioni | sì |
| `zerocontext-it-bank.csv` | La banca delle parole segrete: Livecade più le aggiunte | sì |
| `zerocontext-it-bank-meta.csv` | Una riga per parola, con la fascia e le prove usate | sì |
| `context_bank_exclusions.txt` | Le parole che non vanno aggiunte, anche se passano i filtri automatici | sì |

`data/vectors.bin` non è in Git: chi scarica il repository lo ricrea con i comandi qui sotto. Senza, il server lo
segnala all'avvio e il gioco non ha i dati per partire. Il pacchetto Windows lo include (`zerocontext/vectors.bin`).

## Ricostruire i dati

Dalla cartella `gioco-zerocontext`, in quest'ordine:

| Comando | Cosa fa |
| --- | --- |
| `python fetch_vectors.py` | Scarica i vettori fastText solo per le 300.000 parole più frequenti: legge l'inizio del file di Hugging Face (7 GB in tutto) e si ferma lì. Li mette in `.cache/`, fuori da Git |
| `python build_context_bank.py` | Ricostruisce le aggiunte e la banca dall'inventario di ZeroAssociazioni (schema `raw` di `database/parole_ita_raw.sqlite3`, fuori da Git) |
| `python build_context_data.py` | Scrive le parole nello schema `context` e i vettori in `data/vectors.bin` (di base 60.000 parole giocabili più la banca) |

`build_context_data.py --probe spiaggia pizza` stampa le parole più vicine a quelle indicate, per controllare il
risultato.

## Valutare l'intero inventario

`python evaluate_context_inventory.py` valuta tutti i termini di `raw.inventory_terms`,
le banche esistenti e le ulteriori parole nelle frequenze e nelle cache dei vettori.
Usa soltanto gli snapshot attivi delle fonti. Riconosce anche UniMorph, GLAFF-IT e
Flex_it; GLAFF-IT e Wikizionario italiano contano come una famiglia, Flex_it e
Morph-it! come un'altra. Hunspell fornisce una prova ortografica, non una categoria
grammaticale. Non si usano predizioni NLP su parole isolate per approvarle.

Per le segrete applica `decide` e le esclusioni editoriali: le fasce `base` e
`comune` richiedono anche il vettore fastText disponibile; `esteso` rimane una
riserva. Verifica anche le parole Livecade e segnala gli eventuali problemi,
conservando separatamente la provenienza storica. Per i tentativi riproduce
esattamente la selezione di `build_vocab`, compreso il limite numerico, e aggiunge
la banca. Le esclusioni delle segrete non diventano automaticamente divieti per
i tentativi: è il comportamento del generatore attuale.

Gli esiti sono nel DB di lavoro `database/parole_ita_raw.sqlite3`, tabelle
`raw__context_evaluation_runs`, `raw__context_evaluation_terms` e
`raw__context_evaluation_codes`. La vista `raw__context_evaluation_results` espone
parola, esiti, motivi, appartenenza alle banche attuali e copertura dei vettori.
La chiave `(run, prompt)` impedisce duplicati. Ogni esecuzione conserva gli hash
degli input e un riepilogo; lo stesso input identifica la stessa esecuzione.

La cartella `reports/` contiene il riepilogo JSON e i CSV delle segrete candidate,
dei tentativi nuovi, della riserva estesa, delle parole senza vettore e delle
segrete attuali da rivedere. Si tratta di una valutazione automatica dei requisiti
documentati: non sostituisce una verifica umana del significato e della qualità
delle vicinanze. Il comando salva soltanto la valutazione: vocabolario, segrete e
vettori del gioco restano allineati e non vengono riscritti.

Test: `python -m unittest discover -s . -p test_evaluate_context_inventory.py`.

## Nel codice

- Server: `apps/server/src/context.ts` serve parole e vettori. `ZEROCADE_CONTEXT_DATA` può indicare un'altra
  cartella per `vectors.bin`.
- Overlay: `apps/overlay/src/games/context.ts` (la partita) e `apps/overlay/src/games/contextRanking.ts` (la
  classifica per vicinanza).

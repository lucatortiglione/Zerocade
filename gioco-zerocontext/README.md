# 🎯 ZeroContext

## Disabilitare tutti gli aiuti

Nelle impostazioni di ZeroContext, **Disabilita tutti gli aiuti** blocca gli
aiuti dei regali (compresa la rosa), degli altri trigger, i suggerimenti
automatici e iniziali, le parole iniziali e le lettere del piccolo aiuto.
Il blocco vale subito nel round in corso: gli aiuti già sul tabellone vengono
nascosti, mentre tentativi e punti dei giocatori restano. Togliendo la spunta
tornano a valere le impostazioni dei singoli aiuti.

**Suggerimenti automatici** controlla soltanto il timer. Per fermare soltanto
i regali si usa **Aiuti dai regali**; il blocco generale ha precedenza su tutti
questi interruttori.

C'è una parola segreta da trovare. Ogni parola che la chat scrive riceve una posizione secondo quanto il suo
significato è vicino a quello della parola segreta: 1 è la parola segreta, 2 la più vicina, e così via. La chat si
avvicina un tentativo dopo l'altro. «Rivela più vicino» mostra una parola più vicina di tutte quelle già trovate.

Il suggerimento iniziale è facoltativo: se attivato, ogni round parte con la parola alla posizione 30,
un poco lontana dalla più vicina (si cambia in «Posizione del suggerimento iniziale»). Non conta tra gli aiuti
del round, ma è il punto da battere per i punti e per «Rivela più vicino».

Un round non ha un tempo limite: finisce quando qualcuno scrive la parola segreta, oppure quando la regia preme
**⏭ Termina round** nella dashboard (sezione «Soluzione»). In quel caso la parola si mostra a tutti, senza punti, e
dopo la pausa («Secondi prima della prossima parola») parte il round successivo.

Con la chat collegata tramite ZeroFollowerBot, dalla parola mostrata (indovinata o con «Termina round») fino
all'inizio del round successivo la voce non legge i commenti di **una parola sola**: in pausa non sono tentativi.
Il commento che indovina si legge; quelli di più parole si leggono come sempre.

## Come funziona

Caricamento, validazione dei vettori e classifica si eseguono in un **Web Worker dedicato** per ogni istanza
del gioco. Il thread dell'interfaccia conserva parole e posizioni, disegna e applica punti e regole.
Il worker mantiene i vettori per i round successivi; quando si cambia gioco o si chiude l'overlay viene terminato.
Un riavvio crea una nuova istanza e riscarica i dati, evitando cache globali con dati di una versione precedente.

Le risposte in ritardo di round o istanze precedenti non possono cambiare parola né assegnare punti.
Gli eventi ricevuti mentre si prepara un round sono ordinati e limitati: se la coda si satura, il gioco
mostra un errore e chiede di riavviare. I guasti di rete hanno al massimo tre tentativi; dati non validi
richiedono una correzione e un riavvio. I dettagli e le prove sono nel
[rapporto sulle direttive](../docs/ZeroContext-direttive-2026-11-14.md).

### Colori delle parole

La posizione 1 è la soluzione; numeri più bassi indicano parole più vicine.

| Colore | Posizioni predefinite | Quante parole nel vocabolario attuale |
| --- | --- | ---: |
| Rosso | 1–10 | 10 |
| Arancione | 11–100 | 90 |
| Giallo | 101–1.000 | 900 |
| Ciano | 1.001–10.000 | 9.000 |
| Blu | oltre 10.000 | 91.304 su 101.304 |

Le soglie crescono di un ordine di grandezza: rendono più visibile ogni avvicinamento alla soluzione,
mentre circa il 90% delle parole resta in blu. La soluzione ha anche la stella e l'annuncio del vincitore.
Le quattro soglie sono modificabili dalla regia; il server le mantiene crescenti e restituisce alla dashboard
i valori effettivi. Le precedenti soglie verde/arancione vengono sostituite dai nuovi valori predefiniti,
senza reinterpretare i vecchi numeri come colori diversi.

### Dati e tentativi

Ogni parola giocabile ha un vettore che ne rappresenta il significato. L'overlay scarica una volta dal server
parole, vettori e collegamenti (`/api/context/…`). A ogni round ordina tutte le parole giocabili per vicinanza alla
parola segreta, e la posizione in quella classifica è il punteggio di ogni tentativo. Una parola che non è tra
quelle giocabili non vale.

La parola segreta si indovina anche senza accenti: `proprieta` trova `proprietà`.
Questa corrispondenza ha precedenza anche quando entrambe le grafie sono nel
vocabolario con vettori diversi: il tentativo conclude il round e assegna i
punti di chi trova la soluzione.

Se la soluzione è un sostantivo al singolare, vale anche il suo plurale:
`gatti` trova `gatto`, `spiagge` trova `spiaggia`, `uomini` trova `uomo` e
`uova` trova `uovo`. Il plurale vince anche se ha un proprio vettore o manca
dal vocabolario dei tentativi. La soluzione mostrata resta al singolare;
punti e fine del round sono gli stessi della risposta esatta. Le altre parole
mantengono la propria posizione: non basta cambiare una desinenza.

I plurali attestati provengono da **Morph-it! 0.4.8**, di Marco Baroni ed Eros
Zanchetta (2004–2009), licenza [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/).
Il dizionario derivato `apps/overlay/src/games/contextPlurals.json` include
attribuzione, origine e SHA-256 della fonte. Si rigenera, senza modificare DB
o vettori, con `python script/build_context_plurals.py` dalla cartella del
gioco, dopo `python script/fetch_morphit.py`. L'overlay lo include nella build:
ricompilare e ricaricare la sorgente browser per applicare la regola.

La vicinanza nasce da tre cose, tutte preparate da `script/build_context_data.py`:

1. **Due fonti di vettori.** fastText italiano (`cc.it.300`), che impara dai testi, e ConceptNet Numberbatch, che
   aggiunge un grafo di conoscenza. La vicinanza di due parole è la media pesata dei due coseni: 0,7 fastText e 0,3
   Numberbatch (`--numberbatch-weight`). Numberbatch ha l'84% delle parole giocabili; alle altre va un vettore
   stimato dal loro fastText.
2. **Senza le direzioni comuni.** A ogni fonte si tolgono la media e le prime 2 direzioni principali (`--top-pcs`),
   quelle che rendono ogni parola un poco vicina a tutte le altre.
3. **I collegamenti di ZeroAssociazioni.** Le parole che i bacini verificati associano alla parola segreta (in un
   senso o nell'altro: «spiaggia» → «ombrellone», «bagnino») salgono di 0,15 in unità di coseno (`--link-boost`).
   Li ha l'80% delle parole segrete, in media 14 ciascuna. Non vanno in cima d'ufficio: una parola associata ma
   lontana per i vettori sale, senza scavalcare i sinonimi.

I pesi vengono da una misura: quanto in alto finiscono le parole associate da ZeroAssociazioni, prima di farle
salire. Con il solo fastText la loro posizione mediana era 383 e il 65% stava entro la 1000; con le due fonti e
senza le direzioni comuni 261 e 71%; con i collegamenti 32 e 98%.

## I dati

| Dove | Contenuto | In Git |
| --- | --- | :---: |
| schema `context` di [`database/giochi.sqlite3`](../database/README.md) | `context__vocab`, le parole giocabili; `context__secrets`, quelle che possono essere segrete; `context__links`, per ogni parola segreta le parole che ZeroAssociazioni le associa; `context__meta`, i conteggi e `link_boost` | sì |
| `data/vectors.bin` | Una riga per ogni parola giocabile: i vettori delle due fonti uno dopo l'altro (600 int8, già normalizzati), circa 60 MB | no |
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
| `python script/fetch_vectors.py` | Scarica i vettori fastText solo per le 300.000 parole più frequenti: legge l'inizio del file di Hugging Face (7 GB in tutto) e si ferma lì. Li mette in `.cache/`, fuori da Git |
| `python script/fetch_numberbatch.py` | Scarica i vettori italiani di ConceptNet Numberbatch 19.08: legge in streaming il file multilingue (3,2 GB) e si ferma alla fine del blocco italiano (circa 185.000 parole, un paio di minuti). Li mette in `.cache/` |
| `python script/build_context_bank.py` | Ricostruisce le aggiunte e la banca dall'inventario di ZeroAssociazioni (schema `raw` di `database/parole_ita_raw.sqlite3`, fuori da Git) |
| `python script/build_context_data.py` | Scrive parole e collegamenti nello schema `context` e i vettori in `data/vectors.bin`: base di 60.000 parole per frequenza, banca e inventario attestato |

`script/build_context_data.py --probe spiaggia pizza` stampa le 20 parole più vicine a quelle indicate, con `*` quelle
salite per un collegamento. Con `--dry-run` non scrive nulla: serve a provare altri pesi. Dopo un aggiornamento dei
bacini (`giochi.py aggiorna associazioni`) i collegamenti si rifanno rilanciando `script/build_context_data.py`.

## Espansione del vocabolario dei tentativi

Il generatore include anche i lemmi e le forme flesse attestati negli snapshot
attivi e abilitati dell'inventario. Ogni nuova parola deve avere un vettore
fastText disponibile e una grafia di 3–16 lettere italiane. Serve una prova in
Morph-it!/Flex_it, UniMorph o NVdB, oppure almeno due famiglie lessicali
indipendenti. GLAFF-IT e Wikizionario italiano contano come una famiglia;
Flex_it e Morph-it! come un'altra. Titoli, semplici frequenze e nomi propri
non costituiscono attestazioni per questa espansione.

Il limite di 60.000 riguarda la sola base per frequenza: le aggiunte attestate
non hanno un tetto numerico. Il vocabolario già attivo viene conservato.
Le possibili segrete seguono le fasce della banca; l'espansione dei tentativi
non promuove automaticamente nuove segrete.

`script/build_context_data.py` rigenera insieme DB, vettori, collegamenti e copie
testuali in `data/`. Prima della pubblicazione salva DB e file precedenti in
`.cache/backups/`; `reports/vocabulary_update.json` registra conteggi, politica,
snapshot e hash. Dopo la generazione riavviare il server e ricaricare gli overlay:
il server conserva le parole in memoria e l'overlay scarica i dati una volta.

Aggiornamento del 14 novembre 2026: **101.304 parole giocabili**, 41.075 aggiunte,
nessuna rimossa, 6.837 possibili segrete. Vettori: 60.782.400 byte (600 int8 per
parola). Riepilogo: [vocabulary_update.json](reports/vocabulary_update.json).

## Valutare l'intero inventario

`python script/evaluate_context_inventory.py` valuta tutti i termini di `raw.inventory_terms`,
le banche esistenti e le ulteriori parole nelle frequenze e nelle cache dei vettori.
Usa soltanto gli snapshot attivi delle fonti. Riconosce anche UniMorph, GLAFF-IT e
Flex_it; GLAFF-IT e Wikizionario italiano contano come una famiglia, Flex_it e
Morph-it! come un'altra. Hunspell fornisce una prova ortografica, non una categoria
grammaticale. Non si usano predizioni NLP su parole isolate per approvarle.

Per le segrete applica `decide` e le esclusioni editoriali: le fasce `base` e
`comune` richiedono anche il vettore fastText disponibile; `esteso` rimane una
riserva. Verifica anche le parole Livecade e segnala gli eventuali problemi,
conservando separatamente la provenienza storica. Per i tentativi riproduce
la base per frequenza di `build_vocab`, aggiunge la banca, il vocabolario già
attivo e l'espansione di `script/context_vocabulary.py`. Il valore `--vocab` limita
soltanto la base per frequenza, non il totale.
Le esclusioni delle segrete non diventano automaticamente divieti per
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

Test: `python -m unittest discover -s . -p script/test_evaluate_context_inventory.py`.

## Nel codice

- Server: `apps/server/src/context.ts` serve parole, vettori e collegamenti (`links.json`). `ZEROCADE_CONTEXT_DATA` può indicare un'altra
  cartella per `vectors.bin`.
- Overlay: `apps/overlay/src/games/context.ts` (la partita) e `apps/overlay/src/games/contextRanking.ts` (la
  classifica per vicinanza).

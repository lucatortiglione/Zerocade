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

## Parole mai uscite

Ogni parola segreta che esce, in una partita classica o in una manche del torneo, viene contata nella tabella
`context_secret_uses` del database della diretta (`apps/server/data/zerocade.db`). Una nuova manche sceglie a caso tra
le parole uscite meno volte, quindi sempre una parola mai uscita finché ce ne sono (6.837 in tutto). Quando sono finite
riparte dalle meno usate, mai la stessa della manche appena giocata. La dashboard mostra accanto alla soluzione quante
volte è uscita.

## Torneo ZeroContext

Le regole sono in [REGOLAMENTO_CONTEXT_TORNEO_v2_3.md](REGOLAMENTO_CONTEXT_TORNEO_v2_3.md), il progetto tecnico in
[ZEROCONTEXT_TORNEO_SPECIFICA_TECNICA.md](ZEROCONTEXT_TORNEO_SPECIFICA_TECNICA.md). In breve: finestre globali da 6 s,
una parola valida per persona e finestra, 70 finestre per manche, 5 o 7 manche, punti Pioniere + Jackpot − Filtro
Ghiaccio, la Top 10 a schermo tra le manche (almeno 15 s, poi la manche successiva parte solo a comando).

**Come si usa.** In dashboard, con ZeroContext selezionato e ZeroFollowerBot collegato, il pannello «Torneo
ZeroContext» permette di scegliere le manche (5, 7 o infinite) e la durata minima della Top 10, poi «Avvia torneo
ZeroContext». Con le manche infinite il torneo non finisce da solo: va avanti finché non premi «Concludi torneo». Lo
stesso pannello avvia le manche, le mette in pausa, le chiude o le annulla, e mostra la parola segreta (solo
all'organizzatore), la classifica completa e lo storico dei tornei. Durante il torneo non si cambia gioco e i
controlli della partita classica sono bloccati.

**Azzera classifica.** Tra una manche e l'altra (mai a manche in corso: prima va chiusa o annullata) il tasto «⟲ Azzera
classifica» chiede un motivo e riporta il torneo all'inizio: le manche giocate finora diventano annullate e i loro punti
spariscono, la classifica si svuota (si rientra con il primo tentativo valido) e si riparte dalla manche 1, subito,
con le stesse impostazioni e parole segrete mai giocate nel torneo. Tentativi, manche e storico restano nel database;
il registro (`context_tournament_audit`, evento `standings-reset`) conserva la classifica com'era. Un torneo già
concluso o annullato non si azzera: se ne avvia uno nuovo.

**Decisioni prese con l'organizzatore (15/11/2026)**, dove regolamento e specifica lasciavano aperto (§14):
- si entra in classifica con il primo tentativo valido, anche a torneo iniziato;
- contano solo i messaggi di ZeroFollowerBot. Senza il ponte il torneo non parte, e se il ponte cade durante una
  manche il torneo si sospende;
- chiudere una manche prima del tempo la conta come non risolta: restano Pionieri e malus, niente jackpot. La finestra
  aperta viene comunque valutata, e un target arrivato in tempo vince. Annullare una manche (la manche in corso o
  l'ultima giocata) toglie i suoi punti e la fa rigiocare con un'altra parola;
- la parità rimasta dopo gli spareggi del §9 è ex aequo;
- «Chi può giocare» resta quello impostato alla creazione del torneo;
- oltre alle 5 o 7 manche del regolamento si può scegliere «Infinite» (`total_rounds` NULL nel database): si gioca
  finché l'organizzatore conclude il torneo, o finché finiscono le parole segrete mai giocate nel torneo. Un
  `zerocade.db` con la tabella dei tornei già creata viene adattato da solo al primo avvio.

**Come è fatto.** Tutto si decide sul server; overlay e anteprima della dashboard mostrano solo lo stato che ricevono,
e non ricevono mai la parola segreta prima della fine della manche.

| File | Cosa fa |
| --- | --- |
| `packages/shared/src/contextTournament.ts` | regole in numeri, fasce e colori ufficiali, tipi dello stato e dei comandi |
| `packages/shared/src/contextRanking.ts` | il ranking, lo stesso codice per il browser (classica) e per il server (torneo) |
| `apps/server/src/context-tournament-scoring.ts` | punteggio puro: Pionieri, jackpot, Filtro Ghiaccio, spareggi, Top 10 |
| `apps/server/src/context-tournament-ranking.ts` | corpus del server con la sua impronta, scelta della parola, parola guida |
| `apps/server/src/context-tournament-db.ts` | tabelle `context_tournament_*` in `zerocade.db`, transazioni, storno, storico |
| `apps/server/src/context-tournament.ts` | stati, finestre, comandi, ripristino dopo un riavvio |
| `apps/overlay/src/ContextTournament.tsx` | la vista del torneo nell'overlay |
| `apps/dashboard/src/components/ContextTournamentPanel.tsx` | il pannello dell'organizzatore |

I punti del torneo non entrano nelle classifiche ordinarie. Un riavvio di Zerocade a metà manche la sospende: alla
ripresa la finestra interrotta riparte da capo con i tentativi già registrati, e nulla viene contato due volte.

**Scostamenti dalla specifica, motivati.**
- Il ranking di una manche (circa 100 ms) gira nel thread principale e non in un worker, ma solo quando nessuna
  finestra è aperta, cioè alla preparazione della manche. Un worker separato complicherebbe il pacchetto Windows.
- I messaggi Socket.IO sono tre per il server (`context:tournament`, `-admin`, `-error`) e tre per la dashboard
  (`context:tournament`, `-history`, `-standings`), invece dei sette della specifica.
- Tra due finestre c'è 1 s di «ELABORAZIONE» per mostrare i risultati: non conta nei 6 s.

**Non fatto e da verificare prima di tornei con premi:** misurare la latenza reale di video e chat di TikTok e
Twitch (specifica §4 e §14.2): i 6 s sono quelli del server; adeguare la partita classica al suo regolamento v2.0, che
la specifica indica come lavoro distinto; provare il torneo in una diretta vera.

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

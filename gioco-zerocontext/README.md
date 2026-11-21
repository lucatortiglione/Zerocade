# 🎯 ZeroContext

Stato del **16 novembre 2026**: **93.928 parole giocabili e 9.513 segrete**, con tutte le
**6.838 segrete precedenti conservate** e 2.675 aggiunte. Il pannello **Associazioni ZeroContext**
permette di scegliere fra **originali**, **ABTT**, **Pipeline B** e **Riordino**. Gli ultimi due profili usano le segrete giocabili dei rispettivi export.
Originale e ABTT conservano le stesse parole: originale 300 float32 (112.713.600 byte),
ABTT 1.024 float32 (384.729.088 byte), senza riduzione della matrice valutata.
Tutte le **9.513 segrete sono ordinarie**: i round speciali sono sospesi e nessuna parola è stata rimossa.
La scelta predefinita è l'originale. TurboX e Harrier sono stati rimossi dal DB e dal selettore.
Il cambio avvia un nuovo round e conserva le classifiche; durante un torneo aperto la scelta è bloccata.
Procedura, origini e backup in [PROFILI_ASSOCIAZIONI.md](PROFILI_ASSOCIAZIONI.md).
La pipeline configurata BGE-M3 con contesti e retrofitting non è ancora stata eseguita sull'intero corpus.
Stato, task e dettagli in [IMPLEMENTAZIONE_VETTORI_SEMANTICI.md](IMPLEMENTAZIONE_VETTORI_SEMANTICI.md).
Fanno fede `context__meta`, `context__targets` e il file indicato da `vectors_file`.

## Riordino, indizi e confronti di fine live

Nel pannello **Associazioni ZeroContext** puoi scegliere **Riordino (legami specifici)**. Il profilo usa l’export `database/ZeroContext_Associazioni_Riordino.sqlite3` e dà più peso a legami come un mestiere e il suo strumento, un oggetto e una sua parte, o un soggetto e una sua azione tipica. Le sale che usano un altro profilo mantengono la propria scelta.

### Usare Riordino su Windows

Se avvii ZeroCade dai sorgenti, apri la regia e seleziona **ZeroContext → Associazioni ZeroContext → Riordino (legami specifici)**. Il database è già presente nella cartella `database`.

Se usi la versione Windows e la voce Riordino manca, aggiorna il pacchetto prima della live.

1. Chiudi la copia di ZeroCade avviata da `release\zerocade-win-x64`.
2. In VS Code apri la cartella principale del progetto, quella che contiene `.vscode/tasks.json`.
3. Scegli **Terminale → Esegui attività…**, cerca **pacchetto Windows** ed esegui **ZeroCade : Crea pacchetto Windows con Riordino**. Da terminale puoi eseguire lo stesso script con `npm run package:win`.
4. Al termine avvia `release\zerocade-win-x64\Avvia Zerocade.cmd` e scegli **Riordino (legami specifici)** in regia.

### Indizi e voti della live

Durante un round, dopo **cinque parole valide e distinte consecutive** che lasciano invariata la posizione migliore, la regia può premere **Pubblica indizio**. La pista appare sull’overlay e consuma un aiuto del round. La regia conta i tentativi validi fino al primo miglioramento e mostra l’esito anche nel round successivo. La pausa, il limite degli aiuti e **Disabilita tutti gli aiuti** valgono anche per questo comando.

L’indizio attuale parte dalla segreta o dalla parola più vicina già sul tabellone. L’idea di far indovinare una parola intermedia ancora da giocare è una proposta per una versione successiva.

Dopo **Termina sessione**, apri **Valuta i confronti di fine live** oppure **Qualità → Confronti di fine live**. Per ogni segreta puoi scegliere quale delle due parole giocate in chat è più vicina, oppure **Pari**. La scheda contiene fino a cinque confronti, senza nomi né posizioni. Le parole del simulatore e gli aiuti sono esclusi.

Il task VS Code **ZeroContext : Valuta Riordino con i voti delle live** confronta il vecchio e il nuovo ordine sulle stesse preferenze. Mostra quante preferenze rispetta ciascun profilo e quanti confronti migliorano o peggiorano. Parità e coppie fuori dal vocabolario o dal pool giocabile hanno conteggi separati. Per valutare l’archivio di una regia diversa usa `node --import tsx scripts/context-evaluate-live-votes.ts --db <percorso-zerocade.db>`.

Il task **ZeroContext : Associazioni - Confronta i 50 indizi** esegue anche la misura separata su dodici segrete tenute fuori dall’addestramento di base. Il rapporto include le posizioni di ciascuna parola, le soglie di giocabilità e i risultati per campione. [Rapporto sui confronti](reports/confronti_indizi.json)

Per eseguire entrambi i confronti insieme, scegli **Terminale → Esegui attività → ZeroContext : Verifica Riordino**.

## Mostrare o nascondere il numero di lettere

In **Live settings → Mostra numero di lettere** si sceglie se mostrare i
riquadri della parola segreta nella modalità classica. L'impostazione è attiva
per impostazione predefinita e si applica subito, anche durante il round.

Spegnendola, i riquadri vuoti scompaiono e compare **PAROLA SEGRETA**: né il
numero dei riquadri né la loro larghezza rivelano la lunghezza. I piccoli aiuti
possono ancora mostrare il prefisso già rivelato, seguito da puntini, senza
riquadri per le lettere mancanti. Alla fine del round si vede sempre la parola
completa. **Disabilita tutti gli aiuti** nasconde anche il numero di lettere.
Nel torneo la lunghezza della soluzione resta nascosta fino a fine manche.

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

Un round ordinario non ha un tempo limite: finisce quando qualcuno scrive la parola segreta, oppure quando la regia preme
**⏭ Termina round** nella dashboard (sezione «Soluzione»). In quel caso la parola si mostra a tutti, senza punti, e
dopo la pausa («Secondi prima della prossima parola») parte il round successivo.

Con la chat collegata tramite ZeroFollowerBot, dalla parola mostrata (indovinata o con «Termina round») fino
all'inizio del round successivo la voce non legge i commenti di **una parola sola**: in pausa non sono tentativi.
Il commento che indovina si legge; quelli di più parole si leggono come sempre.

## Come funziona

Il server carica e valida il corpus e precalcola una classifica per round. Timer, tentativi,
aiuti e punti della modalità classica sono ora condivisi dalla stanza; overlay e preview disegnano
lo stesso stato, senza scaricare i vettori né assegnare punti autonomamente.

Tutti i round sono **ordinari, senza limite di tempo**. I round speciali sono sospesi: anche al
round 9 e 18 si usa l'intera banca delle segrete. Non si applicano il limite di 100 tentativi,
il timer survival o i bonus speciali. L'indicatore termico e i punti ordinari restano attivi.
Il torneo mantiene il proprio regolamento. Il motore precedente con worker resta compatibile con
corpus storici int8.

### Colori delle parole

La posizione 1 è la soluzione; numeri più bassi indicano parole più vicine.

| Colore | Posizioni predefinite | Quante parole nel vocabolario attuale |
| --- | --- | ---: |
| Rosso | 1–10 | 10 |
| Arancione | 11–100 | 90 |
| Giallo | 101–1.000 | 900 |
| Ciano | 1.001–10.000 | 9.000 |
| Blu | oltre 10.000 | 83.928 su 93.928 |

Le soglie crescono di un ordine di grandezza: rendono più visibile ogni avvicinamento alla soluzione,
mentre circa l'89% delle parole resta in blu. La soluzione ha anche la stella e l'annuncio del vincitore.
Le quattro soglie sono modificabili dalla regia; il server le mantiene crescenti e restituisce alla dashboard
i valori effettivi. Le precedenti soglie verde/arancione vengono sostituite dai nuovi valori predefiniti,
senza reinterpretare i vecchi numeri come colori diversi.

### Dati e tentativi

Ogni parola giocabile ha un vettore che ne rappresenta il significato. Il server legge parole e vettori e, a ogni round, ordina le parole per vicinanza alla soluzione.
Ogni tentativo riceve posizione e temperatura; l’overlay visualizza lo stato della stanza. Una parola che non è tra
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

La selezione nel pannello **Associazioni ZeroContext** vale per la stanza. Originali e ABTT usano rispettivamente i vettori FastText con retrofitting e BGE-M3 Italian con ABTT. Pipeline B e Riordino usano i vettori originali e assegnano le prime posizioni alle associazioni dell’export. Riordino può promuovere fino a tre parole con un legame specifico. [Guida ai profili](PROFILI_ASSOCIAZIONI.md)

Il **generatore storico** `script/build_context_data.py`, ancora disponibile, costruisce invece
la vicinanza con questi passaggi:

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

I pesi storici vengono da una misura: quanto in alto finiscono le parole associate da ZeroAssociazioni, prima di farle
salire. Con il solo fastText la loro posizione mediana era 383 e il 65% stava entro la 1000; con le due fonti e
senza le direzioni comuni 261 e 71%; con i collegamenti 32 e 98%.
Questi risultati non misurano il corpus semantico corrente; per quello usare il `report.json` della generazione.

## Parole mai uscite

Ogni parola segreta che esce, in una partita classica o in una manche del torneo, viene contata nella tabella
`context_secret_uses` del database della diretta (`apps/server/data/zerocade.db`). Una nuova manche sceglie a caso tra
le parole uscite meno volte nel pool del round: prima quelle mai uscite, quando disponibili. Il corpus complessivo contiene 9.513 segrete. Quando sono finite
riparte dalle meno usate, mai la stessa della manche appena giocata. La dashboard mostra accanto alla soluzione quante
volte è uscita.

## Penalità di genericità

Questa sezione descrive il metodo storico. Nel corpus semantico attivo `hub_strength = 0`:
le penalità non vengono applicate. Non eseguire `apply_context_hubs.py` per riprodurre il corpus corrente;
il comando modifica il ranking pubblicato.

Alcune parole (autista, guidatore, medico...) sono vicine a quasi tutto nei vettori, e per ogni segreta finivano in
alto anche con poca attinenza. Dal 15/11/2026 ogni parola ha una penalità, `hubs` nel DB (e `hubs` in `links.json`),
calcolata da `script/hubness.py`: la media del suo coseno con le 10 parole più vicine, per la forza 0,5, nella scala dei
vettori. Nella classifica di qualsiasi segreta il suo punteggio scende di quella penalità; il bonus dei collegamenti
si somma dopo. Per «fotografo» autista passa dal #272 al #455 e medico dal #631 al #2.214, mentre fotoreporter e
pittore restano in testa. Vale per la partita classica e per il torneo (stesso codice, `packages/shared/src/contextRanking.ts`).

- `build_context_data.py` la calcola a ogni generazione (`--hub-strength`, 0 = nessuna).
- `script/apply_context_hubs.py [--strength 0.5]` la aggiunge ai dati già pubblicati senza rigenerare i vettori.
- `prune_context_vocab.py` conserva le penalità delle parole rimaste.
- Cambia il ranking, quindi un torneo già aperto si sospende (l'impronta dei dati è cambiata): si annulla e se ne avvia uno nuovo.

## Torneo ZeroContext

Le regole sono in [REGOLAMENTO_CONTEXT_TORNEO_v2_3.md](REGOLAMENTO_CONTEXT_TORNEO_v2_3.md), il progetto tecnico in
[ZEROCONTEXT_TORNEO_SPECIFICA_TECNICA.md](ZEROCONTEXT_TORNEO_SPECIFICA_TECNICA.md). In breve: finestre globali da 6 s,
una parola valida per persona e finestra, 70 finestre per manche, 5 o 7 manche, punti Pioniere + Jackpot − Filtro
Ghiaccio, la Top 10 a schermo tra le manche (almeno 15 s, poi la manche successiva parte solo a comando).

La [sezione 14 del regolamento](REGOLAMENTO_CONTEXT_TORNEO_v2_3.md#14-provenienza-delle-parole-e-costruzione-del-database-lessicale)
descrive le fonti delle parole scaricate, la costruzione dell'inventario di lemmi e forme flesse, i criteri per
segrete e tentativi, l'origine dei vettori e la tracciabilità delle versioni del database.

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
| schema `context` di [`database/giochi.sqlite3`](../database/README.md) | `context__vocab`, le parole giocabili; `context__secrets`, quelle che possono essere segrete; `context__targets`, pool, frequenze, domini e deroghe; `context__meta`, conteggi e formato vettoriale; tabelle `links` e `hubs` per compatibilità | sì |
| `data/vectors.<sha256>.bin` | Matrici immutabili dei profili, selezionate dai rispettivi metadati: originale 300 float32, ABTT 1.024 float32 | no |
| `data/vectors.bin` | Nome storico e file di lavoro/candidato; nel runtime vale solo se i metadati non indicano un nome immutabile | no |
| `livecade-context-it-bank.csv` | L'esportazione della banca di Livecade, il punto di partenza: non si modifica mai | sì |
| `zerocontext-it-bank-aggiunte.csv` | Le parole nuove: sostantivi italiani comuni presi dall'inventario di ZeroAssociazioni | sì |
| `zerocontext-it-bank.csv` | La banca delle parole segrete: Livecade più le aggiunte | sì |
| `zerocontext-it-bank-meta.csv` | Una riga per parola, con la fascia e le prove usate | sì |
| `context_bank_exclusions.txt` | Le parole che non vanno aggiunte, anche se passano i filtri automatici | sì |

I CSV della banca elencati sopra appartengono al percorso storico. Il nuovo task di aggiornamento
legge direttamente il DB lessicale e non li richiede, neppure per le frequenze.

I vettori non sono in Git: il solo checkout non basta per giocare. Occorrono lo schema e il file
vettoriale della stessa generazione. Il runtime cerca la cartella anche tramite `ZEROCADE_CONTEXT_DATA`;
attualmente la sua individuazione richiede la presenza del nome storico `vectors.bin`, anche quando
il file attivo è quello immutabile. Conservare entrambi. Il confezionamento legge i dati attivi
tramite il servizio `context.ts` e li copia nel pacchetto come `zerocontext/vectors.bin`.

## Ricostruire i dati

Per il corpus corrente usare il task **00)ZeroContext : Contesti**, descritto nella sezione successiva.
I comandi qui sotto ricostruiscono la banca e il corpus **storico a due fonti**: rilanciarli pubblica
quel metodo e non riproduce la generazione statistica attiva.

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

## Task di aggiornamento della banca

I task **00)ZeroContext : Aggiornamento banca e rigenerazione segrete, vocabolario e vettori.**
e **00)ZeroContext : Contesti** eseguono la nuova pipeline descritta in
[IMPLEMENTAZIONE_VETTORI_SEMANTICI.md](IMPLEMENTAZIONE_VETTORI_SEMANTICI.md).
Leggono i DB locali in sola lettura, senza CSV della banca. I nuovi target ordinari applicano finestre Zipf, deroghe NVdB, frequenze verbali aggregate,
densità e ponti. La nuova pipeline usa Model2Vec da BGE-M3, prompt-averaging offline, fallback
FastText allineato e retrofitting con margine. La pubblicazione richiede collaudi di polarità, OOV
e distribuzione angolare, oltre alla conservazione di tutte le segrete.

Le segrete già pubblicate sono sempre conservate e restano estraibili, eventualmente nel pool ordinario
di compatibilità. La pubblicazione impedisce di rimuoverne anche una sola, crea un backup e sostituisce
solo lo schema `context` e il riferimento al file vettoriale immutabile. Un errore durante la generazione
lascia attivo il corpus precedente. Dopo il primo aggiornamento del codice serve riavviare il server;
i successivi cambi di corpus usano `POST /api/context/reload`.

```powershell
.venv-vectors/Scripts/python.exe -B script/build_context_semantic.py
.venv-vectors/Scripts/python.exe -B script/build_context_semantic.py --publish
```

Senza `--publish` si genera soltanto il candidato. Fonti, hash, conteggi, densità e deroghe sono
registrati in `report.json` e `targets.json`; `data/publication.json` identifica la pubblicazione.
L'ambiente è preparato dal task dipendente, con `requirements-vectors.txt`, in un ambiente dedicato.

## Task «ZeroContext : Copia segrete da normalizzata»

Copia in `database/giochi_v2.sqlite3`, nella tabella **`ZeroContext_Segrete`**, tutte le parole di `normalizzata` (RAW 2.0) con un IWFS di almeno 45
(`script/copia_segrete_normalizzata.py`, test in `script/test_copia_segrete_normalizzata.py`). Non applica altri filtri: né finestre Zipf né NVdB né
densità e ponti, che sono invece quelli di «ZeroContext : Generazione segrete» (tabella `zerocade_segrete`, che il nuovo task non tocca). Colonne e
comportamento: [PAROLE_RAW_2.0.md](../database/PAROLE_RAW_2.0.md#tabelle-di-giochi_v2-derivate-da-normalizzata-18112026). Il task esegue in sequenza, tramite `dependsOn`
in `tasks.json`, «ZeroCade : Normalizzare parole RAW» (che calcola l'IWFS), «ZeroWordHunt : Genera Parole» e infine la propria copia; se un passo fallisce
i successivi non partono. Non include «ZeroCade : Aggiornamento parole RAW», che scarica le fonti. Il server non legge ancora questa tabella.

## Task «00)ZeroContext : Contesti»

Esegue la stessa nuova pipeline Model2Vec + fallback FastText + retrofitting con margine. I precedenti profili
FastText/ConceptNet/LSA e con modelli neurali restano disponibili come esperimenti in
`resources/contexts.json` e `resources/ensemble.json`; il task pilota storico **00b** usa l'ensemble
statistico su 256 parole, senza pubblicarlo. **00a** verifica invece la nuova pipeline su 1.024 parole. Questi esperimenti non descrivono il corpus attivo.

Le sezioni seguenti conservano procedure e misure della pipeline storica: non vanno usate per
sovrascrivere il corpus semantico. La ricostruzione corrente è quella dei due task sopra.

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

Fotografia storica del 14 novembre 2026: **101.304 parole giocabili**, 41.075 aggiunte,
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

## Qualità delle posizioni

Misura quanto un profilo di vettori mette nelle prime dieci posizioni le parole che la gente associa alla segreta
(`guinzaglio` per `cane`), con sei metriche: Precision@10 (verificata e giudicata), nDCG@20, copertura, categoria
grammaticale (solo informativa), accezione e valutazione umana. **Non cambia il ranking del gioco**: produce il metro
con cui lo si migliora. Progetto: [la specifica](../docs/superpowers/specs/2026-11-19-zerocontext-qualita-posizioni-design.md),
[il piano](../docs/superpowers/plans/2026-11-19-zerocontext-qualita-posizioni.md).

```
python script/evaluate_context_ranking.py campione                       # sceglie 50 segrete di misura da rivedere (poi --blocco: +25)
python script/evaluate_context_ranking.py valuta --profilo original --giudice no
python script/evaluate_context_ranking.py valuta --profilo riordino --giudice no
python script/evaluate_context_ranking.py valuta --profilo abtt --giudice campione    # con Qwen locale sulle parole non coperte
python script/evaluate_context_ranking.py valuta --candidato NOME --vettori F.bin --vocab V.txt --dim 1024   # un profilo non ancora pubblicato
python script/evaluate_context_ranking.py ricalcola                      # dopo i verdetti dati nella pagina: niente Qwen né vettori
python script/evaluate_context_ranking.py parita --profilo original      # prime 20 di 20 segrete, per il confronto con il server
```

- **Riferimento:** `parole_ita_raw_2.0.sqlite3` (segrete, lemmi, forme flesse) e le associazioni verificate di ZeroAssociazioni in
  `giochi.sqlite3`, entrambi **solo in lettura**; ogni rapporto registra l'impronta dei dati letti. Se raw 2.0 cambia durante una
  valutazione, l'esecuzione si annulla (uscita 2).
- **Misura e sviluppo:** una segreta è di *misura* se `sha256(parola) mod 5 = 0`. Chi migliora il ranking usa solo lo sviluppo; la
  misura serve a controllare, così il punteggio non sale per costruzione.
- **Risultati:** `database/ZeroContext_Valutazione.sqlite3` (l'unico database in cui il valutatore scrive) e un rapporto JSON e CSV in
  `reports/`. Un'esecuzione interrotta si riprende rilanciando lo stesso comando: i verdetti già dati non si rifanno.
- **Giudice:** Qwen locale (llama.cpp, la stessa configurazione di ZeroAssociazioni). **Non parte durante una diretta**: si ferma se
  Zerocade ha una sorgente collegata. Il rapporto stampa sensibilità e specificità del giudice; l'accordo con i verdetti di Luca
  (`giudice_accordo_umano`) dice se fidarsi.
- **Pagina:** «Qualità» nella dashboard (`/qualita`): confronto dei profili e revisione del campione, parola per parola.
- **Test:** `python -I -m unittest discover -s valutazione -t .` da questa cartella (ambiente `.venv-pipeline-a`); lato server
  `tests/context-evaluation*.test.ts` e `tests/context-quality-view.test.ts`. `scripts/context-evaluation-parity.ts` confronta il
  ranking del valutatore con quello del server sui profili veri.

## Nel codice

- Server: `apps/server/src/context.ts` serve parole, vettori e collegamenti (`links.json`). `ZEROCADE_CONTEXT_DATA` può indicare un'altra
  cartella per `vectors.bin`.
- Server: `apps/server/src/context-semantic.ts` gestisce la partita semantica; `packages/shared/src/contextRanking.ts`
  calcola la classifica condivisa con il torneo.
- Server, **thread di calcolo** (19/11/2026): vettori e classifiche stanno in un thread a parte (`apps/server/src/context-worker.ts`,
  client `context-corpora.ts`), non in quello che serve overlay e regia. Caricare un corpus (0,5–1,8 s) e ordinare le 93.928 parole per una
  segreta (120–270 ms) prima fermavano tutto il server («Il server è rimasto bloccato»); ora il thread principale tiene solo il vocabolario e
  riceve le classifiche già fatte. Il round successivo si sceglie e si ordina **durante la pausa** tra i round (se la classifica arriva tardi la
  pausa si allunga, non parte mai un round senza); il primo round dopo la scelta del gioco o delle associazioni compare come «Preparo la
  classifica…». Nel torneo la manche successiva si prepara tra una manche e l'altra; dopo un riavvio la manche in corso riprende quando la
  sua classifica è pronta («Riprendi» chiede di riprovare tra un istante). L'impronta del corpus salvata nei tornei non cambia. Se il thread
  si ferma, le richieste in corso falliscono e la successiva ne avvia uno nuovo. Nel pacchetto Windows è `context-worker.mjs`.
  Misura (19/11/2026, caricamento di originali e ABTT e 20 classifiche): thread principale fermo al massimo 17–56 ms, al livello del rumore di
  un processo Node a vuoto su questo PC.
- Overlay: `apps/overlay/src/games/contextSemanticGame.ts` visualizza lo stato della stanza con `contextView.ts`.
  `context.ts` mantiene il motore precedente per i corpus storici.

**Elimina lo storico.** Nello «Storico dei tornei» della dashboard, «🗑 Elimina lo storico» cancella (dopo conferma) tutti
i tornei finiti, concordi o annullati, con manche, tentativi, punti e registro; il cestino accanto a un torneo cancella
solo quello. Non si recupera. Un torneo in corso, o ancora a schermo, resta.

## Associazione Parole — Pipeline A

Implementazione di [`PIPELINE_A_BGE-M3_PMI-SVD_ConceptNet_PPMI_v1.0.md`](../database/PIPELINE_A_BGE-M3_PMI-SVD_ConceptNet_PPMI_v1.0.md)
in [`pipeline_a/`](pipeline_a/). Le parole da associare (i candidati) sono quelle della tabella `parole` del RAW 2.0
(841.578 parole singole, validità da `normalizzata` o `UNKNOWN`); le parole a cui associare sono quelle di
`ZeroContext_Segrete` in `giochi_v2.sqlite3` (sola lettura; 4 segrete multiword non sono tra le parole singole e vengono saltate). Task VS Code:
**ZeroContext : Associazione Parole Pipeline A**: calcola i segnali e, a build finita, esporta in automatico (`build --export-db`) i top 1000 in
`database/ZeroContext_Associazioni_PipelineA.sqlite3` (schema `lexemes` + `semantic_pair_scores` della specifica). L'export si può rilanciare
da solo con `build.py export`.

- Segnali: `E` BGE-M3 dense (`embeddings.py`), `D` SPPMI+SVD e `C` PPMI diretta (`cooccurrence.py`, `distributional.py`),
  `G` ConceptNet it→it (`conceptnet.py`); fusione, confidenza, MMR e segnali `missing` mai a zero in `ranker.py`.
- **Posizione di ogni parola per ogni segreta**: non è salvata (43.407 × 841.578 ≈ 36,5 miliardi di righe) ma calcolata al volo su
  tutto il vocabolario in modo vettoriale (GPU): `Pipeline.rank_of(segreta, parola)`, `Pipeline.ranks(segreta)` (array per tutte
  le parole) e `build.py rank <segreta> [parola]`. Le parità condividono la posizione; le parole senza alcun segnale non hanno
  posizione. L'export salva solo i top N (`--top`, 1000 di default). Nota: una parola con un solo segnale può avere un punteggio
  alto perché i pesi disponibili vengono rinormalizzati; `weight_coverage` e `min_weight_coverage` servono a controllarlo.
- Ambiente: `requirements-pipeline-a.txt` (FlagEmbedding, faiss opzionale: senza, la ricerca è esatta in numpy).
- **Dati da fornire** in `.cache/pipeline_a_input/`: `corpus/` (file .txt, un documento per riga, licenza da verificare)
  e `conceptnet-assertions.csv.gz`. Senza, i segnali D, C e G risultano `missing` (il corpus e ConceptNet non sono nel repository).
- Limiti dichiarati: `parole`/`normalizzata` non hanno POS né accezioni (`pos`/`sense_id` vuoti, `sense_ambiguous=true`); gli ECDF
  sono stimati su un campione di coppie candidate, non su coppie annotate, quindi `score_is_calibrated=false` e nessun
  `high_confidence`; benchmark e ablazione (§8) non eseguiti. Test: `python -m unittest pipeline_a.test_pipeline_a`.

## Giocare con le associazioni della Pipeline B

Nella dashboard, in «Associazioni ZeroContext», la terza scelta **Pipeline B** usa l'export `database/ZeroContext_Associazioni_PipelineB.sqlite3`
(si può indicare un altro file con `ZEROCADE_ASSOCIATIONS_B_FILE`). Il server la deriva nel thread di calcolo (`apps/server/src/context-pipeline.ts`),
senza scrivere nulla in `giochi.sqlite3`:

- **Segrete**: le parole di `ZeroContext_Segrete` presenti nell'export (le sorgenti della tabella `semantic_pair_scores`) che sono anche nel vocabolario del gioco
  (le stesse 93.928 parole e gli stessi vettori delle associazioni originali) e hanno almeno 100 associate in quel vocabolario. Le altre sono saltate:
  il log all'avvio dice quante.
- **Posizioni**: le associate dell'export, in ordine di `rank`, prendono le posizioni 2, 3, … subito dopo la segreta. Le parole fuori dai top 1000 (e quelle
  dell'export che non sono nel vocabolario) restano giocabili e seguono, ordinate dai vettori originali. Aiuti, suggerimento iniziale e «parola più vicina»
  usano questo ordine.
- La **temperatura** mostrata deriva ancora dalla somiglianza dei vettori, non dal punteggio della pipeline: una parola alta nell'export ma lontana nei vettori può
  comparire fredda.
- Il cambio di sorgente avvia un nuovo round; durante un torneo è bloccato. Un nuovo export si legge al riavvio del server. Se l'export manca, è vecchio
  (senza la colonna `rank`) o non ha segrete utilizzabili, la scelta è disabilitata e il motivo compare sotto di essa.
- L'identità del corpus (usata dai tornei) comprende l'impronta dell'export: un nuovo export sospende un torneo aperto, come un cambio di dati.
- L'export scrive ora le righe una segreta alla volta (prima le teneva tutte in memoria: con 43.407 segrete non bastava la RAM).

## Task VS Code per il ciclo delle associazioni

Aprire la cartella ZeroCade in VS Code e scegliere **Terminale → Esegui attività → ZeroContext : Associazioni - Esegui ciclo completo**. Il task legge gli export correnti di Pipeline B e Riordino e crea una nuova cartella `gioco-zerocontext/reports/pilota_piste_<data_ora>`. Il terminale stampa il percorso della scheda. Il codice del pilota viene cercato prima nel workspace e poi nei worktree registrati del repository. In questa configurazione proviene dal worktree `feat/zerocontext-riordino`; dati e ambiente Python provengono dal workspace principale.

| Task sotto **ZeroContext : Associazioni** | Quando usarlo |
|---|---|
| Esegui ciclo completo | Genera l'export pilota, misura la varietà, verifica le parole ambigue, confronta i tre profili sui 50 indizi e prepara il voto alla cieca. Con un archivio tornei disponibile produce anche `revisioni.json`. |
| Conteggia voti A e B | Dopo aver compilato l'ultima colonna di `confronto.tsv` con A, B o pari. Stampa i risultati e i voti mancanti per ogni scheda. |
| Prova le associazioni umane direzionali | Confronta Riordino standard con il segnale tentativo → segreta. Scrive export, misure, confronto sui 50 indizi e scheda cieca in una nuova cartella `reports/pilota_umane_*`. |
| Confronta i 50 indizi | Aggiorna il rapporto tra Pipeline B, Riordino precedente e Riordino con legami specifici. Riporta anche il risultato sul campione separato. |
| Rivedi i tentativi dei tornei | Mostra le coppie ricorrenti nell'archivio `apps/server/data/zerocade.db`. La variabile `ZEROCADE_DB` permette di indicare l'archivio della diretta. |
| Ricalcola Riordino e avvia il ciclo | Parte dall'export della Pipeline B, riaddestra il modello standard e conserva lo standard ricalcolato e il pilota nella cartella della prova. |
| Rigenera da Pipeline B | Esegue il task esistente di generazione della Pipeline B e prosegue con il riaddestramento e il ciclo. Usarlo quando cambiano i dati a monte. |

## Associazione Parole — Pipeline B

Il pilota direzionale usa le prime risposte del CSV italiano di Jonauskaite et al. (2025), CC BY 4.0. Il task scarica il file in cache e verifica lo SHA-256. Delle 56 persone, 54 hanno una sola riga identificata come prima risposta. Il seme 42 assegna 41 persone al segnale e 13 al test. Il denominatore include tutte le prime risposte disponibili per lo stimolo, anche quelle fuori vocabolario. Alla parola tentata viene assegnato un bonus pari al limite inferiore di Wilson al 95% quando almeno due persone hanno risposto con la segreta. Il punteggio iniziale è `1/(5 + rango)` per le parole dello standard e zero per le nuove. La misura usa la partizione fissa delle segrete e coppie distinte osservate nei 13 partecipanti riservati al test. I ranghi nel rapporto partono dalla prima parola associata; sullo schermo la posizione 1 appartiene alla soluzione. [Studio](https://doi.org/10.5334/jopd.140) · [Dati](https://osf.io/xzcbg/)

[`pipeline_b/`](pipeline_b/) implementa [`PIPELINE_B_FastText_PMI-SVD_ConceptNet_PPMI_v1.0.md`](../database/PIPELINE_B_FastText_PMI-SVD_ConceptNet_PPMI_v1.0.md).
Come chiede la specifica per un confronto equo con la A, cambia **solo** il backend `E`: vocabolario (tabella `parole`), corpus,
PMI-SVD, PPMI, ConceptNet, filtri e scoring sono il codice di `pipeline_a` (nessuna copia). `E` è `cc.it.300.bin`
(fastText, 300d, già in `.cache/`, letto con il lettore verificato di `script/context_subword.py`, senza il pacchetto `fasttext`).
Un vettore da sole sottoparole non rende valido il lemma: i risultati portano `oov_subword_only` e, per quei lemmi, mai `high_confidence`.
Task: **ZeroContext : Associazione Parole PipelineB** (build + export automatico) → `database/ZeroContext_Associazioni_PipelineB.sqlite3`
(top 1000 per ogni parola di `ZeroContext_Segrete`, con colonna `rank`; prove complete solo per i primi 20). Segnali in `.cache/pipeline_b`.

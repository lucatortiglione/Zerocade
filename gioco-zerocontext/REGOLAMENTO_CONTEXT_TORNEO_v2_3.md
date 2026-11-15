# Context — Regolamento Ufficiale del Torneo

**Versione 2.3 — 14 novembre 2026**  
**Modalità:** competizione individuale su tabellone condiviso; sistema Pioniere + Jackpot + Rollover.

## 1. Obiettivo e struttura

Il torneo si svolge sullo stesso motore di prossimità semantica delle partite classiche. I partecipanti cercano la **parola segreta** (*target*, **rank 1**); il rank più basso indica maggiore vicinanza semantica.

- Tutti giocano davanti al medesimo tabellone, anche durante una live.
- Il torneo è composto da **5 o 7 manche**, deciso e annunciato prima dell'inizio.
- Ogni manche dura al massimo **7 minuti di gioco**, cioè **70 finestre di 6 secondi**.
- Le classifiche sono individuali. Una manche finisce quando il target viene trovato oppure scadono le 70 finestre.
- **Intervallo tra manche:** dopo la convalida dei risultati compare automaticamente la **Top 10 del torneo**. Le finestre da 6 secondi sono sospese e l’avvio della manche successiva è manuale (sezione 13.6).
- I giocatori iscritti possono entrare nelle finestre di gioco fino al termine della manche; assenze e ritardi non danno diritto a recuperi.

## 2. Scala cromatica ufficiale

| Fascia | Rank esatto | Punti Pioniere | Colore sfondo | Testo |
|---|---:|---:|---|---|
| **Target** | 1 | — | Verde `#2E7D32` | Bianco `#FFFFFF` |
| **Rosso** | 2–100 | **15** | `#C62828` | Bianco `#FFFFFF` |
| **Arancione** | 101–600 | **10** | `#FB8C00` | Scuro `#212121` |
| **Giallo** | 601–2.500 | **10** | `#FDD835` | Scuro `#212121` |
| **Ciano** | 2.501–7.500 | **5** | `#00ACC1` | Scuro `#212121` |
| **Blu** | 7.501 e oltre | 0 | `#1565C0` | Bianco `#FFFFFF` |

Le fasce sono **mutuamente esclusive**: un rank 42 è Rosso, non anche Arancione/Giallo/Ciano. Ogni risultato mostra sia colore sia rank numerico. Le interpretazioni semantiche dei colori sono indicative, non garanzie linguistiche.

## 3. Finestre globali di 6 secondi — niente cooldown personali

1. Tutti vedono **un unico countdown globale di 6 secondi**. Nessun giocatore ha un cooldown individuale da ricordare.
2. Ogni giocatore può inviare **una sola parola valida per finestra**; vale la prima parola valida accettata dal server, che non può essere sostituita nella stessa finestra.
3. **Tutti possono inviare nella stessa finestra**: non è una gara a occupare un unico slot globale.
4. La validazione e l'eventuale conferma dell'invio possono essere immediate, **senza mostrare il rank**. Rank e punti vengono calcolati **alla chiusura** della finestra, elaborando gli invii validi secondo l'ordine di ricezione del server, con identificativo progressivo come spareggio tecnico.
5. La rivelazione dei risultati avviene dopo la chiusura: non è possibile sfruttare gli indizi dei concorrenti all'interno della stessa finestra.
6. Messaggi non validi o duplicati sono ignorati senza punti, malus o consumo del tentativo valido; eventuali invii abusivi possono essere limitati dal sistema.
7. Se una delle parole della finestra è il target, vengono processati gli invii che la precedono nell'ordine ufficiale, quindi la soluzione; gli invii successivi non modificano punti e stato del round. In presenza di più invii del target, vince il primo secondo l'ordine ufficiale.
8. Nell'ultima finestra vengono valutati i tentativi arrivati entro la chiusura **prima** di decretare il mancato ritrovamento del target.

Il tabellone indica chiaramente `INVIO APERTO`, countdown `6 … 1`, `ELABORAZIONE` e `NUOVA FINESTRA`. Un problema tecnico può determinare una sospensione, secondo la sezione 10.

## 4. Punteggio Pioniere e avanzamento irreversibile

La manche mette a disposizione **100 punti positivi massimi**, di cui 40 destinabili alle quattro fasce Pioniere e almeno 60 al Jackpot.

| Fascia Pioniere | Punti |
|---|---:|
| Ciano | +5 |
| Giallo | +10 |
| Arancione | +10 |
| Rosso | +15 |
| **Totale potenziale** | **40** |

**Regola dell'avanzamento (high-water mark):** il primo tentativo accettato che raggiunge una fascia più vicina al target rispetto a qualsiasi fascia precedentemente conquistata assegna **solo i punti della fascia effettivamente raggiunta**. Le fasce meno vicine saltate non potranno più dare punti Pioniere, neppure se vengono raggiunte in seguito. I tentativi in fasce già superate o già sbloccate non assegnano altri punti Pioniere.

**Esempio:** prima parola della manche = rank 42 (Rosso). Il giocatore riceve **15 punti**; Ciano, Giallo e Arancione non assegnano punti Pioniere e i loro 25 punti rimangono nel Jackpot. Il Jackpot potenziale è **85 punti**.

Non si attribuiscono mai simultaneamente più bonus Pioniere per lo stesso tentativo.

## 5. Jackpot di risoluzione e rollover

Il jackpot spetta **solo al primo giocatore che trova il target** (rank 1). La sua base è **60 punti**, ai quali si aggiungono tutti i punti delle fasce Pioniere rimasti non assegnati, siano esse **saltate** oppure **mai raggiunte**.

Definiti `P` i punti Pioniere effettivamente assegnati nella manche e `J` il Jackpot:

`J = 100 - P`  (quando la manche viene risolta).

Ne consegue che, **se il target viene trovato**, i punti positivi assegnati complessivamente ai partecipanti sono esattamente **100**. Se il tempo scade senza risoluzione, i punti Pioniere già guadagnati rimangono validi, ma **il jackpot non viene assegnato**. Di conseguenza, 100 è il totale disponibile, **non** il totale garantito in ogni manche.

| Scenario alla risoluzione | Punti Pioniere assegnati | Jackpot | Totale lordo |
|---|---:|---:|---:|
| Scalata completa: Ciano, Giallo, Arancione, Rosso | 40 | 60 | 100 |
| Solo Giallo e Rosso | 25 | 75 | 100 |
| Solo Arancione e Rosso | 25 | 75 | 100 |
| Solo Rosso | 15 | 85 | 100 |
| Nessun Pioniere (target al primo tentativo assoluto) | 0 | 100 | 100 |

**One-shot:** non ci sono bonus o moltiplicatori aggiuntivi oltre ai 100 punti disponibili. Un «Hole in One» resta esclusivamente onorario e **non compare tra i criteri di spareggio**.

## 6. Filtro Ghiaccio — malus Blu attenuato

Per ogni singolo giocatore, in **ogni manche**, si contano solo i tentativi validi e accettati che risultano in fascia Blu (rank maggiore di 7.500):

| Numero di tentativi Blu del giocatore | Malus del tentativo | Malus totale accumulato |
|---:|---:|---:|
| 1° | 0 | 0 |
| 2° | 0 | 0 |
| 3° | −1 | −1 |
| 4° | −1 | −2 |
| 5° | −1 | −3 |
| 6° | −1 | −4 |
| Dal 7° in poi | 0 (tetto raggiunto) | −4 |

Il **malus massimo è −4 punti per giocatore per manche**. I contatori si azzerano all'inizio di ogni manche. I tentativi nelle fasce Ciano, Giallo, Arancione e Rossa non producono malus. Un tentativo duplicato o non riconosciuto non è conteggiato. La finestra globale da 6 secondi rimane la principale misura anti-spam.

I malus non riducono il Jackpot: i **100 punti positivi sono lordi**, e la somma dei punteggi **netti** può essere inferiore a 100.

## 7. Fine manche, aiuto anti-stallo e parola-guida

- **Tempo massimo:** 70 finestre globali da 6 secondi, pari a 7 minuti di invio.
- **Con risoluzione:** vengono assegnati Jackpot e punti Pioniere maturati fino alla soluzione; la manche termina alla valutazione della finestra contenente il target.
- **Senza risoluzione:** restano i punti Pioniere e i malus già registrati; il Jackpot non viene attribuito.
- **Boa di salvataggio:** allo scadere di 3 minuti di gioco (**30 finestre**), se nessun giocatore è arrivato almeno alla fascia Ciano, il sistema mostra una **parola-guida preselezionata** con rank compreso fra 4.000 e 5.000.
- La parola-guida non è un tentativo di un giocatore: **non assegna punti, non sblocca fasce e non modifica il miglior rank competitivo**. Un successivo giocatore può ancora conquistare il bonus Ciano. Se non esiste una parola-guida valida, non viene mostrato alcun aiuto.

## 8. Achievement onorari

Gli achievement non aggiungono punti né modificano gli spareggi:

- **Hole in One (Oracolo):** il target viene trovato con il **primo tentativo valido assoluto della manche**, prima di qualsiasi altra parola accettata.
- **Pioniere Supremo:** lo stesso giocatore sblocca almeno tre fasce Pioniere nella manche.
- **Fuoco sotto il Ghiaccio:** chi risolve la manche ha accumulato almeno **3 punti di penalità Blu** nella stessa manche.

## 9. Classifica del torneo ZeroContext e spareggi

La modalità torneo deve disporre di una **classifica dedicata denominata «Classifica Torneo ZeroContext»**, distinta dalla modalità Partita classica. La classifica mostra i punteggi di tutti i partecipanti al torneo in corso e deve essere **aggiornata automaticamente e salvata** dopo la convalida di ogni manche. Tra una manche e l’altra il tabellone mostra automaticamente la **Top 10 dei giocatori**, secondo la sezione 13.6.

Il punteggio netto di un giocatore `i` nella manche è:

`S_i = punti_pioniere_i + jackpot_i − malus_blu_i`

Il punteggio finale del torneo è la somma algebrica dei punteggi netti di tutte le manche. La classifica può contenere anche punteggi negativi.

In caso di pari punteggio finale, gli spareggi sono, nell'ordine:

1. **Maggior numero di manche risolte** (Jackpot incassati).
2. **Maggior numero di bonus Pioniere nelle fasce Arancione e Rossa**.
3. **Minor numero complessivo di punti di penalità Blu subiti**.
4. Se permane la parità, **posizione ex aequo**, oppure una manche di spareggio annunciata dall'organizzatore **prima dell'inizio del torneo**.

L'achievement **Hole in One non è un criterio di spareggio**.

## 10. Validità degli invii, controllo e correttezza

- Il vocabolario e il motore di ranking sono fissati per tutto il torneo. La parola target deve avere un rank 1 univoco.
- Si normalizzano maiuscole/minuscole, spazi superflui e varianti tipografiche degli apostrofi. Gli accenti con valore lessicale non vengono indiscriminatamente eliminati. Plurali e coniugazioni sono validi soltanto se presenti nel vocabolario.
- Una parola normalizzata può essere usata una sola volta per manche. In caso di duplicazione anche nella stessa finestra, vale il primo invio registrato dal server.
- Per la precedenza conta **l'arrivo al server**, non l'ora che appare nella chat del partecipante. In caso di timestamp identico decide l'ID progressivo dell'evento.
- Sono vietati multiaccount, bot di invio, tentativi automatizzati e manipolazioni del client o del flusso dei messaggi. Gli organizzatori possono annullare tentativi illeciti ed escludere i partecipanti, registrando e comunicando il motivo.
- Il server conserva almeno: autore, parola normalizzata, finestra, ordine di arrivo, rank, fascia, punti Pioniere, malus, jackpot ed eventi di pausa/ripresa.
- In caso di guasto che impedisca una corretta attribuzione dei punti, la manche può essere **sospesa** e ripresa dallo stato registrato. Se non è ricostruibile con certezza, è **annullata e rigiocata**; i punti della manche annullata non contano.
- Regali virtuali, abbonamenti e donazioni **non** danno accesso a finestre aggiuntive, bonus o precedenze.

## 11. Esempi verificabili

**A. Salto diretto al Rosso:** primo giocatore rank 42 = +15. Secondo giocatore trova target = +85. **Totale positivo 100**.

**B. Progressione parziale:** giocatore A conquista Ciano (+5), B conquista Giallo (+10), C trova il target (+85). **Totale positivo 100**.

**C. Manche non risolta:** vengono assegnati Ciano (+5) e Rosso (+15), poi scadono i 7 minuti. **Totale positivo distribuito 20**; gli altri **80** non sono assegnati. Le eventuali penalità Blu riducono ulteriormente il netto individuale.

**D. Aiuto del sistema:** dopo 30 finestre senza rank ≤ 7.500 da parte di un giocatore, il sistema rivela una parola-guida con rank 4.500. Nessuno ottiene punti. Il primo successivo tentativo valido in fascia Ciano può ancora assegnare **+5 Pioniere**, se la fascia è il nuovo miglior livello competitivo.

## 12. Separazione tra gioco e premi reali

Questo documento disciplina le regole di gioco e classifica. Eventuali **gift card o altri premi di valore reale** richiedono un regolamento separato di partecipazione, requisiti di età, verifiche, consegna e contestazioni, nonché una valutazione del quadro normativo applicabile prima dell'evento. La gratuità del gioco, da sola, non sostituisce tale verifica.

## 13. Requisiti funzionali: avvio modalità Torneo e classifica ZeroContext

Questa sezione è **vincolante per l'implementazione dell'interfaccia e della logica applicativa**. Le regole dei punti e degli spareggi restano quelle delle sezioni 4–9.

### 13.1 Pulsante per avviare il torneo

- Nella schermata principale di ZeroContext deve comparire un pulsante chiaramente riconoscibile: **«Avvia torneo ZeroContext»**, distinto dall'avvio di una **Partita classica**.
- Il pulsante apre la configurazione del torneo: selezione di **5 o 7 manche**, elenco dei **partecipanti identificati** e conferma dell'avvio. Le opzioni scelte sono fissate prima della prima manche.
- Alla conferma, l'applicazione crea un **identificativo univoco del torneo**, inizializza la classifica a zero **solo per quel torneo** e attiva la modalità torneo. I risultati dei tornei già conclusi non devono essere cancellati.
- Durante il torneo deve essere visibile una dicitura **«Modalità Torneo ZeroContext»** con il numero di manche corrente e il totale previsto. Il normale pulsante di avvio torneo non deve creare accidentalmente un secondo torneo mentre uno è già in corso; deve essere disponibile un comando distinto per **riprendere** una sessione sospesa.
- Le partite classiche non assegnano punti alla classifica Torneo ZeroContext e non modificano il torneo in corso.

### 13.2 Classifica Torneo ZeroContext

- È obbligatoria una schermata o un pannello denominato **«Classifica Torneo ZeroContext»**, consultabile durante il torneo e alla sua conclusione. Sul tabellone condiviso viene inoltre mostrata automaticamente una **Top 10 di riepilogo dopo ogni manche**, secondo la sezione 13.6.
- Per ogni partecipante devono essere mostrati almeno: **posizione**, **nome/identificativo del giocatore**, **punti totali netti**, **manche risolte**, **bonus Pioniere Arancione/Rosso ottenuti** e **punti di penalità Blu accumulati**. È consigliato mostrare anche il punteggio ottenuto nell'ultima manche.
- L'ordinamento usa **prima il punteggio netto totale** e poi, in caso di parità, i criteri della sezione 9. In caso di parità non risolta, mostrare **ex aequo** finché non viene applicato l'eventuale spareggio previsto.
- La classifica del torneo in corso deve essere **separata da quella di altri tornei**. Lo storico dei tornei terminati deve restare consultabile, con data, partecipanti, risultati finali e identificativo del torneo. Un'eventuale graduatoria generale basata su più tornei richiede criteri autonomi e non sostituisce quella del singolo torneo.

### 13.3 Aggiornamento automatico dopo ogni manche

1. Alla fine della manche, il server **convalida** i tentativi e determina punti Pioniere, jackpot eventualmente assegnato e malus Blu secondo le regole precedenti.
2. Il sistema calcola per ogni giocatore `punti_manche = punti_pioniere + jackpot - malus_blu` e aggiorna il totale cumulativo **del torneo attivo**.
3. Il sistema salva in modo **atomico** risultati della manche e nuova classifica, poi aggiorna il pannello visibile senza richiedere operazioni manuali.
4. Lo stesso risultato di manche **non può essere applicato due volte** alla classifica (ad esempio dopo ricarica della pagina o ripetizione di una richiesta). Ogni registrazione è associata all'identificativo di torneo e di manche.
5. Se una manche viene **annullata**, i punti non devono essere conteggiati; se erano già stati contabilizzati, il sistema ne deve stornare gli effetti e ricalcolare la classifica. Una manche sospesa non viene registrata come conclusa.
6. Al completamento di tutte le manche, il torneo passa allo stato **«Concluso»**: la classifica finale viene salvata, resta consultabile e non è modificabile salvo correzioni amministrative tracciate.

### 13.4 Persistenza, correttezza e ripristino

- Punteggi, dettagli delle manche, partecipanti, stato del torneo e registro delle modifiche devono essere **persistenti**: chiusura della pagina, riconnessione o riavvio dell'applicazione non devono azzerarli.
- L'elaborazione ufficiale avviene sul **server**, non nei singoli client. L'interfaccia condivisa visualizza i risultati con sincronizzazione, senza poterli alterare.
- L'amministratore deve poter consultare lo storico dei risultati e motivare eventuali annullamenti o rettifiche. Ogni variazione deve lasciare una traccia verificabile.
- Il sistema deve impedire che tentativi della modalità classica o di un altro torneo vengano contabilizzati nel torneo attivo.

### 13.5 Verifiche minime prima del rilascio

- Avvio tramite **«Avvia torneo ZeroContext»**: creazione del torneo e classifica inizialmente a zero.
- Manche risolta: aggiornamento corretto di Pioniere, Jackpot, malus e classifica.
- Manche scaduta: rimangono i soli Pioniere e malus, **senza** Jackpot.
- Aggiornamento, ricarica della pagina o riconnessione: **nessun doppio accredito** e nessuna perdita della classifica.
- Annullamento manche: storno dei punteggi e ripristino dell'ordinamento corretto.
- Partita classica: **nessuna modifica** alla Classifica Torneo ZeroContext.
- Fine torneo: classifica finale salvata e consultabile nello storico.



### 13.6 Top 10 automatica tra le manche — requisiti obbligatori

**Scopo.** Al termine di ogni **manche** (round completo), la schermata condivisa di ZeroContext deve mostrare automaticamente i **primi 10 giocatori della classifica del torneo in corso**. Non deve apparire al termine di ogni finestra globale di 6 secondi. Il requisito si applica alle live **TikTok** e **Twitch** e non richiede alcuna operazione ai partecipanti.

**Momento di visualizzazione e flusso:**

1. Terminata una manche, il server elabora e convalida tutti i tentativi ammessi, applica Pioniere, Jackpot eventuale e malus Blu, quindi salva atomicamente il risultato e aggiorna la classifica cumulativa.
2. **Solo dopo l'avvenuto salvataggio** il tabellone passa allo stato `INTERVALLO_CLASSIFICA` e visualizza automaticamente la Top 10 aggiornata. Non mostrare punteggi provvisori come definitivi.
3. L'intervallo deve durare **almeno 15 secondi**, con durata minima configurabile dall'organizzatore. Allo scadere del tempo minimo, la classifica resta visibile finché l'organizzatore non attiva il comando **«Avvia manche successiva»**. Nessuna manche parte in automatico.
4. Durante `INTERVALLO_CLASSIFICA`, **non si aprono finestre da 6 secondi**, il timer di gioco non avanza e i messaggi della chat TikTok/Twitch non vengono accettati come tentativi né accodati alla manche successiva; non applicare malus o punti.
5. Dopo l'ultima manche, lo stesso pannello deve mostrare la **Top 10 finale**, con l'indicazione **«Torneo concluso»** e il comando per aprire la classifica completa e lo storico, senza un pulsante per avviare una manche inesistente.

**Informazioni minime per ciascuna riga:** posizione, nickname pubblico visualizzato, punti netti **cumulativi**, variazione di punti dell'**ultima manche**. È consigliata un'indicazione opzionale di salita/discesa nella posizione rispetto alla manche precedente. Mostrare chiaramente **«Manche X di Y»** e il titolo **«Classifica Torneo ZeroContext — Top 10»**. La classifica deve rispettare l'ordinamento e gli spareggi della sezione 9; l'achievement Hole in One non modifica l'ordine.

**Casi particolari e leggibilità:**

- Se vi sono meno di 10 partecipanti, visualizzarli tutti senza righe inventate; se sono più di 10, mostrare i primi dieci e rendere disponibile la **classifica completa** nell'interfaccia amministrativa.
- In caso di ex aequo non risolto, mostrare la stessa posizione; se la parità coinvolge il limite della decima posizione, segnalarla esplicitamente e consentire di consultare tutti gli ex aequo nella classifica completa, senza attribuire precedenze arbitrarie.
- La Top 10 deve essere facilmente leggibile sugli schermi mobili: caratteri grandi, contrasto adeguato, nomi lunghi abbreviati in modo sicuro e nessuna informazione personale oltre al nickname pubblico e alle statistiche del torneo.
- Le identità dei partecipanti devono essere distinte tramite identificativi stabili **associati alla piattaforma** (ad esempio coppia `piattaforma + id_utente`), non tramite il solo nickname, così da evitare collisioni tra TikTok e Twitch.
- Se il salvataggio o la convalida falliscono, non mostrare una classifica potenzialmente errata: restare in uno stato di errore/ripristino gestito dall'organizzatore. Un'annullamento o una rettifica autorizzata della manche deve aggiornare anche il pannello di classifica.

**Verifiche aggiuntive:** la Top 10 compare esattamente una volta dopo ogni manche convalidata; nessun tentativo ricevuto durante l'intervallo viene conteggiato; nessun avvio automatico della manche successiva; risultati ordinati correttamente anche con punteggi negativi o ex aequo; ripristino dopo disconnessione senza doppio accredito; Top 10 finale coerente con la classifica persistita.

---

# ALLEGATO A — Impatto sul codice sorgente e specifica tecnica di implementazione

> Allegato normativo/tecnico: i requisiti qui specificati si applicano esclusivamente alla **modalità torneo**. I file del repository elencati sono stati verificati sul ramo `main`; i moduli definiti come nuovi sono **proposti, non ancora esistenti**. L’implementazione non è stata eseguita.



## A.0 Obiettivo, confini, criteri architetturali

Implementare *Partita classica* e *Torneo ZeroContext* come due modalità dello stesso gioco `context`, mantenendo invariati i giochi diversi da ZeroContext e la banca lessicale (`vocab`, `vectors.bin`, `secrets`, `links`). Il torneo usa **solo chat TikTok/Twitch**, countdown globale di **6 secondi**, massimo **un invio valido per persona per finestra**, **70 finestre** per manche, **5 o 7 manche**, punteggio **Pioniere + Jackpot − Filtro Ghiaccio**, Top 10 **tra le manche** per almeno **15 secondi**, passaggio **manuale** al round successivo. I punti e la classifica ufficiali devono essere determinati **una volta sola dal server e persistiti**.

Vincoli: non fare un fork dell'intero gioco; non attribuire punti del torneo alle normali classifiche; non applicare i controlli di gioco classico al torneo in corso senza regole di migrazione; non introdurre vantaggi legati a regali, donazioni, abbonamenti o fan club. Dashboard preview e ogni altro overlay sono **client di sola lettura** dello stato competitivo.

**Terminologia:** *manche* = parola segreta completa; *finestra* = periodo di ricezione tentativi da 6 s; *round* nel vecchio codice = *manche* nel regolamento; *rank interno* `0` = target, *posizione pubblica* `1` = target. Non confondere il `rankOf` a base zero con la posizione del regolamento.

## 1. Mappa verificata del codice e modifiche richieste

| File reale | Comportamento verificato | Modifica proposta |
|---|---|---|
| [`apps/overlay/src/games/context.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/overlay/src/games/context.ts) | `createContext()` sceglie/riceve target, elabora chat e calcola il punteggio; `finish()` pianifica un nuovo round | In **classica** preservare il comportamento attuale. In **torneo** eliminare l'autorità locale su soluzione, punti e timer; applicare gli snapshot/eventi ufficiali emessi dal server; non richiamare `award()`/`finish()` per decidere la classifica del torneo. |
| [`apps/overlay/src/games/contextView.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/overlay/src/games/contextView.ts) | Canvas con parola nascosta, rank, fasce e Top 5 locale | Aggiungere vista `INVIO_APERTO`, `ELABORAZIONE`, `INTERVALLO_CLASSIFICA`, Top 10 (posizione, nick, totale, delta), manche X/Y e stato pausa; usare i colori ufficiali del torneo. Non mostrare target in anticipo. |
| [`apps/overlay/src/App.tsx`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/overlay/src/App.tsx) | `live:event` è inoltrato all'`Engine` per eseguire i trigger | Durante torneo il flusso delle parole deve essere elaborato dal **server**, non sia da server sia da overlay. L'overlay sottoscrive `context:tournament-state` / `context:tournament-window`. |
| [`apps/overlay/src/games/contextRanking.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/overlay/src/games/contextRanking.ts) | `lookup`, rank puro, `position(rank) = rank + 1`, colore per soglie configurabili | Estrarre/riutilizzare le regole **pure** di normalizzazione e ranking in un componente riusabile per il server, oppure effettuare un port verificato bit-per-bit; non reinterpretare arbitrariamente accenti/plurali, link boost o tie-break. |
| [`apps/overlay/src/games/context.worker.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/overlay/src/games/context.worker.ts), `contextWorkerClient.ts`, `contextLoader.ts`, `contextProtocol.ts` | Calcolo vettoriale in worker browser, dati scaricati da `/api/context/*` | Restano validi per la modalità classica. Il server del torneo deve **calcolare/verificare** il ranking in ambiente fidato; non accettare la classifica inviata dall'overlay come dato ufficiale. |
| [`apps/server/src/context.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/server/src/context.ts) | Esporta vocab/secrets/links e percorso `vectors.bin`; non gestisce il torneo | Esporre funzioni interne per costruire uno snapshot semantico coerente lato server; pin di hash/versione del corpus per tutto il torneo. Mantenere `/api/context/:file` per la classica. |
| [`apps/server/src/index.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/server/src/index.ts) | `broadcastEvent()` registra/inoltra le chat; Socket.IO e controlli di sessione; `score:add`; gestione parola stanza | Inoltrare le chat eleggibili anche al servizio Torneo; aggiungere API e comandi admin; broadcast degli snapshot; impedire doppio percorso dei tentativi, emissione `score:add` e `secret:round` autorevole dal client in torneo. |
| [`apps/server/src/sources.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/server/src/sources.ts) e [`apps/server/src/zfb.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/server/src/zfb.ts) | Ricezione TikTok/Twitch diretta o tramite bridge ZeroFollowerBot; `zfb` prefissa già `kind:` agli ID, le sorgenti dirette no | Normalizzare l'identità canonica come `piattaforma:id_utente_stabile` all'ingresso, e deduplicare per **sorgente + ID messaggio** quando esiste; gestire il caso di ricezione sia diretta sia via bridge. |
| [`apps/server/src/scores.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/server/src/scores.ts) e [`apps/server/src/db.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/server/src/db.ts) | `recordScore()` rifiuta `points <= 0`; `game_scores` alimenta classifiche ordinarie sessione/giorno/settimana/mese/all-time | **Non riutilizzare** `recordScore()` per il torneo. Nuovo ledger torneo con punteggi netti anche negativi, transazioni/idempotenza, senza mescolare la classifica generica. |
| [`apps/server/src/sessions.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/server/src/sessions.ts) | Stato runtime `paused/ended/run` in RAM; la sessione salvata è diversa dal torneo | Introdurre un record persistente di torneo attivo per stanza. `restart`, cambio gioco e `end` non devono distruggere o sovrascrivere il torneo: rifiuto o sospensione esplicita. |
| [`apps/dashboard/src/pages/GamesPage.tsx`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/dashboard/src/pages/GamesPage.tsx) e `GameControls.tsx` | Pulsante attuale `Termina round` e controlli generici di gioco | Aggiungere `Avvia torneo ZeroContext`, configurazione 5/7 manche, contatori partecipanti, comandi `Pausa/Riprendi/Annulla/Concludi/Prossima manche`, classifica e storico. Nascondere/disabilitare `Termina round` classico durante il torneo. |
| [`apps/dashboard/src/components/LeaderboardPanel.tsx`](https://github.com/lucatortiglione/Zerocade/blob/main/apps/dashboard/src/components/LeaderboardPanel.tsx) | Pannello della classifica generica `/api/leaderboard/:game` | Nuovo `ContextTournamentPanel.tsx` dedicato; mai sostituire o azzerare le classifiche ordinarie. |
| [`packages/shared/src/index.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/packages/shared/src/index.ts) e [`packages/shared/src/context.ts`](https://github.com/lucatortiglione/Zerocade/blob/main/packages/shared/src/context.ts) | Contratti TypeScript Socket.IO, `GAMES['context']`, colori di default classici `10/100/1000/10000` | Contratti torneo, comandi/stati/snapshot tipizzati, limiti, scala fissa torneo `100/600/2500/7500` (posizioni pubbliche). Lasciare i default classici inalterati. |
| [`tests/context*.test.ts`](https://github.com/lucatortiglione/Zerocade/tree/main/tests) | Test del contesto classico, colori, worker e ciclo di vita | Aggiungere test torneo, migrazione, rete, concorrenza, ripristino, classica invariata, punteggio e Top 10. |

### Scostamento da risolvere anche per la modalità classica v2.0

**La modalità classica attualmente implementata nel repository NON coincide ancora con il regolamento classico v2.0 concordato.** Il codice `apps/overlay/src/games/context.ts` accetta i commenti senza finestre da 6 secondi, continua finché qualcuno trova il target o l’admin termina il round, e attribuisce punti (`finderPoints` e `closestPoints`) alla classifica ordinaria; `GAMES.context` prevede un aiuto attivabile da regalo. Il regolamento *Partite Classiche v2.0* richiede invece 6 secondi globali, una parola valida per giocatore per finestra, feedback alla chiusura, nessun punto individuale/torneo e nessun vantaggio da regali.

**Implicazione di sviluppo:** progettare subito il *motore condiviso delle finestre* in modo riutilizzabile per la classica, ma aggiungere l'assegnazione Pioniere/Jackpot/malus e la persistenza della classifica **soltanto** nel torneo. La migrazione della classica verso le sue regole v2.0 costituisce un **lavoro distinto e necessario**, con test di compatibilità espliciti. «Non introdurre regressioni nella classica» significa preservare il motore lessicale e la disponibilità del gioco, **non** dichiarare erroneamente che l'attuale codice abbia già il gameplay classico v2.0.

### Problemi concreti del codice attuale da non trascurare

1. **Doppia elaborazione client/server:** oggi `App.tsx` passa gli eventi all'overlay, mentre alcuni giochi (ZeroDubbi/Incastro/Quizzland) già li elaborano sul server. Per il torneo seguire il modello server-authoritative, non una seconda via di punteggio via overlay.
2. **Top 5 non Top 10:** `context.ts` usa `topOf(scores, 5)`, e `contextView.ts` disegna cinque slot. La Top 10 del torneo deve essere un componente/schermata autonoma, non un semplice cambio `5 → 10`.
3. **Classifica ordinaria incompatibile:** `recordScore()` accetta solo numeri interi **positivi**. Non gestisce malus, `tournament_id`, `round_id`, deduplica o storno delle manche.
4. **Fasce diverse:** la classica usa soglie `10/100/1000/10000`; il torneo prescrive posizioni `2–100`, `101–600`, `601–2500`, `2501–7500`, `7501+`, target `1`. Non cambiare i colori e le soglie di tutti i giochi per applicare quelle del torneo.
5. **Regali per aiuti:** la definizione `GAMES.context.defaultTriggers` contiene `gift → reveal_closer`. **Nel torneo disattivare rigorosamente aiuti da gift e altri trigger sponsorizzati**; nessuna impostazione client deve poterli riattivare.
6. **Target e segretezza:** nella classica `secret:word` viene trasmesso anche agli overlay, che ricevono la parola completa per disegnare le caselle. Nel torneo **non inviare il testo della soluzione ai client overlay prima della fine**: un browser con strumenti sviluppatore potrebbe ricavarla. Trasmettere solo lunghezza/maschera, la soluzione all'organizzatore tramite canale autorizzato, e la parola intera alla chiusura.
7. **Identità dirette vs bridge:** `sources.ts` usa IDs non prefissati, mentre `zfb.ts` usa `tiktok:`/`twitch:`. Prima di premiare, evitare collisioni tra piattaforme e duplicazioni dello stesso messaggio attraverso due connettori.
8. **Ripartenze classiche automatiche:** `context.ts` sceglie un altro target dopo `breakSeconds` e può azzerare score dopo `matchWords`; nel torneo il successivo target parte **solo** quando l'admin lo ordina, dopo la Top 10.
9. **Preview non autorevole:** il browser dashboard con `?preview` oggi evita `score:add` grazie a `scoreReport.ts`, ma questo da solo non garantisce che non invii altre mutazioni. In torneo la preview deve essere solo spettatrice anche per `secret`, azioni e round.
10. **Limite capacità:** `CONTEXT_LIMITS.guesses = 10_000`; una manche di 70 finestre con 150 giocatori potrebbe teoricamente produrre 10.500 tentativi. Definire un limite partecipanti/traffico compatibile, o una politica efficiente e testata, senza bloccare casualmente il torneo.

## 2. Moduli nuovi suggeriti (nomi proposti, non file preesistenti)

| Nuovo modulo | Responsabilità unica |
|---|---|
| `apps/server/src/context-tournament.ts` | Aggregato torneo, stati, transizioni, selezione delle manche, orchestrazione. |
| `apps/server/src/context-tournament-windows.ts` | Orologio server, finestre, code bounded, ordinamento dei tentativi, pause. |
| `apps/server/src/context-tournament-scoring.ts` | Funzioni pure: classificazione fascia, high-water mark, Pioniere, jackpot, Blu, spareggi. |
| `apps/server/src/context-tournament-ranking.ts` | Ranking autorevole sul corpus pin-nato; condivisione/parità di algoritmo con il browser; parola-guida precomputata. |
| `apps/server/src/context-tournament-db.ts` | Query SQLite e transazioni di creazione, invio, chiusura, classifica, annullamento e storico. |
| `apps/overlay/src/ContextTournament.tsx` oppure `apps/overlay/src/games/contextTournamentView.ts` | Rendering server-state: countdown, stato, rank, Top 10, fine torneo. |
| `apps/dashboard/src/components/ContextTournamentPanel.tsx` | Form tornei, controlli admin, griglia completa, errore e ripristino. |
| `packages/shared/src/contextTournament.ts` | Tipi condivisi, DTO pubblici, eventi Socket.IO, invarianti numeriche, normalizzazioni leggere. |
| `tests/context-tournament-*.test.ts` | Unit, integration, DB, sockets, proprietà e regressioni. |

Scelta di disegno: **riusare** le funzioni pure esistenti invece di duplicare corpus, parsing, ranking e supporto di rete. Evitare nuovi moduli quando una funzione semplice collocata in un file esistente risulta più chiara.

## 3. Contratto di modalità e macchina a stati

### 3.1 Attivazione

Una stanza (`key`) può avere **un solo torneo attivo**. `GameId` rimane `context`; si aggiunge un concetto di `mode: 'classic' | 'tournament'` nello stato/snapshot, non un finto nuovo game ID. Stato classico di default. Un torneo concluso rimane storico, senza impedire l'avvio di un nuovo torneo. L'attivazione richiede selezione ZeroContext e conferma amministratore.

### 3.2 Stati persistenti

```text
CREATED -> READY -> WINDOW_OPEN -> WINDOW_PROCESSING -> WINDOW_OPEN (fino a 70)
                               |                 |
                               +-----------------+-> ROUND_SETTLING -> INTERMISSION
INTERMISSION --[admin: next-round]--> READY ...
INTERMISSION --[ultima manche]--> COMPLETED
Qualsiasi fase attiva --[admin:pause / guasto]--> SUSPENDED --[admin:resume]--> fase precedente
Una manche invalida -> VOIDED (ledger stornato), poi rigiocata/riavviata secondo policy
```

- `CREATED`: torneo creato, iscrizioni aperte solo prima della prima manche.
- `READY`: target e ranking calcolati, non ancora aperto l'invio.
- `WINDOW_OPEN`: accetta al massimo **una parola valida per giocatore**. Solo qui avanza il tempo attivo.
- `WINDOW_PROCESSING`: blocca nuovi invii; classifica il batch ricevuto nel preciso ordine server; pubblica i risultati **dopo** la chiusura della finestra.
- `ROUND_SETTLING`: calcola somme ufficiali e persiste in un'unica transazione. Non assegnare due volte.
- `INTERMISSION`: mostra Top 10 aggiornata, ferma il timer, ignora le chat come tentativi; almeno 15 s, poi prossimo round **solo a comando**.
- `SUSPENDED`: non accetta né accumula messaggi; ripresa da snapshot con contatore/timer fermo.
- `COMPLETED`: classifica finale immutabile, salvo rettifica amministrativa registrata.

**Non sovrapporre** indiscriminatamente `getSession().paused` (runtime in RAM, `apps/server/src/sessions.ts`) allo stato persistente del torneo. Il controllo pausa deve preservare `round_id`, finestra e tempo residuo. Comandi generici `restart`, `end`, `game:select`, `next-round` classico devono essere rifiutati durante torneo attivo o tradotti in operazioni amministrative esplicite e registrate.

## 4. Finestre da 6 secondi e messaggi TikTok/Twitch

1. Server avvia una finestra `window_index` da 1 a 70, salva `opened_at`/`closes_at` o equivalente insieme a un orologio monotono in runtime; emette `context:tournament-window {tournamentId,roundId,windowIndex,phase,serverNow,remainingMs}`.
2. `broadcastEvent()` inoltra al torneo gli eventi `comment` solo se il gioco selezionato è `context`, la modalità è `tournament`, il torneo è in `WINDOW_OPEN`, il giocatore è ammesso e il trigger corrisponde a `guess`.
3. All'**ingresso sul server** assegnare `ingress_seq` monotonicamente crescente, ora di ricezione, piattaforma, ID messaggio quando disponibile. Il tempo mostrato sul video non fa fede per l'ordine tecnico.
4. Normalizzare il messaggio usando esattamente il `lookup()` applicabile al torneo: una parola attestata, accenti/plurali coerenti con il gioco. Messaggi invalidi, duplicate globali e replay non consumano la possibilità di un tentativo valido; limitare i messaggi inutili con rate limiter indipendente dai punti.
5. In una finestra, persistere **solo il primo tentativo valido non duplicato di ciascun `player_id`**. Se due utenti inviano la stessa parola, il primo in ordine di accettazione la ottiene; il secondo potrà tentare un'altra parola finché la finestra è aperta. Politica di concorrenza obbligatoria: unico punto di serializzazione (event loop/transaction), sequenza deterministica.
6. Alla scadenza `WINDOW_PROCESSING`: chiudere l'accettazione, ordinare per `ingress_seq`, calcolare rank e punti senza mostrare feedback semantico prima del batch; applicare la vittoria al **primo target** nell'ordine e ignorare per i punteggi gli eventi successivi della stessa finestra.
7. Elaborare anche la finestra 70 prima di decretare il tempo scaduto. Ogni finestra comprende 6 s di **ricezione server**, quindi 70 finestre = 420 s di gioco attivo, più i tempi di elaborazione/visualizzazione (non inclusi).
8. Se il sistema non regge il volume in sicurezza, sospendere la manche e indicarlo all'organizzatore; non eliminare tentativi confermati silenziosamente.

**Attenzione sulla latenza:** il countdown server di 6 s mostrato nella live può arrivare agli spettatori in ritardo; TikTok e Twitch possono avere ritardi diversi. Non descrivere 6 s come *equità temporale garantita*. Prima di usare tornei con premi, misurare latenza video/chat, determinare se servono un periodo di preannuncio e una finestra di accettazione più ampia, e pubblicare una regola di cut-off verificabile. **Il numero 6 s resta la regola approvata**, la mitigazione è una decisione di release da validare, non una modifica silenziosa del regolamento.

**Deduplicazione sorgenti:** lo stesso account può arrivare via connettore diretto e via ZeroFollowerBot. La normalizzazione `platform:user-id` unifica il giocatore ma non basta a deduplicare i *messaggi*. Quando l'ID messaggio esiste, usarlo come chiave di idempotenza includendo la piattaforma e l'ambito; se un connettore non lo fornisce, evitare l'attivazione simultanea di due acquisizioni per la stessa chat o implementare una strategia verificata senza falsi scarti. Vietare l'ID di fallback `anonymous` nelle classifiche ufficiali.

## 5. Ranking, target e sicurezza del segreto

**Persistenza e runtime autorevoli.** Prima dell'apertura della manche il server crea un `ContextRankingSnapshot`: riferimento alla versione/hash di `vocab.txt`, `vectors.bin`, `secrets.txt`, `links.json`, identificativo segreto e `rankOf`/equivalente. Il ranking deve essere identico a `rankAgainst()` per stessi dati: stessa regola sui pareggi, link boost, grafie e plurali; eseguire confronto automatico su corpus reale e parole campione. Non duplicare i vettori nel DB torneo.

**Performance:** non bloccare il loop Socket.IO con parsing o ordinamenti pesanti: calcolare il ranking della manche in anticipo tramite worker thread o servizio dedicato con deadline; congelare la configurazione di dati e la progressione del torneo fino a completamento. Il ranking è puro; la chiusura di un batch e l'accredito punti sono invece transazionali e idempotenti.

**Segretezza:** mai trasmettere il `secret` in `context:tournament-state` pubblico prima della risoluzione. Solo `secretLength`, eventuali `revealedLetters`, e dopo la fine `secretWord`. La dashboard autorizzata può mostrarlo in un endpoint/canale amministrativo distinto, non nel broadcast `io.to(key)`. L'attuale `secret:word` per tutti gli overlay va **disabilitato per il torneo**; lasciare invariato per la classica. Gli snapshot destinati a `?preview` sono gli stessi pubblici, privi del segreto.

**Set fisso:** target non ripetuti nello stesso torneo; snapshot della banca lessicale e algoritmo fissi per il torneo. Se impossibile riprodurre fedelmente il ranking dopo riavvio, interrompere in stato `SUSPENDED` e richiedere intervento; mai sostituire silenziosamente il corpus.

## 6. Calcolo dei punti: specifica eseguibile

Tutti i range sono in **posizioni pubbliche 1-based**, non negli indici interni. `rankPublic = rankInternal + 1`.

```ts
// Pseudocodice di specifica; NON patch copiabile senza adapter reali.
const band = (pos: number) =>
  pos === 1 ? 'target' : pos <= 100 ? 'red' : pos <= 600 ? 'orange'
  : pos <= 2500 ? 'yellow' : pos <= 7500 ? 'cyan' : 'blue';
const pioneerPoints = { cyan: 5, yellow: 10, orange: 10, red: 15 } as const;
const bandStrength = { blue: 0, cyan: 1, yellow: 2, orange: 3, red: 4, target: 5 } as const;
```

**Pionieri, high-water mark:** all'inizio `highWaterStrength = 0`, `pioneerTotal = 0`. Per un tentativo non target con `strength > highWaterStrength`, assegnare soltanto il bonus della fascia **realmente raggiunta**; segnare come definitivamente saltate tutte le fasce inferiori. Per una fascia già raggiunta o inferiore, 0 punti. Una guida del sistema **non** modifica `highWaterStrength` né `pioneerTotal` e non consuma bonus.

**Jackpot:** al primo target, `jackpot = 100 - pioneerTotal` (inclusi bonus mai raggiunti/saltati), pagato una sola volta. La parola target non sblocca contemporaneamente il Rosso o altre fasce. Se scadono 70 finestre senza target, **nessun jackpot**; i Pioniere effettivamente assegnati restano validi. Se si trova il target alla prima giocata assoluta: 100 jackpot, Pioniere 0.

**Filtro Blu per giocatore e manche:** incrementare `blueAttempts` solo per tentativi Blu validi, accettati, elaborati **prima della chiusura per soluzione**. I primi due non penalizzano; dal 3° al 6° si assegna `-1` per tentativo; dal 7° in poi 0 ulteriori malus, totale minimo −4. `penalty = min(4,max(0,blueAttempts - 2))`. Ricalcolare il totale da record canonici, senza sommare nuovamente gli stessi eventi su retry.

**Formula individuale:** `net = pioneer + jackpot - bluePenalty` (negativi ammessi). Per una manche risolta `sum(pioneer + jackpot) = 100`; la somma **netta** può essere inferiore. Per mancata risoluzione `sum(pioneer) <= 40`. Nessun altro bonus monetario, temporale o di dono.

**Spareggi** in ordine: (1) maggior punteggio netto, (2) più manche risolte, (3) più bonus *eventi* Pioniere Arancione/Rosso, (4) meno **punti** penalità Blu, (5) pari merito o spareggio preannunciato. `Hole in One` è un achievement onorario senza influenza sull'ordine.

**Achievement:** l'«Hole in One» si verifica soltanto se il **primo tentativo valido assoluto** della manche è target, non se è il primo tentativo personale del risolutore. «Pioniere Supremo» se lo stesso giocatore ha sbloccato almeno 3 fasce. «Fuoco sotto il Ghiaccio» se chi risolve ha almeno 3 punti penalità Blu nella stessa manche.

## 7. Boa di salvataggio e configurazioni esistenti

Alla chiusura della finestra 30, se **nessun tentativo di giocatore** ha raggiunto una posizione `<= 7500`, il server sceglie una parola già presente nello snapshot con posizione fra 4000 e 5000, determinata **prima** della manche. Pubblicarla a tutti senza autore né punti, senza segnare la fascia Ciano come conquistata. Se il corpus/target non dispone della guida, ometterla senza errore fatale.

In torneo gli aiuti classici (`starterWords`, `startHintOn`, `autoHints`, `reveal_closer`, `small_hint`, `disableAllHints`, `maxHintsPerRound`, `finderPoints`, `closestPoints`, `matchEnds`, `matchWords`, `breakSeconds`, `redUntil` ecc.) **non devono governare** la regola competitiva. Applicare un *profilo torneo immutabile* sul server. Non azzerare né riscrivere i valori classici salvati: tornando alla modalità classica, riattivare le preferenze dell'organizzatore. Un override da dashboard a metà torneo va rifiutato con motivazione leggibile.

**Fairness economica:** il trigger predefinito ZeroContext include `gift -> reveal_closer`; disabilitarlo **sul server per l'intero torneo** anche se il client dovesse provarci. Donazioni/follow/sub non devono conferire accesso aggiuntivo o punteggi. Eventuali filtri generici "Chi può giocare" vanno congelati/definiti esplicitamente prima del torneo; non cambiarli tacitamente in corso d'opera.

## 8. Persistenza SQLite: proposta di schema e transazioni

La base operativa è `apps/server/src/db.ts`, database `apps/server/data/zerocade.db` (`ZEROCADE_DB`), che già abilita **WAL**, **foreign_keys** e **busy_timeout**. Il corpus in `database/giochi.sqlite3` schema `context` resta **separato e read-only**. Per il torneo aggiungere nuove tabelle nel **database operativo**, non modificare il database linguistico.

Schema logico minimo (DDL rappresentativo; adattare i nomi e i CHECK alle convenzioni già presenti):

```sql
CREATE TABLE context_tournaments (
  id TEXT PRIMARY KEY,
  room_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('created','ready','active','intermission','suspended','completed','cancelled')),
  total_rounds INTEGER NOT NULL CHECK(total_rounds IN (5,7)),
  active_round INTEGER NOT NULL DEFAULT 0,
  corpus_hash TEXT NOT NULL,
  rules_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE UNIQUE INDEX context_one_open_tournament_per_room
  ON context_tournaments(room_key)
  WHERE status IN ('created','ready','active','intermission','suspended');
CREATE TABLE context_tournament_players (
  tournament_id TEXT NOT NULL REFERENCES context_tournaments(id),
  player_id TEXT NOT NULL, nickname TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(tournament_id,player_id)
);
CREATE TABLE context_tournament_rounds (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES context_tournaments(id),
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  secret_idx INTEGER NOT NULL,
  current_window INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL,
  remaining_ms INTEGER NOT NULL DEFAULT 6000,
  pioneer_total INTEGER NOT NULL DEFAULT 0,
  resolved_by TEXT, settled_at INTEGER,
  UNIQUE(tournament_id,round_number)
);
CREATE TABLE context_tournament_guesses (
  id INTEGER PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES context_tournament_rounds(id),
  window_index INTEGER NOT NULL,
  ingress_seq INTEGER NOT NULL,
  source_message_key TEXT,
  player_id TEXT NOT NULL,
  word_idx INTEGER NOT NULL,
  public_rank INTEGER,
  status TEXT NOT NULL,
  UNIQUE(round_id,window_index,player_id),
  UNIQUE(round_id,word_idx),
  UNIQUE(round_id,ingress_seq)
);
CREATE UNIQUE INDEX context_message_dedup
  ON context_tournament_guesses(round_id,source_message_key)
  WHERE source_message_key IS NOT NULL;
CREATE TABLE context_tournament_round_scores (
  round_id TEXT NOT NULL REFERENCES context_tournament_rounds(id),
  player_id TEXT NOT NULL,
  pioneer_points INTEGER NOT NULL DEFAULT 0,
  jackpot_points INTEGER NOT NULL DEFAULT 0,
  blue_penalty INTEGER NOT NULL DEFAULT 0 CHECK(blue_penalty BETWEEN 0 AND 4),
  red_orange_pioneer_count INTEGER NOT NULL DEFAULT 0,
  solved INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(round_id,player_id)
);
CREATE TABLE context_tournament_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL,
  round_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL,
  at INTEGER NOT NULL
);
```

**Nota progettuale:** gli indici `UNIQUE(round_id,window_index,player_id)` e `UNIQUE(round_id,word_idx)` devono applicarsi **solo ai tentativi accettati**. Se si desidera conservare anche rifiuti/duplicati, usare tabella di eventi distinta o indici unici parziali `WHERE status='accepted'`. Non inserire una parola scartata nella tabella canonica dei tentativi accettati.

**Persistenza di finestra:** registrare i tentativi confermati **prima** del feedback. A fine finestra elaborare con transazione del database e salvare rank, attribuzioni, fase successiva e log; su retry l'operazione deve risultare identica e non creare altre assegnazioni.

**Convalida fine manche:** `BEGIN IMMEDIATE`/transazione `better-sqlite3`: verificare che round sia convalidabile; aggregare score per partecipante; `INSERT ... ON CONFLICT` con guardia di non doppio settlement; marcare `settled_at/status`; aggiornare lo stato torneo; commit; **solo dopo** emettere `Top 10`. Se un conflitto avviene, ritornare lo snapshot già salvato, senza accumulo ulteriore.

**Classifica:** derivare i totali dalle righe di `context_tournament_round_scores` di round convalidati (o snapshot materializzato aggiornato nella medesima transazione); includere i giocatori a zero. L'ordinamento deve implementare **tutti** i criteri di spareggio ufficiali. Nessuna scrittura nelle `game_scores` ordinarie. Le rettifiche amministrative creano una traccia in `audit`, annullano/stornano il settlement, e ricostruiscono i totali dal ledger; non aggiornare manualmente il totale cumulativo senza registrare l'evento di origine.

**Ripristino:** all'avvio recuperare tornei non conclusi; se interrotti in `WINDOW_OPEN`/`WINDOW_PROCESSING`, porli in `SUSPENDED` con recupero deterministico dell'ultima finestra confermata, anziché consumare il tempo mentre il server era spento. L'host sceglie riprendi o annulla. Mai inventare messaggi persi durante il downtime.

## 9. Protocollo Socket.IO e API

Aggiungere i contratti a `packages/shared/src/contextTournament.ts` e integrarli nelle interfacce `ServerToClientEvents`/`ClientToServerEvents` di `packages/shared/src/index.ts`.

**Comandi ADMIN (dashboard autenticata alla stanza, validati server-side):**

```text
context:tournament-create       {totalRounds:5|7}                    -> ack {tournamentId,status}
context:tournament-start        {tournamentId}                        -> ack stato
context:tournament-pause        {tournamentId,expectedVersion}        -> ack stato
context:tournament-resume       {tournamentId,expectedVersion}        -> ack stato
context:tournament-next-round   {tournamentId,expectedVersion}        -> ack stato
context:tournament-void-round   {tournamentId,roundId,reason,expectedVersion} -> ack stato
context:tournament-finish       {tournamentId,expectedVersion}        -> ack stato
```

**Server → overlay/dashboard:**

```text
context:tournament-state    {version,tournamentId,phase,roundNumber,totalRounds,windowIndex,
                             windowRemainingMs,secretLength,visibleGuesses,top10,updatedAt,...}
context:tournament-window   {version,phase,windowIndex,serverNow,remainingMs}
context:tournament-results  {roundId,windowIndex,guesses:[{word,publicRank,band,author,...}],...}
context:tournament-leaderboard {tournamentId,roundNumber,top10:[{place,displayName,points,delta,...}],final}
context:tournament-error    {code,message,recoverable}
```

Tutti gli snapshot **pubblici** escludono `secretWord`, `secretIdx`, `rankOf`, `corpus` e dati amministrativi; nessun token/chiave o messaggio privato. A `ROUND_SETTLING` completato inviare una foto coerente con il DB, non un conteggio provvisorio. I comandi hanno risposta esplicita, `expectedVersion` evita controlli obsoleti e doppio click. Alla riconnessione il client riceve **lo snapshot corrente** prima di accettare aggiornamenti incrementali (`version` crescente).

**Lettura REST eventuale:** `GET /api/context/tournaments/active`, `GET /api/context/tournaments/:id/leaderboard`, `GET /api/context/tournaments/:id/history`, `GET /api/context/tournaments/:id/rounds/:roundId`, con protezione dello storico, accesso stanza e dati privati; nessuna API pubblica deve rivelare il target durante una manche.

**Autorizzazioni:** il controllo `clientType === 'dashboard'` attualmente esistente in `index.ts` è un primo filtro, non una prova d'identità forte da sola. Verificare la reale autenticazione delle dashboard/chiave stanza prima di esporre comandi capaci di cancellare risultati, e rendere gli overlay e `?preview` read-only.

## 10. Interfaccia: flussi e UX live

### Dashboard (file `GamesPage.tsx`, nuovo `ContextTournamentPanel.tsx`)

- Se selezionato `context`, mostra **«Partita classica»** e **«Avvia torneo ZeroContext»**. Il secondo apre scelta 5/7 manche e stato/numero partecipanti, poi richiede conferma.
- Partecipazione **tramite chat**, senza registrazione esterna: identificare automaticamente i giocatori `piattaforma:id`. Policy di iscrizione proposta: lista congelata all'avvio della prima manche; **da decidere/esplicitare** come rilevare e iscrivere gli utenti in chat senza un messaggio di adesione, per non imporre click sul sito. Non assumere che tutti gli spettatori siano già censiti.
- Mostrare stato corrente, round X/Y, finestra X/70, connessione TikTok/Twitch/bridge, numero partecipanti, migliori rank, errori e comandi `pausa`, `riprendi`, `annulla`, `prossima manche`, `concludi`.
- In `INTERMISSION`: bottone `Avvia manche successiva` disabilitato prima dei 15 s; la Top 10 resta visibile finché l'organizzatore non procede.
- Classifica completa e storico in dashboard; Top 10 finale permanentemente accessibile. Conferma per operazioni distruttive.

### Overlay (Canvas o React, secondo design finale)

- In `WINDOW_OPEN`: countdown comune chiaramente visibile, finestra X/70, manche X/Y, stato `INVIA`, tabellone con rank pubblici e colori del torneo; nessuna esposizione di rank **dei messaggi ricevuti nella finestra aperta**.
- In `WINDOW_PROCESSING`: mostra `ELABORAZIONE` senza accettare tentativi; pubblica gli esiti al termine. La UI non deve basare il countdown su sola cadenza `requestAnimationFrame`; lo stato deriva da epoch/remaining server e viene sincronizzato ad ogni snapshot.
- In `INTERMISSION`: Top 10 a schermo intero con posizione, nickname, punti cumulativi netti, variazione ultima manche, progressi eventuali, intestazione `Manche X/Y`. Minimo 15 s, **nessuna nuova manche automatica**. Se meno di 10 partecipanti non creare righe fittizie; gestire ex aequo alla decima posizione con avviso.
- In `COMPLETED`: `Torneo concluso` e Top 10 finale; link/azione amministrativa per classifica completa e storico.
- In `SUSPENDED`: overlay mostra pausa/errore, non countdown falso; non alterare la classifica.

**Compatibilità:** il renderer classico `contextView.ts` può rimanere per il comportamento attuale. Il tournament overlay deve usare il modello server-to-client ed evitare che la callback di disegno calcoli/assegni punti.

## 11. Regole di integrità, sicurezza e casi limite

- **One-shot** solo primo tentativo valido assoluto della manche; non dà spareggio né punti extra.
- **Target nel batch**: assegnare gli eventuali Pionieri ai tentativi che precedono l'evento vincente nella stessa finestra, poi jackpot al primo target; nessun altro evento della finestra può cambiare lo score.
- **Pioniere diretto Rosso:** +15 a chi lo tocca e +85 jackpot a chi risolve, se nessun'altra fascia già assegnata.
- **Round non trovato:** punti Pioniere/malus restano; 0 jackpot; Top 10 ugualmente mostrata.
- **Parola-guida:** non conta come tentativo né come fascia conquistata; resta visibile a tutti, non mette in consumo il bonus Pioniere Ciano.
- **Duplice risoluzione/riconnessione:** un solo `resolved_by`, un solo settlement; replay di socket e riavvio overlay non accreditano due volte.
- **Utente multipiattaforma:** due account sono identità diverse salvo un eventuale futuro collegamento di identità **verificato**; non fonderli dal nickname.
- **Filtro follower/fan:** se la partecipazione è aperta a tutti, disattivare filtri che producono privilegi nei punti o negli aiuti; usare la stessa politica per TikTok e Twitch.
- **Chat di simulazione** (`sim:event`): non deve alterare tornei ufficiali aperti agli spettatori; usarla solo in modalità test isolata.
- **Saturazione e downtime:** backpressure e stato `SUSPENDED` esplicito, non errore silenzioso; chiusura pulita del server, transazioni idempotenti.
- **Segretezza per overlay:** al pubblico non inviare soluzione o indice nascosto prima del risultato.
- **Sorgenti multiple duplicate:** eliminare replays del bridge/eventi della stessa chat; se il connettore non fornisce `messageId`, il rischio va documentato e verificato sul campo.
- **Cambio di impostazioni:** colore/threshold/punteggio/target/corpus congelati dall'avvio torneo; non modificare il torneo in corso con impostazioni libere.

## 12. Piano di implementazione (ordine di dipendenze)

| Fase | Output e file principali | Criterio di uscita |
|---|---|---|
| P0 — baseline | Test esistenti + snapshot comportamento `context.ts`, `scores.ts`, Socket, database | Baseline documentata; gioco classico corrente non regredisce fino alla sua migrazione v2.0. |
| P1 — dominio puro | `context-tournament-scoring.ts`, `contextTournament.ts`, test | Tutti gli esempi del regolamento e gli invarianti matematici superati. |
| P2 — ranking autorevole | `context-tournament-ranking.ts`, riuso `contextRanking.ts` e `server/context.ts` | Ordini/lookup/boost confrontati con codice browser, target segreto non esposto. |
| P3 — dati | nuove tabelle `db.ts` o migrazione dedicata, `context-tournament-db.ts` | Transazioni, UNIQUE, replay, restore, void/correction testati su DB temporaneo. |
| P4 — ingest/timing | `index.ts`, `sources.ts`, `zfb.ts`, `context-tournament-windows.ts` | 6 s server-driven; 1 valido/utente/finestra; ordine stabile; nessun messaggio doppio. |
| P5 — orchestrazione | `context-tournament.ts`, contratti socket, gestione lifecycle | Avvio, 70 finestre, fine manche, pausa, ripristino, 5/7 manche senza autorigenerazione. |
| P6 — UI | `GamesPage.tsx`, nuovo pannello, overlay torneo, styles | Countdown, dashboard, Top 10 automatica ≥15 s e avvio manuale, no secret leak. |
| P7 — prove live | test locali/integration e misure TikTok/Twitch | Latenza, connessione bridge, doppio feed, errore DB, regressioni, OBS mobile verificati. |

**Non mischiare** in un singolo commit refactor lessicale, algoritmo vettoriale, dashboard, database e punteggio del torneo. Preferire passaggi isolabili e reversibili, con migrazione additive-only.

## 13. Test di accettazione obbligatori

| ID | Caso | Aspettativa |
|---|---|---|
| T01 | Nuovo torneo da dashboard | Record con 5/7 round e classifica iniziale zero; un solo attivo per stanza. |
| T02 | TikTok e Twitch stessi ID numerici | Giocatori distinti (`platform:id`) anche con nickname uguale. |
| T03 | Due invii validi stesso utente/finestra | Solo il primo accettato; secondo non contabilizzato. |
| T04 | Prima parola invalida poi valida | La valida viene accettata, la prima non consuma il diritto. |
| T05 | Stessa parola da due utenti | Prima in ordine server accettata, secondo scartato senza malus. |
| T06 | Arrivo target su finestra 70 al limite | Elaborare la finestra prima dello scadere; un unico vincitore. |
| T07 | Target e Pioniere nella stessa finestra | Contano solo eventi precedenti il target nell'ordine ufficiale. |
| T08 | Salto diretto al Rosso | +15 e jackpot +85; mai quattro bonus simultanei. |
| T09 | Tutti i Pionieri assegnati | Jackpot 60; totale positivo 100. |
| T10 | Target come primo tentativo assoluto | Jackpot 100, Hole in One solo onorario. |
| T11 | Mancata risoluzione | Pioniere validi, jackpot 0, Top 10 comunque visibile. |
| T12 | Blu 1,2,3,4,5,6,7 | Malus 0,0,−1,−1,−1,−1,0; totale −4. |
| T13 | Boa a finestra 30 senza aggancio | Posizione 4k–5k pubblicata; nessun bonus/bruciatura Pioniere. |
| T14 | Boa non necessaria | Non viene mostrata dopo raggiungimento Ciano o migliore. |
| T15 | Regalo `reveal_closer` durante torneo | Nessun aiuto, punto, turno o vantaggio. |
| T16 | Più overlay/preview connessi | Stesso stato, un solo elaboratore, un solo score. |
| T17 | Doppio evento chat diretto e bridge | Nessun doppio tentativo/accredito, o canali sovrapposti bloccati. |
| T18 | Cambio gioco/restart accidentale | Operazione rifiutata o pausa esplicita; torneo salvato, non perso. |
| T19 | Crash durante settlement | Al restore zero o un settlement completo, mai mezzo e mai due. |
| T20 | Annullamento di una manche salvata | Ledger corretto, totale ricostruito, audit conservato. |
| T21 | Top 10 dopo fine manche | Solo dopo commit, almeno 15 s, avvio prossimo manuale. |
| T22 | Ex aequo al posto 10 e punteggi negativi | Posizioni e avviso coerenti, nessun ordinamento arbitrario. |
| T23 | Reload e reconnessione viewer | Snapshot aggiornato, nessuna nuova partita o premio extra. |
| T24 | `?preview` e overlay pubblico | Non leggono la soluzione prima della fine; non mutano risultati. |
| T25 | Partita classica dopo torneo | Nessun punteggio del torneo nella classica; test di transizione rispetto alla baseline e piano distinto per adeguare la classica al suo regolamento v2.0. |
| T26 | Due connettori con latenza diversa | Misurazione dei ritardi e politica di cut-off validata prima di premi. |
| T27 | >10.000 tentativi potenziali | Controllo capacità o gestione bounded; nessun blocco occulto. |

Comandi di progetto da rieseguire nel repository (come verifiche **da svolgere**, non già effettuate in questa analisi): `npm run typecheck`, `node --import tsx --test tests/*.test.ts`, `npm run build`, oltre ai test di integrazione in un server e database **temporanei**, mai sui dati della diretta.

## 14. Decisioni ancora da formalizzare prima dello sviluppo

1. **Come si iscrivono tramite chat** i giocatori senza sito esterno? Possibili policy: `!partecipo` prima del primo round; iscrizione automatica al primo tentativo in un periodo di pre-gara; oppure torneo aperto con ingresso tardivo. **Non presupporre un elenco completo degli spettatori**: le API non garantiscono che il viewer count equivalga agli utenti con ID disponibili.
2. **Latenza cross-platform:** i 6 secondi sono fissati, ma chi vede il countdown in ritardo può perdere la finestra. Definire dopo misure reali la politica di apertura/cutoff (e se contestare/rigiocare una manche con problemi) prima di rendere il torneo competitivo con premi.
3. **Source-of-truth dei messaggi:** solo bridge ZeroFollowerBot, solo connettori diretti, oppure entrambi con IDs e dedup robusta? Impedire doppio ingresso di una stessa chat.
4. **Politica dei controlli host:** terminare una manche volontariamente equivale a mancata risoluzione? Se sì, deve essere un'operazione esplicita con log, non `next-round` generico.
5. **Spareggio finale:** parità ex aequo o manche extra preannunciata. La scelta va salvata nell'istanza torneo alla creazione.
6. **Top 10 con parità al 10° posto:** schermata limitata a 10 righe con indicazione esplicita di pari merito e graduatoria integrale consultabile; non assegnare precedenza casuale.
7. **Versione del ranking:** definire formato/hash e dimensioni del corpus usato dal server, disponibilità dei vettori, memoria massima e politica di deploy tra manche.

## 15. Definizione di completamento (DoD)

L'implementazione è completa soltanto quando: un utente partecipa via chat TikTok/Twitch, un torneo da 5/7 manche si svolge con finestre globali da 6 s e punteggi verificati lato server, ogni manche aggiorna in transazione la classifica del torneo, la Top 10 appare per almeno 15 s con avvio manuale della successiva, la classifica finale/storico sopravvive al riavvio, preview e regali non possono alterare il risultato, e tutte le regressioni di ZeroContext classico e degli altri giochi sono superate. Senza test su traffico reale e sincronizzazione video/chat non dichiarare verificata l'equità temporale.


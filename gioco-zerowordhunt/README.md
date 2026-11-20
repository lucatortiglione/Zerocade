# ZeroWordHunt

Cerca-parole per la diretta: griglia 20 × 15, la chat scrive le parole nascoste, il primo messaggio valido le conquista; la parola
prende un colore e nella casella adiacente compare l'avatar di chi l'ha trovata. La specifica è
[Word_Hunt_Specifica_Tecnica_v1.0.md](Word_Hunt_Specifica_Tecnica_v1.0.md); questo file dice **dove vive il codice** e **cosa differisce**.

## Dove si trova il codice

| Parte | File |
| --- | --- |
| Regole, geometria di riferimento, palette, tipi e comandi condivisi | `packages/shared/src/wordhunt.ts` (voce di catalogo `zerowordhunt` in `index.ts`) |
| Dominio puro: coordinate, normalizzazione, generatore con anchor, audit, fixture, colori | `apps/server/src/wordhunt-domain.ts` |
| Stanza: ordine di arrivo, claim, timer, pausa, correzione, stato pubblico/admin | `apps/server/src/wordhunt.ts` |
| Store SQLite (STRICT, chiavi intere, tabelle di lookup, indice univoco parziale sul claim) | `apps/server/src/wordhunt-db.ts` |
| Dizionario delle griglie generate (parole normalizzate del DB) | `apps/server/src/wordhunt-dictionary.ts` |
| Griglia dello screenshot (§2.3–2.4) | `apps/server/src/wordhunt-fixture.json` |
| Overlay 570 × 769 scalato in modo uniforme | `apps/overlay/src/WordHunt.tsx`, `wordhunt.css` |
| Colonna di regia (round, parole nascoste, correzione, simulatore) | `apps/dashboard/src/components/WordHuntSidebar.tsx`, `useWordHuntSend.ts` |
| Test (30) | `tests/wordhunt.test.ts` |

## Come si gioca

1. In regia scegli **ZeroWordHunt**, poi *Crea round*: «Di riferimento» (le otto parole dello screenshot) o «Generata» (seme facoltativo).
2. *Avvia round*: conto alla rovescia (impostazione, 5 s) e poi round (senza limite di tempo di default, vedi sotto). Tutti i commenti della chat sono tentativi; i commenti del
   simulatore valgono come quelli veri.
3. Il round finisce quando tutte le parole sono trovate, scade il tempo o la regia preme *Termina round*.
4. Una parola presa per errore si riapre con *Riapri* e un motivo (resta nel registro). Non esiste un pulsante che assegni un vincitore.

## Differenze rispetto alla specifica

### Aiutino con i tap

In **Impostazioni gioco → Aiutino con i tap** la regia imposta il limite di parole rimaste e i tap richiesti per ciascuno scaglione, poi preme **Applica**. Si usa il primo limite che comprende il numero di parole rimaste. I valori iniziali sono 100 tap con tre parole, 60 con due e 30 con una. Con quattro o più parole l’aiutino è spento. Rimuovere tutte le righe lo disattiva anche nel finale.

Il primo indizio contorna la metà della griglia che contiene la prima lettera di un bersaglio. Il secondo restringe il bordo a quattro righe e cinque colonne nella stessa metà. Ogni passaggio richiede la soglia di tap oppure 20 secondi di gioco attivo senza ritrovamenti. Un ritrovamento o una riapertura azzera la ricerca; la pausa congela tempo e contatore. I punti seguono la normale assegnazione al primo messaggio valido. Il pulsante **Simula 10 tap** permette di provare la soglia in regia.

Quando resta una sola parola, un terzo indizio mostra la sua lunghezza e mantiene il rettangolo. Durante la ricerca l’overlay indica quanti tap mancano al prossimo indizio. Quando l’aiutino è spento, ogni 45 secondi compare per 6 secondi l’invito a scrivere una parola in chat.

### Difficoltà e tempo sull’ultima parola

In **Impostazioni gioco → Difficoltà dei round** la regia sceglie il livello di partenza. Base usa la griglia rapida da 14 parole, in orizzontale e verticale. Intermedio passa a 20 parole e aggiunge le diagonali. Avanzato usa 24 parole e permette anche le direzioni inverse. La progressione riguarda le griglie generate, sia manuali sia automatiche. Dopo Avanzato si continua allo stesso livello. La griglia di riferimento e quelle chiuse prima di giocare non consumano livelli.

Le nuove sessioni partono da Base. Le sessioni salvate con le impostazioni precedenti conservano dimensione e direzioni in modalità **Personalizzata**. In **Metriche** si leggono il tempo di gioco tra la penultima e l’ultima risposta valida del round e la media della sessione, calcolata sui round completati con almeno due parole. Le pause sono escluse.

### Regole e comportamento del round

Nella colonna sinistra, **Round → Voto sul tema** apre la votazione durante la pausa. L’overlay mostra due temi a rotazione fra Cucina, Viaggi e Natura. Ogni spettatore può scrivere **1** o **2** e cambiare scelta fino alla creazione della prossima griglia. A parità si sorteggia fra i due temi. Senza voti la griglia viene generata dal dizionario completo. Il voto si applica alle griglie generate e si può disattivare anche durante la pausa.

Al completamento di una griglia generata di livello Base, Intermedio o Avanzato, l’overlay mostra il tempo collettivo e il record della diretta per quel livello. Il tempo va dall’apertura delle risposte all’arrivo dell’ultima soluzione, escludendo le pause. Il record resta disponibile cambiando gioco e si azzera terminando la sessione o riavviando il server.

- **Protocollo:** lo stato pubblico è sempre uno snapshot completo (`wordhunt:state`) con `version` ed `eventSeq`, non una sequenza di
  eventi `WORD_CLAIMED`: un client che perde un pacchetto si riallinea al successivo. L'ordine degli eventi è comunque nel registro
  `wordhunt_events`. Non ci sono API REST: i comandi passano dal socket della regia, con `expectedVersion`, come ZeroTaboo.
- **Chat:** la voce di ZeroFollowerBot legge tutti i commenti anche durante il round (nessun `skip`, a differenza di ZeroTaboo). I commenti arrivano dal punto comune degli eventi live (connettori diretti, ponte ZeroFollowerBot, simulatore). I messaggi
  del ponte non portano qui l'id del messaggio: il `receiveSequence` è l'ordine di arrivo al server; un replay della stessa parola non
  cambia nulla perché la parola è già presa. Il buffer di riordino di 200–500 ms (opzionale) non c'è.
- **Dizionario:** le griglie generate attingono solo alla vista **`zerowordhunt`** di `database/giochi_v2.sqlite3` (tabella `zerowordhunt_parole`: `parola`, `lunghezza`, `iwfs`, `iwfs_completo`, `confidenza`, `lettere_semplici`), creata dal task VS Code **«ZeroWordHunt : Genera Parole»** (`gioco-zerowordhunt/script/genera_parole.py`, test in `test_genera_parole.py`). La tabella contiene **le parole di `normalizzata` (RAW 2.0) di almeno 4 lettere, con un IWFS di almeno 50 e con validità lessicale `VALID`** (le `REVIEW_REQUIRED`, per esempio nomi propri come «laurent», sono escluse: il dato non basta a separare i nomi dalle parole italiane rare, e le parole perse sono circa il 3,6 %) (Italian Word Familiarity Score, calcolato da «Normalizzare parole RAW»; vedi [PAROLE_RAW_2.0.md](../database/PAROLE_RAW_2.0.md#italian-word-familiarity-score-iwfs-18112026)); il RAW 2.0 si legge in sola lettura. Il server prende le parole di lettere semplici (`lettere_semplici = 1`, solo a-z) con la lunghezza delle regole (5-12): le parole di 4 lettere e quelle accentate restano nella tabella, ma non nei tabelloni. Le righe con IWFS parziale (`iwfs_completo = 0`, senza Word Prevalence) sono marcate e hanno confidenza bassa: si possono escludere con `iwfs_completo = 1`. Il task sostituisce soltanto le tabelle di ZeroWordHunt in `giochi_v2` (il resto, per esempio le segrete di ZeroContext, resta), con backup in `gioco-zeroassociations/database-backups/` e verifica riga per riga; va rieseguito dopo ogni normalizzazione, e il server legge la tabella una volta, quindi dopo averla rigenerata va riavviato (variabile `ZEROCADE_GIOCHI_V2_FILE` per un altro percorso). Il DB non è in Git né nel pacchetto Windows: senza di esso, o senza la tabella, si offre solo la griglia di riferimento.
- **Esche (non nella specifica):** la griglia generata contiene anche parole vere che non sono da indovinare: `round(0,75 × bersagli)`, al massimo 9, cioè 6 con 8 bersagli. Con 8 bersagli di ~7 lettere, 8 avatar e 6 esche di ~7 lettere le celle occupate sono circa 106 su 300 (un terzo): di più affollerebbe la griglia e renderebbe i bersagli indistinguibili per la chat. Le esche vengono dallo stesso dizionario, non stanno dentro altre parole della griglia, non toccano parole né caselle avatar; scriverne una in chat è una risposta sbagliata. Se una non trova posto si omette (mai meno bersagli). Le vede solo la regia; la griglia di riferimento non ne ha.
- **Tabellone Grande e round automatici (non nella specifica):** il round generato è il «Tabellone Grande»: la griglia 20 × 15 (righe A–T, colonne 1–15) con **24 parole**, lunghe 5–8 lettere per farci stare tutte le parole e gli avatar, più fino a 6 esche e nessun limite di tempo (impostazione «Durata massima del round», 0 = nessun limite). «Crea round» in regia genera di default la griglia (dimensione e parole dalle impostazioni); la griglia di riferimento si sceglie a mano dal menu, o è usata se il dizionario non c'è. Il primo round parte da solo 1,5 s dopo la scelta del gioco e un nuovo round parte dopo ogni round, dopo una pausa (20 s) in cui resta in vista la griglia finita con «nuovo round tra N». Le impostazioni «Round automatici» e «Pausa tra i round» lo regolano; «Chiudi» in regia lo ferma finché non si crea un round a mano o si sceglie di nuovo il gioco; pausa o gioco terminato lo sospendono. Senza dizionario si usa la griglia di riferimento. La griglia di riferimento a 8 parole resta disponibile a mano.
- **Dizionario fuori dal thread principale:** il dizionario (circa 1 s di lettura dei due DB) si legge nel worker dei rapporti, non nel server principale (DIRETTIVE: nessun lavoro sincrono lungo sull'event loop). Finché non è pronto un round manuale generato è rifiutato con «Il dizionario si sta caricando», e il round automatico aspetta (al massimo ~30 s) e poi usa la griglia di riferimento.
- **Colori della griglia (non nella specifica):** due schemi, scelti dall'ora della macchina o dall'impostazione «Colori della griglia». Sera/notte (dalle 19 alle 7): ardesia scura `#12141C`, tessere `#1C2030`, lettere `#E4E7EF` (non bianco puro, per ridurre l'abbagliamento). Giorno (dalle 7 alle 19): carta calda `#E9E3D3`, tessere `#F7F3E8`, lettere `#2B2A33` (contrasto circa 13:1). Le parole trovate tengono i loro colori con lettere nere. Con «Personalizzati» tre selettori (colore delle lettere, sfondo delle lettere, sfondo della griglia) cambiano la griglia in tempo reale, anche a round in corso; bordi e coordinate sono calcolati dai colori scelti. Le parole di riferimento della specifica (§2.2) restano nelle costanti `WORDHUNT_COLORS`.
- **Dimensione del tabellone (non nella specifica):** impostazione «Dimensione tabellone», o `size` nel comando di creazione: Rapido 13 × 15 con 14 parole, Standard 15 × 17 con 20, Grande 15 × 20 con 24 (colonne × righe; il Grande è la griglia dello screenshot, il default). Il tempo del round segue le parole in proporzione (se «Durata massima del round» è maggiore di 0 vale per 24 parole: 14 parole fanno 210 s con 360; con 0 il round non ha limite e finisce con l'ultima parola o con «Chiudi»). La griglia di riferimento è sempre 15 × 20. L'overlay ricava la superficie dalle celle (570 × 769 per 15 × 20, stessi margini per le altre).
- **Parole al contrario e in diagonale (§3.3, attive di default):** due impostazioni indipendenti. Senza opzioni: da sinistra a destra e dall'alto in basso. «Parole al contrario» aggiunge sinistra e alto; «Parole in diagonale» aggiunge le due diagonali che scendono; con entrambe attive anche le diagonali possono essere al contrario (8 direzioni). L'avatar sta sempre sul prolungamento della parola lungo la sua direzione (anche in diagonale), a una casella dall'estremo. In chat si scrive la parola normalmente, mai al contrario. Valgono dal round successivo; la griglia di riferimento non cambia.
- **Carattere delle lettere:** di default Atkinson Hyperlegible (alta leggibilità); l’impostazione «Carattere delle lettere» offre anche OpenDyslexic e lo standard (Nunito), e cambia in tempo reale.
- **Colore per utente:** ogni giocatore ha un solo colore per tutte le parole che trova e lo mantiene nei round della sessione. Il colore è scelto tra 32 (`WORDHUNT_PALETTE`; i primi 16 sono usati per primi) come il più lontano, per differenza percepita (CIE76 in Lab), da quelli già sulla griglia; due giocatori non condividono un colore sullo stesso tabellone finché la palette non è esaurita. Anche nella griglia di riferimento vale il colore dell'utente, non quello fisso di ogni parola.
- **Classifica di sessione:** il server somma i punti di tutti i round dalla scelta del gioco (`sessionLeaders`; un round chiuso a mano conta, non è salvata in database: un riavvio o una nuova scelta del gioco la azzera). Tra un round e l'altro, negli ultimi 8 secondi della pausa (`STANDINGS_MS` in `WordHunt.tsx`), l'overlay la mostra al posto della griglia, con i primi 10; la classifica piccola durante il round resta quella del solo round.
- **`!next` dei moderatori:** un moderatore (campo `moderator` del ponte ZeroFollowerBot) o lo streamer che scrive esattamente `!next` termina il round in corso, come «Termina round» (`apps/server/src/mod-commands.ts`); il comando non è mai letto come risposta.
- **Prima del round:** conto alla rovescia di 5 s (come dice la specifica; fino al 17/11/2026 era 15) e, prima di ogni round, foto NASA intera senza griglia.
- **Streamer:** i suoi messaggi non valgono (vede le soluzioni nel pannello).
- **Modalità grafiche (§5.4):** una sola vista, con timer, contatore e classifica *fuori* dal tabellone; `reference_exact` e la golden
  image non sono implementate (mancano `word_hunt_riferimento.png` e gli asset degli avatar). Le animazioni sono brevi e si spengono
  con l'impostazione o con `prefers-reduced-motion`.
- **Adapter YouTube e punteggi cumulativi per spettatore** (§8.3, §11.3): non implementati; la classifica piccola durante il round è quella del round; quella di sessione è sopra e non è per spettatore tra una sessione e l'altra.
- **Privacy:** i partecipanti sono salvati come `(piattaforma, id)` con nome e URL dell'avatar; round, tentativi e claim si cancellano dopo 90 giorni.
- Gli avatar sono caricati direttamente dall'URL del provider, con iniziale come ripiego nella stessa cella; la cache/proxy del §4.4 non c'è.

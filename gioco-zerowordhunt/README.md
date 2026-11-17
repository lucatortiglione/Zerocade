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
2. *Avvia round*: conto alla rovescia (impostazione, 5 s) e poi round (180 s). Tutti i commenti della chat sono tentativi; i commenti del
   simulatore valgono come quelli veri.
3. Il round finisce quando tutte le parole sono trovate, scade il tempo o la regia preme *Termina round*.
4. Una parola presa per errore si riapre con *Riapri* e un motivo (resta nel registro). Non esiste un pulsante che assegni un vincitore.

## Differenze rispetto alla specifica

- **Protocollo:** lo stato pubblico è sempre uno snapshot completo (`wordhunt:state`) con `version` ed `eventSeq`, non una sequenza di
  eventi `WORD_CLAIMED`: un client che perde un pacchetto si riallinea al successivo. L'ordine degli eventi è comunque nel registro
  `wordhunt_events`. Non ci sono API REST: i comandi passano dal socket della regia, con `expectedVersion`, come ZeroTaboo.
- **Chat:** la voce di ZeroFollowerBot legge tutti i commenti anche durante il round (nessun `skip`, a differenza di ZeroTaboo). I commenti arrivano dal punto comune degli eventi live (connettori diretti, ponte ZeroFollowerBot, simulatore). I messaggi
  del ponte non portano qui l'id del messaggio: il `receiveSequence` è l'ordine di arrivo al server; un replay della stessa parola non
  cambia nulla perché la parola è già presa. Il buffer di riordino di 200–500 ms (opzionale) non c'è.
- **Dizionario:** le griglie generate attingono alle parole **normalizzate** del DB (`parole_ita_raw_2.0.sqlite3`, tabella `normalizzata`, solo parole singole), ridotte a quelle che la chat può indovinare: lettere semplici, da 5 a 12, presenti anche nel DB dei giochi con livello `main` e Zipf ≥ 3,0 (circa 16.700 parole). Il DB raw non è in Git né nel pacchetto Windows: lì si usa il solo DB dei giochi (`giochi.sqlite3`, schema `parole`). Senza nessuno dei due si offre solo la griglia di riferimento.
- **Esche (non nella specifica):** la griglia generata contiene anche parole vere che non sono da indovinare: `round(0,75 × bersagli)`, al massimo 9, cioè 6 con 8 bersagli. Con 8 bersagli di ~7 lettere, 8 avatar e 6 esche di ~7 lettere le celle occupate sono circa 106 su 300 (un terzo): di più affollerebbe la griglia e renderebbe i bersagli indistinguibili per la chat. Le esche vengono dallo stesso dizionario, non stanno dentro altre parole della griglia, non toccano parole né caselle avatar; scriverne una in chat è una risposta sbagliata. Se una non trova posto si omette (mai meno bersagli). Le vede solo la regia; la griglia di riferimento non ne ha.
- **Tabellone Grande e round automatici (non nella specifica):** il round generato è il «Tabellone Grande»: la griglia 20 × 15 (righe A–T, colonne 1–15) con **24 parole**, lunghe 5–8 lettere per farci stare tutte le parole e gli avatar, più fino a 6 esche, durata 360 s e 14 colori. Il primo round parte da solo 1,5 s dopo la scelta del gioco e un nuovo round parte dopo ogni round, dopo una pausa (20 s) in cui resta in vista la griglia finita con «nuovo round tra N». Le impostazioni «Round automatici» e «Pausa tra i round» lo regolano; «Chiudi» in regia lo ferma finché non si crea un round a mano o si sceglie di nuovo il gioco; pausa o gioco terminato lo sospendono. Senza dizionario si usa la griglia di riferimento. La griglia di riferimento a 8 parole resta disponibile a mano.
- **Dizionario fuori dal thread principale:** il dizionario (circa 1 s di lettura dei due DB) si legge nel worker dei rapporti, non nel server principale (DIRETTIVE: nessun lavoro sincrono lungo sull'event loop). Finché non è pronto un round manuale generato è rifiutato con «Il dizionario si sta caricando», e il round automatico aspetta (al massimo ~30 s) e poi usa la griglia di riferimento.
- **Colori della griglia (non nella specifica):** due schemi, scelti dall'ora della macchina o dall'impostazione «Colori della griglia». Sera/notte (dalle 19 alle 7): ardesia scura `#12141C`, tessere `#1C2030`, lettere `#E4E7EF` (non bianco puro, per ridurre l'abbagliamento). Giorno (dalle 7 alle 19): carta calda `#E9E3D3`, tessere `#F7F3E8`, lettere `#2B2A33` (contrasto circa 13:1). Le parole trovate tengono i loro colori con lettere nere. Le parole di riferimento della specifica (§2.2) restano nelle costanti `WORDHUNT_COLORS`.
- **Dimensione del tabellone (non nella specifica):** impostazione «Dimensione tabellone», o `size` nel comando di creazione: Rapido 13 × 15 con 14 parole, Standard 15 × 17 con 20, Grande 15 × 20 con 24 (colonne × righe; il Grande è la griglia dello screenshot, il default). Il tempo del round segue le parole in proporzione (l'impostazione «Secondi per round» vale per 24: 14 parole fanno 210 s). La griglia di riferimento è sempre 15 × 20. L'overlay ricava la superficie dalle celle (570 × 769 per 15 × 20, stessi margini per le altre).
- **Prima del round:** conto alla rovescia di 15 s (la specifica dice 5) e, prima di ogni round, foto NASA intera senza griglia.
- **Streamer:** i suoi messaggi non valgono (vede le soluzioni nel pannello).
- **Modalità grafiche (§5.4):** una sola vista, con timer, contatore e classifica *fuori* dal tabellone; `reference_exact` e la golden
  image non sono implementate (mancano `word_hunt_riferimento.png` e gli asset degli avatar). Le animazioni sono brevi e si spengono
  con l'impostazione o con `prefers-reduced-motion`.
- **Adapter YouTube e punteggi cumulativi per spettatore** (§8.3, §11.3): non implementati; la classifica è quella del round.
- **Privacy:** i partecipanti sono salvati come `(piattaforma, id)` con nome e URL dell'avatar; round, tentativi e claim si cancellano dopo 90 giorni.
- Gli avatar sono caricati direttamente dall'URL del provider, con iniziale come ripiego nella stessa cella; la cache/proxy del §4.4 non c'è.

# Zerocade

Giochi per le dirette su TikTok e Twitch: la chat gioca scrivendo, e regali, like e follow fanno succedere
cose nel gioco. Zerocade gira sul PC di chi fa la diretta:

- il **server** riceve la chat e gli eventi della diretta e tiene punteggi e classifiche;
- l'**overlay** è la pagina che OBS o TikTok LIVE Studio mostrano come sorgente browser: lì si vede il gioco;
- la **dashboard** è la regia: si sceglie il gioco, si regolano le impostazioni, si guidano i round.

## Avvio

Serve Node.js 26 o più recente.

```
npm install
npm run dev           server, dashboard e overlay in sviluppo (dashboard su http://localhost:5173)
npm start             costruisce dashboard e overlay e avvia il server: http://localhost:3001
npm run package:win   pacchetto Windows autonomo in release/, con Node.js incluso
```

Nell'uso normale l'overlay va aggiunto una volta sola come sorgente browser con il link
`http://zerocade.test:3001/overlay/`, 1080 × 1920 oppure 1920 × 1080. `zerocade.test` esiste solo su quel PC:
al primo avvio il server lo aggiunge al file hosts, chiedendo il permesso di amministratore. Il pacchetto Windows ha un `LEGGIMI.txt` che spiega tutto
l'uso, gioco per gioco (`scripts/package-win.mjs`).

La chat arriva da TikTok (tiktok-live-connector), da Twitch (tmi.js) oppure da ZeroFollowerBot sullo stesso PC.

Accanto allo stato di ZeroFollowerBot, **Ritenta connessione** annulla l'attesa
o il tentativo in corso e riprova subito sulla porta configurata. Quando il
ponte è collegato, lo stesso pulsante diventa **Ricollega**. È disponibile
nei controlli dei giochi e nella pagina delle sorgenti, con il ponte acceso;
i tentativi automatici continuano dopo un errore.

## I giochi

Sette giochi hanno una cartella propria, con i dati e gli strumenti per prepararli:

| Gioco | Cartella | In breve |
| --- | --- | --- |
| 🔗 **ZeroAssociazioni** | [gioco-zeroassociations](gioco-zeroassociations/README.md) | Una parola in vista e 7 o 8 parole collegate nascoste: la chat le indovina una a una |
| ⛓️ **ZeroReazioniACatena** | [gioco-zerocatene](gioco-zerocatene/README.md) | Catene di parole associate, in tre modalità che si danno il cambio |
| 🎯 **ZeroContext** | [gioco-zerocontext](gioco-zerocontext/README.md) | Ogni parola in chat riceve una posizione per vicinanza di significato a quella segreta |
| 🟩 **ZeroWordle** | [gioco-zerowordle](gioco-zerowordle/README.md) | La chat indovina insieme una parola di 5–8 lettere, con le tessere verdi, oro e grigie |
| 🌱 **ZeroWords** | [gioco-parole](gioco-parole/README.md) | Ruota di lettere e schema a incastro, livelli senza fine generati durante la partita |
| 🧠 **ZeroQuizz** | [gioco-quizzland](gioco-quizzland/README.md) | Quiz di scienze, curiosità e cultura su 26.000 domande, risposta A, B, C o D |
| 🔀 **ZeroDubbi** | [gioco-dilemmi](gioco-dilemmi/README.md) | «Preferiresti…?»: il pubblico vota A o B |

Gli altri giochi sono solo codice dell'overlay (`apps/overlay/src/games`); quelli che hanno bisogno di
contenuti (parole, domande, temi) li prendono dallo schema `contenuti` di `database/giochi.sqlite3`.

| Gioco | Genere | In breve |
| --- | --- | --- |
| 🎁 Gift Drop | Arcade | I regali cadono nell'arena e si ammucchiano: più grande il regalo, più grande la palla |
| 🥊 MMA Clash | Combattimento | Il pubblico sceglie l'angolo rosso o blu e con i regali sferra i colpi: vince il round chi resta in piedi |
| 🌙 Lunar Dash | Corsa infinita | I like fanno saltare, i regali danno potenziamenti, i commenti creano ostacoli |
| 🧠 Memory Maestro | Arcade | Una sequenza di numeri da memorizzare in pochi secondi e riscrivere in chat |
| ❓ Trivia | Quiz | Domande a scelta multipla: si risponde A, B, C o D |
| ⏱️ Trivia Time | Quiz | Quiz a quattro risposte con classifica, bonus velocità e aiuto 50/50 |
| ⚡ Quiz Blitz | Quiz | Quiz rapidissimo: chi risponde in fretta prende il bonus velocità |
| 💎 Million Quiz | Quiz | Il pubblico vota A/B/C/D e la risposta della maggioranza sale la scala dei premi |
| ✅ True or False | Quiz | Vero o falso, con la spiegazione alla rivelazione |
| 🔤 Word Guess | Quiz | La parola nascosta si indovina intera o lettera per lettera |
| 🌀 Word Swipe | Quiz | Una ruota di lettere: vale ogni parola che si riesce a formare |
| 🌍 Words of Wonders: Guru | Quiz | Tutte le parole nascoste nelle lettere, per completare lo schema |
| 🖼️ 4 Pics 1 Word | Quiz | Quattro immagini, una parola in comune |
| 🧩 Picwords 2 | Quiz | Un'immagine, le parole che fa venire in mente |
| 🔎 Find the Word | Quiz | Il prefisso della parola nascosta cresce a ogni tentativo |
| 🔡 Word Hunt | Quiz | Parole nascoste in una griglia di lettere |
| ✖️ Word Cross | Quiz | Un cruciverba costruito da un insieme di lettere |
| 🏷️ Guess the Logo | Quiz | Il logo si svela poco a poco: si indovina il marchio |
| 🗺️ Guess the Location | Quiz | Un panorama stilizzato e qualche indizio: si indovina il paese (e la città) |
| 🎨 Guess the Drawing | Quiz | Un disegno tracciato colpo dopo colpo |
| 🔗 Associations | Quiz | Una parola e tante parole associate nascoste |
| 🔠 Connect Word | Quiz | Una griglia di lettere con parole nascoste |
| 🌐 Cross World | Quiz | Un cruciverba di parole che si incrociano |
| 🔤 Crostic | Quiz | Le prime lettere delle risposte formano la frase nascosta |
| 🧩 Crucintarsio | Quiz | Cruciverba all'italiana, con Orizzontali e Verticali |
| 🔀 Palora | Quiz | Lettere mescolate da rimettere in ordine |
| 🗣️ Parole Popolari | Quiz | Un tema e le risposte più popolari da indovinare |
| 🃏 Parole Solitario | Quiz | Una catena di parole associate: si indovina la prossima per avanzare |
| 📿 Perle Parole | Quiz | Le lettere sono perle in cerchio: si trova la parola |
| 🧊 Ruzzle | Quiz | Una griglia 4 × 4: più parole possibile prima che scada il tempo |
| 7️⃣ Top 7 | Quiz | Un tema, sette risposte da trovare |
| ❓ Wild Words | Quiz | Una parola con una lettera nascosta da completare |
| ➕ Word Merge | Quiz | Due metà di una parola da unire |

In ogni gioco con dei round, alla fine di ciascuno l'overlay fa sentire un applauso
(`audio/dragon-studio-crowd-cheer-406646.mp3`); l'impostazione «Applauso a fine round» lo spegne.

Dietro i giochi può esserci la foto NASA del giorno, una delle ultime «Image of the Day», che cambia ogni pochi minuti:
- nei giochi su canvas è lo sfondo di base («Sfondo» nel gruppo Aspetto);
- in ZeroWords è lo sfondo di base, una foto per livello;
- in ZeroQuizz e ZeroDubbi si sceglie nelle impostazioni dello sfondo.

Lunar Dash e Guess the Location ne restano senza, perché la loro scena occupa tutto lo schermo
(`apps/overlay/src/NasaBackdrop.tsx`).

## I dati

- **`database/giochi.sqlite3`**, in Git: i contenuti dei giochi di parole e degli altri giochi dell'overlay, uno
  schema per gioco. Vedi [database/README.md](database/README.md).
- **`database/ZeroQuizz.sqlite3`**, in Git: le domande e le risposte di ZeroQuizz, un DB a sé.
- **`database/parole_ita_raw.sqlite3`**, fuori da Git (2,3 GB): il DB di lavoro di ZeroAssociazioni, con la
  raccolta delle parole italiane da cui nascono anche le parole di ZeroWordle e ZeroContext.
- [database/DB.md](database/DB.md) spiega ogni file e il percorso di una parola dalla raccolta al gioco.
- I dati della diretta (sessioni, eventi, classifiche, voti) stanno in `apps/server/data/zerocade.db`, sul PC.

## Struttura

| Cartella | Contenuto |
| --- | --- |
| `apps/server` | Il server: Fastify e Socket.IO, SQLite (better-sqlite3), collegamento a TikTok e Twitch, generatore dei livelli di ZeroWords |
| `apps/overlay` | L'overlay (React e canvas): i giochi in `src/games`, ZeroDubbi, ZeroQuizz e ZeroWords come pagine a sé |
| `apps/dashboard` | La dashboard di regia (React) |
| `packages/shared` | Catalogo dei giochi, impostazioni, tipi e regole comuni a server e overlay |
| `packages/browser-runtime` | Socket.IO nei Web Worker di dashboard e overlay, richieste HTTP limitate e notifiche per frame |
| `database` | Il DB dei giochi e gli strumenti per costruirlo e verificarlo |
| `gioco-*` | Dati e strumenti dei sette giochi con una cartella propria |
| `audio` | I suoni dell'overlay |
| `scripts` | Il pacchetto Windows e la manutenzione |
| `tests` | I test di server e overlay |

## Controlli

L'infrastruttura usa due thread Node dedicati a persistenza e report. Il server mantiene il coordinamento
della diretta; ogni dashboard e overlay usa un Web Worker per la connessione Socket.IO. DOM, React e canvas
restano sul thread dell'interfaccia. Questa revisione non parallelizza gli algoritmi dei giochi.

Code, deadline, compatibilità, prove e limiti sono descritti nell'[audit delle direttive](docs/DIRETTIVE-audit-2026-11-14.md).
`GET /api/live` indica che il processo risponde; `GET /api/health` mostra disponibilità dei worker,
saturazione, memoria e latenze. Un problema di persistenza appare anche nella dashboard: un evento ricevuto
non viene presentato come salvato se manca la conferma. Gli export CSV rifiutano risultati oltre
50.000 righe o il budget di 16 MiB; non restituiscono un file troncato.

Per EventSub Twitch servono `TWITCH_CLIENT_ID` e `TWITCH_USER_ACCESS_TOKEN`, un **token utente** della stessa app.
I follow richiedono lo scope `moderator:read:followers` e un utente autorizzato come moderatore del canale.
La chat funziona anche senza EventSub. Il token si configura nell'ambiente del processo e si sostituisce
quando scade o viene revocato; non c'è un flusso interattivo di rinnovo OAuth. Le prove locali usano fixture,
non un account Twitch reale.

```
npm run typecheck                           TypeScript di server, overlay, dashboard e shared
node --import tsx --test tests/*.test.ts    test di server e overlay
npm run test:associations                   test di ZeroAssociazioni
python -m unittest discover -s database/script     test del DB dei giochi
python database/script/giochi.py verify            confronta ogni schema di giochi.sqlite3 con la sua origine
node scripts/check-infrastructure.mjs              confini tra app e pattern di credenziali nel sorgente
node scripts/smoke-runtime.mjs                     avvio isolato del server sorgente
node scripts/smoke-runtime.mjs --bundle            avvio isolato dei bundle Node e worker
node --import tsx scripts/benchmark-infrastructure.ts   confronto SQLite sul main e nel worker (DB temporanei)
```

Backup del database operativo, senza sovrascrivere una destinazione esistente:
`node scripts/backup-live.mjs apps/server/data/zerocade.db C:\Backup\zerocade-2026-11-14.db`.
Lo script include il WAL confermato e verifica `integrity_check`. Per un backup completo, fermare il server
e copiare anche `pads/` e `backgrounds/` dalla stessa cartella dati. Per ripristinare, fermare Zerocade,
conservare la cartella dati attuale e ripristinare database e media della stessa copia: non sostituire un
database aperto né associarlo ai vecchi file `-wal` e `-shm`.

## Crediti

- Lessico di ZeroWords: Morph-it! di M. Baroni ed E. Zanchetta (CC BY-SA 2.0) e frequenze wordfreq
  (CC BY-SA 4.0); lessico e livelli di ZeroWords sono CC BY-SA ([gioco-parole/lexicon/it/SOURCE](gioco-parole/lexicon/it/SOURCE)).
- Domande di ZeroQuizz, tradotte in italiano: Open Trivia Database e AI2 Reasoning Challenge (CC BY-SA 4.0), The Trivia
  API (CC BY-NC 4.0), OpenBookQA (licenza non nota) e API Ninjas (solo uso personale). Licenze e condizioni sono nelle
  cartelle di [gioco-quizzland/data/fonti](gioco-quizzland/data/fonti); [gioco-quizzland/README.md](gioco-quizzland/README.md)
  spiega quali vanno decise prima di una diretta monetizzata.
- ZeroContext usa i vettori fastText italiani `cc.it.300` (`gioco-zerocontext/script/fetch_vectors.py`).
- Le foto di sfondo sono le «Image of the Day» della NASA, scaricate durante la partita.

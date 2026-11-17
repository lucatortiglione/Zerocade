# Adeguamento dei sorgenti e dei giochi a DIRETTIVE.md 2.6

> **Revisione documentale — 16 novembre 2026.** Rapporto storico del 15 novembre rispetto alle direttive 2.6. La versione normativa corrente — [2.9](../DIRETTIVE.md). Pubblicazione, ricaricamento del corpus e controllo della lunghezza in ZeroContext sono descritti nel [README aggiornato](../gioco-zerocontext/README.md); richiedono verifiche proprie oltre agli esiti storici sotto.
> [Indice e stato della documentazione](STATO_DOCUMENTAZIONE.md).

Verifica del 15 novembre 2026, workspace con base `3a70b27`, pacchetti `0.1.0`.
Prosegue l'[audit infrastrutturale](DIRETTIVE-audit-2026-11-14.md) includendo
i punti di ingresso dei giochi e gli strumenti dei contenuti interessati.

Il workspace contiene anche modifiche concorrenti al torneo e al vocabolario
ZeroContext, che sono state conservate. La suite generale verifica il working tree condiviso,
non un commit isolato o una CI eseguita su GitHub. Questo intervento non attesta
una revisione riga per riga di ogni sorgente del repository.

## Correzioni e direttive applicate

- **Motore comune dei giochi canvas — §3, §5, §7, §9.** Le vecchie code
  eliminavano silenziosamente azioni o comandi. Ora numero, peso e partecipanti
  hanno limiti verificati prima dell'accumulo; la saturazione è esplicita.
  Un errore in un gioco chiude le sue risorse, mostra il problema e permette
  di selezionarne un altro. `start()` è idempotente. Un callback che cambia
  gioco non consegna al successore gli eventi del frame precedente.
- **ZeroWordle — §2, §5, §7.** Richieste possedute dall'istanza, cancellazione
  e revisione dei risultati. La nuova soluzione della stanza invalida subito
  il vecchio round anche durante il download: nessun punto sulla soluzione
  precedente. La pausa trattiene il risultato puro; reset e chiusura invalidano
  le risposte tardive.
- **ZeroReazioniACatena — §2, §3, §5, §7.** Stessa disciplina di proprietà,
  parser della banca e tentativi finiti. Una manche ricevuta prevale sul
  caricamento precedente. Una banca delle parole chiave vuota permette il
  ripiego su una catena disponibile.
- **Banche dei giochi — §2, §3, §7, §10.** Trasporto comune con limite
  cumulativo, deadline e validazione prima dell'uso. I contenuti generici
  restano caricati una sola volta; un osservatore che fallisce non impedisce
  la notifica agli altri.
- **ZeroWords — §2, §3, §5, §7.** Worker con coda e memoria limitate, deadline
  e chiusura. Richieste dello stesso livello condividono una promessa.
  Messaggi, errori e uscite di un vecchio worker non cancellano il sostituto.
  Il sorgente usa il bootstrap TypeScript già impiegato dall'infrastruttura;
  il bundle usa il worker compilato.
- **Dati ZeroWords — §1, §3, §7, §8.** Lo schema assente permette il fallback
  legacy; uno schema presente ma non verificato o malformato genera un errore,
  senza sostituire silenziosamente il lessico. Lettura incrementale e validata.
  Corretti i riferimenti alla curva spostata da `tools` a `script`.
- **ZeroDubbi, ZeroQuizz e ZeroWords sul server — §3, §5, §7, §9.** Limite
  dei partecipanti prima di aggiungere voti, punteggi o cronologie; gli utenti
  già ammessi continuano. Il rifiuto dei nuovi utenti viene segnalato una volta
  alla regia. Lo shutdown dispone tutte le stanze, anche quando una chiusura
  fallisce, prima di chiudere il database.
- **Avatar dei giochi — §3.** Cache LRU limitata, riuso delle immagini recenti,
  cancellazione del caricamento all'espulsione e limite alla lunghezza degli URL.
- **Code comuni — §3, §5.** Il budget conta buffer, backing store delle viste,
  Map e Set; visita iterativa e arresto al limite, senza costruire prima una
  lista di tutte le proprietà. Riferimenti condivisi contati una volta.
- **Worker infrastrutturali — §5, §7, §8.** Chiusure simultanee condividono
  un solo drain delle scritture già accettate.
- **SQLite degli strumenti — §2, §7, §8.** Chiusura anche in errore, URI
  codificati correttamente e introspezione dello snapshot allegato. Export
  verificato su file temporaneo e pubblicato senza sovrascrivere il destinatario;
  nessun DB parziale in caso di fallimento.
- **ZeroAssociazioni — §1, §2, §8, §11, §12.** Tassonomia JSON con provenienza
  Git e impronta del blob originale: 172 record conservati campo per campo.
  Lettore condiviso da archivio e validatore, con gli stessi controlli su ID e
  cluster. La CLI accetta ancora un CSV esplicito. Sistemate le connessioni non
  chiuse nei test del DB unico.
- **Controllo sorgenti — §2, §10, §11.** La scansione degli import tra app e
  dei pattern noti di credenziali include ora anche i giochi, prima esclusi.

## Limiti e compatibilità

| Risorsa | Limite e comportamento |
| --- | --- |
| Engine canvas | 300 azioni, 10 comandi, 256 KiB di peso logico della coda, 10.000 partecipanti per istanza; overflow esplicito |
| Giochi gestiti dal server | 10.000 partecipanti per stanza/partita; avviso alla regia tramite `runtime:issue`, componente additivo `game` |
| Banche Wordle/Catene | 2 MiB per risposta, 10 s per richiesta, tre tentativi per banca con almeno 10 s tra i fallimenti |
| Generatore ZeroWords | 8 livelli distinti in attesa, 30 s per richiesta, cache di 24 livelli; errore/scadenza risolvono le attese e chiudono il worker |
| Memoria del generatore | Heap old-generation 512 MiB, young-generation 32 MiB, stack 4 MiB |
| Lessico ZeroWords | Massimo 500.000 voci, livelli `main`/`extra`, forma e frequenza verificate; file legacy fino a 16 MiB, metadati fino a 1 MiB |
| Blocklist ZeroWords | Massimo 10.000 voci da 128 caratteri; file legacy fino a 1 MiB; commenti e righe vuote ignorati |
| Avatar | Massimo 256 immagini conservate, URL fino a 4.096 caratteri |

Selezionare nuovamente un gioco crea una nuova istanza con un nuovo insieme
di partecipanti. I retry riguardano caricamenti puri: non ripetono punti o
scritture. Budget logici e limiti V8 non garantiscono un tetto assoluto alla RSS:
immagini decodificate, SQLite e memoria nativa hanno costi distinti.

Questo intervento non esegue rigenerazioni delle soluzioni, dei vettori o dei
contenuti SQLite dei giochi; gli altri lavori nel workspace possono aggiornarli.
Nessuna libreria esterna è stata aggiornata. La
tassonomia JSON riproduce il CSV del commit `20660a0`: conversione confrontata
campo per campo, provenienza e SHA-256 conservati, 172 categorie e 16 cluster.

## Verifiche realmente eseguite

Windows x64, Node `v26.13.1`, Python di sistema `3.15.2`; suite ZeroAssociazioni
nell'ambiente Python `3.13` già presente in quella cartella.

| Comando/prova | Esito |
| --- | --- |
| `npm run typecheck` | Tutti i workspace superati |
| `node --import tsx --test tests/*.test.ts` | 190 test superati, zero falliti o saltati; comprende il torneo in lavorazione |
| `python -I -B -W error::ResourceWarning -m unittest discover -s database/script` | 20 test superati; nessun avviso di connessione non chiusa |
| `python -I -B -m unittest discover -s gioco-zerocontext/script` | 23 test superati |
| `npm run test:associations` | 197 test Python e 12 test Node superati; le 12 prove Node sono già nella suite generale |
| `npm run build` | Dashboard e overlay compilati; resta l'avviso sul chunk overlay oltre 500 kB, senza alzare la soglia |
| `node scripts/check-infrastructure.mjs` | 155 sorgenti controllati nell'esecuzione finale; nessuna violazione rilevata dai pattern implementati |
| `node scripts/smoke-runtime.mjs` e `--bundle` | Avvii isolati, readiness, limiti HTTP, cancellazione upload, Socket.IO, persistenza confermata e shutdown superati |
| `npm audit --omit=dev` | Zero vulnerabilità note riportate |
| `git diff --check` | Nessun errore di whitespace |

Le regressioni esercitano saturazione, reset, pausa, cambio gioco, risposte
tardive, guasto del worker sostituito, scadenza, chiusura concorrente, export
fallito, URI con caratteri speciali, compatibilità CSV/JSON e cache degli avatar.
Eseguito anche il generatore reale di ZeroWords con lessico reale e thread
nativo, verificando livello prodotto e riuso del risultato.

Canvas e immagini controllati verificano lifecycle e cache, non la resa visuale
di un browser. Non eseguiti live Twitch/TikTok reali, verifica visuale in OBS,
soak di ore o GitHub CI. Il pacchetto installato non è stato sostituito. Questi
risultati non certificano ogni caso possibile o ogni script del repository.

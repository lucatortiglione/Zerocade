# ZeroTaboo — Guida operativa per l'agente che scrive il codice

**Destinatario:** l'agente AI di programmazione che implementerà ZeroTaboo nel repository `C:\Progetti\Zerocade`.
**Data:** 17 novembre 2026 (aggiornata a implementazione conclusa: le decisioni dell'utente sono in [§14](#s14), la mappa del codice scritto in [Appendice B](#sb)). **Fonti normative:** [DIRETTIVE.md](../DIRETTIVE.md) («Software Engineering Standards — ZeroCade — Versione 2.9») e [ZEROTABOO.md](ZEROTABOO.md) («Taboo: Stream & Meme Edition — Regolamento e mazzo v3.0»).
**Natura del file:** manuale d'uso, non specifica normativa. Ogni volta che questa guida e una fonte divergono, vale la fonte (vedi [§0.3](#s0)).

Legenda usata in tutto il documento:

| Marca | Significato |
| --- | --- |
| **[REGOLA]** | Obbligatoria. Viene da DIRETTIVE o ZEROTABOO, con la sezione citata. Non si deroga senza un'eccezione documentata (DIRETTIVE §0). |
| **[RACC]** | Raccomandazione di progetto di questa guida. Seguila; se scegli diversamente, scrivi il motivo nel piano e nel resoconto. |
| **[VERIFICA]** | Fatto da controllare nel repository prima di usarlo: il codice può essere cambiato dopo il 17/11/2026. |
| **[DECIDERE]** | Punto che era ambiguo o non deciso. Quasi tutti sono ora risolti: la risposta dell'utente è in [§14](#s14); i punti ancora aperti sono marcati lì «da confermare». |
| **[FATTO]** | Scelta già implementata nel repository (percorso in [Appendice B](#sb)). Una guida non è un contratto: se il codice diverge, vale il codice e va corretta la guida. |

Citazioni: «ZEROTABOO §3.5» indica la sezione 3, punto numerato 5 del regolamento; «DIRETTIVE §6» indica la sezione 6
di `DIRETTIVE.md`; le parole tra «» dopo il numero sono il titolo della voce citata.

## Indice

0. [Come usare questa guida](#s0)
1. [Fatti verificati nel repository](#s1)
2. [Mappa requisito → direttiva](#s2)
3. [Protocollo obbligatorio per agenti AI applicato a ZeroTaboo](#s3)
4. [Architettura proposta](#s4)
5. [Traduzione delle regole in codice](#s5)
6. [Modello dati e persistenza](#s6)
7. [Asincronia, timer e resilienza](#s7)
8. [Osservabilità e sicurezza](#s8)
9. [Test e verifica](#s9)
10. [TypeScript, Node, React e Python: regole con esempi](#s10)
11. [Piano di lavoro a fasi](#s11)
12. [Definition of Done e modello di resoconto](#s12)
13. [Errori tipici da evitare](#s13)
14. [Decisioni: risposte dell'utente e punti ancora aperti](#s14)
- [Appendice A — Casi di prova ricavati dal mazzo](#sa)
- [Appendice B — Mappa di ciò che è stato implementato](#sb)

---

<a id="s0"></a>
## 0. Come usare questa guida

### 0.1 Scopo

Questa guida ti dice **come** scrivere ZeroTaboo dentro Zerocade: quali file creare, quali contratti rispettare, quali
regole del gioco diventano quale codice, quali test dimostrano che funziona, cosa non fare. Le scelte marcate [RACC] sono
già prese per farti risparmiare tempo; quelle marcate [DECIDERE] richiedevano la risposta dell'utente (ora in
[§14](#s14)); quelle marcate [FATTO] sono già nel codice.

### 0.2 Ordine di lettura

1. Questa guida, sezioni 0–4 e 14 (decisioni) e l'Appendice B (cosa esiste già).
2. `gioco-zerotaboo/ZEROTABOO.md` **per intero** (302 righe): è il regolamento.
3. `DIRETTIVE.md` per intero (1026 righe); rileggi con attenzione §0, §1, §2, §5, §6, §7, §8, §9, §10, §11, §13, §14, §15, §16
   e l'appendice SQLite.
4. Il codice di riferimento elencato in [§1](#s1), nell'ordine della tabella.
5. `docs/DIRETTIVE-audit-2026-11-14.md` e `docs/DIRETTIVE-sorgenti-giochi-2026-11-15.md`: limiti già adottati dal
   progetto (code, partecipanti, avatar, deadline) e verifiche storiche. Gli esiti lì riportati **non** sono la baseline
   del tuo lavoro (DIRETTIVE §16).
6. Poi il resto di questa guida, sezione per sezione, mentre lavori.

### 0.3 Gerarchia delle fonti e conflitti

- **[REGOLA]** `DIRETTIVE.md` prevale su **come** si scrive il codice: architettura, concorrenza, persistenza, sicurezza,
  test, consegna. Al suo interno, «dove c'è un conflitto vale la regola più rigida» (DIRETTIVE §16).
- **[REGOLA]** `ZEROTABOO.md` prevale su **cosa** fa il gioco: regole, numeri, soglie, esiti, dati minimi.
- Questa guida è subordinata a entrambe. Se trovi una contraddizione tra la guida e una fonte, segui la fonte e segnala
  la riga della guida da correggere.
- **[REGOLA]** Se DIRETTIVE e ZEROTABOO sembrano in conflitto, o se il regolamento è ambiguo, **fermati su quel punto**:
  scrivi nel piano le due citazioni, le opzioni e la tua proposta, chiedi all'utente e prosegui solo sulle parti non
  coinvolte (DIRETTIVE §1 «Criteri di accettazione», §14 Fase A). Non risolvere in silenzio, non scegliere il
  comportamento «più comodo» da implementare.
- Le tensioni emerse sono elencate in [§14](#s14) con la risposta dell'utente. Quelle che hanno modificato il regolamento
  alla lettera: plurali nelle risposte (D1), ordine di arrivo contro ordine di scrittura (D2), definizione di «più ipotesi
  distinte» (D4), Taboo visibili al pubblico (D26, deroga a ZEROTABOO §3.2 e §12.2).

### 0.4 Stato (17/11/2026)

- **Le fasi 0–7 di [§11](#s11) sono completate** (dettaglio e verifiche in `gioco-zerotaboo/TODO.md`; mappa dei file in
  [Appendice B](#sb)). Questa guida resta utile per **manutenzione ed estensioni**: chi modifica ZeroTaboo la legge per
  i vincoli e per le ragioni delle scelte; chi la usava per partire da zero trova le decisioni già prese in [§14](#s14).
- Le sezioni 1–13 sono state scritte **prima** del codice: dove descrivono «da creare» o «proposta», il file esiste ora e
  fa fede il codice. Le divergenze note dal piano sono elencate in [§14.3](#s14).
- `gioco-zerotaboo/` e i file `taboo-*` risultano non tracciati in Git: **nessun commit è stato fatto** (il working tree
  contiene anche lavori di altre sessioni).
- **Non verificato**: la resa a schermo di overlay, vista streamer e regia (browser, OBS, TikTok LIVE Studio); il pacchetto
  Windows non è stato generato; nessuna partita giocata con ZeroFollowerBot reale (solo ponte finto e server vero).
- Il working tree contiene molte modifiche non committate di altri lavori. **[REGOLA]** Non includerle nei tuoi commit e
  non annullarle (DIRETTIVE §16 «Versioning e flusso di lavoro»). Altri agenti possono lavorare in parallelo: prima di
  modificare un file esistente rileggilo subito prima della modifica.

---

<a id="s1"></a>
## 1. Fatti verificati nel repository

Tutti i percorsi e i nomi qui sotto sono stati controllati il 17/11/2026 con lettura diretta dei file. **[VERIFICA]**
ricontrollali all'inizio del lavoro: righe e firme possono essere cambiate.

| Cosa | Dove | Perché ti serve |
| --- | --- | --- |
| Catalogo dei giochi | `packages/shared/src/index.ts`: `GameDef`, `GAME_DEFS` (privato), `GAMES` (aggiunge `COMMON_SETTINGS`, sfondo NASA salvo `OWN_BACKGROUND`, `ROUND_CHEER` salvo `WITHOUT_ROUNDS`, interruttori «Aiuti dal pubblico» se un'azione ha `help: true`) | Qui registri ZeroTaboo |
| Contratto Socket.IO | stesso file: `ServerToClientEvents`, `ClientToServerEvents`, `SessionState`, `Viewer`, `LiveEvent` | Eventi `taboo:*` nuovi |
| Regole come costanti congelate | `packages/shared/src/contextTournament.ts`: `TOURNAMENT_RULES = Object.freeze({...})` | Modello per `TABOO_RULES` |
| Chi può giocare | `allowedToPlay` in `packages/shared/src/index.ts`: lo streamer (`host: true`) è **sempre** ammesso | In ZeroTaboo l'host va escluso dalle risposte ([§4.4](#s4)) |
| Normalizzazioni esistenti | `answerKey`, `guessKey`, `inflections` in `packages/shared/src/wordAssociation.ts`; `fold` in `packages/shared/src/contextRanking.ts` | Da conoscere; **non** riusarle così come sono ([§5.2](#s5)) |
| Server: un gioco gestito dal server | `apps/server/src/quizzland.ts` (`QuizzlandRoom`, `QuizzlandRooms` con `open/get/close/closeAll`, emissioni coalescenti ogni 200 ms) | Struttura delle stanze |
| Server: torneo ZeroContext | `apps/server/src/context-tournament.ts` (`ContextTournaments`, `TournamentDeps` con `now/setTimer/clearTimer/random` iniettabili, `offer()` con deduplica per `platform:messageId`, `MAX_CANDIDATES`, `bridgeChanged()` che sospende, `sanitizeTournamentCommand` con `expectedVersion`) | Modello per ingresso chat, deduplica, sospensione, comandi idempotenti |
| Store SQLite testabile | `apps/server/src/context-tournament-db.ts`: `ContextTournamentStore` riceve `db` nel costruttore, crea lo schema con `CREATE ... IF NOT EXISTS`, tabella `context_tournament_audit` | Modello per `TabooStore` |
| Punteggi puri | `apps/server/src/context-tournament-scoring.ts` | Modello per il riduttore dei punti |
| Orologio monotono | `apps/server/src/context-semantic.ts`: `now ?? (() => performance.now())` | Esempio corretto; `quizzland.ts` usa invece `Date.now()` per i timer (da non copiare, DIRETTIVE §6) |
| Distribuzione eventi | `broadcastEvent` in `apps/server/src/index.ts`: salva l'evento nel worker, filtra con `allowedToPlay`, chiama `room.action(t.action, event)` per `bivio`/`incastro`/`quizzland` **senza** id del messaggio né ora di ricezione | Non è il canale giusto per le risposte di ZeroTaboo |
| Ponte ZeroFollowerBot | `apps/server/src/zfb.ts`: `ZfbBridge`, `bridgeEvent`; id utente `${platform}:${id}`; testo tagliato a 140 caratteri (`MAX_TEXT`), id messaggio fino a 128 (`MAX_ID`), `at` (ora di scrittura) o `null`; messaggio `lost` solo registrato nel log; `skip(id)` per la voce | Ingresso delle risposte |
| Callback del ponte | in `apps/server/src/index.ts`, `new ZfbBridge((received, kind, account, id, at) => { ... tournaments.offer(roomKey, ...) })`; serve solo la stanza `roomKey` | Punto in cui aggancerai `taboo.offer(...)` |
| Connettori diretti | `apps/server/src/sources.ts`: `toViewer` crea id **senza** prefisso di piattaforma e nessun id messaggio | Motivo per non usarli nella partita competitiva (D7) |
| Validazione al confine | `apps/server/src/validate.ts`: `sanitizeSettings` (ogni impostazione deve esserci; l'impostazione `image` accetta solo `/api/<gioco>/background/...` di bivio, incastro e quizzland), `sanitizeQuizzlandCommand`, `sanitizeMessage` | Aggiungi `sanitizeTabooCommand` |
| Comandi solo dalla regia | in `io.on('connection')` di `apps/server/src/index.ts`, dopo `if (clientType !== 'dashboard') return` tutti i gestori sono riservati alla dashboard | Registra lì `taboo:control` |
| Segreti verso tutti gli overlay | `SECRET_GAMES` e l'evento `secret:word` in `apps/server/src/index.ts` (per i giochi diversi da ZeroContext arriva anche agli overlay) | **Non** aggiungere ZeroTaboo |
| Stanze e partecipanti | `apps/server/src/gameRooms.ts`: `RoomParticipants` (10.000 per stanza, avviso una volta), `disposeGameRooms` | Da riusare |
| Sessioni | `apps/server/src/sessions.ts`: `selectGame`, `getSession`, `controlGame`, `RENAMED` | Selezione del gioco e pausa |
| DB operativo | `apps/server/src/db.ts`: `dbPath` da `ZEROCADE_DB`, `PRAGMA journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`; tabella `infrastructure_migrations` (versione 1 registrata); `closeDb()` | Le tue tabelle operative |
| DB di contenuti a sé | `apps/server/src/schema-db.ts`: `openSource`, `sourceReady`, `zeroQuizzDb`; `database/ZeroQuizz.sqlite3` scritto da `gioco-quizzland/script/domande.py` | Modello per il mazzo |
| Classifiche generiche | `apps/server/src/scores.ts`: `recordScore` (punti interi 1–100.000, id ≤ 64, nickname ≤ 32) su `game_scores` | Uso da decidere (D17) |
| Worker di persistenza | `apps/server/src/infrastructureClient.ts`: `persistence` (2.048 richieste), `reports` (32), `WorkerJobError` con esito `not-started`/`failed`/`unknown`; operazioni tipizzate in `apps/server/src/infrastructureJobs.ts`, eseguite in `apps/server/src/infrastructure-worker.ts` | Export e report fuori dal thread principale |
| CSV | `apps/server/src/csv.ts`: `toCsv` (BOM, anti-formula, massimo 50.000 righe e 16 MiB) | Export della telemetria |
| Shutdown | `apps/server/src/shutdown.ts`: `createShutdown`; passi in fondo a `apps/server/src/index.ts` (20 s) | Aggiungi «ZeroTaboo rooms» |
| Salute del server | `/api/health` e `/api/live` in `apps/server/src/index.ts` | Metriche |
| Overlay | `apps/overlay/src/App.tsx` (monta `Bivio`, `Incastro`, `Quizzland` per `gameId`), `apps/overlay/src/store.ts` (stato + `performance.now()` all'arrivo), `apps/overlay/src/Quizzland.tsx`, `apps/overlay/src/quizzland.css` | Componente DOM `Taboo.tsx` |
| Avatar | `apps/overlay/src/ViewerAvatar.tsx` (DOM), `drawAvatar` e `fillTextWithAvatar` in `apps/overlay/src/games/avatar.ts` (canvas, cache LRU di 256 immagini) | Ogni nome con la sua foto |
| Giochi canvas | `createGame` in `apps/overlay/src/games/registry.ts` restituisce `null` per id non registrati | ZeroTaboo non va registrato lì |
| Dashboard | `apps/dashboard/src/pages/GamesPage.tsx` (colonna dedicata per `zerodubbi`/`incastro`/`quizzland`), `apps/dashboard/src/components/QuizzlandSidebar.tsx`, `apps/dashboard/src/components/Regia.tsx` (`listedGames`: solo categorie `Quiz` e `Parole` più `BRAIN_GAMES`; `LiveSimulator`), `apps/dashboard/src/store.ts` | Regia di ZeroTaboo |
| Test | `tests/*.test.ts` con `node:test`; orologio finto `Clock` e `new ContextTournamentStore(new Database(':memory:'))` in `tests/context-tournament.test.ts`; `ZEROCADE_DB` impostato **prima** dell'import dinamico in `tests/server-game-disposal.test.ts`; ponte finto con `WebSocketServer` in `tests/zfb-viewers.test.ts`; test che scorrono tutti i `GAMES` in `tests/controls.test.ts` e `tests/help-switches.test.ts` | Stile e trappole dei test |
| Script e CI | `package.json` radice: `typecheck`, `build`, `test:associations`; `scripts/check-infrastructure.mjs`, `scripts/smoke-runtime.mjs`, `scripts/backup-live.mjs`, `scripts/package-win.mjs`; `.github/workflows/ci.yml` | Comandi di verifica |
| Tipi dei test | Nessun `tsconfig` include `tests/`: `npm run typecheck` **non** controlla i test (girano con `tsx`, che non verifica i tipi) | Non dichiarare «tipi dei test verificati» |
| Convenzioni del codice | Commenti del sorgente in inglese, testi dell'interfaccia in italiano; il server importa `./modulo.js`, i test importano `../apps/server/src/modulo.ts` | Mantienile |

---

<a id="s2"></a>
## 2. Mappa requisito → direttiva

Ogni parte del regolamento è governata da sezioni precise delle direttive. Usa la tabella come indice: prima di scrivere
il codice di una riga, rileggi le sezioni indicate.

| Requisito (ZEROTABOO) | Direttive che governano come scriverlo | Dove vive nel codice ([§4](#s4)) |
| --- | --- | --- |
| Ciclo della carta READY → ACTIVE → SUCCESS/SKIP/TABOO/TIMEOUT (§3) | §2 «Stati illegali non rappresentabili», «Contratto operativo»; §5 «Fasi delimitate» (identificativi di generazione); §11 test deterministici | `taboo-machine.ts` (puro) + `taboo.ts` (coordinatore) |
| Timer autorevole di 90 s, cutoff, niente tolleranza (§1.1, §3.2, §3.6, §5) | §6 «Clock monotono»; §7 deadline; §5 cancellazione e cleanup; §13 «cleanup in `finally`» | `taboo.ts`, dipendenze iniettate |
| Primo messaggio valido, un solo vincitore per carta (§2, §3.3, §12.4) | §5 FIFO e fairness; §7 «Idempotenza»; §8 vincoli `UNIQUE`/`PRIMARY KEY`, «Idempotency key» | `taboo.ts` + tabella dei vincitori |
| Un tentativo per utente ogni 2 s (§2) | §7 «Rate limiting»; §3 «Budget di memoria verificabile»; §5 code delimitate | `taboo.ts` (mappa limitata) |
| Normalizzazione delle risposte, alias (§2, §7, §8) | §10 «Canonicalizzazione corretta»; §2 «Ricerca prima della scrittura», «Semantica prima della somiglianza»; §11 property e fuzz | `taboo-answer.ts` (puro) |
| Punteggi, serie, Jackpot, carta cantata (§4) | §2 funzioni di dominio pure; §11 unit e property test | `taboo-scoring.ts` (puro) |
| Violazioni, contestazioni, rettifiche (§3.5, §11, §12.8) | §8 transazioni, rollback, append-only; §9 «Successo soltanto dopo la conferma», log verificabili | `taboo-scoring.ts` + `taboo-db.ts` |
| Cinque round, voto, vincoli narrativi (§5) | §2 «Configurazione centralizzata», «Fotografie coerenti»; §1 KISS/YAGNI | `taboo-machine.ts`, `TABOO_RULES` |
| Eventi e varianti (§6) | §1 YAGNI; §0 eccezioni documentate | Solo ciò che decide l'utente (D23) |
| Mazzo come dati, controllo editoriale (§7, §8, §11, §12 Fase 1) | §8 vincoli e migrazioni; §10 «Deserializzazione sicura»; §16 «Dati»; appendice SQLite | `database/ZeroTaboo.sqlite3` + strumento Python + `taboo-deck.ts` |
| Calibrazione e telemetria (§9) | §9 metriche e «Cardinalità controllata»; §10 «Data minimization», «Retention»; §4 elaborazione fuori dal percorso caldo | `taboo-db.ts` + report nel worker o strumento offline |
| Segretezza della carta (§1 identità, §3.1–3.2, §12.2; Taboo pubblici per D26) | §10 «Least privilege», «Autorizzazione lato server»; §2 «API minime», tipi separati | tipi in `packages/shared/src/taboo.ts`, emissioni separate |
| Progressione e UX (§10) | §13 React (cleanup, chiavi stabili, risultati obsoleti); §3 memoria degli avatar | `Taboo.tsx`, `TabooSidebar.tsx` |
| Interruzioni tecniche (§9.1) | §7 «Graceful degradation», «Health e readiness»; §6 «Disponibilità distinta da progresso» | `taboo.ts` (sospensione), flag sull'esposizione |
| Identità del giocatore = ID utente, classifiche per piattaforma (§4) | §2 «Tipi semantici» | tipi condivisi, chiavi del DB |
| Nessuna ricompensa economica automatica (§1.6) | §10 superficie minima | Nessun collegamento a regali/monete |

---

<a id="s3"></a>
## 3. Protocollo obbligatorio per agenti AI applicato a ZeroTaboo

DIRETTIVE §14 è vincolante. Qui è riscritto come procedura per questo lavoro.

### Fase A — Analisi (nessuna modifica al codice)

1. Leggi le fonti nell'ordine di [§0.2](#s0).
2. Apri e leggi i file della tabella di [§1](#s1). Annota firme, contratti e invarianti che userai (DIRETTIVE §14 A.1, A.6).
3. Registra la **baseline** prima di toccare qualunque cosa, dalla radice del repository, e conserva gli esiti esatti
   (numero di test, avvisi, errori preesistenti):
   - `npm run typecheck`
   - `node --import tsx --test tests/*.test.ts`
   - `python -I -m unittest discover -s database/script`
   - `npm run build`
   - `node scripts/check-infrastructure.mjs`
4. Controlla in [§14.1](#s14) quali decisioni sono già prese (quasi tutte, D1–D26) e porta all'utente solo i punti di
   [§14.2](#s14) che bloccano la modifica che vuoi fare. Per una nuova funzione che tocca una regola, chiedi prima.
5. Scrivi un **piano** nella conversazione (non in un file del repository, salvo richiesta), con: obiettivo della fase,
   file toccati, contratti nuovi, invarianti, rischi, test che dimostreranno il risultato, cosa resta fuori.
   Modello minimo:

   ```text
   Fase N — <titolo>
   File nuovi: ...            File modificati: ...
   Contratti: <tipo/funzione> — input, output, errori, effetti
   Invarianti: I1..In (da §4.6 della guida)
   Test: <file> — casi normali, limiti, errori
   Fuori ambito: ...          Decisioni usate: D.. (risposta dell'utente del <data>)
   ```

### Fase B — Implementazione

1. **[REGOLA]** Modifiche piccole e verificabili, una fase alla volta ([§11](#s11)); separa in commit diversi spostamenti,
   estrazioni comuni e cambi di comportamento (DIRETTIVE §2 «Spostamenti separati», §14 B.9).
2. **[REGOLA]** Riusa l'infrastruttura esistente (`RoomParticipants`, `InfrastructureClient`, `toCsv`, `createShutdown`,
   `ViewerAvatar`, `openSource`) prima di scriverne una nuova (DIRETTIVE §14 B.2).
3. **[REGOLA]** Nessuna nuova dipendenza npm o Python senza un beneficio dimostrato; per ZeroTaboo non ne servono
   (DIRETTIVE §14 B.3).
4. **[REGOLA]** Non cambiare il comportamento degli altri giochi. Ogni modifica a file condivisi (`index.ts` del server,
   `packages/shared/src/index.ts`, `validate.ts`, `App.tsx`, `GamesPage.tsx`) è additiva e limitata a ZeroTaboo.

**Non fare mai:**

- disabilitare, saltare o indebolire un test esistente per far passare la suite (DIRETTIVE §14 B.7);
- usare `any`, `as unknown as`, `// @ts-ignore` o `// @ts-expect-error` per nascondere un errore (DIRETTIVE §13);
- avviare un server di prova senza `ZEROCADE_DB` e `PORT` propri, o importare `apps/server/src/db.ts` in un test prima di
  aver impostato `ZEROCADE_DB` (DIRETTIVE §12; incidente descritto in `docs/DIRETTIVE-audit-2026-11-14.md`);
- usare la porta e il DB della diretta (`apps/server/data/zerocade.db`), account o dirette reali;
- inviare il bersaglio o gli alias di una carta non chiusa a un overlay (**D26**: i cinque Taboo della carta aperta sì, sono nel campo `forbidden` dello stato pubblico; bersaglio e alias mai);
- eseguire `VACUUM`, checkpoint o migrazioni pesanti durante una diretta (DIRETTIVE appendice §9);
- committare le modifiche di altri lavori presenti nel working tree.

### Fase C — Verifica

Esegui i controlli di [§9.4](#s9) sulla versione finale, poi:

1. ispeziona il diff completo (`git diff`) cercando modifiche accidentali e righe di debug;
2. controlla la matrice di regressione di DIRETTIVE §11 sulle righe pertinenti (esito sconosciuto, saturazione,
   cancellazione, identità delle azioni in UI, risposte obsolete);
3. distingui nel resoconto: prova del prodotto, prova isolata, simulazione, analisi statica (DIRETTIVE §14 C.9).

### Fase D — Consegna

Usa il modello di [§12.2](#s12). **[REGOLA]** È vietato dichiarare superata una verifica non eseguita (DIRETTIVE §14 D).
Se manca la toolchain (Node 26, `npm install`, Python), prepara il cambiamento e dichiara esattamente cosa non hai
eseguito: non chiamarlo completato o pronto (DIRETTIVE §14 «Ambiente incompleto»).

---

<a id="s4"></a>
## 4. Architettura proposta

### 4.1 File da creare o modificare

Percorsi marcati «(nuovo)»: non esistono ancora. **[RACC]** I nomi seguono le convenzioni del repository; puoi cambiarli
solo motivando.

| File | Stato | Responsabilità | Dipende da |
| --- | --- | --- | --- |
| `packages/shared/src/taboo.ts` | (nuovo) | `TABOO_RULES` congelate, tipi semantici (`TabooCardCode`, `TabooDifficulty`, `TabooOutcome`, fasi), stato pubblico, stato di regia, comandi e risposte tipizzate | niente oltre TypeScript |
| `packages/shared/src/index.ts` | modifica | `export * from './taboo.js'`; `GameDef` di ZeroTaboo in `GAME_DEFS`; eventi in `ServerToClientEvents`/`ClientToServerEvents` | `taboo.ts` |
| `apps/server/src/taboo-answer.ts` | (nuovo) | Funzioni pure: normalizzazione, corrispondenza con bersaglio e alias, rilevazione di più ipotesi | shared |
| `apps/server/src/taboo-scoring.ts` | (nuovo) | Riduttore puro dei punti di squadra, serie, Jackpot, carta cantata, rettifiche; classifica individuale | shared |
| `apps/server/src/taboo-machine.ts` | (nuovo) | Transizioni pure partita/round/carta: `(stato, input, ora) → { stato, effetti }` | shared, `taboo-scoring.ts` |
| `apps/server/src/taboo-deck.ts` | (nuovo) | Carica e **valida** il mazzo in sola lettura; estrazione stratificata pura con `random` iniettato | `schema-db.ts`, shared |
| `apps/server/src/taboo-db.ts` | (nuovo) | `TabooStore`: schema operativo, transazioni brevi, viste per le letture | `better-sqlite3` (tipo), shared |
| `apps/server/src/db.ts` | modifica | La connessione `db` è privata del modulo: costruisci ed esporta qui lo store (`export const tabooStore = new TabooStore(db)`), come `contextTournamentStore` | `taboo-db.ts` |
| `apps/server/src/taboo.ts` | (nuovo) | `TabooRooms`/stanza: possiede timer, deduplica, limiti, stato in memoria; esegue gli effetti; emette stato pubblico e di regia | moduli sopra, `gameRooms.ts` |
| `apps/server/src/validate.ts` | modifica | `sanitizeTabooCommand` | shared |
| `apps/server/src/index.ts` | modifica | Costruzione di `TabooRooms`, aggancio nel callback del ponte, eventi Socket.IO, selezione del gioco, impostazioni, passo di shutdown | `taboo.ts` |
| `apps/server/src/infrastructureJobs.ts`, `apps/server/src/infrastructure-worker.ts` | modifica | Se l'utente vuole l'export CSV: nuovo `kind` di `export` | `taboo-db.ts` |
| `apps/overlay/src/Taboo.tsx` (+ `apps/overlay/src/taboo.css`) | (nuovo) | Scena pubblica: categoria, livello, punti, tempo, squadra/25, serie, ultimo vincitore con avatar, intervalli | shared, `ViewerAvatar.tsx` |
| `apps/overlay/src/store.ts`, `apps/overlay/src/App.tsx` | modifica | `taboo`, `tabooAt`; montaggio per `gameId` | |
| `apps/dashboard/src/components/TabooSidebar.tsx` | (nuovo) | Carta privata per lo streamer, comandi, rettifiche, voto, report | shared, `Regia.tsx` |
| `apps/dashboard/src/pages/GamesPage.tsx`, `apps/dashboard/src/store.ts` | modifica | Colonna dedicata, eventi di regia | |
| `gioco-zerotaboo/data/` | (nuovo) | Fonte editoriale del mazzo (formato: D19) e casi di normalizzazione condivisi | |
| `gioco-zerotaboo/script/mazzo.py` + `gioco-zerotaboo/script/test_mazzo.py` | (nuovo) | Import, validazione editoriale, verifica e export del DB del mazzo | Python standard |
| `database/ZeroTaboo.sqlite3` | (nuovo) | Mazzo versionato in Git, sola lettura per il server (D19) | |
| `tests/taboo-*.test.ts` | (nuovo) | Vedi [§9](#s9) | |
| `gioco-zerotaboo/README.md`, `gioco-zerotaboo/TODO.md` | (nuovo) | Regole, dati, comandi del gioco (DIRETTIVE §16) | |
| `README.md`, `database/README.md`, `database/DB.md`, `scripts/package-win.mjs`, `docs/STATO_DOCUMENTAZIONE.md` | modifica | Documentazione e pacchetto Windows | **[VERIFICA]** cosa elencano |

### 4.2 Direzione delle dipendenze

**[REGOLA]** (DIRETTIVE §2, §16): `apps/* → packages/shared`; `apps/dashboard, apps/overlay → packages/browser-runtime →
packages/shared`. `shared` non importa le app né `browser-runtime`; le app non si importano tra loro;
`scripts/check-infrastructure.mjs` lo controlla.

```text
taboo-answer.ts ─┐
taboo-scoring.ts ┼─> taboo-machine.ts ─> taboo.ts (coordinatore, I/O) ─> index.ts (Socket.IO, ponte)
taboo-deck.ts ───┘                          │
taboo-db.ts  <──────────────────────────────┘        tutti ─> packages/shared/src/taboo.ts
```

- **[REGOLA]** I moduli puri (`taboo-answer`, `taboo-scoring`, `taboo-machine`) non leggono orologio, casualità, DB, rete
  o ambiente: li ricevono come parametri (DIRETTIVE §2 «Effetti ai bordi»).
- **[RACC]** Metti regole e tipi visibili ai client in `packages/shared/src/taboo.ts`; metti matcher e riduttore nel
  server, come fa il torneo (`context-tournament-scoring.ts` è nel server, `TOURNAMENT_RULES` in shared). Il matcher non
  serve agli overlay: non va nel loro bundle.

### 4.3 Contratti tra moduli

- **[REGOLA]** La segretezza si garantisce con i **tipi**, non con la disciplina (DIRETTIVE §2 «Stati illegali non
  rappresentabili»; ZEROTABOO §3.2, §12.2). Due tipi distinti:
  - `TabooPublicState`: va a `io.to(key)` (overlay, anteprima della dashboard). Contiene solo categoria, livello, punti,
    tempo, squadra, soglia, serie, round, ultimo vincitore, classifica, **le cinque parole Taboo della carta aperta**
    (campo `forbidden`, D26: lo streamer non può dirle e il pubblico le vede) e la soluzione **solo** delle carte chiuse.
    Bersaglio e alias non ci sono mai prima della chiusura.
  - `TabooAdminState`: va solo a `io.to(dashboardRoom(key))`, come `quizzland:solution`. Contiene in più la carta in gioco
    (bersaglio, cinque Taboo, alias), le segnalazioni in attesa e gli avvisi.
- **[RACC]** Eventi: `taboo:state` e `taboo:admin` (server → client), `taboo:control` con `ack` (dashboard → server),
  sul modello di `context:tournament`.
- **[RACC]** Ogni comando di regia porta `expectedVersion` e, se riguarda una carta, l'identificativo dell'esposizione
  scelta al momento del clic (DIRETTIVE §13 «Identità stabile delle azioni — P0»). Un comando con versione vecchia
  restituisce un errore tipizzato e non fa nulla.
- **[RACC]** Risposta tipizzata: `{ ok: true } | { ok: false; error: TabooErrorCode; message: string }` (esempio in
  [§10](#s10)).

### 4.4 Ingresso dei commenti senza aggirare il ponte

Fatti: `broadcastEvent` passa alle stanze `room.action(t.action, event)` senza id del messaggio né ora di ricezione; solo il
callback di `ZfbBridge` in `apps/server/src/index.ts` conosce `id` e `at`; i connettori diretti (`sources.ts`) e il
simulatore della dashboard (`sim:event`) non hanno id dei messaggi; gli id utente dei connettori diretti non hanno il
prefisso di piattaforma.

- **[RACC]** Un solo punto d'ingresso per le risposte: nel callback del ponte, accanto a `tournaments.offer(...)`,
  chiama `taboo.offer(roomKey, { user, text, messageId: id, platform: kind, writtenAt: at })` quando
  `session.gameId` è ZeroTaboo. La stanza misura da sé l'ora di ricezione con l'orologio monotono.
- **[REGOLA]** Non aggiungere ZeroTaboo alla catena `bivio.get(key) ?? incastro.get(key) ?? quizzland.get(key)` di
  `broadcastEvent` per le risposte: lo stesso commento arriverebbe due volte (una senza id).
- **[REGOLA]** `broadcastEvent` continua a ricevere e salvare **tutti** gli eventi (chat della regia, contatori,
  classifica dei donatori): non toccarlo per ZeroTaboo se non per escludere esplicitamente il doppio ingresso.
- **[REGOLA]** (derivata da ZEROTABOO §2: lo streamer non può «usare la chat … per rivelare la soluzione») I commenti
  con `user.host === true` non sono mai risposte valide, anche se `allowedToPlay` li ammette.
- **[REGOLA]** Applica `allowedToPlay(settings, user)` («Chi può giocare») prima di qualunque conteggio, come il torneo.
- **[DECIDERE]** D6–D8: piattaforma competitiva, sorgenti ammesse (ponte soltanto, oppure anche connettori diretti e
  simulatore in modalità prova), comandi di skip/Taboo dalla chat. Il `Viewer` non ha un campo «moderatore»
  (`packages/shared/src/index.ts`): finché il ponte non lo fornisce, le segnalazioni dei moderatori passano dalla
  dashboard.
- **[DECIDERE]** D22: la voce di ZeroFollowerBot deve leggere le risposte? Se no, usa `zfb.skip(id)` come per ZeroWordle.

### 4.5 Registrazione nel catalogo, nelle sessioni, in overlay e dashboard

1. **Catalogo** (`packages/shared/src/index.ts`): aggiungi un `GameDef` in `GAME_DEFS`.
   - **[DECIDERE]** D21: `id` (proposta `zerotaboo`), `name` (proposta `ZeroTaboo`), `category`. Con una categoria diversa
     da `Quiz` o `Parole` il gioco non compare nei menu (`listedGames` in `apps/dashboard/src/components/Regia.tsx`):
     scegli una delle due, oppure aggiungi l'id a `BRAIN_GAMES`.
   - `actions`: **[RACC]** solo `{ id: 'guess', label: 'Risposta' }`, senza `help: true` (ZEROTABOO non prevede aiuti dal
     pubblico; con un'azione `help` comparirebbero gli interruttori «Aiuti dal pubblico», verificati da
     `tests/help-switches.test.ts`).
   - `defaultTriggers`: `[{ source: { type: 'comment' }, action: 'guess' }]`.
   - `settings`: **[RACC]** solo ciò che il regolamento rende configurabile (soglia, piattaforma competitiva, durata
     degli intervalli entro 15–30 s, animazioni). Nessuna impostazione `image` in v1: `sanitizeSettings` la accetta solo
     per tre giochi. `audience` e `voiceFollowersOnly` arrivano da `COMMON_SETTINGS`: non ridefinirle
     (`tests/controls.test.ts` controlla i valori predefiniti).
   - Sfondo: se l'overlay di ZeroTaboo disegna il proprio, aggiungi l'id a `OWN_BACKGROUND`; altrimenti dietro compare la
     foto NASA (`App.tsx`).
2. **Sessioni** (`apps/server/src/sessions.ts`): non servono modifiche; `selectGame` usa `GAMES`. Le impostazioni nuove
   prendono il valore predefinito nelle sessioni salvate (`loadState`).
3. **Server** (`apps/server/src/index.ts`), sul modello di `quizzland`:
   - costruisci `TabooRooms` con emissione pubblica a `io.to(key)` e di regia a `io.to(dashboardRoom(key))`;
   - in `io.on('connection')`: invia lo stato pubblico a tutti, quello di regia solo alle dashboard;
   - in `game:select`: chiudi e riapri come per gli altri giochi gestiti dal server;
   - in `settings:set`: le impostazioni valgono dalla **partita successiva** (fotografia, [§7.3](#s7));
   - nel callback di stato del ponte, accanto a `tournaments.bridgeChanged()`, chiama `taboo.bridgeChanged()`;
   - aggiungi il passo `{ name: 'ZeroTaboo rooms', run: () => taboo.closeAll() }` a `createShutdown`, prima di
     `persistence worker` e di `database`;
   - registra `taboo:control` dopo `if (clientType !== 'dashboard') return`.
4. **Overlay**: `Taboo.tsx` montato in `App.tsx` con `session?.gameId === '<id>'`; non registrare nulla in
   `apps/overlay/src/games/registry.ts`.
5. **Dashboard**: ramo dedicato in `GamesPage.tsx` come per `quizzland`; `TabooSidebar.tsx` riusa `GameSwitch`,
   `LiveSimulator` e gli altri pezzi di `Regia.tsx` solo se la modalità prova li ammette (D7).

### 4.6 Macchina a stati della partita, del round e della carta

Dedotta da ZEROTABOO §1, §3, §5, §6. **[RACC]** Implementala come funzione pura in `taboo-machine.ts`; il coordinatore
`taboo.ts` esegue gli effetti restituiti (salvataggi, timer, emissioni).

**Partita e round**

| Stato | Ingresso consentito | Transizione | Note e fonte |
| --- | --- | --- | --- |
| `setup` | `start-match` (regia) | → `intermission(1)` | Fotografia della configurazione: soglia (25), piattaforma, pesi del mazzo (§1.3, §4) |
| `intermission(n)` | voto categoria (n = 3), scelta del vincolo (n = 4), ruota penitenze (se n > 1 e round n−1 con Taboo), rettifiche pendenti, `start-round` | → `round(n)` | 15–30 s fuori timer (§5); voto chiuso **prima** del timer (§5 round 3) |
| `round(n)` | risposte, `skip`, `taboo`, `pause`, scadenza | scadenza → `intermission(n+1)` o, per n = 5, `finished` | 90 s su orologio monotono (§1.1); nessun round speciale imposto dopo l'avvio (§5) |
| `suspended(n)` | `resume`, `cancel` | → `round(n)` con il tempo residuo | Caduta del ponte o pausa (D15, D24); l'esposizione in corso diventa «interruzione tecnica» (§9.1) |
| `finished` / `cancelled` | `dismiss` | → `setup` | Vittoria se squadra ≥ soglia (§1.3; momento della chiusura: D10) |

**Carta (dentro `round(n)`)**

| Stato | Evento | Transizione ed effetti | Fonte |
| --- | --- | --- | --- |
| `ready` | apertura | → `active`; registra `start_ms` e il tempo disponibile; nel round la transizione non ferma il timer | §3.1, §3.2, §5 |
| `active` | prima risposta valida ricevuta prima della scadenza | → `solved`; un solo vincitore; punti base (× 2 se Jackpot o cantata); serie +1; bonus ai traguardi 3, 6, 9…; carta successiva | §3.3, §4 |
| `active` | `skip` con skip residui (max 2 per round) | → `skipped`; 0 punti; serie a 0; carta successiva | §3.4, §4 |
| `active` | `skip` senza skip residui | rifiuto tipizzato `no-skips-left`; la carta resta attiva | §3.4 |
| `active` | `taboo` (regia) | → `taboo`; −1 squadra senza scendere sotto 0; serie a 0; nessuna vittoria; carta successiva | §3.5, §4 |
| `active` | scadenza del round | → `round_timeout`; 0 punti | §3.6 |
| `solved` | `taboo` tardivo o contestato | nessun cambio immediato: segnalazione in attesa, decisa nell'intervallo ([§5.6](#s5)) | §3.5 |

**Invarianti** (ognuna ha almeno un test, [§9](#s9)):

- **I1** Al massimo una carta `active` per stanza.
- **I2** Una carta chiusa non si riapre; ogni esposizione ha un solo esito.
- **I3** Al massimo un vincitore per esposizione (anche nel DB, [§6.2](#s6)).
- **I4** Punteggio di squadra ≥ 0 in ogni istante, anche dopo una rettifica.
- **I5** Skip usati ≤ 2 per round.
- **I6** Jackpot ≤ 1 per partita (prima carta del round 5); carta cantata ≤ 1 per partita; mai entrambi sulla stessa carta.
- **I7** Nessuna risposta accettata con ora di ricezione ≥ scadenza del round, anche se il timer non è ancora scattato.
- **I8** Lo stato pubblico non contiene mai bersaglio o alias di una carta non chiusa. *(Testo originale: «bersaglio, Taboo o
  alias». Per D26 i cinque Taboo della carta aperta sono pubblici in `forbidden`; `tests/taboo-secrecy.test.ts` e
  `tests/taboo-socket.test.ts` controllano che bersaglio, parole significative e alias non compaiano.)*
- **I9** Nessuna carta ripetuta nella stessa partita.
- **I10** Soglia e regole della partita restano quelle della fotografia iniziale.
- **I11** Input che portano un identificativo di partita, round o esposizione vecchio vengono ignorati.
- **I12** Al massimo una penalità Taboo per carta.

---

<a id="s5"></a>
## 5. Traduzione delle regole in codice

### 5.1 Costanti del regolamento

**[REGOLA]** Ogni numero del regolamento sta in un solo punto, congelato, con la sezione di origine accanto (DIRETTIVE §2
«Configurazione centralizzata»). Non ripetere `90_000` o `25` nel codice.

```ts
// packages/shared/src/taboo.ts (nuovo). Numbers from ZEROTABOO.md v3.0; the section is next to each one.
export const TABOO_RULES = Object.freeze({
  version: 'taboo-3.0',
  rounds: 5,                                   // §1.1, §5
  roundMs: 90_000,                             // §1.1
  thresholdDefault: 25,                        // §1.3, §4: fixed before the match starts
  skipsPerRound: 2,                            // §2, §3.4
  guessCooldownMs: 2_000,                      // §2: one attempt per user every 2 s, from reception
  basePoints: Object.freeze({ 1: 1, 2: 2, 3: 3 }), // §4: easy +1, medium +2, hard +3
  tabooPenalty: 1,                             // §3.5, §4: never below 0
  streakEvery: 3,                              // §4: +1 at 3, 6, 9…
  streakBonus: 1,
  doubleMultiplier: 2,                         // §4: Jackpot or sung card, base points only
  sungWindowMs: 20_000,                        // §6: last 20 s of a round
  intermissionMinMs: 15_000,                   // §5
  intermissionMaxMs: 30_000,                   // §5
  cardTransitionMs: Object.freeze([1_000, 2_000]), // §5: target, graphics only, timer keeps running
  excludeNextMatches: 2,                       // §5: only if the deck allows it
})
```

Mix per round (ZEROTABOO §5), come dati: round 1 facili/medie circa 70/30; round 2 e 4 30/50/20; round 3 categoria
votata; round 5 20/50/30 con la prima carta Jackpot. I pesi sono «configurabili» (§5): mettili in una struttura
tipizzata e validata, non in condizioni sparse.

### 5.2 Validazione delle risposte della chat

Regola di ZEROTABOO §2: il bot accetta il bersaglio esatto e **le sole varianti approvate** nella scheda, dopo
normalizzazione di maiuscole, accenti, apostrofi, spazi e punteggiatura. Il messaggio può contenere testo accessorio; non
basta una parola generica di un bersaglio composto; i messaggi con più ipotesi distinte sono ignorati.

**Pipeline [RACC]** in `apps/server/src/taboo-answer.ts`, una funzione per passo, ognuna testata da sola:

1. **Limite di lunghezza**: il ponte taglia già a 140 caratteri (`MAX_TEXT` in `zfb.ts`); il matcher rifiuta comunque
   oltre 140 e oltre 40 token (difesa in profondità, DIRETTIVE §10 «Limiti anti-DoS»).
2. **Canonicalizzazione** nell'ordine: `normalize('NFD')`, rimozione dei segni diacritici `\p{M}`, `toLocaleLowerCase('it')`,
   apostrofi tipografici e dritti (`'`, `’`, `` ` ``, `´`) trasformati in spazio, divisione su `[^\p{L}\p{N}]+`. Il risultato
   è una lista di token. **Conserva le cifre**: «MAMMA CHE CHIAMA 10 VOLTE» le contiene.
3. **Corrispondenza** per confini di token: il bersaglio (o un alias) corrisponde se esiste una **finestra di token
   consecutivi del messaggio la cui concatenazione è uguale alla concatenazione dei token del bersaglio**. Così:
   «rage quit» risolve RAGEQUIT, «pizza con l’ananas» e «pizza con l'ananas» risolvono PIZZA CON L'ANANAS, ma «brutto»
   non risolve RUTTO, «simpatico» non risolve SIMP, «banana» non risolve BAN. La lettura di «spazi» come «spazi
   ignorabili tra token» va confermata (D3).
4. **Alias**: solo quelli approvati della **revisione** in gioco (ZEROTABOO §11: «Gli alias sono propri di una versione
   della carta»). Gli esempi «da non accettare» di §8 diventano casi di prova negativi ([Appendice A](#sa)).
5. **Più ipotesi**: applica il criterio deciso in D4 **prima** di dichiarare valida una corrispondenza.

Riuso (DIRETTIVE §2 «Semantica prima della somiglianza»):

- **[REGOLA]** Non usare `inflections()` per accettare plurali o femminili: ZEROTABOO §2 e §7 ammettono solo varianti
  approvate («Un concetto più generico o più specifico non è automaticamente valido»). Se l'utente vuole i plurali, si
  aggiungono come alias editoriali (D1).
- **[REGOLA]** Non usare `answerKey()` così com'è: elimina tutto ciò che non è `a–z`, cifre comprese («10» → «»).
- **[RACC]** Non usare `guessKey()`: accetta una sola parola, mentre i bersagli di ZeroTaboo sono spesso composti.
- **[RACC]** La stessa normalizzazione serve allo strumento Python del mazzo: tieni i casi di prova in un file condiviso
  (per esempio `gioco-zerotaboo/data/normalizzazione-casi.json`, nuovo) letto sia dal test TypeScript sia dal test Python,
  così le due implementazioni non divergono.

Altre regole al momento della ricezione, in quest'ordine, nel coordinatore `taboo.ts`:

| Controllo | Esito se fallisce | Fonte |
| --- | --- | --- |
| C'è una carta `active` e la partita non è sospesa | ignorato | ZEROTABOO §3 |
| Ora di ricezione (monotona) < scadenza del round | ignorato, conteggiato come tardivo | §3.6, I7 |
| Piattaforma ammessa per la vittoria individuale | conteggio cooperativo o ignorato (D6) | §2 «Ordine delle risposte» |
| `user.host !== true` e `allowedToPlay` | ignorato | §2; `allowedToPlay` |
| `platform:messageId` mai visto in questa partita | ignorato come duplicato | §12.4; DIRETTIVE §7 idempotenza |
| Ultimo tentativo dello stesso utente ≥ 2.000 ms fa (orologio monotono, dal ricevimento) | ignorato; non sposta il conteggio | §2 (cosa sia un «tentativo»: D5) |
| Corrispondenza e nessuna ipotesi multipla | vittoria | §2 |

Casi limite da coprire nei test: stringa vuota, solo emoji, solo punteggiatura, 140 caratteri, testo con caratteri
combinanti, maiuscole con accento («PIÙ»), apostrofo tipografico, bersaglio ripetuto due volte nello stesso messaggio,
alias di un'altra carta, messaggio esattamente alla scadenza, due messaggi validi dello stesso millisecondo (vince il
primo arrivato al gestore), stesso id messaggio ripetuto, lo stesso utente da due piattaforme (id diversi: due giocatori,
ZEROTABOO §4).

### 5.3 Punteggi, serie e classifica individuale

ZEROTABOO §4. **[RACC]** Un riduttore puro in `taboo-scoring.ts` calcola il punteggio di un round dagli esiti nell'ordine
in cui sono avvenuti. Lo stesso riduttore serve per il punteggio in diretta e per le rettifiche: «riaccreditare gli eventi
nell'ordine corretto» (§3.5) significa ricalcolare da capo, non correggere a mano.

Valori **esatti** da codificare:

- facile +1, media +2, difficile +3, una sola volta per carta, 1 vittoria individuale al primo;
- Taboo −1 alla squadra, minimo 0, nessuna vittoria, carta chiusa; al massimo una penalità per carta;
- skip 0 punti, nessuna vittoria, fino a 2 per round, azzera la serie;
- bonus serie +1 ai traguardi 3, 6, 9… di carte consecutive corrette **nello stesso round**; reset su skip, errore, fine round;
- Jackpot: × 2 **solo sui punti base**, una volta a partita, senza altri moltiplicatori;
- carta cantata (facoltativa): × 2 solo sui punti base, non combinabile con il Jackpot, bonus serie fisso a +1;
- la difficoltà non aggiunge vittorie individuali: ogni carta vale una vittoria.

Esempi del regolamento, da riportare **testualmente** nei test: facile, media, difficile consecutive = `1 + 2 + 3 + 1 = 7`;
con la difficile Jackpot = `1 + 2 + (3 × 2) + 1 = 10`.

Classifica individuale (§4): ordina per (1) carte vinte, (2) carte difficili vinte, (3) carte medie vinte; parità residua
= ex aequo. Identifica il giocatore con l'ID utente (`Viewer.id`, che dal ponte è `${platform}:${id}`), mai con il
nickname. Classifiche Twitch e TikTok distinte per impostazione predefinita. **[RACC]** Rappresenta l'ex aequo con lo
stesso piazzamento per i pari merito (1, 1, 3), come fa `backupNow` in `context-tournament-db.ts`.

Soglia (§1.3, §4): fissata all'avvio, mai cambiata a partita in corso. La proposta ±2 dopo almeno 10 partite comparabili
(successo > 75 % → +2; < 30 % → −2; obiettivo 40–65 %) è un **report** per l'utente, mai una modifica automatica.

### 5.4 I cinque round

ZEROTABOO §5. **[RACC]** Descrivi i round come dati (`TabooRoundPlan[]`), non come `if (round === 3)` sparsi.

| Round | Mix (facili/medie/difficili) | Regola speciale | Dove |
| --- | --- | --- | --- |
| 1 Riscaldamento | circa 70/30, solo facili e medie | nessun evento speciale | piano + estrazione |
| 2 Classico | 30/50/20 | Taboo puro, max 2 skip | piano |
| 3 La chat sceglie | categoria votata | voto chiuso prima del timer; senza carte nella categoria il bot propone un'alternativa e dice il motivo prima del round | intervallo + estrazione (D11) |
| 4 Caos leggero | 30/50/20 | un vincolo narrativo scelto prima: «telecronista», «thriller» o «venditore disperato»; divieti invariati | intervallo (D12) |
| 5 Gran finale | 20/50/30 | prima carta Jackpot, poi Taboo classico | piano |

Estrazione (`taboo-deck.ts`, pura, `random` iniettato): stratificata con i pesi del round; nessuna ripetizione nella
partita (I9); esclusione delle carte giocate nelle due partite precedenti **solo se il mazzo lo consente** (§5: quando non
basta, rilassa l'esclusione e registra il motivo); nessuna esposizione pubblica del bersaglio. Il mazzo v3.0 ha 18 facili,
29 medie e 15 difficili; la categoria B ha una sola difficile: prevedi l'esaurimento di uno strato.

Ritmo (§5): timer gestito dal bot; transizione grafica idealmente 1–2 s **senza fermare il timer**; nessuna ruota durante
il round; intervalli 15–30 s fuori timer con classifica, voto e **una sola** penitenza eventuale.

### 5.5 Eventi e varianti

ZEROTABOO §6. **[RACC]** In v1 implementa solo ciò che serve alla modalità standard; per il resto registra il campo `mode`
e fermati (DIRETTIVE §1 YAGNI). L'ambito esatto è D23.

| Variante | Cosa fare in v1 |
| --- | --- |
| Suggerimento cantato | Facoltativo. Una volta a partita, solo negli ultimi 20 s di un round, solo sulla carta attiva, target invariato, × 2 base, non con Jackpot, non si attiva senza carta attiva. Chi lo attiva e come: D13 |
| La Chat Sceglie | È il round 3 standard ([§5.4](#s5)) |
| Ruota delle penitenze | Al massimo una volta per round, solo se nel round c'è stata almeno una violazione, solo tra i round; elenco del §6; da decidere se implementarla (D23) |
| Taboo invertito con TTS, Mimo Proibito, No Sostantivi | Esibizioni fuori classifica: non in v1 salvo richiesta |
| Speedrun 60 s, Una Parola Sola | Modalità separate con statistiche proprie: non mescolarle con lo standard (§12.7) |
| Poliglotta tarocco | Solo vincolo narrativo testuale |

### 5.6 Violazioni Taboo, contestazioni e rettifiche

ZEROTABOO §3.5 e la nota di moderazione di §3: il riconoscimento vocale **non** è un arbitro sufficiente. **[REGOLA]** Le
parole proibite non si cercano nella chat e nessuna violazione è automatica: la segnala la regia.

- Segnalazione durante la carta attiva → esito `taboo` immediato (I12: una sola penalità per carta; un doppio clic con la
  stessa `expectedVersion` non applica nulla di nuovo).
- Segnalazione tardiva o contestata → evento di moderazione in attesa; si decide **nell'intervallo successivo**:
  - violazione verificabile e avvenuta **prima** della risposta vincente: revoca della vittoria, ricalcolo del round con il
    riduttore, eventi di correzione che portano il punteggio al nuovo valore, motivo mostrato tra i round;
  - non verificabile: nessuna sanzione retroattiva, ma l'evento resta registrato.
- **[REGOLA]** Nessuna riscrittura silenziosa del passato (ZEROTABOO §11; DIRETTIVE §8): gli eventi di punteggio sono
  append-only; una rettifica aggiunge eventi che puntano a quelli corretti.
- **[DECIDERE]** D14: cosa rende una violazione «verificabile», chi conferma, come si registra il momento della violazione.

### 5.7 Il mazzo come dati validati

ZEROTABOO §7, §8, §11, §12 Fase 1. **[REGOLA]** Le carte sono dati, non codice: nessun bersaglio, Taboo o alias nel
sorgente TypeScript (salvo fixture dei test).

Pipeline [RACC], sul modello di ZeroQuizz (`database/ZeroQuizz.sqlite3` scritto da `gioco-quizzland/script/domande.py`,
letto in sola lettura dal server):

1. fonte editoriale in `gioco-zerotaboo/data/` (formato: D19), trascritta da ZEROTABOO §8 e dalla tabella degli alias;
2. `gioco-zerotaboo/script/mazzo.py import` costruisce `database/ZeroTaboo.sqlite3` su file temporaneo, verifica, poi
   sostituisce (DIRETTIVE §8 «Scritture atomiche su file»); `verify` confronta DB e fonte; `export` produce CSV con BOM;
3. il server lo apre con `openSource` in sola lettura e **rivalida** al caricamento (DIRETTIVE §10 «Validazione lato
   trusted boundary»): una carta non valida resta fuori con un avviso, come fa `loadQuestions` in `quizzland.ts`.

Controlli del validatore (bloccanti salvo dove scritto «avviso»):

- esattamente 62 carte nella v3.0: categoria A 12, B–F 10 ciascuna; ID stabili `[A-F][0-9][0-9]` unici (§12 criterio 1);
- un bersaglio per carta, unico nel mazzo dopo normalizzazione; vietato il formato «A (B)» (§7);
- esattamente cinque Taboo, distinti dopo normalizzazione (§12 Fase 1); un Taboo può essere composto («Terra piatta»,
  «Amici Miei»);
- difficoltà iniziale da 🟢/🟡/🔴 a 1/2/3 (coerente con `difficulty_initial: 3` della carta A12 in §11);
- avviso: Taboo che condivide la radice con una parola del bersaglio (§7 «non replicare una parola costitutiva»). Nel
  mazzo attuale lo segnalano D03 «Denti»/DENTIERA, D06 «Cartone»/CARTA, F07 «Chiamata»/CHIAMA: si mostrano all'utente,
  **non** si correggono da soli (D18);
- alias: solo stretti equivalenti, mai uguali a un altro bersaglio, mai una parola generica del bersaglio;
- nessuna categoria nuova finché la Fase 1 non è completa: le 16 carte candidate G–J di §12.1 **non** vanno caricate;
- punteggio di qualità facoltativo, valutato **separatamente** dalla difficoltà (§7): griglia da 100 punti con
  chiarezza/univocità 25, potenziale comico 25, pertinenza delle 5 parole Taboo 20, familiarità del target 15,
  originalità/assenza di duplicati 15; bande ≥ 80 approvabile, 65–79 rivedere, < 65 scartare («soglie editoriali proposte,
  non dati sperimentali»). Il giudizio resta umano: il codice controlla solo che i cinque voti rispettino i massimi e che
  il totale sia la loro somma;
- ogni rinomina sostanziale crea una nuova `revision` (§12 Fase 1); statistiche ereditate solo se la semantica è invariata (§8).

### 5.8 Difficoltà e telemetria

ZEROTABOO §9. Per ogni esposizione registra i campi di §9.1: `card_id`, `card_revision`, `session_id`, `mode`,
`difficulty_at_play`, `round_number`, `start_time`, `end_time`, `seconds_available_when_started`, `outcome`
(`solved|skipped|taboo|round_timeout`), `solve_time_s`, `active_guessers` (utenti distinti con ≥ 1 tentativo),
`guess_count`, `winner_id`, `hint_mode`, `taboo_word_id`; e quelli di §3.7: `round_id`, `start_ms`, `end_ms`,
`winning_user_id`, `points_delta`, `taboo_flag`, `skips_used`. **[RACC]** Esponi questi nomi in una vista sopra tabelle
normalizzate ([§6.2](#s6)).

Campione comparabile (§9.1): escludi modalità sperimentali, carte con meno di 20 s disponibili all'apertura, errori Taboo e
interruzioni tecniche; segmenta per partecipanti attivi 1–5, 6–20, 21+.

Metriche e soglie (§9.2, «da validare»):

- `solve_rate = solved / (solved + skipped + round_timeout)`, Taboo fuori dal denominatore;
- `median_solve_time_s` solo tra le risolte; `skip_rate`, `taboo_rate`, `median_active_guessers`,
  `approved_alias_hit_rate`, `p50/p90_solve_time`;
- etichette provvisorie sotto 20 esposizioni comparabili su almeno 4 sessioni;
- con ≥ 20: 🟢 se `solve_rate ≥ 0.80` **e** `median_solve_time_s ≤ 18`; 🔴 se `solve_rate < 0.45` **oppure**
  `median_solve_time_s > 35`; 🟡 altrimenti; senza risolte → difficile provvisoria e revisione editoriale;
- cambio di un livello alla volta, dopo due revisioni consecutive coerenti; confronto per fascia di pubblico;
- alert QA: `skip_rate > 0.35`, `taboo_rate > 0.25`, oltre il 15 % di contestazioni di alias o risposte quasi corrette,
  categoria sottorappresentata. **[REGOLA]** Gli alert chiedono una revisione, mai una riclassificazione automatica.

**[RACC]** Calibrazione e alert si calcolano **fuori dalla diretta**: in uno strumento offline su una copia consistente
fatta con `scripts/backup-live.mjs`, oppure come lavoro del worker `reports`. Il server non modifica mai il DB del mazzo:
una nuova difficoltà corrente entra con lo strumento del mazzo dopo l'approvazione dell'utente.

### 5.9 Progressione, riconoscimenti e UX

ZEROTABOO §10.

- **Durante la partita** (overlay): punteggio di squadra su soglia («/25»), barra di progresso, round e tempo, categoria e
  difficoltà, serie quando pertinente (la dicitura «serie corretta ×2» del regolamento va chiarita, D18), ultimo vincitore
  con avatar, e **le cinque parole Taboo della carta aperta** (D26). La risposta di una carta non risolta si mostra **solo dopo** la chiusura.
- **Intervalli**: risultati del round, carte risolte, errori, 3 migliori indovini, titolo della categoria votata; motivo
  delle rettifiche (§3.5).
- **Accessibilità**: animazioni brevi e silenziabili; la difficoltà non solo col colore (testo «Facile/Media/Difficile» o
  icona con etichetta).
- **Premi simbolici**: Miglior Indovino (tie-break di §4), Cacciatore di Rosse (più difficili vinte, pareggio ex aequo),
  Prima Vittoria (prima carta della partita), Voce della Chat (≥ 3 round con almeno un messaggio distinto per round:
  badge, non punti), Squadra in Forma (3 carte consecutive in un round).
- **Progressione stagionale** facoltativa (4 settimane, opt-out): fuori da v1 salvo richiesta.
- **[REGOLA]** Nessun premio economico automatico (§1.6).

---

<a id="s6"></a>
## 6. Modello dati e persistenza

### 6.1 Due database con ruoli diversi

**[RACC]** (D19) Seguendo il precedente di ZeroQuizz e ZeroDubbi (`database/DB.md`):

- **Mazzo**: `database/ZeroTaboo.sqlite3`, in Git, sola lettura per il server, scritto solo dallo strumento del mazzo.
  Va copiato nel pacchetto Windows (`scripts/package-win.mjs` lo fa già per `ZeroQuizz.sqlite3`).
- **Partite e telemetria**: tabelle `taboo_*` nel DB operativo `zerocade.db` (`apps/server/src/db.ts`), fuori da Git.

Le chiavi esterne non attraversano due file: le tabelle operative salvano `card_code` + `card_revision` e il caricatore
verifica che esistano. Documenta questa eccezione (DIRETTIVE §0 «Le eccezioni devono essere documentate»).

### 6.2 Schemi proposti

Schizzi, non DDL definitivo. Seguono l'appendice SQLite di DIRETTIVE: chiavi intere, lookup per le stringhe ripetute,
`WITHOUT ROWID` per le tabelle con chiave naturale composta, `PRAGMA foreign_keys = ON` su ogni connessione, viste per le
letture.

```sql
-- database/ZeroTaboo.sqlite3 (nuovo)
CREATE TABLE categorie (n INTEGER PRIMARY KEY, codice TEXT NOT NULL UNIQUE, nome TEXT NOT NULL);
CREATE TABLE livelli   (n INTEGER PRIMARY KEY CHECK (n BETWEEN 1 AND 3), nome TEXT NOT NULL UNIQUE);
CREATE TABLE stati     (n INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE);          -- 'playtest', … (D18)
CREATE TABLE carte     (n INTEGER PRIMARY KEY, codice TEXT NOT NULL UNIQUE,         -- 'A12'
                        categoria INTEGER NOT NULL REFERENCES categorie(n));
CREATE TABLE revisioni (n INTEGER PRIMARY KEY, carta INTEGER NOT NULL REFERENCES carte(n),
                        revisione INTEGER NOT NULL CHECK (revisione >= 1), bersaglio TEXT NOT NULL,
                        livello_iniziale INTEGER NOT NULL REFERENCES livelli(n),
                        livello_corrente INTEGER NOT NULL REFERENCES livelli(n),
                        stato INTEGER NOT NULL REFERENCES stati(n),
                        qualita INTEGER CHECK (qualita BETWEEN 0 AND 100),
                        UNIQUE (carta, revisione));
CREATE TABLE parole    (n INTEGER PRIMARY KEY, testo TEXT NOT NULL UNIQUE);         -- ogni Taboo una volta sola
CREATE TABLE revisione_taboo (revisione INTEGER NOT NULL REFERENCES revisioni(n),
                        posizione INTEGER NOT NULL CHECK (posizione BETWEEN 1 AND 5),
                        parola INTEGER NOT NULL REFERENCES parole(n),
                        PRIMARY KEY (revisione, posizione), UNIQUE (revisione, parola)) WITHOUT ROWID;
CREATE TABLE risposte  (revisione INTEGER NOT NULL REFERENCES revisioni(n), testo TEXT NOT NULL,
                        PRIMARY KEY (revisione, testo)) WITHOUT ROWID;               -- alias approvati
CREATE TABLE risposte_escluse (revisione INTEGER NOT NULL REFERENCES revisioni(n), testo TEXT NOT NULL,
                        PRIMARY KEY (revisione, testo)) WITHOUT ROWID;               -- «da non accettare» (§8)
CREATE TABLE meta      (name TEXT PRIMARY KEY, value TEXT NOT NULL);                 -- versione 'v3.0', verified
-- + una vista che restituisce l'ultima revisione di ogni carta nella forma di ZEROTABOO §11
```

«Esattamente cinque Taboo» non si esprime con un vincolo SQLite: lo garantiscono `CHECK (posizione BETWEEN 1 AND 5)`,
la chiave primaria e il conteggio nel validatore, nel caricatore del server e in un test.

```sql
-- zerocade.db, tabelle operative (nuove), create da TabooStore
CREATE TABLE IF NOT EXISTS taboo_outcomes (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);   -- solved, skipped, taboo, round_timeout
CREATE TABLE IF NOT EXISTS taboo_modes    (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);   -- standard, …
CREATE TABLE IF NOT EXISTS taboo_score_kinds (n INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE); -- base, streak, penalty, correction
CREATE TABLE IF NOT EXISTS taboo_players  (n INTEGER PRIMARY KEY, platform TEXT NOT NULL CHECK (platform IN ('tiktok','twitch')),
                                           ref TEXT NOT NULL UNIQUE);                            -- id o pseudonimo (D16)
CREATE TABLE IF NOT EXISTS taboo_matches  (n INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, room_key TEXT NOT NULL,
                                           mode INTEGER NOT NULL REFERENCES taboo_modes(n), platform TEXT NOT NULL,
                                           threshold INTEGER NOT NULL CHECK (threshold > 0), rules_version TEXT NOT NULL,
                                           deck_version TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
                                           status TEXT NOT NULL CHECK (status IN ('active','suspended','finished','cancelled')));
CREATE TABLE IF NOT EXISTS taboo_rounds   (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n),
                                           number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 5), category TEXT,
                                           narrative TEXT, skips_used INTEGER NOT NULL DEFAULT 0 CHECK (skips_used BETWEEN 0 AND 2),
                                           started_at INTEGER, ended_at INTEGER, UNIQUE (match, number));
CREATE TABLE IF NOT EXISTS taboo_exposures (n INTEGER PRIMARY KEY, round INTEGER NOT NULL REFERENCES taboo_rounds(n),
                                           seq INTEGER NOT NULL, card_code TEXT NOT NULL, card_revision INTEGER NOT NULL,
                                           difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
                                           start_ms INTEGER NOT NULL, end_ms INTEGER, available_ms INTEGER NOT NULL,
                                           outcome INTEGER REFERENCES taboo_outcomes(n),
                                           jackpot INTEGER NOT NULL DEFAULT 0 CHECK (jackpot IN (0,1)),
                                           sung INTEGER NOT NULL DEFAULT 0 CHECK (sung IN (0,1)), CHECK (NOT (jackpot AND sung)),
                                           interrupted INTEGER NOT NULL DEFAULT 0 CHECK (interrupted IN (0,1)),
                                           active_guessers INTEGER NOT NULL DEFAULT 0, guess_count INTEGER NOT NULL DEFAULT 0,
                                           hint_mode TEXT, UNIQUE (round, seq));
CREATE TABLE IF NOT EXISTS taboo_winners  (exposure INTEGER PRIMARY KEY REFERENCES taboo_exposures(n),   -- I3 nel DB
                                           player INTEGER NOT NULL REFERENCES taboo_players(n),
                                           received_ms INTEGER NOT NULL, message_key TEXT, alias TEXT);
CREATE TABLE IF NOT EXISTS taboo_moderation (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n),
                                           exposure INTEGER REFERENCES taboo_exposures(n), kind TEXT NOT NULL,
                                           status TEXT NOT NULL, reported_at INTEGER NOT NULL, violation_at INTEGER,
                                           actor TEXT NOT NULL, reason TEXT NOT NULL CHECK (length(reason) <= 300));
CREATE TABLE IF NOT EXISTS taboo_score_events (n INTEGER PRIMARY KEY, match INTEGER NOT NULL REFERENCES taboo_matches(n),
                                           exposure INTEGER REFERENCES taboo_exposures(n),
                                           kind INTEGER NOT NULL REFERENCES taboo_score_kinds(n), delta INTEGER NOT NULL,
                                           corrects INTEGER REFERENCES taboo_score_events(n),
                                           moderation INTEGER REFERENCES taboo_moderation(n), at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS taboo_score_events_no_update BEFORE UPDATE ON taboo_score_events
  BEGIN SELECT RAISE(ABORT, 'taboo_score_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS taboo_score_events_no_delete BEFORE DELETE ON taboo_score_events
  BEGIN SELECT RAISE(ABORT, 'taboo_score_events is append-only'); END;
-- Viste: vincitori effettivi (escluse le vittorie revocate da una rettifica applicata),
-- punteggio per partita (SUM(delta)), esposizioni con i nomi dei campi di ZEROTABOO §3.7 e §9.1.
```

Note:

- La revoca di una vittoria non cancella la riga del vincitore: la vista dei vincitori effettivi esclude quelle con una
  rettifica applicata (nessuna riscrittura del passato). Allo stesso modo l'esito **effettivo** di un'esposizione
  rettificata (per esempio `taboo` al posto di `solved`) si ricava in una vista dalla rettifica applicata, senza
  `UPDATE` di `taboo_exposures.outcome`.
- `taboo_players.ref`, `room_key` e nickname: decidi con l'utente cosa si conserva e per quanto (D16, ZEROTABOO §9.1 «ID
  pseudonimizzati e retention limitata»). Il nickname e l'avatar servono allo stato in memoria per l'overlay; non devono
  finire nella telemetria se non servono.
- **[RACC]** Le risposte sbagliate utili alla revisione (§9.3) si salvano, se l'utente lo vuole, solo aggregate per
  esposizione (testo normalizzato breve + conteggio, senza utente), con un tetto per esposizione, come
  `word_association_guesses` in `db.ts`.

### 6.3 Migrazioni, transazioni e thread

- **[REGOLA]** Lo schema operativo nasce con `CREATE ... IF NOT EXISTS`; ogni cambio successivo è una migrazione
  versionata e registrata in una transazione `.immediate()` (modello: `migrateColumns` e `infrastructure_migrations` in
  `db.ts`; la versione 1 è già usata), con un test sul modello di `tests/db-migrations.test.ts` (DIRETTIVE §8).
- **[REGOLA]** `TabooStore` riceve il `Database` nel costruttore (come `ContextTournamentStore`): nei test usa
  `new Database(':memory:')`. In produzione lo crea `apps/server/src/db.ts`, l'unico modulo che possiede la connessione
  (`const db = new Database(dbPath)` non è esportata).
- Attenzione: anche `apps/server/src/infrastructure-worker.ts` importa `db.ts`, quindi la creazione dello schema gira
  pure nel thread del worker, con una connessione propria. Deve restare idempotente (`CREATE ... IF NOT EXISTS`, migrazioni
  registrate) e veloce; il `busy_timeout` di 5000 ms copre la contesa all'avvio. **[VERIFICA]** con un test che apre il
  modulo due volte sullo stesso file temporaneo.
- **[REGOLA]** Confini transazionali (DIRETTIVE §8): chiusura di una carta = un'unica transazione che scrive esito,
  eventuale vincitore ed eventi di punteggio. Una rettifica = un'unica transazione. Nessun `await`, rete o calcolo
  estraneo dentro la transazione (DIRETTIVE §6).
- **[REGOLA]** «Salvato» o un nuovo stato pubblico con i punti si emettono **dopo** il commit (DIRETTIVE §9 «Successo
  soltanto dopo la conferma»). Se il commit fallisce, sospendi la partita con un motivo leggibile, come fa `settle()` del
  torneo; non mostrare punti non salvati.
- **[RACC]** Le scritture di ZeroTaboo sono poche (una per carta chiusa): transazioni brevi e sincrone sul thread
  principale sono accettabili, come per il torneo (`db.ts` documenta questa scelta). Non scrivere un messaggio della
  chat per riga: accumula `guess_count` e `active_guessers` in memoria e scrivili alla chiusura della carta.
- **[REGOLA]** Export CSV, report e calibrazione non girano sul thread principale: usa il worker `reports`
  (`InfrastructureJobs` + `infrastructure-worker.ts`) o uno strumento offline su backup. Mai `VACUUM` in diretta; usa
  `database/script/ottimizza_db.py` fuori diretta se serve.
- Il DB del mazzo si apre in sola lettura con `openSource` (busy timeout già impostato da `schema-db.ts` per gli schemi;
  **[VERIFICA]** per un file semplice `openSource` usa `new Database(source, { readonly: true, fileMustExist: true })`).

### 6.4 Nomi utente sempre con la foto profilo

**[REGOLA]** (preferenza dell'utente del progetto): ogni nome di spettatore mostrato in overlay o dashboard ha la sua foto
accanto; senza foto (Twitch), l'iniziale su un disco colorato.

- DOM: usa `ViewerAvatar` (`apps/overlay/src/ViewerAvatar.tsx`), già usato da `ScoreTicker.tsx` e `Widgets.tsx`.
  **[RACC]** Non creare un'altra copia locale come `Avatar` in `Quizzland.tsx` e `Incastro.tsx`.
- Canvas: `fillTextWithAvatar` o `drawAvatar(ctx, url, x, y, r, name)` di `apps/overlay/src/games/avatar.ts`.
- Conserva il campo `avatar` in ogni tipo che passa uno spettatore (vincitore, classifica, premi). Il ponte accetta solo
  URL `https://` fino a 1.024 caratteri (`viewerOf` in `zfb.ts`); la cache canvas tiene al massimo 256 immagini.

---

<a id="s7"></a>
## 7. Asincronia, timer e resilienza

### 7.1 Orologi e timer

- **[REGOLA]** Durate, scadenze e limite dei 2 s si misurano con l'orologio monotono (`performance.now()`); `Date.now()`
  serve solo per gli istanti salvati nei record e nei log (DIRETTIVE §6 «Clock monotono», §7).
- **[RACC]** Inietta le dipendenze come `TournamentDeps`: `monotonicNow`, `wallNow`, `setTimer`, `clearTimer`, `random`
  (esempio in [§10](#s10)). Nei test usa un orologio finto come la classe `Clock` di `tests/context-tournament.test.ts`.
  Non copiare però il valore predefinito di `TournamentDeps` (`now = Date.now`): per le durate il predefinito di
  ZeroTaboo è `performance.now()`.
- **[REGOLA]** Cancellazione cooperativa (DIRETTIVE §5 «Cancellazione cooperativa», «Confini di cancellazione e side
  effect»): ogni stanza (o partita) possiede un `AbortController`. `dispose()`, `closeAll()`, il cambio di gioco e la fine
  della partita chiamano `abort()`; ogni callback tardivo (timer, risposta del worker `reports`, promessa di export)
  controlla `signal.aborted` e l'identificativo di generazione prima di toccare lo stato o emettere. Passa il `signal`
  alle operazioni asincrone che lo accettano. Ricorda che `AbortSignal` **non** interrompe una query sincrona di
  `better-sqlite3` né un calcolo in corso: per questo le transazioni restano brevi e i report stanno nel worker.
- **[REGOLA]** Un solo timer di round per stanza; prima di crearne uno nuovo cancella il precedente; ogni callback
  controlla di appartenere ancora alla generazione corrente (identificativi di partita e round) prima di agire (DIRETTIVE
  §5 «Fasi delimitate», §13 «ricontrollare generazione e stato»).
- **[REGOLA]** Il cutoff non dipende dallo scatto del timer: una risposta gestita dopo la scadenza è tardiva anche se il
  callback del timer non è ancora partito per un ritardo dell'event loop (I7).
- Pausa e sospensione: congela il tempo residuo e cancella il timer; alla ripresa la nuova scadenza è `ora + residuo`.
- `dispose()` e `closeAll()` cancellano **tutti** i timer (round, emissione coalescente, intervallo) anche se un passo fallisce
  (`disposeGameRooms` in `gameRooms.ts`).
- Nessuna promessa abbandonata: ogni `Promise` ha un `catch` che registra e decide (DIRETTIVE §5 «Nessun fire-and-forget
  incontrollato»).

### 7.2 Ponte ZeroFollowerBot e ordine dei messaggi

- **[REGOLA]** Ordine di arrivo al server, FIFO, per piattaforma: ZEROTABOO §2 dice «primo messaggio valido **ricevuto**».
  Il torneo riordina per ora di scrittura (`reconcile()` in `context-tournament.ts`): **non** copiarlo senza la decisione
  D2. Riusa invece del torneo la deduplica per `platform:messageId`, gli insiemi limitati e la sospensione.
- **[RACC]** Se il ponte cade a metà round (`bridgeChanged()` con `bridgeReady` falso), sospendi il round come fa il torneo
  e marca l'esposizione in corso come interruzione tecnica (esclusa dalla calibrazione, §9.1). Alla ripresa: D15.
- Il ponte può dire `lost` (eventi persi): oggi `zfb.ts` lo scrive solo nel log. **[RACC]** Se l'utente vuole marcare
  quelle esposizioni come interrotte, aggiungi a `ZfbBridge` un callback opzionale, additivo e testato.
- Messaggi senza id (`id === ''`): accettali senza deduplica (come il torneo); conta quanti sono nelle metriche.

### 7.3 Limiti, code e memoria

**[REGOLA]** Ogni struttura che cresce con la chat ha un tetto verificato prima dell'accumulo (DIRETTIVE §3 «Budget di
memoria verificabile», §5 «Code delimitate»).

| Struttura | Tetto proposto [RACC] | Al tetto |
| --- | --- | --- |
| Partecipanti per stanza | 10.000 (`RoomParticipants`) | nuovi rifiutati, avviso una volta alla regia |
| Chiavi messaggio viste per partita | 50.000 | smetti di registrare, conta l'overflow, la carta continua |
| Ultimo tentativo per utente | uno per partecipante ammesso | — |
| Tentativi conteggiati per esposizione | contatori, non liste | — |
| Risposte sbagliate aggregate (se D16 le ammette) | 200 testi per esposizione, 40 caratteri | conteggio «altro» |
| Segnalazioni di moderazione in attesa | 50 per partita | rifiuto tipizzato alla regia |
| Emissioni dello stato | una ogni 200 ms al massimo (come `EMIT_EVERY_MS` in `quizzland.ts`), subito per i cambi di fase | coalescenza |

- **[REGOLA]** Fotografia della configurazione all'avvio della partita (DIRETTIVE §2 «Fotografie coerenti»; ZEROTABOO
  §1.3): una modifica delle impostazioni a partita in corso vale dalla successiva. Non copiare `applySettings` di
  `quizzland.ts`, che ricostruisce il mazzo a metà gioco.
- Stanze senza spettatori: `quizzland` sospende quando nessun client è collegato. **[RACC]** Per ZeroTaboo trattalo come
  interruzione tecnica (stesso percorso della sospensione), non come pausa silenziosa.
- Shutdown (DIRETTIVE §5): la stanza smette di accettare risposte, chiude la carta in corso come interrotta se la
  scrittura riesce entro il budget, cancella i timer; il passo sta prima di `persistence worker` e `database`.

---

<a id="s8"></a>
## 8. Osservabilità e sicurezza

### 8.1 Log e metriche

- **[REGOLA]** Log strutturati con componente, operazione, `matchId`, `roundId`, numero dell'esposizione, esito e causa
  (DIRETTIVE §9). Nel server preferisci `app.log` (pino) o un logger iniettato; se usi `console.*` come le stanze
  esistenti, metti comunque i campi nell'oggetto e un prefisso `[taboo]`.
- **[REGOLA]** Niente dati personali o testo della chat nei log: niente nickname, niente messaggi, niente URL degli
  avatar. Gli id utente solo se indispensabili alla diagnosi, e mai a livello `info` (DIRETTIVE §10 «Protezione dei log»).
- **[REGOLA]** Limita i log ripetitivi (duplicati, tardivi, limite dei 2 s): conta e riassumi, non una riga per messaggio
  (DIRETTIVE §9 «Rate limiting dei log»).
- **[REGOLA]** Distingui `richiesto`, `in corso`, `confermato`, `fallito`, `esito sconosciuto` nei messaggi alla regia
  (DIRETTIVE §9 P0). Gli errori operativi arrivano alla dashboard con `runtime:issue` (componente `game`), come `gameIssue`.
- **[RACC]** Metriche in memoria esposte in `/api/health` o nello stato di regia: messaggi ricevuti, ignorati per motivo
  (duplicato, tardivo, limite 2 s, host, pubblico, ipotesi multipla), carte chiuse per esito, sospensioni, overflow.
  Cardinalità bassa: niente id utente come etichetta (DIRETTIVE §9).

### 8.2 Sicurezza e privacy

- **[REGOLA]** Ogni input dalla chat e dalla dashboard è non fidato fino al confine: comandi validati in `validate.ts`
  (struttura, tipo, enum, lunghezze; `reason` ≤ 300 caratteri come `sanitizeTournamentCommand`), impostazioni con
  `sanitizeSettings` (DIRETTIVE §10, §16 «Sicurezza e privacy»).
- **[REGOLA]** Solo query parametrizzate; il testo degli utenti non entra mai in SQL, percorsi, HTML o `eval`. In React non
  usare `dangerouslySetInnerHTML`.
- **[REGOLA]** Comandi di gioco solo dalla dashboard (dopo `if (clientType !== 'dashboard') return`); gli overlay
  ascoltano e basta.
- **[REGOLA]** Lo stato di regia va solo a `dashboardRoom(key)`; nessuna carta in `secret:word`; nessuna nuova rotta HTTP
  pubblica senza revisione (DIRETTIVE §16: nginx espone solo le classifiche).
- **[REGOLA]** Data minimization e retention per la telemetria (ZEROTABOO §9.1; DIRETTIVE §10): periodo e metodo in D16.
- CSV di export: solo tramite `toCsv` (neutralizza le formule).

---

<a id="s9"></a>
## 9. Test e verifica

### 9.1 Piramide dei test per ZeroTaboo

| Livello | File proposti (nuovi) | Cosa dimostrano |
| --- | --- | --- |
| Unità, logica pura | `tests/taboo-answer.test.ts`, `tests/taboo-scoring.test.ts`, `tests/taboo-deck.test.ts` | Normalizzazione, confini di token, alias, ipotesi multiple; esempi 7 e 10, minimo 0, serie, Jackpot, cantata, classifica ed ex aequo; estrazione stratificata e fallback |
| Proprietà e fuzz | negli stessi file, con un generatore deterministico (seed fisso) | Il matcher non lancia eccezioni su input arbitrari ≤ 140 caratteri; la normalizzazione è idempotente; il punteggio non scende mai sotto 0; l'ordine dei controlli non cambia l'esito per input equivalenti |
| Macchina a stati con orologio finto | `tests/taboo-machine.test.ts`, `tests/taboo-room.test.ts` | Invarianti I1–I12; 90 s esatti; risposta 1 ms prima e alla scadenza; skip residui; sospensione e ripresa con tempo residuo; generazione vecchia ignorata; comando con `expectedVersion` vecchia |
| Persistenza | `tests/taboo-store.test.ts` con `new Database(':memory:')` | Vincoli (un vincitore, append-only), transazioni, migrazione idempotente, rollback su errore, viste di §9.1 |
| Integrazione server | `tests/taboo-bridge.test.ts` con ponte finto (`WebSocketServer` come in `tests/zfb-viewers.test.ts`), `ZEROCADE_DB` temporaneo prima dell'import | Ordine di arrivo, duplicati, messaggi senza id, caduta del ponte a metà round |
| Segretezza della stanza | `tests/taboo-secrecy.test.ts` | Nessuno stato pubblico emesso dalla stanza contiene bersaglio o alias prima della chiusura (i Taboo sì, D26) (scansione di tutti gli stati emessi durante una partita simulata) |
| Integrazione server + overlay | `tests/taboo-socket.test.ts`: server reale avviato come processo figlio con `PORT` libera e `ZEROCADE_DB` temporaneo, client `socket.io-client` (modello in `scripts/smoke-runtime.mjs`) | Un client con `clientType: 'overlay'` non riceve mai `taboo:admin`, e nessun `taboo:state` che riceve contiene bersaglio o alias prima della chiusura; un client `dashboard` riceve la carta. È qui che si scoprono gli errori di cablaggio in `index.ts` (emissione a `io.to(key)` invece di `dashboardRoom(key)`, invio alla connessione) |
| Strumento del mazzo | `gioco-zerotaboo/script/test_mazzo.py` (`unittest`) | 62 carte, cinque Taboo, avvisi D03/D06/F07, casi di normalizzazione condivisi |
| Smoke | `node scripts/smoke-runtime.mjs` e `--bundle` invariati e verdi | Il server parte, risponde e si chiude con ZeroTaboo registrato |

### 9.2 Criteri di accettazione di ZEROTABOO §12 → test

| Criterio v3.0 | Test che lo dimostra |
| --- | --- |
| 1. 62 carte, target unico, cinque divieti, ID stabile | `test_mazzo.py`, `taboo-deck.test.ts` |
| 2. Nessuna soluzione (bersaglio, alias) rivelata prima della chiusura; i Taboo sono pubblici per D26 | `taboo-secrecy.test.ts` (stanza) e `taboo-socket.test.ts` (cablaggio reale) |
| 3. Cinque round da 90 s, somma riproducibile | `taboo-room.test.ts` (orologio finto), riduttore rieseguito sugli eventi salvati = punteggio in memoria |
| 4. Un primo vincitore per carta; duplicati e tardivi senza punti | `taboo-room.test.ts`, `taboo-bridge.test.ts`, `taboo-store.test.ts` |
| 5. Skip e Taboo interrompono la serie; penalità mai doppia | `taboo-scoring.test.ts`, `taboo-machine.test.ts` |
| 6. Jackpot e cantata non si sommano, classifica individuale invariata | `taboo-scoring.test.ts` |
| 7. Modalità sperimentali fuori dalla calibrazione | test della vista/filtro del campione comparabile |
| 8. Contestazioni tracciate con rettifica verificabile | `taboo-store.test.ts` + `taboo-scoring.test.ts` (ricalcolo nell'ordine corretto) |

### 9.3 Regole per scrivere i test

- **[REGOLA]** Test deterministici: orologio e casualità finti, nessuno `sleep` per sperare in una corsa (DIRETTIVE §5
  «Prova deterministica», §11).
- **[REGOLA]** Un test che importa `apps/server/src/db.ts` (anche indirettamente) imposta `ZEROCADE_DB` su un file
  temporaneo **prima** dell'import dinamico e lo rimuove in `t.after`, come `tests/server-game-disposal.test.ts`.
- **[REGOLA]** Nessuna rete esterna: se serve, sostituisci `fetch` con un mock che fallisce.
- I test non sono coperti da `npm run typecheck` (nessun `tsconfig` include `tests/`): scrivili comunque tipizzati e
  dichiaralo nel resoconto.
- Dopo l'aggiunta del `GameDef`, `tests/controls.test.ts` e `tests/help-switches.test.ts` devono restare verdi senza
  modifiche.

### 9.4 Comandi esatti

Dalla radice, verificati in `package.json` e `.github/workflows/ci.yml`:

```text
npm run typecheck
node --import tsx --test tests/taboo-answer.test.ts        (un file durante lo sviluppo)
node --import tsx --test tests/*.test.ts                   (tutta la suite)
python -I -m unittest discover -s database/script
python -I -m unittest discover -s gioco-zerotaboo/script   (dopo aver creato i test del mazzo)
npm run build
node scripts/check-infrastructure.mjs
node scripts/smoke-runtime.mjs
node scripts/smoke-runtime.mjs --bundle
npm audit --omit=dev
git diff --check
```

`python database/script/giochi.py verify` solo se tocchi `database/giochi.sqlite3` (non previsto con D19 nella forma
raccomandata). Avvio di prova del server: `PORT` libera e `ZEROCADE_DB` in una cartella temporanea, mai la porta della
diretta (DIRETTIVE §12).

### 9.5 Soglie di accettazione

- Tutti i comandi sopra con esito pari o migliore della baseline; nessun test saltato o disabilitato; fallimenti
  preesistenti riportati separatamente dalle regressioni nuove (DIRETTIVE §16).
- Ogni invariante I1–I12 e ogni criterio della tabella 9.2 ha almeno un test che fallirebbe senza il codice
  corrispondente.
- Nessun nuovo avviso di build oltre quelli registrati nella baseline (l'avviso sul chunk overlay oltre 500 kB è
  preesistente: **[VERIFICA]** che non peggiori in modo significativo).

---

<a id="s10"></a>
## 10. TypeScript, Node, React e Python: regole con esempi

Regole di DIRETTIVE §13, con esempi brevi. Gli esempi sono orientativi: adatta nomi e firme al piano approvato.

**Tipi semantici e unioni discriminate, niente `any`.**

```ts
// ESEMPIO BUONO
export type TabooDifficulty = 1 | 2 | 3
export type TabooOutcome = 'solved' | 'skipped' | 'taboo' | 'round_timeout'
export type TabooCardState =
  | { kind: 'active'; exposure: number; openedAt: number }
  | { kind: 'closed'; exposure: number; outcome: TabooOutcome; winner: string | null }

// ESEMPIO CATTIVO: stringhe libere e campi facoltativi che permettono stati impossibili
interface Card { state?: string; winner?: any; outcome?: string }
```

**Errori tipizzati per i comandi della regia.**

```ts
export type TabooErrorCode =
  | 'stale-version' | 'wrong-phase' | 'no-active-card' | 'no-skips-left' | 'already-penalized' | 'bridge-missing'
export type TabooReply = { ok: true } | { ok: false; error: TabooErrorCode; message: string }

const fail = (error: TabooErrorCode, message: string): TabooReply => ({ ok: false, error, message })
```

**Dipendenze iniettate e cutoff indipendente dal timer.**

```ts
export interface TabooDeps {
  monotonicNow(): number                   // performance.now() in production
  wallNow(): number                        // Date.now(): records and logs only
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
  random(): number
}

// ESEMPIO BUONO: the deadline is checked when the message is handled
if (deps.monotonicNow() >= round.deadline) return 'late'

// ESEMPIO CATTIVO: relies on the timer having already closed the card, and uses the civil clock
if (this.phase === 'active' && Date.now() < this.endsAt) accept()
```

**Corrispondenza per confini di token.**

```ts
// ESEMPIO BUONO: a window of consecutive message tokens joined must equal the phrase joined
export function containsPhrase(message: readonly string[], phrase: readonly string[]): boolean {
  const target = phrase.join('')
  if (!target) return false
  for (let i = 0; i < message.length; i++) {
    let joined = ''
    for (let j = i; j < message.length && joined.length < target.length; j++) {
      joined += message[j]
      if (joined === target) return true
    }
  }
  return false
}

// ESEMPIO CATTIVO: "brutto" solves RUTTO, "simpatico" solves SIMP, "banana" solves BAN
const solved = text.toLowerCase().includes(card.target.toLowerCase())
```

**Riduttore puro dei punti di un round.**

```ts
export type CardResult =
  | { kind: 'solved'; difficulty: TabooDifficulty; doubled: boolean }   // doubled: Jackpot or sung, never both
  | { kind: 'skipped' } | { kind: 'taboo' } | { kind: 'round_timeout' }

export function scoreRound(start: number, results: readonly CardResult[]): { team: number; deltas: number[] } {
  let team = start
  let streak = 0
  const deltas: number[] = []
  for (const r of results) {
    const before = team
    if (r.kind === 'solved') {
      team += TABOO_RULES.basePoints[r.difficulty] * (r.doubled ? TABOO_RULES.doubleMultiplier : 1)
      streak++
      if (streak % TABOO_RULES.streakEvery === 0) team += TABOO_RULES.streakBonus
    } else {
      streak = 0
      if (r.kind === 'taboo') team = Math.max(0, team - TABOO_RULES.tabooPenalty)
    }
    deltas.push(team - before)
  }
  return { team, deltas }
}
// Test: easy, medium, hard -> 7; with the hard one doubled -> 10 (ZEROTABOO §4).
```

**Immutabilità dello stato condiviso.** Lo stato emesso è una copia nuova; non passare a `emit` gli array interni che poi
muti (DIRETTIVE §6 «Proprietà dello stato»).

```ts
// ESEMPIO BUONO
emitPublic(key, { ...snapshot, leaders: snapshot.leaders.map((l) => ({ ...l })) })
// ESEMPIO CATTIVO: the overlay state would change after the emit
emitPublic(key, this.state)
```

**Promesse sempre osservate.**

```ts
// ESEMPIO BUONO
void reports.run('export', { kind: 'taboo' }).then(send).catch((error: unknown) => issue(key, describe(error)))
// ESEMPIO CATTIVO: a rejected promise disappears
reports.run('export', { kind: 'taboo' }).then(send)
```

**React: effetti con cleanup simmetrico, conto alla rovescia locale dal valore del server.**

```tsx
// Taboo.tsx: the server is authoritative; the overlay only counts down from remainingMs
const { taboo, tabooAt } = useOverlay()
const [now, setNow] = useState(() => performance.now())
useEffect(() => {
  const id = window.setInterval(() => setNow(performance.now()), 250)
  return () => window.clearInterval(id)
}, [])
const leftMs = taboo ? Math.max(0, taboo.remainingMs - (now - tabooAt)) : 0
```

Chiavi stabili nelle liste (id utente o id esposizione, mai l'indice); un risultato che arriva per un `roundId` diverso da
quello in vista si scarta (DIRETTIVE §13 React).

**Python dello strumento del mazzo.**

```python
# ESEMPIO BUONO: the connection is closed on every path; foreign keys are on
from contextlib import closing
import sqlite3

def carica(path: str) -> list[tuple[str, str]]:
    with closing(sqlite3.connect(path)) as db:
        db.execute('PRAGMA foreign_keys = ON')
        return db.execute('SELECT codice, bersaglio FROM ...').fetchall()

# ESEMPIO CATTIVO: "with sqlite3.connect(...)" commits but does NOT close the connection
```

Lancia i test Python con `-I` (come la CI) e usa `unittest`; nessuna dipendenza esterna serve per il mazzo (DIRETTIVE §13
«Python degli strumenti»).

---

<a id="s11"></a>
## 11. Piano di lavoro a fasi

Ogni fase finisce con i suoi test verdi e un breve resoconto all'utente. Non iniziare una fase se le decisioni indicate non
hanno risposta.

**Stato (17/11/2026): le fasi 0–7 sono tutte completate**, con le decisioni D1–D26 di [§14.1](#s14); l'elenco dei file
scritti è in [Appendice B](#sb). La tabella resta come traccia del piano e come modello per estensioni (per esempio ruota
delle penitenze o progressione stagionale, oggi fuori ambito).

| Fase | File da toccare | Criterio di uscita | Cosa riferire |
| --- | --- | --- | --- |
| **0 · Analisi** (decisioni D1–D25) | nessuno | Baseline registrata ([§3](#s3) Fase A); decisioni bloccanti risposte; piano approvato | Baseline con numeri; decisioni ricevute; piano |
| **1 · Tipi e logica pura** (D1–D6, D10, D13) | `packages/shared/src/taboo.ts`, `packages/shared/src/index.ts` (solo export dei tipi), `apps/server/src/taboo-answer.ts`, `apps/server/src/taboo-scoring.ts`, `apps/server/src/taboo-machine.ts`, `tests/taboo-answer.test.ts`, `tests/taboo-scoring.test.ts`, `tests/taboo-machine.test.ts`, casi condivisi in `gioco-zerotaboo/data/` | Test unitari, di proprietà e della macchina verdi; `npm run typecheck` verde; nessun I/O nei moduli puri | Invarianti coperte; casi limite; decisioni applicate |
| **2 · Mazzo e persistenza** (D16, D18, D19) | `gioco-zerotaboo/data/`, `gioco-zerotaboo/script/mazzo.py`, `gioco-zerotaboo/script/test_mazzo.py`, `database/ZeroTaboo.sqlite3`, `apps/server/src/taboo-deck.ts`, `apps/server/src/taboo-db.ts`, `apps/server/src/db.ts` (solo costruzione ed export dello store), `tests/taboo-deck.test.ts`, `tests/taboo-store.test.ts` | 62 carte caricate e validate; avvisi editoriali elencati, non corretti; schema operativo idempotente; vincoli provati | Esito del validatore; schema; eccezione delle chiavi esterne tra file |
| **3 · Server e registrazione** (D7, D8, D11–D15, D21, D22, D24) | `apps/server/src/taboo.ts`, `apps/server/src/validate.ts`, `apps/server/src/index.ts`, `packages/shared/src/index.ts` (`GameDef`, eventi), `tests/taboo-room.test.ts`, `tests/taboo-bridge.test.ts`, `tests/taboo-secrecy.test.ts`, `tests/taboo-socket.test.ts` | Suite completa verde; smoke verdi; ingresso solo dal ponte (o come deciso); segretezza provata | Modifiche additive ai file condivisi; percorsi di errore e sospensione |
| **4 · Overlay** | `apps/overlay/src/Taboo.tsx`, `apps/overlay/src/taboo.css`, `apps/overlay/src/store.ts`, `apps/overlay/src/App.tsx` | `npm run build` verde; nomi con avatar; nessuna soluzione prima della chiusura | Cosa hai visto davvero (browser o no); prova visuale in OBS non eseguita salvo conferma |
| **5 · Dashboard** | `apps/dashboard/src/components/TabooSidebar.tsx`, `apps/dashboard/src/pages/GamesPage.tsx`, `apps/dashboard/src/store.ts`, eventualmente `apps/dashboard/src/components/Regia.tsx` (`BRAIN_GAMES`) | Build verde; comandi con `expectedVersion` e `ack`; errori tipizzati mostrati; gioco presente nei menu | Comandi disponibili; cosa vede lo streamer |
| **6 · Telemetria e report** (D16, D17) | `apps/server/src/taboo-db.ts` (viste), `apps/server/src/infrastructureJobs.ts`, `apps/server/src/infrastructure-worker.ts`, rotta di export in `apps/server/src/index.ts`, eventuale strumento offline | Campi di §3.7 e §9.1 presenti; campione comparabile filtrato; nessun calcolo pesante sul thread principale | Metriche disponibili; cosa resta manuale (riclassificazioni) |
| **7 · Verifica finale e documenti** | `gioco-zerotaboo/README.md`, `gioco-zerotaboo/TODO.md`, `README.md`, `database/README.md`, `database/DB.md`, `scripts/package-win.mjs`, `docs/STATO_DOCUMENTAZIONE.md` | Tutti i comandi di [§9.4](#s9); DoD di [§12](#s12) spuntata con evidenze | Resoconto finale ([§12.2](#s12)) |

---

<a id="s12"></a>
## 12. Definition of Done e modello di resoconto

### 12.1 Checklist (DIRETTIVE §15 specializzata)

Spunta una casella solo con un'evidenza (comando eseguito, test, file). Una casella non verificabile resta vuota e va
nei rischi residui.

- [ ] Le regole di ZEROTABOO §1–§5 implementate in v1 hanno ciascuna un test che le dimostra (tabella [§9.2](#s9)).
- [ ] Gli altri giochi si comportano come prima: suite completa e smoke verdi, nessuna modifica non additiva ai file condivisi.
- [ ] `npm run typecheck` e `npm run build` verdi.
- [ ] `node --import tsx --test tests/*.test.ts` verde, con i nuovi test inclusi; nessun test saltato.
- [ ] Test Python del mazzo verdi con `-I`.
- [ ] I1–I12 provate, incluse risposta alla scadenza, duplicato, generazione vecchia e comando con versione vecchia.
- [ ] Nessuna data race o attesa circolare nota: un solo proprietario dello stato di stanza; nessuna transazione
      attraversa un `await`.
- [ ] Errori e cancellazioni gestiti: timer cancellati in `dispose()`, `closeAll()` nel passo di shutdown, commit fallito
      → sospensione con motivo.
- [ ] Risorse rilasciate: connessione del mazzo chiusa dopo il caricamento; strutture limitate come in [§7.3](#s7).
- [ ] Segretezza: nessuno stato pubblico con bersaglio o alias prima della chiusura (i Taboo sì, D26), provata sia sulla stanza sia
      con un client overlay reale (`tests/taboo-socket.test.ts`).
- [ ] Ogni stanza ha un `AbortController`: dopo `dispose()` nessun callback tardivo modifica lo stato o emette.
- [ ] Input validati al confine (`sanitizeTabooCommand`, impostazioni); niente testo utente in SQL, log o HTML.
- [ ] Nessuna nuova dipendenza; se ce n'è una, motivata e verificata (DIRETTIVE §10).
- [ ] Ogni nome di spettatore mostrato ha la sua foto (o iniziale).
- [ ] Schema normalizzato, chiavi esterne attive, migrazione registrata e provata; nessun `VACUUM` in diretta.
- [ ] Documentazione aggiornata: `gioco-zerotaboo/README.md`, `TODO.md`, `README.md`, `database/DB.md`/`README.md`,
      pacchetto Windows.
- [ ] Moduli con responsabilità, dipendenze direzionali e API documentate; nessun nuovo ciclo
      (`node scripts/check-infrastructure.mjs` verde).
- [ ] Decisioni aperte risolte o elencate come limiti; nessuna scelta presa in silenzio.
- [ ] Il resoconto distingue misure nuove da dati storici e indica commit, comandi e ambiente.

### 12.2 Modello di resoconto finale (in italiano)

```markdown
## ZeroTaboo — resoconto della fase <N> / finale

**Modifiche effettuate**: <file nuovi e modificati, comportamento introdotto>.
**Motivazione tecnica**: <regola di ZEROTABOO e direttiva applicata, scelta fatta>.
**Decisioni usate**: D<n> = <risposta dell'utente, data>. **Decisioni ancora aperte**: <elenco>.

**Verifiche realmente eseguite** (ambiente: Windows x64, Node <versione>, Python <versione>, commit <hash>):
| Comando | Esito |
| --- | --- |
| npm run typecheck | <esito reale> |
| node --import tsx --test tests/*.test.ts | <N test, falliti, saltati> |
| ... | ... |

**Non eseguito** (e perché): <prova visuale in OBS, diretta reale Twitch/TikTok, ponte reale, soak, CI su GitHub, ...>.
**Prestazioni**: <misure prima/dopo, oppure "non misurate: intervento non prestazionale">.
**Rischi residui**: <limiti, esiti sconosciuti possibili, casi non coperti>.
**Compatibilità**: <eventi Socket.IO nuovi, tabelle nuove, migrazioni, nessuna modifica ad API esistenti>.
**Modularità e riuso**: <confini, direzione delle dipendenze, cosa è riusato e cosa no>.
```

---

<a id="s13"></a>
## 13. Errori tipici da evitare

1. Cercare la soluzione con `includes()` sul testo: falsi positivi (RUTTO in «brutto», SIMP in «simpatico»).
2. Accettare plurali o sinonimi «perché ovvi»: solo alias approvati della revisione in gioco (D1).
3. Riusare `answerKey`, `guessKey` o `inflections` senza confrontarne la semantica (cifre perse, una sola parola,
   flessioni automatiche).
4. Mandare la carta (bersaglio e alias) con l'evento della stanza (`io.to(key)`) o con `secret:word`: la vedrebbero gli overlay. Fanno eccezione i cinque Taboo, pubblici per D26.
5. Fidarsi dell'overlay per il tempo o per i punti: il server è l'unica autorità (ZEROTABOO §1.2).
6. Misurare il tempo con `Date.now()` o affidarsi allo scatto del timer per il cutoff.
7. Copiare `reconcile()` del torneo: ZeroTaboo usa l'ordine di arrivo salvo decisione contraria (D2).
8. Far arrivare la stessa risposta due volte (ponte e `broadcastEvent`).
9. Contare l'host come giocatore.
10. Aggiornare la soglia o le regole a partita in corso, o ricostruire il mazzo a metà partita.
11. Correggere i punti con `UPDATE`/`DELETE`: le rettifiche sono eventi nuovi.
12. Riclassificare le carte in automatico dalla telemetria.
13. Scrivere una riga di DB per ogni messaggio della chat, o calcolare report sul thread principale.
14. Salvare testi dei messaggi, nickname o id in chiaro nella telemetria senza decisione (D16).
15. Implementare tutte le varianti di §6 «perché ci sono»: YAGNI, chiedi (D23).
16. Mostrare un nome senza avatar, o creare una nuova copia locale del componente avatar.
17. Importare `db.ts` in un test senza `ZEROCADE_DB` temporaneo; avviare un server di prova sulla porta della diretta.
18. Dichiarare «verificato in OBS» o «provato in diretta» senza averlo fatto.
19. Correggere in silenzio il mazzo (D03, D06, F07, alias di E08 e D09): si segnala, decide l'utente.
20. Caricare le 16 carte candidate G–J di ZEROTABOO §12.1.

---

<a id="s14"></a>
## 14. Decisioni: risposte dell'utente e punti ancora aperti

### 14.1 Decisioni prese

Le risposte dell'utente sono del 16/11/2026 (D26 del 17/11/2026) e sono registrate anche in `gioco-zerotaboo/TODO.md`.
La colonna «Punto» ricorda perché la domanda era aperta. Chi modifica il comportamento qui descritto deve chiedere
conferma all'utente, non cambiare in silenzio.

| ID | Punto (fonti) | Decisione adottata | Dove nel codice |
| --- | --- | --- | --- |
| D1 | Plurali e flessioni (§2, §7) | Solo bersaglio e alias approvati, **senza** plurali automatici; i plurali utili si aggiungono come alias nel mazzo | `taboo-answer.ts` |
| D2 | Ordine: arrivo o scrittura (§2, `reconcile()` del torneo) | Vince il primo messaggio **arrivato al server**; `reconcile()` non è usato | `taboo.ts` `offer()` |
| D3 | «Spazi» e apostrofi (§2) | Confronto per finestre di token concatenati: «rage quit» = RAGEQUIT | `taboo-answer.ts` `findPhrase` |
| D4 | «Più ipotesi distinte» (§2) | Separatori di elenco (`, ; / \| a capo`, «o», «oppure») con almeno 2 parti, più tetto di 8 token oltre la risposta (`maxExtraTokens`) | `hypotheses()` |
| D5 | Cos'è un «tentativo» (§2) | Il limite di 2 s vale per **ogni commento** mentre una carta è attiva | `taboo.ts` (motivo `cooldown`) |
| D6 | Piattaforma competitiva (§2, §4) | Si sceglie all'avvio della partita (`tabooPlatform`); una risposta esatta dell'altra piattaforma chiude la carta con i punti di squadra e **senza vincitore individuale** (`lastWinner.user = null`) | `taboo-machine.ts`, `taboo.ts` |
| D7 | Sorgenti ammesse | Partita vera: **solo il ponte** ZeroFollowerBot (altre sorgenti: motivo `source`). Simulatore solo in modalità `practice`, fuori classifica e telemetria | `taboo.ts`, `index.ts` (`sim:event`) |
| D8 | Skip e Taboo: da dove | Solo dai pulsanti della dashboard (prudente, da confermare) | `TabooSidebar.tsx` |
| D9 | READY, avvio round, intervallo | Il round parte con un **pulsante** (`start-round`); intervallo fisso di 20 s, configurabile 15–30 (`tabooIntermissionSeconds`) | `TABOO_RULES`, impostazioni |
| D10 | Vittoria a 25 | La vittoria si segna (`reachedThreshold`) e resta registrata, ma **la partita prosegue fino al round 5** | `taboo-machine.ts` |
| D11 | Voto del round 3 | La chat vota con le lettere A–F; pareggio o nessun voto: a sorte tra le categorie con carte | `taboo.ts`, `availableCategories` |
| D12 | Vincolo del round 4 | Lo sceglie il bot a caso tra `TABOO_NARRATIVES` | `taboo-machine.ts` |
| D13 | Carta cantata | A comando della regia (`sing`), una volta, ultimi 20 s, mai sulla carta Jackpot | `taboo-machine.ts` |
| D14 | Rettifiche (§3.5) | La regia segnala (`report`) con l'istante della violazione e decide (`decide`) nell'intervallo; se verificabile, la carta diventa «Taboo» e il round si ricalcola con eventi di correzione (prudente, da confermare) | `taboo-scoring.ts` `rectifyToTaboo`, `correctionDeltas` |
| D15, D24 | Ponte caduto e pausa | Timer congelato, esposizione marcata «interrotta», ripresa con il tempo residuo; la pausa della regia usa lo stesso percorso (prudente, da confermare) | `bridgeChanged()`, `pause()` |
| D16 | Privacy della telemetria (§9.1) | ID giocatore = HMAC con chiave locale nel DB operativo (fuori da Git); nessun nickname o avatar; risposte sbagliate solo aggregate senza utente; conservazione **90 giorni**, applicata all'avvio del server, mai in diretta (prudente, da confermare) | `taboo-db.ts` `purgeExpired` |
| D17 | Classifiche generiche | Solo la classifica propria di ZeroTaboo; nessuna scrittura in `game_scores` (prudente, da confermare) | `index.ts` |
| D18 | Mazzo: avvisi editoriali | Si **segnalano**, non si correggono: D09 senza alias, E08 alias discordanti, D03/D06/F07 con Taboo della stessa radice | `mazzo.py`, tabella `avvisi` |
| D19 | Dove vive il mazzo | `database/ZeroTaboo.sqlite3`, fonte JSON `gioco-zerotaboo/data/mazzo-v3.0.json`, strumento `mazzo.py` | [§5.7](#s5) |
| D20 | Esclusione nelle due partite successive | Per stanza, rilassata se il mazzo non basta (prudente, da confermare) | `taboo-deck.ts` `drawCard` |
| D21 | Identità nel catalogo | id `zerotaboo`, nome `ZeroTaboo`, categoria `Parole` | `GAME_DEFS` |
| D22 | Voce di ZeroFollowerBot | Non legge le risposte durante una carta attiva (`zfb.skip` quando `listening()`) | `index.ts` |
| D23 | Ambito v1 | Senza ruota delle penitenze, esibizioni, modalità separate, progressione stagionale, premi nella scena (le funzioni di calcolo esistono in `taboo-scoring.ts`) | — |
| D25 | Parametri configurabili | La dashboard espone soglia (5–100, predefinita 25), piattaforma, intervallo (15–30 s) e animazioni | `GAME_DEFS` |
| **D26** | Taboo visibili al pubblico (17/11/2026) | L'overlay mostra le **cinque parole Taboo** della carta aperta («le parole che non posso dire»). **Deroga** a ZEROTABOO §3.2 e §12.2 e all'invariante I8 originale, solo per i Taboo: bersaglio e alias restano nascosti fino alla chiusura | `TabooPublicState.forbidden` |

### 14.2 Punti ancora da confermare

Le voci «prudente, da confermare» sopra (D8, D14, D15/D24, D16, D17, D20) sono scelte di default fatte durante il lavoro e
non ancora approvate esplicitamente. Restano inoltre senza risposta:

- **D18**, parti non toccate: numerazione iniziale delle revisioni (l'esempio di §11 ha `revision: 3`), «dieci» come alias
  di F07, significato di «serie corretta ×2» (§10);
- **Moderatori**: il `Viewer` non ha un campo «moderatore»; le segnalazioni passano solo dalla dashboard;
- **ZEROTABOO.md** da aggiornare se la deroga D26 diventa definitiva: §3.2, §12.2 e la nota sui Taboo di §10.

### 14.3 Divergenze tra il piano della guida e il codice scritto

| Piano della guida | Realtà |
| --- | --- |
| §4.4 `taboo.offer(roomKey, {user, text, messageId, platform, writtenAt})` | `room.offer({ source, user, text, messageId, platform })`; `source` è `'bridge'` o `'simulator'`; l'ora di ricezione la misura la stanza; `writtenAt` non è usato (D2) |
| §4.1 file di dashboard: `TabooSidebar.tsx` | In più `useTabooSend.ts` (invio comandi con errori tipizzati) e `pages/TabooCardPage.tsx` (**vista streamer**, [Appendice B](#sb)) |
| §6.2 mazzo con le tabelle dello schizzo | In più la tabella `avvisi` (avvisi editoriali persistiti) e la vista `mazzo_corrente`; tutte le tabelle `STRICT` |
| §6.2 tabelle operative `taboo_*` | In più `taboo_meta` (chiave HMAC, versioni) e `taboo_wrong_answers` (risposte sbagliate aggregate); le colonne intere `STRICT` rifiutano i millisecondi frazionari: lo store arrotonda (bug trovato dal server vero) |
| §6.1 chiavi esterne tra due file | Eccezione documentata: le esposizioni salvano `card_code` + `card_revision`, il caricatore verifica che esistano |
| §5.2 «non riusare `answerKey()`» | `taboo-answer.ts` definisce una propria `answerKey` (token concatenati, cifre incluse), diversa da quella di `wordAssociation.ts` |
| §9 test di integrazione | In più `tests/helpers/tabooHarness.ts` (stanza con orologio finto e dipendenze iniettate) |

<a id="sa"></a>
## Appendice A — Casi di prova ricavati dal mazzo

Casi da inserire nei test del matcher e del validatore. «Accetta» e «rifiuta» presuppongono le proposte di D1, D3 e D4;
se l'utente decide diversamente, aggiorna l'attesa del caso, non toglierlo.

**Confini di token (devono essere rifiutati)**

| Carta | Messaggio | Motivo |
| --- | --- | --- |
| A02 RUTTO | «che brutto» | sottostringa, non token |
| B06 SIMP | «sei simpatico» | sottostringa |
| C02 BAN | «una banana» | sottostringa |
| C03 LAG | «andiamo al lago» | sottostringa |
| C04 FOLLOW | «quanti follower» | parola diversa; accettarla richiede un alias (D1) |
| A01 PETO | «lo ripeto» | sottostringa |
| B02 TROLL | «il trolley» | sottostringa |

**Normalizzazione (devono essere accettati)**

| Carta | Messaggio |
| --- | --- |
| F03 PIZZA CON L'ANANAS | «Pizza con l’ananas!!», «PIZZA CON L'ANANAS», «pizza con l ananas» |
| B07 RAGEQUIT | «rage quit», «RageQuit» (D3) |
| A09 FRIENDZONE | «friend zone» (D3) |
| C01 MICROFONO SPENTO | «è il microfono spento?» (risposta completa più testo accessorio); alias «mic spento» |
| F07 MAMMA CHE CHIAMA 10 VOLTE | «mamma che chiama 10 volte»; «dieci» solo se diventa alias (D18) |

**Alias «da non accettare automaticamente» di ZEROTABOO §8 (devono essere rifiutati)**

| Carta | Messaggi da rifiutare |
| --- | --- |
| A10 RIPORTO | «calvizie», «pelata» |
| A11 VOCALE INTERMINABILE | «audio», «messaggio» |
| A12 SALUTO NON RICAMBIATO | «ignorato» |
| C01 MICROFONO SPENTO | «muto» |
| C08 FINTA DONAZIONE | «donazione» |
| D06 CARTA IGIENICA FINITA | «rotolo finito» |
| D07 FENICOTTERO GONFIABILE | «fenicottero» |
| D10 GOMMA MASTICATA SOTTO IL BANCO | «gomma da cancellare» |
| E04 INFLUENCER SENZA FOLLOWER | «influencer fallito» |
| E05 EX CHE RISPUNTA | «ex tossico» |
| E07 SELFIE IN PALESTRA | «palestrato» |
| E08 COMPAGNO FANTASMA | «fantasma» |
| E09 AMICO CHE CONOSCE TUTTI | «amico» |
| F06 NONNA CHE TI RIEMPIE IL PIATTO | «nonna» |

**Validatore del mazzo (fatti del mazzo v3.0, controllati il 17/11/2026)**

- 62 carte: A 12, B 10, C 10, D 10, E 10, F 10; difficoltà iniziali 18 🟢, 29 🟡, 15 🔴; nessun bersaglio duplicato;
  ogni carta ha cinque Taboo distinti.
- Taboo composti o con simboli: B07 «Alt+F4», E02 «Terra piatta», F10 «Amici Miei»; bersagli con apostrofo o cifre:
  F03, F07.
- Avvisi di radice comune tra Taboo e bersaglio: D03 «Denti»/DENTIERA, D06 «Cartone»/CARTA, F07 «Chiamata»/CHIAMA.
- Ipotesi multiple (attese secondo D4): «peto, rutto, brufolo» → ignorato; «secondo me è il peto» → accettato.
- Cutoff: risposta ricevuta 1 ms prima della scadenza → accettata; alla scadenza esatta → rifiutata (I7).
- Punteggio: facile, media, difficile = 7; con la difficile Jackpot = 10; Taboo a squadra 0 → resta 0; tre risolte, skip,
  tre risolte → due bonus serie; nessun bonus serie nel round successivo senza tre nuove consecutive.

---

<a id="sb"></a>
## Appendice B — Mappa di ciò che è stato implementato

Aggiornata al 17/11/2026. Verifiche eseguite a diretta chiusa (`gioco-zerotaboo/TODO.md`, fase 7): `npm run typecheck`
verde; suite TypeScript 340/340 senza saltati; Python 20/20 (`gioco-zerotaboo/script`) e 20/20 (`database/script`);
`npm run build`, `node scripts/check-infrastructure.mjs`, `smoke-runtime.mjs` (anche `--bundle`) verdi;
`npm audit --omit=dev` senza vulnerabilità; `git diff --check` pulito sui file toccati.

### B.1 Moduli

| File | Contenuto |
| --- | --- |
| `packages/shared/src/taboo.ts` | `TABOO_RULES` (inclusi i tetti: 50.000 chiavi messaggio, 50 segnalazioni, 200 risposte sbagliate, retention 90 giorni), `TABOO_ROUND_PLANS` (piani dei round come dati), `TABOO_NARRATIVES`, `TABOO_CATEGORIES`, `TabooConfig` (fotografia dell'avvio), `TabooCommand` (unione discriminata con `expectedVersion`), `TabooPublicState` (con `forbidden`, D26), `TabooAdminState`, `TabooErrorCode` (`stale-version`, `wrong-phase`, `no-active-card`, `no-skips-left`, `already-penalized`, `bridge-missing`, `bad-input`, `too-many-reports`, `unavailable`), `TabooReply` |
| `apps/server/src/taboo-answer.ts` | `tokenize`, `answerKey`, `compileAnswer`, `findPhrase`/`containsPhrase`, `hypotheses`, `matchAnswer` → `AnswerVerdict`, `sharesRoot` per l'avviso di radice comune |
| `apps/server/src/taboo-scoring.ts` | `scoreRound`, `rectifyToTaboo`, `correctionDeltas`, `tally`, `rankPlayers` (ex aequo 1, 1, 3), `redHunters`, `voiceOfChat`, `teamInForm` |
| `apps/server/src/taboo-machine.ts` | Transizioni pure partita/round/carta, vittoria di squadra senza vincitore individuale (D6), Jackpot, cantata, voto, segnalazioni |
| `apps/server/src/taboo-deck.ts` | `loadDeck` (sola lettura + rivalidazione), `validateDeck`, `drawCard` stratificata con `random` iniettato, `availableCategories` |
| `apps/server/src/taboo-db.ts` | `TabooStore`: schema `taboo_*` idempotente, trigger append-only su `taboo_score_events`, viste `taboo_effective_winners`, `taboo_match_scores`, `taboo_exposure_report`, `taboo_comparable_exposures`; `abandonOpenMatches` (all'avvio), `purgeExpired`, `exposuresTable`, `calibrationTable` |
| `apps/server/src/taboo.ts` | `TabooRoom` (un solo proprietario dello stato: timer, deduplica, limiti, effetti) e `TabooRooms` (`open/get/close/closeAll`); metriche con i motivi di scarto `not-listening`, `late`, `source`, `host`, `audience`, `duplicate`, `cooldown`, `multiple`, `invalid`, `wrong`, `limit` |
| `apps/server/src/index.ts` | Ponte → `room.offer`; `sim:event` accettato solo in prova; eventi `taboo:state` (a `io.to(key)`) e `taboo:admin` (solo `dashboardRoom(key)`); `taboo:control` con `ack`; pausa/ripresa; `zfb.skip` durante la carta attiva; rotte `GET /api/taboo/exposures.csv` e `/api/taboo/calibration.csv` (job `export` nel worker); passo di shutdown «ZeroTaboo rooms»; all'avvio `abandonOpenMatches` e `purgeExpired` |
| `apps/server/src/validate.ts` | `sanitizeTabooCommand` |
| `apps/overlay/src/Taboo.tsx`, `taboo.css`, `store.ts` | Scena pubblica: Taboo della carta aperta, difficoltà con testo e segni (non solo colore), `ViewerAvatar` per ogni nome, animazioni silenziabili e `prefers-reduced-motion`, countdown locale solo mentre il round gira (`taboo`, `tabooAt`) |
| `apps/dashboard/src/components/TabooSidebar.tsx`, `useTabooSend.ts` | Regia: partita, carta privata, skip/Taboo/cantata, categoria, segnalazioni e rettifiche, avvisi del mazzo, metriche, simulatore per la prova |
| `apps/dashboard/src/pages/TabooCardPage.tsx` (rotta `/taboo`) | **Vista streamer** a tutto schermo per un secondo monitor o il telefono: bersaglio, Taboo e alias solo qui e nella dashboard; countdown locale dal valore del server |
| `gioco-zerotaboo/script/mazzo.py` | `parse`, `validate`, `import` (file temporaneo → verifica → sostituzione), `verify`, `export` (CSV con BOM) |
| `scripts/package-win.mjs` | Copia `ZeroTaboo.sqlite3` accanto al server (senza il mazzo il gioco non parte) |

### B.2 Cose che la guida originale non prevedeva

- **Vista streamer** (`/taboo`): il regolamento vuole la carta visibile allo streamer e non al pubblico, e la dashboard da
  sola era scomoda in diretta. Chi la tocca deve mantenere la regola «il bersaglio sta solo qui e in dashboard».
- **Modalità `practice`**: il simulatore della dashboard gioca una partita fuori classifica e fuori telemetria; nella
  partita `standard` il simulatore è rifiutato (motivo `source`).
- **Fotografia della configurazione** (`TabooConfig`): soglia, piattaforma, intervallo e modalità si fissano a
  `start-match`; modificare le impostazioni a partita in corso vale dalla successiva.
- **Partite abbandonate**: all'avvio del server le partite rimaste aperte nel DB sono chiuse (`abandonOpenMatches`).
- **Calibrazione**: `suggested_label` e `qa_alerts` in `calibration.csv` chiedono una revisione, non cambiano mai il
  livello. Soglie e campione comparabile come in [§5.8](#s5).
- **Limite noto**: la rettifica sposta la carta contestata a «Taboo» e ricalcola il round; il punteggio di squadra è
  corretto, ma una serie già mostrata non viene ricostruita a schermo.

### B.3 Comandi di verifica rapidi

```text
npm run typecheck
node --import tsx --test tests/taboo-*.test.ts
python -I -m unittest discover -s gioco-zerotaboo/script
node --import tsx --test tests/*.test.ts
```

`tests/taboo-socket.test.ts` e `tests/taboo-bridge.test.ts` avviano un server vero su una porta libera con un DB
temporaneo (mai quello della diretta) e un ponte ZeroFollowerBot finto.

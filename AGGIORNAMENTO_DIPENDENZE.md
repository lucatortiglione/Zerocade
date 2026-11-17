# Aggiornamento delle dipendenze

> **Revisione documentale — 16 novembre 2026.** Inventario del checkout al 16 novembre 2026: Node 26.13.1, npm 12.2.2, better-sqlite3 13.2.0 e SQLite caricato 3.54.1. Il profilo statistico ZeroContext ha requisiti separati in `gioco-zerocontext/requirements-contexts.txt`; quello neurale opzionale usa `requirements-semantic.txt`. I controlli npm/PyPI e gli esiti di build sotto restano riferiti al 15 novembre; questa revisione non aggiorna le dipendenze.
> [Indice e stato della documentazione](docs/STATO_DOCUMENTAZIONE.md).

Registro degli inventari e degli aggiornamenti di librerie, runtime e strumenti di ZeroCade,
ordinato dal più recente. Per ogni aggiornamento registrare versioni prima/dopo, fonti ufficiali,
adeguamenti, verifiche e limiti, secondo le sezioni 10 e 16 di [DIRETTIVE.md](DIRETTIVE.md).
I comandi generali di sviluppo e controllo sono nel [README.md](README.md).

## Annullamento del vincolo Zipf — 16 novembre 2026

Annullata la soglia minima 2,85 e rimosso `wordfreq==3.1.1` dai requisiti aggiunti ai
profili contexts e semantic. Il resto della configurazione delle dipendenze rimane invariato.
La voce seguente conserva l'operazione precedente come cronologia; il filtro non è attivo.

## Zipf delle segrete ZeroContext — 16 novembre 2026 (annullato)

Aggiunto `wordfreq==3.1.1` ai requisiti dei profili contexts e semantic di ZeroContext,
riusando la versione già impiegata dall'ambiente di ZeroAssociazioni. Serve a misurare
la soglia italiana sul lemma, **Zipf ≥ 2,85**, per segrete nuove e storiche.
Installazione e `pip check` riusciti in entrambi gli ambienti; 45 test ZeroContext superati.
Nessuna modifica ai pacchetti npm o ai modelli del profilo statistico.

## Adeguamento degli avvisi di build e avvio del 15 novembre 2026

- **Fastify FSTDEP023:** sostituita l'opzione di primo livello `disableRequestLogging` con
  `logController: new LogController({ disableRequestLogging: true })` in `apps/server/src/index.ts`,
  secondo l'[API ufficiale](https://fastify.dev/docs/latest/Reference/Server/#logcontroller).
  Conservati logger, redazione dei segreti e gestione applicativa degli errori. Le prove smoke
  del sorgente e dei bundle ora controllano anche l'assenza di FSTDEP023 nei log del processo.
- **Vite, chunk oltre 500 kB:** l'analisi dei moduli ha identificato `contextPlurals.json` nel
  bundle dell'overlay. La configurazione usa un gruppo
  [Rolldown codeSplitting](https://rolldown.rs/reference/OutputOptions.codeSplitting) dedicato a
  quel solo modulo dati. Il chunk App passa da **629,17 kB a 234,69 kB**, con dizionario separato
  di **394,55 kB**. Ogni chunk JavaScript di dashboard e overlay resta sotto 500 kB senza alzare
  la soglia. Il dizionario rimane una dipendenza statica: nessun nuovo caricamento asincrono dei
  giochi né promessa di riduzione del traffico complessivo.

`npm run build`, `npm run typecheck` e smoke del sorgente e dei bundle superati.
Ricostruito anche il pacchetto Windows; smoke superato su copia isolata, con controllo di FSTDEP023.
Log in `release/build-avvisi.log` e `release/package-avvisi.log`.
Nessuna nuova dipendenza o modifica dei dati.

## Aggiornamenti applicati il 15 novembre 2026

Verificati i registri npm/PyPI e le fonti ufficiali, poi aggiornati manifest e lockfile.
Base Git `77e862cb3a912c271d37026db4f9cf50e3f7db20`, conservando le modifiche già presenti.
Backup dei file iniziali, hash, risposte dei registri, note ufficiali e confronti dei sorgenti in
`release/aggiornamenti-20261115-220359/`; copia del pacchetto precedente in
`zerocade-win-x64-prima.zip` nella stessa cartella. Questi artefatti locali sono ignorati da Git.

### Dipendenze dirette e runtime

| Componente | Prima → dopo | Analisi e applicazione |
|---|---|---|
| Fastify | 5.12.7 → **5.12.8** | [Release ufficiale](https://github.com/fastify/fastify/releases/tag/v5.12.8): correzioni su timeout di streaming, parser, trailer e tipi. [GHSA-3qgw-9275-xf8w](https://github.com/fastify/fastify/security/advisories/GHSA-3qgw-9275-xf8w) riguarda `handlerTimeout` non nullo, non configurato dal server attuale; adottata comunque la versione corretta in tutti e tre i manifest. Nessuna attivazione del compilatore del router richiesta. |
| @fastify/static | 10.1.8 → **10.1.11** | Lette anche [10.1.9](https://github.com/fastify/fastify-static/releases/tag/v10.1.9) e [10.1.10](https://github.com/fastify/fastify-static/releases/tag/v10.1.10): correzioni per directory, encoding, priorità dei root e errori 403. Il gestore del progetto legge già `statusCode`, compatibile con il nuovo errore `FST_STATIC_FORBIDDEN_PATH`. Rimosso l'override locale di glob: upstream ora richiede la serie 14. |
| better-sqlite3 | 13.0.3 → **13.2.0** | Lette [13.1.0](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.1.0), [13.1.1](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.1.1) e [13.2.0](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.2.0). Saltata la 13.1.0 segnalata upstream come non utilizzabile. La nuova risoluzione privilegia i binding compilati localmente: adeguato il confezionamento, descritto sotto. Nessun uso applicativo di `unsafeMode()`. |
| SQLite effettivo | 3.53.4 → **3.54.1** | Verificato con `sqlite_version()` nel binding installato e nell'installazione pulita. [Cronologia ufficiale](https://www.sqlite.org/changes.html): letti 3.54.0 e 3.54.1; cambiamenti al planner, Windows e `ALTER TABLE` su nomi speciali. Nessuna migrazione applicativa di colonne ROWID/OID richiesta. Il fix heap della 3.54.1 riguarda build a 32 bit; il pacchetto è x64. Nessun aumento prestazionale dichiarato senza benchmark. |
| Vite | 8.3.5 → **8.3.8** | [Changelog](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md), incluse 8.3.6 e 8.3.7: correzioni per worker, import dinamici/CSS, chiusura dei plugin e percorsi Windows. Le due configurazioni React e la base `/overlay/` restano compatibili; build e avvio dei bundle verificati. |
| @vitejs/plugin-react | 6.1.2 → **6.3.0** | [Changelog](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md), incluse 6.2.0 e 6.2.1: filtri refresh e preset React Compiler nei worker Babel. Le configurazioni usano `react()` senza filtri o compiler custom; non occorrono nuove opzioni. |
| react-router | 8.5.0 → **8.5.1** | [Changelog](https://github.com/remix-run/react-router/blob/main/packages/react-router/CHANGELOG.md): correzioni per navigazione, import lazy, URL e decoding. La dashboard usa BrowserRouter/Routes/NavLink; non usa SSR, RSC, fetcher o le API sperimentali aggiunte. Build riuscita. |
| concurrently | 10.0.6 → **10.0.7** | [Release](https://github.com/open-cli-tools/concurrently/releases/tag/v10.0.7): correzioni di input, output e propagazione dei segnali. La CLI di sviluppo resta compatibile. |
| @types/node | 26.6.5 → **26.6.6** | Confrontati i pacchetti ufficiali con `npm diff`: aggiunte dichiarazioni ZIP in `zlib.d.ts`, senza modifiche al runtime. Le nuove API sperimentali non vengono adottate. Fonte: [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node); diff locale `release/types-node-aggiornamento.diff`. |

Node **26.13.1** è già la versione stabile più recente nell'[indice ufficiale](https://nodejs.org/dist/index.json)
controllato; escluse le prerelease 27. npm **12.2.2** è allineato al dist-tag `latest` del registro.
TypeScript, esbuild, React, Socket.IO, connettori e altre dipendenze dirette non richiedevano avanzamenti
secondo `npm outdated`. Non sono state aggiornate installazioni globali di runtime o strumenti.

### Dipendenze indirette e sicurezza

Il confronto completo dei lockfile contiene **49 record aggiornati e 6 aggiunti**;
i record includono i binding Rolldown per piattaforme diverse da Windows. Dettaglio riproducibile
in `release/aggiornamenti-20261115-220359/lock-diff-finale.json`.

| Componente | Prima → dopo | Fonte e rilevanza |
|---|---|---|
| ws | 8.21.3 → **8.23.0** | [Release 8.23.0](https://github.com/websockets/ws/releases/tag/8.23.0) e intermedie 8.22.0–8.22.2: limita i Pong automatici pendenti, correggendo un esaurimento remoto di memoria. Aggiunto override esatto nel manifest radice perché Engine.IO/adapter vincolavano `~8.21.0`; verificati tutti i consumatori con `npm ls ws` e connessioni Socket.IO locali reali. Non si disabilita la nuova protezione né si aumenta il limite predefinito. |
| glob / minimatch / brace-expansion | 14.0.3 → **14.0.6** / 11.0.3 → **11.0.8** / 5.0.12 → **5.0.13** | [glob](https://github.com/isaacs/node-glob/compare/v14.0.3...v14.0.6), [minimatch](https://github.com/isaacs/minimatch/compare/v11.0.3...v11.0.8), [brace-expansion](https://github.com/juliangruber/brace-expansion/compare/v5.0.12...v5.0.13): limiti al lavoro di espansione, cache e compilazione dei pattern, incluse correzioni di sicurezza. Analizzati anche i diff quando mancano release separate. Nessun pattern proveniente dalla chat aggiunto al progetto. |
| @isaacs/nonrecursive-glob-match | 1.0.3 → **1.1.0** | [Sorgenti](https://github.com/isaacs/nonrecursive-glob-match/compare/v1.0.3...v1.1.0): range numerici senza espansione di ogni valore; usato indirettamente da minimatch. |
| axios / follow-redirects | 1.20.0 → **1.21.1** / 1.16.2 → **1.16.3** | [Axios](https://github.com/axios/axios/releases/tag/v1.21.1), inclusa 1.21.0; [redirect](https://github.com/follow-redirects/follow-redirects/compare/v1.16.2...v1.16.3). Esaminati cambi a header default, durata delle risposte e escaping regex. L'SDK TikTok passa mappe di opzioni ordinarie; nessun wrapper custom da migrare. Nessuna prova con account TikTok reale. |
| http2-wrapper | 2.2.1 → **2.2.4** | [Release](https://github.com/szmarczak/http2-wrapper/releases), incluse 2.2.2 e 2.2.3: verifica TLS degli origin, IPv6 e certificati wildcard. Nessuna disattivazione della verifica TLS. |
| @bufbuild/protobuf | 2.16.0 → **2.17.0** | [Release](https://github.com/bufbuild/protobuf-es/releases/tag/v2.17.0): campi sconosciuti delle mappe, enum JSON e preservazione BOM. Consumato dal connettore/proto TikTok, senza decoder custom nel progetto. |
| engine.io-client | 6.6.7 → **6.6.8** | [Release](https://github.com/socketio/socket.io/releases/tag/engine.io-client%406.6.8): cookie, query con `=` e tipi. Verificati handshake e scambio eventi reali nelle prove isolate. |
| @fastify/fast-json-stringify-compiler / fast-json-stringify | 5.1.1 → **5.2.0** / 7.2.0 → **7.3.6** | [Compiler](https://github.com/fastify/fast-json-stringify-compiler/releases), [serializzatore](https://github.com/fastify/fast-json-stringify/releases): lette tutte le release intermedie, correzioni nullable/ref/date e nuovo `objectMechanism`. Non abilitato il meccanismo native: richiede schemi e misure pertinenti, non un cambio automatico della configurazione. |
| @fastify/proxy-addr / @fastify/send | 5.1.2 → **5.1.3** / 4.2.0 → **4.2.1** | [proxy](https://github.com/fastify/proxy-addr/releases/tag/v5.1.3), [send](https://github.com/fastify/send/releases/tag/v4.2.1): manutenzione e risposta condizionale 304 solo con Last-Modified. |
| find-my-way / light-my-request | 9.10.0 → **9.10.1** / 6.8.0 → **6.8.1** | [router](https://github.com/delvedor/find-my-way/releases/tag/v9.10.1), [inject](https://github.com/fastify/light-my-request/releases/tag/v6.8.1): manutenzione, semantica HEAD/204/304 e callback di fine risposta. |
| cookie / set-cookie-parser | 2.0.1 → **2.0.2** / 3.2.1 → **3.2.2** | [cookie](https://github.com/jshttp/cookie/releases/tag/v2.0.2), [parser](https://github.com/nfriedly/set-cookie-parser/compare/v3.2.1...v3.2.2): validazione di expiry/maxAge e cookie privi di nome/valore. Nessuna configurazione del progetto con scadenze fuori range. |
| thread-stream | 4.2.0 → **4.2.1** | [Release](https://github.com/pinojs/thread-stream/releases/tag/v4.2.1): flush, arresto e indici del worker di logging. Non introdotti transport di logging custom. |
| rolldown e binding | 1.2.15 → **1.2.19** | [Release](https://github.com/rolldown/rolldown/releases), incluse 1.2.16 e 1.2.18; 1.2.17 pubblicata solo su crates.io. Correzioni al bundling e alle mappe; il lock acquisisce anche il target WASM e i relativi runtime opzionali. `@emnapi/core/runtime 2.0.0-beta.2` deriva dal pin upstream di quel target, non da una dipendenza applicativa prerelease scelta manualmente. Verificato il binding Windows x64. |
| @rolldown/pluginutils / @oxc-project/types | 1.0.1 → **1.1.1** / 0.155.0 → **0.156.0** | [pluginutils](https://github.com/rolldown/plugins/blob/main/packages/pluginutils/CHANGELOG.md), [Oxc](https://github.com/oxc-project/oxc/releases/tag/crates_v0.156.0): helper dei filtri e tipi del compilatore scelti dalla toolchain Vite. Nessun uso applicativo diretto. |
| postcss / ansi-regex / semver / tslib | 8.5.31 → **8.5.33** / 6.4.0 → **6.6.0** / 7.8.5 → **7.8.6** / 2.8.1 → **2.9.1** | [CSS](https://github.com/postcss/postcss/releases), [ANSI](https://github.com/chalk/ansi-regex/releases), [SemVer](https://github.com/npm/node-semver/releases/tag/v7.8.6), [tslib](https://github.com/microsoft/tslib/releases/tag/v2.9.1): parsing CSS e sequenze terminale, range e helper generati. Nessun nuovo uso diretto; coperti da build e controlli dei tipi. |

`npm audit` iniziale e finale restituisce **0 segnalazioni**, ma il confronto delle release ha
individuato correzioni di sicurezza ulteriori: il solo audit non sostituisce la lettura upstream.
Gli indiretti fuori dai requisiti dei genitori (per esempio nuove serie di SDK TikTok, got,
node-fetch e altri) non sono stati forzati. Il controllo completo è conservato negli snapshot
`npm-outdated-all-*.json`; pacchetti opzionali per piattaforme assenti non sono errori d'installazione.

### Adeguamenti del codice e dell'installazione

- [scripts/sqlite-runtime.mjs](scripts/sqlite-runtime.mjs) identifica il binding effettivamente caricato,
  interrogando un database in memoria e la cache dei moduli nativi. Lo usa
  [package-win.mjs](scripts/package-win.mjs), che copia quel binario nel layout distribuito;
  il cross build usa il precompilato del target senza dichiararlo provato sul sistema host.
- [upgrade-sqlite.mjs](scripts/upgrade-sqlite.mjs) valida versione/anno, forza node-gyp con
  l'amalgamazione selezionata e controlla la versione caricata al termine. Non considera più
  `npm rebuild` una prova di ricompilazione dell'amalgamazione personalizzata.
- La prima installazione pulita ha rivelato che npm avviava una ricompilazione implicita del
  binding, richiedendo Visual Studio non presente sul PC. Impostato
  `allowScripts["better-sqlite3@13.2.0"] = false`: il pacchetto dispone già di prebuild.
  Conservato il consenso al postinstall di esbuild. La seconda `npm ci` isolata riesce e carica
  **better-sqlite3 13.2.0 / SQLite 3.54.1 / ws 8.23.0** senza compilatore C++.
- Fissato `spacy==3.8.18` in `requirements-generation.txt`, corrispondente alla versione già
  installata e pubblicata: elimina il requisito senza versione, senza cambiare modelli o ambiente.
- Adeguato [DIRETTIVE.md](DIRETTIVE.md) alla versione **2.9**, dal riferimento 2.8 di
  ZeroFollowerBot, con prescrizioni effettive per Node/React/Python/SQLite e verifiche proporzionate.

### Python

Confrontati tutti i **12 nomi diretti** nei quattro file requisiti con i metadati ufficiali
[PyPI](https://pypi.org/): le versioni fissate risultano già allineate, spaCy era già **3.8.18**
nell'ambiente. Nessun pacchetto Python installato aggiornato e nessun modello scaricato.
I tre ambienti rilevati usano **Python 3.13.17**; `pip check` riesce per ZeroAssociazioni,
ZeroContext contexts e ZeroContext semantic. Versioni installate dei requisiti diretti verificate
tramite metadati, senza presumere che il Python 3.15.2 del terminale sia quello degli ambienti.
Non è stato svolto un confronto/audit completo delle dipendenze Python transitive o dei pesi dei modelli.

### Verifiche e limiti

| Verifica | Esito |
|---|---|
| `npm run typecheck` | Superata sui cinque workspace |
| `npm run build` | Superata per dashboard e overlay; resta l'avviso sui chunk oltre 500 kB |
| `node scripts/check-infrastructure.mjs` | Superato, 159 file di produzione |
| Test Node completi | Baseline: **198 passati / 7 falliti**; dopo gli aggiornamenti: **200 passati / gli stessi 7 falliti**, inclusi 2 nuovi test del binding/confezionamento |
| Test Python del database | **20 superati** |
| `npm run test:associations` | **198 test Python e 12 Node superati**; warning Python su cleanup di un HTTPError nelle fixture |
| Smoke sorgente e bundle | Superati: readiness, HTTP, saturazione/cancellazione upload, Socket.IO, regalo confermato, pad e shutdown |
| `npm ci` isolata con configurazione finale | Superata; controllo delle versioni native riuscito |
| `npm audit` | **0 segnalazioni**, compreso sviluppo |
| `npm run package:win` | Superato; nuovo ZIP in `release/zerocade-win-x64.zip` |
| Smoke della distribuzione | Superato su copia di app/runtime in cartella separata, eseguibile `Zerocade-verifica.exe`, porta e database isolati, hosts/browser disabilitati |

I sette fallimenti Node sono preesistenti: sei asserzioni di ZeroContext (test e codice già
modificati nella copia di lavoro) e un cleanup Windows `EPERM` in `server-game-disposal.test.ts`.
Non sono stati nascosti, saltati o corretti come parte dell'aggiornamento delle dipendenze.
Log: `release/baseline-node-tests.log`, `release/node-tests-finale.log`,
`release/python-associations-aggiornamento.log`, `release/package-aggiornamento.log`.

La prova della **ricompilazione personalizzata** con `npm run sqlite:upgrade -- 3.54.1 2026`
si ferma alla ricerca di Visual Studio C++: manca la toolchain richiesta. Il binding precompilato
3.54.1 resta funzionante; non si dichiara superata una compilazione nativa mai completata.
Dettaglio in `release/sqlite-upgrade-aggiornamento.log`. Non sono state installate toolchain globali.
Nessuna prova con dirette/account reali o inferenza dei modelli; nessuna modifica intenzionale
ai database dei giochi o ai dati operativi durante queste verifiche.

### Ripristino

Per ripristinare le dipendenze, riportare manifest, lockfile, requisiti e script dalla sottocartella
`prima/` del backup, considerando separatamente le modifiche preesistenti da conservare, e reinstallare
dal lockfile in un ambiente fermo. L'installazione precedente poteva richiedere una toolchain nativa:
non attribuire al vecchio `npm ci` una riuscita non verificata. Il vecchio ZIP è conservato come
`zerocade-win-x64-prima.zip`; ripristinare app/runtime insieme senza sostituire database aperti.
Il ripristino della documentazione non annulla modifiche agli ambienti; nessun ambiente Python è stato aggiornato.

## Inventario iniziale del 15 novembre 2026

Rilevazione locale su base Git `77e862cb3a912c271d37026db4f9cf50e3f7db20`, con modifiche
preesistenti nella copia di lavoro. Questo inventario documenta lo stato rilevato: non applica
aggiornamenti e non certifica che le versioni siano le ultime disponibili o prive di vulnerabilità.
Non sono stati interrogati registri esterni né eseguiti audit di sicurezza in questa rilevazione.

### Runtime e strumenti locali

| Componente | Versione rilevata | Fonte e vincoli |
|---|---|---|
| Node.js | 26.13.1 | `node --version`; il manifest radice richiede `>=26` |
| npm | 12.2.2 | `npm --version`; workspace con `package-lock.json`, formato 3 |
| Python del terminale | 3.15.2 | `python --version`; non identifica gli interpreti degli ambienti separati dei giochi |
| SQLite caricato da better-sqlite3 | 3.53.4 | Query `sqlite_version()` su database in memoria, dal contesto di `apps/server` |

La versione del motore SQLite è distinta da quella del pacchetto `better-sqlite3`.
[scripts/upgrade-sqlite.mjs](scripts/upgrade-sqlite.mjs) ha come versione predefinita **3.54.1**,
ma il binding locale interrogato carica **3.53.4**. La presenza dello script non dimostra
che la ricompilazione sia stata eseguita. Una reinstallazione può sostituire il binding modificato.

### Dipendenze npm dirette

Versioni risolte nel `package-lock.json` radice, non verifica completa dei pacchetti installati.
I requisiti esatti o con intervallo restano nei rispettivi `package.json`.

| Componente | Versione nel lockfile | Uso |
|---|---|---|
| fastify | 5.12.7 | Server, dashboard e overlay |
| @fastify/helmet | 13.2.0 | Server |
| @fastify/static | 10.1.8 | Server |
| better-sqlite3 | 13.0.3 | Binding SQLite del server |
| socket.io / socket.io-client | 4.8.4 / 4.8.4 | Server, dashboard, overlay e browser-runtime secondo i manifest |
| tiktok-live-connector | 2.5.0 | Collegamento TikTok |
| tmi.js | 1.8.5 | Chat Twitch |
| react / react-dom | 19.3.1 / 19.3.1 | Dashboard e overlay |
| react-router | 8.5.0 | Dashboard |
| @fontsource-variable/fredoka / nunito | 5.3.0 / 5.3.0 | Font dell'overlay |
| typescript | 7.0.2 | Controllo statico dei workspace |
| vite | 8.3.5 | Build dashboard e overlay |
| @vitejs/plugin-react | 6.1.2 | Build React |
| esbuild | 0.28.2 | Bundle del server e dei worker |
| tsx | 4.23.15 | Avvio TypeScript e test Node |
| concurrently | 10.0.6 | Avvio in sviluppo |
| @types/node | 26.6.5 | Tipi Node |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 | Tipi React |
| @types/better-sqlite3 | 9.6.0 | Tipi del binding SQLite |
| @types/tmi.js | 1.8.6 | Tipi della chat Twitch |

`@zerocade/shared` e `@zerocade/browser-runtime` sono pacchetti interni al workspace,
entrambi con versione dichiarata `0.1.0`; non sono dipendenze da aggiornare dal registro.

Vincoli aggiuntivi nel manifest radice:

- override di `glob` a `^14.0.3` sotto `@fastify/static`: rivalutarne la necessità quando si aggiorna il plugin;
- `allowScripts` riferito a `better-sqlite3@13.0.3` ed `esbuild@0.28.2`: verificare anche questa
  configurazione quando cambiano le versioni o il gestore dei pacchetti;
- Node incluso nel pacchetto Windows scelto da `process.version` in
  [scripts/package-win.mjs](scripts/package-win.mjs): registrare il runtime effettivo di ogni distribuzione.

### Requisiti Python degli strumenti dei giochi

Questi sono requisiti dichiarati nei file presenti nella copia di lavoro, inclusi quelli
ancora non tracciati da Git. Non sono un inventario degli ambienti installati né lockfile
completi delle dipendenze transitive. Il runtime del server rimane Node.js.

| File | Requisiti dichiarati |
|---|---|
| [ZeroAssociazioni: NLP](gioco-zeroassociations/requirements-nlp.txt) | stanza 1.15.1, simplemma 2.0.0, wordfreq 3.1.1, nltk 3.10.4; il file indica un ambiente Python 3.13 separato |
| [ZeroAssociazioni: generazione](gioco-zeroassociations/requirements-generation.txt) | spacy senza versione fissata: riproducibilità non garantita dal solo file |
| [ZeroContext: metodi statistici](gioco-zerocontext/requirements-contexts.txt) | numpy 2.5.4, scipy 1.18.1, scikit-learn 1.9.1, filelock 4.2.10 |
| [ZeroContext: modelli semantici](gioco-zerocontext/requirements-semantic.txt) | numpy 2.5.4, sentence-transformers 6.3.0, transformers 5.23.0, torch 2.15.0; ambiente separato |

### Verifiche eseguite e limiti

Letti i manifest dei cinque workspace e della radice, il lockfile npm, i quattro file di
requisiti Python e gli script di aggiornamento SQLite e distribuzione Windows. Rilevate le
versioni dei comandi locali e aperto soltanto un database SQLite in memoria, poi chiuso.
Non sono stati modificati manifest, lockfile, ambienti installati o database del progetto.
Build, test applicativi, collegamenti live e distribuzione non sono stati eseguiti per questa
modifica documentale; gli esiti di revisioni precedenti restano nei rispettivi documenti in `docs/`.

## Procedura per i prossimi aggiornamenti

1. Registrare data, commit di partenza, modifiche già presenti e versioni effettive. Conservare
   manifest, lockfile e artefatti necessari al ripristino; per i dati operativi usare la procedura
   di backup nel README, includendo i media quando necessario.
2. Confrontare le versioni con i registri e le fonti ufficiali. Leggere note di rilascio,
   changelog e guide di migrazione, comprese le release intermedie, come richiesto dalle direttive.
   Separare aggiornamenti compatibili, cambi di versione principale e vincoli ancora irrisolti.
3. Applicare modifiche mirate a manifest e lockfile insieme. Verificare dipendenze transitive,
   override, configurazioni di build e compatibilità tra server, client e worker. Per Python
   verificare l'interprete e le wheel nell'ambiente del singolo strumento.
4. Per Node/better-sqlite3 verificare ABI, caricamento del modulo nativo e `sqlite_version()`;
   se si aggiorna l'amalgamazione, usare una versione esplicita e controllare il binding risultante
   anche nel pacchetto distribuito. Non dedurre la versione del motore dal numero del pacchetto.
5. Eseguire i controlli pertinenti del README: `npm run typecheck`, test Node/Python coinvolti,
   `npm run build`, controllo infrastruttura e smoke del sorgente e dei bundle. Per le dipendenze
   npm eseguire anche `npm audit` e documentare le segnalazioni residue. Verificare i collegamenti
   TikTok/Twitch quando interessati, distinguendo fixture locali e prove con account reali.
6. Se si prepara un rilascio Windows, ricostruire il pacchetto e verificarne runtime, binding
   nativo, worker, avvio e contenuti senza intervenire sui dati della diretta in uso.
7. Aggiungere una voce datata all'inizio di questo registro con versioni prima/dopo, collegamenti
   ufficiali, modifiche pertinenti o motivi di non applicabilità, comandi ed esiti effettivi,
   limiti, problemi residui e procedura di ripristino. Distinguere sempre proposte e aggiornamenti applicati.

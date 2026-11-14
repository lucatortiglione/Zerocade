# Verifica dell'infrastruttura rispetto a DIRETTIVE.md 2.6

Ambito: server di coordinamento, persistenza operativa, rete, dashboard, cornice dell'overlay,
classifiche pubblicate, media e strumenti di verifica. Esclusi motori, algoritmi, dati e strumenti
dei giochi. Restano le modifiche ai giochi già presenti prima di questa revisione, inclusa
l'accettazione dei plurali in ZeroContext richiesta in precedenza.

Branch `refactor/direttive-infrastruttura`, base Git `19eede8`, pacchetti `0.1.0`.
Il workspace contiene molte modifiche precedenti anche nell'indice: non sono state azzerate né
incluse automaticamente in un commit. Il cambiamento è ancora nel working tree, senza tag o
nuovo pacchetto installato. La separazione in commit revisionabili resta da completare prima
del merge; questo documento non dichiara un rilascio pronto né conformità universale del repository.

## Architettura, contratti e proprietari

- `apps/{dashboard,overlay} → packages/browser-runtime → packages/shared`; server → shared.
  Nessuna app importa il codice di un'altra app. Il nuovo pacchetto ha due consumatori reali;
  non aggiunge versioni di librerie esterne al lockfile esistente.
- `InfrastructureClient` possiede un thread e le richieste FIFO; il dispatcher accetta soltanto
  operazioni tipizzate, mai SQL o funzioni provenienti da rete. Due istanze fisse isolano scritture
  operative e report. Ogni thread possiede la propria connessione SQLite, senza oggetti DB condivisi.
- Il coordinatore Node mantiene sessioni, relay e logica dei giochi esistente. Alcune scritture
  sincrone di configurazione e dei giochi restano sul main: non si dichiara che ogni query è asincrona.
  I singleton di processo hanno durata dell'app e vengono chiusi dal coordinatore di shutdown.
- `recordLiveEvent` rende atomici evento, donatore e regalo. La classifica viene emessa dopo il commit;
  data di ricezione e confine della sessione sono input espliciti dei lavori, non ricostruiti dal worker.
- `WorkerJobError` distingue rifiuto prima dell'avvio, errore di lettura ed esito di scrittura incerto.
  Un thread interrotto non provoca replay di scritture; una nuova richiesta può aprire un sostituto.
- `LiveSocket` possiede il worker della pagina. Conserva gli eventi applicativi ordinati e limita
  richieste, conferme e consegne non consumate. Gli aggiornamenti React vengono notificati per frame;
  le azioni live ricevono comunque ciascun evento. Il DOM e i canvas restano sul thread browser.
- Le richieste HTTP possiedono AbortController e deadline; revisioni/identità impediscono che risultati
  vecchi sovrascrivano un gioco, un filtro o un'immagine più recente. Un POST incerto non viene ritentato.
- Il publisher coalesca aggiornamenti, serializza i POST per gioco e attende i trasferimenti accettati
  prima di rimuovere i file temporanei. Lo spegnimento annulla la rete che possiede.

## Limiti espliciti e comportamento al limite

| Risorsa | Limite / esito |
| --- | --- |
| Thread infrastrutturali Node | 2; ciascuno con heap old-generation 256 MiB, young 32 MiB, stack 4 MiB |
| Scritture / report pendenti | 2.048 / 32; 64 MiB di peso logico per coda, copie considerate nella stima |
| Deadline RPC | 15 s normale; 60 s export/sito; 5 s comando finale di chiusura |
| HTTP | 128 connessioni TCP, 32 richieste attive, 4 upload attivi; rifiuto 503 prima del body |
| Body | 1 MiB generale; media immagini 8 MiB; pad 6 MiB decodificati e limite base64 prima del decode |
| Browser → worker | 256 consegne / 8 MiB; stessa capacità per la coda offline; rifiuto visibile |
| Worker → UI | 256 consegne / 32 MiB; in saturazione ferma il flusso e avvisa degli eventi non elaborati |
| Conferme comandi | 256; timeout del trasporto 25 s, della facciata 30 s; nessun replay automatico |
| Risposte API browser | 2 MiB normalmente, override espliciti per casi piccoli; conteggio cumulativo dei byte |
| CSV | 50.000 righe / budget 16 MiB; i cursori telemetrici si fermano prima di accumulare oltre budget |
| EventSub | setup 30 s, HTTP 10 s, welcome 15 s, JSON 256 KiB, deduplica 2.048 ID, 6 retry con jitter |
| Ponte ZFB | hello entro 10 s, JSON massimo 256 Ki caratteri, retry locale finché abilitato |
| Log HTTP | richieste ordinarie non stampate; massimo 5 errori/s; contatore degli errori soppressi in health |
| Shutdown | 20 s complessivi, chiusura fonti → socket/publisher → writer → server/reporter → DB |

I budget di coda sono stime conservative dei payload, non un limite assoluto di RSS: runtime, SQLite,
SDK dei servizi e memoria nativa hanno costi separati. Le risorse esterne non diventano illimitate
perché un corpo manca di Content-Length: `readBoundedBytes` verifica ogni append e usa un buffer contiguo,
non una lista senza limite di minuscoli chunk. I vettori ZeroContext sono serviti in streaming con
backpressure, senza copiare l'intero file per ciascun client lento.

## Mappa delle direttive

La tabella copre le sezioni e le relative sottosezioni; le prescrizioni condizionali non sono trasformate
in obbligo di aggiungere pattern inutili. Le evidenze sono codice e prove, non caselle spuntate nel documento originale.

| Sezione | Applicazione ed evidenza |
| --- | --- |
| 0: priorità P0/P1/P2 | Atomicità, conferma, limiti e cancellazione precedono l'ottimizzazione. Il benchmark non giustifica modifiche alle regole dei giochi. |
| 1: analisi, impatto, compatibilità, semplicità | Contratto Socket.IO preservato; aggiunti `bridge:retry` e `runtime:issue`. Baseline precedente: 82 test e build; esiti finali sotto. Refactoring limitato ai confini operativi. |
| 2: responsabilità, direzione, API, riuso, composizione, ownership | Contratti `infrastructureJobs.ts` e `browser-runtime/protocol.ts`; parser e byte budget comuni. Due app consumano lo stesso trasporto. Le copie e i singleton intenzionali sono descritti sopra. Scan degli import più typecheck e build; nessun framework di injection o plugin aggiunto. |
| 3: memoria, capacità, accumulo, lifecycle | Ammissione prima del clone/body, limiti per messaggi e code, letture contigue, streaming file, timeout e cleanup. Test con migliaia di chunk da un byte senza Content-Length, overflow, cancellazione e UI senza ricevute. Limite RSS assoluto e memoria degli SDK non certificati. |
| 4: prestazioni, hotspot, caching, misura | Benchmark ripetibile della stessa transazione SQLite, tre prove per variante. Nessuna promessa di maggiore throughput globale. Cache e sessione non si ricostruiscono in un thread con stato indipendente; il confine temporale viene passato esplicitamente. SIMD, GPU e ottimizzazioni algoritmiche dei giochi esclusi. |
| 5: concorrenza, code, saturazione, cancellazione, invio | Thread fissi, FIFO, rifiuti espliciti, esiti incerti senza replay, notifiche per frame, eventi live ordinati. Test con worker nativi, server Socket.IO vero, blocco SQLite, thread ucciso e drain di 32 scritture accettate. |
| 6: lock, atomiche, ordering, race | SQLite possiede i lock; transazioni sincrone senza await. Nessuno SharedArrayBuffer, atomiche custom, spinlock, ABA o lock poisoning da implementare in questo disegno. Messaggi tipizzati e connessioni separate; retry di query mutanti non implicito. |
| 7: deadline, retry, isolamento, errori, readiness | Errori tipizzati, deadline differenziate, EventSub con backoff e jitter, token permanente rifiutato senza loop. Bridge locale riconfigurabile e ritentabile. `/api/live` distinto da `/api/health`. SDK TikTok/tmi mantengono la propria implementazione interna: non equivalgono a una verifica end-to-end in live. |
| 8: transazioni, vincoli, migrazioni, backup, file | Eventi/regali e spostamenti dei pad in transazione; sostituzioni con file temporaneo, flush e rename; vecchio media eliminato dopo commit. Migrazione colonne `widgets-goal-avatars` v1 registrata atomicamente, errore con identità/causa. Backup SQLite consistente e integrity_check provati con WAL aperto. Nessun cambiamento al formato dei contenuti dei giochi. |
| 9: log, conferma, metriche, tracing, SLO | Request ID HTTP, ID RPC ed eventSeq nei fallimenti; segreti nei header oscurati, logging HTTP limitato. Health espone coda, byte, completamenti, errori, p50/p95/p99 su massimo 256 campioni e RSS. Le metriche non dipendono dai filtri UI. Obiettivo locale misurato: timer main p99 <50 ms nel carico di benchmark; non è uno SLO garantito per qualunque live. Tracing distribuito esterno non introdotto per un'app locale. |
| 10: boundary, input, autorizzazioni, privacy, dipendenze | Host/Origin/Sec-Fetch-Site e bind loopback, comandi regia esclusi dagli overlay, whitelist percorsi/MIME/widget, SQL parametrizzato, CSV anti-formula, RSS NASA limitato. Scan pattern credenziali e audit dipendenze. Nessun cambio di versione esterna: nessuna release intermedia da adeguare. HTTP locale e ponte loopback ammessi dallo stack; TLS nei servizi Twitch. Non esiste login con password: password hashing non applicabile. |
| 11: regressioni, fault, fuzz, integrazioni, prestazioni | Suite e smoke elencati sotto. 2.000 input JSON deterministici, guasti HTTP, race di risposte, sostituzione socket, rollback SQL/file, saturazione e worker interrotto. Nessun test fittizio sostituisce una live esterna o una prova in OBS. Soak di ore e fault fisici del disco non eseguiti. |
| 12: ambiente isolato, CI, workflow, versioni | Smoke su porta libera, DB temporanei e credenziali rimosse; niente UAC/hosts/browser/installazione reale. CI estesa a build, scan e smoke sorgente/bundle; esecuzione GitHub non attestata. Branch e SemVer preservati; separazione dei commit ancora da chiudere per non includere lavoro preesistente. |
| 13: regole per linguaggio/UI | Applicato l'equivalente TS/Node/React della §16: typecheck, worker, gestione risorse e risultati obsoleti. Rust unsafe, Qt affinity, C++ RAII, allocator e iteratori nativi non appartengono a questi file; non si aggiungono strumenti non compatibili. |
| 14: protocollo analisi → implementazione → verifica → consegna | Contratti, compatibilità, evidenze, benchmark e limiti riportati qui. Nessun rilascio o prova esterna dichiarata come eseguita. |
| 15: definizione di completamento | Controlli locali sotto; gate Git/CI e verifiche di prodotto esplicitamente distinti. Non si interpreta la richiesta come autorizzazione a pubblicare o mischiare modifiche estranee. |
| 16: adattamento Zerocade | Node 26, TS7, React e SQLite reali; applicazioni e worker compilati, test Node/Python e audit. Contenuti dei giochi non cambiati in questa revisione: rigenerazione/verifica DB dei giochi esclusa. |
| Appendice SQLite | Foreign keys abilitate su ogni connessione. Constraint e UPSERT esistenti preservati. Non si normalizzano gli snapshot storici dei nickname né si cambiano schema/ROWID dei giochi: servono storico e compatibilità, non una deduplicazione meccanica. Lookup, viste, generated columns e WITHOUT ROWID solo quando giustificati. Nessun VACUUM su un database live durante la revisione. |

## Prove e misure realmente eseguite

Ambiente: Windows x64, Node `v26.13.1`. Comandi ripetibili dalla radice:

- `npm run typecheck`: superato su tutti i workspace.
- `node --import tsx --test tests/*.test.ts`: 105 test superati, zero falliti o saltati (10,5 s nell'esecuzione finale).
- `python -I -m unittest discover -s database/script`: 17 test superati. ResourceWarning preesistenti
  nei test schemadb segnalano connessioni non chiuse; non sono stati nascosti o modificati in questa revisione.
- `npm run build`: dashboard e overlay compilati, worker browser emessi; warning chunk overlay >500 kB,
  collegato anche al dizionario dei plurali già richiesto. Non è stato alzato il limite per occultarlo.
- `npm audit --omit=dev`: zero vulnerabilità note riportate; non prova assenza di vulnerabilità sconosciute.
- `node scripts/check-infrastructure.mjs`: 87 file sorgente di produzione, nessun import vietato o pattern noto
  di credenziali rilevato. Non è una scansione della storia Git né un riconoscitore di tutti i token possibili.
- `node scripts/smoke-runtime.mjs` e variante `--bundle`: avvio e readiness reali, Host/Origin e cross-site,
  quattro upload sospesi e quinto rifiutato, cancellazione che libera gli slot, Socket.IO reale, regalo confermato,
  pad salvato/letto/eliminato, shutdown con codice 0 e chiusura dei thread. Bundle compilato in cartella temporanea,
  senza ricostruire/sostituire `release/`.
- Test browser: vero codice del worker, esbuild e thread Node con adapter delle sole API message-port.
  La prova della pagina classifiche esegue il JavaScript distribuito con DOM/EventSource controllati.
  Non sono test visuali con Chromium/OBS né prove del CSP dentro un browser reale.

Benchmark `node --import tsx scripts/benchmark-infrastructure.ts`: sei processi isolati, tre coppie,
2.000 insert dello stesso `recordLiveEvent`, nessuna riga persa, avvio worker escluso dal tempo misurato.

| Variante | Durata totale, tre prove | Intervallo timer main massimo | RSS processo |
| --- | --- | --- | --- |
| SQLite sul main | 971 / 1.015 / 1.099 ms | 971 / 1.017 / 1.099 ms | 69,6–69,9 MiB |
| SQLite nel worker | 961 / 988 / 937 ms | 18,8 / 14,8 / 17,1 ms | 92,1–93,0 MiB |

Nel worker il timer main p95 è 1,9–2,4 ms e p99 7,1–8,3 ms, su 820–837 campioni per prova;
il confronto sincrono ha solo 5–7 campioni perché il loop resta bloccato, quindi i suoi percentili
non descrivono un servizio in steady state. Throughput locale 1.820–2.060 vs 2.024–2.135 eventi/s:
il risultato principale è la reattività del main, con circa 23 MiB di costo aggiuntivo. Non è una
misura di latenza da Twitch fino al pixel, né di una sessione con tutti i giochi e i media attivi.

## Limiti, compatibilità e incidente di verifica

- EventSub corregge token utente, follow v2, keepalive, handoff di reconnect, deduplica e revoche secondo
  la [documentazione Twitch](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).
  Nessun account reale, rinnovo OAuth interattivo o deploy nginx/SFTP è stato provato. Le fixture
  verificano il protocollo e il trasferimento finto verifica ownership/chiusura, non l'host remoto.
- Una perdita di connessione al fornitore o saturazione non consente di ricostruire tutti gli eventi
  live: il problema viene segnalato e non si inventa una conferma di salvataggio. Un crash dopo commit
  ma prima della risposta rimane un esito sconosciuto; verificare lo stato prima di riprovare.
- Le sostituzioni file sono atomiche sul filesystem locale; non esiste una transazione distribuita
  tra SQLite, disco e host remoto. Un arresto brutale può lasciare upload orfani; errori di pulizia
  vengono registrati. Un guasto di alimentazione non è coperto dai test di rollback logico.
- Lo shutdown reale è stato invocato dal canale IPC privato del processo di smoke. Ctrl+C in terminale
  Windows e chiusura del launcher/OBS restano verifiche manuali; `child.kill('SIGINT')` su Windows
  non dimostra il passaggio nel gestore. Non si è fermata la copia usata dall'utente.
- Durante la prima esecuzione del nuovo test della pagina classifiche, un import statico ha aperto
  il database predefinito ed eseguito l'inizializzazione ordinaria (migrazione e retention previste dal
  modulo DB). Non è possibile attribuire retroattivamente eventuali righe eliminate dalla retention.
  Il test è stato corretto prima della suite finale: imposta ZEROCADE_DB temporaneo prima degli import.
  Gli altri test nuovi sono stati ricontrollati per lo stesso problema. Non si dichiara che quel primo
  avvio sia stato isolato o che non abbia potuto modificare il database operativo.
- Prima di distribuzione: commit separati dalle modifiche preesistenti, CI verde su GitHub, prova
  visuale in dashboard/OBS e live Twitch con credenziali dell'ambiente. Questa revisione non certifica
  codice dei giochi o script di contenuti che l'utente ha escluso.

# ZeroContext: applicazione di DIRETTIVE.md 2.6

> **Revisione documentale — 16 novembre 2026.** Questo audit fotografa il runtime del 14 novembre. Sono successivi il corpus statistico, i vettori immutabili, il ricaricamento locale e il controllo della lunghezza della segreta. Il caricamento attuale confronta anche la revisione HTTP tra le risorse; per la procedura corrente usare il [README di ZeroContext](../gioco-zerocontext/README.md). Le misure sotto restano storiche.
> [Indice e stato della documentazione](STATO_DOCUMENTAZIONE.md).

Intervento sul runtime ZeroContext di Zerocade, sul servizio dei suoi dati e sui contratti di lifecycle
necessari a chiuderlo. Include la scala colori richiesta durante il lavoro. Non rigenera o modifica i contenuti
SQLite, i vettori o i modelli linguistici; non cambia gli algoritmi degli altri giochi.

Branch: `refactor/zerocontext-direttive`, base del workspace `19eede8`, pacchetti `0.1.0`.
Il workspace aveva già molte modifiche e rinominazioni in corso. Il commit mirato contiene file e frammenti
pertinenti a ZeroContext e le dipendenze comuni necessarie; l'indice del lavoro precedente viene preservato.
Le verifiche riportate riguardano il working tree condiviso: non costituiscono una build del solo commit
su checkout pulito né un'esecuzione verde di GitHub CI.

## Contratti e responsabilità

- `contextRanking.ts`: parser e matematica pura. Stessi prodotti scalari int8, boost, ordinamento stabile
  e inverse delle posizioni; controlli prima delle allocazioni. Lookup conserva accenti e plurali attestati,
  ma non concatena pezzi di parole come `ma re` o `m.a.r.e` per costruire una risposta vincente.
- `contextLoader.ts`: letture HTTP sequenziali con budget cumulativo e deadline globale. L'assenza di
  `links.json` (404) resta compatibile con i server vecchi; un guasto o JSON non valido non finge un grafo vuoto.
- `context.worker.ts`: possiede vettori e collegamenti; dopo il caricamento non trattiene gli indici lessicali
  mandati alla UI. Trasferisce i buffer delle classifiche; i 60.782.400 byte di vettori reali non passano alla UI.
- `contextWorkerClient.ts`: un worker per istanza, un calcolo attivo e un solo successivo sostituibile.
  Latest-wins si applica soltanto a calcoli puri: niente punti o invii nel worker. Timeout/chiusura rigettano
  i waiter e terminano il thread, anche se una fetch o un sort non cooperano. `metrics()` espone stato,
  profondità, completamenti, sostituzioni, guasti e ultima durata di calcolo.
- `context.ts`: coordina round e regole. Generazione dell'istanza e revisione del round invalidano i risultati
  vecchi. La coda di input è FIFO; il primo vincitore o «Termina round» impedisce punti successivi nello stesso
  round. La pausa annulla gli input non ancora applicati e trattiene il risultato puro fino alla ripresa.
- `contextView.ts`: presentazione passiva. Riceve un modello, senza download, worker o invii di punti.
  Top 10 dei tentativi e top 5 dei giocatori si aggiornano quando cambiano i dati, non a ogni disegno.
- `Engine`: invoca il lifecycle opzionale solo per i giochi che lo implementano. Cambio gioco, clear e stop
  dispongono le risorse. L'overflow della sua coda interrompe esplicitamente ZeroContext. Gli altri giochi
  mantengono le rispettive implementazioni e politiche precedenti.
- `roomSecret.ts`: la sottoscrizione restituisce un cleanup con identità del proprietario. Un invio differito
  non invia una soluzione di un'istanza chiusa a un gioco nuovo. `scoreReport.ts` cattura il game ID prima
  dell'import asincrono; non lo rilegge dopo un cambio gioco.
- `packages/shared/src/context.ts`: limiti e scala colori comuni a server, regia e overlay. Nessun import
  tra app. La normalizzazione del server mantiene coerenti i valori mostrati e quelli effettivamente usati.
- `apps/server/src/context.ts`: lettura del contenuto in snapshot SQLite read-only, cursori con limiti,
  indice dei vocaboli contiguo e metadata coerenti. Schema presente ma corrotto/non verificato: errore
  osservabile e nessun fallback a parole diverse. Compatibilità legacy solo quando lo schema è assente.
  Il servizio HTTP mantiene lo streaming dei vettori e rifiuta file oltre budget.

## Limiti e guasti

| Risorsa | Politica |
| --- | --- |
| Vocabolario | massimo 200.000 parole italiane uniche, 2–20 lettere, fino a 4 MiB scaricati |
| Vettori | massimo 128 MiB, 1–1.024 dimensioni; forma esatta `parole × dimensioni` |
| Soluzioni / collegamenti | 512 KiB / 4 MiB; massimo 500.000 collegamenti e 4.096 per soluzione |
| Download | 30 s complessivi; sequenziale, conteggio prima di append; buffer contiguo e cleanup del reader |
| Calcolo | 15 s per lavoro attivo; al massimo un lavoro attivo e uno in attesa; nessuna coda nel worker senza limite |
| Input di round | 300 elementi / 256 KiB di peso logico, includendo copie; overflow visibile e riavvio richiesto |
| Tentativi / giocatori | 10.000 / 10.000; limite esplicito, nessuna crescita per una live senza fine |
| Retry | fino a tre tentativi per guasti di rete, distanti almeno 10 s; niente retry di dati invalidi |
| Cache | soltanto l'istanza attiva: nessuna cache globale di vettori né di classifiche di round precedenti |

Il buffer HTTP mantiene al massimo due capacità durante crescita/taglio finale; al termine il buffer
ha la dimensione esatta. I limiti ai file non equivalgono a un limite assoluto di RSS: decoder, mappe,
clone del lessico, runtime e memoria nativa hanno costi ulteriori. Download sequenziali e proprietà dei vettori
nel worker evitano quattro risposte grandi simultanee e copie dei vettori verso l'interfaccia.
La chiusura non riavvia né ripete scritture: il lavoro del worker è interamente privo di side effect persistenti.

## Colori

Rosso `#ef4444`: posizioni 1–10. Arancione `#f97316`: 11–100. Giallo `#facc15`: 101–1.000.
Ciano `#22d3ee`: 1.001–10.000. Blu `#3b82f6`: oltre 10.000. La soluzione resta posizione 1 con stella.

Sul corpus di 101.304 parole le fasce contengono 10 / 90 / 900 / 9.000 / 91.304 elementi.
La progressione decimale concentra la distinzione sulle parole più vicine; il blu copre circa il 90,1%.
Nuove impostazioni: `redUntil`, `orangeUntil`, `yellowUntil`, `cyanUntil`. Le vecchie `greenRank` e
`orangeRank` non vengono reinterpretate. Il server restituisce soglie finite, intere e crescenti.

## Mappa delle direttive applicabili

| Sezione | Applicazione / eccezione |
| --- | --- |
| 0–1: correttezza, baseline, impatto | Baseline 21 test ZeroContext; ranking e regole verificati prima della modifica. Nuovi colori e rifiuto delle parole composte sono cambiamenti intenzionali richiesti o necessari alla validazione. |
| 2: modularità, contratti, riuso, ownership | Parser, trasporto, coordinator e view distinti. Factory minima per test del dominio; worker reale per integrazione. Limiti/colori comuni hanno consumatori reali server e overlay; nessun framework o dipendenza esterna nuova. |
| 3: memoria e capacità P0 | Limiti precedono clone, accumulo e allocazione delle classifiche. Letture senza Content-Length, molti chunk piccoli, input lunghi, UTF-8 non valido e capacità effettiva dei buffer provati. Niente memoria condivisa, pool globali o dati vettoriali nella view. |
| 4: algoritmi e misure | Ranking invariato; duplicati in O(1), top 10/top 5 conservati tra i frame. Benchmark ripetuto sul corpus reale con hash completo di order/rankOf; dati grezzi allegati. Nessun SIMD/GPU o algoritmo approssimato non giustificato. |
| 5: concorrenza, code e cancellazione | Un worker posseduto, due richieste di classifica al massimo. Le richieste obsolete sono pure; eventi di gioco ordinati e senza conferme spurie. Pausa, reset, dispose, timeout, saturazione e worker fault testati con interleaving controllati. |
| 6: lock e race | Message passing e buffer trasferiti, nessun SharedArrayBuffer o atomica custom. Snapshot DB sincrono senza await. Generazione/revisione controllate dopo ciascun await rilevante. Lock-free, memory ordering e ABA non applicabili. |
| 7: deadline, retry e degradazione | Deadline globali e del calcolo, retry finiti di letture sicure, errori tipizzati. Un fallimento di ZeroContext interrompe il gioco in modo visibile; non fa passare dati mancanti per una partita valida. |
| 8: dati, migrazioni, durabilità | Contenuti e formati persistenti invariati. Nuove impostazioni hanno default e normalizzazione compatibili; nessuna migrazione distruttiva o scrittura del corpus. Backup/atomicità della generazione offline non modificati; vedere limiti sotto. |
| 9: osservabilità e conferme | UI distingue caricamento, calcolo ed errore. Metriche worker indipendenti dal rendering. Il worker non assegna punti; callbacks obsolete non generano vittorie. Gli invii Socket.IO restano il protocollo esistente, senza fingere conferma di persistenza. |
| 10: sicurezza, privacy, supply chain | Validazione al confine dei dati, URL limitati a HTTP(S) dell'origine della pagina, nessun token o SQL dal worker. Whitelist risorse e limiti HTTP sul server; nessuna nuova libreria/versione esterna. Password hashing e gestione credenziali non appartengono a questo gioco. |
| 11: regressioni, fault, performance | Prove pure e di integrazione distinte; HTTP reale e worker nativo con adapter delle sole API message-port. Prove deterministiche di risposta tardiva e saturazione. Nessun live account necessario. |
| 12: isolamento, CI, versioning | Test nuovi con DB temporanei prima degli import; nessun avvio sulla porta/dati della diretta. Branch dedicato e commit mirato. Pipeline e release dell'intero progetto restano separate dal lavoro ZeroContext. |
| 13 e 16: Node/TS/React | Typecheck, build Vite con worker effettivo, test Node/Python e smoke server. Rust unsafe, Qt affinity e sanitizer C++ non applicabili; equivalente verificato con lifecycle e ordine eventi. |
| 14–15: consegna e DoD | Comandi, esiti, benchmark, compatibilità e limiti riportati qui. Non si dichiara una verifica visuale riuscita né un rilascio distribuito. |
| Appendice SQLite | Letture read-only e snapshot; niente duplicazioni di corpus, alterazioni a tabelle, VIEW/ROWID, VACUUM o ricostruzioni dei DB durante i test. |

## Evidenze e limiti delle prove

Ambiente: Windows x64, Node `v26.13.1`. Esiti sulla versione finale prima del commit:

- `npm run typecheck`: superato.
- `node --import tsx --test tests/*.test.ts`: 122 test superati, zero falliti o saltati; 11,4 s nell'esecuzione finale.
- `npm run build`: dashboard e overlay compilati; asset worker ZeroContext circa 54 KiB dopo l'eliminazione
  del dizionario plurali inutilizzato nel worker. Il dizionario resta nel lookup della UI, con attribuzione.
  Rimane il warning già presente sul chunk principale dell'overlay oltre 500 kB: non viene nascosto.
- `python -I -m unittest discover -s database/script`: 17 test superati; ResourceWarning preesistenti nei
  test schemadb, non nascosti. Nessun contenuto dei giochi modificato, quindi nessuna rigenerazione del corpus.
- `npm audit --omit=dev`: zero vulnerabilità note riportate.
- `node scripts/smoke-runtime.mjs` e `--bundle`: superati su istanze isolate e chiuse ordinatamente.
- `node --import tsx scripts/benchmark-context.ts`: tre processi per variante, tre parole per processo,
  una classifica di warm-up. Dati grezzi: [benchmark](benchmark-zerocontext-2026-11-14.json).

Le integrazioni worker eseguono il codice prodotto da esbuild su thread Node, adattando soltanto le API
message-port del browser: questa prova non certifica CSP, resa dei colori o comportamento specifico di OBS.
La verifica visuale è stata tentata con la skill computer-use su un server temporaneo; il runtime l'ha
interrotta prima delle interazioni perché le regole URL non sono ancora supportate per Firefox Windows.
Il server di prova è stato chiuso. Non si aggira quel blocco e non si dichiara una verifica visuale effettuata.

I dati vengono caricati una volta per istanza e riutilizzati nei suoi round. Il deployment/generatore deve
restare fermo durante una partita e il server va riavviato dopo la rigenerazione: il formato legacy non ha
un hash comune che certifichi vocaboli, vettori e collegamenti come un'unica generazione. Sono rilevate
dimensioni, metadata e struttura errate; una sostituzione esterna con vettori diversi della stessa forma
non è certificata. Nessuna prova di guasto fisico del disco, soak di ore o live reale eseguita.

Il benchmark misura un main Node e il suo worker con gli stessi dati; la preparazione del processo non è
un tempo di avvio di OBS. Lo scopo misurato è evitare che il calcolo blocchi il main, non aumentare per forza
il throughput. Il costo di caricamento iniziale e la memoria supplementare sono riportati nei dati grezzi.

Confronto isolato finale, tre processi per variante e nove classifiche dopo warm-up:

| Variante | Timer main massimo, tre prove | Classifica mediana | Preparazione iniziale | RSS processo |
| --- | --- | --- | --- | --- |
| Sincrona | 133,6 / 150,4 / 152,5 ms | 132,3 ms | 163–252 ms | 186,4–193,1 MiB |
| Worker | 17,8 / 17,2 / 16,5 ms | 130,4 ms | 769–904 ms | 237,4–250,1 MiB |

Gli SHA-256 degli interi buffer `order` e `rankOf` coincidono per tutte le varianti. Il tempo di calcolo
è simile; il vantaggio è lasciare libero il main. Il costo supplementare osservato è circa 45–64 MiB.
La RSS include runtime, adapter HTTP locale e memoria ancora trattenuta dal GC; non è una misura del
picco heap di Firefox. I timer Windows hanno granularità propria: i valori non promettono 60 fps in OBS.

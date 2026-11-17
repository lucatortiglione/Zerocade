# Software Engineering Standards — ZeroCade — Versione 2.9

**Direttive per architettura, sviluppo, ottimizzazione, sicurezza, concorrenza e qualità del software.**

Revisione documentale del **16 novembre 2026**, versione normativa 2.9 invariata:
allineati inventario dei dati e riferimenti alla pubblicazione di ZeroContext.
Stato del workspace e ambito dei rapporti sono nell'[indice documentale](docs/STATO_DOCUMENTAZIONE.md).

Aggiornamento del 17 novembre 2026, versione 2.9 invariata: aggiunte le ottimizzazioni dei database riprese da
ZeroFollowerBot (sezione 6: messa a punto della connessione e statement preparati riusati; appendice SQLite, punti 10 e 11:
indici e query che crescono con i dati, retention e crescita del file).

Aggiornamento del 15 novembre 2026, versione 2.9: adattato a ZeroCade il documento 2.8 di
ZeroFollowerBot. Integrate le regole su thread nativi, stalli, IPC e memoria condivisa con le
condizioni effettive di Node.js, React, SQLite e degli strumenti Python. Distinte prescrizioni,
funzionalità esistenti e verifiche ancora da eseguire; aggiornati confini del workspace e manutenzione.
Il testo di riferimento è conservato nel progetto ZeroFollowerBot; questa copia ha evoluzione autonoma.

Aggiornamento del 15 novembre 2026, versione 2.8: integrata nella sezione 5 e armonizzata nelle sezioni 6, 11 e 13
la disciplina completa per il **multithreading puro nativo (1:1 OS thread)**: concorrenza strutturata RAII (`std::jthread`
con cancellazione cooperativa `std::stop_token` e scoped threads `std::thread::scope`), hardware-awareness e coerenza
di cache (prevenzione del false sharing con `hardware_destructive_interference_size`, TLS map-reduce e NUMA/core pinning),
coordinamento a fasi (`std::barrier` e `std::latch`), architetture di schedulazione (thread pool bounded con backpressure
e work-stealing pool), memory ordering atomico (Acquire/Release) e matrice comparativa dei modelli di concorrenza pura.

Aggiornamento del 15 novembre 2026, versione 2.7: integrata nella sezione 6 la disciplina avanzata per la
prevenzione di lock, deadlock, starvation e stalli dei processi (architetture share-nothing, I/O asincrono su pipe IPC,
SQLite WAL con `BEGIN IMMEDIATE`, lock hierarchy, watchdog monotoni e matrice operativa dei rischi di blocco);
allineati i vincoli operativi per lo stack di Zerocade nella sezione 16.

Aggiornamento del 14 novembre 2026, versione 2.6: adeguato a Zerocade. Corrette le righe che riguardavano un altro
progetto (direzione delle dipendenze, versioning, identità degli eseguibili di prova, ambiente incompleto) e aggiunta
la sezione 16, che traduce le regole nello stack di Zerocade (TypeScript, Node.js, React, SQLite, giochi in Python).
Questa voce descrive la revisione storica; la versione 2.9 adatta anche le regole operative nelle sezioni interessate.

Aggiornamento del 13 ottobre 2026: requisiti verificabili derivati dai difetti di cancellazione, conferma degli
invii, memoria dei log, salvataggi asincroni e aggiornamenti dell'interfaccia. Queste regole richiedono prove sui
comportamenti: un commento o una checklist compilata non dimostra che il requisito sia rispettato.

Aggiornamento del 14 ottobre 2026, versione 2.3: ampliati i criteri di modularità e riuso con scelta dei confini,
dipendenze, API, ownership, configurazione, compatibilità ed evidenze di verifica. Distinti l'organizzazione in
file, l'isolamento del dominio e il riuso di conoscenza; allineati il protocollo della sezione 14 e i criteri della
sezione 15.

Aggiornamento del 15 ottobre 2026, versione 2.4: aggiunta nella sezione 12 la nota obbligatoria sul versioning
di tutto il codice e dei moduli, con tracciabilità Git e collegamento tra versioni, rilasci e commit.

Aggiornamento del 16 ottobre 2026, versione 2.5: obbligo di esaminare le release ufficiali a ogni aggiornamento
di librerie o tool esterni e adeguare il codice per applicare correzioni e ottimizzazioni pertinenti,
con verifiche e tracciabilità delle scelte (sezione 10).

## 0. Principi fondamentali e priorità

Ogni modifica deve rispettare il seguente ordine di priorità:

1. Correttezza funzionale e integrità dei dati.
2. Sicurezza e assenza di comportamenti indefiniti.
3. Affidabilità, resilienza e prevedibilità.
4. Manutenibilità e semplicità architetturale.
5. Prestazioni, efficienza e scalabilità misurabili.

**Regola fondamentale:** nessun miglioramento prestazionale giustifica una regressione funzionale, un problema di sicurezza o una perdita di dati.

### Classificazione delle direttive

- **P0 — Bloccante:** requisiti di correttezza, integrità, sicurezza e gestione delle risorse. Una violazione impedisce il rilascio.
- **P1 — Standard:** pratiche da applicare normalmente, con eventuali eccezioni motivate.
- **P2 — Ottimizzazione:** interventi da eseguire quando esiste un beneficio misurabile o un requisito prestazionale specifico.

Le direttive si applicano proporzionalmente alla complessità, ai rischi e alla natura del componente.

Le eccezioni devono essere documentate; non devono trasformarsi in debito tecnico invisibile.

## 1. Analisi preventiva, progettazione e controllo delle regressioni

### Analisi prima delle modifiche

- [ ] **Comprensione del comportamento esistente:** prima di modificare il codice, identificare responsabilità del componente, contratti pubblici, dipendenze, side effect e invarianti.
- [ ] **Analisi dell'impatto:** individuare chiamanti, componenti dipendenti, risorse condivise, test coinvolti e potenziali regressioni.
- [ ] **Modifiche mirate:** evitare refactoring estranei all'obiettivo, riscritture generalizzate e cambiamenti architetturali non necessari.
- [ ] **Preservazione della compatibilità:** mantenere API, formati dati, configurazioni, protocolli e comportamenti precedenti salvo modifiche esplicitamente richieste.
- [ ] **Baseline verificabile:** registrare lo stato iniziale dei test, dei warning e, per interventi prestazionali, delle metriche.
- [ ] **Criteri di accettazione:** definire cosa deve funzionare, cosa non deve cambiare e come dimostrare il successo dell'intervento.

### Progettazione orientata alla semplicità

- [ ] **KISS:** scegliere la soluzione più semplice che soddisfa realmente i requisiti.
- [ ] **YAGNI:** non sviluppare meccanismi di estensione o configurazione per esigenze puramente ipotetiche.
- [ ] **DRY con giudizio:** eliminare duplicazioni di conoscenza e regole di business, senza imporre astrazioni artificiali a codice solo superficialmente simile.
- [ ] **Responsabilità chiare:** assegnare a ogni modulo responsabilità coerenti, evitando classi monolitiche e oggetti che coordinano troppe funzionalità.
- [ ] **Complessità giustificata:** ogni nuovo livello architetturale, dipendenza o framework deve offrire un beneficio concreto.

## 2. Architettura, modularità e contratti

### Separazione delle responsabilità

- [ ] **Isolamento del dominio:** mantenere la logica applicativa indipendente da UI, database, rete e librerie esterne quando questa separazione apporta reale testabilità o manutenibilità.
- [ ] **Dipendenze direzionali:** evitare dipendenze circolari; i componenti di alto livello non devono conoscere dettagli infrastrutturali non necessari.
- [ ] **Inversione delle dipendenze mirata:** utilizzare trait, interfacce o adapter quando consentono sostituzione, isolamento nei test o disaccoppiamento reale.
- [ ] **API minime:** esportare esclusivamente le funzionalità necessarie, mantenendo private strutture, mutabilità e dettagli implementativi.
- [ ] **Coesione elevata:** raggruppare funzionalità che cambiano per gli stessi motivi e separare responsabilità con cicli evolutivi differenti.
- [ ] **Configurazione centralizzata:** definire configurazioni tipizzate, validate e con valori predefiniti documentati.

### Contratti e invarianti

- [ ] **Design by Contract:** definire precondizioni, postcondizioni e invarianti dei componenti critici.
- [ ] **Stati illegali non rappresentabili:** utilizzare tipi, enum, varianti e costruttori validati per impedire configurazioni incoerenti.
- [ ] **Tipi semantici:** distinguere tramite tipi appropriati identificatori, unità di misura, timestamp, dimensioni e valori con significati differenti.
- [ ] **Nullabilità esplicita:** distinguere assenza di valore, errore, valore non ancora disponibile e valore valido.
- [ ] **Errori tipizzati:** rappresentare gli errori operativi attesi tramite `Result`, `Either`, eccezioni tipizzate o equivalenti appropriati al linguaggio.
- [ ] **Versionamento dei contratti:** prevedere compatibilità ed evoluzione controllata per API, protocolli e dati persistenti.

### Modularità e riuso — P1

Il codice deve essere **modulare e riutilizzabile**: responsabilità riconoscibili, contratti minimi e dipendenze
controllate. Questi requisiti si applicano al codice nuovo e alle parti modificate, secondo proporzionalità,
KISS e YAGNI (sezioni 0 e 1). I requisiti P0 su correttezza, risorse e concorrenza continuano a prevalere.

#### Distinguere organizzazione, disaccoppiamento e riuso

- [ ] **Separazione verificabile:** spostare metodi in più file migliora l'organizzazione. Per dichiarare un componente disaccoppiato occorrono anche un contratto e dipendenze esplicite; se tutti i file modificano liberamente lo stesso stato, documentare il coordinatore e il lavoro di separazione ancora necessario.
- [ ] **Responsabilità e coesione:** raggruppare operazioni che condividono invarianti e motivi di cambiamento. Tenere insieme ciò che deve essere coerente o atomico; separare regole applicative, coordinamento, persistenza, trasporto e presentazione quando hanno cicli di evoluzione differenti.
- [ ] **Dimensioni come segnale:** file lunghi, molti collaboratori, parametri estranei e modifiche che attraversano numerose aree richiedono una revisione dei confini. Il numero di file o righe, da solo, non dimostra qualità né riuso; limiti specifici del progetto devono avere una motivazione e ammettere codice generato o dichiarativo coerente.
- [ ] **Nomi specifici:** nomi di moduli e operazioni descrivono il compito. Evitare contenitori generici come `utils`, `common` o `manager` che raccolgono responsabilità estranee; una parte comune ha un nome e un contratto legati alla conoscenza che conserva.

#### Scegliere il confine più semplice

| Confine | Quando usarlo | Cosa deve restare esplicito |
| ----- | ----- | ----- |
| Funzione | Calcolo, trasformazione o validazione con input e output definiti | Precondizioni, risultato, errori ed eventuali effetti |
| Modulo | Funzioni e tipi coesi, con dettagli da nascondere ai chiamanti | API interna o pubblica, dipendenze e invarianti |
| Crate o package | Consumo indipendente, dipendenze o piattaforme distinte, distribuzione o versionamento separati realmente necessari | Build autonoma rispetto all'app, dipendenze dirette, feature e compatibilità |
| Trait o adapter | Collaboratore da sostituire in produzione o nei test, confine I/O o implementazioni realmente differenti | Semantica comune, errori, ownership e ciclo di vita |

- [ ] **Estrazione motivata:** un componente può essere estratto anche con un solo chiamante quando isola una regola dalla GUI, rende verificabile un'invariante o chiarisce proprietà e durata delle risorse. L'astrazione condivisa deve invece corrispondere a esigenze e semantiche comuni osservate nei punti d'uso.
- [ ] **Costo proporzionato:** iniziare da funzioni e moduli; introdurre crate, framework di injection, plugin o livelli aggiuntivi soltanto per un beneficio concreto. La riutilizzabilità di una libreria non richiede la pubblicazione su un registro.
- [ ] **Dipendenze dichiarate:** usare import espliciti nel codice applicativo e limitare le dipendenze a quelle realmente necessarie. Feature facoltative e target distinti vanno introdotti per consumatori o piattaforme effettivi e verificati nelle combinazioni dichiarate supportate.

#### Direzione delle dipendenze e isolamento del dominio

- [ ] **Dipendenze unidirezionali:** descrivere livelli e import dei componenti toccati. Le app dipendono da `packages/shared`; dashboard e overlay usano anche `packages/browser-runtime`, che dipende da `shared`. `shared` non importa le app né browser-runtime; il server non importa codice del browser. Le app comunicano tramite contratti HTTP/Socket.IO, senza importarsi a vicenda. Le regole di dominio ricevono dati e collaboratori pertinenti, senza dipendenze implicite da DOM, query o credenziali.
- [ ] **Assenza di cicli:** evitare dipendenze circolari tra componenti. Non risolverle trasferendo tutto in un modulo comune; individuare la responsabilità condivisa o il contratto necessario. La semplice separazione in crate non corregge un ciclo concettuale.
- [ ] **Effetti ai bordi:** lettura di file, rete, database, ambiente, orologio e casualità appartengono agli adattatori o vengono forniti esplicitamente quando influenzano una decisione. Le funzioni del dominio restituiscono risultati o effetti descritti da dati; il chiamante ne esegue le operazioni esterne.
- [ ] **Sostituzione minima:** preferire parametri, callback o trait già disponibili; introdurre un'interfaccia nuova quando consente una sostituzione o un contratto verificabile. Evitare un trait per ogni struttura o interfacce che riproducono tutti i metodi di un'implementazione.
- [ ] **Stato accessibile per operazioni:** i chiamanti modificano lo stato tramite operazioni che preservano le invarianti. Un coordinatore può possedere più servizi, ma i collaboratori ricevono soltanto i dati e le capacità necessari al proprio compito. Stato globale mutabile e singleton richiedono una motivazione esplicita; costanti immutabili e cache interne deterministiche non equivalgono a un registro globale di servizi.

#### Riusare conoscenza e comportamento

- [ ] **Ricerca prima della scrittura:** controllare moduli, chiamanti, test e dipendenze adottate prima di aggiungere parser, normalizzazioni, validazioni, retry, configurazioni o conversioni. Concentrare la regola in un solo punto e farvi convergere gli usi compatibili.
- [ ] **Semantica prima della somiglianza:** confrontare input, limiti, unità, valori predefiniti, errori, ordinamento ed effetti. Due algoritmi simili con contratti diversi possono restare distinti; per esempio, una lista che conserva spazi e doppioni e una che normalizza e deduplica i nomi.
- [ ] **Riuso reale:** una parte comune viene consumata tramite la stessa implementazione, senza copie locali o varianti che si aggiornano a mano. Registrare i chiamanti reali e il beneficio dell'estrazione. Un esempio o un test dimostra come si usa il componente, ma non sostituisce la motivazione né giustifica una generalizzazione da solo.
- [ ] **Generalizzazione mirata:** aggiungere soltanto le opzioni e i punti di estensione richiesti dai casi effettivi. Evitare lunghe sequenze di booleani, parametri universali e rami per piattaforma nel dominio quando tipi espliciti o adattatori separati chiariscono il contratto.
- [ ] **Implementazioni intercambiabili:** una versione finta e una reale rispettano lo stesso significato di successo, errore, cancellazione e ownership. Sostituire il collaboratore non deve cambiare silenziosamente le decisioni del dominio.

#### API minima, tipi e contratti

- [ ] **Visibilità minima:** esportare solo i contratti consumati da altri moduli; mantenere privati i dettagli, limitare gli export dei pacchetti e preservare i percorsi pubblici quando si spostano le implementazioni.
- [ ] **Input pertinenti:** le API richiedono dati e capacità utili al compito. Evitare di passare l'intero backend o un contenitore di servizi per accedere a pochi campi. Un aggregato di configurazione coerente è ammesso; documentare le conversioni e i dati inutilmente copiati se incidono sul percorso caldo.
- [ ] **Tipi semantici:** identificatori, piattaforme, durate, stati ed errori distinguibili hanno tipi appropriati. Eventi DOM, record SQLite e payload HTTP/Socket.IO si convertono e validano al confine quando il dominio non deve dipenderne.
- [ ] **Invarianti protette:** campi privati e costruttori validati quando la mutazione può rendere un oggetto incoerente. Campi pubblici sono ammessi per dati passivi con un contratto chiaro; non obbligare ogni struttura a una gerarchia di getter e setter.
- [ ] **Contratto operativo:** dichiarare precondizioni, postcondizioni, limiti, errori, ordine degli effetti, chiamate ripetute ammesse e stato dopo un fallimento. Se conta, indicare thread o executor, inizializzazione, rientranza, cancellazione, idempotenza e chiusura; richiamare le sezioni 3, 5, 6 e 7.
- [ ] **Esempio significativo:** per una nuova API riutilizzabile fornire un uso minimo compilabile che mostri il beneficio e la gestione degli errori. Per una funzione interna semplice bastano documentazione essenziale e prove pertinenti; gli esempi non devono introdurre accessi a dati reali o segreti impliciti.

#### Composizione, ownership e configurazione

- [ ] **Composizione esplicita:** costruire i collaboratori nel punto di avvio dell'applicazione o nell'adattatore competente e passarli ai componenti che li usano. Un costruttore apparentemente puro non apre connessioni, legge preferenze globali o avvia thread senza dichiararlo.
- [ ] **Ownership nell'API:** rendere chiaro chi possiede dati, buffer, socket, task e callback. Dichiarare mutabilità, copie, trasferimenti e responsabilità di chiusura; l'uso di TypeScript o del garbage collector non elimina queste responsabilità.
- [ ] **Un proprietario per stato e risorse:** evitare copie mutabili dello stesso stato in moduli diversi e servizi che si chiudono a vicenda senza un ordine dichiarato. Spostare codice non deve cambiare chi annulla un task, libera una richiesta o termina un worker.
- [ ] **Configurazione separata dalla sessione:** distinguere preferenze persistenti, stato operativo e fotografie consegnate al lavoro già accettato. Emote, regole compilate, account e autorizzazioni correnti sono input espliciti; una preferenza attiva non prova che il servizio sia autenticato o disponibile.
- [ ] **Fotografie coerenti:** definire chi ricostruisce la configurazione e tutte le dipendenze che la invalidano, incluse risposte asincrone e cambi di stato temporanei. Una revisione nuova non modifica i dati delle operazioni già avviate; i risultati superati vengono riconosciuti al ritorno.
- [ ] **Costi del riuso:** osservare conversioni, copie, allocazioni, lock, code e notifiche introdotti dall'astrazione. Il passaggio a un componente comune non dimostra un miglioramento prestazionale; nei percorsi sensibili confrontare il carico rappresentativo prima e dopo, secondo la sezione 4.

#### Evoluzione compatibile

- [ ] **Contratti stabili:** distinguere API interne, API pubbliche del crate e protocolli o dati persistenti. Uno spostamento interno conserva i punti d'ingresso pubblici, anche tramite re-export o delega dove opportuno.
- [ ] **Modifiche incompatibili dichiarate:** documentare i consumatori coinvolti, la migrazione e il versionamento applicabile. Prevedere una deprecazione quando esistono consumatori da accompagnare; l'aggiunta di un nuovo metodo richiesto a un trait può coinvolgere le implementazioni esterne.
- [ ] **Dettagli non esposti per comodità:** mantenere interne mutabilità e rappresentazioni che potrebbero cambiare. Dipendenze pubbliche, formati serializzati e feature esportate costituiscono impegni di compatibilità da rendere intenzionali.
- [ ] **Documentazione vicina al codice:** descrivere responsabilità, API e invarianti nel modulo; conservare la mappa delle dipendenze e le decisioni trasversali nel documento architetturale del progetto. Una scelta controversa o un'eccezione indica motivo, conseguenza e condizione per riesaminarla.

#### Estrarre e verificare in modo incrementale

- [ ] **Contratti iniziali riletti:** individuare chiamanti e usi indiretti: callback, hook React, worker, codice generato, binding, esempi e test. Registrare cosa deve restare osservabile e le verifiche applicabili prima di muovere il codice.
- [ ] **Spostamenti separati:** separare in commit revisionabili spostamenti, estrazioni di conoscenza comune e cambi intenzionali di comportamento. Mantenere la compatibilità durante la transizione e rimuovere le vecchie copie dopo aver aggiornato i chiamanti.
- [ ] **Prove al confine corretto:** provare le regole di dominio con dati e collaboratori controllati. Gli adattatori React/DOM, SQLite, HTTP, Socket.IO e worker richiedono anche integrazione con il framework o servizio locale pertinente.
- [ ] **Stessa semantica nei consumatori:** per una regola comune esercitare gli ingressi realmente differenti dei chiamanti su casi normali, limiti ed errori. Verificare risultati ed effetti; evitare test che si limitano a ripetere l'implementazione o a controllare che una funzione sia stata chiamata.
- [ ] **Verifica nativa:** compilare i target coinvolti e ripetere le prove pertinenti prima e dopo sulla toolchain supportata. Confronto testuale, conteggio delle righe, script estratti dalla GUI ed esempi non eseguiti sono evidenze parziali; si dichiarano secondo la sezione 14.
- [ ] **Risorse e concorrenza preservate:** applicare anche la matrice della sezione 11 se l'estrazione tocca cache, cancellazione, code, persistenza o thread. Il refactoring del solo layout non autorizza a saltare le prove del confine FFI o dei callback.

Per una modularizzazione o estrazione significativa, la revisione deve contenere le evidenze pertinenti:

| Criterio | Evidenza richiesta |
| ----- | ----- |
| Responsabilità | Cosa decide il componente, cosa delega e chi possiede il suo stato |
| Dipendenze | Direzione dei collegamenti, import o manifest e assenza di nuovi cicli |
| Contratto | Input, output, errori, limiti ed effetti; invarianti di concorrenza quando presenti |
| Riuso | Regola concentrata in un punto, chiamanti reali oppure beneficio concreto dell'isolamento |
| Isolamento | Prove del dominio senza servizi reali e prove d'integrazione degli adattatori pertinenti |
| Compatibilità | Chiamanti e punti d'ingresso preservati, oppure cambi e migrazione dichiarati |
| Risorse e prestazioni | Ownership e cleanup; misure prima/dopo quando il percorso o l'astrazione possono incidere sul carico |

La tabella non impone documenti separati per interventi piccoli: le evidenze possono stare nel contratto,
nei test e nella descrizione della modifica. Un'eccezione P1 è motivata secondo la sezione 0; non richiede
un'autorizzazione aggiuntiva per una scelta già compresa nel lavoro richiesto.

#### Linee guida ufficiali e versioni

- [ ] **Fonti correnti e compatibili:** controllare le linee guida ufficiali del linguaggio e del framework nella versione adottata dal progetto, registrando fonte, data e applicabilità delle scelte nuove. Usare standard stabili compatibili con la toolchain; un refactoring non comporta automaticamente un aggiornamento delle dipendenze.
- [ ] **Conformità verificata:** applicare le API pubbliche delle versioni adottate di TypeScript, Node.js, React, Vite, Fastify, Socket.IO e Python. Verificare cleanup, compatibilità dei worker e binding nativi. Funzionalità instabili e nuove dipendenze richiedono una necessità esplicita.

Riferimenti dello stack: [TypeScript](https://www.typescriptlang.org/docs/),
[Node.js](https://nodejs.org/docs/latest-v26.x/api/), [React](https://react.dev/reference/react),
[Fastify](https://fastify.dev/docs/latest/), [Vite](https://vite.dev/guide/) e
[Python](https://docs.python.org/3/). Per ogni scelta nuova verificare la documentazione della versione adottata.

## 3. Memoria, ownership e gestione delle risorse

### Allocazioni e lifetime

- [ ] **Allocazioni controllate:** identificare e ridurre le allocazioni dinamiche nei percorsi caldi quando il profiling ne dimostra il costo.
- [ ] **Riutilizzo dei buffer:** preferire buffer riutilizzabili o preallocati nei processi ripetitivi, senza creare pool complessi per operazioni economiche.
- [ ] **Capacità proporzionate:** evitare preallocazioni eccessive che incrementano inutilmente il consumo di memoria.
- [ ] **Ownership esplicita:** ogni risorsa deve avere un proprietario o una politica di proprietà chiaramente definita.
- [ ] **RAII e cleanup automatico:** garantire il rilascio di file, socket, handle, lock e altre risorse anche in presenza di errori.
- [ ] **Lifetime verificato:** impedire riferimenti pendenti, use-after-free, double-free e accessi a risorse già chiuse.
- [ ] **Zero-copy selettivo:** utilizzare slice, view, riferimenti costanti o trasferimento di ownership quando evitano copie costose senza introdurre problemi di lifetime.
- [ ] **Copie intenzionali:** consentire copie quando semplificano il modello di proprietà, evitano lock prolungati o riducono l'accoppiamento.
- [ ] **Assenza di leak:** verificare che risorse e memoria siano rilasciate anche su percorsi di errore, cancellazione e shutdown.

### Budget di memoria verificabile — P0

- [ ] **Dimensione e capacità distinte:** un limite a elementi, caratteri o `len()` non dimostra un limite alla memoria. Controllare anche buffer trattenuti, `capacity()`, copie e dati in attesa.
- [ ] **Taglio prima dell'accumulo:** leggere risposte HTTP e audio a pezzi, verificando il budget prima di estendere il buffer. Per i log, comporre direttamente un testo limitato oppure conservare una copia compatta del prefisso; `truncate()` da solo non libera la capacità.
- [ ] **Budget dell'operazione completa:** il limite vale per tutti i frame o pezzi sommati, non soltanto per il singolo frame. Un timeout non sostituisce un limite ai byte.
- [ ] **Prova sul caso sfavorevole:** esercitare testi lunghi, Unicode, frame piccoli ripetuti e risposte senza `Content-Length`; verificare sia il rifiuto sia il rilascio delle risorse. La capacità trattenuta deve restare proporzionata al budget dichiarato.

### Località dei dati e cache

- [ ] **Data locality:** preferire strutture contigue per scansioni intensive e accessi prevedibili.
- [ ] **Scelta delle rappresentazioni:** confrontare Array-of-Structures e Structure-of-Arrays quando il pattern di accesso può beneficiare della vettorizzazione.
- [ ] **Riduzione delle indirezioni:** evitare catene di puntatori non necessarie nei percorsi prestazionalmente critici.
- [ ] **False sharing:** individuare con profiling la contesa tra variabili frequentemente modificate da thread differenti.
- [ ] **Allineamento selettivo:** utilizzare padding o allineamento alla cache line quando il vantaggio supera il maggiore consumo di memoria.
- [ ] **SIMD:** utilizzare vettorizzazione automatica o esplicita soltanto quando supportata dal target e verificata con benchmark.

## 4. Algoritmi, strutture dati e prestazioni

### Complessità e scelta algoritmica

- [ ] **Complessità adeguata:** evitare algoritmi quadratici o peggiori su input potenzialmente grandi quando esistono alternative ragionevoli.
- [ ] **Struttura dati appropriata:** scegliere tra array, vettori, hash map, alberi e strutture specializzate considerando lookup, inserimenti, iterazione e memoria.
- [ ] **Profilo del carico reale:** non presumere che una hash map sia sempre più veloce di una ricerca lineare su un piccolo vettore.
- [ ] **Elaborazione incrementale:** evitare ricalcoli completi quando è possibile aggiornare soltanto i dati modificati.
- [ ] **Memoizzazione e caching:** introdurre cache solo con politiche esplicite di invalidazione, capienza, scadenza e coerenza.

### I/O ed elaborazione in batch

- [ ] **I/O bufferizzato:** evitare operazioni byte-per-byte o syscall inutilmente frequenti.
- [ ] **Batching:** raggruppare operazioni di rete, database o filesystem quando migliora throughput senza compromettere latenza o correttezza.
- [ ] **Streaming:** utilizzare elaborazione incrementale quando caricare l'intero contenuto in memoria non è necessario.
- [ ] **Limiti dimensionali:** imporre dimensioni massime a payload, buffer, messaggi e contenuti elaborabili.
- [ ] **Zero-copy I/O:** valutare scatter/gather I/O e API specifiche della piattaforma quando giustificate.

### Ottimizzazione basata su misure

- [ ] **Profiling prima dell'ottimizzazione:** identificare i veri hotspot CPU, memoria, I/O e lock contention.
- [ ] **Benchmark riproducibili:** utilizzare input rappresentativi, warm-up ove necessario e condizioni comparabili.
- [ ] **Misure multiple:** confrontare mediana, dispersione e latenza di coda, evitando conclusioni basate su una singola esecuzione.
- [ ] **Metriche rilevanti:** misurare throughput, latenza, CPU, memoria di picco, allocazioni e consumo delle risorse pertinenti.
- [ ] **Nessuna regressione significativa:** non accettare miglioramenti locali che peggiorano in modo sproporzionato il sistema complessivo.
- [ ] **Ottimizzazioni documentate:** conservare la motivazione delle soluzioni meno intuitive adottate per ragioni prestazionali.

## 5. Multithreading, asincronia e gestione dei task

### Modello di concorrenza

- [ ] **Ownership come principio predefinito:** preferire dati immutabili, trasferimento di ownership e message passing.
- [ ] **Condivisione esplicita:** utilizzare memoria condivisa sincronizzata quando il costo o le caratteristiche dell'applicazione la rendono preferibile.
- [ ] **Thread ownership chiara:** identificare il thread o l'executor responsabile di ogni componente e risorsa con affinità.
- [ ] **Nessuno spawn illimitato:** evitare un thread nativo per ogni richiesta, evento o connessione.
- [ ] **Task bounded:** limitare task in esecuzione, task in coda, connessioni contemporanee e operazioni bloccanti.
- [ ] **Concorrenza strutturata:** quando possibile, collegare il ciclo di vita dei task al chiamante, a un supervisore o a uno scope esplicito.
- [ ] **Nessun fire-and-forget incontrollato:** ogni task deve avere responsabilità definite per errori, cancellazione e terminazione.
- [ ] **Propagazione degli errori:** i fallimenti dei worker devono essere osservabili e gestiti; non devono scomparire silenziosamente.

### Thread nativi e concorrenza strutturata in ZeroCade — P0/P1

- [ ] **Proprietario esplicito — P0:** ogni `worker_threads.Worker`, Web Worker, processo Python e task asincrono ha un supervisore che ne osserva errori, completamento e chiusura. Un `Promise` o `async` non crea un thread e non rende parallelo un calcolo sincrono.
- [ ] **Isolamento del lavoro — P0:** il server e il browser mantengono reattivi gli event loop. Calcoli lunghi e operazioni sincrone estese vanno in worker dedicati o processi separati. Ogni worker Node possiede un proprio isolate JavaScript; passare messaggi non equivale a condividere oggetti o connessioni SQLite.
- [ ] **Cancellazione cooperativa — P0:** usare `AbortSignal`, messaggi di arresto e identificativi di generazione. Un `AbortSignal` non interrompe automaticamente codice CPU o una query sincrona nel worker; un messaggio non viene elaborato finché il suo event loop è bloccato. I calcoli devono avere punti di controllo o un protocollo di cancellazione adeguato.
- [ ] **Shutdown con scadenza — P0:** fermare nuovi invii, drenare il lavoro accettato secondo il contratto, chiudere DB e porte e attendere l'evento `exit`. `unref()` non è una chiusura. `worker.terminate()` o l'arresto di un figlio sono escalation dopo la scadenza: registrare effetti di esito sconosciuto e non promettere cleanup ordinato.
- [ ] **Python:** per calcolo parallelo valutare processi o librerie native che rilasciano il GIL; non presumere che thread Python accelerino codice Python CPU-bound. Registrare interprete, modalità GIL e numero di thread interni di BLAS/PyTorch quando incidono sui risultati.
- [ ] **Eventuale codice nativo:** C++ può usare `std::jthread`/`std::stop_token`, Rust scoped threads e canali bounded. Il join resta dipendente dalla terminazione del lavoro: nessuna scadenza è garantita dal solo costrutto RAII. Queste API non sono requisiti di implementazione per TypeScript.

### Hardware, cache e partizionamento — P1/P2

- [ ] **Parallelismo misurato — P1:** partire dal carico e da `os.availableParallelism()` come indicazione, riservando risorse a OBS, browser e diretta; contare anche processi e thread interni delle librerie numeriche. Non creare un worker per evento o dimensionare tutti i pool al massimo della CPU.
- [ ] **Dati locali — P1:** preferire accumulatori e buffer di proprietà del worker e aggregazione finale. Valutare costo delle copie, structured clone e trasferimenti di `ArrayBuffer`; dopo il trasferimento il mittente non deve riutilizzare il buffer distaccato.
- [ ] **False sharing — P2:** se si introduce memoria condivisa aggiornata frequentemente, misurare contesa e disposizione dei dati. Allineamento e padding dipendono dal target e non sono una correzione da aggiungere a oggetti JavaScript ordinari.
- [ ] **NUMA e affinità — P2:** valutare pinning e memoria locale soltanto su carichi misurati e piattaforme supportate. Non sono prerequisiti per avvio o correttezza di ZeroCade.

### Coordinamento a fasi e scheduling — P1

- [ ] **Fasi delimitate:** usare identificativi di richiesta/generazione, conferme e deadline per inizializzazione, batch e round. Una barriera non deve aspettare per sempre un worker terminato; errori e cancellazione completano anche i chiamanti in attesa.
- [ ] **Pool per responsabilità:** separare calcolo intenso, persistenza/report sincroni e I/O asincrono quando possono interferire. Usare i worker già presenti prima di introdurre un nuovo pool; dimensionare code e concorrenza in base alle misure.
- [ ] **Fairness:** gli eventi frequenti non devono affamare comandi di chiusura, conferme di persistenza o controllo della diretta. FIFO, priorità e coalescing devono preservare l'ordine richiesto dal dominio.
- [ ] **Work stealing — P2:** adottare uno scheduler mantenuto solo per calcoli irregolari che ne beneficiano. Una coda FIFO o uno scheduler, da soli, non provano assenza di starvation o proprietà lock-free.

### Backpressure e gestione delle code

- [ ] **Eventi persistenti — P0:** non scartare silenziosamente regali, voti o comandi già accettati; distinguere rifiuto prima dell'avvio da esito sconosciuto. Latest-wins è ammesso solo dove gli stati intermedi sono sacrificabili.

- [ ] **Code delimitate (Bounded Queues) — P0:** nessuna coda di thread pool può essere illimitata. Impostare una capacità massima prefissata per prevenire esaurimento della memoria sotto carico anomalo.
- [ ] **Backpressure cooperativa o rifiuto esplicito — P1:** quando la coda di un thread pool è satura, il produttore deve attendere in modo asincrono entro una deadline, oppure l'invio deve rifiutare il lavoro con errore tipizzato esplicito, impedendo accumuli di latenza non gestibili.
- [ ] **Strategie differenziate di saturazione:** scegliere tra attesa sincronizzata, rifiuto, coalescing o sostituzione dell'ultimo elemento (*latest-wins*) in base alla semantica del dato.
- [ ] **Metriche delle code:** monitorare profondità istantanea, tempo medio di permanenza e frequenza di eventi scartati.

### Cancellazione e shutdown

- [ ] **Cancellazione cooperativa:** utilizzare cancellation token, stop token o meccanismi equivalenti.
- [ ] **Cancellazione propagata:** propagare l'arresto ai task figli quando appropriato.
- [ ] **Shutdown ordinato:** interrompere l'accettazione di nuovo lavoro, gestire i task pendenti, chiudere risorse e terminare worker.
- [ ] **Shutdown bounded:** prevedere scadenze operative e politiche per i task non terminabili immediatamente.
- [ ] **Drain esplicito:** definire quali code debbano essere svuotate e quali possano essere scartate.
- [ ] **Operazioni non interrompibili:** proteggere le sezioni in cui una cancellazione potrebbe lasciare dati o risorse incoerenti.
- [ ] **Nessun thread orfano:** ogni worker deve avere un proprietario responsabile della terminazione.

### Confini di cancellazione e side effect — P0

- [ ] **Analisi di ogni `await` interrompibile:** per ogni ramo di competizione fra Promise, timeout o task annullabile, indicare quali side effect possono essere già avvenuti e quale stato sopravvive alla cancellazione o al completamento del chiamante.
- [ ] **Invio iniziato distinto da invio confermato:** una richiesta già trasmessa, un Invio premuto o una scrittura iniziata non si riavviano automaticamente dall'inizio. Un esito sconosciuto deve essere esplicito; si ritenta soltanto se l'operazione è idempotente o se si può escludere l'effetto precedente.
- [ ] **Comandi ordinari senza interruzione dell'invio:** aggiungere un messaggio alla coda non deve cancellare un invio in corso. Riservare la cancellazione ai comandi che la richiedono e gestire il punto in cui l'effetto esterno può essere avvenuto.
- [ ] **Cleanup indipendente dalla conclusione normale:** rimuovere richieste pendenti, registrazioni e permessi anche se il chiamante viene annullato. Usare `try/finally` e cleanup del proprietario, non soltanto codice dopo un `await` o dentro il ramo timeout.
- [ ] **Deadline delle scritture:** limitare anche invio, flush, Pong e Close del socket. Il timeout della risposta non garantisce che il task di trasporto possa terminare.
- [ ] **Prova deterministica:** sospendere l'operazione prima e dopo il side effect, iniettare un nuovo comando e verificare assenza di duplicati, richieste pendenti e conferme spurie. Usare barriere o segnali controllati, non sperare che una corsa si manifesti con uno `sleep`.

### Modelli di concorrenza e limiti da verificare

| Modello | Uso in ZeroCade | Limite da verificare |
|---|---|---|
| Event loop Node / Promise | Coordinamento, HTTP, Socket.IO | Il lavoro sincrono blocca gli altri callback; `await` introduce interleaving |
| Worker Node e MessagePort | Persistenza, report, generazione e calcolo isolato | Code bounded, copie/trasferimenti, errori, ordine e shutdown |
| Web Worker | Connessione e lavoro del browser fuori dal rendering | DOM sul main thread, notifiche raggruppate e chiusura del worker |
| Processi Python | Preparazione dati e modelli con ambiente separato | Pipe drenate, timeout, memoria e processi discendenti |
| Memoria condivisa / Atomics | Solo se giustificata da misure | Protocollo di pubblicazione, cancellazione e assenza di attese sul main thread |
| Thread nativi / pool esterni | Binding e librerie numeriche, eventuale codice futuro | Budget globale, ABI e garanzie documentate dall'implementazione |

Nessun modello implica automaticamente assenza di deadlock, wait-freedom o lock-freedom.
Anche attori senza memoria condivisa possono bloccarsi con attese circolari fra messaggi.

## 6. Sincronizzazione, lock, primitive atomiche e prevenzione degli stalli

### Stato, lock e sezioni critiche

- [ ] **Proprietà dello stato — P0:** preferire passaggio di messaggi e un proprietario delle mutazioni. Specificare ordine, conferma e invalidazione; snapshot immutabili riducono condivisione e contesa ma possono avere costi di copia.
- [ ] **Sezioni critiche limitate — P0:** validare input e preparare lavoro fuori dai lock quando possibile; verificare sotto lock le precondizioni che dipendono dallo stato protetto. Emettere callback ed eventi esterni dopo il rilascio. Le transazioni DB comprendono l'I/O necessario al commit, senza rete o calcolo estraneo.
- [ ] **Ordine dei lock — P0:** se servono più lock, documentare un ordine unico e vietare acquisizioni inverse e callback rientranti. Rilasciare anche su errore con `try/finally`, context manager o RAII.
- [ ] **Nessuna attesa sincrona sul main thread — P0:** vietati spin loop e `Atomics.wait` nel coordinamento del server o nel rendering. Un lock sincrono o una transazione sincrona non attraversa `await`; un mutex asincrono richiede comunque analisi di rientranza, ordine e timeout.
- [ ] **Acquisizioni bounded — P1:** definire timeout e budget di retry. Rilasciare quanto acquisito prima di riprovare; usare backoff con jitter fuori dalla sezione critica. Non ripetere automaticamente una mutazione il cui commit è incerto.
- [ ] **Contesa e starvation — P1/P2:** misurare durata e attesa dei lock e assicurare avanzamento a lettori e scrittori. Sharding, RCU, spin brevi e protocolli di priorità appartengono a codice nativo con necessità dimostrata; non si introducono per simulare mutex nei callback JavaScript.

### Processi figli e pipe IPC — P0

- [ ] Consumare `stdout` e `stderr` contemporaneamente, prima di attendere l'uscita: listener streaming in Node, `communicate()`/`subprocess.run()` per output limitato in Python, oppure drain concorrente per output esteso. Non leggere una pipe fino a EOF lasciando l'altra piena.
- [ ] Imporre limiti all'output conservato, timeout e gestione di `error`, `exit` e `close`. Attendere la chiusura degli stream prima di dichiarare completa la raccolta; controllare errori di `stdin` e backpressure di `write()`/`send()`.
- [ ] Usare argomenti strutturati, `shell: false` e `windowsHide: true` per helper Windows. `execSync`/`execFileSync` e `subprocess.run` sono ammessi in script CLI di build/manutenzione con output ereditato o controllato, non nei percorsi interattivi del server o del browser.
- [ ] Un figlio ha sempre un proprietario che raccoglie l'esito e gestisce eventuali discendenti. Node/libuv e `subprocess` gestiscono l'attesa secondo le rispettive API: non aggiungere handler `SIGCHLD` POSIX come requisito per Windows.

### SQLite, transazioni e file lock — P0/P1

- [ ] **Connessioni per proprietario:** ogni worker/thread possiede e chiude la propria connessione; nessun oggetto `Database`/statement passa attraverso MessagePort. Eseguire transazioni sincrone brevi e query parametrizzate.
- [ ] **WAL sul database operativo:** usare WAL per database locali modificabili con lettori e scrittore concorrenti, verificando il valore restituito. Non imporlo a DB in memoria, snapshot in sola lettura, archivi distribuiti o filesystem di rete; non cambiare journal mode dei contenuti durante le prove.
- [ ] **Busy timeout entro il budget:** configurare ogni connessione potenzialmente contesa; 5000 ms è il valore di riferimento operativo, da adeguare alla deadline della richiesta e al thread che attende. Aumentarlo non risolve lock circolari né rende asincrona una query sincrona. Trattare `SQLITE_BUSY` e `SQLITE_BUSY_SNAPSHOT` come esiti possibili anche con WAL.
- [ ] **Scritture e snapshot:** usare `BEGIN IMMEDIATE`/`.immediate()` per transazioni di lettura-modifica-scrittura contese quando è necessario acquisire subito il diritto di scrittura. Le transazioni di sola lettura restano snapshot/deferred; una singola scrittura atomica non richiede un wrapper aggiuntivo. WAL mantiene un solo writer alla volta.
- [ ] **Errori e commit:** rollback e rilascio in ogni percorso; notificare persistenza soltanto dopo conferma. Un timeout del chiamante non prova che il worker abbia annullato la query o il commit: mantenere l'esito sconosciuto senza replay automatico.
- [ ] **Checkpoint e backup:** lettori lunghi possono trattenere WAL; checkpoint e VACUUM vanno pianificati fuori dalla diretta secondo i vincoli del database. Usare backup consistenti, includendo il WAL confermato; vietato sostituire file di un DB aperto.
- [ ] **Messa a punto della connessione:** impostare per connessione, e misurare prima di adottarli (sezione 4): `cache_size` adeguata al carico (il valore predefinito, circa 2 MB, è piccolo), `temp_store = MEMORY` se gli ordinamenti temporanei sono piccoli, `journal_size_limit` perché il file WAL rientri dopo i checkpoint, `mmap_size` solo dopo prova su Windows (filesystem e connessioni multiple possono renderlo inutile o rischioso). Lanciare `PRAGMA optimize` alla chiusura e, nei processi lunghi, a intervalli di ore e fuori dalle finestre critiche, così le statistiche del planner seguono i dati.
- [ ] **Statement preparati riusati:** le query ripetute con frequenza (scritture per evento o per round, letture periodiche) si preparano una volta per connessione (`db.prepare(...)` tenuto in un campo del modulo che possiede la connessione) e si riusano, invece di ricompilare l'SQL a ogni chiamata; lo statement appartiene al worker e non attraversa MessagePort.
- [ ] **Lock su file:** preferire primitive mantenute e compatibili con Windows. Per file sentinella, PID da solo non basta: considerare riuso del PID, identità del proprietario e corse di creazione/rimozione. Lease e fencing servono soltanto se viene introdotto un coordinamento distribuito; il backend deve verificarli.

### Watchdog e diagnostica — P0/P1

- [ ] **Clock monotono:** misurare timeout, heartbeat e avanzamento con `performance.now()`/`process.hrtime` o `time.monotonic()`. Data/ora civile serve per eventi e log, non per garantire durata.
- [ ] **Supervisore indipendente:** un timer sul medesimo event loop bloccato non rileva lo stallo in tempo. Se è richiesta rilevazione durante blocchi del main, prevedere supervisione separata con soglie e responsabilità esplicite.
- [ ] **Escalation controllata:** al mancato avanzamento rifiutare nuovo lavoro, registrare identità/richieste ed esiti incerti, raccogliere diagnostica senza segreti, tentare shutdown entro deadline e solo poi terminare/riavviare secondo una politica dichiarata. Non inviare segnali POSIX né produrre dump completi di default su Windows.
- [ ] **Disponibilità distinta da progresso:** `/api/live` segnala che il processo risponde e `/api/health` espone stato e saturazione dei worker; non garantiscono da soli un watchdog esterno o il completamento di una specifica scrittura.

### Atomiche e memoria condivisa

- [ ] **Prima scelta: messaggi — P1:** `SharedArrayBuffer`, ring buffer o strutture lock-free richiedono necessità misurata, protocollo scritto e test degli interleaving; non usare memoria condivisa per passare connessioni o oggetti JavaScript.
- [ ] **JavaScript — P0:** usare le operazioni `Atomics` supportate e documentare quali dati proteggono. L'API JavaScript non espone una scelta C++ `memory_order_relaxed/acquire/release`; non trasferire tali opzioni nelle prescrizioni TypeScript.
- [ ] **Codice nativo eventuale — P0:** usare primitive consolidate e memory ordering documentato. Acquire/release sincronizzano solo secondo le condizioni del modello di memoria; un contatore atomico non rende sicuri tutti i dati adiacenti. Verificare ABA, reclamation e proprietà di progresso prima di ridurre gli ordinamenti conservativi.
- [ ] **Attese e cancellazione:** ogni attesa ha un protocollo di risveglio su errore, arresto e deadline. Non promettere che `Promise.race` cancelli l'operazione perdente o che un flag venga osservato da un worker che non lo controlla.

### Matrice di prevenzione degli stalli

| Confine | Scenario da provare | Evidenza richiesta |
|---|---|---|
| IPC | Figlio produce entrambi gli stream oltre la capacità della pipe | Drain concorrente, memoria bounded e uscita entro deadline |
| SQLite | Due writer, lettore lungo, commit mentre il chiamante scade | Busy gestito, rollback/rilascio e nessuna conferma o duplicazione indebita |
| Worker | Coda piena, worker terminato, messaggio tardivo | Rifiuto esplicito, pending completati e generazione vecchia ignorata |
| Event loop | Calcolo o query che blocca il thread | Latenza misurata e isolamento quando richiesto; timer locale non spacciato per watchdog |
| File lock | Crash e riavvio con sentinella residua | Proprietario verificato e nessuna rimozione del lock di un altro processo |
| Shutdown | Lavoro accettato e operazione non interrompibile | Drain o esito sconosciuto, risorse chiuse e escalation documentata |

## 7. Resilienza, timeout e gestione dei guasti

### Timeout e deadline

- [ ] **Timeout ai boundary esterni:** stabilire limiti adeguati per connessioni, letture, scritture, query e altre operazioni che possono restare bloccate.
- [ ] **Deadline end-to-end:** imporre un budget temporale complessivo alle operazioni composte da più chiamate.
- [ ] **Propagazione delle deadline:** evitare che una chiamata interna continui inutilmente dopo la scadenza dell'operazione principale.
- [ ] **Clock monotono:** utilizzare orologi monotoni per misurazioni di durata, retry e timeout.
- [ ] **Timeout appropriati al contesto:** evitare valori universali che interrompono operazioni legittimamente lunghe.

### Retry e circuit breaker

- [ ] **Retry selettivi:** ripetere soltanto operazioni sicure da ritentare e fallimenti ragionevolmente transitori.
- [ ] **Exponential backoff con jitter:** evitare retry sincronizzati che amplificano il sovraccarico.
- [ ] **Budget di retry:** definire limiti per tentativi, durata complessiva e volume delle richieste ripetute.
- [ ] **Idempotenza:** impedire duplicazioni di effetti per operazioni ritentabili.
- [ ] **Circuit breaker mirato:** isolare dipendenze instabili quando ciò riduce realmente il rischio di guasti a cascata.
- [ ] **Bulkhead isolation:** evitare che l'esaurimento delle risorse di un sottosistema comprometta tutti gli altri.
- [ ] **Rate limiting:** applicare limiti di frequenza e concorrenza alle operazioni esposte a traffico incontrollato.

### Gestione degli errori

- [ ] **Nessun errore ignorato accidentalmente:** ogni errore deve essere propagato, gestito o intenzionalmente scartato con motivazione.
- [ ] **Errori contestualizzati:** preservare causa radice, componente coinvolto e dettagli diagnostici non sensibili.
- [ ] **Distinzione tra errori:** separare errori recuperabili, permanenti, di validazione, di programmazione e di infrastruttura.
- [ ] **Nessun panic come normale controllo di flusso:** riservare panic e assert alle invarianti appropriate, secondo il linguaggio e il contesto.
- [ ] **Fallback sicuri:** non nascondere malfunzionamenti tramite valori predefiniti plausibili ma errati.
- [ ] **Graceful degradation:** mantenere operative le funzioni essenziali quando un componente secondario non è disponibile.
- [ ] **Health e readiness:** distinguere processo avviato, processo funzionante e capacità effettiva di servire lavoro.

## 8. Integrità dei dati, persistenza e database

### Transazioni e consistenza

- [ ] **Confini transazionali definiti:** ogni operazione composta deve chiarire quali modifiche debbano essere atomiche.
- [ ] **Rollback sicuro:** gli errori parziali non devono lasciare dati persistenti incoerenti.
- [ ] **Livelli di isolamento adeguati:** scegliere la consistenza transazionale necessaria per le invarianti di dominio.
- [ ] **Concorrenza sulle scritture:** utilizzare lock transazionali, versioni o optimistic concurrency quando richiesto.
- [ ] **Vincoli nel database:** applicare constraint, unique key e foreign key quando supportati e appropriati.
- [ ] **Idempotency key:** prevenire duplicazioni delle operazioni persistenti ritentabili.
- [ ] **Outbox o meccanismi equivalenti:** affrontare esplicitamente la coerenza tra modifiche al database ed eventi esterni quando necessaria.

### Migrazioni e compatibilità

- [ ] **Migrazioni versionate:** gestire gli aggiornamenti dello schema tramite procedure riproducibili.
- [ ] **Compatibilità delle migrazioni:** supportare, quando richiesto, l'interazione tra versioni differenti di software e schema.
- [ ] **Backup e ripristino:** prevedere procedure di recupero proporzionate alla criticità dei dati.
- [ ] **Test di migrazione:** verificare aggiornamenti da versioni precedenti con dati rappresentativi.
- [ ] **Scritture atomiche su file:** evitare file parziali tramite file temporanei e sostituzione atomica quando il filesystem lo consente.
- [ ] **Durabilità esplicita:** utilizzare flush, sincronizzazione e politiche di persistenza coerenti con i requisiti.
- [ ] **Corruzione rilevabile:** valutare checksum, validazione del formato e procedure di recupero per dati critici.

## 9. Osservabilità, diagnostica e monitoraggio

### Logging

- [ ] **Log strutturati:** usare campi interrogabili e formati coerenti.
- [ ] **Correlation e Trace ID:** collegare operazioni appartenenti alla stessa richiesta o attività.
- [ ] **Livelli corretti:** distinguere debug, informazione, warning ed errore senza produrre rumore eccessivo.
- [ ] **Log non bloccanti sui percorsi caldi:** evitare che la diagnostica introduca stalli o rallentamenti importanti.
- [ ] **Rate limiting dei log:** aggregare o limitare messaggi ripetitivi.
- [ ] **Errori diagnosticabili:** includere componente, operazione, categoria del fallimento e causa disponibile.
- [ ] **Timestamp coerenti:** utilizzare UTC o timezone esplicite per log persistenti.
- [ ] **Successo soltanto dopo la conferma — P0:** distinguere `richiesto`, `in corso`, `confermato`, `fallito` ed `esito sconosciuto`. Scrivere "salvato" soltanto dopo il risultato della persistenza; "inviato" soltanto dopo una conferma valida. L'assenza di una casella o di una risorsa non equivale al suo svuotamento o al successo.
- [ ] **Diagnostica indipendente dai filtri — P1:** profondità, memoria occupata e scarti si aggiornano anche quando nessuna nuova riga supera il filtro. Un ritorno anticipato non deve congelare i contatori.

### Metriche

- [ ] **RED:** monitorare frequenza delle richieste, errori e durata delle operazioni principali.
- [ ] **USE:** monitorare utilizzo, saturazione ed errori delle risorse critiche.
- [ ] **Latenza di coda:** misurare P50, P95 e P99 quando il volume di osservazioni è sufficiente.
- [ ] **Metriche di concorrenza:** monitorare task attivi, profondità code, worker occupati e lock contention.
- [ ] **Metriche di risorse:** monitorare RAM, CPU, I/O e connessioni pertinenti.
- [ ] **Cardinalità controllata:** non utilizzare identificativi arbitrari e ad alta cardinalità come label delle metriche.
- [ ] **Overhead contenuto:** osservabilità proporzionata al carico e alle risorse disponibili.

### Tracing e diagnostica

- [ ] **Tracing distribuito quando utile:** collegare operazioni tra processi o servizi differenti.
- [ ] **Tracing asincrono:** preservare il contesto attraverso task, code e worker.
- [ ] **Eventi di lifecycle:** rendere osservabili avvio, connessione, riconnessione, disconnessione e shutdown.
- [ ] **Diagnostica configurabile:** permettere livelli più dettagliati senza richiedere modifiche al codice.
- [ ] **SLO definiti:** stabilire obiettivi misurabili per disponibilità, latenza e affidabilità dei componenti critici.

## 10. Sicurezza, privacy e supply chain

### Validazione e protezione dei confini

- [ ] **Validazione degli input:** controllare struttura, tipo, dimensione, formato, range e vincoli semantici.
- [ ] **Validazione lato trusted boundary:** non affidarsi alla sola validazione dell'interfaccia utente.
- [ ] **Canonicalizzazione corretta:** interpretare e normalizzare gli input nel giusto ordine per prevenire bypass.
- [ ] **Encoding contestuale:** applicare l'escaping appropriato al formato di destinazione.
- [ ] **Prevenzione injection:** utilizzare query parametrizzate e API sicure per SQL, comandi, template e protocolli.
- [ ] **Path traversal:** validare i percorsi e limitare l'accesso al filesystem alle directory consentite.
- [ ] **SSRF:** controllare destinazioni, protocolli e accesso a reti interne quando vengono accettati URL esterni.
- [ ] **Deserializzazione sicura:** trattare dati e oggetti deserializzati come input non attendibili.
- [ ] **Limiti anti-DoS:** limitare dimensioni, profondità, complessità dei parser e consumo delle risorse.

### Accesso e crittografia

- [ ] **Least privilege:** assegnare a processi, account e servizi soltanto i permessi necessari.
- [ ] **Autorizzazione lato server:** verificare l'accesso alle risorse a ogni boundary pertinente.
- [ ] **Gestione dei segreti:** non incorporare password, token o chiavi nel codice, nei log o nel repository.
- [ ] **Protezione delle credenziali:** utilizzare secret manager, storage di sistema o meccanismi appropriati.
- [ ] **Crittografia standard:** impiegare librerie consolidate e modalità autenticate, con corretta gestione di nonce e chiavi.
- [ ] **Password hashing:** preferire algoritmi progettati per password, come Argon2id, con parametri aggiornati.
- [ ] **Trasporto sicuro:** preferire TLS 1.3; consentire versioni precedenti soltanto secondo requisiti di compatibilità e policy di sicurezza.
- [ ] **Randomness crittografica:** utilizzare generatori crittograficamente sicuri per chiavi, token e segreti.

### Privacy e dipendenze

- [ ] **Data minimization:** raccogliere e conservare soltanto le informazioni necessarie.
- [ ] **Protezione dei log:** escludere o oscurare token, password e dati personali non indispensabili.
- [ ] **Retention:** definire periodi di conservazione ed eliminazione dei dati.
- [ ] **Dipendenze controllate:** valutare manutenzione, provenienza, licenza e vulnerabilità delle librerie.
- [ ] **Versioni riproducibili:** utilizzare lockfile e politiche di aggiornamento controllato.
- [ ] **Dependency scanning:** integrare analisi delle vulnerabilità nelle verifiche automatiche.
- [ ] **Secret scanning:** individuare credenziali accidentalmente introdotte.
- [ ] **SBOM e provenienza:** generare inventari delle dipendenze e attestazioni quando il rischio o le esigenze di distribuzione lo richiedono.
- [ ] **Minima superficie d'attacco:** evitare porte, API, funzionalità e permessi inutilizzati.

### Aggiornamento di librerie e tool esterni — Regola obbligatoria

Ogni volta che si aggiorna una libreria o un tool esterno, è obbligatorio esaminare le note di rilascio,
i changelog e le guide di migrazione ufficiali dalla versione precedente a quella adottata, comprese
le release intermedie. La regola vale anche per aggiornamenti patch, dipendenze transitive, sorgenti
vendorizzati, compilatori, framework, runtime e strumenti di build o generazione del codice.

- [ ] **Analisi delle release:** individuare fix, vulnerabilità corrette, ottimizzazioni, API nuove o deprecate, incompatibilità e cambiamenti di comportamento che interessano il progetto.
- [ ] **Adeguamento del codice:** aggiornare gli usi interessati, le configurazioni, i binding, gli script e gli eventuali sorgenti generati secondo le indicazioni ufficiali. Applicare i fix e le ottimizzazioni pertinenti; rivedere workaround e implementazioni locali quando la nuova versione risolve il problema o offre una soluzione migliore. L'aggiornamento non si esaurisce nel cambiare il numero di versione o il lockfile.
- [ ] **Intervento mirato e compatibile:** preservare i contratti e i comportamenti non coinvolti; rispettare le priorità della sezione 0 e i criteri di ottimizzazione della sezione 4. Non introdurre refactoring estranei o dichiarare miglioramenti prestazionali senza misure.
- [ ] **Verifica sulla versione nuova:** eseguire build, analisi statica e prove di integrazione/regressione pertinenti; verificare i bug corretti e i confini coinvolti. Per ottimizzazioni applicate al codice, confrontare le prestazioni quando misurabili. Dichiarare controlli non eseguiti e limiti residui secondo la sezione 14.
- [ ] **Tracciabilità:** registrare versioni prima/dopo, fonti ufficiali consultate, modifiche applicate e risultati delle verifiche. Se una novità non richiede adeguamenti, motivarne la non applicabilità al progetto; se non è adottabile, documentare il vincolo e il lavoro residuo. Se mancano note ufficiali sufficienti, dichiararlo e integrare l'analisi con il confronto dei sorgenti o dei commit ufficiali.

## 11. Test, correttezza formale e verifica concorrente

### Strategia di test

- [ ] **Unit test:** coprire logica di dominio e comportamenti critici.
- [ ] **Integration test:** verificare realmente comunicazioni tra componenti, database e sistemi esterni.
- [ ] **Contract test:** verificare la compatibilità tra implementazioni e interfacce.
- [ ] **Regression test:** aggiungere test che riproducano ogni bug significativo corretto.
- [ ] **Property-based testing:** verificare invarianti su ampie combinazioni di input.
- [ ] **Fuzz testing:** applicare input malformati o imprevisti a parser, protocolli e confini non attendibili.
- [ ] **Boundary testing:** coprire valori nulli, estremi, overflow, input vuoti e limiti dimensionali.
- [ ] **Test deterministici:** controllare tempo, casualità e dipendenze esterne quando necessario.

### Concorrenza e failure testing

- [ ] **Race detection — P0 sui target applicabili:** per codice nativo di proprietà del progetto usare TSan o equivalenti dove toolchain e piattaforma lo supportano. Per TypeScript/Python provare ordine degli eventi, cancellazione, saturazione e shutdown con worker/processi reali; questi test non dimostrano assenza di data race nei binding di terzi.
- [ ] **Verifica di interleaving deterministico:** per algoritmi atomici o lock-free complessi, integrare strumenti di test esaustivo degli interleaving (es. Loom in Rust) che permutano l'ordine delle operazioni thread per intercettare violazioni rare del modello di memoria.
- [ ] **Stress test concorrenti:** ripetere operazioni sotto differenti livelli di parallelismo e su architetture a debole consistenza di memoria (es. ARM64).
- [ ] **Test di cancellazione:** verificare arresti durante attese, I/O e operazioni parzialmente completate con stop token.
- [ ] **Test di shutdown:** garantire l'assenza di thread orfani, task dispersi e risorse non rilasciate.
- [ ] **Deadlock testing:** esercitare scenari con acquisizione di più lock.
- [ ] **Fault injection:** simulare timeout, disconnessioni, errori del filesystem e indisponibilità delle dipendenze.
- [ ] **Test di saturazione:** verificare comportamenti di code e worker quando il sistema supera la capacità prevista.
- [ ] **Test di recovery:** verificare riavvio, riconnessione, ritentativi e ripristino della consistenza.

### Performance testing

- [ ] **Benchmark CPU e memoria:** verificare il costo delle operazioni principali.
- [ ] **Load testing:** misurare il comportamento al carico nominale e ai picchi.
- [ ] **Soak testing:** valutare stabilità, leak e consumo risorse in esecuzioni prolungate.
- [ ] **Test di scalabilità:** verificare come cambiano throughput e latenza aumentando il parallelismo e verificare l'assenza di collo di bottiglia da false sharing.
- [ ] **Performance regression testing:** confrontare le nuove implementazioni con una baseline attendibile.

La coverage è un indicatore di supporto: un'elevata percentuale non sostituisce test significativi e verifica delle invarianti.

### Matrice obbligatoria dei casi di regressione

Applicare le righe pertinenti al componente modificato. Per un bug corretto, conservare nel repository una prova
che fallisce sul comportamento precedente e passa su quello corretto; se non è eseguibile nell'ambiente corrente,
dichiararla **non eseguita** e tenerla come requisito di verifica prima del rilascio.

| Confine | Scenario da provare | Invariante |
| ----- | ----- | ----- |
| Invio asincrono | nuovo messaggio mentre si aspetta la conferma dopo Invio | il messaggio precedente non viene inviato due volte |
| Esito esterno | casella scomparsa, risposta incompleta o collegamento perso dopo l'invio | nessuna falsa conferma e nessun ritentativo automatico dell'esito sconosciuto |
| Richiesta pendente | distruzione del futuro con risposta che non arriverà | la richiesta esce dalla mappa senza aspettare il timeout originale |
| Trasporto | peer che accetta ma non legge o non risponde | scrittura e chiusura terminano entro il budget |
| Memoria | log lungo e molti frame audio entro il timeout | capacità trattenuta e byte cumulativi rispettano il budget |
| Persistenza | scrittura fallita o conclusa dopo altri cambiamenti | il log e l'interfaccia descrivono l'esito della versione effettivamente scritta |
| Interfaccia filtrata | eventi nuovi tutti esclusi dal filtro | i contatori di memoria e scarti continuano ad aggiornarsi |
| Identità UI | menu aperto mentre la lista elimina o riordina righe | l'azione usa la riga scelta, non il nuovo contenuto del suo indice |
| Cache di configurazione | modifica di proprietà, account, canale o emote con lavoro già in coda | il lavoro mantiene la propria fotografia; quello successivo usa la versione nuova |
| Ricerca UI | digitazione rapida e risposta vecchia che arriva dopo quella nuova | un solo aggiornamento per il testo finale, nessuna risposta obsoleta |

## 12. CI/CD, build e qualità del rilascio

**Nota obbligatoria — Versioning di tutto il codice e dei moduli (15 ottobre 2026).**

Tutto il codice sorgente e ogni modulo del progetto, inclusi TypeScript, Python, SQL, script e test, devono essere
tracciati in Git. Ogni modifica consegnata deve appartenere a un commit identificabile e descrivere lo scopo
del cambiamento. Ogni rilascio deve avere una versione esplicita, un tag Git e una nota delle modifiche che
permettano di risalire al codice corrispondente; lo schema di numerazione deve essere coerente e documentato,
con le eventuali incompatibilità di API, configurazioni e dati dichiarate.

I moduli distribuiti insieme all'applicazione possono condividere la versione del workspace; i moduli
rilasciati indipendentemente devono avere una propria versione e dichiarare la compatibilità delle dipendenze.
Ogni file e modulo deve restare riconducibile alla versione e al commit che lo contengono. Il piano operativo
per Zerocade è descritto nella sezione 16: la versione si definisce in un solo punto (il `package.json` radice) e i
pacchetti del workspace la seguono, senza duplicare le fonti della versione.

### Pipeline automatizzata

- [ ] **Dati e account di prova isolati (Zerocade):** quando si verifica o avvia il server per test, usare un
  database e una porta propri (`ZEROCADE_DB`, `PORT`) e mai `apps/server/data/zerocade.db`
  della diretta vera, né account, chiavi o dirette reali. Script e istruzioni di prova devono impostare queste
  variabili; l'installazione ordinaria e la sua cartella dati non si usano per le prove.
  Per verificare una distribuzione preparata, copiarne app e runtime in una cartella di prova,
  usare un eseguibile con identità distinta, dati e porta isolati, browser e modifica hosts disabilitati.
- [ ] **Build verificata:** compilare tutti i target e le configurazioni supportate.
- [ ] **Formatting automatico:** applicare le convenzioni di stile del progetto.
- [ ] **Static analysis:** utilizzare compilatore, linter e analizzatori appropriati.
- [ ] **Warning gestiti:** impedire l'introduzione di nuovi warning significativi.
- [ ] **Suite di test automatica:** eseguire unit test e integration test pertinenti.
- [ ] **Sanitizer:** integrare ASan, TSan, UBSan o strumenti equivalenti secondo linguaggio e piattaforma.
- [ ] **Security scanning:** analizzare dipendenze, segreti e vulnerabilità rilevanti.
- [ ] **Build riproducibili:** utilizzare toolchain definite e dipendenze bloccate.
- [ ] **Artifact verificabili:** assicurare tracciabilità tra commit, build e rilascio.
- [ ] **Controlli di qualità bloccanti:** impedire il merge in caso di fallimento dei controlli P0.

### Distribuzione e rollback

- [ ] **Release versionate:** rendere identificabile ogni versione distribuita.
- [ ] **Migrazioni coordinate:** gestire compatibilità tra applicazione e dati persistenti.
- [ ] **Rollback pianificato:** prevedere strategie di recupero per aggiornamenti falliti.
- [ ] **Canary o rollout graduale:** applicarli quando rischio e modalità di distribuzione lo giustificano.
- [ ] **Verifica post-release:** controllare metriche, errori e funzionalità essenziali dopo il rilascio.
- [ ] **Artefatti firmati:** utilizzare firme e verifica della provenienza quando richiesto dal modello di minaccia.

## 13. Direttive specifiche per TypeScript, Node.js, React e Python

### TypeScript e Node.js

- [ ] Usare TypeScript rigoroso, narrowing e contratti espliciti; evitare `any`, cast e soppressioni per nascondere incompatibilità.
- [ ] Osservare tutte le Promise e associare richieste, worker e risorse al loro proprietario; cleanup in `finally` e gestori di chiusura.
- [ ] Valutare ogni `await` come punto di interleaving; ricontrollare generazione e stato prima di applicare risultati tardivi.
- [ ] Usare filesystem/rete asincroni nel server interattivo; confinare binding SQLite e calcoli lunghi secondo le sezioni 5 e 6.
- [ ] Verificare con `npm run typecheck`, test Node e smoke sia del sorgente sia dei bundle.

### React e browser

- [ ] Effetti con cleanup simmetrico di listener, timer, socket e worker, anche nei cicli di montaggio/rimontaggio.
- [ ] Mantenere DOM e canvas sul thread competente, raggruppando aggiornamenti ad alta frequenza senza perdere eventi persistenti.
- [ ] Invalidare richieste e risultati quando cambiano stanza, round, parola o componente; una risposta vecchia non modifica la nuova partita.
- [ ] Usare chiavi stabili e API React/Router pubbliche; controllare build e percorsi con base `/overlay/`.

### Python degli strumenti

- [ ] Usare l'ambiente del gioco/profilo, registrando interprete, requisiti e dipendenze native; non aggiornare l'ambiente globale per risolvere un singolo strumento.
- [ ] Chiudere file, connessioni e processi con context manager/`finally`; usare `unittest` e fixture isolate dai corpus operativi.
- [ ] Distinguere test senza modelli, import delle librerie, caricamento di pesi e inferenza reale. Dichiarare download, modelli e hardware non verificati.
- [ ] Controllare memoria, parallelismo delle librerie numeriche e compatibilità delle wheel Windows prima di aggiornare pacchetti NLP/GPU.

### Binding e codice nativo eventuale

- [ ] Verificare ABI Node, architettura e motore SQLite effettivamente caricati; il numero del pacchetto non identifica il motore.
- [ ] C++/Rust applicano ownership, RAII, cancellazione cooperativa e sincronizzazione delle sezioni 3, 5 e 6 sui target realmente presenti.
- [ ] Sanitizer e analisi nativa richiedono sorgenti/toolchain compatibili; test TypeScript/Python e TSan non sono intercambiabili.
- [ ] Non modificare direttamente librerie in `node_modules` o ambienti virtuali come correzione permanente senza una procedura riproducibile e tracciata.

### Applicazioni desktop e GUI

- [ ] **UI thread dedicato:** non eseguire elaborazioni pesanti o I/O bloccante sul thread dell'interfaccia.
- [ ] **Affinity corretta:** creare e utilizzare componenti grafici secondo le regole del framework.
- [ ] **Aggiornamenti thread-safe:** comunicare con l'interfaccia mediante segnali, eventi o message passing supportati.
- [ ] **Rendering efficiente:** evitare redraw, notifiche e refresh non necessari.
- [ ] **Coalescing degli aggiornamenti:** raggruppare eventi UI ad alta frequenza quando gli stati intermedi non sono necessari.
- [ ] **Identità stabile delle azioni — P0:** menu, selezioni e comandi differiti conservano l'identificativo o il valore scelto al momento dell'interazione; un indice di una lista modificabile non è un'identità.
- [ ] **Cache e fotografie — P1:** ricostruire conversioni e configurazioni costose quando cambiano le dipendenze, con invalidazione esplicita per proprietà, account, canale ed emote. Una fotografia condivisa deve essere immutabile e mantenere il comportamento del lavoro già accettato.
- [ ] **Ricerca e refresh — P1:** raggruppare la digitazione prima di rifare una lista e aggiornare solo quando serve; un eventuale lavoro fuori thread porta una generazione controllata al ritorno. Non introdurre worker aggiuntivi senza una misura che li giustifichi.
- [ ] **Shutdown integrato:** coordinare chiusura della finestra, worker, connessioni e persistenza.
- [ ] **Risorse native:** gestire correttamente handle Windows, socket, oggetti COM e risorse grafiche quando presenti.
- [ ] **Responsiveness verificata:** controllare tempi di risposta dell'interfaccia durante carichi intensi.

## 14. Protocollo obbligatorio per agenti AI e modifiche al codice

Quando il codice viene sviluppato, corretto o ottimizzato da un agente AI, applicare questa procedura.

### Fase A — Analisi

1. Esaminare il codice realmente coinvolto e i contratti esistenti.
2. Identificare la causa del problema o il limite da migliorare.
3. Individuare rischi, dipendenze e comportamento da preservare.
4. Definire un intervento mirato e criteri di verifica.
5. Stabilire una baseline quando il problema riguarda prestazioni o affidabilità.
6. Per modularizzazione o riuso, mappare responsabilità, stato, chiamanti e direzione delle dipendenze; cercare la regola già esistente prima di crearne una nuova.
7. Scegliere il confine minimo utile e dichiarare il beneficio, il contratto, le invarianti da preservare e le evidenze applicabili della sezione 2.

### Fase B — Implementazione

 1. Applicare modifiche incrementali e coerenti.
 2. Riutilizzare le infrastrutture esistenti quando adeguate.
 3. Evitare nuove dipendenze senza benefici dimostrabili.
 4. Preservare API e comportamenti non coinvolti.
 5. Non introdurre concorrenza aggiuntiva senza una necessità concreta.
 6. Non usare workaround che nascondono errori di compilazione o runtime.
 7. Non disabilitare test o controlli per far apparire riuscito l'intervento.
 8. Scrivere e modificare il codice secondo la sezione 2, "Modularità e riuso": responsabilità, dipendenze, API e ownership esplicite; concentrare le regole comuni e limitare gli effetti agli adattatori competenti.
 9. Separare spostamenti, estrazioni comuni e cambi di comportamento in commit revisionabili, preservando i punti d'ingresso durante la transizione.
10. Documentare i chiamanti e il beneficio concreto del riuso o dell'isolamento, senza introdurre consumatori o framework soltanto per giustificare un'astrazione.

### Fase C — Verifica

 1. Eseguire formatting e analisi statica.
 2. Compilare il codice modificato.
 3. Eseguire i test pertinenti.
 4. Eseguire test di regressione.
 5. Verificare la concorrenza quando coinvolta.
 6. Misurare le prestazioni prima e dopo, se l'intervento è prestazionale.
 7. Ispezionare il diff finale per individuare modifiche accidentali.
 8. Controllare la matrice dei casi di regressione: cancellazione, saturazione, esito sconosciuto e invalidazione delle cache non possono essere sostituiti dalla sola prova del percorso normale.
 9. Distinguere verifica del prodotto, prova isolata, simulazione e analisi statica. Una simulazione dell'interleaving o un mock del DOM non equivale a esecuzione del server, dei worker o del browser reale.
10. Verificare responsabilità, direzione delle dipendenze e API dei moduli toccati: nessun nuovo ciclo, copia di una regola comune o accesso implicito a stato esterno nel dominio.
11. Provare il dominio senza GUI o servizi reali e gli adattatori con le integrazioni pertinenti, secondo la sezione 2; un framework necessario a un adattatore non costituisce da solo una violazione.
12. Confrontare contratti e comportamento nei chiamanti prima e dopo l'estrazione, includendo errori, ownership, configurazione e costi del percorso interessato.

### Fase D — Consegna

Il rapporto finale deve includere:

- **Modifiche effettuate:** componenti e comportamenti interessati.
- **Motivazione tecnica:** problema individuato e soluzione scelta.
- **Verifiche realmente eseguite:** build, test e analisi con relativi risultati.
- **Prestazioni:** misure prima/dopo quando disponibili.
- **Rischi residui:** problemi irrisolti o verifiche non eseguibili.
- **Compatibilità:** eventuali modifiche a API, configurazioni o dati.
- **Modularità e riuso, quando coinvolti:** confini prima/dopo, direzione delle dipendenze, regola estratta, chiamanti o beneficio di isolamento, verifiche ed eccezioni. Distinguere organizzazione in file, disaccoppiamento e riuso effettivamente dimostrati.

È vietato dichiarare che una verifica è stata superata senza averla realmente eseguita.

**Ambiente incompleto.** Se mancano Node.js 26, `npm install`, Python o altre dipendenze, si può preparare un cambiamento revisionabile e
una PR in bozza, indicando esattamente i controlli eseguiti e quelli mancanti. Non dichiarare il cambiamento
completato, verificato o pronto al rilascio; non saltare controlli, abbassare limiti dei test o reinterpretare i
risultati storici come prove della nuova versione. Prima del merge/rilascio, la toolchain supportata deve eseguire
build e suite pertinenti; i controlli P0 devono essere bloccanti.

## 15. Definition of Done — Criteri di accettazione

Una modifica può essere considerata completata soltanto quando:

- [ ] Il requisito richiesto è soddisfatto.
- [ ] Il comportamento preesistente non coinvolto è preservato.
- [ ] Il codice compila sui target applicabili.
- [ ] I test pertinenti sono superati.
- [ ] Non sono state introdotte data race o condizioni note di deadlock.
- [ ] Gli errori e i percorsi di cancellazione sono gestiti.
- [ ] Le risorse vengono rilasciate correttamente.
- [ ] Non sono presenti vulnerabilità critiche note introdotte dalla modifica.
- [ ] Le prestazioni rispettano i requisiti definiti.
- [ ] Le nuove dipendenze sono motivate e verificate.
- [ ] Gli aggiornamenti di librerie e tool esterni sono accompagnati dall'analisi delle release, dagli adeguamenti pertinenti e dalle verifiche richieste dalla sezione 10.
- [ ] La documentazione necessaria è aggiornata.
- [ ] Le limitazioni residue sono dichiarate.
- [ ] L'implementazione non contiene complessità ingiustificata.
- [ ] I componenti nuovi o modificati hanno responsabilità, dipendenze direzionali, API e ownership documentate secondo la sezione 2, senza nuovi cicli o astrazioni per esigenze solo ipotetiche.
- [ ] La conoscenza comune è concentrata in un punto e consumata tramite il suo contratto; chiamanti reali o beneficio concreto dell'isolamento sono identificati.
- [ ] Prove del dominio, integrazioni degli adattatori e compatibilità dei consumatori pertinenti sono verificate; le evidenze della sezione 2 distinguono gli spostamenti dal disaccoppiamento e dal riuso.
- [ ] I casi pertinenti della matrice di regressione sono verificati sulla versione finale; gli esiti sconosciuti non sono presentati come successi.
- [ ] La relazione distingue misure nuove da dati storici e identifica il commit, i comandi e l'ambiente usati.

## 16. Applicazione a Zerocade

Le sezioni precedenti sono generali; questa le rende concrete per il progetto. Dove c'è un conflitto vale la regola
più rigida. Le versioni esatte non si ripetono qui: stanno in `package.json`, `package-lock.json` e nei
`pyproject`/requisiti dei giochi.

### Stack e confini

- **Workspace npm** (Node.js 26 o successivo): `apps/server` (Fastify, Socket.IO, `better-sqlite3`, collegamento a
  TikTok e Twitch), `apps/overlay` e `apps/dashboard` (React con Vite), `packages/shared` (catalogo dei giochi,
  impostazioni, tipi e regole comuni) e `packages/browser-runtime` (HTTP, Socket.IO e Web Worker del browser). TypeScript controlla tutto con `tsc`.
- **Direzione delle dipendenze:** `apps/* → packages/shared` e `apps/dashboard, apps/overlay → packages/browser-runtime → packages/shared`.
  `shared` non importa le app o browser-runtime; le app comunicano tramite HTTP/Socket.IO senza importarsi a vicenda (sezione 2). Le regole dei giochi vanno in
  funzioni pure e provabili senza rete né database; Fastify, Socket.IO, SQLite e i connettori sono adattatori.
- **Dati:** SQLite. `database/giochi.sqlite3` (contenuti, uno schema per gioco), `database/ZeroQuizz.sqlite3` e `database/ZeroDubbi.sqlite3` sono in
  Git; anche la banca autonoma `database/ZeroLettere.sqlite3` è versionata, ma non integrata nel runtime.
  `database/parole_ita_raw.sqlite3` (circa 3,43 GB nel workspace al 16 novembre 2026) è fuori da Git; i dati della diretta stanno in
  `apps/server/data/zerocade.db` sul PC (ignorato da Git). Valgono le regole della sezione 8 e della sezione 6 per
  transazioni, WAL, busy timeout e compatibilità; ogni schema dei giochi si confronta con la sua origine (`database/script/giochi.py verify`).
- **Giochi con cartella propria** (`gioco-*`): dati, strumenti e prove in Python; ogni gioco ha il suo `README.md`
  e, dove serve, il suo `TODO.md`.
- **Corpus ZeroContext:** la procedura Contesti pubblica solo lo schema `context`, dopo backup e scrittura
  dei vettori immutabili indicati nei metadati. Il ricaricamento locale invalida il ranking e sospende
  i tornei con impronta diversa; i conteggi storici negli audit non descrivono la generazione attiva.

### Applicazione concreta delle sezioni 5, 6 e 13

| Regola | Applicazione a ZeroCade |
|---|---|
| Thread e lifetime | Worker Node per persistenza/report e generazione; Web Worker di browser-runtime; processi/ambienti Python separati |
| Stato e messaggi | Tipi condivisi, request ID, generazioni, limiti di coda e conferme; nessuna connessione DB trasferita |
| SQLite | Distinguere DB operativo modificabile e contenuti/snapshot in sola lettura; busy timeout e transazioni secondo la sezione 6 |
| UI | React, DOM e canvas sul main thread; notifiche raggruppate e cleanup alla chiusura della stanza |
| Binding | `better-sqlite3`, versione SQLite effettiva, architettura Windows x64 e selezione del binario distribuito |
| Diagnostica | `/api/live`, `/api/health`, metriche dei worker e log bounded; watchdog separato solo se implementato e verificato |
| Strumenti nativi | TSan/ASan per eventuale codice nativo compilabile; nessuna pretesa di copertura tramite soli test JavaScript |

Queste sono prescrizioni per le modifiche e criteri di verifica. La loro presenza nel documento
non certifica che ogni percorso del progetto le rispetti già. Per stato e limiti usare gli audit
in `docs/` e gli esiti del lavoro corrente.

### Verifiche minime prima di consegnare

Si eseguono dalla cartella radice e si riportano gli esiti reali (sezione 14):

- `npm run typecheck`
- `node --import tsx --test tests/*.test.ts`
- `python -m unittest discover -s database/script` e, per ZeroAssociazioni, `npm run test:associations`
- `python database/script/giochi.py verify` se si toccano i contenuti dei giochi
- `npm run build` per overlay e dashboard, e un avvio di prova del server con dati isolati (sezione 12)
- `node scripts/check-infrastructure.mjs`, `node scripts/smoke-runtime.mjs` e `node scripts/smoke-runtime.mjs --bundle`
- `npm audit` per tutte le dipendenze e, quando utile, `npm audit --omit=dev` per il perimetro runtime; verificare
  le autorizzazioni agli script di installazione nel manifest radice e nella configurazione npm effettiva

Gli esiti storici restano negli audit datati; non sono la baseline del lavoro corrente. La pipeline
`.github/workflows/ci.yml` definisce i controlli automatici: verificare il suo esito reale prima di
attribuirle una build riuscita. Segnalare separatamente fallimenti preesistenti e regressioni nuove.
Le modifiche solo documentali richiedono verifica di contenuto, collegamenti e diff, senza una nuova
suite applicativa se non cambiano comportamenti o configurazioni.

### Sicurezza e privacy

- Chat, nomi, eventi e regali arrivano da fuori: sono input non fidato (sezione 10). Si validano al confine
  (`apps/server/src/validate.ts`) con lunghezze, formati e conteggi limitati, e non entrano mai in query SQL,
  percorsi o HTML senza parametri o escape.
- Il server principale con i comandi di regia resta sul PC (ascolta solo su 127.0.0.1); le classifiche pubbliche le
  serve nginx sulla VM Linux (`ZEROCADE_PUBLIC_URL` è il suo indirizzo, mostrato in dashboard). Nginx deve esporre solo
  le classifiche e la loro API in sola lettura. Nuove rotte pubbliche richiedono una revisione esplicita dei dati che
  mostrano.
- Segreti (per esempio `TWITCH_CLIENT_ID` e `TWITCH_USER_ACCESS_TOKEN`) solo in variabili d'ambiente o file `.env`, che Git ignora; mai nel
  codice, nei log né nel pacchetto `release/`. Un segreto finito in Git va revocato, non solo cancellato.
- Il server aggiunge una riga al file hosts di Windows chiedendo i privilegi di amministratore (`apps/server/src/hosts.ts`):
  la modifica deve restare limitata al nome `zerocade.test` (`127.0.0.1`), e se il permesso è negato il server deve
  continuare a funzionare con l'indirizzo `localhost`, dicendolo chiaramente.
- I contenuti di terzi (lessico, domande, immagini NASA) hanno licenze diverse, anche non commerciali: vanno
  rispettate e restano elencate nel README e nelle cartelle delle fonti; una nuova fonte porta la sua licenza.

### Aggiornare librerie e tool

Vale la sezione 10 (note di rilascio, adeguamento, verifica, tracciabilità). Il registro è
[AGGIORNAMENTO_DIPENDENZE.md](AGGIORNAMENTO_DIPENDENZE.md). Per ZeroCade:

- I manifest usano versioni esatte e intervalli SemVer; il lockfile identifica la risoluzione effettiva. Un aggiornamento modifica manifest e
  `package-lock.json` insieme, con le note di tutte le release intermedie lette.
- `allowScripts` contiene decisioni riferite a versioni specifiche: per `better-sqlite3` distribuito con prebuild la ricompilazione implicita è disabilitata; per `esbuild` il postinstall è consentito. Rivalutare queste decisioni con il manifest, senza dedurre che il pacchetto esegua effettivamente uno script. Un aggiornamento va verificato con
  l'avvio reale del server e dei test; `npm run sqlite:upgrade` aggiorna SQLite secondo `scripts/upgrade-sqlite.mjs`.
- `tiktok-live-connector` e `tmi.js` dipendono da servizi esterni che cambiano: dopo un aggiornamento si prova con
  il connettore finto o con una diretta di prova, e si dichiara quello che non si è potuto provare.
- Python dei giochi: ambiente virtuale dentro la cartella del gioco; le versioni si registrano dove il gioco le
  documenta e non si mescolano con quelle di un altro gioco.
- Il pacchetto Windows (`npm run package:win`, con Node.js incluso) va ricostruito dopo un aggiornamento di Node o di
  una dipendenza, altrimenti `release/` resta con le versioni vecchie e lo si dichiara.

### Versioning e flusso di lavoro

- Schema: SemVer, con la versione definita nel `package.json` radice e i pacchetti del workspace allineati
  (`npm version <x.y.z> --workspaces --include-workspace-root --no-git-tag-version` li aggiorna insieme al lockfile).
  La versione corrente si legge nei manifest; verificare i tag esistenti prima di un rilascio. Ogni rilascio distribuito riceve un tag `vX.Y.Z` e una nota delle
  modifiche, come chiede la sezione 12.
- Ogni lavoro ha un branch e commit identificabili; se mancano prove o build la PR resta in bozza (sezione 14). Le
  modifiche non committate di un altro lavoro non si mescolano in un commit non pertinente.
- `README.md` descrive il progetto, `TODO.md` il lavoro da fare, `ANALYSIS.md` l'analisi di Livecade da cui parte il
  progetto, i README dei giochi dati e regole di ciascuno. Si aggiornano insieme al codice, senza duplicare lo
  stesso dettaglio in più file.

**Principio conclusivo**

> Progettare prima per la correttezza, rendere espliciti gli invarianti, limitare il consumo di risorse, rendere osservabili i fallimenti, verificare ogni modifica e ottimizzare soltanto sulla base di evidenze.

Lo scopo non è massimizzare il numero di pattern, thread, astrazioni o ottimizzazioni implementate, ma ottenere la soluzione complessivamente più corretta, semplice, efficiente e affidabile.

### Appendice: Riduzione della ridondanza dei dati in SQLite3

Per ridurre al minimo la ridondanza dei dati in un database relazionale basato su SQLite3, si interviene su due livelli complementari: la progettazione logica dello schema (normalizzazione relazionale) e l'adozione delle funzionalità native del motore di SQLite.

#### 1. Normalizzazione dello Schema (1NF, 2NF, 3NF)

La normalizzazione è il principio cardine per eliminare la duplicazione delle informazioni dividendo i dati in entità logiche distinte collegate da chiavi.

- **1NF (Prima Forma Normale):** Eliminare colonne ripetitive e valori composti (es. stringhe separate da virgole come `"tag1,tag2,tag3"`). Ogni colonna deve contenere un singolo valore atomico.
- **2NF (Seconda Forma Normale):** Rimuovere le dipendenze parziali nelle chiavi composte. Ogni attributo non chiave deve dipendere dall'intera chiave primaria.
- **3NF (Terza Forma Normale):** Rimuovere le dipendenze transitive. Nessuna colonna deve dipendere da un'altra colonna non chiave.

```sql
-- SCHEMA NON NORMALIZZATO (alta ridondanza: nome e indirizzo ripetuti per ogni ordine)
-- Ordini(id_ordine, data, id_cliente, nome_cliente, indirizzo_cliente, totale)

-- SCHEMA NORMALIZZATO (3NF)
CREATE TABLE clienti (
    id_cliente INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    indirizzo TEXT NOT NULL
);

CREATE TABLE ordini (
    id_ordine INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    id_cliente INTEGER NOT NULL,
    FOREIGN KEY (id_cliente) REFERENCES clienti(id_cliente)
);
```

#### 2. Abilitazione delle Chiavi Esterne (Foreign Keys)

SQLite supporta i vincoli di chiave esterna, ma per motivi di retrocompatibilità sono disabilitati per impostazione predefinita su ogni nuova connessione. Se non vengono attivati, il database non impedisce l'inserimento di chiavi orfane o l'inconsistenza referenziale.

Abilitare sempre il supporto all'apertura di ogni sessione:

```sql
PRAGMA foreign_keys = ON;
```

#### 3. Dizionari di Lookup per Stringhe Ripetute

Campi categorici ripetuti frequentemente (es. stato ordine come `'IN_ATTESA'`, `'SPEDITO'`, `'CONSEGNATO'`) occupano byte preziosi su disco per ogni record e aumentano il rischio di incongruenze.

Sostituire il testo con una chiave numerica che punta a una tabella di lookup:

```sql
CREATE TABLE stati_ordine (
    id_stato INTEGER PRIMARY KEY,
    descrizione TEXT NOT NULL UNIQUE
);

CREATE TABLE ordini (
    id_ordine INTEGER PRIMARY KEY,
    id_stato INTEGER NOT NULL,
    FOREIGN KEY (id_stato) REFERENCES stati_ordine(id_stato)
);
```

In SQLite, `INTEGER PRIMARY KEY` è un alias diretto per il puntatore interno a 64 bit (`ROWID`). Memorizzare un intero occupa da 1 a 8 byte a lunghezza variabile, risultando nettamente più compatto ed efficiente rispetto a stringhe duplicate.

#### 4. Tabelle di Giunzione per Relazioni Molti-a-Molti

Per gestire associazioni N:M senza duplicare attributi o creare array di stringhe non indicizzabili, si utilizza una tabella ponte con chiave primaria composita:

```sql
CREATE TABLE prodotti (
    id_prodotto INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    prezzo REAL NOT NULL
);

CREATE TABLE ordini_dettaglio (
    id_ordine INTEGER NOT NULL,
    id_prodotto INTEGER NOT NULL,
    quantita INTEGER NOT NULL CHECK (quantita > 0),
    PRIMARY KEY (id_ordine, id_prodotto),
    FOREIGN KEY (id_ordine) REFERENCES ordini(id_ordine) ON DELETE CASCADE,
    FOREIGN KEY (id_prodotto) REFERENCES prodotti(id_prodotto)
);
```

#### 5. Colonne Generate (Generated Columns)

Evitare di salvare colonne derivate o calcolabili a partire da altri campi (ad esempio `totale_riga = quantita * prezzo_unitario`). SQLite supporta le colonne generate:

```sql
CREATE TABLE fatture_righe (
    id INTEGER PRIMARY KEY,
    prezzo_unitario REAL NOT NULL,
    quantita INTEGER NOT NULL,
    -- VIRTUAL non consuma spazio su disco; viene calcolata solo in lettura
    totale_riga REAL GENERATED ALWAYS AS (prezzo_unitario * quantita) VIRTUAL
);
```

- **`VIRTUAL`:** non occupa spazio su disco ed elimina la ridondanza fisica.
- **`STORED`:** viene scritta su disco solo se serve indicizzarla intensamente, ma si aggiorna automaticamente garantendo l'integrità.

#### 6. Utilizzo di Tabelle WITHOUT ROWID

Di default, ogni tabella SQLite crea una colonna nascosta a 64-bit chiamata `rowid` e un B-tree associato. Se una tabella ha già una chiave primaria naturale o composta (come le tabelle di giunzione N:M), la presenza del `rowid` genera un duplicato strutturale inutile.

La clausola `WITHOUT ROWID` elimina l'overhead del secondo albero B-tree:

```sql
CREATE TABLE tag_articoli (
    id_articolo INTEGER NOT NULL,
    id_tag INTEGER NOT NULL,
    PRIMARY KEY (id_articolo, id_tag),
    FOREIGN KEY (id_articolo) REFERENCES articoli(id_articolo),
    FOREIGN KEY (id_tag) REFERENCES tag(id_tag)
) WITHOUT ROWID;
```

#### 7. Vincoli di Unicità e Gestione dei Conflitti (UPSERT)

Per evitare righe duplicate accidentali a livello applicativo:

- Applicare vincoli `UNIQUE` su singole colonne o tuple (`UNIQUE(colonna_a, colonna_b)`).
- Usare la sintassi UPSERT (`ON CONFLICT`) per consolidare i dati anziché inserire duplicati:

```sql
INSERT INTO contatori_visite (pagina, conteggio)
VALUES ('/home', 1)
ON CONFLICT(pagina) DO UPDATE SET conteggio = conteggio + 1;
```

#### 8. Viste (Views) al Posto di Tabelle Denormalizzate

Quando più query richiedono join complessi tra tabelle normalizzate, non duplicare i dati in una nuova tabella di riepilogo. Creare invece una vista logica:

```sql
CREATE VIEW vista_dettaglio_ordini AS
SELECT
    o.id_ordine,
    c.nome AS cliente,
    p.nome AS prodotto,
    od.quantita,
    (od.quantita * p.prezzo) AS importo
FROM ordini o
JOIN clienti c ON o.id_cliente = c.id_cliente
JOIN ordini_dettaglio od ON o.id_ordine = od.id_ordine
JOIN prodotti p ON od.id_prodotto = p.id_prodotto;
```

#### 9. Manutenzione dello Spazio: VACUUM

Quando si eliminano o modificano record duplicati, SQLite non riduce automaticamente la dimensione fisica del file `.sqlite`, ma mantiene le pagine vuote in una "freelist" per riutilizzi futuri. Valutare `VACUUM` solo se lo spazio recuperabile giustifica costo, spazio temporaneo e finestra di manutenzione; non eseguirlo automaticamente durante una diretta.

#### 10. Indici e query che crescono con i dati

Una query corretta oggi può diventare lenta quando la tabella cresce: va controllata con `EXPLAIN QUERY PLAN` sui volumi attesi, non sui dati di prova.

- **Indici su ciò che si filtra e si ordina:** ogni `WHERE`/`ORDER BY` frequente ha un indice che lo serve; un indice parziale (`WHERE …`) basta se il filtro riguarda un sottoinsieme piccolo. Ogni indice costa spazio e tempo di scrittura: niente indici non usati.
- **Ricerca testuale:** `LIKE '%testo%'` legge l'intera tabella. Oltre le decine di migliaia di righe, o se la ricerca è interattiva, usare FTS5 (tabella virtuale tenuta allineata da trigger) invece di scansioni complete.
- **Paginazione a chiave:** `OFFSET` rilegge e scarta tutte le righe saltate, quindi le pagine in fondo costano di più. Per scorrere una tabella ordinata usare la paginazione a chiave (`WHERE id < ? ORDER BY id DESC LIMIT n`).
- **Conteggi e aggregazioni:** `COUNT(*)` e `GROUP BY` su tabelle grandi sono scansioni; se servono a ogni apertura di una vista, conservare il valore in cache invalidata dalle scritture, o in una tabella di riepilogo aggiornata nella stessa transazione.
- **Niente lettura integrale per abitudine:** caricare in memoria un'intera tabella che cresce con gli utenti o con il tempo richiede un limite o un caricamento a pagine (sezione 3, budget di memoria). Con `better-sqlite3`, `.all()` materializza tutto il risultato: per risultati grandi usare `.iterate()`.

#### 11. Retention e crescita del file

Una tabella di cronologia, log o eventi senza politica di conservazione cresce per sempre. Ogni tabella che si accumula nel tempo dichiara un limite (per età o per numero di righe) e la pulizia che lo applica, a lotti e in transazioni brevi, fuori dalle finestre critiche. Lo spazio liberato resta nella freelist: recuperarlo con `VACUUM` secondo il punto 9 oppure, se il file deve restituire spazio senza blocchi lunghi, con `auto_vacuum = INCREMENTAL` e `incremental_vacuum` a piccoli passi (richiede un `VACUUM` una tantum per attivarlo e va provato prima).

Fonti tecniche per l'adattamento delle regole di concorrenza: [worker Node](https://nodejs.org/api/worker_threads.html),
[SQLite WAL](https://www.sqlite.org/wal.html), [transazioni SQLite](https://www.sqlite.org/lang_transaction.html),
[processi Python](https://docs.python.org/3/library/subprocess.html).

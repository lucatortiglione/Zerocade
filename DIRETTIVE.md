# Software Engineering Standards — Versione 2.6

**Direttive per architettura, sviluppo, ottimizzazione, sicurezza, concorrenza e qualità del software.**

Aggiornamento del 14 novembre 2026, versione 2.6: adeguato a Zerocade. Corrette le righe che riguardavano un altro
progetto (direzione delle dipendenze, versioning, identità degli eseguibili di prova, ambiente incompleto) e aggiunta
la sezione 16, che traduce le regole nello stack di Zerocade (TypeScript, Node.js, React, SQLite, giochi in Python).
Le altre sezioni sono il testo generale: dove citano Rust, C++ o Qt, la sezione 16 indica l'equivalente.

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

---

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

---

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
|---|---|---|
| Funzione | Calcolo, trasformazione o validazione con input e output definiti | Precondizioni, risultato, errori ed eventuali effetti |
| Modulo | Funzioni e tipi coesi, con dettagli da nascondere ai chiamanti | API interna o pubblica, dipendenze e invarianti |
| Crate o package | Consumo indipendente, dipendenze o piattaforme distinte, distribuzione o versionamento separati realmente necessari | Build autonoma rispetto all'app, dipendenze dirette, feature e compatibilità |
| Trait o adapter | Collaboratore da sostituire in produzione o nei test, confine I/O o implementazioni realmente differenti | Semantica comune, errori, ownership e ciclo di vita |

- [ ] **Estrazione motivata:** un componente può essere estratto anche con un solo chiamante quando isola una regola dalla GUI, rende verificabile un'invariante o chiarisce proprietà e durata delle risorse. L'astrazione condivisa deve invece corrispondere a esigenze e semantiche comuni osservate nei punti d'uso.
- [ ] **Costo proporzionato:** iniziare da funzioni e moduli; introdurre crate, framework di injection, plugin o livelli aggiuntivi soltanto per un beneficio concreto. La riutilizzabilità di una libreria non richiede la pubblicazione su un registro.
- [ ] **Dipendenze dichiarate:** usare import espliciti nel codice applicativo e limitare le dipendenze a quelle realmente necessarie. Feature facoltative e target distinti vanno introdotti per consumatori o piattaforme effettivi e verificati nelle combinazioni dichiarate supportate.

#### Direzione delle dipendenze e isolamento del dominio

- [ ] **Dipendenze unidirezionali:** descrivere i livelli e il verso delle dipendenze dei componenti toccati. Per Zerocade vale `apps/* → packages/shared`: `shared` non importa nessuna app, e server, overlay e dashboard si parlano solo attraverso i tipi di `shared` e il protocollo Socket.IO, mai importandosi a vicenda. Le regole applicative ricevono dati e collaboratori senza conoscere finestre, query, endpoint o credenziali quando questi dettagli non appartengono alla decisione.
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

- [ ] **Visibilità minima:** dettagli privati per impostazione predefinita; in Rust usare `pub(super)`, `pub(crate)` e `pub` secondo gli effettivi chiamanti. Esportare intenzionalmente i punti d'ingresso stabili; preservare i percorsi già usati quando si spostano le implementazioni.
- [ ] **Input pertinenti:** le API richiedono dati e capacità utili al compito. Evitare di passare l'intero backend o un contenitore di servizi per accedere a pochi campi. Un aggregato di configurazione coerente è ammesso; documentare le conversioni e i dati inutilmente copiati se incidono sul percorso caldo.
- [ ] **Tipi semantici:** identificatori, piattaforme, durate, stati ed errori distinguibili hanno tipi appropriati. Formati Qt, record SQLite e payload di protocollo si convertono al confine quando il dominio non deve dipenderne.
- [ ] **Invarianti protette:** campi privati e costruttori validati quando la mutazione può rendere un oggetto incoerente. Campi pubblici sono ammessi per dati passivi con un contratto chiaro; non obbligare ogni struttura a una gerarchia di getter e setter.
- [ ] **Contratto operativo:** dichiarare precondizioni, postcondizioni, limiti, errori, ordine degli effetti, chiamate ripetute ammesse e stato dopo un fallimento. Se conta, indicare thread o executor, inizializzazione, rientranza, cancellazione, idempotenza e chiusura; richiamare le sezioni 3, 5, 6 e 7.
- [ ] **Esempio significativo:** per una nuova API riutilizzabile fornire un uso minimo compilabile che mostri il beneficio e la gestione degli errori. Per una funzione interna semplice bastano documentazione essenziale e prove pertinenti; gli esempi non devono introdurre accessi a dati reali o segreti impliciti.

#### Composizione, ownership e configurazione

- [ ] **Composizione esplicita:** costruire i collaboratori nel punto di avvio dell'applicazione o nell'adattatore competente e passarli ai componenti che li usano. Un costruttore apparentemente puro non apre connessioni, legge preferenze globali o avvia thread senza dichiararlo.
- [ ] **Ownership nell'API:** rendere chiaro chi possiede dati, buffer, socket, task e callback. In Rust prendere in prestito ciò che si consulta e trasferire ciò che si conserva; una copia intenzionale si rende visibile e motivata. Generics e trait object si scelgono in base alla sostituzione necessaria e ai costi, senza imporre un modello unico.
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

- [ ] **Contratti iniziali riletti:** individuare tutti i chiamanti e gli usi indiretti: callback, macro, codice generato, FFI, QML, esempi e test. Registrare cosa deve restare osservabile e le verifiche applicabili prima di muovere il codice.
- [ ] **Spostamenti separati:** separare in commit revisionabili spostamenti, estrazioni di conoscenza comune e cambi intenzionali di comportamento. Mantenere la compatibilità durante la transizione e rimuovere le vecchie copie dopo aver aggiornato i chiamanti.
- [ ] **Prove al confine corretto:** il dominio si prova senza GUI, rete o database reali, con dati e collaboratori controllati. Gli adattatori Qt, SQL e di trasporto hanno anche prove d'integrazione con il relativo framework o servizio locale controllato: è il loro scopo, non una violazione di isolamento.
- [ ] **Stessa semantica nei consumatori:** per una regola comune esercitare gli ingressi realmente differenti dei chiamanti su casi normali, limiti ed errori. Verificare risultati ed effetti; evitare test che si limitano a ripetere l'implementazione o a controllare che una funzione sia stata chiamata.
- [ ] **Verifica nativa:** compilare i target coinvolti e ripetere le prove pertinenti prima e dopo sulla toolchain supportata. Confronto testuale, conteggio delle righe, script estratti dalla GUI ed esempi non eseguiti sono evidenze parziali; si dichiarano secondo la sezione 14.
- [ ] **Risorse e concorrenza preservate:** applicare anche la matrice della sezione 11 se l'estrazione tocca cache, cancellazione, code, persistenza o thread. Il refactoring del solo layout non autorizza a saltare le prove del confine FFI o dei callback.

Per una modularizzazione o estrazione significativa, la revisione deve contenere le evidenze pertinenti:

| Criterio | Evidenza richiesta |
|---|---|
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
- [ ] **Conformità verificata:** per Rust applicare Rust API Guidelines, rustdoc, Clippy e rustfmt; per C++ le C++ Core Guidelines e lo standard supportato; per Qt le regole di lifetime, thread e collegamento FFI della versione adottata. Funzionalità instabili e nuove dipendenze richiedono una necessità esplicita.

Riferimenti per questa sezione, consultati il 14 ottobre 2026:
[Rust API Guidelines — flessibilità](https://rust-lang.github.io/api-guidelines/flexibility.html),
[API ed evoluzione](https://rust-lang.github.io/api-guidelines/future-proofing.html),
[documentazione](https://rust-lang.github.io/api-guidelines/documentation.html),
[Rust Reference — visibilità](https://doc.rust-lang.org/reference/visibility-and-privacy.html),
[Qt — thread e QObject](https://doc.qt.io/qt-6/threads-qobject.html) e
[CXX-Qt — ponte RustQt](https://kdab.github.io/cxx-qt/book/bridge/extern_rustqt.html).

---

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

---

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

---

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

### Thread pool e scheduling

- [ ] **Pool distinti quando utile:** separare lavoro CPU-bound, operazioni bloccanti e task asincroni per evitare interferenze.
- [ ] **Pool CPU-bound misurato:** dimensionare il parallelismo usando CPU effettivamente disponibili, architettura hardware, altri carichi e benchmark.
- [ ] **I/O asincrono:** preferire I/O non bloccante per molte connessioni concorrenti quando la piattaforma lo supporta efficacemente.
- [ ] **Blocking isolato:** delegare operazioni sincrone lunghe a pool dedicati e limitati.
- [ ] **Priorità e fairness:** impedire che task ad alta frequenza affamino attività meno frequenti ma importanti.
- [ ] **Work stealing selettivo:** utilizzare scheduler consolidati e valutarne l'adeguatezza per carichi irregolari.
- [ ] **Thread-local storage:** impiegare contesti e buffer locali dove riducono contesa senza causare crescita incontrollata della memoria.

### Backpressure e gestione delle code

- [ ] **Code delimitate:** nessuna coda potenzialmente illimitata senza una giustificazione e un controllo equivalente sulle risorse.
- [ ] **Politica di saturazione:** definire esplicitamente cosa accade al raggiungimento della capacità massima.
- [ ] **Strategie differenziate:** scegliere tra attesa, rifiuto, drop-oldest, drop-newest, coalescing o batching secondo la semantica degli eventi.
- [ ] **Priorità agli eventi critici:** non scartare eventi che rappresentano transazioni, comandi essenziali o modifiche persistenti.
- [ ] **Latest-wins controllato:** permettere la sostituzione di aggiornamenti obsoleti solo quando perdere gli stati intermedi è semanticamente corretto.
- [ ] **Metriche delle code:** osservare profondità, tempo di attesa, saturazione e numero di elementi scartati.

### Cancellazione e shutdown

- [ ] **Cancellazione cooperativa:** utilizzare cancellation token, stop token o meccanismi equivalenti.
- [ ] **Cancellazione propagata:** propagare l'arresto ai task figli quando appropriato.
- [ ] **Shutdown ordinato:** interrompere l'accettazione di nuovo lavoro, gestire i task pendenti, chiudere risorse e terminare worker.
- [ ] **Shutdown bounded:** prevedere scadenze operative e politiche per i task non terminabili immediatamente.
- [ ] **Drain esplicito:** definire quali code debbano essere svuotate e quali possano essere scartate.
- [ ] **Operazioni non interrompibili:** proteggere le sezioni in cui una cancellazione potrebbe lasciare dati o risorse incoerenti.
- [ ] **Nessun thread orfano:** ogni worker deve avere un proprietario responsabile della terminazione.

### Confini di cancellazione e side effect — P0

- [ ] **Analisi di ogni `await` interrompibile:** per ogni ramo di `select!`, timeout o task annullabile, indicare quali side effect possono essere già avvenuti e quale stato sopravvive alla distruzione del futuro.
- [ ] **Invio iniziato distinto da invio confermato:** una richiesta già trasmessa, un Invio premuto o una scrittura iniziata non si riavviano automaticamente dall'inizio. Un esito sconosciuto deve essere esplicito; si ritenta soltanto se l'operazione è idempotente o se si può escludere l'effetto precedente.
- [ ] **Comandi ordinari senza interruzione dell'invio:** aggiungere un messaggio alla coda non deve cancellare un invio in corso. Riservare la cancellazione ai comandi che la richiedono e gestire il punto in cui l'effetto esterno può essere avvenuto.
- [ ] **Cleanup indipendente dalla conclusione normale:** rimuovere richieste pendenti, registrazioni e permessi anche se il futuro viene distrutto. Usare guardie RAII/`Drop`, non soltanto codice dopo un `await` o dentro il ramo timeout.
- [ ] **Deadline delle scritture:** limitare anche invio, flush, Pong e Close del socket. Il timeout della risposta non garantisce che il task di trasporto possa terminare.
- [ ] **Prova deterministica:** sospendere l'operazione prima e dopo il side effect, iniettare un nuovo comando e verificare assenza di duplicati, richieste pendenti e conferme spurie. Usare barriere o segnali controllati, non sperare che una corsa si manifesti con uno `sleep`.

---

## 6. Sincronizzazione, lock e primitive atomiche

### Mutex e sezioni critiche

- [ ] **Gestione automatica dei lock:** usare guardie RAII o costrutti equivalenti al posto di coppie manuali `lock()` / `unlock()`.
- [ ] **Sezioni critiche ridotte:** mantenere minimo il lavoro svolto mentre un mutex è acquisito.
- [ ] **Nessuna operazione imprevedibile sotto lock:** evitare I/O bloccante, attese lunghe e callback esterne durante una sezione critica.
- [ ] **Lock ordering documentato:** definire un ordine coerente quando più mutex possono essere acquisiti contemporaneamente.
- [ ] **Primitive per acquisizioni multiple:** impiegare meccanismi che evitino deadlock quando diversi lock devono essere acquisiti insieme.
- [ ] **Nessun lock durante `await`:** evitare di mantenere lock sincroni attraverso punti di sospensione asincrona; eventuali eccezioni devono avere una motivazione precisa.
- [ ] **Gestione del lock poisoning:** trattare esplicitamente gli stati potenzialmente incoerenti dove la piattaforma prevede il poisoning.
- [ ] **Misura della contesa:** valutare tempo di attesa, frequenza di acquisizione e durata delle sezioni critiche.

### Atomiche e lock-free

- [ ] **Primitive consolidate:** preferire implementazioni atomiche e code concorrenti mantenute e testate.
- [ ] **Nessun lock-free custom ingiustificato:** non sviluppare strutture lock-free da zero senza una necessità dimostrata e competenze specialistiche.
- [ ] **Memory ordering corretto:** utilizzare `seq_cst` come scelta conservativa iniziale, oppure ordinamenti più deboli con prova di correttezza e documentazione.
- [ ] **Distinzione tra atomicità e sincronizzazione:** non presumere che un contatore atomico garantisca automaticamente la correttezza delle operazioni sui dati associati.
- [ ] **Prevenzione ABA e problemi di reclamation:** valutare i problemi di riutilizzo della memoria nelle strutture concorrenti.
- [ ] **No busy-wait incontrollato:** evitare spin loop che consumano inutilmente CPU, salvo casi specifici con backoff e misure.
- [ ] **Nessun data race:** tutti gli accessi concorrenti incompatibili devono essere correttamente sincronizzati.

---

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

---

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

---

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

---

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

---

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

- [ ] **Race detection:** eseguire test con TSan o strumenti equivalenti sui target supportati.
- [ ] **Stress test concorrenti:** ripetere operazioni sotto differenti livelli di parallelismo.
- [ ] **Test di cancellazione:** verificare arresti durante attese, I/O e operazioni parzialmente completate.
- [ ] **Test di shutdown:** garantire l'assenza di thread orfani, task dispersi e risorse non rilasciate.
- [ ] **Deadlock testing:** esercitare scenari con acquisizione di più lock.
- [ ] **Fault injection:** simulare timeout, disconnessioni, errori del filesystem e indisponibilità delle dipendenze.
- [ ] **Test di saturazione:** verificare comportamenti di code e worker quando il sistema supera la capacità prevista.
- [ ] **Test di recovery:** verificare riavvio, riconnessione, ritentativi e ripristino della consistenza.

### Performance testing

- [ ] **Benchmark CPU e memoria:** verificare il costo delle operazioni principali.
- [ ] **Load testing:** misurare il comportamento al carico nominale e ai picchi.
- [ ] **Soak testing:** valutare stabilità, leak e consumo risorse in esecuzioni prolungate.
- [ ] **Test di scalabilità:** verificare come cambiano throughput e latenza aumentando il parallelismo.
- [ ] **Performance regression testing:** confrontare le nuove implementazioni con una baseline attendibile.

La coverage è un indicatore di supporto: un'elevata percentuale non sostituisce test significativi e verifica delle invarianti.

### Matrice obbligatoria dei casi di regressione

Applicare le righe pertinenti al componente modificato. Per un bug corretto, conservare nel repository una prova
che fallisce sul comportamento precedente e passa su quello corretto; se non è eseguibile nell'ambiente corrente,
dichiararla **non eseguita** e tenerla come requisito di verifica prima del rilascio.

| Confine | Scenario da provare | Invariante |
|---|---|---|
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

---

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
  database e una porta propri (`ZEROCADE_DB`, `PORT`, `ZEROCADE_PUBLIC_PORT`) e mai `apps/server/data/zerocade.db`
  della diretta vera, né account, chiavi o dirette reali. Script e istruzioni di prova devono impostare queste
  variabili; il pacchetto `release/` e l'installazione ordinaria non si usano per le prove.
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

---

## 13. Direttive specifiche per Rust, C++ e applicazioni desktop

### Rust

- [ ] Utilizzare ownership e borrowing per limitare la condivisione incontrollata.
- [ ] Preferire API safe e isolare accuratamente i blocchi `unsafe`.
- [ ] Documentare le invarianti di sicurezza di ogni operazione `unsafe`.
- [ ] Utilizzare `Send` e `Sync` rispettandone i contratti effettivi.
- [ ] Non mantenere `MutexGuard` sincroni durante operazioni `await`.
- [ ] Gestire gli errori con `Result` e propagazione appropriata.
- [ ] Evitare `unwrap()` ed `expect()` sui percorsi di fallimento ordinario.
- [ ] Non convertire automaticamente tutti i lavori in task asincroni: distinguere CPU-bound e I/O-bound.
- [ ] Gestire esplicitamente lifecycle di runtime, worker e task.
- [ ] Verificare le API FFI e le conversioni dei dati verso librerie C/C++.

### C++

- [ ] Utilizzare smart pointer appropriati per esprimere ownership.
- [ ] Preferire RAII a gestione manuale delle risorse.
- [ ] Evitare raw owning pointer e lifetime ambigui.
- [ ] Utilizzare `std::jthread` e stop token quando compatibili con il progetto.
- [ ] Impedire undefined behavior, invalidazione di iteratori e dangling reference.
- [ ] Validare thread safety ed exception safety delle API utilizzate.
- [ ] Eseguire controlli statici e dinamici compatibili con la toolchain.

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

---

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
9. Distinguere verifica del prodotto, prova isolata, simulazione e analisi statica. Una simulazione dell'interleaving o uno script estratto da QML non equivale a compilazione o esecuzione Rust/Qt.
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

---

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

---

## 16. Applicazione a Zerocade

Le sezioni precedenti sono generali; questa le rende concrete per il progetto. Dove c'è un conflitto vale la regola
più rigida. Le versioni esatte non si ripetono qui: stanno in `package.json`, `package-lock.json` e nei
`pyproject`/requisiti dei giochi.

### Stack e confini

- **Workspace npm** (Node.js 26 o successivo): `apps/server` (Fastify, Socket.IO, `better-sqlite3`, collegamento a
  TikTok e Twitch), `apps/overlay` e `apps/dashboard` (React con Vite), `packages/shared` (catalogo dei giochi,
  impostazioni, tipi e regole comuni). TypeScript controlla tutto con `tsc`.
- **Direzione delle dipendenze:** `apps/* → packages/shared`. `shared` non importa le app; le app non si importano a
  vicenda e comunicano per tipi condivisi e protocollo Socket.IO (sezione 2). Le regole dei giochi vanno in
  funzioni pure e provabili senza rete né database; Fastify, Socket.IO, SQLite e i connettori sono adattatori.
- **Dati:** SQLite. `database/giochi.sqlite3` (contenuti, uno schema per gioco) e `database/ZeroQuizz.sqlite3` sono in
  Git; `database/parole_ita_raw.sqlite3` (2,3 GB) è fuori da Git; i dati della diretta stanno in
  `apps/server/data/zerocade.db` sul PC (ignorato da Git). Valgono le regole della sezione 8 per transazioni,
  migrazioni e compatibilità; ogni schema dei giochi si confronta con la sua origine (`database/giochi.py verify`).
- **Giochi con cartella propria** (`gioco-*`): dati, strumenti e prove in Python; ogni gioco ha il suo `README.md`
  e, dove serve, il suo `TODO.md`.

### Equivalenti delle regole specifiche per linguaggio (sezione 13)

| Il testo generale cita | Per Zerocade vale |
|---|---|
| Rust, `Result`, `unwrap`/`expect` | TypeScript in modalità rigorosa; errori attesi come valori o eccezioni tipizzate gestite al confine; niente `any` né asserzioni di tipo per far passare `tsc`; niente `catch` vuoti |
| `MutexGuard` durante `await`, task e runtime | Nessun stato condiviso modificato attraverso un `await` senza controllare che sia ancora valido al ritorno; timer, listener e socket hanno un proprietario che li chiude allo spegnimento |
| Thread dell'interfaccia, Qt, QML | Il thread principale del browser (overlay e dashboard): niente calcoli pesanti o I/O bloccante nel rendering React; aggiornamenti ad alta frequenza raggruppati (`requestAnimationFrame`, coalescing); canvas senza ridisegni inutili |
| FFI, `unsafe`, binding C/C++ | Il confine con il modulo nativo `better-sqlite3`, con i processi Python e con il sistema (file hosts, porte): input e percorsi validati, errori propagati, nessuna esecuzione di testo ricevuto da chat o eventi |
| Clippy, rustfmt, `cargo test` | `tsc` (`npm run typecheck`), `node --test` e `unittest` |
| Sanitizer (ASan, TSan, UBSan) | Non applicabili a TypeScript/Python; la concorrenza si prova con test di ordine degli eventi, cancellazione e chiusura |

Le sezioni su C++ e Rust restano nel testo per l'eventuale codice futuro; il C++ presente in `gioco-*/.venv` è di
librerie di terzi, non codice del progetto.

### Verifiche minime prima di consegnare

Si eseguono dalla cartella radice e si riportano gli esiti reali (sezione 14):

- `npm run typecheck`
- `node --import tsx --test tests/*.test.ts`
- `python -m unittest discover -s database` e, per ZeroAssociazioni, `npm run test:associations`
- `python database/giochi.py verify` se si toccano i contenuti dei giochi
- `npm run build` per overlay e dashboard, e un avvio di prova del server con dati isolati (sezione 12)
- `npm audit --omit=dev` per le dipendenze; con npm 12 gli script di installazione sono bloccati, e solo
  `better-sqlite3` ed `esbuild` sono consentiti in `allowScripts` del `package.json`

Stato verificato il 14 novembre 2026 sul branch di lavoro (con modifiche non ancora committate): `typecheck` senza
errori, 37 test Node superati, 13 test Python del database superati, `npm audit --omit=dev` senza vulnerabilità.
Non c'è una pipeline automatica: i controlli sono manuali finché non ne viene aggiunta una (sezione 12).

### Sicurezza e privacy

- Chat, nomi, eventi e regali arrivano da fuori: sono input non fidato (sezione 10). Si validano al confine
  (`apps/server/src/validate.ts`) con lunghezze, formati e conteggi limitati, e non entrano mai in query SQL,
  percorsi o HTML senza parametri o escape.
- Il server principale con i comandi di regia resta sul PC; il server pubblico (`ZEROCADE_PUBLIC_PORT`) espone solo
  le classifiche. Nuove rotte pubbliche richiedono una revisione esplicita dei dati che mostrano.
- Segreti (per esempio `TWITCH_CLIENT_SECRET`) solo in variabili d'ambiente o file `.env`, che Git ignora; mai nel
  codice, nei log né nel pacchetto `release/`. Un segreto finito in Git va revocato, non solo cancellato.
- Il server aggiunge una riga al file hosts di Windows chiedendo i privilegi di amministratore (`apps/server/src/hosts.ts`):
  la modifica deve restare limitata al nome `zerocade.test` (`127.0.0.1`), e se il permesso è negato il server deve
  continuare a funzionare con l'indirizzo `localhost`, dicendolo chiaramente.
- I contenuti di terzi (lessico, domande, immagini NASA) hanno licenze diverse, anche non commerciali: vanno
  rispettate e restano elencate nel README e nelle cartelle delle fonti; una nuova fonte porta la sua licenza.

### Aggiornare librerie e tool

Vale la sezione 10 (note di rilascio, adeguamento, verifica, tracciabilità). Per Zerocade:

- Le dipendenze di `package.json` sono per lo più bloccate a versione esatta; un aggiornamento modifica manifest e
  `package-lock.json` insieme, con le note di tutte le release intermedie lette.
- `better-sqlite3` ed `esbuild` hanno script nativi consentiti: un aggiornamento di uno dei due va verificato con
  l'avvio reale del server e dei test; `npm run sqlite:upgrade` aggiorna SQLite secondo `scripts/upgrade-sqlite.mjs`.
- `tiktok-live-connector` e `tmi.js` dipendono da servizi esterni che cambiano: dopo un aggiornamento si prova con
  il connettore finto o con una diretta di prova, e si dichiara quello che non si è potuto provare.
- Python dei giochi: ambiente virtuale dentro la cartella del gioco; le versioni si registrano dove il gioco le
  documenta e non si mescolano con quelle di un altro gioco.
- Il pacchetto Windows (`npm run package:win`, con Node.js incluso) va ricostruito dopo un aggiornamento di Node o di
  una dipendenza, altrimenti `release/` resta con le versioni vecchie e lo si dichiara.

### Versioning e flusso di lavoro

- Oggi tutti i `package.json` sono alla versione `0.0.0` e non ci sono tag Git. Prima del primo rilascio si fissa
  uno schema (per esempio SemVer sul `package.json` radice, con i pacchetti del workspace allineati) e un tag per
  ogni pacchetto distribuito, come chiede la sezione 12.
- Ogni lavoro ha un branch e commit identificabili; se mancano prove o build la PR resta in bozza (sezione 14). Le
  modifiche non committate di un altro lavoro non si mescolano in un commit non pertinente.
- `README.md` descrive il progetto, `TODO.md` il lavoro da fare, `ANALYSIS.md` l'analisi di Livecade da cui parte il
  progetto, i README dei giochi dati e regole di ciascuno. Si aggiornano insieme al codice, senza duplicare lo
  stesso dettaglio in più file.

---

**Principio conclusivo**

> Progettare prima per la correttezza, rendere espliciti gli invarianti, limitare il consumo di risorse, rendere osservabili i fallimenti, verificare ogni modifica e ottimizzare soltanto sulla base di evidenze.

Lo scopo non è massimizzare il numero di pattern, thread, astrazioni o ottimizzazioni implementate, ma ottenere la soluzione complessivamente più corretta, semplice, efficiente e affidabile.

Per ridurre al minimo la ridondanza dei dati in un database relazionale basato su SQLite3, si interviene su due livelli complementari: la progettazione logica dello schema (normalizzazione relazionale) e l'adozione delle funzionalità native del motore di SQLite.
1. Normalizzazione dello Schema (1NF, 2NF, 3NF)

La normalizzazione è il principio cardine per eliminare la duplicazione delle informazioni dividendo i dati in entità logiche distinte collegate da chiavi.

    1NF (Prima Forma Normale): Eliminare colonne ripetitive e valori composti (es. stringhe separate da virgole come "tag1,tag2,tag3"). Ogni colonna deve contenere un singolo valore atomico.

    2NF (Seconda Forma Normale): Rimuovere le dipendenze parziali nelle chiavi composte. Ogni attributo non chiave deve dipendere dall'intera chiave primaria.

    3NF (Terza Forma Normale): Rimuovere le dipendenze transitive. Nessuna colonna deve dipendere da un'altra colonna non chiave.

SQL

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

2. Abilitazione delle Chiavi Esterne (Foreign Keys)

SQLite supporta i vincoli di chiave esterna, ma per motivi di retrocompatibilità sono disabilitati per impostazione predefinita su ogni nuova connessione. Se non vengono attivati, il database non impedisce l'inserimento di chiavi orfane o l'inconsistenza referenziale.

Abilita sempre il supporto all'apertura della sessione:
SQL

PRAGMA foreign_keys = ON;

3. Dizionari di Lookup per Stringhe Ripetute

Campi categorici ripetuti frequentemente (es. stato_ordine come 'IN_ATTESA', 'SPEDITO', 'CONSEGNATO') occupano byte preziosi su disco per ogni record e aumentano il rischio di typo.

Sostituisci il testo con una chiave numerica che punta a una tabella di lookup:
SQL

CREATE TABLE stati_ordine (
    id_stato INTEGER PRIMARY KEY,
    descrizione TEXT NOT NULL UNIQUE
);

CREATE TABLE ordini (
    id_ordine INTEGER PRIMARY KEY,
    id_stato INTEGER NOT NULL,
    FOREIGN KEY (id_stato) REFERENCES stati_ordine(id_stato)
);

    In SQLite, INTEGER PRIMARY KEY è un alias diretto per il puntatore interno a 64 bit (ROWID). Memorizzare un intero occupa da 1 a 8 byte a lunghezza variabile, risultando nettamente più compatto ed efficiente rispetto a stringhe duplicate.

4. Tabelle di Giunzione per Relazioni Molti-a-Molti

Per gestire associazioni N:M senza duplicare attributi o creare array di stringhe non indicizzabili, si utilizza una tabella ponte con chiave primaria composita:
SQL

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

5. Colonne Generate (Generated Columns)

Evita di salvare colonne derivate o calcolabili a partire da altri campi (ad esempio prezzo_totale = quantita * prezzo_unitario). SQLite supporta le colonne generate:
SQL

CREATE TABLE fatture_righe (
    id INTEGER PRIMARY KEY,
    prezzo_unitario REAL NOT NULL,
    quantita INTEGER NOT NULL,
    -- VIRTUAL non consuma spazio su disco; viene calcolata solo in lettura
    totale_riga REAL GENERATED ALWAYS AS (prezzo_unitario * quantita) VIRTUAL
);

    VIRTUAL: Non occupa spazio su disco, elimina la ridondanza fisica.

    STORED: Viene scritta su disco solo se serve indicizzarla intensamente, ma si aggiorna automaticamente garantendo l'integrità.

6. Utilizzo di Tabelle WITHOUT ROWID

Di default, ogni tabella SQLite crea una colonna nascosta a 64-bit chiamata rowid e un B-tree associato. Se una tabella ha già una chiave primaria naturale o composta (come le tabelle di giunzione N:M), la presenza del rowid genera un duplicato strutturale inutile.

La clausola WITHOUT ROWID elimina l'overhead del secondo albero B-tree:
SQL

CREATE TABLE tag_articoli (
    id_articolo INTEGER NOT NULL,
    id_tag INTEGER NOT NULL,
    PRIMARY KEY (id_articolo, id_tag),
    FOREIGN KEY (id_articolo) REFERENCES articoli(id_articolo),
    FOREIGN KEY (id_tag) REFERENCES tag(id_tag)
) WITHOUT ROWID;

7. Vincoli di Unicità e Gestione dei Conflitti (UPSERT)

Per evitare righe duplicate accidentali a livello applicativo:

    Applica vincoli UNIQUE su singole colonne o tuple (UNIQUE(colonna_a, colonna_b)).

    Usa la sintassi UPSERT (ON CONFLICT) per consolidare i dati anziché inserire duplicati:

SQL

INSERT INTO contatori_visite (pagina, conteggio)
VALUES ('/home', 1)
ON CONFLICT(pagina) DO UPDATE SET conteggio = conteggio + 1;

8. Viste (Views) al Posto di Tabelle Denormalizzate

Quando più query richiedono join complessi tra tabelle normalizzate, non duplicare i dati in una nuova tabella di riepilogo. Crea invece una vista logica:
SQL

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

9. Manutenzione dello Spazio: VACUUM

Quando si eliminano o modificano record duplicati, SQLite non riduce automaticamente la dimensione fisica del file .sqlite, ma mantiene le pagine vuote in una "freelist" per riutilizzi futuri.
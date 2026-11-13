# Lo schema `filtrati`: contenuto, criteri e verifiche

Documento aggiornato il **9 novembre 2026**, sulla base del codice locale di
[filter_prompts.py](filter_prompts.py), [review_prompts.py](review_prompts.py) e
[validated_prompt_database.py](validated_prompt_database.py).

## 1. A cosa serve questo database

Lo schema `filtrati` del DB di lavoro (`database/parole_ita_raw.sqlite3`) serve a organizzare i **candidati al ruolo di prompt**
raccolti dalle fonti e a distinguere quelli ancora da revisionare da quelli che
hanno già una revisione positiva documentata.

Il prompt è la parola mostrata al giocatore. Le parole associate sono invece le
risposte nascoste: vengono ricercate e verificate in una fase successiva.

Il database contiene due livelli distinti, nello schema prodotto dal codice
attuale:

| Livello | Tabella | Requisito per l'inserimento |
|---|---|---|
| Preselezione | `filtered_prompts` | Superamento dei filtri automatici descritti sotto |
| Revisione positiva | `validated_prompts` | Esistenza nella raccolta di un verbale positivo corrente e conforme, con senso e categoria scelti dal revisore |

**Una riga in `filtered_prompts` non dimostra che il prompt sia già utilizzabile
nel gioco.** Il valore `FILTERED_AUTOMATIC` resta una qualifica di preselezione,
anche quando esiste anche una revisione positiva. Per conoscere quest'ultima si
consultano `validated_prompts` e la vista `review_state`.

Un prompt può essere validato prima che siano state trovate le sue risposte.
Non si devono inventare sette associazioni per poterlo conservare nel catalogo.

## 2. Rapporto con gli altri database

| Schema | Ruolo nel flusso |
|---|---|
| `raw` | Archivio principale: voci raccolte, attestazioni, fonti, istantanee delle fonti, revisioni, decisioni e relativo storico |
| `filtrati` | Copia ricostruibile: preselezione automatica, diagnostica dei filtri e, nello schema aggiornato, copia dei prompt con revisione positiva, anche senza risposte |
| `scartati` | Copia delle esclusioni automatiche e degli scarti editoriali espliciti, con motivazione; i rinvii `DEFERRED` non sono scarti definitivi |
| `validi` | Nel codice attuale di `sync_validated`, copia dei prompt validati che hanno anche un bacino verificato dello stesso senso, categoria, POS e lingua |
| `game` | I bacini verificati, come viste sulla raccolta, distinti dall'inventario completo |

Il criterio dell'ultima sincronizzazione implementata è quindi: **un prompt
validato senza bacino resta registrato nella raccolta e viene riportato nello
schema `filtrati`; entra nella copia, lo schema `validi`, quando esiste
anche il bacino corrispondente verificato**.

Le copie già presenti su disco possono essere state generate da una versione
precedente del codice. Il contenuto fisico va distinto dal risultato di una
nuova ricostruzione: vedere il §12.

Non inserire manualmente nuove righe nelle copie per approvarle. Le fonti e le
decisioni si registrano nell'archivio principale; gli script rigenerano le copie.
La ricostruzione dei filtrati legge la raccolta senza cancellarne le voci.

## 3. Cosa può entrare nella preselezione automatica

Una voce deve superare tutti i passaggi seguenti. Le fonti già raccolte sono il
punto di partenza: questo comando non scarica autonomamente nuovi dizionari o
pagine Wikipedia.

### 3.1 Parola singola e prova di lemma

La voce deve essere già presente in `inventory_terms`, con:

- `is_single_word = 1`: una parola singola;
- `has_lemma_evidence = 1`: almeno una prova di lemma nella raccolta.

Una frase, una locuzione o una forma presente soltanto come flessione non
supera questo primo passaggio. La semplice presenza tra i titoli di Wikipedia
non dimostra l'idoneità linguistica o semantica di una voce.

### 3.2 Forma canonica

Il campo `prompt` deve rispettare integralmente:

```text
[a-zàèéìòù]{2,15}
```

Sono quindi ammesse da 2 a 15 lettere minuscole, con gli accenti indicati.
Spazi, apostrofi, trattini, cifre e altri simboli non sono ammessi in questa
preselezione. Le lettere `j`, `k`, `w`, `x`, `y` sono comprese nell'intervallo
`a-z`, ma fanno scattare il controllo dei possibili prestiti.

Questa verifica riguarda la forma registrata: **non dimostra da sola che si
tratti di un lemma italiano corretto**, né permette di eliminare accenti per
far passare una parola. `meta` e `metà` restano voci diverse.

### 3.3 Familiarità preliminare

La configurazione è [resources/prompt_policy.json](resources/prompt_policy.json).
Al momento della stesura, `minimum_zipf_it` vale **3.0**.

La voce passa se soddisfa almeno una di queste condizioni:

1. frequenza italiana `wordfreq` sulla scala Zipf almeno pari alla soglia;
2. presenza nel **Nuovo vocabolario di base di De Mauro**, attraverso le
   attestazioni NVdB raccolte nel database.

Per i lemmi verbali, il programma considera anche la frequenza delle forme
verbali attestate da Morph-it e usa il massimo disponibile. Serve a non
penalizzare un verbo solo perché l'infinito è meno frequente delle forme
coniugate. Questo massimo deriva dalle attestazioni morfologiche: non è una
conferma del significato o del POS che il revisore sceglierà in seguito.

La frequenza è un indizio sulla **parola**, non una prova sulla familiarità di
ogni sua accezione. Una parola comune può avere un significato tecnico raro.
Neppure l'appartenenza al NVdB approva automaticamente tutti i suoi significati.

L'età media di acquisizione ItAoA viene conservata, quando disponibile, ma
**non costituisce una soglia di esclusione** nel filtro attuale.

### 3.4 Dizionario italiano e categoria grammaticale

Il filtro consulta le attestazioni di lemma della fonte
`kaikki-itwiktionary`, cioè il Wikizionario italiano importato tramite Kaikki.
Le altre fonti arricchiscono l'inventario e le evidenze, ma non sostituiscono
automaticamente questo controllo lessicografico.

È richiesto almeno un senso utilizzabile come:

- `NOUN`: nome;
- `VERB`: verbo;
- `ADJ`: aggettivo.

Per ciascun senso, `clean_senses()` cerca una glossa non vuota e scarta:

- i sensi con indicazione di «definizione mancante»;
- i rimandi di tipo `form_of`, che descrivono un'altra forma;
- i sensi con una delle etichette escluse in `tags` o `raw_tags`:
  `obsolete`, `archaic`, `rare`, `dialectal`, `regional`, `vulgar`, `offensive`,
  `slang`, `derogatory`, `literary`, `poetic`.

Il confronto delle etichette è quello implementato nel codice: l'assenza di
questi segnali **non garantisce** che una definizione sia quotidiana, corretta,
completa o priva di un contenuto specialistico.

Esiste un'eccezione controllata: una voce marcata esplicitamente come priva di
definizione può restare candidata se Morph-it ne conferma il lemma nella
stessa categoria grammaticale. Riceve il flag `senza_definizione`; la glossa
rimane vuota e il senso deve essere stabilito nella revisione successiva.
Non è un'approvazione di una voce senza significato.

### 3.5 Prevalenza grammaticale, numerali e participi

Il filtro conta i sensi di contenuto e quelli appartenenti alle categorie
funzionali: avverbio, preposizione, congiunzione, pronome, determinante,
articolo e particella.

- Se i sensi funzionali sono **più numerosi** di quelli di contenuto, esclude
  la voce come prevalentemente grammaticale. In caso di parità, questo test
  da solo non la esclude.
- Se Morph-it attesta i tag `DET-NUM-CARD` o `PRO-NUM`, esclude la voce come
  numerale. Non è un riconoscitore generale di ogni possibile uso numerico.
- Se restano solo usi aggettivali e Morph-it conosce esclusivamente forme di
  participio, senza un lemma autonomo, esclude la voce come `solo_participio`.

Non si applica invece un divieto generale a tutti i participi: un aggettivo
autonomo attestato può rimanere candidato. Le incongruenze fra dizionario e
morfologia richiedono comunque controllo editoriale.

### 3.6 Prestiti stranieri: lista chiusa

La regola editoriale è: **un prestito straniero può essere ammesso come prompt
solo se è presente in `common_loanwords`**. La lista non limita i normali
termini italiani, che seguono i controlli di familiarità e significato.
Essere nella lista non esonera dagli altri controlli.

Nel filtro attuale, il sospetto di prestito è rilevato con un'euristica grafica:

- presenza di `j`, `k`, `w`, `x`, `y`;
- oppure finale diversa da una vocale italiana, accentata o non accentata.

Se la forma è sospetta e manca dalla lista, viene esclusa con
`prestito_non_in_lista`. Se la forma è sospetta ed è nella lista, il campo
`language` diventa `common_loanword`.

**Limite da conoscere:** questa euristica non riconosce tutti i prestiti, in
particolare quelli che terminano in vocale senza lettere distintive, e può
segnalare anche forme italiane. Nel filtro, le forme non segnalate vengono
etichettate `it`: non è una certificazione della lingua. Il revisore deve
controllare anche le prove lessicografiche e non può approvare un forestierismo
fuori lista solo perché l'euristica non lo ha riconosciuto.

`prompt_policy.py` contiene anche strumenti per leggere indizi di prestito
dalle fonti, ma `filter_prompts.judge()` non li usa come sostituto del controllo
grafico qui descritto.

### 3.7 Decisioni già presenti nella raccolta

Una decisione corrente `DISCARDED` oppure `DEFERRED` in
`inventory_term_decisions` impedisce l'inserimento nella preselezione ricostruita.

| Decisione | Significato |
|---|---|
| `DISCARDED` | Scarto esplicito della voce come prompt, con motivo |
| `DEFERRED` | Voce rinviata: dubbio ancora da risolvere, non scarto definitivo |
| `INTEGRATED` | Scelta di integrazione nella raccolta; da sola non è una revisione semantica positiva |

Una vecchia copia dei filtrati può ancora mostrare una voce appena scartata o
rinviata. `review_prompts.py pending` consulta anche le decisioni e le revisioni
nella raccolta, per non riproporla come candidata ancora da esaminare.

## 4. Campi della tabella `filtered_prompts`

Una sola riga per parola: `prompt` è la chiave primaria. Tutte le colonne sono
obbligatorie salvo `aoa` e `playability`.

| Campo | Contenuto e interpretazione |
|---|---|
| `prompt` | Forma canonica minuscola della parola candidata |
| `language` | `it` oppure `common_loanword`, secondo il controllo automatico descritto al §3.6 |
| `pos` | POS proposto automaticamente fra `NOUN`, `VERB`, `ADJ`; prevale quello con più sensi mantenuti |
| `pos_all` | Elenco, separato da virgole, dei POS considerati dal filtro; è un dato diagnostico da verificare |
| `zipf` | Frequenza di riferimento, arrotondata a due decimali; può includere il massimo delle forme verbali |
| `senses` | Conteggio dei sensi mantenuti dal filtro; non numero di significati già approvati semanticamente |
| `gloss` | Prima glossa del POS selezionato, limitata a 300 caratteri; vuota nel caso ammesso di definizione mancante |
| `sources` | Numero di fonti distinte che attestano la voce; non numero di revisioni né garanzia di qualità |
| `flags` | Array JSON di segnalazioni per il revisore |
| `nvdb` | `1` se la parola è attestata nel NVdB raccolto, altrimenti `0` |
| `aoa` | Età media di acquisizione ItAoA, arrotondata a due decimali; `NULL` se non disponibile |
| `in_game` | `1` se il lemma risulta nella tabella `prompts` del database di gioco consultato; semplice indicatore di presenza |
| `playability` | Diagnostica facoltativa da giocatori simulati; inizialmente `NULL` |
| `status` | Sempre `FILTERED_AUTOMATIC`, imposto dal vincolo della tabella |

`gloss` e `pos` sono proposte di partenza. Non bisogna confermare il primo
significato solo perché compare per primo nella fonte. Anche la categoria
grammaticale può richiedere correzione, per esempio quando una parola viene
proposta come aggettivo ma il suo uso quotidiano scelto è un nome.

La categoria tematica **non è una colonna di `filtered_prompts`**: viene scelta
e motivata durante la revisione e registrata nella tabella dei validati.
Le attestazioni complete, gli URL, le licenze e gli hash delle fonti rimangono
nella raccolta; il solo contatore `sources` non li sostituisce.

### Segnalazioni possibili

| Flag | Cosa richiede di controllare |
|---|---|
| `senza_definizione` | Manca una definizione utilizzabile: verificare e documentare il senso |
| `astratto_probabile` | Suffisso compatibile con un nome astratto; non è un divieto ai concetti astratti |
| `molti_sensi` | Almeno cinque sensi di contenuto mantenuti: disambiguare |
| `anche_parola_grammaticale` | Esistono anche usi funzionali |
| `anche_participio` | Sono attestate forme participiali |
| `senza_morfologia` | Mancano attestazioni Morph-it |
| `morfologia_solo_forme` | Morph-it attesta forme senza confermare il lemma della voce |
| `frequenza_da_forma_verbale` | La frequenza di una forma verbale supera quella del lemma |
| `familiare_per_nvdb` | L'ammissione per familiarità dipende dal NVdB, perché la frequenza resta sotto soglia |

Un flag non coincide automaticamente con un errore o con uno scarto.

## 5. Cosa deve essere verificato prima della revisione positiva

Il revisore, umano oppure LLM con attribuzione esplicita, deve effettuare una
vera valutazione della singola voce. Il superamento del filtro, la generazione
di un JSON e l'impostazione di campi a `true` non svolgono questa valutazione.

I cinque controlli registrati per un verbale `verified-prompt-1` sono:

| Controllo | Valutazione richiesta |
|---|---|
| `single_familiar_sense` | Scegliere un solo senso familiare e riconoscibile; confrontarlo con gli eventuali significati concorrenti |
| `prompt_language` | Confermare italiano o prestito consentito; correggere eventuali errori della classificazione automatica prima di approvare |
| `canonical_form` | Confermare lemma, grafia, accenti e POS appropriati al senso scelto |
| `familiarity` | Valutare la familiarità del significato, non soltanto la frequenza della stringa |
| `category_reviewed` | Scegliere una categoria reale del catalogo e motivarne la coerenza con quel significato |

Il catalogo è caricato da `prompt_database.load_categories()`: tassonomia di
base e [relative estensioni](resources/prompt_category_extensions.json).
Una categoria interna non rende riconoscibile al giocatore un'accezione rara
se il tema non è realmente visibile nell'interfaccia.

Esiti ammessi della revisione:

- `verified`: senso, POS, lingua e categoria confermati e motivati;
- `rejected`: scarto motivato dell'uso della voce come prompt;
- `deferred`: dubbio concreto ancora irrisolto, da conservare e riesaminare.

La mancanza di verbi associati o di un bacino già completo **non è un motivo
per scartare un prompt altrimenti valido**. Non si devono forzare quote
grammaticali né accezioni rare per raggiungere sette risposte.

## 6. Come viene documentata e controllata la revisione

I verbali positivi vengono registrati nella raccolta (schema `raw`):

- `prompt_validations` conserva i verbali identificati dal relativo hash;
- `prompt_validation_heads` indica il verbale corrente di ciascun prompt;
- le decisioni negative o di rinvio sono conservate nelle tabelle delle
  decisioni dell'inventario e nel relativo storico.

Per i verbali `verified-prompt-1`, il validatore controlla almeno:

1. schema previsto, prompt canonico, POS ammesso e descrizione del senso di
   almeno 15 caratteri;
2. categoria esistente e lingua dichiarata ammessa; se la lingua dichiarata è
   `common_loanword`, presenza della parola in `common_loanwords`;
3. decisione positiva, nome del revisore, metodo ammesso e data nel formato
   richiesto; coerenza del campo `human_review` con il metodo dichiarato;
4. hash delle direttive e corrispondenza alla versione semantica corrente;
5. presenza dei cinque controlli con valore `true`;
6. tre motivazioni di almeno 25 caratteri ciascuna: prompt, categoria e
   familiarità;
7. evidenze non vuote, con identificativi di fonte, riferimenti, licenza,
   attribuzione, ambito, nota e SHA-256 dell'istantanea;
8. hash del contenuto corretto, per rilevare modifiche successive al verbale;
9. presenza della voce nella raccolta o nei prompt già archiviati, prima di
   registrare una nuova revisione.

È possibile anche riutilizzare verbali completi `verified-pool-1`, che seguono
il contratto più ampio dei bacini e richiedono una motivazione della categoria.

**Questi sono controlli di struttura, coerenza e tracciabilità. Non dimostrano
che una categoria sia semanticamente corretta o che una motivazione sia vera.**
Il validatore non riconosce da solo un forestierismo dichiarato erroneamente
come `it`, né sostituisce il giudizio editoriale con una prova linguistica.

Una revisione LLM non va presentata come revisione umana. Il verbale del solo
prompt non dichiara QA indipendente di giocabilità: in questo contratto il campo
`independent_gameplay_qa` deve essere `false`.

## 7. Tabella `validated_prompts` nei filtrati e viste di consultazione

Durante `filter_prompts.py build`, il codice aggiornato copia nella tabella
`validated_prompts` i verbali positivi correnti che superano il contratto e non
sono bloccati da una decisione `DISCARDED` o `DEFERRED`.

| Campo | Contenuto |
|---|---|
| `prompt` | Parola validata, chiave primaria |
| `language` | Lingua confermata nel verbale |
| `pos` | Categoria grammaticale scelta dal revisore |
| `sense_description` | Unica accezione selezionata dal verbale corrente |
| `category_id`, `category_name`, `cluster_name` | Categoria scelta e corrispondenti etichette del catalogo |
| `reviewer`, `method`, `reviewed_at` | Autore, metodo e data della revisione |
| `validation_id` | Identificativo del verbale archiviato nella raccolta |
| `passes_automatic_filters` | `1` se il prompt compare anche nella preselezione corrente, altrimenti `0` |

Questa tabella può contenere prompt revisionati positivamente che non passano
tutti i filtri automatici. L'eccezione deriva da un verbale verificabile;
non rende automaticamente ammissibili altre parole analoghe.

Le viste hanno funzioni diverse:

- `filtered_catalog`: riepilogo della preselezione, ordinata per frequenza;
- `review_order`: ordine suggerito, prima NVdB, poi disponibilità ed età di
  acquisizione, infine frequenza decrescente;
- `review_state`: parte dalla preselezione e mostra `VALIDATO` se esiste anche
  una riga nella tabella dei validati, altrimenti `DA_RIVEDERE`.

`review_state` non include i validati esterni alla preselezione: per l'elenco
completo dei verbali positivi copiati, consultare `validated_prompts`.
Il POS esposto dalla vista è ancora quello automatico; quello corretto dal
revisore si legge nella tabella `validated_prompts`.

## 8. Scarti, diagnostica e metadati

### `filter_rejections`

Contiene `prompt`, `zipf` e `reason` per le voci che hanno già superato i primi
passaggi e la soglia preliminare di familiarità, ma sono poi escluse.

Motivi prodotti da questo stadio:

```text
nessun_nome_verbo_aggettivo_nel_wikizionario
soprattutto_parola_grammaticale
numerale
solo_participio
prestito_non_in_lista
scartata_o_rimandata_nella_raccolta
```

Non è l'elenco completo di tutte le esclusioni dell'inventario. Locuzioni,
forme non canoniche, voci prive di prova di lemma e parole sotto soglia possono
essere escluse prima e non comparire qui.

La copia completa delle esclusioni è lo schema `scartati`, che distingue
`AUTOMATIC_FILTER` da `EDITORIAL_DECISION`. `DEFERRED` resta fuori dagli scarti
definitivi. Una revisione positiva corrente può prevalere su un'esclusione
automatica; una decisione esplicita negativa può bloccare il prompt.
Dettagli in [PROMPT_SCARTATI.md](PROMPT_SCARTATI.md).

### `filter_steps`

Conserva il numero di voci rimaste dopo ciascun passaggio, con numero dello
stadio e descrizione. Serve a capire dove vengono escluse le voci, senza
interpretare ogni esclusione come errore linguistico.

### `metadata`

Registra versione dei filtri, percorso della raccolta, data di costruzione,
versione della politica dei prompt, soglia Zipf, identificativi delle istantanee
delle fonti e `semantic_approval = false`.

Questi metadati descrivono la costruzione del file; non sono un verbale di
approvazione dell'intero contenuto. La presenza di revisioni positive in una
tabella separata non cambia questa distinzione.

## 9. Cosa non viene verificato dai filtri

Il comando di preselezione non verifica automaticamente:

- che il primo senso del dizionario sia quello quotidiano più riconoscibile;
- che una parola astratta offra un nucleo di associazioni sufficientemente
  specifico;
- che la categoria scelta da un revisore sia sensata;
- che esistano sette risposte naturali, autonome e diverse;
- la correttezza di ogni coppia prompt–risposta;
- l'assenza di ridondanza semantica nell'intero set;
- la comprensibilità e la difficoltà effettiva per giocatori reali.

Le regole sulle associazioni sono stabilite dalle
[direttive operative](direttive_word_association_it_v3_6_0.md) e dalla
[direttiva di pertinenza](DIRETTIVA_INDIZI.md). Nella fase dei bacini occorre
verificare ciascuna risposta prima dell'importazione, mantenendo lo stesso
senso del prompt e controllando anche il set complessivo.

Esempi dei problemi da prevenire in quella fase:

| Caso | Verifica necessaria |
|---|---|
| `PONGO` con `orango` e `animale`, nel senso della pasta da modellare | Non mescolare significati diversi dello stesso lemma |
| `SKATEBOARD` con `manubrio`, estratto da una descrizione che lo nega | Conservare negazione e ruolo dell'espressione sorgente |
| `RUGBY` con `secolo` | Non trasformare un inciso storico in un'associazione caratteristica |
| `AGONISTICO` con `inerente` | Non usare parole di servizio della definizione come risposte |
| `competizione` e `competitivo` nello stesso set | Valutare ridondanza di famiglia e significato, oltre ai duplicati testuali |

Quando una risposta non va bene, si cerca un'alternativa coerente sullo stesso
prompt. Non si elimina automaticamente il prompt né si crea una blacklist
globale della risposta. La stessa parola può essere valida per altri prompt,
con una motivazione e una revisione proprie per ciascuna coppia.

Le difficoltà delle risposte possono essere diverse: la familiarità richiesta
al prompt non impone che tutte le associazioni abbiano identica difficoltà.
L'estrazione Livecade sceglie sette risposte dal bacino già verificato; non deve
usare la lista dei filtrati come se fosse un bacino approvato.

## 10. Giocabilità simulata: controllo facoltativo

`filter_prompts.py score-playability` può interrogare un LLM locale attraverso
`free_association_llm.propose()`.

Più giocatori simulati ricevono il prompt e propongono associazioni. Il campo
`playability` registra il numero delle proposte condivise da almeno metà dei
giocatori simulati, entro il limite restituito dalla funzione di proposta.
Il valore non è una percentuale, non è un voto umano e non è la quantità di
risposte già approvate.

Questo controllo è facoltativo e diagnostico. Non registra da solo una
revisione positiva e non inserisce le proposte fra le associazioni verificate.
La ricostruzione dei filtrati azzera il valore a `NULL`, perché crea una nuova
copia; per conservarne lo storico serve un rapporto separato.

La normale costruzione dei filtrati non richiede Qwen né GPU. Un LLM può essere
usato per la revisione o per queste simulazioni; non deve essere rieseguito a
ogni estrazione casuale da bacini già verificati.

## 11. Comandi e controlli operativi

Dalla cartella `gioco-zeroassociations`, in PowerShell:

```powershell
# Legge i conteggi e i metadati del file esistente.
.venv/Scripts/python.exe -B filter_prompts.py status

# Elenca 50 candidati ancora da esaminare, tenendo conto anche della raccolta.
.venv/Scripts/python.exe -B review_prompts.py pending --limit 50

# Ricostruisce i filtrati dalla raccolta e aggiorna anche la copia degli scarti.
.venv/Scripts/python.exe -B filter_prompts.py build
```

Il task VS Code **«Prompt: filtra i candidati (schema filtrati)»**
esegue la ricostruzione. Non produce una revisione semantica LLM.

Il task **«Prompt: aggiorna filtrati e validi dopo nuove parole (refresh)»** ha
un comportamento diverso: ricostruisce i filtrati e, se trova un server LLM
locale attivo, può far revisionare e importare le sole nuove candidate, entro
il limite del comando. Non significa «completa tutti i lotti in attesa».

Per consultare il database da un client SQLite:

```sql
-- Verificare quali tabelle e viste esistono davvero nel file aperto.
SELECT type, name
FROM sqlite_schema
WHERE type IN ('table', 'view')
ORDER BY type, name;

-- Metadati della copia e conteggi dei passaggi automatici.
SELECT key, value FROM metadata ORDER BY key;
SELECT step, description, remaining FROM filter_steps ORDER BY step;

-- Motivi di esclusione dopo la soglia preliminare di familiarità.
SELECT reason, COUNT(*) AS voci
FROM filter_rejections GROUP BY reason ORDER BY voci DESC;

-- Candidati, prima delle eventuali correzioni editoriali.
SELECT prompt, pos, gloss, zipf, nvdb, flags
FROM review_order LIMIT 50;
```

Le query seguenti richiedono lo schema aggiornato con le tabelle di revisione:

```sql
SELECT state, COUNT(*) AS voci
FROM review_state GROUP BY state;

SELECT prompt, pos, sense_description, category_id, category_name,
       reviewer, method, passes_automatic_filters
FROM validated_prompts ORDER BY prompt;

SELECT prompt, sense_description, category_name
FROM validated_prompts WHERE passes_automatic_filters = 0;
```

La ricostruzione crea un file temporaneo, applica lo schema e i suoi vincoli,
inserisce i dati, esegue `PRAGMA integrity_check` e pubblica la nuova copia.
La pubblicazione usa la sostituzione del file oppure, quando necessario per
un lettore aperto su Windows, il meccanismo di backup SQLite previsto dal
runtime. Il controllo di integrità non certifica la qualità semantica.

L'archivio degli scarti controlla inoltre che la raccolta e la fotografia dei
filtri siano compatibili: non deve classificare come scarti le nuove voci
semplicemente assenti da una vecchia preselezione.

Le revisioni importate dopo l'ultima ricostruzione non rendono aggiornata per
magia la copia dei filtrati: vanno letti i verbali nella raccolta oppure va
rigenerato il file. Non confondere il conteggio della tabella con quello dei
candidati effettivamente ancora in attesa.

## 12. Stato del file osservato durante questa documentazione

L'ispezione è stata eseguita in sola lettura. **Per scrivere questo documento
non è stato ricostruito né modificato alcun database.**

Il file `prompt_filtrati.sqlite3` (oggi lo schema `filtrati`) presente al momento del controllo dichiara:

| Dato | Valore osservato |
|---|---|
| Costruzione | `2026-11-09T12:20:38+00:00` |
| Versione filtri registrata | `prompt-filters-2026-11-09.3` |
| Voci nell'inventario di partenza | 2.740.419 |
| Parole singole con prova di lemma | 160.319 |
| Forme canoniche | 153.859 |
| Voci sopra soglia preliminare o nel NVdB | 20.439 |
| Righe in `filtered_prompts` | 14.228 |
| Righe in `filter_rejections` | 6.211 |

**In questa copia fisica non esistono ancora `validated_prompts` e
`review_state`.** Il codice corrente di `filter_prompts.py` le crea alla
successiva ricostruzione. La versione dichiarata nei metadati è rimasta la
stessa: per distinguere gli schemi bisogna controllare anche `sqlite_schema`,
non soltanto il numero di versione.

Questi numeri descrivono una fotografia precedente alle revisioni successive.
Le 14.228 righe non sono 14.228 prompt pronti per Livecade e neppure 14.228 voci
necessariamente ancora da esaminare. Per la coda aggiornata si usa
`review_prompts.py pending`, che consulta anche l'archivio principale.

## 13. Riferimenti di implementazione

| Argomento | Codice di riferimento |
|---|---|
| Schema, filtri, copia dei validati e diagnostica | [filter_prompts.py](filter_prompts.py) |
| Soglia e lista dei prestiti | [resources/prompt_policy.json](resources/prompt_policy.json) |
| Strumenti di politica linguistica e familiarità | [prompt_policy.py](prompt_policy.py) |
| Coda da revisionare e importazione delle decisioni | [review_prompts.py](review_prompts.py) |
| Contratto dei verbali e sincronizzazione dei prompt con bacino | [validated_prompt_database.py](validated_prompt_database.py) |
| Registro dei verbali nella raccolta | [prompt_validation_schema.sql](prompt_validation_schema.sql) |
| Raccolta e attestazioni delle fonti | [prompt_inventory_schema.sql](prompt_inventory_schema.sql) |
| Copia degli scarti e gestione dei rinvii | [discarded_prompt_database.py](discarded_prompt_database.py) |
| Simulazioni di associazione | [free_association_llm.py](free_association_llm.py) |
| Categorie, bacini e campionamento | [prompt_database.py](prompt_database.py) |

In caso di successive modifiche al codice, alla politica o alle direttive,
aggiornare questo documento e ricostruire le copie necessarie. Un nuovo filtro
automatico non equivale a una nuova revisione semantica delle voci esistenti.

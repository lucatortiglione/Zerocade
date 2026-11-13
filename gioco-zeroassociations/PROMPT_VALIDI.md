# Lo schema `validi`: cosa contiene e quando una voce può entrarvi

Documento aggiornato il **9 novembre 2026**, sulla base dell'implementazione
locale di [validated_prompt_database.py](validated_prompt_database.py),
[prompt_database.py](prompt_database.py) e [prompt_schema.sql](prompt_schema.sql).

## 1. Regola di ingresso

Nel codice attuale, nello schema `validi` del DB di lavoro (`database/parole_ita_raw.sqlite3`) devono entrare **i prompt che
hanno sia una revisione positiva corrente del prompt, sia un bacino di parole
associate già revisionato e coerente con quella revisione**.

Non basta che una parola sia italiana, frequente, presente nel dizionario o
ammessa dai filtri automatici. Non basta nemmeno aver approvato il solo prompt:
serve anche il bacino corrispondente.

La verifica semantica del prompt e delle associazioni deve avvenire **prima
dell'importazione** nella banca verificata. La sincronizzazione copia materiale
già revisionato e controlla il suo contratto; non esegue una nuova revisione
semantica e non genera risposte mancanti.

| Situazione della voce | Entra nella copia valida? | Dove resta altrimenti |
|---|---|---|
| Raccolta da una fonte, senza controlli | No | Inventario della raccolta (schema `raw`) |
| Supera i filtri automatici, ma manca una revisione positiva | No | Preselezione dello schema `filtrati` |
| Prompt approvato, ma senza bacino verificato | No | Registro delle revisioni nella raccolta e, dopo la ricostruzione, tabella `validated_prompts` dei filtrati |
| Prompt approvato e bacino verificato dello stesso senso, categoria, POS e lingua | Sì | Copiato nei validi con associazioni, vincoli e prove |
| Prompt approvato ma bacino di un altro significato | No | Materiale da riallineare e revisionare nella raccolta |
| Decisione corrente `DISCARDED` o `DEFERRED` | No | Decisione e storico nella raccolta; soltanto lo scarto definitivo va nell'archivio degli scarti |

**Prompt validato, bacino verificato, set estraibile e release approvata sono
quattro condizioni diverse.** Il database non le rende equivalenti.

## 2. Perché è separato dagli altri database

| Schema | Funzione |
|---|---|
| `raw` | Archivio principale con inventario, attestazioni, fonti, aggiornamenti, revisioni, decisioni e bacini |
| `filtrati` | Candidati preselezionati e catalogo delle revisioni positive, anche dei prompt ancora senza risposte |
| `validi` | Copia controllata dei prompt revisionati che dispongono anche del bacino verificato corrispondente |
| `scartati` | Esclusioni automatiche e scarti editoriali espliciti, con motivazioni |
| `game` | I bacini verificati del gioco, come viste sulla raccolta |

Lo schema `validi` è una **copia ricostruibile**, non il luogo in cui
accumulare bozze o modificare manualmente l'approvazione delle parole.
Le revisioni e i dati originali si conservano nella raccolta principale.

Se un prompt validato non ha ancora associazioni, non viene scartato e non si
perde: resta disponibile per il lavoro successivo sui bacini. Il conteggio dei
prompt validati può quindi essere molto superiore a quello dei prompt presenti
nello schema `validi`.

Dettagli sulla fase precedente in [PROMPT_FILTRATI.md](PROMPT_FILTRATI.md).

## 3. Cosa deve essere verificato sul prompt

Prima di considerare le risposte, il revisore deve fissare:

1. **Forma canonica e POS.** La parola deve essere un lemma appropriato al senso
   scelto, con grafia e accenti corretti; POS `NOUN`, `VERB` o `ADJ`.
2. **Lingua.** Italiano oppure prestito comune ammesso dalla lista chiusa
   `common_loanwords` in [prompt_policy.json](resources/prompt_policy.json).
   La lista riguarda i prestiti stranieri, non tutte le parole italiane.
3. **Un solo senso familiare.** Scegliere esplicitamente l'accezione quotidiana
   riconoscibile e confrontarla con eventuali significati concorrenti.
4. **Familiarità del significato.** Frequenza, NVdB e dati di acquisizione sono
   indizi; non rendono automaticamente familiare un uso tecnico raro.
5. **Categoria tematica coerente.** Usare una categoria esistente nel catalogo,
   motivandone il rapporto con il significato scelto.

Non scegliere un'accezione specialistica solo perché consente di trovare più
risposte. Una categoria memorizzata internamente non disambigua il prompt per
un giocatore che non vede quell'informazione.

Il catalogo delle categorie viene caricato da `load_categories()`, usando la
tassonomia di base e [le estensioni](resources/prompt_category_extensions.json).
Ogni voce copiata deve conservare l'identificativo della categoria; il nome e
il cluster si ricavano dal catalogo, senza inventare etichette sostitutive.

### Limiti del controllo formale

Il contratto dei verbali accetta forme composte dalle lettere italiane previste
da `WORD`, senza spazi o simboli. Il limite di 2–15 caratteri della preselezione
automatica appartiene a `filter_prompts.py`: non è un ulteriore limite applicato
da `validate_pool()` o `validate_record()` con la stessa espressione regolare.

Il campo `prompt_language` va dichiarato correttamente dal revisore. Il codice
controlla la lista dei prestiti quando la lingua dichiarata è
`common_loanword`; non riconosce semanticamente un forestierismo erroneamente
dichiarato come `it`.

## 4. Cosa deve essere verificato su ogni parola associata

Il bacino deve contenere solo associazioni accettate individualmente. La fonte
documenta una relazione; la sola presenza di una parola nella definizione non
la trasforma in risposta valida.

I controlli registrati per ciascuna associazione sono:

| Campo di controllo | Valutazione editoriale richiesta |
|---|---|
| `same_sense` | La risposta riguarda il significato selezionato del prompt |
| `standalone` | La parola funziona da sola, senza ricostruire una locuzione o una frase della fonte |
| `natural` | Il legame è naturale e comprensibile nel gioco |
| `not_incidental` | Non deriva soltanto da date, esempi, incisi, dettagli marginali o parole di servizio |
| `source_polarity` | Negazioni, assenze, confronti e ruoli nella frase non sono stati capovolti |
| `lemma_meaning_preserved` | La normalizzazione e la lemmatizzazione non hanno cambiato significato o categoria della parola |

Il revisore deve documentare il senso della risposta e spiegare concretamente
il legame. Una motivazione come «compare nella definizione» non basta.
Non basta neppure aggiungere una formula generica e impostare tutti i controlli
a `true`.

### Esempi di errori da intercettare

Gli esempi seguenti illustrano controlli editoriali; non costituiscono nuovi
bacini importati o automaticamente approvati.

| Caso | Problema da risolvere |
|---|---|
| `PONGO → orango, animale`, con prompt inteso come pasta da modellare | Relazioni appartenenti a un'altra accezione |
| `SKATEBOARD → manubrio`, ricavato da «senza manubrio» | Perdita della negazione |
| `RUGBY → secolo` da una nota sulle origini | Dettaglio storico incidentale |
| `AGONISTICO → inerente` | Parola di servizio della definizione |
| `MORTE → permettere, successivo, sostituire` | Frammenti sintattici senza un'associazione autonoma e caratteristica |
| `COAGULAZIONE → ferito`, ottenuto dal nome `ferita` | Lemmatizzazione che cambia categoria e significato |
| `ESPERTO → digiuno` | Relazione da verificare nel suo contesto, senza trasferire automaticamente usi figurati o locuzioni |

Una parola inadeguata va sostituita con un'alternativa pertinente sullo stesso
prompt. Non bisogna eliminare automaticamente tutto il prompt né creare un
divieto universale della risposta.

Le regole complete sono nelle
[direttive operative](direttive_word_association_it_v3_6_0.md) e nella
[direttiva di pertinenza e recuperabilità](DIRETTIVA_INDIZI.md).

## 5. Composizione del bacino: più di una lista fissa di sette parole

Il bacino deve raccogliere le associazioni che sono state effettivamente
trovate e verificate, anche se sono più di sette o otto. Il database non deve
limitarsi a salvare l'ultima estrazione.

Non esiste una garanzia di aver individuato «tutte le parole possibili»: fonti
aggiuntive, nuove proposte e dati di gioco possono suggerire ampliamenti.
Ogni nuova associazione richiede la propria verifica prima dell'inserimento.

Sono ammesse risposte di qualsiasi difficoltà: `easy`, `medium`, `hard` oppure
`unrated`. Un termine difficile può essere valido se il legame è diretto e
coerente; la difficoltà non giustifica una relazione debole.

Non sono obbligatori verbi, aggettivi o proporzioni grammaticali prestabilite.
Se non si trovano verbi naturali, il bacino può contenerne zero.

### Riuso fra prompt

La stessa parola può appartenere a più bacini. Per esempio, `forno` può essere
valutato separatamente per `PANE` e per `PIZZA`.

La verifica riguarda **ogni coppia prompt–risposta**, con il suo significato,
la sua relazione e la sua motivazione. L'approvazione per un prompt non approva
automaticamente l'altra coppia, ma neppure la vieta.

L'unicità è imposta all'interno della stessa accezione attraverso la chiave
`(sense_id, word)`. Non esiste un vincolo globale che impedisca di riusare una
risposta in altri prompt o nella stessa lista Livecade su righe diverse.

### Diversità e compatibilità

Nel bacino si registrano gruppi di significato e incompatibilità, in modo che
il campionamento non accumuli varianti ridondanti.

- `meaning_group` descrive l'appartenenza a un gruppo semantico.
- `group_limits` stabilisce quante risposte dello stesso gruppo possono
  comparire nella singola estrazione: il contratto ammette limiti di 1 o 2.
- `conflicts` registra coppie che non devono comparire insieme nello stesso set,
  con una motivazione.

La famiglia grafica non esaurisce la ridondanza semantica. `Competizione` e
`competitivo` richiedono una valutazione di significato e funzione; assegnare
etichette diverse senza una ragione non risolve il problema.
Non basta che sette parole siano testualmente diverse.

I controlli complessivi del verbale del bacino sono:
`single_familiar_sense`, `prompt_language`, `standalone_associations`,
`no_generic_fillers`, `no_forced_pos`, `source_polarity`,
`constraints_reviewed`.

## 6. Bacino verificato e set estraibile non sono la stessa cosa

Il contratto `verified-pool-1` richiede un bacino **non vuoto**, ma non impone
un minimo di sette associazioni. Un bacino con meno di sette risposte può
quindi essere conservato nei validi quando prompt e bacino soddisfano tutti gli
altri requisiti. Rimane insufficiente per la generazione di un set Livecade.

| Stato del materiale | Conservabile nei validi? | Estraibile per Livecade? |
|---|---|---|
| Prompt approvato, zero risposte verificate | No | No |
| Prompt approvato e bacino verificato con 1–6 risposte | Sì | No |
| Almeno 7 risposte, ma vincoli incompatibili con un set di 7 | Sì, se il bacino è conforme | No, finché non viene ampliato o revisionato |
| Esiste un sottoinsieme compatibile di 7 risposte | Sì | Sì, come estrazione candidata |
| Si vuole un set di 8 ma ne sono compatibili soltanto 7 | Sì | Non per una richiesta di 8; Livecade richiede 7 |

Il solo `association_count` non dimostra l'estraibilità: bisogna applicare
limiti dei gruppi, conflitti ed eventuale filtro di difficoltà.

Il campionamento usa un ordine mescolato dal seed e cerca una combinazione
compatibile. Non garantisce una distribuzione uniforme fra tutte le
combinazioni possibili. Il medesimo seed e il medesimo bacino permettono di
riprodurre il risultato.

Se il motore raggiunge il limite tecnico della ricerca, segnala un risultato
inconclusivo: non equivale alla prova che nessuna combinazione esista.

## 7. Struttura del database e dati da conservare

Le tabelle sono di tipo `STRICT`, con chiavi, vincoli e riferimenti definiti
dallo schema. Qui sono descritti i dati da conservare, non istruzioni per
inserimenti SQL manuali che aggirino i verbali.

### 7.1 `validated_prompts`: approvazione corrente del prompt

Una riga per prompt copiato nei validi.

| Campo | Contenuto |
|---|---|
| `prompt` | Lemma canonico, chiave primaria |
| `language` | `it` oppure `common_loanword` |
| `sense_description` | Descrizione dell'accezione selezionata |
| `pos` | `NOUN`, `VERB` oppure `ADJ` |
| `category_id` | Identificativo obbligatorio di una categoria del catalogo |
| `validation_id` | Hash identificativo del verbale corrente del prompt nella raccolta |
| `policy_version` | Versione semantica a cui risponde la revisione |
| `source_db` | Percorso dell'archivio da cui è stata ottenuta la copia |
| `record_json` | Verbale completo del prompt, con motivazioni, controlli ed evidenze |

`validation_id` rimanda logicamente al registro della raccolta; non implica
che tale registro completo sia copiato in questa banca. Il JSON del verbale
resta disponibile anche nella copia.

### 7.2 `prompts`: contesto usato dai bacini

| Campo | Contenuto |
|---|---|
| `lemma` | Parola mostrata nel gioco, chiave primaria |
| `language` | Lingua del prompt |
| `familiar_sense` | Accezione familiare selezionata per il gioco |
| `review_id` | Riferimento al verbale del bacino |
| `category_id` | Categoria tematica |

Il verbale del solo prompt e quello del bacino possono essere documenti
diversi. Non bisogna presumere che `validation_id` e `review_id` coincidano.

### 7.3 `senses`: accezione cui appartengono le risposte

| Campo | Contenuto |
|---|---|
| `id` | Identificativo deterministico dell'accezione |
| `prompt` | Riferimento a `prompts.lemma` |
| `description` | Descrizione del senso |
| `pos` | Categoria grammaticale del prompt in quel senso |
| `category_id` | Categoria tematica del senso |
| `review_id` | Verbale completo di riferimento |

La sincronizzazione seleziona il bacino dell'accezione familiare corrente,
non tutti i significati presenti in un dizionario o nella raccolta.

### 7.4 `associations`: singole coppie verificate

| Campo | Contenuto |
|---|---|
| `sense_id` | Accezione del prompt a cui appartiene la risposta |
| `word` | Risposta in forma canonica minuscola |
| `relation` | Relazione concreta con il prompt |
| `rationale` | Motivazione individuale del legame, almeno 20 caratteri nel contratto |
| `answer_sense` | Significato della risposta usato nell'associazione |
| `meaning_group` | Gruppo semantico usato per controllare la selezione |
| `difficulty` | `easy`, `medium`, `hard` oppure `unrated` |
| `difficulty_basis` | Base della valutazione di difficoltà |
| `review_id` | Verbale che ha approvato la coppia nel bacino |

La risposta non può essere uguale al prompt. Non sono ammessi duplicati nella
stessa accezione. I controlli individuali e la decisione `accepted` sono
conservati nel JSON del verbale; non sono colonne separate della tabella.

`difficulty_basis` deve distinguere una stima editoriale da risultati misurati.
Non presentare come dati di gioco una valutazione fatta dal modello.

### 7.5 Tabelle di supporto

| Tabella | Dati conservati |
|---|---|
| `categories` | ID e nome di categoria, ID e nome del cluster; include il catalogo caricato, anche categorie non ancora usate |
| `reviews` | Revisore, metodo, data, hash delle direttive e del contenuto, decisione, indicatori di revisione umana/QA e JSON completo del bacino |
| `sources` | Identificativo, URL, licenza, attribuzione e SHA-256 dell'istantanea della fonte |
| `evidence` | Collegamento tra revisione e fonte, URL del materiale pertinente, ambito e nota |
| `group_limits` | Limite di selezione per ogni gruppo semantico di ciascuna accezione |
| `conflicts` | Due risposte incompatibili nella stessa estrazione e motivo del conflitto |
| `metadata` | Ruolo della banca, sorgente, data della copia, versione SQLite richiesta e versione semantica |

La tabella `evidence` collega le prove al verbale: non effettua da sola un
controllo della pertinenza di ogni parola. Le motivazioni individuali devono
rendere verificabile ciascuna coppia; gli URL o la licenza di un dizionario non
approvano automaticamente tutto il contenuto estratto da quel dizionario.

### 7.6 Viste di consultazione

| Vista | Contenuto |
|---|---|
| `validated_catalog` | Prompt validati, senso, POS, lingua, categoria, versione e numero di associazioni del senso corrispondente |
| `prompt_catalog` | Contesti del gioco con categoria, cluster, senso familiare e conteggio delle associazioni |
| `pool_sizes` | Dimensione dei bacini non vuoti per accezione |

## 8. Verbali e verifiche tecniche prima della copia

### Revisione del prompt

Sono accettati verbali `verified-prompt-1` oppure verbali completi
`verified-pool-1` che soddisfano il relativo contratto. Per i verbali del solo
prompt, il programma verifica almeno:

- forma, POS, descrizione del senso di almeno 15 caratteri, categoria e lingua;
- decisione positiva, revisore identificato e metodo ammesso;
- data nel formato previsto e coerenza tra metodo e `human_review`;
- hash delle direttive e versione semantica corrente;
- cinque controlli del prompt dichiarati eseguiti;
- motivazioni di prompt, categoria e familiarità di almeno 25 caratteri;
- evidenze con riferimenti, licenze, attribuzioni e hash dell'istantanea;
- hash del contenuto corretto.

La registrazione controlla inoltre che la voce sia già presente nella raccolta
o nei prompt archiviati. I vecchi verbali restano nello storico; reimportare un
verbale già noto non deve ripristinarlo come corrente al posto di uno nuovo.

### Revisione del bacino

`validate_pool()` verifica, oltre ai dati del prompt:

1. schema `verified-pool-1`, verbale, versione delle direttive e provenienza;
2. bacino non vuoto, parole canoniche, assenza di duplicati e del prompt fra
   le risposte;
3. decisione `accepted` e sei controlli individuali per ogni risposta;
4. motivazioni abbastanza lunghe, distinte fra loro e non ridotte alla formula
   «compare nella fonte» riconosciuta dal controllo;
5. senso della risposta, relazione, gruppo, difficoltà e relativa base;
6. limite esplicito di 1 o 2 per ogni gruppo effettivamente presente;
7. conflitti strutturati fra due risposte esistenti, con motivo di almeno
   15 caratteri;
8. hash del bacino corretto.

Quando un verbale completo viene usato anche come revisione del prompt,
`validate_record()` richiede inoltre la motivazione della categoria di almeno
20 caratteri.

**Questi controlli verificano il contratto di una revisione già fatta. Non
sono un secondo revisore semantico.** Una frase sbagliata può avere una lunghezza
valida e un hash corretto. Il codice non dimostra automaticamente che un senso
sia familiare, che una categoria sia pertinente o che una risposta sia naturale.

## 9. Come funziona `sync_validated`

La sincronizzazione segue questi passaggi:

1. **Controlla sorgente e destinazione.** I file devono essere distinti e deve
   esistere il registro delle revisioni. Una destinazione esistente deve
   dichiarare il ruolo gestito `validated-prompts-1`.
2. **Legge i verbali correnti e le decisioni.** Usa i riferimenti
   `prompt_validation_heads`, senza approvare automaticamente altre voci.
3. **Esclude decisioni bloccanti e verbali non conformi.** `DISCARDED` e
   `DEFERRED` impediscono la copia. Verifica anche che parola e hash coincidano
   con il registro.
4. **Cerca i bacini attivi.** Considera quelli collegati al senso familiare
   corrente nella raccolta e controlla il loro verbale.
5. **Confronta prompt e bacino.** Devono coincidere esattamente
   `sense_description`, `category_id`, `pos` e `prompt_language`.
6. **Separa i prompt ancora senza bacino.** Li conta nel rapporto, ma non li
   copia nei validi. La sincronizzazione non genera le associazioni e non
   ricostruisce da sola il database dei filtrati.
7. **Crea una nuova copia temporanea.** Carica schema e categorie, poi importa
   bacini conformi e righe `validated_prompts` corrispondenti.
8. **Verifica l'integrità.** Esegue `PRAGMA foreign_key_check` e
   `PRAGMA integrity_check` prima della pubblicazione.
9. **Pubblica la copia.** Usa sostituzione del file; quando un lettore aperto
   su Windows impedisce la sostituzione, il runtime prevede una pubblicazione
   tramite il backup SQLite. Un errore va segnalato, non trasformato in una
   promozione del materiale.

La sincronizzazione non richiede Qwen o GPU e dichiara
`new_semantic_reviews_performed = 0` e `raw_entries_deleted = 0`.
La pubblicazione controllata della copia non significa che tutte le fasi di
un comando di importazione e delle sue copie derivate costituiscano un'unica
transazione tra database diversi.

### Interpretazione del rapporto

| Campo | Significato |
|---|---|
| `valid_prompts` | Prompt effettivamente copiati, quindi con bacino corrispondente |
| `verified_pools` | Bacini verificati copiati |
| `associations` | Totale delle associazioni dei bacini copiati |
| `validated_without_pool_in_filtered_db` | Numero di prompt con verbale positivo ma senza bacino corrispondente; il nome del campo non prova che il file dei filtrati sia già aggiornato |
| `excluded` | Verbali correnti esclusi per decisioni bloccanti o problemi di conformità |
| `publish_method` | Metodo con cui la copia è stata pubblicata |

Un prompt senza bacino corrispondente non è automaticamente uno scarto
editoriale. Anche un bacino obsoleto o disallineato può essere omesso senza
trasformare il prompt in una voce semanticamente errata.

## 10. Aggiornamenti, correzioni e nuove associazioni

Gli aggiornamenti si effettuano nella raccolta principale attraverso verbali
già revisionati. Non aggiungere direttamente una riga ad `associations` nella
copia valida: si perderebbero tracciabilità e riproducibilità e la modifica
potrebbe sparire alla sincronizzazione successiva.

Per ampliare o correggere un bacino:

1. mantenere esplicito il senso del prompt;
2. verificare le nuove coppie e le sostituzioni;
3. ricontrollare il bacino complessivo, i gruppi e i conflitti;
4. produrre un **nuovo verbale completo del bacino**, con nuovo hash;
5. importarlo nella raccolta e rigenerare le copie necessarie.

L'importazione aggiorna le associazioni attive dell'accezione con il nuovo
bacino completo. Non tratta il pacchetto come un elenco di sole aggiunte.
I precedenti verbali rimangono nell'audit della raccolta.

Se cambia il senso, la categoria, il POS o la lingua del prompt, il bacino
precedente non viene trasferito automaticamente alla nuova revisione. Devono
essere riallineati e ricontrollati entrambi i materiali.

Una decisione `DISCARDED` o `DEFERRED` blocca la copia finché resta corrente,
anche in presenza di un vecchio verbale positivo. Una scelta `INTEGRATED`
non crea una nuova approvazione semantica.

Un cambiamento della politica semantica può rendere i verbali non più conformi.
Un semplice ritocco del testo delle direttive, senza variazione delle regole,
si gestisce attraverso il registro degli hash previsto dal progetto: non si
deve fingere una nuova revisione mai effettuata.

## 11. Utilizzo nel gioco e nelle liste Livecade

Il server può leggere lo schema `validi` in sola lettura. Nell'ordine delle
sorgenti di default vengono prima un eventuale percorso configurato tramite
`ZEROCADE_ASSOCIATIONS_DB` e la copia nello schema `associazioni` di
`database/giochi.sqlite3`; seguono gli schemi `validi`, `game` e infine `raw`. Usa la prima sorgente che fornisce bacini
caricabili, non necessariamente il file modificato più di recente.

Il caricamento del gioco considera il senso familiare, le associazioni, i
gruppi e i conflitti. I bacini malformati o che non consentono sette risposte
vengono esclusi con una segnalazione. Il caricamento non effettua una nuova
revisione semantica né rende automaticamente aggiornate le copie precedenti.
I dati sono caricati all'avvio: dopo una modifica occorre ricaricare il server
secondo il normale flusso del progetto.

Per Livecade si estraggono prompt distinti e **sette risposte casuali per
prompt**, rispettando i vincoli. Non si chiama un LLM a ogni estrazione.
Se non ci sono abbastanza prompt estraibili, il generatore segnala il problema
senza duplicarli per raggiungere il numero richiesto.

Il CSV conserva le cinque colonne:

```text
ref,source,language,prompt,words
```

Le risposte della singola riga sono separate da `|`. Categoria, senso, hash,
vincoli e motivazioni restano nel database e nei rapporti, non diventano nuove
colonne del CSV. Il nome dell'export ha un suffisso progressivo a partire da
`0001`, senza sovrascrivere gli export precedenti.

### Validazione editoriale e approvazione della release

I bacini di questa banca hanno una revisione editoriale documentata. Questo
non equivale a dichiarare eseguiti test con persone o QA indipendente del set.
Nel contratto attuale `independent_gameplay_qa` è `false`: non si deve impostarlo
a `true` per simulare una certificazione, e il validatore non lo accetterebbe.

Le estrazioni restano candidate fino alle verifiche di rilascio previste dalle
direttive. L'export tecnico e l'estraibilità non sono approvazioni della release.
L'eventuale revisione umana, la simulazione LLM e la telemetria di giocatori
reali devono essere descritte separatamente e soltanto se effettivamente svolte.

## 12. Comandi operativi

Dalla cartella `gioco-zeroassociations`, in PowerShell.

### Consultazione dello stato esistente

```powershell
.venv/Scripts/python.exe -B validated_prompt_database.py status
```

Mostra i conteggi delle principali tabelle, la versione SQLite e i controlli
di integrità. Non ricostruisce la copia.

### Sincronizzazione dai verbali già presenti nella raccolta

```powershell
.venv/Scripts/python.exe -B validated_prompt_database.py sync
```

Questo comando scrive la copia valida. Non esegue la revisione dei candidati,
non genera associazioni, non ricostruisce i filtrati e non aggiorna da solo
lo schema `game`.

### Importazione di bacini già revisionati e sincronizzazione dei validi

```powershell
# Sostituire il percorso con un pacchetto completo realmente revisionato.
.venv/Scripts/python.exe -B validated_prompt_database.py import-pools percorso/bacini_revisionati.jsonl
```

`import-pools` richiede verbali completi `verified-pool-1`, importa i bacini
nella raccolta, registra le revisioni e sincronizza la copia valida.
`import-reviews` registra invece verbali già eseguiti, ma non importa da solo
le associazioni di un nuovo bacino nelle relative tabelle.

### Ricostruzione delle altre copie quando necessaria

```powershell
# Candidati e catalogo delle revisioni positive, compresi i prompt senza bacino.
.venv/Scripts/python.exe -B filter_prompts.py build

# Copia di distribuzione dei bacini destinata al gioco.
.venv/Scripts/python.exe -B prompt_database.py dump
```

Sono comandi distinti. Il comando diretto `prompt_database.py import-reviewed`
aggiorna la raccolta e la sua copia di gioco nel percorso standard, ma non
sostituisce automaticamente l'intero flusso di registrazione e sincronizzazione
di `validated_prompt_database.py`.

### Estrazione esplicita dal database valido

```powershell
.venv/Scripts/python.exe -B prompt_database.py --db ../database/parole_ita_raw.sqlite3#validi livecade --count 20 --seed esempio-1
```

Qui `--db` precede il sottocomando. È esplicito perché il comando generico
`prompt_database.py` usa altrimenti la raccolta come sorgente predefinita.
L'esempio genera un export candidato: non è stato eseguito per scrivere questo
documento.

## 13. Query di consultazione

Le query seguenti si eseguono sullo schema `validi`: aperto nel client SQLite il file
`database/parole_ita_raw.sqlite3`, le tabelle si chiamano `validi__<nome>`, oppure si esporta lo schema
come DB a sé (`unified_db.py export validi FILE`). Non richiedono modifiche ai dati.

```sql
-- Conteggi principali: righe di catalogo, contesti e associazioni.
SELECT 'validated_prompts' AS tabella, COUNT(*) AS righe FROM validated_prompts
UNION ALL SELECT 'prompts', COUNT(*) FROM prompts
UNION ALL SELECT 'associations', COUNT(*) FROM associations;

-- Catalogo dei prompt con senso, categoria e dimensione del bacino.
SELECT prompt, language, pos, sense_description, category_id,
       category_name, association_count
FROM validated_catalog ORDER BY prompt;

-- Risposte di un prompt: sostituire il lemma secondo necessità.
SELECT a.word, a.relation, a.rationale, a.answer_sense,
       a.meaning_group, a.difficulty, a.difficulty_basis
FROM associations a
JOIN senses s ON s.id = a.sense_id
WHERE s.prompt = 'pane'
ORDER BY a.word;

-- Bacini con meno di sette risposte: il conteggio è solo un primo controllo.
SELECT prompt, association_count
FROM validated_catalog WHERE association_count < 7;

-- Risposte riutilizzate per più prompt: situazione ammessa, da non deduplicare.
SELECT a.word, COUNT(DISTINCT s.prompt) AS prompt_distinti
FROM associations a JOIN senses s ON s.id = a.sense_id
GROUP BY a.word HAVING COUNT(DISTINCT s.prompt) > 1
ORDER BY prompt_distinti DESC, a.word;

-- Limiti semantici e incompatibilità di uno specifico prompt.
SELECT s.prompt, g.meaning_group, g.maximum
FROM group_limits g JOIN senses s ON s.id = g.sense_id
WHERE s.prompt = 'pane';

SELECT s.prompt, c.word_a, c.word_b, c.reason
FROM conflicts c JOIN senses s ON s.id = c.sense_id
WHERE s.prompt = 'pane';

-- Verifiche strutturali e metadati della copia.
PRAGMA foreign_key_check;
PRAGMA integrity_check;
SELECT key, value FROM metadata ORDER BY key;
```

La query «meno di sette» non rileva tutte le insufficienze: un bacino più ampio
può comunque non produrre sette risposte compatibili. La prova di campionamento
deve essere eseguita con i vincoli e gli eventuali filtri richiesti.

## 14. Fotografia del file controllato il 9 novembre 2026

Ispezione eseguita in sola lettura alle **15:21 UTC**. La copia dichiara
`copied_at = 2026-11-09T14:56:29.972468+00:00`.

| Dato | Valore osservato |
|---|---|
| Prompt in `validated_prompts` | 102 |
| Prompt nella tabella dei bacini `prompts` | 102 |
| Accezioni in `senses` | 102 |
| Associazioni complessive | 1.010 |
| Dimensione minima/massima dei bacini | 9 / 13 |
| Prompt validati senza associazioni corrispondenti nella copia | 0 |
| Categorie del catalogo caricato | 187 |
| Verbali dei bacini in `reviews` | 102 |
| Fonti in `sources` | 8 |
| Collegamenti in `evidence` | 208 |
| Limiti in `group_limits` | 981 |
| Coppie in `conflicts` | 0 |
| Difficoltà registrate | 100 `easy`, 881 `medium`, 29 `hard` |
| Revisioni umane dichiarate nei verbali dei bacini | 0 |
| QA indipendente di gioco dichiarato nei verbali dei bacini | 0 |
| `PRAGMA integrity_check` | `ok` |
| Errori da `PRAGMA foreign_key_check` | 0 |

La lettura dei verbali correnti nella raccolta e l'applicazione in memoria
degli stessi criteri del codice hanno individuato anche **3.858 prompt
revisionati positivamente ancora senza un bacino corrispondente verificato**.
Sono distinti dai 102 copiati nei validi: non vanno interpretati come scarti.
Il conteggio è una fotografia, destinata a cambiare durante il lavoro sui lotti.

La presenza di zero coppie in `conflicts` non dimostra che ogni possibile
combinazione sia semanticamente equivalente o già collaudata. Anche un controllo
di integrità superato non certifica il contenuto editoriale.

Questa documentazione non ha importato revisioni, modificato database,
generato liste o eseguito nuove verifiche semantiche dei bacini esistenti.

## 15. Riferimenti

- [PROMPT_FILTRATI.md](PROMPT_FILTRATI.md): preselezione e catalogo delle
  revisioni dei prompt, anche prima delle associazioni.
- [PROMPT_SCARTATI.md](PROMPT_SCARTATI.md): scarti automatici, decisioni e rinvii.
- [validated_prompt_database.py](validated_prompt_database.py): selezione dei
  verbali e sincronizzazione della copia valida.
- [prompt_database.py](prompt_database.py): contratto dei bacini, importazione,
  campionamento ed esportazione.
- [prompt_schema.sql](prompt_schema.sql): schema di bacini, risposte, vincoli e
  prove; la tabella aggiuntiva dei validati è definita nello script di copia.
- [prompt_validation_schema.sql](prompt_validation_schema.sql): registro delle
  revisioni correnti e storiche nella raccolta.
- [semantic_rules.py](semantic_rules.py): versione semantica e controlli
  editoriali del progetto.
- [direttive_word_association_it_v3_6_0.md](direttive_word_association_it_v3_6_0.md):
  direttiva operativa.
- [DIRETTIVA_INDIZI.md](DIRETTIVA_INDIZI.md): pertinenza, senso, recuperabilità e
  regressioni dagli esempi segnalati.
- [Caricamento nel server](../apps/server/src/word-association.ts): scelta della
  sorgente e selezione dei bacini utilizzabili all'avvio.

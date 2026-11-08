# Word Association IT — Direttive operative v3.6.0

**Data:** 8 novembre 2026  
**Stato:** specifica di progetto / non certificazione di 10.001 enigmi approvati  
**Revisione semantica:** 8 novembre 2026 — controllo obbligatorio di accezione e associazioni per singola risposta.  
**Rottura di compatibilità semantica rispetto alla v3.5.5.**

> **REGOLA FONDAMENTALE — DIREZIONE DEL GIOCO:** `prompt` è la **parola di contesto mostrata al giocatore**; `words` contiene **esattamente sette risposte nascoste che il giocatore deve indovinare**. NON si devono usare le sette risposte per indovinare il `prompt`. Questa regola prevale su tutte le istruzioni precedenti.

## Indice

1. Obiettivi e funzionamento del gioco
2. CSV pubblico e JSONL dei candidati
3. Qualità delle sette risposte e politiche 3+2+2
4. Valutazione della difficoltà e dei concorrenti
5. Lessico, POS, normalizzazione e polirematiche
6. Originalità, collisioni e integrità globale
7. Test indipendenti: da contesto a risposte
8. Rubrica QA e schema JSON
9. Sicurezza e gestione degli esiti
10. Workflow, riparazioni, resa e quote
11. Master Prompt v3.6.0
12. Validatore e test eseguibili
13. Tassonomia completa: 172 macrocategorie / 16 cluster
14. Migrazione dalla v3.5.5 e changelog

---

## 1. Obiettivi e funzionamento del gioco

### 1.1 Cosa vede il giocatore

- La schermata mostra subito **una parola di contesto**: per esempio `pizza`.
- La piattaforma custodisce **sette parole da scoprire**, per esempio `forno`, `mozzarella`, `pomodoro`, `impasto`, `lievito`, `basilico`, `margherita`.
- Il giocatore propone una parola; la piattaforma controlla se corrisponde a una delle risposte previste, secondo le effettive regole di accettazione del gioco.
- La schermata potrebbe mostrare lunghezza delle parole, lettere iniziali o altri suggerimenti: **non inventare questi aiuti**. Se esistono, vanno descritti nella specifica dell'interfaccia e riprodotti nel test di giocabilità.
- **Una parola perfettamente associata al contesto può NON essere tra le sette risposte.** È un problema progettuale di recuperabilità/pressione delle alternative, non necessariamente un errore semantico.

### 1.2 Esempio chiaro

| Campo | Valore | Visibilità |
|---|---|---|
| `prompt` | `pizza` | **Visibile** come contesto |
| `words[0]` | `forno` | Nascosta, da indovinare |
| `words[1]` | `mozzarella` | Nascosta, da indovinare |
| `words[2]` | `pomodoro` | Nascosta, da indovinare |
| `words[3]` | `impasto` | Nascosta, da indovinare |
| `words[4]` | `lievito` | Nascosta, da indovinare |
| `words[5]` | `basilico` | Nascosta, da indovinare |
| `words[6]` | `margherita` | Nascosta, da indovinare |

**Esempio illustrativo, non certificato dal test umano.** `pizza` non è la risposta finale: è già noto al giocatore.

### 1.3 Obiettivi

- Almeno **10.001 contesti distinti** approvati, non semplicemente generati.
- Pubblico adulto italiano di cultura media, buona familiarità con i termini.
- Piano orientativo dei contesti: 70% sostantivi, 20% verbi all'infinito, 10% aggettivi. **Non è una quota obbligatoria né un gate.** Se non si trovano verbi adatti, sostituirli con nomi o aggettivi validi; sono ammessi anche lotti senza verbi. Non forzare associazioni, usare parole deboli o ridurre i criteri di qualità per raggiungere il 20%. Registrare piano iniziale, distribuzione effettiva e motivazione dello scostamento; la mancanza di verbi non rende il lotto sotto-resa se il numero totale di contesti validi è raggiunto.
- Difficoltà orientativa dei SET: 70% media, 30% alta; classificare dopo test, non dal solo giudizio del generatore.
- 172 categorie operative in 16 cluster, con quota per categoria da calibrare sul pilota.
- Le sette risposte devono essere semanticamente corrette, non ridondanti, giocabili, possibilmente di difficoltà graduata e culturalmente comprensibili.

## 2. Formati e tracciabilità

### 2.1 CSV pubblico INVARIATO

**CSV principale:** la prima riga contiene esattamente cinque celle:
`ref,source,language,prompt,words`. Non scrivere la riga come un'unica cella
e non aggiungere colonne a questo file. Ogni riga di consegna deve avere
`ref` vuoto, `source=ChatGPT`, `language=it`, `prompt` MAIUSCOLO e le sette
`words` minuscole separate da `|`, come nel riferimento fornito dall'utente.
La consegna ripristina il formato a virgole in UTF-8 senza BOM: ciascun record
completo occupa una sola riga. La prima riga è `ref,source,language,prompt,words`.
La copia editoriale `_candidati_con_ordine_0001.csv`, con `ordine` consecutivo
da 1 a N, è facoltativa e viene creata soltanto con `--with-order`.
Ogni esecuzione aggiunge un progressivo al termine del nome, prima dell'estensione:
`word_association_it_5000_candidati_0001.csv`, poi `_0002.csv`, e così via.
La sequenza parte da 0001 nella cartella di output e prosegue dal numero massimo
esistente, senza sovrascrivere i lotti precedenti. La copia di importazione
`word_association_it_5000_gioco_0001.csv` mantiene le cinque colonne sottostanti;
JSONL e rapporto condividono il progressivo del lotto. Il validatore del formato
pubblico si applica alla copia di gioco. La colonna `ordine` riparte da 1 in ogni lotto.

```csv
ref,source,language,prompt,words
,ChatGPT,it,PIZZA,forno|mozzarella|pomodoro|impasto|lievito|basilico|margherita
```

- `ref`: vuoto nel CSV di consegna. Gli identificativi interni restano nei metadati e nella copia tecnica di gioco.
- `source=ChatGPT`, `language=it` nel CSV di consegna; la provenienza lessicale reale resta documentata nei metadati.
- `prompt`: contesto **visibile**; una parola italiana MAIUSCOLA nella consegna, minuscola nei metadati e nella copia tecnica.
- `words`: sette risposte **nascoste**, minuscole, singole, distinte, separate da `|`, nessuna uguale al contesto.
- UTF-8, NFC; risposte e forme interne `^[a-zàèéìòù]+$`, contesto di consegna nella corrispondente forma maiuscola; nessuno spazio, trattino, apostrofo, cifra o nome proprio nel dataset standard.
- `UNIQUE(prompt)` nel CSV finale; nell'archivio interno possono esistere versioni del **medesimo** contesto con genealogia documentata.
- Gli identificativi di categoria e i metadati QA NON sono aggiunti al CSV di gioco.

La copia `_gioco_NNNN.csv` mantiene gli ID, `source=platform` e il prompt
minuscolo richiesti dal validatore tecnico e dalla pipeline interna. Il formato
di consegna si applica al CSV principale e alla copia editoriale con ordine.

### 2.2 JSONL intermedio obbligatorio v3.6.0

Un oggetto per riga; le sette posizioni di `words`, `relations` e `word_difficulty_estimates` corrispondono fra loro. Il generatore non deve autocertificare che i sette vocaboli siano indovinabili.

```json
{"schema_version":"word-association-candidate-3.6.0","candidate_id":"cand-pizza-001","parent_candidate_id":null,"repair_attempt":0,"batch_id":"pilot-A1","category_id":"008","prompt":"pizza","words":["forno","mozzarella","pomodoro","impasto","lievito","basilico","margherita"],"pos":"NOUN","difficulty_estimate":"media","word_difficulty_estimates":["facile","facile","facile","media","media","alta","alta"],"relations":["strumento","ingrediente","ingrediente","materiale","processo","ingrediente","categoria"],"strategy":"balanced_322"}
```

`candidate_id`, `parent_candidate_id`, `repair_attempt` sono obbligatori. `repair_attempt` = `0` (padre nullo) oppure `1` (padre obbligatorio, distinto), al massimo una riparazione mirata. `word_pos` è una lista opzionale di sette POS dichiarati, **non una verifica esterna**. Una breve nota per risposta può essere aggiunta senza mostrare ragionamenti interni privati. `category_id` appartiene al catalogo `001`..`172`.

**Enum chiuso delle relazioni:** `funzione, causa, processo, ruolo, contrasto, metafora, proprietà, contesto, sensoriale, altro, parte, materiale, luogo, strumento, ingrediente, attività, categoria, sinonimia, effetto`. Le etichette servono a misurare il mix globale, **non a negare un set mono-dominio**. `altro` deve essere monitorato nel reporting.

### 2.3 Tracciabilità di release

Distinguere sempre `candidates.jsonl` (candidati), registri QA con evidenze e `approved.jsonl` (solo approvati con QA completo). Soltanto gli approvati possono diventare il CSV pubblicato. Un `--export-csv` tecnico **non** equivale al rilascio. Il contenuto valutato va vincolato al candidato/versione: se cambia una delle sette risposte, rifare la revisione pertinente.

---

## 3. Politica delle sette risposte e strategie

### 3.1 La direzione è `prompt → words`

Il generatore deve chiedersi, per **ogni** parola proposta: «Un giocatore che vede **solo questo prompt**, con gli aiuti UI effettivamente esposti, potrebbe arrivare a questa risposta con uno sforzo ragionevole?».

**Non chiedere** se le sette parole, prese insieme, identificano un unico prompt. Questo test è superato e invertiva il gioco.

Ogni risposta soddisfa tre condizioni distinte:

1. **Pertinenza:** il rapporto con il contesto è chiaro e spiegabile in poche parole.
2. **Recuperabilità:** appartiene ad associazioni sufficientemente naturali, date le informazioni effettivamente visibili.
3. **Valore nel set:** non duplica senza motivo una risposta esistente e non aumenta inutilmente la pressione di alternative indistinguibili.

Le associazioni non devono essere tutte ovvie, ma neppure dipendere da nozioni specialistiche ignote al pubblico.

**Regola vincolante:** la presenza di una parola nella definizione documenta
la sua provenienza, ma non la rende una risposta ammissibile. Nessun token
estratto entra direttamente in `words` senza selezione semantica. Anche un
set con sette parole grammaticalmente corrette può essere interamente da rifare.

### 3.2 `balanced_322` e `convergent_free`

- **`balanced_322` (consigliato):** tre risposte relativamente accessibili, due intermedie e due impegnative, come *ipotesi di progettazione*. Non equivale ai precedenti «tre indizi laterali, due funzionali, due risolutivi». La difficoltà viene calibrata tramite dati di gioco.
- **`convergent_free` (valido):** sette risposte associative scelte liberamente, anche tutte **contestuali, sensoriali, concrete o dello stesso dominio**, se risultano naturali, differenziate e sufficientemente recuperabili.

**Un set interamente contestuale-sensoriale è pienamente ammesso.** Non forzare metafore, contrasti, materiali, ruoli o altre etichette soltanto per raggiungere una quota artificiale. L'obiettivo di varietà relazionale del 25% è **globale**, sperimentale e non applicabile come vincolo di ogni riga.

L'ordine `words[0..6]` non è automaticamente un ordine di rivelazione dei sette indizi: sono **sette risposte**, non sette indizi per una soluzione unica. Solo se la UI mostra slot in sequenza o suggerimenti diversi per posizione l'ordine acquisisce un significato ludico, da validare separatamente.

### 3.3 Esempi di qualità (NON gold standard)

- `pizza → forno|mozzarella|pomodoro|impasto|lievito|basilico|margherita`: sette associazioni plausibili; stimare le alternative `salame`, `pizzeria`, `farina`, ecc., non negarle.
- `pizza → cibo|cosa|bello|grande|luogo|persona|mondo`: eccesso di tappabuchi e bassa giocabilità, da scartare/rivedere.
- `scacchi → re|torre|cavallo|pedone|regina|arrocco|scacchiera`: associazioni coerenti; `scacchi` è il **contesto visibile**, non la soluzione da ricostruire.
- `matto → affogato` (come unica scorciatoia verso *matto affogato*): revisione obbligatoria perché la risposta dipende da locuzione tecnica. Un'espressione diffusa come `ponte` festivo può essere utilizzata nel giusto contesto, dopo test con il pubblico.

### 3.4 Parentela morfologica e ripetizioni

`prompt` e risposte non devono essere identici. Parentela morfologica **non** significa automaticamente errore: `pizza → pizzaiolo` è un collegamento naturale, ma potrebbe essere troppo ovvio, specie se si ripete in molti set. Una doppia risposta `gioco`/`giocatore` richiede verifica della ridondanza, non un divieto universale. Rilevare affinità con lemmi, Snowball, inclusione; registrare **avviso**, non esclusione automatica.

### 3.5 Generazione delle associazioni e uso della fonte

Il generatore parte dall'accezione familiare del contesto e propone risposte
che un giocatore potrebbe associare a quel significato. Le definizioni servono
a verificare fatti, ruoli e relazioni e possono suggerire un bacino di proposte;
la selezione delle sette risposte richiede un passaggio semantico distinto.

Per ogni coppia `prompt → risposta` registrare nel materiale editoriale:

1. L'accezione del contesto e quella della risposta, con identificativi se disponibili.
2. Il tipo di relazione e una breve frase che ne spieghi il legame concreto.
3. Il passaggio sorgente pertinente oppure una motivazione editoriale verificabile.
4. Un giudizio separato sulla naturalezza dell'associazione e sulla recuperabilità
   dal contesto mostrato, senza leggere definizione o spiegazione del generatore.
5. L'esito `accettata`, `da_riscrivere` o `respinta`, con motivo e riferimento alla revisione.

La motivazione deve spiegare il rapporto, per esempio «nel rugby la meta è
una segnatura». «Compare nella definizione», «è un nome», «è frequente»,
«ha un IDF alto» o la sola etichetta `contesto`/`altro` non sono motivazioni
semantiche sufficienti. `clue_evidence.kind=definizione` e gli audit POS restano
prove di provenienza e analisi linguistica, mai approvazioni del legame.

### 3.6 Dettagli accidentali, riferimenti e parole di servizio

Respingere la proposta quando il collegamento dipende soltanto da una data,
un inciso storico o biografico, una località citata incidentalmente, un esempio,
una formula quantitativa o la costruzione grammaticale della frase sorgente.
Nomi, verbi e aggettivi di contenuto possono avere questo difetto: il filtro
non si esaurisce nell'esclusione di articoli e pronomi.

Verbi descrittivi come `comporre`, `cercare`, `entrare` e qualificatori come
`terrestre` vanno valutati per il rapporto col contesto; non passano perché
servono a formulare la definizione. Anche `lavoro`, `macchina`, `fronte` e
`retro` richiedono un legame naturale specifico, non la sola presenza nella fonte.
Non costruire una nuova blacklist di queste parole: una stessa parola può
essere pertinente in un altro contesto. Il giudizio riguarda la coppia e l'accezione.

### 3.7 Familiarità dell'accezione e correttezza della forma

La familiarità della parola non prova quella di tutte le sue accezioni.
Scegliere un senso riconoscibile dal pubblico con il solo contesto e gli aiuti
realmente mostrati. Non selezionare un senso raro o tecnico perché consente
di raccogliere sette parole. Se l'accezione specialistica è intenzionale,
documentarla e sottoporla a verifica indipendente; eventuali aiuti tematici
devono essere visibili ai giocatori e riprodotti nel test. In caso contrario,
rigenerare le risposte sullo stesso prompt usando un senso familiare. Una risposta
debole non giustifica l'esclusione del prompt. Se non si trovano ancora alternative
adeguate, conservare il prompt nella coda di revisione e documentare la difficoltà.

Tutte le risposte devono riferirsi alla stessa accezione. Non giustificare
una parola presa da un senso scientifico richiamando dopo un significato musicale
o figurato del contesto. Conservare accenti, forma canonica e significato:
`meta` e `metà` sono parole distinte. Una correzione semantica non si ottiene
eliminando automaticamente accenti o cambiando lemma per far coincidere le forme.

### 3.8 Casi di regressione semantica

I casi seguenti illustrano decisioni editoriali, non set già approvati.

| Coppia e accezione | Diagnosi | Decisione richiesta |
|---|---|---|
| `RUGBY → secolo`, estratto da «a metà del diciannovesimo secolo» | Dettaglio sulla nascita dello sport; non un'associazione naturale al gioco | Respingere questa risposta nel set |
| `RUGBY → metà`, dalla stessa frase | Espressione temporale, diversa dal termine sportivo `meta` | Respingere; un'eventuale proposta `meta` richiede motivazione propria e nuova revisione |
| `ARIA → misura`, da «in misura di 78 parti di azoto» | Frammento della locuzione quantitativa `in misura di` | Respingere questa risposta nel set |
| `ARIA → comporre`, dal verbo `compongono` riferito ai gas | Verbo della frase descrittiva; la flessione corretta non dimostra naturalezza associativa | Riscrivere o respingere nel senso atmosferico; non giustificarlo con l'aria musicale |
| `TERNA → escavatore`, nel senso di macchina da cantiere | Relazione tecnica reale; familiarità del senso non dimostrata dal solo lemma `terna` | Set `DA_RIVEDERE` finché accezione e recuperabilità non sono verificate per il pubblico e la UI |
| `TERNA → lavoro, macchina, fronte, retro`, nello stesso set | Parole generiche o posizionali riprese dalla descrizione del mezzo | Valutazione individuale; riscrivere o respingere quelle senza un contributo associativo naturale |
| `MORTE → permettere, successivo, sostituire, generazione` | Estratti da «permette a una generazione di essere sostituita dalla successiva» | Sostituire le risposte: descrivono la frase e una conseguenza generale, non associazioni immediate al contesto |
| `MORTE → animale, pianta` | Esempi di organismi che possono morire | La mera applicabilità del concetto non basta; cercare risposte più dirette nello stesso contesto |
| `LIGHT → alcol, nocivo` | Esempi e qualificatori nella definizione di prodotti «con un basso contenuto di sostanze potenzialmente nocive» | Non estrarre il solo ingrediente/esempio perdendo la relazione di contenuto ridotto; scegliere e dichiarare un senso familiare, per esempio alimentare |
| `LIGHT → sostanza, prodotto, contenuto, alimentare` | Parole usate per descrivere la categoria merceologica | Valutare il contributo associativo: non usarle per completare il numero delle risposte |
| `COSPLAY → pensare, agire` | Estratti da «imitarne il modo di agire e pensare» | Non trasferire l'azione del personaggio al prompt senza un legame diretto e naturale; mantenere il prompt e sostituire le risposte deboli |
| `COSPLAY → massa, cultura, pratica` | Frammenti di «cultura di massa» e del generico «pratica di» | Non scomporre una locuzione in risposte autonome prive del suo significato; cercare associazioni specifiche |
| `PALATO → palo, fasciato, sbarrato` | Relazioni dell'accezione araldica importate nel set anatomico | Conservare il prompt, usare un solo senso ed escludere queste proposte dal set anatomico |
| `PALATO → competenza` | Sinonimo figurato attribuito all'accezione anatomica | Verificare l'ambito del sinonimo e sostituirlo nel set anatomico |
| `GUFO → famiglia, corpo, colore` | Descrittori generici della definizione zoologica scelti per frequenza | Non preferirli alle caratteristiche naturali e riconoscibili del gufo |
| `GUFO → popolare, tradizione` | Estratti dall'inciso sulle credenze di malaugurio | Non trasferire i descrittori dell'inciso nel set dell'animale |
| `GUFO → disco` | Frammento dell'espressione anatomica «disco facciale» | Non rendere autonoma una parola che perde il significato senza il qualificatore |
| `SPANDERE → coerenza` | Estratto da «con una certa regolarità e coerenza» | Sostituire: descrive genericamente il modo dell'azione nella frase, non un'associazione naturale al verbo |
| `SOTTOMARINO → operare, costruire` | Verbi in «unità navale da guerra costruita per operare […] sott'acqua» | Preferire azioni caratteristiche o altre associazioni dirette; non imporre verbi generici per completare il set |
| `ESPERTO → digiuno` | Contrario figurato riferito a «essere digiuno di una materia» | Non importare automaticamente il contrario: la parola isolata richiama soprattutto l'alimentazione; cercare un contrasto più riconoscibile |
| `PONGO → orango, animale` | Iponimo e iperonimo di un altro significato importati nel set del materiale da modellare | Sostituire mantenendo PONGO nel senso di materiale modellabile; controllare anche iperonimi e iponimi, non soltanto sinonimi |
| `COAGULAZIONE → gel` | Estratto da «gel di fibrina» | Il rapporto tecnico esiste, ma va valutato per naturalezza e pubblico: non trattare automaticamente la parola isolata come una buona risposta |
| `COAGULAZIONE → formazione, impedire` | Nome generico del processo e verbo che introduce lo scopo | Cercare risposte più specifiche e recuperabili |
| `COAGULAZIONE → ferito`, dalla forma `ferita` | Lemmatizzazione della lesione come aggettivo/persona ferita | Correggere l'analisi secondo la frase: il nome `ferita` conserva il senso della lesione |

`secolo` può essere pertinente in un contesto storico o temporale adeguato;
`misura` può esserlo in un contesto di misurazione. Questi esempi non autorizzano
divieti globali, esclusioni per categoria o sostituzioni automatiche.

### 3.9 Sette risposte valide e revisione indipendente

Prima verificare ogni risposta, poi comporre e riesaminare il set completo.
Un revisore diverso dal generatore valuta le relazioni individuali dopo che
le prove di recupero del §7 sono state congelate; la spiegazione del generatore
non deve essere visibile durante quelle prove. Il voto complessivo non può
compensare una risposta semanticamente respinta o ancora irrisolta.

Quando una risposta non funziona, mantenere il prompt e cercare prima una
sostituzione con una relazione concreta alla stessa accezione. Conservare le
risposte valide; rigenerare il set sullo stesso prompt se il problema è esteso.
Se restano meno di sette risposte valide, continuare la ricerca con altre relazioni
motivate e ripetere le verifiche. Se la ricerca non riesce, conservare il prompt
con stato `DA_RIVEDERE` e una nota sulle alternative tentate, senza cancellarlo
o inventare la risposta mancante. Non completare il numero
con frammenti della definizione, non riutilizzare un senso incompatibile e non
abbassare il criterio per raggiungere il volume del lotto. Una riparazione segue
la genealogia e i limiti del §10.2. Revisioni non eseguite restano da eseguire:
non inventare motivazioni retroattive, giudizi indipendenti o risultati dei giocatori.

### 3.10 Protocollo obbligatorio di selezione e sostituzione

La procedura seguente vale per ogni risposta, anche se estratta correttamente,
frequente, italiana o proveniente da una relazione inversa. Si applica anche ai
prestiti ammessi: `common_loanwords` riguarda la lingua del prompt, non la qualità
delle sue associazioni.

1. **Fissare il significato prima delle risposte.** Scrivere un'accezione familiare
   del prompt. Considerare soltanto il prompt e gli aiuti realmente visibili:
   il giocatore non vede definizione, categoria interna o motivazioni. Non mescolare
   cibo, musica, anatomia, araldica o altri sensi della stessa parola.
2. **Proporre associazioni, poi verificare le fonti.** Cercare risposte naturali
   nel significato scelto, non i sette token più frequenti o disponibili.
   La fonte controlla le relazioni; i token estratti restano suggerimenti lessicali
   finché non superano la selezione semantica.
3. **Spiegare una relazione concreta per ogni parola.** Per esempio componente,
   strumento, luogo tipico, azione caratteristica, proprietà distintiva, sinonimia
   o contrasto naturale. Non forzare varietà di relazioni o quote POS.
   «X può riguardare Y», «stesso ambito», «è nella fonte» e «bisogna pensare per
   farlo» non dimostrano da soli un legame giocabile.
4. **Verificare autonomia e direzione.** La risposta deve funzionare come parola
   singola associata al prompt, senza ricostruire la frase sorgente o aggiungere
   un qualificatore assente. Non estrarre `massa` da «cultura di massa» o `alcol`
   da «basso contenuto di alcol» soltanto perché il termine compare nella locuzione.
   Il rapporto parte dal prompt verso la risposta; non basta che questa rientri
   in una descrizione molto generale del prompt.
5. **Esaminare i dettagli incidentali.** Esempi, parentesi, date, quantità, incisi,
   confronti accessori e verbi che tengono insieme la definizione sono segnali
   da valutare. Il legame deve essere naturale anche senza leggere quel passaggio.
   Non escludere meccanicamente tutto ciò che è tra parentesi: può contenere
   anche una vera proprietà caratteristica.
6. **Verificare specificità e naturalezza.** La relazione fattualmente vera è
   necessaria ma non sufficiente. Valutare se la risposta verrebbe plausibilmente
   in mente al pubblico, se è troppo indiretta e se vale indistintamente per
   moltissimi contesti. Un nome non è automaticamente migliore di un verbo;
   il verbo deve esprimere un'azione caratteristica e pertinente.
7. **Controllare l'ambito delle relazioni lessicali.** Un sinonimo, antonimo o
   termine correlato di pagina/lemma non appartiene automaticamente all'accezione
   scelta. Non copiare relazioni fra POS o omografi, né assegnare loro il
   `sense_id` della definizione senza prova. Anche una voce con una sola accezione
   estratta può contenere relazioni di pagina riferite ad altri significati.
   Una relazione priva di ambito verificato resta una proposta da controllare;
   non entra automaticamente nelle sette risposte. Conservare le etichette
   `figurato`, `araldica`, `anatomia` e le altre restrizioni disponibili.
   Lo stesso vale per i contrari: la relazione dizionariale non basta se dipende
   da un uso figurato o da un complemento non visibile. Con ESPERTO, `digiuno`
   non va preferito a un contrario riconoscibile come `principiante` soltanto
   perché la fonte lo elenca. Il contrasto deve restare naturale con la parola sola.
   Verificare anche iperonimi e iponimi: `animale` e `orango` non possono essere
   ereditati dal lemma PONGO nel set dedicato al materiale da modellare.
8. **Sostituire conservando.** Per ogni risposta debole cercare un'alternativa
   nello stesso significato, lasciando il prompt e le risposte valide.
   Valutare e documentare anche l'alternativa. Se il difetto è esteso, rigenerare
   sullo stesso prompt; un eventuale passaggio a un senso familiare va dichiarato
   e applicato a tutto il set. Senza soluzione conservare il prompt in revisione.
9. **Riesaminare il set e sottoporlo al QA.** Verificare sette parole distinte,
   stessa accezione, ridondanze, alternative concorrenti e difficoltà effettiva.
   Ripetere le verifiche del set modificato. La selezione motivata dal generatore
   è una proposta editoriale: revisione indipendente e test del §7 restano separati.
   Non assegnare punteggi o approvazioni a prove non eseguite.

Per ciascuna proposta conservare: prompt, accezione, risposta, relazione,
motivazione concreta, valutazione di autonomia/naturalezza/recuperabilità,
esito e motivo. Per le sostituzioni aggiungere parola precedente, alternativa,
posizione, versione e verifiche da ripetere. La documentazione resta fuori dalle
cinque colonne del CSV. Una motivazione unica copiata su sette parole non
sostituisce sette valutazioni.

**Nessuna blacklist delle parole di contenuto degli esempi.** `pensare` può essere
appropriato con `SCACCHI`, `alcol` con `BIRRA`, `misura` con `METRO` e `massa` con
`FISICA`. Anche `vita` può avere un contrasto naturale con `MORTE`. Un filtro
conservativo può segnalarle nell'estrazione automatica, ma non deve diventare
un divieto editoriale indipendente dalla coppia. Le esclusioni grammaticali
restano distinte dai giudizi sui contenuti.

Queste verifiche semantiche richiedono un valutatore: regex, dizionari, vettori,
co-occorrenze, frequenza e POS possono assisterlo, ma non provano da soli che
tutte le associazioni siano adatte. Le prove mancanti restano da eseguire.

La pertinenza e la naturalezza precedono qualsiasi ordinamento per frequenza
o IDF. Nel caso GUFO, `famiglia`, `corpo` e `colore` non devono prevalere su
caratteristiche come `rapace` e `notturno` soltanto perché più frequenti.
Non trasformare in risposte autonome i descrittori di come viene formulata
un'azione: `coerenza` in «spandere con regolarità e coerenza» descrive il modo
dell'azione nella fonte. Se un concetto ha bisogno dell'intera espressione per
conservare il senso, come `disco facciale`, non accorciarlo meccanicamente per
rispettare il vincolo di una parola: cercare un'altra risposta sullo stesso prompt.
Per i verbi controllare anche i complementi: `operare` senza `sott'acqua` perde
la specificità utile a SOTTOMARINO. Non usare `costruire` solo perché il mezzo
è costruito. Non sono divieti universali dei verbi: cercare azioni caratteristiche
oppure usare nomi pertinenti, senza quote obbligatorie e senza aggiungere
riempitivi. Vale lo stesso controllo per `permettere`, `comporre` e `pensare`.

**Correttezza tecnica e accessibilità sono giudizi distinti.** Non classificare
ogni proposta poco giocabile come un fatto falso: COAGULAZIONE e «gel di fibrina»
hanno un rapporto tecnico reale, ma `gel` da solo può evocare altri significati
ed essere poco recuperabile. Dichiarare la vera ragione della sostituzione:
ambiguità, scarsa naturalezza, specializzazione o genericità. `formazione`
descrive moltissimi processi e non passa soltanto perché è un nome corretto.

**Verificare il senso dopo la lemmatizzazione.** L'output NLP è un'ipotesi, non
una prova: la forma `ferita` usata come nome di una lesione non va trasformata
in `ferito` perché il modello la classifica come aggettivo. Controllare la frase
completa, il significato del risultato e le analisi alternative. Conservare
forma sorgente, analisi automatica, correzione motivata e autore; non applicare
la stessa correzione indiscriminatamente ad altre occorrenze. Restano vietate
le normalizzazioni che cancellano differenze come `meta`/`metà`.

---

## 4. Difficoltà e alternative ammissibili

### 4.1 Difficoltà PER RISPOSTA

La difficoltà del set non coincide con il tempo per indovinare il prompt, già visibile. Va misurato quanto sia naturale recuperare **ciascuna** delle sette risposte tramite il contesto, gli aiuti UI e i tentativi ammessi.

- `facile`: risposta spontanea o comune, frequente nelle associazioni dirette.
- `media`: risposta semanticamente corretta, richiede connessione meno immediata.
- `alta`: risposta meno frequente ma ragionevole, **non** dipendente da conoscenze arbitrarie o collegamenti nascosti.

**Un'alta difficoltà non giustifica la non indovinabilità.** Classificare il set con una funzione documentata delle sette difficoltà empiriche (per esempio distribuzione dei successi), non tramite il nome del prompt.

### 4.2 Pressione delle alternative

Una parola proposta dal giocatore può essere un'ottima associazione e non figurare fra le sette risposte (`pizza → salame`). **Non negare il suo valore semantico.** Per costruire un set giocabile occorre monitorare la quantità di alternative comparabili, preferire risposte culturalmente salienti e documentare eventuali aiuti UI. Il QA deve misurare quante delle sette risposte emergono spontaneamente da campioni indipendenti (`recall@k`, per singola parola) e quali alternative frequenti compaiono. Una risposta assente dal top-k non è automaticamente invalida, ma richiede spiegazione/test aggiuntivi.

### 4.3 Se la piattaforma mostra lettere/lunghezze

Dichiarare espressamente se il giocatore vede le sette lunghezze, iniziali, lettere rivelate, categorie grammaticali o feedback sui tentativi. Il test deve riprodurre **esattamente** gli stessi aiuti. Se la UI non è definita, eseguire `prompt_only` e registrare la difficoltà come **provvisoria**: non inventare una disponibilità di indizi.

---

## 5. Lessico, POS, autonomia e risorse

### 5.1 Filtri linguistici

- `prompt` e ciascuna risposta: una sola parola canonica, conforme al CSV.
- Per estrazione da dizionario utilizzare lemma e POS del token nel **contesto della definizione completa**, conservando forma, fonte e offset.
- Per vocaboli isolati preferire lookup morfologico `form,lemma,pos` (es. risorsa tipo Morph-it!), che restituisce **analisi possibili** e non il significato selezionato.
- spaCy `it_core_news_md`/`lg` usato sulle **definizioni complete** (input `--definitions-jsonl`), NON usato per autocertificare la POS di parole isolate nel CSV.
- I POS funzionali/grammaticali esclusivi sono bloccanti per risposte del gioco; la parola ambigua (`re`, `do`, `porta`) va revisionata secondo il significato pertinente.
- Lemmi molto comuni, frequenza elevata o presenza in stoplist leggibile sono **avvisi contestuali** per le risposte, non divieti universali: `forno`, `re`, `tempo` possono essere validi nel contesto giusto.
- Frequenze top-2500 e document frequency >8% sono soglie *pilota*, da ricalibrare e da interpretare in modo diverso per le varie categorie.

**Familiarità dei contesti e prestiti stranieri:** la sola appartenenza alla
sezione italiana di un dizionario (`lang_code=it`) non basta: comprende anche
forestierismi. Il file versionato `resources/prompt_policy.json` contiene la
lista chiusa `common_loanwords`. Un prestito straniero non adattato è ammesso
come prompt **soltanto se presente nella lista**; altrimenti viene escluso dalla
generazione e trattenuto per eventuale revisione, anche se frequente. La lista
si amplia soltanto con una modifica editoriale esplicita, mai automaticamente
con le parole scoperte nel corpus. Le traduzioni inglesi di una voce italiana
non sono prova di forestierismo; le derivazioni italiane, come `filmare`, non
vanno confuse con prestiti non adattati.

I normali termini italiani **non** devono appartenere a `common_loanwords`:
passano un filtro distinto di familiarità. La soglia automatica iniziale è
Zipf italiano 3,0. Per i verbi si considerano anche forme flesse attestate
nella voce sorgente, registrando forma e frequenza usate come riferimento.
È un criterio sperimentale, non prova di comprensibilità umana; tecnicismi e
accezioni poco familiari restano soggetti al QA. Non mantenere un elenco di
esclusioni ad hoc `excluded_prompts`.

### 5.2 Normalizzazione

Unicode NFC. Grafie storiche `í→ì`, `ú→ù` solo con origine documentata e audit delle trasformazioni; `î` storica richiede revisione della forma. Mantenere la rappresentazione originale in provenienza. È ammesso un prestito stabile in italiano (`dessert`).

I plurali lessicalizzati come `forbici`, `occhiali`, `nozze`, `ferie`, `scacchi`, `viveri`, `stoviglie`, `tenebre`, `dintorni`, `esequie`, `fauci`, `manette`, `mutande`, `pantaloni` sono possibili **sia come contesto sia come risposta** quando l'accezione è attestata; fonte e motivo dell'eccezione vanno tracciati.

### 5.3 Locuzioni

Il test non consiste più nel chiedersi se il prompt è indovinabile senza una locuzione. Il prompt è visibile. Chiedersi invece se **una risposta prevista** dipende da una locuzione specialistica non mostrata e non sufficientemente inferibile dal contesto (es. `matto → affogato` tramite *matto affogato*). Le polirematiche e le PMI sono **segnalazioni**, non blocchi automatici. Sensi figurati noti e impieghi idiomatici diffusi sono ammessi quando il rapporto con il contesto risulta recuperabile.

---

## 6. Integrità globale, originalità e collisioni

- `UNIQUE(prompt)` nel dataset finale, `UNIQUE(ref)` e sette `words` diverse nella stessa riga.
- Una risposta può comparire in più contesti; questo è del tutto naturale nel gioco. Anche se una risposta è il prompt di un altro enigma, **non è automaticamente un conflitto**.
- Per due insiemi di sette risposte: 0–2 uguali → nessun avviso per la sola sovrapposizione; 3–4 → revisione; 5–6 → revisione prioritaria; 7 → errore bloccante per set identici con contesti diversi.
- Con k risposte comuni, `J=k/(14−k)`; con k=2, `J=0,1667`, **non** ≤0,16.
- Indice invertito su **coppie di risposte**, poi intersezione esatta, per evitare un confronto globale esaustivo.
- Similarità via embedding/coseno e concorrenza incrociata contesto–risposta: soltanto segnali diagnostici; non sostituiscono il test degli utenti.
- Le statistiche globali sulle relazioni servono a monitorare la varietà complessiva, non a vietare una singola riga interamente sensoriale.

---

## 7. Reverse Check corretto: **contesto visibile → risposte nascoste**

### 7.1 Procedura di recupero senza fuga delle risposte

1. Un **revisore indipendente** vede `prompt` e gli aiuti dell'interfaccia effettivamente visibili agli utenti; **non vede `words`** né una spiegazione del generatore.
2. Propone un elenco di parole che assocerebbe spontaneamente al contesto (per esempio fino a 15, con ordine registrato). Non forzare esattamente sette guesses, perché si creerebbe un falso vincolo e un bias di copertura.
3. L'orchestratore, **dopo** aver congelato le risposte, confronta la lista con le sette previste, registra corrispondenze e alternative frequenti.
4. Calcola `per_answer_recall@k`, `mean_answer_recall@k` e `distinct_answers_recalled`, stratificati per categoria e presenza di aiuti UI. Nessuna soglia numerica universale è dichiarata valida prima del pilota.
5. Un revisore QA diverso può esaminare la **pertinenza individuale** di ogni risposta e se l'assenza di una parola nei tentativi sia compatibile con il livello di difficoltà dichiarato.

**Il vecchio protocollo 3→5→7 è ABROGATO:** nascondeva il contesto e cercava di ricostruirlo dalle risposte. Qualsiasi QA con `blind_test.stages`, `best_guess` del prompt o `exact_match(prompt)` non è compatibile con la v3.6.0.

### 7.2 Indipendenza e natura dell'evidenza

Tracciare identità del revisore (pseudonimo), tipo `human` o `llm_diagnostic`, input effettivamente mostrato, aiuti UI, identificativi e hash di log. Il modello generatore **non** deve valutare da solo il proprio set. Per i dati definitivi è necessaria anche verifica umana. Un campo `independence_verified=true` nel JSON indica una dichiarazione da verificare contro il log esterno: il validatore può controllare l'**integrità formale**, non provare l'indipendenza fisica del revisore.

### 7.3 Regole del test

- La prova LLM è diagnostica, **non** una misura del giocatore italiano medio.
- Provare `prompt_only` se non è disponibile la UI; ripetere con aiuti reali quando definiti.
- Le sette risposte non devono comparire nelle istruzioni al revisore.
- Un test positivo sull'associazione `words→prompt` non certifica questo gioco.
- La pressione di risposte alternative è un dato utile: non dichiarare sbagliato un sinonimo naturalmente associato al contesto soltanto perché non era tra le sette preimpostate.

---

## 8. Rubrica e registro QA v3.6.0

### 8.1 Punteggio pesato (totale 100)

| Criterio | Peso | Oggetto della valutazione |
|---|---:|---|
| **Individuabilità** | 35 | Quanto è ragionevole trovare le **sette risposte** dato il contesto visibile e gli aiuti UI |
| **Pertinenza** | 25 | Qualità del legame **prompt→ciascuna risposta** |
| **Difficoltà** | 20 | Bilanciamento della sfida per le sette parole, misurato con giocatori |
| **Originalità** | 10 | Set non banale, contenuti non ripetuti inutilmente, ricchezza delle associazioni |
| **Familiarità** | 10 | Parole e accezioni riconoscibili dal pubblico italiano medio |

Ogni voto in [0,5]; `total_100=Σ(voto×peso/5)`; soglia iniziale 85/100, con **Individuabilità≥4 e Pertinenza≥4**. Inoltre, **ogni** risposta deve avere valutazione individuale `relevance≥4` e `discoverability≥3` dopo verifica contestuale; sono soglie pilota. Non è richiesto che il revisore indovini tutte e sette le risposte spontaneamente al primo test: questa sarebbe una regola irrealistica per un gioco di associazione aperto.

Nel `rationale` di ciascuna voce di `word_reviews` spiegare il legame concreto
con l'accezione scelta e la sua naturalezza per il pubblico. Non approvare una
risposta con un punteggio alto quando il rapporto consiste solo in un dettaglio
accidentale o in una locuzione della fonte (§3.5–3.8). La presenza del testo
nel campo non prova che la revisione sia stata realmente eseguita.

### 8.2 JSON QA nativo (formato schematico)

```json
{
  "schema_version":"word-association-qa-3.6.0",
  "candidate_id":"cand-pizza-001",
  "category_id":"008",
  "prompt":"pizza",
  "words":["forno","mozzarella","pomodoro","impasto","lievito","basilico","margherita"],
  "technical":{"passed":true,"errors":[],"warnings_reviewed":true},
  "retrieval_test":{
    "protocol":"prompt_to_words_independent",
    "prompt_visible":true,"answers_visible":false,
    "independence_verified":false,
    "verification_method":"human_review_records",
    "evidence_refs":[],
    "trials":[]
  },
  "word_reviews":[
    {"word":"forno","relevance":5,"discoverability":5,"difficulty":"facile","rationale":"Associazione concreta con la cottura."}
  ],
  "semantic_review":{
    "ratings":{"Individuabilità":0,"Pertinenza":0,"Difficoltà":0,"Originalità":0,"Familiarità":0},
    "total_100":0,"alternative_answer_pressure":"unknown",
    "rationale":"Esempio di schema, NON un verbale QA completo o approvato."
  },
  "safety_review":{"status":"NOT_RUN","classification":null},
  "decision":"DA_RIVEDERE"
}
```

**L'esempio è VOLUTAMENTE incompleto:** per approvazione servono sette `word_reviews`, almeno due prove indipendenti documentate con almeno un revisore umano, tutte le condizioni della rubrica, eventuali flag NLP risolti e safety eseguita. Il validatore rifiuta i vecchi verbali QA `3.5.x` per incompatibilità del significato degli esperimenti.

### 8.3 Doppia revisione e statistiche

Doppiare almeno il 10% di ogni lotto, con **minimo 30 coppie valide** per stimare κ quando le distribuzioni lo consentono. Cohen κ nominale su `IDONEO/DA_RIVEDERE`, κ pesato sulle dimensioni ordinali 0–5, soglia pilota 0,60. `n<30` → `N_INSUFFICIENTE`; margini degeneri → `UNDEFINED` o `ZERO_VARIANCE_RATER`, non κ=1 per accordo universale. L'accuratezza del campione e le prestazioni dei giocatori restano distinte dall'accordo dei revisori.

### 8.4 Gate

`IDONEO_REVISIONE_FINALE` richiede: formato corretto, categoria valida, QA nuova direzione, prova di recupero con contesto visibile e risposte nascoste, giudizio positivo delle sette risposte, punteggio e ancoraggi, safety documentata, nessuna anomalia lessicale irrisolta. **Non equivale di per sé alla pubblicazione definitiva**: per il rilascio valgono i vincoli dell'archivio globale e della doppia revisione.

È obbligatorio anche il controllo semantico di tutte le sette coppie secondo
il §3, inclusa la familiarità dell'accezione del prompt. Un set con una sola
risposta respinta o non risolta rimane `DA_RIVEDERE`, indipendentemente dal
punteggio totale e dal superamento di formato, frequenza, POS o lista dei prestiti.

---

## 9. Sicurezza contestuale

Audit dell'intero set, non blacklist cieca. Temi legali, medici, storico-bellici, alcol e gioco d'azzardo possono essere **ammessi** in contesti educativi, descrittivi, clinici o ludici appropriati. Analizzare tono complessivo e stereotipi impliciti. `safety_review.status` = `CLEAR | FLAGGED | NOT_RUN`; in caso di `FLAGGED`, escalation umana obbligatoria con `classification` fra `false_positive | acceptable_with_note | blocking` e motivazione. `NOT_RUN` o `blocking` bloccano il rilascio. La safety non è sostituita dal controllo ortografico.

### 9.1 Casi sensibili da preservare (policy v3.5.5 adattata al gioco corretto)

Gli esempi seguenti illustrano una **parola di contesto visibile** e **sette risposte previste**; non sono puzzle certificati o già approvati. La policy di sicurezza considera tutto l'insieme, non la semplice presenza di termini sensibili.

#### 9.1. Alcol ed Enologia — AMMESSO (Enciclopedico)

- **Contesti ammessi:** Contesto enciclopedico, culturale, storico o gastronomico (es. vendemmia, tannino, decantazione, distillato, cantina).
- **Da escludere:** Promozione dell'abuso alcolico, riferimenti al consumo minorile o gergo giovanile legato allo sballo.
- **Esempio indicativo:** `contesto visibile: tannino | risposte nascoste: uva|vino|botte|rosso|sapore|legno|astringente`

#### 9.2. Gioco d'Azzardo e Carte — AMMESSO (Ludico/Storico)

- **Contesti ammessi:** Contesto tradizionalistico, enigmistico, storico o ludico (es. briscola, arrocco, roulette, croupier, azzardo).
- **Da escludere:** Glorificazione della ludopatia, istruzioni su scommesse illegali o sollecitazione al guadagno facile.
- **Esempio indicativo:** `contesto visibile: azzardo | risposte nascoste: rischio|sfida|puntata|dado|tavolo|fortuna|tentativo`

#### 9.3. Armi, Guerra e Difesa — AMMESSO (Storico/Sportivo)

- **Contesti ammessi:** Ambito storico, sportivo o istituzionale (es. fioretto, stoccata, armistizio, corazza, assedio, elmo).
- **Da escludere:** Apologia di armi da fuoco moderne, violenza cruenta, terrorismo o glorificazione di conflitti contemporanei.
- **Esempio indicativo:** `contesto visibile: stoccata | risposte nascoste: scherma|lama|assalto|pista|affondo|bersaglio|punto`

#### 9.4. Salute e Medicina — AMMESSO (Clinico/Divulgativo)

- **Contesti ammessi:** Ambito clinico, scientifico o divulgativo (es. prognosi, anticorpo, placebo, convalescenza, vertigine).
- **Da escludere:** Dettagli splatter o macabri, riferimenti all'autolesionismo, diagnosi ansiogene o stigmatizzazione di patologie.
- **Esempio indicativo:** `contesto visibile: placebo | risposte nascoste: cura|farmaco|mente|effetto|studio|test|medico`

#### 9.5. Sessualità e Affettività — NEUTRO / RISTRETTO

- **Contesti ammessi:** Esclusivamente concetti biologici, clinici o relazionali nobili (es. inseminazione, corteggiamento, dote, nozze).
- **Da escludere:** Qualsiasi vocabolo esplicito, volgare, allusivo o pornografico.
- **Esempio indicativo:** `contesto visibile: corteggiamento | risposte nascoste: amore|fiori|uscita|intesa|coppia|sguardo|attenzione`

#### 9.6. Violenza e Crimine — NEUTRO (Giuridico)

- **Contesti ammessi:** Ambito giuridico, di cronaca o saggistica (es. alibi, movente, imputato, sequestro, latitanza, processo).
- **Da escludere:** Descrizione dettagliata di atti di violenza, giustificazione di reati o vittimizzazione secondaria.
- **Esempio indicativo:** `contesto visibile: movente | risposte nascoste: crimine|causa|indagine|polizia|ragione|sospetto|prova`

#### 9.7. Religione e Mitologia — NEUTRO (Storico/Culturale)

- **Contesti ammessi:** Ambito storico, artistico, letterario o antropologico (es. oracolo, parabola, eremo, dogma, affresco).
- **Da escludere:** Vilipendio delle fedi, bestemmia, proselitismo o incitamento all'odio religioso.
- **Esempio indicativo:** `contesto visibile: parabola | risposte nascoste: racconto|vangelo|insegnamento|storia|morale|testo|fede`

#### 9.8. Politica e Società — NEUTRO (Istituzionale)

- **Contesti ammessi:** Ambito civico, politologico o storico (es. plebiscito, monarchia, parlamento, sciopero, referendum).
- **Da escludere:** Propaganda partitica contemporanea, ingiuria a figure viventi e incitamento alla discriminazione.
- **Esempio indicativo:** `contesto visibile: plebiscito | risposte nascoste: voto|popolo|scelta|urna|democrazia|maggioranza|esito`

#### 9.9. Minori e Tutela — TUTELATO (Rigoroso)

- **Contesti ammessi:** Contesti educativi, pedagogici e ricreativi sani.
- **Da escludere:** Nessun contenuto inopportuno, nocivo o ambiguo.
- **Esempio indicativo:** `contesto visibile: maturità | risposte nascoste: esame|studio|scuola|prova|voto|adulto|traguardo`

**Principio anti-stereotipi:** le risposte non devono basarsi su pregiudizi di genere, etnia, fede, provenienza regionale, età o abilità; non associare categorie protette a ruoli subordinati o tratti negativi stereotipati. Preferire relazioni semantiche fondate sul contesto e giustificabili.



---

## 10. Pipeline, riparazioni e quote

| Fase | Input | Uscita | Gate |
|---|---|---|---|
| A0 | Dizionari, categorie, corpora versionati | Lemmi, accezioni e provenienza delle proposte grezze | Nessun token estratto è automaticamente una risposta giocabile |
| A1 | Catalogo 172 categorie + budget | Piano POS orientativo, compensabile con nomi/aggettivi se mancano verbi adatti; mix di difficoltà | Nessuna quota minima di verbi; qualità prioritaria |
| A2 | Accezione familiare + Master Prompt generativo | JSONL dei set **prompt visibile → sette risposte**, con relazioni motivate | Selezione semantica distinta dall'estrazione; niente riempitivi |
| B1 | JSONL + altri set | Unicità, parentela, collisioni e avvisi multiword | Controlli deterministici |
| B2 | **Solo prompt e aiuti UI reali** | Liste di risposte libere da revisori indipendenti | Nessuna fuga delle sette risposte |
| B3 | Risultati congelati B2 + sette risposte e fonti | Revisione indipendente di ciascuna relazione e dell'accezione | Tutte e sette pertinenti e recuperabili; 85/100 non compensa una risposta respinta |
| B4 | Set completo | Audit safety ed escalation | Nessun flag bloccante |
| C | Candidati con QA semantico e safety completi | Registro approvati + eventuale CSV finale | Mai promuovere un candidato per la sola conformità tecnica |
| D | QA, doppie revisioni, lessici e inventario | Report di rilascio | ≥10.001 distinti, nessun gate aperto |

### 10.1 Resa empirica e piloti

Piloti di 300–500 candidati su 3–4 categorie, misurare `yield_first_pass` e `yield_after_repair`, successo per parola, densità delle alternative, distribuzione POS dei **contesti**, distribuzione delle difficoltà delle **risposte**, collisioni, lavoro QA. I numeri 11k/16k/18k rimangono scenari, **non dati osservati**. Pianificazione prudente: `ceil(10001/yield_conservativa)` per categoria, con incertezza esplicita.

### 10.2 Recupero controllato

Se un set fallisce per **1–2 risposte deboli**, cercare alternative mantenendo il
prompt e le risposte valide. Registrare una versione riparata con
`parent_candidate_id`, `repair_attempt=1`, posizioni modificate e motivazioni;
archiviare il padre. La ricerca può valutare più alternative prima di congelare
questa versione. Rieseguire tutti i test che dipendono dal set. Se il problema
è sistemico, rigenerare le risposte **sullo stesso prompt**: creare un nuovo
candidato iniziale, documentando `regenerated_from_candidate_id` e archiviando
la versione precedente. Non mascherare una rigenerazione completa come riparazione
di 1–2 parole. Un cambio di accezione familiare deve essere esplicito e coerente
in tutto il nuovo set. Un fallimento della ricerca mantiene il prompt in revisione;
non genera esclusioni o blacklist. Eventuali problemi di sicurezza riguardano
il gate separato previsto, non la scarsa qualità di una singola risposta.

La carenza di verbi idonei si gestisce ricalibrando il piano POS, non forzando
nuovi verbi: compensare con nomi o aggettivi pertinenti, anche fino a zero verbi.
Registrare distribuzione richiesta ed effettiva e motivo della compensazione.
Questo scostamento non è un errore, un avviso bloccante o un motivo di rigetto.

---

## 11. Master Prompt v3.6.0

### MP-GEN-3.6.0 — generazione candidati

```text
[MASTER PROMPT: MP-GEN-3.6.0]
WORD ASSOCIATION IT. Il campo prompt è una PAROLA DI CONTESTO che il giocatore
VEDRÀ SUBITO. Il campo words contiene SETTE PAROLE CHE IL GIOCATORE DEVE
INDOVINARE, invisibili finché non vengono scoperte. NON invertire questa
relazione. Non generare 7 indizi per indovinare il prompt.

Per ogni contesto produci 7 risposte italiane singole, distinte, pertinenti,
naturali e ragionevolmente recuperabili da prompt e aiuti UI dichiarati.
Vanno bene tutte contestuali/sensoriali. Non forzare metafore, né sette parole
astratte, né relazioni di tipi diversi. Evita tappabuchi e ridondanze.
Considera alternative realistiche che un giocatore potrebbe proporre.

Scegli un'accezione del contesto familiare al pubblico. Genera associazioni
con quel significato e usa le fonti per verificarne i rapporti concreti.
Non riversare in words i token estratti da una definizione. Per ogni risposta
conserva una breve motivazione del legame, separata dalla sola provenienza.
Applica il §3.10 a OGNI risposta: relazione concreta, parola autonoma, stessa
accezione, naturalezza e recuperabilità. Una relazione solo fattualmente possibile
o ricostruibile leggendo la fonte non basta.
Escludi dettagli accidentali di date, incisi, esempi, proporzioni e costruzioni
grammaticali: rugby->secolo e aria->misura non sono giustificati dalla presenza
nella fonte. Non confondere meta con metà. Non cambiare accezione per salvare
una risposta debole. Se il senso tecnico di un contesto come terna non è
familiare o disambiguato dagli aiuti UI reali, rimetti il candidato in revisione.
Non usare morte->permettere/successivo/sostituire perché sono nella definizione.
Non usare light->alcol/nocivo estraendo esempi da "basso contenuto di sostanze".
Non usare cosplay->pensare/agire o massa estraendo "modo di agire e pensare"
o scomponendo "cultura di massa". Non usare palato->palo/fasciato/sbarrato nel
senso anatomico: le relazioni di pagina non sono necessariamente dello stesso
senso. Non inventare una motivazione per salvare un riempitivo.
Per gufo non scegliere famiglia/corpo/colore perché più frequenti, né disco
isolandolo da "disco facciale". Per spandere non estrarre coerenza dal descrittore
"con regolarità e coerenza". Il significato della parola da sola deve restare
quello pertinente al contesto. Frequenza e IDF intervengono dopo la selezione
semantica e non possono sostituirla.
Per sottomarino non usare operare/costruire soltanto dalla frase "costruita per
operare sott'acqua": il verbo deve esprimere un'azione caratteristica anche
come risposta singola. Se non ci sono verbi adatti usa nomi o aggettivi pertinenti.
Non accettare automaticamente sinonimi e contrari: esperto->digiuno dipende
da "essere digiuno di una materia" e perde naturalezza come parola isolata.
Verifica l'accezione dominante della risposta e proponi un'alternativa diretta.
Controlla che il lemma mantenga il senso della forma nella frase: ferita come
lesione non diventa ferito. Distingui rapporto tecnico vero da buona associazione
per il pubblico: gel in "gel di fibrina" non passa automaticamente per coagulazione.
Se una risposta è debole, cerca un'alternativa mantenendo il prompt. Se necessario,
rigenera il set sullo stesso prompt; senza sette risposte valide lascia il prompt
in revisione e documenta le alternative tentate: nessun riempitivo o esclusione automatica.
Il materiale rimane candidato fino alle revisioni indipendenti del protocollo.

Strategie: balanced_322 = 3 risposte relativamente accessibili, 2 medie,
2 più impegnative (stima da verificare); convergent_free = distribuzione
libera, anche completamente contestuale/sensoriale. Non inventare aiuti UI.

Rispetta il brief di lotto e i target POS/difficoltà come obiettivi pianificati,
non autocertificarli. La quota dei verbi NON è obbligatoria: se mancano verbi
adatti, usa nomi o aggettivi validi e dichiara la distribuzione effettiva.
Sono ammessi anche lotti senza verbi. Non aggiungere risposte deboli per
soddisfare una percentuale. Non simulare utenti, spaCy, approvazioni o test ciechi.
Genera SOLO oggetti JSONL validi, una riga per oggetto, SENZA prosa esterna.
Campi obbligatori: schema_version=word-association-candidate-3.6.0,
candidate_id, parent_candidate_id=null, repair_attempt=0, batch_id,
category_id (001..172), prompt, words[7], pos (NOUN|VERB|ADJ del PROMPT),
difficulty_estimate (media|alta del SET),
word_difficulty_estimates[7] (facile|media|alta delle RISPOSTE),
relations[7] (enum della specifica), strategy (balanced_322|convergent_free).

Esempio DI STRUTTURA (non gold standard):
{"schema_version":"word-association-candidate-3.6.0","candidate_id":"example-1","parent_candidate_id":null,"repair_attempt":0,"batch_id":"A1","category_id":"008","prompt":"pizza","words":["forno","mozzarella","pomodoro","impasto","lievito","basilico","margherita"],"pos":"NOUN","difficulty_estimate":"media","word_difficulty_estimates":["facile","facile","facile","media","media","alta","alta"],"relations":["strumento","ingrediente","ingrediente","materiale","processo","ingrediente","categoria"],"strategy":"balanced_322"}
```

### MP-REV-3.6.0 — recupero libero e indipendente

```text
[MASTER PROMPT: MP-REV-3.6.0]
Agisci come un giocatore italiano. TI È VISIBILE soltanto la parola di contesto
[CONTEXT_PROMPT] e gli aiuti grafici effettivamente visibili [UI_CUES].
Le sette parole previste dalla piattaforma NON ti sono mostrate.
Proponi spontaneamente fino a [K] parole ITALIANE SINGOLE associate al contesto,
ordinate per naturalezza. Non cercare di indovinare il contesto: è già noto.
Non inventare risposte precedenti, non autocertificare successo di gioco.
Produci SOLO JSON: {"guesses":["..."],"uncertain":false}.
Il software confronterà DOPO il tuo elenco con le sette risposte previste.
```

### MP-SEM-3.6.0 — revisione semantica dopo il recupero libero

```text
[MASTER PROMPT: MP-SEM-3.6.0]
Intervieni dopo il congelamento delle prove MP-REV. Sei distinto dal generatore.
Esamina il contesto, l'accezione scelta, ciascuna risposta e le fonti effettive.
Per ogni coppia descrivi brevemente il legame concreto, valuta pertinenza e
recuperabilità e registra accettata/da_riscrivere/respinta con motivo.
Una parola nella definizione non è automaticamente un'associazione valida.
Respingi dettagli storici accidentali e parole di servizio della frase quando
il legame non è naturale dal solo contesto mostrato. Controlla accenti e sensi.
Applica il §3.10 anche a esempi tra parentesi, qualificatori perduti, locuzioni
scomposte, verbi di supporto e relazioni di pagina non disambiguate.
Richiedi una motivazione specifica per ciascuna coppia e una sostituzione sullo
stesso prompt per le risposte deboli. Nessuna blacklist dei termini degli esempi.
Non giustificare risposte di un'accezione con un altro significato del prompt.
Verifica poi coerenza delle sette risposte, ridondanze e pressione di alternative.
Una risposta respinta o irrisolta mantiene l'intero set DA_RIVEDERE.
Non inventare prove umane o dati di gioco: i tuoi giudizi sono diagnostici;
la verifica umana e gli altri requisiti di rilascio restano necessari.
```

### MP-SAF-3.6.0 — audit contestuale

```text
[MASTER PROMPT: MP-SAF-3.6.0]
Analizza la parola di contesto VISIBILE e le sette risposte nascoste.
Valuta tono globale, stereotipi, dignità, sicurezza, vulnerabilità e pertinenza
al pubblico generalista. Non escludere automaticamente i temi storici,
clinici o enciclopedici per la loro sola presenza.
Rispondi SOLO con JSON:
{"status":"CLEAR|FLAGGED","reasons":["..."],
 "overall_tone":"neutral|educational|problematic|uncertain"}.
Un FLAGGED richiede classificazione documentata da parte di un essere umano.
```

---

## 12. Strumenti e validatore

**File:** `validate_word_association_it_v3_6_0.py` (standard library per controlli strutturali; dipendenze esterne opzionali). Il validatore usa schema QA v3.6.0 e rifiuta gli esiti delle sessioni `blind_test` legacy 3.5.x. La tabella di tassonomia a 172 categorie è obbligatoria per JSONL e rilascio.

```bash
# Test automatici aggiornati
python -m unittest -v test_word_association_it_v3_6_0.py

# Validazione CSV del gioco (forma, duplicati, indizi ora = RISPOSTE)
python validate_word_association_it_v3_6_0.py gioco.csv \
  --taxonomy-csv tassonomia_word_association_it_172_categorie_v3_6_0.csv \
  --report-json rapporto.json

# Validazione JSONL v3.6.0, categorie 001..172, genealogia e metadati
python validate_word_association_it_v3_6_0.py --candidates-jsonl candidati_v360.jsonl \
  --taxonomy-csv tassonomia_word_association_it_172_categorie_v3_6_0.csv

# Esportazione SOLO TECNICA di candidati (non approvati)
python validate_word_association_it_v3_6_0.py --candidates-jsonl candidati_v360.jsonl \
  --export-csv candidati_non_approvati.csv

# Verbali QA nella DIREZIONE CORRETTA (prompt visto dal revisore)
python validate_word_association_it_v3_6_0.py gioco.csv --qa-dir qa_v360 \
  --require-qa --taxonomy-csv tassonomia_word_association_it_172_categorie_v3_6_0.csv

# Risorse lessicali reali: NON vengono fornite tabelle inventate
python validate_word_association_it_v3_6_0.py gioco.csv \
  --morphology-csv forme_italiane.csv --frequency-csv frequenze.csv \
  --definition-df-csv frequenze_documentali.csv --require-lexical

# spaCy SOLO su testo di definizioni completo (richiede modello italiano)
python validate_word_association_it_v3_6_0.py gioco.csv \
  --definitions-jsonl definizioni.jsonl --lexical-model it_core_news_md
```

`forme_italiane.csv` richiede `form,lemma,pos`, `frequenze.csv` richiede `lemma,rank`, `frequenze_documentali.csv` richiede `lemma,document_count,total_documents`. Non sono incluse nel pacchetto: utilizzare soltanto fonti e versioni reali documentate. L'assenza di dati NLP **non** deve diventare una falsa attestazione di qualità.

Il validatore verifica sintassi, quote dichiarate, incroci e forma del QA; non può accertare da solo l'effettivo isolamento di revisori, l'autenticità dei log o la genuina indovinabilità di tutte le risposte. La **modalità release** richiede inoltre 10.001 contesti unici, QA completo, risorse lessicali, doppia revisione statisticamente valida.

I controlli semantici del §3 sono obblighi editoriali e di revisione. La presente
correzione delle direttive non esegue tali revisioni, non riscrive i CSV e non
attribuisce al codice una capacità semantica non implementata. Gli stati
`candidate` dell'audit lessicale, `PASS_TECHNICAL_ONLY` e
`PASS_AUTOMATIC_PROMPT_SCREEN` non soddisfano da soli questi obblighi.

---

## 13. Tassonomia ufficiale: 172 macrocategorie in 16 cluster

Questa tassonomia è la stessa versione v3.5.5, **senza rinumerazione**. `category_id` classifica il contesto mostrato al giocatore; non è parte del CSV pubblico. Le quote per categoria sono ancora da calibrare con dati pilota.

### Cluster A — Alimentazione e cucina

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 001 | Ingredienti, dispensa e prodotti di base | farina, zucchero, spezia |
| 002 | Carni, tagli, salumi e norcineria | guanciale, prosciutto, brasato |
| 003 | Pesce e prodotti ittici alimentari | baccalà, alici, mollusco |
| 004 | Latte, latticini e formaggi | cagliata, ricotta, stagionatura |
| 005 | Frutta, ortaggi e aromi culinari | basilico, carciofo, albicocca |
| 006 | Tecniche di cottura e preparazione | soffritto, rosolare, lessare |
| 007 | Utensili, pentole e attrezzatura da cucina | colino, setaccio, mestolo |
| 008 | Panificazione, farine e lievitazioni | lievito, impastare, crosta |
| 009 | Pasticceria, dolci e gelateria | meringa, glassare, sorbetto |
| 010 | Conservazione, fermentazione e trasformazioni alimentari | salamoia, sottolio, affumicare |

### Cluster B — Bevande, locali e ospitalità

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 011 | Viticoltura e vendemmia | vigneto, vendemmia, grappolo |
| 012 | Enologia, vini e degustazione | tannino, mosto, decantare |
| 013 | Birra e birrificazione | luppolo, malto, schiuma |
| 014 | Distillati, liquori e amari | alambicco, grappa, infusione |
| 015 | Cocktail, miscelazione e aperitivi | shaker, guarnizione, aperitivo |
| 016 | Caffè, torrefazione ed estrazione | torrefazione, macinare, espresso |
| 017 | Tè, tisane e bevande analcoliche | infuso, decotto, dissetare |
| 018 | Servizio di sala e ristorazione | cameriere, comanda, vassoio |
| 019 | Bar, tavole calde e cultura del bancone | bancone, consumazione, scontrino |
| 020 | Ospitalità professionale e ricevimento | reception, accoglienza, prenotazione |

### Cluster C — Casa, abitare e manutenzione

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 021 | Strutture domestiche e tipologie abitative | mansarda, soppalco, abbaino |
| 022 | Edilizia, materiali e isolamento | intonaco, massetto, intercapedine |
| 023 | Impianti idraulici e sanitari | rubinetto, scarico, sifone |
| 024 | Impianti elettrici e illuminazione domestica | presa, interruttore, lampadario |
| 025 | Riscaldamento, climatizzazione ed efficienza | caldaia, radiatore, termostato |
| 026 | Arredamento, complementi e design interno | credenza, mensola, abatjour |
| 027 | Elettrodomestici e apparecchi domestici | frigorifero, lavatrice, aspirapolvere |
| 028 | Bucato, stiro e trattamento dei tessuti | candeggina, smacchiare, strizzare |
| 029 | Condominio, vicinato e locazioni | portineria, inquilino, millesimo |
| 030 | Orto domestico, siepi e attrezzi da giardino | cesoia, potare, scartavetrare |
| 161 | Giardinaggio e piante da interno | ficus, rinvasare, terriccio |
| 162 | Bricolage e fai-da-te | trapano, tassello, avvitare |
| 163 | Pulizia e organizzazione domestica | spolverare, riordinare, scaffale |

### Cluster D — Geografia, territorio e ambiente

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 031 | Geografia fisica, rilievi e forme del paesaggio | promontorio, altopiano, vallata |
| 032 | Fiumi, laghi, sorgenti e idrografia | affluente, bacino, foce |
| 033 | Mari, coste, isole e litorali | battigia, laguna, scogliera |
| 034 | Geografia amministrativa e territorio italiano | provincia, capoluogo, frazione |
| 035 | Meteorologia e fenomeni atmosferici | scirocco, grandine, nebbia |
| 036 | Clima, stagioni e cicli naturali | siccità, afoso, equinozio |
| 037 | Geologia, rocce e minerali | faglia, calcare, quarzo |
| 038 | Vulcani, terremoti e rischi naturali | cratere, eruzione, sisma |
| 039 | Ecologia, rifiuti, riciclo e bonifiche | discarica, riciclare, bonifica |
| 040 | Energia, risorse e sostenibilità ambientale | turbina, rinnovabile, biomassa |

### Cluster E — Piante, animali e agricoltura

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 041 | Botanica e anatomia vegetale | radice, linfa, germoglio |
| 042 | Alberi, boschi, foreste e legname | corteccia, quercia, tronco |
| 043 | Fiori, impollinazione e riproduzione vegetale | polline, pistillo, impollinare |
| 044 | Coltivazioni, semina e lavorazioni agricole | semina, mietere, maggese |
| 045 | Zootecnia, stalle e allevamento animale | stalla, pascolo, mungere |
| 046 | Animali domestici e cura degli animali | guinzaglio, cuccia, veterinario |
| 047 | Fauna selvatica terrestre | volpe, cinghiale, cervo |
| 048 | Fauna acquatica, anfibi e ambienti umidi | lontra, rana, medusa |
| 049 | Insetti, ragni e piccoli invertebrati | formica, ragnatela, coleottero |
| 050 | Etologia, migrazioni e adattamenti | letargo, mimetismo, migrare |
| 164 | Agricoltura, allevamento e pesca | filiera, pescatore, raccolto |

### Cluster F — Corpo, medicina e benessere

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 051 | Anatomia ossea e muscolare | tendine, vertebra, cartilagine |
| 052 | Organi, apparati e sistemi corporei | polmone, fegato, arteria |
| 053 | Fisiologia, sensi e riflessi | pupilla, deglutire, starnuto |
| 054 | Sintomi, patologie comuni e disturbi | vertigine, febbre, emicrania |
| 055 | Diagnostica, analisi ed esami medici | radiografia, tampone, referto |
| 056 | Farmaci, terapie e farmacologia quotidiana | collirio, pomata, placebo |
| 057 | Igiene personale e prevenzione | disinfettare, lavarsi, igienico |
| 058 | Nutrizione, metabolismo e alimentazione | digestione, sazietà, nutriente |
| 059 | Sonno, riposo e recupero | insonnia, russare, sonnolenza |
| 060 | Assistenza, riabilitazione e convalescenza | fisioterapia, cicatrice, deambulare |
| 171 | Benessere, fitness e stile di vita | abitudine, postura, allenarsi |

### Cluster G — Psicologia, comportamento e relazioni

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 061 | Emozioni e stati d'animo | nostalgia, rimorso, malinconia |
| 062 | Memoria, attenzione e apprendimento mentale | ricordare, dimenticare, distrazione |
| 063 | Personalità, carattere e temperamento | ostinato, timido, carisma |
| 064 | Percezione, giudizio e decisioni | intuizione, pregiudizio, esitazione |
| 065 | Etica quotidiana, valori e virtù | lealtà, onestà, coraggio |
| 066 | Vizi, atteggiamenti e difetti caratteriali | ipocrisia, invidia, rancore |
| 067 | Comunicazione interpersonale e linguaggio del corpo | gesticolare, sguardo, ascolto |
| 068 | Amicizia, socialità e rapporti fra pari | complicità, fiducia, solidarietà |
| 069 | Amore, corteggiamento e vita di coppia | corteggiamento, gelosia, intesa |
| 070 | Famiglia, parentele e fasi della vita | parentela, nonno, accudire |

### Cluster H — Lavoro, commercio ed economia

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 071 | Mestieri artigiani, botteghe e officine | incudine, tornio, forgiare |
| 072 | Industria manifatturiera, fabbriche e produzione | catena, assemblare, collaudo |
| 073 | Ufficio, organizzazione aziendale e gestione | delegare, riunione, scadenza |
| 074 | Carriera, contratti, sindacati e occupazione | tirocinio, sciopero, licenziare |
| 075 | Commercio, negozi, vendita e clienti | saldo, vetrina, commerciante |
| 076 | Banche, credito, mutui e risparmio | ipoteca, mutuo, interessi |
| 077 | Assicurazioni, previdenza e pensioni | polizza, indennizzo, pensione |
| 078 | Fisco, imposte, contabilità e bilanci | imposta, fattura, conguaglio |
| 079 | Economia, mercati, prezzi e inflazione | rincaro, inflazione, domanda |
| 080 | Burocrazia, anagrafe e servizi pubblici | certificato, protocollo, delega |

### Cluster I — Diritto, istituzioni e storia

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 081 | Diritto civile, proprietà e contratti | caparra, eredità, usufrutto |
| 082 | Diritto penale, reati e indagini | alibi, movente, sequestro |
| 083 | Giustizia, tribunali e procedure | imputato, udienza, testimonianza |
| 084 | Diritti, doveri e cittadinanza | cittadino, cittadinanza, tutela |
| 085 | Elezioni, costituzione e istituzioni nazionali | referendum, parlamento, elettore |
| 086 | Diplomazia, confini e cooperazione internazionale | ambasciata, trattato, frontiera |
| 087 | Civiltà antiche, imperi e storia politica | dinastia, impero, conquista |
| 088 | Medioevo, feudi e società medievale | feudo, castello, vassallo |
| 089 | Età moderna, esplorazioni e rivoluzioni | navigatore, rivolta, monarchia |
| 090 | Storia contemporanea e trasformazioni sociali | armistizio, emigrazione, ricostruzione |
| 166 | Archeologia | scavo, reperto, restauro |
| 167 | Filosofia | dubbio, ragionare, paradosso |
| 168 | Sociologia, antropologia e politica | comunità, consenso, consuetudine |

### Cluster J — Istruzione, lingua e tradizioni

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 091 | Scuola, insegnamento e didattica | cattedra, verifica, bocciatura |
| 092 | Università, esami e titoli di studio | matricola, laurea, fuoricorso |
| 093 | Biblioteche, studio e ricerca documentale | archivio, catalogo, consultare |
| 094 | Grammatica, ortografia e punteggiatura | sintassi, virgola, congiuntivo |
| 095 | Retorica, stile e figure linguistiche | metafora, ironia, iperbole |
| 096 | Lessico, etimologia e variazione linguistica | sinonimo, dialetto, neologismo |
| 097 | Proverbi, modi di dire e linguaggio figurato | proverbio, allusione, malinteso |
| 098 | Feste civili, calendario e ricorrenze | ferragosto, carnevale, anniversario |
| 099 | Storia delle religioni, culto e riti | pellegrinaggio, eremo, processione |
| 100 | Mitologia, fiabe e leggende popolari | oracolo, leggenda, sortilegio |

### Cluster K — Musica, spettacoli e informazione

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 101 | Teoria musicale, ritmo e armonia | melodia, battuta, accordo |
| 102 | Strumenti musicali e orchestre | violino, timpano, spartito |
| 103 | Canto, vocalità e opera lirica | falsetto, soprano, intonare |
| 104 | Teatro, recitazione e palcoscenico | sipario, copione, suggeritore |
| 105 | Danza, balletto e coreografia | passo, coreografia, piroetta |
| 106 | Cinema, regia e montaggio | sceneggiatura, doppiaggio, inquadratura |
| 107 | Televisione, programmi e format | palinsesto, telecomando, puntata |
| 108 | Radio, podcast e comunicazione audio | frequenza, microfono, radiocronaca |
| 109 | Giornalismo, cronaca e informazione | redazione, notizia, esclusiva |
| 110 | Letteratura, narrativa e generi letterari | epilogo, romanzo, narratore |

### Cluster L — Arti visive, design e moda

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 111 | Pittura, disegno e tecniche pittoriche | affresco, pennello, chiaroscuro |
| 112 | Scultura, ceramica e lavorazione artistica | bassorilievo, argilla, scolpire |
| 113 | Architettura monumentale e storia dell'arte | facciata, capitello, colonna |
| 114 | Fotografia tecnica, ottiche ed esposizione | diaframma, controluce, obiettivo |
| 115 | Musei, restauro e conservazione | patina, restaurare, reperto |
| 116 | Grafica, tipografia e comunicazione visiva | carattere, impaginare, manifesto |
| 117 | Moda, abbigliamento e tendenze | passerella, cappotto, elegante |
| 118 | Sartoria, tessuti e lavorazioni | imbastitura, velluto, cucire |
| 119 | Calzature, borse e accessori | suola, fibbia, tracolla |
| 120 | Gioielleria, oreficeria e gemme | carato, filigrana, diamante |
| 165 | Fotografia, fumetto e illustrazione | vignetta, storyboard, illustrare |

### Cluster M — Mobilità, trasporti e turismo

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 121 | Automobili, motori e meccanica di guida | frizione, marmitta, sterzare |
| 122 | Moto, biciclette e micromobilità | pedale, manubrio, monopattino |
| 123 | Strade, segnaletica e regole di circolazione | carreggiata, casello, precedenza |
| 124 | Autobus, metropolitane e mobilità urbana | fermata, convalida, capolinea |
| 125 | Ferrovie, treni e stazioni | binario, convoglio, deragliare |
| 126 | Logistica, spedizioni e trasporto merci | magazzino, consegna, imballaggio |
| 127 | Nautica, navigazione e vita portuale | zavorra, chiglia, ormeggio |
| 128 | Aviazione, aeromobili e aeroporti | fusoliera, decollo, scalo |
| 129 | Turismo, itinerari e visita dei luoghi | escursione, turista, itinerario |
| 130 | Viaggi, alloggi e vacanze dal lato del viaggiatore | valigia, ostello, pernottamento |

### Cluster N — Sport e competizioni

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 131 | Calcio, tattica e regolamenti | fuorigioco, rigore, portiere |
| 132 | Pallavolo, pallacanestro e sport collettivi | schiacciata, canestro, palleggiare |
| 133 | Atletica leggera, gare e corsa | staffetta, ostacolo, traguardo |
| 134 | Ginnastica sportiva e tecnica di allenamento | flessione, addominale, allenarsi |
| 135 | Ciclismo sportivo e competizioni su strada | gregario, volata, tappa |
| 136 | Tennis, badminton e sport di racchetta | rovescio, servizio, racchetta |
| 137 | Nuoto, pallanuoto e sport acquatici | virata, nuotare, corsia |
| 138 | Sci, sport invernali e competizioni sulla neve | slalom, pista, discesa |
| 139 | Scherma, arti marziali e sport da combattimento | stoccata, fioretto, schivare |
| 140 | Automobilismo, motociclismo e competizioni motoristiche | sorpasso, circuito, podio |

### Cluster O — Giochi, hobby e vita ricreativa

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 141 | Scacchi e giochi strategici astratti | arrocco, scacco, pedone |
| 142 | Carte tradizionali, prese e combinazioni | briscola, mazzo, scartare |
| 143 | Giochi da tavolo, dadi e società | pedina, tabellone, dado |
| 144 | Cruciverba, enigmistica e indovinelli | rebus, anagramma, definizione |
| 145 | Logica ricreativa, rompicapi e problemi | deduzione, paradosso, enigma |
| 146 | E-sport, streaming e competizioni videoludiche | joystick, avatar, livello |
| 147 | Collezionismo, modellismo e hobby creativi | francobollo, miniatura, raccolta |
| 148 | Campeggio, escursionismo e outdoor | tenda, sentiero, bivacco |
| 149 | Circo, illusionismo e spettacoli di abilità | prestigiatore, giocoliere, trapezio |
| 150 | Feste private, eventi e intrattenimento | invito, brindisi, festeggiare |
| 172 | Videogiochi | videogioco, avatar, salvataggio |

### Cluster P — Scienze, matematica e digitale

| ID | Macrocategoria | Esempi di contesti (non validati) |
|---|---|---|
| 151 | Matematica, calcolo e geometria | frazione, teorema, triangolo |
| 152 | Fisica, meccanica e forze | inerzia, attrito, accelerazione |
| 153 | Chimica, elementi e trasformazioni | reagente, miscela, molecola |
| 154 | Astronomia, cielo e corpi celesti | eclissi, orbita, costellazione |
| 155 | Astronautica, satelliti ed esplorazione spaziale | razzo, astronauta, satellite |
| 156 | Software, sistemi operativi e programmazione | algoritmo, applicazione, programma |
| 157 | Web, protocolli e servizi internet | browser, router, connessione |
| 158 | Sicurezza informatica tecnica e protezione dati | password, cifratura, autenticare |
| 159 | Elettronica, sensori e automazione | circuito, sensore, microchip |
| 160 | Intelligenza artificiale, modelli e dati | neurale, apprendimento, classificare |
| 169 | Informatica e tecnologia digitale | interfaccia, dispositivo, touchscreen |
| 170 | Internet, social e cybersecurity | profilo, condivisione, phishing |

---

## 14. Migrazione v3.5.5 → v3.6.0 e changelog

**Intervento incompatibile:** cambia la direzione del compito. Il CSV rimane sintatticamente compatibile, ma la **semantica dei dati e del QA non lo è**. Le righe storiche v3.5.x NON diventano approvate limitandosi a rinominare i campi. Occorre rigenerare o riesaminare ogni set secondo la logica `contesto visibile → 7 risposte`.

| In v3.5.5 | In v3.6.0 |
|---|---|
| `prompt` da indovinare | `prompt` **già visibile** |
| `words` = sette indizi del prompt | `words` = **sette risposte nascoste** |
| Reverse Check indizi→prompt (3/5/7) | Test contesto→parole libere, `recall@k` per risposta |
| 3+2+2 = tre laterali, due funzionali, due risolutivi | `balanced_322` = tre risposte più accessibili, due medie, due più difficili, **non vincolante** |
| `convergent_free` = set che identifica il prompt | `convergent_free` = set liberamente associato al contesto, anche mono-dominio |
| Unica soluzione dominante | Sette risposte previste, ciascuna con alternative associative naturali |
| QA `word-association-qa-3.5.x` | QA **nativo 3.6.0**, incompatibile |
| POS e difficoltà riferite alla soluzione singola | POS pianificato sul contesto; difficoltà misurata **per risposta** e aggregata sul set |

**Nota finale:** un enigma è di qualità quando la parola visibile fornisce un contesto che rende sette risposte pertinenti, distinguibili e raggiungibili con gli aiuti realmente disponibili. Non serve, né è corretto, pretendere che sette risposte identifichino una sola parola già visibile.

### Revisione editoriale dell'8 novembre 2026: provenienza e pertinenza

- Separati estrazione lessicale, selezione delle associazioni e revisione semantica.
- Resi espliciti il controllo della familiarità dell'accezione e il divieto di
  riempire set con dettagli accidentali della definizione.
- Aggiunti i casi di regressione `RUGBY–secolo`, `RUGBY–metà`, `ARIA–misura`,
  `ARIA–comporre` e l'accezione tecnica di `TERNA`.
- Inclusi `MORTE`, `LIGHT`, `COSPLAY`, `PALATO`, `GUFO`, `SPANDERE`, `SOTTOMARINO`,
  `ESPERTO`, `PONGO` e `COAGULAZIONE`, con diagnosi
  dei frammenti descrittivi, dei qualificatori perduti e della commistione di sensi.
- Aggiunto il protocollo per ogni risposta (§3.10): il legame semantico precede
  frequenza e IDF; le relazioni di pagina richiedono disambiguazione.
- Le risposte deboli richiedono alternative sullo stesso prompt. Le risposte
  valide si conservano; una rigenerazione sistemica resta sullo stesso contesto.
  Senza soluzione il prompt rimane in revisione, senza esclusione automatica.
- Rafforzato il gate per singola risposta e aggiunto MP-SEM dopo le prove libere.
- I lotti già generati richiedono questo riesame: non diventano approvati con
  l'aggiornamento del documento o con il solo superamento dei controlli automatici.

# Direttiva di pertinenza e recuperabilità delle risposte

> **Revisione documentale — 16 novembre 2026.** Il criterio di pertinenza e recuperabilità qui definito resta invariato. Le fonti possono proporre parole e relazioni; l'ampliamento di ZeroContext e i suoi ranking automatici non costituiscono una revisione dei bacini di ZeroAssociazioni. Procedura di importazione e copie sono nel [README](README.md).
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

Aggiornamento dell'8 novembre 2026 alla specifica Word Association IT v3.6.0.
La fonte normativa è [la direttiva operativa](direttive_word_association_it_v3_6_0.md),
in particolare §§3.5–3.14, 7 e 8. Il nome di questo file è storico:
`prompt` è il contesto visibile e `words` contiene sette risposte nascoste.

## Principio obbligatorio

**La provenienza da una definizione non dimostra un'associazione giocabile.**
Separare estrazione dei lemmi, selezione semantica e approvazione indipendente.
Nessun token estratto entra direttamente fra le sette risposte perché è un
nome, supera i filtri, compare vicino al contesto o ha un buon punteggio statistico.

Il generatore parte da una precisa accezione familiare del contesto e propone
associazioni naturali. Le fonti documentano fatti e relazioni; la selezione
delle risposte richiede un controllo semantico distinto.

## Accezione del contesto

Verificare la familiarità del senso scelto, oltre alla frequenza della parola.
Non scegliere un'accezione rara o tecnica soltanto per trovare sette risposte.
Gli aiuti tematici devono essere realmente visibili ai giocatori e riprodotti
nelle prove. In mancanza di riconoscibilità, rigenerare le risposte sullo stesso
prompt usando un senso familiare, esplicitando il cambio nei metadati.
Tutte le risposte devono rimanere nello stesso senso.

La scelta del senso precede la ricerca delle sette risposte (§3.7.1 della
direttiva operativa). Registrare accezione, eventuale significato quotidiano
concorrente, categoria e soli aiuti tematici visibili. Senza un tema specialistico
esplicito, usare un senso comune e familiare; una categoria interna non
disambigua ciò che il giocatore vede. Categoria e risposte devono essere
coerenti con il senso scelto. Non cambiare categoria per salvare un set debole.

Una categoria tecnicamente corretta non rende familiare un'accezione rara.
Confrontare il senso quotidiano con quello tecnico prima di proporre il set
e documentare perché il senso scelto è riconoscibile dagli aiuti UI reali.
Le risposte nascoste non possono disambiguare il prompt per chi gioca.
Per `alternativo`, la categoria meccanica e parole come `motore` e `stantuffo`
non giustificano da sole il senso tecnico: senza tema visibile sufficiente
e verifica indipendente, rigenerare sullo stesso prompt con un senso quotidiano
coerente. Non mescolare diverso, non convenzionale e sostitutivo per riempire
le sette risposte. Il dubbio sull'accezione mantiene il set in revisione.

Per `agitato`, senza un tema musicale esplicito, non scegliere automaticamente
l'indicazione presente nelle partiture. `Prescrivere` ed `esprimere` provengono
dalla frase che descrive la didascalia; `musicale` qualifica `partiture`.
Queste provenienze non giustificano associazioni al prompt. Il senso musicale
non può inoltre essere classificato come «Percezione, giudizio e decisioni».
Riesaminare il senso prima di generare alternative; mantenere il prompt in
revisione finché scelta del senso, categoria e sette coppie non sono coerenti.

## Evidenza per ciascuna risposta

La verifica riguarda ciascuna coppia prompt–risposta. Una parola può essere
riutilizzata per altri prompt, anche nella stessa lista, quando pertinente e
coerente con ciascun senso scelto. Conservare una motivazione e una revisione
per ogni coppia: nessuna approvazione o esclusione si trasferisce automaticamente
da un prompt all'altro. I duplicati sono vietati nel singolo bacino; non esiste
un divieto globale di riuso delle risposte.

Conservare fuori dal CSV di consegna:

1. Contesto, risposta e rispettive accezioni, con identificativi quando disponibili.
2. Relazione concreta e breve motivazione comprensibile senza leggere la fonte.
3. Fonte e passaggio pertinente, oppure motivazione editoriale verificabile.
4. Valutazione distinta di pertinenza, naturalezza e recuperabilità dal contesto.
5. Esito `accettata`, `da_riscrivere` o `respinta`, motivo e riferimento alla revisione.

Una motivazione adeguata spiega il rapporto: «nel rugby la meta è una segnatura».
«È nella definizione», «è frequente» o la sola etichetta `contesto` non bastano.
`clue_evidence.kind=definizione` registra provenienza, non approvazione semantica.
Nel QA esistente, spiegare il legame nel `rationale` di ogni `word_reviews`.

## Dettagli accidentali e forme

Ammettere un aggettivo solo se qualifica direttamente il concetto del
prompt nell'accezione scelta. Escludere gli attributi di componenti,
materiali, strumenti o altri nomi della definizione: in «affresco, dipinto
su intonaco fresco», `fresco` qualifica `intonaco`, non `affresco`.
`intonaco` resta una proposta pertinente, con evidenza propria. Non
sostituire automaticamente l'aggettivo con il suo referente, né duplicare
una risposta già presente. Senza un referente verificabile, lasciare
l'aggettivo fuori dalla selezione automatica e richiedere revisione.
Un legame sintattico diretto è necessario per l'estrazione, ma non basta
da solo a certificare naturalezza e recuperabilità dell'associazione.

Respingere parole collegate soltanto a date, incisi storici o biografici,
luoghi citati incidentalmente, esempi, proporzioni o sintassi della definizione.
Questo difetto può riguardare anche nomi, verbi e aggettivi corretti.

Filtrare parole esclusivamente grammaticali e possessivi prima e dopo la
lemmatizzazione, anche nelle proposte manuali. Una parola di contenuto va
comunque valutata per la specifica coppia: non creare una blacklist globale
di `secolo`, `misura`, `lavoro`, `fronte` o altre parole degli esempi.

Conservare accenti e senso. `meta` e `metà` sono parole diverse: non correggere
un'associazione eliminando automaticamente l'accento. Una risposta proposta
in sostituzione richiede evidenza propria e ripetizione delle verifiche pertinenti.

## Casi di regressione

Applicare il §3.7.2 della direttiva operativa: identificare l'espressione
sorgente completa prima di valutare il singolo lemma. `Mancanza di coscienza`,
`diminuzione della temperatura` e `funzioni vitali` non si trasformano
automaticamente in risposte isolate. Conservare il ruolo di assenza,
variazione e qualificazione nella motivazione; se la parola da sola perde
il legame, cercarne un'altra. `Giuliano` in `calendario giuliano` non
caratterizza agosto. Non concatenare locuzioni per aggirare il formato.

Valutare anche i sostantivi usati come supporto alla descrizione. In
«camerata: camera di forma rettangolare», `forma` introduce l'attributo
geometrico e, privata di `rettangolare`, non caratterizza il prompt:
«la camerata ha una forma» vale per innumerevoli altre cose. Respingere
questa proposta anche se è un nome corretto e supera i filtri lessicali.
Un esito `review` resta da valutare, non è un'accettazione editoriale.
La regola riguarda il ruolo nella frase anche per aspetto, dimensione,
caratteristica, funzione e struttura; non è una blacklist universale.
Non sostituire automaticamente il nome con il qualificatore: anche
`rettangolare` richiede pertinenza e recuperabilità proprie. Cercare
un'altra associazione e conservare `dormitorio` senza duplicarlo se già presente.

Richiedere un contributo specifico: se la stessa motivazione vale invariata
per numerosi prompt, la mera appartenenza a una categoria non basta.
Esaminare anche il set completo: non riempirlo di descrittori generici,
metadati della fonte o vicini di una sequenza. Per agosto cercare anche
associazioni quotidiane caratteristiche, da verificare singolarmente;
le proposte non sono set approvati. Le parole di categoria e vicinanza
restano valutabili, senza un divieto universale. Una risposta irrisolta
impedisce la consegna del set; conservare il prompt e cercare alternative.

| Caso osservato | Problema | Esito editoriale richiesto |
|---|---|---|
| `CAMERATA → forma` | Estratto da «di forma rettangolare»: nome generico che perde il qualificatore e non caratterizza la camerata | Respingere la proposta e cercare un'associazione autonoma; non accettare automaticamente rettangolare e non duplicare dormitorio |
| `ANIMA → metallo, compito, piano, centrale, disporre, taglio, sforzo` | Accezione tecnica del profilato metallico non riconoscibile dal solo prompt, frammenti di espressioni meccaniche e categoria del caffè incoerente | Bloccare il set e rigenerare sullo stesso prompt in un senso familiare dichiarato; selezionare nuovamente le sette risposte e una categoria pertinente |
| `ALTERNATIVO → motore, albero, trasformare, macchina, moto, rotatorio, stantuffo` | Accezione tecnica inattesa nonostante la categoria meccanica coerente; qualificatore di un altro nome e verbo della spiegazione | Confrontare preventivamente col senso quotidiano, richiedere tema visibile e verifica indipendente per il senso tecnico, altrimenti rigenerare sullo stesso prompt senza consegnare il set irrisolto |
| `AGONIA → funzione, mancanza, temperatura, momento` | Frammenti generici da espressioni cliniche che perdono qualificatori e rapporti | Cercare associazioni autonome nello stesso senso; valutare separatamente morte, respiro e coscienza; correggere la categoria etologica incoerente |
| `AGOSTO → anno, giorno, mese, calendario, settembre, luglio, giuliano` | Set concentrato sulla descrizione del calendario; giuliano qualifica calendario | Escludere giuliano da questa fonte, valutare le altre coppie singolarmente e proporre contenuti quotidiani più caratteristici e distinti |
| `AGITATO → movimento, musicale, esprimere, esecuzione, prescrivere, didascalia, partitura` | Senso musicale specialistico selezionato senza disambiguazione; categoria psicologica incoerente; frammenti della definizione | Ripartire da un senso familiare al contesto visibile; valutare nuovamente categoria e risposte, senza approvare il set tecnico per la sola provenienza lessicale |
| `AFFRESCO → fresco` | Aggettivo riferito a `intonaco`, non al prompt | Respingere questa proposta; conservare `intonaco` se pertinente e già presente, senza duplicarlo |
| `RUGBY → secolo` | Estratto dall'inciso sulla nascita dello sport nel diciannovesimo secolo | Respingere questa risposta |
| `RUGBY → metà` | Estratto da «a metà del diciannovesimo secolo»; non è la segnatura `meta` | Respingere; valutare separatamente un'eventuale nuova proposta `meta` |
| `ARIA → misura` | Estratto dalla locuzione «in misura di 78 parti di azoto» | Respingere questa risposta |
| `ARIA → comporre` | Verbo della frase «gas che compongono l'atmosfera» | Riscrivere o respingere nel senso atmosferico; non ricorrere al senso musicale |
| `TERNA → escavatore` | Legame corretto nel senso di macchina da cantiere, ma familiarità del senso da dimostrare | Intero set `DA_RIVEDERE` fino a verifica dell'accezione e della recuperabilità |
| `TERNA → lavoro, macchina, fronte, retro` | Parole generiche o posizionali tratte dalla descrizione | Revisione individuale; riscrivere o respingere le associazioni deboli |
| `ABBEVERARE → sua` | Possessivo riferito all'imbarcazione nella frase «la sua tenuta» | Respingere la parola grammaticale |
| `MORTE → permettere, successivo, sostituire, generazione` | Frammenti della frase sulla successione delle generazioni | Cercare risposte direttamente associate alla morte mantenendo il prompt |
| `MORTE → animale, pianta` | Esempi di organismi che possono morire | La mera applicabilità è insufficiente; cercare associazioni più naturali |
| `LIGHT → alcol, nocivo` | Esempi/qualificatori in «basso contenuto di sostanze potenzialmente nocive» | Non perdere il rapporto di contenuto ridotto; scegliere un senso coerente e risposte dirette |
| `COSPLAY → pensare, agire` | Frammenti di «imitarne il modo di agire e pensare» | Non confondere la frase sul personaggio con un'associazione naturale al cosplay |
| `COSPLAY → massa, cultura, pratica` | Locuzione scomposta e descrittori generici | Sostituire le risposte deboli, conservando quelle pertinenti |
| `PALATO → palo, fasciato, sbarrato, competenza` | Relazioni araldiche/figurate della pagina attribuite al senso anatomico | Disambiguare le relazioni lessicali e sostituire le risposte incoerenti |
| `GUFO → famiglia, corpo, colore, popolare, tradizione` | Descrittori generici e parole dell'inciso sul malaugurio | Non privilegiarle per frequenza rispetto alle caratteristiche riconoscibili del gufo |
| `GUFO → disco` | Frammento di «disco facciale» | Non spezzare la locuzione perdendo il significato anatomico |
| `SPANDERE → coerenza` | Descrittore in «con una certa regolarità e coerenza» | Cercare una risposta naturale al verbo, non un frammento del modo descritto dalla fonte |
| `SOTTOMARINO → operare, costruire` | Verbi da «costruita per operare […] sott'acqua» | Cercare azioni caratteristiche o nomi pertinenti; nessuna quota obbligatoria di verbi |
| `ESPERTO → digiuno` | Contrario figurato da «essere digiuno di una materia» | Verificare il significato dominante della parola isolata e scegliere un contrasto più naturale |
| `PONGO → orango, animale` | Iponimo e iperonimo riferiti a un altro senso | Mantenere il senso del materiale da modellare e sostituire entrambe le risposte |
| `COAGULAZIONE → gel, formazione, impedire` | Espressione tecnica e descrittori generici del processo | Separare verità tecnica e giocabilità; cercare parole specifiche e recuperabili |
| `COAGULAZIONE → ferito`, dalla forma `ferita` | Analisi NLP che cambia il nome della lesione | Verificare la frase e conservare `ferita` nel senso anatomico corretto |

Sono esempi diagnostici, non set approvati e non divieti universali sui vocaboli.

## Procedura da applicare a ogni risposta

1. Fissare un'accezione familiare del prompt, senza aiuti UI inventati.
2. Proporre associazioni naturali; usare poi le fonti per verificarne i rapporti.
3. Spiegare una relazione concreta per ciascuna parola, non soltanto la provenienza.
4. Verificare che la parola funzioni da sola, senza ricostruire la frase della fonte.
5. Esaminare incisi, parentesi, esempi, date, quantità e verbi di supporto:
   non estrarre termini soltanto perché presenti in queste strutture.
6. Verificare naturalezza e specificità: verità fattuale e mera applicabilità
   a un argomento non dimostrano recuperabilità dal prompt.
7. Verificare l'accezione dei sinonimi e dei termini correlati: le relazioni di
   pagina/lemma non appartengono necessariamente alla definizione selezionata,
   anche quando rimane una sola accezione estratta. Non inventare il loro `sense_id`.
8. Cercare alternative sullo stesso prompt per le risposte deboli, conservando
   quelle valide e documentando sostituzioni ed eventuali cambi espliciti di senso.
9. Riesaminare il set e ripetere il QA previsto. Separare proposta editoriale e
   revisione indipendente. Senza alternative mantenere il prompt in revisione.

Non copiare una motivazione generica su tutte le parole e non forzare verbi.
Non vietare globalmente i termini degli esempi: `pensare` può funzionare con
`SCACCHI`, `alcol` con `BIRRA`, `misura` con `METRO`, `massa` con `FISICA` e `vita`
per contrasto con `MORTE`. Il giudizio riguarda la coppia e l'accezione.
Frequenza, vettori, filtri e grammatica non sostituiscono questa valutazione.
La selezione semantica precede l'ordinamento per frequenza e IDF. Se il senso
richiede un'espressione intera, non tagliarla per ottenere una parola singola:
cercare un'alternativa. Anche i descrittori generici del modo di compiere
un'azione devono avere un legame autonomo e naturale con il prompt.
Un verbo non è idoneo se dipende da un complemento assente per avere specificità:
`operare` in «operare sott'acqua» non basta per SOTTOMARINO. Non scegliere
`costruire` solo perché il mezzo viene costruito. Sostituire con un'azione
caratteristica o un nome pertinente: non forzare la presenza di verbi.
Sinonimi e contrari non sono approvati automaticamente. Il legame di `digiuno`
con ESPERTO dipende da un uso figurato con complemento assente; scegliere una
risposta più riconoscibile, per esempio `principiante`, dopo verifica contestuale.
Distinguere una relazione tecnicamente vera da un'associazione accessibile:
`gel di fibrina` ha un rapporto tecnico con COAGULAZIONE, ma `gel` da solo non
è automaticamente una buona risposta. Non dichiararlo falso per giustificare
la sostituzione. Verificare inoltre il risultato della lemmatizzazione nel
contesto: `ferita` come lesione non va resa `ferito`. Registrare analisi,
correzione e motivazione, senza regole globali che cancellino differenze di senso.

## Revisione e sette risposte

Il test indipendente mostra **contesto e soli aiuti UI reali**, nascondendo
le sette risposte e le spiegazioni del generatore. Congelare le proposte libere;
poi un revisore distinto dal generatore valuta ogni coppia e l'insieme completo.
Confermare stessa accezione, naturalezza, assenza di ridondanze e pressione
accettabile delle alternative. La prova LLM è diagnostica; non sostituisce
la verifica umana prevista per il rilascio.

Applicare le soglie individuali della rubrica v3.6.0 dopo verifica contestuale.
Un voto complessivo alto non compensa una risposta respinta o irrisolta.
Per ogni risposta debole cercare prima un'alternativa, mantenendo il prompt e
le risposte valide. Se il difetto è esteso, rigenerare il set sullo stesso prompt.
Se la ricerca non produce sette risposte valide, conservare il prompt in revisione
con le alternative tentate: niente esclusione automatica, riempitivi, mescolanza
di accezioni o riduzione della qualità per raggiungere il volume.
Le riparazioni seguono genealogia e limiti del §10.2 della direttiva operativa.

## Indicazioni ricavate da tutti gli screenshot

AGONISTICO evidenzia due controlli ulteriori: `inerente` introduce la definizione
«inerente a competizioni sportive» e non identifica da solo il contesto sportivo;
`competizione` e `competitivo` ripetono lo stesso nucleo attraverso POS diversi.
Il massimo di due equivalenti è un limite, non un permesso di inserire doppioni.
Conservarne uno quando l'altro non aggiunge contenuto. I contrari richiedono
anche un asse coerente: `amatoriale` non equivale automaticamente a non agonistico.

L'[analisi dei 22 contesti](analisi_screenshot_word_association_20261108.md)
conserva parole, fonti e diagnosi, comprese DIFENDERE e MASSO negli screenshot
senza titolo. Le nuove regole valgono anche per casi futuri:

- Conservare negazioni, ruoli e paragoni: «senza manubrio» non rende il manubrio
  una parte dello skateboard. La prevenzione o il contrasto non sono presenza.
- Non accumulare più di due risposte sostanzialmente equivalenti. Varianti
  grafiche, flessioni o derivati non creano contenuti diversi. IMPROVVISO non
  deve diventare una lista di sinonimi di inatteso o di improvvisazione.
- Separare metadescrizioni e caratteristiche: `scientifico` e `classificazione`
  descrivono la voce TIGRE. Colori e pelliccia possono invece essere corretti;
  la loro varietà va valutata senza dichiararli tutti falsi.
- Non preferire accezioni specialistiche perché forniscono sette token:
  TRIBUNA e TERNA richiedono un senso familiare o aiuti UI realmente presenti.
- Non importare contrari o termini correlati per riempire il set: GRANELLO
  con MASSO e il figurato DIGIUNO con ESPERTO richiedono naturalezza contestuale.
- Verificare la fonte e unificare il senso: IMPOVERIRE non mescola automaticamente
  ragionamento, difficoltà economiche e significati figurati.
- Registrare motivazioni diverse e concrete per le sette risposte e una verifica
  di coerenza e ridondanza dell'insieme. Il contratto aggiornato è
  `word-association-semantic-2026-11-08.2`; nessun esito viene simulato.

La produzione ordinaria usa selezioni editoriali documentate. L'estrazione
lessicale rimane una modalità esplicita per suggerimenti da revisionare.
Mantenere il prompt quando una risposta fallisce e cercare alternative;
non abbassare la qualità per arrivare a sette parole.

## Effetto sui lotti esistenti

Il §3.14 rende vincolante il controllo preventivo: **prima ogni coppia,
poi l'intero set**. Richiedere senso familiare, legame autonomo e specifico,
ruolo/polarità corretti, locuzioni integre nel significato, relazioni lessicali
disambiguate, lemma fedele alla frase, diversità ed evidenze individuali.
Una parola fallita richiede un'alternativa sullo stesso prompt e nuove verifiche;
senza sette risposte valide il prompt resta in revisione. Le quote e il volume
non giustificano riempitivi. Gli avvisi automatici non sono il QA semantico.

I controlli lessicali, la lista dei prestiti e gli esiti tecnici non approvano
le associazioni. I lotti già generati richiedono il riesame descritto qui.
Questa modifica normativa non riscrive i CSV e non esegue né simula revisioni:
le prove mancanti restano da eseguire. Le regole sono comuni a proposte
estratte, relazioni inverse e composizioni manuali.

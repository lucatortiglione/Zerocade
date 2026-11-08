# Direttiva di pertinenza e recuperabilità delle risposte

Aggiornamento dell'8 novembre 2026 alla specifica Word Association IT v3.6.0.
La fonte normativa è [la direttiva operativa](direttive_word_association_it_v3_6_0.md),
in particolare §§3.5–3.10, 7 e 8. Il nome di questo file è storico:
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

## Evidenza per ciascuna risposta

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

| Caso osservato | Problema | Esito editoriale richiesto |
|---|---|---|
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

## Effetto sui lotti esistenti

I controlli lessicali, la lista dei prestiti e gli esiti tecnici non approvano
le associazioni. I lotti già generati richiedono il riesame descritto qui.
Questa modifica normativa non riscrive i CSV e non esegue né simula revisioni:
le prove mancanti restano da eseguire. Le regole sono comuni a proposte
estratte, relazioni inverse e composizioni manuali.

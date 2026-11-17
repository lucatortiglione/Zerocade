# Word Association IT v3.6.0

> **Revisione documentale — 16 novembre 2026.** Documento della pipeline di estrazione del 9 novembre, conservato per riproducibilità. Percorsi e comandi nei blocchi storici si riferiscono alla disposizione originaria; per il flusso corrente usare il [README principale](../../README.md). I lotti voluminosi sono locali e alcuni artefatti originari restano soltanto nella storia Git.
> [Indice e stato della documentazione](../../../docs/STATO_DOCUMENTAZIONE.md).

Il **primo step** è [raccogliere e inserire tutti i prompt dalle fonti registrate](../../PROMPT_INVENTORY.md),
con il task VS Code **1. Prompt: raccogli e inserisci inventario da tutte le fonti registrate**.
La ricerca e verifica delle associazioni viene nella fase successiva.

Il nuovo percorso con bacini estendibili, categoria per ogni prompt e selezione
casuale di **sette risposte per Livecade** è descritto in [PROMPT_DATABASE.md](../../PROMPT_DATABASE.md).
La verifica semantica precede l'inserimento in `prompt.sqlite3`;
`prompt.sql` ne conserva l'esportazione SQL. I task VS Code raccolgono fonti,
importano revisioni già effettuate e generano set dai bacini verificati.
Questo aggiornamento prevale sui riferimenti storici a sette parole qui sotto.

Le [direttive correnti](../../direttive_word_association_it_v3_6_0.md) definiscono
**contesto visibile → sette risposte nascoste**. Il catalogo contiene 172
categorie in 16 cluster, senza rinumerazione degli ID precedenti.

## CSV filtrato del lotto corrente

Il [filtro applicato al lotto 0003](../lotti/filtered-v3_6_0/lotto_0003_20261108/LEGGIMI.md)
ha riesaminato 35.000 coppie e separato 5.090 esclusioni contestuali da
29.608 parole ancora dubbie. Il
[nuovo CSV ridotto](../lotti/filtered-v3_6_0/lotto_0003_20261108/candidati_filtrati_0003.csv)
contiene 40 set completi con proposte editoriali; gli altri 4.960 prompt sono
conservati integralmente in revisione. Anche i 40 set richiedono QA indipendente.
I vecchi CSV da 5.000 righe restano sorgenti di lavoro, non il risultato filtrato.

## Lotto di 5.000 esempi

I file sono in [generated-v3_6_0](../LEGGIMI.md):

- `word_association_it_5000_candidati_0003.csv`: lotto corrente, con prima riga
  `ref,source,language,prompt,words`, un campo per cella; `ref` vuoto,
  `source` esistente conservato (`yours`), `language=it`, prompt maiuscolo e risposte minuscole con `|`.
  Le nuove esportazioni usano `ChatGPT`; le correzioni preservano le celle manuali.
- La consegna ripristina le virgole e UTF-8 senza BOM: un record completo
  per riga, con prima riga `ref,source,language,prompt,words`.
- La copia `_candidati_con_ordine_0003.csv` appartiene alle esecuzioni precedenti;
  non viene più creata automaticamente. Per richiederla usare `--with-order`.
- `word_association_it_5000_gioco_0003.csv`: copia di gioco a cinque colonne.
- `word_association_it_5000_metadati_0003.jsonl`: categoria proposta, accezione,
  evidenze, POS, difficoltà stimate e stato di revisione.
- `rapporto_revisione_semantica_0003.json`, `validazione_revisione_semantica_0003.json`
  e `audit_familiarita_revisione_0003.json`: revisione, controlli tecnici e screening dei prompt.

I file senza suffisso e i lotti precedenti sono storici: non applicavano tutti
i filtri correnti di familiarità. L'intestazione del precedente CSV principale
è stata corretta a cinque celle, conservando la copia originale con `ordine`.

Sono **candidati non approvati**. Le associazioni e la classificazione richiedono
revisione editoriale e prove indipendenti con il contesto visibile. Non vengono
inventati voti, test umani, recuperabilità o esiti safety.

## Nomi dei file progressivi

Ogni nuova esecuzione aggiunge al nome un suffisso prima dell'estensione:
`word_association_it_5000_candidati_0001.csv`, poi `_0002.csv`, `_0003.csv`, ecc.
CSV di gioco, metadati e rapporto dello stesso lotto condividono il numero
(`word_association_it_5000_gioco_0001.csv`,
`word_association_it_5000_metadati_0001.jsonl`, `rapporto_0001.json`).
La sequenza parte da 0001 in ogni cartella di output e prosegue dal numero
massimo già presente, anche se cambia il numero di esempi richiesto.
I file preesistenti senza suffisso restano consultabili con i nomi originari.
La colonna `ordine` è disponibile soltanto nella copia facoltativa
`_candidati_con_ordine_NNNN.csv`, richiesta con `--with-order`.

## Familiarità dei prompt e prestiti ammessi

[resources/prompt_policy.json](../../resources/prompt_policy.json) contiene la lista
chiusa di 462 `common_loanwords`. Si applica soltanto ai prestiti stranieri:
se un prestito non è elencato, il generatore lo esclude, anche se frequente.
Non esiste un dizionario di eccezioni `excluded_prompts`.

I normali termini italiani non devono appartenere alla lista: seguono una soglia
di familiarità Zipf italiano 3,0. Per i verbi il riferimento può essere una forma
flessa attestata nella voce; ausiliari e intestazioni di tabella sono esclusi.
La forma effettivamente usata è registrata in `prompt_familiarity.frequency_reference`.
È uno screening automatico, non una prova di familiarità o giocabilità umana.

Il filtro usa etichette lessicografiche ed etimologia diretta della stessa forma;
non tratta le traduzioni in inglese come prova di forestierismo. Le derivazioni
italiane come `filmare` restano nel percorso dei termini italiani. Le liste
non vengono estese automaticamente. L'inventario dei prestiti nel corpus è
conservato in `resources/loanword_inventory.jsonl`; non è una lista di approvazioni.

`audit_prompt_familiarity.py --csv FILE.csv --metadata METADATI.jsonl --corpus CORPUS.jsonl --output AUDIT.json`
ricontrolla le accezioni sorgente e le frequenze del lotto. Per il lotto 0003
ha verificato 5.000 contesti: tutti i 190 prestiti rilevati sono elencati,
zero contesti respinti dallo screening corrente.

## Verbi facoltativi

Il piano POS 70/20/10 è orientativo: se mancano verbi adatti, si compensano
con nomi o aggettivi, anche fino a zero verbi. La modalità lessicale ricalibra
il piano; quella editoriale conserva le selezioni senza imporre una quota di verbi.
`--strict-pos-quotas` è un'opzione aggiuntiva per pianificazioni specifiche.
Il validatore registra gli scostamenti come note, senza farli diventare gate
nemmeno con `--strict-warnings`. Qualità e sette risposte restano obbligatorie.

## Risorse e riproduzione

L'ambiente dedicato è `.venv/` (Python 3.13, escluso da Git); pacchetti e versioni
sono elencati in [resources/environment.txt](../../resources/environment.txt).
spaCy `it_core_news_md` 3.8.0 è stato eseguito su 69.598 definizioni distinte.
Frequenze e DF reali, manifest con hash e metodi, lessico morfologico del lotto
e crediti sono in [resources](../../resources/LEGGIMI.md).

Corpus originale e cache NLP rimangono fuori dal repository:
`%LOCALAPPDATA%/Zerocade/word-association/`.
Gli estratti sorgente effettivamente usati sono conservati nei metadati.

```powershell
py -3.13 -m venv gioco-zeroassociations/.venv
uv pip install --python gioco-zeroassociations/.venv/Scripts/python.exe -r gioco-zeroassociations/requirements-generation.txt
gioco-zeroassociations/.venv/Scripts/python.exe -m spacy download it_core_news_md
gioco-zeroassociations/.venv/Scripts/python.exe gioco-zeroassociations/prepare_resources.py --corpus CORPUS.jsonl --output RISORSE --processes 4
gioco-zeroassociations/.venv/Scripts/python.exe gioco-zeroassociations/generate_candidates.py --editorial-jsonl SELEZIONI_COMPLETATE.jsonl --corpus CORPUS.jsonl --frequency-csv gioco-zeroassociations/resources/frequency_ranks_it.csv --definition-df-csv gioco-zeroassociations/resources/definition_document_counts_it.csv --count 5000 --batch-id NUOVO-LOTTO --output NUOVA_CARTELLA
```

La produzione ordinaria richiede `--editorial-jsonl`: sette motivazioni individuali
e un'accezione dichiarata. Se le selezioni sono insufficienti, il generatore
scrive i prompt mancanti in `in_revisione_NNNN.jsonl` e un rapporto; non esporta
un CSV incompleto o riempito con token. I candidati esportati richiedono comunque QA.

Per ottenere soltanto suggerimenti lessicali, usare esplicitamente
`--lexical-proposals-only`, senza `--editorial-jsonl`, con corpus, frequenze e DF.
In questa modalità la cache è facoltativa: il generatore può rieseguire l'analisi sulle frasi.
Corpus, modello e hash della cache devono coincidere con il manifest. La
classificazione usa vettori semantici del modello e gli esempi del catalogo:
rimane proposta, non un'etichetta verificata. I nomi propri non vengono
estratti automaticamente come risposte; gli esempi d'uso non vengono utilizzati
come serbatoio di associazioni accidentali. Le relazioni lessicali e i contesti
inversi conservano fonte, accezione e contesto condiviso.

## Controlli e QA

```powershell
npm run test:associations
gioco-zeroassociations/.venv/Scripts/python.exe gioco-zeroassociations/validate_word_association_it_v3_6_0.py gioco-zeroassociations/generated-v3_6_0/word_association_it_5000_gioco_0003.csv --candidates-jsonl gioco-zeroassociations/generated-v3_6_0/word_association_it_5000_metadati_0003.jsonl --min-rows 5000 --require-lexical --morphology-csv gioco-zeroassociations/resources/morphology_5000.csv --frequency-csv gioco-zeroassociations/resources/frequency_ranks_it.csv --definition-df-csv gioco-zeroassociations/resources/definition_document_counts_it.csv --report-json gioco-zeroassociations/generated-v3_6_0/validazione_0003.json
```

`PASS_TECHNICAL_ONLY` non è approvazione semantica. I flag di frequenza,
omonimia, forme sconosciute e parentela morfologica richiedono esame contestuale.
I §§3.5–3.13 delle [direttive](../../direttive_word_association_it_v3_6_0.md) e la
[direttiva di pertinenza](../../DIRETTIVA_INDIZI.md) impongono anche il controllo
semantico di ogni coppia: provenienza e frequenza non sostituiscono una
relazione concreta, naturale e recuperabile nell'accezione scelta. Per ogni
risposta debole cercare un'alternativa mantenendo il prompt. Il §3.10 include
MORTE, LIGHT, COSPLAY e PALATO e richiede la disambiguazione delle relazioni
lessicali; include GUFO e SPANDERE per frequenza impropria, locuzioni spezzate
e descrittori del modo dell'azione. Niente frammenti di definizione o sinonimi
di altri sensi. I lotti
già generati richiedono questo riesame; l'aggiornamento dei documenti non
esegue una revisione né corregge automaticamente le risposte nei CSV.
`prepare_qa.py CANDIDATI.jsonl --output CARTELLA_NUOVA` crea moduli
`DA_RIVEDERE` e richieste indipendenti che mostrano il contesto e nascondono
le sette risposte. Gli aiuti UI effettivi possono essere passati con
`--ui-cues-json`; la prova deve riprodurre quelli realmente usati dal gioco.

Gli eventuali lotti storici `generated/` e `candidati_curati.csv` richiedono
verifica separata; non convertirli aggiungendo uno zero agli ID.
Le prove legacy 3→5→7 non sono valide per il nuovo protocollo v3.6.0.
Questo lotto di 5.000 esempi non viene caricato come dataset approvato nel gioco.

## Riparazioni sul lotto corrente

La [revisione del lotto 0003](../LEGGIMI.md) ha sostituito 200
risposte in 42 set, mantenendo i 5.000 prompt. Le altre 4.958 righe richiedono
ancora selezione editoriale e tutte richiedono QA indipendente.

`repair_candidates.py --directory CARTELLA --batch 0003 --revisions-jsonl
REVISIONI.jsonl --plan-json PIANO_NUOVO.json` prepara un piano controllato
senza modificare i CSV. Ogni revisione contiene `prompt`, `revision_id`,
`expected_words`, `sense_description` e sette `answers` con `word`, `relation`
e `rationale`. Un cambio di senso usa `sense_changed=true`; l'eventuale nuova
categoria è esplicita. Il piano conserva le celle manuali, verifica la
corrispondenza CSV/JSONL e contiene hash, versioni precedenti e coda di revisione.
La sua applicazione richiede di scrivere insieme le copie CSV e i metadati,
controllando gli hash prima della sostituzione; non è un'approvazione semantica.

Il generatore importa automaticamente relazioni lessicali soltanto quando
esplicitamente annidate nell'accezione selezionata. Non eredita sinonimi,
contrari, iperonimi, iponimi e correlati di pagina per il solo fatto che
rimanga un'accezione estratta. Anche le relazioni annidate richiedono selezione
semantica: la modalità di sola estrazione dichiara `LEXICAL_PROPOSALS_ONLY`;
quella ordinaria dichiara `EDITORIAL_SELECTION`. Entrambe restano candidate fino al QA.

## Casi degli screenshot e contratto aggiornato

L'[analisi dei 22 contesti](../../analisi_screenshot_word_association_20261108.md)
ricostruisce cause, parole valide e fonti, comprese DIFENDERE e MASSO negli
screenshot senza titolo. Il catalogo `resources/semantic_regressions_it.jsonl`
alimenta segnalazioni contestuali, non blacklist. `semantic_rules.py` distingue
negazioni, significati, locuzioni spezzate, descrittori, ridondanza e casi noti.
Ogni segnale conserva il prompt e richiede la ricerca di una sostituzione.

Il QA richiede `semantic_policy_version=word-association-semantic-2026-11-08.2`,
senso e gruppo di significato per ogni risposta, sei verifiche esplicite e tre
verifiche del set. Motivazioni copiate e gruppi di più di due equivalenti non
possono soddisfare il contratto. `prepare_qa.py` lascia questi giudizi da compilare:
non li inventa. Nessuna assenza di segnalazioni automatiche approva una riga.
La produzione editoriale lascia in coda anche le contraddizioni esplicite di
polarità, i cambi di lemma e le relazioni di altre accezioni rilevate e non risolte.
Una risoluzione motivata è materiale editoriale, distinto dal QA indipendente.

I sei CSV esistenti sono stati sincronizzati con le correzioni editoriali dei
casi presenti e i rispettivi metadati. I file storici mantengono i propri prompt
e profili di esportazione; non sono dataset approvati secondo la politica corrente.
La banca `resources/editorial_associations_it.jsonl` conserva le proposte riutilizzabili.

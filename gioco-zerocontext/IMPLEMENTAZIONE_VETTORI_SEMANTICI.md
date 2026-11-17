# Pipeline vettoriale corrente: codice, task e corpus pubblicato

Aggiornamento del 16 novembre 2026, basato su [ARCHITETTURA_VETTORI_SEMANTICI.md](ARCHITETTURA_VETTORI_SEMANTICI.md).
La successiva richiesta dell'utente **sospende i round speciali**.

## Stato pubblicato

Il DB `database/giochi.sqlite3`, schema `context`, contiene **93.928 tentativi e 9.513 segrete**.
Tutte le segrete appartengono al pool ordinario; il pool speciale è vuoto. Anche *monile*, *probità*
e *suppellettile* restano estraibili. Non sono stati rimossi vocaboli o segrete.
Sono disponibili tre profili selezionabili dalla regia, senza riavvio a ogni cambio:
originale FastText + retrofitting (300 float32), TurboX e Harrier Model2Vec (256 float32).
L'originale è predefinito. Ogni profilo conserva 93.928 parole e tutte le 9.513 segrete;
le classifiche e le altre stanze non cambiano quando si sostituisce il round.
I profili sono negli schemi `context_original`, `context_turbox`, `context_harrier`;
lo schema `context` precedente resta invariato. Origini, backup e uso sono descritti in
[PROFILI_ASSOCIAZIONI.md](PROFILI_ASSOCIAZIONI.md).

Le regressioni semantiche misurate per TurboX e Harrier restano registrate. Le vecchie
misure geometriche sono archiviate nei loro dettagli e non ricalcolate per i nuovi spazi.
La pipeline BGE-M3 descritta sotto è implementata ma non è stata eseguita sull'intero corpus.
Per installare questo nuovo codice su un server già aperto occorre un solo riavvio iniziale;
poi ogni cambio funziona sullo stesso processo.

Tutti i round di produzione sono ordinari, compresi il nono e il diciottesimo: niente timer survival,
limite di 100 tentativi o bonus speciali. Resta il limite infrastrutturale ordinario di 10.000 tentativi.
Il torneo mantiene il suo regolamento. La logica survival è conservata per compatibilità e test,
ma non viene attivata dal server né esposta come opzione alla regia.

## Generazione configurata

`resources/semantic-vectors.json` definisce `context-vectors-1`:

1. **Model2Vec 0.10.0**, docente `BAAI/bge-m3` alla revisione fissa
   `5617a9f61b028005a4858fdac845db406aefb181`, senza codice remoto. Si distillano i token
   e i vocaboli aggiunti, con pooling CLS, PCA a 300 componenti e pesi SIF basati sulla legge Zipf.
   Questi pesi approssimano le frequenze dal rango dei token: sono distinti dai valori wordfreq
   impiegati nei filtri delle segrete.
2. **Prompt-averaging denso offline** sulle quattro cornici italiane della guida, per verbi, lemmi
   dei domini accreditati e sensi revisionati. `scope: "all"` estende il calcolo a tutto il vocabolario.
   La PCA è condivisa con i vettori statici, così i contesti non finiscono in uno spazio diverso.
3. **Fallback FastText** solo per righe statiche nulle o non finite. Una trasformazione Ridge da
   ancore comuni allinea FastText allo spazio distillato: non si mescolano direttamente coordinate
   provenienti da modelli diversi. Numero di fallback, ancore e coseno sulle ancore sono registrati.
   Il modello FastText usa gli n-grammi realmente addestrati (`minn=maxn=5`), come nella prima implementazione.
4. **Retrofitting con margine**: ancoraggio ai vettori iniziali, attrazione dei sinonimi e penalità hinge
   per gli antonimi ancora troppo vicini. Default: 15 iterazioni, α=1, β=0,8, γ=0,5, margine quadratico 1,2.
   Una discesa proiettata con riduzione del passo conserva norme unitarie e un obiettivo non crescente.
   Non si promette che qualunque grafo soddisfi tutti i margini: il collaudo verifica il risultato.
5. **Esportazione** di `vectors.bin`, `embeddings_300d.npy`, `vocab_index.json`, configurazione,
   sonde e rapporti. Default float32, formato raccomandato dal §7 della guida; `storage: "float16"`
   dimezza matrice su disco e in memoria. Nel runtime i binary16 restano compatti e una norma per riga
   corregge l'errore angolare della quantizzazione. Int8 e float32 storici restano leggibili.

Il codice usa l'[API Model2Vec documentata](https://minish.ai/packages/model2vec/distillation/):
`pca_dims` e `sif_coefficient`, con l'adattatore alla versione 0.10. I nomi `pca_to_dimension`,
`apply_zipf` e `use_subword` dello pseudocodice non sono passati come argomenti inesistenti.
Il pooling CLS segue il [docente BGE-M3](https://huggingface.co/BAAI/bge-m3).

## Collaudo obbligatorio

`quality.json` registra:

- `cos(caldo, freddo) < cos(caldo, tiepido)`;
- norme entro 1±0,001 e `cos(scialacquamento, scialacquare) >= 0,65`;
- media del coseno su 10.000 coppie distinte campionate con seme fissato, tra 0,05 e 0,15.

Le sonde esterne alla guess list non vengono aggiunte alle segrete né al vocabolario personalizzato
di Model2Vec. Dopo l'eventuale quantizzazione si ricontrollano i valori effettivamente esportati.
Per i candidati `context-vectors-1` il publisher ripete il collaudo sui file binari
e blocca un candidato fallito, incompleto o alterato. L'importazione diretta Harrier descritta sopra
è distinta: mantiene i controlli strutturali e registra le regressioni semantiche richieste in pubblicazione.
Non abbassa automaticamente le soglie per ottenere una pubblicazione. Il controllo di conservazione
confronta tutti i nomi delle segrete precedenti: anche una sostituzione a conteggio invariato viene bloccata.

Questi test automatici non certificano la qualità linguistica dell'intero spazio. I tempi indicativi della
guida non sono presentati come benchmark misurati su questo PC: il server precalcola il ranking a inizio
round e ogni tentativo usa un lookup, senza inferenza neurale o moltiplicazione completa a ogni messaggio.

## Task e ambiente

L'ambiente **`.venv-vectors`** è separato da `.venv-semantic`: Model2Vec 0.10 richiede Transformers <5.4,
mentre il profilo sperimentale precedente usa Transformers 5.23. Entrambi superano `pip check`.

| Task | Operazione |
| --- | --- |
| `00)ZeroContext : Contesti` | Nuova pipeline completa e pubblicazione soltanto dopo collaudo |
| `00)ZeroContext : Aggiornamento banca e rigenerazione segrete, vocabolario e vettori.` | Stessa pipeline, selezione dal DB, conservazione delle segrete |
| `00a)ZeroContext : Vettori semantici (pilota 1024 parole)` | Campione separato non pubblicabile |
| `00p)ZeroContext : Piano dei vettori semantici` | Configurazione e conteggi senza download o scritture |
| `ZeroContext: test vettori semantici` | Docente locale sintetico, qualità, fallback, margine e pubblicazione |
| `00b)ZeroContext : Ensemble storico (pilota 256 parole)` | Confronto FastText/ConceptNet/LSA senza pubblicazione |

```powershell
.venv-vectors/Scripts/python.exe -B script/build_context_semantic.py --plan
.venv-vectors/Scripts/python.exe -B script/build_context_semantic.py --limit 1024
.venv-vectors/Scripts/python.exe -B script/build_context_semantic.py --publish
```

Il primo build richiede download del docente e distillazione offline; su CPU può essere costoso.
Anche il pilota conserva il tokenizer del docente, quindi non equivale a un docente piccolo.
Le cache riusabili sono identificate da parole, configurazione, pacchetti e hash del codice; le impronte
degli artefatti vengono verificate prima del riuso. Il pilota ha una ricevuta separata dalla generazione completa.

# ZeroContext — Strategie per ampliare segrete, vocabolario e vettori

La pipeline subword e il retrofitting descritti fra queste strategie sono implementati.
Il vocabolario di gioco comprende 93.928 parole. Il corpus originale conserva tutte le 6.838 segrete precedenti tra le sue 9.513 segrete. Per scegliere fra Originali, ABTT, Pipeline B e Riordino consulta la [guida ai profili](PROFILI_ASSOCIAZIONI.md).
Vedi [implementazione corrente](IMPLEMENTAZIONE_VETTORI_SEMANTICI.md). Le proposte sotto conservano il
confronto con la precedente pipeline FastText/ConceptNet/LSA e non descrivono tutte il runtime attivo.

## Tre insiemi distinti

| Insieme | Criterio di crescita |
| --- | --- |
| Vocabolario dei tentativi | Parole italiane attestate e utili alla chat, comprese forme flesse ammesse dalla politica |
| Banca delle segrete | Lemmi familiari e riconoscibili, con vicinanze che permettono di arrivare alla soluzione |
| Copertura dei vettori | Rappresentazioni disponibili e valutate per tutte le parole selezionate |

Una parola può essere un tentativo valido senza essere adatta come segreta.
Non serve aumentare il numero di dimensioni per aggiungere parole: cresce il numero di righe.

## Ordine di intervento consigliato

1. **Sfruttare l'inventario esistente.** Rieseguire la valutazione dei candidati e separare i motivi
   di esclusione: poca familiarità, assenza di vettori, forma flessa, nome proprio, ambiguità.
   I rapporti del 14 novembre non vanno sommati ai conteggi attuali: controllare la differenza con il corpus attivo.
2. **Rivedere la riserva `esteso`.** La banca CSV la conserva, ma `SECRET_TIERS` ammette soltanto
   `livecade`, `base` e `comune`. Un ampliamento può promuovere un sottoinsieme revisionato o introdurre
   una difficoltà avanzata. Serve una modifica esplicita della politica: il nuovo task mantiene i filtri correnti.
3. **Aumentare la copertura fastText.** `fetch_vectors.py` acquisisce per impostazione predefinita
   le prime 300.000 parole e accetta `--words`. Una cache candidata più ampia può recuperare parole
   attestate oggi escluse per mancanza di vettore. Non promuovere tutto il dizionario: contiene anche rumore.
4. **Valutare i vettori per parole fuori vocabolario.** Il modello binario fastText può comporre
   vettori tramite sottoparole. Lo scaricamento parziale attuale non conserva quel modello completo:
   occorre un passaggio offline distinto. Un vettore calcolabile non prova che la parola esista o sia familiare.
   Vedi [documentazione ufficiale fastText](https://fasttext.cc/docs/en/crawl-vectors.html).
5. **Ampliare le definizioni e il contesto.** Integrare nuove versioni delle fonti già registrate,
   mantenendo snapshot e provenienza. Wikizionario estratto con Wiktextract/Kaikki offre forme,
   categorie grammaticali e sensi; scegliere un'accezione pertinente, senza contare mirror come fonti indipendenti.
   Vedi [dati italiani Kaikki](https://kaikki.org/itwiktionary/Italiano/index.html).
6. **Migliorare il blocco LSA.** Aggiungere definizioni mancanti, correggere sensi ambigui e confrontare
   TF-IDF/SVD prima e dopo l'espansione. Più testi non garantiscono vicinanze migliori; mantenere un insieme
   di valutazione indipendente. Metodo: [LSA in scikit-learn](https://scikit-learn.org/stable/modules/decomposition.html#truncated-singular-value-decomposition-and-latent-semantic-analysis).
7. **Usare relazioni e dati di gioco.** Sinonimi, iperonimi e collegamenti verificati possono suggerire
   candidati; la telemetria può segnalare parole frequenti non riconosciute. Ogni proposta mantiene la propria
   provenienza e passa la selezione. Numberbatch e il grafo ConceptNet sono risorse diverse:
   [progetto ufficiale Numberbatch](https://github.com/commonsense/conceptnet-numberbatch).

I modelli neurali opzionali possono essere confrontati con il profilo statistico, ma richiedono
ambiente, pesi e misure separati. Non è necessario introdurli per ampliare la banca esistente.

## Alternative a fastText

| Metodo | Uso possibile in ZeroContext | Limite da valutare |
| --- | --- | --- |
| ConceptNet Numberbatch | Vettori di concetti e conoscenze già utilizzati dal gioco | Copertura italiana incompleta e parole mancanti |
| TF-IDF + LSA | Vettori dalle definizioni italiane, con strumenti statistici già presenti | Dipendenza dalla copertura e dall'accezione delle definizioni |
| Word2Vec o GloVe | Vettori statici da un corpus italiano adeguato | Il lessico disponibile dipende dal modello; niente composizione automatica delle parole nuove come in fastText |
| Multilingual E5 | Embedding di parola e definizione, da confrontare sul ranking del gioco | Prefissi e formato dell'ingresso devono seguire la scheda del modello |
| BGE-M3 | Embedding multilingue; per il gioco si può valutare la rappresentazione densa | Costo di generazione e compressione da misurare |
| GTE multilingual | Embedding multilingue di schede lessicali | Il profilo locale usa codice del modello fissato a una revisione specifica |

Fonti primarie: [Numberbatch](https://github.com/commonsense/conceptnet-numberbatch),
[LSA](https://scikit-learn.org/stable/modules/decomposition.html#truncated-singular-value-decomposition-and-latent-semantic-analysis),
[Word2Vec in Gensim](https://radimrehurek.com/gensim/models/word2vec.html),
[GloVe](https://nlp.stanford.edu/projects/glove/),
[E5](https://huggingface.co/intfloat/multilingual-e5-base),
[BGE-M3](https://huggingface.co/BAAI/bge-m3),
[GTE](https://huggingface.co/Alibaba-NLP/gte-multilingual-base).

E5, BGE e GTE sono già previsti nel profilo opzionale `resources/ensemble.json`;
il profilo statistico corrente resta fastText + ConceptNet + LSA. Per il confronto conviene
codificare schede del tipo «parola: definizione nel senso scelto», mantenendo lo stesso insieme
di valutazione. Una migliore prestazione su ricerca documentale non dimostra un migliore gioco di associazioni.

La proposta leggera da sperimentare è ConceptNet + LSA; quella neurale è un singolo encoder
multilingue confrontato con la base statistica. Per eliminare davvero fastText occorre adattare
la pipeline: attualmente configurazione e acquisizione degli ingressi prevedono entrambe le fonti
lessicali, anche se un peso viene posto a zero. I vettori finali possono essere precalcolati offline,
senza eseguire il modello neurale nel server o nell'overlay durante la diretta.

## Verifiche prima della promozione

- Attestazione italiana, lemma, frequenza, parte del discorso e assenza di duplicati o plurali puri da escludere.
- Vicine pertinenti e fuorvianti lette su un campione di segrete, comprese parole ambigue e diversi temi.
- Copertura di ogni blocco, vettori nulli, valori finiti e ordine delle righe coerente con il vocabolario.
- Confronto con il corpus precedente e misura della perdita dovuta a PCA e quantizzazione.
- Tempi di download, caricamento e ranking; memoria del server e degli overlay durante una sessione rappresentativa.

Le coppie usate per costruire i collegamenti non bastano come verifica indipendente della qualità.
Le soglie pubbliche di colore sono posizioni assolute: un vocabolario più grande cambia la loro
percentuale di copertura e la difficoltà della ricerca, anche lasciando invariati i punti.

## Limiti del formato corrente

Il limite dichiarato è 200.000 parole, 1.024 dimensioni e 128 MiB di dati vettoriali int8.
A 768 dimensioni il vincolo di 128 MiB consente al massimo **174.762 righe**:
150.000 parole occuperebbero 115.200.000 byte di soli vettori, circa 109,9 MiB.
È un calcolo del formato, non una prova di sostenibilità della memoria totale del runtime.

Per superare quel budget occorre valutare meno dimensioni, una rappresentazione diversa o nuovi limiti
con misure; non basta alzare il numero massimo di parole. I modelli di ricerca approssimata possono
essere studiati separatamente, perché il gioco attuale assegna posizioni esatte sull'intero vocabolario.

## Task disponibile e passi successivi

**00)ZeroContext : Aggiornamento banca e rigenerazione segrete, vocabolario e vettori.**
seleziona segrete, vocabolario e frequenze direttamente dal DB lessicale, senza CSV.
Genera e verifica il candidato completo prima di pubblicare, senza corpus intermedio:
[procedura](README.md#task-di-aggiornamento-della-banca). Le nuove segrete richiedono fascia
`base` o `comune`; le esistenti sono conservate salvo esclusioni e plurali puri.
Non si applica un minimo Zipf globale alle segrete: il vincolo 2,85 è stato annullato.
Le candidate già valutate `DA_RIVEDERE` o `NON_CONSIGLIATA` restano fuori dalle nuove segrete.
Non aumenta automaticamente il limite della cache fastText.

Per un ampliamento controllato, la proposta è: valutazione del delta, revisione della riserva,
maggiore copertura vettoriale, prova del candidato e pubblicazione di una generazione coerente.
Il numero effettivo di nuove segrete si può conoscere solo dopo questi controlli.

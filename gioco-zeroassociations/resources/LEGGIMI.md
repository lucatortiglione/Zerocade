# Risorse reali del lotto

- `frequency_ranks_it.csv`: 302.260 forme canoniche dalla lista italiana di
  wordfreq 3.1.1; i ranghi sono della forma, consultati attraverso i lemmi,
  senza inventare una nuova graduatoria lemmatizzata.
- `definition_document_counts_it.csv`: presenza distinta di ogni lemma in
  69.598 definizioni ammesse dal filtro del corpus Kaikki/Wikizionario.
  Definizioni identiche sono deduplicate; ripetizioni interne contano una volta;
  gli esempi d'uso non entrano nel denominatore.
- `resources.json`: fonti, date, licenze, modello, metodo e hash.
- `morphology_selection.csv`: insieme di analisi Morph-it! usato come filtro
  conservativo nella selezione del lotto.
- `morphology_5000.csv`: tutte le analisi note delle forme presenti nel lotto
  finale, per audit deterministico; le forme sconosciute restano da revisionare.
- I rispettivi file JSON documentano la conversione: ISO-8859-1 → UTF-8/NFC,
  mappatura esplicita dei tag, sole forme richieste dal lotto, nessuna analisi
  sintattica inventata. Le analisi ambigue vengono conservate.
- `environment.txt`: versioni effettive dell'ambiente Python.
- `prompt_policy.json`: lista chiusa di prestiti comuni ammessi e soglia
  sperimentale di familiarità per i normali contesti italiani. Nessuna lista
  di esclusioni puntuali; ogni prestito non elencato è trattenuto per revisione.
- `loanword_inventory.jsonl`: segnali di prestito rilevati nelle voci del corpus,
  con frequenza e definizione; non costituisce una lista di parole approvate.

Fonti: [Wikizionario](https://it.wiktionary.org/), estrazione
[Kaikki/Wiktextract](https://kaikki.org/itwiktionary/Italiano/), dump 1 novembre
2026, estrazione 3 novembre 2026; dati e adattamenti del corpus con attribuzione
CC BY-SA 4.0. Frequenze: [wordfreq](https://github.com/rspeer/wordfreq),
Robyn Speer, codice Apache 2.0 e dati secondo le condizioni delle fonti riportate
nel progetto. Morfologia: Morph-it! 0.4.8, Marco Baroni ed Eros Zanchetta;
vedere [README originale](MORPHIT_README.txt), con licenze alternative
CC BY-SA 2.0 e GNU indicate dalla fonte.

Il modello italiano [spaCy](https://spacy.io/models/it) 3.8.0 riporta
CC BY-NC-SA 3.0 nel suo manifest. I pesi non sono inclusi negli artefatti del lotto;
rimangono nell'ambiente locale. Corpus completo e cache di analisi rimangono
nella cache esterna indicata dal manifest. Le tabelle non certificano
pertinenza, indovinabilità o correttezza semantica.

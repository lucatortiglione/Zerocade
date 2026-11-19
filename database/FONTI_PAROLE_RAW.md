# Fonti delle parole RAW

Catalogo del registro locale al **18 novembre 2026**.

Il task **ZeroCade : Aggiornamento parole RAW** elabora le **9 fonti** del registro, tutte remote: LiITA Lemma Bank,
CompL-it (CNR), Wikizionario e Wiktionary inglese tramite Kaikki (solo voci in lingua italiana), Morph-it!, CoLFIS (CNR),
Nuovo vocabolario di base di De Mauro, MAGIC (ILC-CNR) e PAISÀ. Non applica limiti al
numero di righe né filtri Zipf. Le fonti precedenti (46, tra cui le liste di parole, i treebank, GLAFF-IT, Flex-it,
UniMorph, De Mauro, i dizionari LibreOffice e i Wiktionary francese, tedesco e spagnolo) sono state tolte dal registro:
alla prima esecuzione il task ne elimina le attestazioni e le parole rimaste senza altra fonte (`prune_sources`).

Le fonti sono definite in [prompt_inventory_sources.json](../gioco-zeroassociations/resources/prompt_inventory_sources.json).
Gli URL e le revisioni sotto sono quelli del registro.

## Task e destinazione

- In VS Code: **Terminale → Esegui attività → ZeroCade : Aggiornamento parole RAW**.
- Configurazione: [tasks.json](../.vscode/tasks.json).
- Procedura: [aggiorna_parole_raw.py](../gioco-zeroassociations/script/aggiorna_parole_raw.py).
- Destinazione: `database/parole_ita_raw_2.0.sqlite3`, tabella **`parole`**.
- Provenienza: tabelle `fonti`, `parole_fonti` e `inventory_snapshots`.
- Backup del secondo DB prima degli aggiornamenti: `gioco-zeroassociations/database-backups/parole_raw_2.0-<data>.sqlite3`.
- Rapporto: `gioco-zeroassociations/reports/aggiornamento_parole_raw_2.0.json`.
- Cache dei download: `%LOCALAPPDATA%/Zerocade/word-association/`.
- Una fonte fallita viene registrata e le altre vengono comunque tentate; il task termina con codice 2 se rimangono errori.

## Le fonti

LiITA, CompL-it, CoLFIS, MAGIC e PAISÀ contengono solo **lemmi** (niente forme flesse né nomi propri): per i verbi quindi l'infinito.

### 1. LiITA Lemma Bank

- ID: `liita-lemma-bank`; formato `liita_ttl` (Turtle, un blocco `lila:Lemma` per lemma con `ontolex:writtenRep` e `lila:hasPOS`).
- Fonte: [LiITA-LOD/LiITA_LemmaBank](https://github.com/LiITA-LOD/LiITA_LemmaBank), file `TTL/liitaTTLRDF.ttl` (circa 48 MB), revisione `bb66481368ee70f1c036305e3b68eb32845911d9`.
- Contenuto: circa 126.000 lemmi derivati dal Nuovo De Mauro. Si scartano i `lila:proper_noun`.
- Licenza: CC BY-SA 4.0. Attribuzione: CIRCSE, Università Cattolica del Sacro Cuore e Università di Torino.

### 2. CompL-it (ILC-CNR)

- ID: `complit-cnr`; formato `complit_ttl` (OntoLex-Lemon, gzip). Si leggono le voci `ontolex:Word` e `ontolex:MultiwordExpression` con `rdfs:label`; le forme flesse (`ontolex:Form`) e i sensi si ignorano; si scartano i `lexinfo:properNoun`.
- Fonte: [CLARIN-IT, handle 20.500.11752/ILC-1007](http://hdl.handle.net/20.500.11752/ILC-1007), file `complit.ttl.gz` (24,8 MB, MD5 `dde4d1a52f37915419b8b535f27d3fe7`).
- Contenuto: 101.795 voci, 791.541 forme, derivato da LexicO e M-GLF.
- Licenza: **CC BY-NC-SA 4.0, solo uso non commerciale**. Attribuzione: F. Sciolette, E. Giovannetti, S. Marchi, A. Bellandi, ILC-CNR (2024).

### 3. Wikizionario e Wiktionary tramite Kaikki

- `kaikki-itwiktionary`: Wikizionario italiano completo, [kaikki.org](https://kaikki.org/itwiktionary/Italiano/kaikki.org-dictionary-Italiano.jsonl); formato `wiktextract`.
- `kaikki-enwiktionary-it`: voci italiane del Wiktionary inglese, [kaikki.org](https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl); formato `wiktextract`.
- Licenza: CC BY-SA / GFDL. Attribuzione: contributori Wikizionario e Wiktionary; estrazione Kaikki/Wiktextract.
- Sono anche la base del [filtro dei nomi di persona](PAROLE_RAW_2.0.md#nomi-di-persona-e-cognomi-18112026).

### 4. Morph-it!

- ID: `morphit-048-mirror`; formato `morphit`.
- Fonte: [morph-it_048_utf8.txt](https://raw.githubusercontent.com/giodegas/morphit-lemmatizer/b99d75d774367e4bedc5c5f339dec384777488ff/master/morph-it_048_utf8.txt), copia pubblica nel repository giodegas/morphit-lemmatizer, revisione `b99d75d774367e4bedc5c5f339dec384777488ff`.
- Riferimento: [Morph-it!](https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it). Il vecchio indirizzo ufficiale non era raggiungibile; il download proviene dal mirror.
- Licenza: CC BY-SA 2.0 / licenze GNU indicate nel README originale. Attribuzione: Marco Baroni ed Eros Zanchetta, 2004–2009.
- È la fonte che fornisce forma, lemma e categoria per riportare le forme flesse all'infinito o al maschile singolare.

### 5. CoLFIS (CNR, SNS)

- ID: `colfis-cnr`; formato `colfis_lemmas` (file `Lemmi_rango.txt` in un archivio zip, codifica latin-1, campi separati da due o più spazi).
- Fonte: [Corpus e Lessico di Frequenza dell'Italiano Scritto](https://www.istc.cnr.it/it/node/69979), file `files/Lemmi_rango_txt.zip` del Laboratorio di Linguistica «Giovanni Nencioni» (SNS). Poiché `linguistica.sns.it` non risponde da tutte le reti, il registro usa la copia identica dell'Internet Archive del 15/08/2025.
- Contenuto: circa 52.000 lemmi con frequenza, estratti da 3,8 milioni di occorrenze (giornali, periodici, libri 1992-1994). Si scartano i nomi propri (categoria E), i segni (K, Z) e i frammenti non lessicali (X); i lemmi sintagmatici (`a causa di`) restano come voci non singole.
- Licenza: scaricabile gratuitamente, nessuna licenza esplicita; citare la fonte. Attribuzione: P. M. Bertinetto, C. Burani, A. Laudanna, L. Marconi, D. Ratti, C. Rolando, A. M. Thornton.

### 6. Nuovo vocabolario di base di De Mauro (NVdB 2016)

- ID: `nvdb-de-mauro-2016`; formato `nvdb_text`.
- Fonte: [estrazione testuale di Alberto Pettarin](https://raw.githubusercontent.com/pettarin/nvdb/b5fb7f8d916a426934bcd20adc84bf97ab5899f6/nvdb.full.txt), circa 7.200 lemmi del vocabolario di base.
- Elenco a cura di Tullio De Mauro, Isabella Chiari e Francesca Ferrucci (Internazionale, 2016); estrazione CC BY 4.0 / pubblico dominio.

### 7. MAGIC (ILC-CNR)

- ID: `magic-ilc-cnr`; formato `magic_forms` (righe `MACRO:word[l_<lemma>,<forma>,<categoria>,...]`): si leggono i soli lemmi, circa 92.000, dunque l'infinito per i verbi.
- Fonte: [CLARIN-IT, handle 20.500.11752/ILC-1002](http://hdl.handle.net/20.500.11752/ILC-1002), file `forme_generate_formato_magic.txt.utf8` (43,9 MB, MD5 `293308cc31cd1ffa4f607798dcd87ab6`), 728.258 forme.
- Licenza: **CC BY-NC-SA 4.0, solo uso non commerciale**. Autori: Vito Pirrelli e Marco Battista (1999).

### 8. PAISÀ (Eurac, CNR-ILC)

- ID: `paisa-eurac`; formato `paisa_lemmas` (gzip, righe `lemma,frequenza`).
- Fonte: [CLARIN Eurac, handle 20.500.12124/3](https://clarin.eurac.edu/repository/xmlui/handle/20.500.12124/3), file `lemma-WITHOUTnumberssymbols-frequencies-paisa.txt.gz` (circa 1,6 milioni di lemmi da testi web).
- Poiché i testi web sono rumorosi (nomi, errori, parole straniere), il registro fissa **`min_frequency` = 50** (circa 86.000 lemmi): si cambia nel registro. Le parole straniere passano comunque dal filtro di lingua.
- Licenza: **CC BY-NC-SA, solo uso non commerciale**.

## Valori per parola: Word Prevalence e Contextual Diversity

Non sono fonti di parole: il task **Normalizzare parole RAW** le scarica in cache (`%LOCALAPPDATA%/Zerocade/word-association/metrics/`) per
calcolare l'[IWFS](PAROLE_RAW_2.0.md#italian-word-familiarity-score-iwfs-18112026) di ogni parola di `normalizzata`.

- **Italian Crowdsourcing Project (ICP)**: `ICP_prevalence.txt` (130.495 parole: `spelling`, `nobs`, `accuracy`, `prevalence`), progetto
  [OSF e4x7w](https://osf.io/e4x7w/). Amenta, De Varda, Mandera, Keuleers, Brysbaert, Marelli, *The Italian Crowdsourcing Project: Visual word
  recognition times for 130,495 Italian words*, Behavior Research Methods (2025). Il file è raggiungibile con un link OSF in sola lettura e nel
  readme non c'è una licenza: va verificata prima di un uso commerciale.
- **SUBTLEX-IT**: `subtlex-it.csv` (517.564 forme dai sottotitoli, latin-1), progetto [OSF zg7sc](https://osf.io/zg7sc/); si usano `cd_count` (film
  distinti), `freq_count` e `dom_lemma_freq`. Crepaldi, Amenta, Pawel, Keuleers, Brysbaert (2015). Licenza CC BY-NC-SA (uso non commerciale).

## Fonti richieste e non aggiunte

GRADIT (UTET), Vocabolario Treccani e Lo Zingarelli (Zanichelli) non hanno un elenco di lemmi scaricabile con licenza aperta;
i siti vietano la raccolta automatica (robots.txt di Zanichelli per `/dizionarionline/` e `/opere/`; Treccani limita i crawler).
Il Nuovo De Mauro di Internazionale (derivato dal GRADIT) era nel registro con `de-mauro-sitemaps` e può tornarci. Per
aggiungere questi dizionari serve un file in licenza dell'utente da registrare come fonte locale.

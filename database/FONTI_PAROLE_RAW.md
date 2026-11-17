# Fonti delle parole RAW

Catalogo del registro locale al **16 novembre 2026**.

Il task **ZeroCade : Aggiornamento parole RAW** elabora tutte le **46 fonti** configurate: 45 fonti remote e 1 fonte locale wordfreq. Non applica limiti al numero di righe né filtri Zipf.

Le fonti sono definite in [prompt_inventory_sources.json](../gioco-zeroassociations/resources/prompt_inventory_sources.json). Gli URL e le revisioni sotto sono quelli del registro; il task controlla anche le revisioni Git correnti e i dump Wikimedia `latest`, conservando nel rapporto gli URL effettivamente acquisiti.

## Task e destinazione

La selezione successiva segue i [criteri di genere e numero](NORMALIZZAZIONE_PAROLE_RAW.md):
femminile quando manca un maschile equivalente e plurale soltanto quando più comune.
Il download RAW conserva comunque tutte le forme.

- In VS Code: **Terminale → Esegui attività → ZeroCade : Aggiornamento parole RAW**.
- Configurazione: [tasks.json](../.vscode/tasks.json).
- Procedura: [aggiorna_parole_raw.py](../gioco-zeroassociations/script/aggiorna_parole_raw.py).
- Destinazione: `database/parole_ita_raw_2.0.sqlite3`, tabella **`parole`**.
- Pulizia e deduplicazione: emoji, faccine e simboli decorativi rimossi; Unicode, maiuscole/minuscole e spazi normalizzati; `parola` è la chiave primaria. [Regole](PULIZIA_PAROLE_RAW.md).
- Provenienza: tabelle `fonti`, `parole_fonti` e `inventory_snapshots`.
- Backup del secondo DB prima degli aggiornamenti: `gioco-zeroassociations/database-backups/parole_raw_2.0-<data>.sqlite3`.
- Rapporto aggiornato dopo ogni fonte: `gioco-zeroassociations/reports/aggiornamento_parole_raw_2.0.json`.
- Cache dei download: `%LOCALAPPDATA%/Zerocade/word-association/`.
- Wordfreq: il task rigenera il CSV dall’intera lista italiana `large` del pacchetto installato.
- Tutte le forme vengono raccolte senza scarti editoriali, filtri Zipf o esclusioni di genere/numero. Le decisioni del vecchio DB non sono importate nel secondo archivio.
- Una fonte fallita viene registrata e le altre vengono comunque tentate; il task termina con codice 2 se rimangono errori.
- La raccolta RAW non pubblica automaticamente parole o associazioni nei giochi.

Il secondo archivio è stato inizializzato dalla raccolta locale esistente con
**2.847.433 voci uniche**, 46 fonti e 7.273.769 collegamenti parola/fonte.
Questa inizializzazione non è un nuovo download. Le successive esecuzioni del task
controllano tutte le fonti e inseriscono le novità senza duplicare le parole.
Dettagli e query in [PAROLE_RAW_2.0.md](PAROLE_RAW_2.0.md).

## Tutte le fonti del registro

### 01. Wikizionario italiano completo, tramite Kaikki

- ID: `kaikki-itwiktionary`.
- Formato: `wiktextract`.
- Fonte: [Wikizionario italiano completo, tramite Kaikki](https://kaikki.org/itwiktionary/Italiano/kaikki.org-dictionary-Italiano.jsonl).
- Licenza dichiarata: CC BY-SA / GFDL secondo Wikizionario
- Attribuzione: Contributori Wikizionario; estrazione Kaikki/Wiktextract
- Parametri della fonte: `{"cache_file":"kaikki.org-dictionary-Italiano.jsonl","definition_language":"it"}`.

### 02. Lessico italiano di Wiktionary inglese, tramite Kaikki

- ID: `kaikki-enwiktionary-it`.
- Formato: `wiktextract`.
- Fonte: [Lessico italiano di Wiktionary inglese, tramite Kaikki](https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl).
- Licenza dichiarata: CC BY-SA / GFDL secondo Wiktionary
- Attribuzione: Contributori Wiktionary; estrazione Kaikki/Wiktextract
- Parametri della fonte: `{"cache_file":"kaikki.org-dictionary-Italian-enwiktionary.jsonl","definition_language":"en"}`.

### 03. Titoli Wikipedia italiana

- ID: `wikipedia-it`.
- Formato: `wiki_titles`.
- Fonte: [Titoli Wikipedia italiana](https://dumps.wikimedia.org/itwiki/20261101/itwiki-20261101-all-titles-in-ns0.gz).
- Licenza dichiarata: Titoli e URL di voci; nessun testo degli articoli importato
- Attribuzione: Contributori Wikipedia; Wikimedia dumps
- Parametri della fonte: `{"cache_file":"itwiki-20261101-all-titles-in-ns0.gz","wiki_base":"https://it.wikipedia.org/wiki/"}`.

### 04. Titoli Wikizionario, tutte le lingue presenti nell'edizione italiana

- ID: `wiktionary-it-titles`.
- Formato: `wiki_titles`.
- Fonte: [Titoli Wikizionario, tutte le lingue presenti nell'edizione italiana](https://dumps.wikimedia.org/itwiktionary/20261101/itwiktionary-20261101-all-titles-in-ns0.gz).
- Licenza dichiarata: Titoli e URL di voci; nessun testo importato
- Attribuzione: Contributori Wikizionario; Wikimedia dumps
- Parametri della fonte: `{"wiki_base":"https://it.wiktionary.org/wiki/"}`.

### 05. Titoli Wikisource italiana

- ID: `wikisource-it`.
- Formato: `wiki_titles`.
- Fonte: [Titoli Wikisource italiana](https://dumps.wikimedia.org/itwikisource/20261101/itwikisource-20261101-all-titles-in-ns0.gz).
- Licenza dichiarata: Titoli e URL di voci; nessun testo importato
- Attribuzione: Contributori Wikisource; Wikimedia dumps
- Parametri della fonte: `{"wiki_base":"https://it.wikisource.org/wiki/"}`.

### 06. Titoli Wikiquote italiana

- ID: `wikiquote-it`.
- Formato: `wiki_titles`.
- Fonte: [Titoli Wikiquote italiana](https://dumps.wikimedia.org/itwikiquote/20261101/itwikiquote-20261101-all-titles-in-ns0.gz).
- Licenza dichiarata: Titoli e URL di voci; nessun testo importato
- Attribuzione: Contributori Wikiquote; Wikimedia dumps
- Parametri della fonte: `{"wiki_base":"https://it.wikiquote.org/wiki/"}`.

### 07. Titoli Wikivoyage italiana

- ID: `wikivoyage-it`.
- Formato: `wiki_titles`.
- Fonte: [Titoli Wikivoyage italiana](https://dumps.wikimedia.org/itwikivoyage/20261101/itwikivoyage-20261101-all-titles-in-ns0.gz).
- Licenza dichiarata: Titoli e URL di voci; nessun testo importato
- Attribuzione: Contributori Wikivoyage; Wikimedia dumps
- Parametri della fonte: `{"wiki_base":"https://it.wikivoyage.org/wiki/"}`.

### 08. Titoli Wikiversità italiana

- ID: `wikiversity-it`.
- Formato: `wiki_titles`.
- Fonte: [Titoli Wikiversità italiana](https://dumps.wikimedia.org/itwikiversity/20261101/itwikiversity-20261101-all-titles-in-ns0.gz).
- Licenza dichiarata: Titoli e URL di voci; nessun testo importato
- Attribuzione: Contributori Wikiversità; Wikimedia dumps
- Parametri della fonte: `{"wiki_base":"https://it.wikiversity.org/wiki/"}`.

### 09. Titoli Wikinotizie italiana

- ID: `wikinews-it`.
- Formato: `wiki_titles`.
- Fonte: [Titoli Wikinotizie italiana](https://dumps.wikimedia.org/itwikinews/20261101/itwikinews-20261101-all-titles-in-ns0.gz).
- Licenza dichiarata: Titoli e URL di voci; nessun testo importato
- Attribuzione: Contributori Wikinotizie; Wikimedia dumps
- Parametri della fonte: `{"wiki_base":"https://it.wikinews.org/wiki/"}`.

### 10. Hunspell, dizionario ortografico italiano LibreOffice

- ID: `libreoffice-it-dictionary`.
- Formato: `hunspell`.
- Fonte: [Hunspell, dizionario ortografico italiano LibreOffice](https://raw.githubusercontent.com/LibreOffice/dictionaries/c0865a85eb67dc377f2cf8e8fe2c4fa9e53f0dcb/it_IT/it_IT.dic).
- Revisione nel registro: `c0865a85eb67dc377f2cf8e8fe2c4fa9e53f0dcb`.
- Licenza dichiarata: GPL-3.0; vedere README_it_IT.txt della medesima revisione
- Attribuzione: LibreItalia, Marina Latini e autori precedenti elencati nel README
- [Testo della licenza](https://raw.githubusercontent.com/LibreOffice/dictionaries/c0865a85eb67dc377f2cf8e8fe2c4fa9e53f0dcb/it_IT/README_it_IT.txt).
- Parametri della fonte: `{"distribution_note":"Importa le voci del file .dic; i flag di affissione non sono espansi e le voci non sono considerate automaticamente lemmi."}`.

### 11. Thesaurus italiano LibreOffice

- ID: `libreoffice-it-thesaurus`.
- Formato: `mythes`.
- Fonte: [Thesaurus italiano LibreOffice](https://raw.githubusercontent.com/LibreOffice/dictionaries/c0865a85eb67dc377f2cf8e8fe2c4fa9e53f0dcb/it_IT/th_it_IT_v2.dat).
- Revisione nel registro: `c0865a85eb67dc377f2cf8e8fe2c4fa9e53f0dcb`.
- Licenza dichiarata: GPL-3.0; vedere README_th_it_IT.txt della medesima revisione
- Attribuzione: Daniela Volta, Giovanni Zuliani, Davide Prina, Andrea Pescetti, LibreItalia e Marina Latini
- [Testo della licenza](https://raw.githubusercontent.com/LibreOffice/dictionaries/c0865a85eb67dc377f2cf8e8fe2c4fa9e53f0dcb/it_IT/README_th_it_IT.txt).

### 12. MultiWordNet italiano, distribuzione Open Multilingual Wordnet

- ID: `omw-multiwordnet-it`.
- Formato: `wordnet_tab`.
- Fonte: [MultiWordNet italiano, distribuzione Open Multilingual Wordnet](https://raw.githubusercontent.com/omwn/omw-data/406bf83b3c507a3d1f26e88252d5d66893fd36bf/wns/ita/wn-data-ita.tab).
- Revisione nel registro: `406bf83b3c507a3d1f26e88252d5d66893fd36bf`.
- Licenza dichiarata: CC BY 3.0 secondo LICENSE della distribuzione OMW
- Attribuzione: Emanuele Pianta, Luisa Bentivogli, Christian Girardi, FBK; distribuzione OMW
- [Testo della licenza](https://raw.githubusercontent.com/omwn/omw-data/406bf83b3c507a3d1f26e88252d5d66893fd36bf/wns/ita/LICENSE).

### 13. Parole italiane, unione delle liste napolux

- ID: `napolux-paroleitaliane`.
- Formato: `wordlist`.
- Fonte: [Parole italiane, unione delle liste napolux](https://raw.githubusercontent.com/napolux/paroleitaliane/2951524b6d5b67986f542937cef16a54af63ff84/paroleitaliane/parole_uniche.txt).
- Revisione nel registro: `2951524b6d5b67986f542937cef16a54af63ff84`.
- Licenza dichiarata: Repository MIT; provenienze dei dati eterogenee, consultare README
- Attribuzione: Francesco Napoletano e contributori; fonti delle singole liste nel README
- [Testo della licenza](https://raw.githubusercontent.com/napolux/paroleitaliane/2951524b6d5b67986f542937cef16a54af63ff84/LICENSE).

### 14. Frequenze italiane wordfreq 3.1.1 già presenti nel progetto

- ID: `wordfreq-it-local`.
- Formato: `frequency_csv`.
- Fonte: [Frequenze italiane wordfreq 3.1.1 già presenti nel progetto](https://github.com/rspeer/wordfreq).
- Revisione nel registro: `3.1.1`.
- File locale registrato, relativo a `gioco-zeroassociations/`: `resources/frequency_ranks_it.csv`.
- Licenza dichiarata: Dati CC BY-SA 4.0 e condizioni delle fonti riportate in wordfreq
- Attribuzione: Robyn Speer e contributori wordfreq

### 15. Indici pubblici del dizionario Nuovo De Mauro, Internazionale

- ID: `de-mauro-sitemaps`.
- Formato: `sitemap_index`.
- Fonte: [Indici pubblici del dizionario Nuovo De Mauro, Internazionale](https://dizionario.internazionale.it/sitemaps/dizionario/sitemap_dizionario-index.xml).
- Licenza dichiarata: Slug e URL degli indici pubblici; definizioni e altri testi del dizionario non importati
- Attribuzione: Nuovo De Mauro, Internazionale; URL dei lemmi dalle sitemap pubbliche
- Parametri della fonte: `{"entry_prefix":"/parola/"}`.

### 16. UD Italian ISDT, lemmi e forme del corpus train

- ID: `ud-isdt-train`.
- Formato: `conllu`.
- Fonte: [UD Italian ISDT, lemmi e forme del corpus train](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ISDT/ff2447f6b21e03adbbbed5eff306f79b8857286b/it_isdt-ud-train.conllu).
- Revisione nel registro: `ff2447f6b21e03adbbbed5eff306f79b8857286b`.
- Licenza dichiarata: CC BY-NC-SA 3.0; nessuna approvazione automatica per la banca di gioco
- Attribuzione: Autori di Italian Stanford Dependency Treebank e Universal Dependencies, come da README
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ISDT/ff2447f6b21e03adbbbed5eff306f79b8857286b/README.md).

### 17. UD Italian ISDT, lemmi e forme del corpus dev

- ID: `ud-isdt-dev`.
- Formato: `conllu`.
- Fonte: [UD Italian ISDT, lemmi e forme del corpus dev](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ISDT/ff2447f6b21e03adbbbed5eff306f79b8857286b/it_isdt-ud-dev.conllu).
- Revisione nel registro: `ff2447f6b21e03adbbbed5eff306f79b8857286b`.
- Licenza dichiarata: CC BY-NC-SA 3.0; nessuna approvazione automatica per la banca di gioco
- Attribuzione: Autori di Italian Stanford Dependency Treebank e Universal Dependencies, come da README
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ISDT/ff2447f6b21e03adbbbed5eff306f79b8857286b/README.md).

### 18. UD Italian ISDT, lemmi e forme del corpus test

- ID: `ud-isdt-test`.
- Formato: `conllu`.
- Fonte: [UD Italian ISDT, lemmi e forme del corpus test](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ISDT/ff2447f6b21e03adbbbed5eff306f79b8857286b/it_isdt-ud-test.conllu).
- Revisione nel registro: `ff2447f6b21e03adbbbed5eff306f79b8857286b`.
- Licenza dichiarata: CC BY-NC-SA 3.0; nessuna approvazione automatica per la banca di gioco
- Attribuzione: Autori di Italian Stanford Dependency Treebank e Universal Dependencies, come da README
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ISDT/ff2447f6b21e03adbbbed5eff306f79b8857286b/README.md).

### 19. Lessico italiano di Wiktionary, edizione fr, tramite Kaikki

- ID: `kaikki-frwiktionary-it`.
- Formato: `wiktextract`.
- Fonte: [Lessico italiano di Wiktionary, edizione fr, tramite Kaikki](https://kaikki.org/frwiktionary/Italien/kaikki.org-dictionary-Italien.jsonl).
- Licenza dichiarata: CC BY-SA / GFDL secondo Wiktionary
- Attribuzione: Contributori Wiktionary, edizione fr; estrazione Kaikki/Wiktextract
- Parametri della fonte: `{"definition_language":"fr","source_group":"wiktionary-fr-italian"}`.

### 20. Lessico italiano di Wiktionary, edizione de, tramite Kaikki

- ID: `kaikki-dewiktionary-it`.
- Formato: `wiktextract`.
- Fonte: [Lessico italiano di Wiktionary, edizione de, tramite Kaikki](https://kaikki.org/dewiktionary/Italienisch/kaikki.org-dictionary-Italienisch.jsonl).
- Licenza dichiarata: CC BY-SA / GFDL secondo Wiktionary
- Attribuzione: Contributori Wiktionary, edizione de; estrazione Kaikki/Wiktextract
- Parametri della fonte: `{"definition_language":"de","source_group":"wiktionary-de-italian"}`.

### 21. Lessico italiano di Wiktionary, edizione es, tramite Kaikki

- ID: `kaikki-eswiktionary-it`.
- Formato: `wiktextract`.
- Fonte: [Lessico italiano di Wiktionary, edizione es, tramite Kaikki](https://kaikki.org/eswiktionary/Italiano/kaikki.org-dictionary-Italiano.jsonl).
- Licenza dichiarata: CC BY-SA / GFDL secondo Wiktionary
- Attribuzione: Contributori Wiktionary, edizione es; estrazione Kaikki/Wiktextract
- Parametri della fonte: `{"definition_language":"es","source_group":"wiktionary-es-italian"}`.

### 22. Morph-it! 0.4.8, copia pubblica con README originale

- ID: `morphit-048-mirror`.
- Formato: `morphit`.
- Fonte: [Morph-it! 0.4.8, copia pubblica con README originale](https://raw.githubusercontent.com/giodegas/morphit-lemmatizer/b99d75d774367e4bedc5c5f339dec384777488ff/master/morph-it_048_utf8.txt).
- Revisione nel registro: `b99d75d774367e4bedc5c5f339dec384777488ff`.
- Licenza dichiarata: CC BY-SA 2.0 / licenze GNU indicate nel README originale di Morph-it!
- Attribuzione: Marco Baroni ed Eros Zanchetta, 2004–2009; copia pubblica nel repository giodegas/morphit-lemmatizer
- [Testo della licenza](https://raw.githubusercontent.com/giodegas/morphit-lemmatizer/b99d75d774367e4bedc5c5f339dec384777488ff/master/README.md).
- Parametri della fonte: `{"encoding":"utf-8","source_group":"morphit","primary_reference":"https://docs.sslmit.unibo.it/doku.php?id=resources:morph-it","distribution_note":"Il vecchio indirizzo ufficiale non era raggiungibile; il download proviene dal mirror dichiarato, non dal server originale."}`.

### 23. Frequenze italiane OpenSubtitles 2018, FrequencyWords, lista completa

- ID: `frequencywords-it-2018`.
- Formato: `frequency_text`.
- Fonte: [Frequenze italiane OpenSubtitles 2018, FrequencyWords, lista completa](https://raw.githubusercontent.com/hermitdave/FrequencyWords/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/it/it_full.txt).
- Revisione nel registro: `525f9b560de45753a5ea01069454e72e9aa541c6`.
- Licenza dichiarata: CC BY-SA 4.0 per i dati; MIT soltanto per il codice, come da README
- Attribuzione: Hermit Dave; corpus OpenSubtitles 2018 distribuito tramite OPUS
- [Testo della licenza](https://raw.githubusercontent.com/hermitdave/FrequencyWords/525f9b560de45753a5ea01069454e72e9aa541c6/README.md).
- Parametri della fonte: `{"source_group":"opensubtitles-frequencywords"}`.

### 24. FreeDict italiano–tedesco: sole forme di entrata italiane

- ID: `freedict-ita-deu`.
- Formato: `tei_headwords`.
- Fonte: [FreeDict italiano–tedesco: sole forme di entrata italiane](https://raw.githubusercontent.com/freedict/fd-dictionaries/5bdceeac8d0dba3298c1bebe734f60d54dad30f7/ita-deu/ita-deu.tei).
- Revisione nel registro: `5bdceeac8d0dba3298c1bebe734f60d54dad30f7`.
- Licenza dichiarata: GPL-2.0-or-later, secondo availability del TEI e COPYING
- Attribuzione: Autori e contributori FreeDict ita-deu, elencati nel file TEI
- [Testo della licenza](https://raw.githubusercontent.com/freedict/fd-dictionaries/5bdceeac8d0dba3298c1bebe734f60d54dad30f7/ita-deu/COPYING).
- Parametri della fonte: `{"dictionary_source_language":"it","source_group":"freedict-ita-deu","translations_imported":false}`.

### 25. UD Italian vit, lemmi e forme, dev

- ID: `ud-vit-dev`.
- Formato: `conllu`.
- Fonte: [UD Italian vit, lemmi e forme, dev](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-VIT/12fc5f682a677e87dac1923903ae954d8441f7b7/it_vit-ud-dev.conllu).
- Revisione nel registro: `12fc5f682a677e87dac1923903ae954d8441f7b7`.
- Licenza dichiarata: CC BY-NC-SA 3.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-VIT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-VIT/12fc5f682a677e87dac1923903ae954d8441f7b7/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-vit"}`.

### 26. UD Italian vit, lemmi e forme, test

- ID: `ud-vit-test`.
- Formato: `conllu`.
- Fonte: [UD Italian vit, lemmi e forme, test](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-VIT/12fc5f682a677e87dac1923903ae954d8441f7b7/it_vit-ud-test.conllu).
- Revisione nel registro: `12fc5f682a677e87dac1923903ae954d8441f7b7`.
- Licenza dichiarata: CC BY-NC-SA 3.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-VIT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-VIT/12fc5f682a677e87dac1923903ae954d8441f7b7/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-vit"}`.

### 27. UD Italian vit, lemmi e forme, train

- ID: `ud-vit-train`.
- Formato: `conllu`.
- Fonte: [UD Italian vit, lemmi e forme, train](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-VIT/12fc5f682a677e87dac1923903ae954d8441f7b7/it_vit-ud-train.conllu).
- Revisione nel registro: `12fc5f682a677e87dac1923903ae954d8441f7b7`.
- Licenza dichiarata: CC BY-NC-SA 3.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-VIT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-VIT/12fc5f682a677e87dac1923903ae954d8441f7b7/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-vit"}`.

### 28. UD Italian partut, lemmi e forme, dev

- ID: `ud-partut-dev`.
- Formato: `conllu`.
- Fonte: [UD Italian partut, lemmi e forme, dev](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ParTUT/6ae975aeb16378d9aaf102ecccaf1a083e636b44/it_partut-ud-dev.conllu).
- Revisione nel registro: `6ae975aeb16378d9aaf102ecccaf1a083e636b44`.
- Licenza dichiarata: CC BY-NC-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-ParTUT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ParTUT/6ae975aeb16378d9aaf102ecccaf1a083e636b44/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-partut"}`.

### 29. UD Italian partut, lemmi e forme, test

- ID: `ud-partut-test`.
- Formato: `conllu`.
- Fonte: [UD Italian partut, lemmi e forme, test](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ParTUT/6ae975aeb16378d9aaf102ecccaf1a083e636b44/it_partut-ud-test.conllu).
- Revisione nel registro: `6ae975aeb16378d9aaf102ecccaf1a083e636b44`.
- Licenza dichiarata: CC BY-NC-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-ParTUT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ParTUT/6ae975aeb16378d9aaf102ecccaf1a083e636b44/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-partut"}`.

### 30. UD Italian partut, lemmi e forme, train

- ID: `ud-partut-train`.
- Formato: `conllu`.
- Fonte: [UD Italian partut, lemmi e forme, train](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ParTUT/6ae975aeb16378d9aaf102ecccaf1a083e636b44/it_partut-ud-train.conllu).
- Revisione nel registro: `6ae975aeb16378d9aaf102ecccaf1a083e636b44`.
- Licenza dichiarata: CC BY-NC-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-ParTUT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-ParTUT/6ae975aeb16378d9aaf102ecccaf1a083e636b44/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-partut"}`.

### 31. UD Italian postwita, lemmi e forme, dev

- ID: `ud-postwita-dev`.
- Formato: `conllu`.
- Fonte: [UD Italian postwita, lemmi e forme, dev](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-PoSTWITA/b8237631e55060de297000ab65b05b91eec17e67/it_postwita-ud-dev.conllu).
- Revisione nel registro: `b8237631e55060de297000ab65b05b91eec17e67`.
- Licenza dichiarata: CC BY-NC-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-PoSTWITA, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-PoSTWITA/b8237631e55060de297000ab65b05b91eec17e67/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-postwita"}`.

### 32. UD Italian postwita, lemmi e forme, test

- ID: `ud-postwita-test`.
- Formato: `conllu`.
- Fonte: [UD Italian postwita, lemmi e forme, test](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-PoSTWITA/b8237631e55060de297000ab65b05b91eec17e67/it_postwita-ud-test.conllu).
- Revisione nel registro: `b8237631e55060de297000ab65b05b91eec17e67`.
- Licenza dichiarata: CC BY-NC-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-PoSTWITA, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-PoSTWITA/b8237631e55060de297000ab65b05b91eec17e67/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-postwita"}`.

### 33. UD Italian postwita, lemmi e forme, train

- ID: `ud-postwita-train`.
- Formato: `conllu`.
- Fonte: [UD Italian postwita, lemmi e forme, train](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-PoSTWITA/b8237631e55060de297000ab65b05b91eec17e67/it_postwita-ud-train.conllu).
- Revisione nel registro: `b8237631e55060de297000ab65b05b91eec17e67`.
- Licenza dichiarata: CC BY-NC-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-PoSTWITA, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-PoSTWITA/b8237631e55060de297000ab65b05b91eec17e67/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-postwita"}`.

### 34. UD Italian twittiro, lemmi e forme, dev

- ID: `ud-twittiro-dev`.
- Formato: `conllu`.
- Fonte: [UD Italian twittiro, lemmi e forme, dev](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-TWITTIRO/ff4c607327db615e219e1613b6e804ec55a4cffc/it_twittiro-ud-dev.conllu).
- Revisione nel registro: `ff4c607327db615e219e1613b6e804ec55a4cffc`.
- Licenza dichiarata: CC BY-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-TWITTIRO, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-TWITTIRO/ff4c607327db615e219e1613b6e804ec55a4cffc/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-twittiro"}`.

### 35. UD Italian twittiro, lemmi e forme, test

- ID: `ud-twittiro-test`.
- Formato: `conllu`.
- Fonte: [UD Italian twittiro, lemmi e forme, test](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-TWITTIRO/ff4c607327db615e219e1613b6e804ec55a4cffc/it_twittiro-ud-test.conllu).
- Revisione nel registro: `ff4c607327db615e219e1613b6e804ec55a4cffc`.
- Licenza dichiarata: CC BY-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-TWITTIRO, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-TWITTIRO/ff4c607327db615e219e1613b6e804ec55a4cffc/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-twittiro"}`.

### 36. UD Italian twittiro, lemmi e forme, train

- ID: `ud-twittiro-train`.
- Formato: `conllu`.
- Fonte: [UD Italian twittiro, lemmi e forme, train](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-TWITTIRO/ff4c607327db615e219e1613b6e804ec55a4cffc/it_twittiro-ud-train.conllu).
- Revisione nel registro: `ff4c607327db615e219e1613b6e804ec55a4cffc`.
- Licenza dichiarata: CC BY-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-TWITTIRO, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-TWITTIRO/ff4c607327db615e219e1613b6e804ec55a4cffc/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-twittiro"}`.

### 37. UD Italian valico, lemmi e forme, test

- ID: `ud-valico-test`.
- Formato: `conllu`.
- Fonte: [UD Italian valico, lemmi e forme, test](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-Valico/8d60b2c84b8a877d900b2a75bb7644dfd84eb185/it_valico-ud-test.conllu).
- Revisione nel registro: `8d60b2c84b8a877d900b2a75bb7644dfd84eb185`.
- Licenza dichiarata: CC BY-SA 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-Valico, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-Valico/8d60b2c84b8a877d900b2a75bb7644dfd84eb185/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-valico"}`.

### 38. UD Italian markit, lemmi e forme, dev

- ID: `ud-markit-dev`.
- Formato: `conllu`.
- Fonte: [UD Italian markit, lemmi e forme, dev](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-MarkIT/e210079df0aea331ec1dcaa90648d815ce94c3ce/it_markit-ud-dev.conllu).
- Revisione nel registro: `e210079df0aea331ec1dcaa90648d815ce94c3ce`.
- Licenza dichiarata: CC BY 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-MarkIT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-MarkIT/e210079df0aea331ec1dcaa90648d815ce94c3ce/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-markit"}`.

### 39. UD Italian markit, lemmi e forme, test

- ID: `ud-markit-test`.
- Formato: `conllu`.
- Fonte: [UD Italian markit, lemmi e forme, test](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-MarkIT/e210079df0aea331ec1dcaa90648d815ce94c3ce/it_markit-ud-test.conllu).
- Revisione nel registro: `e210079df0aea331ec1dcaa90648d815ce94c3ce`.
- Licenza dichiarata: CC BY 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-MarkIT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-MarkIT/e210079df0aea331ec1dcaa90648d815ce94c3ce/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-markit"}`.

### 40. UD Italian markit, lemmi e forme, train

- ID: `ud-markit-train`.
- Formato: `conllu`.
- Fonte: [UD Italian markit, lemmi e forme, train](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-MarkIT/e210079df0aea331ec1dcaa90648d815ce94c3ce/it_markit-ud-train.conllu).
- Revisione nel registro: `e210079df0aea331ec1dcaa90648d815ce94c3ce`.
- Licenza dichiarata: CC BY 4.0
- Attribuzione: Autori di UniversalDependencies/UD_Italian-MarkIT, come da README e LICENSE del repository
- [Testo della licenza](https://raw.githubusercontent.com/UniversalDependencies/UD_Italian-MarkIT/e210079df0aea331ec1dcaa90648d815ce94c3ce/README.md).
- Parametri della fonte: `{"source_group":"ud-italian-markit"}`.

### 41. Nuovo vocabolario di base della lingua italiana (De Mauro, 2016), testo estratto

- ID: `nvdb-de-mauro-2016`.
- Formato: `nvdb_text`.
- Fonte: [Nuovo vocabolario di base della lingua italiana (De Mauro, 2016), testo estratto](https://raw.githubusercontent.com/pettarin/nvdb/b5fb7f8d916a426934bcd20adc84bf97ab5899f6/nvdb.full.txt).
- Revisione nel registro: `b5fb7f8d916a426934bcd20adc84bf97ab5899f6`.
- Licenza dichiarata: Elenco a cura di Tullio De Mauro con Isabella Chiari e Francesca Ferrucci, pubblicato da Internazionale (2016); estrazione testuale di Alberto Pettarin (CC BY 4.0 / pubblico dominio). Usato come prova di familiarità nella raccolta locale, non redistribuito
- Attribuzione: Tullio De Mauro, Isabella Chiari, Francesca Ferrucci; Internazionale 2016; estrazione di Alberto Pettarin
- [Testo della licenza](https://raw.githubusercontent.com/pettarin/nvdb/b5fb7f8d916a426934bcd20adc84bf97ab5899f6/README.md).
- Parametri della fonte: `{"list_name":"NVdB 2016"}`.

### 42. ItAoA: età di acquisizione di 1.957 parole italiane (Montefinese et al., 2019)

- ID: `itaoa-montefinese-2019`.
- Formato: `xlsx_table`.
- Fonte: [ItAoA: età di acquisizione di 1.957 parole italiane (Montefinese et al., 2019)](https://osf.io/download/3nvh6/).
- Licenza dichiarata: CC BY 4.0 (progetto OSF 3trg2)
- Attribuzione: Montefinese, Vinson, Vigliocco, Ambrosini (2019), Italian Age of Acquisition Norms for a Large Set of Words (ItAoA), Frontiers in Psychology 10:278
- [Testo della licenza](https://api.osf.io/v2/nodes/3trg2/?embed=license).
- Parametri della fonte: `{"cache_file":"itaoa-montefinese-2019/ItAoA.xlsx","sheet":2,"word_column":"Ita_Word","pos_column":"WordClass","pos_map":{"a":"adj","n":"noun","v":"verb"},"value_columns":{"M_AoA":"aoa_mean","SD_AoA":"aoa_sd"},"language_claim":"it_from_norms"}`.

### 43. UniMorph, paradigmi morfologici italiani

- ID: `unimorph-ita`.
- Formato: `unimorph`.
- Fonte: [UniMorph, paradigmi morfologici italiani](https://raw.githubusercontent.com/unimorph/ita/fa2cc6ce173643e748bd8f4162709365bdc98805/ita).
- Revisione nel registro: `fa2cc6ce173643e748bd8f4162709365bdc98805`.
- Licenza dichiarata: CC BY-SA 3.0, secondo README del corpus italiano
- Attribuzione: UniMorph e contributori Wikipedia, secondo README del corpus italiano
- [Testo della licenza](https://raw.githubusercontent.com/unimorph/ita/fa2cc6ce173643e748bd8f4162709365bdc98805/README.md).
- Parametri della fonte: `{"source_group":"unimorph-italian","primary_reference":"https://github.com/unimorph/ita"}`.

### 44. GLÀFF-IT (GLAFF-IT), lessico morfofonologico italiano

- ID: `glaffit`.
- Formato: `glaffit`.
- Fonte: [GLÀFF-IT (GLAFF-IT), lessico morfofonologico italiano](https://redac.univ-tlse2.fr/lexiques/glaffit/GLAFFIT.txt.bz2).
- Licenza dichiarata: CC BY-SA 3.0, secondo la pagina ufficiale GLAFF-IT
- Attribuzione: Basilio Calderone, Matteo Pascoli, Nabil Hathout e Franck Sajous; contributori Wikizionario
- [Testo della licenza](https://redac.univ-tlse2.fr/lexiques/glaffit.html).
- Parametri della fonte: `{"source_group":"glaffit","primary_reference":"https://redac.univ-tlse2.fr/lexiques/glaffit.html"}`.

### 45. Flex_it, forme flesse e frequenze dei nomi

- ID: `flex-it-nouns`.
- Formato: `flex_it`.
- Fonte: [Flex_it, forme flesse e frequenze dei nomi](https://raw.githubusercontent.com/franfranz/Flex_it/d97ddf57ddb209afbf4fc960eb5931b33244632d/Flex_it_nouns.csv).
- Revisione nel registro: `d97ddf57ddb209afbf4fc960eb5931b33244632d`.
- Licenza dichiarata: Repository MIT; dati derivati da Morph-it! e ItWaC, come da README
- Attribuzione: Valentina N. Pescuma, Chiara Zanini, Davide Crepaldi e Francesca Franzon (2021); Morph-it! e ItWaC
- [Testo della licenza](https://raw.githubusercontent.com/franfranz/Flex_it/d97ddf57ddb209afbf4fc960eb5931b33244632d/LICENSE).
- Parametri della fonte: `{"source_group":"flex-it","pos":"NOUN","primary_reference":"https://github.com/franfranz/Flex_it","provenance_note":"Flex_it deriva da Morph-it! e ItWaC: non rappresenta una fonte morfologica indipendente da Morph-it!."}`.

### 46. Flex_it, forme flesse e frequenze degli aggettivi

- ID: `flex-it-adjectives`.
- Formato: `flex_it`.
- Fonte: [Flex_it, forme flesse e frequenze degli aggettivi](https://raw.githubusercontent.com/franfranz/Flex_it/d97ddf57ddb209afbf4fc960eb5931b33244632d/Flex_it_adj.csv).
- Revisione nel registro: `d97ddf57ddb209afbf4fc960eb5931b33244632d`.
- Licenza dichiarata: Repository MIT; dati derivati da Morph-it! e ItWaC, come da README
- Attribuzione: Valentina N. Pescuma, Chiara Zanini, Davide Crepaldi e Francesca Franzon (2021); Morph-it! e ItWaC
- [Testo della licenza](https://raw.githubusercontent.com/franfranz/Flex_it/d97ddf57ddb209afbf4fc960eb5931b33244632d/LICENSE).
- Parametri della fonte: `{"source_group":"flex-it","pos":"ADJ","primary_reference":"https://github.com/franfranz/Flex_it","provenance_note":"Flex_it deriva da Morph-it! e ItWaC: non rappresenta una fonte morfologica indipendente da Morph-it!."}`.

## Fonti annotate come non importate (5)

Queste fonti sono documentate in [prompt_inventory_unavailable_sources.json](../gioco-zeroassociations/resources/prompt_inventory_unavailable_sources.json). Non sono elenchi acquisibili configurati nel registro delle 46 fonti: sono riportate qui per completezza, con l’esito storico registrato.

### Vocabolario Treccani, sitemap pubblica

- Fonte: [Vocabolario Treccani, sitemap pubblica](https://www.treccani.it/sitemap-vocabolario.xml).
- Ultimo controllo documentato: 2026-11-09.
- Stato registrato: `NOT_IMPORTED`.
- Motivo: La sitemapindex pubblica restituita non conteneva URL loc; nessun lemma ricavato e nessun conteggio attribuito alla fonte.

### Morph-it!, indirizzo storico ufficiale

- Fonte: [Morph-it!, indirizzo storico ufficiale](https://sslmitdev-online.sslmit.unibo.it/linguistics/morph-it.php).
- Ultimo controllo documentato: 2026-11-09.
- Stato registrato: `NOT_IMPORTED`.
- Motivo: Il dominio dell'indirizzo storico non era risolvibile; la pagina di documentazione consultata separatamente restituiva HTTP 402. Il corpus è stato successivamente importato da una copia pubblica dichiarata, sotto l'ID morphit-048-mirror; questo record riguarda soltanto l'endpoint ufficiale indisponibile.

### Dizionario italiano Olivetti, sitemap pubblica

- Fonte: [Dizionario italiano Olivetti, sitemap pubblica](https://www.dizionario-italiano.it/sitemap.xml).
- Ultimo controllo documentato: 2026-11-09.
- Stato registrato: `NOT_IMPORTED`.
- Motivo: Gli URL campionati contenevano identificatori come lemma=A100; questi codici non sono stati trasformati arbitrariamente in parole. Serve un estrattore dei lemmi effettivi prima dell'importazione.

### CoLFIS, download ufficiale SNS

- Fonte: [CoLFIS, download ufficiale SNS](https://linguistica.sns.it/CoLFIS/Download.htm).
- Ultimo controllo documentato: 2026-11-09.
- Stato registrato: `NOT_IMPORTED`.
- Motivo: Gli endpoint ufficiali tentati restituivano timeout o reset della connessione; nessun file lessicale acquisito.

### PAISÀ, repository Eurac CLARIN

- Fonte: [PAISÀ, repository Eurac CLARIN](https://clarin.eurac.edu/repository/xmlui/handle/20.500.12124/3).
- Ultimo controllo documentato: 2026-11-09.
- Stato registrato: `NOT_IMPORTED`.
- Motivo: Il repository indicato dalla pagina ufficiale del corpus ha restituito Access Denied. Nessuna protezione aggirata e nessun dato contato come importato.

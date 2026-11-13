# Primo step: raccogliere i prompt

L'inventario è ora gestito come **database unico con decisioni persistenti**:
vedere [aggiornamenti delle fonti e scelte sulle voci](AGGIORNAMENTI_FONTI.md).
Le nuove versioni di fonti già importate vengono confrontate prima di integrarle.

L'istruzione più recente del 9 novembre 2026 separa il lavoro in tre fasi:

1. Raccogliere e inserire nel database il maggior numero possibile di prompt
   dalle fonti disponibili, conservando provenienza e duplicati come attestazioni.
2. Scegliere i prompt adatti, attribuire categoria e significato e cercare le
   associazioni. Le associazioni devono essere verificate semanticamente prima
   di inserirle nella banca di gioco.
3. Esportare per Livecade prompt distinti e sette risposte casuali dai relativi
   bacini verificati.

Questa istruzione aggiorna il precedente vincolo che lasciava tutti i prompt
grezzi esclusivamente fuori dal DB. **Ora il primo step li inserisce nel DB**,
nelle tabelle di inventario, senza attribuire loro un'approvazione semantica.
La verifica prima dell'inserimento rimane necessaria per le associazioni di gioco.

## Task da utilizzare ora

In VS Code: **Terminale → Esegui attività → 1. Prompt: raccogli e inserisci
inventario da tutte le fonti registrate**.

Il task scarica o riusa le risorse, importa tutte le fonti del registro e
aggiorna `prompt_inventory_status.json`. Non avvia Qwen e non usa la GPU.
Non cerca ancora associazioni. Ripetere il task non duplica le importazioni
dei medesimi file: ogni versione è riconosciuta dall'hash del contenuto.

La raccolta ampliata del 9 novembre 2026 contiene **2.740.415 voci distinte**,
di cui **2.490.114 parole singole compatibili con il formato attuale**, con
**7.731.331 attestazioni da 40 risorse**. Rispetto alla prima raccolta da
18 risorse e 1.665.409 voci, l'ampliamento ha aggiunto **1.075.006 voci distinte**
e **3.229.885 attestazioni**. Tutte le 22 nuove risorse sono state importate.
I conteggi descrivono l'inventario grezzo: non certificano che ogni voce sia
un prompt italiano adatto al gioco. Il rapporto dell'ampliamento è
`prompt_inventory_expansion_20261109.json`.

**Prompt: stato dell'inventario raccolto** mostra i conteggi dell'inventario.
Il task **Livecade: genera lista (7 risposte per prompt)** resta la fase finale,
quando si vogliono esportare bacini già verificati.

Da terminale, nella cartella `gioco-zeroassociations`:

```powershell
python -B prompt_inventory.py collect
python -B prompt_inventory.py status
python -B prompt_inventory.py collect --only de-mauro-sitemaps
```

## Cosa viene conservato

Il database operativo è la raccolta, schema `raw` di `database/parole_ita_raw.sqlite3`, con SQLite 3.54.1.

- `inventory_terms`: una riga per testo normalizzato del prompt, con stato
  `COLLECTED`, indicazione di parola singola, presenza di prove di lemma,
  forma flessa, nome proprio e attestazione lessicale italiana.
- `inventory_sources`: nome, indirizzo, tipo, attribuzione e condizioni della fonte.
- `inventory_snapshots`: versioni effettivamente importate, hash e conteggi.
- `inventory_attestations`: ogni occorrenza documentata, forma originale,
  posizione nella fonte, POS, eventuale lemma e metadati. È una vista, e si legge
  e si inserisce da lì: le righe (milioni) stanno in `inventory_attestation_rows`,
  con il numero dello snapshot, del ruolo e della POS al posto dei testi
  (`inventory_snapshot_numbers`, `inventory_attestation_roles`,
  `inventory_attestation_pos`) e la forma originale solo quando è diversa dal
  prompt. Un DB del formato precedente si converte da solo al primo comando di
  `prompt_inventory.py` o `inventory_updates.py` (`migrate_attestations`).
- `inventory_source_counts`: conteggi per fonte.
- `inventory_pending_single_words`: parole singole raccolte che non appartengono
  ancora ai prompt verificati della banca di gioco.

Maiuscole e forme Unicode equivalenti vengono unificate; gli accenti restano
distinti. Se una parola appare in più fonti resta un unico prompt, con tutte le
attestazioni. Le fonti non forniscono sempre POS, lemma o lingua affidabile:
il sistema registra questa incertezza, senza inventare analisi.

Le liste lessicali mantengono anche termini composti e grafie non compatibili
con il formato attuale, con `is_single_word=0`. Nei progetti Wikimedia si
raccolgono soltanto titoli compatibili con una parola singola: non si spezzano
i titoli di articoli in parole isolate prive di contesto.

Le tabelle `prompts`, `senses` e `associations` rimangono la banca revisionata.
L'esportatore Livecade legge soltanto queste: la raccolta del primo step non
trasforma automaticamente titoli stranieri, forme flesse o nomi propri in
prompt pronti per il gioco. Le categorie di gioco vengono assegnate nella
seconda fase, senza dedurle arbitrariamente dal nome del sito.

## Fonti attualmente registrate

Il registro estendibile è `resources/prompt_inventory_sources.json`.
Contiene 40 risorse:

- lessico italiano di Wikizionario italiano e delle edizioni inglese,
  francese, tedesca e spagnola di Wiktionary,
  tramite Kaikki/Wiktextract, senza il precedente filtro a nomi, verbi e aggettivi;
- titoli dei sette progetti italiani Wikipedia, Wikizionario, Wikisource,
  Wikiquote, Wikivoyage, Wikiversità e Wikinotizie;
- dizionario ortografico e thesaurus italiani di LibreOffice;
- lemmi italiani di MultiWordNet nella distribuzione Open Multilingual Wordnet;
- unione delle liste `napolux/paroleitaliane`;
- lista italiana di frequenze wordfreq già presente nel progetto;
- URL dei lemmi nelle sitemap pubbliche del Nuovo De Mauro di Internazionale;
- lemmi e forme dei tre file train/dev/test di UD Italian ISDT;
- Morph-it! 0.4.8, da una copia pubblica dichiarata con README originale;
- frequenze italiane complete OpenSubtitles 2018 nella distribuzione FrequencyWords;
- parole di entrata italiane del dizionario FreeDict italiano–tedesco,
  senza importare le traduzioni tedesche come prompt;
- file disponibili di altri sei corpora UD Italian: VIT, ParTUT, PoSTWITA,
  TWITTIRO, Valico e MarkIT. I singoli split train/dev/test sono risorse
  distinte della medesima collezione, non editori indipendenti.

Sono 40 risorse, non 40 editori indipendenti. Alcune liste riutilizzano
materiali di altre fonti. I titoli di Wikizionario comprendono anche lingue
diverse dall'italiano; i metadati non li certificano come termini italiani.
Gli slug delle sitemap sono conservati come tali: non si ricostruiscono
automaticamente accenti, spazi o lemmi a partire da un indirizzo ambiguo.

Non esiste un elenco finito di tutte le fonti o di tutti i prompt possibili.
Il registro permette di continuare ad ampliare la copertura. Un sito consultato
non viene dichiarato importato: ad esempio, la sitemap pubblica del vocabolario
Treccani consultata non esponeva lemmi. Il vecchio indirizzo ufficiale di
Morph-it! non risultava raggiungibile: l'ampliamento usa il mirror pubblico
indicato nel registro, con autore, versione, revisione Git e licenza originali.
CoLFIS e PAISÀ sono stati consultati come ulteriori candidati; gli endpoint
tentati non hanno fornito dati importabili e non entrano nei conteggi.

Per aggiungere fonti si estende il registro con URL o file locale, formato,
attribuzione e condizioni dichiarate. I parser disponibili sono `wiktextract`,
`wiki_titles`, `hunspell`, `mythes`, `wordnet_tab`, `wordlist`, `frequency_csv`,
`frequency_text`, `morphit`, `sitemap_index`, `conllu` e `tei_headwords`.
Non viene applicato un parser di parole
generico alle definizioni di pagine web.

Ogni fonte viene importata in una transazione: errori di formato non lasciano
mezze importazioni. Il rapporto registra le fonti fallite; le altre possono
completarsi. L'aggiornamento di un corpus richiede una nuova versione del file
o della cartella di cache, così da conservare lo snapshot precedente.

Il task **Fonti: cerca aggiornamenti e prepara il confronto** gestisce ora il
download delle nuove versioni conservando gli snapshot precedenti. Le scelte
“integra”, “scarta” e “rimanda” sono salvate nel database e non vengono azzerate
quando una voce ricompare da una fonte diversa.

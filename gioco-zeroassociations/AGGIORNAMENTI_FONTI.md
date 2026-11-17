# Database unico, aggiornamenti e decisioni

> **Revisione documentale — 16 novembre 2026.** Gli aggiornamenti delle fonti richiedono una decisione salvata nel DB di lavoro; rigenerare i corpus dei giochi non acquisisce automaticamente nuovi snapshot. Il nuovo task ZeroContext usa l'inventario locale già disponibile. Per includere una nuova fonte occorre prima raccoglierla e integrarla con gli strumenti descritti qui.
> [Indice e stato della documentazione](../docs/STATO_DOCUMENTAZIONE.md).

Il database operativo è la raccolta, **schema `raw` di `database/parole_ita_raw.sqlite3`**. Contiene voci raccolte,
attestazioni, fonti, versioni, confronti, decisioni, storico e bacini verificati.
Non esiste un database operativo separato per ciascuna fonte.

La vista **`inventory_catalog`** presenta una sola voce per testo normalizzato,
anche quando compare in più fonti o in un aggiornamento ancora da esaminare.
Le attestazioni rimangono distinte per conservare la provenienza. I file nella
cache sono le copie dei download: non sono l'archivio delle decisioni.

## Come si cercano gli aggiornamenti

Per l'aggiornamento completo richiesto il 16 novembre 2026 è disponibile il task
**ZeroCade : Aggiornamento parole RAW**. Il task ora crea e aggiorna il secondo DB
`database/parole_ita_raw_2.0.sqlite3`, tabella `parole`, con tutte le 46 fonti e senza
duplicati. Conserva la provenienza e non importa scarti o decisioni editoriali
del vecchio archivio. Prima di aggiornare il secondo DB ne crea un backup;
non avvia filtri, generazione di associazioni o pubblicazione nei giochi.
Il [catalogo delle fonti](../database/FONTI_PAROLE_RAW.md) descrive sorgenti,
licenze, revisioni, destinazione e rapporto progressivo.

Il percorso seguente continua a gestire il vecchio `parole_ita_raw.sqlite3`, con
la scelta manuale per ogni aggiornamento:

1. Eseguire **Fonti: cerca aggiornamenti e prepara il confronto**.
   Indicare l'ID della fonte oppure `*` per tutte quelle abilitate nel database.
2. Eseguire **Fonti: elenca aggiornamenti e decisioni**.
3. Copiare l'ID del confronto e usare **Fonti: mostra differenze di un aggiornamento**.
   Si possono mostrare voci `NEW`, `CHANGED`, `REMOVED` e `UNCHANGED`.
4. Usare **Fonti: integra, scarta o rimanda un aggiornamento**, indicando la motivazione.

Il controllo delle fonti legge il registro salvato nel database. Per GitHub
verifica la revisione corrente; per Wikimedia usa i dump `latest`. Per i file
mutabili conserva hash e, quando disponibili, ETag e Last-Modified. Le sitemap
vengono ricontrollate anche nei file figli. Un file locale viene confrontato
con la versione già archiviata. Errori di rete vengono riportati e non autorizzano
un ripiego silenzioso su una versione presentata come aggiornata.

Una fonte cambiata viene **preparata per il confronto, senza sostituire
automaticamente la versione attiva**. Anche `script/prompt_inventory.py collect`
prepara un confronto se una fonte già importata ha contenuto diverso. La prima
raccolta di una fonte nuova continua a popolare l'inventario grezzo.

Il confronto è sul contenuto delle osservazioni: cambiare l'ordine delle righe
o ripetere la stessa osservazione non rende modificate tutte le parole. Una
variazione delle frequenze o dei dati lessicali viene invece segnalata.

## Decisioni sulle singole voci

Usare **Voci: integra, scarta o rimanda una parola**:

| Stato | Significato |
|---|---|
| `COLLECTED` | Voce raccolta, nessuna scelta esplicita ancora registrata. |
| `INTEGRATED` | Voce scelta per proseguire il lavoro nell'inventario. Non approva le associazioni. |
| `DISCARDED` | Voce scartata esplicitamente; rimane nello storico ed è esclusa dall'estrazione per Livecade. |
| `DEFERRED` | Decisione rinviata; la voce resta da esaminare ed è sospesa dall'estrazione per Livecade. |

La scelta vale per la voce normalizzata, attraverso tutte le fonti. Un'altra
fonte può fornire nuove attestazioni della stessa parola, ma non cancella la
decisione. Per riconsiderarla si registra una nuova decisione con motivazione:
lo storico precedente rimane. Per le sole informazioni di una specifica fonte
si decide sul relativo aggiornamento, senza scartare globalmente il prompt.

**Voci: mostra scheda e storico di una parola** mostra lo stato, le decisioni
e i confronti in cui compare. Una voce proposta soltanto in un aggiornamento
è comunque già consultabile nel catalogo unico; la scelta individuale non
attiva da sola l'intera nuova versione della fonte. `inventory_integrated_terms`
elenca le voci scelte per la fase successiva.

## Decisioni sulle versioni delle fonti

- `APPLY`: integra le attestazioni della nuova versione e la rende attiva.
  Le decisioni sulle parole rimangono invariate.
- `DISCARD`: scarta quel contenuto della fonte; lo stesso hash non viene
  riproposto come nuovo a ogni controllo. Non è un divieto globale di tutte
  le parole del file, che potrebbero essere valide in altre fonti.
- `DEFER`: conserva il confronto in attesa di una decisione.

Una versione rimandata o scartata può essere riconsiderata esplicitamente.
Una versione già applicata rimane nello storico. Se nel frattempo è cambiata
la versione attiva, un confronto obsoleto non viene applicato: va ricontrollato.
Le voci rimosse da una fonte non vengono cancellate dall'archivio: potrebbero
essere attestate altrove o avere decisioni e associazioni già documentate.
`inventory_current_attestations` mostra soltanto le attestazioni delle versioni attive.

## Comandi da terminale

Dalla cartella `gioco-zeroassociations`:

```powershell
python -B script/inventory_updates.py check-updates --only freedict-ita-deu
python -B script/inventory_updates.py updates
python -B script/inventory_updates.py changes ID_AGGIORNAMENTO --kind NEW --limit 50 --offset 0
python -B script/inventory_updates.py decide-update ID_AGGIORNAMENTO --decision APPLY --reason "Versione esaminata"
python -B script/inventory_updates.py term parola
python -B script/inventory_updates.py decide-term parola --decision DISCARDED --reason "Motivo della scelta"
```

Gli ID possono essere abbreviati a un prefisso univoco di almeno otto caratteri.
Le motivazioni sono obbligatorie. Gli esempi di decisione non vengono eseguiti
automaticamente e non costituiscono scelte su parole reali.

Il JSON `resources/prompt_inventory_sources.json` rimane una configurazione
versionabile per aggiungere fonti. Per registrare le modifiche nel DB:

```powershell
python -B script/inventory_updates.py register-sources
```

La registrazione non acquisisce le parole né crea uno snapshot. Il primo
`script/prompt_inventory.py collect` importa la fonte anche se era già registrata;
soltanto le acquisizioni successive con dati diversi preparano un confronto.

## Fonti di parole, lemmi e morfologia

Il registro comprende queste risorse (oltre alle altre fonti già configurate):

| Fonte | ID nel registro | Dati raccolti |
|---|---|---|
| [UniMorph italiano](https://github.com/unimorph/ita) | `unimorph-ita` | Forma, lemma esplicito e tratti UniMorph. |
| [Kaikki.org](https://kaikki.org/) | `kaikki-itwiktionary`, `kaikki-enwiktionary-it`, `kaikki-frwiktionary-it`, `kaikki-dewiktionary-it`, `kaikki-eswiktionary-it` | Entrate italiane delle diverse edizioni di Wiktionary, lemmi e voci di forme flesse. Si importano solo entrate con `lang_code=it`. |
| [GLÀFF-IT / GLAFF-IT](https://redac.univ-tlse2.fr/lexiques/glaffit.html) | `glaffit` | Tabella compressa BZip2: forme, lemmi, codici GRACE e campi fonologici della fonte. |
| [Flex_it](https://github.com/franfranz/Flex_it) | `flex-it-nouns`, `flex-it-adjectives` | Forme e lemmi di nomi e aggettivi, genere, numero, classe flessiva e frequenze della forma. |
| [Hunspell italiano, distribuzione LibreOffice](https://github.com/LibreOffice/dictionaries/tree/master/it_IT) | `libreoffice-it-dictionary` | Voci del dizionario `.dic`; i flag di affissione non sono espansi e non costituiscono una prova di lemma. |

Kaikki e Hunspell erano già configurati e mantengono gli stessi ID, senza duplicare
le attestazioni. UniMorph e Flex_it hanno download fissati a una revisione Git;
GLAFF-IT ha un URL ufficiale mutabile, di cui si conserva l'hash a ogni acquisizione.
Flex_it deriva da Morph-it! e ItWaC: le fonti restano distinte per provenienza,
ma non vanno contate come prove morfologiche indipendenti. Licenze e attribuzioni
sono conservate nel registro; i file di licenza si scaricano insieme alle fonti.

Per scaricare e raccogliere soltanto le tre nuove risorse (Flex_it ha due file):

```powershell
python -B script/prompt_inventory.py collect --only unimorph-ita glaffit flex-it-nouns flex-it-adjectives
```

Le attestazioni esplicite dei lemmi vengono raccolte anche quando il file elenca
soltanto forme flesse. Le frequenze rimangono associate alla forma osservata.
La raccolta alimenta l'inventario grezzo e non approva automaticamente parole
o associazioni per i giochi. Per le fonti già importate prepara il confronto
previsto sopra.

## Conservazione del database unico

**Database: backup completo con inventario e decisioni** crea una copia SQLite
consistente in `database-backups/`, con nome progressivo temporale, senza
sovrascrivere backup esistenti. È una copia di conservazione del medesimo
database, non un secondo archivio operativo.

Lo schema `game` (i bacini del gioco) mostra i bacini verificati e le decisioni
sulle voci, come viste sulla raccolta, così il gioco e il ripristino rispettano
anche le esclusioni: è sempre aggiornato; `script/prompt_database.py dump --output FILE`
li scrive in un DB a sé. Non contiene
le grandi attestazioni, i download preparati e i confronti integrali: per
conservare tutto questo, incluse le decisioni, serve il backup SQLite completo.
I dati grezzi si possono riscaricare; le decisioni dell'utente non si ricavano
nuovamente dalle fonti.

Le nuove tabelle sono `inventory_registered_sources`, `inventory_source_heads`,
`inventory_updates`, `inventory_update_rows`, `inventory_update_terms`,
`inventory_update_changes`, `inventory_term_decisions`, `inventory_decision_history`
e `inventory_http_cache`. La migrazione aggiunge queste strutture e registra
le fonti esistenti senza riclassificare le voci o modificare le associazioni.

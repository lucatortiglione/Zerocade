# Database unico, aggiornamenti e decisioni

Il database operativo è la raccolta **`prompt_raw.sqlite3`**. Contiene voci raccolte,
attestazioni, fonti, versioni, confronti, decisioni, storico e bacini verificati.
Non esiste un database operativo separato per ciascuna fonte.

La vista **`inventory_catalog`** presenta una sola voce per testo normalizzato,
anche quando compare in più fonti o in un aggiornamento ancora da esaminare.
Le attestazioni rimangono distinte per conservare la provenienza. I file nella
cache sono le copie dei download: non sono l'archivio delle decisioni.

## Come si cercano gli aggiornamenti

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
automaticamente la versione attiva**. Anche `prompt_inventory.py collect`
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
python -B inventory_updates.py check-updates --only freedict-ita-deu
python -B inventory_updates.py updates
python -B inventory_updates.py changes ID_AGGIORNAMENTO --kind NEW --limit 50 --offset 0
python -B inventory_updates.py decide-update ID_AGGIORNAMENTO --decision APPLY --reason "Versione esaminata"
python -B inventory_updates.py term parola
python -B inventory_updates.py decide-term parola --decision DISCARDED --reason "Motivo della scelta"
```

Gli ID possono essere abbreviati a un prefisso univoco di almeno otto caratteri.
Le motivazioni sono obbligatorie. Gli esempi di decisione non vengono eseguiti
automaticamente e non costituiscono scelte su parole reali.

Il JSON `resources/prompt_inventory_sources.json` rimane una configurazione
versionabile per aggiungere fonti. Per registrare le modifiche nel DB:

```powershell
python -B inventory_updates.py register-sources
```

## Conservazione del database unico

**Database: backup completo con inventario e decisioni** crea una copia SQLite
consistente in `database-backups/`, con nome progressivo temporale, senza
sovrascrivere backup esistenti. È una copia di conservazione del medesimo
database, non un secondo archivio operativo.

Il piccolo `prompt.sqlite3` (i bacini del gioco, versionato) conserva i bacini
verificati e le decisioni sulle voci, così il gioco e il ripristino rispettano
anche le esclusioni: dopo una decisione si aggiorna con `prompt_database.py dump`. Non contiene
le grandi attestazioni, i download preparati e i confronti integrali: per
conservare tutto questo, incluse le decisioni, serve il backup SQLite completo.
I dati grezzi si possono riscaricare; le decisioni dell'utente non si ricavano
nuovamente dalle fonti.

Le nuove tabelle sono `inventory_registered_sources`, `inventory_source_heads`,
`inventory_updates`, `inventory_update_rows`, `inventory_update_terms`,
`inventory_update_changes`, `inventory_term_decisions`, `inventory_decision_history`
e `inventory_http_cache`. La migrazione aggiunge queste strutture e registra
le fonti esistenti senza riclassificare le voci o modificare le associazioni.

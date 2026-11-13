# Database dei prompt italiani

**Avanzamento delle associazioni, 9 novembre 2026:** la lavorazione della coda
completa prosegue con tre agenti e importazione centrale dei bacini revisionati.
I conteggi delle copie aggiornate sono nel rapporto. Vedere
[stato e procedura di ripresa](ASSOCIAZIONI_FILTRATI.md) e
[rapporto dei controlli](resources/avanzamento_associazioni_filtrati_20261109.json).

Fonti, inventario, aggiornamenti e decisioni convivono nella raccolta, schema
`raw` di `database/parole_ita_raw.sqlite3`: vedere [la gestione del database unico](AGGIORNAMENTI_FONTI.md).

La raccolta di ulteriori fonti prosegue attraverso
[l'inventario dei prompt](PROMPT_INVENTORY.md). La lavorazione corrente cerca
le associazioni per ogni candidato dei filtrati e copia nella banca valida
soltanto i prompt revisionati insieme ai rispettivi bacini. La verifica
preinserimento descritta qui sotto riguarda la banca di gioco e le associazioni.

La raccolta e gli altri schemi del DB di lavoro hanno ruoli distinti:

- lo schema `raw`, la **raccolta**: il database operativo in cui scrivono
  tutti gli script. Escluso da Git: con l'inventario pesa gigabyte.
- lo schema `validi`, i **prompt validi con le parole associate**: solo prompt
  con un verbale di revisione corrente, categoria e senso scelto **e** un bacino
  verificato del medesimo senso. `validated_prompt_database.py sync` la rigenera
  senza eliminare la raccolta o lo storico. Una scelta `INTEGRATED` da sola non è
  una revisione.
- lo schema `filtrati`, i **candidati e le parole valide come prompt**: oltre
  alla preselezione automatica (`filtered_prompts`), la tabella `validated_prompts`
  copia ogni prompt con verbale positivo corrente (senso, POS, categoria, revisore),
  anche se non ha ancora associazioni. La vista `review_state` indica `VALIDATO` o
  `DA_RIVEDERE`; scartati e rimandati non vi compaiono. La rigenera
  `filter_prompts.py build`, chiamato anche dopo ogni importazione di decisioni.
- lo schema `game`, i **bacini del gioco**: i soli bacini verificati, con schema,
  verbali, attribuzioni e decisioni sulle voci, come viste sulle tabelle della
  raccolta: sempre aggiornato, senza copie. `prompt_database.py dump` (task
  «Prompt: aggiorna lo schema game…») ricrea le viste, e lo fa da sé anche
  `import-reviewed`. Il gioco legge la copia nello schema `associazioni` di
  `database/giochi.sqlite3` (`giochi.py aggiorna associazioni`); se è indietro
  rispetto al DB di lavoro il server lo segnala.

Le risposte sono riutilizzabili tra prompt, anche nella stessa lista Livecade.
Ogni associazione ha chiave `(sense_id, word)`: motivazione, significato,
evidenze e revisione appartengono alla singola coppia. L'approvazione di
`pane → forno` non approva automaticamente `pizza → forno`; entrambe possono
essere conservate quando verificate. La copia e l'estrazione non eliminano
risposte perché presenti in altri bacini. I duplicati restano vietati nel
singolo bacino e nella singola estrazione.

L'inventario `inventory_*` non entra nello schema `game` e si ricostruisce dalle
fonti con `prompt_inventory.py collect`. Con `dump --output FILE.sql` si ottiene
invece il dump SQL in testo degli stessi dati. Si usa un runtime
ufficiale SQLite **3.54.1**, verificato con SHA3-256 e installato nella cache
utente. Python e il motore SQLite del server non vengono modificati.

La banca è estendibile, senza promessa di esaustività della lingua italiana.
La raccolta iniziale usa il dizionario italiano di Wikizionario tramite
[Kaikki/Wiktextract](https://kaikki.org/itwiktionary/Italiano/) e i
[titoli Wikipedia in italiano](https://dumps.wikimedia.org/itwiki/20261101/).
Wikipedia comprende anche nomi propri e parole straniere: essere un titolo
non prova che una voce sia un prompt italiano adatto al gioco.

Fotografia storica del primo ampliamento del 9 novembre 2026: **983 prompt validati**
in `prompt_validi.sqlite3` (oggi lo schema `validi`), di cui **620 aggiunti** con questa revisione editoriale
di ChatGPT. Sono 525 nomi, 40 verbi e 55 aggettivi; ogni nuova voce conserva senso,
categoria, motivazioni e provenienza. Sette POS automatici sono stati corretti.
Il catalogo aggiunge 179 (funghi) e 180 (misurazione del tempo), mantenendo gli
ID precedenti. Il [rapporto della revisione](prompt_review_expansion_20261109.json)
conserva conteggi, hash dei dati e verifiche di integrità.

**102 prompt hanno anche un bacino verificato**, per **1.010 associazioni**:
i bacini precedenti sono rimasti invariati. Gli altri **881 prompt validati**
devono ancora ricevere le associazioni. L'esportazione **Livecade usa sempre
sette parole casuali** da un bacino verificato sufficiente.

La raccolta comprende **2.740.419 voci distinte**; i filtri ne preselezionano
14.228 e **13.246 sono ancora in attesa di revisione** dopo questo lotto.
Non sono tutte parole italiane ammissibili e la verifica dell'intero inventario
non è conclusa. La revisione editoriale LLM non dichiara verifiche umane o QA
indipendente di giocabilità.

## Verifica prima dell'inserimento

Le proposte raccolte rimangono nell'inventario della raccolta (schema `raw`);
le bozze di associazioni restano nei JSONL `prompt-staging/`.
Nessuna proposta viene promossa automaticamente nel catalogo valido. Le traduzioni,
le cooccorrenze in definizioni e le relazioni lessicografiche a livello di voce
non diventano risposte approvate. Le fonti e gli output hanno hash e provenienza;
attribuzioni e condizioni del corpus accompagnano le evidenze importate.

Il revisore sceglie il senso familiare del prompt e controlla singolarmente
ogni associazione secondo le direttive. Documenta motivazione, senso della
risposta, relazione, lingua del prompt e vincoli di non ridondanza.
Un bacino verificato può contenere meno di sette parole: viene conservato,
ma non produce set finché non è stato ampliato quanto necessario.

`import-reviewed` verifica il contratto del verbale, gli hash e i vincoli.
**Non è un LLM e non dimostra automaticamente che una relazione sia sensata.**
Un file che si autodichiara verificato senza una revisione reale non è una fonte
valida. Il pacchetto iniziale documenta una revisione editoriale di ChatGPT;
non dichiara verifiche umane né QA indipendente di giocabilità.

Tutte le righe del pacchetto vengono controllate prima di avviare la transazione.
Una riga non conforme respinge il pacchetto. Il reimport dello stesso contenuto
è idempotente; un ampliamento richiede un nuovo verbale completo, conservando
quello precedente nell'audit.

Ogni verbale risponde a una **versione delle regole** (`SEMANTIC_POLICY` in
`semantic_rules.py`): dichiarata in `review.policy_version`, oppure ricavata
dall'hash delle direttive registrato in `resources/policy_versions.json`.
Un ritocco al testo delle direttive che non cambia le regole non invalida i
bacini: dopo la modifica si registra il nuovo testo con
`python -B prompt_database.py register-directives`. Un cambio di regole fa
salire `SEMANTIC_POLICY` e manda in rivalutazione tutti i bacini.

## Task VS Code

Aprire **Terminale → Esegui attività** e scegliere:

- **1. Prompt: raccogli e inserisci inventario da tutte le fonti registrate**:
  scarica o riusa le fonti e inserisce i prompt raccolti nelle tabelle
  `inventory_*`. Nessun Qwen, GPU o generazione di associazioni.
- **Prompt: stato dell'inventario raccolto**: mostra conteggi e provenienza.
- **Prompt: importa solo bacini già revisionati**: richiede il file JSONL
  con le revisioni già effettuate. Non esegue da solo la revisione semantica.
- **Livecade: genera lista (7 risposte per prompt)**: chiede quanti prompt
  distinti estrarre e un seed facoltativo, sceglie i prompt casualmente e per
  ognuno estrae sette risposte rispettando gruppi e conflitti.
- **Prompt: aggiorna lo schema game (bacini verificati) dalla raccolta, schema raw**:
  ricrea le viste dei bacini verificati (dopo `import-reviewed` avviene già da sé;
  serve se lo schema `game` è stato toccato a mano).
- **Prompt: stato e integrità del DB**: riporta conteggi e controlli SQLite.

I task usano l'ambiente `.venv` già presente. Le nuove utility richiedono solo
la libreria standard Python. Fuori da VS Code è possibile usare `python`.
Su sistemi diversi da Windows indicare `--sqlite /percorso/sqlite3` alla versione 3.54.1.

Esempi dalla cartella `gioco-zeroassociations`:

```powershell
python -B prompt_database.py import-reviewed resources/prompt_pools_reviewed_20261109.jsonl
python -B prompt_database.py status
python -B prompt_database.py livecade --count 50 --seed lotto-1
python -B prompt_database.py livecade --category 008 --seed panificazione
python -B prompt_database.py dump
```

I CSV a cinque colonne hanno suffisso progressivo da `0001`; non sovrascrivono
i precedenti. Un JSON affiancato documenta seed, accezioni, hash dei bacini e
prompt insufficienti. `--difficulty easy medium hard unrated` può filtrare
le risposte; senza filtro sono ammesse tutte le difficoltà. Le etichette del
pacchetto iniziale sono stime editoriali, **non risultati di test con giocatori**.

Il comando `livecade` usa tutti i prompt estraibili se `--count` è omesso.
Se il numero richiesto supera i bacini estraibili, l'esportazione si ferma:
non duplica prompt per raggiungere la quantità. Il parametro `--category`
filtra i prompt per categoria. Categoria e cluster accompagnano ciascun
record del rapporto JSON; il CSV conserva le cinque colonne richieste.

La scelta delle risposte non è uniforme fra tutte le combinazioni ammissibili: viene
mescolato l'ordine di ricerca, rispettando i vincoli. Il medesimo seed e bacino
riproducono lo stesso risultato. Il comando generico `sample` conserva le
vecchie modalità sperimentali 7/8 per analisi, ma non è il percorso Livecade.
Per impostazione predefinita un'insufficienza blocca l'intera esportazione,
con elenco dei prompt da ampliare; `--allow-partial` permette un lotto parziale
esplicitamente documentato. Il prompt non viene cancellato dal database.

La banca distingue accezioni, associazioni, motivazioni, difficoltà, evidenze,
verbali, gruppi e incompatibilità. Un prompt può conservare più accezioni
revisionate; il campionamento usa quella familiare indicata in `prompts`.
Il DB non contiene nuove proposte in attesa né pacchetti respinti.

## Categorie nel database

`categories` contiene ID, nome della categoria, ID e nome del cluster.
`prompts.category_id` e `senses.category_id` sono obbligatori e devono
corrispondere al catalogo. La migrazione preserva i dati e i verbali precedenti;
i trigger applicano lo stesso vincolo anche al database della prima versione.
La vista `prompt_catalog` mostra prompt, categoria, cluster, significato e
numero totale di associazioni. Esempio:

```sql
SELECT prompt, category_id, category_name, association_count
FROM prompt_catalog ORDER BY prompt;
```

Gli ID 001–172 mantengono la tassonomia precedente. Il catalogo DB aggiunge
sei categorie (173–178) documentate in
`resources/prompt_category_extensions.json`, per classificare contesti
generali senza forzarli in categorie specialistiche estranee.

I 51 nuovi bacini sono motivati singolarmente in
`resources/prompt_pool_expansion_20261109.json`. Le revisioni pronte per
l'importazione sono raccolte in `resources/prompt_pools_reviewed_20261109.jsonl`.
Le copie prima della migrazione sono in `database-backups/`.

## Ripristino

Il DB di lavoro non è in Git: se ne tiene una copia di sicurezza (in `database-backups/`). Un DB a sé con
l'intera banca dei bacini, come era `prompt.sqlite3`, si scrive dalla raccolta; da lì si può ripartire
(per esempio su un PC appena clonato) importandolo come schema `raw`:

```powershell
python -B prompt_database.py dump --output bacini.sqlite3
python -B -c "import unified_db; unified_db.import_schema('bacini.sqlite3', 'raw')"
python -B prompt_database.py status
```

Contiene anche i verbali editoriali, le attribuzioni e le decisioni sulle voci,
non l'inventario: si raccoglie di nuovo con `prompt_inventory.py collect`. I precedenti
CSV da 5.000 prompt, le bozze locali in quarantena e i generatori storici non
vengono importati o promossi automaticamente. La revisione di quei dati resta
un lavoro distinto; il nuovo database non significa che tutti i 5.000 siano corretti.

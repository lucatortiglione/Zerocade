# Secondo archivio delle parole RAW

File: **`database/parole_ita_raw_2.0.sqlite3`**. Tabella su cui lavorare:
**`parole`**, colonna **`parola`**.

Il 16 novembre 2026 è stato inizializzato dalla raccolta locale esistente:

| Dato | Totale |
|---|---:|
| Voci uniche in `parole` | 2.847.433 |
| Fonti | 46 |
| Collegamenti parola/fonte | 7.273.769 |
| Acquisizioni archiviate | 49 |
| Dimensione iniziale del file | 631.037.952 byte |

Questa prima copia non ha effettuato un nuovo download. Il vecchio
`parole_ita_raw.sqlite3` è stato letto in sola lettura: conserva lavorazioni,
decisioni editoriali, normalizzazioni e bacini precedenti.

## Tabelle

| Tabella | Contenuto |
|---|---|
| `parole` | Una sola riga per voce; `parola` è chiave primaria e `is_single_word` distingue le parole singole dalle altre espressioni |
| `normalizzata` | Risultato della selezione di genere e numero, con riferimento alle parole originali |
| `normalizzazione_esclusioni` | Parole escluse dalla seconda tabella, sostituta, motivo e prove della decisione |
| `fonti` | ID, nome, formato, URL, licenza, attribuzione e configurazione delle fonti |
| `parole_fonti` | Provenienza multipla: una coppia univoca parola/fonte |
| `inventory_snapshots` | Versioni acquisite, hash SHA-256, URL effettivo nella configurazione e percorso del file originale |
| `inventory_http_cache` | ETag, Last-Modified e copie validate dei download |
| `meta` | Versione dello schema e origine dell'inizializzazione |
| `pulizia_parole` | Registro delle trasformazioni di caratteri e delle voci non lessicali rimosse |

La tabella `parole` raccoglie anche parole generiche, plurali e femminili.
Non applica filtri Zipf né importa i vecchi `DISCARDED`. I file originali nella
cache conservano i dati integrali delle fonti, inclusi dettagli morfologici;
il secondo DB conserva parole e provenienza, senza duplicare le revisioni editoriali.

## Task di aggiornamento

In VS Code: **Terminale → Esegui attività → ZeroCade : Aggiornamento parole RAW**.
Il task crea il file e le tabelle se mancano; poi controlla tutte le 46 fonti del
[registro](FONTI_PAROLE_RAW.md), senza un limite al numero di righe.

La deduplicazione usa Unicode compatibile, minuscole e spazi normalizzati: per esempio
` CASA `, `#casa` e `casa` producono la stessa voce. Gli accenti e gli apostrofi
linguistici vengono conservati. Emoji, faccine, URL, email e token numerici vengono
eliminati; i simboli decorativi vengono ripuliti senza concatenare parole distinte.
[Regole ed esempi della pulizia](PAROLE_RAW_2.0.md#pulizia-dei-caratteri-nel-raw-20).
Una parola presente in più fonti resta una sola riga, con più riferimenti in
`parole_fonti`. Le acquisizioni successive aggiungono parole e provenienza senza
cancellare le parole valide già raccolte. Una versione già importata viene riconosciuta dall'hash.

Ogni fonte viene importata in una transazione: un errore non lascia metà lista
nel DB. Le altre fonti vengono comunque tentate e il task segnala un esito non
completo se rimangono errori. Prima di aggiornare un file esistente ne crea un
backup in `gioco-zeroassociations/database-backups/parole_raw_2.0-<data>.sqlite3`.

Rapporto progressivo:
`gioco-zeroassociations/reports/aggiornamento_parole_raw_2.0.json`.

Il task mantiene tutte le forme; la selezione per i giochi è una fase successiva.
Il task **ZeroCade : Normalizzare parole RAW** popola `normalizzata` mantenendo
`parole` completa. Conserva femminili autonomi, plurali senza singolare e plurali
più frequenti; a parità di frequenza preferisce il singolare. Prima crea un backup.
[Criteri, gestione delle ambiguità e comandi](PAROLE_RAW_2.0.md#normalizzazione-delle-forme-delle-parole).
La ricostruzione è atomica e ripetibile. Le successive acquisizioni marcano
`meta.normalizzazione_stato` come `da_aggiornare`; rieseguire Normalizzare per
aggiornare il risultato. Il vecchio `normalize_words.py` rimane separato.

## Query utili

```sql
SELECT COUNT(*) FROM parole;
SELECT parola FROM parole ORDER BY parola;
SELECT parola FROM parole WHERE is_single_word = 1 ORDER BY parola;
SELECT parola FROM normalizzata ORDER BY parola;
SELECT parola, sostituita_da, motivo FROM normalizzazione_esclusioni ORDER BY parola;

SELECT f.nome, f.url
FROM parole_fonti pf JOIN fonti f ON f.id = pf.fonte_id
WHERE pf.parola = 'fare';
```

Per creare solo la struttura, senza download:

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/aggiorna_parole_raw.py --initialize-only
```

Per inizializzare dalla raccolta locale, con copie idempotenti:

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/aggiorna_parole_raw.py --seed-from database/parole_ita_raw.sqlite3 --initialize-only
```

## Pulizia dei caratteri nel RAW 2.0

Il task **ZeroCade : Aggiornamento parole RAW** pulisce ogni voce prima
dell'inserimento in `parole_ita_raw_2.0.sqlite3`, tabella `parole`.
Il codice condiviso è [raw_word_cleaning.py](../gioco-zeroassociations/script/raw_word_cleaning.py).

| Voce originale | Risultato |
|---|---|
| `#casa`, `@casa`, `casa!!!` | `casa` |
| `😀caffè❤️` | `caffè` |
| `😂`, `:-D`, `XD` | eliminata: nessuna parola |
| `cane/gatto`, `cane_gatto`, `cane-gatto` | `cane gatto`, conservando il confine fra parole |
| `l’acqua`, `po’` | `l'acqua`, `po'`, con apostrofo linguistico |
| URL, email, numeri e token alfanumerici come `h2o` | eliminati, senza inventare `ho` |

Sono conservati accenti e lettere latine. Sono normalizzati maiuscole, spazi,
varianti Unicode compatibili e apostrofi tipografici. Le lettere di altri alfabeti
non vengono trasformate arbitrariamente in frammenti latini. I simboli interni
diventano separatori, invece di concatenare parole che prima erano distinte.

Se due voci diventano uguali, resta una sola parola e si uniscono tutte le fonti.
La tabella `pulizia_parole` registra originale, risultato e motivo; `pulita=NULL`
indica una voce rimossa. I file originali delle fonti restano nella cache.

La prima esecuzione aggiorna anche il contenuto già presente, in una transazione
preceduta dal backup del DB. La pulizia è idempotente ed è versionata in
`meta.word_cleanup_version`. Una reinizializzazione dal vecchio RAW passa dalla
stessa procedura, per non reintrodurre simboli e faccine.

Per applicare soltanto la pulizia locale, senza scaricare le fonti:

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/aggiorna_parole_raw.py --cleanup-only
```

Una modifica della raccolta marca `normalizzata` come da aggiornare. Eseguire poi
**ZeroCade : Normalizzare parole RAW** per ricostruirla tenendo i lemmi e scartando
le forme flesse. Questa pulizia non è una valutazione editoriale e non applica soglie Zipf.

## Normalizzazione delle forme delle parole

Regola scelta il **16 novembre 2026** e aggiornata il **17 novembre 2026**: le forme
flesse si scartano e si tengono solo i relativi lemmi (politica `canonical-lemma-2.2`).
Il RAW 2.0 conserva tutte le forme originali nella tabella `parole`. La normalizzazione
popola la seconda tabella **`normalizzata`**, senza cancellare righe da `parole` o
approvare associazioni.

| Forma | Si tiene | Esempi |
|---|---|---|
| Plurale, femminile o altra flessione di un nome o aggettivo | il lemma attestato, anche se meno frequente | `stoviglie` → `stoviglia`, `uova` → `uovo`, `case` → `casa` |
| Femminile con un maschile equivalente | il maschile | `ragazza` → `ragazzo` |
| Forma verbale coniugata, participio, gerundio | l'infinito (se è nella raccolta) | `mangiavo` → `mangiare` |
| Comparativo e superlativo | restano famiglie distinte, rappresentate dal maschile singolare | `migliori` → `migliore` |

Restano, in modo conservativo: le forme che hanno anche un'altra lettura (`bella`
è anche un nome), le varianti senza genere o numero attestati (grafie alternative),
le forme il cui lemma non è nella raccolta (`occhiali` resterebbe se `occhiale` mancasse)
e le categorie diverse da nomi, aggettivi e verbi (pronomi come `tutti`). Una sostituta
non è mai a sua volta esclusa: nel dubbio la parola resta.

Risultato del 17/11/2026: 2.519.378 parole, 1.355.976 tenute, 1.163.402 escluse
(1.045.746 forme verbali, 64.972 forme flesse di nomi e aggettivi, 45.500 femminili
con maschile, 7.184 forme di comparativo o superlativo).

Le sezioni Genere e Numero qui sotto restano come storia della regola del 16/11/2026:
la scelta del numero per frequenza è **sostituita** dal lemma.

### Genere

- Integrare il femminile come forma autonoma soltanto quando manca un equivalente
  maschile dello stesso lemma/significato.
- Se il maschile equivalente è attestato, preferirlo anche se il femminile è più
  frequente. Successivamente confrontare singolare e plurale delle forme maschili.
- Il confronto richiede una relazione morfologica o lessicografica esplicita:
  la somiglianza della desinenza non dimostra equivalenza. `banca` e `banco` non
  vengono accorpati automaticamente.
- Un nome grammaticalmente femminile come `casa` non viene escluso perché termina
  in `a`: serve un vero equivalente maschile per lo stesso significato.
- Se le prove non collegano due lemmi distinti, l'assenza del collegamento non
  certifica l'assenza di un equivalente: la voce resta nel RAW per la revisione
  lessicale/semantica. Questo passaggio non la approva automaticamente per il gioco.

### Numero (regola del 16/11/2026, sostituita dal lemma il 17/11/2026)

- Preferire il plurale soltanto se è più comune del singolare corrispondente.
- Il confronto automatico usa la frequenza Zipf italiana di **wordfreq**, sulle
  singole forme. A parità di frequenza si tiene il singolare.
- Esempio con wordfreq 3.1.1: **stoviglie = 3,15**, **stoviglia = 1,40**.
  La rappresentante è quindi **stoviglie** e la forma meno comune è segnalata.
- Senza maschile equivalente, lo stesso confronto si applica alle forme femminili.
- Le forme invariabili non producono doppioni; le parole con letture incompatibili
  vengono conservate per la revisione, senza escluderle sulla sola desinenza.
- Nei lemmi che cambiano genere al plurale, come `uovo/uova`, si confronta il
  numero: il plurale femminile non è automaticamente una variante femminile
  parallela, anche se una fonte elenca una rara alternativa maschile plurale.
  Il confronto di genere richiede forme parallele; per i nomi con singolare
  esclusivamente maschile e plurale femminile si confrontano le frequenze del numero.
- Le frequenze sono una misura d'uso della forma, non del singolo significato.

### Implementazione e uso

[`canonical_word_forms.py`](../gioco-zeroassociations/script/canonical_word_forms.py)
legge lemma, categoria, genere e numero da Morph-it!, GLAFF, Flex-it, UniMorph,
Universal Dependencies e Wiktionary. Il task verifica gli hash e rilegge i file
originali delle acquisizioni RAW 2.0 già presenti nella cache. I collegamenti
espliciti nelle tabelle di flessione Wiktionary riconciliano anche lemmi distinti,
come `ragazza/ragazzo`. Positivo, comparativo e superlativo restano distinti.

Per i tratti in conflitto si preferiscono Morph-it!/Flex-it, poi UniMorph e
Wiktionary, poi GLAFF, infine le annotazioni contestuali UD. Una riga di lemma
generata dalla fonte non eredita il tag della forma osservata. Un'annotazione
contestuale isolata non trasforma un plurale attestato in una forma invariabile.
Le letture incompatibili della parola da escludere restano da rivedere; una
lettura aggiuntiva della forma conservata non blocca tutta la famiglia.

Il task VS Code **ZeroCade : Normalizzare parole RAW** esegue
[`normalizza_parole_raw_v2.py`](../gioco-zeroassociations/script/normalizza_parole_raw_v2.py):

```powershell
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/normalizza_parole_raw_v2.py --plan
.\gioco-zerocontext\.venv-vectors\Scripts\python.exe -B -X utf8 gioco-zeroassociations/script/normalizza_parole_raw_v2.py
```

`--plan` calcola soltanto il piano. Senza questa opzione il comando crea un backup
e ricostruisce `normalizzata` in una transazione. La tabella
`normalizzazione_esclusioni` conserva parola esclusa, sostituta, motivo, frequenze
e fonti della decisione. Le forme senza prove sufficienti restano disponibili.
Le voci non singole restano presenti con `is_single_word=0`; nessun filtro
editoriale o minimo Zipf viene aggiunto alla selezione di genere e numero.

Rapporto: `gioco-zeroassociations/reports/normalizzazione_raw_2.0.json`.
Backup: `gioco-zeroassociations/database-backups/normalizzata-<data>.sqlite3`.
Le banche già pubblicate dei giochi restano separate da questa lavorazione.

Il task **ZeroCade : Aggiornamento parole RAW** acquisisce tutte le fonti e conserva
le forme originali nel secondo DB `parole_ita_raw_2.0.sqlite3`, tabella `parole`.
La normalizzazione è un passaggio separato di selezione nel nuovo archivio.
Un aggiornamento delle fonti marca il risultato come `da_aggiornare` nei metadati;
rieseguire il task Normalizzare per ricostruire la seconda tabella.
`normalize_words.py` rimane lo strumento storico delle decisioni del vecchio RAW.
Il [catalogo delle fonti](FONTI_PAROLE_RAW.md) elenca provenienza e licenze.

La politica è verificata su fixture isolate e applicata al secondo DB reale.

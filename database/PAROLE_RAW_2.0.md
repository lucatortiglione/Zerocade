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
| `normalizzata` | Risultato della normalizzazione: un solo lemma per parola, con riferimento alle parole originali. Colonne: `parola`, `is_single_word`, `lexical_validity`, i valori grezzi `word_prevalence`, `contextual_diversity` e `frequency`, e l'[IWFS](IWFS_Specifica_Indice_Familiarita_Italiano_v1.0.md) (`iwfs`, `iwfs_status`, `iwfs_confidence`, `familiarity_band`). Calcolati dal task **Normalizzare parole RAW**; vedi [IWFS](#italian-word-familiarity-score-iwfs-18112026) |
| `zerowordhunt` (non più qui) | La tabella di ZeroWordHunt non sta più nel RAW 2.0: è `zerowordhunt_parole` in `database/giochi_v2.sqlite3` (vista `zerowordhunt`), con le parole di `normalizzata` di almeno 4 lettere e IWFS ≥ 50. Creata dal task **ZeroWordHunt : Genera Parole**; va rigenerata dopo ogni normalizzazione. Un'eventuale tabella `zerowordhunt` rimasta nel RAW 2.0 è obsoleta e si può eliminare |
| `word_measurements` | Una riga per parola e metrica (`prevalence`, `contextual_diversity`, `frequency`): valore grezzo, valore normalizzato 0-100, stato (`OBSERVED`, `MISSING`…), numerosità del campione, fonte e versioni |
| `normalizzazione_esclusioni` | Parole escluse dalla seconda tabella, sostituta, motivo e prove della decisione |
| `fonti` | ID, nome, formato, URL, licenza, attribuzione e configurazione delle fonti |
| `parole_fonti` | Provenienza multipla: una coppia univoca parola/fonte |
| `inventory_snapshots` | Versioni acquisite, hash SHA-256, URL effettivo nella configurazione e percorso del file originale |
| `inventory_http_cache` | ETag, Last-Modified e copie validate dei download |
| `meta` | Versione dello schema e origine dell'inizializzazione |

La tabella `parole` raccoglie anche parole generiche, plurali e femminili.
Non applica filtri Zipf né importa i vecchi `DISCARDED`. I file originali nella
cache conservano i dati integrali delle fonti, inclusi dettagli morfologici;
il secondo DB conserva parole e provenienza, senza duplicare le revisioni editoriali.

## Task di aggiornamento

In VS Code: **Terminale → Esegui attività → ZeroCade : Aggiornamento parole RAW**.
Il task crea il file e le tabelle se mancano; poi controlla le 9 fonti del
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
Le voci modificate o rimosse non vengono registrate in una tabella (`pulizia_parole` è stata eliminata il 18/11/2026):
il conteggio sta in `meta.word_cleanup_report`. I file originali delle fonti restano nella cache.

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
| Plurale o altra flessione di un nome o aggettivo | il singolare, salvo il plurale nettamente più comune con voce propria | `case` → `casa`, `amici` → `amico`; ma `stoviglia` → `stoviglie` |
| Femminile con un maschile equivalente | il maschile, sempre, anche se il femminile è più comune | `ragazza` → `ragazzo`, `sposa` → `sposo`, `cassiera` → `cassiere` |
| Forma verbale coniugata, participio, gerundio | l'infinito (se è nella raccolta) | `mangiavo` → `mangiare` |
| Verbo con particelle (infinito, gerundio, imperativo + mi, gli, la, ne…) | l'infinito semplice | `offrirgliela`, `offrendoci` → `offrire` |
| Infinito riflessivo in -rsi con l'infinito semplice nella raccolta | l'infinito semplice | `lavarsi` → `lavare`, `offrirsi` → `offrire` |
| Superlativo assoluto regolare (-issimo, -issima, -issimi, -issime) | l'aggettivo | `onestissimo` → `onesto`, `benissimo` → `bene` |
| Comparativo e superlativo irregolare | restano parole a sé | `ottimo`, `massimo`, `pessimo`, `migliore` |

Restano, in modo conservativo: le forme che hanno anche un'altra lettura (`bella`
è anche un nome), le varianti senza genere o numero attestati (grafie alternative),
le forme il cui lemma non è nella raccolta (`occhiali` resterebbe se `occhiale` mancasse)
e le categorie diverse da nomi, aggettivi e verbi (pronomi come `tutti`). Una sostituta
non è mai a sua volta esclusa: nel dubbio la parola resta.

I verbi essenzialmente pronominali, senza un infinito semplice (`accorgersi`, `pentirsi`, `arrabbiarsi`), restano. Un plurale o un
participio in -rsi (`versi`, `persi`, `scorsi`) non è un infinito riflessivo: la regola vale solo se una fonte morfologica non lo
indica come nome, aggettivo o forma flessa. Regola `reflexive_infinitive` nel registro delle esclusioni; le forme che avevano
la forma in -rsi come sostituta (`mescolandosi`) passano all'infinito semplice.

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
come `ragazza/ragazzo`. I superlativi regolari escono; i comparativi e i superlativi irregolari restano distinti.

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

## Fonti ridotte a nove (18/11/2026)

Il registro contiene solo: LiITA Lemma Bank, CompL-it (CNR), Wikizionario e Wiktionary inglese tramite Kaikki (solo voci
italiane), Morph-it!, CoLFIS (CNR), Nuovo vocabolario di base di De Mauro, MAGIC (ILC-CNR) e PAISÀ (frequenza minima 50).
Sono state tolte le altre fonti, tra cui Napolux, i Wiktionary francese, tedesco e spagnolo, le liste di
frequenza, i treebank, GLAFF-IT, Flex-it, UniMorph, De Mauro e LibreOffice. LiITA, CompL-it, CoLFIS, MAGIC e PAISÀ danno solo lemmi (LiITA, CompL-it e CoLFIS senza nomi propri). Alla prima esecuzione il task elimina dal DB le attestazioni delle fonti tolte e le parole rimaste senza fonte
(`prune_sources`); le tabelle riportano i numeri dopo quell'esecuzione. Il [catalogo](FONTI_PAROLE_RAW.md) ha URL e licenze;
CompL-it è CC BY-NC-SA (solo uso non commerciale).
Le fonti che davano flessione e genere/numero (GLAFF-IT, Flex-it, UniMorph, treebank) non ci sono più: la riduzione delle
forme flesse all'infinito e al maschile singolare si appoggia a Morph-it! e ai Wiktionary.

## Nomi di persona e cognomi (18/11/2026)

Il task toglie dal RAW i nomi di battesimo e i cognomi (`raw_person_names.py`, `WordDatabase.remove_person_names`; conteggi in
`meta.filtro_nomi` e nel rapporto, senza una tabella dell'elenco). L'elenco viene dalle voci dei Wiktionary in registro con categoria «nome proprio» la cui definizione dice nome
di battesimo o cognome. Una parola dell'elenco resta se è anche una parola comune: voci non proprie dei Wiktionary (`verdi`,
`colombo`) o presenza in LiITA, CompL-it o CoLFIS, che non hanno nomi propri. Limiti: un cognome assente dai Wiktionary
(`tortiglione`) non si riconosce; un nome che è anche parola comune (`dante`, `elisa`) resta. Sul RAW precedente toglieva
circa 121.000 parole.

## Solo parole italiane (17/11/2026)

Il task **ZeroCade : Aggiornamento parole RAW** scarta le parole non italiane sia all'import sia su quelle già presenti
(`raw_language_filter.py`, `WordDatabase.remove_foreign_words`). Una parola è straniera quando, secondo wordfreq, l'inglese
(Zipf ≥ 2,5 e almeno 1 sopra l'italiano) o il francese, lo spagnolo, il tedesco (almeno 1,5 sopra) la superano nettamente.
Per l'inglese, dato che il Zipf italiano è inquinato da parole inglesi, vale anche una regola più stretta: almeno 4 lettere,
Zipf inglese ≥ 3,0 non inferiore a quello italiano e finale in consonante o una tra j, k, w, x, y. Vale anche per le parole
attestate nelle fonti morfologiche italiane, che contengono parole inglesi. Limiti: non si giudicano le parole assenti da
tutte le liste di wordfreq, e qualche prestito o omografo può essere scartato; i conteggi per lingua stanno in `meta.filtro_lingua` e nel rapporto (la tabella `parole_straniere` è stata eliminata).
Esce anche la parola con un'ortografia che l'italiano non ha (`spelling_oddity`): sempre se non ha vocali (sigle come `cnr`) o
comincia per «aa» (`aarhus`, `aamot`, `aargh`); se ha una j, k, w, x, y, finisce in consonante, contiene «aa», un digramma
straniero (sh, ck, tz, th, ph, ij, ou, eau; «ch»/«gh» davanti ad a/o/u o a fine parola, non «sch»/«cch»/«ché») o cinque
consonanti di fila, solo quando non ha frequenza italiana e nessuna fonte che documenta l'italiano (`morphit`, `glaffit`,
`flex-it`, `unimorph`, `libreoffice-it-dictionary`, NVdB, ItaOA) la attesta. Sul RAW attuale scarta circa 38.000 parole di
`normalizzata` (cognomi, nomi stranieri, sigle; versione `raw-language-filter-4`, che aggiunge i digrammi stranieri e toglie
circa 2.100 cognomi come `chaabane`, `chabroux`, `chaddaoui`); qualche termine italiano raro (`estender`, `kilocandela`) può essere perso.
Un cognome con ortografia plausibile (`abaidoo`) resta: la lingua di una parola senza dati non si può giudicare.
Il filtro segna `normalizzata` come da aggiornare: rieseguire "Normalizzare parole RAW" e poi "ZeroWordHunt : Genera Parole".

## Plurali senza attestazioni morfologiche (17/11/2026)

Le fonti morfologiche indicano il numero solo delle parole che conoscono. Per una parola presente solo in liste di parole
(per esempio `mazzinianesimi`, prima solo in `napolux-paroleitaliane`, fonte tolta il 18/11/2026) la normalizzazione ricava il singolare dall'ortografia: desinenze
`-isti/-ista`, `-ioni/-ione`, `-chi/-co`, `-ghi/-go`, `-ci/-co`, `-gi/-go`, `-che/-ca`, `-ghe/-ga`, `-i/-o`, con la parola di almeno 6 lettere,
il singolare presente e non escluso e non molto meno frequente (`tesi` non diventa plurale di `teso`). Non vale per `-e/-a`
(`sale`/`sala`). Regola `orthographic_plural` nel registro delle esclusioni.

## Genere e numero: solo lemmi (18/11/2026)

In `normalizzata` ogni parola è un lemma: **il maschile, oppure il femminile se un maschile equivalente non esiste**; **il singolare,
a meno che il plurale sia la forma più comune** (`stoviglie`, `spaghetti`, `maccheroni`, `mutande`).

- **Genere.** Se il maschile esiste si tiene sempre, anche quando il femminile è più frequente (`sposa` → `sposo`; prima vinceva il
  femminile con almeno 0,5 di Zipf in più, regola tolta). Il femminile resta solo senza maschile equivalente (`casa`).
- **Numero.** Il plurale è una forma flessa e il singolare è il lemma. Il plurale vince solo se (`prefer_common_plurals`): ha una voce
  propria nelle fonti nella stessa categoria del lemma, è il plurale regolare del singolare (`stoviglie`/`stoviglia`, non `parte`/`parto`),
  supera il singolare di almeno 1,0 di Zipf (wordfreq) e il singolare è raro (Zipf ≤ 3,0: `menta` non cede a `mente`). Allora il plurale
  resta, il singolare e le altre forme del lemma escono e lo hanno come sostituto (regola `common_plural`).
- **Letture in conflitto.** Una forma che nessuna fonte dà come lemma a sé (gli [omografi](#omografi-come-si-selezionano-18112026) restano), oppure che in un'altra lettura è il femminile o il plurale di
  un lemma presente (`sarda`, `poltrone`, `funeste`, `raccolti`), esce anche se le fonti non concordano sul lemma o se ha pure una lettura
  verbale (`exclude_forms_of_present_lemmas`, regola `inflected_form`). Una lettura verbale non rende ambigua una forma di nome o
  aggettivo (`sposa` è anche voce di sposare). Restano le forme con una lettura di altra categoria (avverbi, numerali: `dieci`, `sette`,
  `prima`, `pure`).
- **Participi e infiniti.** I participi regolari seguono l'aggettivo omografo (`specializzata` → `specializzato`); un lemma che è anche
  gerundio non blocca le sue flessioni (`specializzandi` → `specializzando`); l'infinito troncato esce (`specializzar` → `specializzare`).
- **Superlativi.** Il superlativo assoluto regolare esce, con tutte le sue flessioni (`onestissimo`, `onestissima`, `onestissimi`, `onestissime` → `onesto`;
  `ricchissimo` → `ricco`; `benissimo` → `bene`; regola `regular_superlative`). Prima lo decidono le fonti (famiglia di grado,
  `exclude_regular_superlatives`); poi un controllo ortografico (`exclude_orthographic_superlatives`) toglie ogni forma in `-issimo/-issima/-issimi/-issime`
  la cui base (`-o`, `-a`, `-e`, `-io`, `-co/-go` → `-chissimo`) è nella raccolta e resta. Restano i superlativi irregolari (`ottimo`, `massimo`, `pessimo`) e
  i comparativi (`migliore`); restano anche le forme in `-issimo` senza base nella raccolta (`dottissimo`, `festivissimo`, circa 70). `prefer_most_common_lemma`
  non fa mai vincere un femminile su un maschile.

Regole nel registro delle esclusioni: `inflected_form`, `feminine_with_masculine`, `degree_form`, `common_plural`, `more_common_lemma`,
`verb_form`, `reflexive_infinitive`, `orthographic_plural`. Sul RAW attuale la tabella scende da circa 170.000 a circa 140.000 parole (8.283 superlativi regolari tolti); i plurali e i femminili con lemma presente
passano da circa 14.000 a circa 700, di cui solo 57 sospetti: gli altri sono omografi tenuti di proposito.

## Omografi: come si selezionano (18/11/2026)

Un **omografo** è una parola che è un lemma a sé ed è anche una forma flessa (plurale o femminile) di un altro lemma: `cane` (nome) è anche il
plurale femminile dell'aggettivo `cano`; `sole` anche il plurale di `solo`; `rosa` anche il femminile di `roso`; `parte` il plurale di `parta/parto`;
`mente` di `menta`; `porta` il femminile di `porto` (participio di porgere). Nel RAW restano come parole distinte: se fossero trattate come plurali o
femminili sparirebbero i lemmi più comuni. Le fonti (soprattutto il Wiktionary) collegano queste parole per una forma rara, e senza una guardia la
regola «maschile sempre, singolare sempre» ne toglieva centinaia di molto frequenti (`sole`, `cane`, `cosa`, `persona`, `strada`, `porta`, `volta`, `famiglia`).

**Criteri** (`FamilyEvidence.is_homograph` e le guardie collegate, in `canonical_word_forms.py`). Una parola con un lemma proprio e una lettura da forma
flessa resta se vale **almeno uno** di questi segnali (tutte le letture flesse devono essere coperte):

1. **Categoria diversa.** Tutte le sue letture da forma flessa stanno in una categoria diversa da quella del suo lemma (`rosa` nome contro `roso` aggettivo) e il suo
   lemma ha almeno due fonti. Per un femminile singolare serve in più una parola molto comune (Zipf ≥ `COMMON_WORD_ZIPF` = 4,5: `porta`, `volta`, `rosa`) o
   nettamente più comune del lemma (≥ 1,0): `abbandonata` e `agonistica` restano forme di participi e aggettivi.
2. **Genere.** È un nome maschile e l'altra lettura è un femminile plurale (`cane`, `sole`).
3. **Plurale più comune del lemma.** È il plurale di un lemma meno comune di almeno `HOMOGRAPH_MARGIN` = 1,0 di Zipf (`parte` 6,18 contro `parto` 4,33; `mente`),
   salvo il plurale più comune di un singolare raro (`stoviglie`, deciso da `prefer_common_plurals`).
4. **Femminile molto più comune del presunto maschile.** Almeno `FEMININE_HOMOGRAPH_MARGIN` = 2,0 di Zipf in più: `cosa` (6,2) contro `coso` (3,9), `persona`/`delatore`,
   `strada`/`stradino`, `carne`, `camera`. La stessa soglia vale quando la famiglia di un femminile contiene un presunto maschile (la voce `persona` del
   Wiktionary elenca `delatore`) e quando un alias di genere unisce due lemmi (`canonical`): una vera coppia (`massaia` 2,5 e `massaio` 1,15, divario 1,35)
   non la supera e vince il maschile.

Inoltre un **verbo all'infinito** non è mai la forma flessa di un nome o aggettivo (`tenere` non è il plurale di `tenero`, `leggere` di `leggero`).
Un omografo non viene escluso né dal confronto delle famiglie (`select_families`) né da `exclude_forms_of_present_lemmas` né da
`exclude_plurals_of_excluded_forms`. I suoi plurali escono lo stesso (`parti`, `menti`, `cose`). Una parola con una lettura di altra categoria
(avverbio, numerale: `sette`, `prima`) resta per un altro motivo: `altra_categoria`.

**Come ottenere l'elenco.** Gli omografi non sono salvati in una tabella (le tabelle dei registri sono state eliminate): li elenca il rapporto
`gioco-zeroassociations/reports/normalizzazione_raw_2.0.json`, ogni volta che gira **Normalizzare parole RAW** (anche con `--plan`, senza
scrivere):

```text
audit.homographs_kept.total   numero di omografi tenuti (circa 720 sul RAW attuale)
audit.homographs_kept.words   l'elenco completo, in ordine alfabetico
audit.homographs_kept.sample  40 parole prese a intervalli regolari
```

Per leggerli: `python -c "import json;print(json.load(open('gioco-zeroassociations/reports/normalizzazione_raw_2.0.json',encoding='utf-8'))['audit']['homographs_kept']['words'])"`.
Per sapere se una parola è ancora in `normalizzata`: `SELECT 1 FROM normalizzata WHERE parola = 'parte';` (tutti gli omografi tenuti ci sono; le loro
forme flesse in `normalizzazione_esclusioni`, con `sostituita_da`).

**Controlli di verifica del task** (`FamilyEvidence.audit`, sezione `audit` del rapporto, riga «Controlli» a fine esecuzione). Non modificano la tabella:

- `residual_inflected_forms`: plurali e femminili ancora in `normalizzata` con il lemma presente, per motivo (`omografo`, `altra_categoria`,
  `lemma_in_conflitto`) con un campione. Gli omografi sono tenuti di proposito: il controllo conta come **sospetti** (`suspect`) solo gli altri, con limite
  `RESIDUE_LIMIT` = 500. Sul RAW attuale i residui sono circa 700, di cui circa 57 sospetti (quasi tutti numerali e avverbi);
- `homographs_kept` e `common_plurals`: totale e campioni (circa 720 omografi, 139 plurali più comuni);
- `removed_by_rule`: per ogni regola il numero di parole tolte e un campione di 40, da scorrere a occhio;
- `reference_checks`: 32 parole con l'esito atteso (`REFERENCE_CHECKS`): `parte`, `mente`, `parto`, `menta` e `mento` restano; `parti`, `menti`, `parta`
  escono; `stoviglie` resta e `stoviglia` esce; `sposo`/`sposa`, `massaio`/`massaia`, `casa`/`case`, `specializzato`/`specializzata`,
  `offrire`/`offrirgliela`/`lavarsi`, `onesto`/`onestissimo`, `ottimo`;
- `ok`: falso se un controllo di riferimento fallisce o i residui sospetti superano il limite. Il task lo scrive nel rapporto e stampa `ATTENZIONE`, ma
  non interrompe la normalizzazione.

**Limiti.** Le soglie usano la frequenza della forma (wordfreq): un omografo il cui lemma meno comune ha uno Zipf vicino (differenza < 1,0) esce come forma
flessa; una coppia di genere vera con un femminile molto più comune (≥ 2,0) viene tenuta intera. Alcuni femminili di participi con un uso nominale molto
frequente restano (`nuova`, `messa`, `granata`), e alcuni nomi femminili legati a un maschile della stessa categoria escono anche se sono parole a sé
(`politica`/`politico`, `morte`/`morto`, `destra`/`destro`, `borsa`): è la conseguenza di «maschile sempre», e per recuperarli basta alzare
`FEMININE_HOMOGRAPH_MARGIN` o aggiungere il caso a `REFERENCE_CHECKS`. Per cambiare i criteri si modificano `HOMOGRAPH_MARGIN`, `FEMININE_HOMOGRAPH_MARGIN`,
`COMMON_WORD_ZIPF`, `COMMON_PLURAL_SINGULAR_MAX`, `PLURAL_MARGIN` e `REFERENCE_CHECKS` in `canonical_word_forms.py`; i test sono in `test_canonical_word_forms.py`.

## Tabelle di giochi_v2 derivate da normalizzata (18/11/2026)

`database/giochi_v2.sqlite3` raccoglie le tabelle dei giochi che si ricavano da `normalizzata`. Ogni task legge il RAW 2.0 in sola lettura, controlla che
`normalizzata` sia aggiornata e abbia l'IWFS, fa un backup del file esistente (in `gioco-zeroassociations/database-backups/`), sostituisce **solo le proprie
tabelle** in una transazione e rilegge il risultato riga per riga. Vanno rieseguiti dopo ogni normalizzazione, nell'ordine: Aggiornamento parole RAW →
Normalizzare parole RAW → i task qui sotto. Il task **ZeroContext : Copia segrete da normalizzata** li lancia in sequenza da solo
(`dependsOn` in `tasks.json`): prima **Normalizzare parole RAW**, poi **ZeroWordHunt : Genera Parole**, poi la propria copia. Non include
**Aggiornamento parole RAW**, che scarica le fonti e va lanciato a parte quando cambiano; se un passo fallisce, quelli successivi non partono.

| Tabella | Task | Contenuto |
|---|---|---|
| `zerowordhunt_parole` (vista `zerowordhunt`) | **ZeroWordHunt : Genera Parole** | parole di almeno 4 lettere con IWFS ≥ 50 |
| `ZeroContext_Segrete` (con `ZeroContext_Segrete_meta`) | **ZeroContext : Copia segrete da normalizzata** | tutte le parole con IWFS ≥ 45, senza altri filtri |
| `zerocade_segrete` | **ZeroContext : Generazione segrete** | segrete scelte con finestra Zipf, NVdB, verbi attestati, densità e ponti (altra origine: non si tocca) |

**`ZeroContext_Segrete`** (`gioco-zerocontext/script/copia_segrete_normalizzata.py`, test in `test_copia_segrete_normalizzata.py`): colonne `id`, `parola`
(unica), `lunghezza`, `parola_singola` (1 se è una parola di sole lettere; le altre restano copiate e marcate 0), `iwfs`, `iwfs_completo` (1 se il punteggio ha
tutti e tre i componenti), `confidenza` (1 bassa, 2 media, 3 alta). La soglia è `--min-iwfs` (45 per default, **45 incluso**) e non c'è un limite di
lunghezza. Le righe con IWFS parziale (senza Word Prevalence) sono copiate e marcate (`iwfs_completo = 0`, confidenza 1): si escludono con `iwfs_completo = 1`.
`ZeroContext_Segrete_meta` registra soglia, origine, versione della normalizzazione e del modello IWFS e i conteggi. Il nome della tabella non distingue
maiuscole e minuscole in SQLite (`zerocontext_segrete` è la stessa tabella). Sul RAW di prova: 43.407 parole su 140.265.

## Italian Word Familiarity Score (IWFS, 18/11/2026)

Il task **Normalizzare parole RAW** calcola per ogni parola di `normalizzata` l'IWFS, da 0 a 100, secondo la
[specifica IWFS v1.0](IWFS_Specifica_Indice_Familiarita_Italiano_v1.0.md) (`raw_word_familiarity.py`, `raw_word_metrics.py`):

```text
IWFS = 0,50 · P + 0,30 · D + 0,20 · F
```

| Componente | Misura | Fonte | Normalizzazione 0-100 |
|---|---|---|---|
| `P` Word Prevalence (50%) | quota di partecipanti che riconosce la parola | Italian Crowdsourcing Project (ICP), 130.495 parole | prevalenza z del file riportata a proporzione, Φ(z) · 100 |
| `D` Contextual Diversity (30%) | film e programmi diversi in cui compare la parola | SUBTLEX-IT, colonna `cd_count` | rango percentile sul lessico di riferimento |
| `F` Frequenza (20%) | frequenza del lemma (o della forma) | SUBTLEX-IT, `dom_lemma_freq` o `freq_count` | rango percentile sul lessico di riferimento |

- **Dati mancanti.** Mai 0 per un dato mancante. `P` manca per le parole che l'ICP non ha sottoposto ai partecipanti (stato `MISSING`,
  valore `NULL`). `D` ed `F` vengono da un corpus completo: una parola assente da SUBTLEX-IT ha zero occorrenze osservate (`OBSERVED`, 0).
  Tre componenti → `FULL`; due → `PARTIAL` (pesi rinormalizzati sui presenti); una → `DIAGNOSTIC`; nessuna → `UNAVAILABLE` con `iwfs` `NULL`.
- **Confidence.** `HIGH`: `FULL`, validità `VALID` e almeno 30 osservazioni ICP; `MEDIUM`: `FULL` o `PARTIAL` con campione ICP più piccolo o
  validità da rivedere; `LOW`: senza Word Prevalence o diagnostico; `NONE`: nessun dato.
- **Fasce provvisorie** (`familiarity_band`): 85-100 `MOLTO_FAMILIARE`, 65-84 `FAMILIARE`, 40-64 `POCO_FAMILIARE`, 0-39 `RARA`. Solo per `FULL` e
  `PARTIAL`; non sono la difficoltà di gioco.
- **Validità lessicale** (`lexical_validity`): `VALID` se la parola è attestata da una fonte lessicografica (LiITA, CompL-it, Wikizionario,
  MAGIC, NVdB), `REVIEW_REQUIRED` se solo da altre, `UNKNOWN` se da nessuna. Non è un giudizio di esistenza.
- **Versioni.** `meta.iwfs_model` e `word_measurements` registrano versione del modello (1.0), della normalizzazione e l'impronta dei file
  (`iwfs-norm-1/<impronta del lessico di riferimento>`): i punteggi sono confrontabili solo a parità di versione.
- **Cache.** I due file si scaricano al primo uso in `%LOCALAPPDATA%/Zerocade/word-association/metrics/`.

### Quale campo usare per sapere se una parola è conosciuta o frequente

Le colonne di `normalizzata` esistono dopo aver eseguito **Normalizzare parole RAW** sul database.

**Campo principale: `iwfs`** (0-100, più alto = più familiare). `familiarity_band` lo traduce nelle fasce provvisorie:
`MOLTO_FAMILIARE` (85-100), `FAMILIARE` (65-84), `POCO_FAMILIARE` (40-64), `RARA` (0-39).

**Affidabilità del valore**

| Campo | Valori | Significato |
|---|---|---|
| `iwfs_status` | `FULL` | tre componenti presenti: punteggio completo |
| | `PARTIAL` | ne manca uno: pesi rinormalizzati sui presenti |
| | `DIAGNOSTIC` | ne è presente uno solo: non è un punteggio affidabile, `familiarity_band` è `NULL` |
| | `UNAVAILABLE` | nessuno: `iwfs` è `NULL` |
| `iwfs_confidence` | `HIGH` | `FULL`, validità `VALID` e almeno 30 risposte ICP |
| | `MEDIUM` | `FULL` o `PARTIAL` con campione ICP piccolo o validità da rivedere |
| | `LOW` | senza Word Prevalence, o diagnostico |
| | `NONE` | nessun dato |

Per classifiche o scelte di difficoltà usare `FULL`, oppure `PARTIAL` con confidence `MEDIUM`. Non basarsi sui valori `LOW`.

**«Conosciuta» e «frequente» sono due domande diverse e hanno campi separati**

| Domanda | Campo in `normalizzata` | Valore 0-100 in `word_measurements` (`value_normalized`) |
|---|---|---|
| È conosciuta? | `word_prevalence` (prevalenza z dell'ICP) | `metric = 'prevalence'`: Φ(z) · 100, quota di partecipanti che la riconosce |
| È frequente? | `frequency` (frequenza SUBTLEX-IT del lemma o della forma) | `metric = 'frequency'`: rango percentile |
| Compare in molti contesti? | `contextual_diversity` (film distinti) | `metric = 'contextual_diversity'`: rango percentile |

Esempio: parole familiari e affidabili.

```sql
SELECT parola, iwfs, familiarity_band
FROM normalizzata
WHERE iwfs_status IN ('FULL','PARTIAL')
  AND iwfs_confidence IN ('HIGH','MEDIUM')
  AND iwfs >= 65;
```

Esempio: i tre componenti di una parola.

```sql
SELECT metric, value_raw, value_normalized, status, sample_size
FROM word_measurements WHERE parola = 'casa';
```

**Avvertenze**

- Le parole che l'ICP non ha sottoposto ai partecipanti (circa metà della tabella) hanno `word_prevalence` a `NULL` (stato `MISSING`): il loro `iwfs` è
  `PARTIAL` con confidence `LOW`, calcolato solo da contesto e frequenza.
- Una parola assente da SUBTLEX-IT ha zero occorrenze osservate (`frequency` e `contextual_diversity` a 0, stato `OBSERVED`): spesso finisce in `RARA`.
  Non vuol dire che la parola non esiste: `lexical_validity` è una verifica separata e `UNKNOWN` o assenza dalle fonti non equivalgono a `REJECTED`.
- `iwfs` misura la familiarità lessicale, non la difficoltà di gioco: una parola comune può essere difficile da indovinare in un puzzle specifico.
- I punteggi sono confrontabili solo a parità di `normalization_version` (in `word_measurements` e in `meta.iwfs_model`).

**Scostamenti dalla specifica** (dichiarati, da risolvere): `D` usa i film di SUBTLEX-IT invece dei documenti di PAISÀ (il conteggio per
documenti di PAISÀ non è disponibile), quindi `D` ed `F` vengono dallo stesso corpus e sono correlate; `F` non usa ancora CoLFIS; i
percentili non sono stratificati per parte del discorso; AoA, concretezza e le statistiche di gioco (`game_word_stats`) non sono implementati.
Pesi e soglie sono ipotesi iniziali e vanno calibrati. Le licenze di ICP (non dichiarata) e SUBTLEX-IT (CC BY-NC-SA) vanno verificate prima
dell'uso commerciale.


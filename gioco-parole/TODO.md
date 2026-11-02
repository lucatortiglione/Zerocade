# ZeroWords · TODO

Gioco di parole per Android (poi iOS): una ruota di lettere e uno schema a incastro da completare trascinando il dito sulle lettere.
"ZeroWords" è il nome scelto (prima "Incastro", titolo provvisorio; nel codice resta `incastro`). Va ancora verificato: vedi [1. Decisioni](#1-decisioni-da-prendere-prima-di-scrivere-codice).

Il genere è noto e diffuso. Questo piano usa come studio il reverse engineering di Words of Wonders 5.10.4 (`com.fugo.wow`). Il report completo è in `../Words_of_Wonders_RE/README.md`. Dall'analisi prendiamo **solo** meccaniche di genere e lezioni tecniche. Incastro **non** è una copia di Words of Wonders:
- tema, progressione, meta-gioco e identità sono nostri;
- i livelli sono generati da noi a partire da un dizionario con licenza libera.

**Regola del progetto: tutto ciò che va nell'app deve essere nostro o con licenza libera.**

| Cosa | Dal riferimento | Si può usare? |
|---|---|---|
| Meccanica di genere: ruota di lettere, schema a incastro, mescola, aiuti, parole extra | osservata nel codice | Sì: idee e generi non sono proteggibili |
| Lezioni tecniche: livelli a pacchetti per lingua, verifica automatica degli schemi, audio a eventi, salvataggi versionati | misurate nell'analisi | Sì |
| I 145.240 livelli in `spgamedata/` (inglese, russo, turco: livelli 1–14.980) | `livelli/` | **No.** Sono una banca dati protetta. I nostri livelli si generano da un dizionario libero (M2) |
| Testi: nomi e descrizioni delle tappe, interfaccia in 37 lingue | `testi/` | **No.** Possiamo usare la lista delle funzioni, non i testi |
| Grafiche (1.347 texture, 1.680 sprite), icona, nome | `immagini/` | **No.** L'identità visiva è nostra (sezione 4) |
| Suoni (164 clip) e musica | `suoni/` | **No.** Effetti CC0 o creati da noi |
| Font (Avenir Next, Gotham, Montserrat…) | `font/` | **No.** Avenir e Gotham sono commerciali; usiamo font OFL inclusi nell'app |
| Tema "meraviglie del mondo divise per Paese" e i gimmick propri (farfalla, quadrifoglio, caselle stella, ruota dorata) | `gamedata`, codice `v2Gameplay` | **No.** Sono l'identità di quel gioco: tema e collezionabili li inventiamo noi |

---

## 0. Cosa c'è già in questa cartella

Il riferimento tecnico resta in `../Words_of_Wonders_RE/` e **non** va copiato qui dentro: niente asset, livelli o testi. Tutto quello che segue è nostro o con licenza libera.

| Percorso | Contenuto | Stato |
|---|---|---|
| `lexicon/it/words.tsv` | Parole accettate, 3–8 lettere, con frequenza Zipf e livello (`main` = può stare nello schema, `extra` = solo parola extra): 13.519 main + 22.598 extra | ✅ |
| `lexicon/it/SOURCE` | Fonti, versioni, licenze e attribuzione da mostrare | ✅ |
| `lexicon/it/not_in_grid.txt` | Parole valide che non vanno mai nello schema (nomi, sigle, prestiti, interiezioni) | ✅ prima revisione |
| `lexicon/blocklist_it.txt` | Parole escluse ovunque: volgari, offensive, sensibili | ✅ prima revisione |
| `tools/build_lexicon.py` | M1: Morph-it! + frequenze wordfreq → `words.tsv` | ✅ |
| `apps/server/src/wordgen/` (fuori da questa cartella) | M2: generatore dei livelli in TypeScript, dentro il server di Zerocade: livelli senza fine, creati durante la partita e deterministici dal numero; `npm run wordgen -w @zerocade/server` per tararlo ([ALGORITMO.md](ALGORITMO.md)) | ✅ |
| `tools/validate_levels.py` | M2: validatore dei livelli scritti dal generatore (esce con 1 se un livello è sbagliato) | ✅ livelli 1–600, 0 errori |
| `tools/curve.json` | Curva di difficoltà (al posto di `curve.yaml`: niente dipendenza da PyYAML) | ✅ da tarare col playtest |
| `tools/make_backgrounds.py` | Disegna gli sfondi dei capitoli e scrive `data/chapters.json` | ✅ |
| `data/levels/it/pack_NNN.json` | Livelli scritti solo per il controllo (`--write N`), 100 per file; il server non li legge | ✅ |
| `data/chapters.json` | 30 capitoli da 20 livelli: nome, stagione, ora, sfondo, colore | ✅ (JSON invece di CSV) |
| `assets/backgrounds/chapter_NN.svg` | 30 sfondi 1080 × 1920: il giardino che cresce | ✅ |
| `assets/anteprima.html` | Tutti gli sfondi insieme (va aperta da un server locale, per esempio `python -m http.server`) | ✅ |

Rigenerare tutto (serve `pip install wordfreq`; le liste sorgente non stanno nel repository, vedi `SOURCE`):

```
python tools/build_lexicon.py <percorso>/morph-it_048.txt
npm run wordgen -w @zerocade/server -- --write 600
python tools/validate_levels.py
python tools/make_backgrounds.py
```

### Versione PC per Zerocade (fatta)

Prima dell'app Android, ZeroWords gira come gioco di **Zerocade** per le dirette TikTok/Twitch, sul modello di Bivio: il pubblico scrive in chat le parole che trova.

- **Server** (`apps/server/src/incastro.ts`): genera i livelli durante la partita (`wordgen/`, in un thread a parte, il successivo già pronto mentre si gioca), sceglie la variante Agevolata, Standard o Esperto del livello successivo secondo com'è andato il precedente (difficoltà automatica), legge i capitoli, controlla le parole della chat (accenti ignorati, fino a 4 parole per commento), assegna i punti (1 per lettera, +3 per la parola con tutte le lettere, 1 per una parola extra), gestisce aiuti automatici, aiuti dai trigger (con limite per livello e uno ogni 2 s), mescola, timer facoltativo, riepilogo e avanzamento. Il livello raggiunto è salvato per ogni overlay (`incastro_progress` in SQLite).
- **Overlay** (`apps/overlay/src/Incastro.tsx`): schema, ruota con la linea che collega le lettere della parola trovata, fumetto con chi l'ha trovata, feed, classifica, parole extra, anello dell'aiuto, riepilogo con il migliore del livello, festa di fine capitolo e nuovo giardino. Suoni sintetizzati (nessun file audio). Sfondo: foto NASA del giorno (la successiva scaricata in anticipo), giardino del capitolo, colore, trasparente o immagine caricata; a ogni livello qualche secondo di solo sfondo prima della griglia (fase `intro`, chat e tempi fermi). Griglia senza pannello, direttamente sull'immagine; i colori vengono dall'immagine (letta in un canvas 48 × 48, in OKLCH): tonalità dominante per vetri, caselle e ruota, colore più vivace e lontano da quella per le tessere trovate (sul giardino l'accento del capitolo).
- **Dashboard** (`apps/dashboard/src/components/IncastroSidebar.tsx`): collegamento TikTok, simulatore, pausa, salta/indietro/rigioca/vai al livello N, lettera, parola, mescola, soluzione del livello (solo in dashboard), classifica della live, trigger e impostazioni.
- **Pacchetto Windows**: `npm run package:win` mette il generatore in `app/wordgen-worker.mjs` e in `app/incastro` capitoli, `curve.json`, lessico e blocklist, con i crediti delle liste di parole.

Decisioni prese per questa versione, da confermare per l'app: tema B (il giardino che cresce), parole accentate solo come extra (`CITTA`, `PERCHE` non vanno nello schema). Si gioca solo in italiano (decisione 1).

---

## 1. Decisioni da prendere prima di scrivere codice

- [ ] **Tema e progressione.** Va evitato "viaggio tra le meraviglie del mondo per Paesi". Proposte:
  - A. Stagioni e paesaggi italiani;
  - B. un giardino che cresce a ogni capitolo;
  - C. una biblioteca da riordinare.

  Consiglio B: il meta-gioco "vedi crescere qualcosa" funziona senza eventi a tempo né server.
- [ ] **Modello economico.** Consiglio B, coerente con Bivio.
  - A. Gratis, con mancia facoltativa.
  - B. Gratis con N capitoli, più un acquisto unico "Tutti i capitoli" (non consumabile).
  - C. Gratis con monete acquistabili per gli aiuti.

  Il riferimento usa monete, pubblicità con circa 25 reti in mediazione, offerte e ruota della fortuna. In ZeroWords niente pubblicità né meccaniche d'azzardo: le monete si guadagnano solo giocando, con le parole extra e i capitoli completati.
- [x] **Lingua.** Solo italiano. Un'altra lingua richiederebbe dizionario libero, blocklist, livelli e revisione di un madrelingua: non è prevista.
- [ ] **Lettere accentate in italiano.** Proposta: lo schema e la ruota usano la lettera base (`CITTÀ` → `CITTA`), e la parola trovata si mostra con l'accento nella scheda di definizione (v2).
- [ ] **Stack.** Flutter, come Bivio: una sola base di codice e una sola toolchain. La ruota e la linea si disegnano con `CustomPainter`; Flame non serve.
- [ ] **Nome definitivo.** Scelto "ZeroWords" (era "Incastro"): verificarlo su EUIPO, UIBM e Play Store. Evitare qualsiasi nome che contenga "Wonders", "WoW" o ricordi il riferimento.
- [ ] **Analytics.** Nessuno, o un servizio rispettoso della privacy senza Advertising ID. Il riferimento usa Firebase, AppMetrica, AppsFlyer e geolocalizzazione via IP: niente di tutto questo.
- [ ] **Definizioni delle parole (v2).** Da una fonte con licenza compatibile (es. Wiktionary, CC BY-SA, con attribuzione), oppure scritte da noi.

---

## 2. Funzioni del riferimento e cosa fare in ZeroWords

Ricavate da nomi di classi e metodi IL2CPP, dal codice decompilato e dai dati. Le funzioni sono osservate; tempi, animazioni e bilanciamento non sono stati visti, perché l'app non è stata eseguita.

| Funzione nel riferimento | ZeroWords |
|---|---|
| Ruota di lettere: trascinamento, linea tra le lettere, deselezione tornando indietro, mescola (`WheelController`, `LineController`, `TouchController`) | **Tenere.** È il cuore del genere |
| Schema a incastro con parole orizzontali e verticali (`BoardController`) | **Tenere**, con layout e generatore nostri |
| Esiti della parola: trovata, già trovata, extra valida, non valida (`WordController`: `WordFound`, `SameFound`, `ExtraFound`, `NotFound`) | **Tenere**, con feedback ed effetti nostri |
| Parole extra che danno monete | **Tenere**: ricompensa ogni N parole extra |
| Parole bonus fuori schema (`BH`/`BV` nel formato del riferimento) | **v2.** Eventuale "parola segreta" del capitolo, nostra |
| Aiuto "rivela una lettera" e "rivela la casella scelta" (hint, martello) | **Tenere** come meccanica generica, con nomi e grafica nostri (es. "Lente" e "Matita") |
| Razzo (rivela più lettere), farfalla, quadrifoglio, caselle stella | **Non copiare.** Se serve un collezionabile, inventarne uno coerente col tema (es. semi del giardino) |
| Combo (parole trovate di fila) | **Tenere**, semplice: moltiplicatore visivo, senza valuta |
| Ordine delle lettere sulla ruota guidato da Remote Config (`wheelLetterOrderSettings`) | **Sostituire** con una regola locale (M3): mescolamento con vincoli, deterministico per livello |
| Variante "easy" di ogni livello e segmentazione per durata e precisione (`*_segments_p20p80`) | **Sostituire**: una curva di difficoltà del generatore, tarata con playtest. Niente A/B lato server |
| Puzzle giornaliero e serie di giorni (`DailyStreak`) | **Tenere** il puzzle giornaliero, deterministico per data e senza server; serie semplice e **senza** "congelamenti" a pagamento |
| Ruota della fortuna standard e dorata | **Eliminare** (meccanica d'azzardo) |
| Tornei, gare settimanali, eventi cooperativi, collezioni di carte, missioni, missioni giornaliere | **Eliminare** in v1. Le gare usano bot (`Segmentation.Bots`) presentati come avversari: niente avversari finti |
| Profilo, amici, sala dei trofei | **v2 eventuale.** Solo obiettivi locali o Play Games Achievements |
| Pubblicità (AppLovin MAX con circa 25 reti), pulsante di chiusura forzata delle pubblicità (`AdEscapeHatch`) | **Eliminare** |
| Offerte, pacchetti, Samsung e Xiaomi IAP | **Sostituire** con l'acquisto unico di Play Billing (decisione 1) |
| Salvataggio cloud con Play Games Snapshots (`PlayGamesManager`) | **v2.** Facoltativo |
| Abbassare la musica se un'altra app sta suonando (`MusicChecker`) | **Tenere**: buona pratica, si fa con `audio_session` |
| Qualità grafica in base al dispositivo (`DeviceClassifier`) | **Non serve**: grafica 2D leggera |
| Scorciatoie dinamiche del launcher (`AppShortcuts`) | **v2**: "Puzzle del giorno" come scorciatoia |
| Musica giapponese e set di effetti alternativo per lingua | **Non serve** in v1 |

---

## 3. Roadmap

Le stime valgono per uno sviluppatore che conosce Flutter e sono indicative.

### M0 · Impostazione del progetto (1–2 giorni)
- [ ] `flutter create --org it.<tuodominio> incastro` (Dart 3, Material 3)
- [ ] `minSdk 24`; `targetSdk` uguale al livello richiesto dal Play Store al momento della pubblicazione (il riferimento usa 36)
- [ ] Struttura di `lib/`:
  - `app/` (router, tema);
  - `features/{home,chapters,game,daily,settings,purchase}`;
  - `game/{wheel,board,input,rules}`;
  - `data/` (modelli, repository, salvataggi);
  - `l10n/`.
- [ ] Dipendenze di base: `go_router`, `flutter_riverpod`, `hive_ce`, `flutter_svg`, `just_audio` (o `audioplayers`), `audio_session`, `in_app_review`, `flutter_local_notifications`, `timezone`, `url_launcher`, `in_app_purchase`
- [ ] `flutter_lints` più `analysis_options.yaml` rigoroso
- [ ] CI con GitHub Actions: `flutter analyze`, `flutter test`, `python tools/validate_levels.py`, build dell'APK di debug
- [ ] Flavor `dev` e `prod`

### M1 · Dizionario (3–5 giorni più la revisione)
- [ ] **Fonti con licenza verificata**, in `lexicon/it/SOURCE` (URL, versione, licenza):
  - Italiano: valutare Morph-it! (CC BY-SA / LGPL), le liste derivate da Hunspell `it_IT` (GPL/LGPL: attenzione se si includono nell'app) o Wiktionary (CC BY-SA). **Va chiesta la conferma di un legale sulla licenza per un'app commerciale.** Le licenze share-alike possono estendersi ai file dei livelli.
  - Frequenza d'uso: `wordfreq` (codice Apache 2.0, dati CC BY-SA 4.0) o un corpus con licenza compatibile.
- [ ] `tools/build_lexicon.py`:
  1. maiuscolo; per l'italiano, accenti piegati sulla lettera base (decisione 1);
  2. solo lettere A–Z, lunghezza 3–8;
  3. via nomi propri, sigle, forme arcaiche e la blocklist;
  4. due livelli di parola: **principali** (frequenti, possono stare nello schema) ed **extra** (valide ma rare, accettate come parole extra);
  5. output `lexicon/it/words.tsv` con colonne `parola`, `frequenza`, `livello`.
- [ ] Blocklist curata a mano (volgari, offensive, temi sensibili); la CI fallisce se una parola della blocklist compare in un livello
- [ ] Indice per firma di lettere (lettere ordinate → parole), per trovare in fretta gli anagrammi e le sotto-parole

### M2 · Generatore e validatore di livelli (1–2 settimane)
**Formato dei livelli (nostro, leggibile).** È diverso dalla stringa compatta del riferimento:

```json
{ "version": 1, "language": "it", "pack": 1,
  "levels": [
    { "id": 1, "letters": "RAMO", "rows": 3, "cols": 4, "seed": 81723,
      "words": [ { "w": "RAMO", "r": 0, "c": 0, "d": "H" },
                 { "w": "AMO",  "r": 0, "c": 1, "d": "V" },
                 { "w": "ORA",  "r": 0, "c": 3, "d": "V" } ],
      "extras": ["ORMA", "MORA"],
      "metrics": { "letters": 4, "words": 3, "avgFreq": 5.1, "crossings": 2 } } ] }
```

```
RAMO     L'esempio rispetta le regole del validatore: AMO e ORA incrociano RAMO
.M.R     sulle lettere uguali, le colonne 1 e 3 non si toccano, e ogni parola
.O.A     (comprese le extra) è componibile con R, A, M, O.
```

- [x] **Algoritmo di generazione** (`apps/server/src/wordgen`): pipeline a sei stadi dalla curva a dente di squalo T(c, i): ruote sintetiche dall'indice dei multinsiemi, scheletro dell'archetipo (A telaio asimmetrico, B doppio lobo a ponte, C arcipelago ad albero, D arena densa), riempimento CSP con funzione di costo J, validazione con il solver umano simulato (D_sim entro ±3 da T), ordine della ruota, varianti DDA Agevolata (T − 15) ed Esperto (T + 12). Descrizione completa in [ALGORITMO.md](ALGORITMO.md).
- [x] **Revisione v2.1 del generatore** (versione `zw-2`, ALGORITMO.md §16): ruota = anagramma di una parola vera sempre nello schema, solver con sforzo normalizzato e ambiguità pesata per familiarità, scala fissa, varianti con bersagli raggiungibili e sostituzione per l'Agevolata, difficoltà automatica con aiuti per origine e due esiti uguali, dati delle partite in `zerowords_plays` / `zerowords_answers`.
- [ ] **Curva di difficoltà** in `tools/curve.json`: forma del dente, rampa, matrice per archetipo, pesi di J e del solver. I valori non fissati dalla specifica sono ipotesi (elenco in ALGORITMO.md): **tararli con i dati delle partite** (ALGORITMO.md §10.4) dopo alcune decine di live, su insiemi di stima e di verifica separati.
- [ ] **Lemmi nel lessico:** tenere in `words.tsv` il lemma di Morph-it! (ricostruendo il lessico) e limitare le forme dello stesso lemma per griglia.
- [ ] **Rating della chat** (media mobile su circa dieci livelli) al posto della serie di due esiti, quando i dati delle partite diranno come pesare tempi, stalli e partecipanti.
- [ ] **Livelli tutorial** (i primi 5–10) fatti a mano e marcati `"handmade": true`
- [ ] **Validatore** (`tools/validate_levels.py`, eseguito in CI). Fallisce se:
  - una parola esce dallo schema, o due parole si contraddicono in una casella;
  - una parola non è componibile con le lettere della ruota;
  - nello schema esistono sequenze orizzontali o verticali di 2+ lettere che non sono parole dichiarate (parole "involontarie");
  - lo schema non è connesso;
  - una parola è nella blocklist o non è nel dizionario;
  - un `id` è duplicato, oppure la stessa parola seme si ripete entro 50 livelli.

  È lo stesso tipo di controllo che, nell'analisi, ha verificato la coerenza dei 145.240 livelli del riferimento.
- [ ] Pacchetti da 100 livelli (`pack_NNN.json`), caricati in modo pigro. Il riferimento divide i livelli in file per sezione per lo stesso motivo.
- [ ] Obiettivo v1: **600 livelli** (circa 30 capitoli da 20), più il generatore pronto per allungare il gioco con gli aggiornamenti

### M3 · Gioco base offline (2–3 settimane)
- [ ] **Ruota**:
  - lettere su un cerchio, dimensioni adattive per 3–8 lettere;
  - trascinamento con `GestureDetector` e linea disegnata con `CustomPainter`;
  - si torna indietro sulla lettera precedente per deselezionare;
  - anteprima della parola composta sopra la ruota.
- [ ] **Ordine delle lettere**: mescolamento deterministico (seme = id del livello) con vincoli. La parola più lunga non deve essere leggibile in senso orario o antiorario da nessuna lettera di partenza, e al massimo 2 lettere consecutive devono seguire l'ordine di una parola dello schema. Pulsante **Mescola** gratuito, con animazione.
- [ ] **Schema**: celle vuote, piene e rivelate da un aiuto; scala automatica in base a righe, colonne e spazio disponibile; animazione di riempimento quando si trova una parola
- [ ] **Esiti della parola**:
  - trovata: riempimento e suono;
  - già trovata: lampeggio della parola nello schema;
  - extra: contatore e barra delle parole extra;
  - non valida: scossa della ruota e vibrazione leggera.
- [ ] **Fine livello**: parole trovate, extra, monete guadagnate, "Avanti"
- [ ] **Aiuti** con costo in monete: "Lente" rivela una lettera a caso tra le celle vuote; "Matita" rivela la casella scelta dal giocatore. Costi in `tools/curve.yaml`.
- [ ] **Monete** guadagnate a fine livello, ogni N parole extra e a fine capitolo. Nessuna vendita di monete in v1 (decisione 1).
- [ ] **Bus di eventi** interno (`LetterAdded`, `WordFound`, `ExtraFound`…), come lezione architetturale dal riferimento: UI, audio, vibrazione e salvataggi ascoltano gli eventi, invece di chiamarsi a vicenda
- [ ] **Salvataggio** locale: livello corrente, parole trovate nel livello in corso, extra trovate, monete, aiuti usati. Schema versionato con migrazioni; il riferimento ha dovuto ripulire chiavi obsolete con una migrazione nativa (`ClearPrefs`).
- [ ] Ripresa esatta del livello interrotto

### M4 · Capitoli e meta-gioco (1 settimana)
- [ ] Capitoli da 20 livelli, ognuno con sfondo, colore e nome nostri (tema dalla decisione 1)
- [ ] Mappa o lista dei capitoli con progresso
- [ ] Ricompensa a fine capitolo: il giardino cresce, cioè si sblocca un elemento grafico nella schermata Home
- [ ] Obiettivi locali (es. 100 parole extra), facoltativamente su Play Games

### M5 · Puzzle giornaliero (3–4 giorni)
- [ ] Livello generato o scelto in modo deterministico: `hash(data)` su un pacchetto dedicato `daily_YYYY.json`, generato offline
- [ ] Serie di giorni consecutivi, senza recupero a pagamento
- [ ] Notifica locale facoltativa (`POST_NOTIFICATIONS` richiesto dopo un gesto dell'utente, mai al primo avvio)

### M6 · Audio e vibrazione (3–4 giorni)
- [ ] Gestore audio a eventi (`AudioService`), con pool di player e cooldown per i suoni ravvicinati: la stessa lezione del `SoundManager` del riferimento, con suoni nostri
- [ ] **Toni della selezione**: una scala ascendente, un tono per ogni lettera aggiunta (8 note), discendente alla deselezione. Si generano con un sintetizzatore (es. jsfxr, output libero) o si registrano.
- [ ] Effetti: parola trovata, extra, già trovata, non valida, mescola, aiuto, fine livello, moneta
- [ ] Musica: un tema per la Home e uno per il gioco, CC0 o commissionati, in loop leggero (OGG, sotto 1,5 MB ciascuno)
- [ ] Volume separato per musica ed effetti; musica in pausa se un'altra app sta suonando (`audio_session`)
- [ ] Vibrazione leggera (`HapticFeedback`), disattivabile

### M7 · Localizzazione: non serve
Si gioca solo in italiano (decisione 1): testi dell'interfaccia direttamente in italiano, senza `flutter gen-l10n`.

### M8 · Monetizzazione senza pubblicità (3–4 giorni)
- [ ] Prodotto non consumabile `all_chapters` (decisione 1)
- [ ] Schermata di sblocco onesta: cosa si ottiene, prezzo locale, "Ripristina acquisti"; niente timer finti
- [ ] Stato dell'acquisto riverificato a ogni avvio
- [ ] Facoltativo: mancia consumabile

### M9 · Qualità (continuo, più 1 settimana prima del lancio)
- [ ] Test unitari:
  - selezione sulla ruota (incluso tornare indietro);
  - verifica della parola;
  - aiuti e monete;
  - ordine deterministico delle lettere;
  - parser dei pacchetti;
  - migrazioni dei salvataggi.
- [ ] Test del generatore e del validatore in Python (`pytest`), con livelli costruiti apposta per fallire
- [ ] Golden test dello schema in 3 dimensioni di schermo e con 3, 5 e 8 lettere
- [ ] Accessibilità:
  - contrasto almeno AA;
  - lettere grandi;
  - etichette TalkBack su ruota e schema;
  - modalità "tocca invece di trascinare" per chi ha difficoltà motorie;
  - font ad alta leggibilità opzionale.
- [ ] Prestazioni: 60 fps durante il trascinamento su un telefono economico, avvio a freddo sotto 2 s, APK sotto 40 MB. Il riferimento pesa circa 210 MB (base più librerie native), soprattutto per texture e SDK pubblicitari.
- [ ] Test su Android 8 (API 26), 13 e 15+, telefono piccolo e tablet

### M10 · Legale e pubblicazione (1 settimana più i tempi di Google)
- [ ] Attribuzioni delle licenze (dizionari, font, suoni) in una schermata "Crediti e licenze"
- [ ] Privacy policy e termini
- [ ] Modulo "Sicurezza dei dati" e questionario IARC
- [ ] Permessi minimi: `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`; `INTERNET` solo se servono acquisti o analytics. **Niente** `AD_ID`. Il riferimento ne dichiara 18, tra cui `AD_ID` e permessi di store terzi.
- [ ] Scheda store: icona 512×512, immagine in evidenza 1024×500, almeno 4 screenshot, descrizione in italiano
- [ ] Test chiuso richiesto per i nuovi account personali (verificare i requisiti attuali di Play Console)

---

## 4. Grafiche e suoni: specifiche e stato

Tutto nostro o con licenza libera. Le quantità del riferimento servono solo a stimare il lavoro.

| Asset | Specifica | Stato | Note |
|---|---|---|---|
| Icona del launcher e icona adattiva | SVG master, 108 dp con zona sicura 66 dp, variante monocromatica | ⬜ | |
| Sfondi dei capitoli | 1080×1920 WebP, uno per capitolo (30 per v1) | ✅ SVG (`assets/backgrounds`) | Il riferimento ne ha circa 550 per circa 15.000 livelli. Per noi bastano 30, più eventuali varianti di colore |
| Elementi del meta-gioco (giardino) | SVG o PNG a livelli, uno per capitolo | ✅ dentro gli sfondi | Ogni capitolo aggiunge piante e strutture: per l'app conviene separarli in livelli |
| Ruota: disco, lettere, linea, stato selezionato | in codice (`CustomPainter`) | ✅ in Zerocade (SVG), ⬜ app | Nessuna immagine necessaria |
| Celle dello schema: vuota, piena, rivelata, evidenziata | in codice | ✅ in Zerocade (CSS), ⬜ app | |
| Icone di interfaccia (mescola, aiuti, impostazioni, monete) | SVG 24–64 px | ⬜ | Lucide (ISC) o Material Symbols (Apache 2.0), più 2–3 icone nostre per gli aiuti |
| Font | OFL incluso nell'app | ⬜ | Es. Nunito, Baloo 2 o Fredoka per i titoli; Atkinson Hyperlegible (OFL) per l'opzione di leggibilità |
| Effetti sonori | circa 15, OGG mono 44,1 kHz | ✅ in Zerocade (Web Audio), ⬜ file per l'app | Sintetizzati (jsfxr) o CC0 (es. Freesound filtrato per CC0) |
| Toni della selezione | 8 note in scala | ✅ in Zerocade (scala maggiore) | |
| Musica | 2 brani in loop | ⬜ | CC0 o commissionata con cessione dei diritti |
| Store: icona 512, immagine 1024×500, screenshot | | ⬜ | |

---

## 5. Cosa manca per renderlo completo

| Area | Riferimento | ZeroWords oggi | Cosa manca | Peso |
|---|---|---|---|---|
| **Dizionario** | implicito nei livelli, 36 lingue | nessuno | Fonte con licenza verificata, normalizzazione, frequenze, blocklist (M1) | Grande |
| **Livelli** | 14.980 per lingua principale, più varianti easy | nessuno | Generatore, validatore e curva (M2); 600 livelli al lancio, rivisti in playtest | Grande |
| **Codice dell'app** | completo | nessuno | M0, M3–M9 | Grande (circa 7–10 settimane) |
| **Grafica** | circa 3.000 immagini | nessuna | Tabella 4: grazie al disegno in codice bastano circa 40–60 asset | Medio |
| **Audio** | 164 clip | nessuno | Circa 15 effetti, 8 toni e 2 brani | Piccolo |
| **Testi dell'interfaccia** | 37 lingue | nessuno | Circa 80–120 testi in italiano | Piccolo |
| **Bilanciamento** | variante easy e segmentazione per durata e precisione al 20° e all'80° percentile | nessuno | Playtest con 10–20 persone: tempo per livello, aiuti usati, abbandoni; taratura di `curve.yaml` | Medio |
| **Legale e store** | pubblicato | nessuno | M10, ricerca sul nome, licenze del dizionario | Medio |

### Cose che il reverse engineering non ha potuto rivelare
Vanno progettate da zero, ed è giusto così:
- **Come sono stati creati i livelli del riferimento** (a mano, generati o misti): non risulta dal pacchetto. Il nostro generatore è progettato da zero.
- **Tempi e animazioni** di ruota e schema, perché l'app non è stata eseguita: vanno prototipati in Flutter.
- **Valori di Remote Config** (ordine delle lettere, costi, ricompense) e logica server: i nostri valori stanno in `curve.yaml` e si tarano col playtest.
- **Livelli scaricati a runtime** e contenuti stagionali.

### Ordine consigliato
1. Decisioni (sezione 1) e M1 (dizionario) in parallelo con M0: senza un dizionario pulito non c'è gioco.
2. M2 (generatore e validatore) prima della UI: si possono già stampare gli schemi in ASCII e controllarli.
3. M3 → M6 → M4: un MVP offline giocabile con 100 livelli.
4. Playtest e taratura della curva.
5. M5 → M7 → M8 → M9 → M10: pubblicazione.

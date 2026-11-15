# Bivio · TODO

Gioco "Preferiresti…?" per Android (poi iOS), **senza abbonamento**.
"Bivio" è un titolo provvisorio (vedi [1. Decisioni](#1-decisioni-da-prendere-prima-di-scrivere-codice)).

Questo piano nasce dal reverse engineering di Dilemmaly 1.4.1 (`com.vanilla.wouldyou`). Il report completo è qui: https://claude.ai/artifact/1i1jmQiZM9aEW1PVzUqu9B

**Regola del progetto: tutto ciò che va nell'app deve essere nostro o con licenza libera.**

| Cosa | Dal riferimento | Si può usare? |
|---|---|---|
| Meccanica del gioco, genere, struttura delle schermate | studiata nell'analisi | Sì: le idee e i generi non sono proteggibili |
| Architettura tecnica, librerie open source, dimensioni degli asset | misurate nell'analisi | Sì |
| Le 4193 domande e le loro traduzioni | `snapshot.json` | **No.** Sono un'opera e una banca dati protetta; scriviamo le nostre |
| Testi dell'interfaccia (`interface.json`) | 328 chiavi × 22 lingue | **No.** Possiamo usare la lista delle funzioni, non i testi |
| Grafiche, icona, logo, nome | 129 file | **No.** Abbiamo un'identità visiva nostra (`assets/`) |
| Icone di app di terzi (promo incrociata) | 14 file | **No** |

---

## 0. Cosa c'è già in questa cartella

| Percorso | Contenuto |
|---|---|
| `database/ZeroDubbi.sqlite3` | 120 dilemmi originali, in italiano e inglese, divisi in 12 categorie da 10 (lo legge il server di Zerocade; `data/domande.db` è la vecchia copia, non più usata) |
| `script/domande.py` | Importa le domande da un CSV in `ZeroDubbi.sqlite3` e le esporta in CSV, per chi le modifica in un foglio di calcolo |
| `data/livecade/wyr_it.csv`, `wyr_en.csv` | Gli stessi dilemmi nel formato di importazione Livecade (intestazione provvisoria, vedi sezione 3, M11) |
| `script/to_livecade.py` | Convertitore da `ZeroDubbi.sqlite3` al CSV Livecade, con mappatura automatica sull'intestazione di un export reale |
| `script/from_livecade.py` | Il contrario: importa in `ZeroDubbi.sqlite3` un CSV Livecade (un export della dashboard o un file di `to_livecade.py`). Riconosce le colonne allo stesso modo, riporta categorie e difficoltà ai nostri valori, dà id nuovi (b0121…) e salta le domande già presenti, anche con A e B invertite. `--dry-run` mostra cosa importerebbe |
| `script/make_category_assets.py` | Genera icone, card e sfondi delle categorie |
| `assets/icon/` | Icona dell'app (SVG 1024) e icona adattiva Android (primo piano e sfondo) |
| `assets/category-icons/` | 12 icone bianche 100×100 |
| `assets/category-cards/` | 12 card verticali 632×832 |
| `assets/category-backgrounds/` | 12 banner 981×339 |
| `assets/backgrounds/` | Sfondi delle opzioni A e B (1125×1395) e sfondo scuro dell'app (1500×1800) |
| `assets/anteprima.html` | Pagina che mostra tutte le grafiche insieme |

Tabelle di `ZeroDubbi.sqlite3`:

| Tabella.colonna | Valori |
|---|---|
| `dilemmi.id` | `b0001`… stabile, non riusare mai un id cancellato (i voti salvati da Zerocade sono legati all'id) |
| `dilemmi.categoria` | `cibo`, `soldi`, `fantasia`, `sopravvivenza`, `viaggi`, `scuola_lavoro`, `social_tech`, `sport`, `tempo`, `amici_famiglia`, `dilemmi`, `assurde` |
| `dilemmi.difficolta` | `light` oppure `tough` |
| `dilemmi.esplicita` | `0` oppure `1` (oggi tutte `0`) |
| `dilemmi.ordine` | Posizione nell'elenco (l'ordine delle righe del CSV importato) |
| `testi.dilemma`, `testi.lingua` | Una riga per dilemma e lingua (`it`, `en`; per aggiungere una lingua bastano nuove righe) |
| `testi.a`, `testi.b` | Le due opzioni, scritte come completamento di "Preferiresti…" |

Per lavorare in un foglio di calcolo: `python script/domande.py export domande.csv`, si modifica il file (colonne `id`, `categoria`, `difficolta`, `esplicita`, `<lingua>_a`, `<lingua>_b`), poi `python script/domande.py import domande.csv`. `python script/domande.py stats` conta dilemmi per categoria, difficoltà e lingua.

---

## 1. Decisioni da prendere prima di scrivere codice

- [ ] **Modello economico senza abbonamento.** Consiglio B.
  - A. Tutto gratis, con una "mancia" facoltativa (acquisto consumabile).
  - B. App gratuita con una parte delle categorie libere, più un acquisto unico "Sblocca tutto" (prodotto non consumabile, 3,99–5,99 €).
  - C. App a pagamento.

  B si implementa con il plugin ufficiale `in_app_purchase`, senza RevenueCat né server.
- [ ] **Voti globali (le percentuali "il 67% ha scelto…").** Servono un backend e una massa critica di voti. Consiglio di non averli nella v1: al loro posto c'è il **voto di gruppo** (M2), poi il backend in v2 (M5).
- [ ] **Nome definitivo.** "Bivio" è provvisorio. Va verificato su EUIPO, UIBM e Play Store, e va evitato qualsiasi nome che ricordi "Dilemmaly".
- [ ] **Contenuti espliciti.** Consiglio di non averli. Il riferimento nasconde la sua categoria piccante su Android (`hiddenOnAndroid`), e i contenuti sessuali complicano la classificazione IARC e le regole del Play Store. Basta il livello `tough` per i dilemmi impegnativi.
- [ ] **Stack.** Flutter, come il riferimento: una sola base di codice per Android e iOS.
- [ ] **Analytics.** O nessuno, o un servizio rispettoso della privacy (per esempio Aptabase o PostHog EU), **senza** Advertising ID.

---

## 2. Funzioni del riferimento e cosa fare in Bivio

Ricavate dai sorgenti Dart elencati in `libapp.so`, dai simboli (`_MixedMode`, `_fetchDailyContent`…) e dalle chiavi dei testi. Le funzioni sono osservate; il comportamento esatto non è stato visto perché l'app non è stata eseguita.

| Funzione nel riferimento | Bivio |
|---|---|
| Partita: due opzioni, "o" al centro, tocco, percentuali animate, domanda successiva | **Tenere.** Il cuore del gioco |
| Mazzi per categoria, alcuni a pagamento | **Tenere**, con lo sblocco unico (decisione 1) |
| Modalità Mix (tutte le categorie) | **Tenere** |
| Più votate, 50/50 (equilibrate), Sbilanciate, Generated | **v2.** Richiedono i voti globali |
| Mazzo personalizzato: crea, modifica, anteprima | **Tenere**, più export in CSV (anche per Livecade) |
| Dilemma del giorno più notifica giornaliera, riprogrammata dopo il riavvio | **Tenere.** Scelta locale basata sulla data, senza server |
| Onboarding in 3 passi (voto di prova, modalità, domande) più richiesta di recensione | **Tenere**, con testi nostri |
| Segnala domanda (offensiva, rovina l'atmosfera, traduzione sbagliata) | **Tenere** (email o piccolo endpoint) |
| Recensione in-app dopo una soglia di partite | **Tenere** (`in_app_review`) |
| Impostazioni: lingua, suoni, vibrazione, notifiche, privacy, termini, contatti, ripristina acquisti | **Tenere** |
| Condivisione della domanda come immagine | **Tenere** (`RepaintBoundary` più `share_plus`) |
| Aggiornamento remoto di contenuti e testi | **v2.** JSON versionato su una CDN |
| Abbonamenti, prova gratuita, offerte a giorni e festività | **Eliminare** |
| Banner verso altre app | **Eliminare** |
| Firebase Analytics più Advertising ID | **Sostituire** (decisione 1) |
| Bug report verso un server proprio | **Sostituire** con Sentry o Crashlytics (facoltativo) |
| — | **Nuovo: voto di gruppo.** Pulsanti +/− per contare le mani alzate nella stanza; percentuali locali |

---

## 3. Roadmap

Le stime valgono per uno sviluppatore che conosce Flutter e sono indicative.

### M0 · Impostazione del progetto (1–2 giorni)
- [ ] `flutter create --org it.<tuodominio> bivio` (Dart 3, Material 3)
- [ ] `minSdk 24`, `targetSdk` uguale al livello richiesto dal Play Store al momento della pubblicazione (il riferimento usa 36)
- [ ] Struttura di `lib/`: `app/` (router, tema), `features/{onboarding,home,game,decks,custom_deck,daily,settings,purchase}`, `data/` (modelli, repository), `l10n/`
- [ ] Dipendenze di base: `go_router`, `flutter_riverpod` (o `provider`), `hive_ce` (o `shared_preferences`), `flutter_svg`, `auto_size_text`, `share_plus`, `in_app_review`, `flutter_local_notifications`, `timezone`, `wakelock_plus`, `url_launcher`
- [ ] `flutter_lints` più `analysis_options.yaml` rigoroso
- [ ] CI con GitHub Actions: `flutter analyze`, `flutter test`, build dell'APK di debug
- [ ] Flavor `dev` e `prod` (package id diversi)

### M1 · Pipeline dei contenuti (2–3 giorni)
- [ ] `script/build_bundle.py`: da `ZeroDubbi.sqlite3` a `assets/data/questions_<lingua>.json`, **un file per lingua**. Il riferimento usa un unico JSON da 24 MB con 22 lingue, che pesa in memoria e all'avvio.
  ```json
  { "version": 1, "generatedAt": "2026-11-01", "language": "it",
    "categories": [{ "id": "cibo", "title": "Cibo", "premium": false, "explicit": false }],
    "questions":  [{ "id": "b0001", "c": "cibo", "d": "light", "a": "…", "b": "…" }] }
  ```
- [ ] Il validatore fa fallire la CI in questi casi: id duplicati, testo mancante in una lingua attiva, categoria sconosciuta, opzione più lunga di 70 caratteri, coppia A/B identica a un'altra
- [ ] Modelli Dart `Category` e `Question`, caricati in modo pigro per lingua
- [ ] File `data/categorie.csv` con id, titoli per lingua, colore, premium sì/no e ordine

### M2 · Gioco base offline (1–2 settimane)
- [ ] **Home**: griglia di card dei mazzi (card verticale 632×832 con icona, titolo, numero di domande e lucchetto se premium), mazzo del giorno in evidenza, ingresso al mazzo personalizzato
- [ ] **Dettaglio mazzo**: descrizione, numero di domande, pulsante Gioca
- [ ] **Schermata di gioco**:
  - [ ] Due opzioni impilate (A sopra con sfondo `option_a`, B sotto con `option_b`) e la pastiglia "o" al centro
  - [ ] Al tocco: animazione di scelta, poi risultato (voto di gruppo o globale), poi "Avanti"
  - [ ] Swipe o pulsante per la domanda successiva, pulsante indietro con conferma di uscita
  - [ ] Testo adattivo (`AutoSizeText`), mai tagliato
- [ ] **Estrazione delle domande**: mescolamento senza ripetizioni, persistenza delle domande già viste per mazzo, ripartenza a fine mazzo con avviso "Hai visto tutto"
- [ ] **Modalità Mix**: mescola i mazzi sbloccati
- [ ] **Voto di gruppo**: contatori +/− per A e B, percentuali calcolate sul momento, nessun dato salvato
- [ ] Vibrazione leggera al tocco (`HapticFeedback`) e schermo sempre acceso in partita
- [ ] Tema scuro come predefinito, tema chiaro facoltativo

### M3 · Mazzo personalizzato (3–4 giorni)
- [ ] Creare, modificare ed eliminare domande (due campi, anteprima sulla card vera)
- [ ] Salvataggio locale
- [ ] Export e import CSV con lo stesso schema di `script/domande.py`, per riusare le domande su Livecade con `script/to_livecade.py`
- [ ] Limite di lunghezza e contatore di caratteri

### M4 · Localizzazione (3 giorni di codice, più il tempo delle traduzioni)
- [ ] Testi dell'interfaccia con `flutter gen-l10n` (file ARB), all'inizio solo `it` ed `en`
- [ ] Scelta della lingua nelle impostazioni, con quella di sistema come predefinita
- [ ] Bandiere da `flag-icons` (licenza MIT), non quelle del riferimento
- [ ] Processo di traduzione dei contenuti: bozza automatica, revisione di un madrelingua, colonna `revisionato` nella tabella `testi` di `ZeroDubbi.sqlite3`
- [ ] Se l'obiettivo è anche lo streaming, dare priorità alle 13 lingue di Livecade: en, es, pt, fr, de, it, id, ar, tr, ru, hi, ro, fil. L'arabo richiede la gestione della scrittura da destra a sinistra.

### M5 · Voti globali (v2, 1–2 settimane)
- [ ] API minimale:
  - `POST /v1/votes`: invio a lotti `{install_id, votes:[{q, choice, ts}]}`
  - `GET /v1/stats?lang=it&ids=b0001,b0002`: `{b0001:{a:123,b:456}}`
  - `GET /v1/modes?lang=it`: liste precalcolate di Più votate, 50/50 e Sbilanciate
- [ ] Hosting a basso costo: Cloudflare Workers con D1, oppure Supabase (Postgres più RPC), oppure Firestore con contatori distribuiti
- [ ] Anti-abuso: un voto per installazione e domanda (indice univoco), limite di frequenza, Play Integrity API sui lotti
- [ ] Coda offline con invio a lotti all'avvio e in background (il riferimento fa lo stesso con `flushVotes`)
- [ ] **Partenza a freddo**: mostrare le percentuali solo oltre 30 voti; sotto la soglia, il messaggio "Sei tra i primi a rispondere"
- [ ] Modalità Più votate, 50/50 e Sbilanciate calcolate ogni notte lato server
- [ ] Nessun dato personale: `install_id` casuale, rigenerabile dalle impostazioni

### M6 · Dilemma del giorno e notifiche (2–3 giorni)
- [ ] Scelta deterministica: `hash(data, lingua) mod N` sulle domande gratuite, uguale per tutti e senza server
- [ ] Notifica locale giornaliera all'ora scelta (predefinita 18:30), al massimo una al giorno
- [ ] Richiesta del permesso `POST_NOTIFICATIONS` (Android 13+) solo dopo un gesto dell'utente, mai al primo avvio
- [ ] Riprogrammazione dopo il riavvio (`RECEIVE_BOOT_COMPLETED`, già gestita dal plugin)

### M7 · Onboarding, recensioni, segnalazioni, condivisione (3–4 giorni)
- [ ] Onboarding in 3 schermate: voto su un dilemma di esempio, presentazione dei mazzi, presentazione del voto di gruppo. Si può saltare e si vede una volta sola.
- [ ] `in_app_review` dopo 3 partite completate e mai prima di 2 giorni dall'installazione
- [ ] "Segnala domanda" con i motivi offensiva, poco divertente e traduzione sbagliata: la domanda viene nascosta subito sul dispositivo e la segnalazione inviata (email precompilata o endpoint)
- [ ] Condivisione: la card viene trasformata in immagine con il logo Bivio e inviata con `share_plus`

### M8 · Monetizzazione senza abbonamento (3–4 giorni)
- [ ] Prodotto non consumabile `unlock_all` su Play Console
- [ ] Schermata di sblocco onesta: cosa si ottiene, prezzo locale, "Ripristina acquisti"; niente timer finti né testi "gratis" ingannevoli
- [ ] Stato dell'acquisto salvato in locale e riverificato a ogni avvio con `queryPastPurchases`
- [ ] Facoltativo: mancia consumabile "Offrimi un caffè"
- [ ] Verificare che l'app funzioni anche **senza** Google Play Services (per esempio su Huawei): in quel caso l'acquisto va nascosto

### M9 · Qualità (continuo, più 1 settimana prima del lancio)
- [ ] Test unitari: estrazione delle domande, parser del bundle, scelta del dilemma del giorno, calcolo delle percentuali
- [ ] Test dei widget sulla schermata di gioco e golden test delle card in 3 dimensioni di schermo
- [ ] Accessibilità: contrasto almeno AA sulle card colorate, testo grande del sistema, etichette per TalkBack
- [ ] Prestazioni: avvio a freddo sotto 2 s su un telefono economico, JSON di una lingua sotto 1 MB
- [ ] Crash reporting facoltativo (Sentry o Crashlytics), dichiarato nella privacy
- [ ] Test su Android 8 (API 26), 13 e 15 o superiore, telefono piccolo e tablet

### M10 · Legale e pubblicazione (1 settimana più i tempi di Google)
- [ ] Privacy policy e termini d'uso (italiano e inglese), ospitati su una pagina pubblica
- [ ] Modulo "Sicurezza dei dati" di Play Console, coerente con analytics e crash reporting
- [ ] Questionario IARC sulla classificazione dei contenuti
- [ ] Pubblico di destinazione: se include i minori di 13 anni si applica la Families Policy, che vieta SDK non certificati. Consiglio "13+" o "16+".
- [ ] Permessi minimi: `INTERNET` (solo se ci sono backend o analytics), `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `WAKE_LOCK`. **Niente** `AD_ID` e niente `ACCESS_ADSERVICES_*`.
- [ ] Scheda store: icona 512×512, immagine in evidenza 1024×500, almeno 4 screenshot del telefono, descrizione breve e lunga in italiano e inglese
- [ ] Account sviluppatore: verificare i requisiti di test chiusi per gli account personali nuovi (di recente, 12 tester per 14 giorni)
- [ ] Play App Signing e keystore di upload salvato in due posti

### M11 · Livecade e streaming su TikTok LIVE (mezza giornata)
Livecade ha già un gioco Would You Rather con oltre 4900 domande per lingua, italiano compreso. Le nostre domande si **aggiungono** a quel banco.

Livecade non pubblica i nomi delle colonne del gioco Would You Rather. Il processo affidabile è questo:

1. [ ] Nella dashboard: Would You Rather → Your question bank → lingua `it` → **Export** → CSV. L'export è gratuito su tutti i piani.
2. [ ] `python script/to_livecade.py --lang it --template <export>.csv --out data/livecade/wyr_it.csv` (legge `ZeroDubbi.sqlite3`)
   - Il convertitore copia l'intestazione dell'export e mappa automaticamente lingua, opzione A, opzione B, categoria e difficoltà.
   - Avvisa se i nostri valori di categoria o difficoltà non esistono nel banco di Livecade. In quel caso si correggono con `--map`:
     ```json
     { "category_values": { "viaggi": "travel", "assurde": "funny" },
       "columns": { "Nome colonna strana": "option_a" } }
     ```
3. [ ] Per le righe nuove `ref` e `source` restano vuoti; il convertitore lo fa già. Un `ref` non va mai inventato.
4. [ ] **Import** → controllare l'anteprima (new / errors) → confermare. **L'import richiede un piano a pagamento di Livecade**, cioè un abbonamento: è in contrasto con l'obiettivo, quindi va valutato. Senza piano a pagamento, le domande si possono solo aggiungere a mano dalla dashboard, entro i limiti del piano.
5. [ ] Limiti: un file per lingua, CSV UTF-8 (non `.xlsx`), al massimo 16 MB e 20.000 righe.
6. [ ] Per lo streaming conviene tenere le opzioni sotto i 50–60 caratteri: sull'overlay verticale si leggono meglio. Le domande oggi arrivano al massimo a 60.

---

## 4. Grafiche: specifiche e stato

Le dimensioni sono quelle misurate nell'APK di riferimento. Le grafiche sono nostre o con licenza libera.

| Asset | Dimensioni di riferimento | Stato in Bivio | Note |
|---|---|---|---|
| Icona del launcher | 48 / 72 / 96 / 144 / 192 px | ✅ SVG master, ⬜ PNG | Esportare con `flutter_launcher_icons` da `assets/icon/` |
| Icona adattiva Android | 108 dp, zona sicura 66 dp | ✅ primo piano e sfondo | ⬜ variante monocromatica (Android 13+) |
| Icona dello store | 512×512 | ⬜ | Dall'SVG master |
| Immagine in evidenza dello store | 1024×500 | ⬜ | |
| Sfondo dell'opzione A e B | 1125×1395 | ✅ `option_a.svg`, `option_b.svg` | |
| Sfondo dell'app | 1500×1800 | ✅ scuro, ⬜ chiaro | |
| Card del mazzo (verticale) | 632×832 | ✅ 12 card | |
| Banner del mazzo | 981×339 | ✅ 12 banner | |
| Card del dilemma del giorno | 450×582 | ⬜ | |
| Icone delle categorie | 100×100 SVG, bianche | ✅ 12 | |
| Icone delle modalità (Mix, Più votate, 50/50, Sbilanciate, Personalizzato, Giorno) | 100×100 SVG | ⬜ 6 | Stesso stile delle icone delle categorie |
| Bandiere delle lingue | circa 90×66 | ⬜ | Usare `flag-icons` (MIT) |
| Icone di interfaccia (indietro, menu, condividi, lucchetto, spunta, chiudi, freccia) | 10–64 px | ⬜ | Usare Lucide (ISC) o Material Symbols (Apache 2.0) |
| Sfondo del pulsante principale e pulsante play | 1052×256, 219×114 | ⬜ | Si possono fare in codice, senza immagini |
| Illustrazione stella per la richiesta di recensione | 357×340 | ⬜ | |
| Font | il riferimento usa un font arrotondato proprio | ⬜ | Font OFL incluso nell'app (Nunito, Fredoka o Baloo 2), non scaricato a runtime |
| Suoni | nessuno nell'APK di riferimento | ⬜ facoltativo | Effetti CC0 (per esempio da Freesound) |

---

## 5. Cosa manca per renderlo completo

| Area | Riferimento | Bivio oggi | Cosa manca | Peso |
|---|---|---|---|---|
| **Domande** | 4193, di cui 1735 premium; 200 per categoria nelle 9 categorie recenti | 120 (10 per categoria) | Per il lancio almeno **1000–1200 per lingua** (circa 80–100 per categoria su 12 categorie); a regime 200 per categoria. È il lavoro più lungo: circa 1000 dilemmi originali da scrivere, revisionare e bilanciare. | Grande |
| **Traduzioni** | 22 lingue | 2 (it, en) | Ogni lingua in più costa una traduzione rivista da un madrelingua; per lo streaming conviene partire dalle 13 lingue di Livecade | Grande |
| **Codice dell'app** | completo | nessuno | M0–M9 | Grande (circa 6–9 settimane per un'app pubblicabile) |
| **Voti e percentuali** | 19,7 milioni di voti già inclusi più backend | nessuno | v1: voto di gruppo; v2: backend (M5) e strategia di partenza a freddo. Senza voti non esistono Più votate, 50/50 e Sbilanciate. | Medio |
| **Grafiche** | 129 file | 42 SVG (icona, categorie, sfondi) | Vedi tabella 4: icone delle modalità, dilemma del giorno, store, export PNG/WebP, font | Medio |
| **Testi dell'interfaccia** | 328 chiavi × 22 lingue | nessuno | Circa 120–150 chiavi nostre (Bivio ha molte meno funzioni: niente abbonamenti né offerte) | Piccolo |
| **Legale e store** | pubblicata | nessuno | M10 più la ricerca sul nome | Medio |
| **Bilanciamento** | i voti mostrano quali domande dividono il pubblico | nessuno | Playtest con 10–20 persone: segnare le domande ovvie (oltre 90/10) e riscriverle; obiettivo: la maggior parte tra 30/70 e 70/30 | Medio |
| **Moderazione** | segnalazioni più server | nessuna | Flusso di segnalazione (M7) e procedura per nascondere una domanda da remoto (v2) | Piccolo |
| **Aggiornamenti dei contenuti** | scaricati da remoto | nessuno | v1: con gli aggiornamenti dell'app; v2: JSON versionato su CDN | Piccolo |
| **Analytics e crash** | Firebase | nessuno | Decisione 1; se attivi, consenso GDPR e modulo Sicurezza dei dati | Piccolo |
| **Livecade** | non applicabile | CSV pronto con intestazione provvisoria | Export reale per avere l'intestazione, mappa delle categorie, piano a pagamento per importare | Piccolo |

### Cose che il reverse engineering non ha potuto rivelare
Vanno progettate da zero:
- **Tempi e animazioni esatti** della schermata di gioco, perché il codice Dart non è stato decompilato. Vanno disegnati con un prototipo in Figma o direttamente in Flutter.
- **Logica della modalità "Generated"**: dal nome sembra una selezione generata automaticamente, ma non è verificato.
- **Valori di Remote Config e logica del server** (dilemma del giorno, calcolo delle liste).
- **Testi e tono dell'onboarding**: in ogni caso vanno scritti nuovi.

### Ordine consigliato
1. Decisioni (sezione 1) e scrittura delle domande in parallelo con M0–M2: senza contenuti il gioco non si può provare.
2. M2 → M3 → M6 → M7: un MVP offline giocabile con amici.
3. Playtest e bilanciamento delle domande.
4. M4 (inglese) → M8 → M9 → M10: pubblicazione.
5. M5 (voti globali) e M11 (Livecade) quando ci sono utenti o stream.

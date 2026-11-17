# ZeroTaboo — stato del lavoro e decisioni

Guida seguita: [GUIDA_CODICE_ZEROTABOO.md](GUIDA_CODICE_ZEROTABOO.md). Regolamento: [ZEROTABOO.md](ZEROTABOO.md). Direttive: [../DIRETTIVE.md](../DIRETTIVE.md).
Aggiornato a ogni fase. Non è stato fatto alcun commit: il working tree contiene anche lavori di altre sessioni.

## Decisioni dell'utente (16/11/2026)

| ID | Decisione |
| --- | --- |
| D1 | Solo bersaglio e alias approvati, senza plurali automatici. |
| D2 | Vince il primo messaggio **arrivato al server** (non quello scritto prima). |
| D3 | Confronto per finestre di token concatenati («rage quit» = RAGEQUIT). |
| D4 | Più ipotesi: separatori di elenco (`, ; / \| a capo`, «o», «oppure») con almeno 2 parti, più un tetto di 8 token oltre la risposta. |
| D5 | Il limite di 2 s vale per ogni commento mentre una carta è attiva. |
| D6 | La piattaforma competitiva si sceglie nella partita; una risposta esatta dell'altra chiude la carta con i punti di squadra e senza vincitore individuale. |
| D7 | La partita vera usa solo il ponte ZeroFollowerBot; il simulatore solo in modalità prova (fuori classifica e telemetria). |
| D9 | Il round parte con un pulsante; intervallo fisso di 20 s (configurabile 15–30 s). |
| D10 | A 25 punti la vittoria si segna e resta registrata, ma la partita prosegue fino al round 5. |
| D11 | Round 3: la chat vota con le lettere A–F; pareggio o nessun voto a sorte tra le categorie con carte. |
| D12 | Round 4: il vincolo narrativo lo sceglie il bot a caso. |
| D13 | Carta cantata a comando della regia, mai sulla carta Jackpot. |
| D26 | (17/11/2026) L'overlay mostra al pubblico le **cinque parole Taboo** della carta attiva (quelle che lo streamer non può dire). Deroga a ZEROTABOO §3.2/§12.2 e all'invariante I8 della guida, solo per i Taboo: bersaglio e alias restano nascosti fino alla chiusura. |
| D18/D19 | Mazzo in `database/ZeroTaboo.sqlite3` con fonte JSON in `gioco-zerotaboo/data/` e strumento Python. Gli avvisi editoriali (D09 senza alias, E08 alias discordanti, D03/D06/F07 con Taboo della stessa radice) si **segnalano**, non si correggono. |

### Valori prudenti scelti da me (da confermare)

D8 skip e Taboo solo dai pulsanti della dashboard. D14 una rettifica la registra la regia con l'istante della violazione; si decide nell'intervallo successivo.
D15/D24 ponte caduto o pausa = timer congelato, esposizione marcata «interrotta», ripresa con il tempo residuo.
D16 telemetria con ID pseudonimi (HMAC con chiave locale fuori da Git), conservazione 90 giorni, risposte sbagliate solo aggregate.
D17 solo la classifica propria di ZeroTaboo (nessuna scrittura in `game_scores`). D20 carte escluse per stanza per 2 partite, rilassate se il mazzo non basta.
D21 id `zerotaboo`, nome `ZeroTaboo`, categoria `Parole`. D22 la voce di ZeroFollowerBot non legge le risposte durante una carta attiva.
D23 v1 senza ruota delle penitenze, esibizioni, modalità separate e progressione stagionale. D25 la dashboard espone soglia, piattaforma e intervallo entro limiti fissi.

## Decisioni del 17/11/2026 (migliorie approvate)

| ID | Decisione |
| --- | --- |
| D27 | Regolamento portato a **v3.1**: D26 entra nel testo (§0, §2, §3, §10, §12). Bersaglio e alias restano nascosti fino alla chiusura. |
| D28 | **Anti-raffica**: un messaggio che contiene la risposta della carta attiva **e** la risposta (bersaglio o alias) di un'altra carta del mazzo è ignorato. Tetto di token oltre la risposta: **4** se la risposta riconosciuta è di un token, **8** altrimenti (sostituisce il tetto unico di D4). |
| D29 | **Lettere allungate**: se la finestra contiene una sequenza di 3+ lettere uguali si confronta lo «scheletro» (ogni sequenza di lettere uguali ridotta a una) con lo scheletro di bersaglio e alias; senza allungamenti il confronto resta esatto. Estende D1 solo per questo caso. |
| D30 | Nuovi alias approvati (D09, E08, F03, F04, F07, G01, G04, H02, H03). Comando `mazzo.py suggest-aliases` che produce candidati da approvare a mano, mai importati da soli. |
| D31 | Risposte sbagliate esportabili per la revisione (testo normalizzato, conteggi, solo se scritte da ≥3 utenti distinti) e metrica «quasi corrette» per l'alert di §9.2. |
| D32 | **Fase 1 chiusa**: D03 «Denti» → «Colla», D06 «Cartone» → «Fazzoletto», F07 «Chiamata» → «Squillo»; alias per D09 ed E08. `card_revision` +1 sulle carte toccate. |
| D33 | Le **16 carte G–J entrano in playtest** (H04 «Correggere» → «Parole», I02 «Stampare» → «Documento»). Si estraggono nei round normali; nel round 3 una categoria è votabile solo con **≥6 carte disponibili** (oggi quindi il voto resta A–F). |
| D34 | **Calibrazione con censura**: incidenza cumulata di risoluzione (Aalen-Johansen), fine round = censura, skip = esito concorrente; le soglie di §9.2 si applicano a `CIF(60 s)` e alla mediana condizionata. Le colonne attuali restano. |
| D35 | **Fascia di pubblico per round** (utenti distinti con ≥1 tentativo nel round), non per esposizione. |
| D36 | Intervalli al 95% (Wilson sul tasso semplice, varianza di Aalen-Johansen sull'incidenza) e tasso «ristretto» verso la media del livello (m = 10) **solo per ordinare le revisioni**. Le etichette seguono ancora §9.2. |
| D37 | Segnale della chat **`!taboo`**: con ≥3 utenti distinti in 5 s (configurabile 2–10) la regia riceve un avviso con scorciatoia «Segnala». Mai penalità automatica, mai mostrato all'overlay. |
| D38 | Overlay: «Prima vittoria!» quando un utente vince la sua prima carta della partita; a fine partita i premi simbolici di §10 (modifica parziale di D23). |
| D39 | Vista streamer: token d'accesso (bersaglio e alias inviati solo a socket autenticati), pagina vuota dentro OBS e in iframe, componenti vietati del bersaglio mostrati in automatico. |
| D40 | L'intervallo prima del round 3 dura sempre **30 s**. |
| D41 | Prima della partita la dashboard **suggerisce** la soglia con la regola di §4 (±2 sopra il 75% / sotto il 30% su ≥10 partite comparabili della stessa fascia); decide lo streamer. |
| D42 | Prova visiva automatica (Playwright, fuori dalla suite di default) e prova generale in OBS / TikTok LIVE Studio prima della prima diretta. |

Parametri scelti da me dentro queste decisioni (modificabili): tetto 4/8, soglia di 6 carte per il voto, orizzonte di 60 s, m = 10, 3 utenti in 5 s per `!taboo`, sostituti «Colla», «Fazzoletto», «Squillo», «Parole», «Documento».

## Decisioni del 17/11/2026, seconda parte (mazzo più divertente)

| ID | Decisione |
| --- | --- |
| D43 | Mazzo **v3.2**: 12 carte per categoria, 144 in tutto. 42 carte nuove in A–J e due categorie nuove (K · Amore & Appuntamenti, L · Scuola & Esami) da 12 carte. Tutte le nuove in playtest. |
| D44 | Tono **«più pepato»** (regola editoriale in ZEROTABOO §7): imbarazzo forte, figuracce corporali leggere e doppi sensi da commedia; esclusi bersagli con spiegazione ovvia sessuale, volgarità esplicite e prese in giro di corpi o gruppi. Taboo presentabili perché pubblici. Categoria L senza doppi sensi né temi romantici. |
| D45 | Riscritte tre carte deboli: A04 INCIAMPARE → INCIAMPARE NEL NULLA, B10 COPIUM → BRAINROT, C04 FOLLOW → MAMMA CHE ENTRA IN LIVE. Bersaglio nuovo: nuova revisione e statistiche azzerate (§8). |
| D46 | Voto del round 3: con più di 6 categorie votabili se ne mostrano 6 estratte a sorte, ciascuna con la propria lettera (A–L); valgono solo le lettere mostrate. Modifica D11. |

Controlli fatti sul testo della v3.2: 144 carte con 5 Taboo distinti ciascuna; nessun Taboo con la stessa radice (prime 4 lettere) di una parola significativa del bersaglio; nessuna risposta (bersaglio o alias) duplicata o contenuta come finestra nella risposta di un'altra carta. Difficoltà: 29% facili, 50% medie, 21% difficili. Restano da fare, carta per carta, il punteggio editoriale di §7 e le spiegazioni simulate di §12.1.

## Fasi

- [x] **0 · Analisi.** Baseline leggera (17/11/2026): `npm run typecheck` verde su 5 workspace; `tests/controls.test.ts` + `tests/help-switches.test.ts` 9/9. Build, suite completa e smoke **rimandati**: la diretta era in corso (TikTok LIVE Studio attivo) e `npm run build` riscrive la cartella servita.
- [x] **1 · Tipi e logica pura.** `packages/shared/src/taboo.ts`; `apps/server/src/taboo-answer.ts`, `taboo-scoring.ts`, `taboo-machine.ts`; 49 test verdi (`tests/taboo-answer|scoring|machine.test.ts`); typecheck verde.
- [x] **2 · Mazzo e persistenza.** `gioco-zerotaboo/script/mazzo.py` (parse, validate, import, verify, export), fonte `data/mazzo-v3.0.json`, casi condivisi `data/normalizzazione-casi.json`, `database/ZeroTaboo.sqlite3` (62 carte, 5 avvisi: D03, D06, D09, E08, F07, mostrati e non corretti); `apps/server/src/taboo-deck.ts` (caricatore con rivalidazione, estrazione stratificata) e `taboo-db.ts` (store operativo, `tabooStore` esportato da `db.ts`). 77 test TypeScript e 20 Python verdi; typecheck verde. Eccezione documentata: le chiavi esterne non attraversano due file (le esposizioni salvano `card_code` + `card_revision`).
- [x] **3 · Server e registrazione.** `apps/server/src/taboo.ts` (stanza: timer, dedup, limiti, effetti), `validate.ts` (`sanitizeTabooCommand`), `index.ts` (ponte, eventi `taboo:*`, selezione gioco, pausa, shutdown, avvio), `packages/shared/src/index.ts` (GameDef `zerotaboo`, eventi). Test: `taboo-room` (25, orologio finto), `taboo-secrecy` (4), `taboo-socket` e `taboo-bridge` (server vero su porta e DB propri; ponte finto). Bug trovato dal server vero e corretto: i millisecondi reali sono frazionari e le colonne intere STRICT li rifiutano (ora arrotondati nello store).
- [x] **4 · Overlay.** `apps/overlay/src/Taboo.tsx` + `taboo.css`, `store.ts` (`taboo`, `tabooAt`), `App.tsx`. Cinque parole Taboo della carta aperta mostrate al pubblico (D26); difficoltà con testo e segni, non solo colore; ogni nome con la sua foto (`ViewerAvatar`); animazioni silenziabili e rispettose di `prefers-reduced-motion`; countdown locale solo mentre il round gira. Compila nel bundle (build in cartella temporanea). **Non visto a schermo**: nessuna prova visiva in browser, OBS o TikTok LIVE Studio.
- [x] **5 · Dashboard.** `TabooSidebar.tsx` (partita, carta privata, skip/Taboo/cantata, categoria, segnalazioni e rettifiche, avvisi del mazzo, metriche, simulatore per la prova), `GamesPage.tsx`, `store.ts`, stili. Ogni comando porta `expectedVersion` e mostra l'errore tipizzato. **Non visto a schermo.**
- [x] **6 · Telemetria e report.** Viste `taboo_exposure_report` (nomi di §3.7/§9.1) e `taboo_comparable_exposures` (campione comparabile di §9.1); `TabooStore.exposuresTable()` e `calibrationTable()` (soglie di §9.2: solve rate, mediana, etichetta provvisoria sotto 20 esposizioni o 4 sessioni, alert, fasce di pubblico); job `export` nel worker dei report; rotte `GET /api/taboo/exposures.csv` e `/api/taboo/calibration.csv`; ID pseudonimi (HMAC), risposte sbagliate aggregate, conservazione 90 giorni applicata all'avvio. Nessuna riclassificazione automatica. Test in `tests/taboo-store.test.ts`.
- [x] **7 · Verifica finale e documenti** (17/11/2026, a diretta chiusa): `npm run typecheck` verde; suite TypeScript completa 340/340 (0 falliti, 0 saltati); Python `gioco-zerotaboo/script` 20/20 e `database/script` 20/20; `npm run build` verde; `node scripts/check-infrastructure.mjs` verde (173 file); `node scripts/smoke-runtime.mjs` e `--bundle` verdi; `npm audit --omit=dev` 0 vulnerabilità; `git diff --check` pulito sui file toccati. `README.md`, `database/README.md`, `database/DB.md`, `scripts/package-win.mjs` (porta `ZeroTaboo.sqlite3` accanto al server) aggiornati; `gioco-zerotaboo/README.md` scritto.
- [ ] **8 · Migliorie v3.1 e mazzo v3.2** (D27–D46). Documenti già aggiornati (`ZEROTABOO.md` v3.1, questo file, `README.md`); **codice da fare**, secondo le specifiche qui sotto. Ordine consigliato: 8.1 → 8.2 → 8.6 (vista streamer) → 8.8 → il resto → 8.9.

## Fase 8 · specifiche

### 8.1 Mazzo v3.1 (D30, D32, D33)

- `mazzo.py parse` su `ZEROTABOO.md` v3.2 → `data/mazzo-v3.2.json`; `data/mazzo-v3.0.json` resta come storico. Se il parser presuppone 62 carte, le sole categorie A–F o la versione nel titolo, va adeguato: ora le categorie sono A–L (nomi nei titoli `### Categoria X · Nome`). Le carte G–J sono in §8 con la stessa tabella delle altre; la tabella di §12.1 è solo storico e **non** va importata.
- `card_revision` +1 per D03, D06, D09, E08, F03, F04, F07. `card_revision` +1 **e statistiche azzerate** per A04, B10, C04 (bersaglio nuovo). Le carte nuove (G–L e le aggiunte in A–F) nascono con revisione 1.
- `validate`: attesi 0 errori e 0 avvisi su 144 carte (vedi i controlli grezzi già fatti, sopra le fasi). Nuovo controllo **bloccante**: un bersaglio o alias non può coincidere, dopo normalizzazione, con il bersaglio o un alias di un'altra carta (renderebbe ambigua la regola anti-raffica). Avvisi nuovi: si segnalano, non si correggono.
- `import`, `verify`, test Python aggiornati.
- `mazzo.py suggest-aliases` → `data/alias-candidati.json` (carta, candidato, regola che l'ha generato). Regole: articolo o preposizione tolti o scambiati (`con l'` ↔ `all'`, `con la` ↔ `alla`, `della` ↔ `di`), numeri ↔ parole (0–20, 100), forme unite ↔ staccate (`chewing gum` ↔ `chewingum`). Esclude gli alias già approvati e quelli della colonna «da non accettare». L'import non legge mai questo file. Test Python.
- `taboo-deck.ts`: costante `TABOO_VOTE_MIN_CARDS = 6` in `packages/shared/src/taboo.ts`. Nel round 3 sono votabili, e mostrate con la loro lettera, solo le categorie con almeno 6 carte disponibili in quel momento (dopo esclusioni D20); pareggio o nessun voto: a sorte tra quelle. Se le categorie votabili sono più di 6, se ne mostrano 6 estratte a sorte, ciascuna con la propria lettera (D46): il voto accetta solo le lettere mostrate. Se la categoria votata si esaurisce durante il round, si prosegue con il mix standard e si registra il fatto. Le carte in playtest entrano nell'estrazione stratificata di tutti i round. Overlay e dashboard leggono i nomi delle categorie dal mazzo, non da un elenco fisso A–F.

### 8.2 Riconoscimento (D28, D29)

File: `apps/server/src/taboo-answer.ts` (puro); costanti in `packages/shared/src/taboo.ts`; casi condivisi in `data/normalizzazione-casi.json`, letti anche dai test Python.

- Costanti: `TABOO_EXTRA_TOKENS_SINGLE = 4`, `TABOO_EXTRA_TOKENS_MULTI = 8`, `TABOO_ELONGATION_RUN = 3`.
- **Anti-raffica**: il riconoscitore riceve anche l'indice delle risposte di tutte le carte caricate (bersagli e alias approvati, normalizzati). Se il messaggio contiene la risposta della carta attiva e almeno una finestra che corrisponde a un'altra carta, è ignorato con motivo `multiple_answers`. Le finestre contenute nella finestra della risposta attiva non contano.
- **Tetto**: token oltre la finestra riconosciuta ≤ 4 se la finestra è di 1 token, ≤ 8 altrimenti; altrimenti motivo `too_much_text`.
- **Lettere allungate**: per ogni finestra candidata, se il testo unito contiene una sequenza di ≥3 lettere uguali, si confronta `scheletro(finestra)` con `scheletro(risposta)`; altrimenti confronto esatto come oggi.
- I messaggi ignorati consumano il limite di 2 s come oggi (D5).

| Carta attiva | Messaggio | Atteso |
| --- | --- | --- |
| PETO | `petooooo` | valida |
| PETO | `peto cane` | valida |
| PETO | `secondo me è il peto` | valida (4 token in più) |
| PETO | `allora secondo me è il peto` | ignorata, `too_much_text` |
| PETO | `peto rutto lag ban troll` | ignorata, `multiple_answers` |
| RUTTO | `ruuutto` | valida |
| RUTTO | `bruuutto` | non valida |
| RAGEQUIT | `rage quiiit` | valida |
| PIZZA CON L'ANANAS | `pizzzza con l'ananassss` | valida |
| PIZZA CON L'ANANAS | `pizza all'ananas` | valida (alias v3.1) |
| MAMMA CHE CHIAMA 10 VOLTE | `mamma che chiama dieci volte` | valida (alias v3.1) |
| INFLUENCER SENZA FOLLOWER | `influencer senza follower lol` | valida (`follower` non è `follow`) |
| CARTA IGIENICA FINITA | `è finita la carta igienica` | valida (alias) |

Nota: con il tetto a 4, frasi lunghe come «allora secondo me è il peto» vengono scartate. È un compromesso voluto; si rivede con i dati della 8.3 (quanti messaggi validi superano i 3 token in più).

### 8.3 Risposte sbagliate e quasi corrette (D31)

- `taboo-answer.ts` esporta `isNearMiss(messaggio, risposte)`: testo normalizzato senza spazi confrontato con ogni risposta senza spazi; quasi corretta se ha lo stesso scheletro (anche senza allungamento) oppure distanza di Damerau-Levenshtein ≤1 per risposte fino a 7 lettere e ≤2 oltre. Solo per messaggi non validi.
- Esposizione: nuovi campi interi `round_active_guessers`, `near_miss_count`, `chat_flag_count` (migrazione delle tabelle STRICT). `round_active_guessers` si scrive su tutte le esposizioni del round alla sua chiusura.
- Tabella `taboo_wrong_answers(exposure_id, text_norm, count, distinct_users)`: testo normalizzato troncato a 40 caratteri, senza URL e menzioni `@`; gli utenti distinti si contano in memoria durante la carta e non si salvano. Conservazione 90 giorni come il resto.
- `GET /api/taboo/wrong-answers.csv` calcolato nel worker dei report: per carta le 20 righe più frequenti, solo testi con somma di `distinct_users` ≥3. Limite accettato: lo stesso utente in sessioni diverse può contare più volte.
- `qa_alerts`: `near_miss_rate > 0.15` sul campione comparabile (`near_miss_count / guess_count`).

### 8.4 Calibrazione (D34, D35, D36)

- Nuovo modulo puro `apps/server/src/taboo-calibration.ts`, usato da `calibrationTable()` nel worker.
- Fascia: da `round_active_guessers` (1–5, 6–20, 21+), al posto della fascia per esposizione.
- Incidenza cumulata (Aalen-Johansen) per carta e fascia sul campione comparabile: tempo dall'apertura della carta; risolta = evento; skip = evento concorrente; `round_timeout` = censura al tempo disponibile.
- Colonne nuove: `cif_18s`, `cif_35s`, `cif_60s`, `cif_60s_low`, `cif_60s_high` (95%), `cond_median_solve_s` (primo `t` con `CIF(t) ≥ CIF(60 s)/2`), `solve_rate_wilson_low`, `solve_rate_wilson_high`, `solve_rate_shrunk`, `review_priority`. Le colonne attuali restano.
- `suggested_label`: soglie di §9.2 su `cif_60s` e `cond_median_solve_s`. Invariati il minimo di 20 esposizioni comparabili su 4 sessioni (sotto: etichetta provvisoria) e il divieto di cambiare livello da soli.
- Shrinkage: `solve_rate_shrunk = (risolte + 10·μ) / (esposizioni + 10)`, con `μ` = tasso semplice aggregato del livello nella stessa fascia (se il livello ha meno di 20 esposizioni, tutte le carte della fascia). `review_priority`: prima il numero di alert, poi `|solve_rate_shrunk − μ|` decrescente.
- Test con vettore calcolato a mano. Quattro esposizioni: risolta a 10 s; timeout con 15 s disponibili; risolta a 20 s; skip a 30 s. Atteso: `cif_18s = 0.25`, `cif_35s = cif_60s = 0.625`, `cond_median_solve_s = 20`, tasso semplice 0.5. Secondo caso: nessuna risolta → `cif_60s = 0`, etichetta provvisoria difficile e alert di revisione.

### 8.5 Segnale `!taboo` (D37)

- Riconosciuto prima delle risposte: messaggio normalizzato uguale a `!taboo` (anche `! taboo`), solo con carta attiva. Non è un tentativo; consuma il limite di 2 s come ogni commento (D5); lo streamer non conta.
- Finestra scorrevole di 5 s, soglia `TABOO_CHAT_FLAG_MIN = 3` (dashboard 2–10). Al superamento: evento `taboo:chatFlag` (carta, istante del primo segnale, numero di utenti) a dashboard e vista streamer, al massimo uno per carta. Mai all'overlay.
- Dashboard: avviso con «Violazione Taboo» (se la carta è ancora aperta) e «Segnala» (crea una segnalazione con l'istante del primo `!taboo`, decisa nell'intervallo come oggi).
- `chat_flag_count` nell'esposizione; comando del simulatore per generare segnali.
- Test in `taboo-room` con orologio finto: 2 utenti → niente; 3 utenti in 5 s → un avviso; 3 utenti in 6 s → niente; secondo gruppo sulla stessa carta → niente; streamer → non conta.

### 8.6 Overlay e vista streamer (D38, D39)

- **Overlay**: «Prima vittoria!» accanto all'ultimo vincitore quando vince la sua prima carta della partita (il dato arriva dal server). A fine partita, schermata dei premi di §10 (Miglior Indovino, Cacciatore di Rosse, Prima Vittoria = chi ha risolto la prima carta della partita, Voce della Chat, Squadra in Forma) con le funzioni già presenti in `taboo-scoring.ts`. Per Voce della Chat il server tiene in memoria, non in telemetria, i round in cui ogni utente ha scritto. Animazioni silenziabili e `prefers-reduced-motion` come oggi.
- **Vista streamer**:
  - token casuale di 128 bit nel DB operativo, nel link della dashboard (`/taboo?k=…`) e rigenerabile; il server invia bersaglio e alias solo ai socket con sessione della dashboard o token valido. Test in `taboo-secrecy`: un socket senza token non riceve mai bersaglio né alias.
  - se `window.obsstudio` esiste, la pagina non si collega e mostra «Vista privata: non aggiungerla alla scena». Sulla rotta, `X-Frame-Options: DENY` e `Content-Security-Policy: frame-ancestors 'none'`.
  - riquadro «Vietate anche:» con i componenti del bersaglio, esclusi articoli, preposizioni semplici e articolate e congiunzioni (elenco costante in `packages/shared/src/taboo.ts`). Esempi: CALZINO BUCATO → calzino, bucato; MAMMA CHE CHIAMA 10 VOLTE → mamma, chiama, 10, volte; PIZZA CON L'ANANAS → pizza, ananas.
  - verificare che il server ascolti solo su `localhost`, oppure che l'accesso dalla LAN sia voluto.

### 8.7 Regia (D40, D41)

- Intervallo prima del round 3 = 30 s qualunque sia l'impostazione; la dashboard lo dice accanto al campo.
- Soglia suggerita prima di «Avvia partita»: ultime 10 partite standard comparabili (non di prova, non interrotte) nella fascia dell'ultima partita giocata. Con meno di 10 partite: «dati insufficienti» e soglia attuale. Successo > 75% → ultima soglia +2; < 30% → −2; altrimenti uguale. Si mostra con il calcolo; il campo resta manuale.

### 8.8 Prova visiva e prova generale (D42)

- `npm run test:visual`, fuori da `tests/*.test.ts`: Playwright avvia il server su porta e DB temporanei con il ponte finto e porta la partita negli stati carta attiva, risolta (con «Prima vittoria!»), skip, Taboo, intervallo, voto del round 3, Jackpot, carta cantata, fine partita, voto del round 3 con 6 categorie dai nomi lunghi (es. «Tecnologia che ti tradisce»). Viewport 1080×1920 e 1920×1080. Casi limite: GOMMA MASTICATA SOTTO IL BANCO, nickname di 24 caratteri con emoji, avatar mancante, `prefers-reduced-motion`. Screenshot in `test-results/taboo-visual/` (in `.gitignore`) da guardare a mano; per ora niente confronto pixel. Stessa cosa per vista streamer e regia.
- Prova generale prima della prima diretta: modalità Prova in OBS e in TikTok LIVE Studio con la scena vera. Controllare la leggibilità su telefono, che la vista streamer non finisca nella scena e, se possibile, il ponte ZeroFollowerBot reale collegato senza andare in onda.

### 8.9 Chiusura

- `npm run typecheck`; `node --import tsx --test tests/*.test.ts`; test Python di `gioco-zerotaboo/script` e `database/script`; `npm run build` (a diretta chiusa); `node scripts/check-infrastructure.mjs`; `node scripts/smoke-runtime.mjs` e `--bundle`; `npm audit --omit=dev`; `git diff --check`.
- Aggiornare `gioco-zerotaboo/README.md` (riconoscimento, mazzo v3.1, nuovo CSV, `!taboo`, vista streamer, limiti) e togliere la riga sulle migliorie non implementate.
- Commit su un branch `zerotaboo-v3.1`, aggiungendo i file di ZeroTaboo **per percorso** (il working tree contiene lavori di altre sessioni). Se le fasi 0–7 non sono ancora state committate, un primo commit separato per quelle.
- Eseguire `scripts/package-win.mjs` e controllare che `ZeroTaboo.sqlite3` sia accanto al server.

## Schede v2.2 (17/11/2026)

- Fatto: `script/schede.py` (schema, controlli §5.3, ingest, report, export) e caricamento in `mazzo.py import`/`verify`; 340 schede `auto_checked` in `data/schede-v2.2/`.
- Da fare: `script/test_schede.py` (nessun test automatico oggi), blind test e revisione dell'editor (§5.1, §5.2), embedding al posto del proxy lessicale di D-002.
- Il mazzo giocato resta la v3; il passaggio alle schede v2.2 è una decisione successiva.

## Non verificato

- **La resa a schermo** di overlay e regia (browser, OBS, TikTok LIVE Studio): compilano e sono collegati, l'aspetto non è stato visto.
- Il pacchetto Windows non è stato generato (`scripts/package-win.mjs` modificato ma non eseguito).
- Nessuna partita giocata con una diretta vera e con ZeroFollowerBot reale: solo ponte finto e server vero.
- Nessun commit: il working tree contiene anche lavori di altre sessioni.
- Fase 8: specificata nei documenti, non ancora implementata né testata.

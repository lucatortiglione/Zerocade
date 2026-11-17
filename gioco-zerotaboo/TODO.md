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

## Fasi

- [x] **0 · Analisi.** Baseline leggera (17/11/2026): `npm run typecheck` verde su 5 workspace; `tests/controls.test.ts` + `tests/help-switches.test.ts` 9/9. Build, suite completa e smoke **rimandati**: la diretta era in corso (TikTok LIVE Studio attivo) e `npm run build` riscrive la cartella servita.
- [x] **1 · Tipi e logica pura.** `packages/shared/src/taboo.ts`; `apps/server/src/taboo-answer.ts`, `taboo-scoring.ts`, `taboo-machine.ts`; 49 test verdi (`tests/taboo-answer|scoring|machine.test.ts`); typecheck verde.
- [x] **2 · Mazzo e persistenza.** `gioco-zerotaboo/script/mazzo.py` (parse, validate, import, verify, export), fonte `data/mazzo-v3.0.json`, casi condivisi `data/normalizzazione-casi.json`, `database/ZeroTaboo.sqlite3` (62 carte, 5 avvisi: D03, D06, D09, E08, F07, mostrati e non corretti); `apps/server/src/taboo-deck.ts` (caricatore con rivalidazione, estrazione stratificata) e `taboo-db.ts` (store operativo, `tabooStore` esportato da `db.ts`). 77 test TypeScript e 20 Python verdi; typecheck verde. Eccezione documentata: le chiavi esterne non attraversano due file (le esposizioni salvano `card_code` + `card_revision`).
- [x] **3 · Server e registrazione.** `apps/server/src/taboo.ts` (stanza: timer, dedup, limiti, effetti), `validate.ts` (`sanitizeTabooCommand`), `index.ts` (ponte, eventi `taboo:*`, selezione gioco, pausa, shutdown, avvio), `packages/shared/src/index.ts` (GameDef `zerotaboo`, eventi). Test: `taboo-room` (25, orologio finto), `taboo-secrecy` (4), `taboo-socket` e `taboo-bridge` (server vero su porta e DB propri; ponte finto). Bug trovato dal server vero e corretto: i millisecondi reali sono frazionari e le colonne intere STRICT li rifiutano (ora arrotondati nello store).
- [x] **4 · Overlay.** `apps/overlay/src/Taboo.tsx` + `taboo.css`, `store.ts` (`taboo`, `tabooAt`), `App.tsx`. Cinque parole Taboo della carta aperta mostrate al pubblico (D26); difficoltà con testo e segni, non solo colore; ogni nome con la sua foto (`ViewerAvatar`); animazioni silenziabili e rispettose di `prefers-reduced-motion`; countdown locale solo mentre il round gira. Compila nel bundle (build in cartella temporanea). **Non visto a schermo**: nessuna prova visiva in browser, OBS o TikTok LIVE Studio.
- [x] **5 · Dashboard.** `TabooSidebar.tsx` (partita, carta privata, skip/Taboo/cantata, categoria, segnalazioni e rettifiche, avvisi del mazzo, metriche, simulatore per la prova), `GamesPage.tsx`, `store.ts`, stili. Ogni comando porta `expectedVersion` e mostra l'errore tipizzato. **Non visto a schermo.**
- [x] **6 · Telemetria e report.** Viste `taboo_exposure_report` (nomi di §3.7/§9.1) e `taboo_comparable_exposures` (campione comparabile di §9.1); `TabooStore.exposuresTable()` e `calibrationTable()` (soglie di §9.2: solve rate, mediana, etichetta provvisoria sotto 20 esposizioni o 4 sessioni, alert, fasce di pubblico); job `export` nel worker dei report; rotte `GET /api/taboo/exposures.csv` e `/api/taboo/calibration.csv`; ID pseudonimi (HMAC), risposte sbagliate aggregate, conservazione 90 giorni applicata all'avvio. Nessuna riclassificazione automatica. Test in `tests/taboo-store.test.ts`.
- [x] **7 · Verifica finale e documenti** (17/11/2026, a diretta chiusa): `npm run typecheck` verde; suite TypeScript completa 340/340 (0 falliti, 0 saltati); Python `gioco-zerotaboo/script` 20/20 e `database/script` 20/20; `npm run build` verde; `node scripts/check-infrastructure.mjs` verde (173 file); `node scripts/smoke-runtime.mjs` e `--bundle` verdi; `npm audit --omit=dev` 0 vulnerabilità; `git diff --check` pulito sui file toccati. `README.md`, `database/README.md`, `database/DB.md`, `scripts/package-win.mjs` (porta `ZeroTaboo.sqlite3` accanto al server) aggiornati; `gioco-zerotaboo/README.md` scritto.

## Non verificato

- **La resa a schermo** di overlay e regia (browser, OBS, TikTok LIVE Studio): compilano e sono collegati, l'aspetto non è stato visto.
- Il pacchetto Windows non è stato generato (`scripts/package-win.mjs` modificato ma non eseguito).
- Nessuna partita giocata con una diretta vera e con ZeroFollowerBot reale: solo ponte finto e server vero.
- Nessun commit: il working tree contiene anche lavori di altre sessioni.

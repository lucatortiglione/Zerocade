# ZeroTaboo

Taboo per la diretta: lo streamer descrive la carta senza dire le parole vietate, la chat prova a indovinare e **il primo messaggio valido arrivato al server** vince. Cinque round da 90 secondi contro una soglia di squadra (25 per impostazione predefinita).

- Regolamento e mazzo: [ZEROTABOO.md](ZEROTABOO.md) (v3.2: 144 carte in 12 categorie, 59 standard e 85 in playtest).
- Guida per chi scrive il codice: [GUIDA_CODICE_ZEROTABOO.md](GUIDA_CODICE_ZEROTABOO.md).
- Stato del lavoro e decisioni dell'organizzatore: [TODO.md](TODO.md).

## Come si gioca

1. Nella dashboard scegli **ZeroTaboo** (categoria Parole) e collega ZeroFollowerBot (la partita vera usa solo i messaggi del suo ponte).
2. **Avvia partita**, poi **Avvia round**: nel primo round parte subito, dai successivi dopo l'intervallo (20 s, configurabile da 15 a 30).
3. Per leggere la parola da far indovinare apri la **vista streamer** a tutto schermo (`/taboo`, link «Apri la vista streamer» nella colonna di regia): per un secondo monitor o il telefono accanto alla camera. La dashboard mostra la carta **solo a te**: bersaglio, cinque Taboo, alias approvati. Il pubblico vede l'overlay con le **cinque parole che non puoi dire**, categoria, difficoltà, punti, tempo, serie e l'ultimo indovino con la sua foto. Il bersaglio e gli alias si vedono solo a carta chiusa.
4. Dai pulsanti: **Skip** (al massimo 2 per round), **Violazione Taboo** (carta persa, −1), **Carta cantata** (una volta, negli ultimi 20 s, ×2 sui punti base, mai sul Jackpot).
5. Round 3: la chat vota la categoria scrivendo una lettera A–F (pareggio o nessun voto: a sorte). Round 4: il bot sceglie un vincolo narrativo a caso. Round 5: la prima carta è il Jackpot (×2 sui punti base).
6. Se il ponte cade o premi pausa, il tempo si ferma e l'esposizione resta marcata «interrotta» (fuori dalla calibrazione): riprendi quando il ponte è tornato.
7. Una violazione tardiva o contestata si **segnala** dalla dashboard e si **decide nell'intervallo**: se è avvenuta prima della risposta vincente la vittoria si revoca e il punteggio si ricalcola, con gli eventi di correzione aggiunti (mai riscritti).

Modalità **Prova**: il simulatore della dashboard gioca una partita fuori classifica e fuori dalla telemetria. Nella partita vera il simulatore è rifiutato.

## Regole del riconoscimento delle risposte

Normalizzazione di maiuscole, accenti, apostrofi, spazi e punteggiatura. Il bersaglio (o un alias **approvato**) deve comparire come finestra di token consecutivi il cui testo unito coincide («rage quit» = RAGEQUIT; «brutto» non risolve RUTTO). Niente plurali automatici: si aggiungono come alias nel mazzo. Un messaggio con più ipotesi (elenco con `,` `;` `/` `|`, «o», «oppure», o troppo testo oltre la risposta) è ignorato. Un tentativo per utente ogni 2 secondi, da quando il messaggio arriva. Lo streamer non può rispondere.

## Dove sta il codice

| Cosa | File |
| --- | --- |
| Regole come costanti e tipi condivisi | `packages/shared/src/taboo.ts` |
| Riconoscimento delle risposte (puro) | `apps/server/src/taboo-answer.ts` |
| Punteggi, serie, classifica, rettifiche (puro) | `apps/server/src/taboo-scoring.ts` |
| Macchina a stati di partita, round e carta (pura) | `apps/server/src/taboo-machine.ts` |
| Mazzo: caricamento, rivalidazione, estrazione stratificata | `apps/server/src/taboo-deck.ts` |
| Dati operativi e telemetria (`taboo_*`) | `apps/server/src/taboo-db.ts` |
| Stanza: timer, deduplica, limiti, effetti, emissioni | `apps/server/src/taboo.ts` |
| Comandi validati al confine | `apps/server/src/validate.ts` (`sanitizeTabooCommand`) |
| Overlay | `apps/overlay/src/Taboo.tsx`, `taboo.css` |
| Regia | `apps/dashboard/src/components/TabooSidebar.tsx` |
| Strumento del mazzo | `script/mazzo.py` |
| Schede editoriali v2.2 (schema, controlli, database) | `script/schede.py` |

I moduli puri non leggono orologio, casualità, database o rete: li ricevono come parametri, e i test usano un orologio finto.

## Il mazzo

`data/mazzo-v3.0.json` è la fonte (ricavata da `ZEROTABOO.md` con `mazzo.py parse`); `database/ZeroTaboo.sqlite3` è il DB che legge il server, costruito con `mazzo.py import`.

```powershell
python -I gioco-zerotaboo/script/mazzo.py validate   # errori bloccanti e avvisi editoriali
python -I gioco-zerotaboo/script/mazzo.py import     # costruisce database/ZeroTaboo.sqlite3 (file temporaneo, verifica, sostituzione)
python -I gioco-zerotaboo/script/mazzo.py verify     # confronta il DB con la fonte
python -I gioco-zerotaboo/script/mazzo.py export     # CSV con BOM
```

Gli **avvisi editoriali si mostrano e non si correggono da soli**. I cinque avvisi della v3.0 (D03, D06, F07 con un Taboo della stessa radice del bersaglio; D09 senza alias; E08 con un alias solo nella nota) sono stati risolti nel regolamento v3.1. Finché la fonte non è rigenerata (`parse`, `import`: TODO, fase 8.1) il DB contiene ancora la v3.0 a 62 carte. Le carte in playtest (categorie G–L, carte aggiunte e riscritte) sono in §8. Nel round 3 una categoria è votabile solo con almeno 6 carte disponibili, e il voto ne mostra al massimo 6.

## Schede editoriali v2.2

Le carte della v2.2 ([LINEE_GUIDA_CARTE_ZEROTABOO_v2.2.md](LINEE_GUIDA_CARTE_ZEROTABOO_v2.2.md)) vivono a parte dal mazzo v3, che resta quello giocato (§6.5). I file sono in `data/schede-v2.2/` (una per categoria; `data/` è in `.gitignore`) e `mazzo.py import` le carica in tabelle proprie accanto al mazzo, con `verify` che le confronta con i file.

```powershell
python -I gioco-zerotaboo/script/schede.py ingest BOZZA.json   # bozze del generatore -> data/schede-v2.2/
python -I gioco-zerotaboo/script/schede.py check [--write]    # ricalcola i controlli automatici (§5.3)
python -I gioco-zerotaboo/script/schede.py report            # stati, livelli, difficoltà e tag comici per categoria
python -I gioco-zerotaboo/script/schede.py export            # CSV con BOM per l'editor
```

Stato al 17/11/2026: 340 schede (17 categorie × 20), tutte `auto_checked`. Blind test, revisione dell'editor e revisioni di piattaforma sono passi successivi; un FAIL di sicurezza porta a `rejected` senza riscritture. Il controllo D-002 usa un proxy lessicale, senza embedding: le coppie vicine (ad esempio ACQUA CALDA FINITA e BORSA DELL'ACQUA CALDA) vanno in `REVIEW`. `schede.py` non ha ancora test automatici.

## Telemetria e calibrazione

Per ogni esposizione di carta si registrano i campi di `ZEROTABOO.md` §3.7 e §9.1. I giocatori sono **pseudonimi** (HMAC con una chiave locale nel DB operativo, fuori da Git), mai nickname o avatar; le risposte sbagliate solo aggregate, senza utente; tutto ciò che ha più di **90 giorni** si elimina all'avvio del server. Mai durante una diretta.

- `GET /api/taboo/exposures.csv`: le esposizioni, con i nomi del regolamento.
- `GET /api/taboo/calibration.csv`: per carta e fascia di pubblico (1–5, 6–20, 21+), sul campione comparabile; `suggested_label` e `qa_alerts` chiedono una revisione, **non cambiano mai il livello da soli**.

Entrambi sono calcolati nel worker dei report, non sul thread principale.

## Verifica

```powershell
npm run typecheck
node --import tsx --test tests/taboo-*.test.ts
python -I -m unittest discover -s gioco-zerotaboo/script
node --import tsx --test tests/*.test.ts       # tutta la suite
```

I test `taboo-socket` e `taboo-bridge` avviano un server vero su una porta libera con un database temporaneo (mai quello della diretta), con un ponte ZeroFollowerBot finto.

## Limiti noti di questa versione

- **Non verificato a schermo**: la resa dell'overlay e della regia non è stata vista in un browser, in OBS o in TikTok LIVE Studio; compilano e sono collegati al server, ma l'aspetto non è stato controllato.
- Fuori ambito (v1): ruota delle penitenze, esibizioni (Taboo invertito, Mimo Proibito, No Sostantivi), Speedrun, Una Parola Sola, progressione stagionale, premi simbolici nella scena (le funzioni di calcolo esistono in `taboo-scoring.ts`).
- La rettifica sposta la carta contestata a «Taboo» e ricalcola il round; il punteggio di squadra è corretto, ma una serie già mostrata non viene ricostruita a schermo.
- Dal regolamento v3.1 l'overlay **mostra** i Taboo al pubblico (D26, D27); bersaglio e alias restano nascosti fino alla chiusura.
- Le migliorie decise il 17/11/2026 (D27–D46) sono nei documenti ma **non ancora nel codice**: vedi [TODO.md](TODO.md), fase 8. Le sezioni sopra descrivono il comportamento attuale.

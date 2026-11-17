# ZeroTaboo

Taboo per la diretta: lo streamer descrive la carta senza dire le parole vietate, la chat prova a indovinare e **il primo messaggio valido arrivato al server** vince. Cinque round da 90 secondi contro una soglia di squadra (25 per impostazione predefinita).

- Regolamento e mazzo: [ZEROTABOO.md](ZEROTABOO.md) (v3.0, 62 carte).
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

I moduli puri non leggono orologio, casualità, database o rete: li ricevono come parametri, e i test usano un orologio finto.

## Il mazzo

`data/mazzo-v3.0.json` è la fonte (ricavata da `ZEROTABOO.md` con `mazzo.py parse`); `database/ZeroTaboo.sqlite3` è il DB che legge il server, costruito con `mazzo.py import`.

```powershell
python -I gioco-zerotaboo/script/mazzo.py validate   # errori bloccanti e avvisi editoriali
python -I gioco-zerotaboo/script/mazzo.py import     # costruisce database/ZeroTaboo.sqlite3 (file temporaneo, verifica, sostituzione)
python -I gioco-zerotaboo/script/mazzo.py verify     # confronta il DB con la fonte
python -I gioco-zerotaboo/script/mazzo.py export     # CSV con BOM
```

Gli **avvisi editoriali si mostrano e non si correggono da soli**: D03 e D06 e F07 hanno un Taboo con la stessa radice del bersaglio; D09 non ha alias; E08 ha un alias nella nota che non è nella tabella degli alias. Le 16 carte candidate G–J di §12.1 non si caricano finché la Fase 1 non è completa.

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
- Il testo del regolamento (§3.2, §12.2) vuole i Taboo nascosti al pubblico; per decisione dell'organizzatore (D26) l'overlay li **mostra**. Bersaglio e alias restano nascosti fino alla chiusura.

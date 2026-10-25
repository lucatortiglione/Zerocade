# Zerocade — Analisi architettura (ispirata a Livecade.io)

> Analisi di backend e frontend, con il mapping della piattaforma di riferimento
> (livecade.io) sull'implementazione Zerocade.

## 1. Cosa è Livecade (evidenza dal sito)

Da `livecade.io` (pagina pubblica, analizzata via fetch):

- **Prodotto**: "Interactive TikTok LIVE Games for Creators" — giochi interattivi che il
  pubblico di una diretta TikTok gioca **in tempo reale** tramite commenti, regali, like
  e share. Non è un CAD: il nome "Livecade" = "live + arcade".
- **Target**: creator TikTok (gaming, varietà, educational), agenzie e team multi-account.
- **Superfici** (3 prodotti distinti):
  1. **Sito marketing** (`livecade.io`) — landing con feature, prezzi, FAQ, comparazioni.
  2. **Dashboard creator** (`app.livecade.io`) — SPA "Checking your session…" (auth-based).
  3. **Overlay** (`overlay.livecade.io/<user>`) — URL permanente aggiunto come
     *browser source* in OBS / Streamlabs / TikTok LIVE Studio.
- **Funzioni chiave** (dalla landing):
  - 50+ giochi "plug-and-play", switch a metà diretta senza toccare OBS.
  - **Action triggers**: regali, commenti, like, follow, share e join mappati su mosse.
  - **Play guide** on-screen: icone live che mostrano ai viewer cosa inviare.
  - **DJ Pad**: sound drop live (upload propri, link, libreria integrata).
  - **Tuning live** delle impostazioni di gioco senza restart.
  - Classifica gifters, multi-account TikTok, piani Free/Pro (limite tempo giornaliero).

## 2. Architettura frontend

### 2.1 Dashboard (`apps/dashboard`)
- **Stack**: React 19 + Vite 8 + `react-router` 8 + `socket.io-client` 4, TypeScript.
- **Struttura**: rail sinistra + router con pagine `Games` (libreria, trigger, impostazioni
  live), `DJ Pad`, `Gifts` (catalogo), `Setup` (link overlay).
- **Stato**: `store.ts` usa `useSyncExternalStore` alimentato dal socket
  (`session:state`, `live:event`); il ranking gifters è calcolato client-side.
- **Overlay key**: `overlayKey.ts` genera/legge una chiave da `localStorage`
  (sostituto dell'account finché non esiste autenticazione); l'URL overlay è `?key=<key>`.

### 2.2 Overlay (`apps/overlay`, aggiunto in questo task)
- **Stack**: React 19 + Vite 8 (porta 5174) + canvas 2D, senza dipendenze grafiche pesanti
  (veloce e leggero come browser source OBS).
- **Motore** (`games/engine.ts`): game loop `requestAnimationFrame`, coda di azioni,
  `GameInstance` (`reset/onAction/update/draw`), swap del gioco senza reload.
- **Giochi** (`games/*.ts`): `giftDrop`, `mmaClash`, `lunarDash` — registry `createGame(id)`.
- **UI**: canvas a schermo intero + barra superiore (titolo/status) + toast eventi +
  **play guide** in basso che mappa ogni trigger sull'azione.
- **DJ audio** (`audio.ts`): suoni built-in sintetizzati via Web Audio API (nessun asset),
  URL custom riprodotti con `Audio`.

### 2.3 Sito marketing
Non implementato (il riferimento dell'utente è `app.livecade.io`, la dashboard).
Estensione naturale: un workspace `apps/site` (Astro/Next) riutilizzando `@zerocade/shared`.

## 3. Architettura backend (`apps/server`)
- **Stack**: Fastify 5 + `@fastify/helmet`, Socket.IO 4, `tsx` (dev), TypeScript, Node 24.
- **REST**: `GET /api/health`, `GET /api/games` (catalogo giochi/regali dal pacchetto condiviso).
- **Realtime (Socket.IO)**:
  - **Autenticazione handshake**: `auth = { clientType: 'dashboard' | 'overlay', key }`
    con chiave validata da regex; la `key` identifica la *room*.
  - **Room**: dashboard e tutti gli overlay con la stessa key condividono la room.
  - **Permessi**: solo la dashboard emette cambi di stato; l'overlay ascolta.
  - **Client→server**: `sim:event`, `game:select`, `triggers:set`, `settings:set`, `dj:play`.
  - **Server→client**: `session:state`, `live:event`, `dj:play`.
- **Stato** (`sessions.ts`): mappa in-memory `key → SessionState` (gameId, triggers,
  settings). Nota: un restart lo azzera → da migrare a DB (Postgres/Redis) con gli account.
- **Validazione** (`validate.ts`): ogni payload dal socket è trattato come untrusted e
  sanitizzato (viewer, eventi, trigger, settings clampate per game, URL DJ https-only).

## 4. Modello dati condiviso (`packages/shared`)
- `LiveEvent` = gift | like | follow | share | comment | join.
- `Gift` (18 regali, tier bronze/silver/gold/diamond), `GiftTier`, `giftById`.
- `TriggerSource` / `Trigger` / `MAX_TRIGGERS` / `describeSource` / `sourceMatches` / `triggersFor`.
- `GameSetting` (number/toggle) / `GameSettings` / `defaultSettings` / `GameDef` (3 giochi).
- `DJ_SOUNDS` (6 built-in) / `DjPlay` / `djSoundById`.
- Contratto Socket.IO (`ClientToServerEvents`, `ServerToClientEvents`, `HandshakeAuth`).
- `Gifter` / `addToRanking`.

## 5. Flusso dati (end-to-end)
1. Il creator apre la dashboard → genera/legge `overlayKey` → si connette al server.
2. Copia l'URL overlay (`?key=…`) e lo aggiunge come browser source in OBS.
3. L'overlay si connette con la stessa `key` → entra nella stessa room → riceve `session:state`.
4. Il creator seleziona un gioco / modifica trigger / tune le impostazioni → il server salva
   e **broadcasta** `session:state` → l'overlay aggiorna il gioco live.
5. Una sorgente reale (o il simulatore) emette `sim:event` → il server valida e broadcasta
   `live:event` → l'overlay mappa i trigger (`triggersFor`) sulle azioni del gioco.
6. Il DJ Pad emette `dj:play` → broadcast alla room → l'overlay riproduce il suono.

## 6. Stack e versioni (aggiornate)
| Area | Tecnologia | Versione |
|---|---|---|
| Linguaggio | TypeScript | 7.0.2 (ultima stabile) |
| Runtime | Node.js | 24.x |
| Frontend | React / React DOM | ^19.3.1 |
| Router | react-router | ^8.5.0 |
| Build | Vite | 8.3.5 (+ @vitejs/plugin-react ^6.1.2) |
| Realtime | socket.io / socket.io-client | 4.7.5 |
| Backend | Fastify + @fastify/helmet | 5.5.0 / ^13.2.0 |
| Dev server | tsx | ^4.23.15 |
| Orchestrazione | npm workspaces + concurrently | ^10.0.6 |

## 7. Passi successivi consigliati
- **Account/auth**: sostituire l'`overlayKey` in `localStorage` con utenti, OAuth TikTok e
  URL permanenti `overlay.livecade.io/<user>`.
- **Sorgente reale TikTok/Twitch**: implementato (§9); resta solo da verificare TikTok su una live reale.
- **Persistenza**: implementata (§10, SQLite via `node:sqlite`): sessioni, classifica gifters e
  cronologia eventi sopravvivono al restart. Restano solo piani/billing/limiti tempo (se serviranno).
- **Più giochi**: ora 8 (Gift Drop, MMA Clash, Lunar Dash, Trivia, Word Guess, Word Swipe,
  4 Pics 1 Word, Picwords 2). Aggiungerne altri è semplice: un `GameDef` in `GAMES`, un modulo in
  `apps/overlay/src/games` e una riga in `registry.ts`.
- **Sito marketing**: workspace `apps/site` riutilizzando `@zerocade/shared`.

## 8. Risultati dell'analisi del bundle reale (app.livecade.io, senza login)

Estratti dal bundle JS/CSS pubblico (771 KB index + chunk `react-vendor`/`socket-io`):

**Stack confermato**: React + Vite + Socket.IO. Autenticazione con **better-auth**
(`better-auth:focus-manager/broadcast-channel/online-manager`).

**Domini**: `livecade.io`, `app.livecade.io`, `overlay.livecade.io`, `cdn.livecade.io`,
`www.tiktok.com`, `huggingface.co` (AI), `challenges.cloudflare.com` (Turnstile), `flagcdn.com`.

**REST**: `/api/auth`, `/api/user/me`, `/api/gifts?catalogOnly=1`. Quest'ultimo è pubblico e
restituisce il catalogo regali reale: `{ gifts: [{ id, name, imageUrl, coinAmount, scrapedAt }] }`
(~226 KB, id numerici TikTok, immagini `.webp` su `cdn.livecade.io`).

**Eventi Socket.IO (naming reale)**: `session:heartbeat/stats/status`,
`dashboard:event/gift/gifters/comment/join/history/music/reset`, `tiktok:connect/disconnect/status`,
`simulator:ai/start/status/stop`, `game:apply_update/control_action/control_search/control_text/test_action`,
`djpad:trigger/stop/triggered`, `mixer:set`, `shoutout:send`, `notification:new`,
`scoreboard:show/hide`, `chat:action`, `creator:comment/gameInfo`, `firstlive:overlay`,
`overlay:update_available`.

**Widget overlay** (oltre ai giochi): `board` (minimal/podium/race/ranked/spotlight/sticker),
`follower` (minimal/slant/spotlight/sticker), `goal` (blocks/capsule/checkpoints/countdown/iconfill/
ring/slant/sticker/tower), `jar` (bowl/mason/tip), `marquee` (band/caution/metal/neon/outline/
rainbow/retro/ticker), `text` (metal/neon/outline/pill/rainbow/retro), `timer` (clock/minimal),
`highlights` (hero/row), `notification`, `scoreboard`.

**Route** (react-router): `/dashboard`, `/settings/:tab`, `/analytics/:tab`, `/history`,
`/admin/:tab/:section`, `/affiliate/:tab`, `/billing/success`, `/game-assets/:gameId`,
`/game-data/:gameId`, `/login`, `/register`, `/onboarding`, ...

**Design token (CSS)**: `--bg-base/surface/elevated/overlay`, `--accent`, `--text-primary/secondary/
muted`, `--border`, `--danger/success/warning`, `--radius-sm/md/lg`, `--font-stack`.
Tier rarità TikTok: `--rare/epic/legendary/mythic`. Font: `Switzer` + famiglia `LC *`
(Anton/Bangers/Fredoka/Inter/Lexend/Lobster/Marker/Montserrat/Nunito/Outfit/Pixel).

**Nota**: i token di Zerocade (`--bg-base/surface/elevated`, `--accent`, `--text-muted`,
`--border`, `--radius`) erano già allineati a quelli reali. In questo task sono stati adottati
i tier rarità reali (`rare/epic/legendary/mythic` + `TIER_COLORS`) e il catalogo regali con
nomi/importi reali (sottoinsieme curato di `livecade.io/api/gifts`). Resta solo da adottare
i font `Switzer`/"LC *".

## 9. Sorgenti reali (TikTok / Twitch)
- **Server** (`apps/server/src/sources.ts`): classe `RoomSources` per overlay-key che mantiene i
  connettori e traduce gli eventi nel tipo interno `LiveEvent` (broadcast su `live:event`).
- **TikTok** (`tiktok-live-connector` 2.5.0, API legacy `WebcastPushConnection`): eventi
  `chat/gift/like/follow/share/member` → `comment/gift/like/follow/share/join`; i regali reali
  vengono mappati sul catalogo con `giftIdForTiktok` (match per nome, altrimenti monete più vicine).
- **Twitch** (`tmi.js` 1.8.5, chat IRC anonima): `message` → `comment`, `cheer` (bits) → `like`.
- **Contract**: `source:connect` / `source:disconnect` (client→server), `source:status` (server→client).
- **Dashboard**: pagina **Sources** per inserire `@username` TikTok e canale Twitch, con stato live.
- ⚠️ **Licenza**: `tiktok-live-connector` è **AGPL-3.0**: se distribuisci il servizio, verifica gli
  obblighi copyleft (il resto dello stack è MIT/Apache). TikTok richiede una live attiva e la
  connessione può essere bloccata da IP di datacenter.

## 10. Persistenza (SQLite)
- **Scelta**: `better-sqlite3` 13.0.3 (binding sincrono, engine SQLite **3.53.4**), file locale
  `apps/server/data/zerocade.db` (gitignored), sovrascrivibile con la variabile `ZEROCADE_DB`.
- **Engine 3.54.1** (ultima stabile): `npm run sqlite:upgrade` esegue `scripts/upgrade-sqlite.mjs`,
  che scarica l'amalgamation 3.54.1 da sqlite.org e ricompila il binding nativo (richiede
  Visual Studio Build Tools + Python 3). Fino ad allora l'engine resta 3.53.4, perché non esiste
  ancora una release di `better-sqlite3` con 3.54.1 su npm.
- **Tabelle**: `sessions` (gameId/triggers/settings in JSON per overlay-key), `gifters`
  (classifica persistente per key), `events` (cronologia, prune a 2000 per key).
- **Flusso**: `broadcastEvent` persiste l'evento, aggiorna la classifica e trasmette
  `live:event` + `ranking:update`; alla connessione il server reinvia `session:state` e la
  classifica persistente.
- **Dashboard**: il ranking gifters arriva ora dal server (`ranking:update`) invece di essere
  calcolato client-side, quindi **Top Gifters** sopravvive a refresh e restart.
- **Endpoint**: `GET /api/events?key=…&limit=…` (cronologia eventi).

## 11. Quiz, widget overlay e Twitch EventSub
- **Giochi Quiz**: **Trivia** (`quiz.ts`, risposte multiple via commento A/B/C/D o 1-4),
  **Word Guess** (`word.ts`, parola/lettere), **Word Swipe** (`wordSwipe.ts`, ruota di lettere in
  stile Zen Word / Words of Wonder), **4 Pics 1 Word** (`fourPics.ts`) e **Picwords 2**
  (`picwords.ts`). Gli ultimi due condividono la factory `picQuiz.ts` (indovina la parola dalle
  immagini/emoji). Il trigger è `comment → answer`/`guess`.
- **Widget overlay** (`apps/overlay/src/Widgets.tsx`): `alerts` (banner evento), `follower`
  (ultimo follower), `goal` (barra verso un obiettivo in monete), `gifters` (classifica).
  Abilitabili/configurabili dalla dashboard (`WidgetsPanel`, evento `scene:set`); persistiti nella
  sessione (colonne `widgets`/`goal`).
- **Twitch EventSub** (`apps/server/src/twitch-eventsub.ts`): WebSocket `eventsub.wss.twitch.tv`
  con app access token (client credentials), sottoscrive `channel.follow` e `channel.raid`.
  Richiede `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`; senza credenziali Twitch resta solo chat
  (tmi.js). Mappatura: `channel.follow`→follow, `channel.raid`→commento.
- ⚠️ EventSub non è stato testato end-to-end qui (mancano le credenziali Twitch); il percorso è
  verificato solo a livello di compilazione/build.





# Zerocade — Architettura e stato dell'implementazione

Revisione del **16 novembre 2026**, basata su sorgenti, manifest, lockfile e database del workspace.
L'analisi storica di Livecade resta in [TODO.md](TODO.md); i contratti del prodotto di riferimento
non descrivono automaticamente Zerocade. L'[indice documentale](docs/STATO_DOCUMENTAZIONE.md)
distingue guide operative, specifiche e rapporti storici.

## Componenti e dipendenze

| Componente | Responsabilità |
| --- | --- |
| `apps/server` | Fastify, Socket.IO, stanze, sorgenti TikTok/Twitch/ZeroFollowerBot, persistenza e giochi con autorità server |
| `apps/dashboard` | Regia React: catalogo, impostazioni, trigger, sorgenti, media e classifiche |
| `apps/overlay` | Sorgente browser React/canvas per OBS e TikTok LIVE Studio, renderer e pagine dei giochi |
| `packages/shared` | Catalogo di 40 giochi, impostazioni, validazioni, contratti e regole comuni |
| `packages/browser-runtime` | Socket.IO in Web Worker, richieste HTTP limitate e notifiche raggruppate per frame |
| `gioco-*`, `database/script` | Preparazione e verifica offline di lessici, domande, bacini e corpus |

Le app dipendono da `shared`; dashboard e overlay usano anche `browser-runtime`, che dipende da `shared`.
Le app comunicano via HTTP/Socket.IO e non si importano a vicenda. React, DOM e canvas restano sul thread
UI. Worker Node separati gestiscono persistenza/report e generazione ZeroWords; ZeroContext classico
carica i dati e calcola il ranking in un Web Worker del gioco.

## Sessioni ed eventi

La dashboard conserva una chiave locale che identifica la stanza. Dashboard e overlay con la stessa
chiave ricevono lo stato pertinente; i comandi di regia sono controllati sul server. La chiave locale
non equivale a un sistema di account e OAuth per utenti remoti.

1. Il server ripristina la sessione persistita e invia lo snapshot ai client.
2. La dashboard modifica gioco, impostazioni, trigger o scena; il server valida e distribuisce lo stato.
3. Le sorgenti producono eventi normalizzati; persistenza, ranking e gioco seguono i propri contratti.
4. L'overlay applica stato e azioni; i giochi con autorità server ricevono gli esiti dal server.
5. DJ Pad e widget condividono la stanza, con preferenze e media persistenti.

Le code hanno limiti, deadline ed errori espliciti. Ricevere un evento non dimostra che sia stato salvato:
la dashboard espone i problemi di persistenza. `GET /api/live` verifica che il processo risponda;
`GET /api/health` riporta disponibilità, saturazione e metriche dei worker.
Dettagli e limiti sono nell'[audit infrastrutturale](docs/DIRETTIVE-audit-2026-11-14.md).

## Sorgenti

- TikTok: `tiktok-live-connector` traduce chat, regali, like, follow, share e ingressi nel formato interno.
- Twitch: `tmi.js` gestisce la chat. EventSub usa `TWITCH_CLIENT_ID` e `TWITCH_USER_ACCESS_TOKEN`,
  con token utente; i follow usano `channel.follow` v2, scope `moderator:read:followers` e un utente
  autorizzato sul canale. Il modulo gestisce keepalive, reconnect e timeout; manca il rinnovo OAuth interattivo.
- ZeroFollowerBot: ponte locale con riconnessione automatica e comando per ritentare subito.
  Il torneo ZeroContext accetta soltanto la chat proveniente da questo ponte.

Le prove storiche con fixture non certificano connessioni reali alle piattaforme.

## Dati e persistenza

| Archivio | Uso |
| --- | --- |
| `apps/server/data/zerocade.db` | Sessioni, eventi, classifiche, voti, telemetria e tornei sul PC della diretta |
| `database/giochi.sqlite3` | Schemi logici `wordle`, `context`, `associazioni`, `parole`, `contenuti` |
| `database/ZeroQuizz.sqlite3` | 26.715 domande, tutte attive nel DB locale esaminato |
| `database/ZeroDubbi.sqlite3` | 120 dilemmi con testi italiano/inglese |
| `database/ZeroLettere.sqlite3` | 5.661 indizi e 109 alternative; banca autonoma senza integrazione nel runtime |
| `database/parole_ita_raw.sqlite3` | DB di lavoro lessicale, fuori da Git: inventario, decisioni, bacini e valutazioni |

Il binding — `better-sqlite3`; il motore effettivamente caricato nel workspace — **SQLite 3.54.1**.
Il confezionamento seleziona il binario caricato tramite `scripts/sqlite-runtime.mjs`.
`ZEROCADE_DB` cambia il DB operativo; `ZEROCADE_GIOCHI_FILE` cambia quello dei contenuti.
Percorsi, origini e copie sono descritti in [database/DB.md](database/DB.md).

## ZeroContext

Il corpus ha **93.928 tentativi e 9.513 segrete per profilo**: originale (300 float32),
TurboX e Harrier Model2Vec (256 float32). I tre schemi `context_original`, `context_turbox`,
`context_harrier` condividono il DB; la scelta della regia è per stanza e avvia un nuovo round
senza riavviare il server o azzerare le classifiche. `context` resta compatibile con gli strumenti.
Tutte le 6.838 vecchie segrete sono conservate. Le geometrie dei nuovi modelli non sono state
ricalcolate e i loro controlli sulle associazioni registrano regressioni; l'originale è predefinito.
Dettagli in [PROFILI_ASSOCIAZIONI.md](gioco-zerocontext/PROFILI_ASSOCIAZIONI.md).
Tutte le 9.513 segrete sono ora ordinarie, senza rimozioni; il pool speciale è vuoto.
La nuova pipeline configurata `context-vectors-1` introduce Model2Vec, contesti densi,
fallback FastText allineato, margine antonimico e collaudo obbligatorio; non ha ancora rigenerato
il corpus pubblicato.

Il server gestisce anche la modalità classica: classifica precalcolata per round, punti,
tentativi e timer della stanza. Tutti i round sono ordinari; la rotazione speciale è sospesa. Overlay e preview visualizzano snapshot; la lunghezza e gli aiuti restano configurabili.
Il motore browser precedente mantiene la compatibilità con corpus int8.

I due task principali eseguono `build_context_semantic.py --publish`. La pubblicazione salva un backup,
impedisce di perdere segrete, sostituisce solo lo schema `context` e attiva `vectors.<sha256>.bin`.
Il ricaricamento locale riavvia la sessione classica e sospende i tornei con corpus incompatibile.
Il torneo conserva finestre, punteggio e regolamento propri.
Vedi [implementazione e limiti](gioco-zerocontext/IMPLEMENTAZIONE_VETTORI_SEMANTICI.md).

## Versioni del checkout

| Componente | Versione |
| --- | --- |
| Node locale / requisito | 26.13.1 / >=26 |
| npm locale | 12.2.2 |
| TypeScript | 7.0.2 |
| React / React DOM | 19.3.1 |
| Vite / plugin React | 8.3.8 / 6.3.0 |
| react-router | 8.5.1 |
| Fastify / helmet / static | 5.12.8 / 13.2.0 / 10.1.11 |
| Socket.IO / socket.io-client | 4.8.4 |
| better-sqlite3 | 13.2.0 |
| tsx / concurrently | 4.23.15 / 10.0.7 |

Le versioni descrivono il checkout, senza affermare che siano le più recenti disponibili.
Gli aggiornamenti e le verifiche precedenti sono in [AGGIORNAMENTO_DIPENDENZE.md](AGGIORNAMENTO_DIPENDENZE.md).

## Verifiche e lavoro residuo

La CI Windows definisce installazione pulita, typecheck, controlli dei confini, build, test Node/Python,
smoke di sorgente e bundle e audit runtime. La configurazione della CI non prova che una specifica
esecuzione su GitHub sia riuscita. I comandi di sviluppo, verifica e backup sono nel [README](README.md).

Restano da verificare sul campo connessioni alle piattaforme, sincronizzazione video/chat e comportamento
in OBS. Account remoti, sito marketing e billing appartengono al backlog di prodotto. Condizioni e
attribuzioni dei contenuti rimangono nei documenti delle fonti; le revisioni editoriali parziali non
certificano l'intera banca.

#!/usr/bin/env node
// Builds a self-contained Zerocade for Windows x64: the target PC needs no Node.js,
// npm or build tools. Usage: npm run package:win
//
// release/zerocade-win-x64/
//   Avvia Zerocade.cmd              double-click to start; opens the dashboard
//   LEGGIMI.txt
//   runtime/node.exe                the Node.js runtime this script runs on (or its download)
//   app/server.mjs                  the server, bundled with esbuild
//   app/wordgen-worker.mjs          ZeroWords' level generator, run in a worker thread
//   app/public/{dashboard,overlay}  the built pages
//   app/giochi.sqlite3              the games' database (database/giochi.sqlite3), one schema per game:
//                                   Bivio's dilemmas, word lists, ZeroAssociazioni's verified pools, ZeroWords'
//                                   lexicon and the other games' content
//   app/ZeroQuizz.sqlite3           ZeroQuizz's questions and answers (database/ZeroQuizz.sqlite3), a database
//                                   of their own
//   app/zerocontext/vectors.bin     ZeroContext's vectors (gioco-zerocontext/data)
//   app/CREDITI-parole.txt          the credits of ZeroWords' word list
//   app/node_modules/better-sqlite3 the prebuilt win32-x64 SQLite binding
//   data/                           databases, created on first start (Bivio votes and Incastro
//                                   progress live here)
//
// data/ is never deleted by a rebuild, and is left out of the zip.

import { execFileSync, execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'release')
const name = 'zerocade-win-x64'
const out = join(releaseDir, name)
const app = join(out, 'app')
const runtime = join(out, 'runtime')

const step = (msg) => console.log(`\n→ ${msg}`)

step('Building dashboard and overlay')
execSync('npm run build', { cwd: root, stdio: 'inherit' })

step('Bundling the server')
// While Zerocade runs from this folder Windows refuses to delete its SQLite binding (but
// happily renames folders around it). Delete that file first, so a running copy stops the
// rebuild before anything else is removed.
try {
  rmSync(join(app, 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node'), { force: true })
} catch {
  console.error(`✗ Zerocade is running from ${out}: close it and run again.`)
  process.exit(1)
}
for (const dir of [app, `${app}.old`, runtime]) rmSync(dir, { recursive: true, force: true })
mkdirSync(app, { recursive: true })
await build({
  // The level generator runs in its own thread (wordgen/levels.ts looks for wordgen-worker.mjs).
  entryPoints: {
    server: join(root, 'apps', 'server', 'src', 'index.ts'),
    'wordgen-worker': join(root, 'apps', 'server', 'src', 'wordgen', 'worker.ts'),
  },
  outdir: app,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  // The native binding cannot be bundled: it is copied into app/node_modules below.
  external: ['better-sqlite3'],
  // Bundled CommonJS dependencies still call require().
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'warning',
})

step('Copying pages, content and the SQLite binding')
cpSync(join(root, 'apps', 'dashboard', 'dist'), join(app, 'public', 'dashboard'), { recursive: true })
cpSync(join(root, 'apps', 'overlay', 'dist'), join(app, 'public', 'overlay'), { recursive: true })
// The games' database: every game's content, one schema each (apps/server/src/schema-db.ts). It must
// be verified and have them all: the package has no other copy of the pools, words and banks.
const giochi = join(root, 'database', 'giochi.sqlite3')
const SCHEMAS = ['dubbi', 'wordle', 'context', 'associazioni', 'parole', 'contenuti']
{
  const Database = createRequire(join(root, 'apps', 'server', 'package.json'))('better-sqlite3')
  const db = new Database(giochi, { readonly: true, fileMustExist: true })
  const verified = db.prepare("SELECT value FROM zerodb_meta WHERE name = 'verified'").pluck().get()
  const present = new Set(db.prepare('SELECT DISTINCT schema FROM zerodb_objects').pluck().all())
  db.close()
  const missing = SCHEMAS.filter((s) => !present.has(s))
  if (verified !== '1' || missing.length) {
    console.error(`✗ database/giochi.sqlite3 ${verified !== '1' ? 'is not verified' : `has no schema ${missing.join(', ')}`}: run python database/giochi.py aggiorna`)
    process.exit(1)
  }
}
copyFileSync(giochi, join(app, 'giochi.sqlite3'))
// ZeroQuizz: its questions are a database of their own (apps/server/src/quizzland.ts); without it the game has none.
const zeroQuizz = join(root, 'database', 'ZeroQuizz.sqlite3')
{
  const Database = createRequire(join(root, 'apps', 'server', 'package.json'))('better-sqlite3')
  const db = new Database(zeroQuizz, { readonly: true, fileMustExist: true })
  const questions = db.prepare('SELECT count(*) FROM domande WHERE attiva = 1').pluck().get()
  db.close()
  if (!questions) {
    console.error('✗ database/ZeroQuizz.sqlite3 has no active questions')
    process.exit(1)
  }
}
copyFileSync(zeroQuizz, join(app, 'ZeroQuizz.sqlite3'))
// ZeroContext: the vectors of the playable words, in their order (apps/server/src/context.ts).
mkdirSync(join(app, 'zerocontext'), { recursive: true })
copyFileSync(join(root, 'gioco-zerocontext', 'data', 'vectors.bin'), join(app, 'zerocontext', 'vectors.bin'))
// ZeroWords: the attribution the word list asks for (the words are in the schema parole).
copyFileSync(join(root, 'gioco-parole', 'lexicon', 'it', 'SOURCE'), join(app, 'CREDITI-parole.txt'))

const sqliteDir = dirname(createRequire(join(root, 'apps', 'server', 'package.json')).resolve('better-sqlite3/package.json'))
const sqliteOut = join(app, 'node_modules', 'better-sqlite3')
cpSync(join(sqliteDir, 'lib'), join(sqliteOut, 'lib'), { recursive: true })
for (const file of ['package.json', 'LICENSE']) copyFileSync(join(sqliteDir, file), join(sqliteOut, file))
mkdirSync(join(sqliteOut, 'prebuilds'), { recursive: true })
copyFileSync(join(sqliteDir, 'prebuilds', 'win32-x64.node'), join(sqliteOut, 'prebuilds', 'win32-x64.node'))

step(`Adding the Node.js ${process.version} runtime`)
mkdirSync(runtime, { recursive: true })
const download = async (url, dest) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}
if (process.platform === 'win32' && process.arch === 'x64') copyFileSync(process.execPath, join(runtime, 'node.exe'))
else {
  // The runtime ships inside the package: it must be the file Node.js published, so its SHA-256 is checked
  // against SHASUMS256.txt of the same release before it is kept.
  const base = `https://nodejs.org/dist/${process.version}`
  const target = join(runtime, 'node.exe')
  await download(`${base}/win-x64/node.exe`, target)
  const sums = await (await fetch(`${base}/SHASUMS256.txt`)).text()
  const expected = /^([0-9a-f]{64})\s+win-x64\/node\.exe$/m.exec(sums)?.[1]
  const actual = createHash('sha256').update(readFileSync(target)).digest('hex')
  if (!expected || expected !== actual) {
    rmSync(target, { force: true })
    throw new Error(`node.exe of ${process.version} does not match SHASUMS256.txt (expected ${expected ?? 'none'}, got ${actual})`)
  }
}
try {
  await download(`https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`, join(runtime, 'LICENSE'))
} catch (err) {
  console.warn(`  ! Node.js LICENSE not downloaded (${err.message}): add it to runtime/ before distributing.`)
}

step('Writing the launcher')
// Batch files want CRLF line endings.
const crlf = (lines) => lines.join('\r\n') + '\r\n'
writeFileSync(
  join(out, 'Avvia Zerocade.cmd'),
  crlf([
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'title Zerocade',
    'set ZEROCADE_OPEN=1',
    'set LOG_LEVEL=warn',
    '"%~dp0runtime\\node.exe" --disable-warning=DEP0040 "%~dp0app\\server.mjs"',
    'if errorlevel 1 pause',
  ]),
)
writeFileSync(
  join(out, 'LEGGIMI.txt'),
  crlf([
    'ZEROCADE per Windows x64',
    '========================',
    '',
    'AVVIO',
    '  Doppio clic su "Avvia Zerocade.cmd": si apre la finestra del server e, nel browser,',
    '  la dashboard su http://localhost:3001/ . Per fermare Zerocade chiudi quella finestra.',
    '  Non serve installare nulla: Node.js è già nella cartella runtime.',
    '  Al primo avvio Windows chiede il permesso di amministratore, una volta sola: serve a',
    '  registrare il nome zerocade.test nel file hosts (vedi OVERLAY).',
    '',
    'OVERLAY (una volta sola, vale per tutti i giochi)',
    '  In OBS o TikTok LIVE Studio aggiungi una sorgente browser con il link',
    '  http://zerocade.test:3001/overlay/ (lo trovi anche nella pagina Setup), 1080 x 1920, o',
    '  1920 x 1080 per una scena orizzontale. Il gioco che scegli nella dashboard compare lì;',
    '  il link non cambia, qualunque browser usi per la dashboard.',
    '  OBS e TikTok LIVE Studio vogliono un link con un dominio, non localhost: zerocade.test',
    '  esiste solo su questo PC, grazie alla riga "127.0.0.1 zerocade.test" che Zerocade',
    '  aggiunge a C:\\Windows\\System32\\drivers\\etc\\hosts. Il dominio .test è riservato:',
    '  nessun sito vero può averlo.',
    '',
    'ZERODUBBI (Preferiresti…?)',
    '  1. Nella dashboard scegli il gioco "ZeroDubbi".',
    '  2. Pagina Sources: collega l\'account TikTok (o il canale Twitch). Il nome resta',
    '     salvato: alla live successiva è già scritto, basta premere Collega.',
    '     Con ZeroFollowerBot aperto sullo stesso PC non serve: in ZeroFollowerBot, scheda',
    '     Account, accendi "Manda chat ed eventi a Zerocade"; in Zerocade, pagina Sources,',
    '     accendi "ZeroFollowerBot" con la stessa porta (8780). Zerocade riceve da lui chat,',
    '     regali, like, follow, condivisioni e ingressi di TikTok e la chat di Twitch, senza un',
    '     secondo collegamento a Euler Stream. In quel caso non collegare anche qui la diretta:',
    '     ogni evento arriverebbe due volte.',
    '  3. Il pubblico vota scrivendo A o B (oppure 1 o 2) in chat: un voto per spettatore a',
    '     domanda. Con "Consenti cambio voto" vale l\'ultimo.',
    '  Con ZeroDubbi scelto, la pagina Giochi mostra la colonna di regia: collegamento TikTok e',
    '  simulatore, Metti in pausa, Riavvia gioco, Invia messaggio, info sulla domanda in',
    '  corso, risposte raccolte (con "Esporta CSV"), trigger e impostazioni: categorie, tempi,',
    '  colori, layout affiancato o in colonna, sfondo a colore, trasparente o con immagine.',
    '  In ogni gioco la colonna di destra parte con "Chat ed eventi": i messaggi della chat',
    '  TikTok e Twitch con regali, like, follow, condivisioni e ingressi (filtri Tutto, Chat,',
    '  Eventi). Con ZeroWords ogni messaggio porta il segno della parola: trovata, extra,',
    '  segreta o già trovata.',
    '  Una domanda scritta male o tradotta male: "Domanda sbagliata" (Info partita). Non',
    '  viene più proposta e finisce in data\\bivio-domande-sbagliate.csv, con i testi in tutte',
    '  le lingue, da correggere in app\\giochi.sqlite3 (tabelle dubbi__). "Annulla" la rimette in gioco.',
    '',
    'ZEROWORDS (ruota di lettere e schema a incastro)',
    '  1. Nella dashboard scegli il gioco "ZeroWords"; TikTok come per ZeroDubbi.',
    '  2. Il pubblico scrive in chat le parole che trova con le lettere della ruota (anche',
    '     senza accenti, fino a 4 parole per commento). Una parola dello schema vale un punto',
    '     per lettera, +3 se usa tutte le lettere (ogni ruota è l\'anagramma di una parola',
    '     vera, sempre nello schema); una parola extra valida vale 1 punto.',
    '     Ogni livello ha anche una parola segreta, fuori dallo schema e di lunghezza sempre',
    '     diversa: l\'overlay ne mostra le caselle vuote, chi la scrive per primo prende 2',
    '     punti per lettera; a fine livello si rivela comunque.',
    '  3. Trigger predefiniti: Rose = rivela una lettera, Donut = rivela una parola,',
    '     condivisione = mescola la ruota. Con "Lettera automatica" acceso (Info partita),',
    '     se nessuno trova parole si rivela una lettera da sola ogni 30 secondi (regolabile).',
    '  Un clic sulla ruota (nell\'anteprima della dashboard o nella pagina dell\'overlay) la',
    '  mescola.',
    '  Livelli senza fine, in italiano: Zerocade li genera durante la partita (il prossimo è',
    '  pronto mentre si gioca quello in corso). Ogni 20 livelli un capitolo nuovo. Il livello',
    '  raggiunto resta salvato: la live successiva riparte da lì. Capitolo e livello sono in',
    '  Info partita; sull\'overlay la griglia prende tutto lo spazio.',
    '  Sfondo (Impostazioni gioco): di base una foto "Image of the Day" della NASA, diversa a',
    '  ogni livello (serve internet; senza rete compare il giardino del capitolo), oppure il',
    '  giardino del capitolo, un colore, trasparente o un\'immagine caricata. A ogni nuovo',
    '  livello si vede solo lo sfondo per qualche secondo ("Secondi sullo sfondo", di base 4),',
    '  poi compare la griglia; intanto la chat e i tempi sono fermi. La griglia sta direttamente',
    '  sull\'immagine e i colori del gioco vengono dall\'immagine stessa: il colore dominante',
    '  per pannelli, caselle e ruota, il più vivace per le lettere trovate (sul giardino resta',
    '  il colore del capitolo).',
    '  Ogni livello ha fino a tre griglie sulla stessa ruota: Agevolata, Standard ed Esperto',
    '  (se una variante non è abbastanza diversa dalla Standard si gioca la Standard). Con',
    '  "Difficoltà automatica" acceso (Info partita) la griglia diventa più facile dopo due',
    '  livelli in cui è scaduto il tempo o le lettere automatiche e i tuoi aiuti hanno',
    '  completato almeno un terzo delle parole, più difficile dopo due livelli che la chat ha',
    '  finito quasi senza lettere automatiche; poi resta ferma almeno tre livelli. Gli aiuti',
    '  dei regali non contano e un livello in cui nessuno gioca non conta. "Andamento chat"',
    '  in Info partita dice come è andato l\'ultimo livello.',
    '  Nella colonna di regia, sotto il nome del gioco, "Parole del round" (solo in dashboard):',
    '  prima le parole da trovare, dalla più corta, ognuna con le lettere che il pubblico vede',
    '  già sullo schema (es. T···A), per aiutare la chat; poi la parola segreta e le parole',
    '  trovate, con chi le ha trovate.',
    '  Dalla colonna di regia: salta, torna indietro, vai al livello N, aiuti, pausa e',
    '  classifica della live. Sotto la classifica',
    '  compare la parola più lunga trovata nella live e chi l\'ha trovata per primo.',
    '  Parole, capitoli e curva di difficoltà: app\\giochi.sqlite3 (tabelle parole__).',
    '  Licenza della lista di parole: app\\CREDITI-parole.txt',
    '',
    'ZEROQUIZZ (quiz d\'intelligenza: indovinelli, logica, trabocchetti)',
    '  1. Nella dashboard scegli il gioco "ZeroQuizz"; TikTok come per ZeroDubbi.',
    '  2. Il pubblico risponde scrivendo A, B, C o D (oppure 1, 2, 3 o 4) in chat. Vale la',
    '     prima risposta di ogni spettatore. Allo scadere del tempo compare la risposta giusta',
    '     con la spiegazione, le percentuali della chat e i tre più veloci; poi la classifica.',
    '  3. Una risposta giusta vale 100 punti, fino a 150 con il bonus velocità (regolabili).',
    '     La classifica cambia solo quando si rivela la risposta, così non la suggerisce; la',
    '     fiamma accanto al nome conta le risposte giuste di fila.',
    '  4. Trigger predefinito: Rose = 50:50, toglie due risposte sbagliate (una volta per',
    '     domanda), con il nome di chi l\'ha regalata.',
    '  Nella colonna di regia, "Domanda in corso" mostra solo a te la risposta giusta prima del',
    '  tempo, i comandi Salta / Avanti, Rivela, +10 s, 50:50 e "Domanda sbagliata" (la domanda',
    '  non torna più finché non premi Annulla). "Risposte raccolte" elenca le domande più',
    '  sbagliate dalla chat; "Esporta CSV" scarica per ogni domanda risposte, percentuale di',
    '  giuste, quante volte è stata scelta ogni risposta e se è segnata come sbagliata.',
    '  Impostazioni: categorie, difficoltà, tempi, punti, risposte mescolate, percentuali',
    '  durante la domanda, suoni, lettura ad alta voce; sfondo a cielo animato, colore,',
    '  trasparente o immagine caricata.',
    '',
    'DATI',
    '  data\\zerocade.db   la stanza dell\'overlay (tabella meta), sessioni, eventi, tutti i',
    '                     voti di ZeroDubbi (bivio_votes), le domande segnate come sbagliate',
    '                     (bivio_flags), il livello di ZeroWords (incastro_progress) e',
    '                     ogni livello giocato con risposte e aiuti (zerowords_plays,',
    '                     zerowords_answers; nessun nome): in Info partita "Partite" e',
    '                     "Risposte" li scaricano in CSV, per tarare la difficoltà;',
    '                     le risposte di ZeroQuizz (quizzland_answers) e le sue domande',
    '                     segnate come sbagliate (quizzland_flags)',
    '  data\\bivio-domande-sbagliate.csv   l\'elenco delle domande segnate come sbagliate',
    '  Per spostare Zerocade su un altro PC copia tutta la cartella, data compresa.',
    '',
    'IL DATABASE DEI GIOCHI',
    '  app\\giochi.sqlite3, un database SQLite con uno "schema" per gioco: il prefisso delle',
    '  tabelle. dubbi__ (ZeroDubbi), wordle__ (ZeroWordle), context__ (ZeroContext),',
    '  associazioni__ (ZeroAssociazioni e ZeroReazioniACatena), parole__ (ZeroWords),',
    '  contenuti__ (gli altri giochi). I vettori di ZeroContext sono a parte, in',
    '  app\\zerocontext\\vectors.bin. Le domande di ZeroQuizz hanno un database a sé,',
    '  app\\ZeroQuizz.sqlite3.',
    '',
    'DOMANDE DI BIVIO',
    '  app\\giochi.sqlite3, tabella dubbi__dilemmi (id, categoria, difficolta, esplicita,',
    '  ordine) e tabella dubbi__testi (una riga per dilemma e lingua: dilemma, lingua, a, b).',
    '  Si modifica con un programma per SQLite, per esempio DB Browser for SQLite (gratuito).',
    '  Dopo una modifica riavvia Zerocade. Non riusare l\'id di una domanda cancellata:',
    '  i voti salvati sono legati all\'id.',
    '',
    'DOMANDE DI ZEROQUIZZ',
    '  app\\ZeroQuizz.sqlite3, tabella domande (n, id, categoria, difficolta 1-3, testo,',
    '  spiegazione, giusta, ordine_fisso, attiva, ordine), tabella opzioni (domanda,',
    '  posizione 0-3 = A-D, testo) e tabella categorie (n, nome). Le risposte di una',
    '  domanda hanno in "domanda" il suo numero n; la categoria è il numero n di categorie;',
    '  giusta è la posizione della risposta giusta (0-3 = A-D) e deve essere una delle risposte',
    '  della domanda. attiva = 0 tiene fuori una domanda; ordine_fisso = 1 non mescola le',
    '  risposte. Si modifica con DB Browser for SQLite (con "Write Changes"), poi riavvia',
    '  Zerocade. Non riusare l\'id di una domanda cancellata e non spostare le risposte di una',
    '  domanda già giocata: le risposte salvate sono legate a id e posizione.',
    '',
    'PROBLEMI',
    '  "La porta 3001 è già in uso": Zerocade è già aperto, usa la finestra che c\'è.',
    '  Il link dell\'overlay non si apre: manca la riga nel file hosts (la pagina Setup lo',
    '  segnala). Riavvia Zerocade e accetta la richiesta di Windows, oppure avvia il Blocco',
    '  note come amministratore, apri C:\\Windows\\System32\\drivers\\etc\\hosts e aggiungi in',
    '  fondo la riga: 127.0.0.1 zerocade.test',
    '  Il server ascolta solo su questo PC (127.0.0.1): nessuna porta aperta verso la rete.',
  ]),
)

if (process.platform === 'win32') {
  step('Zipping')
  const zip = join(releaseDir, `${name}.zip`)
  rmSync(zip, { force: true })
  // Windows' own bsdtar writes zip files; Git's GNU tar, often first on PATH, does not.
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  execFileSync(tar, ['-a', '-c', '-f', zip, '--exclude', `${name}/data`, name], { cwd: releaseDir, stdio: 'inherit' })
  console.log(`  ${zip} (${Math.round(statSync(zip).size / 1e6)} MB)`)
}

console.log(`\n✓ Ready: ${out}`)
if (existsSync(join(out, 'data'))) console.log('  (data/ from a previous run was kept)')

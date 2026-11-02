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
//   app/content.seed.json
//   app/domande.db                  Bivio's questions (SQLite, gioco-dilemmi/data/domande.db)
//   app/incastro/                   what ZeroWords' generator reads: chapters.json, curve.json,
//                                   lexicon/words.tsv and blocklist.txt, with the word list's credits
//   app/node_modules/better-sqlite3 the prebuilt win32-x64 SQLite binding
//   data/                           databases, created on first start (Bivio votes and Incastro
//                                   progress live here)
//
// data/ is never deleted by a rebuild, and is left out of the zip.

import { execFileSync, execSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
copyFileSync(join(root, 'apps', 'server', 'src', 'content.seed.json'), join(app, 'content.seed.json'))
copyFileSync(join(root, 'gioco-dilemmi', 'data', 'domande.db'), join(app, 'domande.db'))
// ZeroWords: what the generator reads to make levels on the fly (wordgen/files.ts looks for
// app/incastro), and the attribution the word list asks for.
const words = join(app, 'incastro', 'lexicon')
mkdirSync(words, { recursive: true })
copyFileSync(join(root, 'gioco-parole', 'data', 'chapters.json'), join(app, 'incastro', 'chapters.json'))
copyFileSync(join(root, 'gioco-parole', 'tools', 'curve.json'), join(app, 'incastro', 'curve.json'))
copyFileSync(join(root, 'gioco-parole', 'lexicon', 'it', 'words.tsv'), join(words, 'words.tsv'))
copyFileSync(join(root, 'gioco-parole', 'lexicon', 'blocklist_it.txt'), join(words, 'blocklist.txt'))
copyFileSync(join(root, 'gioco-parole', 'lexicon', 'it', 'SOURCE'), join(app, 'incastro', 'CREDITI.txt'))

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
else await download(`https://nodejs.org/dist/${process.version}/win-x64/node.exe`, join(runtime, 'node.exe'))
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
    'BIVIO (Preferiresti…?)',
    '  1. Nella dashboard scegli il gioco "Bivio".',
    '  2. Pagina Sources: collega l\'account TikTok (o il canale Twitch).',
    '  3. Il pubblico vota scrivendo A o B (oppure 1 o 2) in chat: un voto per spettatore a',
    '     domanda. Con "Consenti cambio voto" vale l\'ultimo.',
    '  Con Bivio scelto, la pagina Giochi mostra la colonna di regia: collegamento TikTok e',
    '  simulatore, Metti in pausa, Riavvia gioco, Invia messaggio, info sulla domanda in',
    '  corso, risposte raccolte (con "Esporta CSV"), trigger e impostazioni: categorie, tempi,',
    '  colori, layout affiancato o in colonna, sfondo a colore, trasparente o con immagine.',
    '  Una domanda scritta male o tradotta male: "Domanda sbagliata" (Info partita). Non',
    '  viene più proposta e finisce in data\\bivio-domande-sbagliate.csv, con i testi in tutte',
    '  le lingue, da correggere in app\\domande.db. "Annulla" la rimette in gioco.',
    '',
    'ZEROWORDS (ruota di lettere e schema a incastro)',
    '  1. Nella dashboard scegli il gioco "ZeroWords"; TikTok come per Bivio.',
    '  2. Il pubblico scrive in chat le parole che trova con le lettere della ruota (anche',
    '     senza accenti, fino a 4 parole per commento). Una parola dello schema vale un punto',
    '     per lettera, +3 se usa tutte le lettere; una parola extra valida vale 1 punto.',
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
    '  giardino del capitolo, un colore, trasparente o un\'immagine caricata.',
    '  Ogni livello ha tre griglie sulla stessa ruota: Agevolata, Standard ed Esperto. Con',
    '  "Difficoltà automatica" acceso (Info partita) il livello successivo usa quella più',
    '  facile se è scaduto il tempo o gli aiuti hanno mostrato almeno un terzo delle parole,',
    '  quella più difficile se la chat ha trovato tutto senza aiuti.',
    '  Dalla colonna di regia: salta, torna indietro, vai al livello N, aiuti, pausa,',
    '  soluzione del livello (solo in dashboard) e classifica della live. Sotto la classifica',
    '  compare la parola più lunga trovata nella live e chi l\'ha trovata per primo.',
    '  Parole, capitoli e curva di difficoltà: app\\incastro. Licenza della lista di parole:',
    '  app\\incastro\\CREDITI.txt',
    '',
    'DATI',
    '  data\\zerocade.db   la stanza dell\'overlay (tabella meta), sessioni, eventi, tutti i',
    '                     voti di Bivio (bivio_votes), le domande segnate come sbagliate',
    '                     (bivio_flags) e il livello di ZeroWords (incastro_progress)',
    '  data\\bivio-domande-sbagliate.csv   l\'elenco delle domande segnate come sbagliate',
    '  data\\content.db    contenuti degli altri giochi',
    '  Per spostare Zerocade su un altro PC copia tutta la cartella, data compresa.',
    '',
    'DOMANDE DI BIVIO',
    '  app\\domande.db, un database SQLite: tabella dilemmi (id, categoria, difficolta,',
    '  esplicita, ordine) e tabella testi (una riga per dilemma e lingua: dilemma, lingua, a, b).',
    '  Si modifica con un programma per SQLite, per esempio DB Browser for SQLite (gratuito).',
    '  Dopo una modifica riavvia Zerocade. Non riusare l\'id di una domanda cancellata:',
    '  i voti salvati sono legati all\'id.',
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

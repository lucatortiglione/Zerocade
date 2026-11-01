#!/usr/bin/env node
// Builds a self-contained Zerocade for Windows x64: the target PC needs no Node.js,
// npm or build tools. Usage: npm run package:win
//
// release/zerocade-win-x64/
//   Avvia Zerocade.cmd              double-click to start; opens the dashboard
//   LEGGIMI.txt
//   runtime/node.exe                the Node.js runtime this script runs on (or its download)
//   app/server.mjs                  the server, bundled with esbuild
//   app/public/{dashboard,overlay}  the built pages
//   app/content.seed.json, app/domande_master.csv
//   app/node_modules/better-sqlite3 the prebuilt win32-x64 SQLite binding
//   data/                           databases, created on first start (Bivio votes live here)
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
  entryPoints: [join(root, 'apps', 'server', 'src', 'index.ts')],
  outfile: join(app, 'server.mjs'),
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
copyFileSync(join(root, 'gioco-dilemmi', 'data', 'domande_master.csv'), join(app, 'domande_master.csv'))

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
    '',
    'BIVIO (Preferiresti…?)',
    '  1. Nella dashboard scegli il gioco "Bivio".',
    '  2. Pagina Setup: copia il link dell\'overlay e aggiungilo come sorgente browser in',
    '     TikTok LIVE Studio o OBS, 1080 x 1920. Il link vale per il browser in cui apri la',
    '     dashboard: usa sempre lo stesso.',
    '  3. Pagina Sources: collega l\'account TikTok (o il canale Twitch).',
    '  4. Il pubblico vota scrivendo A o B (oppure 1 o 2) in chat: un voto per spettatore a',
    '     domanda. Con "Consenti cambio voto" vale l\'ultimo.',
    '  Con Bivio scelto, la pagina Giochi mostra la colonna di regia: collegamento TikTok e',
    '  simulatore, Metti in pausa, Riavvia gioco, Invia messaggio, info sulla domanda in',
    '  corso, risposte raccolte (con "Esporta CSV"), trigger e impostazioni: categorie, tempi,',
    '  colori, layout affiancato o in colonna, sfondo a colore, trasparente o con immagine.',
    '',
    'DATI',
    '  data\\zerocade.db   sessioni, eventi e tutti i voti di Bivio (tabella bivio_votes)',
    '  data\\content.db    contenuti degli altri giochi',
    '  Per spostare Zerocade su un altro PC copia tutta la cartella, data compresa.',
    '',
    'DOMANDE',
    '  app\\domande_master.csv, stesso formato di gioco-dilemmi/data/domande_master.csv.',
    '  Dopo una modifica riavvia Zerocade. Non riusare l\'id di una domanda cancellata:',
    '  i voti salvati sono legati all\'id.',
    '',
    'PROBLEMI',
    '  "La porta 3001 è già in uso": Zerocade è già aperto, usa la finestra che c\'è.',
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

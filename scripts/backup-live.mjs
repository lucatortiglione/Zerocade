#!/usr/bin/env node
// Consistent SQLite snapshot, including committed WAL contents. Explicit paths
// only: never opens a live database merely by importing this script elsewhere.
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, link, mkdir, open, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

const [sourceArg, destinationArg] = process.argv.slice(2)
if (!sourceArg || !destinationArg) throw new Error('Uso: node scripts/backup-live.mjs <database-sorgente> <nuovo-backup.db>')
const source = resolve(sourceArg)
const destination = resolve(destinationArg)
if (source === destination) throw new Error('Il backup deve avere un percorso diverso dalla sorgente.')
try { await access(destination, constants.F_OK); throw new Error('La destinazione esiste già.') }
catch (error) { if (error.code !== 'ENOENT') throw error }
await mkdir(dirname(destination), { recursive: true })
const temporary = `${destination}.${randomUUID()}.incomplete`
const db = new Database(source, { readonly: true, fileMustExist: true })
try {
  const started = performance.now()
  await db.backup(temporary, { progress: () => {
    if (performance.now() - started > 30_000) throw new Error('Backup oltre 30 secondi: riprovare a server fermo.')
  } })
  const check = new Database(temporary, { readonly: true, fileMustExist: true })
  try {
    if (check.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Il backup non supera integrity_check.')
  } finally { check.close() }
  const file = await open(temporary, 'r+')
  try { await file.sync() } finally { await file.close() }
  // Same-directory hard link publishes atomically and refuses an existing path.
  await link(temporary, destination)
  console.log('Backup SQLite confermato e verificato. I file multimediali vanno copiati separatamente a server fermo.')
} finally { db.close(); await rm(temporary, { force: true }) }

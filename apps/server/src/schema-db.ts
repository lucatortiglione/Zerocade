import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

// Databases that hold several old ones, one "schema" each: SQLite has no schemas inside a file, so a schema is
// the `<schema>__` prefix of its tables (database/schemadb.py, gioco-zeroassociations/unified_db.py). A source is
// written `file#schema`; opened here it looks like the old database, through temporary views with the tables'
// old names (read only). Only a file its tools have verified is used.

const here = dirname(fileURLToPath(import.meta.url))

// The games' database (database/giochi.sqlite3): next to the server in the Windows package, or in the repository.
export const giochiDb = [process.env.ZEROCADE_GIOCHI_FILE, join(here, 'giochi.sqlite3'), join(here, '..', '..', '..', 'database', 'giochi.sqlite3')].find(
  (p): p is string => p !== undefined && existsSync(p),
)

export function openSchema(file: string, schema: string): Database.Database {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  db.pragma('busy_timeout = 5000')
  try {
    const verified = db.prepare("SELECT value FROM zerodb_meta WHERE name = 'verified'").pluck().get()
    if (verified !== '1') throw new Error(`${file} not verified`)
    // Views too: a schema can keep a table's old name as a view over smaller tables (associazioni.associations).
    const tables = db.prepare("SELECT name FROM zerodb_objects WHERE schema = ? AND type IN ('table', 'view')").pluck().all(schema) as string[]
    if (!tables.length) throw new Error(`${file} has no schema ${schema}`)
    for (const t of tables) db.exec(`CREATE TEMP VIEW "${t}" AS SELECT * FROM "${schema}__${t}"`)
    return db
  } catch (err) {
    db.close()
    throw err
  }
}

// A plain database file, or `file#schema`.
export const openSource = (source: string): Database.Database => {
  if (!source.includes('#')) return new Database(source, { readonly: true, fileMustExist: true })
  const [file, schema] = source.split('#')
  return openSchema(file, schema)
}

// Whether the source can be opened: the file is there and, for a schema, has it.
export function sourceReady(source: string): boolean {
  const [file, schema] = source.split('#')
  if (!existsSync(file)) return false
  if (!schema) return true
  try {
    openSchema(file, schema).close()
    return true
  } catch {
    return false
  }
}

// Whether the database has a table of that name (a temporary view stands for it in a schema).
export const hasTable = (db: Database.Database, name: string): boolean =>
  db
    .prepare(
      `SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?
       UNION ALL SELECT 1 FROM sqlite_temp_schema WHERE type = 'view' AND name = ?`,
    )
    .get(name, name) !== undefined

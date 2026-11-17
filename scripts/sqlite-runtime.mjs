import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'

// Load the default binding before inspecting the cache: better-sqlite3 13.2
// prefers a local Debug/Release build over the shipped prebuild.
export function sqliteRuntime(requireFrom, target = `${process.platform}-${process.arch}`) {
  const directory = dirname(requireFrom.resolve('better-sqlite3/package.json'))
  if (target !== `${process.platform}-${process.arch}`) {
    const binary = join(directory, 'prebuilds', `${target}.node`)
    if (!existsSync(binary)) throw new Error(`SQLite prebuild missing for ${target}`)
    return { directory, binary, version: null }
  }
  const Database = requireFrom('better-sqlite3')
  const db = new Database(':memory:')
  let version
  try { version = db.prepare('select sqlite_version() as version').get().version }
  finally { db.close() }
  const binaries = Object.keys(requireFrom.cache).filter((file) => {
    const path = relative(directory, file)
    return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && file.endsWith('.node')
  })
  if (binaries.length !== 1) throw new Error(`Expected one loaded SQLite binding, found ${binaries.length}`)
  return { directory, binary: binaries[0], version }
}

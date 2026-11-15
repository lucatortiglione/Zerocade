#!/usr/bin/env node
// Static import boundaries and accidental credentials in production source.
// Reports locations only; never prints a suspected secret.
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = []
async function collect(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'data'].includes(item.name)) continue
    const target = join(path, item.name)
    if (item.isDirectory()) await collect(target)
    else if (/\.(tsx?|m?js)$/.test(item.name)) files.push(target)
  }
}
for (const area of ['apps/server/src', 'apps/dashboard/src', 'apps/overlay/src', 'packages/shared/src', 'packages/browser-runtime/src']) await collect(join(root, area))
const failures = []
for (const path of files) {
  const source = await readFile(path, 'utf8')
  const rel = relative(root, path).replaceAll('\\', '/')
  const area = rel.split('/').slice(0, 2).join('/')
  // A conservative source guard, including type-only and literal dynamic imports.
  // It complements the real TypeScript/build checks; it is not a module linker.
  const imports = /\b(?:import|export)\s+(?:type\s+)?(?:[^;'"`]*?\s+from\s*)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(imports)) {
      const name = match[1] ?? match[2]
      const destination = name.startsWith('.') ? relative(root, resolve(dirname(path), name)).replaceAll('\\', '/') : name
      const crossesApp = destination.startsWith('apps/') && destination.split('/').slice(0, 2).join('/') !== area
      if (crossesApp || /^@zerocade\/(server|dashboard|overlay)(\/|$)/.test(name)) failures.push(`${rel}: import violates app boundary`)
      if (area === 'packages/shared' && name === '@zerocade/browser-runtime') failures.push(`${rel}: shared imports browser infrastructure`)
  }
  const secrets = /(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g
  for (const match of source.matchAll(secrets)) {
    const line = source.slice(0, match.index).split('\n').length
    failures.push(`${rel}:${line}: possible embedded credential`)
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1 }
else console.log(`Infrastructure scan: ${files.length} production source files, app boundaries and known credential patterns passed. History and arbitrary tokens require separate review.`)

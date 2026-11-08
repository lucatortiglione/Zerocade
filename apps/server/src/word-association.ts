import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isWordAssociationPuzzle, type WordAssociationPuzzle } from '@zerocade/shared'

const here = dirname(fileURLToPath(import.meta.url))
export const wordAssociationContentPath = process.env.ZEROCADE_ASSOCIATIONS_CONTENT
  ?? (existsSync(join(here, 'word-association.content.json'))
    ? join(here, 'word-association.content.json')
    : join(here, '..', '..', '..', 'gioco-zeroassociations', 'approved', 'content.json'))

export function loadWordAssociationContent(path = wordAssociationContentPath): WordAssociationPuzzle[] {
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8').replace(/^\uFEFF/, ''))
    if (data?.schema_version !== 'word-association-content-3.5.5'
      || data.taxonomy_version !== '3.5.5' || data.validation_result !== 'PASS_RELEASE_CHECKS'
      || !Array.isArray(data.items) || data.items.length < 10001
      || !data.items.every(isWordAssociationPuzzle)) throw new Error('Formato o gate di rilascio non valido')
    if (new Set(data.items.map((item: WordAssociationPuzzle) => item.ref)).size !== data.items.length
      || new Set(data.items.map((item: WordAssociationPuzzle) => item.prompt)).size !== data.items.length)
      throw new Error('Riferimenti o bersagli duplicati')
    return data.items
  } catch (error) {
    console.warn(`Word Association: contenuti ignorati (${path}): ${String(error)}`)
    return []
  }
}

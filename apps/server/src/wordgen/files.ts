import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Where ZeroWords' files are. The Windows package ships them next to the bundled server, in
// app/incastro (chapters.json, curve.json, lexicon/words.tsv, lexicon/blocklist.txt); in the
// repository they live in gioco-parole/. ZEROCADE_INCASTRO_DATA points to a folder laid out
// like app/incastro.
const here = dirname(fileURLToPath(import.meta.url))
const shipped = [process.env.ZEROCADE_INCASTRO_DATA, join(here, 'incastro')].find(
  (p): p is string => p !== undefined && existsSync(join(p, 'curve.json')),
)
const repo = join(here, '..', '..', '..', '..', 'gioco-parole')

export const files = shipped
  ? {
      chapters: join(shipped, 'chapters.json'),
      curve: join(shipped, 'curve.json'),
      words: join(shipped, 'lexicon', 'words.tsv'),
      blocklist: join(shipped, 'lexicon', 'blocklist.txt'),
    }
  : {
      chapters: join(repo, 'data', 'chapters.json'),
      curve: join(repo, 'tools', 'curve.json'),
      words: join(repo, 'lexicon', 'it', 'words.tsv'),
      blocklist: join(repo, 'lexicon', 'blocklist_it.txt'),
    }

// Level packs written by the CLI, for tools/validate_levels.py.
export const packsDir = join(repo, 'data', 'levels', 'it')

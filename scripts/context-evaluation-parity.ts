// Confronta le prime 20 posizioni calcolate dal valutatore Python (gioco-zerocontext/script/evaluate_context_ranking.py parita)
// con quelle del server (rankAgainst sullo stesso corpus). Uso:
//   node --import tsx scripts/context-evaluation-parity.ts gioco-zerocontext/reports/parita_original.json
// Uscita 1 se una differenza non è un pari merito (somiglianze diverse oltre 1e-6).
import { readFileSync } from 'node:fs'
import { rankAgainst } from '@zerocade/shared/contextRanking'
import { isContextProfile } from '@zerocade/shared'
import { serverCorpus } from '../apps/server/src/context-tournament-ranking.ts'

const file = process.argv[2]
if (!file) { console.error('Uso: context-evaluation-parity.ts <parita_PROFILO.json>'); process.exit(2) }
const parity = JSON.parse(readFileSync(file, 'utf8')) as { profile: string; secrets: { secret: string; top: string[] }[] }
if (!isContextProfile(parity.profile)) { console.error(`Profilo «${parity.profile}» non pubblicato nel gioco: nessun server con cui confrontarsi.`); process.exit(2) }
const corpus = serverCorpus(parity.profile)
if (!corpus) { console.error('Corpus del server non leggibile (ZEROCADE_CONTEXT_DATA, ZEROCADE_GIOCHI_FILE).'); process.exit(2) }
const { data } = corpus

let same = 0
let hard = 0
for (const { secret, top } of parity.secrets) {
  const index = data.index.get(secret)
  if (index === undefined) { console.log(`${secret}: assente dal vocabolario del server`); hard++; continue }
  const ranking = rankAgainst(data, index)
  const server = [...ranking.order.slice(1, 1 + top.length)].map((i) => data.words[i])
  if (server.join('|') === top.join('|')) { same++; continue }
  const at = server.findIndex((w, i) => w !== top[i])
  // Una differenza è ammessa solo tra parole con la stessa somiglianza (pari merito sommato in ordine diverso).
  const sims = ranking.similarities
  const a = data.index.get(server[at])!
  const b = data.index.get(top[at])
  const gap = sims && b !== undefined ? Math.abs(sims[a] - sims[b]) : Infinity
  console.log(`${secret}: posizione ${at + 2}: server «${server[at]}», valutatore «${top[at]}» (differenza di somiglianza ${gap})`)
  if (gap > 1e-6) hard++; else same++
}
console.log(`parità ${parity.profile}: ${same}/${parity.secrets.length} segrete identiche${hard ? `, ${hard} DIVERSE` : ''}`)
process.exit(hard ? 1 : 0)

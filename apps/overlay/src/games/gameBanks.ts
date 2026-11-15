import { apiFetch } from '@zerocade/browser-runtime'
import { parseWordleData, type WordleData } from './wordleLogic'

// Only the transport/shape boundary is shared. Each game owns its request,
// retry budget and round; a bank never sends points or chooses a secret.
export const GAME_BANK_LIMITS = { bytes: 2 * 1024 * 1024, timeoutMs: 10_000, attempts: 3 } as const
export type ChainBankKind = 'walks' | 'keys'

export async function loadWordleBank(length: number, signal: AbortSignal): Promise<WordleData> {
  if (![5, 6, 7, 8].includes(length)) throw new RangeError('Lunghezza di ZeroWordle non valida')
  const read = async (kind: 'solutions' | 'words') => {
    const response = await apiFetch(`/api/wordle/${kind}-${length}.txt`, { signal }, GAME_BANK_LIMITS.timeoutMs, GAME_BANK_LIMITS.bytes)
    if (!response.ok) throw new Error(`ZeroWordle: ${kind}, HTTP ${response.status}`)
    return response.text()
  }
  const [solutions, words] = await Promise.all([read('solutions'), read('words')])
  signal.throwIfAborted()
  const parsed = parseWordleData(solutions, words)
  if (!parsed.solutions.length || parsed.words.size > 200_000 || [...parsed.words].some((word) => word.length !== length || !/^[a-z]+$/.test(word)))
    throw new Error('Banca di ZeroWordle non valida')
  return parsed
}

export function parseChainBank(input: unknown): string[][] {
  if (!Array.isArray(input) || input.length > 20_000) throw new Error('Banca delle catene non valida')
  const bank: string[][] = []
  for (const row of input) {
    if (!Array.isArray(row) || row.length < 3 || row.length > 9) throw new Error('Catena non valida')
    const words: string[] = []
    for (const word of row) {
      if (typeof word !== 'string' || !/^[a-zàèéìòù]{3,14}$/.test(word)) throw new Error('Parola della catena non valida')
      words.push(word)
    }
    if (new Set(words).size !== words.length) throw new Error('Parole duplicate nella catena')
    bank.push(words)
  }
  return bank
}

export async function loadChainBank(kind: ChainBankKind, signal: AbortSignal): Promise<string[][]> {
  const response = await apiFetch(kind === 'keys' ? '/api/chains/keys' : '/api/chains', { signal }, GAME_BANK_LIMITS.timeoutMs, GAME_BANK_LIMITS.bytes)
  if (!response.ok) throw new Error(`Catene: HTTP ${response.status}`)
  return parseChainBank(await response.json())
}

export interface WordAssociationPuzzle {
  ref: string
  prompt: string
  words: string[]
  category_id: string
  cluster_id: string
  pos: 'NOUN' | 'VERB' | 'ADJ'
  pos_hint_mode: 'visible' | 'hidden'
}

export function isWordAssociationPuzzle(value: unknown): value is WordAssociationPuzzle {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const canonical = (word: unknown): word is string =>
    typeof word === 'string' && word.trim() === word && /^[a-zàèéìòù]+$/.test(word) && word.normalize('NFC') === word
  return typeof item.ref === 'string' && item.ref.length === 25 && /^c[a-z0-9]{24}$/.test(item.ref)
    && canonical(item.prompt) && Array.isArray(item.words) && item.words.length === 7
    && item.words.every(canonical) && new Set(item.words).size === 7 && !item.words.includes(item.prompt)
    && typeof item.category_id === 'string' && item.category_id.length === 3 && /^\d{3}$/.test(item.category_id)
    && Number(item.category_id) >= 1 && Number(item.category_id) <= 172
    && typeof item.cluster_id === 'string' && item.cluster_id.length === 1 && /^[A-P]$/.test(item.cluster_id)
    && (item.pos === 'NOUN' || item.pos === 'VERB' || item.pos === 'ADJ')
    && (item.pos_hint_mode === 'visible' || item.pos_hint_mode === 'hidden')
}

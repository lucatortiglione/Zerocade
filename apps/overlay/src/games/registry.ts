import type { GameInstance } from './engine'
import { createGiftDrop } from './giftDrop'
import { createMmaClash } from './mmaClash'
import { createLunarDash } from './lunarDash'
import { createFourPics } from './fourPics'
import { createTrivia } from './quiz'
import { createPicwords } from './picwords'
import { createWordGuess } from './word'
import { createWordSwipe } from './wordSwipe'
import { createWordsOfWonders } from './wordsOfWonders'

const registry: Record<string, () => GameInstance> = {
  'gift-drop': createGiftDrop,
  'mma-clash': createMmaClash,
  'lunar-dash': createLunarDash,
  trivia: createTrivia,
  'word-guess': createWordGuess,
  'word-swipe': createWordSwipe,
  'wow-guru': createWordsOfWonders,
  'four-pics': createFourPics,
  picwords: createPicwords,
}

export const createGame = (gameId: string): GameInstance | null => registry[gameId]?.() ?? null

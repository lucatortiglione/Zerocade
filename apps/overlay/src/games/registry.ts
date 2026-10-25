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
import { createFiveLetters } from './fiveLetters'
import { createFindTheWord } from './findTheWord'
import { createTrueOrFalse } from './trueOrFalse'
import { createTriviaTime } from './triviaTime'
import { createMemoryMaestro } from './memoryMaestro'
import { createWordAssociation } from './wordAssociation'
import { createWordHunt } from './wordHunt'
import { createWordCross } from './wordCross'
import { createGuessLogo } from './guessLogo'
import { createGuessLocation } from './guessLocation'
import { createGuessDrawing } from './guessDrawing'
import { createContext } from './context'
import { createMillionQuiz } from './millionQuiz'

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
  'five-letters': createFiveLetters,
  'find-the-word': createFindTheWord,
  'true-or-false': createTrueOrFalse,
  'trivia-time': createTriviaTime,
  'memory-maestro': createMemoryMaestro,
  'word-association': createWordAssociation,
  'word-hunt': createWordHunt,
  'word-cross': createWordCross,
  'guess-logo': createGuessLogo,
  'guess-location': createGuessLocation,
  'guess-drawing': createGuessDrawing,
  context: createContext,
  'million-quiz': createMillionQuiz,
}

export const createGame = (gameId: string): GameInstance | null => registry[gameId]?.() ?? null


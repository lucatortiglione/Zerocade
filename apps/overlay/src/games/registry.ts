import type { WordAssociationRoundReport } from '@zerocade/shared'
import type { GameInstance } from './engine'
import { setScoreGame } from './scoreReport'
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
import { createChainReaction } from './chainReaction'
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
import { createAssociations } from './associations'
import { createConnectWord } from './connectWord'
import { createCrossWorld } from './crossWorld'
import { createCrostic } from './crostic'
import { createCrucintarsio } from './crucintarsio'
import { createPalora } from './palora'
import { createParolePopolari } from './parolePopolari'
import { createParoleSolitario } from './paroleSolitario'
import { createPerleParole } from './perleParole'
import { createQuizBlitz } from './quizBlitz'
import { createRuzzle } from './ruzzle'
import { createTop7 } from './top7'
import { createWildWords } from './wildWords'
import { createWordMerge } from './wordMerge'

// Word Association's rounds go to the server, for the content's telemetry; the dashboard's
// preview (?preview) plays along but does not report.
const PREVIEW = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('preview')
function reportWordAssociationRound(report: WordAssociationRoundReport) {
  if (PREVIEW) return
  void import('../socket').then(({ socket }) => socket.emit('wordassoc:round', report))
}

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
  'zerowordle': createFiveLetters,
  zeroreazioniacatena: createChainReaction,
  'find-the-word': createFindTheWord,
  'true-or-false': createTrueOrFalse,
  'trivia-time': createTriviaTime,
  'memory-maestro': createMemoryMaestro,
  'word-association': () => createWordAssociation(reportWordAssociationRound),
  'word-hunt': createWordHunt,
  'word-cross': createWordCross,
  'guess-logo': createGuessLogo,
  'guess-location': createGuessLocation,
  'guess-drawing': createGuessDrawing,
  context: createContext,
  'million-quiz': createMillionQuiz,
  associations: createAssociations,
  'connect-word': createConnectWord,
  'cross-world': createCrossWorld,
  crostic: createCrostic,
  crucintarsio: createCrucintarsio,
  palora: createPalora,
  'parole-popolari': createParolePopolari,
  'parole-solitario': createParoleSolitario,
  'perle-parole': createPerleParole,
  'quiz-blitz': createQuizBlitz,
  ruzzle: createRuzzle,
  'top-7': createTop7,
  'wild-words': createWildWords,
  'word-merge': createWordMerge,
}

export const createGame = (gameId: string): GameInstance | null => {
  setScoreGame(gameId)
  return registry[gameId]?.() ?? null
}


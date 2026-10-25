import { createPicQuiz, type PicPuzzle } from './picQuiz'

const PUZZLES: PicPuzzle[] = [
  { keys: ['apple', 'banana', 'grape', 'orange'], emojis: ['🍎', '🍌', '🍇', '🍊'], words: [['FRUIT']] },
  { keys: ['car', 'bus', 'train', 'airplane'], emojis: ['🚗', '🚌', '🚂', '✈️'], words: [['TRANSPORT', 'VEHICLE', 'TRAVEL']] },
  { keys: ['dog', 'cat', 'rabbit', 'hamster'], emojis: ['🐶', '🐱', '🐹', '🐰'], words: [['PET', 'ANIMAL']] },
  { keys: ['soccer', 'basketball', 'tennis', 'football'], emojis: ['⚽', '🏀', '🏈', '🎾'], words: [['SPORT', 'BALL']] },
  { keys: ['pizza', 'burger', 'fries', 'hotdog'], emojis: ['🍕', '🍔', '🍟', '🌭'], words: [['FOOD', 'MEAL']] },
  { keys: ['shirt', 'jeans', 'socks', 'jacket'], emojis: ['👕', '👖', '🧦', '🧥'], words: [['CLOTHES', 'CLOTHING']] },
  { keys: ['guitar', 'drums', 'piano', 'trumpet'], emojis: ['🎸', '🥁', '🎹', '🎺'], words: [['MUSIC', 'BAND']] },
  { keys: ['sun', 'rain', 'snow', 'storm'], emojis: ['☀️', '🌧️', '❄️', '🌪️'], words: [['WEATHER']] },
  { keys: ['rose', 'tulip', 'sunflower', 'daisy'], emojis: ['🌹', '🌷', '🌻', '🌸'], words: [['FLOWER']] },
  { keys: ['fish', 'shark', 'seahorse', 'starfish'], emojis: ['🐟', '🦈', '🐠', '🐡'], words: [['FISH']] },
  { keys: ['icecream', 'cake', 'donut', 'cookie'], emojis: ['🍦', '🍰', '🍩', '🍪'], words: [['DESSERT', 'SWEET']] },
  { keys: ['sneakers', 'heels', 'boots', 'sandals'], emojis: ['👟', '👠', '👞', '🥾'], words: [['SHOE', 'SHOES', 'FOOTWEAR']] },
  { keys: ['book', 'library', 'novel', 'magazine'], emojis: ['📖', '📚', '📕', '📔'], words: [['BOOK', 'BOOKS']] },
  { keys: ['earth', 'mars', 'jupiter', 'planet'], emojis: ['🌍', '🌎', '🌏', '🪐'], words: [['PLANET']] },
  { keys: ['running', 'cycling', 'swimming', 'gym'], emojis: ['🏊', '🚴', '🏃', '🤸'], words: [['EXERCISE', 'SPORT', 'GYM']] },
  { keys: ['bread', 'croissant', 'baguette', 'pretzel'], emojis: ['🍞', '🥐', '🥖', '🥨'], words: [['BREAD']] },
  { keys: ['bee', 'ladybug', 'butterfly', 'ant'], emojis: ['🐝', '🐞', '🦋', '🐜'], words: [['INSECT', 'BUG']] },
  { keys: ['paint', 'theater', 'art', 'music'], emojis: ['🎬', '🎭', '🎨', '🎵'], words: [['ART']] },
  { keys: ['fire', 'sun', 'volcano', 'hot'], emojis: ['🔥', '☀️', '🌋', '♨️'], words: [['HOT', 'HEAT', 'FIRE']] },
  { keys: ['ice', 'snow', 'icecream', 'snowman'], emojis: ['🧊', '❄️', '🍨', '☃️'], words: [['COLD', 'ICE']] },
  { keys: ['water', 'ocean', 'shower', 'rain'], emojis: ['💧', '🌊', '🚿', '☔'], words: [['WATER']] },
]

const makeRounds = () => {
  let i = Math.floor(Math.random() * PUZZLES.length)
  return (): PicPuzzle => {
    const p = PUZZLES[i]
    i = (i + 1) % PUZZLES.length
    return p
  }
}

export const createFourPics = () => createPicQuiz(makeRounds(), '4 PICS 1 WORD', 'What word do they share?')
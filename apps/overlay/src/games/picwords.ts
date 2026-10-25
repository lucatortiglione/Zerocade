import { createPicQuiz, type PicPuzzle } from './picQuiz'

interface Theme {
  key: string
  emoji: string
  words: string[][]
}

const THEMES: Theme[] = [
  { key: 'pizza', emoji: '🍕', words: [['PIZZA'], ['CHEESE'], ['FOOD'], ['ITALY'], ['SLICE'], ['DOUGH']] },
  { key: 'rainbow', emoji: '🌈', words: [['RAINBOW'], ['COLORS'], ['SKY'], ['WEATHER'], ['LIGHT'], ['ARC']] },
  { key: 'elephant', emoji: '🐘', words: [['ELEPHANT'], ['ANIMAL'], ['TRUNK'], ['GREY'], ['JUNGLE'], ['SAFARI']] },
  { key: 'rocket', emoji: '🚀', words: [['ROCKET', 'SPACESHIP'], ['SPACE'], ['SKY'], ['MOON'], ['LAUNCH'], ['MARS']] },
  { key: 'cactus', emoji: '🌵', words: [['CACTUS'], ['PLANT'], ['DESERT'], ['GREEN'], ['SPIKES'], ['SUN']] },
  { key: 'penguin', emoji: '🐧', words: [['PENGUIN'], ['BIRD'], ['COLD'], ['ICE'], ['ANTARCTIC'], ['SNOW']] },
  { key: 'sunflower', emoji: '🌻', words: [['SUNFLOWER'], ['FLOWER'], ['SUN'], ['YELLOW'], ['PLANT'], ['SEED']] },
  { key: 'lightning', emoji: '⚡', words: [['LIGHTNING', 'THUNDER', 'ELECTRIC'], ['STORM'], ['RAIN'], ['SKY'], ['CLOUD'], ['FLASH']] },
  { key: 'house', emoji: '🏠', words: [['HOUSE', 'HOME'], ['BUILDING'], ['ROOF'], ['DOOR'], ['FAMILY'], ['WINDOW']] },
  { key: 'turtle', emoji: '🐢', words: [['TURTLE', 'TORTOISE'], ['SHELL'], ['SLOW'], ['SEA'], ['ANIMAL'], ['REPTILE']] },
  { key: 'lion', emoji: '🦁', words: [['LION'], ['KING'], ['ANIMAL'], ['MANE'], ['JUNGLE'], ['AFRICA']] },
  { key: 'sailboat', emoji: '⛵', words: [['SAILBOAT', 'BOAT', 'SHIP'], ['SEA'], ['SAIL'], ['WIND'], ['WATER'], ['OCEAN']] },
  { key: 'donut', emoji: '🍩', words: [['DONUT', 'DOUGHNUT'], ['SWEET'], ['HOLE'], ['FOOD'], ['SUGAR'], ['GLAZE']] },
  { key: 'bee', emoji: '🐝', words: [['BEE'], ['INSECT'], ['HONEY'], ['WINGS'], ['FLOWER'], ['BUZZ']] },
  { key: 'butterfly', emoji: '🦋', words: [['BUTTERFLY'], ['INSECT'], ['WINGS'], ['FLOWER'], ['COLOR'], ['FLY']] },
  { key: 'mountain', emoji: '🏔️', words: [['MOUNTAIN', 'HILL'], ['SNOW'], ['PEAK'], ['NATURE'], ['HIGH'], ['CLIMB']] },
  { key: 'cake', emoji: '🍰', words: [['CAKE'], ['BIRTHDAY'], ['SWEET'], ['DESSERT'], ['PARTY'], ['CANDLE']] },
  { key: 'ocean', emoji: '🌊', words: [['OCEAN', 'SEA', 'WAVE'], ['WATER'], ['BLUE'], ['BEACH'], ['SAND'], ['SALT']] },
  { key: 'helicopter', emoji: '🚁', words: [['HELICOPTER'], ['FLY'], ['SKY'], ['ROTOR'], ['AIR'], ['PILOT']] },
  { key: 'balloon', emoji: '🎈', words: [['BALLOON'], ['PARTY'], ['AIR'], ['COLOR'], ['FLOAT'], ['BIRTHDAY']] },
  { key: 'guitar', emoji: '🎸', words: [['GUITAR'], ['MUSIC'], ['STRINGS'], ['SONG'], ['ROCK'], ['ACOUSTIC']] },
  { key: 'apple', emoji: '🍎', words: [['APPLE'], ['FRUIT'], ['RED'], ['TREE'], ['JUICE'], ['PIE']] },
  { key: 'dog', emoji: '🐶', words: [['DOG'], ['PET'], ['ANIMAL'], ['PUPPY'], ['BONE'], ['FRIEND']] },
  { key: 'cat', emoji: '🐱', words: [['CAT'], ['PET'], ['ANIMAL'], ['KITTEN'], ['WHISKERS'], ['MEOW']] },
  { key: 'car', emoji: '🚗', words: [['CAR'], ['VEHICLE'], ['DRIVE'], ['WHEELS'], ['ROAD'], ['SPEED']] },
  { key: 'airplane', emoji: '✈️', words: [['AIRPLANE', 'PLANE'], ['FLY'], ['SKY'], ['TRAVEL'], ['AIRPORT'], ['WINGS']] },
  { key: 'book', emoji: '📖', words: [['BOOK'], ['READ'], ['STORY'], ['LIBRARY'], ['WORDS'], ['PAGES']] },
  { key: 'coffee', emoji: '☕', words: [['COFFEE'], ['DRINK'], ['CUP'], ['CAFFEINE'], ['HOT'], ['MORNING']] },
  { key: 'snow', emoji: '❄️', words: [['SNOW'], ['COLD'], ['ICE'], ['WINTER'], ['FROZEN'], ['WHITE']] },
  { key: 'fire', emoji: '🔥', words: [['FIRE'], ['HOT'], ['BURN'], ['FLAME'], ['HEAT'], ['CAMPFIRE']] },
  { key: 'banana', emoji: '🍌', words: [['BANANA'], ['FRUIT'], ['YELLOW'], ['PEEL'], ['MONKEY'], ['TREE']] },
  { key: 'strawberry', emoji: '🍓', words: [['STRAWBERRY'], ['FRUIT'], ['RED'], ['BERRY'], ['SWEET'], ['JAM']] },
  { key: 'burger', emoji: '🍔', words: [['BURGER'], ['FOOD'], ['BEEF'], ['BREAD'], ['CHEESE'], ['GRILL']] },
  { key: 'taco', emoji: '🌮', words: [['TACO'], ['FOOD'], ['MEXICAN'], ['SHELL'], ['SALSA'], ['CHEESE']] },
  { key: 'icecream', emoji: '🍦', words: [['ICECREAM'], ['DESSERT'], ['COLD'], ['SWEET'], ['CONE'], ['VANILLA']] },
  { key: 'cookie', emoji: '🍪', words: [['COOKIE'], ['SWEET'], ['DESSERT'], ['BAKE'], ['CHOCOLATE'], ['CRUMB']] },
  { key: 'cow', emoji: '🐄', words: [['COW'], ['ANIMAL'], ['FARM'], ['MILK'], ['HORN'], ['CATTLE']] },
  { key: 'pig', emoji: '🐷', words: [['PIG'], ['ANIMAL'], ['FARM'], ['PINK'], ['MUD'], ['SNOUT']] },
  { key: 'horse', emoji: '🐴', words: [['HORSE'], ['ANIMAL'], ['RIDE'], ['STABLE'], ['GALLOP'], ['SADDLE']] },
  { key: 'frog', emoji: '🐸', words: [['FROG'], ['ANIMAL'], ['JUMP'], ['POND'], ['GREEN'], ['AMPHIBIAN']] },
  { key: 'snake', emoji: '🐍', words: [['SNAKE'], ['ANIMAL'], ['REPTILE'], ['SLITHER'], ['VENOM'], ['SCALES']] },
  { key: 'monkey', emoji: '🐒', words: [['MONKEY'], ['ANIMAL'], ['BANANA'], ['JUNGLE'], ['TREE'], ['TAIL']] },
  { key: 'owl', emoji: '🦉', words: [['OWL'], ['BIRD'], ['NIGHT'], ['WISE'], ['EYES'], ['FEATHERS']] },
  { key: 'dolphin', emoji: '🐬', words: [['DOLPHIN'], ['ANIMAL'], ['SEA'], ['SWIM'], ['MAMMAL'], ['OCEAN']] },
  { key: 'bicycle', emoji: '🚲', words: [['BICYCLE', 'BIKE'], ['WHEELS'], ['RIDE'], ['PEDAL'], ['ROAD'], ['CHAIN']] },
  { key: 'truck', emoji: '🚚', words: [['TRUCK'], ['VEHICLE'], ['WHEELS'], ['CARGO'], ['ROAD'], ['DRIVER']] },
  { key: 'ship', emoji: '🚢', words: [['SHIP', 'BOAT'], ['SEA'], ['SAIL'], ['CRUISE'], ['HARBOR'], ['OCEAN']] },
  { key: 'violin', emoji: '🎻', words: [['VIOLIN'], ['MUSIC'], ['STRINGS'], ['BOW'], ['ORCHESTRA'], ['INSTRUMENT']] },
  { key: 'trumpet', emoji: '🎺', words: [['TRUMPET'], ['MUSIC'], ['BRASS'], ['INSTRUMENT'], ['BAND'], ['JAZZ']] },
  { key: 'drums', emoji: '🥁', words: [['DRUMS', 'DRUM'], ['MUSIC'], ['RHYTHM'], ['BEAT'], ['BAND'], ['PERCUSSION']] },
  { key: 'piano', emoji: '🎹', words: [['PIANO'], ['MUSIC'], ['KEYS'], ['INSTRUMENT'], ['SONG'], ['CONCERT']] },
  { key: 'camera', emoji: '📷', words: [['CAMERA'], ['PHOTO'], ['PICTURE'], ['LENS'], ['PHOTOGRAPHY'], ['SHOOT']] },
  { key: 'computer', emoji: '💻', words: [['COMPUTER'], ['TECH'], ['SCREEN'], ['KEYBOARD'], ['MOUSE'], ['MACHINE']] },
  { key: 'clock', emoji: '⏰', words: [['CLOCK'], ['TIME'], ['HOUR'], ['ALARM'], ['TICK'], ['WALL']] },
  { key: 'umbrella', emoji: '☔', words: [['UMBRELLA'], ['RAIN'], ['WET'], ['WEATHER'], ['OPEN'], ['COVER']] },
  { key: 'moon', emoji: '🌙', words: [['MOON'], ['NIGHT'], ['SKY'], ['SPACE'], ['CRATER'], ['LIGHT']] },
  { key: 'volcano', emoji: '🌋', words: [['VOLCANO'], ['MOUNTAIN'], ['LAVA'], ['ERUPTION'], ['FIRE'], ['HOT']] },
  { key: 'tornado', emoji: '🌪️', words: [['TORNADO'], ['STORM'], ['WIND'], ['SPIN'], ['WEATHER'], ['DISASTER']] },
  { key: 'baseball', emoji: '⚾', words: [['BASEBALL'], ['SPORT'], ['BAT'], ['BALL'], ['GAME'], ['PITCH']] },
  { key: 'football', emoji: '🏈', words: [['FOOTBALL'], ['SPORT'], ['GAME'], ['BALL'], ['TEAM'], ['FIELD']] },
  { key: 'castle', emoji: '🏰', words: [['CASTLE'], ['BUILDING'], ['KING'], ['TOWER'], ['KINGDOM'], ['STONE']] },
  { key: 'beach', emoji: '🏖️', words: [['BEACH'], ['SAND'], ['SEA'], ['SUN'], ['SUMMER'], ['VACATION']] },
]

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const makeRounds = () => {
  let last = -1
  return (wordsPerRound: number): PicPuzzle => {
    let i = Math.floor(Math.random() * THEMES.length)
    if (THEMES.length > 1 && i === last) i = (i + 1) % THEMES.length
    last = i
    const theme = THEMES[i]
    const words = shuffle(theme.words).slice(0, wordsPerRound)
    return { keys: [theme.key], emojis: [theme.emoji], words }
  }
}

export const createPicwords = () => createPicQuiz(makeRounds(), 'PICWORDS 2', 'Guess the words from the picture')
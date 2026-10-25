// Pluggable image sources for the picture-based quiz games (4 Pics 1 Word, Picwords).
// Each provider maps a keyword (+ emoji fallback) to an image URL fetched from the web.
// Add a provider here, then reference its id in the game's "imageProvider" setting.

export interface ImageProvider {
  id: string
  label: string
  // Whether the returned image visually matches the keyword (real semantic content)
  // vs. a placeholder / random picture.
  semantic: boolean
  build(keyword: string, emoji: string, seed: number, size: number): string
}

// Emoji -> hex codepoints joined by '-', dropping VS16 (fe0f) as Twemoji filenames do.
const emojiToCp = (emoji: string) =>
  [...emoji]
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((h) => h !== 'fe0f')
    .join('-')

const loremflickr: ImageProvider = {
  id: 'loremflickr',
  label: 'Foto reali (LoremFlickr)',
  semantic: true,
  build: (keyword, _emoji, seed, size) =>
    `https://loremflickr.com/${size}/${size}/${encodeURIComponent(keyword)}?lock=${seed}`,
}

const picsum: ImageProvider = {
  id: 'picsum',
  label: 'Foto stock (Picsum)',
  semantic: false,
  build: (keyword, _emoji, seed, size) =>
    `https://picsum.photos/seed/${encodeURIComponent(keyword)}-${seed}/${size}/${size}`,
}

const twemoji: ImageProvider = {
  id: 'twemoji',
  label: 'Emoji (Twemoji)',
  semantic: true,
  build: (_keyword, emoji, _seed, _size) =>
    `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${emojiToCp(emoji)}.svg`,
}

const placehold: ImageProvider = {
  id: 'placehold',
  label: 'Testo (Placehold)',
  semantic: false,
  build: (keyword, _emoji, _seed, size) =>
    `https://placehold.co/${size}x${size}/1b1b21/ffffff?text=${encodeURIComponent(keyword)}`,
}

// Curated keyword -> Unsplash photo id (direct images.unsplash.com CDN, no API key needed).
// Extend to cover more keywords; unmapped keywords fall back to the emoji in the game.
const UNSPLASH: Record<string, string> = {
  // Food
  apple: '1560806887-1e4cd0b6cbd6',
  banana: '1571771894821-ce9b6c11b08e',
  bread: '1509440159596-0249088772ff',
  burger: '1568901346375-23c9450c58cd',
  cake: '1578985545062-69928b1d9587',
  coffee: '1509042239860-f550ce710b93',
  cookie: '1499636136210-6f4ee915583e',
  croissant: '1555507036-ab1f4038808a',
  donut: '1551024601-bec78aea704b',
  food: '1504674900247-0877df9cc836',
  icecream: '1497034825429-c343d7c6a68f',
  pancakes: '1567620905732-2d1ec7ab7445',
  pizza: '1513104890138-7c749659a591',
  salad: '1546069901-ba9599a7e63c',
  // Animals
  bee: '1587049352846-4a222e784d38',
  butterfly: '1545083036811-b021dcef2042',
  cat: '1514888286974-6c03e2ca1dba',
  dog: '1543466835-00a7907e9de1',
  elephant: '1564760055775-d63b17a55c44',
  giraffe: '1547721064-da6cfb341d50',
  lion: '1546182990-dffeafbe841d',
  turtle: '1437622368342-7a3d73a34c8f',
  // Nature
  fire: '1515394440576-b0a4f8264638',
  lightning: '1461988320302-91bde64fc8e4',
  mountain: '1464822759023-fed622ff2c3b',
  ocean: '1518837695005-2083093ee35b',
  rose: '1503342217505-b0a15ec3261c',
  snow: '1478265409131-1f65c88f965c',
  sun: '1500382017468-9049fed747ef',
  sunflower: '1500937386664-56d1dfef3854',
  water: '1500375592092-40eb2168fd21',
  // Space & vehicles
  airplane: '1436491865332-7a61a109cc05',
  bus: '1544620347-c4fd4a3d5957',
  car: '1503376780353-7e6692767b70',
  earth: '1451187580459-43490279c0fa',
  rocket: '1517976487492-5750f3195933',
  train: '1474487548417-781cb71495f3',
  // Objects
  balloon: '1525351484163-7529414344d8',
  book: '1481627834876-b7833e8f5570',
  gift: '1549465220-1a8b9238cd48',
  guitar: '1510915361894-db8b60106cb1',
  house: '1568605114967-8130f3a36994',
  library: '1521587760476-6c12a4b040da',
  // Sport
  basketball: '1546519638-68e109498ffc',
  cycling: '1485965120184-e220f721d03e',
  gym: '1534438327276-14e5300c3a48',
  running: '1461896836934-ffe607ba8211',
  soccer: '1553778263-73a83bab9b0c',
  swimming: '1519315901367-f34ff9154487',
  tennis: '1554068865-24cecd4e34b8',
  // Clothes
  heels: '1543163521-1bf539c55dd2',
  jeans: '1541099649105-f69ad21f3246',
  shirt: '1521572163474-6864f9cf17ab',
  sneakers: '1542291026-7eec264c27ff',
  // Art & music
  art: '1513364776144-60967b0f800f',
  music: '1470225620780-dba8ba36b745',
  theater: '1524863479829-916d8e77f114',
}

const unsplash: ImageProvider = {
  id: 'unsplash',
  label: 'Foto Unsplash',
  semantic: true,
  build: (keyword, _emoji, _seed, size) => {
    const id = UNSPLASH[keyword]
    if (!id) return ''
    return `https://images.unsplash.com/photo-${id}?w=${size}&h=${size}&fit=crop&q=80&auto=format`
  },
}

export const IMAGE_PROVIDERS: ImageProvider[] = [loremflickr, unsplash, picsum, twemoji, placehold]

export const imageProviderById = (id: string): ImageProvider =>
  IMAGE_PROVIDERS.find((p) => p.id === id) ?? IMAGE_PROVIDERS[0]

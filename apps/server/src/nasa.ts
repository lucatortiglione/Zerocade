// NASA's Image of the Day (https://www.nasa.gov/image-of-the-day/), read from its RSS feed:
// the latest few dozen pictures, fetched when first needed and again every few hours.
// ZeroWords shows one at random behind each level when its background is 'nasa'; the other games get the list
// (GET /api/nasa) and show the one the clock picks (nasaPhotoAt, @zerocade/shared).

import { readBoundedBytes, type NasaPhoto } from '@zerocade/shared'

export type { NasaPhoto }

const FEED = 'https://www.nasa.gov/feeds/iotd-feed'
const REFRESH_MS = 6 * 3_600_000
const RETRY_MS = 10 * 60_000
// nasa.gov serves resized copies (?w=): a few hundred KB instead of originals of up to 200 MB.
const WIDTH = 2048

let photos: NasaPhoto[] = []
let lastTry = 0
let pending: Promise<NasaPhoto[]> | null = null

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n: string) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => codePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
const codePoint = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\ufffd'

// The pictures of the feed: an image enclosure on nasa.gov, with its title and page.
export function parseFeed(xml: string): NasaPhoto[] {
  const out: NasaPhoto[] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const enclosure = /<enclosure\s+url="([^"]+)"[^>]*type="image\//.exec(item)
    const url = enclosure ? decode(enclosure[1]) : ''
    if (!/^https:\/\/www\.nasa\.gov\/[^?#"]+$/.test(url)) continue
    if (out.length >= 100) break
    const link = decode(/<link>([\s\S]*?)<\/link>/.exec(item)?.[1] ?? '')
    out.push({
      url: `${url}?w=${WIDTH}`,
      title: decode(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1] ?? '').slice(0, 300),
      link: /^https:\/\/www\.nasa\.gov\//.test(link) ? link : 'https://www.nasa.gov/image-of-the-day/',
    })
  }
  return out
}

// The pictures, fetched again after REFRESH_MS (RETRY_MS when NASA could not be reached);
// the last good list stays meanwhile, and an empty one means none yet.
export function nasaPhotos(): Promise<NasaPhoto[]> {
  if (Date.now() - lastTry < (photos.length ? REFRESH_MS : RETRY_MS)) return Promise.resolve(photos)
  pending ??= (async () => {
    lastTry = Date.now()
    try {
      const res = await fetch(FEED, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const list = parseFeed(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedBytes(res, 2 * 1024 * 1024)))
      if (list.length) photos = list
    } catch (err) {
      console.warn(`[nasa] ${FEED}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      pending = null
    }
    return photos
  })()
  return pending
}

// One picture at random, never the one just shown when there is another.
export function randomPhoto(list: NasaPhoto[], previous?: string): NasaPhoto | null {
  const pool = list.length > 1 ? list.filter((p) => p.url !== previous) : list
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
}

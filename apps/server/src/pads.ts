import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DJ_SOUNDS, PAD_COLORS, PAD_SLOTS, djSoundById, type Pad, type PadBoard, type PadKind } from '@zerocade/shared'
import { createPadBoard, databaseSnapshot, dataDir, deletePad, getPad, listPads, padAt, padVolume, savePad } from './db.js'

// The Sounds and GIFs boards of each overlay key. Uploaded files live in the data folder
// under a fresh random name per upload, so they can be cached forever.

const FILE_TYPES: Record<PadKind, Record<string, string>> = {
  sound: {
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/webm': 'webm',
  },
  // No SVG, which could carry scripts.
  gif: { 'image/gif': 'gif', 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' },
}

const CONTENT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  gif: 'image/gif',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
}

export const PAD_FILE_MAX = 6 * 1024 * 1024

const padsDir = join(dataDir, 'pads')
const FILE_NAME = /^[0-9a-f-]{36}\.(mp3|wav|ogg|m4a|webm|gif|webp|png|jpg)$/

const removeFile = (file?: string) => {
  if (file && FILE_NAME.test(file)) rmSync(join(padsDir, file), { force: true })
}
const cleanupFile = (file?: string) => {
  try { removeFile(file) }
  catch (error) { console.warn('[pads] pulsante salvato, pulizia del file precedente non riuscita', error instanceof Error ? error.name : 'errore filesystem') }
}

export function padBoard(key: string): PadBoard {
  let volume = padVolume(key)
  if (volume === undefined) {
    createPadBoard(
      key,
      DJ_SOUNDS.map((s, slot) => ({
        id: randomUUID(),
        kind: 'sound',
        slot,
        label: s.label,
        color: PAD_COLORS[slot % PAD_COLORS.length],
        soundId: s.id,
      })),
    )
    volume = padVolume(key) ?? 0.8
  }
  return { volume, pads: listPads(key) }
}

export async function padFile(name: string): Promise<{ type: string; body: Buffer } | null> {
  if (!FILE_NAME.test(name)) return null
  const path = join(padsDir, name)
  try { return { type: CONTENT_TYPES[name.split('.').pop()!], body: await readFile(path) } }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null; throw error }
}

const asRecord = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null)

// Creates or updates a pad from a PadInput. Returns an error message for the dashboard.
export function savePadInput(key: string, raw: unknown): string | null {
  const r = asRecord(raw)
  if (!r) return 'Dati mancanti.'
  const kind = r.kind
  if (kind !== 'sound' && kind !== 'gif') return 'Tipo non valido.'
  const slot = Number(r.slot)
  if (!Number.isInteger(slot) || slot < 0 || slot >= PAD_SLOTS) return 'Posizione non valida.'
  const label = typeof r.label === 'string' ? r.label.trim().slice(0, 24) : ''
  if (!label) return 'Scrivi un nome.'
  const color = typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color.toLowerCase() : PAD_COLORS[0]

  const existing = typeof r.id === 'string' ? getPad(key, r.id) : undefined
  if (r.id !== undefined && (!existing || existing.kind !== kind)) return 'Questo pulsante non esiste più.'

  let soundId = kind === 'sound' && typeof r.soundId === 'string' && djSoundById(r.soundId) ? r.soundId : undefined
  let file = soundId ? undefined : existing?.file
  let uploaded: string | undefined
  const upload = asRecord(r.upload)
  if (upload) {
    const type = typeof upload.type === 'string' ? upload.type : ''
    const ext = Object.hasOwn(FILE_TYPES[kind], type) ? FILE_TYPES[kind][type] : undefined
    if (!ext) return kind === 'sound' ? 'Usa un file MP3, WAV, OGG o M4A.' : 'Usa una GIF, WebP, PNG o JPG.'
    if (typeof upload.data !== 'string' || upload.data.length > Math.ceil(PAD_FILE_MAX / 3) * 4 ||
      upload.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data)) return 'File non valido o oltre 6 MB.'
    const body = Buffer.from(upload.data, 'base64')
    if (!body?.length) return 'Il file è vuoto.'
    if (body.length > PAD_FILE_MAX) return 'Il file supera 6 MB.'
    mkdirSync(padsDir, { recursive: true })
    file = `${randomUUID()}.${ext}`
    const destination = join(padsDir, file)
    const temporary = `${destination}.upload`
    let fd: number | undefined
    try {
      fd = openSync(temporary, 'wx')
      writeFileSync(fd, body)
      fsyncSync(fd)
      closeSync(fd)
      fd = undefined
      renameSync(temporary, destination)
      uploaded = file
    } finally {
      if (fd !== undefined) closeSync(fd)
      rmSync(temporary, { force: true })
    }
    soundId = undefined
  }
  if (!soundId && !file) return kind === 'sound' ? 'Scegli un file audio o un suono incluso.' : 'Scegli una GIF.'

  const pad: Pad = { id: existing?.id ?? randomUUID(), kind, slot, label, color, ...(soundId ? { soundId } : {}), ...(file ? { file } : {}) }

  // A pad moved onto another swaps places with it. A new pad only meets one when a second
  // dashboard filled the slot meanwhile: the newer one wins.
  const obsolete: string[] = []
  try {
    databaseSnapshot(() => {
      const occupant = padAt(key, kind, slot)
      if (occupant && occupant.id !== pad.id) {
        if (existing) {
          savePad(key, { ...occupant, slot: -1 })
          savePad(key, pad)
          savePad(key, { ...occupant, slot: existing.slot })
        } else {
          deletePad(key, occupant.id)
          if (occupant.file) obsolete.push(occupant.file)
          savePad(key, pad)
        }
      } else savePad(key, pad)
    })
  } catch (error) {
    if (uploaded) cleanupFile(uploaded)
    throw error
  }
  if (existing?.file && existing.file !== file) obsolete.push(existing.file)
  for (const previous of obsolete) cleanupFile(previous)
  return null
}

export function removePad(key: string, id: string): void {
  const pad = getPad(key, id)
  if (!pad) return
  deletePad(key, id)
  cleanupFile(pad.file)
}

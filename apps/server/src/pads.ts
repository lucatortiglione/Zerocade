import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DJ_SOUNDS, PAD_COLORS, PAD_SLOTS, djSoundById, type Pad, type PadBoard, type PadKind } from '@zerocade/shared'
import { createPadBoard, dataDir, deletePad, getPad, listPads, padAt, padVolume, savePad } from './db.js'

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

export function padFile(name: string): { type: string; body: Buffer } | null {
  if (!FILE_NAME.test(name)) return null
  const path = join(padsDir, name)
  if (!existsSync(path)) return null
  return { type: CONTENT_TYPES[name.split('.').pop()!], body: readFileSync(path) }
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
  const upload = asRecord(r.upload)
  if (upload) {
    const ext = FILE_TYPES[kind][String(upload.type)]
    if (!ext) return kind === 'sound' ? 'Usa un file MP3, WAV, OGG o M4A.' : 'Usa una GIF, WebP, PNG o JPG.'
    const body = typeof upload.data === 'string' ? Buffer.from(upload.data, 'base64') : null
    if (!body?.length) return 'Il file è vuoto.'
    if (body.length > PAD_FILE_MAX) return 'Il file supera 6 MB.'
    mkdirSync(padsDir, { recursive: true })
    file = `${randomUUID()}.${ext}`
    writeFileSync(join(padsDir, file), body)
    soundId = undefined
  }
  if (!soundId && !file) return kind === 'sound' ? 'Scegli un file audio o un suono incluso.' : 'Scegli una GIF.'

  if (existing?.file && existing.file !== file) removeFile(existing.file)
  const pad: Pad = { id: existing?.id ?? randomUUID(), kind, slot, label, color, ...(soundId ? { soundId } : {}), ...(file ? { file } : {}) }

  // A pad moved onto another swaps places with it. A new pad only meets one when a second
  // dashboard filled the slot meanwhile: the newer one wins.
  const occupant = padAt(key, kind, slot)
  if (occupant && occupant.id !== pad.id) {
    if (existing) {
      savePad(key, { ...occupant, slot: -1 })
      savePad(key, pad)
      savePad(key, { ...occupant, slot: existing.slot })
      return null
    }
    removePad(key, occupant.id)
  }
  savePad(key, pad)
  return null
}

export function removePad(key: string, id: string): void {
  const pad = getPad(key, id)
  if (!pad) return
  deletePad(key, id)
  removeFile(pad.file)
}

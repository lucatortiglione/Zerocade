import { DJ_SOUNDS, type DjPlay } from '@zerocade/shared'

// Built-in DJ sounds are synthesized with the Web Audio API, so there are no
// binary assets to ship and no network requests on the overlay.

let audioCtx: AudioContext | null = null
// Every synthesized tone goes through `master`: it carries the pad board's volume, and
// Stop cuts it off and starts a fresh one.
let master: GainNode | null = null
// Uploaded sounds still playing, so Stop can silence them too.
const playing = new Set<HTMLAudioElement>()

const ac = () => {
  audioCtx ??= new AudioContext()
  return audioCtx
}

const out = () => {
  if (!master) {
    master = ac().createGain()
    master.connect(ac().destination)
  }
  return master
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.15, delay = 0) {
  const a = ac()
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.value = freq
  const t = a.currentTime + delay
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g)
  g.connect(out())
  o.start(t)
  o.stop(t + dur)
}

function riser() {
  const a = ac()
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(180, a.currentTime)
  o.frequency.exponentialRampToValueAtTime(1400, a.currentTime + 0.5)
  g.gain.setValueAtTime(0.0001, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + 0.5)
  o.connect(g)
  g.connect(out())
  o.start()
  o.stop(a.currentTime + 0.55)
}

function builtin(id: string) {
  switch (id) {
    case 'airhorn':
      tone(220, 0.9, 'sawtooth', 0.18)
      tone(233, 0.9, 'sawtooth', 0.18)
      break
    case 'coin':
      tone(880, 0.08, 'square', 0.12)
      tone(1320, 0.16, 'square', 0.12, 0.07)
      break
    case 'hit':
      tone(140, 0.3, 'sawtooth', 0.22)
      break
    case 'pop':
      tone(600, 0.12, 'triangle', 0.2)
      break
    case 'riser':
      riser()
      break
    case 'wow':
      tone(400, 0.4, 'triangle', 0.18)
      tone(300, 0.4, 'triangle', 0.18, 0.12)
      break
  }
}

export function playSound(play: DjPlay) {
  const volume = Math.min(1, Math.max(0, play.volume ?? 1))
  if (play.url) {
    const a = new Audio(play.url)
    a.volume = volume
    playing.add(a)
    a.addEventListener('ended', () => playing.delete(a))
    void a.play().catch(() => playing.delete(a))
    return
  }
  const sound = play.soundId ? DJ_SOUNDS.find((s) => s.id === play.soundId) : undefined
  if (!sound) return
  out().gain.value = volume
  builtin(sound.id)
}

// Incastro's sounds, also synthesized. A found word climbs a major scale, one note per
// letter, the way the line crosses the wheel; an extra word is a lighter two-note chime.
const SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5]
export type GameSound = 'found' | 'extra' | 'secret' | 'repeat' | 'hint' | 'shuffle' | 'complete' | 'chapter'

export function gameSound(kind: GameSound, letters = 3) {
  try {
    switch (kind) {
      case 'found':
        for (let i = 0; i < Math.min(letters, SCALE.length); i++) tone(SCALE[i], 0.16, 'triangle', 0.13, i * 0.08)
        tone(SCALE[Math.min(letters, SCALE.length) - 1] * 2, 0.35, 'sine', 0.08, letters * 0.08)
        break
      case 'extra':
        tone(783.99, 0.12, 'sine', 0.12)
        tone(1174.66, 0.22, 'sine', 0.1, 0.09)
        break
      case 'secret':
        // A bright run up and a held chord: the secret word is the big find of a level.
        ;[659.25, 783.99, 987.77, 1318.5].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.07))
        ;[1318.5, 1567.98, 1975.53].forEach((f) => tone(f, 0.7, 'sine', 0.06, 0.3))
        break
      case 'repeat':
        tone(330, 0.12, 'triangle', 0.08)
        break
      case 'hint':
        tone(1318.5, 0.1, 'sine', 0.08)
        tone(1760, 0.18, 'sine', 0.07, 0.07)
        break
      case 'shuffle':
        for (let i = 0; i < 4; i++) tone(440 + i * 90, 0.06, 'triangle', 0.06, i * 0.04)
        break
      case 'complete':
        ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, i * 0.11))
        break
      case 'chapter':
        ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.45, 'triangle', 0.12, i * 0.13))
        tone(261.63, 1.1, 'sine', 0.1, 0.5)
        break
    }
  } catch {
    // No audio device, or the browser source has not allowed sound yet.
  }
}

// Quizzland's sounds: a bright call when a question opens, a wood-block tick in its last
// seconds, a downward sweep for the 50:50, and the reveal: a rising arpeggio when someone got
// it right, two falling notes when nobody did.
export type QuizSound = 'question' | 'tick' | 'fifty' | 'right' | 'none'

export function quizSound(kind: QuizSound) {
  try {
    switch (kind) {
      case 'question':
        tone(659.25, 0.14, 'triangle', 0.11)
        tone(987.77, 0.26, 'triangle', 0.11, 0.1)
        tone(1318.5, 0.3, 'sine', 0.05, 0.2)
        break
      case 'tick':
        tone(1600, 0.04, 'square', 0.05)
        tone(800, 0.06, 'triangle', 0.07)
        break
      case 'fifty': {
        const a = ac()
        const o = a.createOscillator()
        const g = a.createGain()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(1200, a.currentTime)
        o.frequency.exponentialRampToValueAtTime(220, a.currentTime + 0.35)
        g.gain.setValueAtTime(0.08, a.currentTime)
        g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.4)
        o.connect(g)
        g.connect(out())
        o.start()
        o.stop(a.currentTime + 0.42)
        tone(523.25, 0.12, 'triangle', 0.1, 0.36)
        tone(523.25, 0.18, 'triangle', 0.1, 0.5)
        break
      }
      case 'right':
        ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.22, 'triangle', 0.11, i * 0.07))
        ;[1046.5, 1318.5, 1567.98].forEach((f) => tone(f, 0.8, 'sine', 0.05, 0.36))
        break
      case 'none':
        tone(392, 0.28, 'triangle', 0.11)
        tone(311.13, 0.5, 'triangle', 0.11, 0.24)
        break
    }
  } catch {
    // No audio device, or the browser source has not allowed sound yet.
  }
}

export function stopSounds() {
  for (const a of playing) a.pause()
  playing.clear()
  master?.disconnect()
  master = null
}

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

export function stopSounds() {
  for (const a of playing) a.pause()
  playing.clear()
  master?.disconnect()
  master = null
}

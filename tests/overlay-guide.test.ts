import assert from 'node:assert/strict'
import test from 'node:test'
import { GAMES, describeSource, type Trigger } from '@zerocade/shared'
import { guideLine } from '../apps/overlay/src/guide.ts'

// Le istruzioni in onda («come si gioca») compaiono sotto ogni gioco: sono in italiano e si leggono come una frase.

test('le fonti delle istruzioni sono in italiano', () => {
  assert.equal(describeSource({ type: 'comment' }).label, 'Un messaggio in chat')
  assert.equal(describeSource({ type: 'gift' }).label, 'Un regalo qualsiasi')
  assert.equal(describeSource({ type: 'like' }).label, 'Like')
  assert.equal(describeSource({ type: 'follow' }).label, 'Nuovo follower')
  assert.equal(describeSource({ type: 'share' }).label, 'Condivisione')
  assert.equal(describeSource({ type: 'join' }).label, 'Ingresso in diretta')
  assert.equal(describeSource({ type: 'comment', match: 'ciao' }).label, '"ciao"')   // una parola scelta resta com'è
})

test('nessuna azione dei giochi ha un\'etichetta in inglese', () => {
  const english = /\b(guess|answer|find|word|vote|jump|punch|heal|join|obstacle|boost|speed|power-up|heart|rain|bomb|drop in|skip|question)\b/i
  const found = GAMES.flatMap((g) => (g.actions ?? []).filter((a) => english.test(a.label)).map((a) => `${g.id}: ${a.label}`))
  assert.deepEqual(found, [])
})

test('una riga di istruzioni è una frase: fonte e azione, senza freccia', () => {
  const game = GAMES.find((g) => g.id === 'context')!
  const trigger: Trigger = { source: { type: 'comment' }, action: 'guess' } as Trigger
  assert.deepEqual(guideLine(trigger, game), { icon: '💬', text: 'Un messaggio in chat: indovina' })
})

test('l\'azione sconosciuta mostra il suo nome, non un vuoto', () => {
  const game = GAMES.find((g) => g.id === 'context')!
  const trigger: Trigger = { source: { type: 'gift' }, action: 'non-esiste' } as Trigger
  assert.deepEqual(guideLine(trigger, game), { icon: '🎁', text: 'Un regalo qualsiasi: non-esiste' })
})

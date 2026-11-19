import assert from 'node:assert/strict'
import test from 'node:test'
import { recordCanvas } from './helpers/overlayHarness.ts'
import { addPoints, drawLeaderboard, newScores } from '../apps/overlay/src/games/common.ts'
import { sceneUnit, textSize } from '../apps/overlay/src/games/kit.ts'

// Il kit di disegno in onda: misure leggibili su telefono e la classifica condivisa da 29 giochi.

const px = (font: string) => Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0)

test('la misura della scena si ricava dal palco, in verticale e in orizzontale', () => {
  assert.equal(sceneUnit(1080, 1628), 1080)          // verticale: il lato corto è la larghezza
  assert.equal(sceneUnit(1920, 788), 1079)           // orizzontale: il palco è alto 788 su una scena alta 1080
})

test('le quattro misure del testo partono da 40 px su una scena da 1080', () => {
  assert.deepEqual(['min', 'mid', 'big', 'huge'].map((k) => textSize(1080, 1628, k as 'min')), [40, 52, 72, 119])
})

test('la classifica scrive posizione e nome, poi i punti, senza caratteri persi', () => {
  installScores()
  const { ctx, finish } = recordCanvas(1080, 1628)
  drawLeaderboard(ctx, scores)
  const { texts } = finish()
  assert.ok(texts.includes('1. Anna'), texts.join(' | '))
  assert.ok(texts.includes('20 pt'), texts.join(' | '))
  assert.ok(!texts.some((t) => t.includes('?')), `testo con «?»: ${texts.join(' | ')}`)
})

test('un nome troppo lungo si accorcia con i puntini, non con un punto di domanda', () => {
  installScores()
  const { ctx, finish } = recordCanvas(1080, 1628)
  drawLeaderboard(ctx, scores)
  const long = finish().texts.find((t) => t.startsWith('2. '))!
  assert.ok(long.endsWith('…'), long)
  assert.ok(long.length <= 3 + 28, long)
})

test('la classifica è leggibile su telefono: almeno 40 px su una scena da 1080', () => {
  installScores()
  const { ctx, finish } = recordCanvas(1080, 1628)
  drawLeaderboard(ctx, scores)
  // Solo i testi della classifica: l'iniziale disegnata dentro l'avatar senza foto è un segnaposto grande quanto il cerchio.
  const fonts = finish().fonts.filter((f) => f.includes('Barlow'))
  assert.ok(fonts.length > 0)
  for (const font of fonts) assert.ok(px(font) >= 40, font)
})

test('senza punti la classifica non disegna nulla', () => {
  const { ctx, finish } = recordCanvas(1080, 1628)
  drawLeaderboard(ctx, newScores())
  assert.equal(finish().calls, 0)
})

let scores = newScores()
function installScores() {
  scores = newScores()
  addPoints(scores, 'u1', 'Anna', undefined, 20)
  addPoints(scores, 'u2', 'Un nome davvero troppo lungo per la classifica in onda', undefined, 5)
}

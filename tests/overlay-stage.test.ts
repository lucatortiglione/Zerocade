import assert from 'node:assert/strict'
import test from 'node:test'
import { stageBox } from '../apps/overlay/src/stage.ts'

// Il palco: la parte della scena dove disegnano i giochi, tra il marchio in alto e le istruzioni in basso. Fuori dal palco un gioco
// finirebbe sotto quelle fasce (come la classifica a 60 px dall'alto, dopo che il marchio è diventato una fascia piena).

test('in verticale il palco lascia libere la fascia del marchio e quella delle istruzioni', () => {
  // lato corto 1080: marchio fino a ~100 px (9,3vmin), istruzioni su due righe ~165 px (15,3vmin)
  assert.deepEqual(stageBox(1080, 1920), { top: 119, bottom: 173, width: 1080, height: 1628 })
})

test('in orizzontale le fasce si misurano sul lato corto, come le scritte', () => {
  assert.deepEqual(stageBox(1920, 1080), { top: 119, bottom: 173, width: 1920, height: 788 })
})

test('una finestra minuscola non dà un palco negativo', () => {
  const box = stageBox(40, 20)
  assert.ok(box.height >= 0)
  assert.equal(box.width, 40)
})

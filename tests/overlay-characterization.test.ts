import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { characterizedGameIds, runScenario, type Checkpoint } from './helpers/overlayHarness.ts'

// Rete di sicurezza della riscrittura dell'overlay. Per ogni gioco del registro: gli stessi 12 secondi di chat, e i testi che gli
// spettatori leggono (e l'impronta del disegno) devono essere quelli salvati in tests/fixtures/overlay-golden/<gioco>.json.
//   - testi diversi  → il comportamento è cambiato: è un difetto, salvo che il cambiamento sia voluto;
//   - disegno diverso → l'aspetto è cambiato: atteso durante la riscrittura. Si aggiorna con  OVERLAY_GOLDEN=update.
// Per aggiornare i riferimenti (anche dei testi, se il cambiamento è voluto):  OVERLAY_GOLDEN=update npm run test:overlay

const DIR = fileURLToPath(new URL('./fixtures/overlay-golden/', import.meta.url))
const UPDATE = process.env.OVERLAY_GOLDEN === 'update'
const VISUAL_CHANGE_OK = process.env.OVERLAY_VISUAL_REWRITE === '1'
// I giochi che nel banco di prova non si possono far girare senza dati che il banco non ha (vedi il motivo).
const SKIPPED: Record<string, string> = { 'trivia-time': 'richiede la banca delle domande completa' }

for (const id of characterizedGameIds()) {
  test(`overlay: ${id}`, { skip: SKIPPED[id] }, async () => {
    const first = await runScenario(id)
    assert.ok(first, `il gioco «${id}» non si crea`)
    const second = await runScenario(id)
    assert.deepEqual(second, first, `${id}: due esecuzioni identiche danno risultati diversi (il banco di prova non è deterministico per questo gioco)`)

    const file = `${DIR}${id}.json`
    if (UPDATE || !existsSync(file)) {
      mkdirSync(DIR, { recursive: true })
      writeFileSync(file, JSON.stringify(first, null, 1) + '\n')
      if (!UPDATE) return
    }
    const golden = JSON.parse(readFileSync(file, 'utf8')) as Checkpoint[]
    assert.deepEqual(first.map((c) => ({ at: c.at, texts: c.texts })), golden.map((c) => ({ at: c.at, texts: c.texts })),
      `${id}: i testi mostrati agli spettatori sono cambiati`)
    if (!VISUAL_CHANGE_OK) assert.deepEqual(first.map((c) => ({ at: c.at, trace: c.trace })), golden.map((c) => ({ at: c.at, trace: c.trace })),
      `${id}: il disegno è cambiato (atteso se stai cambiando l'aspetto: OVERLAY_VISUAL_REWRITE=1 per non fallire, OVERLAY_GOLDEN=update per aggiornare)`)
  })
}

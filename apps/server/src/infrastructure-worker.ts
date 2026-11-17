import { parentPort } from 'node:worker_threads'
import { databaseSnapshot } from './db.js'
import { GAMES } from '@zerocade/shared'
import { closeDb, getRanking, giftedCreators, latestGifts, listEvents, recentCreators, recordLiveEvent, setPadVolume, topGiftSince, touchCreator, wordAssociationGuesses, wordAssociationRounds } from './db.js'
import { leaderboards, leaderboardResetTimes, PERIODS } from './scores.js'
import { leaderboardCss, leaderboardHtml, leaderboardIndexHtml, leaderboardJs } from './leaderboard-page.js'
import { padBoard, removePad, savePadInput } from './pads.js'
import { toCsv } from './csv.js'
import type { JobRequest, JobResponse } from './infrastructureJobs.js'

async function execute(job: JobRequest): Promise<unknown> {
  switch (job.kind) {
    case 'event': return recordLiveEvent(job.args.key, job.args.creator, job.args.game, job.args.event, job.args.at)
    case 'ranking': return getRanking(job.args.key)
    case 'creator': return touchCreator(job.args.kind, job.args.username, job.args.game, job.args.viewers)
    case 'events': return listEvents(job.args.key, job.args.limit)
    case 'feed': return databaseSnapshot(() => ({ recent: recentCreators(20), creators: giftedCreators(), top: topGiftSince(job.args.creator, job.args.since), gifts: latestGifts(job.args.creator, 40) }))
    case 'boards': return databaseSnapshot(() => ({ boards: leaderboards(job.args.key, job.args.game, job.args.limit, new Date(job.args.at), job.args.start), resets: leaderboardResetTimes(job.args.key, job.args.game) }))
    case 'site': {
      const files = new Map<string, string>([
        ['classifica/index.html', leaderboardIndexHtml()], ['classifica/classifica.css', leaderboardCss], ['classifica/classifica.js', leaderboardJs],
      ])
      databaseSnapshot(() => { for (const game of GAMES) {
        files.set(`classifica/${game.id}.html`, leaderboardHtml(game))
        files.set(`api/leaderboard/${game.id}`, JSON.stringify({ game: { id: game.id, name: game.name, emoji: game.emoji }, periods: PERIODS,
          boards: leaderboards(job.args.key, game.id, 50, new Date(job.args.at), job.args.starts[game.id]) }))
      } })
      return files
    }
    case 'export': {
      switch (job.args.kind) {
        case 'bivio': return (await import('./bivio.js')).bivioCsv()
        case 'bivio-flags': return (await import('./bivio.js')).bivioFlagsCsv()
        case 'quizzland': return (await import('./quizzland.js')).quizzlandCsv()
        case 'zw-plays': return (await import('./incastro.js')).zerowordsCsv('plays')
        case 'zw-answers': return (await import('./incastro.js')).zerowordsCsv('answers')
        // ZeroTaboo's telemetry: computed here, in the worker, never on the main thread (the winner is a pseudonym).
        case 'taboo-exposures': { const { tabooStore } = await import('./db.js'); const t = tabooStore.exposuresTable(); return toCsv([t.columns, ...t.rows]) }
        case 'taboo-calibration': { const { tabooStore } = await import('./db.js'); const t = tabooStore.calibrationTable(); return toCsv([t.columns, ...t.rows]) }
        default: {
          const { columns, rows } = job.args.kind === 'wa-rounds' ? wordAssociationRounds() : wordAssociationGuesses()
          return toCsv([columns, ...rows])
        }
      }
    }
    case 'padSave': { const error = savePadInput(job.args.key, job.args.input); return { error, board: padBoard(job.args.key) } }
    case 'padRemove': removePad(job.args.key, job.args.id); return padBoard(job.args.key)
    case 'padVolume': setPadVolume(job.args.key, job.args.volume); return padBoard(job.args.key)
    case 'padBoard': return padBoard(job.args.key)
    case 'barrier': return
    case 'close': closeDb(); return
  }
}

// Even tasks with dynamic imports run in arrival order. A report cannot reorder
// writes or overtake a persistence barrier.
let tail = Promise.resolve()
parentPort?.on('message', (job: JobRequest) => {
  tail = tail.then(async () => {
    let reply: JobResponse
    try { reply = { id: job.id, ok: true, result: await execute(job) } }
    catch (error) { reply = { id: job.id, ok: false, error: error instanceof Error ? error.message : String(error) } }
    parentPort?.postMessage(reply)
  })
})

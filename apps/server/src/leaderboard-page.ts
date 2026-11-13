import { GAMES, type GameDef } from '@zerocade/shared'
import { PERIODS } from './scores.js'

// The leaderboard page the mini server publishes for each game: /classifica/<gioco>. A browser source for the
// stream or a link to share. It asks /api/leaderboard/<gioco> every few seconds and draws the five boards (session,
// day, week, month, all time) with the CSS of /classifica/classifica.css.
//
// Query: ?periodo=sessione|giorno|settimana|mese|sempre  the board to show (default: sessione)
//        ?top=10                                         how many places (1-50)
//        ?rotazione=8                                    change board every 8 seconds
//        ?tabs=0                                         no period tabs
//        ?sfondo=trasparente                             no background (browser source)

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const leaderboardHtml = (game: GameDef): string => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Classifica ${escapeHtml(game.name)}</title>
<link rel="stylesheet" href="/classifica/classifica.css">
</head>
<body data-game="${escapeHtml(game.id)}">
<main class="lb" aria-live="polite">
  <header class="lb__head">
    <span class="lb__emoji" aria-hidden="true">${escapeHtml(game.emoji)}</span>
    <h1 class="lb__title">${escapeHtml(game.name)}</h1>
    <p class="lb__period" id="period-name"></p>
  </header>
  <nav class="lb__tabs" id="tabs" aria-label="Periodo"></nav>
  <ol class="lb__list" id="list"></ol>
  <p class="lb__empty" id="empty" hidden>Ancora nessun punto in questo periodo.</p>
</main>
<script src="/classifica/classifica.js"></script>
</body>
</html>
`

export const leaderboardIndexHtml = (): string => {
  const games = [...GAMES].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }))
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Classifiche di Zerocade</title>
<link rel="stylesheet" href="/classifica/classifica.css">
</head>
<body class="index">
<main class="lb lb--index">
  <header class="lb__head"><h1 class="lb__title">Classifiche</h1><p class="lb__period">${PERIODS.map((p) => p.label).join(' · ')}</p></header>
  <ul class="games">
${games.map((g) => `    <li><a class="games__card" href="/classifica/${escapeHtml(g.id)}"><span aria-hidden="true">${escapeHtml(g.emoji)}</span>${escapeHtml(g.name)}</a></li>`).join('\n')}
  </ul>
</main>
</body>
</html>
`
}

export const leaderboardJs = `(() => {
  const PERIODS = ${JSON.stringify(PERIODS.map((p) => [p.id, p.label]))}
  const params = new URLSearchParams(location.search)
  const game = document.body.dataset.game
  const top = Math.min(50, Math.max(1, Number(params.get('top')) || 10))
  const rotate = Math.max(0, Number(params.get('rotazione')) || 0)
  let period = PERIODS.some((p) => p[0] === params.get('periodo')) ? params.get('periodo') : 'sessione'
  let boards = null
  if (params.get('sfondo') === 'trasparente') document.documentElement.classList.add('transparent')

  const tabs = document.getElementById('tabs')
  const list = document.getElementById('list')
  const empty = document.getElementById('empty')
  const name = document.getElementById('period-name')
  if (params.get('tabs') === '0') tabs.hidden = true

  const label = (id) => PERIODS.find((p) => p[0] === id)[1]
  const number = new Intl.NumberFormat('it-IT')

  for (const [id, text] of PERIODS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lb__tab'
    button.dataset.period = id
    button.textContent = text
    button.addEventListener('click', () => show(id))
    tabs.append(button)
  }

  function avatar(entry) {
    const wrap = document.createElement('span')
    wrap.className = 'lb__avatar'
    const initial = () => {
      wrap.textContent = (entry.name || '?').charAt(0).toUpperCase()
    }
    if (entry.avatar) {
      const img = new Image()
      img.referrerPolicy = 'no-referrer'
      img.alt = ''
      img.src = entry.avatar
      img.addEventListener('error', initial)
      wrap.append(img)
    } else initial()
    return wrap
  }

  function draw() {
    for (const button of tabs.children) button.classList.toggle('lb__tab--on', button.dataset.period === period)
    name.textContent = label(period)
    const rows = (boards && boards[period]) || []
    list.replaceChildren(
      ...rows.map((entry) => {
        const item = document.createElement('li')
        item.className = 'lb__row lb__row--' + Math.min(entry.rank, 4)
        const rank = document.createElement('span')
        rank.className = 'lb__rank'
        rank.textContent = entry.rank
        const who = document.createElement('span')
        who.className = 'lb__name'
        who.textContent = entry.name
        const points = document.createElement('span')
        points.className = 'lb__points'
        points.textContent = number.format(entry.points)
        item.append(rank, avatar(entry), who, points)
        item.style.setProperty('--i', entry.rank - 1)
        return item
      }),
    )
    empty.hidden = rows.length > 0
  }

  function show(id) {
    period = id
    draw()
  }

  async function refresh() {
    try {
      const res = await fetch('/api/leaderboard/' + encodeURIComponent(game) + '?limit=' + top, { cache: 'no-store' })
      if (res.ok) boards = (await res.json()).boards
    } catch {
      // The server is not there for a moment: the last boards stay.
    }
    draw()
  }

  refresh()
  setInterval(refresh, 5000)
  if (rotate) setInterval(() => show(PERIODS[(PERIODS.findIndex((p) => p[0] === period) + 1) % PERIODS.length][0]), rotate * 1000)
})()
`

export const leaderboardCss = `/* Classifiche di Zerocade: la pagina /classifica/<gioco>, pensata anche come sorgente browser per la diretta. */
:root {
  --bg: #0b0c18;
  --panel: rgba(22, 20, 44, 0.9);
  --line: rgba(255, 255, 255, 0.1);
  --text: #f4f5fb;
  --muted: #9aa0b8;
  --accent: #7c5cff;
  --accent-2: #22d3ee;
  --gold: #f5c542;
  --silver: #c0c6d4;
  --bronze: #d08a4e;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { background: var(--bg); }
html.transparent, html.transparent body { background: transparent; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: start center;
  padding: 24px 16px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--text);
}

.lb {
  width: min(100%, 560px);
  padding: 22px 20px 18px;
  border-radius: 28px;
  background: var(--panel);
  border: 1px solid var(--line);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}
html.transparent .lb { box-shadow: none; }
.lb__head { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: center; margin-bottom: 14px; }
.lb__emoji { grid-row: span 2; font-size: 38px; line-height: 1; }
.lb__title {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lb__period { margin: 2px 0 0; color: var(--muted); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; font-size: 13px; }

.lb__tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.lb__tab {
  flex: 1 1 auto;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.lb__tab:hover { color: var(--text); }
.lb__tab--on { background: linear-gradient(90deg, var(--accent), var(--accent-2)); border-color: transparent; color: #fff; }

.lb__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.lb__row {
  display: grid;
  grid-template-columns: 38px 40px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 8px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid transparent;
  animation: lb-in 0.35s ease both;
  animation-delay: calc(var(--i, 0) * 40ms);
}
.lb__rank { text-align: center; font-weight: 800; font-size: 18px; color: var(--muted); }
.lb__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #3a3a44;
  border: 2px solid rgba(60, 207, 122, 0.85);
  font-weight: 800;
}
.lb__avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lb__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; font-size: 17px; }
.lb__points { font-weight: 800; font-size: 19px; font-variant-numeric: tabular-nums; }

.lb__row--1 { background: linear-gradient(90deg, rgba(245, 197, 66, 0.28), rgba(255, 255, 255, 0.06)); border-color: rgba(245, 197, 66, 0.45); }
.lb__row--1 .lb__rank, .lb__row--1 .lb__points { color: var(--gold); }
.lb__row--2 { background: linear-gradient(90deg, rgba(192, 198, 212, 0.22), rgba(255, 255, 255, 0.06)); }
.lb__row--2 .lb__rank, .lb__row--2 .lb__points { color: var(--silver); }
.lb__row--3 { background: linear-gradient(90deg, rgba(208, 138, 78, 0.24), rgba(255, 255, 255, 0.06)); }
.lb__row--3 .lb__rank, .lb__row--3 .lb__points { color: var(--bronze); }

.lb__empty { margin: 18px 0 6px; text-align: center; color: var(--muted); }
@keyframes lb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .lb__row { animation: none; } }
@media (max-width: 380px) {
  .lb { padding: 16px 12px; border-radius: 20px; }
  .lb__row { grid-template-columns: 30px 34px 1fr auto; gap: 8px; }
  .lb__avatar { width: 34px; height: 34px; }
}

/* L'indice dei giochi: /classifica */
.games { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.games__card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--line);
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
}
.games__card:hover { background: rgba(124, 92, 255, 0.22); }
.lb--index { width: min(100%, 860px); }
`

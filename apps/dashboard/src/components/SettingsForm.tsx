import { Fragment, useEffect, useRef, useState } from 'react'
import { apiFetch, UnconfirmedRequestError } from '@zerocade/browser-runtime'
import { BACKGROUND_GAMES, GAMES, backgroundPath, settingVisible, type GameSetting, type SessionState } from '@zerocade/shared'
import { overlayKey } from '../overlayKey'
import { socket } from '../socket'
import { WordHuntHintTiers } from './WordHuntHintTiers'

// A game's settings as a form: one field per setting, in order, with each `group` under
// its own sub-heading. Numbers are typed rather than slid, and only saved on blur/Enter.

type Value = number | boolean | string
type Group = { name?: string; settings: GameSetting[] }

function groupsOf(settings: GameSetting[]): Group[] {
  const groups: Group[] = []
  for (const s of settings) {
    const last = groups.at(-1)
    if (last && last.name === s.group) last.settings.push(s)
    else groups.push({ name: s.group, settings: [s] })
  }
  return groups
}

// Only the changed field: the server merges it onto the current settings.
const set = (id: string, value: Value) => socket.emit('settings:set', { [id]: value })

// `omit` leaves out the settings a control column already shows on their own (SettingField).
export function SettingsForm({ session, omit = [] }: { session: SessionState; omit?: string[] }) {
  const game = GAMES.find((g) => g.id === session.gameId)
  if (!game) return null

  return (
    <div className="form">
      {groupsOf(game.settings.filter((s) => !omit.includes(s.id) && settingVisible(s, game.settings, session.settings))).map((group, i) => {
        const fields = group.settings.map((s) => {
          const field = (
            <Field
              key={`${game.id}:${s.id}`}
              gameId={game.id}
              setting={s}
              value={session.settings[s.id] ?? s.default}
              onChange={(v) => set(s.id, v)}
            />
          )
          return s.when ? (
            <div key={s.id} className="form__sub">
              {field}
            </div>
          ) : (
            field
          )
        })
        return group.name ? (
          <div key={i} className="form__group">
            <h3 className="form__group-title">{group.name}</h3>
            <div className="form__group-body">{fields}</div>
          </div>
        ) : (
          <Fragment key={i}>{fields}</Fragment>
        )
      })}
    </div>
  )
}

// One setting of the current game, outside the form.
export function SettingField({ session, id }: { session: SessionState; id: string }) {
  const game = GAMES.find((g) => g.id === session.gameId)
  const setting = game?.settings.find((s) => s.id === id)
  if (!game || !setting) return null
  return <Field key={`${game.id}:${id}`} gameId={game.id} setting={setting} value={session.settings[id] ?? setting.default} onChange={(v) => set(id, v)} />
}

function Label({ setting }: { setting: GameSetting }) {
  return (
    <span className="form__label">
      {setting.label}
      {setting.hint && (
        <span className="form__hint" title={setting.hint} aria-label={setting.hint} role="img">
          ?
        </span>
      )}
    </span>
  )
}

function Field({
  gameId,
  setting,
  value,
  onChange,
}: {
  gameId: string
  setting: GameSetting
  value: Value
  onChange: (v: Value) => void
}) {
  switch (setting.kind) {
    case 'wordhunt-tiers':
      return <WordHuntHintTiers key={String(value)} value={String(value)} save={onChange} />
    case 'toggle':
      return (
        <label className="form__row switch-row">
          <Label setting={setting} />
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        </label>
      )
    case 'color':
      return (
        <label className="form__row">
          <Label setting={setting} />
          <ColorInput value={String(value)} onChange={onChange} />
        </label>
      )
    case 'number':
      return (
        <label className="form__field">
          <Label setting={setting} />
          <NumberInput setting={setting} value={Number(value)} onChange={onChange} />
        </label>
      )
    case 'select':
      return (
        <label className="form__field">
          <Label setting={setting} />
          <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {setting.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'multi':
      return <MultiPicker setting={setting} value={String(value)} onChange={onChange} />
    case 'image':
      return <ImagePicker gameId={gameId} setting={setting} value={String(value)} onChange={onChange} />
  }
}

function NumberInput({
  setting,
  value,
  onChange,
}: {
  setting: Extract<GameSetting, { kind: 'number' }>
  value: number
  onChange: (v: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(n)) return setDraft(String(value))
    const clamped = Math.min(setting.max, Math.max(setting.min, n))
    setDraft(String(clamped))
    if (clamped !== value) onChange(clamped)
  }
  return (
    <input
      type="number"
      min={setting.min}
      max={setting.max}
      step={setting.step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

// The colour picker reports every step of a drag: save once it settles.
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => { clearTimeout(timer.current); setDraft(value) }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <input
      type="color"
      className="form__color"
      value={draft}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        clearTimeout(timer.current)
        timer.current = window.setTimeout(() => onChange(next), 200)
      }}
    />
  )
}

// '' means every option; unticking the last one is not allowed.
function MultiPicker({
  setting,
  value,
  onChange,
}: {
  setting: Extract<GameSetting, { kind: 'multi' }>
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const all = setting.options.map((o) => o.value)
  const selected = value ? value.split(',') : all
  const summary =
    selected.length === all.length
      ? 'Tutte'
      : selected.length === 1
        ? setting.options.find((o) => o.value === selected[0])?.label
        : `${selected.length} selezionate`
  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
    if (next.length) onChange(next.length === all.length ? '' : all.filter((x) => next.includes(x)).join(','))
  }
  return (
    <div className="form__field">
      <Label setting={setting} />
      <button type="button" className="form__picker" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{summary}</span>
        <span className="form__picker-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <div className="form__checks">
          {setting.options.map((o) => (
            <label key={o.value} className="form__check">
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
          <button type="button" className="btn btn--small btn--ghost" onClick={() => onChange('')}>
            Seleziona tutte
          </button>
        </div>
      )}
    </div>
  )
}

// Uploads the picked file to the server, which hosts it for the overlay.
function ImagePicker({
  gameId,
  setting,
  value,
  onChange,
}: {
  gameId: string
  setting: GameSetting
  value: string
  onChange: (v: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const game = BACKGROUND_GAMES.find((g) => g === gameId) ?? 'zerodubbi'
  const operation = useRef(0)
  const target = useRef(game)
  target.current = game
  useEffect(() => {
    operation.current++
    setBusy(false)
    setError('')
    return () => { operation.current++ }
  }, [game])

  const upload = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { setError('Il file supera 8 MB.'); return }
    const version = ++operation.current
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(backgroundPath(game, overlayKey), {
        method: 'POST',
        headers: { 'content-type': file.type },
        body: file,
      }, 15_000, 32 * 1024)
      if (!res.ok) throw new Error(String(res.status))
      const { url } = (await res.json()) as { url: string }
      if (operation.current === version && target.current === game) onChange(url)
    } catch (error) {
      if (operation.current === version) setError(error instanceof UnconfirmedRequestError ? error.message
        : 'Caricamento non riuscito: usa un PNG, JPG, WebP o GIF fino a 8 MB.')
    } finally {
      if (operation.current === version) setBusy(false)
    }
  }

  return (
    <div className="form__field">
      <Label setting={setting} />
      <div className="image-picker">
        <div className="image-picker__thumb">{value ? <img src={value} alt="Sfondo scelto" /> : 'Nessuna immagine'}</div>
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Caricamento…' : 'Scegli'}
        </button>
        {value && (
          <button type="button" className="btn btn--small btn--ghost" disabled={busy} onClick={() => onChange('')}>
            Rimuovi
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="form__error">{error}</p>}
    </div>
  )
}

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { DJ_SOUNDS, PAD_COLORS, PAD_SLOTS, padFilePath, type Pad, type PadInput, type PadKind } from '@zerocade/shared'
import { overlayKey } from '../overlayKey'
import { socket } from '../socket'
import { useDashboard } from '../store'

// The Sounds and GIFs boards at the top of the right column. A tap plays the pad on the
// overlay. An empty slot, a right-click, or a tap while editing (gear) opens the editor.

const FILE_MAX = 6 * 1024 * 1024

// Some browsers leave File.type empty for audio: fall back on the extension.
const EXT_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  gif: 'image/gif',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}
const typeOf = (file: File) => file.type || EXT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] || ''

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export function Pads() {
  const { pads } = useDashboard()
  const [kind, setKind] = useState<PadKind>('sound')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<{ slot: number; pad?: Pad } | null>(null)
  const [showVolume, setShowVolume] = useState(false)

  const bySlot = new Map((pads?.pads ?? []).filter((p) => p.kind === kind).map((p) => [p.slot, p]))
  const edit = (slot: number) => setDraft({ slot, pad: bySlot.get(slot) })

  return (
    <section className="pads">
      <div className="pads__bar">
        <div className="pads__tabs" role="tablist" aria-label="Pulsanti">
          {(['sound', 'gif'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`pads__tab${kind === k ? ' pads__tab--active' : ''}`}
              onClick={() => {
                setKind(k)
                setDraft(null)
              }}
            >
              {k === 'sound' ? 'Suoni' : 'GIF'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pads__icon"
          title="Volume"
          aria-label="Volume"
          aria-expanded={showVolume}
          onClick={() => setShowVolume(!showVolume)}
        >
          <VolumeIcon muted={pads?.volume === 0} />
        </button>
        <span className="pads__sep" aria-hidden="true" />
        <button
          type="button"
          className="pads__icon pads__icon--stop"
          title="Ferma suoni e GIF sull'overlay"
          aria-label="Ferma suoni e GIF sull'overlay"
          onClick={() => socket.emit('pad:stop')}
        >
          <StopIcon />
        </button>
        <button
          type="button"
          className={`pads__icon${editing ? ' pads__icon--on' : ''}`}
          title="Modifica pulsanti"
          aria-label="Modifica pulsanti"
          aria-pressed={editing}
          onClick={() => {
            setEditing(!editing)
            setDraft(null)
          }}
        >
          <GearIcon />
        </button>
      </div>

      {showVolume && pads && <Volume value={pads.volume} />}

      <div className={`pads__grid${editing ? ' pads__grid--editing' : ''}`}>
        {Array.from({ length: PAD_SLOTS }, (_, slot) => {
          const pad = bySlot.get(slot)
          if (!pad)
            return (
              <button
                key={slot}
                type="button"
                className={`pad pad--empty${draft?.slot === slot ? ' pad--selected' : ''}`}
                aria-label={`Aggiungi ${kind === 'sound' ? 'un suono' : 'una GIF'}`}
                onClick={() => edit(slot)}
              >
                <span aria-hidden="true">+</span>
              </button>
            )
          const style = {
            '--pad': pad.color,
            ...(pad.kind === 'gif' && pad.file ? { backgroundImage: `url(${padFilePath(pad.file)})` } : {}),
          } as CSSProperties
          return (
            <button
              key={pad.id}
              type="button"
              className={`pad pad--${pad.kind}${draft?.slot === slot ? ' pad--selected' : ''}`}
              style={style}
              title={editing ? `Modifica "${pad.label}"` : `${pad.label} (clic destro per modificare)`}
              onClick={() => (editing ? edit(slot) : socket.emit('pad:play', pad.id))}
              onContextMenu={(e) => {
                e.preventDefault()
                edit(slot)
              }}
            >
              <span className="pad__label">{pad.label}</span>
            </button>
          )
        })}
      </div>
      {editing && !draft && <p className="pads__hint">Tocca un pulsante per modificarlo o spostarlo.</p>}

      {draft && (
        <PadEditor
          key={`${kind}-${draft.slot}-${draft.pad?.id ?? 'new'}`}
          kind={kind}
          slot={draft.slot}
          pad={draft.pad}
          labelAt={(slot) => bySlot.get(slot)?.label}
          onClose={() => setDraft(null)}
        />
      )}
    </section>
  )
}

function Volume({ value }: { value: number }) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => setDraft(value), [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  const set = (next: number) => {
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => socket.emit('pad:volume', next), 150)
  }
  return (
    <div className="pads__volume">
      <button type="button" className="pads__icon" aria-label={draft === 0 ? 'Riattiva audio' : 'Muto'} onClick={() => set(draft === 0 ? 0.8 : 0)}>
        <VolumeIcon muted={draft === 0} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={draft}
        aria-label="Volume dei pulsanti"
        onChange={(e) => set(Number(e.target.value))}
      />
      <span className="pads__volume-num">{Math.round(draft * 100)}%</span>
    </div>
  )
}

function PadEditor({
  kind,
  slot,
  pad,
  labelAt,
  onClose,
}: {
  kind: PadKind
  slot: number
  pad?: Pad
  labelAt: (slot: number) => string | undefined
  onClose: () => void
}) {
  const [label, setLabel] = useState(pad?.label ?? '')
  const [color, setColor] = useState(pad?.color ?? PAD_COLORS[slot % PAD_COLORS.length])
  const [position, setPosition] = useState(slot)
  // '' = a file (the current one, or `file` once picked).
  const [soundId, setSoundId] = useState(pad?.soundId ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => () => URL.revokeObjectURL(preview), [preview])

  const pick = (picked?: File) => {
    if (!picked) return
    if (picked.size > FILE_MAX) return setError('Il file supera 6 MB.')
    setError('')
    setFile(picked)
    setSoundId('')
    if (kind === 'gif') setPreview(URL.createObjectURL(picked))
    if (!label.trim()) setLabel(picked.name.replace(/\.[^.]+$/, '').slice(0, 24))
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const input: PadInput = { kind, slot: position, label, color, ...(pad ? { id: pad.id } : {}), ...(soundId ? { soundId } : {}) }
      if (file && !soundId) input.upload = { type: typeOf(file), data: await toBase64(file) }
      const res = await fetch(`/api/pads/${overlayKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (res.ok) return onClose()
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? 'Salvataggio non riuscito.')
    } catch {
      setError('Il server non risponde.')
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    if (pad && window.confirm(`Eliminare "${pad.label}"?`)) {
      socket.emit('pad:remove', pad.id)
      onClose()
    }
  }

  const thumb = preview || (pad?.file && kind === 'gif' ? padFilePath(pad.file) : '')
  const accept = kind === 'sound' ? 'audio/*,.mp3,.wav,.ogg,.m4a' : 'image/gif,image/webp,image/png,image/jpeg'

  return (
    <form className="pad-editor" onSubmit={save}>
      <div className="pad-editor__title">
        {pad ? 'Modifica' : kind === 'sound' ? 'Nuovo suono' : 'Nuova GIF'}
        <span className="text-muted"> · posizione {position + 1}</span>
      </div>

      <label className="form__field">
        <span className="form__label">Nome</span>
        <input type="text" maxLength={24} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Es. Applausi" />
      </label>

      {kind === 'sound' && (
        <label className="form__field">
          <span className="form__label">Suono</span>
          <select value={soundId} onChange={(e) => setSoundId(e.target.value)}>
            <option value="">{file ? `File: ${file.name}` : pad?.file ? 'File caricato' : 'Un file audio…'}</option>
            {DJ_SOUNDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.label} (incluso)
              </option>
            ))}
          </select>
        </label>
      )}

      {(kind === 'gif' || !soundId) && (
        <div className="pad-editor__file">
          {kind === 'gif' && <span className="image-picker__thumb">{thumb ? <img src={thumb} alt="" /> : 'Nessuna GIF'}</span>}
          <label className="btn btn--small">
            {file || pad?.file ? 'Cambia file…' : 'Scegli file…'}
            <input type="file" accept={accept} hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <span className="text-muted small">{kind === 'sound' ? 'MP3, WAV, OGG, M4A' : 'GIF, WebP, PNG, JPG'} · max 6 MB</span>
        </div>
      )}

      <div className="form__field">
        <span className="form__label">Colore</span>
        <div className="pad-editor__colors">
          {PAD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`pad-editor__swatch${color === c ? ' pad-editor__swatch--on' : ''}`}
              style={{ background: c }}
              aria-label={`Colore ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
          <input type="color" className="form__color" value={color} aria-label="Altro colore" onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>

      {pad && (
        <label className="form__field">
          <span className="form__label">Posizione</span>
          <select value={position} onChange={(e) => setPosition(Number(e.target.value))}>
            {Array.from({ length: PAD_SLOTS }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
                {i === slot ? ' (attuale)' : labelAt(i) ? ` · scambia con ${labelAt(i)}` : ' · libera'}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="form__error">{error}</p>}

      <div className="pad-editor__actions">
        <button type="submit" className="btn btn--primary btn--small" disabled={busy || !label.trim()}>
          {busy ? 'Salvo…' : 'Salva'}
        </button>
        <button type="button" className="btn btn--small" onClick={onClose}>
          Annulla
        </button>
        {pad && (
          <button type="button" className="btn btn--small pad-editor__delete" onClick={remove}>
            Elimina
          </button>
        )}
      </div>
    </form>
  )
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {muted ? <path d="m22 9-6 6m0-6 6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2.5" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

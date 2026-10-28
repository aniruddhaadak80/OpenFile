import { useEffect, useState } from 'react'
import { Keyboard } from 'lucide-react'
import { Badge, Switch, cn } from '@/components/ui'
import { KV } from './_b5/shell'

type Ev = { key: string; code: string; keyCode: number; which: number; location: number; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; repeat: boolean; type: string; t: number }
const LOC = ['Standard', 'Left', 'Right', 'Numpad']

export default function KeycodeInfo() {
  const [ev, setEv] = useState<Ev | null>(null)
  const [log, setLog] = useState<Ev[]>([])
  const [prevent, setPrevent] = useState(true)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t?.closest?.('input,textarea,select,[role="switch"]')) return
      if (prevent && !(e.key === 'Tab' || ((e.ctrlKey || e.metaKey) && ['r', 'w', 't', 'l'].includes(e.key.toLowerCase())))) e.preventDefault()
      const x: Ev = { key: e.key, code: e.code, keyCode: e.keyCode, which: e.which, location: e.location, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, repeat: e.repeat, type: e.type, t: Date.now() }
      if (e.type === 'keydown') setEv(x)
      setLog((l) => [x, ...l].slice(0, 30))
    }
    window.addEventListener('keydown', h); window.addEventListener('keyup', h)
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('keyup', h) }
  }, [prevent])
  const label = ev ? (ev.key === ' ' ? 'Space' : ev.key) : ''
  const combo = ev ? [ev.ctrl && 'Ctrl', ev.alt && 'Alt', ev.shift && 'Shift', ev.meta && 'Meta', !['Control', 'Alt', 'Shift', 'Meta'].includes(ev.key) && label].filter(Boolean).join(' + ') : ''
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-muted">Press any key. Works for shortcuts too.</p><Switch checked={prevent} onChange={setPrevent} label="Block browser shortcuts" /></div>
      <div className={cn('grid min-h-56 place-items-center rounded-3xl border-2 border-dashed p-8 text-center transition', ev ? 'border-accent/50 bg-accent/5' : 'border-border bg-surface')} aria-live="polite">
        {ev ? (
          <div className="space-y-3">
            <div className="font-display text-7xl font-bold text-accent tabular-nums">{ev.keyCode}</div>
            <div className="inline-flex min-w-16 items-center justify-center rounded-xl border-b-4 border-border bg-surface-2 px-4 py-2 font-mono text-2xl shadow">{label}</div>
            {combo && combo !== label && <div className="font-mono text-sm text-muted">{combo}</div>}
          </div>
        ) : <div className="space-y-2 text-muted"><Keyboard className="mx-auto size-10" /><div>Waiting for a key press</div></div>}
      </div>
      {ev && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <KV label="event.key" value={JSON.stringify(ev.key)} /><KV label="event.code" value={ev.code} /><KV label="event.keyCode (old)" value={String(ev.keyCode)} /><KV label="event.which (old)" value={String(ev.which)} />
          <KV label="event.location" value={`${ev.location} (${LOC[ev.location]})`} /><KV label="Modifiers" value={['ctrl', 'shift', 'alt', 'meta'].filter((m) => (ev as any)[m]).join(', ') || 'none'} mono={false} /><KV label="Repeat" value={String(ev.repeat)} /><KV label="Char code" value={ev.key.length === 1 ? `U+${ev.key.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}` : ''} />
          <KV label="JavaScript check" value={`if (e.key === ${JSON.stringify(ev.key)}) { … }`} />
          <KV label="By physical key" value={`if (e.code === '${ev.code}') { … }`} />
        </div>
      )}
      {log.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Event log</div>
          <div className="scrollbar-thin max-h-56 space-y-0.5 overflow-auto font-mono text-[12px]">
            {log.map((l, i) => <div key={i} className="flex gap-3"><Badge color={l.type === 'keydown' ? '#14B8A6' : '#A3A3A3'}>{l.type}</Badge><span className="w-24">{JSON.stringify(l.key)}</span><span className="w-28 text-muted">{l.code}</span><span className="text-muted">{l.keyCode}</span></div>)}
          </div>
        </div>
      )}
    </div>
  )
}

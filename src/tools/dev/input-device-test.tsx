import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Tabs, Badge } from '@/components/ui'
import { Stat } from './_b5/shell'

const ROWS: string[][] = [
  ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
  ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
  ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
  ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
  ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'],
]
const WIDE: Record<string, string> = { Backspace: 'flex-[2]', Tab: 'flex-[1.5]', Backslash: 'flex-[1.5]', CapsLock: 'flex-[1.8]', Enter: 'flex-[2.2]', ShiftLeft: 'flex-[2.4]', ShiftRight: 'flex-[2.6]', Space: 'flex-[6]', ControlLeft: 'flex-[1.3]', ControlRight: 'flex-[1.3]' }
const label = (c: string) => c.replace(/^Key/, '').replace(/^Digit/, '').replace(/Left$|Right$/, (m) => (c.startsWith('Arrow') ? '' : m === 'Left' ? ' L' : ' R')).replace('Backquote', '`').replace('Minus', '-').replace('Equal', '=').replace('BracketLeft', '[').replace('BracketRight', ']').replace('Backslash', '\\').replace('Semicolon', ';').replace('Quote', "'").replace('Comma', ',').replace('Period', '.').replace('Slash', '/').replace('Escape', 'Esc').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→').replace('Control', 'Ctrl').replace('Meta', 'Win').replace('ContextMenu', 'Menu')

function Keyboard() {
  const [down, setDown] = useState<Set<string>>(new Set())
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [max, setMax] = useState(0)
  const [last, setLast] = useState<{ key: string; code: string; keyCode: number; location: number } | null>(null)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (!(e.target as HTMLElement)?.closest?.('input,textarea')) e.preventDefault(); setDown((p) => { const n = new Set(p); n.add(e.code); setMax((m) => Math.max(m, n.size)); return n }); setSeen((p) => new Set(p).add(e.code)); setLast({ key: e.key, code: e.code, keyCode: e.keyCode, location: e.location }) }
    const ku = (e: KeyboardEvent) => setDown((p) => { const n = new Set(p); n.delete(e.code); return n })
    const blur = () => setDown(new Set())
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur) }
  }, [])
  const all = ROWS.flat()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Keys tested" value={`${all.filter((k) => seen.has(k)).length} / ${all.length}`} />
        <Stat label="Held now" value={down.size} />
        <Stat label="Most at once (rollover)" value={max} />
        <Stat label="Last key" value={last ? `${last.key === ' ' ? 'Space' : last.key}` : 'none'} sub={last ? `${last.code}, keyCode ${last.keyCode}, location ${last.location}` : 'Press any key'} />
      </div>
      <div className="space-y-1.5 overflow-x-auto rounded-2xl border border-border bg-surface p-3" aria-label="Keyboard map">
        {ROWS.map((r, i) => (
          <div key={i} className="flex min-w-[720px] gap-1.5">
            {r.map((c) => (
              <motion.div key={c} animate={{ scale: down.has(c) ? 0.92 : 1 }} transition={{ duration: 0.08 }} className={`grid h-11 flex-1 place-items-center rounded-lg border text-xs font-medium ${WIDE[c] ?? ''} ${down.has(c) ? 'border-accent bg-accent text-on-accent' : seen.has(c) ? 'border-success/50 bg-success/15' : 'border-border bg-surface-2/40 text-muted'}`}>{label(c)}</motion.div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3"><Button size="sm" variant="ghost" onClick={() => { setSeen(new Set()); setMax(0); setLast(null) }}>Reset</Button><span className="text-sm text-muted">Keys turn green once they have worked. Hold several keys to test rollover. Some system shortcuts cannot be caught by a web page.</span></div>
    </div>
  )
}

function Mouse() {
  const [buttons, setButtons] = useState<Record<number, number>>({})
  const [held, setHeld] = useState<Set<number>>(new Set())
  const [dbl, setDbl] = useState<number[]>([])
  const [wheel, setWheel] = useState({ up: 0, down: 0, left: 0, right: 0 })
  const [hz, setHz] = useState(0)
  const [chatter, setChatter] = useState(0)
  const lastDown = useRef<Record<number, number>>({})
  const moves = useRef<number[]>([])
  const area = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = area.current; if (!el) return
    const wh = (e: WheelEvent) => { e.preventDefault(); setWheel((w) => ({ up: w.up + (e.deltaY < 0 ? 1 : 0), down: w.down + (e.deltaY > 0 ? 1 : 0), left: w.left + (e.deltaX < 0 ? 1 : 0), right: w.right + (e.deltaX > 0 ? 1 : 0) })) }
    el.addEventListener('wheel', wh, { passive: false })
    return () => el.removeEventListener('wheel', wh)
  }, [])
  const NAMES = ['Left', 'Middle', 'Right', 'Back', 'Forward']
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Polling rate" value={hz ? `${hz} Hz` : 'move the mouse'} sub="Move fast inside the box" />
        <Stat label="Double click gap" value={dbl.length ? `${dbl[dbl.length - 1]} ms` : 'n/a'} sub={dbl.length ? `fastest ${Math.min(...dbl)} ms` : 'Double click in the box'} />
        <Stat label="Possible chatter" value={chatter} sub="Clicks under 60 ms apart" />
        <Stat label="Wheel" value={`↑${wheel.up} ↓${wheel.down}`} sub={`← ${wheel.left}  → ${wheel.right}`} />
      </div>
      <div ref={area} tabIndex={0} onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => { const now = performance.now(); const prev = lastDown.current[e.button]; if (prev && now - prev < 60) setChatter((c) => c + 1); if (prev && now - prev < 500) setDbl((d) => [...d.slice(-20), Math.round(now - prev)]); lastDown.current[e.button] = now; setButtons((b) => ({ ...b, [e.button]: (b[e.button] ?? 0) + 1 })); setHeld((h) => new Set(h).add(e.button)) }}
        onPointerUp={(e) => setHeld((h) => { const n = new Set(h); n.delete(e.button); return n })}
        onPointerMove={(e) => { const t = e.timeStamp; const arr = moves.current; arr.push(t); while (arr.length && t - arr[0] > 1000) arr.shift(); const coalesced = (e.nativeEvent as PointerEvent).getCoalescedEvents?.().length ?? 1; if (arr.length > 20) setHz(Math.round(arr.length * Math.max(1, coalesced))) }}
        className="grid h-72 select-none place-items-center rounded-2xl border-2 border-dashed border-border bg-surface text-center outline-none focus:border-accent">
        <div>
          <div className="mx-auto mb-4 flex w-40 gap-1">
            {[0, 1, 2].map((b) => <div key={b} className={`h-16 flex-1 rounded-t-2xl border ${held.has(b) ? 'border-accent bg-accent' : buttons[b] ? 'border-success/50 bg-success/15' : 'border-border bg-surface-2/50'}`} />)}
          </div>
          <div className="flex flex-wrap justify-center gap-2">{NAMES.map((n, i) => <Badge key={n}>{n}: {buttons[i] ?? 0}</Badge>)}</div>
          <p className="mt-3 text-sm text-muted">Click every button, scroll, and move the mouse here</p>
        </div>
      </div>
    </div>
  )
}

function Gamepad() {
  const [pads, setPads] = useState<(Gamepad | null)[]>([])
  useEffect(() => {
    let raf = 0
    const loop = () => { setPads(Array.from(navigator.getGamepads?.() ?? [])); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  const list = pads.filter(Boolean) as Gamepad[]
  if (!list.length) return <div className="grid h-60 place-items-center rounded-2xl border-2 border-dashed border-border text-center text-sm text-muted">Connect a controller and press any button on it</div>
  return (
    <div className="space-y-4">
      {list.map((p) => (
        <div key={p.index} className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2"><span className="font-semibold">{p.id}</span><Badge>{p.mapping || 'non-standard'} mapping</Badge><Badge>{p.buttons.length} buttons, {p.axes.length} axes</Badge>
            {p.vibrationActuator && <Button size="sm" variant="outline" className="ml-auto" onClick={() => (p.vibrationActuator as unknown as { playEffect: (t: string, o: object) => void }).playEffect('dual-rumble', { duration: 400, strongMagnitude: 0.8, weakMagnitude: 0.5 })}>Test rumble</Button>}
          </div>
          <div className="mb-4 flex flex-wrap gap-4">
            {Array.from({ length: Math.ceil(p.axes.length / 2) }, (_, i) => (
              <div key={i} className="text-center">
                <div className="relative size-28 rounded-full border border-border bg-surface-2/40">
                  <div className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${50 + (p.axes[i * 2] ?? 0) * 45}%`, top: `${50 + (p.axes[i * 2 + 1] ?? 0) * 45}%` }} />
                </div>
                <div className="mt-1 font-mono text-xs text-muted">{(p.axes[i * 2] ?? 0).toFixed(2)}, {(p.axes[i * 2 + 1] ?? 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {p.buttons.map((b, i) => (
              <div key={i} className="relative overflow-hidden rounded-lg border border-border bg-surface-2/40 px-2 py-2 text-center text-xs">
                <div className="absolute inset-x-0 bottom-0 bg-accent/60" style={{ height: `${b.value * 100}%` }} />
                <span className={`relative ${b.pressed ? 'font-bold' : 'text-muted'}`}>B{i}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Touch() {
  const [pts, setPts] = useState<{ id: number; x: number; y: number }[]>([])
  const [max, setMax] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const upd = (e: React.PointerEvent, remove = false) => {
    const r = ref.current!.getBoundingClientRect()
    setPts((p) => { const n = p.filter((q) => q.id !== e.pointerId); if (!remove) n.push({ id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top }); setMax((m) => Math.max(m, n.length)); return n })
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2"><Stat label="Touch points now" value={pts.length} /><Stat label="Most at once" value={max} sub={`Device reports up to ${navigator.maxTouchPoints || 0}`} /></div>
      <div ref={ref} onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); upd(e) }} onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') upd(e) }} onPointerUp={(e) => upd(e, true)} onPointerCancel={(e) => upd(e, true)} style={{ touchAction: 'none' }} className="relative h-80 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface">
        {!pts.length && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Touch here with several fingers</div>}
        {pts.map((p, i) => <div key={p.id} className="pointer-events-none absolute grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-accent bg-accent/20 font-bold" style={{ left: p.x, top: p.y }}>{i + 1}</div>)}
      </div>
    </div>
  )
}

export default function InputDeviceTest() {
  const [tab, setTab] = useState<'keyboard' | 'mouse' | 'gamepad' | 'touch'>('keyboard')
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'keyboard', label: 'Keyboard' }, { value: 'mouse', label: 'Mouse' }, { value: 'gamepad', label: 'Gamepad' }, { value: 'touch', label: 'Touch' }]} />
      {tab === 'keyboard' ? <Keyboard /> : tab === 'mouse' ? <Mouse /> : tab === 'gamepad' ? <Gamepad /> : <Touch />}
    </div>
  )
}

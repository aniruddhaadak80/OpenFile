import { useMemo, useState } from 'react'
import { Card, Label, Segmented, Textarea, Input } from '@/components/ui'
import { Stat, Stats } from '@/lib/cf/ui'

/** Parse 1:30:15, 90:00, 1h 20m 5s, 2.5h, 45m, 300s or plain minutes into seconds. Leading - subtracts. */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase(); if (!t) return null
  const neg = t.startsWith('-'), b = t.replace(/^[-+]\s*/, '')
  let v: number | null = null
  if (/^\d+(:\d{1,2}){1,2}(\.\d+)?$/.test(b)) { const p = b.split(':').map(Number); v = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1] }
  else if (/[dhms]/.test(b)) { let sum = 0, ok = false; for (const m of b.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g)) { ok = true; const n = +m[1], u = m[2][0]; sum += n * (u === 'd' ? 86400 : u === 'h' ? 3600 : u === 'm' ? 60 : 1) } v = ok ? sum : null }
  else if (/^\d+(\.\d+)?$/.test(b)) v = +b * 60
  return v == null ? null : neg ? -v : v
}
export const fmtDur = (sec: number, ms = false) => { const neg = sec < 0, a = Math.abs(sec), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60; return `${neg ? '-' : ''}${h}:${String(m).padStart(2, '0')}:${(ms ? s.toFixed(2) : String(Math.round(s))).padStart(2, '0')}` }

export default function DurationCalculator() {
  const [mode, setMode] = useState<'sum' | 'convert' | 'between'>('sum')
  const [text, setText] = useState('1:20:00\n45m\n2h 15m\n-10m\n0:32:30'), [conv, setConv] = useState('2.75h'), [a, setA] = useState('08:45'), [b, setB] = useState('17:20')
  const lines = useMemo(() => text.split('\n').map((l) => ({ l, v: parseDuration(l) })), [text])
  const total = lines.reduce((s, x) => s + (x.v ?? 0), 0), bad = lines.filter((x) => x.l.trim() && x.v == null).length
  const cv = parseDuration(conv)
  const between = (() => { const p = (s: string) => { const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/); return m ? +m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0) : null }; const x = p(a), y = p(b); if (x == null || y == null) return null; let d = y - x; if (d < 0) d += 86400; return d })()
  const show = (sec: number) => <Stats cols={4}><Stat label="h:mm:ss" value={fmtDur(sec)} tone="good" /><Stat label="Decimal hours" value={(sec / 3600).toFixed(3)} /><Stat label="Minutes" value={(sec / 60).toFixed(2)} /><Stat label="Seconds" value={Math.round(sec).toLocaleString()} /></Stats>
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'sum', label: 'Add up times' }, { value: 'convert', label: 'Convert' }, { value: 'between', label: 'Time between' }]} />
      {mode === 'sum' && <><div><Label hint={bad ? `${bad} lines not understood` : `${lines.filter((x) => x.v != null).length} values`}>One duration per line (1:20:00, 45m, 2h 15m, 1.5h, -10m). A short 1:45 means 1 min 45 s, so write 1:45:00 or 1h 45m for hours</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-44" /></div>{show(total)}<Card className="text-xs text-muted">Average {fmtDur(total / Math.max(1, lines.filter((x) => x.v != null).length))} per line. Plain numbers count as minutes.</Card></>}
      {mode === 'convert' && <><div><Label>Duration</Label><Input value={conv} onChange={(e) => setConv(e.target.value)} className="font-mono" /></div>{cv != null ? show(cv) : <p className="text-sm text-warn">Type something like 2.75h, 165m or 2:45:00.</p>}</>}
      {mode === 'between' && <><div className="grid grid-cols-2 gap-3"><div><Label>From</Label><Input type="time" step={1} value={a} onChange={(e) => setA(e.target.value)} /></div><div><Label>To</Label><Input type="time" step={1} value={b} onChange={(e) => setB(e.target.value)} /></div></div>{between != null && show(between)}<p className="text-xs text-muted">If the end is earlier than the start, it counts past midnight.</p></>}
    </div>
  )
}

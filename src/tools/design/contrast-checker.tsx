import { useMemo } from 'react'
import { Input } from '@/components/ui'
import { Bar, Stat, useStored } from '../dev/_b5/shell'
import { wcag } from '@/lib/b11/text'

export default function ContrastChecker() {
  const [fg, setFg] = useStored('b11:cc:fg', '#F5A524')
  const [bg, setBg] = useStored('b11:cc:bg', '#000000')
  const ok = (h: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)
  const r = useMemo(() => (ok(fg) && ok(bg) ? wcag(fg, bg) : null), [fg, bg])
  const yn = (b: boolean) => (b ? 'Pass' : 'Fail')
  return <div className="space-y-4"><Bar><label className="text-sm">Text</label><input type="color" value={ok(fg) && fg.length === 7 ? fg : '#000000'} onChange={(e) => setFg(e.target.value)} aria-label="Text colour" /><Input value={fg} onChange={(e) => setFg(e.target.value)} className="w-28" /><label className="text-sm">Background</label><input type="color" value={ok(bg) && bg.length === 7 ? bg : '#000000'} onChange={(e) => setBg(e.target.value)} aria-label="Background colour" /><Input value={bg} onChange={(e) => setBg(e.target.value)} className="w-28" /></Bar>{r ? <><div className="rounded-2xl border border-border p-8 text-center" style={{ background: bg, color: fg }}><div className="text-3xl font-bold">Sample heading</div><p className="mt-2">The quick brown fox jumps over the lazy dog.</p></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Stat label="Ratio" value={r.ratio.toFixed(2) + ':1'} /><Stat label="AA text" value={yn(r.aaText)} /><Stat label="AA large" value={yn(r.aaLarge)} /><Stat label="AAA text" value={yn(r.aaaText)} /><Stat label="AAA large" value={yn(r.aaaLarge)} /></div></> : <p className="text-sm text-muted">Enter colours as hex, for example #F5A524.</p>}</div>
}

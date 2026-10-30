import { useMemo, useState } from 'react'
import { safeBlobUrl } from '@/lib/safe'
import { Plus, X } from 'lucide-react'
import { Button, Card, Dropzone, Input, Label, Segmented } from '@/components/ui'
import { TITLE_LIMITS } from '@/lib/cf/creator'
import { truncatePx } from '@/lib/cf/web'
import { useObjectUrl } from '@/lib/bcat/kit'

let measureCtx: CanvasRenderingContext2D | null = null
const measurer = (size: number) => (s: string) => { if (typeof document === 'undefined') return s.length * size * 0.55; measureCtx ??= document.createElement('canvas').getContext('2d'); measureCtx!.font = `500 ${size}px Roboto, Arial, sans-serif`; return measureCtx!.measureText(s).width }
interface Variant { title: string; file: File | null }

function Thumb({ file, className, dur = '12:34' }: { file: File | null; className?: string; dur?: string }) {
  const url = useObjectUrl(file)
  return (
    <div className={`relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-amber-500/40 via-teal-700/40 to-sky-800/40 ${className ?? ''}`}>
      {url && <img src={safeBlobUrl(url)} alt="" className="size-full object-cover" />}
      <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-semibold text-white">{dur}</span>
    </div>
  )
}

export default function YoutubePreview() {
  const [vars, setVars] = useState<Variant[]>([{ title: 'I Tried Every Free PDF Tool So You Do Not Have To (The Winner Surprised Me)', file: null }])
  const [channel, setChannel] = useState('OpenFile')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [cur, setCur] = useState(0)
  const v = vars[cur]
  const rows = useMemo(() => TITLE_LIMITS.map((l) => ({ ...l, ...truncatePx(v.title, l.px * 2, l.size, measurer(l.size)) })), [v.title])
  const upd = (p: Partial<Variant>) => setVars(vars.map((x, i) => (i === cur ? { ...x, ...p } : x)))
  const bg = theme === 'dark' ? 'bg-[#0f0f0f] text-white' : 'bg-white text-[#0f0f0f]', sub = theme === 'dark' ? 'text-[#aaa]' : 'text-[#606060]'
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div className={`space-y-5 rounded-2xl p-4 ${bg}`}>
          <div><div className={`mb-2 text-[11px] uppercase tracking-wide ${sub}`}>Home feed</div>
            <div className="grid gap-4 sm:grid-cols-3">{vars.map((x, i) => <div key={i} className={`space-y-2 ${i === cur ? '' : 'opacity-90'}`}><Thumb file={x.file} /><div className="flex gap-2"><div className="size-8 shrink-0 rounded-full bg-gradient-brand" /><div className="min-w-0"><div className="line-clamp-2 text-sm font-medium leading-snug">{x.title}</div><div className={`text-xs ${sub}`}>{channel} · 12K views · 2 days ago</div></div></div></div>)}</div></div>
          <div><div className={`mb-2 text-[11px] uppercase tracking-wide ${sub}`}>Search results</div>
            <div className="flex gap-3"><Thumb file={v.file} className="w-60 shrink-0" /><div className="min-w-0"><div className="line-clamp-2 text-lg leading-snug">{v.title}</div><div className={`mt-1 text-xs ${sub}`}>12K views · 2 days ago</div><div className={`mt-2 text-xs ${sub}`}>{channel}</div></div></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className={`mb-2 text-[11px] uppercase tracking-wide ${sub}`}>Up next sidebar</div><div className="flex gap-2"><Thumb file={v.file} className="w-40 shrink-0" /><div className="min-w-0"><div className="line-clamp-2 text-sm font-medium leading-snug">{v.title}</div><div className={`text-xs ${sub}`}>{channel}</div><div className={`text-xs ${sub}`}>12K views</div></div></div></div>
            <div><div className={`mb-2 text-[11px] uppercase tracking-wide ${sub}`}>Phone</div><div className="w-56"><Thumb file={v.file} /><div className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug">{v.title}</div><div className={`text-[11px] ${sub}`}>{channel} · 12K views</div></div></div>
          </div>
          <div><div className={`mb-2 text-[11px] uppercase tracking-wide ${sub}`}>Tiny (how most people first see it)</div><Thumb file={v.file} className="w-[120px]" /></div>
        </div>
        <Card className="p-0"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted"><th className="px-4 py-2">Where</th><th className="px-4 py-2">Shown as</th><th className="px-4 py-2">Fits</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-border/60"><td className="px-4 py-2 whitespace-nowrap">{r.label}</td><td className="px-4 py-2">{r.text}</td><td className={`px-4 py-2 font-medium ${r.cut ? 'text-warn' : 'text-success'}`}>{r.cut ? 'Cut off' : 'Yes'}</td></tr>)}</tbody></table></Card>
      </div>
      <Card className="space-y-4 self-start">
        <div className="flex flex-wrap gap-1.5">{vars.map((_, i) => <button key={i} onClick={() => setCur(i)} className={`rounded-lg border px-2.5 py-1 text-xs cursor-pointer ${i === cur ? 'border-accent text-fg' : 'border-border text-muted'}`}>Version {String.fromCharCode(65 + i)}</button>)}
          {vars.length < 3 && <button onClick={() => { setVars([...vars, { title: v.title, file: null }]); setCur(vars.length) }} className="rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted hover:text-fg cursor-pointer"><Plus className="inline size-3" /> Compare</button>}</div>
        <div><Label hint={`${v.title.length} / 100`}>Title</Label><Input value={v.title} maxLength={100} onChange={(e) => upd({ title: e.target.value })} /></div>
        <Dropzone compact accept="image/*" onFiles={(f) => upd({ file: f[0] })} label={v.file ? `Thumbnail: ${v.file.name}` : 'Add your thumbnail'} sub="1280×720 works best" />
        <div><Label>Channel name</Label><Input value={channel} onChange={(e) => setChannel(e.target.value)} /></div>
        <div><Label>App theme</Label><Segmented value={theme} onChange={setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></div>
        {vars.length > 1 && <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={() => { setVars(vars.filter((_, i) => i !== cur)); setCur(0) }}>Remove this version</Button>}
        <p className="text-xs text-muted">Nothing is uploaded. Widths use your browser fonts, so they are close to what the app shows. Keep the key words in the first 40 characters.</p>
      </Card>
    </div>
  )
}

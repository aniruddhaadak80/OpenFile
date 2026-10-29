import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button, Dropzone, Label, Progress, ToolGrid, ErrorNote } from '@/components/ui'
import { formatBytes, downloadBlob } from '@/lib/files'
import { parseHealthChunk, healthName, type HealthRecord } from '@/lib/r13/health'
import { toCsv } from '@/lib/bcat/kit'

interface TypeSum { type: string; count: number; unit: string; first: string; last: string; daily: Map<string, { sum: number; n: number }> }
const SUMMED = /StepCount|DistanceWalkingRunning|DistanceCycling|FlightsClimbed|ActiveEnergyBurned|BasalEnergyBurned|AppleExerciseTime|Workout:/

export default function AppleHealthExport() {
  const [file, setFile] = useState<File | null>(null)
  const [prog, setProg] = useState<number | null>(null)
  const [types, setTypes] = useState<TypeSum[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pick, setPick] = useState<Set<string>>(new Set())
  const stop = useRef(false)
  const recs = useRef(new Map<string, HealthRecord[]>())

  const open = async (f0: File) => {
    setError(null); setTypes([]); stop.current = false; recs.current = new Map()
    try {
      let f = f0
      if (/\.zip$/i.test(f0.name)) {
        setProg(0)
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(f0)
        const entry = Object.values(zip.files).find((e) => /export\.xml$/i.test(e.name) && !/cda/i.test(e.name))
        if (!entry) throw new Error('No export.xml inside this ZIP. Export from the Health app: profile picture, Export All Health Data.')
        f = new File([await entry.async('blob')], 'export.xml')
      }
      setFile(f0)
      const sums = new Map<string, TypeSum>()
      const CH = 4 << 20
      let rest = ''
      const dec = new TextDecoder()
      for (let o = 0; o < f.size; o += CH) {
        if (stop.current) throw new Error('Stopped. The part read so far is shown.')
        const text = rest + dec.decode(new Uint8Array(await f.slice(o, o + CH).arrayBuffer()), { stream: o + CH < f.size })
        const r = parseHealthChunk(text)
        rest = r.rest
        for (const x of r.records) {
          const s = sums.get(x.type) ?? { type: x.type, count: 0, unit: x.unit, first: x.start, last: x.start, daily: new Map() }
          s.count++; if (x.start < s.first) s.first = x.start; if (x.start > s.last) s.last = x.start
          const day = x.start.slice(0, 10), v = parseFloat(x.value)
          if (isFinite(v)) { const d = s.daily.get(day) ?? { sum: 0, n: 0 }; d.sum += v; d.n++; s.daily.set(day, d) }
          sums.set(x.type, s)
          const list = recs.current.get(x.type) ?? []; if (list.length < 2_000_000) list.push(x); recs.current.set(x.type, list)
        }
        setProg(Math.min(1, (o + CH) / f.size))
        await new Promise((res) => setTimeout(res, 0))
      }
      const list = [...sums.values()].sort((a, b) => b.count - a.count)
      setTypes(list); setPick(new Set(list.slice(0, 6).map((t) => t.type)))
    } catch (e: any) { setError(e?.message || String(e)); setTypes((t) => t) } finally { setProg(null) }
  }
  const csvFor = (t: string) => toCsv([['type', 'start', 'end', 'value', 'unit', 'source'], ...(recs.current.get(t) ?? []).map((r) => [healthName(r.type), r.start, r.end, r.value, r.unit, r.source])])
  const dailyFor = (s: TypeSum) => toCsv([['date', SUMMED.test(s.type) ? 'total' : 'average', 'samples', 'unit'], ...[...s.daily.entries()].sort().map(([d, v]) => [d, (SUMMED.test(s.type) ? v.sum : v.sum / v.n).toFixed(2), v.n, s.unit])])
  const zipAll = async () => {
    const JSZip = (await import('jszip')).default
    const z = new JSZip()
    for (const t of pick) { const s = types.find((x) => x.type === t)!; const nm = healthName(t).replace(/[^\w]+/g, '-').toLowerCase(); z.file(`${nm}.csv`, csvFor(t)); z.file(`${nm}-daily.csv`, dailyFor(s)) }
    downloadBlob(await z.generateAsync({ type: 'blob' }), 'apple-health-csv.zip')
  }
  return (
    <ToolGrid
      main={<>
        {!file ? <Dropzone accept=".xml,.zip" onFiles={(f) => f[0] && open(f[0])} label="Drop export.zip or export.xml from Apple Health" sub="The file can be several GB. It is read in small pieces on your device, so nothing is uploaded and the page stays responsive." />
          : <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate font-medium">{file.name}</span><span className="text-xs text-muted">{formatBytes(file.size)}</span></div>}
        {prog != null && <div className="space-y-2"><Progress value={prog} label="Reading health records" /><Button variant="outline" size="sm" icon={<X className="size-4" />} onClick={() => { stop.current = true }}>Stop</Button></div>}
        <ErrorNote error={error} />
        {types.length > 0 && <div className="overflow-hidden rounded-2xl border border-border"><table className="w-full text-sm"><thead className="bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2"><span className="sr-only">Pick</span></th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Records</th><th className="px-3 py-2">From</th><th className="px-3 py-2">To</th><th className="px-3 py-2" /></tr></thead>
          <tbody>{types.map((t) => <tr key={t.type} className="border-t border-border"><td className="px-3 py-1.5"><input type="checkbox" aria-label={`Include ${healthName(t.type)}`} checked={pick.has(t.type)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(t.type); else n.delete(t.type); return n })} className="accent-[var(--accent)]" /></td><td className="px-3 py-1.5">{healthName(t.type)}<span className="ml-1 text-xs text-muted">{t.unit}</span></td><td className="px-3 py-1.5 text-right font-mono">{t.count.toLocaleString()}</td><td className="px-3 py-1.5 font-mono text-xs">{t.first.slice(0, 10)}</td><td className="px-3 py-1.5 font-mono text-xs">{t.last.slice(0, 10)}</td>
            <td className="px-3 py-1.5 text-right"><button type="button" className="text-xs text-accent hover:underline cursor-pointer" onClick={() => downloadBlob(new Blob([dailyFor(t)], { type: 'text/csv' }), `${healthName(t.type).replace(/\W+/g, '-').toLowerCase()}-daily.csv`)}>Daily CSV</button></td></tr>)}</tbody></table></div>}
      </>}
      side={<>
        <Label>Export</Label>
        <Button className="w-full" disabled={!pick.size} onClick={zipAll}>Download {pick.size} types as CSV (ZIP)</Button>
        <p className="text-xs text-muted">Each type gives one CSV with every record and one with a total (steps, distance, energy) or average (heart rate, weight) per day.</p>
        {file && <Button variant="ghost" className="w-full" onClick={() => { setFile(null); setTypes([]); recs.current = new Map() }}>Open another export</Button>}
        <p className="text-xs text-muted">On iPhone: Health app, tap your picture, Export All Health Data, then save the ZIP to Files and open it here.</p>
      </>}
    />
  )
}

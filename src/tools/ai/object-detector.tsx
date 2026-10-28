import { useMemo, useState } from 'react'
import { ScanSearch } from 'lucide-react'
import { Button, Dropzone, Label, Slider, ToolGrid, Empty } from '@/components/ui'
import { baseName, canvasToBlob, loadImage } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { useObjectUrl, DlButton, Pill, pal, toCsv } from '@/lib/bcat/kit'

interface Det { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }

export default function ObjectDetector() {
  const [file, setFile] = useState<File | null>(null)
  const [dets, setDets] = useState<Det[] | null>(null)
  const [min, setMin] = useState(50)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const url = useObjectUrl(file)
  const ai = useVision(VMODELS.detect)

  const go = () => ai.run(async () => {
    const r = await ai.infer<Det[]>(file, { threshold: 0.2, maxSide: 800 })
    setDets(r.sort((a, b) => b.score - a.score))
  })
  const shown = useMemo(() => (dets ?? []).filter((d) => d.score * 100 >= min && !hidden.has(d.label)), [dets, min, hidden])
  const labels = useMemo(() => [...new Set((dets ?? []).filter((d) => d.score * 100 >= min).map((d) => d.label))], [dets, min])
  const counts = (l: string) => (dets ?? []).filter((d) => d.label === l && d.score * 100 >= min).length
  const color = (l: string) => pal(labels.indexOf(l))

  const annotated = async () => {
    const img = await loadImage(file!)
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0)
    const lw = Math.max(2, Math.round(c.width / 300)), fs = Math.max(12, Math.round(c.width / 50))
    ctx.font = `600 ${fs}px system-ui, sans-serif`
    for (const d of shown) {
      const x = d.box.xmin * c.width, y = d.box.ymin * c.height, w = (d.box.xmax - d.box.xmin) * c.width, h = (d.box.ymax - d.box.ymin) * c.height
      ctx.strokeStyle = color(d.label); ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h)
      const t = `${d.label} ${Math.round(d.score * 100)}%`, tw = ctx.measureText(t).width + fs * 0.6
      ctx.fillStyle = color(d.label); ctx.fillRect(x, Math.max(0, y - fs * 1.4), tw, fs * 1.4)
      ctx.fillStyle = '#000'; ctx.fillText(t, x + fs * 0.3, Math.max(fs, y - fs * 0.35))
    }
    return canvasToBlob(c, 'image/png')
  }

  if (!file) return <Dropzone accept="image/*" onFiles={(f) => { setFile(f[0]); setDets(null) }} label="Drop a photo to find objects" sub="People, cars, animals, food and 70 more everyday things. Runs on your device." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { ai.cancel(); setFile(null); setDets(null) }} />
          <div className="relative overflow-hidden rounded-2xl border border-border checker">
            {url && <img src={url} alt="Your photo" className="block w-full" />}
            {shown.map((d, i) => (
              <div key={i} className="absolute rounded-sm border-2" style={{ left: `${d.box.xmin * 100}%`, top: `${d.box.ymin * 100}%`, width: `${(d.box.xmax - d.box.xmin) * 100}%`, height: `${(d.box.ymax - d.box.ymin) * 100}%`, borderColor: color(d.label) }}>
                <span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[11px] font-semibold text-black" style={{ background: color(d.label) }}>{d.label} {Math.round(d.score * 100)}%</span>
              </div>
            ))}
          </div>
          {dets && !shown.length && <Empty>No objects above {min}% confidence. Lower the slider to see weaker matches.</Empty>}
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} />
          <Slider label="Minimum confidence" value={min} onChange={setMin} min={20} max={95} suffix="%" />
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<ScanSearch className="size-4" />} loading={ai.busy} onClick={go}>{dets ? 'Run again' : 'Find objects'}</Button>
          {dets && labels.length > 0 && (
            <>
              <div><Label>Found ({shown.length})</Label>
                <div className="flex flex-wrap gap-1.5">{labels.map((l) => <Pill key={l} color={color(l)} active={!hidden.has(l)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(l)) n.delete(l); else n.add(l); return n })}>{l} × {counts(l)}</Pill>)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <DlButton variant="primary" name={baseName(file.name) + '-objects.png'} data={annotated}>Annotated PNG</DlButton>
                <DlButton name={baseName(file.name) + '-objects.json'} mime="application/json" data={() => JSON.stringify(shown.map((d) => ({ label: d.label, score: +d.score.toFixed(4), box: d.box })), null, 2)}>JSON</DlButton>
                <DlButton name={baseName(file.name) + '-objects.csv'} mime="text/csv" data={() => toCsv([['label', 'score', 'xmin', 'ymin', 'xmax', 'ymax'], ...shown.map((d) => [d.label, d.score.toFixed(3), d.box.xmin.toFixed(4), d.box.ymin.toFixed(4), d.box.xmax.toFixed(4), d.box.ymax.toFixed(4)])])}>CSV</DlButton>
              </div>
            </>
          )}
          <p className="text-xs text-muted">Box positions are saved as fractions of the image size (0 to 1), so they work at any resolution.</p>
        </>
      }
    />
  )
}

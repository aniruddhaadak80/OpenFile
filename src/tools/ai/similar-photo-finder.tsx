import { useMemo, useState } from 'react'
import { Images, Check } from 'lucide-react'
import { Button, Dropzone, Label, Slider, ToolGrid, Empty, cn } from '@/components/ui'
import { formatBytes, zipFiles } from '@/lib/files'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { dHash, hamming, groupBy, dot } from '@/lib/bcat/quick'
import { useObjectUrl, toCsv, DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

interface Item { file: File; w: number; h: number; hash?: string; vec?: number[] }

async function hashOf(file: File) {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas'); c.width = 9; c.height = 8
  const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bmp, 0, 0, 9, 8)
  const d = ctx.getImageData(0, 0, 9, 8).data, g: number[] = []
  for (let i = 0; i < 72; i++) g.push(d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114)
  const r = { w: bmp.width, h: bmp.height, hash: dHash(g) }; bmp.close(); return r
}
function Thumb({ file, keep, onClick }: { file: File; keep: boolean; onClick: () => void }) {
  const u = useObjectUrl(file)
  return (
    <button type="button" onClick={onClick} aria-pressed={keep} className={cn('relative overflow-hidden rounded-xl border-2 text-left cursor-pointer', keep ? 'border-accent' : 'border-border opacity-60')}>
      {u ? <img src={u} alt={file.name} className="aspect-square w-full object-cover" /> : <div className="aspect-square skeleton" />}
      <span className={cn('absolute right-1 top-1 grid size-5 place-items-center rounded-full text-[10px]', keep ? 'bg-accent text-on-accent' : 'bg-black/60 text-white')}>{keep ? <Check className="size-3" /> : ''}</span>
    </button>
  )
}

export default function SimilarPhotoFinder() {
  const [items, setItems] = useState<Item[]>([])
  const [done, setDone] = useState(false)
  const [strict, setStrict] = useState(60)
  const [drop, setDrop] = useState<Set<number>>(new Set())
  const ai = useVision(VMODELS.clipEmbed, { quick: true })

  const add = (fs: File[]) => { setItems((p) => [...p, ...fs.map((file) => ({ file, w: 0, h: 0 }))]); setDone(false) }

  const go = () => ai.run(async () => {
    ai.setStatus('Reading photos')
    const next: Item[] = []
    for (let i = 0; i < items.length; i++) { try { next.push({ ...items[i], ...(await hashOf(items[i].file)) }) } catch { next.push(items[i]) } ai.setProgress((i + 1) / items.length) }
    if (ai.engine === 'ai') { const vecs = await ai.infer<number[][]>(next.map((i) => i.file)); vecs.forEach((v, i) => { next[i].vec = v }) }
    setItems(next); setDone(true); setDrop(new Set())
  })

  const groups = useMemo(() => {
    if (!done) return []
    const idx = items.map((_, i) => i)
    const g = ai.engine === 'ai'
      ? groupBy(idx, (a, b) => !!items[a].vec?.length && !!items[b].vec?.length && dot(items[a].vec!, items[b].vec!) >= 0.86 + (strict / 100) * 0.12)
      : groupBy(idx, (a, b) => !!items[a].hash && !!items[b].hash && hamming(items[a].hash!, items[b].hash!) <= Math.round(16 - (strict / 100) * 14))
    return g.map((grp) => grp.sort((a, b) => items[b].w * items[b].h - items[a].w * items[a].h || items[b].file.size - items[a].file.size))
  }, [done, items, strict, ai.engine])

  const autoPick = () => setDrop(new Set(groups.flatMap((g) => g.slice(1))))
  const kept = items.map((it, i) => ({ it, i })).filter(({ i }) => !drop.has(i))
  const freed = [...drop].reduce((s, i) => s + items[i].file.size, 0)

  if (!items.length) return <Dropzone multiple accept="image/*" onFiles={add} label="Drop a folder of photos" sub="Finds near duplicates and look-alike shots, then helps you keep the best one. Runs on your device." />
  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2"><Stat label="Photos" value={items.length} /><Stat label="Similar groups" value={done ? groups.length : '-'} /><Stat label="Space freed" value={formatBytes(freed)} /></div>
          {!done && <Empty>Press Find similar photos to compare {items.length} photos.</Empty>}
          {done && !groups.length && <Empty>No similar photos found at this strictness. Move the slider toward Loose to find looser matches.</Empty>}
          {groups.map((g, k) => (
            <div key={k} className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-2 text-xs text-muted">Group {k + 1} · {g.length} photos · tap a photo to keep or drop it</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {g.map((i) => <div key={i} className="space-y-1"><Thumb file={items[i].file} keep={!drop.has(i)} onClick={() => setDrop((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })} /><div className="truncate text-[10px] text-muted">{items[i].w}×{items[i].h} · {formatBytes(items[i].file.size)}</div></div>)}
              </div>
            </div>
          ))}
          <Dropzone compact multiple accept="image/*" onFiles={add} label="Add more photos" />
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} quickLabel="Fingerprint" quickNote="Fingerprint mode compares tiny image hashes. Instant and no download, great for resized or re-saved copies, weaker for different shots of the same scene." />
          <div><Label hint={strict < 34 ? 'Loose' : strict > 66 ? 'Strict' : 'Balanced'}>Strictness</Label><Slider ariaLabel="Strictness" value={strict} onChange={setStrict} min={0} max={100} /></div>
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<Images className="size-4" />} loading={ai.busy} onClick={go}>Find similar photos</Button>
          {done && groups.length > 0 && (
            <>
              <Button variant="outline" className="w-full" onClick={autoPick}>Keep the largest in each group</Button>
              <DlButton variant="primary" className="w-full" name="kept-photos.zip" data={() => zipFiles(kept.map(({ it }) => ({ name: it.file.name, data: it.file })))}>Download {kept.length} kept photos (ZIP)</DlButton>
              <DlButton className="w-full" name="similar-photos.csv" mime="text/csv" data={() => toCsv([['group', 'file', 'width', 'height', 'bytes', 'keep'], ...groups.flatMap((g, k) => g.map((i) => [k + 1, items[i].file.name, items[i].w, items[i].h, items[i].file.size, drop.has(i) ? 'no' : 'yes']))])}>Report (CSV)</DlButton>
            </>
          )}
          <Button variant="ghost" className="w-full" onClick={() => { ai.cancel(); setItems([]); setDone(false) }}>Start over</Button>
        </>
      }
    />
  )
}

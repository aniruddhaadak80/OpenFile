import { useState } from 'react'
import { MessageSquareText, Trash2 } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, ToolGrid, Textarea, CopyButton } from '@/components/ui'
import { formatBytes, baseName } from '@/lib/files'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { useObjectUrl, toCsv, DlButton } from '@/lib/bcat/kit'

interface Item { file: File; caption?: string }

function Thumb({ file }: { file: File }) { const u = useObjectUrl(file); return u ? <img src={u} alt="" className="size-20 shrink-0 rounded-lg object-cover" /> : <div className="size-20 rounded-lg skeleton" /> }

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/\s+\./g, '.') + (/[.]$/.test(s) ? '' : '.') : ''

export default function ImageCaptioner() {
  const [items, setItems] = useState<Item[]>([])
  const [detail, setDetail] = useState<'fast' | 'careful'>('fast')
  const ai = useVision(VMODELS.caption)

  const go = () => ai.run(async () => {
    const todo = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.caption)
    const list = todo.length ? todo : items.map((it, i) => ({ it, i }))
    const out = await ai.infer<string[]>(list.map((x) => x.it.file), { beams: detail === 'careful' ? 3 : 1, max: detail === 'careful' ? 40 : 28, maxSide: 512 }, {
      onProgress: (d, t, partial) => { ai.setProgress(d / t); ai.setStatus(`Captioned ${d} of ${t}`); const idx = list[d - 1].i; setItems((p) => p.map((x, j) => (j === idx ? { ...x, caption: cap(partial ?? '') } : x))) },
    })
    setItems((p) => p.map((x, j) => { const k = list.findIndex((l) => l.i === j); return k >= 0 ? { ...x, caption: cap(out[k]) } : x }))
  })

  if (!items.length) return <Dropzone multiple accept="image/*" onFiles={(f) => setItems(f.map((file) => ({ file })))} label="Drop photos to caption" sub="JPG, PNG, WEBP or GIF. Captions are written on your device by a small AI model." />

  const done = items.filter((i) => i.caption)
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
              <Thumb file={it.file} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted"><span className="truncate">{it.file.name}</span><span>{formatBytes(it.file.size)}</span>
                  <button className="ml-auto rounded p-1 hover:text-danger cursor-pointer" aria-label="Remove" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></div>
                <Textarea aria-label={`Caption for ${it.file.name}`} value={it.caption ?? ''} placeholder={ai.busy ? 'Waiting' : 'No caption yet'} onChange={(e) => setItems((p) => p.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} className="min-h-14 font-sans text-sm" />
              </div>
            </div>
          ))}
          <Dropzone compact multiple accept="image/*" onFiles={(f) => setItems((p) => [...p, ...f.map((file) => ({ file }))])} label="Add more photos" />
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} />
          <div><Label>Detail</Label><Segmented value={detail} onChange={setDetail} options={[{ value: 'fast', label: 'Fast' }, { value: 'careful', label: 'Careful' }]} /></div>
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<MessageSquareText className="size-4" />} loading={ai.busy} onClick={go}>Write {items.length > 1 ? `${items.length} captions` : 'caption'}</Button>
          {done.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <CopyButton text={() => done.map((d) => d.caption).join('\n')} label="Copy all" />
              <DlButton name="captions.csv" mime="text/csv" data={() => toCsv([['file', 'caption'], ...done.map((d) => [d.file.name, d.caption])])}>CSV</DlButton>
              <DlButton name="captions.json" mime="application/json" data={() => JSON.stringify(done.map((d) => ({ file: d.file.name, alt: d.caption })), null, 2)}>JSON</DlButton>
              <DlButton name={() => baseName(items[0].file.name) + '-alt.html'} mime="text/html" data={() => done.map((d) => `<img src="${d.file.name}" alt="${(d.caption ?? '').replace(/"/g, '&quot;')}">`).join('\n')}>HTML img tags</DlButton>
            </div>
          )}
          <Button variant="ghost" className="w-full" onClick={() => { ai.cancel(); setItems([]) }}>Start over</Button>
          <p className="text-xs text-muted">Captions are short English alt text. Edit them before you publish, the model can miss small details.</p>
        </>
      }
    />
  )
}

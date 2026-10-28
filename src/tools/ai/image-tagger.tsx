import { useState } from 'react'
import { Tags, Trash2 } from 'lucide-react'
import { Button, Dropzone, Label, Select, Slider, Textarea, ToolGrid } from '@/components/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { quickTags } from '@/lib/bcat/quick'
import { useObjectUrl, imagePixels, toCsv, DlButton } from '@/lib/bcat/kit'

const SETS: Record<string, string> = {
  general: 'person, group of people, dog, cat, bird, car, bicycle, building, city street, beach, mountain, forest, flowers, food, drink, document, screenshot, text, sky, water, night, sunset, indoor room, sports, animal, computer, phone, toy, art, vehicle',
  photo: 'portrait, selfie, landscape, macro close-up, aerial view, black and white photo, product photo, food photo, street photo, night photo, sports photo, wildlife photo, architecture, interior, screenshot, scanned document, illustration, meme, diagram, chart',
  mood: 'happy, calm, sad, dramatic, romantic, scary, funny, cozy, energetic, mysterious, peaceful, busy',
  shop: 'shoes, shirt, dress, jacket, bag, watch, jewellery, glasses, furniture, lamp, kitchen item, electronics, book, toy, cosmetics, plant',
}

interface Item { file: File; tags?: { label: string; score: number }[] }
function Thumb({ file }: { file: File }) { const u = useObjectUrl(file); return u ? <img src={u} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="aspect-square rounded-xl skeleton" /> }

export default function ImageTagger() {
  const [items, setItems] = useState<Item[]>([])
  const [set, setSet] = useState('general')
  const [labels, setLabels] = useState(SETS.general)
  const [min, setMin] = useState(10)
  const ai = useVision(VMODELS.clip, { quick: true })
  const list = () => labels.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)

  const go = () => ai.run(async () => {
    if (ai.engine === 'quick') {
      const out: Item[] = []
      for (let i = 0; i < items.length; i++) { const p = await imagePixels(items[i].file, 128); out.push({ ...items[i], tags: quickTags(p.data, p.fullW, p.fullH) }); ai.setProgress((i + 1) / items.length) }
      setItems(out); return
    }
    const ls = list(); if (ls.length < 2) throw new Error('Add at least two labels, separated by commas.')
    const r = await ai.infer<{ label: string; score: number }[][]>(items.map((i) => i.file), { labels: ls })
    setItems((p) => p.map((it, i) => ({ ...it, tags: r[i] })))
  })

  const visible = (it: Item) => (it.tags ?? []).filter((t) => ai.engine === 'quick' || t.score * 100 >= min).slice(0, 8)

  if (!items.length) return <Dropzone multiple accept="image/*" onFiles={(f) => setItems(f.map((file) => ({ file })))} label="Drop photos to tag" sub="Pick your own labels, the AI scores every photo against them. Runs on your device." />
  const tagged = items.filter((i) => i.tags)
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it, i) => (
              <div key={i} className="space-y-1.5 rounded-2xl border border-border bg-surface p-2">
                <div className="relative"><Thumb file={it.file} /><button aria-label="Remove" className="absolute right-1 top-1 rounded-lg bg-black/60 p-1 text-white cursor-pointer" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></div>
                <div className="truncate text-[11px] text-muted">{it.file.name}</div>
                <div className="flex flex-wrap gap-1">{visible(it).map((t) => <span key={t.label} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-fg">{t.label}{ai.engine === 'ai' && <span className="ml-1 text-muted">{Math.round(t.score * 100)}</span>}</span>)}</div>
              </div>
            ))}
          </div>
          <Dropzone compact multiple accept="image/*" onFiles={(f) => setItems((p) => [...p, ...f.map((file) => ({ file }))])} label="Add more photos" />
        </div>
      }
      side={
        <>
          <EnginePanel ai={ai} quickLabel="Quick tags" quickNote="Quick tags describe light, colour, main colours and shape from the pixels. Instant, no download, no object names." />
          {ai.engine === 'ai' && (
            <>
              <div><Label>Label set</Label><Select value={set} onChange={(v) => { setSet(v); setLabels(SETS[v] ?? labels) }} options={[{ value: 'general', label: 'Everyday things' }, { value: 'photo', label: 'Photo type' }, { value: 'mood', label: 'Mood' }, { value: 'shop', label: 'Products' }, { value: 'custom', label: 'My own labels' }]} /></div>
              <div><Label hint={`${list().length}`}>Labels</Label><Textarea value={labels} onChange={(e) => { setLabels(e.target.value); setSet('custom') }} className="min-h-24 font-sans text-xs" aria-label="Labels" /></div>
              <Slider label="Show tags above" value={min} onChange={setMin} min={1} max={60} suffix="%" />
            </>
          )}
          <VisionProgress ai={ai} />
          <Button className="w-full" icon={<Tags className="size-4" />} loading={ai.busy} onClick={go}>Tag {items.length} photo{items.length > 1 ? 's' : ''}</Button>
          {tagged.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <DlButton name="image-tags.csv" mime="text/csv" data={() => toCsv([['file', 'tags'], ...tagged.map((i) => [i.file.name, visible(i).map((t) => t.label).join('; ')])])}>CSV</DlButton>
              <DlButton name="image-tags.json" mime="application/json" data={() => JSON.stringify(tagged.map((i) => ({ file: i.file.name, tags: visible(i).map((t) => ({ label: t.label, score: +t.score.toFixed(4) })) })), null, 2)}>JSON</DlButton>
            </div>
          )}
          <Button variant="ghost" className="w-full" onClick={() => { ai.cancel(); setItems([]) }}>Start over</Button>
        </>
      }
    />
  )
}

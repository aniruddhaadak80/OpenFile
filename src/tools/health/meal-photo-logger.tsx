import { useEffect, useMemo, useRef, useState } from 'react'
import { Utensils, Trash2 } from 'lucide-react'
import { Button, Dropzone, Input, Label, Select, ToolGrid } from '@/components/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { useObjectUrl, toCsv, DlButton } from '@/lib/bcat/kit'
import { safeBlobUrl } from '@/lib/safe'

/** Common dishes with rough energy for one typical serving (kcal). Values are averages from public nutrition tables. */
export const FOODS: [string, number][] = [
  ['rice and curry', 550], ['biryani', 600], ['dal and rice', 450], ['roti with sabzi', 350], ['dosa', 300], ['idli with sambar', 250], ['poha', 270], ['paneer curry', 400], ['chicken curry', 450], ['fish curry', 380],
  ['samosa', 260], ['pizza', 570], ['burger', 540], ['french fries', 365], ['sandwich', 350], ['pasta', 480], ['noodles', 450], ['fried rice', 520], ['sushi', 350], ['ramen', 500],
  ['salad', 180], ['soup', 150], ['omelette', 200], ['pancakes', 350], ['cereal with milk', 250], ['oatmeal', 160], ['toast', 150], ['eggs', 160], ['steak', 600], ['grilled chicken', 300],
  ['fruit bowl', 120], ['banana', 105], ['apple', 95], ['yogurt', 150], ['ice cream', 270], ['cake', 350], ['cookies', 200], ['chocolate', 230], ['doughnut', 260], ['coffee', 60],
  ['tea with milk', 70], ['smoothie', 220], ['soft drink', 140], ['beer', 150], ['tacos', 400], ['burrito', 650], ['dumplings', 300], ['kebab', 450], ['falafel wrap', 500], ['momos', 300],
]

interface Item { file: File; guesses?: { label: string; score: number }[]; food?: string; portion: number }
function Thumb({ file }: { file: File }) { const u = safeBlobUrl(useObjectUrl(file)); return u ? <img src={u} alt="" className="size-24 shrink-0 rounded-xl object-cover" /> : <div className="size-24 rounded-xl skeleton" /> }
const kcalOf = (food?: string) => FOODS.find((f) => f[0] === food)?.[1] ?? 0

export default function MealPhotoLogger() {
  const [items, setItems] = useState<Item[]>([])
  const ai = useVision(VMODELS.clip, { quick: true })
  const picked = useRef(false)
  // CLIP (150 MB) works on a CPU in the background worker; without WebGPU start in manual mode so nothing heavy loads unasked
  useEffect(() => { const id = setTimeout(() => { if (!picked.current && !ai.gpuOk) ai.setEngine('quick') }, 400); return () => clearTimeout(id) }, [ai.gpuOk]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = () => ai.run(async () => {
    const list = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.guesses)
    const out = await ai.infer<{ label: string; score: number }[][]>(list.map((x) => x.it.file), { labels: FOODS.map((f) => f[0]), template: 'a photo of {}, a type of food' }, { onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Looked at ${d} of ${t} photos`) } })
    setItems((p) => p.map((x, j) => { const k = list.findIndex((l) => l.i === j); if (k < 0) return x; const g = out[k].slice(0, 3); return { ...x, guesses: g, food: g[0]?.label } }))
  })
  const total = useMemo(() => items.reduce((s, it) => s + kcalOf(it.food) * it.portion, 0), [items])
  if (!items.length) return <Dropzone multiple accept="image/*" onFiles={(f) => setItems(f.map((file) => ({ file, portion: 1 })))} label="Drop photos of your meals" sub="A small AI model guesses the dish on your device and gives a rough calorie number you can correct. Photos never leave this device." />
  return (
    <ToolGrid
      main={<div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
            <Thumb file={it.file} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted"><span className="truncate">{it.file.name}</span><button className="ml-auto rounded p-1 hover:text-danger cursor-pointer" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></div>
              <div className="grid grid-cols-[1fr_5rem] gap-2">
                <Select aria-label="Dish" value={it.food ?? ''} onChange={(v) => setItems((p) => p.map((x, j) => (j === i ? { ...x, food: v } : x)))} options={[{ value: '', label: 'Pick the dish' }, ...FOODS.map(([f, k]) => ({ value: f, label: `${f} (${k} kcal)` }))]} />
                <label className="text-[11px] text-muted"><span className="sr-only">Portions</span><Input aria-label="Portions" inputMode="decimal" value={String(it.portion)} onChange={(e) => setItems((p) => p.map((x, j) => (j === i ? { ...x, portion: Math.max(0, +e.target.value || 0) } : x)))} /></label>
              </div>
              {it.guesses && <div className="flex flex-wrap gap-1.5">{it.guesses.map((g) => <button key={g.label} type="button" onClick={() => setItems((p) => p.map((x, j) => (j === i ? { ...x, food: g.label } : x)))} className={`rounded-full border px-2 py-0.5 text-[11px] cursor-pointer ${it.food === g.label ? 'border-accent bg-accent/10' : 'border-border text-muted'}`}>{g.label} {(g.score * 100).toFixed(0)}%</button>)}</div>}
              <p className="text-sm">About <b>{Math.round(kcalOf(it.food) * it.portion)}</b> kcal</p>
            </div>
          </div>
        ))}
        <Dropzone compact multiple accept="image/*" onFiles={(f) => setItems((p) => [...p, ...f.map((file) => ({ file, portion: 1 }))])} label="Add more meals" />
      </div>}
      side={<>
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-center"><div className="text-xs text-muted">Total for these meals</div><div className="font-display text-3xl font-bold">{Math.round(total)} kcal</div></div>
        <div onClickCapture={() => { picked.current = true }}><EnginePanel ai={ai} quickLabel="Pick by hand" quickNote="Pick each dish from the list yourself. Instant and needs no download. Switch to the AI model to get guesses from the photos." /></div>
        <VisionProgress ai={ai} />
        {ai.engine === 'ai' && <Button className="w-full" icon={<Utensils className="size-4" />} loading={ai.busy} disabled={items.every((i) => i.guesses)} onClick={go}>Guess the dishes</Button>}
        <DlButton className="w-full" name="meals.csv" mime="text/csv" data={() => toCsv([['photo', 'dish', 'portions', 'kcal'], ...items.map((it) => [it.file.name, it.food ?? '', it.portion, Math.round(kcalOf(it.food) * it.portion)])])}>Download meal log CSV</DlButton>
        <Label>About the numbers</Label>
        <p className="text-xs text-muted">Calories are rough averages for one normal serving of each dish. Home cooking, oil and portion size change them a lot. Use them as a guide, not a measurement.</p>
      </>}
    />
  )
}

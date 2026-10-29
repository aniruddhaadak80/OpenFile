import { useRef, useState } from 'react'
import { ScanLine, Trash2, X } from 'lucide-react'
import { Button, Dropzone, Input, Label, Progress, Segmented, ToolGrid, Textarea, ErrorNote } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { parseReceipt, type Receipt } from '@/lib/r13/finance'
import { useObjectUrl, toCsv, DlButton } from '@/lib/bcat/kit'

interface Item { file: File; text?: string; r?: Receipt; error?: string }

/** Grey, contrast stretched copy of the photo, longest side at most `max` px: faster and more accurate OCR. */
async function prepare(file: File, max: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close()
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data
  let lo = 255, hi = 0
  for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = g; if (g < lo) lo = g; if (g > hi) hi = g }
  const k = 255 / Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] - lo) * k; d[i] = d[i + 1] = d[i + 2] = g }
  ctx.putImageData(img, 0, 0)
  return c
}

function Thumb({ file }: { file: File }) { const u = useObjectUrl(file); return u ? <img src={u} alt="" className="h-28 w-20 shrink-0 rounded-lg object-cover" /> : <div className="h-28 w-20 rounded-lg skeleton" /> }

export default function ReceiptScanner() {
  const [items, setItems] = useState<Item[]>([])
  const [lang, setLang] = useState<'eng' | 'eng+hin' | 'eng+deu+fra+spa'>('eng')
  const [quality, setQuality] = useState<'fast' | 'best'>('fast')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [prog, setProg] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const worker = useRef<any>(null)
  const stop = useRef(false)

  const cancel = async () => { stop.current = true; try { await worker.current?.terminate() } catch { /* already gone */ } worker.current = null; setBusy(false); setStage('') }
  const go = async () => {
    setBusy(true); setError(null); stop.current = false
    try {
      setStage('Loading the text reader (OCR) model')
      const { createWorker } = await import('tesseract.js')
      let current = 0
      const todo = items.map((it, i) => ({ it, i })).filter(({ it }) => !it.r)
      const w = await createWorker(lang.split('+'), 1, { logger: (m: any) => { if (m.status === 'recognizing text') setProg((current + m.progress) / Math.max(1, todo.length)); else if (/load|init/i.test(m.status)) setStage(`${m.status[0].toUpperCase()}${m.status.slice(1)}${m.progress ? ` ${Math.round(m.progress * 100)}%` : ''}`) } })
      worker.current = w
      for (let k = 0; k < todo.length; k++) {
        if (stop.current) break
        current = k
        const { it, i } = todo[k]
        setStage(`Reading receipt ${k + 1} of ${todo.length}`)
        try {
          const canvas = await prepare(it.file, quality === 'best' ? 2400 : 1600)
          const res: any = await w.recognize(canvas)
          const text: string = res.data.text ?? ''
          setItems((p) => p.map((x, j) => (j === i ? { ...x, text, r: parseReceipt(text), error: undefined } : x)))
        } catch (e: any) { if (!stop.current) setItems((p) => p.map((x, j) => (j === i ? { ...x, error: e?.message || String(e) } : x))) }
      }
      await w.terminate(); worker.current = null
    } catch (e: any) { if (!stop.current) setError(e?.message || String(e)) } finally { setBusy(false); setStage(''); setProg(0) }
  }
  const edit = (i: number, patch: Partial<Receipt>) => setItems((p) => p.map((x, j) => (j === i && x.r ? { ...x, r: { ...x.r, ...patch } } : x)))
  const done = items.filter((i) => i.r)

  if (!items.length) return <Dropzone multiple accept="image/*" onFiles={(f) => setItems(f.map((file) => ({ file })))} label="Drop photos of receipts" sub="JPG, PNG, WEBP or HEIC converted to JPG. Text is read on your device by Tesseract OCR, then the shop, date, tax and total are picked out." />
  return (
    <ToolGrid
      main={<div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
            <Thumb file={it.file} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted"><span className="truncate">{it.file.name}</span><span>{formatBytes(it.file.size)}</span>
                <button className="ml-auto rounded p-1 hover:text-danger cursor-pointer" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></div>
              {it.error && <ErrorNote error={it.error} />}
              {it.r ? <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-[11px] text-muted">Shop<Input className="h-8 text-sm" value={it.r.merchant} onChange={(e) => edit(i, { merchant: e.target.value })} /></label>
                  <label className="text-[11px] text-muted">Date<Input className="h-8 text-sm" value={it.r.date} placeholder="YYYY-MM-DD" onChange={(e) => edit(i, { date: e.target.value })} /></label>
                  <label className="text-[11px] text-muted">Tax<Input className="h-8 text-sm" inputMode="decimal" value={it.r.tax ?? ''} onChange={(e) => edit(i, { tax: e.target.value === '' ? null : +e.target.value })} /></label>
                  <label className="text-[11px] text-muted">Total<Input className="h-8 text-sm font-semibold" inputMode="decimal" value={it.r.total ?? ''} onChange={(e) => edit(i, { total: e.target.value === '' ? null : +e.target.value })} /></label>
                </div>
                {it.r.items.length > 0 && <p className="text-xs text-muted">{it.r.items.length} line items found{it.r.currency ? ` · ${it.r.currency}` : ''}</p>}
                <details className="text-xs"><summary className="cursor-pointer text-muted">Text read from the photo</summary><Textarea readOnly value={it.text ?? ''} className="mt-1 min-h-24 font-mono text-[11px]" aria-label="Recognised text" /></details>
              </> : <p className="text-sm text-muted">{busy ? 'Waiting' : 'Not read yet'}</p>}
            </div>
          </div>
        ))}
        <Dropzone compact multiple accept="image/*" onFiles={(f) => setItems((p) => [...p, ...f.map((file) => ({ file }))])} label="Add more receipts" />
      </div>}
      side={<>
        <div><Label>Languages on the receipts</Label><Segmented value={lang} onChange={setLang} options={[{ value: 'eng', label: 'English' }, { value: 'eng+hin', label: 'English + Hindi' }, { value: 'eng+deu+fra+spa', label: 'European' }]} /></div>
        <div><Label>Accuracy</Label><Segmented value={quality} onChange={setQuality} options={[{ value: 'fast', label: 'Fast' }, { value: 'best', label: 'Best' }]} /></div>
        <p className="text-xs text-muted">The OCR model (about 4 to 15 MB per language) downloads once and runs in a background worker on the CPU, so it works without a GPU and the page stays responsive.</p>
        {busy && <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3" role="status" aria-live="polite"><Progress value={prog} label={stage || 'Working'} /><Button variant="outline" size="sm" className="w-full" icon={<X className="size-4" />} onClick={cancel}>Cancel</Button></div>}
        <ErrorNote error={error} />
        <Button className="w-full" icon={<ScanLine className="size-4" />} loading={busy} onClick={go} disabled={items.every((i) => i.r)}>Read {items.filter((i) => !i.r).length || ''} receipt{items.filter((i) => !i.r).length === 1 ? '' : 's'}</Button>
        {done.length > 0 && <div className="grid grid-cols-2 gap-2">
          <DlButton name="receipts.csv" mime="text/csv" data={() => toCsv([['file', 'shop', 'date', 'subtotal', 'tax', 'total', 'currency'], ...done.map((d) => [d.file.name, d.r!.merchant, d.r!.date, d.r!.subtotal ?? '', d.r!.tax ?? '', d.r!.total ?? '', d.r!.currency])])}>Receipts CSV</DlButton>
          <DlButton name="receipt-items.csv" mime="text/csv" data={() => toCsv([['file', 'shop', 'date', 'item', 'amount'], ...done.flatMap((d) => d.r!.items.map((x) => [d.file.name, d.r!.merchant, d.r!.date, x.name, x.amount]))])}>Line items CSV</DlButton>
          <DlButton className="col-span-2" name="receipts.json" mime="application/json" data={() => JSON.stringify(done.map((d) => ({ file: d.file.name, ...d.r })), null, 2)}>JSON</DlButton>
        </div>}
        <Button variant="ghost" className="w-full" onClick={() => { void cancel(); setItems([]) }}>Start over</Button>
        <p className="text-xs text-muted">Check the totals before you file them. Faded thermal paper and creased photos can confuse the reader.</p>
      </>}
    />
  )
}

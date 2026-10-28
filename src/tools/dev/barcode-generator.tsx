import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Copy, Package, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button, Card, Field, Input, Textarea, Select, Segmented, Slider, Switch, Progress, cn, useJob } from '@/components/ui'
import { downloadBlob, canvasToBlob, zipFiles } from '@/lib/files'
import { toast } from '@/components/toast'
import { useLib, downloadText } from './_dev/kit'

type Fmt = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'MSI' | 'pharmacode' | 'codabar'
const FORMATS: { v: Fmt; label: string; sample: string; hint: string }[] = [
  { v: 'CODE128', label: 'CODE128', sample: 'OpenFile-2026', hint: 'Any ASCII text. Most versatile — shipping labels, inventory.' },
  { v: 'EAN13', label: 'EAN-13', sample: '590123412345', hint: '12 digits (check digit auto-added) or 13 digits with a valid check digit. Retail products worldwide.' },
  { v: 'EAN8', label: 'EAN-8', sample: '9638507', hint: '7 digits (+ check digit) or 8 with valid check digit. Small packages.' },
  { v: 'UPC', label: 'UPC-A', sample: '12345678999', hint: '11 digits (+ check digit) or 12 with valid check digit. North American retail.' },
  { v: 'CODE39', label: 'CODE39', sample: 'CODE39 TEST', hint: 'Uppercase A–Z, 0–9 and - . space $ / + %. Industrial / ID badges.' },
  { v: 'ITF14', label: 'ITF-14', sample: '1540014128876', hint: '13 digits (+ check digit) or 14 with valid check digit. Shipping cartons.' },
  { v: 'MSI', label: 'MSI', sample: '1234567', hint: 'Digits only. Warehouse shelving and inventory.' },
  { v: 'pharmacode', label: 'Pharmacode', sample: '1234', hint: 'A number from 3 to 131070. Pharmaceutical packaging.' },
  { v: 'codabar', label: 'Codabar', sample: 'A123456A', hint: 'Digits and - $ : / . + with optional start/stop A–D. Libraries, blood banks.' },
]

const eanCheck = (d: string) => { let s = 0; for (let i = 0; i < d.length; i++) s += Number(d[d.length - 1 - i]) * (i % 2 === 0 ? 3 : 1); return (10 - (s % 10)) % 10 }
function explain(fmt: Fmt, v: string): string | null {
  const len: Record<string, [number, number]> = { EAN13: [12, 13], EAN8: [7, 8], UPC: [11, 12], ITF14: [13, 14] }
  if (len[fmt]) {
    const [a, b] = len[fmt]
    if (!/^\d+$/.test(v)) return 'Digits only.'
    if (v.length !== a && v.length !== b) return `Needs ${a} digits (check digit added automatically) or ${b} digits — you have ${v.length}.`
    if (v.length === b) { const c = eanCheck(v.slice(0, -1)); if (c !== Number(v.slice(-1))) return `Invalid check digit: expected ${c}, got ${v.slice(-1)}.` }
  }
  if (fmt === 'CODE39' && !/^[0-9A-Z\-. $/+%]*$/.test(v)) return 'CODE39 supports only uppercase letters, digits and - . space $ / + %.'
  if (fmt === 'MSI' && !/^\d+$/.test(v)) return 'MSI accepts digits only.'
  if (fmt === 'pharmacode' && (!/^\d+$/.test(v) || +v < 3 || +v > 131070)) return 'Pharmacode must be a whole number between 3 and 131070.'
  if (fmt === 'codabar' && !/^[A-Da-d]?[0-9\-$:/.+]+[A-Da-d]?$/.test(v)) return 'Codabar allows digits and - $ : / . + with optional A–D start/stop characters.'
  if (fmt === 'CODE128' && /[^\x00-\x7F]/.test(v)) return 'CODE128 supports ASCII characters only.'
  return null
}

export default function BarcodeGenerator() {
  const JsBarcode = useLib('jsbarcode', () => import('jsbarcode').then((m: any) => m.default ?? m))
  const [fmt, setFmt] = useState<Fmt>('CODE128')
  const [value, setValue] = useState('OpenFile-2026')
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [bulk, setBulk] = useState('SKU-0001\nSKU-0002\nSKU-0003')
  const [fg, setFg] = useState('#000000'); const [bg, setBg] = useState('#ffffff'); const [transparent, setTransparent] = useState(false)
  const [width, setWidth] = useState(2); const [height, setHeight] = useState(100)
  const [showText, setShowText] = useState(true); const [fontSize, setFontSize] = useState(20); const [margin, setMargin] = useState(10)
  const [bulkFmt, setBulkFmt] = useState<'png' | 'svg'>('png')
  const svgRef = useRef<SVGSVGElement>(null)
  const [valid, setValid] = useState(true)
  const job = useJob()

  const opts = useMemo(() => ({ format: fmt, lineColor: fg, background: transparent ? 'transparent' : bg, width, height, displayValue: showText, fontSize, margin, font: 'monospace', textMargin: 4 }), [fmt, fg, bg, transparent, width, height, showText, fontSize, margin])
  const err = explain(fmt, value)

  useEffect(() => {
    if (!JsBarcode || !svgRef.current || mode !== 'single') return
    let ok = true
    try { JsBarcode(svgRef.current, value || ' ', { ...opts, valid: (v: boolean) => { ok = v } }) } catch { ok = false }
    setValid(ok && !!value)
  }, [JsBarcode, value, opts, mode])

  const renderSvg = (v: string): string | null => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); let ok = true
    try { JsBarcode(el, v, { ...opts, xmlDocument: document, valid: (x: boolean) => { ok = x } }) } catch { return null }
    if (!ok) return null
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return new XMLSerializer().serializeToString(el)
  }
  const renderPng = async (v: string, scale = 2): Promise<Blob | null> => {
    const c = document.createElement('canvas'); let ok = true
    try { JsBarcode(c, v, { ...opts, width: opts.width * scale, height: opts.height * scale, fontSize: opts.fontSize * scale, margin: opts.margin * scale, valid: (x: boolean) => { ok = x } }) } catch { return null }
    return ok ? canvasToBlob(c) : null
  }
  const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'barcode'

  const lines = bulk.split('\n').map((s) => s.trim()).filter(Boolean)
  const bulkCheck = useMemo(() => lines.map((l) => ({ l, err: explain(fmt, l) })), [bulk, fmt])

  const doBulk = () => job.run(async (setP) => {
    const files: { name: string; data: Blob | string }[] = []; const bad: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (bulkFmt === 'svg') { const s = renderSvg(l); if (s) files.push({ name: `${safe(l)}.svg`, data: s }); else bad.push(l) }
      else { const b = await renderPng(l); if (b) files.push({ name: `${safe(l)}.png`, data: b }); else bad.push(l) }
      setP((i + 1) / lines.length)
    }
    if (!files.length) throw new Error('None of the values are valid for ' + fmt)
    downloadBlob(await zipFiles(files), `barcodes-${fmt}.zip`)
    toast(`${files.length} barcodes zipped${bad.length ? ` · ${bad.length} skipped (invalid)` : ''}`, bad.length ? 'info' : 'success')
  })

  const info = FORMATS.find((f) => f.v === fmt)!

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FORMATS.map((f) => <button key={f.v} onClick={() => { setFmt(f.v); setValue(f.sample) }} className={cn('shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition cursor-pointer', fmt === f.v ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-muted hover:text-fg')}>{f.label}</button>)}
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'single', label: 'Single' }, { value: 'bulk', label: 'Bulk → ZIP' }]} />

        {mode === 'single' ? (
          <>
            <Card className="space-y-2">
              <Field label="Value"><Input value={value} onChange={(e) => setValue(e.target.value)} className="font-mono text-base" placeholder={info.sample} /></Field>
              <div className={cn('flex items-start gap-2 text-xs', err ? 'text-danger' : 'text-muted')}>{err ? <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />}{err ?? info.hint}</div>
            </Card>
            <motion.div layout className={cn('grid min-h-56 place-items-center overflow-auto rounded-2xl border border-border p-6', transparent ? 'checker' : 'bg-surface-2/40')}>
              <svg ref={svgRef} className={cn('max-w-full', !valid && 'hidden')} />
              {!valid && <div className="text-sm text-muted">{err ?? 'Enter a valid value to preview'}</div>}
            </motion.div>
            <div className="flex flex-wrap gap-2">
              <Button icon={<Download className="size-4" />} disabled={!valid} onClick={async () => { const b = await renderPng(value, 3); if (b) downloadBlob(b, `${safe(value)}.png`) }}>PNG</Button>
              <Button variant="secondary" icon={<Download className="size-4" />} disabled={!valid} onClick={() => { const s = renderSvg(value); if (s) downloadText(s, `${safe(value)}.svg`, 'image/svg+xml') }}>SVG</Button>
              <Button variant="outline" icon={<Copy className="size-4" />} disabled={!valid} onClick={async () => { try { const b = await renderPng(value, 2); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b! })]); toast('Barcode image copied') } catch { toast('Clipboard image copy not supported — use Download', 'error') } }}>Copy image</Button>
            </div>
          </>
        ) : (
          <Card className="space-y-3">
            <Field label="One value per line" hint={`${lines.length} values`}><Textarea value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-56" /></Field>
            <div className="scrollbar-thin max-h-40 space-y-1 overflow-auto text-xs">
              {bulkCheck.filter((b) => b.err).slice(0, 50).map((b, i) => <div key={i} className="flex gap-2 text-danger"><AlertCircle className="size-3.5 shrink-0" /><span className="font-mono">{b.l}</span><span className="text-muted">— {b.err}</span></div>)}
              {bulkCheck.length > 0 && bulkCheck.every((b) => !b.err) && <div className="flex items-center gap-1.5 text-success"><CheckCircle2 className="size-3.5" />All values look valid for {info.label}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented value={bulkFmt} onChange={setBulkFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'svg', label: 'SVG' }]} />
              <Button icon={<Package className="size-4" />} onClick={doBulk} loading={job.busy} disabled={!lines.length || !JsBarcode}>Download ZIP</Button>
            </div>
            {job.busy && <Progress value={job.progress} label="Rendering barcodes…" />}
          </Card>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <Slider label="Bar width" value={width} onChange={setWidth} min={1} max={6} suffix=" px" />
          <Slider label="Height" value={height} onChange={setHeight} min={20} max={300} suffix=" px" />
          <Slider label="Quiet zone (margin)" value={margin} onChange={setMargin} min={0} max={50} suffix=" px" />
          <Switch checked={showText} onChange={setShowText} label="Show human-readable text" />
          {showText && <Slider label="Font size" value={fontSize} onChange={setFontSize} min={8} max={48} suffix=" px" />}
          <div className="grid grid-cols-2 gap-3">
            <label><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Bars</div><div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-2"><input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="size-6 cursor-pointer bg-transparent" /><span className="font-mono text-xs uppercase">{fg}</span></div></label>
            <label className={cn(transparent && 'opacity-40')}><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Background</div><div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-2"><input type="color" value={bg} disabled={transparent} onChange={(e) => setBg(e.target.value)} className="size-6 cursor-pointer bg-transparent" /><span className="font-mono text-xs uppercase">{bg}</span></div></label>
          </div>
          <Switch checked={transparent} onChange={setTransparent} label="Transparent background" />
          <Field label="Format"><Select value={fmt} onChange={(v) => { setFmt(v); setValue(FORMATS.find((f) => f.v === v)!.sample) }} options={FORMATS.map((f) => ({ value: f.v, label: f.label }))} /></Field>
        </Card>
      </aside>
    </div>
  )
}

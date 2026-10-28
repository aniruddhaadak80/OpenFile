import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, Progress, Segmented, Slider, Switch, Textarea, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { BatchResults, ColorInput, uid, type Result } from '@/tools/image/_img/kit'
import { encodeCanvas, type OutFmt } from '@/lib/b2/codecs'

type Out = 'png' | 'jpg' | 'webp' | 'avif' | 'bmp' | 'tiff' | 'ico' | 'pdf'
type Item = { id: string; name: string; size: number; svg: string; w: number; h: number; url: string }

async function readSvg(file: File): Promise<string> {
  const u8 = new Uint8Array(await file.arrayBuffer())
  if (u8[0] === 0x1f && u8[1] === 0x8b) { const { gunzipSync, strFromU8 } = await import('fflate'); return strFromU8(gunzipSync(u8)) }
  return new TextDecoder().decode(u8)
}

/** Parse intrinsic size from width/height or viewBox. */
export function svgSize(svg: string): { w: number; h: number } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const el = doc.documentElement
  if (!el || el.nodeName.toLowerCase() !== 'svg') throw new Error('This file is not a valid SVG.')
  const num = (v: string | null) => { if (!v || v.endsWith('%')) return 0; const n = parseFloat(v); if (!n) return 0; if (/mm$/.test(v)) return n * 3.7795; if (/cm$/.test(v)) return n * 37.795; if (/in$/.test(v)) return n * 96; if (/pt$/.test(v)) return n * 1.3333; return n }
  const vb = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number)
  let w = num(el.getAttribute('width')), h = num(el.getAttribute('height'))
  if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) { if (w && !h) h = (w * vb[3]) / vb[2]; else if (h && !w) w = (h * vb[2]) / vb[3]; else { w = vb[2]; h = vb[3] } }
  return { w: w || 300, h: h || 150 }
}

/** Render SVG text to a canvas at an exact pixel size (resizing the root so vectors stay sharp). */
export async function renderSvg(svg: string, w: number, h: number, bg?: string): Promise<HTMLCanvasElement> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const el = doc.documentElement
  const { w: iw, h: ih } = svgSize(svg)
  if (!el.getAttribute('viewBox')) el.setAttribute('viewBox', `0 0 ${iw} ${ih}`)
  el.setAttribute('width', String(w)); el.setAttribute('height', String(h))
  if (!el.getAttribute('xmlns')) el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const text = new XMLSerializer().serializeToString(doc)
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The browser could not render this SVG. It may reference external files or use unsupported features.')); i.src = url })
    const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h)
    const ctx = c.getContext('2d')!
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height) }
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c
  } finally { URL.revokeObjectURL(url) }
}

async function svgToPdf(svg: string, w: number, h: number): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  await import('svg2pdf.js')
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const el = doc.documentElement as unknown as SVGSVGElement
  const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-99999px;top:0'
  holder.appendChild(el); document.body.appendChild(holder)
  try {
    const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'pt', format: [w * 0.75, h * 0.75] })
    await (pdf as any).svg(el, { x: 0, y: 0, width: w * 0.75, height: h * 0.75 })
    return pdf.output('blob')
  } finally { holder.remove() }
}

export default function SvgConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [to, setTo] = useState<Out>('png')
  const [mode, setMode] = useState<'scale' | 'width' | 'exact'>('scale')
  const [scale, setScale] = useState(2)
  const [width, setWidth] = useState(1024)
  const [ew, setEw] = useState(512); const [eh, setEh] = useState(512)
  const [quality, setQuality] = useState(90)
  const [transparent, setTransparent] = useState(true)
  const [bg, setBg] = useState('#ffffff')
  const [paste, setPaste] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const { busy, progress, error, run, setError } = useJob()
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [])

  const addText = useCallback((svg: string, name: string, size: number) => {
    const { w, h } = svgSize(svg)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    setItems((s) => [...s, { id: uid(), name, size, svg, w, h, url }]); setResults(null)
  }, [])
  const add = useCallback(async (files: File[]) => {
    for (const f of files) { try { addText(await readSvg(f), f.name, f.size) } catch (e: any) { setError(`${f.name}: ${e?.message || e}`) } }
  }, [addText, setError])

  const outSize = (it: Item) => to === 'ico' ? { w: (256 * it.w) / Math.max(it.w, it.h), h: (256 * it.h) / Math.max(it.w, it.h) } : mode === 'scale' ? { w: it.w * scale, h: it.h * scale } : mode === 'width' ? { w: width, h: (width * it.h) / it.w } : { w: ew, h: eh }
  const lossy = to === 'jpg' || to === 'webp' || to === 'avif'
  const needsBg = !transparent || to === 'jpg' || to === 'bmp'

  const convert = () => run(async (setP) => {
    const out: Result[] = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const { w, h } = outSize(it)
      if (w * h > 16384 * 16384 || w > 16384 || h > 16384) throw new Error('That output size is too large for the browser canvas. Keep each side under 16384 px.')
      let blob: Blob
      if (to === 'pdf') blob = await svgToPdf(it.svg, w, h)
      else {
        const c = await renderSvg(it.svg, w, h, needsBg ? bg : undefined)
        blob = await encodeCanvas(c, to as OutFmt, { quality, bg })
      }
      out.push({ id: it.id, name: `${baseName(it.name)}.${to === 'tiff' ? 'tif' : to}`, blob, url: it.url, note: to === 'pdf' ? 'vector PDF' : `${Math.round(w)}×${Math.round(h)}` })
      setP((i + 1) / items.length)
    }
    setResults(out)
  })

  const reset = () => { setItems([]); setResults(null) }
  if (!items.length) return (
    <div className="space-y-4">
      <Dropzone multiple accept=".svg,.svgz,image/svg+xml" onFiles={add} label="Drop SVG or SVGZ files" />
      <div className="rounded-2xl border border-border bg-surface p-4">
        <Label>Or paste SVG code</Label>
        <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; ...>" />
        <Button className="mt-3" variant="outline" disabled={!paste.trim().startsWith('<')} onClick={() => { try { addText(paste.trim(), 'pasted.svg', paste.length) } catch (e: any) { setError(e.message) } }}>Use this SVG</Button>
        <ErrorNote error={error} />
      </div>
    </div>
  )
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it) => { const o = outSize(it); return (
              <div key={it.id} className="overflow-hidden rounded-xl border border-border bg-surface-2/40">
                <div className="checker grid aspect-square place-items-center p-3"><img src={it.url} alt="" className="max-h-full max-w-full object-contain" /></div>
                <div className="border-t border-border px-2.5 py-1.5 text-xs"><div className="truncate font-medium">{it.name}</div><div className="text-muted">{Math.round(it.w)}×{Math.round(it.h)} → {Math.round(o.w)}×{Math.round(o.h)} · {formatBytes(it.size)}</div></div>
              </div>) })}
          </div>
          <Dropzone compact multiple accept=".svg,.svgz,image/svg+xml" onFiles={add} label="Add more SVGs" />
        </>}
        side={<>
          <div>
            <Label>Convert to</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['png', 'jpg', 'webp', 'avif', 'bmp', 'tiff', 'ico', 'pdf'] as Out[]).map((f) => <button key={f} onClick={() => { setTo(f); setResults(null) }} className={cn('rounded-lg border py-1.5 text-xs font-semibold uppercase cursor-pointer', to === f ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/50')}>{f}</button>)}
            </div>
          </div>
          {to !== 'ico' && <>
            <Field label="Size"><Segmented value={mode} onChange={setMode} options={[{ value: 'scale', label: 'Scale' }, { value: 'width', label: 'Width' }, { value: 'exact', label: 'Exact' }]} /></Field>
            {mode === 'scale' && <Slider label="Scale" value={scale} onChange={setScale} min={0.25} max={16} step={0.25} suffix="×" />}
            {mode === 'width' && <Field label="Width (px)"><Input type="number" min={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} /></Field>}
            {mode === 'exact' && <div className="flex items-end gap-2"><Field label="W" className="flex-1"><Input type="number" value={ew} onChange={(e) => setEw(Number(e.target.value))} /></Field><Field label="H" className="flex-1"><Input type="number" value={eh} onChange={(e) => setEh(Number(e.target.value))} /></Field></div>}
          </>}
          {to === 'ico' && <p className="text-xs text-muted">The icon gets 16, 32, 48, 64, 128 and 256 px sizes, all rendered sharply from the vector.</p>}
          {lossy && <Slider label="Quality" value={quality} onChange={setQuality} min={10} max={100} suffix="%" />}
          {to !== 'pdf' && <Switch checked={transparent && to !== 'jpg' && to !== 'bmp'} onChange={setTransparent} label="Transparent background" />}
          {needsBg && to !== 'pdf' && <div><Label>Background</Label><ColorInput value={bg} onChange={setBg} /></div>}
          {busy && <Progress value={progress} label="Rendering" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<RefreshCw className="size-4" />} onClick={convert}>Convert to {to.toUpperCase()}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName={`svg-to-${to}.zip`} onReset={reset} />}
    </div>
  )
}

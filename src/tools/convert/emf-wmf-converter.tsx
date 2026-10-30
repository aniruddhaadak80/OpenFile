import { useEffect, useMemo, useState } from 'react'
import { Image as ImageIcon, Trash2 } from 'lucide-react'
import { Button, Dropzone, Field, Progress, Select, Slider, Switch, ToolGrid, cn, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { metafileInfo, type MetaInfo } from '@/lib/b14/convert'
import { useBlobUrl } from '@/lib/b14/ui'
import { safeBlobUrl } from '../../lib/safe'

type Out = 'svg' | 'png' | 'jpg' | 'pdf'
interface Item { file: File; info?: MetaInfo; svg?: string; w: number; h: number; error?: string }

/** Render an EMF or WMF file to an SVG string with rtf.js (MIT), then trim the view box to the drawing. */
async function renderMeta(buf: ArrayBuffer): Promise<{ svg: string; w: number; h: number; info: MetaInfo }> {
  const info = metafileInfo(buf)
  const { EMFJS, WMFJS } = await import('rtf.js')
  EMFJS.loggingEnabled(false); WMFJS.loggingEnabled(false)
  const W = Math.max(1, Math.round(info.width)), H = Math.max(1, Math.round(info.height))
  // Metafiles may hold rectangles with a negative width or height. SVG rejects those (and the browser logs an error),
  // so while rtf.js builds the picture store the size as positive and move the corner instead.
  const neg: [Element, 'x' | 'y', number][] = []
  const orig = Element.prototype.setAttribute
  Element.prototype.setAttribute = function (this: Element, name: string, value: string) {
    if ((name === 'width' || name === 'height') && this.namespaceURI === 'http://www.w3.org/2000/svg' && this.localName !== 'svg') {
      const n = parseFloat(String(value))
      if (n < 0) { neg.push([this, name === 'width' ? 'x' : 'y', n]); value = String(-n) }
    }
    return orig.call(this, name, value)
  }
  let el: SVGElement
  try {
    el = info.kind === 'emf'
      ? new EMFJS.Renderer(buf).render({ width: W + 'px', height: H + 'px', wExt: W, hExt: H, xExt: W, yExt: H, mapMode: 8 })
      : new WMFJS.Renderer(buf).render({ width: W + 'px', height: H + 'px', xExt: W, yExt: H, mapMode: 8 })
  } finally { Element.prototype.setAttribute = orig }
  for (const [node, axis, n] of neg) node.setAttribute(axis, String((parseFloat(node.getAttribute(axis) ?? '0') || 0) + n))
  // measure the real drawing, so pictures with odd window origins are not cut off or tiny
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden'
  host.appendChild(el); document.body.appendChild(host)
  let vb = { x: 0, y: 0, w: W, h: H }
  try { const b = (el as unknown as SVGGraphicsElement).getBBox(); if (b.width > 0.5 && b.height > 0.5) vb = { x: b.x, y: b.y, w: b.width, h: b.height } } catch { /* keep header size */ }
  host.remove()
  const pad = Math.max(vb.w, vb.h) * 0.01
  const ow = Math.round(info.mmWidth && info.mmWidth > 1 ? info.mmWidth * 3.7795 : vb.w), oh = Math.round(ow * (vb.h + 2 * pad) / (vb.w + 2 * pad))
  el.setAttribute('viewBox', `${vb.x - pad} ${vb.y - pad} ${vb.w + 2 * pad} ${vb.h + 2 * pad}`)
  el.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  el.setAttribute('width', String(Math.max(16, ow))); el.setAttribute('height', String(Math.max(16, oh)))
  el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return { svg: new XMLSerializer().serializeToString(el), w: Math.max(16, ow), h: Math.max(16, oh), info }
}

async function rasterize(svg: string, w: number, h: number, scale: number, type: 'image/png' | 'image/jpeg', bg: string | null): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image(); img.src = url; await img.decode()
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale)
    const ctx = c.getContext('2d')!
    if (bg || type === 'image/jpeg') { ctx.fillStyle = bg || '#ffffff'; ctx.fillRect(0, 0, c.width, c.height) }
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the picture.'))), type, 0.92))
  } finally { URL.revokeObjectURL(url) }
}

async function toPdf(svg: string, w: number, h: number): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  await import('svg2pdf.js')
  const pt = (px: number) => px * 0.75
  const doc = new jsPDF({ unit: 'pt', format: [pt(w), pt(h)], orientation: w > h ? 'landscape' : 'portrait' })
  const { sanitizeMarkup } = await import('@/lib/safe')
  const el = new DOMParser().parseFromString(sanitizeMarkup(svg, 'image/svg+xml'), 'image/svg+xml').documentElement
  await (doc as any).svg(el, { x: 0, y: 0, width: pt(w), height: pt(h) })
  return doc.output('blob')
}

function Thumb({ item, active, onClick }: { item: Item; active: boolean; onClick: () => void }) {
  // memoised: a new Blob on every render made a new URL and revoked the one the picture was still loading
  const blob = useMemo(() => (item.svg ? new Blob([item.svg], { type: 'image/svg+xml' }) : null), [item.svg])
  const url = useBlobUrl(blob)
  return (
    <button onClick={onClick} className={cn('flex cursor-pointer flex-col gap-1 rounded-xl border p-2 text-left text-xs', active ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:bg-surface-2')}>
      <div className="grid h-20 place-items-center rounded-lg bg-white">{url ? <img src={safeBlobUrl(url)} alt="" className="max-h-full max-w-full" /> : <span className="text-danger">{item.error ? 'error' : '...'}</span>}</div>
      <span className="truncate">{item.file.name}</span>
    </button>
  )
}

export default function EmfWmfConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState(0)
  const [out, setOut] = useState<Out>('png')
  const [scale, setScale] = useState(2)
  const [bgOn, setBgOn] = useState(false)
  const { busy, progress, run } = useJob()
  const add = (fs: File[]) => run(async (setP) => {
    const next = [...items]
    for (let i = 0; i < fs.length; i++) {
      setP(i / fs.length)
      try { let buf = await fs[i].arrayBuffer(); const u = new Uint8Array(buf); if (u[0] === 0x1f && u[1] === 0x8b) { const { gunzipSync } = await import('fflate'); const g = gunzipSync(u); buf = g.buffer.slice(g.byteOffset, g.byteOffset + g.byteLength) as ArrayBuffer } const r = await renderMeta(buf); next.push({ file: fs[i], info: r.info, svg: r.svg, w: r.w, h: r.h }) }
      catch (e: any) { next.push({ file: fs[i], w: 0, h: 0, error: e?.message || 'Could not read this picture.' }) }
      setItems([...next])
    }
  })
  const cur = items[sel]
  const curBlob = useMemo(() => (cur?.svg ? new Blob([cur.svg], { type: 'image/svg+xml' }) : null), [cur?.svg])
  const url = useBlobUrl(curBlob)
  useEffect(() => { if (sel >= items.length) setSel(0) }, [items.length])
  const one = async (it: Item): Promise<{ name: string; data: Blob }> => {
    if (!it.svg) throw new Error(it.error)
    // sample.emf and sample.wmf would both become sample.png, so keep the source type in the name when base names clash
    const base = baseName(it.file.name)
    const name = items.filter((x) => x.svg && baseName(x.file.name).toLowerCase() === base.toLowerCase()).length > 1 ? `${base}-${(it.file.name.split('.').pop() || it.info?.kind || 'file').toLowerCase()}` : base
    if (out === 'svg') return { name: name + '.svg', data: new Blob([it.svg], { type: 'image/svg+xml' }) }
    if (out === 'pdf') return { name: name + '.pdf', data: await toPdf(it.svg, it.w, it.h) }
    return { name: `${name}.${out}`, data: await rasterize(it.svg, it.w, it.h, scale, out === 'png' ? 'image/png' : 'image/jpeg', bgOn ? '#ffffff' : null) }
  }
  const exportAll = () => run(async (setP) => {
    const good = items.filter((i) => i.svg)
    if (good.length === 1) { const r = await one(good[0]); downloadBlob(r.data, r.name); return }
    const files = []
    for (let i = 0; i < good.length; i++) { setP(i / good.length); files.push(await one(good[i])) }
    downloadBlob(await zipFiles(files), `metafiles-${out}.zip`)
  })
  if (!items.length) return <Dropzone multiple accept=".emf,.wmf,.emz,.wmz" onFiles={add} label="Drop EMF or WMF pictures" sub="Old Windows clip art, Office drawings and charts. Turn them into SVG, PNG, JPG or PDF that open anywhere." />
  return (
    <ToolGrid
      main={<>
        <div className="grid min-h-72 place-items-center overflow-hidden rounded-2xl border border-border bg-white p-4 checker">
          {cur?.error ? <p className="max-w-md text-center text-sm text-danger">{cur.error}</p> : url ? <img src={safeBlobUrl(url)} alt={cur?.file.name} className="max-h-[60vh] max-w-full" /> : <span className="text-sm text-muted">Drawing</span>}
        </div>
        {cur?.info && <p className="text-xs text-muted">{cur.info.kind.toUpperCase()} · {formatBytes(cur.file.size)} · {cur.w} x {cur.h} px{cur.info.mmWidth ? ` · ${cur.info.mmWidth.toFixed(1)} x ${cur.info.mmHeight!.toFixed(1)} mm` : ''}{cur.info.records ? ` · ${cur.info.records} records` : ''}</p>}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{items.map((it, i) => <Thumb key={i} item={it} active={i === sel} onClick={() => setSel(i)} />)}</div>
      </>}
      side={<>
        <Field label="Save as"><Select value={out} onChange={setOut} options={[{ value: 'png', label: 'PNG (transparent)' }, { value: 'svg', label: 'SVG (vector)' }, { value: 'pdf', label: 'PDF (vector)' }, { value: 'jpg', label: 'JPG' }]} /></Field>
        {(out === 'png' || out === 'jpg') && <Slider label="Size" value={scale} onChange={setScale} min={1} max={6} suffix="x" />}
        {out === 'png' && <Switch checked={bgOn} onChange={setBgOn} label="White background" />}
        {busy && <Progress value={progress} label="Working" />}
        <Button size="lg" className="w-full" icon={<ImageIcon className="size-5" />} onClick={exportAll} loading={busy} disabled={!items.some((i) => i.svg)}>{items.filter((i) => i.svg).length > 1 ? `Convert ${items.filter((i) => i.svg).length} files (ZIP)` : 'Convert and download'}</Button>
        <Dropzone compact multiple accept=".emf,.wmf,.emz,.wmz" onFiles={add} label="Add more" />
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => setItems([])}>Start over</Button>
        <p className="text-xs text-muted">Drawing is done by the rtf.js metafile engine in your browser. Most lines, shapes, text and pictures come through. Rare EMF+ effects may be skipped.</p>
      </>}
    />
  )
}

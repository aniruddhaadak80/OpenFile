import { useEffect, useRef, useState } from 'react'
import { Rows3, ArrowUp, ArrowDown, X } from 'lucide-react'
import { Button, Dropzone, Field, Input, Segmented, Select, Slider, Switch, ToolGrid, ResultCard } from '@/components/ui'
import { canvasToBlob, loadImage } from '@/lib/files'
import { findOverlap, rowHashes } from '@/lib/b14/image'
import { OpenButton } from '@/lib/b14/ui'

type Dir = 'vertical' | 'horizontal' | 'grid'

export default function ImageStitcher() {
  const [files, setFiles] = useState<File[]>([])
  const [imgs, setImgs] = useState<HTMLImageElement[]>([])
  const [dir, setDir] = useState<Dir>('vertical')
  const [cols, setCols] = useState(2)
  const [gap, setGap] = useState(0)
  const [bg, setBg] = useState('#FFFFFF')
  const [fit, setFit] = useState(true)
  const [overlap, setOverlap] = useState(false)
  const [fmt, setFmt] = useState<'png' | 'jpeg'>('png')
  const [out, setOut] = useState<Blob | null>(null)
  const [note, setNote] = useState('')
  const view = useRef<HTMLCanvasElement>(null)
  useEffect(() => { Promise.all(files.map((f) => loadImage(f))).then(setImgs) }, [files])
  useEffect(() => {
    const c = view.current; if (!c || !imgs.length) return
    const t = setTimeout(async () => {
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      // scale every image to a common width (vertical) or height (horizontal / grid cell)
      const base = dir === 'horizontal' ? Math.min(...imgs.map((i) => i.naturalHeight)) : Math.min(...imgs.map((i) => i.naturalWidth))
      const sized = imgs.map((i) => { const s = fit ? (dir === 'horizontal' ? base / i.naturalHeight : base / i.naturalWidth) : 1; return { i, w: Math.round(i.naturalWidth * s), h: Math.round(i.naturalHeight * s) } })
      let cuts: number[] = sized.map(() => 0)
      if (dir === 'vertical' && overlap && sized.length > 1) {
        const hashes = sized.map((s) => { const t = document.createElement('canvas'); t.width = s.w; t.height = s.h; const tc = t.getContext('2d', { willReadFrequently: true })!; tc.drawImage(s.i, 0, 0, s.w, s.h); return rowHashes(tc.getImageData(0, 0, s.w, s.h).data, s.w, s.h) })
        cuts = sized.map((_, k) => (k === 0 ? 0 : findOverlap(hashes[k - 1], hashes[k])))
        const found = cuts.filter(Boolean).length
        setNote(found ? `Found the overlap in ${found} of ${sized.length - 1} joins.` : 'No exact overlap found. Screenshots must be the same width and taken at the same zoom.')
      } else setNote('')
      if (dir === 'grid') {
        const cw = Math.max(...sized.map((s) => s.w)), ch = Math.max(...sized.map((s) => s.h)), rows = Math.ceil(sized.length / cols)
        c.width = cols * cw + gap * (cols - 1); c.height = rows * ch + gap * (rows - 1)
        ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height)
        sized.forEach((s, k) => { const x = (k % cols) * (cw + gap), y = Math.floor(k / cols) * (ch + gap); ctx.drawImage(s.i, x + (cw - s.w) / 2, y + (ch - s.h) / 2, s.w, s.h) })
      } else if (dir === 'vertical') {
        const W = Math.max(...sized.map((s) => s.w)), H = sized.reduce((a, s, k) => a + s.h - cuts[k], 0) + gap * (sized.length - 1)
        c.width = W; c.height = Math.min(H, 32000)
        ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height)
        let y = 0; sized.forEach((s, k) => { ctx.drawImage(s.i, 0, (cuts[k] / s.h) * s.i.naturalHeight, s.i.naturalWidth, s.i.naturalHeight * (1 - cuts[k] / s.h), (W - s.w) / 2, y, s.w, s.h - cuts[k]); y += s.h - cuts[k] + gap })
      } else {
        const H = Math.max(...sized.map((s) => s.h)), W = sized.reduce((a, s) => a + s.w, 0) + gap * (sized.length - 1)
        c.width = Math.min(W, 32000); c.height = H
        ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height)
        let x = 0; sized.forEach((s) => { ctx.drawImage(s.i, x, (H - s.h) / 2, s.w, s.h); x += s.w + gap })
      }
      setOut(await canvasToBlob(c, `image/${fmt}`, 0.92))
    }, 120)
    return () => clearTimeout(t)
  }, [imgs, dir, cols, gap, bg, fit, overlap, fmt])
  const move = (i: number, d: number) => setFiles((p) => { const n = [...p], j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n })
  if (!files.length) return <Dropzone multiple accept="image/*" onFiles={setFiles} label="Drop two or more images" sub="Join images side by side, top to bottom or in a grid. Scrolling screenshots can be joined where they overlap." />
  return (
    <ToolGrid
      main={<>
        <div className="flex flex-wrap gap-2">{files.map((f, i) => <div key={i} className="flex items-center gap-1 rounded-xl border border-border bg-surface px-2 py-1 text-xs"><span className="max-w-32 truncate">{i + 1}. {f.name}</span><Button size="sm" variant="ghost" aria-label="Move earlier" onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button><Button size="sm" variant="ghost" aria-label="Move later" onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button><Button size="sm" variant="ghost" aria-label="Remove" onClick={() => setFiles(files.filter((_, k) => k !== i))}><X className="size-3.5" /></Button></div>)}<OpenButton multiple accept="image/*" onFiles={(f) => setFiles([...files, ...f])} label="Add" /></div>
        <div className="checker scrollbar-thin grid max-h-[70vh] place-items-center overflow-auto rounded-2xl border border-border p-3"><canvas ref={view} className="max-w-full" aria-label="Stitched preview" /></div>
        {note && <p className="text-xs text-muted">{note}</p>}
        {out && <ResultCard blob={out} filename={`stitched.${fmt === 'jpeg' ? 'jpg' : 'png'}`} title="Stitched image ready" onReset={() => setFiles([])} />}
      </>}
      side={<>
        <Field label="Direction"><Segmented value={dir} onChange={setDir} options={[{ value: 'vertical', label: 'Top to bottom' }, { value: 'horizontal', label: 'Side by side' }, { value: 'grid', label: 'Grid' }]} /></Field>
        {dir === 'grid' && <Field label="Columns"><Select value={String(cols)} onChange={(v) => setCols(+v)} options={['2', '3', '4', '5', '6']} /></Field>}
        {dir === 'vertical' && <Switch checked={overlap} onChange={setOverlap} label="Join scrolling screenshots at the overlap" />}
        <Switch checked={fit} onChange={setFit} label={dir === 'horizontal' ? 'Same height for all' : 'Same width for all'} />
        <Slider label="Gap" value={gap} onChange={setGap} min={0} max={80} suffix=" px" />
        <Field label="Background"><Input type="color" value={bg} onChange={(e) => setBg(e.target.value)} aria-label="Background colour" /></Field>
        <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }]} /></Field>
        <p className="flex gap-1.5 text-xs text-muted"><Rows3 className="size-4 shrink-0" />Very long results are capped at 32,000 pixels, the most browsers can draw.</p>
      </>}
    />
  )
}

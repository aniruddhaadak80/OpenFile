import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanText, Languages, FileDown, FileText, Square, CheckCircle2, Loader2, Clock, X, Sparkles, Eye, EyeOff, ImagePlus } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Input, Switch, Segmented, Spinner, ErrorNote, Progress, CopyButton, cn, Badge } from '@/components/ui'
import { toast } from '@/components/toast'
import { openPdfJs, renderPage, pdfBlob, type PdfJsDoc } from '@/lib/pdf'
import { downloadBlob, baseName, loadImage, parsePageRanges, formatBytes } from '@/lib/files'
import { pdfError } from './_adv/pages'

const LANGS = [
  { code: 'eng', label: 'English' }, { code: 'hin', label: 'हिन्दी Hindi' }, { code: 'ben', label: 'বাংলা Bengali' }, { code: 'spa', label: 'Español' },
  { code: 'fra', label: 'Français' }, { code: 'deu', label: 'Deutsch' }, { code: 'por', label: 'Português' }, { code: 'ita', label: 'Italiano' },
  { code: 'jpn', label: '日本語 Japanese' }, { code: 'chi_sim', label: '简体中文 Chinese' }, { code: 'ara', label: 'العربية Arabic' }, { code: 'rus', label: 'Русский Russian' },
]
const NON_LATIN = new Set(['hin', 'ben', 'jpn', 'chi_sim', 'ara', 'rus'])
type Quality = 'fast' | 'balanced' | 'best'
const SCALE: Record<Quality, number> = { fast: 1.5, balanced: 2.2, best: 3 }

type Word = { text: string; x0: number; y0: number; x1: number; y1: number; base?: number }
type PageRes = { index: number; label: string; status: 'queued' | 'working' | 'done' | 'skipped' | 'error'; progress: number; text: string; conf: number; words: Word[]; thumb?: string; w: number; h: number; ptW: number; ptH: number; jpeg?: Uint8Array; pdfText?: Uint8Array | null; error?: string }
type Source = { kind: 'pdf'; file: File; doc: PdfJsDoc } | { kind: 'images'; files: File[] }

export default function OcrPdf() {
  const [src, setSrc] = useState<Source | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [langs, setLangs] = useState<string[]>(['eng'])
  const [quality, setQuality] = useState<Quality>('balanced')
  const [range, setRange] = useState('')
  const [skipText, setSkipText] = useState(false)
  const [makePdf, setMakePdf] = useState(true)
  const [pages, setPages] = useState<PageRes[]>([])
  const [running, setRunning] = useState(false)
  const [overall, setOverall] = useState(0)
  const [stage, setStage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pdfOut, setPdfOut] = useState<{ blob: Blob; warn: string | null } | null>(null)
  const [view, setView] = useState<number | null>(null)
  const [boxes, setBoxes] = useState(true)
  const cancel = useRef<{ stop: boolean; worker?: any }>({ stop: false })

  const total = src?.kind === 'pdf' ? src.doc.numPages : src?.files.length ?? 0
  const name = src?.kind === 'pdf' ? src.file.name : src ? (src.files.length === 1 ? src.files[0].name : `${src.files.length} images`) : ''

  async function onFiles(files: File[]) {
    setLoadErr(null); setPages([]); setPdfOut(null); setError(null)
    const pdf = files.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (pdf) {
      try { setSrc({ kind: 'pdf', file: pdf, doc: await openPdfJs(pdf) }) } catch (e) { setLoadErr(pdfError(e)) }
    } else setSrc({ kind: 'images', files: files.filter((f) => f.type.startsWith('image/')) })
  }
  const reset = () => { stop(); setSrc(null); setPages([]); setPdfOut(null); setError(null); setRange('') }
  function stop() { cancel.current.stop = true; cancel.current.worker?.terminate().catch(() => {}); cancel.current.worker = undefined }
  useEffect(() => () => stop(), [])

  const toggleLang = (c: string) => setLangs((l) => l.includes(c) ? (l.length > 1 ? l.filter((x) => x !== c) : l) : [...l, c])

  async function getPageCanvas(i: number): Promise<{ canvas: HTMLCanvasElement; ptW: number; ptH: number; label: string; hasText: boolean }> {
    if (src!.kind === 'pdf') {
      const page = await src!.doc.getPage(i + 1)
      const vp = page.getViewport({ scale: 1 })
      let hasText = false
      if (skipText) { const tc = await page.getTextContent(); hasText = (tc.items as any[]).filter((x) => x.str?.trim()).length > 5 }
      const canvas = await renderPage(src!.doc, i + 1, SCALE[quality])
      return { canvas, ptW: vp.width, ptH: vp.height, label: `Page ${i + 1}`, hasText }
    }
    const f = src!.files[i]
    const img = await loadImage(f)
    const max = quality === 'fast' ? 2000 : quality === 'balanced' ? 3000 : 4200
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * s); canvas.height = Math.round(img.naturalHeight * s)
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const k = Math.min(0.75, 842 / Math.max(img.naturalWidth, img.naturalHeight))
    return { canvas, ptW: img.naturalWidth * k, ptH: img.naturalHeight * k, label: f.name, hasText: false }
  }

  async function run() {
    if (!src) return
    const idx = src.kind === 'pdf' && range.trim() ? parsePageRanges(range, total) : Array.from({ length: total }, (_, i) => i)
    if (!idx.length) { setError('No pages match that range.'); return }
    cancel.current = { stop: false }
    setRunning(true); setError(null); setPdfOut(null); setOverall(0)
    const init: PageRes[] = idx.map((i) => ({ index: i, label: src.kind === 'pdf' ? `Page ${i + 1}` : src.files[i].name, status: 'queued', progress: 0, text: '', conf: 0, words: [], w: 0, h: 0, ptW: 0, ptH: 0 }))
    setPages(init)
    const results = init.map((p) => ({ ...p }))
    const patch = (k: number, p: Partial<PageRes>) => { Object.assign(results[k], p); setPages(results.map((r) => ({ ...r }))) }
    let currentK = 0
    const wantTessPdf = makePdf && langs.some((l) => NON_LATIN.has(l))
    try {
      setStage('Loading OCR engine & language data…')
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker(langs, 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            patch(currentK, { progress: m.progress })
            setOverall((currentK + m.progress) / results.length)
          } else if (/loading|initializ/i.test(m.status)) setStage(`${m.status[0].toUpperCase()}${m.status.slice(1)}… ${m.progress ? Math.round(m.progress * 100) + '%' : ''}`)
        },
      })
      cancel.current.worker = worker
      if (cancel.current.stop) { await worker.terminate(); return }
      for (let k = 0; k < results.length; k++) {
        if (cancel.current.stop) break
        currentK = k
        setStage(`Recognising ${results[k].label} (${k + 1}/${results.length})`)
        patch(k, { status: 'working', progress: 0 })
        try {
          const { canvas, ptW, ptH, hasText } = await getPageCanvas(results[k].index)
          const thumbC = document.createElement('canvas'); const ts = 360 / canvas.width; thumbC.width = 360; thumbC.height = Math.round(canvas.height * ts)
          thumbC.getContext('2d')!.drawImage(canvas, 0, 0, thumbC.width, thumbC.height)
          const thumb = thumbC.toDataURL('image/jpeg', 0.8)
          const jpegBlob: Blob = await new Promise((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error('Render failed'))), 'image/jpeg', quality === 'best' ? 0.9 : 0.82))
          const jpeg = new Uint8Array(await jpegBlob.arrayBuffer())
          if (hasText) { patch(k, { status: 'skipped', thumb, w: canvas.width, h: canvas.height, ptW, ptH, jpeg, text: '' }); continue }
          const res: any = await worker.recognize(canvas, wantTessPdf ? { pdfTitle: 'OCR', pdfTextOnly: true } : {}, { text: true, blocks: true, pdf: wantTessPdf })
          const words: Word[] = []
          for (const b of res.data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
            const bl = l.baseline
            for (const w of l.words ?? []) {
              if (!w.text?.trim()) continue
              let base: number | undefined
              if (bl && bl.x1 !== bl.x0) { const cx = (w.bbox.x0 + w.bbox.x1) / 2; base = bl.y0 + (bl.y1 - bl.y0) * ((cx - bl.x0) / (bl.x1 - bl.x0)) }
              words.push({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, base })
            }
          }
          const pdfText = res.data.pdf && res.data.pdf.length ? new Uint8Array(res.data.pdf) : null
          patch(k, { status: 'done', progress: 1, text: (res.data.text ?? '').trim(), conf: res.data.confidence ?? 0, words, thumb, w: canvas.width, h: canvas.height, ptW, ptH, jpeg, pdfText })
          canvas.width = canvas.height = 0
        } catch (e: any) {
          if (cancel.current.stop) break
          patch(k, { status: 'error', error: e?.message || 'Failed' })
        }
        setOverall((k + 1) / results.length)
      }
      await worker.terminate().catch(() => {})
      cancel.current.worker = undefined
      if (cancel.current.stop) { toast('OCR stopped', 'info'); return }
      if (makePdf) { setStage('Building searchable PDF…'); setPdfOut(await buildSearchablePdf(results)) }
      const n = results.filter((r) => r.status === 'done').length
      toast(`Recognised text on ${n} page${n === 1 ? '' : 's'}`)
    } catch (e: any) {
      if (!cancel.current.stop) {
        const msg = /fetch|network|Failed to load/i.test(e?.message || '') ? 'Could not download the OCR engine or language data. Check your internet connection (only the language model is downloaded, your file stays local).' : e?.message || String(e)
        setError(msg); toast(msg, 'error')
      }
    } finally { setRunning(false); setStage('') }
  }

  const fullText = useMemo(() => pages.filter((p) => p.status === 'done').map((p) => (pages.length > 1 ? `--- ${p.label} ---\n` : '') + p.text).join('\n\n'), [pages])
  const done = pages.filter((p) => p.status === 'done')
  const avgConf = done.length ? done.reduce((n, p) => n + p.conf, 0) / done.length : 0
  const viewed = view !== null ? pages.find((p) => p.index === view) : null

  if (!src) return (
    <div className="space-y-3">
      <Dropzone accept="application/pdf,.pdf,image/*" multiple onFiles={onFiles} label="Drop a scanned PDF or images" sub="PDF, JPG, PNG, WEBP… Recognition runs on your device; only the language model is downloaded once." />
      <ErrorNote error={loadErr} />
    </div>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        {pages.length === 0 ? (
          <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-surface-2/30 p-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-brand text-on-accent shadow-xl shadow-accent/30"><ScanText className="size-7" /></div>
              <div className="font-semibold">{name} · {total} page{total === 1 ? '' : 's'}</div>
              <p className="max-w-md text-sm text-muted">Choose the document languages on the right, then start. You'll get copyable text, a .txt file and a searchable PDF with an invisible text layer.</p>
            </div>
          </div>
        ) : (
          <>
            {running && <div className="rounded-2xl border border-border bg-surface p-4"><Progress value={overall} label={stage || 'Working…'} /></div>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
              {pages.map((p) => (
                <motion.button layout type="button" key={p.index} onClick={() => p.thumb && setView(p.index)} className={cn('group relative overflow-hidden rounded-xl border-2 bg-surface-2 p-1.5 text-left transition', view === p.index ? 'border-accent' : 'border-border hover:border-accent/50', p.thumb && 'cursor-pointer')}>
                  <div className="relative grid aspect-[3/4] place-items-center overflow-hidden rounded-md bg-white">
                    {p.thumb ? <img src={p.thumb} alt="" className="max-h-full max-w-full" /> : <ScanText className="size-6 text-slate-300" />}
                    {p.status === 'working' && <motion.div className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-accent/30 to-transparent" animate={{ top: ['-10%', '100%'] }} transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }} />}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
                    {p.status === 'done' && <CheckCircle2 className="size-3.5 shrink-0 text-success" />}
                    {p.status === 'working' && <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />}
                    {p.status === 'queued' && <Clock className="size-3.5 shrink-0 text-muted" />}
                    {p.status === 'error' && <X className="size-3.5 shrink-0 text-danger" />}
                    {p.status === 'skipped' && <FileText className="size-3.5 shrink-0 text-muted" />}
                    <span className="min-w-0 flex-1 truncate font-medium">{p.label}</span>
                    {p.status === 'done' && <span className={cn('font-mono', p.conf > 80 ? 'text-success' : p.conf > 60 ? 'text-warn' : 'text-danger')}>{Math.round(p.conf)}%</span>}
                    {p.status === 'working' && <span className="font-mono text-muted">{Math.round(p.progress * 100)}%</span>}
                    {p.status === 'skipped' && <span className="text-muted">has text</span>}
                  </div>
                </motion.button>
              ))}
            </div>
            <AnimatePresence>
              {viewed?.thumb && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">{viewed.label}{viewed.status === 'done' && <span className="ml-2 font-normal text-muted">{viewed.words.length} words</span>}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" icon={boxes ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} onClick={() => setBoxes((b) => !b)}>{boxes ? 'Hide boxes' : 'Show boxes'}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setView(null)} icon={<X className="size-3.5" />} aria-label="Close preview" />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="relative mx-auto w-full max-w-md bg-white shadow ring-1 ring-black/10">
                      <img src={viewed.thumb} alt="" className="block w-full" />
                      {boxes && viewed.w > 0 && viewed.words.map((w, i) => (
                        <span key={i} title={w.text} className="absolute border border-accent/70 bg-accent/10" style={{ left: `${(w.x0 / viewed.w) * 100}%`, top: `${(w.y0 / viewed.h) * 100}%`, width: `${((w.x1 - w.x0) / viewed.w) * 100}%`, height: `${((w.y1 - w.y0) / viewed.h) * 100}%` }} />
                      ))}
                    </div>
                    <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2/50 p-3 text-sm leading-relaxed scrollbar-thin">{viewed.text || <span className="text-muted">No text recognised on this page.</span>}</pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {!running && done.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">Recognised text <Badge color={avgConf > 80 ? '#22c55e' : avgConf > 60 ? '#f59e0b' : '#ef4444'}>{Math.round(avgConf)}% CONFIDENCE</Badge></div>
                  <div className="flex gap-2">
                    <CopyButton text={fullText} label="Copy all" />
                    <Button size="sm" variant="outline" icon={<FileText className="size-4" />} onClick={() => downloadBlob(fullText, `${baseName(name)}-ocr.txt`, 'text/plain;charset=utf-8')}>.txt</Button>
                  </div>
                </div>
                <textarea readOnly value={fullText} className="h-72 w-full resize-y rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-[13px] leading-relaxed text-fg outline-none scrollbar-thin" dir="auto" />
              </motion.div>
            )}
          </>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <FileChip file={{ name, size: src.kind === 'pdf' ? src.file.size : src.files.reduce((n, f) => n + f.size, 0) }} onRemove={reset} extra={<span className="text-xs text-muted">{total}p</span>} />
          {src.kind === 'images' && !running && (
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-1.5 text-xs text-muted hover:border-accent hover:text-accent">
              <ImagePlus className="size-3.5" />Add more images
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) setSrc({ kind: 'images', files: [...src.files, ...fs] }); e.target.value = '' }} />
            </label>
          )}
          <div>
            <Label hint={`${langs.length} selected`}><span className="inline-flex items-center gap-1.5"><Languages className="size-3.5" />Languages</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {LANGS.map((l) => (
                <button key={l.code} type="button" disabled={running} onClick={() => toggleLang(l.code)} className={cn('rounded-lg border px-2 py-1 text-xs transition cursor-pointer disabled:opacity-50', langs.includes(l.code) ? 'border-accent bg-accent/10 font-medium text-fg' : 'border-border text-muted hover:border-accent/40')}>{l.label}</button>
              ))}
            </div>
            {langs.length > 2 && <p className="mt-1.5 text-xs text-warn">Each extra language slows recognition, pick only those in the document.</p>}
          </div>
          <div>
            <Label>Accuracy</Label>
            <Segmented value={quality} onChange={setQuality} options={[{ value: 'fast', label: 'Fast' }, { value: 'balanced', label: 'Balanced' }, { value: 'best', label: 'Best' }]} />
          </div>
          {src.kind === 'pdf' && total > 1 && (
            <div className="space-y-3">
              <div><Label>Pages</Label><Input value={range} onChange={(e) => setRange(e.target.value)} placeholder={`All (1-${total}) · e.g. 1-3, 5`} disabled={running} /></div>
              <Switch checked={skipText} onChange={setSkipText} label={<span className="text-sm">Skip pages that already have text</span>} />
            </div>
          )}
          <Switch checked={makePdf} onChange={setMakePdf} label={<span className="text-sm">Create searchable PDF</span>} />
          <ErrorNote error={error} />
          {running ? (
            <Button size="lg" variant="danger" className="w-full" icon={<Square className="size-4" />} onClick={stop}>Stop</Button>
          ) : (
            <Button size="lg" className="w-full" icon={<Sparkles className="size-4" />} onClick={run}>{done.length ? 'Run OCR again' : 'Start OCR'}</Button>
          )}
          <AnimatePresence>
            {pdfOut && !running && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-2 rounded-xl border border-success/30 bg-success/5 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-success" />Searchable PDF ready <span className="font-normal text-muted">· {formatBytes(pdfOut.blob.size)}</span></div>
                {pdfOut.warn && <p className="text-xs text-warn">{pdfOut.warn}</p>}
                <Button className="w-full" icon={<FileDown className="size-4" />} onClick={() => downloadBlob(pdfOut.blob, `${baseName(name)}-searchable.pdf`)}>Download PDF</Button>
              </motion.div>
            )}
          </AnimatePresence>
          {running && <Spinner label={stage} />}
        </div>
      </aside>
    </div>
  )
}

async function buildSearchablePdf(results: PageRes[]): Promise<{ blob: Blob; warn: string | null }> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)
  let skippedWords = 0
  for (const r of results) {
    if (!r.jpeg || !r.ptW) continue
    const img = await out.embedJpg(r.jpeg)
    const page = out.addPage([r.ptW, r.ptH])
    page.drawImage(img, { x: 0, y: 0, width: r.ptW, height: r.ptH })
    if (r.status !== 'done') continue
    const f = r.ptW / r.w
    const unencodable = r.words.filter((w) => { try { font.encodeText(w.text); return false } catch { return true } })
    if (unencodable.length && r.pdfText) {
      // Tesseract's own glyph-less text layer handles any script; lay it over the image
      try {
        const [emb] = await out.embedPdf(r.pdfText)
        page.drawPage(emb, { x: 0, y: 0, width: r.ptW, height: r.ptH })
        continue
      } catch { /* fall back to per-word layer */ }
    }
    for (const w of r.words) {
      let text = w.text
      try { font.encodeText(text) } catch { text = text.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ''); skippedWords++; if (!text) continue }
      const bw = (w.x1 - w.x0) * f, bh = (w.y1 - w.y0) * f
      const at1 = font.widthOfTextAtSize(text, 1) || 1
      let size = bw / at1
      size = Math.max(bh * 0.5, Math.min(size, bh * 2.2, 200))
      const baseY = (w.base ?? w.y1 - (w.y1 - w.y0) * 0.2) * f
      page.drawText(text, { x: w.x0 * f, y: r.ptH - baseY, size, font, opacity: 0 })
    }
  }
  out.setTitle('OCR searchable document'); out.setProducer('OpenFile OCR (tesseract.js)')
  const warn = skippedWords ? `${skippedWords} word${skippedWords === 1 ? '' : 's'} in non-Latin scripts couldn't be added to the PDF text layer, use the copied text or .txt for those.` : null
  return { blob: pdfBlob(await out.save()), warn }
}

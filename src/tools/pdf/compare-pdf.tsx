import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeftRight, GitCompare, FileText, Plus, Minus, Equal, Layers, Columns2, AlignLeft, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, Dropzone, FileChip, Switch, Segmented, Spinner, ErrorNote, Progress, Tabs, useJob, cn, Empty, Slider, CopyButton } from '@/components/ui'
import { openPdfJs, allText, renderPage, type PdfJsDoc } from '@/lib/pdf'
import { pdfError } from './_adv/pages'

type Part = { value: string; added?: boolean; removed?: boolean }
type PageDiff = { index: number; parts: Part[]; added: number; removed: number; same: number; onlyIn?: 'A' | 'B' }
type Mode = 'side' | 'inline' | 'visual'

const words = (s: string) => (s.match(/\S+/g) ?? []).length

export default function ComparePdf() {
  const [a, setA] = useState<File | null>(null)
  const [b, setB] = useState<File | null>(null)
  const [docs, setDocs] = useState<{ a: PdfJsDoc; b: PdfJsDoc } | null>(null)
  const [texts, setTexts] = useState<{ a: string[]; b: string[] } | null>(null)
  const [mode, setMode] = useState<Mode>('side')
  const [ignoreCase, setIgnoreCase] = useState(false)
  const [onlyChanged, setOnlyChanged] = useState(true)
  const job = useJob()

  useEffect(() => {
    setDocs(null); setTexts(null)
    if (!a || !b) return
    let alive = true
    job.run(async (p) => {
      let da: PdfJsDoc, db: PdfJsDoc
      try { da = await openPdfJs(a) } catch (e) { throw new Error('Original: ' + pdfError(e)) }
      try { db = await openPdfJs(b) } catch (e) { throw new Error('Changed: ' + pdfError(e)) }
      const ta = await allText(da, (x) => p(x * 0.5))
      const tb = await allText(db, (x) => p(0.5 + x * 0.5))
      if (alive) { setDocs({ a: da, b: db }); setTexts({ a: ta, b: tb }) }
    })
    return () => { alive = false }
  }, [a, b])

  const [diffs, setDiffs] = useState<PageDiff[] | null>(null)
  useEffect(() => {
    if (!texts) { setDiffs(null); return }
    let alive = true
    ;(async () => {
      const { diffWords } = await import('diff')
      const n = Math.max(texts.a.length, texts.b.length)
      const out: PageDiff[] = []
      for (let i = 0; i < n; i++) {
        const ta = texts.a[i], tb = texts.b[i]
        if (ta === undefined) { out.push({ index: i, parts: [{ value: tb, added: true }], added: words(tb), removed: 0, same: 0, onlyIn: 'B' }); continue }
        if (tb === undefined) { out.push({ index: i, parts: [{ value: ta, removed: true }], added: 0, removed: words(ta), same: 0, onlyIn: 'A' }); continue }
        const parts = diffWords(ta, tb, { ignoreCase }) as Part[]
        let added = 0, removed = 0, same = 0
        for (const p of parts) { const w = words(p.value); if (p.added) added += w; else if (p.removed) removed += w; else same += w }
        out.push({ index: i, parts, added, removed, same })
      }
      if (alive) setDiffs(out)
    })()
    return () => { alive = false }
  }, [texts, ignoreCase])

  const stats = useMemo(() => {
    if (!diffs) return null
    const added = diffs.reduce((n, d) => n + d.added, 0), removed = diffs.reduce((n, d) => n + d.removed, 0), same = diffs.reduce((n, d) => n + d.same, 0)
    const changedPages = diffs.filter((d) => d.added || d.removed).length
    const total = same + Math.max(added, removed)
    return { added, removed, same, changedPages, similarity: total ? same / total : 1 }
  }, [diffs])

  const noText = texts && texts.a.every((t) => !t.trim()) && texts.b.every((t) => !t.trim())
  const shownDiffs = diffs?.filter((d) => !onlyChanged || d.added || d.removed) ?? []

  const summary = () => stats ? `Comparison of "${a?.name}" vs "${b?.name}": ${stats.added} words added, ${stats.removed} removed, ${stats.changedPages} page(s) changed, ${(stats.similarity * 100).toFixed(1)}% similar.` : ''

  return (
    <div className="space-y-5">
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <Slot label="Original" tone="danger" file={a} onFile={setA} />
        <div className="flex items-center justify-center">
          <button type="button" onClick={() => { setA(b); setB(a) }} disabled={!a && !b} title="Swap" className="grid size-10 place-items-center rounded-full border border-border bg-surface text-muted transition hover:rotate-180 hover:border-accent hover:text-accent disabled:opacity-40 cursor-pointer"><ArrowLeftRight className="size-4" /></button>
        </div>
        <Slot label="Changed" tone="success" file={b} onFile={setB} />
      </div>

      {job.busy && <Progress value={job.progress} label="Extracting text from both PDFs…" />}
      <ErrorNote error={job.error} />

      {!a || !b ? (
        <Empty><GitCompare className="mx-auto mb-2 size-6 text-accent" />Add two versions of a document to see exactly what changed — word by word and pixel by pixel.</Empty>
      ) : stats && docs && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Plus} label="Words added" value={stats.added} cls="text-success" />
            <Stat icon={Minus} label="Words removed" value={stats.removed} cls="text-danger" />
            <Stat icon={Layers} label="Pages changed" value={`${stats.changedPages} / ${diffs!.length}`} cls="text-accent" />
            <Stat icon={Equal} label="Similarity" value={`${(stats.similarity * 100).toFixed(1)}%`} cls="text-fg" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={mode} onChange={setMode} tabs={[
              { value: 'side', label: <span className="inline-flex items-center gap-1.5"><Columns2 className="size-4" />Side by side</span> },
              { value: 'inline', label: <span className="inline-flex items-center gap-1.5"><AlignLeft className="size-4" />Inline</span> },
              { value: 'visual', label: <span className="inline-flex items-center gap-1.5"><ImageIcon className="size-4" />Visual</span> },
            ]} />
            {mode !== 'visual' && <div className="flex flex-wrap items-center gap-4">
              <Switch checked={onlyChanged} onChange={setOnlyChanged} label={<span className="text-sm">Changed pages only</span>} />
              <Switch checked={ignoreCase} onChange={setIgnoreCase} label={<span className="text-sm">Ignore case</span>} />
              <CopyButton text={summary} label="Copy summary" />
            </div>}
          </div>

          {noText && mode !== 'visual' && <ErrorNote error="Neither PDF contains selectable text (they may be scans). Use the Visual tab, or run OCR PDF on both first." />}

          <AnimatePresence mode="wait">
            <motion.div key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              {mode === 'visual' ? <VisualDiff a={docs.a} b={docs.b} diffs={diffs!} /> : (
                <div className="space-y-4">
                  {shownDiffs.length === 0 && <Empty>{stats.changedPages === 0 ? 'No text differences — the two documents read identically.' : 'Nothing to show.'}</Empty>}
                  {shownDiffs.map((d) => (
                    <div key={d.index} className="overflow-hidden rounded-2xl border border-border bg-surface">
                      <div className="flex items-center justify-between border-b border-border bg-surface-2/50 px-4 py-2 text-xs">
                        <span className="font-semibold">Page {d.index + 1}{d.onlyIn && <span className="ml-2 font-normal text-muted">only in {d.onlyIn === 'A' ? 'original' : 'changed'}</span>}</span>
                        <span className="flex gap-3 font-mono"><span className="text-success">+{d.added}</span><span className="text-danger">−{d.removed}</span></span>
                      </div>
                      {mode === 'side' ? (
                        <div className="grid divide-border md:grid-cols-2 md:divide-x">
                          <DiffText parts={d.parts} show="A" />
                          <DiffText parts={d.parts} show="B" />
                        </div>
                      ) : <DiffText parts={d.parts} show="both" />}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
      {a && b && !stats && !job.busy && !job.error && <Spinner label="Comparing…" />}
    </div>
  )
}

function Slot({ label, tone, file, onFile }: { label: string; tone: 'danger' | 'success'; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><span className={cn('size-2 rounded-full', tone === 'danger' ? 'bg-danger' : 'bg-success')} />{label}</div>
      {file ? <FileChip file={file} onRemove={() => onFile(null)} extra={<FileText className="size-4 text-muted" />} />
        : <Dropzone compact accept="application/pdf,.pdf" onFiles={(f) => onFile(f[0])} label={`Drop the ${label.toLowerCase()} PDF`} sub="Stays on your device" />}
    </div>
  )
}

function Stat({ icon: Icon, label, value, cls }: { icon: React.ElementType; label: string; value: React.ReactNode; cls: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted"><Icon className={cn('size-3.5', cls)} />{label}</div>
      <div className={cn('mt-1 font-display text-2xl font-bold tabular-nums', cls)}>{value}</div>
    </div>
  )
}

function DiffText({ parts, show }: { parts: Part[]; show: 'A' | 'B' | 'both' }) {
  return (
    <div className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-7 scrollbar-thin">
      {parts.map((p, i) => {
        if (p.added) return show === 'A' ? null : <ins key={i} className="rounded bg-success/20 px-0.5 text-fg no-underline decoration-success/60">{p.value}</ins>
        if (p.removed) return show === 'B' ? null : <del key={i} className="rounded bg-danger/20 px-0.5 text-fg decoration-danger/70">{p.value}</del>
        return <span key={i} className="text-muted">{p.value}</span>
      })}
    </div>
  )
}

type VMode = 'highlight' | 'overlay' | 'swipe'
function VisualDiff({ a, b, diffs }: { a: PdfJsDoc; b: PdfJsDoc; diffs: PageDiff[] }) {
  const n = Math.max(a.numPages, b.numPages)
  const [page, setPage] = useState(() => Math.max(0, diffs.findIndex((d) => d.added || d.removed)))
  const [vmode, setVmode] = useState<VMode>('highlight')
  const [swipe, setSwipe] = useState(50)
  const [imgs, setImgs] = useState<{ a: string | null; b: string | null; diff: string | null; overlay: string | null; pct: number; w: number; h: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const token = useRef(0)

  useEffect(() => {
    const t = ++token.current
    setBusy(true)
    ;(async () => {
      const scale = 1.3
      const ca = page < a.numPages ? await renderPage(a, page + 1, scale) : null
      const cb = page < b.numPages ? await renderPage(b, page + 1, scale) : null
      if (t !== token.current) return
      const w = Math.max(ca?.width ?? 0, cb?.width ?? 0), h = Math.max(ca?.height ?? 0, cb?.height ?? 0)
      const norm = (c: HTMLCanvasElement | null) => { const o = document.createElement('canvas'); o.width = w; o.height = h; const x = o.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); if (c) x.drawImage(c, 0, 0); return o }
      const na = norm(ca), nb = norm(cb)
      const da = na.getContext('2d')!.getImageData(0, 0, w, h), db = nb.getContext('2d')!.getImageData(0, 0, w, h)
      const hl = new ImageData(w, h), ov = new ImageData(w, h)
      let changed = 0
      for (let i = 0; i < da.data.length; i += 4) {
        const la = 0.299 * da.data[i] + 0.587 * da.data[i + 1] + 0.114 * da.data[i + 2]
        const lb = 0.299 * db.data[i] + 0.587 * db.data[i + 1] + 0.114 * db.data[i + 2]
        const diff = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2])) > 48
        // highlight: faded B, red where removed (dark in A), green where added (dark in B)
        const base = 255 - (255 - lb) * 0.35
        if (diff) {
          changed++
          if (la < lb) { hl.data[i] = 230; hl.data[i + 1] = 40; hl.data[i + 2] = 60 } else { hl.data[i] = 22; hl.data[i + 1] = 163; hl.data[i + 2] = 74 }
        } else { hl.data[i] = hl.data[i + 1] = hl.data[i + 2] = base }
        hl.data[i + 3] = 255
        // overlay: A in red channel, B in cyan; identical ink shows dark grey
        ov.data[i] = lb; ov.data[i + 1] = la; ov.data[i + 2] = la; ov.data[i + 3] = 255
      }
      const toUrl = (d: ImageData) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.putImageData(d, 0, 0); return c.toDataURL('image/png') }
      if (t !== token.current) return
      setImgs({ a: na.toDataURL('image/jpeg', 0.85), b: nb.toDataURL('image/jpeg', 0.85), diff: toUrl(hl), overlay: toUrl(ov), pct: changed / (w * h), w, h })
      setBusy(false)
    })().catch(() => setBusy(false))
  }, [page, a, b])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => setPage(page - 1)} icon={<ChevronLeft className="size-4" />} aria-label="Previous page" />
          <span className="min-w-24 text-center font-mono text-xs text-muted">Page {page + 1} / {n}</span>
          <Button size="sm" variant="ghost" disabled={page >= n - 1} onClick={() => setPage(page + 1)} icon={<ChevronRight className="size-4" />} aria-label="Next page" />
          {imgs && <span className={cn('ml-2 rounded-md px-2 py-0.5 text-xs font-medium', imgs.pct > 0.0005 ? 'bg-warn/15 text-warn' : 'bg-success/15 text-success')}>{imgs.pct > 0.0005 ? `${(imgs.pct * 100).toFixed(2)}% of pixels differ` : 'Visually identical'}</span>}
        </div>
        <Segmented value={vmode} onChange={setVmode} options={[{ value: 'highlight', label: 'Highlight' }, { value: 'overlay', label: 'Overlay' }, { value: 'swipe', label: 'Swipe' }]} />
      </div>
      {vmode === 'swipe' && <Slider value={swipe} onChange={setSwipe} min={0} max={100} />}
      <div className="flex justify-center rounded-2xl border border-border bg-surface-2/50 p-3 sm:p-6 checker">
        {!imgs ? <div className="grid h-96 place-items-center"><Spinner label="Rendering…" /></div> : (
          <div className={cn('relative w-full max-w-3xl shadow-xl ring-1 ring-black/10 transition-opacity', busy && 'opacity-60')} style={{ aspectRatio: `${imgs.w} / ${imgs.h}` }}>
            {vmode === 'highlight' && <img src={imgs.diff!} alt="Differences" className="absolute inset-0 h-full w-full" />}
            {vmode === 'overlay' && <img src={imgs.overlay!} alt="Overlay" className="absolute inset-0 h-full w-full" />}
            {vmode === 'swipe' && <>
              <img src={imgs.b!} alt="Changed" className="absolute inset-0 h-full w-full" />
              <img src={imgs.a!} alt="Original" className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }} />
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent shadow-[0_0_0_1px_rgba(255,255,255,.6)]" style={{ left: `${swipe}%` }} />
              <span className="absolute left-2 top-2 rounded bg-danger/90 px-1.5 py-0.5 text-[10px] font-bold text-white">ORIGINAL</span>
              <span className="absolute right-2 top-2 rounded bg-success/90 px-1.5 py-0.5 text-[10px] font-bold text-white">CHANGED</span>
            </>}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-muted">
        {vmode === 'highlight' && <><span className="font-semibold text-danger">Red</span> = only in the original · <span className="font-semibold text-success">green</span> = only in the changed version.</>}
        {vmode === 'overlay' && <>Ink only in the original shows <span className="font-semibold text-danger">red</span>, ink only in the changed version shows <span className="font-semibold text-[#0bb]">cyan</span>; matching content looks dark.</>}
        {vmode === 'swipe' && 'Drag the slider to wipe between the two versions.'}
      </p>
    </div>
  )
}

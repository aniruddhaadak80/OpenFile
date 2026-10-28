import { useEffect, useMemo, useState } from 'react'
import { Link2, Plus, Trash2, Wand2, Save, MousePointer2, ExternalLink, FileText } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Switch, ToolGrid, Progress, ErrorNote, Input, Spinner, Field, cn, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, usePdfDoc } from './_core/kit'
import { core, readBytes, Note, RectEditor, usePage, uid, vpToPdf, pdfToVp } from './_b1/ui'

type L = { id: string; page: number; x0: number; y0: number; x1: number; y1: number; kind: 'url' | 'page'; url: string; target: number }
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()"']+[^\s<>()"'.,;:!?]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

export default function PdfLinkEditor() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const img = usePage(doc, page + 1, 760)
  const [links, setLinks] = useState<L[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [draw, setDraw] = useState(true)
  const [border, setBorder] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob(), auto = useJob()
  const reset = () => { setFile(null); setLinks(null); setResult(null); setSel(null); setPage(0) }

  useEffect(() => {
    if (!file || !doc) return
    ;(async () => {
      const C = await core(); const d = await C.open(await readBytes(file))
      const raw = C.readLinks(d)
      const out: L[] = []
      for (const l of raw) { const vp = (await doc.getPage(l.page + 1)).getViewport({ scale: 1 }); out.push({ id: uid(), page: l.page, ...pdfToVp(vp, l.rect), kind: l.kind, url: l.url ?? '', target: l.target ?? 0 }) }
      setLinks(out)
    })().catch((e) => job.setError(e.message))
  }, [file, doc]) // eslint-disable-line

  const upd = (id: string, p: Partial<L>) => { setLinks((a) => a?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? a); setResult(null) }
  const onPage = useMemo(() => (links ?? []).filter((l) => l.page === page), [links, page])
  const cur = links?.find((l) => l.id === sel)

  const autoLink = () => auto.run(async (setP) => {
    if (!doc) return
    const found: L[] = []
    const existing = links ?? []
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i); const vp = p.getViewport({ scale: 1 })
      const tc = await p.getTextContent()
      for (const it of tc.items as any[]) {
        if (!it.str) continue
        URL_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = URL_RE.exec(it.str))) {
          const [a, b, c, d, e, f] = it.transform
          const h = Math.hypot(c, d) || Math.hypot(a, b) || 10
          const per = (it.width || 0) / Math.max(1, it.str.length)
          const ux = (Math.hypot(a, b) ? a / Math.hypot(a, b) : 1), uy = (Math.hypot(a, b) ? b / Math.hypot(a, b) : 0)
          const sx = e + ux * per * m.index, sy = f + uy * per * m.index
          const len = per * m[0].length
          const pts = [[sx, sy - h * 0.25], [sx + ux * len, sy + uy * len - h * 0.25], [sx - uy * h, sy + ux * h], [sx + ux * len - uy * h, sy + uy * len + ux * h]]
          const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
          const rect = pdfToVp(vp, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
          const dup = existing.concat(found).some((l) => l.page === i - 1 && Math.abs(l.x0 - rect.x0) < 3 && Math.abs(l.y0 - rect.y0) < 3)
          if (!dup) found.push({ id: uid(), page: i - 1, ...rect, kind: 'url', url: m[0], target: 0 })
        }
      }
      setP(i / doc.numPages)
    }
    if (!found.length) { toast('No new web addresses or emails found in the text', 'info'); return }
    setLinks((a) => [...(a ?? []), ...found]); setResult(null)
    toast(`Added ${found.length} link${found.length > 1 ? 's' : ''}`, 'success')
  })

  const save = () => job.run(async (setP) => {
    if (!file || !doc || !links) return
    const C = await core(); setP(0.2)
    const specs = []
    for (const l of links) {
      const vp = (await doc.getPage(l.page + 1)).getViewport({ scale: 1 })
      specs.push({ page: l.page, rect: vpToPdf(vp, l), kind: l.kind, url: l.url, target: l.target, border })
    }
    const bad = specs.filter((s) => s.kind === 'url' && !s.url.trim()).length
    if (bad) throw new Error(`${bad} link${bad > 1 ? 's have' : ' has'} no web address yet. Fill it in or delete the link.`)
    setResult(pdfBlob(await C.writeLinks(await readBytes(file), specs))); setP(1); toast('Links saved', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to add, edit or remove links" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-links.pdf`} title="PDF with updated links" onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented value={draw ? 'draw' : 'select'} onChange={(v) => setDraw(v === 'draw')} options={[{ value: 'draw', label: <span className="inline-flex items-center gap-1"><Plus className="size-3.5" />Draw link</span> }, { value: 'select', label: <span className="inline-flex items-center gap-1"><MousePointer2 className="size-3.5" />Select</span> }]} />
            <span className="text-xs text-muted">{onPage.length} link{onPage.length === 1 ? '' : 's'} on this page</span>
            {numPages > 1 && <PageStepper page={page} total={numPages} onChange={(p) => { setPage(p); setSel(null) }} />}
          </div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            {img && links ? <div className="w-full max-w-[760px]"><RectEditor src={img.src} pageW={img.w} pageH={img.h} drawEnabled={draw} selected={sel} onSelect={setSel}
              rects={onPage.map((l) => ({ id: l.id, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, label: l.kind === 'url' ? (l.url || 'no address yet') : `Go to page ${l.target + 1}`, color: l.kind === 'url' ? '#38BDF8' : '#2DD4BF' }))}
              onChange={(id, r) => upd(id, r)}
              onCreate={(r) => { const l: L = { id: uid(), page, ...r, kind: 'url', url: '', target: Math.min(numPages - 1, page + 1) }; setLinks((a) => [...(a ?? []), l]); setSel(l.id); setResult(null) }} /></div> : <Spinner label="Rendering…" />}
          </div>
          <div className="mt-2 text-xs text-muted">Drag on the page to draw a link area. Click a box to edit it, drag to move, use the corner to resize. Arrow keys nudge the selected box.</div>
        </div>}
        side={<>
          {cur ? <div className="space-y-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
            <Segmented value={cur.kind} onChange={(k) => upd(cur.id, { kind: k })} options={[{ value: 'url', label: <span className="inline-flex items-center gap-1"><ExternalLink className="size-3.5" />Web or email</span> }, { value: 'page', label: <span className="inline-flex items-center gap-1"><FileText className="size-3.5" />Page</span> }]} />
            {cur.kind === 'url' ? <Field label="Address"><Input autoFocus value={cur.url} placeholder="https://example.com or name@mail.com" onChange={(e) => upd(cur.id, { url: e.target.value })} /></Field>
              : <Field label="Go to page" hint={`of ${numPages}`}><Input type="number" min={1} max={numPages} value={cur.target + 1} onChange={(e) => upd(cur.id, { target: Math.max(0, Math.min(numPages - 1, Number(e.target.value) - 1)) })} /></Field>}
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setLinks((a) => a?.filter((x) => x.id !== cur.id) ?? a); setSel(null); setResult(null) }}>Delete link</Button>
          </div> : <Note>Select a link box to edit it, or draw a new one on the page.</Note>}
          <Button variant="outline" className="w-full" icon={<Wand2 className="size-4" />} loading={auto.busy} onClick={autoLink}>Link web addresses in the text</Button>
          {auto.busy && <Progress value={auto.progress} label="Scanning text…" />}
          <Switch checked={border} onChange={(v) => { setBorder(v); setResult(null) }} label="Show a thin border around links" />
          <div className="text-xs text-muted">{links?.length ?? 0} links in total</div>
          {job.busy && <Progress value={job.progress} label="Saving…" />}
          <ErrorNote error={job.error || auto.error} />
          <Button className={cn('w-full')} size="lg" icon={<Save className="size-5" />} loading={job.busy} disabled={!links} onClick={save}>Save links</Button>
          <div className="flex items-center justify-center gap-1 text-xs text-muted"><Link2 className="size-3" />Saving replaces all existing links with this list.</div>
        </>}
      />
    </div>
  )
}

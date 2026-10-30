import { useEffect, useMemo, useState } from 'react'
import { MessageSquareOff } from 'lucide-react'
import { Button, Dropzone, ResultCard, ToolGrid, Progress, ErrorNote, Spinner, cn, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageScope, PageStepper, scopePages, usePdfDoc, usePageImage } from './_core/kit'
import { core, readBytes, Note } from './_b1/ui'
import type { AnnotInfo } from './_b1/core'
import { ANNOT_GROUPS, groupOf } from './_b1/core'

export default function RemoveAnnotations() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [annots, setAnnots] = useState<AnnotInfo[] | null>(null)
  const [groups, setGroups] = useState<Set<string>>(new Set(['comments', 'markup', 'drawings', 'stamps']))
  const [mode, setMode] = useState<'all' | 'range'>('all'), [range, setRange] = useState('')
  const [page, setPage] = useState(0)
  const img = usePageImage(doc, page + 1, 640)
  const [result, setResult] = useState<{ blob: Blob; removed: number } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setAnnots(null); setPage(0) }

  useEffect(() => {
    if (!file) return
    let cancel = false
    ;(async () => { const C = await core(); const d = await C.open(await readBytes(file)); if (!cancel) setAnnots(C.listAnnotations(d)) })().catch((e) => !cancel && job.setError(e.message))
    return () => { cancel = true }
  }, [file]) // eslint-disable-line

  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const a of annots ?? []) { const g = groupOf(a.subtype); m[g] = (m[g] ?? 0) + 1 } return m }, [annots])
  // How many annotations the ticked types cover, so the button never runs a no-op that reports "Removed 0".
  const picked = useMemo(() => (annots ?? []).filter((a) => groups.has(groupOf(a.subtype))).length, [annots, groups])
  const onPage = useMemo(() => (annots ?? []).filter((a) => a.page === page), [annots, page])
  const toggle = (id: string) => { const s = new Set(groups); s.has(id) ? s.delete(id) : s.add(id); setGroups(s); setResult(null) }

  const run = () => job.run(async (setP) => {
    if (!file) return
    const C = await core(); setP(0.3)
    const pages = scopePages(mode, range, numPages)
    const r = await C.removeAnnotations(await readBytes(file), groups, pages ? new Set(pages) : undefined)
    setResult({ blob: pdfBlob(r.bytes), removed: r.removed }); setP(1); toast(`Removed ${r.removed} annotation${r.removed === 1 ? '' : 's'}`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to clean up comments and markup" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}-clean.pdf`} originalSize={file.size} title={`Removed ${result.removed} annotation${result.removed === 1 ? '' : 's'}`} onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><div className="text-sm font-medium">{onPage.length} annotation{onPage.length === 1 ? '' : 's'} on this page</div>{numPages > 1 && <PageStepper page={page} total={numPages} onChange={setPage} />}</div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            {img ? <div className="relative" style={{ width: '100%', maxWidth: 640, aspectRatio: `${img.w} / ${img.h}` }}>
              <img src={img.src} alt="" className="absolute inset-0 h-full w-full bg-white shadow-2xl" />
              <Overlay doc={doc} page={page} annots={onPage} groups={groups} />
            </div> : <Spinner label="Rendering…" />}
          </div>
          <div className="mt-2 text-xs text-muted">Highlighted boxes will be removed. Grey boxes stay.</div>
        </div>}
        side={<>
          {!annots ? <Spinner label="Scanning annotations…" /> : <div className="space-y-1.5">
            {ANNOT_GROUPS.map((g) => (
              <label key={g.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition', groups.has(g.id) ? 'border-accent bg-accent/5' : 'border-border', !counts[g.id] && 'opacity-50')}>
                <input type="checkbox" checked={groups.has(g.id)} onChange={() => toggle(g.id)} className="size-4 accent-[var(--accent)]" />
                <span className="flex-1">{g.label}</span><span className="font-mono text-xs text-muted">{counts[g.id] ?? 0}</span>
              </label>
            ))}
          </div>}
          <div><div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Pages</div><PageScope total={numPages} mode={mode} setMode={(v) => { setMode(v); setResult(null) }} range={range} setRange={(v) => { setRange(v); setResult(null) }} /></div>
          <Note>Only the annotation layer is removed. Page text and images are not touched. Removing form fields also drops the form itself.</Note>
          {job.busy && <Progress value={job.progress} label="Removing…" />}
          <ErrorNote error={job.error} />
          {annots && !picked && <div className="text-xs text-muted">{annots.length ? 'None of the ticked types are in this PDF. Tick the types you want to remove above.' : 'This PDF has no annotations to remove.'}</div>}
          <Button className="w-full" size="lg" icon={<MessageSquareOff className="size-5" />} loading={job.busy} disabled={!annots || !groups.size || !picked} onClick={run}>Remove annotations</Button>
        </>}
      />
    </div>
  )
}

function Overlay({ doc, page, annots, groups }: { doc: any; page: number; annots: AnnotInfo[]; groups: Set<string> }) {
  const [vp, setVp] = useState<any>(null)
  useEffect(() => { let c = false; doc?.getPage(page + 1).then((p: any) => !c && setVp(p.getViewport({ scale: 1 }))); return () => { c = true } }, [doc, page])
  if (!vp) return null
  return <>{annots.filter((a) => a.subtype !== 'Popup').map((a, i) => {
    const [x0, y0] = vp.convertToViewportPoint(a.rect[0], a.rect[1]), [x1, y1] = vp.convertToViewportPoint(a.rect[2], a.rect[3])
    const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0)
    const kill = groups.has(groupOf(a.subtype))
    return <div key={i} title={`${a.subtype}${a.contents ? ': ' + a.contents : ''}`} className={cn('absolute border-2', kill ? 'border-danger bg-danger/15' : 'border-muted/60 bg-muted/10')} style={{ left: `${(l / vp.width) * 100}%`, top: `${(t / vp.height) * 100}%`, width: `${(w / vp.width) * 100}%`, height: `${(h / vp.height) * 100}%` }} />
  })}</>
}

import { useState } from 'react'
import { Wrench, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react'
import { Button, Dropzone, ResultCard, Slider, Switch, ToolGrid, Progress, ErrorNote, useJob, cn } from '@/components/ui'
import { openPdfJs, renderPage, pdfBlob, type PdfJsDoc } from '@/lib/pdf'
import { baseName, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, ops, readBytes, closeDoc, motion, AnimatePresence } from './_core/kit'

type Line = { level: 'ok' | 'warn' | 'err' | 'info'; text: string }

async function renderJpg(doc: PdfJsDoc, n: number, dpi: number) {
  const page = await doc.getPage(n)
  const vp = page.getViewport({ scale: 1 })
  const c = await renderPage(doc, n, dpi / 72)
  const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('render failed'))), 'image/jpeg', 0.9))
  return { jpg: new Uint8Array(await blob.arrayBuffer()), w: vp.width, h: vp.height }
}

export default function RepairPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [log, setLog] = useState<Line[]>([])
  const [force, setForce] = useState(false)
  const [dpi, setDpi] = useState(150)
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setLog([]); setResult(null) }

  const run = () => job.run(async (setP) => {
    if (!file) return
    setResult(null)
    const lines: Line[] = []
    const push = (level: Line['level'], text: string) => { lines.push({ level, text }); setLog([...lines]) }
    const bytes = await readBytes(file)
    const head = new TextDecoder('latin1').decode(bytes.slice(0, 1024))
    const hdr = head.indexOf('%PDF-')
    if (hdr < 0) push('warn', 'No %PDF- header found in the first 1 KB — the file may not be a PDF')
    else if (hdr > 0) push('info', `Header found at byte ${hdr} (junk before it will be discarded)`)
    else push('ok', `Valid header (PDF ${head.slice(5, 8)})`)
    const tail = new TextDecoder('latin1').decode(bytes.slice(-2048))
    if (!tail.includes('%%EOF')) push('warn', 'Missing %%EOF marker — file looks truncated')
    if (!/startxref/.test(tail)) push('warn', 'No startxref pointer — cross-reference table must be rebuilt')
    setP(0.1)

    // pdf.js is very tolerant: it reconstructs the xref when needed. Use it as a rendering fallback.
    let pj: PdfJsDoc | null = null
    try { pj = await openPdfJs(hdr > 0 ? bytes.slice(hdr) : bytes); push('ok', `Renderer can read ${pj.numPages} page${pj.numPages === 1 ? '' : 's'}`) }
    catch (e: any) { push('warn', `Renderer could not open the file: ${e?.message ?? e}`) }
    setP(0.2)

    const o = await ops()
    let out: Uint8Array | null = null
    let pages = 0
    if (!force) {
      const r = await o.repairStructure(hdr > 0 ? bytes.slice(hdr) : bytes)
      r.log.forEach((t) => push(/could not|broken|No pages|Warning/i.test(t) ? 'warn' : 'ok', t))
      setP(0.5)
      if (r.bytes && pj && r.failed.length) {
        push('info', `Re-rendering ${r.failed.length} damaged page${r.failed.length > 1 ? 's' : ''} from the visual layer…`)
        const imgs = new Map<number, { jpg: Uint8Array; w: number; h: number }>()
        for (let k = 0; k < r.failed.length; k++) {
          const i = r.failed[k]
          if (i < pj.numPages) { try { imgs.set(i, await renderJpg(pj, i + 1, dpi)) } catch { push('err', `Page ${i + 1} could not be rendered either — left blank`) } }
          setP(0.5 + (k + 1) / r.failed.length * 0.4)
        }
        out = await o.replaceWithImages(r.bytes, imgs)
        if (imgs.size) push('ok', `Recovered ${imgs.size} page${imgs.size > 1 ? 's' : ''} as images`)
      } else out = r.bytes
      pages = r.recovered + (r.failed.length ? r.failed.length : 0)
      // pdf-lib sees fewer pages than the renderer? prefer the renderer's view
      if (out && pj && pj.numPages > pages) { push('warn', `Structure lists ${pages} pages but ${pj.numPages} are renderable — rebuilding from rendered pages instead`); out = null }
    }
    if (!out) {
      if (!pj) throw new Error('This file is too damaged to recover: neither the structure nor the page content could be read.')
      push('info', `${force ? 'Rebuilding' : 'Falling back to rebuilding'} every page from rendered images at ${dpi} DPI…`)
      const imgs = []
      for (let i = 1; i <= pj.numPages; i++) {
        try { imgs.push(await renderJpg(pj, i, dpi)) } catch { push('err', `Page ${i} failed to render — skipped`) }
        setP(0.5 + (i / pj.numPages) * 0.45)
      }
      if (!imgs.length) throw new Error('No pages could be recovered from this file.')
      out = await o.imagesToPdf(imgs)
      pages = imgs.length
      push('ok', `Rebuilt ${imgs.length} page${imgs.length > 1 ? 's' : ''} (text in these pages is now an image — run OCR PDF to make it searchable)`)
    }
    closeDoc(pj)
    // verify
    try { const v = await openPdfJs(out); push('ok', `Verified: repaired file opens cleanly with ${v.numPages} page${v.numPages === 1 ? '' : 's'}`); pages = v.numPages; closeDoc(v) }
    catch { push('warn', 'The result could not be verified, but it was written successfully') }
    push('info', `${formatBytes(bytes.length)} → ${formatBytes(out.length)}`)
    setResult({ blob: pdfBlob(out), pages }); setP(1); toast('Repair finished', 'success')
  })

  if (!file) return <Dropzone accept="application/pdf,.pdf,application/octet-stream" onFiles={(f) => setFile(f[0])} label="Drop a broken or corrupted PDF" sub="We rebuild its structure locally — nothing is uploaded." />

  const icon = { ok: <CheckCircle2 className="size-4 text-success" />, warn: <AlertTriangle className="size-4 text-warn" />, err: <XCircle className="size-4 text-danger" />, info: <Info className="size-4 text-accent" /> }
  return (
    <div className="space-y-4">
      <FileBar file={file} onReset={reset} />
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}-repaired.pdf`} title={`Repaired · ${result.pages} page${result.pages === 1 ? '' : 's'}`} onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 text-sm font-medium">Repair report</div>
          {!log.length ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">Press <b>Repair PDF</b> to analyse and rebuild the file. Each step is listed here.</div> : (
            <ul className="space-y-1.5 font-mono text-[13px]">
              <AnimatePresence initial={false}>
                {log.map((l, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className={cn('flex gap-2 rounded-lg px-2 py-1', l.level === 'err' && 'bg-danger/5', l.level === 'warn' && 'bg-warn/5')}>
                    <span className="mt-0.5 shrink-0">{icon[l.level]}</span><span className="leading-relaxed">{l.text}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>}
        side={<>
          <div className="rounded-xl bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
            1. Re-reads the file leniently and rebuilds a fresh cross-reference table and page tree.<br />
            2. Pages that can't be copied are re-rendered from what's visible.<br />
            3. If the structure is beyond saving, every page is rebuilt from rendered images.
          </div>
          <Switch checked={force} onChange={setForce} label="Always rebuild from rendered pages" />
          <Slider label="Fallback render resolution" value={dpi} min={72} max={300} step={6} onChange={setDpi} suffix=" DPI" />
          {job.busy && <Progress value={job.progress} label="Repairing…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Wrench className="size-5" />} loading={job.busy} onClick={run}>Repair PDF</Button>
        </>}
      />
    </div>
  )
}

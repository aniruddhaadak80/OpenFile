import { useEffect, useState } from 'react'
import { MonitorCog } from 'lucide-react'
import { Button, Dropzone, ResultCard, Select, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, Input, Spinner, Card, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { core, readBytes, Note, Section } from './_b1/ui'
import type { ViewerPrefs } from './_b1/core'

export default function PdfViewerPreferences() {
  const [file, setFile] = useState<File | null>(null)
  const [v, setV] = useState<ViewerPrefs | null>(null)
  const [pages, setPages] = useState(0)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setV(null); setResult(null) }
  useEffect(() => {
    if (!file) return
    ;(async () => { const C = await core(); const d = await C.open(await readBytes(file)); setPages(d.getPageCount()); setV(C.readViewerPrefs(d)) })().catch((e) => job.setError(e.message))
  }, [file]) // eslint-disable-line
  const set = <K extends keyof ViewerPrefs>(k: K, val: ViewerPrefs[K]) => { setV((x) => (x ? { ...x, [k]: val } : x)); setResult(null) }
  const run = () => job.run(async (setP) => {
    if (!file || !v) return
    const C = await core(); setP(0.3)
    setResult(pdfBlob(await C.writeViewerPrefs(await readBytes(file), v))); setP(1); toast('Viewer settings saved', 'success')
  })
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to set how it opens" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={pages} onReset={reset} />
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-view.pdf`} title="PDF with new open settings" onReset={reset} />}
      {!v ? <Spinner label="Reading current settings…" /> : <ToolGrid
        main={<div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-4">
            <Section title="When the file opens">
              <Field label="Start on page" hint={`of ${pages}`}><Input type="number" min={1} max={pages} value={v.openPage + 1} onChange={(e) => set('openPage', Math.max(0, Math.min(pages - 1, Number(e.target.value) - 1)))} /></Field>
              <Field label="Zoom"><Select value={v.zoom} onChange={(z) => set('zoom', z)} options={[{ value: '', label: 'Reader default' }, { value: 'Fit', label: 'Fit whole page' }, { value: 'FitH', label: 'Fit width' }, { value: 'FitV', label: 'Fit height' }, { value: 'FitB', label: 'Fit visible content' }, { value: 'XYZ', label: 'Exact zoom level' }]} /></Field>
              {v.zoom === 'XYZ' && <Slider label="Zoom level" value={v.zoomPercent} min={10} max={400} step={5} onChange={(n) => set('zoomPercent', n)} suffix="%" />}
              <Field label="Page layout"><Select value={v.pageLayout} onChange={(z) => set('pageLayout', z)} options={[{ value: '', label: 'Reader default' }, { value: 'SinglePage', label: 'Single page' }, { value: 'OneColumn', label: 'Continuous scroll' }, { value: 'TwoPageLeft', label: 'Two pages side by side' }, { value: 'TwoPageRight', label: 'Two pages, cover alone (book)' }, { value: 'TwoColumnLeft', label: 'Two pages, continuous' }, { value: 'TwoColumnRight', label: 'Two pages continuous, cover alone' }]} /></Field>
              <Field label="Side panel"><Select value={v.pageMode} onChange={(z) => set('pageMode', z)} options={[{ value: '', label: 'Reader default' }, { value: 'UseNone', label: 'Hidden' }, { value: 'UseOutlines', label: 'Show bookmarks' }, { value: 'UseThumbs', label: 'Show page thumbnails' }, { value: 'UseAttachments', label: 'Show attachments' }, { value: 'UseOC', label: 'Show layers' }, { value: 'FullScreen', label: 'Open in full screen' }]} /></Field>
            </Section>
          </Card>
          <Card className="space-y-4">
            <Section title="Window and toolbar">
              <div className="space-y-3">
                <Switch checked={v.hideToolbar} onChange={(b) => set('hideToolbar', b)} label="Hide the toolbar" />
                <Switch checked={v.hideMenubar} onChange={(b) => set('hideMenubar', b)} label="Hide the menu bar" />
                <Switch checked={v.hideWindowUI} onChange={(b) => set('hideWindowUI', b)} label="Hide scrollbars and controls" />
                <Switch checked={v.fitWindow} onChange={(b) => set('fitWindow', b)} label="Resize window to the first page" />
                <Switch checked={v.centerWindow} onChange={(b) => set('centerWindow', b)} label="Center the window on screen" />
                <Switch checked={v.displayDocTitle} onChange={(b) => set('displayDocTitle', b)} label="Show document title instead of file name" />
              </div>
              {v.displayDocTitle && <Field label="Document title"><Input value={v.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="Title shown in the window bar" /></Field>}
            </Section>
            <Section title="Reading and printing">
              <Field label="Reading direction"><Select value={v.direction} onChange={(z) => set('direction', z)} options={[{ value: 'L2R', label: 'Left to right' }, { value: 'R2L', label: 'Right to left' }]} /></Field>
              <Field label="Print scaling"><Select value={v.printScaling} onChange={(z) => set('printScaling', z)} options={[{ value: 'AppDefault', label: 'Reader default (fit to paper)' }, { value: 'None', label: 'Actual size (no scaling)' }]} /></Field>
              <Field label="Two-sided printing"><Select value={v.duplex} onChange={(z) => set('duplex', z)} options={[{ value: '', label: 'Reader default' }, { value: 'Simplex', label: 'One-sided' }, { value: 'DuplexFlipLongEdge', label: 'Two-sided, flip on long edge' }, { value: 'DuplexFlipShortEdge', label: 'Two-sided, flip on short edge' }]} /></Field>
            </Section>
          </Card>
        </div>}
        side={<>
          <Note>These are requests stored in the file. Desktop readers usually follow them. Web browsers and phone apps often ignore toolbar and window settings.</Note>
          {job.busy && <Progress value={job.progress} label="Saving…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<MonitorCog className="size-5" />} loading={job.busy} onClick={run}>Save settings</Button>
        </>}
      />}
    </div>
  )
}

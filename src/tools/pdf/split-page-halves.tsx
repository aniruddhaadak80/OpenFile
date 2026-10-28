import { useState } from 'react'
import { SplitSquareHorizontal } from 'lucide-react'
import { Button, Dropzone, ResultCard, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Field, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, LivePreview, PDF_ACCEPT, usePdfDoc } from './_core/kit'
import { core, readBytes, Note } from './_b1/ui'

export default function SplitPageHalves() {
  const [file, setFile] = useState<File | null>(null)
  const { numPages, error } = usePdfDoc(file)
  const [dir, setDir] = useState<'vertical' | 'horizontal'>('vertical')
  const [rtl, setRtl] = useState(false)
  const [skipFirst, setSkipFirst] = useState(false)
  const [skipLast, setSkipLast] = useState(false)
  const [onlyLandscape, setOnlyLandscape] = useState(false)
  const [ratio, setRatio] = useState(50)
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setResult(null); setPage(0) }
  const opts = { dir, rtl, skipFirst, skipLast, onlyLandscape, ratio: ratio / 100 }

  const run = () => job.run(async (setP) => {
    if (!file) return
    const C = await core(); setP(0.3)
    const out = await C.splitHalves(await readBytes(file), opts)
    const pages = (await C.open(out)).getPageCount()
    setResult({ blob: pdfBlob(out), pages }); setP(1); toast(`Done: ${pages} pages`, 'success')
  })
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF with two-page spreads or two-up scans" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}-split.pdf`} title={`Split into ${result.pages} pages`} onReset={reset} />}
      <ToolGrid
        main={numPages ? <LivePreview file={file} total={numPages} pageIndex={page} setPageIndex={setPage} deps={[dir, rtl, ratio, onlyLandscape]}
          build={async (bytes) => { const C = await core(); return C.splitHalves(bytes, { ...opts, skipFirst: false, skipLast: false }) }}
          note="The preview shows the first half of the current page. Use the arrows to check other pages." /> : null}
        side={<>
          <Field label="Cut direction"><Segmented value={dir} onChange={ch(setDir)} options={[{ value: 'vertical', label: 'Left | Right' }, { value: 'horizontal', label: 'Top / Bottom' }]} /></Field>
          <Slider label="Cut position" value={ratio} min={20} max={80} onChange={ch(setRatio)} suffix="%" />
          <div className="space-y-3">
            {dir === 'vertical' && <Switch checked={rtl} onChange={ch(setRtl)} label="Right page first (right-to-left books)" />}
            <Switch checked={skipFirst} onChange={ch(setSkipFirst)} label="Keep the first page whole (front cover)" />
            <Switch checked={skipLast} onChange={ch(setSkipLast)} label="Keep the last page whole (back cover)" />
            <Switch checked={onlyLandscape} onChange={ch(setOnlyLandscape)} label={dir === 'vertical' ? 'Only split wide pages' : 'Only split tall pages'} />
          </div>
          <Note>Each half keeps the original text, links and quality. Nothing is re-rendered, so files stay small.</Note>
          {job.busy && <Progress value={job.progress} label="Splitting…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<SplitSquareHorizontal className="size-5" />} loading={job.busy} disabled={!numPages} onClick={run}>Split pages</Button>
        </>}
      />
    </div>
  )
}

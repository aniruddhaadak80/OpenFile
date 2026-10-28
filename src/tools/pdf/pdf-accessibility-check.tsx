import { useEffect, useState } from 'react'
import { Accessibility } from 'lucide-react'
import { Dropzone, Progress, ErrorNote, Spinner, ToolGrid, useJob } from '@/components/ui'
import { openPdfJs } from '@/lib/pdf'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { readBytes, Note, CheckList, Score } from './_b1/ui'
import type { Finding } from './_b1/pdfa'

export default function PdfAccessibilityCheck() {
  const [file, setFile] = useState<File | null>(null)
  const [res, setRes] = useState<Finding[] | null>(null)
  const [pages, setPages] = useState(0)
  const job = useJob()
  useEffect(() => {
    if (!file) return
    setRes(null)
    job.run(async (setP) => {
      const b = await readBytes(file)
      let textPages = 0, n = 0
      try {
        const d = await openPdfJs(b); n = d.numPages
        for (let i = 1; i <= n; i++) { const tc = await (await d.getPage(i)).getTextContent(); if ((tc.items as any[]).some((it) => it.str?.trim())) textPages++; setP((i / n) * 0.8) }
      } catch (e: any) { if (e?.name === 'PasswordException') throw new Error('This PDF needs a password to open. Unlock it first.') }
      setPages(n)
      const m = await import('./_b1/pdfa')
      setRes(await m.accessibilityCheck(b, { textPages, pages: n })); setP(1)
    })
  }, [file]) // eslint-disable-line
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to check how accessible it is" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={pages} onReset={() => { setFile(null); setRes(null) }} />
      <ToolGrid
        main={<div className="space-y-3">
          {job.busy && <Progress value={job.progress} label="Checking…" />}
          <ErrorNote error={job.error} />
          {res ? <><Score checks={res} label="Accessibility" /><CheckList checks={res.map((r) => ({ level: r.level, title: r.title, detail: r.detail, fix: r.fix }))} /></> : !job.error && <Spinner label="Reading…" />}
        </div>}
        side={<>
          <Note>Checks what a machine can check, based on PDF/UA and WCAG: real text, tags, language, title, alt text on figures, headings, table headers, tab order, form tooltips, Unicode fonts and bookmarks.</Note>
          <Note>Most fixes are best made in the app that created the PDF: use heading styles, add alt text to images, and export with accessibility or tagged PDF switched on.</Note>
          <div className="flex items-center justify-center gap-1 text-xs text-muted"><Accessibility className="size-3" />Nothing leaves your device.</div>
        </>}
      />
    </div>
  )
}

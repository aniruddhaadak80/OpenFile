/* Generic document converter UI, shared by document-converter, markdown-to-docx, docx-to-markdown and rtf-converter. */
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, FileText, ClipboardPaste } from 'lucide-react'
import { Button, Dropzone, Label, ResultCard, ToolGrid, ErrorNote, Tabs, Textarea, CopyButton, cn } from '@/components/ui'
import { baseName } from '@/lib/files'
import { toHtml, fromHtml, markdownToHtml, textToHtml, fullHtml, DOC_OUT, DOC_IN_ACCEPT, type DocOut } from '@/lib/b4/office'
import { TopBar, StatusLine } from '@/lib/b4/ui'
import { Note } from '@/tools/video/_media/ui'

const TEXTUAL: DocOut[] = ['md', 'txt', 'html', 'rtf']

export function DocConvert({ accept = DOC_IN_ACCEPT, dropLabel, dropSub, defaultOut = 'docx', outs, paste, pasteSample = '' }: {
  accept?: string; dropLabel: string; dropSub: string; defaultOut?: DocOut; outs?: DocOut[]
  /** allow typing or pasting text of this kind instead of a file */
  paste?: 'md' | 'html' | 'txt'; pasteSample?: string
}) {
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState(pasteSample)
  const [html, setHtml] = useState<string | null>(null)
  const [title, setTitle] = useState('document')
  const [warnings, setWarnings] = useState<string[]>([])
  const [out, setOut] = useState<DocOut>(defaultOut)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [p, setP] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; name: string; text?: string } | null>(null)
  const options = DOC_OUT.filter((o) => !outs || outs.includes(o.id))

  const open = async (f: File) => {
    setFile(f); setHtml(null); setResult(null); setError(null); setBusy(true); setStatus('Reading document')
    try { const r = await toHtml(f, setStatus); setHtml(r.html); setTitle(r.title); setWarnings(r.warnings) } catch (e: any) { setError(e?.message || 'Could not read this document.') } finally { setBusy(false) }
  }
  useEffect(() => {
    if (mode !== 'paste' || !paste) return
    let live = true
    const t = setTimeout(async () => { const h = paste === 'md' ? await markdownToHtml(text) : paste === 'html' ? text : textToHtml(text); if (live) { setHtml(h); setTitle((text.match(/^#\s+(.+)$/m)?.[1] ?? 'document').slice(0, 80)) } }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [text, mode, paste])

  const convert = async () => {
    if (html == null) return
    setBusy(true); setError(null); setResult(null); setP(0); setStatus(`Writing ${DOC_OUT.find((o) => o.id === out)!.label}`)
    try {
      const blob = await fromHtml(html, out, title, { onProgress: setP })
      const ext = DOC_OUT.find((o) => o.id === out)!.ext
      setResult({ blob, name: `${file ? baseName(file.name) : title.replace(/[\\/:*?"<>|]/g, '').trim() || 'document'}.${ext}`, text: TEXTUAL.includes(out) ? await blob.text() : undefined })
    } catch (e: any) { setError(e?.message || 'Conversion failed.') } finally { setBusy(false) }
  }
  const preview = useMemo(() => (html != null ? fullHtml(html, title) : ''), [html, title])
  const reset = () => { setFile(null); setHtml(null); setResult(null); setError(null) }

  const inputArea = mode === 'paste' && paste
    ? <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[40vh]" placeholder={paste === 'md' ? '# Title\n\nWrite or paste Markdown here' : 'Paste here'} aria-label="Source text" />
    : !file ? <Dropzone accept={accept} onFiles={(f) => open(f[0])} label={dropLabel} sub={dropSub} /> : <TopBar file={file} onReset={reset} />

  if (!file && mode === 'file' && !paste) return inputArea
  return (
    <ToolGrid
      main={<>
        {paste && <Tabs value={mode} onChange={(m) => { setMode(m); reset() }} tabs={[{ value: 'file', label: <span className="inline-flex items-center gap-1.5"><FileText className="size-4" />File</span> }, { value: 'paste', label: <span className="inline-flex items-center gap-1.5"><ClipboardPaste className="size-4" />Type or paste</span> }]} />}
        {inputArea}
        {busy && <StatusLine text={status} progress={out === 'pdf' && html != null ? p : undefined} />}
        <ErrorNote error={error} />
        {warnings.length > 0 && <Note tone="warn">Some formatting could not be kept: {warnings.join(' · ').slice(0, 300)}</Note>}
        {html != null && !result && <div><Label>Preview</Label><iframe title="Preview" sandbox="" srcDoc={preview} className="h-[55vh] w-full rounded-xl border border-border bg-white" /></div>}
        {result && <ResultCard blob={result.blob} filename={result.name} onReset={() => setResult(null)}>
          {result.text != null && <div className="space-y-2"><div className="flex justify-end"><CopyButton text={result.text} /></div><pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 font-mono text-xs scrollbar-thin">{result.text.slice(0, 50000)}</pre></div>}
        </ResultCard>}
      </>}
      side={<>
        <div><Label>Convert to</Label><div className="grid grid-cols-2 gap-2">{options.map((o) => <button key={o.id} onClick={() => { setOut(o.id); setResult(null) }} className={cn('rounded-xl border px-2 py-2 text-sm font-medium transition cursor-pointer', out === o.id ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>{o.label}</button>)}</div></div>
        <Button size="lg" className="w-full" icon={<RefreshCw className="size-5" />} disabled={html == null || busy} loading={busy && html != null} onClick={convert}>Convert to {DOC_OUT.find((o) => o.id === out)!.label}</Button>
        <p className="text-xs text-muted">Headings, lists, tables, links, bold and italic are kept. Complex page layouts, text boxes and tracked changes are simplified.</p>
      </>}
    />
  )
}

import { useEffect, useState } from 'react'
import { BookOpen, RefreshCw, ListTree, ImageIcon } from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, ResultCard, ToolGrid, Progress, ErrorNote, cn } from '@/components/ui'
import { baseName } from '@/lib/files'
import { loadBook, writeBook, BOOK_OUT, EBOOK_ACCEPT, type BookModel, type BookOut } from '@/lib/b4/book'
import { TopBar, StatusLine } from '@/lib/b4/ui'
import { Stat } from '@/tools/video/_media/ui'

export default function EbookConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<BookModel | null>(null)
  const [out, setOut] = useState<BookOut>('epub')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [p, setP] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => { if (!book?.cover) { setCover(null); return } const u = URL.createObjectURL(book.cover); setCover(u); return () => URL.revokeObjectURL(u) }, [book?.cover])

  const open = async (f: File) => {
    setFile(f); setBook(null); setResult(null); setError(null); setBusy(true); setStatus('Opening book'); setP(0)
    try {
      const b = await loadBook(f, (x, l) => { setP(x); if (l) setStatus(l) })
      if (!b.chapters.length) throw new Error('No readable text was found in this file.')
      setBook(b)
      const ext = f.name.split('.').pop()!.toLowerCase()
      setOut(ext === 'epub' ? 'pdf' : 'epub')
    } catch (e: any) { setError(e?.message || 'Could not open this file.') } finally { setBusy(false) }
  }
  const convert = async () => {
    if (!book || !file) return
    setBusy(true); setError(null); setResult(null); setStatus(`Writing ${BOOK_OUT.find((x) => x.id === out)!.label}`); setP(0)
    try {
      const blob = await writeBook(book, out, setP)
      setResult({ blob, name: `${baseName(file.name.replace(/\.fb2\.zip$/i, ''))}.${out}` })
    } catch (e: any) { setError(e?.message || 'Conversion failed.') } finally { setBusy(false) }
  }
  const reset = () => { setFile(null); setBook(null); setResult(null); setError(null) }

  if (!file) return <Dropzone accept={EBOOK_ACCEPT} onFiles={(f) => open(f[0])} label="Drop an e-book or document" sub="EPUB, MOBI, AZW3, FB2, CBZ, TXT, HTML, Markdown, DOCX, RTF, ODT, PDF or CHM. DRM-free files only." />
  const words = book ? Math.round(book.chapters.reduce((a, c) => a + c.html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, 0)) : 0

  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={reset} />
        {busy && <StatusLine text={status} progress={p} />}
        <ErrorNote error={error} />
        {book && (
          <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[140px_1fr]">
            <div className="grid aspect-[2/3] place-items-center overflow-hidden rounded-xl border border-border bg-surface-2">{cover ? <img src={cover} alt="Cover" className="h-full w-full object-cover" /> : <ImageIcon className="size-8 text-muted" />}</div>
            <div className="space-y-3">
              <Field label="Title"><Input value={book.title} onChange={(e) => setBook({ ...book, title: e.target.value })} /></Field>
              <Field label="Author"><Input value={book.author} onChange={(e) => setBook({ ...book, author: e.target.value })} placeholder="Unknown" /></Field>
              <div className="grid grid-cols-3 gap-2"><Stat label="Chapters" value={book.chapters.length} /><Stat label="Words" value={words.toLocaleString()} /><Stat label="Images" value={book.images.size} /></div>
            </div>
          </div>
        )}
        {book && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <Label><span className="inline-flex items-center gap-1.5"><ListTree className="size-3.5" />Chapters</span></Label>
            <ol className="max-h-64 space-y-1 overflow-auto text-sm scrollbar-thin">{book.chapters.map((c, i) => <li key={i} className="flex gap-2 rounded-lg px-2 py-1 hover:bg-surface-2"><span className="w-8 shrink-0 text-right font-mono text-xs text-muted">{i + 1}</span><span className="truncate">{c.title}</span></li>)}</ol>
          </div>
        )}
        {result && <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} onReset={() => setResult(null)} />}
      </>}
      side={<>
        <div><Label>Convert to</Label>
          <div className="grid grid-cols-2 gap-2">{BOOK_OUT.map((f) => <button key={f.id} onClick={() => setOut(f.id)} className={cn('rounded-xl border px-2 py-2 text-sm font-medium transition cursor-pointer', out === f.id ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>{f.label}</button>)}</div>
        </div>
        {out === 'pdf' && <p className="text-xs text-muted">PDF pages are A5 sized and rendered as images of the text, so they look the same everywhere. Long books can take a few minutes.</p>}
        <Button size="lg" className="w-full" icon={<RefreshCw className="size-5" />} disabled={!book || busy} loading={busy && !!book} onClick={convert}>Convert to {BOOK_OUT.find((x) => x.id === out)!.label}</Button>
        {busy && book && <Progress value={p} />}
        <p className="flex gap-1.5 text-xs text-muted"><BookOpen className="size-4 shrink-0" />Books with DRM (bought from some stores) cannot be opened. Your files are never uploaded.</p>
      </>}
    />
  )
}

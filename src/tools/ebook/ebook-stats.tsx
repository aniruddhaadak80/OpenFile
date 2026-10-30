import { useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { Dropzone, Field, Input, ToolGrid, ErrorNote, Progress, Label } from '@/components/ui'
import { TopBar } from '@/lib/b4/ui'
import { loadBook, htmlToPlain, EBOOK_ACCEPT } from '@/lib/b4/book'
import { countWords, readingTime, topWords, uniqueWords } from '@/lib/b14/ebook'
import { readability } from '@/lib/b10/text'
import { Tile } from '@/lib/b14/ui'
import { Bars, toCsv, DlButton } from '@/lib/bcat/kit'

interface Ch { title: string; words: number; text: string }

export default function EbookStats() {
  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<{ title: string; author: string; chapters: Ch[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [prog, setProg] = useState<number | null>(null)
  const [wpm, setWpm] = useState(250)
  const open = async (f: File) => {
    setFile(f); setErr(null); setBook(null); setProg(0)
    try { const b = await loadBook(f, (p) => setProg(p)); const chapters = b.chapters.map((c, i) => { const text = htmlToPlain(c.html); return { title: c.title || `Section ${i + 1}`, words: countWords(text), text } }).filter((c) => c.words > 0); setBook({ title: b.title, author: b.author, chapters }) } catch (e: any) { setErr(e?.message || 'Could not read this book.') } finally { setProg(null) }
  }
  const s = useMemo(() => {
    if (!book) return null
    const all = book.chapters.map((c) => c.text).join('\n\n')
    const words = book.chapters.reduce((a, c) => a + c.words, 0)
    const sample = all.length > 400000 ? all.slice(0, 400000) : all
    return { words, chars: all.replace(/\s/g, '').length, unique: uniqueWords(all), top: topWords(all, 20), read: readability(sample), pages: Math.ceil(words / 275), longest: [...book.chapters].sort((a, b) => b.words - a.words)[0] }
  }, [book])
  if (!file) return <Dropzone accept={EBOOK_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a book" sub="EPUB, MOBI, AZW3, FB2, DOCX, PDF or TXT. Get word count, reading time, chapter lengths, vocabulary and reading level." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setBook(null) }} />
        {prog != null && <Progress value={prog} label="Reading the book" />}
        <ErrorNote error={err} />
        {book && s && <>
          <div><div className="font-display text-xl font-semibold">{book.title}</div><div className="text-sm text-muted">{book.author}</div></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Words" value={s.words.toLocaleString()} />
            <Tile label="Reading time" value={readingTime(s.words, wpm)} sub={`at ${wpm} words a minute`} />
            <Tile label="Audiobook" value={readingTime(s.words, 155)} sub="read aloud at 155 wpm" />
            <Tile label="Print pages" value={s.pages.toLocaleString()} sub="about 275 words a page" />
            <Tile label="Chapters" value={book.chapters.length} sub={`average ${Math.round(s.words / Math.max(1, book.chapters.length)).toLocaleString()} words`} />
            <Tile label="Unique words" value={s.unique.toLocaleString()} sub={`${((s.unique / Math.max(1, s.words)) * 100).toFixed(1)}% of all words`} />
            <Tile label="Reading level" value={s.read.fleschKincaid.toFixed(1)} sub="US school grade" />
            <Tile label="Reading ease" value={Math.round(s.read.fleschEase)} sub="0 hard to 100 easy" />
          </div>
          <Label hint="words per chapter">Chapters</Label>
          <div className="scrollbar-thin max-h-96 overflow-auto rounded-xl border border-border bg-surface p-3"><Bars items={book.chapters.map((c, i) => ({ label: `${i + 1}. ${c.title}`, value: c.words }))} /></div>
          <Label>Most used words</Label>
          <div className="flex flex-wrap gap-1.5">{s.top.map((w) => <span key={w.word} className="rounded-lg bg-surface-2 px-2 py-1 text-xs">{w.word} <span className="text-muted">{w.count}</span></span>)}</div>
        </>}
      </>}
      side={<>
        <Field label="Your reading speed (words a minute)"><Input type="number" min={80} max={1200} value={wpm} onChange={(e) => setWpm(Math.min(1200, Math.max(80, +e.target.value || 250)))} /></Field>
        <p className="text-xs text-muted">Most adults read 200 to 300 words a minute. Reading level uses the Flesch Kincaid formula, which fits English best.</p>
        {book && <DlButton className="w-full" name="chapters.csv" mime="text/csv" data={() => toCsv([['chapter', 'title', 'words', `minutes at ${wpm} wpm`], ...book.chapters.map((c, i) => [i + 1, c.title, c.words, (c.words / wpm).toFixed(1)])])}>Chapters as CSV</DlButton>}
        <p className="flex gap-1.5 text-xs text-muted"><BarChart3 className="size-4 shrink-0" />The book is read on your device and never uploaded.</p>
      </>}
    />
  )
}

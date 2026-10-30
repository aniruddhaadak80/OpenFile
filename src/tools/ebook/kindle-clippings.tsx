import { useMemo, useState } from 'react'
import { Highlighter, Download, Search } from 'lucide-react'
import { Button, Dropzone, Input, Switch, ToolGrid, Label, cn } from '@/components/ui'
import { downloadBlob, zipFiles } from '@/lib/files'
import { parseClippings, dedupeClips, groupByBook, clipsMarkdown, type Clip } from '@/lib/b14/ebook'
import { toCsv, DlButton } from '@/lib/bcat/kit'
import { Tile } from '@/lib/b14/ui'
import { toast } from '@/components/toast'

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'book'

export default function KindleClippings() {
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [dedupe, setDedupe] = useState(true)
  const [notes, setNotes] = useState(true)
  const [meta, setMeta] = useState(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const open = async (f: File) => { const c = parseClippings(await f.text()); if (!c.length) { toast('No highlights found. Open the My Clippings.txt file from the documents folder of your Kindle.', 'error'); return } setClips(c); setSel(0) }
  const view = useMemo(() => { if (!clips) return null; const d = dedupe ? dedupeClips(clips) : { clips, removed: 0 }; return { ...d, books: groupByBook(d.clips.filter((c) => c.type !== 'Bookmark')).sort((a, b) => b.clips.length - a.clips.length) } }, [clips, dedupe])
  if (!clips || !view) return <Dropzone accept=".txt,text/plain" onFiles={(f) => open(f[0])} label="Drop My Clippings.txt from your Kindle" sub="Plug in your Kindle, open the documents folder and drop the file here. Every highlight and note is sorted by book, ready for Markdown, Notion, Obsidian or a spreadsheet." />
  const books = view.books.filter((b) => !q || b.book.toLowerCase().includes(q.toLowerCase()) || b.clips.some((c) => c.text.toLowerCase().includes(q.toLowerCase())))
  const cur = books[Math.min(sel, books.length - 1)]
  const allMd = async () => downloadBlob(await zipFiles(view.books.map((b) => ({ name: `${safe(b.book)}.md`, data: clipsMarkdown(b, { notes, meta }) }))), 'kindle-highlights.zip')
  return (
    <ToolGrid
      main={<>
        <div className="grid grid-cols-3 gap-2"><Tile label="Books" value={view.books.length} /><Tile label="Highlights" value={view.clips.filter((c) => c.type === 'Highlight').length} sub={dedupe ? `${view.removed} duplicates merged` : undefined} /><Tile label="Notes" value={view.clips.filter((c) => c.type === 'Note').length} /></div>
        <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted" /><Input value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} placeholder="Search books and highlights" className="pl-9" aria-label="Search" /></div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,15rem)_1fr]">
          <div className="scrollbar-thin max-h-[520px] overflow-auto rounded-xl border border-border bg-surface">{books.map((b, i) => <button key={b.book + b.author} type="button" onClick={() => setSel(i)} className={cn('block w-full cursor-pointer border-b border-border/60 px-3 py-2 text-left', cur === b && 'bg-accent/10')}><div className="truncate text-sm font-medium">{b.book}</div><div className="truncate text-xs text-muted">{b.author} | {b.clips.length}</div></button>)}</div>
          {cur && <div className="min-w-0 space-y-2"><div className="flex items-center gap-2"><Label>{cur.book}</Label><span className="ml-auto" /><DlButton name={`${safe(cur.book)}.md`} mime="text/markdown" data={() => clipsMarkdown(cur, { notes, meta })}>Markdown</DlButton></div>
            <div className="scrollbar-thin max-h-[480px] space-y-2 overflow-auto">{cur.clips.filter((c) => notes || c.type !== 'Note').map((c, i) => <figure key={i} className={cn('rounded-xl border-l-4 bg-surface px-4 py-2 text-sm', c.type === 'Note' ? 'border-teal-500' : 'border-accent')}><blockquote className="whitespace-pre-wrap">{c.type === 'Note' && <b>Note: </b>}{c.text}</blockquote>{meta && <figcaption className="mt-1 text-[11px] text-muted">{[c.page && `page ${c.page}`, c.location && `location ${c.location}`, c.added].filter(Boolean).join(' | ')}</figcaption>}</figure>)}</div></div>}
        </div>
      </>}
      side={<>
        <Switch checked={dedupe} onChange={setDedupe} label="Merge highlights you extended later" />
        <Switch checked={notes} onChange={setNotes} label="Include your notes" />
        <Switch checked={meta} onChange={setMeta} label="Include page and location" />
        <Button className="w-full" icon={<Download className="size-4" />} onClick={allMd}>All books as Markdown (ZIP)</Button>
        <DlButton className="w-full" name="kindle-highlights.csv" mime="text/csv" data={() => toCsv([['book', 'author', 'type', 'page', 'location', 'added', 'text'], ...view.clips.map((c) => [c.book, c.author, c.type, c.page ?? '', c.location ?? '', c.added ?? '', c.text])])}>CSV for spreadsheets</DlButton>
        <DlButton className="w-full" name="kindle-highlights.json" mime="application/json" data={() => JSON.stringify(view.books, null, 2)}>JSON</DlButton>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setClips(null)}>Open another file</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Highlighter className="size-4 shrink-0" />Your reading notes stay on your device.</p>
      </>}
    />
  )
}

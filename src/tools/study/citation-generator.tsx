import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, CopyButton, Input, Label, Segmented, Select } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { escapeHtml } from '@/lib/safe'
import { CiteText } from '@/lib/cf/ui'
import { cite, htmlCite, inText, parseAuthors, plainCite, toBibtex, toRis, type Ref, type Style } from '@/lib/cf/study'

const STYLES: { value: Style; label: string }[] = [{ value: 'apa', label: 'APA 7' }, { value: 'mla', label: 'MLA 9' }, { value: 'chicago', label: 'Chicago' }, { value: 'harvard', label: 'Harvard' }, { value: 'ieee', label: 'IEEE' }, { value: 'vancouver', label: 'Vancouver' }]
const blank = (): Ref & { authorText: string } => ({ type: 'article', authors: [], authorText: '', title: '' })
const FIELDS: Record<Ref['type'], [keyof Ref, string][]> = {
  article: [['title', 'Article title'], ['container', 'Journal'], ['year', 'Year'], ['volume', 'Volume'], ['issue', 'Issue'], ['pages', 'Pages'], ['doi', 'DOI']],
  book: [['title', 'Book title'], ['edition', 'Edition'], ['publisher', 'Publisher'], ['place', 'City'], ['year', 'Year'], ['doi', 'DOI or URL']],
  chapter: [['title', 'Chapter title'], ['container', 'Book title'], ['editors', 'Editors'], ['pages', 'Pages'], ['publisher', 'Publisher'], ['year', 'Year']],
  web: [['title', 'Page title'], ['container', 'Website name'], ['year', 'Year'], ['month', 'Month'], ['day', 'Day'], ['url', 'URL'], ['accessed', 'Accessed on']],
  thesis: [['title', 'Title'], ['publisher', 'University'], ['year', 'Year'], ['url', 'URL']],
  report: [['title', 'Title'], ['publisher', 'Organisation'], ['year', 'Year'], ['url', 'URL']],
}

export default function CitationGenerator() {
  const [style, setStyle] = useState<Style>('apa')
  const [refs, setRefs] = useState<(Ref & { authorText: string })[]>([{ type: 'article', authorText: 'Smith, Jane; Rahul Verma', authors: [], title: 'Learning in the browser: a field study', container: 'Journal of Open Tools', year: '2025', volume: '12', issue: '3', pages: '45-61', doi: '10.1234/jot.2025.045' }])
  const [cur, setCur] = useState(0)
  const r = refs[cur]
  const set = (p: Partial<Ref & { authorText: string }>) => setRefs((x) => x.map((y, i) => (i === cur ? { ...y, ...p } : y)))
  // a new, still empty source is left out of the list and exports until it has a title or an author (it printed ". **." and "(, n.d.)")
  const full = useMemo(() => refs.map((x) => ({ ...x, authors: parseAuthors(x.authorText) })).filter((x) => x.title.trim() || x.authors.length), [refs])
  const sorted = useMemo(() => (style === 'ieee' || style === 'vancouver' ? full : [...full].sort((a, b) => (a.authors[0]?.family ?? a.title).localeCompare(b.authors[0]?.family ?? b.title))), [full, style])
  const list = sorted.map((x, i) => cite(x, style, i + 1))
  const html = `<ol style="list-style:none;padding:0">${list.map((c) => `<li style="padding-left:2em;text-indent:-2em;margin:0 0 .6em">${htmlCite(c, escapeHtml)}</li>`).join('')}</ol>`
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <Segmented value={style} onChange={setStyle} options={STYLES} />
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2"><div className="mr-auto font-semibold">Reference list ({list.length})</div><CopyButton text={list.map(plainCite).join('\n')} label="Copy text" />
            <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([`<!doctype html><meta charset="utf-8"><title>References</title><body style="font:12pt/1.6 'Times New Roman',serif;max-width:7in;margin:1in auto">${html}</body>`], { type: 'text/html' }), 'references.html')}>HTML for Word</Button>
            <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([toBibtex(full)], { type: 'text/plain' }), 'references.bib')}>BibTeX</Button>
            <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([toRis(full)], { type: 'text/plain' }), 'references.ris')}>RIS</Button></div>
          <div className="space-y-2 font-serif text-[15px] leading-relaxed">{list.map((c, i) => <p key={i} className="pl-8 -indent-8"><CiteText text={c} /></p>)}</div>
          <p className="text-xs text-muted">In-text: {sorted.map((x, i) => inText(x, style, i + 1)).join(', ')}</p>
        </Card>
      </div>
      <Card className="space-y-3 self-start">
        <div className="flex flex-wrap gap-1.5">{refs.map((x, i) => <button key={i} onClick={() => setCur(i)} className={`max-w-[9rem] truncate rounded-lg border px-2 py-1 text-xs cursor-pointer ${i === cur ? 'border-accent text-fg' : 'border-border text-muted'}`}>{x.title || `Source ${i + 1}`}</button>)}<button aria-label="Add source" onClick={() => { setRefs([...refs, blank()]); setCur(refs.length) }} className="rounded-lg border border-dashed border-border px-2 py-1 text-xs text-muted hover:text-fg cursor-pointer"><Plus className="inline size-3" /> Add</button></div>
        <label className="block"><Label>Source type</Label><Select value={r.type} onChange={(v) => set({ type: v })} options={[{ value: 'article', label: 'Journal article' }, { value: 'book', label: 'Book' }, { value: 'chapter', label: 'Book chapter' }, { value: 'web', label: 'Web page' }, { value: 'thesis', label: 'Thesis' }, { value: 'report', label: 'Report' }]} /></label>
        <div><Label>Authors (Last, First; separated by semicolons)</Label><Input aria-label="Authors (Last, First; separated by semicolons)" value={r.authorText} onChange={(e) => set({ authorText: e.target.value })} placeholder="Smith, Jane; Rahul Verma" /></div>
        {FIELDS[r.type].map(([k, l]) => <div key={k}><Label>{l}</Label><Input value={(r[k] as string) ?? ''} onChange={(e) => set({ [k]: e.target.value } as any)} /></div>)}
        {refs.length > 1 && <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => { setRefs(refs.filter((_, i) => i !== cur)); setCur(0) }}>Remove this source</Button>}
      </Card>
    </div>
  )
}

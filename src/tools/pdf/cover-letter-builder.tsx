import { useEffect, useState } from 'react'
import { Mail, Paperclip, ArrowUp, ArrowDown, X, FileDown, Save } from 'lucide-react'
import { Button, Card, Field, Input, Select, Segmented, Slider, Switch, Textarea, ToolGrid, Progress, ErrorNote, ResultCard, Spinner, useJob } from '@/components/ui'
import { openPdfJs, renderPage, pdfBlob } from '@/lib/pdf'
import { formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { readBytes, Note } from './_b1/ui'
import { TEMPLATES, type Letter, type LetterStyle, type Enclosure } from './_b1/letter'

const STORE = 'openfile.coverletter.me'
const ACCENTS: Record<string, [number, number, number]> = { gold: [0.96, 0.65, 0.14], teal: [0.08, 0.62, 0.58], sky: [0.15, 0.55, 0.85], slate: [0.2, 0.25, 0.3], emerald: [0.06, 0.6, 0.4] }
type Att = { id: string; file: File }

function start(): Letter & { role: string } {
  let me: Partial<Letter> = {}
  try { me = JSON.parse(localStorage.getItem(STORE) ?? '{}') } catch { /* */ }
  const t = TEMPLATES[0]
  return { name: me.name ?? '', title: me.title ?? '', email: me.email ?? '', phone: me.phone ?? '', address: me.address ?? '', links: me.links ?? '', recipient: '', company: '', companyAddress: '', date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), subject: t.subject, greeting: 'Dear Hiring Manager,', body: t.body, closing: 'Kind regards,', role: '' }
}
const fill = (s: string, role: string, company: string) => s.replace(/\{role\}/g, role || 'the advertised').replace(/\{company\}/g, company || 'your company')

export default function CoverLetterBuilder() {
  const [l, setL] = useState(start)
  const [style, setStyle] = useState<LetterStyle>('modern')
  const [accent, setAccent] = useState('teal')
  const [size, setSize] = useState<'a4' | 'letter'>('a4')
  const [fontSize, setFontSize] = useState(10.5)
  const [atts, setAtts] = useState<Att[]>([])
  const [bookmarks, setBookmarks] = useState(true)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob(), prev = useJob()
  const letter = (): Letter => ({ ...l, subject: fill(l.subject ?? '', l.role, l.company ?? ''), body: fill(l.body, l.role, l.company ?? ''), greeting: l.recipient && l.greeting === 'Dear Hiring Manager,' ? `Dear ${l.recipient},` : l.greeting })
  const set = (p: Partial<typeof l>) => { setL((x) => ({ ...x, ...p })); setResult(null) }

  useEffect(() => {
    const t = setTimeout(() => prev.run(async () => {
      const [{ renderLetter }, { loadSansFonts }] = await Promise.all([import('./_b1/letter'), import('./_b1/fonts')])
      const b = await renderLetter(letter(), await loadSansFonts(), { style, accent: ACCENTS[accent], size, fontSize })
      const d = await openPdfJs(b); setPreview((await renderPage(d, 1, 1.3)).toDataURL('image/jpeg', 0.88))
    }), 450)
    return () => clearTimeout(t)
  }, [l, style, accent, size, fontSize]) // eslint-disable-line

  const build = () => job.run(async (setP) => {
    if (!l.name.trim()) throw new Error('Add your name first.')
    const [{ renderLetter, bundleApplication }, { loadSansFonts }] = await Promise.all([import('./_b1/letter'), import('./_b1/fonts')])
    let bytes = await renderLetter(letter(), await loadSansFonts(), { style, accent: ACCENTS[accent], size, fontSize }); setP(0.4)
    if (atts.length) {
      const encl: Enclosure[] = []
      for (const a of atts) { const b = await readBytes(a.file); const kind = b[0] === 0x25 ? 'pdf' : b[0] === 0x89 ? 'png' : 'jpg'; encl.push({ name: a.file.name, bytes: b, kind }) }
      bytes = await bundleApplication(bytes, encl, { title: `Application - ${l.name}${l.company ? ' - ' + l.company : ''}`, author: l.name, bookmarks })
    }
    setResult(pdfBlob(bytes)); setP(1); toast(atts.length ? 'Application PDF ready' : 'Cover letter ready', 'success')
  })
  const remember = () => { try { localStorage.setItem(STORE, JSON.stringify({ name: l.name, title: l.title, email: l.email, phone: l.phone, address: l.address, links: l.links })); toast('Your details are saved in this browser', 'success') } catch { /* */ } }
  const move = (i: number, d: number) => { setAtts((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return b; [b[i], b[j]] = [b[j], b[i]]; return b }); setResult(null) }
  const safeName = (l.name || 'cover-letter').trim().replace(/\s+/g, '-')

  return (
    <div className="space-y-4">
      {result && <ResultCard blob={result} filename={`${safeName}-${atts.length ? 'application' : 'cover-letter'}.pdf`} title={atts.length ? 'Application PDF ready' : 'Cover letter ready'} onReset={() => setResult(null)} />}
      <ToolGrid
        main={<div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <Card className="space-y-2.5">
              <div className="flex items-center justify-between"><div className="text-sm font-semibold">About you</div><button type="button" onClick={remember} className="inline-flex items-center gap-1 text-xs text-accent cursor-pointer"><Save className="size-3" />Remember</button></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Full name"><Input value={l.name} onChange={(e) => set({ name: e.target.value })} /></Field><Field label="Headline"><Input value={l.title} placeholder="Software Developer" onChange={(e) => set({ title: e.target.value })} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Email"><Input value={l.email} onChange={(e) => set({ email: e.target.value })} /></Field><Field label="Phone"><Input value={l.phone} onChange={(e) => set({ phone: e.target.value })} /></Field></div>
              <Field label="City or address"><Input value={l.address} onChange={(e) => set({ address: e.target.value })} /></Field>
              <Field label="Links (portfolio, LinkedIn, GitHub)"><Input value={l.links} placeholder="separate with commas" onChange={(e) => set({ links: e.target.value })} /></Field>
            </Card>
            <Card className="space-y-2.5">
              <div className="text-sm font-semibold">The job</div>
              <div className="grid grid-cols-2 gap-2"><Field label="Role"><Input value={l.role} placeholder="Frontend Engineer" onChange={(e) => set({ role: e.target.value })} /></Field><Field label="Company"><Input value={l.company} onChange={(e) => set({ company: e.target.value })} /></Field></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Hiring manager (optional)"><Input value={l.recipient} onChange={(e) => set({ recipient: e.target.value })} /></Field><Field label="Date"><Input value={l.date} onChange={(e) => set({ date: e.target.value })} /></Field></div>
              <Field label="Company address (optional)"><Textarea className="min-h-14 font-sans" value={l.companyAddress} onChange={(e) => set({ companyAddress: e.target.value })} /></Field>
            </Card>
            <Card className="space-y-2.5">
              <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold">Letter</div>
                <label><span className="sr-only">Letter template</span><Select value="" onChange={(id) => { const t = TEMPLATES.find((x) => x.id === id); if (t) set({ subject: t.subject, body: t.body }) }} options={[{ value: '', label: 'Start from a template…' }, ...TEMPLATES.map((t) => ({ value: t.id, label: t.label }))]} className="h-8 w-auto text-xs" /></label></div>
              <Field label="Subject line"><Input value={l.subject} onChange={(e) => set({ subject: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Greeting"><Input value={l.greeting} onChange={(e) => set({ greeting: e.target.value })} /></Field><Field label="Closing"><Input value={l.closing} onChange={(e) => set({ closing: e.target.value })} /></Field></div>
              <Field label="Body" hint={`${l.body.split(/\s+/).filter(Boolean).length} words`}><Textarea className="min-h-72 font-sans text-sm" value={l.body} onChange={(e) => set({ body: e.target.value })} /></Field>
              <div className="text-xs text-muted">Use {'{role}'} and {'{company}'} and they are filled in for you. Leave an empty line between paragraphs.</div>
            </Card>
          </div>
          <div className="space-y-3 xl:sticky xl:top-24 xl:self-start">
            <div className="checker flex min-h-96 items-center justify-center rounded-2xl border border-border p-3">{preview ? <img src={preview} alt="Letter preview" className="max-h-[78vh] max-w-full bg-white shadow-2xl" /> : <Spinner label="Preview…" />}</div>
          </div>
        </div>}
        side={<>
          <Field label="Design"><Segmented value={style} onChange={(v) => { setStyle(v); setResult(null) }} options={[{ value: 'modern', label: 'Modern' }, { value: 'classic', label: 'Classic' }, { value: 'minimal', label: 'Minimal' }]} /></Field>
          <Field label="Accent color"><div className="flex gap-2">{Object.entries(ACCENTS).map(([k, c]) => <button key={k} type="button" aria-label={k} aria-pressed={accent === k} onClick={() => { setAccent(k); setResult(null) }} className="size-8 rounded-full ring-offset-2 ring-offset-[var(--bg)] transition cursor-pointer" style={{ background: `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`, boxShadow: accent === k ? '0 0 0 2px var(--accent)' : undefined }} />)}</div></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Paper"><Segmented value={size} onChange={(v) => { setSize(v); setResult(null) }} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} /></Field><Slider label="Text size" value={fontSize} min={9} max={12.5} step={0.5} onChange={(v) => { setFontSize(v); setResult(null) }} suffix=" pt" /></div>
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Paperclip className="size-3.5" />Add to the application</div>
            {atts.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2/50 px-2 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">{a.file.name} <span className="text-muted">· {formatBytes(a.file.size)}</span></span>
                <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="text-muted hover:text-fg cursor-pointer"><ArrowUp className="size-3.5" /></button>
                <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="text-muted hover:text-fg cursor-pointer"><ArrowDown className="size-3.5" /></button>
                <button type="button" aria-label="Remove" onClick={() => { setAtts((x) => x.filter((y) => y.id !== a.id)); setResult(null) }} className="text-muted hover:text-danger cursor-pointer"><X className="size-3.5" /></button>
              </div>))}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent"><Paperclip className="size-3.5" />Resume, certificates, references (PDF, JPG, PNG)<input type="file" hidden multiple accept="application/pdf,.pdf,image/jpeg,image/png" onChange={(e) => { const fs = [...(e.target.files ?? [])]; setAtts((x) => [...x, ...fs.map((f) => ({ id: Math.random().toString(36).slice(2), file: f }))]); setResult(null); e.target.value = '' }} /></label>
            {atts.length > 0 && <Switch checked={bookmarks} onChange={(v) => { setBookmarks(v); setResult(null) }} label="Bookmark each document" />}
          </div>
          <Note>Fonts are embedded, so the letter looks the same on every computer and passes applicant tracking systems that read text.</Note>
          {job.busy && <Progress value={job.progress} label="Building…" />}
          <ErrorNote error={job.error || prev.error} />
          <Button className="w-full" size="lg" icon={atts.length ? <FileDown className="size-5" /> : <Mail className="size-5" />} loading={job.busy} onClick={build}>{atts.length ? 'Create application PDF' : 'Create cover letter'}</Button>
        </>}
      />
    </div>
  )
}

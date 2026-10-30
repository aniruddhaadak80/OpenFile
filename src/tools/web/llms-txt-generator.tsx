import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Card, Input, Label, Switch, Textarea } from '@/components/ui'
import { buildLlms, linksFromLines } from '@/lib/cf/web'
import { OutBox } from '@/lib/cf/ui'

export default function LlmsTxtGenerator() {
  const [name, setName] = useState('OpenFile'), [summary, setSummary] = useState('Free file tools that run in your browser. Files never leave your device.'), [details, setDetails] = useState('All tools work offline after the first visit. There is no account and no upload.')
  const [secs, setSecs] = useState([{ title: 'Docs', text: 'Getting started | https://example.com/docs/start | install and first steps\nhttps://example.com/docs/faq', optional: false }, { title: 'Tools', text: 'PDF tools | https://example.com/pdf\nImage tools | https://example.com/image', optional: false }, { title: 'Optional', text: 'Blog | https://example.com/blog', optional: true }])
  const out = useMemo(() => buildLlms({ name, summary, details, sections: secs.map((s) => ({ title: s.title, links: linksFromLines(s.text), optional: s.optional })) }), [name, summary, details, secs])
  const upd = (i: number, p: Partial<(typeof secs)[number]>) => setSecs(secs.map((s, k) => (k === i ? { ...s, ...p } : s)))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Card className="space-y-3"><div><Label>Site or project name</Label><Input aria-label="Site or project name" value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label>One line summary</Label><Input aria-label="One line summary" value={summary} onChange={(e) => setSummary(e.target.value)} /></div><div><Label>More details (optional)</Label><Textarea aria-label="More details (optional)" value={details} onChange={(e) => setDetails(e.target.value)} className="min-h-16 font-sans" /></div></Card>
        {secs.map((s, i) => <Card key={i} className="space-y-2 p-3"><div className="flex gap-2"><Input value={s.title} onChange={(e) => upd(i, { title: e.target.value })} aria-label="Section title" /><button aria-label="Remove section" onClick={() => setSecs(secs.filter((_, k) => k !== i))} className="text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button></div><Textarea value={s.text} onChange={(e) => upd(i, { text: e.target.value })} className="min-h-20" placeholder="Title | URL | short note, or just URLs" /><Switch checked={s.optional} onChange={(v) => upd(i, { optional: v })} label="Optional (can be skipped when context is short)" /></Card>)}
        <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setSecs([...secs, { title: 'Section', text: '', optional: false }])}>Add section</Button>
      </div>
      <div className="space-y-3"><OutBox title="llms.txt" text={out} filename="llms.txt" mime="text/markdown" rows={24} /><p className="text-xs text-muted">llms.txt is a short Markdown map of your site for AI assistants, served at /llms.txt. Link to clean pages (Markdown versions work best) and keep notes short.</p></div>
    </div>
  )
}

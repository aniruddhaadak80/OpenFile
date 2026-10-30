import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Card, Dropzone, Input, Label, Textarea } from '@/components/ui'
import { auditHtml } from '@/lib/cf/web'
import { Stat, Stats } from '@/lib/cf/ui'

const SAMPLE = `<!doctype html><html lang="en"><head><title>Free PDF tools that run in your browser</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Merge, split and compress PDF files without uploading them.">
<meta property="og:title" content="Free PDF tools"></head><body><h1>PDF tools</h1><h3>Merge PDF</h3><p>Pick files and merge them.</p><img src="merge.png"><a href="/split">Split</a></body></html>`

export default function SeoAudit() {
  const [html, setHtml] = useState(SAMPLE), [kw, setKw] = useState('pdf tools')
  const a = useMemo(() => auditHtml(html, kw), [html, kw])
  const icon = (l: string) => (l === 'pass' ? <CheckCircle2 className="size-4 text-success" /> : l === 'warn' ? <AlertTriangle className="size-4 text-warn" /> : <XCircle className="size-4 text-danger" />)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Dropzone compact multiple={false} accept=".html,.htm,.xhtml,.php,.txt" onFiles={async (f) => setHtml(await f[0].text())} label="Drop an HTML file" sub="Or paste page source below (View source in your browser, then copy)" />
        <Textarea value={html} onChange={(e) => setHtml(e.target.value)} className="min-h-72" aria-label="Page HTML" />
        <div><Label>Main keyword (optional)</Label><Input value={kw} onChange={(e) => setKw(e.target.value)} /></div>
      </div>
      <div className="space-y-3">
        <Stats cols={4}><Stat label="Score" value={a.score} tone={a.score >= 80 ? 'good' : a.score >= 60 ? 'warn' : 'bad'} /><Stat label="Words" value={a.words} /><Stat label="Links" value={a.links.internal + a.links.external} sub={`${a.links.internal} internal`} /><Stat label="Images" value={a.images} sub={`${a.missingAlt} without alt`} /></Stats>
        <Card className="space-y-1.5 p-3">{[...a.items].sort((x, y) => ['fail', 'warn', 'pass'].indexOf(x.level) - ['fail', 'warn', 'pass'].indexOf(y.level)).map((i) => <div key={i.id} className="flex gap-2 text-sm">{icon(i.level)}<span>{i.text}</span></div>)}</Card>
        <Card className="space-y-1 text-sm"><div><span className="text-muted">Title:</span> {a.title || '-'}</div><div><span className="text-muted">Description:</span> {a.description || '-'}</div><div><span className="text-muted">H1:</span> {a.h1.join(' | ') || '-'}</div></Card>
        <p className="text-xs text-muted">Checks the page itself, on your device. It does not fetch the live site, so speed and backlinks are not included.</p>
      </div>
    </div>
  )
}

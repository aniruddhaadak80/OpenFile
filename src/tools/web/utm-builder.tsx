import { useMemo, useState } from 'react'
import { QrCode } from 'lucide-react'
import { Button, Card, CopyButton, Input, Label, Segmented, Switch, Textarea } from '@/components/ui'
import { downloadDataUrl } from '@/lib/files'
import { readUtm, utmUrl } from '@/lib/cf/web'
import { toCsvText } from '@/lib/cf/sheet'
import { OutBox } from '@/lib/cf/ui'

const PRESETS = [{ l: 'Newsletter', s: 'newsletter', m: 'email' }, { l: 'Instagram bio', s: 'instagram', m: 'social' }, { l: 'LinkedIn post', s: 'linkedin', m: 'social' }, { l: 'YouTube description', s: 'youtube', m: 'video' }, { l: 'Paid search', s: 'google', m: 'cpc' }, { l: 'QR on a flyer', s: 'flyer', m: 'qr' }]

export default function UtmBuilder() {
  const [mode, setMode] = useState<'one' | 'bulk' | 'read'>('one')
  const [url, setUrl] = useState('https://example.com/pricing'), [source, setSource] = useState('newsletter'), [medium, setMedium] = useState('email'), [campaign, setCampaign] = useState('october launch'), [term, setTerm] = useState(''), [content, setContent] = useState(''), [lower, setLower] = useState(true)
  const [bulk, setBulk] = useState('newsletter,email\ninstagram,social\nlinkedin,social\nyoutube,video'), [readIn, setReadIn] = useState('https://example.com/?utm_source=x&utm_medium=social&utm_campaign=spring&gclid=1')
  const [qr, setQr] = useState('')
  const one = useMemo(() => { try { return utmUrl(url, { source, medium, campaign, term, content }, lower) } catch { return '' } }, [url, source, medium, campaign, term, content, lower])
  const rows = bulk.split('\n').map((l) => l.split(/[,\t]/).map((x) => x.trim())).filter((r) => r[0])
  const bulkOut = rows.map((r) => [r[0], r[1] ?? medium, r[2] ?? campaign, (() => { try { return utmUrl(url, { source: r[0], medium: r[1] ?? medium, campaign: r[2] ?? campaign, content: r[3] }, lower) } catch { return '' } })()])
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'one', label: 'One link' }, { value: 'bulk', label: 'Many links' }, { value: 'read', label: 'Read a link' }]} />
      {mode !== 'read' && <Card className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>Page address</Label><Input aria-label="Page address" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        {mode === 'one' && <><div><Label>Source (where)</Label><Input aria-label="Source (where)" value={source} onChange={(e) => setSource(e.target.value)} /></div><div><Label>Medium (how)</Label><Input aria-label="Medium (how)" value={medium} onChange={(e) => setMedium(e.target.value)} /></div></>}
        <div><Label>Campaign</Label><Input aria-label="Campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} /></div>
        {mode === 'one' && <><div><Label>Term (paid keyword, optional)</Label><Input aria-label="Term (paid keyword, optional)" value={term} onChange={(e) => setTerm(e.target.value)} /></div><div><Label>Content (which link or version, optional)</Label><Input aria-label="Content (which link or version, optional)" value={content} onChange={(e) => setContent(e.target.value)} /></div></>}
        <Switch checked={lower} onChange={setLower} label="Lower case and underscores (keeps reports tidy)" />
      </Card>}
      {mode === 'one' && <><div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.l} onClick={() => { setSource(p.s); setMedium(p.m) }} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg cursor-pointer">{p.l}</button>)}</div>
        <Card className="space-y-3"><div className="break-all font-mono text-sm">{one || 'Type a valid address'}</div><div className="flex gap-2"><CopyButton text={one} label="Copy link" /><Button size="sm" variant="outline" icon={<QrCode className="size-4" />} disabled={!one} onClick={async () => { const Q = await import('qrcode'); setQr(await Q.toDataURL(one, { margin: 1, width: 480 })) }}>QR code</Button></div>
          {qr && <div className="flex items-end gap-3"><img src={qr} alt="QR code for the link" className="w-40 rounded bg-white p-1" /><Button size="sm" variant="ghost" onClick={() => downloadDataUrl(qr, 'utm-qr.png')}>Save PNG</Button></div>}</Card></>}
      {mode === 'bulk' && <div className="grid gap-4 lg:grid-cols-2"><div><Label>One row per link: source, medium, campaign, content</Label><Textarea aria-label="One row per link: source, medium, campaign, content" value={bulk} onChange={(e) => setBulk(e.target.value)} className="min-h-48" /></div><OutBox title={`${bulkOut.length} links`} text={toCsvText([['source', 'medium', 'campaign', 'url'], ...bulkOut])} filename="utm-links.csv" mime="text/csv" /></div>}
      {mode === 'read' && <div className="space-y-3"><div><Label>Paste a link</Label><Input aria-label="Paste a link" value={readIn} onChange={(e) => setReadIn(e.target.value)} /></div><Card className="text-sm">{Object.entries(readUtm(readIn)).map(([k, v]) => <div key={k} className="flex justify-between border-b border-border/60 py-1"><span className="font-mono">{k}</span><span>{v}</span></div>)}{!Object.keys(readUtm(readIn)).length && <span className="text-muted">No tracking tags found.</span>}</Card></div>}
    </div>
  )
}

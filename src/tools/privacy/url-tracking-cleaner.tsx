import { useMemo, useState } from 'react'
import { Card, Input, Label, Switch, Textarea } from '@/components/ui'
import { cleanText } from '@/lib/cf/priv'
import { OutBox, Stat, Stats } from '@/lib/cf/ui'

const SAMPLE = `Check this out https://www.example-shop.com/product/42?color=blue&utm_source=newsletter&utm_medium=email&utm_campaign=oct_sale&fbclid=IwAR2abc
Video: https://youtu.be/dQw4w9WgXcQ?si=Xk2v9Lq
Search link: https://www.google.com/url?q=https://news.example.org/story%3Fid%3D7%26gclid%3Dzz&sa=D&ust=1`

export default function UrlTrackingCleaner() {
  const [text, setText] = useState(SAMPLE)
  const [site, setSite] = useState(true), [unwrap, setUnwrap] = useState(true), [hash, setHash] = useState(false)
  const [extra, setExtra] = useState(''), [keep, setKeep] = useState('')
  const r = useMemo(() => cleanText(text, { siteRules: site, unwrap, dropHash: hash, extra: extra.split(/[\s,]+/).filter(Boolean), keep: keep.split(/[\s,]+/).filter(Boolean) }), [text, site, unwrap, hash, extra, keep])
  const changed = r.results.filter((x) => x.changed)
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div><Label>Paste links, or any text with links in it</Label><Textarea aria-label="Paste links, or any text with links in it" value={text} onChange={(e) => setText(e.target.value)} className="min-h-36" /></div>
        <Stats><Stat label="Links found" value={r.results.length} /><Stat label="Links cleaned" value={changed.length} tone={changed.length ? 'good' : undefined} /><Stat label="Trackers removed" value={changed.reduce((s, x) => s + x.removed.length, 0)} /></Stats>
        <OutBox title="Clean text" text={r.text} filename="clean-links.txt" />
        {changed.length > 0 && <Card className="space-y-2 p-3">{changed.map((x, i) => <div key={i} className="rounded-lg bg-surface-2/50 p-2 text-xs"><div className="truncate text-muted line-through" title={x.input}>{x.input}</div><div className="break-all font-mono text-success">{x.output}</div><div className="mt-1 flex flex-wrap gap-1">{x.unwrapped && <span className="rounded bg-accent/15 px-1.5 text-accent">unwrapped redirect</span>}{x.removed.map((k) => <span key={k} className="rounded bg-danger/10 px-1.5 text-danger">{k}</span>)}</div></div>)}</Card>}
      </div>
      <Card className="space-y-4 self-start">
        <Switch checked={unwrap} onChange={setUnwrap} label="Unwrap redirect links (Google, Facebook, Outlook safe links)" />
        <Switch checked={site} onChange={setSite} label="Shop and app rules (Amazon, YouTube, Instagram, LinkedIn and more)" />
        <Switch checked={hash} onChange={setHash} label="Also remove the # part" />
        <div><Label>Also remove these parameters</Label><Input aria-label="Also remove these parameters" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ref, source" /></div>
        <div><Label>Never remove</Label><Input aria-label="Never remove" value={keep} onChange={(e) => setKeep(e.target.value)} placeholder="tag, page" /></div>
        <p className="text-xs text-muted">Over 90 known tracking parameters are removed, like utm_, fbclid, gclid, igsh and si. Links still open the same page, they just stop telling sites where you came from.</p>
      </Card>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Switch, Textarea } from '@/components/ui'
import { AI_CRAWLERS, buildRobots, robotsAllowed, type RobotsGroup } from '@/lib/cf/web'
import { OutBox } from '@/lib/cf/ui'

export default function RobotsTxtGenerator() {
  const [mode, setMode] = useState<'build' | 'test'>('build')
  const [groups, setGroups] = useState<(RobotsGroup & { a: string; al: string; dis: string })[]>([{ agents: [], allow: [], disallow: [], a: '*', al: '', dis: '/admin/\n/cart/\n/*?sort=' }])
  const [blockAi, setBlockAi] = useState(false), [sitemaps, setSitemaps] = useState('https://example.com/sitemap.xml')
  const [testTxt, setTestTxt] = useState(''), [agent, setAgent] = useState('Googlebot'), [paths, setPaths] = useState('/\n/admin/login\n/shop?sort=price\n/blog/post-1')
  const split = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean)
  const out = useMemo(() => buildRobots([...groups.map((g) => ({ agents: split(g.a), allow: split(g.al), disallow: split(g.dis) })), ...(blockAi ? [{ agents: AI_CRAWLERS, allow: [], disallow: ['/'] }] : [])], split(sitemaps)), [groups, blockAi, sitemaps])
  const src = testTxt.trim() ? testTxt : out
  const results = split(paths).map((p) => ({ p, ...robotsAllowed(src, agent, p) }))
  const upd = (i: number, p: Partial<(typeof groups)[number]>) => setGroups(groups.map((g, k) => (k === i ? { ...g, ...p } : g)))
  return (
    <div className="space-y-4">
      <Segmented value={mode} onChange={setMode} options={[{ value: 'build', label: 'Build' }, { value: 'test', label: 'Test a URL' }]} />
      {mode === 'build' ? <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          {groups.map((g, i) => <Card key={i} className="space-y-2 p-3">
            <div className="flex items-center justify-between"><Label className="mb-0">Rule group {i + 1}</Label>{groups.length > 1 && <button aria-label="Remove group" onClick={() => setGroups(groups.filter((_, k) => k !== i))} className="text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button>}</div>
            <div><Label hint="one per line, * means all">User agents</Label><Textarea value={g.a} onChange={(e) => upd(i, { a: e.target.value })} className="min-h-12" /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Allow</Label><Textarea value={g.al} onChange={(e) => upd(i, { al: e.target.value })} className="min-h-20" placeholder="/public/" /></div><div><Label>Disallow</Label><Textarea value={g.dis} onChange={(e) => upd(i, { dis: e.target.value })} className="min-h-20" /></div></div>
          </Card>)}
          <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setGroups([...groups, { agents: [], allow: [], disallow: [], a: 'Bingbot', al: '', dis: '' }])}>Add rule group</Button>
          <Switch checked={blockAi} onChange={setBlockAi} label={`Block AI training crawlers (${AI_CRAWLERS.length} bots)`} />
          <div><Label>Sitemaps</Label><Textarea value={sitemaps} onChange={(e) => setSitemaps(e.target.value)} className="min-h-12" /></div>
        </div>
        <OutBox title="robots.txt" text={out} filename="robots.txt" rows={20} extra={<span className="text-xs text-muted">Upload to the root of your site</span>} />
      </div> : <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3"><div><Label>robots.txt to test (empty uses the one you built)</Label><Textarea value={testTxt} onChange={(e) => setTestTxt(e.target.value)} className="min-h-56" placeholder={out} /></div></div>
        <Card className="space-y-3"><div><Label>Crawler</Label><Input value={agent} onChange={(e) => setAgent(e.target.value)} /></div>
          <div><Label>Paths, one per line</Label><Textarea value={paths} onChange={(e) => setPaths(e.target.value)} className="min-h-24" /></div>
          <div className="divide-y divide-border rounded-xl border border-border">{results.map((r) => <div key={r.p} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm"><span className="truncate font-mono">{r.p}</span><span className={r.allowed ? 'text-success' : 'text-danger'}>{r.allowed ? 'Allowed' : 'Blocked'}<span className="ml-2 text-xs text-muted">{r.rule ?? 'no rule'}</span></span></div>)}</div>
          <p className="text-xs text-muted">Follows the standard rules: the longest matching path wins, and Allow wins a tie. * and $ wildcards are supported.</p></Card>
      </div>}
    </div>
  )
}

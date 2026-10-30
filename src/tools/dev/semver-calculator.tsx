import { useMemo, useState } from 'react'
import { Tag, Check, X } from 'lucide-react'
import { Field, Input, Switch, Textarea, Label, Card, cn } from '@/components/ui'
import { parseSemver, fmtSemver, compareSemver, satisfies, describeRange, bump } from '@/lib/b14/dev'
import { KV } from './_b5/shell'

const LIST = '1.2.3\n1.10.0\n1.2.10\n2.0.0-beta.1\n2.0.0\n0.9.8\n1.2.3-rc.1\n2.1.0'
const BUMPS = ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease'] as const

export default function SemverCalculator() {
  const [ver, setVer] = useState('1.4.2')
  const [other, setOther] = useState('1.10.0')
  const [range, setRange] = useState('^1.2.0 || ~2.0.0')
  const [list, setList] = useState(LIST)
  const [pre, setPre] = useState(false)
  const [tag, setTag] = useState('beta')
  const v = parseSemver(ver), o = parseSemver(other)
  const rows = useMemo(() => list.split(/\s*[\n,]\s*/).filter(Boolean).map((s) => ({ s, v: parseSemver(s) })), [list])
  const sorted = rows.filter((r) => r.v).sort((a, b) => compareSemver(a.v!, b.v!))
  const okRange = (x: ReturnType<typeof parseSemver>) => { try { return x ? satisfies(x, range, pre) : false } catch { return false } }
  const max = [...sorted].reverse().find((r) => okRange(r.v))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <Label>Version</Label>
        <Input value={ver} onChange={(e) => setVer(e.target.value)} className="font-mono" aria-label="Version" />
        {v ? <div className="grid grid-cols-3 gap-2"><KV label="Major" value={String(v.major)} copy={false} /><KV label="Minor" value={String(v.minor)} copy={false} /><KV label="Patch" value={String(v.patch)} copy={false} />{v.pre.length > 0 && <KV label="Pre-release" value={v.pre.join('.')} copy={false} />}{v.build.length > 0 && <KV label="Build" value={v.build.join('.')} copy={false} />}</div> : <p className="text-sm text-danger">Not a valid semantic version. It needs three numbers, like 1.4.2 or 2.0.0-beta.1.</p>}
        {v && <><Label>Next versions</Label><div className="grid grid-cols-2 gap-2">{BUMPS.map((k) => <KV key={k} label={k} value={fmtSemver(bump(v, k, tag))} />)}</div><Field label="Pre-release tag"><Input value={tag} onChange={(e) => setTag(e.target.value.replace(/[^0-9A-Za-z-]/g, '') || 'beta')} /></Field></>}
      </Card>
      <Card className="space-y-3">
        <Label>Compare</Label>
        <Input value={other} onChange={(e) => setOther(e.target.value)} className="font-mono" aria-label="Other version" />
        {v && o && <p className="text-sm"><span className="font-mono">{fmtSemver(v)}</span> is <b>{['lower than', 'the same as', 'higher than'][compareSemver(v, o) + 1]}</b> <span className="font-mono">{fmtSemver(o)}</span></p>}
        <Label>Range</Label>
        <Input value={range} onChange={(e) => setRange(e.target.value)} className="font-mono" aria-label="Range" />
        <p className="text-xs text-muted">Means: {describeRange(range)}.</p>
        <Switch checked={pre} onChange={setPre} label="Allow pre-releases (beta, rc)" />
        {v && <p className={cn('flex items-center gap-1.5 text-sm font-medium', okRange(v) ? 'text-success' : 'text-warn')}>{okRange(v) ? <Check className="size-4" /> : <X className="size-4" />}{fmtSemver(v)} {okRange(v) ? 'matches' : 'does not match'} the range</p>}
      </Card>
      <Card className="space-y-3 lg:col-span-2">
        <Label hint="one per line or comma separated">Sort and filter a list</Label>
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea value={list} onChange={(e) => setList(e.target.value)} className="min-h-48 font-mono text-xs" aria-label="Versions" />
          <div className="space-y-1">
            {sorted.map((r) => <div key={r.s} className={cn('flex items-center justify-between rounded-lg px-2 py-1 font-mono text-xs', okRange(r.v) ? 'bg-success/10' : 'bg-surface-2/40 text-muted')}><span>{fmtSemver(r.v!)}</span><span>{r === max ? 'highest match' : okRange(r.v) ? 'matches' : ''}</span></div>)}
            {rows.filter((r) => !r.v).map((r) => <div key={r.s} className="px-2 font-mono text-xs text-danger">{r.s} (not valid)</div>)}
          </div>
        </div>
        <p className="flex gap-1.5 text-xs text-muted"><Tag className="size-4 shrink-0" />Follows the Semantic Versioning 2.0 rules and the npm range syntax (^, ~, x, ||, hyphen ranges).</p>
      </Card>
    </div>
  )
}

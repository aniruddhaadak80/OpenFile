import { useMemo, useState } from 'react'
import { Gift, RotateCcw } from 'lucide-react'
import { Button, Card, Input, Label, Slider, Switch, Textarea } from '@/components/ui'
import { cryptoInt, drawWinners, filterEntries, parseEntries, type Entry } from '@/lib/cf/creator'
import { OutBox } from '@/lib/cf/ui'

const SAMPLE = '@maya.travels: Love this, tagging @rohan @kiara\n@leo_cooks: Count me in @ann\n@maya.travels: Another entry @sam @jo\n@ivy: Amazing page\n@arjun.k: Done @dev @nina @sara\n@zara: @tom @lina\n@brand_official: thanks all'

export default function GiveawayPicker() {
  const [text, setText] = useState(SAMPLE)
  const [n, setN] = useState(1), [backups, setBackups] = useState(1)
  const [unique, setUnique] = useState(true), [must, setMust] = useState(''), [mentions, setMentions] = useState(0), [exclude, setExclude] = useState('brand_official')
  const [res, setRes] = useState<{ winners: Entry[]; backups: Entry[]; at: Date; pool: number } | null>(null)
  const [rolling, setRolling] = useState<string | null>(null)
  const all = useMemo(() => parseEntries(text), [text])
  const pool = useMemo(() => filterEntries(all, { unique, mustInclude: must, minMentions: mentions, exclude: exclude.split(/[\s,]+/).filter(Boolean) }), [all, unique, must, mentions, exclude])
  const draw = () => {
    if (!pool.length) return
    const reduce = document.documentElement.classList.contains('reduce-motion')
    let k = 0
    const spin = () => { setRolling(pool[cryptoInt(pool.length)].name); if (++k < (reduce ? 1 : 18)) setTimeout(spin, 50 + k * 6); else { const w = drawWinners(pool, n + backups); setRes({ winners: w.slice(0, n), backups: w.slice(n), at: new Date(), pool: pool.length }); setRolling(null) } }
    spin()
  }
  const report = res ? `Giveaway draw ${res.at.toISOString()}\nEntries after filters: ${res.pool} (from ${all.length} comments)\nRules: ${[unique && 'one entry per person', must && `must include "${must}"`, mentions && `at least ${mentions} tags`, exclude && `excluded ${exclude}`].filter(Boolean).join(', ') || 'none'}\nMethod: browser crypto random numbers, no modulo bias\n\nWinners:\n${res.winners.map((w, i) => `${i + 1}. @${w.name} (line ${w.line}): ${w.text}`).join('\n')}\n${res.backups.length ? `\nBackups:\n${res.backups.map((w, i) => `${i + 1}. @${w.name} (line ${w.line})`).join('\n')}\n` : ''}` : ''
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div><Label hint={`${all.length} lines, ${pool.length} valid entries`}>Comments or entries, one per line</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-48" /></div>
        <p className="text-xs text-muted">Paste comments copied from your post or an exported CSV. Lines like "@user: comment" or "user, comment" are read as one entry each.</p>
        {(rolling || res) && <Card className="space-y-3 text-center">
          {rolling ? <div className="py-6 font-display text-4xl font-bold text-accent" aria-live="polite">@{rolling}</div> : res && <>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">Winner{res.winners.length > 1 ? 's' : ''}</div>
            {res.winners.map((w) => <div key={w.line} className="font-display text-3xl font-bold text-accent">@{w.name}</div>)}
            {res.backups.length > 0 && <div className="text-sm text-muted">Backups: {res.backups.map((b) => '@' + b.name).join(', ')}</div>}
          </>}
        </Card>}
        {res && !rolling && <OutBox title="Draw record (keep it for transparency)" text={report} filename="giveaway-draw.txt" />}
      </div>
      <Card className="space-y-4 self-start">
        <Slider label="Winners" value={n} onChange={setN} min={1} max={20} /><Slider label="Backup winners" value={backups} onChange={setBackups} min={0} max={10} />
        <Switch checked={unique} onChange={setUnique} label="One entry per person" />
        <div><Label>Comment must include</Label><Input value={must} onChange={(e) => setMust(e.target.value)} placeholder="for example a keyword or #tag" /></div>
        <Slider label="Minimum friends tagged" value={mentions} onChange={setMentions} min={0} max={5} />
        <div><Label>Exclude accounts</Label><Input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="your own account, staff" /></div>
        <Button className="w-full" icon={res ? <RotateCcw className="size-4" /> : <Gift className="size-4" />} disabled={!pool.length || !!rolling} onClick={draw}>{res ? 'Draw again' : 'Pick winner'}</Button>
      </Card>
    </div>
  )
}

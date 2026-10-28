import { useMemo, useState } from 'react'
import { Label, Textarea, ToolGrid, CopyButton, Switch, cn } from '@/components/ui'
import { PLATFORMS, hashtags, mentions, smsInfo, splitThread, graphemes } from '@/lib/bcat/creator'
import { Stat } from '@/tools/dev/_b5/shell'

const SAMPLE = `We just shipped 50 new tools that run fully in your browser. No uploads, no sign up, no waiting.

Try the new route heatmap with a year of runs: https://example.com/heatmap

#opensource #privacy #webdev`

export default function PostLengthChecker() {
  const [text, setText] = useState(SAMPLE)
  const [pick, setPick] = useState('x')
  const [num, setNum] = useState(true)
  const p = PLATFORMS.find((x) => x.id === pick)!
  const n = p.count(text)
  const sms = smsInfo(text)
  const thread = useMemo(() => (n > p.limit && ['x', 'threads', 'bluesky', 'mastodon'].includes(p.id) ? splitThread(text, p.limit, p.count, num) : []), [text, p, n, num])
  const words = text.split(/\s+/).filter(Boolean).length

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-48 font-sans text-[15px]" placeholder="Write or paste your post" aria-label="Post text" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Characters" value={text.length} sub={`${graphemes(text).length} visible`} /><Stat label="Words" value={words} /><Stat label="Hashtags" value={hashtags(text).length} /><Stat label="Mentions" value={mentions(text).length} /></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PLATFORMS.map((x) => {
              const c = x.count(text), over = c > x.limit, pct = Math.min(1, c / x.limit)
              return (
                <button key={x.id} type="button" onClick={() => setPick(x.id)} aria-pressed={pick === x.id} className={cn('rounded-xl border px-3 py-2 text-left transition cursor-pointer', pick === x.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50')}>
                  <div className="flex items-center justify-between text-sm"><span className="font-medium">{x.name}</span><span className={cn('font-mono text-xs', over ? 'text-danger' : 'text-muted')}>{c.toLocaleString()} / {x.limit.toLocaleString()}</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: over ? '#EF4444' : pct > 0.9 ? '#F97316' : '#10B981' }} /></div>
                </button>
              )
            })}
          </div>
        </div>
      }
      side={
        <>
          <div><Label>{p.name}</Label><p className={cn('font-display text-3xl font-semibold', n > p.limit ? 'text-danger' : '')}>{p.limit - n >= 0 ? `${(p.limit - n).toLocaleString()} left` : `${(n - p.limit).toLocaleString()} over`}</p>{p.note && <p className="mt-1 text-xs text-muted">{p.note}</p>}</div>
          {p.fold && text.length > p.fold && (
            <div><Label>What shows before "more"</Label><div className="rounded-xl border border-border bg-surface-2/50 p-3 text-sm whitespace-pre-wrap">{text.slice(0, p.fold).trimEnd()}<span className="text-muted">... more</span></div></div>
          )}
          {thread.length > 1 && (
            <div className="space-y-2"><div className="flex items-center justify-between"><Label className="mb-0">As a thread ({thread.length} posts)</Label><CopyButton text={thread.join('\n\n')} /></div>
              <Switch checked={num} onChange={setNum} label="Number the posts" />
              <div className="max-h-72 space-y-2 overflow-auto">{thread.map((t, i) => <div key={i} className="rounded-xl border border-border p-2 text-xs whitespace-pre-wrap">{t}<div className="mt-1 text-right font-mono text-[10px] text-muted">{p.count(t)}</div></div>)}</div>
            </div>
          )}
          <div><Label>As a text message</Label><p className="text-sm">{sms.parts} SMS part{sms.parts === 1 ? '' : 's'} · {sms.encoding} · {sms.units} of {sms.perPart} per part</p></div>
          {hashtags(text).length > 0 && <div><Label>Hashtags</Label><p className="text-xs text-muted">{hashtags(text).join(' ')}</p></div>}
        </>
      }
    />
  )
}

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Switch, Badge, CopyButton, Textarea, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { Bar, OpenFileButton, useStored } from '../dev/_b5/shell'
import { EXTRACTORS, extract } from '@/lib/b5/textops'

const SAMPLE = `Contact sales@example.com or Support@Example.com.
Docs: https://docs.example.dev/start?ref=home and http://old.example.org/page.
Servers 10.0.4.12, 192.168.1.1 and fe80::1ff:fe23:4567:890a. Device 3C:5A:B4:12:34:56.
Call +1 (415) 555-2671 on 2026-10-28 or 28 Oct 2026. Build sha 9b74c9897bac770ffc029102a200c5de.
Price $1,299.00 or 1299 INR. Ticket 1f0e6b2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b. #release @openfile`

export default function TextExtractor() {
  const [text, setText] = useStored('b5:extract:text', SAMPLE)
  const [kind, setKind] = useState('email')
  const [unique, setUnique] = useState(true)
  const [sort, setSort] = useState(false)
  const counts = useMemo(() => Object.fromEntries(EXTRACTORS.map((e) => [e.id, extract(text, e.id, true).length])), [text])
  const list = useMemo(() => extract(text, kind, unique, sort), [text, kind, unique, sort])
  const name = EXTRACTORS.find((e) => e.id === kind)!.name
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {EXTRACTORS.map((e) => <button key={e.id} onClick={() => setKind(e.id)} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition', kind === e.id ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2/50 text-muted hover:text-fg', !counts[e.id] && kind !== e.id && 'opacity-50')}>{e.name}<span className="font-mono">{counts[e.id]}</span></button>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Text</span><span className="flex gap-1"><OpenFileButton accept="text/*,.csv,.log,.json,.html,.md,.eml" onText={(t) => setText(t)} /><Button size="sm" variant="ghost" onClick={() => setText('')}>Clear</Button></span></div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[420px] text-[12.5px]" aria-label="Text to search" />
        </div>
        <div className="space-y-2">
          <Bar className="p-2"><Badge>{list.length} {name.toLowerCase()}</Badge><Switch checked={unique} onChange={setUnique} label="Unique" /><Switch checked={sort} onChange={setSort} label="Sort" /><span className="ml-auto flex gap-1"><CopyButton text={list.join('\n')} variant="ghost" /><Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([list.join('\n')], { type: 'text/plain' }), `${kind}.txt`)}>Save</Button></span></Bar>
          <div className="scrollbar-thin h-[370px] overflow-auto rounded-2xl border border-border bg-surface p-2">
            {list.length ? list.map((x, i) => <div key={i} className="group flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-[13px] hover:bg-surface-2"><span className="w-8 text-right text-[11px] text-muted">{i + 1}</span><span className="min-w-0 flex-1 break-all">{x}</span><span className="opacity-0 group-hover:opacity-100"><CopyButton text={x} label="" variant="ghost" /></span></div>) : <div className="grid h-full place-items-center text-sm text-muted">No {name.toLowerCase()} found.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

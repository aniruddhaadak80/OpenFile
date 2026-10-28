import { useState } from 'react'
import { Input, CopyButton } from '@/components/ui'
import { useStored } from '../dev/_b5/shell'
import { FANCY } from '@/lib/b5/textops'

export default function FancyText() {
  const [text, setText] = useStored('b5:fancy:text', 'OpenFile is free')
  const [filter, setFilter] = useState('')
  const list = FANCY.filter((f) => !filter || f.name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <div className="space-y-4">
      <Input value={text} onChange={(e) => setText(e.target.value)} className="h-14 text-xl" placeholder="Type your text" aria-label="Your text" autoFocus />
      <div className="flex items-center justify-between gap-3"><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter styles" className="w-48" aria-label="Filter styles" /><p className="text-xs text-muted">These are Unicode characters, so they paste anywhere: bios, posts, names. Screen readers may read them oddly; keep important text plain.</p></div>
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((f) => { const out = f.fn(text || 'Type something'); return (
          <div key={f.id} className="group flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 transition hover:border-accent/40">
            <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{f.name}</div><div className="truncate text-lg" title={out}>{out}</div></div>
            <CopyButton text={out} label="" />
          </div>
        ) })}
      </div>
    </div>
  )
}

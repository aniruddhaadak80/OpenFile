import { Eye, EyeOff } from 'lucide-react'
import { Label, cn } from '@/components/ui'
import type { CadLayer } from '@/lib/b2/cad'

export function LayerPanel({ layers, hidden, setHidden }: { layers: CadLayer[]; hidden: Set<string>; setHidden: (s: Set<string>) => void }) {
  const toggle = (n: string) => { const s = new Set(hidden); s.has(n) ? s.delete(n) : s.add(n); setHidden(s) }
  return (
    <div>
      <Label hint={<span className="flex gap-2"><button className="underline cursor-pointer" onClick={() => setHidden(new Set())}>All</button><button className="underline cursor-pointer" onClick={() => setHidden(new Set(layers.map((l) => l.name)))}>None</button></span>}>Layers ({layers.length})</Label>
      <div className="max-h-72 space-y-0.5 overflow-auto rounded-xl border border-border p-1 scrollbar-thin">
        {layers.map((l) => (
          <button key={l.name} onClick={() => toggle(l.name)} aria-pressed={!hidden.has(l.name)} className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs cursor-pointer hover:bg-surface-2', hidden.has(l.name) && 'text-muted')}>
            {hidden.has(l.name) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            <span className="size-3 shrink-0 rounded-sm border border-border" style={{ background: `rgb(${l.rgb.join(',')})` }} />
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            <span className="font-mono text-[10px] text-muted">{l.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'

type T = { id: number; msg: string; type: 'success' | 'error' | 'info' }
let push: ((t: T) => void) | null = null
let id = 0
export function toast(msg: string, type: T['type'] = 'success') { push?.({ id: ++id, msg, type }) }

export function Toaster() {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => { push = (t) => { setItems((s) => [...s, t]); setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 3200) }; return () => { push = null } }, [])
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className="glass pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm shadow-2xl animate-[float_0.3s_ease-out]">
          {t.type === 'success' ? <CheckCircle2 className="size-4 text-success" /> : t.type === 'error' ? <AlertCircle className="size-4 text-danger" /> : <Info className="size-4 text-accent" />}
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

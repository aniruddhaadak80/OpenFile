import { useEffect, useMemo, useState } from 'react'
import { Search, Clock } from 'lucide-react'
import { Input, Spinner, CopyButton, Badge, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { copyText } from '@/lib/files'
import { KV, useStored } from '../dev/_b5/shell'

type E = { hexcode: string; label: string; unicode: string; group?: number; order?: number; tags?: string[]; skins?: E[] }
type Data = { list: E[]; codes: Record<string, string | string[]>; groups: { key: string; message: string; order: number }[] }
let dataP: Promise<Data> | null = null
const load = () => (dataP ??= Promise.all([import('emojibase-data/en/compact.json'), import('emojibase-data/en/shortcodes/github.json'), import('emojibase-data/en/shortcodes/emojibase.json'), import('emojibase-data/en/messages.json')]).then(([c, gh, eb, msg]) => {
  const codes: Record<string, string | string[]> = { ...(eb.default as any) }
  for (const [k, v] of Object.entries(gh.default as any)) codes[k] = v as any
  return { list: (c.default as E[]).filter((e) => e.group !== undefined && e.group !== 2).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), codes, groups: (msg.default as any).groups }
}))
const SKINS = ['', '1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF']
const SKIN_DOTS = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿']
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default function EmojiPicker() {
  const [data, setData] = useState<Data | null>(null)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<number | 'recent'>(0)
  const [skin, setSkin] = useStored('b5:emoji:skin', 0)
  const [recent, setRecent] = useStored<string[]>('b5:emoji:recent', [])
  const [sel, setSel] = useState<E | null>(null)
  const [tray, setTray] = useState('')
  useEffect(() => { load().then(setData) }, [])

  const withSkin = (e: E) => (skin && e.skins ? e.skins.find((s) => s.hexcode.includes(SKINS[skin])) ?? e : e)
  const list = useMemo(() => {
    if (!data) return []
    const ql = q.trim().toLowerCase().replace(/^:|:$/g, '')
    if (ql) return data.list.filter((e) => e.label.includes(ql) || e.tags?.some((t) => t.startsWith(ql)) || [data.codes[e.hexcode]].flat().some((c) => c?.includes(ql))).slice(0, 400)
    if (group === 'recent') return recent.map((u) => data.list.find((e) => e.unicode === u || e.skins?.some((s) => s.unicode === u))).filter(Boolean) as E[]
    return data.list.filter((e) => e.group === group)
  }, [data, q, group, recent])

  const pick = async (e: E) => {
    const x = withSkin(e); setSel(e)
    if (await copyText(x.unicode)) toast(`Copied ${x.unicode}`)
    setTray((t) => t + x.unicode)
    setRecent((r) => [x.unicode, ...r.filter((u) => u !== x.unicode)].slice(0, 48))
  }
  const s = sel ? withSkin(sel) : null
  const cps = s ? Array.from(s.unicode).map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ') : ''

  if (!data) return <Spinner label="Loading emoji…" />
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: heart, fire, :tada:, cat" className="h-10 pl-9" aria-label="Search emoji" autoFocus /></div>
          <div className="flex gap-0.5 rounded-xl border border-border bg-surface-2/60 p-1" role="radiogroup" aria-label="Skin tone">{SKIN_DOTS.map((d, i) => <button key={i} role="radio" aria-checked={skin === i} onClick={() => setSkin(i)} className={cn('rounded-lg px-1.5 py-0.5 text-lg', skin === i && 'bg-surface ring-1 ring-border')}>{d}</button>)}</div>
        </div>
        {!q && <div className="flex flex-wrap gap-1">
          <button onClick={() => setGroup('recent')} className={cn('inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs', group === 'recent' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2')}><Clock className="size-3" />Recent</button>
          {data.groups.filter((g) => g.order !== 2 && g.order < 10).map((g) => <button key={g.key} onClick={() => setGroup(g.order)} className={cn('rounded-lg px-2.5 py-1 text-xs capitalize', group === g.order ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2')}>{g.message}</button>)}
        </div>}
        <div className="scrollbar-thin grid max-h-[520px] grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1 overflow-auto rounded-2xl border border-border bg-surface p-2">
          {list.map((e) => <button key={e.hexcode} onClick={() => pick(e)} onMouseEnter={() => setSel(e)} onFocus={() => setSel(e)} title={e.label} aria-label={e.label} className="grid aspect-square place-items-center rounded-lg text-[26px] transition hover:scale-110 hover:bg-surface-2 focus-visible:bg-surface-2">{withSkin(e).unicode}</button>)}
          {!list.length && <div className="col-span-full p-6 text-center text-sm text-muted">{group === 'recent' && !q ? 'Emoji you pick show up here.' : 'No emoji found.'}</div>}
        </div>
      </div>
      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-surface p-5 text-center">
          {s ? <><div className="text-7xl">{s.unicode}</div><div className="mt-2 font-medium capitalize">{s.label}</div>{first(data.codes[sel!.hexcode]) && <Badge className="mt-1">:{first(data.codes[sel!.hexcode])}:</Badge>}</> : <div className="py-8 text-sm text-muted">Click an emoji to copy it</div>}
        </div>
        {s && <div className="space-y-2"><KV label="Code points" value={cps} /><KV label="HTML" value={Array.from(s.unicode).map((c) => `&#x${c.codePointAt(0)!.toString(16).toUpperCase()};`).join('')} /><KV label="JavaScript" value={Array.from(s.unicode).map((c) => `\\u{${c.codePointAt(0)!.toString(16).toUpperCase()}}`).join('')} />{sel?.tags && <KV label="Tags" value={sel.tags.join(', ')} mono={false} copy={false} />}</div>}
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">Picked<span className="flex gap-1">{tray && <CopyButton text={tray} variant="ghost" />}<button className="text-[11px] normal-case text-muted hover:text-fg" onClick={() => setTray('')}>Clear</button></span></div>
          <Input value={tray} onChange={(e) => setTray(e.target.value)} className="text-xl" aria-label="Picked emoji" />
        </div>
      </aside>
    </div>
  )
}

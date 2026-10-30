/* Recipe gallery with motion preview loops, plus saved recipes: save, load, delete, export and import JSON, share link. */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Play, Sparkles, Save, Upload, Download, Share2, Trash2, FolderOpen, Radio, GitBranch } from 'lucide-react'
import { Button, Input, Switch, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob } from '@/lib/files'
import { BUILTINS, type Builtin } from '@/pages/workspace/recipes'
import { chain, type Recipe } from '@/pages/workspace/recipe'
import { metaOf } from '@/pages/workspace/catalog'
import { StepIcon, catColor, useMotion } from './kit'

const media = (f: string) => `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}media/workspace/${f}`

function Loop({ id, title }: { id: string; title: string }) {
  const m = useMotion()
  const v = useRef<HTMLVideoElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = v.current; if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '120px' })
    io.observe(el); return () => io.disconnect()
  }, [])
  useEffect(() => {
    const el = v.current; if (!el) return
    if (m === 'full' && inView) el.play().catch(() => {}); else el.pause()
  }, [m, inView])
  return (
    <video ref={v} muted loop playsInline preload="none" poster={media(`${id}.jpg`)} aria-label={`${title} preview`}
      onMouseEnter={() => m === 'subtle' && v.current?.play().catch(() => {})} onMouseLeave={() => m === 'subtle' && v.current?.pause()}
      className="aspect-video w-full rounded-xl bg-black object-cover">
      <source src={media(`${id}.mp4`)} type="video/mp4" />
    </video>
  )
}

export function RecipeGallery({ onUse, onTry }: { onUse: (b: Builtin) => void; onTry: (b: Builtin) => void }) {
  const m = useMotion()
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-tour="gallery">
      {BUILTINS.map((b, i) => {
        const g = b.graph()
        const steps = g.nodes.filter((n) => metaOf(n.step))
        const branched = g.edges.filter(([a]) => a === '@in').length > 1
        return (
          <motion.article key={b.id} initial={m === 'off' ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.45, delay: m === 'full' ? (i % 4) * 0.07 : 0 }}
            className="group flex flex-col rounded-2xl border border-border bg-surface p-2.5 transition hover:-translate-y-1 hover:border-accent/60 hover:shadow-2xl">
            <div className="relative overflow-hidden rounded-xl">
              <Loop id={b.id} title={b.name} />
              <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-black" style={{ background: b.color }}>{b.tag}</span>
              {branched && <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white"><GitBranch className="size-3" /> branches</span>}
            </div>
            <div className="mt-2.5 px-1"><h3 className="font-semibold leading-tight">{b.name}</h3><p className="mt-0.5 text-xs text-muted">{b.desc}</p></div>
            <div className="mt-2 flex flex-wrap gap-1 px-1">
              {steps.slice(0, 6).map((n) => <span key={n.id} title={metaOf(n.step)!.name} className="grid size-6 place-items-center rounded-md" style={{ background: catColor(n.step) + '22', color: catColor(n.step) }}><StepIcon step={n.step} className="size-3.5" /></span>)}
            </div>
            <div className="mt-auto flex gap-2 px-1 pb-1 pt-3">
              <Button size="sm" className="flex-1" icon={<Play className="size-3.5" />} onClick={() => onUse(b)}>Use</Button>
              <Button size="sm" variant="outline" className="flex-1" icon={<Sparkles className="size-3.5" />} onClick={() => onTry(b)}>With samples</Button>
            </div>
          </motion.article>
        )
      })}
    </div>
  )
}

export function MyRecipes({ name, onName, recipes, onSave, onLoad, onDelete, onImport, onExport, onShare, mirror, onMirror }: {
  name: string; onName: (s: string) => void; recipes: Recipe[]
  onSave: () => void; onLoad: (r: Recipe) => void; onDelete: (name: string) => void; onImport: (text: string) => void; onExport: (r?: Recipe) => void; onShare: () => void
  mirror: boolean; onMirror: (v: boolean) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4" data-tour="recipes">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><FolderOpen className="size-3.5" /> My recipes</div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onSave() }}>
        <Input placeholder="Recipe name" value={name} onChange={(e) => onName(e.target.value)} aria-label="Recipe name" maxLength={80} />
        <Button type="submit" variant="outline" icon={<Save className="size-4" />} aria-label="Save recipe (Ctrl+S)" />
      </form>
      <div className="grid grid-cols-3 gap-1.5">
        <Button size="sm" variant="ghost" icon={<Share2 className="size-3.5" />} onClick={onShare}>Link</Button>
        <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => onExport()}>Export</Button>
        <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} onClick={() => fileRef.current?.click()}>Import</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; if (f.size > 200_000) return toast('That file is too large to be a recipe', 'error'); onImport(await f.text()) }} />
      </div>
      <label className="flex items-center justify-between gap-2 text-xs text-muted"><span className="flex items-center gap-1.5"><Radio className="size-3.5" /> Mirror this pipeline in my other tabs</span><Switch checked={mirror} onChange={onMirror} /></label>
      {recipes.length === 0 && <div className="text-xs text-muted">Saved recipes stay in this browser and show up in every open tab.</div>}
      <ul className="max-h-60 space-y-1.5 overflow-auto scrollbar-thin">
        {recipes.map((r) => (
          <li key={r.name} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <button className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => onLoad(r)}><div className="truncate text-sm font-medium">{r.name}</div><div className="truncate text-[11px] text-muted">{chain(r.graph).map((n) => metaOf(n.step)?.name).join(' → ') || `${r.graph.nodes.length - 2} steps`}</div></button>
            <button onClick={() => onExport(r)} aria-label={`Export ${r.name}`} className="text-muted hover:text-accent cursor-pointer"><Download className="size-4" /></button>
            <button onClick={() => onDelete(r.name)} aria-label={`Delete ${r.name}`} className="text-muted hover:text-danger cursor-pointer"><Trash2 className="size-4" /></button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const exportRecipe = (r: Recipe) => downloadBlob(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }), `${r.name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'recipe'}.openfile-recipe.json`)
export { cn }

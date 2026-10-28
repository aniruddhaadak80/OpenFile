import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Play, Trash2, ArrowUp, ArrowDown, Save, Download, Workflow, ImageIcon, FileText, Sparkles, Check, FolderOpen, X } from 'lucide-react'
import { STEPS, PRESETS, type Mode, type Item } from './workspace/steps'
import { Button, Card, Dropzone, FileChip, Input, Label, Progress, Segmented, Select, Switch, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, formatBytes, zipFiles } from '@/lib/files'

type Step = { uid: string; id: string; params: Record<string, any>; enabled: boolean }
type Recipe = { name: string; mode: Mode; steps: Step[] }
const uid = () => Math.random().toString(36).slice(2, 9)
const mk = (id: string, params?: Record<string, any>): Step => { const d = STEPS.find((s) => s.id === id)!; return { uid: uid(), id, enabled: true, params: { ...Object.fromEntries(d.params.map((p) => [p.key, p.default])), ...params } } }

export default function Workspace() {
  useEffect(() => { document.title = 'Workspace — OpenFile' }, [])
  const [mode, setMode] = useState<Mode>('image')
  const [files, setFiles] = useState<File[]>([])
  const [steps, setSteps] = useState<Step[]>(() => PRESETS[0].steps.map((s) => mk(s.id, s.params)))
  const [running, setRunning] = useState(false)
  const [stepIdx, setStepIdx] = useState(-1)
  const [prog, setProg] = useState(0)
  const [results, setResults] = useState<Item[] | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>(() => { try { return JSON.parse(localStorage.getItem('of:recipes') || '[]') } catch { return [] } })
  const [recipeName, setRecipeName] = useState('')
  useEffect(() => localStorage.setItem('of:recipes', JSON.stringify(recipes)), [recipes])
  const available = STEPS.filter((s) => s.mode === mode)
  const accept = mode === 'image' ? 'image/*' : 'application/pdf'
  const totalIn = useMemo(() => files.reduce((a, f) => a + f.size, 0), [files])
  const totalOut = results?.reduce((a, f) => a + f.blob.size, 0) ?? 0

  const switchMode = (m: Mode) => { setMode(m); setFiles([]); setResults(null); setLog([]); const p = PRESETS.find((x) => x.mode === m)!; setSteps(p.steps.map((s) => mk(s.id, s.params))) }
  const move = (i: number, d: number) => setSteps((s) => { const a = [...s]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a })
  const setParam = (u: string, k: string, v: any) => setSteps((s) => s.map((x) => (x.uid === u ? { ...x, params: { ...x.params, [k]: v } } : x)))

  async function run() {
    if (!files.length) return toast('Add some files first', 'error')
    const active = steps.filter((s) => s.enabled)
    if (!active.length) return toast('Add at least one step', 'error')
    setRunning(true); setResults(null); setLog([])
    const t0 = performance.now()
    let items: Item[] = files.map((f) => ({ name: f.name, blob: f }))
    try {
      for (let i = 0; i < active.length; i++) {
        const def = STEPS.find((d) => d.id === active[i].id)!
        setStepIdx(steps.indexOf(active[i])); setProg(0)
        const ts = performance.now()
        items = await def.run(items, active[i].params, setProg)
        setLog((l) => [...l, `✓ ${def.name} — ${items.length} file(s) in ${Math.round(performance.now() - ts)} ms`])
      }
      setResults(items)
      toast(`Pipeline finished in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
    } catch (e: any) { setLog((l) => [...l, `✗ ${e?.message || e}`]); toast(e?.message || 'Pipeline failed', 'error') }
    finally { setRunning(false); setStepIdx(-1) }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent"><Workflow className="size-3.5" /> WORKSPACE</div>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Batch pipelines</h1>
          <p className="mt-1.5 max-w-xl text-muted">Chain steps into a recipe and run it on hundreds of files at once — locally, in your browser.</p>
        </div>
        <Segmented value={mode} onChange={switchMode} options={[{ value: 'image', label: <span className="flex items-center gap-1.5"><ImageIcon className="size-3.5" /> Images</span> }, { value: 'pdf', label: <span className="flex items-center gap-1.5"><FileText className="size-3.5" /> PDFs</span> }]} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr_300px]">
        {/* Inputs */}
        <div className="space-y-3">
          <Label hint={files.length ? `${files.length} · ${formatBytes(totalIn)}` : undefined}>1 · Input files</Label>
          <Dropzone compact multiple accept={accept} onFiles={(f) => { setFiles((x) => [...x, ...f]); setResults(null) }} label={mode === 'image' ? 'Drop images' : 'Drop PDFs'} sub="Any number of files" />
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1 scrollbar-thin">
            {files.map((f, i) => <FileChip key={i + f.name} file={f} onRemove={() => setFiles((x) => x.filter((_, k) => k !== i))} />)}
          </div>
          {files.length > 1 && <Button variant="ghost" size="sm" onClick={() => setFiles([])} icon={<X className="size-3.5" />}>Clear all</Button>}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <Label>2 · Pipeline steps</Label>
          <AnimatePresence initial={false}>
            {steps.map((s, i) => {
              const def = STEPS.find((d) => d.id === s.id)!
              const state = running ? (i < stepIdx ? 'done' : i === stepIdx ? 'run' : 'wait') : results && s.enabled ? 'done' : 'idle'
              return (
                <motion.div key={s.uid} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 30 }}>
                  <Card className={cn('p-4 transition', state === 'run' && 'border-accent ring-4 ring-accent/15', !s.enabled && 'opacity-50')}>
                    <div className="flex items-center gap-3">
                      <div className={cn('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold', state === 'done' ? 'bg-success text-white' : state === 'run' ? 'bg-accent text-white' : 'bg-surface-2 text-muted')}>{state === 'done' ? <Check className="size-4" /> : i + 1}</div>
                      <div className="min-w-0 flex-1"><div className="font-semibold">{def.name}</div><div className="truncate text-xs text-muted">{def.desc}</div></div>
                      <Switch checked={s.enabled} onChange={(v) => setSteps((x) => x.map((y) => (y.uid === s.uid ? { ...y, enabled: v } : y)))} />
                      <button onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowUp className="size-4" /></button>
                      <button onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:text-fg cursor-pointer"><ArrowDown className="size-4" /></button>
                      <button onClick={() => setSteps((x) => x.filter((y) => y.uid !== s.uid))} className="rounded p-1 text-muted hover:text-danger cursor-pointer"><Trash2 className="size-4" /></button>
                    </div>
                    {def.params.length > 0 && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {def.params.map((p) => (
                          <div key={p.key}>
                            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{p.label}</div>
                            {p.type === 'select' ? <Select value={String(s.params[p.key])} onChange={(v) => setParam(s.uid, p.key, v)} options={p.options!} />
                              : p.type === 'bool' ? <Switch checked={!!s.params[p.key]} onChange={(v) => setParam(s.uid, p.key, v)} />
                              : p.type === 'color' ? <input type="color" value={s.params[p.key]} onChange={(e) => setParam(s.uid, p.key, e.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-border bg-transparent" />
                              : <Input type={p.type} min={p.min} max={p.max} value={s.params[p.key]} onChange={(e) => setParam(s.uid, p.key, p.type === 'number' ? Number(e.target.value) : e.target.value)} />}
                          </div>
                        ))}
                      </div>
                    )}
                    {state === 'run' && <div className="mt-3"><Progress value={prog} /></div>}
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
          <div className="flex flex-wrap gap-2 rounded-2xl border border-dashed border-border p-3">
            <span className="flex items-center gap-1 px-1 text-xs text-muted"><Plus className="size-3.5" /> Add step:</span>
            {available.map((d) => <button key={d.id} onClick={() => setSteps((s) => [...s, mk(d.id)])} className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs hover:border-accent hover:text-accent cursor-pointer">{d.name}</button>)}
          </div>
          <Button size="lg" className="w-full" loading={running} onClick={run} icon={<Play className="size-4" />}>{running ? 'Running pipeline…' : `Run on ${files.length || 0} file${files.length === 1 ? '' : 's'}`}</Button>
          {log.length > 0 && <pre className="rounded-xl border border-border bg-surface-2/60 p-3 font-mono text-xs leading-relaxed text-muted">{log.join('\n')}</pre>}
          {results && (
            <Card className="border-success/30 bg-success/5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><div className="font-semibold">{results.length} file(s) ready</div><div className="text-sm text-muted">{formatBytes(totalIn)} → <span className="font-medium text-success">{formatBytes(totalOut)}</span></div></div>
                <div className="flex gap-2">
                  {results.length === 1 ? <Button icon={<Download className="size-4" />} onClick={() => downloadBlob(results[0].blob, results[0].name)}>Download</Button>
                    : <Button icon={<Download className="size-4" />} onClick={async () => downloadBlob(await zipFiles(results.map((r) => ({ name: r.name, data: r.blob }))), 'openfile-pipeline.zip')}>Download ZIP</Button>}
                </div>
              </div>
              <div className="mt-4 grid max-h-72 gap-2 overflow-auto scrollbar-thin sm:grid-cols-2">
                {results.map((r, i) => (
                  <button key={i} onClick={() => downloadBlob(r.blob, r.name)} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2 text-left hover:border-accent cursor-pointer">
                    {r.blob.type.startsWith('image/') ? <img src={URL.createObjectURL(r.blob)} className="size-10 rounded-lg object-cover" alt="" /> : <div className="grid size-10 place-items-center rounded-lg bg-danger/10 text-danger"><FileText className="size-5" /></div>}
                    <div className="min-w-0"><div className="truncate text-sm">{r.name}</div><div className="text-xs text-muted">{formatBytes(r.blob.size)}</div></div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Recipes */}
        <div className="space-y-4">
          <Card className="space-y-3">
            <Label><span className="flex items-center gap-1.5"><Sparkles className="size-3.5" /> Presets</span></Label>
            {PRESETS.filter((p) => p.mode === mode).map((p) => (
              <button key={p.name} onClick={() => { setSteps(p.steps.map((s) => mk(s.id, s.params))); setResults(null) }} className="w-full rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:border-accent cursor-pointer">
                <div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.steps.map((s) => STEPS.find((d) => d.id === s.id)!.name).join(' → ')}</div>
              </button>
            ))}
          </Card>
          <Card className="space-y-3">
            <Label><span className="flex items-center gap-1.5"><FolderOpen className="size-3.5" /> My recipes</span></Label>
            <div className="flex gap-2"><Input placeholder="Recipe name" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} />
              <Button variant="outline" icon={<Save className="size-4" />} onClick={() => { if (!recipeName.trim()) return toast('Name your recipe', 'error'); setRecipes((r) => [{ name: recipeName.trim(), mode, steps }, ...r.filter((x) => x.name !== recipeName.trim())]); setRecipeName(''); toast('Recipe saved') }} /></div>
            {recipes.filter((r) => r.mode === mode).length === 0 && <div className="text-xs text-muted">Saved recipes appear here and stay in this browser.</div>}
            {recipes.filter((r) => r.mode === mode).map((r) => (
              <div key={r.name} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                <button className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => { setSteps(r.steps.map((s) => ({ ...s, uid: uid() }))); setResults(null) }}><div className="truncate text-sm font-medium">{r.name}</div><div className="text-xs text-muted">{r.steps.length} steps</div></button>
                <button onClick={() => setRecipes((x) => x.filter((y) => y.name !== r.name))} className="text-muted hover:text-danger cursor-pointer"><Trash2 className="size-4" /></button>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}

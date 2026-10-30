import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import { Workflow, Undo2, Redo2, LayoutList, Network, Keyboard, Compass, Share2, Sparkles, Play, BookOpen, Settings2 } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { copyText } from '@/lib/files'
import { getPrefs } from '@/lib/prefs'
import '@/components/workspace/workspace.css'
import { MotionCtx, MotionToggle, Tip, initialMotion, saveMotion, type MotionLevel } from '@/components/workspace/kit'
import NodeCanvas, { type NodeRun } from '@/components/workspace/NodeCanvas'
import ListView from '@/components/workspace/ListView'
import { StepDrawer, StepPalette } from '@/components/workspace/Steps'
import FileTray from '@/components/workspace/FileTray'
import { Results, RunPanel, type RunInfo } from '@/components/workspace/Run'
import { MyRecipes, RecipeGallery, exportRecipe } from '@/components/workspace/Recipes'
import { HowItWorks, ShortcutSheet, Tour } from '@/components/workspace/Guide'
import { CATALOG, metaOf, accepts, kindOf, defaults } from './workspace/catalog'
import { IN, OUT, newId, topoOrder, relink, wouldCycle, validateRecipe, parseRecipeJson, encodeShare, decodeShare, history, push, undo, redo, type Graph, type GNode, type Recipe, type History } from './workspace/recipe'
import { RunControl, runGraph, autoConcurrency, type FileStatus, type Item, type Runner } from './workspace/engine'
import { rawRun } from './workspace/steps'
import { imagePool } from './workspace/pool'
import { BUILTINS, builtinRecipe, type Builtin } from './workspace/recipes'
import { expand, fromPaste, fromSamples, watchFolder, MAX_FILES, type InFile, type Watcher } from './workspace/inputs'

const RKEY = 'of:ws-recipes'
const media = (f: string) => `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}media/workspace/${f}`
const TAB = Math.random().toString(36).slice(2)
const IDLE: RunInfo = { phase: 'idle', overall: 0, eta: null, started: 0, ms: 0, done: 0, failed: 0, total: 0, log: [] }

function loadRecipes(): Recipe[] {
  const out: Recipe[] = []
  try {
    const raw = JSON.parse(localStorage.getItem(RKEY) || '[]')
    // carry over recipes saved by the older Workspace
    const old = JSON.parse(localStorage.getItem('of:recipes') || '[]')
    for (const r of [...(Array.isArray(raw) ? raw : []), ...(Array.isArray(old) ? old : [])]) { const c = validateRecipe(r); if (c.ok && !out.some((x) => x.name === c.recipe.name)) out.push(c.recipe) }
  } catch { /* storage blocked or damaged */ }
  return out.slice(0, 200)
}
const startGraph = () => { const g = builtinRecipe(BUILTINS[0]).graph; const q = getPrefs().imageQuality; g.nodes.forEach((n) => { if (n.step === 'img-convert' && q) n.params.quality = q }); return g }
const mem = () => { const pm = (performance as any).memory; return pm && pm.jsHeapSizeLimit ? pm.usedJSHeapSize / pm.jsHeapSizeLimit : null }
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) }

export default function Workspace() {
  useEffect(() => { document.title = 'Workspace, batch pipeline studio | OpenFile' }, [])
  const [motionLevel, setMotionLevel] = useState<MotionLevel>(initialMotion)
  const [hist, setHist] = useState<History<Graph>>(() => history(startGraph()))
  const graph = hist.present
  const [view, setView] = useState<'canvas' | 'list'>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'canvas'))
  const [snap, setSnap] = useState(true)
  const [sel, setSel] = useState<string | null>(null)
  const [selEdge, setSelEdge] = useState<number | null>(null)
  const [files, setFiles] = useState<InFile[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [unpack, setUnpack] = useState(true)
  const [status, setStatus] = useState<Record<string, FileStatus>>({})
  const [nodeRun, setNodeRun] = useState<NodeRun>({})
  const [info, setInfo] = useState<RunInfo>(IDLE)
  const [outputs, setOutputs] = useState<Item[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes)
  const [rname, setRname] = useState(BUILTINS[0].name)
  const [mirror, setMirror] = useState(false)
  const auto = useMemo(() => autoConcurrency(navigator.hardwareConcurrency, (navigator as any).deviceMemory), [])
  const [conc, setConc] = useState(auto)
  const [keep, setKeep] = useState(true)
  const [memory, setMemory] = useState<number | null>(null)
  const [tour, setTour] = useState(false)
  const [keys, setKeys] = useState(false)
  const [watcher, setWatcher] = useState<Watcher | null>(null)
  const ctrl = useRef<RunControl | null>(null)
  const effConc = useRef(conc)
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const builderRef = useRef<HTMLDivElement>(null)
  const chan = useRef<BroadcastChannel | null>(null)
  const remote = useRef(false)
  const busy = info.phase === 'running' || info.phase === 'paused'

  /* ---------- graph edits with undo ---------- */
  const commit = useCallback((fn: (g: Graph) => Graph, key?: string) => setHist((h) => push(h, fn(h.present), key)), [])
  const begin = useCallback(() => setHist((h) => ({ past: [...h.past, h.present].slice(-100), present: h.present, future: [] })), [])
  const live = useCallback((fn: (g: Graph) => Graph) => setHist((h) => ({ ...h, present: fn(h.present) })), [])
  const doUndo = () => setHist((h) => undo(h)), doRedo = () => setHist((h) => redo(h))

  const insertAfter = useCallback((anchorId: string | null, step: string, params?: Record<string, any>) => {
    const id = newId()
    commit((g) => {
      let anchor = anchorId && anchorId !== OUT ? g.nodes.find((n) => n.id === anchorId) : undefined
      if (!anchor) { const feed = g.edges.find(([, b]) => b === OUT)?.[0]; anchor = g.nodes.find((n) => n.id === (feed ?? IN))! }
      const nodes = g.nodes.map((n) => (n.x > anchor!.x + 10 && Math.abs(n.y - anchor!.y) < 110 ? { ...n, x: n.x + 240 } : n))
      nodes.push({ id, step, params: params ? { ...params } : defaults(step, metaOf(step)?.cat === 'image' && metaOf(step)?.params.some((p) => p.key === 'quality') && step !== 'img-compress' ? { quality: getPrefs().imageQuality || 82 } : {}), enabled: true, x: anchor!.x + 240, y: anchor!.y })
      const outs = g.edges.filter(([a]) => a === anchor!.id).map(([, b]) => b)
      const edges = g.edges.filter(([a]) => a !== anchor!.id) as [string, string][]
      edges.push([anchor!.id, id]); (outs.length ? outs : [OUT]).forEach((b) => edges.push([id, b]))
      return { nodes, edges }
    })
    setSel(id)
    return id
  }, [commit])
  const addStep = (step: string) => { insertAfter(sel, step); toast(`${metaOf(step)?.name} added`) }
  const removeNode = (id: string) => {
    if (id === IN || id === OUT) return
    commit((g) => {
      const ins = g.edges.filter(([, b]) => b === id).map(([a]) => a), outs = g.edges.filter(([a]) => a === id).map(([, b]) => b)
      const edges = g.edges.filter(([a, b]) => a !== id && b !== id) as [string, string][]
      for (const a of ins) for (const b of outs) if (!edges.some(([x, y]) => x === a && y === b)) edges.push([a, b])
      return { nodes: g.nodes.filter((n) => n.id !== id), edges }
    })
    if (sel === id) setSel(null)
  }
  const duplicate = (id: string) => { const n = graph.nodes.find((x) => x.id === id); if (n && metaOf(n.step)) insertAfter(id, n.step, n.params) }
  const toggle = (id: string, v: boolean) => commit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, enabled: v } : n)) }))
  const setParam = (id: string, k: string, v: any) => commit((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [k]: v } } : n)) }), id + ':' + k)
  const connect = (a: string, b: string) => {
    if (a === OUT || b === IN) return
    if (graph.edges.some(([x, y]) => x === a && y === b)) return
    if (wouldCycle(graph, a, b)) return toast('That link would loop back, so it was not added', 'error')
    commit((g) => ({ ...g, edges: [...g.edges, [a, b]] }))
  }
  const ordered = (g: Graph) => (topoOrder(g) ?? []).map((id) => g.nodes.find((n) => n.id === id)!).filter((n) => n && metaOf(n.step))
  const loadRecipe = (r: Recipe, note?: string) => { commit(() => r.graph); setRname(r.name); setSel(null); setSelEdge(null); setOutputs([]); setNodeRun({}); setInfo(IDLE); if (note) toast(note) }
  const openDrawer = (id: string) => { setSel(id); if (window.innerWidth < 1024) setTimeout(() => drawerRef.current?.scrollIntoView({ behavior: motionLevel === 'off' ? 'auto' : 'smooth', block: 'start' }), 60) }

  /* ---------- files ---------- */
  const addFiles = useCallback(async (list: InFile[]) => {
    if (!list.length) return
    const ex = await expand(list, unpack)
    setFiles((f) => { const room = MAX_FILES - f.length; if (ex.length > room) toast(`Only the first ${room} files were added (limit ${MAX_FILES})`, 'error'); return [...f, ...ex.slice(0, Math.max(0, room))] })
    setOutputs([])
    toast(`${ex.length} file${ex.length === 1 ? '' : 's'} added`)
  }, [unpack])
  const removeFiles = (ids: string[]) => { const s = new Set(ids); setFiles((f) => f.filter((x) => !s.has(x.id))); setPicked((p) => new Set([...p].filter((x) => !s.has(x)))) }
  const trySamples = async (names: string[]) => { try { const f = await fromSamples(names); setFiles([]); setStatus({}); await addFiles(f) } catch (e: any) { toast(e?.message || 'Could not load samples', 'error') } }

  /* ---------- run ---------- */
  const resolve = useCallback((n: GNode): Runner | undefined => {
    const m = metaOf(n.step); const run = rawRun(n.step)
    if (!m || !run) return undefined
    return { batch: !!m.batch, limit: m.exclusive ? 1 : undefined, accepts: (it) => accepts(m, kindOf(it.name, it.blob.type)), run: (items, onP, signal) => run(items, n.params, onP, signal) }
  }, [])

  const start = async (only?: InFile[]) => {
    if (busy) return
    const chosen = only ?? (picked.size ? files.filter((f) => picked.has(f.id)) : files)
    if (!chosen.length) return toast('Add some files first', 'error')
    if (!graph.nodes.some((n) => metaOf(n.step) && n.enabled)) return toast('Add at least one step', 'error')
    if (!graph.edges.some(([, b]) => b === OUT)) return toast('Link a step to the Output', 'error')
    const control = new RunControl(); ctrl.current = control
    const big = chosen.some((f) => f.blob.size > 200 * 1024 * 1024)
    effConc.current = big ? 1 : conc
    imagePool.resize(effConc.current)
    const t0 = performance.now()
    let done = 0, failed = 0
    const buf: Record<string, FileStatus> = {}, nodes: NodeRun = {}
    let raf = 0
    const flush = () => { raf = 0; setStatus((s) => ({ ...s, ...buf })); setNodeRun((r) => ({ ...r, ...nodes })) }
    const queue = () => { if (!raf) raf = requestAnimationFrame(flush) }
    setInfo({ ...IDLE, phase: 'running', started: Date.now(), total: chosen.length })
    if (!only) { setOutputs([]); setStatus({}) }
    setNodeRun({})
    const log: string[] = []
    try {
      const res = await runGraph({
        graph, control, resolve, keepSmaller: keep,
        inputs: chosen.map((f) => ({ id: f.id, name: f.name, blob: f.blob, src: f.id, path: f.path })),
        concurrency: () => effConc.current,
        guard: async () => {
          for (let i = 0; i < 40; i++) { const r = mem(); if (r != null) setMemory(r); if (r == null || r < 0.82) return; effConc.current = 1; await new Promise((ok) => setTimeout(ok, 350)) }
        },
        hooks: {
          onNode: (id, state, frac) => { nodes[id] = { state, frac }; queue() },
          onFile: (src, s) => { const prev = buf[src]?.state; buf[src] = s; if (s.state === 'done' && prev !== 'done') done++; if (s.state === 'error' && prev !== 'error') failed++; queue() },
          onProgress: (overall, eta) => setInfo((i) => (i.phase === 'running' || i.phase === 'paused' ? { ...i, overall, eta, done, failed } : i)),
          onLog: (l) => { log.push(l); setInfo((i) => ({ ...i, log: [...log] })) },
        },
      })
      flush()
      setOutputs((o) => (only ? [...o.filter((x) => !chosen.some((c) => c.id === x.src)), ...res.outputs] : res.outputs))
      const nFailed = Object.values({ ...(only ? status : {}), ...buf }).filter((s) => s.state === 'error').length
      setInfo((i) => ({ ...i, phase: res.cancelled ? 'cancelled' : 'done', overall: res.cancelled ? i.overall : 1, eta: 0, ms: performance.now() - t0, done: res.cancelled ? done : chosen.length - res.failed.size, failed: nFailed, log: [...log] }))
      if (res.cancelled) toast('Run cancelled')
      else toast(`Pipeline finished in ${((performance.now() - t0) / 1000).toFixed(1)}s${res.failed.size ? `, ${res.failed.size} failed` : ''}`, res.failed.size ? 'error' : undefined)
      if (!res.cancelled && res.outputs.length) setTimeout(() => document.querySelector('[data-tour="results"]')?.scrollIntoView({ behavior: motionLevel === 'off' ? 'auto' : 'smooth', block: 'nearest' }), 120)
    } catch (e: any) {
      flush()
      setInfo((i) => ({ ...i, phase: 'done', log: [...log, '✗ ' + (e?.message || e)] }))
      toast(e?.message || 'Pipeline failed', 'error')
    } finally { ctrl.current = null; if (raf) cancelAnimationFrame(raf) }
  }
  const pause = () => { ctrl.current?.pause(); setInfo((i) => ({ ...i, phase: 'paused' })) }
  const resume = () => { ctrl.current?.resume(); setInfo((i) => ({ ...i, phase: 'running' })) }
  const cancel = () => { ctrl.current?.cancel() }
  const retry = () => start(files.filter((f) => status[f.id]?.state === 'error'))
  useEffect(() => { effConc.current = conc; imagePool.resize(conc) }, [conc])

  /* ---------- recipes, sync, share ---------- */
  const persist = (list: Recipe[]) => { setRecipes(list); try { localStorage.setItem(RKEY, JSON.stringify(list)) } catch { toast('Could not save, browser storage is full or blocked', 'error') } chan.current?.postMessage({ t: 'recipes', from: TAB }) }
  const saveRecipe = () => { const name = rname.trim(); if (!name) return toast('Name your recipe', 'error'); const r: Recipe = { v: 1, name: name.slice(0, 80), graph }; persist([r, ...recipes.filter((x) => x.name !== r.name)]); toast('Recipe saved') }
  const share = async () => {
    const link = `${location.origin}${location.pathname}#${encodeShare({ v: 1, name: rname.trim() || 'Shared recipe', graph })}`
    if (await copyText(link)) toast('Recipe link copied. It holds the steps only, never your files.')
    else toast('Could not copy the link', 'error')
  }
  const importJson = (text: string) => { const c = parseRecipeJson(text); if (!c.ok) return toast(c.errors[0], 'error'); loadRecipe(c.recipe, `Imported "${c.recipe.name}"${c.warnings.length ? `. ${c.warnings[0]}` : ''}`) }

  useEffect(() => {
    const fromHash = () => {
      if (!/recipe=/.test(location.hash)) return
      const c = decodeShare(location.hash)
      if (c.ok) loadRecipe(c.recipe, `Loaded the shared recipe "${c.recipe.name}"`)
      else toast(c.errors[0], 'error')
      history_replace()
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const c = new BroadcastChannel('of-workspace'); chan.current = c
    c.onmessage = (ev) => {
      const d = ev.data; if (!d || typeof d !== 'object' || d.from === TAB) return
      if (d.t === 'recipes') setRecipes(loadRecipes())
      if (d.t === 'graph' && mirrorRef.current) { const v = validateRecipe(d.recipe); if (v.ok) { remote.current = true; setHist((h) => push(h, v.recipe.graph)); setRname(v.recipe.name) } }
    }
    const onStorage = (e: StorageEvent) => { if (e.key === RKEY) setRecipes(loadRecipes()) }
    window.addEventListener('storage', onStorage)
    return () => { c.close(); chan.current = null; window.removeEventListener('storage', onStorage) }
  }, [])
  const mirrorRef = useRef(mirror); mirrorRef.current = mirror
  useEffect(() => {
    if (!mirror) return
    if (remote.current) { remote.current = false; return }
    const t = setTimeout(() => chan.current?.postMessage({ t: 'graph', from: TAB, recipe: { v: 1, name: rname, graph } }), 150)
    return () => clearTimeout(t)
  }, [graph, mirror, rname])

  /* ---------- watch folder ---------- */
  const toggleWatch = async () => {
    if (watcher) { watcher.stop(); setWatcher(null); return }
    try { const w = await watchFolder((f) => addFiles(f)); setWatcher(w); toast(`Watching ${w.name}`) }
    catch (e: any) { if (e?.name !== 'AbortError') toast('Could not open that folder', 'error') }
  }
  useEffect(() => () => watcher?.stop(), [watcher])
  useEffect(() => () => imagePool.terminate(), [])

  /* ---------- keyboard and paste ---------- */
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key === 'Enter') { e.preventDefault(); start(); return }
    if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveRecipe(); return }
    if (typing(e.target) || tour) return
    if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); doUndo(); return }
    if (mod && ((e.shiftKey && (e.key === 'z' || e.key === 'Z')) || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); doRedo(); return }
    if (mod || e.altKey) return
    if (e.key === '?') { setKeys(true); return }
    if (e.key === 'Escape') { if (keys) setKeys(false); else if (busy) cancel(); else { setSel(null); setSelEdge(null) } return }
    if ((e.key === 'p' || e.key === 'P') && busy) { info.phase === 'paused' ? resume() : pause(); return }
    if (e.key === 'a' || e.key === 'A') { e.preventDefault(); searchRef.current?.focus(); return }
    if (e.key === 'v' || e.key === 'V') { setView((v) => (v === 'canvas' ? 'list' : 'canvas')); return }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selEdge != null) { commit((g) => ({ ...g, edges: g.edges.filter((_, i) => i !== selEdge) })); setSelEdge(null); return }
    if (!sel || !metaOf(graph.nodes.find((n) => n.id === sel)?.step ?? '')) return
    if (e.key === 'd' || e.key === 'D') duplicate(sel)
    if (e.key === 'e' || e.key === 'E') toggle(sel, !graph.nodes.find((n) => n.id === sel)!.enabled)
    const tgt = e.target as HTMLElement
    if ((e.key === 'Delete' || e.key === 'Backspace') && (tgt === document.body || tgt?.closest?.('.ws-list-row'))) removeNode(sel)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => keyRef.current(e)
    const p = (e: ClipboardEvent) => { if (typing(e.target)) return; const f = fromPaste(e); if (f.length) { e.preventDefault(); addFiles(f) } }
    window.addEventListener('keydown', k); window.addEventListener('paste', p)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('paste', p) }
  }, [addFiles])

  const selNode = graph.nodes.find((n) => n.id === sel && metaOf(n.step))
  const sample = useMemo(() => {
    if (!selNode) return undefined
    const m = metaOf(selNode.step)!
    const pool = picked.size ? files.filter((f) => picked.has(f.id)) : files
    return pool.find((f) => accepts(m, f.kind)) ?? pool[0]
  }, [selNode, files, picked])
  const inputsMap = useMemo(() => new Map(files.map((f) => [f.id, f])), [files])
  const runFiles = picked.size || files.length
  const stepCount = graph.nodes.filter((n) => metaOf(n.step)).length

  return (
    <MotionCtx.Provider value={motionLevel}>
      <MotionConfig reducedMotion={motionLevel === 'off' ? 'always' : 'never'}>
        <div className={cn('ws-root mx-auto max-w-[1500px] px-3 pb-20 pt-8 sm:px-6', `ws-m-${motionLevel}`)}>
          {/* hero */}
          <section className="grid items-center gap-8 lg:grid-cols-[1.05fr_1fr]">
            <div>
              <motion.div initial={motionLevel === 'off' ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent"><Workflow className="size-3.5" /> WORKSPACE STUDIO</motion.div>
              <motion.h1 initial={motionLevel === 'off' ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">Batch pipelines,<br /><span className="text-gradient">built like a studio.</span></motion.h1>
              <motion.p initial={motionLevel === 'off' ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-3 max-w-xl text-muted">Wire up steps for images, PDFs, video, audio, data and ZIPs on a canvas, then run them on hundreds of files at once. Branch, merge, pause, retry. All of it runs in this tab, nothing is uploaded.</motion.p>
              <motion.div initial={motionLevel === 'off' ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-5 flex flex-wrap gap-2">
                <Button size="lg" icon={<Sparkles className="size-4" />} onClick={() => { trySamples(BUILTINS[0].samples); builderRef.current?.scrollIntoView({ behavior: motionLevel === 'off' ? 'auto' : 'smooth' }) }}>Try it with samples</Button>
                <Button size="lg" variant="outline" icon={<Compass className="size-4" />} onClick={() => setTour(true)}>Take the tour</Button>
                <Button size="lg" variant="ghost" icon={<BookOpen className="size-4" />} onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: motionLevel === 'off' ? 'auto' : 'smooth' })}>How it works</Button>
              </motion.div>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted"><span><b className="text-fg">{CATALOG.length}</b> steps</span><span><b className="text-fg">{BUILTINS.length}</b> recipes</span><span><b className="text-fg">{auto}</b> {auto === 1 ? 'worker' : 'workers'} on this device</span><span>Works offline</span></div>
            </div>
            <motion.div initial={motionLevel === 'off' ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.6 }} className="relative">
              <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--accent)_28%,transparent),transparent)] blur-2xl" aria-hidden="true" />
              <div className="overflow-hidden rounded-3xl border border-border bg-black shadow-2xl">
                {motionLevel === 'off' ? <img src={media('hero.jpg')} alt="Files flowing through a pipeline of steps" className="aspect-video w-full object-cover" />
                  : <video autoPlay muted loop playsInline poster={media('hero.jpg')} className="aspect-video w-full object-cover" aria-label="Files flowing through a pipeline of steps"><source src={media('hero.mp4')} type="video/mp4" /></video>}
              </div>
              <div className="ws-float absolute -bottom-4 -left-3 hidden rounded-2xl border border-border bg-surface/90 px-3 py-2 text-xs shadow-xl backdrop-blur sm:block"><b className="text-success">−68%</b> on 248 photos</div>
              <div className="ws-float-2 absolute -right-3 -top-4 hidden rounded-2xl border border-border bg-surface/90 px-3 py-2 text-xs shadow-xl backdrop-blur sm:block">Branch · Merge · ZIP</div>
            </motion.div>
          </section>

          {/* toolbar */}
          <div ref={builderRef} className="scroll-mt-20" aria-hidden="true" />
          <div className="z-30 mt-10 md:sticky md:top-[72px] flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/85 p-2 shadow-lg backdrop-blur-xl">
            <div className="inline-flex rounded-xl border border-border bg-surface p-0.5" role="radiogroup" aria-label="Builder view">
              {(['canvas', 'list'] as const).map((v) => (
                <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn('relative flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer', view === v ? 'text-on-accent' : 'text-muted hover:text-fg')}>
                  {view === v && <motion.span layoutId="ws-view-pill" className="absolute inset-0 rounded-lg bg-gradient-brand" />}
                  <span className="relative flex items-center gap-1.5">{v === 'canvas' ? <Network className="size-3.5" /> : <LayoutList className="size-3.5" />}{v === 'canvas' ? 'Canvas' : 'List'}</span>
                </button>
              ))}
            </div>
            <div className="flex">
              <button onClick={doUndo} disabled={!hist.past.length} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35 cursor-pointer disabled:cursor-default"><Undo2 className="size-4" /></button>
              <button onClick={doRedo} disabled={!hist.future.length} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-35 cursor-pointer disabled:cursor-default"><Redo2 className="size-4" /></button>
            </div>
            <div className="hidden min-w-0 flex-1 truncate text-sm font-medium md:block"><span className="text-muted">Recipe:</span> {rname || 'Untitled'} <span className="text-xs text-muted">· {stepCount} steps</span></div>
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={share} aria-label="Copy share link" title="Copy share link" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><Share2 className="size-4" /></button>
              <button onClick={() => setKeys(true)} aria-label="Keyboard shortcuts (?)" title="Keyboard shortcuts (?)" className="hidden rounded-lg p-1.5 sm:block text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><Keyboard className="size-4" /></button>
              <button onClick={() => setTour(true)} aria-label="Start the tour" title="Start the tour" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg cursor-pointer"><Compass className="size-4" /></button>
              <MotionToggle value={motionLevel} onChange={(m) => { setMotionLevel(m); saveMotion(m) }} />
              <Button size="sm" icon={<Play className="size-3.5" />} loading={busy} onClick={() => start()} className="hidden sm:inline-flex">Run</Button>
            </div>
          </div>

          {/* studio */}
          <div className="mt-5 grid gap-5 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[290px_minmax(0,1fr)_340px]">
            <div className="space-y-3">
              <FileTray files={files} status={status} selected={picked} unpack={unpack} onUnpack={setUnpack} onAdd={addFiles} onRemove={removeFiles} onSelect={setPicked}
                onSamples={() => trySamples(['photo-dunes.jpg', 'photo-lagoon.jpg', 'photo-city.png', 'report.pdf', 'cities.csv', 'notes.txt'])} watching={watcher?.name ?? null} onWatch={toggleWatch} busy={busy} />
              <Tip id="paste">Press <kbd className="rounded border border-border px-1 font-mono">Ctrl</kbd> + <kbd className="rounded border border-border px-1 font-mono">V</kbd> anywhere on the page to paste a screenshot or text as a file.</Tip>
            </div>

            <div className="min-w-0 space-y-3">
              {view === 'canvas'
                ? <NodeCanvas graph={graph} selected={sel} selectedEdge={selEdge} run={nodeRun} running={busy} snap={snap} onSnap={setSnap}
                    onSelect={(id) => { setSel(id); if (id) setSelEdge(null) }} onSelectEdge={setSelEdge} onBegin={begin}
                    onMove={(id, x, y) => live((g) => ({ ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }))}
                    onConnect={connect} onDeleteEdge={(i) => { commit((g) => ({ ...g, edges: g.edges.filter((_, k) => k !== i) })); setSelEdge(null) }} onDeleteNode={removeNode}
                    onDropStep={(step, x, y) => { const id = newId(); commit((g) => ({ ...g, nodes: [...g.nodes, { id, step, params: defaults(step), enabled: true, x, y }] })); setSel(id); toast('Step added. Drag from a dot to link it.') }}
                    onOpen={openDrawer} />
                : <ListView graph={graph} run={nodeRun} selected={sel} onSelect={setSel} onOpen={openDrawer} onReorder={(o) => commit((g) => relink(g, o))} onToggle={toggle} onDuplicate={duplicate} onDelete={removeNode} onFlatten={() => commit((g) => relink(g, ordered(g)))} />}
              <Tip id="branch">To branch, drag from the dot on the right of a step to a second step. To merge, link two steps into one. Files a step does not understand pass straight through.</Tip>
              <StepPalette onAdd={addStep} searchRef={searchRef} />
            </div>

            <div className="space-y-4 md:col-span-2 lg:col-span-1">
              <div ref={drawerRef} className="scroll-mt-32">
                {selNode ? <StepDrawer graph={graph} node={selNode} sample={sample} onParam={(k, v) => setParam(selNode.id, k, v)} onToggle={(v) => toggle(selNode.id, v)} onDuplicate={() => duplicate(selNode.id)} onDelete={() => removeNode(selNode.id)} onClose={() => setSel(null)}
                  onLink={(to) => connect(selNode.id, to)} onUnlink={(to) => commit((g) => ({ ...g, edges: g.edges.filter(([a, b]) => !(a === selNode.id && b === to)) }))} canLink={(to) => !wouldCycle(graph, selNode.id, to)} />
                  : <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted" data-tour="drawer"><Settings2 className="mt-0.5 size-4 shrink-0 text-accent" /><div>Select a step to change its settings and see a live preview on one of your files.</div></div>}
              </div>
              <RunPanel info={info} files={runFiles} conc={conc} auto={auto} onConc={setConc} onAuto={() => setConc(auto)} keep={keep} onKeep={setKeep} memory={memory}
                onRun={() => start()} onPause={pause} onResume={resume} onCancel={cancel} onRetry={retry} />
              <MyRecipes name={rname} onName={setRname} recipes={recipes} onSave={saveRecipe} onLoad={(r) => loadRecipe(r, `Loaded "${r.name}"`)} onDelete={(n) => persist(recipes.filter((r) => r.name !== n))}
                onImport={importJson} onExport={(r) => exportRecipe(r ?? { v: 1, name: rname.trim() || 'recipe', graph })} onShare={share} mirror={mirror} onMirror={setMirror} />
            </div>
          </div>

          <div className="mt-6"><Results outputs={outputs} inputs={inputsMap} running={busy} /></div>

          <section className="mt-16" aria-labelledby="ws-gallery">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="ws-gallery" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Recipe gallery</h2><p className="mt-1 text-sm text-muted">{BUILTINS.length} ready pipelines. Use one as it is, or load it and change any step.</p></div></div>
            <div className="mt-5"><RecipeGallery onUse={(b: Builtin) => { loadRecipe(builtinRecipe(b), `Loaded "${b.name}"`); builderRef.current?.scrollIntoView({ behavior: motionLevel === 'off' ? 'auto' : 'smooth' }) }} onTry={(b) => { loadRecipe(builtinRecipe(b)); trySamples(b.samples); builderRef.current?.scrollIntoView({ behavior: motionLevel === 'off' ? 'auto' : 'smooth' }) }} /></div>
          </section>

          <section id="how" className="mt-16 scroll-mt-24" aria-labelledby="ws-how">
            <h2 id="ws-how" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
            <p className="mb-5 mt-1 text-sm text-muted">A 40 second tour of what happens when you press Run.</p>
            <HowItWorks />
          </section>

          <Tour open={tour} onClose={() => setTour(false)} />
          <ShortcutSheet open={keys} onClose={() => setKeys(false)} />
          <span className="sr-only" aria-live="polite">{info.phase === 'done' ? `Finished, ${outputs.length} files ready` : info.phase === 'running' ? `Running, ${Math.round(info.overall * 100)} percent` : ''}</span>
        </div>
      </MotionConfig>
    </MotionCtx.Provider>
  )
}

function history_replace() { try { window.history.replaceState(window.history.state, '', location.pathname + location.search) } catch { /* ignore */ } }

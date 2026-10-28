// "Drop anything": drag a file onto any page (or share it to the installed app) and OpenFile detects the
// type from its bytes and suggests the best tools from the registry. Element-level drop areas (tool
// Dropzones, the home Smart drop) keep working: they call preventDefault, and this layer skips those drops.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, FileSearch, AlertTriangle, ArrowRight, Upload, ShieldCheck, Sparkles } from 'lucide-react'
import { CATEGORIES, toolBySlug, type ToolMeta } from '@/tools/registry'
import { detectFile, toolsForFormat, type Detected } from '@/lib/detect'
import { setHandoff } from '@/lib/handoff'
import { dropBus, openDropSheet, remountBus } from '@/lib/ux'
import { formatBytes } from '@/lib/files'
import { currentToolSlug } from '@/lib/prefs'
import { getIcon } from './icons'
import { cn } from './ui'

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')

/** Mounted once in Layout. Shows a hint while dragging and opens the sheet on drop. */
export function GlobalDrop() {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  useEffect(() => {
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current++; setDragging(true) }
    const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDragging(false) }
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() } // allow dropping anywhere instead of the browser opening the file
    const drop = (e: DragEvent) => {
      depth.current = 0; setDragging(false)
      if (!hasFiles(e)) return
      if (e.defaultPrevented) return // a Dropzone or another drop area already took it
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) openDropSheet(files)
    }
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave); window.addEventListener('dragover', over); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop) }
  }, [])
  useEffect(() => { void consumeShared() }, [])
  return (
    <>
      <AnimatePresence>
        {dragging && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-[85]" aria-hidden="true">
            <div className="absolute inset-3 rounded-3xl border-2 border-dashed border-accent/70 drop-dash" />
            <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-accent/50 px-5 py-3 text-sm shadow-glow">
              <span className="grid size-9 place-items-center rounded-xl bg-gradient-brand"><Upload className="size-4" /></span>
              <span><span className="font-semibold">Drop anywhere</span><span className="block text-xs text-muted">OpenFile will find the right tool. Nothing is uploaded.</span></span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <DropSheet />
    </>
  )
}

/** Files shared from the OS share sheet (sw.js stores them) or opened with the installed app (launchQueue). */
async function consumeShared() {
  try {
    const url = new URL(location.href)
    if (url.searchParams.has('shared') && 'caches' in window) {
      const c = await caches.open('openfile-share')
      const keys = await c.keys()
      const files: File[] = []
      for (const k of keys) {
        const r = await c.match(k)
        if (!r) continue
        const blob = await r.blob()
        files.push(new File([blob], decodeURIComponent(r.headers.get('x-name') || 'shared-file'), { type: r.headers.get('content-type') || blob.type }))
        await c.delete(k)
      }
      url.searchParams.delete('shared')
      history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash)
      if (files.length) setTimeout(() => openDropSheet(files), 300)
    }
  } catch { /* ignore */ }
  const lq = (window as any).launchQueue
  if (lq?.setConsumer) {
    lq.setConsumer(async (params: { files?: { getFile: () => Promise<File> }[] }) => {
      if (!params.files?.length) return
      const files = await Promise.all(params.files.map((h) => h.getFile()))
      openDropSheet(files)
    })
  }
}

interface Analysis { files: File[]; detected: Detected[]; main: Detected; tools: ToolMeta[] }

export function DropSheet() {
  const [a, setA] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const here = currentToolSlug()
  useEffect(() => dropBus.on(async (files) => {
    setBusy(true)
    const detected = await Promise.all(files.map(detectFile))
    // the most common format wins for mixed drops
    const counts = new Map<string, number>(); detected.forEach((d) => counts.set(d.format, (counts.get(d.format) ?? 0) + 1))
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? ''
    const main = detected.find((d) => d.format === top) ?? detected[0]
    setA({ files, detected, main, tools: toolsForFormat(main.format, files[detected.indexOf(main)]).slice(0, 12) })
    setBusy(false)
  }), [])
  useEffect(() => { setA(null) }, [loc.pathname])
  useEffect(() => {
    if (!a) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setA(null) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [a])
  const open = (t: ToolMeta) => {
    if (!a) return
    setHandoff(a.files)
    if (t.slug === here) { remountBus.emit(); setA(null) } else nav('/' + t.slug)
  }
  const mixed = a ? new Set(a.detected.map((d) => d.format)).size > 1 : false
  const thisTool = here && a ? a.tools.find((t) => t.slug === here) : undefined
  return (
    <AnimatePresence>
      {(a || busy) && (
        <motion.div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setA(null)}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="drop-title" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-2xl scrollbar-thin sm:rounded-3xl sm:p-7">
            {!a ? <div className="flex items-center gap-3 py-10 text-muted"><FileSearch className="size-5 animate-pulse text-accent" /> Reading the file signature</div> : (
              <>
                <div className="flex items-start gap-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ background: (a.main.group?.color ?? '#F5A524') + '22', color: a.main.group?.color ?? '#F5A524' }}><Sparkles className="size-6" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold uppercase tracking-widest text-accent">Drop anything</div>
                    <h2 id="drop-title" className="mt-1 font-display text-xl font-bold sm:text-2xl">{a.files.length > 1 ? `${a.files.length} files, mostly ${a.main.label}` : a.main.label}</h2>
                    <p className="mt-1 text-sm text-muted">{a.main.source === 'signature' ? 'Detected from the bytes inside the file, not just its name.' : a.main.source === 'extension' ? 'Detected from the file name.' : 'Type reported by your browser.'} Still on your device.</p>
                  </div>
                  <button onClick={() => setA(null)} className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg cursor-pointer" aria-label="Close"><X className="size-5" /></button>
                </div>
                <ul className="mt-5 space-y-1.5">
                  {a.files.slice(0, 4).map((f, i) => { const d = a.detected[i]; return (
                    <li key={f.name + i} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-sm">
                      <span className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold" style={{ background: (d.group?.color ?? '#F5A524') + '22', color: d.group?.color ?? 'var(--accent)' }}>{d.format || '?'}</span>
                      <span className="min-w-0 flex-1 break-all">{f.name}</span><span className="shrink-0 text-xs text-muted">{formatBytes(f.size)}</span>
                    </li>) })}
                  {a.files.length > 4 && <li className="px-3 text-xs text-muted">and {a.files.length - 4} more</li>}
                </ul>
                {a.detected.some((d) => d.mismatch) && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" /><span>{a.detected.filter((d) => d.mismatch).map((d) => `The name says .${d.ext.toLowerCase()} but the content is ${d.format}.`).join(' ')} Tools below match the real content.</span></div>
                )}
                {mixed && <p className="mt-3 text-xs text-muted">Mixed types: suggestions follow the most common one. Tools that do not accept a file type will skip it.</p>}
                {thisTool && <button onClick={() => open(thisTool)} className="mt-5 flex min-h-12 w-full items-center justify-between rounded-2xl bg-gradient-brand px-4 text-left font-semibold cursor-pointer">Use in {thisTool.name}, the tool you have open <ArrowRight className="size-4" /></button>}
                <div className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted">{a.tools.length ? 'Best matching tools' : 'No tool reads this type yet'}</div>
                {a.tools.length ? (
                  <div className="mt-2 grid gap-2 @container sm:grid-cols-2">
                    {a.tools.filter((t) => t !== thisTool).slice(0, 10).map((t, i) => { const I = getIcon(t.icon); const col = CATEGORIES.find((c) => c.id === t.category)?.color; return (
                      <motion.button key={t.slug} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => open(t)}
                        className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface-2/30 px-3 py-2 text-left transition hover:border-accent/60 hover:bg-surface-2 cursor-pointer">
                        <span className="icon-pop grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: col + '1f', color: col }}><I className="size-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{t.name}</span><span className="line-clamp-1 text-xs text-muted">{t.desc}</span></span>
                        <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
                      </motion.button>) })}
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">{['hash-generator', 'base64', 'hex-viewer'].map(toolBySlug).filter(Boolean).map((t) => <button key={t!.slug} onClick={() => open(t!)} className="rounded-xl border border-border px-3 py-2 text-left text-sm hover:border-accent cursor-pointer">{t!.name}</button>)}</div>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted">
                  <span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-success" /> Files stay in this tab until a tool uses them</span>
                  {a.main.format && <Link to={`/tools?format=${a.main.format}`} onClick={() => setA(null)} className="link-underline text-accent">Every tool for .{a.main.format.toLowerCase()}</Link>}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// "Open with OpenFile": the target of the manifest file_handlers (and a page anyone can use).
// Files opened from the system arrive through launchQueue (handled in components/DropFlow.tsx), which shows the
// "Drop anything" sheet, or jumps straight to the best tool when "Open straight in the best tool" is on.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FolderOpen, Zap, ShieldCheck, MonitorDown } from 'lucide-react'
import { Dropzone, Switch } from '@/components/ui'
import { flag, setFlag, openDropSheet } from '@/lib/ux'
import { setPageMeta } from '@/lib/seo'

export default function Open() {
  const [auto, setAuto] = useState(() => flag('open-auto'))
  useEffect(() => { setPageMeta('Open a file | OpenFile', 'Open any file and OpenFile finds the right tool for it. Nothing is uploaded.') }, [])
  const fileHandling = typeof window !== 'undefined' && 'launchQueue' in window
  const pick = async () => {
    const w = window as any
    if (w.showOpenFilePicker) {
      try { const hs = await w.showOpenFilePicker({ multiple: true }); openDropSheet(await Promise.all(hs.map((h: any) => h.getFile()))) } catch { /* cancelled */ }
    } else document.getElementById('open-input')?.click()
  }
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-14 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent"><FolderOpen className="size-3.5" /> Open with OpenFile</div>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">Open a file, get the right tool.</h1>
        <p className="mt-3 text-lg text-muted">Pick or drop any file. OpenFile reads its type on your device and suggests the tools that fit. Nothing is uploaded.</p>
      </motion.div>
      <div className="mt-8"><Dropzone multiple onFiles={(f) => openDropSheet(f)} label="Drop files here or click to choose" sub="PDF, images, video, audio, documents, archives, data and more" /></div>
      <input id="open-input" type="file" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) openDropSheet(f); e.target.value = '' }} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={pick} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-brand px-5 font-semibold text-on-accent cursor-pointer"><FolderOpen className="size-4" /> Choose files</button>
        <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"><Switch checked={auto} onChange={(v) => { setAuto(v); setFlag('open-auto', v) }} label="Open straight in the best tool" /></div>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm"><Zap className="size-4 text-accent" /><div className="mt-2 font-semibold">From your system</div><p className="mt-1 text-muted">{fileHandling ? 'Installed? Right-click a file, Open with, OpenFile.' : 'Install OpenFile in Chrome or Edge to open files from your system.'}</p></div>
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm"><ShieldCheck className="size-4 text-success" /><div className="mt-2 font-semibold">Stays on device</div><p className="mt-1 text-muted">Type detection reads the first bytes locally.</p></div>
        <Link to="/install" className="rounded-2xl border border-border bg-surface p-4 text-sm transition hover:-translate-y-1 hover:border-accent"><MonitorDown className="size-4 text-teal" /><div className="mt-2 font-semibold">Get the app</div><p className="mt-1 text-muted">Web, Windows, macOS, Linux, Android and iPhone.</p></Link>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2, HardDrive, Download, Wifi, Cpu, Layers } from 'lucide-react'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { HEAVY_ENGINES } from '@/tools/guides'
import { setPageMeta } from '@/lib/seo'
import { formatBytes } from '@/lib/files'
import { useInstall, useOnline } from '@/lib/ux'
import { Button } from '@/components/ui'

export default function Status() {
  const [api, setApi] = useState<'checking' | 'ok' | 'static'>('checking')
  const [info, setInfo] = useState<any>(null)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [sw, setSw] = useState<'checking' | 'active' | 'none'>('checking')
  const online = useOnline()
  const install = useInstall()
  useEffect(() => {
    setPageMeta('Status | OpenFile', 'Server API status and the browser capabilities OpenFile can use on your device.')
    // The GitHub Pages build (base /OpenFile/) is static files only, so skip the probe there instead of logging a 404
    if (import.meta.env.BASE_URL !== '/') setApi('static')
    else fetch(`${import.meta.env.BASE_URL}api/health`).then((r) => r.ok ? r.json() : Promise.reject()).then((j) => { setInfo(j); setApi('ok') }).catch(() => setApi('static'))
    navigator.storage?.estimate?.().then((e) => setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => {})
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => setSw(r?.active ? 'active' : 'none')).catch(() => setSw('none')); else setSw('none')
  }, [])
  const caps: [string, boolean, string][] = [
    ['WebAssembly', typeof WebAssembly === 'object', 'Runs PDF, image and media engines'],
    ['WebGPU (fast AI)', 'gpu' in navigator, 'Speeds up on-device AI models'],
    ['Web Workers', typeof Worker !== 'undefined', 'Keeps the page smooth during heavy work'],
    ['OffscreenCanvas', typeof OffscreenCanvas !== 'undefined', 'Image work off the main thread'],
    ['MediaRecorder (recording)', typeof MediaRecorder !== 'undefined', 'Screen, webcam and voice recorders'],
    ['Screen capture', !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices, 'Screen Recorder'],
    ['Web Crypto', !!crypto?.subtle, 'Hashes, encryption and passwords'],
    ['Speech synthesis', 'speechSynthesis' in window, 'Text to speech with system voices'],
    ['Clipboard', !!navigator.clipboard, 'Copy results in one tap'],
    ['Face detection API', 'FaceDetector' in window, 'Automatic face blur (manual blur works everywhere)'],
    ['File System Access', 'showSaveFilePicker' in window, 'Save straight to a folder'],
    ['Share target', 'launchQueue' in window || 'share' in navigator, 'Send files to OpenFile from other apps'],
  ]
  const ok = caps.filter((c) => c[1]).length
  const pct = storage?.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
      <h1 className="font-display text-4xl font-bold">System status</h1>
      <p className="mt-2 text-muted">{TOOLS.length} tools online in {CATEGORIES.length} categories. Your browser supports {ok} of {caps.length} features OpenFile can use.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={api === 'checking' ? Loader2 : CheckCircle2} spin={api === 'checking'} title="Server API" value={api === 'ok' ? `Online, v${info?.version ?? '?'}` : api === 'static' ? 'Static mode' : 'Checking'} sub={api === 'ok' ? (info?.region ?? 'edge') : 'All tools still work locally'} />
        <Tile icon={Wifi} title="Connection" value={online ? 'Online' : 'Offline'} sub={online ? 'Engines can download when needed' : 'Cached tools keep working'} />
        <Tile icon={Layers} title="Offline cache" value={sw === 'active' ? 'Active' : sw === 'none' ? 'Not installed' : 'Checking'} sub="Service worker for offline use" />
        <Tile icon={HardDrive} title="Local storage" value={storage ? formatBytes(storage.usage) : 'Unknown'} sub={storage ? `${pct.toFixed(1)}% of ${formatBytes(storage.quota)}` : 'Browser does not report it'} />
      </div>
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <h2 className="mb-3 font-semibold">Browser features</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {caps.map(([n, has, why]) => <div key={n} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{has ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-muted" />}<span><span className="font-medium">{n}</span><span className="block text-xs text-muted">{why}</span></span></div>)}
          </div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Cpu className="size-4 text-accent" /> Tools per category</h2>
            <ul className="mt-3 space-y-2 text-sm">{CATEGORIES.map((c) => { const n = TOOLS.filter((t) => t.category === c.id).length; return <li key={c.id}><Link to={`/category/${c.id}`} className="flex items-center gap-2 hover:text-accent"><span className="size-2 rounded-full" style={{ background: c.color }} /><span className="flex-1">{c.name}</span><span className="font-mono text-xs text-muted">{n}</span></Link></li> })}</ul>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-semibold"><Download className="size-4 text-accent" /> Engines that download once</h2>
            <p className="mt-1 text-xs text-muted">Fetched the first time a tool needs them, then cached.</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">{HEAVY_ENGINES.map((e) => <li key={e} className="rounded-md border border-border px-2 py-1 text-xs">{e}</li>)}</ul>
            {!install.installed && install.canPrompt && <Button className="mt-4 w-full" icon={<Download className="size-4" />} onClick={() => void install.prompt()}>Install OpenFile</Button>}
          </div>
        </aside>
      </div>
    </div>
  )
}

function Tile({ icon: I, title, value, sub, spin }: { icon: typeof Cpu; title: string; value: string; sub: string; spin?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <I className={`size-5 text-accent ${spin ? 'animate-spin' : ''}`} />
      <div className="mt-3 text-xs uppercase tracking-wider text-muted">{title}</div>
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  )
}

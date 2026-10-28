import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { TOOLS } from '@/tools/registry'

export default function Status() {
  const [api, setApi] = useState<'checking' | 'ok' | 'static'>('checking')
  const [info, setInfo] = useState<any>(null)
  useEffect(() => {
    document.title = 'Status — OpenFile'
    fetch(`${import.meta.env.BASE_URL}api/health`).then((r) => r.ok ? r.json() : Promise.reject()).then((j) => { setInfo(j); setApi('ok') }).catch(() => setApi('static'))
  }, [])
  const caps: [string, boolean][] = [
    ['WebAssembly', typeof WebAssembly === 'object'],
    ['WebGPU (fast AI)', 'gpu' in navigator],
    ['Web Workers', typeof Worker !== 'undefined'],
    ['OffscreenCanvas', typeof OffscreenCanvas !== 'undefined'],
    ['MediaRecorder (recording)', typeof MediaRecorder !== 'undefined'],
    ['Screen capture', !!navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices],
    ['Web Crypto', !!crypto?.subtle],
    ['Speech synthesis', 'speechSynthesis' in window],
    ['Clipboard', !!navigator.clipboard],
    ['Face detection API', 'FaceDetector' in window],
  ]
  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold">System status</h1>
      <p className="mt-2 text-muted">{TOOLS.length} tools online. Here’s what your browser supports.</p>
      <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          {api === 'checking' ? <Loader2 className="size-5 animate-spin text-muted" /> : <CheckCircle2 className="size-5 text-success" />}
          <div><div className="font-medium">Server API</div><div className="text-sm text-muted">{api === 'ok' ? `Online · ${info?.region ?? 'edge'} · v${info?.version}` : api === 'static' ? 'Static mode (GitHub Pages) — all tools still work locally' : 'Checking…'}</div></div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {caps.map(([n, ok]) => <div key={n} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-muted" />}{n}</div>)}
      </div>
    </div>
  )
}

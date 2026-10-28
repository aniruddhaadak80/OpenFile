import { useEffect, useMemo, useState } from 'react'
import { Monitor, Cpu, Globe, Check, X } from 'lucide-react'
import { Segmented, Textarea, Badge, CopyButton, cn } from '@/components/ui'
import { Bar, KV, useLib } from './_b5/shell'

function gpuName() {
  try {
    const c = document.createElement('canvas'); const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return { vendor: '', renderer: '', version: 'WebGL not available' }
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return { vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION) }
  } catch { return { vendor: '', renderer: '', version: '' } }
}

const FEATURES: [string, () => boolean][] = [
  ['WebAssembly', () => typeof WebAssembly === 'object'], ['WebAssembly SIMD', () => { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])) } catch { return false } }],
  ['WebGPU', () => 'gpu' in navigator], ['WebGL 2', () => !!document.createElement('canvas').getContext('webgl2')], ['SharedArrayBuffer (threads)', () => typeof SharedArrayBuffer !== 'undefined' && (self as any).crossOriginIsolated === true],
  ['Service workers', () => 'serviceWorker' in navigator], ['Web workers', () => typeof Worker !== 'undefined'], ['IndexedDB', () => 'indexedDB' in window], ['File System Access', () => 'showOpenFilePicker' in window], ['Clipboard API', () => !!navigator.clipboard],
  ['Web Share', () => 'share' in navigator], ['WebRTC', () => 'RTCPeerConnection' in window], ['Media recorder', () => 'MediaRecorder' in window], ['Web Speech (TTS)', () => 'speechSynthesis' in window], ['WebCodecs', () => 'VideoEncoder' in window],
  ['OffscreenCanvas', () => 'OffscreenCanvas' in window], ['Bluetooth', () => 'bluetooth' in navigator], ['USB', () => 'usb' in navigator], ['Geolocation', () => 'geolocation' in navigator], ['Notifications', () => 'Notification' in window], ['Vibration', () => 'vibrate' in navigator], ['Touch input', () => 'ontouchstart' in window || navigator.maxTouchPoints > 0], ['Cookies enabled', () => navigator.cookieEnabled],
]

export default function DeviceInfo() {
  const UA = useLib('ua-parser-js', () => import('ua-parser-js'))
  const [mode, setMode] = useState<'mine' | 'parse'>('mine')
  const [ua, setUa] = useState(navigator.userAgent)
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => { const h = () => setSize({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, [])
  useEffect(() => {
    const n = navigator as any
    const o: Record<string, string> = {}
    n.storage?.estimate?.().then((e: any) => setExtra((x) => ({ ...x, Storage: `${(e.usage / 1048576).toFixed(1)} MB used of about ${(e.quota / 1073741824).toFixed(1)} GB` })))
    n.getBattery?.().then((b: any) => setExtra((x) => ({ ...x, Battery: `${Math.round(b.level * 100)}%${b.charging ? ', charging' : ''}` })))
    n.userAgentData?.getHighEntropyValues?.(['platformVersion', 'architecture', 'model', 'bitness', 'fullVersionList']).then((h: any) => setExtra((x) => ({ ...x, 'Client hints': [h.architecture && `${h.architecture} ${h.bitness ?? ''}-bit`, h.platformVersion && `platform ${h.platformVersion}`, h.model].filter(Boolean).join(', ') })))
    setExtra((x) => ({ ...x, ...o }))
  }, [])
  const parsed = useMemo(() => { if (!UA) return null; const P = (UA as any).UAParser ?? (UA as any).default; return new P(mode === 'mine' ? navigator.userAgent : ua).getResult() }, [UA, ua, mode])
  const gpu = useMemo(gpuName, [])
  const feats = useMemo(() => FEATURES.map(([n, f]) => { let ok = false; try { ok = f() } catch { ok = false } return [n, ok] as const }), [])
  const nav = navigator as any
  const conn = nav.connection
  const tz = Intl.DateTimeFormat().resolvedOptions()
  const report = parsed ? JSON.stringify({ userAgent: mode === 'mine' ? navigator.userAgent : ua, ...parsed, screen: mode === 'mine' ? `${screen.width}x${screen.height}@${devicePixelRatio}` : undefined }, null, 2) : ''

  return (
    <div className="space-y-4">
      <Bar><Segmented value={mode} onChange={setMode} options={[{ value: 'mine', label: 'This device' }, { value: 'parse', label: 'Parse a user agent' }]} /><span className="ml-auto"><CopyButton text={report} label="Copy report" /></span></Bar>
      {mode === 'parse' && <Textarea value={ua} onChange={(e) => setUa(e.target.value)} className="min-h-20" aria-label="User agent string" />}
      {parsed && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[['Browser', Globe, `${parsed.browser.name ?? 'Unknown'} ${parsed.browser.version ?? ''}`, parsed.engine.name ? `${parsed.engine.name} ${parsed.engine.version ?? ''}` : ''], ['Operating system', Monitor, `${parsed.os.name ?? 'Unknown'} ${parsed.os.version ?? ''}`, ''], ['Device', Cpu, [parsed.device.vendor, parsed.device.model].filter(Boolean).join(' ') || (parsed.device.type ? '' : 'Desktop or laptop'), parsed.device.type ?? ''], ['CPU architecture', Cpu, parsed.cpu.architecture ?? 'Unknown', '']].map(([l, I, v, s]: any) => (
            <div key={l} className="rounded-2xl border border-border bg-surface p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted"><I className="size-4" />{l}</div><div className="mt-1 text-lg font-semibold">{v}</div>{s && <div className="text-xs text-muted">{s}</div>}</div>
          ))}
        </div>
      )}
      {mode === 'mine' && <>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <KV label="Screen" value={`${screen.width} × ${screen.height}`} /><KV label="Window" value={`${size.w} × ${size.h}`} /><KV label="Pixel ratio" value={String(devicePixelRatio)} />
          <KV label="Color depth" value={`${screen.colorDepth}-bit`} /><KV label="CPU cores" value={String(navigator.hardwareConcurrency ?? 'n/a')} /><KV label="Memory (approx.)" value={nav.deviceMemory ? `${nav.deviceMemory} GB or more` : 'n/a'} />
          <KV label="GPU" value={gpu.renderer || 'n/a'} /><KV label="GPU vendor" value={gpu.vendor || 'n/a'} /><KV label="Graphics API" value={gpu.version} />
          <KV label="Languages" value={(navigator.languages ?? [navigator.language]).join(', ')} /><KV label="Time zone" value={`${tz.timeZone} (UTC${-new Date().getTimezoneOffset() >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(new Date().getTimezoneOffset()) / 60)).padStart(2, '0')}:${String(Math.abs(new Date().getTimezoneOffset()) % 60).padStart(2, '0')})`} /><KV label="Locale" value={tz.locale} />
          <KV label="Online" value={navigator.onLine ? 'Yes' : 'No'} /><KV label="Network" value={conn ? `${conn.effectiveType ?? ''}${conn.downlink ? `, about ${conn.downlink} Mbps` : ''}${conn.rtt ? `, ${conn.rtt} ms` : ''}` : 'n/a'} /><KV label="Dark mode preferred" value={matchMedia('(prefers-color-scheme: dark)').matches ? 'Yes' : 'No'} />
          <KV label="Reduced motion" value={matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Yes' : 'No'} /><KV label="Touch points" value={String(navigator.maxTouchPoints)} /><KV label="Do Not Track" value={nav.doNotTrack === '1' ? 'On' : 'Off'} />
          {Object.entries(extra).filter(([, v]) => v).map(([k, v]) => <KV key={k} label={k} value={v} />)}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Browser features</div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{feats.map(([n, ok]) => <div key={n} className={cn('flex items-center gap-2 text-sm', !ok && 'text-muted')}>{ok ? <Check className="size-4 text-success" /> : <X className="size-4 text-danger/70" />}{n}</div>)}</div>
        </div>
        <KV label="User agent" value={navigator.userAgent} />
      </>}
      {mode === 'parse' && parsed && <pre className="scrollbar-thin overflow-auto rounded-2xl border border-border bg-surface p-4 font-mono text-[12px]">{report}</pre>}
      <p className="text-xs text-muted">Nothing here is sent anywhere. <Badge color="#A3A3A3">TIP</Badge> Many browsers now freeze parts of the user agent for privacy, so client hints can be more exact.</p>
    </div>
  )
}

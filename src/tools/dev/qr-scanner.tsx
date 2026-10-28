import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, ImageIcon, CameraOff, ExternalLink, Wifi, Link2, Phone, Mail, MapPin, IndianRupee, Contact, Type, Flashlight, Trash2, ClipboardPaste, SwitchCamera, MessageSquare, CalendarDays } from 'lucide-react'
import { Button, Card, Dropzone, Segmented, CopyButton, Select, ErrorNote, Badge, cn } from '@/components/ui'
import { loadImage, createCanvas } from '@/lib/files'
import { toast } from '@/components/toast'

type Hit = { text: string; format: string; at: number; source: 'camera' | 'image' }

declare global { interface Window { BarcodeDetector?: any } }
const hasBD = () => typeof window !== 'undefined' && 'BarcodeDetector' in window

let detectorP: Promise<any> | null = null
function getDetector() {
  if (!detectorP) detectorP = (async () => {
    if (!hasBD()) return null
    try { const formats: string[] = await window.BarcodeDetector.getSupportedFormats(); if (!formats.length) return null; return new window.BarcodeDetector({ formats }) } catch { return null }
  })()
  return detectorP
}

/** Decode from a canvas-able source: BarcodeDetector first, then vendored jsQR fallback. */
async function decode(src: CanvasImageSource & { width?: number; height?: number }, w: number, h: number, thorough = false): Promise<{ text: string; format: string }[]> {
  const det = await getDetector()
  if (det) {
    try { const r = await det.detect(src); if (r.length) return r.map((x: any) => ({ text: x.rawValue, format: x.format })) } catch { /* fall through */ }
  }
  const { default: jsQR } = await import('./_dev/jsqr')
  const sizes = thorough ? [Math.min(1600, Math.max(w, h)), 1000, 700, 480] : [Math.min(800, Math.max(w, h))]
  for (const s of [...new Set(sizes)]) {
    const k = Math.min(1, s / Math.max(w, h))
    const { canvas, ctx } = createCanvas(w * k, h * k)
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const r = jsQR(d.data, canvas.width, canvas.height, { inversionAttempts: thorough ? 'attemptBoth' : 'dontInvert' })
    if (r?.data) return [{ text: r.data, format: 'qr_code' }]
  }
  return []
}

function classify(t: string) {
  if (/^WIFI:/i.test(t)) {
    const get = (k: string) => { const m = new RegExp(`[:;]${k}:((?:\\\\.|[^;])*)`, 'i').exec(t); return m ? m[1].replace(/\\(.)/g, '$1') : '' }
    return { kind: 'wifi' as const, icon: Wifi, label: 'Wi-Fi network', data: { ssid: get('S'), pass: get('P'), enc: get('T') || 'nopass', hidden: /H:true/i.test(t) } }
  }
  if (/^https?:\/\//i.test(t)) return { kind: 'url' as const, icon: Link2, label: 'Link', href: t }
  if (/^upi:\/\//i.test(t)) { const u = new URL(t); return { kind: 'upi' as const, icon: IndianRupee, label: 'UPI payment', href: t, data: { pa: u.searchParams.get('pa'), pn: u.searchParams.get('pn'), am: u.searchParams.get('am'), tn: u.searchParams.get('tn') } } }
  if (/^tel:/i.test(t)) return { kind: 'tel' as const, icon: Phone, label: 'Phone number', href: t }
  if (/^(mailto:|MATMSG:)/i.test(t)) return { kind: 'mail' as const, icon: Mail, label: 'Email', href: t.startsWith('MATMSG') ? `mailto:${/TO:([^;]*)/.exec(t)?.[1] ?? ''}` : t }
  if (/^(SMSTO|sms):/i.test(t)) { const [, num, msg] = t.split(':'); return { kind: 'sms' as const, icon: MessageSquare, label: 'SMS', href: `sms:${num}${msg ? `?body=${encodeURIComponent(msg)}` : ''}` } }
  if (/^geo:/i.test(t)) { const m = /^geo:([-\d.]+),([-\d.]+)/i.exec(t); return { kind: 'geo' as const, icon: MapPin, label: 'Location', href: m ? `https://www.openstreetmap.org/?mlat=${m[1]}&mlon=${m[2]}#map=16/${m[1]}/${m[2]}` : undefined } }
  if (/^BEGIN:VCARD/i.test(t)) return { kind: 'vcard' as const, icon: Contact, label: 'Contact card' }
  if (/^BEGIN:VEVENT|^BEGIN:VCALENDAR/i.test(t)) return { kind: 'event' as const, icon: CalendarDays, label: 'Calendar event' }
  if (/^(www\.)[^\s]+\.[a-z]{2,}/i.test(t)) return { kind: 'url' as const, icon: Link2, label: 'Link', href: 'https://' + t }
  return { kind: 'text' as const, icon: Type, label: 'Text' }
}

export default function QrScanner() {
  const [tab, setTab] = useState<'camera' | 'image'>('camera')
  const [hits, setHits] = useState<Hit[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [bd, setBd] = useState<boolean | null>(null)
  useEffect(() => { getDetector().then((d) => setBd(!!d)) }, [])

  const add = useCallback((text: string, format: string, source: Hit['source']) => {
    setHits((h) => (h[0]?.text === text ? h : [{ text, format, at: Date.now(), source }, ...h.filter((x) => x.text !== text)].slice(0, 30)))
  }, [])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={tab} onChange={(v) => { setTab(v); setErr(null) }} options={[{ value: 'camera', label: <span className="flex items-center gap-1.5"><Camera className="size-3.5" />Camera</span> }, { value: 'image', label: <span className="flex items-center gap-1.5"><ImageIcon className="size-3.5" />Image</span> }]} />
          {bd !== null && <span className="text-xs text-muted">{bd ? 'Using native BarcodeDetector (QR + barcodes)' : 'Using built-in QR decoder (QR codes only in this browser)'}</span>}
        </div>
        {tab === 'camera' ? <CameraScan onHit={add} setErr={setErr} /> : <ImageScan onHit={add} setErr={setErr} />}
        <ErrorNote error={err} />
      </div>
      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-wide text-muted">Results</div>{hits.length > 0 && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setHits([])}>Clear</Button>}</div>
        {hits.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Scanned codes appear here with quick actions.</div>}
        <AnimatePresence initial={false}>{hits.map((h) => <ResultItem key={h.at + h.text} hit={h} />)}</AnimatePresence>
      </aside>
    </div>
  )
}

function ResultItem({ hit }: { hit: Hit }) {
  const c = classify(hit.text)
  const Icon = c.icon
  return (
    <motion.div layout initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-lg bg-accent/15 text-accent"><Icon className="size-4" /></div>
          <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{c.label}</div><div className="text-[11px] text-muted">{new Date(hit.at).toLocaleTimeString()} · {hit.source}</div></div>
          <Badge>{hit.format.replace(/_/g, ' ').toUpperCase()}</Badge>
        </div>
        {c.kind === 'wifi' && c.data ? (
          <div className="grid grid-cols-[80px_1fr] gap-1 rounded-lg bg-surface-2/60 p-3 text-sm">
            <span className="text-muted">Network</span><span className="break-all font-medium">{c.data.ssid}{c.data.hidden && <span className="ml-1 text-xs text-muted">(hidden)</span>}</span>
            <span className="text-muted">Security</span><span>{c.data.enc === 'nopass' ? 'Open' : c.data.enc}</span>
            {c.data.pass && <><span className="text-muted">Password</span><span className="break-all font-mono">{c.data.pass}</span></>}
          </div>
        ) : c.kind === 'upi' && c.data ? (
          <div className="grid grid-cols-[80px_1fr] gap-1 rounded-lg bg-surface-2/60 p-3 text-sm">
            <span className="text-muted">Pay to</span><span className="break-all font-medium">{c.data.pn || '—'}</span>
            <span className="text-muted">UPI ID</span><span className="break-all font-mono">{c.data.pa}</span>
            {c.data.am && <><span className="text-muted">Amount</span><span>₹{c.data.am}</span></>}
            {c.data.tn && <><span className="text-muted">Note</span><span>{c.data.tn}</span></>}
          </div>
        ) : <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2/60 p-3 font-mono text-[13px]">{hit.text}</pre>}
        <div className="flex flex-wrap gap-2">
          {'href' in c && c.href && <Button size="sm" icon={<ExternalLink className="size-4" />} onClick={() => window.open(c.href, c.kind === 'url' || c.kind === 'geo' ? '_blank' : '_self', 'noopener')}>{c.kind === 'url' ? 'Open link' : c.kind === 'upi' ? 'Pay with UPI app' : c.kind === 'tel' ? 'Call' : c.kind === 'geo' ? 'Open map' : c.kind === 'sms' ? 'Send SMS' : 'Open'}</Button>}
          {c.kind === 'wifi' && c.data?.pass && <CopyButton text={c.data.pass} label="Copy password" />}
          {c.kind === 'vcard' && <Button size="sm" variant="outline" icon={<Contact className="size-4" />} onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([hit.text], { type: 'text/vcard' })); a.download = 'contact.vcf'; a.click() }}>Save contact</Button>}
          {c.kind === 'event' && <Button size="sm" variant="outline" icon={<CalendarDays className="size-4" />} onClick={() => { const body = /BEGIN:VCALENDAR/i.test(hit.text) ? hit.text : `BEGIN:VCALENDAR\nVERSION:2.0\n${hit.text}\nEND:VCALENDAR`; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' })); a.download = 'event.ics'; a.click() }}>Add to calendar</Button>}
          <CopyButton text={hit.text} label={c.kind === 'wifi' ? 'Copy raw' : 'Copy'} />
        </div>
        {c.kind === 'wifi' && <p className="text-[11px] text-muted">Browsers can't join Wi-Fi directly — copy the password, or scan this code with your phone's camera app to connect in one tap.</p>}
      </Card>
    </motion.div>
  )
}

function CameraScan({ onHit, setErr }: { onHit: (t: string, f: string, s: 'camera') => void; setErr: (e: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const raf = useRef<number>(0)
  const [on, setOn] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [devId, setDevId] = useState('')
  const [torch, setTorch] = useState<boolean | null>(null)
  const [flash, setFlash] = useState(false)
  const last = useRef({ t: '', at: 0 })

  const stop = useCallback(() => { cancelAnimationFrame(raf.current); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); setTorch(null) }, [])
  useEffect(() => stop, [stop])

  const start = async (id = devId) => {
    setErr(null)
    if (!navigator.mediaDevices?.getUserMedia) { setErr('Camera access is not available here. Use HTTPS and a modern browser, or switch to the Image tab.'); return }
    stop()
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      stream.current = s
      const v = video.current!; v.srcObject = s; await v.play()
      setOn(true)
      const track = s.getVideoTracks()[0]
      const caps: any = track.getCapabilities?.() ?? {}
      setTorch(caps.torch ? false : null)
      navigator.mediaDevices.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === 'videoinput')))
      let busy = false, lastRun = 0
      const loop = async (ts: number) => {
        raf.current = requestAnimationFrame(loop)
        if (busy || ts - lastRun < 120 || v.readyState < 2) return
        busy = true; lastRun = ts
        try {
          const r = await decode(v, v.videoWidth, v.videoHeight)
          if (r.length) {
            const now = Date.now()
            if (r[0].text !== last.current.t || now - last.current.at > 3000) {
              last.current = { t: r[0].text, at: now }
              r.forEach((x) => onHit(x.text, x.format, 'camera'))
              setFlash(true); setTimeout(() => setFlash(false), 350); navigator.vibrate?.(60)
            }
          }
        } finally { busy = false }
      }
      raf.current = requestAnimationFrame(loop)
    } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, or use the Image tab.' : e?.name === 'NotFoundError' ? 'No camera found on this device. Use the Image tab instead.' : 'Could not start the camera: ' + (e?.message ?? e))
    }
  }

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0]; if (!track) return
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as any] }); setTorch(!torch) } catch { toast('Torch not supported', 'error') }
  }

  return (
    <Card className="space-y-3 p-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black sm:aspect-video">
        <video ref={video} playsInline muted className={cn('size-full object-cover', !on && 'hidden')} />
        {on && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className={cn('relative aspect-square w-[58%] max-w-80 rounded-3xl transition-all', flash ? 'shadow-[0_0_0_9999px_rgba(34,197,94,.35)]' : 'shadow-[0_0_0_9999px_rgba(0,0,0,.45)]')}>
              {['left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl'].map((c) => <div key={c} className={cn('absolute size-10 border-white', c)} />)}
              <motion.div className="absolute inset-x-4 h-0.5 bg-gradient-to-r from-transparent via-[#22d3ee] to-transparent" animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
            </div>
          </div>
        )}
        {!on && (
          <div className="absolute inset-0 grid place-items-center text-center text-white/80">
            <div className="space-y-3 p-6"><Camera className="mx-auto size-10 opacity-70" /><div className="text-sm">Point your camera at a QR code or barcode</div>
              <Button onClick={() => start()} icon={<Camera className="size-4" />}>Start camera</Button></div>
          </div>
        )}
      </div>
      {on && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="danger" size="sm" icon={<CameraOff className="size-4" />} onClick={stop}>Stop</Button>
          {torch !== null && <Button variant={torch ? 'primary' : 'outline'} size="sm" icon={<Flashlight className="size-4" />} onClick={toggleTorch}>Torch</Button>}
          {devices.length > 1 && <>
            <Button variant="outline" size="sm" icon={<SwitchCamera className="size-4" />} onClick={() => { const i = devices.findIndex((d) => d.deviceId === devId); const n = devices[(i + 1) % devices.length]; setDevId(n.deviceId); start(n.deviceId) }}>Flip</Button>
            <Select value={devId} onChange={(v) => { setDevId(v); start(v) }} options={[{ value: '', label: 'Default camera' }, ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` }))]} className="h-8 max-w-56 text-xs" />
          </>}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-success"><span className="size-2 animate-pulse rounded-full bg-success" />Scanning…</span>
        </div>
      )}
    </Card>
  )
}

function ImageScan({ onHit, setErr }: { onHit: (t: string, f: string, s: 'image') => void; setErr: (e: string | null) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (f: Blob) => {
    setErr(null); setBusy(true)
    const u = URL.createObjectURL(f); setUrl(u)
    try {
      const img = await loadImage(u)
      const r = await decode(img, img.naturalWidth, img.naturalHeight, true)
      if (!r.length) setErr('No QR code found. Try a sharper, well-lit image where the code fills more of the frame.')
      else { r.forEach((x) => onHit(x.text, x.format, 'image')); toast(`Found ${r.length} code${r.length > 1 ? 's' : ''}`) }
    } catch (e: any) { setErr(e?.message ?? String(e)) } finally { setBusy(false) }
  }, [onHit, setErr])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/')); if (f) run(f) }
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste)
  }, [run])

  const pasteBtn = async () => {
    try { const items = await navigator.clipboard.read(); for (const it of items) { const t = it.types.find((x) => x.startsWith('image/')); if (t) { run(await it.getType(t)); return } } toast('No image on the clipboard', 'error') }
    catch { toast('Press Ctrl/⌘+V to paste an image', 'info') }
  }

  return (
    <div className="space-y-3">
      <Dropzone onFiles={(f) => run(f[0])} accept="image/*" label="Drop a screenshot or photo with a QR code" sub="Or paste an image with Ctrl/⌘+V. Decoded locally — nothing is uploaded." compact={!!url} />
      <div className="flex gap-2"><Button size="sm" variant="outline" icon={<ClipboardPaste className="size-4" />} onClick={pasteBtn}>Paste image</Button></div>
      {url && <div className="checker relative overflow-hidden rounded-2xl border border-border"><img src={url} alt="" className={cn('mx-auto max-h-[420px] object-contain transition', busy && 'opacity-50 blur-[1px]')} />{busy && <div className="shimmer absolute inset-0" />}</div>}
    </div>
  )
}

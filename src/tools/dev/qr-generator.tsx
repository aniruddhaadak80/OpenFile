import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link2, Type, Wifi, Contact, Mail, MessageSquare, Phone, MapPin, IndianRupee, CalendarDays, Download, Copy, ImagePlus, X, AlertTriangle } from 'lucide-react'
import { Button, Card, Field, Input, Textarea, Select, Segmented, Slider, Switch, CopyButton, cn } from '@/components/ui'
import { downloadBlob, canvasToBlob, readDataUrl, loadImage } from '@/lib/files'
import { toast } from '@/components/toast'
import { useLib, downloadText } from './_dev/kit'
import { drawQr, qrSvg, type ModuleStyle, type EyeStyle } from './_dev/qrRender'

type Kind = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'sms' | 'phone' | 'geo' | 'upi' | 'event'
const KINDS: { v: Kind; label: string; icon: any }[] = [
  { v: 'url', label: 'URL', icon: Link2 }, { v: 'text', label: 'Text', icon: Type }, { v: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { v: 'vcard', label: 'vCard', icon: Contact }, { v: 'email', label: 'Email', icon: Mail }, { v: 'sms', label: 'SMS', icon: MessageSquare },
  { v: 'phone', label: 'Phone', icon: Phone }, { v: 'geo', label: 'Location', icon: MapPin }, { v: 'upi', label: 'UPI', icon: IndianRupee }, { v: 'event', label: 'Event', icon: CalendarDays },
]

const wifiEsc = (s: string) => s.replace(/([\\;,:"])/g, '\\$1')
const vEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
const icsDate = (s: string) => (s ? s.replace(/[-:]/g, '').slice(0, 13) + '00' : '')

type F = Record<string, string>
function payload(k: Kind, f: F): string {
  switch (k) {
    case 'url': { const u = (f.url ?? '').trim(); return !u ? '' : /^[a-z][\w+.-]*:/i.test(u) ? u : 'https://' + u }
    case 'text': return f.text ?? ''
    case 'wifi': return f.ssid ? `WIFI:T:${f.enc || 'WPA'};S:${wifiEsc(f.ssid)};${f.enc !== 'nopass' ? `P:${wifiEsc(f.pass ?? '')};` : ''}${f.hidden === '1' ? 'H:true;' : ''};` : ''
    case 'vcard': {
      if (!f.first && !f.last && !f.org) return ''
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(f.last ?? '')};${vEsc(f.first ?? '')};;;`, `FN:${vEsc([f.first, f.last].filter(Boolean).join(' ') || f.org || '')}`]
      if (f.org) L.push(`ORG:${vEsc(f.org)}`); if (f.title) L.push(`TITLE:${vEsc(f.title)}`)
      if (f.tel) L.push(`TEL;TYPE=CELL:${f.tel}`); if (f.email) L.push(`EMAIL:${f.email}`); if (f.web) L.push(`URL:${f.web}`)
      if (f.addr) L.push(`ADR:;;${vEsc(f.addr)};;;;`); if (f.note) L.push(`NOTE:${vEsc(f.note)}`)
      L.push('END:VCARD'); return L.join('\n')
    }
    case 'email': { if (!f.to) return ''; const q = new URLSearchParams(); if (f.subject) q.set('subject', f.subject); if (f.body) q.set('body', f.body); const qs = q.toString().replace(/\+/g, '%20'); return `mailto:${f.to}${qs ? '?' + qs : ''}` }
    case 'sms': return f.num ? `SMSTO:${f.num}:${f.msg ?? ''}` : ''
    case 'phone': return f.tel ? `tel:${f.tel.replace(/[^\d+*#]/g, '')}` : ''
    case 'geo': return f.lat && f.lng ? `geo:${f.lat},${f.lng}${f.q ? '?q=' + encodeURIComponent(f.q) : ''}` : ''
    case 'upi': {
      if (!f.pa) return ''
      const p: string[] = [`pa=${encodeURIComponent(f.pa.trim())}`]
      if (f.pn) p.push(`pn=${encodeURIComponent(f.pn)}`); if (f.am) p.push(`am=${Number(f.am).toFixed(2)}`); p.push('cu=INR'); if (f.tn) p.push(`tn=${encodeURIComponent(f.tn)}`)
      return `upi://pay?${p.join('&')}`
    }
    case 'event': {
      if (!f.title) return ''
      const L = ['BEGIN:VEVENT', `SUMMARY:${vEsc(f.title)}`]
      if (f.start) L.push(`DTSTART:${icsDate(f.start)}`); if (f.end) L.push(`DTEND:${icsDate(f.end)}`)
      if (f.loc) L.push(`LOCATION:${vEsc(f.loc)}`); if (f.desc) L.push(`DESCRIPTION:${vEsc(f.desc)}`)
      L.push('END:VEVENT'); return L.join('\n')
    }
  }
}

export default function QrGenerator() {
  const QR = useLib('qrcode', () => import('qrcode').then((m: any) => (m.create ? m : m.default) as typeof import('qrcode')))
  const [kind, setKind] = useState<Kind>('url')
  const [fields, setFields] = useState<Record<Kind, F>>({ url: { url: 'https://openfile.app' }, text: {}, wifi: { enc: 'WPA' }, vcard: {}, email: {}, sms: {}, phone: {}, geo: {}, upi: {}, event: {} } as Record<Kind, F>)
  const [fg, setFg] = useState('#111827'); const [bg, setBg] = useState('#ffffff'); const [eyeColor, setEyeColor] = useState('#111827'); const [linkEye, setLinkEye] = useState(true)
  const [transparent, setTransparent] = useState(false)
  const [ec, setEc] = useState<'L' | 'M' | 'Q' | 'H'>('M')
  const [margin, setMargin] = useState(3)
  const [size, setSize] = useState(1024)
  const [style, setStyle] = useState<ModuleStyle>('rounded')
  const [eye, setEye] = useState<EyeStyle>('rounded')
  const [logo, setLogo] = useState<{ img: HTMLImageElement; url: string } | null>(null)
  const [logoScale, setLogoScale] = useState(22)
  const canvas = useRef<HTMLCanvasElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)

  const f = fields[kind]
  const set = (k: string, v: string) => setFields((s) => ({ ...s, [kind]: { ...s[kind], [k]: v } }))
  const text = payload(kind, f)

  const qr = useMemo(() => {
    if (!QR || !text) return { m: null, err: null as string | null }
    try { const c = QR.create(text, { errorCorrectionLevel: logo && (ec === 'L' || ec === 'M') ? 'H' : ec }); return { m: c.modules, ver: c.version, err: null } }
    catch (e: any) { return { m: null, err: e?.message?.includes('too big') || e?.message?.includes('amount of data') ? 'Too much data for a QR code, shorten the content or lower error correction.' : e?.message } }
  }, [QR, text, ec, logo])

  const opts = { size, margin, fg, bg, eyeColor: linkEye ? fg : eyeColor, transparent, style, eye, logo: logo?.img ?? null, logoDataUrl: logo?.url ?? null, logoScale: logoScale / 100 }
  useEffect(() => { if (qr.m && canvas.current) drawQr(canvas.current, qr.m as any, opts) }, [qr, size, margin, fg, bg, eyeColor, linkEye, transparent, style, eye, logo, logoScale])

  const contrastLow = useMemo(() => { const lum = (h: string) => { const n = parseInt(h.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }; const a = lum(fg), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 3 || a > b }, [fg, bg])

  const name = `qr-${kind}`
  const png = async () => { if (!canvas.current) return; downloadBlob(await canvasToBlob(canvas.current), name + '.png') }
  const svg = () => { if (qr.m) downloadText(qrSvg(qr.m as any, opts), name + '.svg', 'image/svg+xml') }
  const copyImg = async () => {
    try { const b = await canvasToBlob(canvas.current!); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('QR image copied') }
    catch { toast('Your browser blocked image copy, use Download instead', 'error') }
  }
  const onLogo = async (file?: File) => { if (!file) return; const url = await readDataUrl(file); const img = await loadImage(url); setLogo({ img, url }); if (ec === 'L' || ec === 'M') setEc('H') }

  const I = (k: string, label: string, ph?: string, type = 'text') => <Field label={label}><Input type={type} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} /></Field>

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {KINDS.map(({ v, label, icon: Ic }) => (
            <button key={v} onClick={() => setKind(v)} className={cn('flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition cursor-pointer', kind === v ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-muted hover:text-fg')}>
              <Ic className="size-4" />{label}
            </button>
          ))}
        </div>

        <Card className="space-y-4">
          {kind === 'url' && I('url', 'Website URL', 'https://example.com')}
          {kind === 'text' && <Field label="Text"><Textarea value={f.text ?? ''} onChange={(e) => set('text', e.target.value)} placeholder="Any text…" className="min-h-28 font-sans" /></Field>}
          {kind === 'wifi' && <div className="grid gap-3 sm:grid-cols-2">
            {I('ssid', 'Network name (SSID)', 'MyHomeWiFi')}
            <Field label="Security"><Select value={f.enc || 'WPA'} onChange={(v) => set('enc', v)} options={[{ value: 'WPA', label: 'WPA / WPA2 / WPA3' }, { value: 'WEP', label: 'WEP' }, { value: 'nopass', label: 'None (open)' }]} /></Field>
            {f.enc !== 'nopass' && I('pass', 'Password', '••••••••')}
            <div className="flex items-end pb-2"><Switch checked={f.hidden === '1'} onChange={(v) => set('hidden', v ? '1' : '')} label="Hidden network" /></div>
          </div>}
          {kind === 'vcard' && <div className="grid gap-3 sm:grid-cols-2">
            {I('first', 'First name')}{I('last', 'Last name')}{I('org', 'Company')}{I('title', 'Job title')}{I('tel', 'Phone', '+91 98765 43210', 'tel')}{I('email', 'Email', '', 'email')}{I('web', 'Website')}{I('addr', 'Address')}
            <div className="sm:col-span-2">{I('note', 'Note')}</div>
          </div>}
          {kind === 'email' && <div className="grid gap-3">{I('to', 'To', 'name@example.com', 'email')}{I('subject', 'Subject')}<Field label="Body"><Textarea value={f.body ?? ''} onChange={(e) => set('body', e.target.value)} className="min-h-20 font-sans" /></Field></div>}
          {kind === 'sms' && <div className="grid gap-3">{I('num', 'Phone number', '+91…', 'tel')}<Field label="Message"><Textarea value={f.msg ?? ''} onChange={(e) => set('msg', e.target.value)} className="min-h-20 font-sans" /></Field></div>}
          {kind === 'phone' && I('tel', 'Phone number', '+91 98765 43210', 'tel')}
          {kind === 'geo' && <div className="grid gap-3 sm:grid-cols-2">{I('lat', 'Latitude', '22.4246')}{I('lng', 'Longitude', '87.3195')}<div className="sm:col-span-2">{I('q', 'Label (optional)')}</div>
            <div className="sm:col-span-2"><Button size="sm" variant="outline" icon={<MapPin className="size-4" />} onClick={() => navigator.geolocation?.getCurrentPosition((p) => { set('lat', p.coords.latitude.toFixed(6)); setFields((s) => ({ ...s, geo: { ...s.geo, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) } })) }, () => toast('Location permission denied', 'error'))}>Use my location</Button></div></div>}
          {kind === 'upi' && <div className="grid gap-3 sm:grid-cols-2">{I('pa', 'UPI ID (VPA)', 'name@okhdfcbank')}{I('pn', 'Payee name')}{I('am', 'Amount (₹, optional)', '499', 'number')}{I('tn', 'Note (optional)', 'Order #123')}
            <p className="text-xs text-muted sm:col-span-2">Scannable by GPay, PhonePe, Paytm, BHIM and any UPI app. Leave amount blank to let the payer enter it.</p></div>}
          {kind === 'event' && <div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2">{I('title', 'Event title')}</div>{I('start', 'Starts', '', 'datetime-local')}{I('end', 'Ends', '', 'datetime-local')}<div className="sm:col-span-2">{I('loc', 'Location')}</div><div className="sm:col-span-2">{I('desc', 'Description')}</div></div>}
        </Card>

        <Card className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Module style</div>
              <Segmented value={style} onChange={setStyle} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'dots', label: 'Dots' }, { value: 'classy', label: 'Classy' }]} /></div>
            <div><div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Corner eyes</div>
              <Segmented value={eye} onChange={setEye} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'circle', label: 'Circle' }]} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ColorField label="Foreground" value={fg} onChange={setFg} />
            <ColorField label="Background" value={bg} onChange={setBg} disabled={transparent} />
            <ColorField label="Eye color" value={linkEye ? fg : eyeColor} onChange={(v) => { setLinkEye(false); setEyeColor(v) }} />
            <div className="flex flex-col justify-end gap-2 pb-1"><Switch checked={transparent} onChange={setTransparent} label="Transparent" /><Switch checked={linkEye} onChange={setLinkEye} label="Same eyes" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Error correction"><Select value={ec} onChange={setEc} options={[{ value: 'L', label: 'L · 7%' }, { value: 'M', label: 'M · 15%' }, { value: 'Q', label: 'Q · 25%' }, { value: 'H', label: 'H · 30%' }]} /></Field>
            <Slider label="Margin" value={margin} onChange={setMargin} min={0} max={10} suffix=" mod" />
            <Slider label="Export size" value={size} onChange={setSize} min={128} max={4096} step={64} suffix=" px" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={logoInput} type="file" accept="image/*" hidden onChange={(e) => { onLogo(e.target.files?.[0]); e.target.value = '' }} />
            {logo ? (
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <img src={logo.url} alt="" className="checker size-10 rounded-lg border border-border object-contain" />
                <Slider label="Logo size" value={logoScale} onChange={setLogoScale} min={10} max={32} suffix="%" className="min-w-40 flex-1" />
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setLogo(null)}>Remove</Button>
              </div>
            ) : <Button variant="outline" size="sm" icon={<ImagePlus className="size-4" />} onClick={() => logoInput.current?.click()}>Add center logo</Button>}
          </div>
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <motion.div layout className={cn('relative grid aspect-square place-items-center overflow-hidden rounded-xl border border-border', transparent ? 'checker' : 'bg-surface-2/40')}>
            {qr.m ? <motion.canvas key={kind} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} ref={canvas} className="size-full object-contain p-2" style={{ imageRendering: style === 'square' ? 'pixelated' : 'auto' }} />
              : <div className="p-6 text-center text-sm text-muted">{qr.err ? <span className="text-danger">{qr.err}</span> : !QR ? 'Loading…' : 'Fill in the fields to generate your QR code'}</div>}
          </motion.div>
          {qr.m && <div className="flex justify-between text-[11px] text-muted"><span>Version {(qr as any).ver} · {qr.m.size}×{qr.m.size} modules</span><span>{text.length} chars · EC {logo && (ec === 'L' || ec === 'M') ? 'H' : ec}</span></div>}
          {contrastLow && qr.m && !transparent && <div className="flex items-start gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Low contrast or inverted colors, some scanners may fail. Dark on light works best.</div>}
          <div className="grid grid-cols-2 gap-2">
            <Button icon={<Download className="size-4" />} onClick={png} disabled={!qr.m}>PNG</Button>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={svg} disabled={!qr.m}>SVG</Button>
            <Button variant="outline" icon={<Copy className="size-4" />} onClick={copyImg} disabled={!qr.m}>Copy image</Button>
            <CopyButton text={text} label="Copy data" size="md" />
          </div>
          {text && <details className="text-xs"><summary className="cursor-pointer text-muted hover:text-fg">Encoded content</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-2 font-mono">{text}</pre></details>}
        </Card>
      </aside>
    </div>
  )
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className={cn(disabled && 'pointer-events-none opacity-40')}>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-xs uppercase">{value}</span>
      </label>
    </div>
  )
}

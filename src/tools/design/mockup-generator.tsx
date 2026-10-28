import { useEffect, useRef, useState } from 'react'
import { Download, Smartphone, Laptop, Monitor, Tablet, Globe } from 'lucide-react'
import { Button, Field, Input, Label, Segmented, Slider, Switch, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { ColorInput, ImageDrop } from '@/tools/image/_img/kit'
import { encodeCanvas, decodeAny, type OutFmt } from '@/lib/b2/codecs'

type Device = 'phone' | 'tablet' | 'laptop' | 'browser' | 'monitor'
const DEVICES: { id: Device; label: string; icon: any; aspect: number }[] = [
  { id: 'phone', label: 'Phone', icon: Smartphone, aspect: 9 / 19.5 }, { id: 'tablet', label: 'Tablet', icon: Tablet, aspect: 3 / 4 },
  { id: 'laptop', label: 'Laptop', icon: Laptop, aspect: 16 / 10 }, { id: 'browser', label: 'Browser', icon: Globe, aspect: 16 / 10 }, { id: 'monitor', label: 'Monitor', icon: Monitor, aspect: 16 / 9 },
]

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); (ctx as any).roundRect(x, y, w, h, r) }
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, fit: 'cover' | 'top') {
  const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k
  ctx.drawImage(img, x + (w - iw) / 2, fit === 'top' ? y : y + (h - ih) / 2, iw, ih)
}

/** Draw a device with the screenshot inside. Returns a canvas sized to the device. */
function drawDevice(d: Device, shot: HTMLCanvasElement, o: { frame: string; url: string; dark: boolean; fit: 'cover' | 'top' }, W = 1600) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d')!
  const screen = (x: number, y: number, w: number, h: number, r: number) => { ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip(); ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); cover(ctx, shot, x, y, w, h, o.fit); ctx.restore() }
  if (d === 'phone' || d === 'tablet') {
    const w = d === 'phone' ? W * 0.5 : W * 0.75, h = d === 'phone' ? w * 2.05 : w * 1.36, b = w * (d === 'phone' ? 0.045 : 0.05)
    c.width = w; c.height = h
    rr(ctx, 0, 0, w, h, w * (d === 'phone' ? 0.16 : 0.08)); ctx.fillStyle = o.frame; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = w * 0.006; ctx.stroke()
    screen(b, b, w - b * 2, h - b * 2, w * (d === 'phone' ? 0.12 : 0.04))
    if (d === 'phone') { rr(ctx, w / 2 - w * 0.14, b + w * 0.03, w * 0.28, w * 0.075, w * 0.04); ctx.fillStyle = '#000'; ctx.fill() }
  } else if (d === 'laptop') {
    const sw = W, sh = sw / 1.6, bez = sw * 0.03, base = sw * 0.05
    c.width = sw * 1.16; c.height = sh + bez * 2 + base
    const ox = (c.width - sw) / 2
    rr(ctx, ox - bez, 0, sw + bez * 2, sh + bez * 2, bez * 1.2); ctx.fillStyle = o.frame; ctx.fill()
    screen(ox, bez, sw, sh, bez * 0.3)
    const g = ctx.createLinearGradient(0, sh + bez * 2, 0, c.height); g.addColorStop(0, '#d7d9dc'); g.addColorStop(1, '#8b8f94')
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, sh + bez * 2); ctx.lineTo(c.width, sh + bez * 2); ctx.lineTo(c.width - sw * 0.02, c.height); ctx.lineTo(sw * 0.02, c.height); ctx.closePath(); ctx.fill()
    rr(ctx, c.width / 2 - sw * 0.08, sh + bez * 2, sw * 0.16, base * 0.25, base * 0.12); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill()
  } else if (d === 'browser') {
    const w = W, bar = w * 0.045, h = w / 1.6 + bar
    c.width = w; c.height = h
    rr(ctx, 0, 0, w, h, w * 0.012); ctx.fillStyle = o.dark ? '#202124' : '#eef0f2'; ctx.fill()
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { ctx.beginPath(); ctx.arc(bar * 0.6 + i * bar * 0.5, bar / 2, bar * 0.15, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill() })
    rr(ctx, w * 0.2, bar * 0.2, w * 0.6, bar * 0.6, bar * 0.3); ctx.fillStyle = o.dark ? '#35363a' : '#ffffff'; ctx.fill()
    ctx.fillStyle = o.dark ? '#bdc1c6' : '#5f6368'; ctx.font = `${bar * 0.32}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.url, w / 2, bar / 2)
    ctx.save(); ctx.beginPath(); (ctx as any).roundRect(0, bar, w, h - bar, [0, 0, w * 0.012, w * 0.012]); ctx.clip(); cover(ctx, shot, 0, bar, w, h - bar, o.fit); ctx.restore()
  } else {
    const sw = W, sh = sw / (16 / 9), bez = sw * 0.02, neck = sw * 0.12
    c.width = sw + bez * 2; c.height = sh + bez * 2 + neck + sw * 0.02
    rr(ctx, 0, 0, c.width, sh + bez * 2, bez); ctx.fillStyle = o.frame; ctx.fill()
    screen(bez, bez, sw, sh, bez * 0.2)
    ctx.fillStyle = '#b9bcc0'; ctx.fillRect(c.width / 2 - sw * 0.05, sh + bez * 2, sw * 0.1, neck)
    rr(ctx, c.width / 2 - sw * 0.16, sh + bez * 2 + neck, sw * 0.32, sw * 0.02, sw * 0.01); ctx.fillStyle = '#9ea2a6'; ctx.fill()
  }
  return c
}

/** Draw `src` into the quad (tl, tr, br, bl) using subdivided affine triangles. */
function drawQuad(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, q: [number, number][], n = 24) {
  const P = (u: number, v: number) => { const [a, b, c, d] = q; const x = (1 - v) * ((1 - u) * a[0] + u * b[0]) + v * ((1 - u) * d[0] + u * c[0]); const y = (1 - v) * ((1 - u) * a[1] + u * b[1]) + v * ((1 - u) * d[1] + u * c[1]); return [x, y] }
  const tri = (s0: number[], s1: number[], s2: number[], d0: number[], d1: number[], d2: number[]) => {
    ctx.save(); ctx.beginPath(); ctx.moveTo(d0[0], d0[1]); ctx.lineTo(d1[0], d1[1]); ctx.lineTo(d2[0], d2[1]); ctx.closePath()
    const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3
    // expand slightly to hide seams
    ctx.translate(cx, cy); ctx.scale(1.012, 1.012); ctx.translate(-cx, -cy); ctx.clip()
    const den = s0[0] * (s2[1] - s1[1]) - s1[0] * s2[1] + s2[0] * s1[1] + (s1[0] - s2[0]) * s0[1]
    if (Math.abs(den) < 1e-9) { ctx.restore(); return }
    const a = -(s0[1] * (d2[0] - d1[0]) - s1[1] * d2[0] + s2[1] * d1[0] + (s1[1] - s2[1]) * d0[0]) / den
    const b = (s1[1] * d2[1] + s0[1] * (d1[1] - d2[1]) - s2[1] * d1[1] + (s2[1] - s1[1]) * d0[1]) / den
    const c = (s0[0] * (d2[0] - d1[0]) - s1[0] * d2[0] + s2[0] * d1[0] + (s1[0] - s2[0]) * d0[0]) / den
    const d = -(s1[0] * d2[1] + s0[0] * (d1[1] - d2[1]) - s2[0] * d1[1] + (s2[0] - s1[0]) * d0[1]) / den
    const e = (s0[0] * (s2[1] * d1[0] - s1[1] * d2[0]) + s0[1] * (s1[0] * d2[0] - s2[0] * d1[0]) + (s2[0] * s1[1] - s1[0] * s2[1]) * d0[0]) / den
    const f = (s0[0] * (s2[1] * d1[1] - s1[1] * d2[1]) + s0[1] * (s1[0] * d2[1] - s2[0] * d1[1]) + (s2[0] * s1[1] - s1[0] * s2[1]) * d0[1]) / den
    ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([a, b, c, d, e, f])))
    ctx.drawImage(src, 0, 0); ctx.restore()
  }
  const W = src.width, H = src.height
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u0 = i / n, u1 = (i + 1) / n, v0 = j / n, v1 = (j + 1) / n
    const s = [[u0 * W, v0 * H], [u1 * W, v0 * H], [u1 * W, v1 * H], [u0 * W, v1 * H]], d = [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]
    tri(s[0], s[1], s[2], d[0], d[1], d[2]); tri(s[0], s[2], s[3], d[0], d[2], d[3])
  }
}

function compose(dev: HTMLCanvasElement, o: { rx: number; ry: number; rz: number; pad: number; bg: string; bg2: string; bgKind: 'solid' | 'gradient' | 'none'; shadow: number; outW: number; aspect: number }) {
  const outW = o.outW, outH = Math.round(outW / o.aspect)
  const c = document.createElement('canvas'); c.width = outW; c.height = outH
  const ctx = c.getContext('2d')!
  if (o.bgKind === 'solid') { ctx.fillStyle = o.bg; ctx.fillRect(0, 0, outW, outH) }
  else if (o.bgKind === 'gradient') { const g = ctx.createLinearGradient(0, 0, outW, outH); g.addColorStop(0, o.bg); g.addColorStop(1, o.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, outW, outH) }
  // project the device rectangle with a simple perspective camera
  const k = Math.min((outW * (1 - o.pad / 50)) / dev.width, (outH * (1 - o.pad / 50)) / dev.height)
  const w = dev.width * k, h = dev.height * k, f = Math.max(w, h) * 2.2
  const rad = (v: number) => (v * Math.PI) / 180
  const [ax, ay, az] = [rad(o.rx), rad(o.ry), rad(o.rz)]
  const proj = (x: number, y: number) => {
    let X = x, Y = y, Z = 0
    ;[X, Y] = [X * Math.cos(az) - Y * Math.sin(az), X * Math.sin(az) + Y * Math.cos(az)]
    ;[X, Z] = [X * Math.cos(ay) + Z * Math.sin(ay), -X * Math.sin(ay) + Z * Math.cos(ay)]
    ;[Y, Z] = [Y * Math.cos(ax) - Z * Math.sin(ax), Y * Math.sin(ax) + Z * Math.cos(ax)]
    const s = f / (f + Z); return [outW / 2 + X * s, outH / 2 + Y * s] as [number, number]
  }
  const q: [number, number][] = [proj(-w / 2, -h / 2), proj(w / 2, -h / 2), proj(w / 2, h / 2), proj(-w / 2, h / 2)]
  // fit the projected quad into the frame
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1])
  const qw = Math.max(...xs) - Math.min(...xs), qh = Math.max(...ys) - Math.min(...ys)
  const fitK = Math.min((outW * (1 - o.pad / 50)) / qw, (outH * (1 - o.pad / 50)) / qh, 1.5)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const fq = q.map(([x, y]) => [outW / 2 + (x - cx) * fitK, outH / 2 + (y - cy) * fitK] as [number, number])
  const layer = document.createElement('canvas'); layer.width = outW; layer.height = outH
  const lctx = layer.getContext('2d')!
  const flat = Math.abs(o.rx) < 0.01 && Math.abs(o.ry) < 0.01
  if (flat) { lctx.save(); lctx.translate(outW / 2, outH / 2); lctx.rotate(az); const W2 = w * fitK, H2 = h * fitK; lctx.drawImage(dev, -W2 / 2, -H2 / 2, W2, H2); lctx.restore() }
  else drawQuad(lctx, dev, fq)
  if (o.shadow) { ctx.save(); ctx.shadowColor = `rgba(0,0,0,${o.shadow / 100})`; ctx.shadowBlur = outW * 0.035; ctx.shadowOffsetY = outW * 0.018; ctx.drawImage(layer, 0, 0); ctx.restore() }
  else ctx.drawImage(layer, 0, 0)
  return c
}

export default function MockupGenerator() {
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null)
  const [device, setDevice] = useState<Device>('browser')
  const [frame, setFrame] = useState('#1b1c1f')
  const [url, setUrl] = useState('example.com')
  const [dark, setDark] = useState(false)
  const [fit, setFit] = useState<'cover' | 'top'>('top')
  const [rx, setRx] = useState(0); const [ry, setRy] = useState(0); const [rz, setRz] = useState(0)
  const [pad, setPad] = useState(8)
  const [bgKind, setBgKind] = useState<'solid' | 'gradient' | 'none'>('gradient')
  const [bg, setBg] = useState('#F5A524'); const [bg2, setBg2] = useState('#0f766e')
  const [shadow, setShadow] = useState(35)
  const [ratio, setRatio] = useState('1.6')
  const [fmt, setFmt] = useState<OutFmt>('png')
  const view = useRef<HTMLCanvasElement>(null)
  const { busy, error, run } = useJob()

  const params = (outW: number) => ({ rx, ry, rz, pad, bg, bg2, bgKind, shadow, outW, aspect: Number(ratio) })
  useEffect(() => {
    if (!shot || !view.current) return
    const t = setTimeout(() => {
      const dev = drawDevice(device, shot, { frame, url, dark, fit }, 900)
      const out = compose(dev, params(1000))
      const v = view.current!; v.width = out.width; v.height = out.height; v.getContext('2d')!.drawImage(out, 0, 0)
    }, 30)
    return () => clearTimeout(t)
  }, [shot, device, frame, url, dark, fit, rx, ry, rz, pad, bgKind, bg, bg2, shadow, ratio])

  const save = () => run(async () => {
    if (!shot) return
    const dev = drawDevice(device, shot, { frame, url, dark, fit }, 2000)
    const out = compose(dev, params(2400))
    downloadBlob(await encodeCanvas(out, bgKind === 'none' && fmt === 'jpg' ? 'png' : fmt, { quality: 92 }), `mockup-${device}.${bgKind === 'none' && fmt === 'jpg' ? 'png' : fmt}`)
  })
  const preset = (a: number, b: number, c: number) => { setRx(a); setRy(b); setRz(c) }

  if (!shot) return <div className="space-y-3"><ImageDrop multiple={false} onFiles={(f) => run(async () => setShot((await decodeAny(f[0])).canvas))} label="Drop a screenshot" sub="Place it in a phone, tablet, laptop, browser or monitor frame · paste with Ctrl/⌘ V" /><ErrorNote error={error} /></div>
  return (
    <ToolGrid
      main={<>
        <div className="checker grid place-items-center overflow-hidden rounded-2xl border border-border p-3"><canvas ref={view} className="max-h-[66vh] max-w-full rounded-lg" style={{ height: 'auto' }} /></div>
        <div className="flex flex-wrap gap-2">{DEVICES.map((d) => <button key={d.id} onClick={() => setDevice(d.id)} aria-pressed={device === d.id} className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer', device === d.id ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/50')}><d.icon className="size-4" />{d.label}</button>)}</div>
      </>}
      side={<>
        <Field label="Angle"><div className="flex flex-wrap gap-1.5">{[['Flat', 0, 0, 0], ['Left', 8, -25, 0], ['Right', 8, 25, 0], ['Isometric', 30, -30, 8], ['Tilt', 0, 0, -8]].map(([l, a, b, c]) => <button key={l as string} onClick={() => preset(a as number, b as number, c as number)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent cursor-pointer">{l}</button>)}</div></Field>
        <Slider label="Tilt up / down" value={rx} onChange={setRx} min={-45} max={45} suffix="°" />
        <Slider label="Turn left / right" value={ry} onChange={setRy} min={-60} max={60} suffix="°" />
        <Slider label="Rotate" value={rz} onChange={setRz} min={-30} max={30} suffix="°" />
        {device === 'browser' ? <><Field label="Address bar"><Input value={url} onChange={(e) => setUrl(e.target.value)} /></Field><Switch checked={dark} onChange={setDark} label="Dark browser" /></> : <div><Label>Frame colour</Label><ColorInput value={frame} onChange={setFrame} /><div className="mt-1.5 flex gap-1.5">{['#1b1c1f', '#e8e8ea', '#c9b48f', '#2f4f4f'].map((c) => <button key={c} onClick={() => setFrame(c)} aria-label={`Frame ${c}`} className="size-6 rounded-md border border-border cursor-pointer" style={{ background: c }} />)}</div></div>}
        <Field label="Screenshot fit"><Segmented value={fit} onChange={setFit} options={[{ value: 'top', label: 'Top aligned' }, { value: 'cover', label: 'Centred' }]} /></Field>
        <Field label="Background"><Segmented value={bgKind} onChange={setBgKind} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Solid' }, { value: 'none', label: 'None' }]} /></Field>
        {bgKind !== 'none' && <div className="grid grid-cols-2 gap-2"><ColorInput value={bg} onChange={setBg} />{bgKind === 'gradient' && <ColorInput value={bg2} onChange={setBg2} />}</div>}
        <Field label="Canvas shape"><Segmented value={ratio} onChange={setRatio} options={[{ value: '1.6', label: '16:10' }, { value: '1.7778', label: '16:9' }, { value: '1', label: 'Square' }, { value: '0.8', label: '4:5' }]} /></Field>
        <Slider label="Padding" value={pad} onChange={setPad} min={0} max={30} suffix="%" />
        <Slider label="Shadow" value={shadow} onChange={setShadow} min={0} max={80} suffix="%" />
        <Field label="Format"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} /></Field>
        <ErrorNote error={error} />
        <Button size="lg" className="w-full" loading={busy} icon={<Download className="size-4" />} onClick={save}>Download mockup</Button>
        <Button variant="ghost" className="w-full" onClick={() => setShot(null)}>Use another screenshot</Button>
      </>}
    />
  )
}

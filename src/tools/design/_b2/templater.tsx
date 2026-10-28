/* Tiny template engine shared by card-maker and social-image-maker: layered canvas render + editor panel. */
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Field, Input, Label, Select, Slider, Textarea, cn } from '@/components/ui'
import { ColorInput, FONT_CHOICES, ensureFont } from '@/tools/image/_img/kit'

export type TText = { id: string; label: string; text: string; x: number; y: number; size: number; weight?: number; align?: CanvasTextAlign; maxW?: number; color?: 'text' | 'accent' | 'muted' | 'bg'; upper?: boolean; font?: 'title' | 'body'; italic?: boolean; spacing?: number; lineH?: number }
export type TShape = { kind: 'rect' | 'circle' | 'line' | 'pill'; x: number; y: number; w: number; h: number; color: 'accent' | 'text' | 'muted' | 'bg' | 'shade'; r?: number; opacity?: number }
export type Template = {
  id: string; name: string; w: number; h: number
  bg: { kind: 'solid' | 'linear' | 'radial' | 'split'; angle?: number }
  colors: { bg: string; bg2: string; text: string; accent: string; muted: string }
  fonts: { title: string; body: string }
  image?: { x: number; y: number; w: number; h: number; r?: number; circle?: boolean; label?: string; overlay?: number }
  shapes?: TShape[]
  texts: TText[]
}
export type State = { tpl: Template; texts: Record<string, string>; colors: Template['colors']; fonts: Template['fonts']; image: HTMLImageElement | null; bgImage: HTMLImageElement | null; bgDim: number }

export const initState = (tpl: Template, keep?: Partial<State>): State => ({ tpl, texts: Object.fromEntries(tpl.texts.map((t) => [t.id, keep?.texts?.[t.id] ?? t.text])), colors: { ...tpl.colors }, fonts: { ...tpl.fonts }, image: keep?.image ?? null, bgImage: keep?.bgImage ?? null, bgDim: keep?.bgDim ?? 35 })

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/); let line = ''
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w } else line = t }
    out.push(line)
  }
  return out
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * k, ih = img.naturalHeight * k
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih)
}

/** Draw the template at scale `s` (1 = full resolution). */
export function renderTemplate(ctx: CanvasRenderingContext2D, st: State, s = 1) {
  const { tpl, colors: C, fonts: F } = st
  const W = tpl.w * s, H = tpl.h * s
  const col = (k: string) => (k === 'shade' ? 'rgba(0,0,0,.35)' : (C as any)[k] ?? k)
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  if (tpl.bg.kind === 'solid') { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H) }
  else if (tpl.bg.kind === 'split') { ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = C.bg2; ctx.fillRect(W * 0.5, 0, W * 0.5, H) }
  else {
    const a = ((tpl.bg.angle ?? 135) * Math.PI) / 180
    const g = tpl.bg.kind === 'radial' ? ctx.createRadialGradient(W * 0.3, H * 0.3, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.7) : ctx.createLinearGradient(W / 2 - (Math.cos(a) * W) / 2, H / 2 - (Math.sin(a) * H) / 2, W / 2 + (Math.cos(a) * W) / 2, H / 2 + (Math.sin(a) * H) / 2)
    g.addColorStop(0, C.bg); g.addColorStop(1, C.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
  if (st.bgImage) { cover(ctx, st.bgImage, 0, 0, W, H); ctx.fillStyle = `rgba(0,0,0,${st.bgDim / 100})`; ctx.fillRect(0, 0, W, H) }
  for (const sh of tpl.shapes ?? []) {
    ctx.globalAlpha = sh.opacity ?? 1; ctx.fillStyle = col(sh.color); ctx.strokeStyle = col(sh.color)
    const x = sh.x * W, y = sh.y * H, w = sh.w * W, h = sh.h * H
    if (sh.kind === 'circle') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill() }
    else if (sh.kind === 'line') { ctx.lineWidth = Math.max(1, h); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke() }
    else { ctx.beginPath(); (ctx as any).roundRect(x, y, w, h, sh.kind === 'pill' ? h / 2 : (sh.r ?? 0) * s); ctx.fill() }
    ctx.globalAlpha = 1
  }
  if (tpl.image) {
    const im = tpl.image, x = im.x * W, y = im.y * H, w = im.w * W, h = im.h * H
    ctx.save(); ctx.beginPath()
    if (im.circle) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); else (ctx as any).roundRect(x, y, w, h, (im.r ?? 0) * s)
    ctx.clip()
    if (st.image) { cover(ctx, st.image, x, y, w, h); if (im.overlay) { ctx.fillStyle = `rgba(0,0,0,${im.overlay})`; ctx.fillRect(x, y, w, h) } }
    else { ctx.fillStyle = 'rgba(128,128,128,.25)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = col('muted'); ctx.font = `${Math.min(w, h) * 0.08}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(im.label ?? 'Add an image', x + w / 2, y + h / 2) }
    ctx.restore()
  }
  for (const t of tpl.texts) {
    let text = st.texts[t.id] ?? ''
    if (!text) continue
    if (t.upper) text = text.toUpperCase()
    const size = t.size * H
    const fam = t.font === 'body' ? F.body : F.title
    ctx.font = `${t.italic ? 'italic ' : ''}${t.weight ?? 700} ${size}px "${fam}", sans-serif`
    ;(ctx as any).letterSpacing = `${(t.spacing ?? 0) * size}px`
    ctx.fillStyle = col(t.color ?? 'text'); ctx.textAlign = t.align ?? 'left'; ctx.textBaseline = 'top'
    const lines = wrap(ctx, text, (t.maxW ?? 0.9) * W)
    lines.forEach((l, i) => ctx.fillText(l, t.x * W, t.y * H + i * size * (t.lineH ?? 1.15)))
  }
  ctx.restore()
}

export function useFonts(fonts: Template['fonts']) {
  const [v, setV] = useState(0)
  useEffect(() => { let dead = false; Promise.all([ensureFont(fonts.title), ensureFont(fonts.body)]).then(() => !dead && setV((n) => n + 1)); return () => { dead = true } }, [fonts.title, fonts.body])
  return v
}

export function Preview({ st, maxW = 760, maxH = 560, tick }: { st: State; maxW?: number; maxH?: number; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const s = Math.min(maxW / st.tpl.w, maxH / st.tpl.h, 1) * Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(st.tpl.w * s); c.height = Math.round(st.tpl.h * s)
    c.style.width = c.width / Math.min(2, window.devicePixelRatio || 1) + 'px'
    renderTemplate(c.getContext('2d')!, st, s)
  }, [st, maxW, maxH, tick])
  return <div className="checker grid place-items-center overflow-hidden rounded-2xl border border-border p-4"><canvas ref={ref} className="max-w-full rounded-md shadow-xl" style={{ height: 'auto' }} /></div>
}

function pickImage(): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'
    i.onchange = () => { const f = i.files?.[0]; if (!f) return res(null); const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = URL.createObjectURL(f) }
    i.click()
  })
}

export function TemplatePicker({ templates, value, onPick }: { templates: Template[]; value: string; onPick: (t: Template) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {templates.map((t) => <button key={t.id} onClick={() => onPick(t)} className={cn('rounded-xl border p-2 text-left text-xs cursor-pointer', value === t.id ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-border hover:border-accent/50')}>
        <div className="mb-1.5 h-10 rounded-md" style={{ background: t.bg.kind === 'solid' ? t.colors.bg : `linear-gradient(135deg, ${t.colors.bg}, ${t.colors.bg2})`, aspectRatio: undefined }}><div className="h-full w-1 rounded-l-md" style={{ background: t.colors.accent }} /></div>
        <div className="font-medium">{t.name}</div><div className="text-[10px] text-muted">{t.w}×{t.h}</div>
      </button>)}
    </div>
  )
}

export function Editor({ st, set }: { st: State; set: (s: State) => void }) {
  const u = (p: Partial<State>) => set({ ...st, ...p })
  return (
    <div className="space-y-4">
      {st.tpl.texts.map((t) => (
        <Field key={t.id} label={t.label}>
          {(st.texts[t.id] ?? '').length > 40 || t.text.includes('\n') ? <Textarea value={st.texts[t.id]} onChange={(e) => u({ texts: { ...st.texts, [t.id]: e.target.value } })} className="min-h-16 font-sans" /> : <Input value={st.texts[t.id]} onChange={(e) => u({ texts: { ...st.texts, [t.id]: e.target.value } })} />}
        </Field>
      ))}
      {st.tpl.image && <div><Label>{st.tpl.image.label ?? 'Image'}</Label><div className="flex gap-2"><button onClick={async () => { const i = await pickImage(); if (i) u({ image: i }) }} className="flex flex-1 items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent cursor-pointer"><ImagePlus className="size-4" />{st.image ? 'Replace image' : 'Upload image'}</button>{st.image && <button onClick={() => u({ image: null })} aria-label="Remove image" className="rounded-lg px-2 text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button>}</div></div>}
      <div><Label>Background photo (optional)</Label><div className="flex gap-2"><button onClick={async () => { const i = await pickImage(); if (i) u({ bgImage: i }) }} className="flex flex-1 items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent cursor-pointer"><ImagePlus className="size-4" />{st.bgImage ? 'Replace' : 'Upload'}</button>{st.bgImage && <button onClick={() => u({ bgImage: null })} aria-label="Remove background photo" className="rounded-lg px-2 text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button>}</div>{st.bgImage && <Slider className="mt-2" label="Darken" value={st.bgDim} onChange={(v) => u({ bgDim: v })} suffix="%" />}</div>
      <div className="grid grid-cols-2 gap-2">
        {([['bg', 'Background'], ['bg2', 'Background 2'], ['text', 'Text'], ['accent', 'Accent']] as const).map(([k, l]) => <div key={k}><Label>{l}</Label><ColorInput value={st.colors[k]} onChange={(v) => u({ colors: { ...st.colors, [k]: v } })} /></div>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Title font"><Select value={st.fonts.title} onChange={(v) => u({ fonts: { ...st.fonts, title: v } })} options={FONT_CHOICES} /></Field>
        <Field label="Body font"><Select value={st.fonts.body} onChange={(v) => u({ fonts: { ...st.fonts, body: v } })} options={FONT_CHOICES} /></Field>
      </div>
    </div>
  )
}

export function renderFull(st: State, scale = 1) {
  const c = document.createElement('canvas'); c.width = Math.round(st.tpl.w * scale); c.height = Math.round(st.tpl.h * scale)
  renderTemplate(c.getContext('2d')!, st, scale); return c
}

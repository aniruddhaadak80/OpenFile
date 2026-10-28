import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftRight, Shuffle, Check, X, Eye } from 'lucide-react'
import { Card, Input, Label, CopyButton, Button, Segmented, Badge, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { copyText } from '@/lib/files'
import { ColorPicker, ColorField } from './_design/ColorPicker'
import { RGBA, parseColor, fmt, rgbToHex, tailwindScale, contrast, wcag, textOn, over, simulateCvd, CVD, nearestName, randomColor, oklchToRgbGamut, rgbToOklch } from './_design/color'

const FORMATS: { key: keyof typeof fmt; label: string }[] = [
  { key: 'hex', label: 'HEX' }, { key: 'rgb', label: 'RGB' }, { key: 'hsl', label: 'HSL' }, { key: 'hsv', label: 'HSV' },
  { key: 'hwb', label: 'HWB' }, { key: 'cmyk', label: 'CMYK' }, { key: 'lab', label: 'LAB' }, { key: 'oklch', label: 'OKLCH' },
]

export default function ColorConverter() {
  const [color, setColor] = useState<RGBA>({ r: 109, g: 74, b: 255, a: 1 })
  const [input, setInput] = useState('#f5a524')
  const [bad, setBad] = useState(false)
  const [fg, setFg] = useState('#ffffff')
  const [bg, setBg] = useState('#f5a524')
  const [scaleFmt, setScaleFmt] = useState<'hex' | 'oklch' | 'rgb'>('hex')

  const set = (c: RGBA, fromInput = false) => { setColor(c); if (!fromInput) setInput(fmt.hex(c)); setBad(false) }
  const onInput = (v: string) => { setInput(v); const p = parseColor(v); if (p) set(p, true); else setBad(v.trim().length > 0) }
  const hex = rgbToHex(color)
  const scale = useMemo(() => tailwindScale(color), [color])
  const name = useMemo(() => nearestName(color), [color])
  const fgc = parseColor(fg) ?? { r: 255, g: 255, b: 255, a: 1 }, bgc = parseColor(bg) ?? { r: 0, g: 0, b: 0, a: 1 }
  const ratio = contrast(over(fgc, bgc), bgc)
  const w = wcag(ratio)

  const scaleCss = () => scale.map((s) => `  --color-primary-${s.step}: ${scaleFmt === 'hex' ? rgbToHex(s.color) : fmt[scaleFmt](s.color)};`).join('\n')
  const fixContrast = () => {
    // nudge fg lightness in OKLCH until AA normal passes
    const o = rgbToOklch(fgc); const bgL = rgbToOklch(bgc).l
    const dir = bgL > 0.6 ? -1 : 1
    for (let L = o.l; L >= 0 && L <= 1; L += dir * 0.01) {
      const c = oklchToRgbGamut(L, o.c, o.h)
      if (contrast(c, bgc) >= 4.5) { setFg(rgbToHex(c)); toast(`Adjusted to ${rgbToHex(c)}, passes AA`); return }
    }
    setFg(dir < 0 ? '#000000' : '#ffffff')
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="space-y-4">
          <motion.div layout className="relative h-28 overflow-hidden rounded-xl checker">
            <div className="absolute inset-0 flex flex-col justify-end p-3 transition-colors" style={{ background: fmt.rgb(color), color: textOn(over(color, { r: 255, g: 255, b: 255, a: 1 })) }}>
              <div className="font-display text-2xl font-bold">{fmt.hex(color).toUpperCase()}</div>
              <div className="text-xs capitalize opacity-80">≈ {name}</div>
            </div>
          </motion.div>
          <div>
            <Label hint={bad ? <span className="text-danger">Unrecognised</span> : undefined}>Any CSS colour</Label>
            <div className="flex gap-2">
              <Input value={input} onChange={(e) => onInput(e.target.value)} placeholder="#f97316, rgb(), hsl(), oklch(), tomato…" className={cn('font-mono', bad && 'border-danger')} spellCheck={false} />
              <Button variant="outline" size="md" title="Random colour" onClick={() => set(randomColor())} icon={<Shuffle className="size-4" />} />
            </div>
          </div>
          <ColorPicker value={color} onChange={(c) => set(c)} />
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex items-center justify-between"><h3 className="font-display font-semibold">Conversions</h3><span className="text-xs text-muted">Click a value to copy</span></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {FORMATS.map((f) => {
                const v = fmt[f.key](color)
                return (
                  <button key={f.key} onClick={async () => { if (await copyText(v)) toast(`${f.label} copied`) }} className="group flex items-center gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5 text-left transition hover:border-accent cursor-pointer">
                    <span className="w-12 shrink-0 text-[11px] font-bold tracking-wider text-muted">{f.label}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{v}</span>
                    <span className="text-xs text-accent opacity-0 transition group-hover:opacity-100">Copy</span>
                  </button>
                )
              })}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display font-semibold">Tints & shades <span className="text-sm font-normal text-muted">50–950</span></h3>
              <div className="flex items-center gap-2">
                <Segmented value={scaleFmt} onChange={setScaleFmt} options={[{ value: 'hex', label: 'HEX' }, { value: 'rgb', label: 'RGB' }, { value: 'oklch', label: 'OKLCH' }]} />
                <CopyButton label="CSS vars" text={() => `:root {\n${scaleCss()}\n}`} />
                <CopyButton label="Tailwind" text={() => `/* tailwind.config.js → theme.extend.colors */\nprimary: {\n${scale.map((s) => `  ${s.step}: '${scaleFmt === 'hex' ? rgbToHex(s.color) : fmt[scaleFmt](s.color)}',`).join('\n')}\n},\n\n/* Tailwind v4 (@theme) */\n@theme {\n${scaleCss()}\n}`} />
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
              {scale.map((s, i) => (
                <motion.button key={s.step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  onClick={() => set(s.color)} title={`Use ${rgbToHex(s.color)}`}
                  className={cn('group flex h-20 flex-col justify-between rounded-lg p-1.5 text-left text-[10px] transition hover:scale-105 cursor-pointer', s.base && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}
                  style={{ background: rgbToHex(s.color), color: textOn(s.color) }}>
                  <span className="font-bold">{s.step}</span>
                  <span className="font-mono opacity-80">{rgbToHex(s.color).slice(1)}</span>
                </motion.button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-display font-semibold">WCAG contrast checker</h3>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => { setFg(bg); setBg(fg) }} icon={<ArrowLeftRight className="size-4" />}>Swap</Button>
              <Button size="sm" variant="ghost" onClick={() => setBg(hex)}>Use colour as bg</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label="Text" value={fg} onChange={setFg} />
            <ColorField label="Background" value={bg} onChange={setBg} alpha={false} />
          </div>
          <div className="rounded-xl p-5 transition-colors" style={{ background: bg, color: fg }}>
            <div className="text-2xl font-bold">Large heading text</div>
            <p className="mt-1 text-sm">Normal body text, the quick brown fox jumps over the lazy dog. 0123456789</p>
            <div className="mt-3 inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ border: `2px solid ${fg}` }}>UI component</div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div><div className={cn('font-display text-4xl font-bold', ratio >= 4.5 ? 'text-success' : ratio >= 3 ? 'text-warn' : 'text-danger')}>{ratio.toFixed(2)}<span className="text-lg text-muted">:1</span></div>
              <div className="text-xs text-muted">{ratio >= 7 ? 'Excellent' : ratio >= 4.5 ? 'Good' : ratio >= 3 ? 'Large text only' : 'Fails'}</div></div>
            <div className="grid flex-1 grid-cols-2 gap-1.5 text-xs">
              {[['AA normal', w.aaNormal], ['AA large', w.aaLarge], ['AAA normal', w.aaaNormal], ['AAA large', w.aaaLarge], ['UI / graphics', w.ui]].map(([l, ok]) => (
                <div key={l as string} className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1', ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>{ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}{l as string}</div>
              ))}
            </div>
          </div>
          {!w.aaNormal && <Button size="sm" variant="outline" onClick={fixContrast}>Suggest an accessible text colour</Button>}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2"><Eye className="size-4 text-accent" /><h3 className="font-display font-semibold">Colour blindness simulation</h3></div>
          <p className="text-xs text-muted">How the current colour, its scale and your contrast pair appear to people with colour vision deficiencies (Machado 2009 model).</p>
          <div className="space-y-2.5">
            {[['normal', 'Normal vision'], ...Object.entries(CVD).map(([k, v]) => [k, v.label])].map(([k, l]) => {
              const sim = (c: RGBA) => (k === 'normal' ? c : simulateCvd(c, k))
              const sf = sim(fgc), sb = sim(bgc)
              return (
                <div key={k} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 text-xs font-medium">{l}</div>
                  <div className="flex h-9 flex-1 overflow-hidden rounded-lg">
                    <div className="w-12 shrink-0" style={{ background: rgbToHex(sim(color)) }} />
                    {scale.map((s) => <div key={s.step} className="flex-1" style={{ background: rgbToHex(sim(s.color)) }} />)}
                  </div>
                  <div className="grid h-9 w-16 shrink-0 place-items-center rounded-lg text-sm font-bold" style={{ background: rgbToHex(sb), color: rgbToHex(over(sf, sb)) }}>Aa</div>
                  <Badge className="w-12 justify-center">{contrast(over(sf, sb), sb).toFixed(1)}</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

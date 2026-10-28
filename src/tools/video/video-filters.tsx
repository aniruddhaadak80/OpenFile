import { useState } from 'react'
import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import { Button, Label, Slider, Switch } from '@/components/ui'
import { NEUTRAL, cssPreview, filtersOp, type FilterSettings } from '@/lib/b3/ffops'
import { VideoOpTool, FilePick, inName, outName } from './_b3/shell'
import { Note } from './_media/ui'
import { cn } from '@/components/ui'

const PRESETS: { name: string; s: Partial<FilterSettings> }[] = [
  { name: 'Vivid', s: { contrast: 1.15, saturation: 1.4, sharpen: 0.6 } },
  { name: 'Warm', s: { temperature: 60, saturation: 1.1 } },
  { name: 'Cool', s: { temperature: -60 } },
  { name: 'Film', s: { contrast: 1.1, saturation: 0.8, vignette: 50, gamma: 0.95 } },
  { name: 'Mono', s: { grayscale: true, contrast: 1.2 } },
  { name: 'Sepia', s: { sepia: true } },
  { name: 'Fade', s: { contrast: 0.85, brightness: 0.05, saturation: 0.8 } },
  { name: 'Unblur', s: { sharpen: 1.5, denoise: true } },
]

export default function VideoFilters() {
  const [s, setS] = useState<FilterSettings>(NEUTRAL)
  const [lut, setLut] = useState<File | null>(null)
  const set = (p: Partial<FilterSettings>) => setS((x) => ({ ...x, ...p }))
  return (
    <VideoOpTool
      dropLabel="Drop a video to adjust colour and apply filters" action="Apply filters" icon={<SlidersHorizontal className="size-5" />}
      main={({ url, meta }) => (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-black/90">
          {meta?.playable !== false && url ? <video src={url} controls playsInline className="mx-auto max-h-[60vh] w-full object-contain" style={{ filter: cssPreview(s) }} /> : <div className="aspect-video" />}
          {s.vignette > 0 && <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at center, transparent ${70 - s.vignette / 3}%, rgba(0,0,0,${0.3 + s.vignette / 200}) 100%)` }} />}
        </div>
      )}
      below={() => <p className="text-center text-xs text-muted">Live preview is close to the final look. Sharpen, warmth, denoise and LUTs only show in the result.</p>}
      side={() => <>
        <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.name} onClick={() => setS({ ...NEUTRAL, ...p.s })} className={cn('rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-muted transition hover:text-fg cursor-pointer')}>{p.name}</button>)}</div>
        <Slider label="Brightness" value={Math.round(s.brightness * 100)} onChange={(v) => set({ brightness: v / 100 })} min={-50} max={50} />
        <Slider label="Contrast" value={Math.round(s.contrast * 100)} onChange={(v) => set({ contrast: v / 100 })} min={50} max={200} suffix="%" />
        <Slider label="Saturation" value={Math.round(s.saturation * 100)} onChange={(v) => set({ saturation: v / 100 })} min={0} max={300} suffix="%" />
        <Slider label="Gamma" value={Math.round(s.gamma * 100)} onChange={(v) => set({ gamma: v / 100 })} min={50} max={200} suffix="%" />
        <Slider label="Warmth" value={s.temperature} onChange={(v) => set({ temperature: v })} min={-100} max={100} />
        <Slider label="Hue shift" value={s.hue} onChange={(v) => set({ hue: v })} min={-180} max={180} suffix="°" />
        <Slider label="Sharpen / unblur" value={Math.round(s.sharpen * 10)} onChange={(v) => set({ sharpen: v / 10 })} min={0} max={30} />
        <Slider label="Blur" value={s.blur} onChange={(v) => set({ blur: v })} min={0} max={20} />
        <Slider label="Vignette" value={s.vignette} onChange={(v) => set({ vignette: v })} min={0} max={100} />
        <div className="grid grid-cols-2 gap-2">
          <Switch checked={s.denoise} onChange={(v) => set({ denoise: v })} label="Denoise" />
          <Switch checked={s.grayscale} onChange={(v) => set({ grayscale: v })} label="Black & white" />
          <Switch checked={s.sepia} onChange={(v) => set({ sepia: v })} label="Sepia" />
          <Switch checked={s.invert} onChange={(v) => set({ invert: v })} label="Invert" />
        </div>
        <div><Label>Colour LUT (.cube)</Label><FilePick file={lut} onFile={setLut} accept=".cube,.3dl" label="Drop a .cube LUT file" hint="Optional colour grade" /></div>
        <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={() => { setS(NEUTRAL); setLut(null) }}>Reset</Button>
        {s.denoise && <Note>Denoise is slow on long videos.</Note>}
      </>}
      onRun={async ({ file }, h) => {
        const info = await h.probe()
        h.setLabel('Applying filters')
        const input = inName(file)
        const lutName = lut ? `grade${/\.3dl$/i.test(lut.name) ? '.3dl' : '.cube'}` : undefined
        const blob = await h.run(filtersOp(input, { ...s, lut: lutName }, info.hasAudio), [{ name: input, file }, ...(lut && lutName ? [{ name: lutName, file: lut }] : [])])
        return { blob, name: outName(file, 'filtered'), title: 'Filters applied' }
      }}
    />
  )
}

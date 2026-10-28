import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, FileCode2, Upload, RotateCcw, Image as ImageIcon, Eye, Code2 } from 'lucide-react'
import { Button, Card, Dropzone, Label, Segmented, Slider, Switch, Tabs, Textarea, CopyButton, Input, ErrorNote, Badge, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, formatBytes, baseName, canvasToBlob } from '@/lib/files'
import { svgToJsx } from './_design/svgjsx'

const PRESET: { name: string; label: string; on?: boolean }[] = [
  { name: 'removeDoctype', label: 'Remove doctype' }, { name: 'removeXMLProcInst', label: 'Remove XML instructions' }, { name: 'removeComments', label: 'Remove comments' },
  { name: 'removeDeprecatedAttrs', label: 'Remove deprecated attrs' }, { name: 'removeMetadata', label: 'Remove <metadata>' }, { name: 'removeEditorsNSData', label: 'Remove editor data (Inkscape, Illustrator…)' },
  { name: 'cleanupAttrs', label: 'Clean up attribute whitespace' }, { name: 'mergeStyles', label: 'Merge <style> elements' }, { name: 'inlineStyles', label: 'Inline styles' },
  { name: 'minifyStyles', label: 'Minify styles' }, { name: 'cleanupIds', label: 'Clean up / shorten IDs' }, { name: 'removeUselessDefs', label: 'Remove unused defs' },
  { name: 'cleanupNumericValues', label: 'Round numeric values' }, { name: 'convertColors', label: 'Shorten colours' }, { name: 'removeUnknownsAndDefaults', label: 'Remove unknowns & defaults' },
  { name: 'removeNonInheritableGroupAttrs', label: 'Remove non-inheritable group attrs' }, { name: 'removeUselessStrokeAndFill', label: 'Remove useless stroke & fill' }, { name: 'cleanupEnableBackground', label: 'Clean up enable-background' },
  { name: 'removeHiddenElems', label: 'Remove hidden elements' }, { name: 'removeEmptyText', label: 'Remove empty text' }, { name: 'convertShapeToPath', label: 'Shapes → paths' },
  { name: 'convertEllipseToCircle', label: 'Ellipses → circles' }, { name: 'moveElemsAttrsToGroup', label: 'Move attrs to group' }, { name: 'moveGroupAttrsToElems', label: 'Move group attrs to elements' },
  { name: 'collapseGroups', label: 'Collapse useless groups' }, { name: 'convertPathData', label: 'Optimise path data' }, { name: 'convertTransform', label: 'Optimise transforms' },
  { name: 'removeEmptyAttrs', label: 'Remove empty attrs' }, { name: 'removeEmptyContainers', label: 'Remove empty containers' }, { name: 'mergePaths', label: 'Merge paths' },
  { name: 'removeUnusedNS', label: 'Remove unused namespaces' }, { name: 'sortAttrs', label: 'Sort attributes' }, { name: 'sortDefsChildren', label: 'Sort defs children' }, { name: 'removeDesc', label: 'Remove <desc>' },
]
const EXTRA: { name: string; label: string; on: boolean }[] = [
  { name: 'removeTitle', label: 'Remove <title>', on: false }, { name: 'removeDimensions', label: 'Remove width/height (keep viewBox)', on: false },
  { name: 'removeViewBox', label: 'Remove viewBox', on: false }, { name: 'removeXMLNS', label: 'Remove xmlns (inline SVG only)', on: false },
  { name: 'removeScripts', label: 'Remove scripts & event handlers', on: true }, { name: 'removeRasterImages', label: 'Remove raster images', on: false },
  { name: 'convertStyleToAttrs', label: 'Style → attributes', on: false }, { name: 'reusePaths', label: 'Reuse duplicate paths (<use>)', on: false },
  { name: 'removeOffCanvasPaths', label: 'Remove off-canvas paths', on: false }, { name: 'prefixIds', label: 'Prefix IDs (avoid collisions)', on: false },
  { name: 'removeXlink', label: 'xlink:href → href', on: false }, { name: 'convertOneStopGradients', label: 'One-stop gradients → colour', on: false },
]
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In  -->
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
\t width="128px" height="128px" viewBox="0 0 128 128" style="enable-background:new 0 0 128 128;" xml:space="preserve">
<title>OpenFile logo</title>
<metadata>Created with love</metadata>
<g>
\t<g>
\t\t<rect x="16.000" y="16.000" fill="#6D4AFF" width="96.000" height="96.000" rx="24.0000" ry="24.0000"/>
\t\t<circle fill="#FFFFFF" fill-opacity="1.0" cx="64.00000" cy="64.00000" r="22.00000"/>
\t\t<path fill="none" stroke="#22D3EE" stroke-width="6.0000" stroke-linecap="round" d="M 40.000 92.000 L 88.000 92.000"/>
\t</g>
</g>
</svg>`

export default function SvgOptimizer() {
  const [name, setName] = useState('image.svg')
  const [input, setInput] = useState('')
  const [precision, setPrecision] = useState(3)
  const [multipass, setMultipass] = useState(true)
  const [pretty, setPretty] = useState(false)
  const [disabled, setDisabled] = useState<Set<string>>(new Set())
  const [extras, setExtras] = useState<Set<string>>(new Set(EXTRA.filter((e) => e.on).map((e) => e.name)))
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [compare, setCompare] = useState(50)
  const [out, setOut] = useState<'svg' | 'jsx' | 'datauri' | 'png'>('svg')
  const [jsx, setJsx] = useState({ name: 'Icon', typescript: true, currentColor: false, spreadProps: true, removeDims: false })
  const [pngW, setPngW] = useState(512)
  const [bgDark, setBgDark] = useState(false)

  useEffect(() => {
    if (!input.trim()) { setOutput(''); return }
    let cancel = false
    const t = setTimeout(async () => {
      try {
        const { optimize } = await import('svgo/browser')
        const overrides: Record<string, false> = {}
        disabled.forEach((d) => (overrides[d] = false))
        const res = optimize(input, {
          multipass, floatPrecision: precision, js2svg: { pretty, indent: 2 },
          plugins: [{ name: 'preset-default', params: { floatPrecision: precision, overrides } } as any, ...[...extras].map((n) => (n === 'prefixIds' ? { name: n, params: { prefix: baseName(name).replace(/\W/g, '') || 'svg' } } : n)) as any],
        })
        if (!cancel) { setOutput(res.data); setError(null) }
      } catch (e: any) { if (!cancel) { setError(`Could not parse this SVG: ${e?.message ?? e}`); setOutput('') } }
    }, 200)
    return () => { cancel = true; clearTimeout(t) }
  }, [input, precision, multipass, pretty, disabled, extras, name])

  const inSize = new Blob([input]).size, outSize = new Blob([output]).size
  const saved = inSize ? 1 - outSize / inSize : 0
  const dataUriEnc = useMemo(() => 'data:image/svg+xml,' + output.replace(/"/g, "'").replace(/[\r\n%#()<>?[\\\]^`{|}]/g, encodeURIComponent), [output])
  const dataUri64 = useMemo(() => { try { return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(output))) } catch { return '' } }, [output])
  const jsxCode = useMemo(() => { if (!output || out !== 'jsx') return ''; try { return svgToJsx(output, jsx) } catch (e: any) { return `// ${e.message}` } }, [output, jsx, out])
  const dims = useMemo(() => {
    const m = output.match(/viewBox=["']([^"']+)["']/); if (m) { const v = m[1].split(/[\s,]+/).map(Number); if (v[2] > 0 && v[3] > 0) return { w: v[2], h: v[3] } }
    const w = output.match(/width=["']([\d.]+)/), h = output.match(/height=["']([\d.]+)/); return w && h ? { w: +w[1], h: +h[1] } : { w: 1, h: 1 }
  }, [output])

  const load = async (f: File) => { setName(f.name); setInput(await f.text()); setJsx((j) => ({ ...j, name: baseName(f.name).replace(/(^|[-_ ])(\w)/g, (_, __, c) => c.toUpperCase()) })) }
  const exportPng = async () => {
    const w = pngW, h = Math.round((pngW * dims.h) / dims.w)
    let svg = output
    // force explicit size so the browser rasterises at full resolution
    svg = svg.replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)=["'][^"']*["']/g, '')} width="${w}" height="${h}">`)
    if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    await img.decode().catch(() => { throw new Error('This SVG could not be rasterised') })
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    downloadBlob(await canvasToBlob(c), `${baseName(name)}-${w}x${h}.png`); toast('PNG downloaded')
  }

  if (!input) return (
    <div className="space-y-4">
      <Dropzone accept=".svg,image/svg+xml" onFiles={(f) => load(f[0])} label="Drop an SVG file to optimise" />
      <Card className="space-y-3">
        <Label>…or paste SVG markup</Label>
        <Textarea placeholder="<svg …>…</svg>" onChange={(e) => { if (e.target.value.includes('<svg')) setInput(e.target.value) }} className="h-32" />
        <Button variant="ghost" size="sm" onClick={() => { setName('sample.svg'); setInput(SAMPLE) }}>Try a sample SVG</Button>
      </Card>
    </div>
  )

  const previewBg = bgDark ? 'bg-neutral-900' : 'checker'
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <FileCode2 className="size-5 text-accent" />
          <div className="min-w-0 flex-1"><div className="truncate font-medium">{name}</div><div className="text-xs text-muted">{formatBytes(inSize)} → <span className="font-semibold text-fg">{formatBytes(outSize)}</span></div></div>
          <motion.div key={Math.round(saved * 1000)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('rounded-xl px-3 py-1.5 font-display text-xl font-bold', saved > 0 ? 'bg-success/10 text-success' : 'bg-warn/10 text-warn')}>{saved > 0 ? '−' : '+'}{Math.abs(saved * 100).toFixed(1)}%</motion.div>
          <Button variant="ghost" size="sm" onClick={() => { setInput(''); setOutput('') }} icon={<RotateCcw className="size-4" />}>New</Button>
        </Card>
        <ErrorNote error={error} />
        <Card className="p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Segmented value={view} onChange={setView} options={[{ value: 'preview', label: <span className="flex items-center gap-1"><Eye className="size-3.5" />Before / after</span> }, { value: 'code', label: <span className="flex items-center gap-1"><Code2 className="size-3.5" />Code</span> }]} />
            {view === 'preview' && <Switch checked={bgDark} onChange={setBgDark} label={<span className="text-xs">Dark bg</span>} />}
          </div>
          {view === 'preview' ? (
            <div className={cn('relative h-[380px] select-none overflow-hidden rounded-xl', previewBg)}>
              <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(input)} alt="Original" className="absolute inset-0 m-auto max-h-[90%] max-w-[90%] object-contain p-4" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }} />
              {output && <img src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(output.includes('xmlns=') ? output : output.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))} alt="Optimised" className="absolute inset-0 m-auto max-h-[90%] max-w-[90%] object-contain p-4" style={{ clipPath: `inset(0 0 0 ${compare}%)` }} />}
              <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${compare}%` }}><div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-white">⇆</div></div>
              <Badge className="absolute left-3 top-3">ORIGINAL {formatBytes(inSize)}</Badge><Badge className="absolute right-3 top-3" color="#22c55e">OPTIMISED {formatBytes(outSize)}</Badge>
              <input type="range" min={0} max={100} value={compare} onChange={(e) => setCompare(+e.target.value)} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" aria-label="Compare" />
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label hint={formatBytes(inSize)}>Original</Label><Textarea value={input} onChange={(e) => setInput(e.target.value)} className="h-[340px] text-[11px]" spellCheck={false} /></div>
              <div><Label hint={formatBytes(outSize)}>Optimised</Label><Textarea readOnly value={output} className="h-[340px] text-[11px]" /></div>
            </div>
          )}
        </Card>

        <Card className="space-y-3">
          <Tabs value={out} onChange={setOut} tabs={[{ value: 'svg', label: 'SVG' }, { value: 'jsx', label: 'React JSX' }, { value: 'datauri', label: 'Data URI' }, { value: 'png', label: 'PNG' }]} />
          {out === 'svg' && <div className="flex flex-wrap gap-2"><CopyButton text={output} label="Copy SVG" /><Button size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(output, name.replace(/\.svg$/i, '') + '.min.svg', 'image/svg+xml')} disabled={!output}>Download optimised SVG</Button></div>}
          {out === 'jsx' && <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-40"><Input value={jsx.name} onChange={(e) => setJsx({ ...jsx, name: e.target.value })} placeholder="Component name" /></div>
              <Switch checked={jsx.typescript} onChange={(typescript) => setJsx({ ...jsx, typescript })} label="TypeScript" />
              <Switch checked={jsx.spreadProps} onChange={(spreadProps) => setJsx({ ...jsx, spreadProps })} label="{...props}" />
              <Switch checked={jsx.currentColor} onChange={(currentColor) => setJsx({ ...jsx, currentColor })} label="currentColor" />
              <Switch checked={jsx.removeDims} onChange={(removeDims) => setJsx({ ...jsx, removeDims })} label="Drop width/height" />
            </div>
            <Textarea readOnly value={jsxCode} className="h-56 text-[11px]" />
            <div className="flex gap-2"><CopyButton text={jsxCode} label="Copy component" /><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(jsxCode, `${jsx.name || 'Icon'}.${jsx.typescript ? 'tsx' : 'jsx'}`, 'text/plain')}>Download</Button></div>
          </>}
          {out === 'datauri' && <div className="space-y-3">
            <div><Label hint={formatBytes(dataUriEnc.length)}>URL-encoded (smallest, best for CSS)</Label><Textarea readOnly value={dataUriEnc} className="h-20 min-h-0 text-[11px]" /><div className="mt-2 flex gap-2"><CopyButton text={dataUriEnc} /><CopyButton text={`background-image: url("${dataUriEnc}");`} label="Copy as CSS" /></div></div>
            <div><Label hint={formatBytes(dataUri64.length)}>Base64</Label><Textarea readOnly value={dataUri64} className="h-20 min-h-0 text-[11px]" /><div className="mt-2 flex gap-2"><CopyButton text={dataUri64} /><CopyButton text={`<img src="${dataUri64}" alt="" />`} label="Copy <img>" /></div></div>
          </div>}
          {out === 'png' && <div className="space-y-3">
            <Slider label="Width" value={pngW} onChange={setPngW} min={16} max={4096} step={16} suffix={`px → ${pngW}×${Math.round((pngW * dims.h) / dims.w)}`} />
            <div className="flex flex-wrap gap-1.5">{[64, 128, 256, 512, 1024, 2048].map((s) => <button key={s} onClick={() => setPngW(s)} className={cn('rounded-lg px-2 py-1 font-mono text-xs cursor-pointer', pngW === s ? 'bg-accent text-white' : 'bg-surface-2 text-muted hover:text-fg')}>{s}</button>)}</div>
            <Button icon={<ImageIcon className="size-4" />} onClick={() => exportPng().catch((e) => toast(e.message, 'error'))} disabled={!output}>Download PNG</Button>
          </div>}
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <Slider label="Number precision" value={precision} onChange={setPrecision} min={0} max={8} suffix=" decimals" />
          <Switch checked={multipass} onChange={setMultipass} label="Multipass (optimise repeatedly)" />
          <Switch checked={pretty} onChange={setPretty} label="Prettify output" />
          <div>
            <div className="mb-2 flex items-center justify-between"><Label className="mb-0">Default plugins</Label><div className="flex gap-1"><button className="text-[11px] text-accent cursor-pointer" onClick={() => setDisabled(new Set())}>All</button><span className="text-muted">·</span><button className="text-[11px] text-accent cursor-pointer" onClick={() => setDisabled(new Set(PRESET.map((p) => p.name)))}>None</button></div></div>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
              {PRESET.map((p) => <Toggle key={p.name} on={!disabled.has(p.name)} label={p.label} onChange={(on) => setDisabled((s) => { const n = new Set(s); on ? n.delete(p.name) : n.add(p.name); return n })} />)}
            </div>
          </div>
          <div>
            <Label>Extra plugins</Label>
            <div className="space-y-1">{EXTRA.map((p) => <Toggle key={p.name} on={extras.has(p.name)} label={p.label} onChange={(on) => setExtras((s) => { const n = new Set(s); on ? n.add(p.name) : n.delete(p.name); return n })} />)}</div>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-2 text-xs text-muted hover:text-accent"><Upload className="size-4" />Load another SVG<input type="file" hidden accept=".svg,image/svg+xml" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        </Card>
      </aside>
    </div>
  )
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-surface-2 cursor-pointer">
      <span className={cn('grid size-4 shrink-0 place-items-center rounded border transition', on ? 'border-accent bg-accent text-white' : 'border-border')}>{on && <svg viewBox="0 0 12 12" className="size-3"><path d="M2.5 6.5l2.5 2.5 4.5-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}</span>
      <span className={on ? 'text-fg' : 'text-muted'}>{label}</span>
    </button>
  )
}

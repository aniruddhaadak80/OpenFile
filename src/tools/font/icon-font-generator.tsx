import { useMemo, useState } from 'react'
import { Shapes, Download, X } from 'lucide-react'
import { Button, Dropzone, Field, Input, ToolGrid, ErrorNote, Progress, useJob, Label } from '@/components/ui'
import { downloadBlob, zipFiles } from '@/lib/files'
import { svgIconToGlyph, iconName, type IconGlyph } from '@/lib/b14/font'
import { readFont, writeFont } from '@/lib/b2/fonts'
import { escapeHtml } from '@/lib/safe'
import { OpenButton } from '@/lib/b14/ui'
import { toast } from '@/components/toast'

const hex = (n: number) => n.toString(16)

export default function IconFontGenerator() {
  const [icons, setIcons] = useState<(IconGlyph & { svg: string })[]>([])
  const [family, setFamily] = useState('MyIcons')
  const [prefix, setPrefix] = useState('icon')
  const [start, setStart] = useState('e001')
  const job = useJob()
  const add = async (files: File[]) => {
    const next: (IconGlyph & { svg: string })[] = []
    for (const f of files) { try { const t = await f.text(); next.push({ ...svgIconToGlyph(t, iconName(f.name)), svg: t }) } catch (e: any) { toast(e?.message || `Skipped ${f.name}`, 'error') } }
    setIcons((p) => { const names = new Set(p.map((x) => x.name)); return [...p, ...next.map((n) => { let nm = n.name, k = 2; while (names.has(nm)) nm = `${n.name}-${k++}`; names.add(nm); return { ...n, name: nm } })] })
  }
  const first = parseInt(start, 16) || 0xe001
  const previews = useMemo(() => icons.map((i) => URL.createObjectURL(new Blob([i.svg], { type: 'image/svg+xml' }))), [icons])
  const build = () => job.run(async (setP) => {
    if (!icons.length) throw new Error('Add some SVG icons first.')
    const ot: any = await import('opentype.js'); const O = ot.Font ? ot : ot.default
    const glyphs = [new O.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 1000, path: new O.Path() })]
    icons.forEach((ic, i) => {
      const p = new O.Path()
      for (const c of ic.cmds) { const a = c.p; if (c.t === 'M') p.moveTo(a[0], a[1]); else if (c.t === 'L') p.lineTo(a[0], a[1]); else if (c.t === 'C') p.curveTo(a[0], a[1], a[2], a[3], a[4], a[5]); else if (c.t === 'Q') p.quadTo(a[0], a[1], a[2], a[3]); else p.close() }
      glyphs.push(new O.Glyph({ name: ic.name, unicode: first + i, advanceWidth: ic.width, path: p }))
    })
    const font = new O.Font({ familyName: family, styleName: 'Regular', unitsPerEm: 1000, ascender: 850, descender: -150, glyphs })
    const otf = new Uint8Array(font.toArrayBuffer()); setP(0.4)
    const safe = family.replace(/[^A-Za-z0-9_-]/g, '') || 'icons'
    const files: { name: string; data: Uint8Array | string }[] = [{ name: `${safe}.otf`, data: otf }]
    try { const { font: fe } = await readFont(otf.buffer, `${safe}.otf`); for (const t of ['ttf', 'woff', 'woff2'] as const) { files.push({ name: `${safe}.${t}`, data: (await writeFont(fe, t)) as Uint8Array }) } } catch { toast('Could not convert to TTF and WOFF, the OTF is still included', 'error') }
    setP(0.8)
    const srcs = files.filter((f) => f.name !== `${safe}.otf`).map((f) => { const ext = f.name.split('.').pop()!; return `url('${f.name}') format('${ext === 'ttf' ? 'truetype' : ext}')` })
    const css = `@font-face {\n  font-family: '${family}';\n  src: ${(srcs.length ? srcs : [`url('${safe}.otf') format('opentype')`]).join(',\n       ')};\n  font-weight: normal;\n  font-style: normal;\n  font-display: block;\n}\n\n[class^="${prefix}-"], [class*=" ${prefix}-"] {\n  font-family: '${family}' !important;\n  font-style: normal;\n  font-weight: normal;\n  line-height: 1;\n  -webkit-font-smoothing: antialiased;\n}\n\n${icons.map((ic, i) => `.${prefix}-${ic.name}::before { content: "\\${hex(first + i)}"; }`).join('\n')}\n`
    const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(family)}</title><link rel="stylesheet" href="${safe}.css"><style>body{font-family:system-ui;background:#0b0d10;color:#f5f3ee;padding:24px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}.c{border:1px solid #333;border-radius:12px;padding:16px;text-align:center}.c i{font-size:40px;color:#f5a524}.c code{display:block;margin-top:8px;font-size:12px;color:#aaa}</style></head><body><h1>${escapeHtml(family)}</h1><div class="g">${icons.map((ic, i) => `<div class="c"><i class="${escapeHtml(prefix)}-${escapeHtml(ic.name)}"></i><code>.${escapeHtml(prefix)}-${escapeHtml(ic.name)}</code><code>U+${hex(first + i).toUpperCase()}</code></div>`).join('')}</div></body></html>\n`
    files.push({ name: `${safe}.css`, data: css }, { name: 'demo.html', data: html }, { name: 'icons.json', data: JSON.stringify(icons.map((ic, i) => ({ name: ic.name, class: `${prefix}-${ic.name}`, codepoint: hex(first + i) })), null, 2) })
    downloadBlob(await zipFiles(files), `${safe}-iconfont.zip`); setP(1)
  })
  return (
    <ToolGrid
      main={<>
        {!icons.length ? <Dropzone multiple accept=".svg,image/svg+xml" onFiles={add} label="Drop SVG icons" sub="Filled single colour icons work best. Each file becomes one glyph with a CSS class named after the file." /> : <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">{icons.map((ic, i) => <div key={ic.name} className="group relative rounded-xl border border-border bg-surface p-3 text-center"><img src={previews[i]} alt="" className="mx-auto size-10 dark:invert" /><div className="mt-2 truncate font-mono text-[10px]" title={ic.name}>{ic.name}</div><div className="font-mono text-[10px] text-muted">U+{hex(first + i).toUpperCase()}</div><button type="button" aria-label={`Remove ${ic.name}`} onClick={() => setIcons(icons.filter((_, k) => k !== i))} className="absolute right-1 top-1 cursor-pointer rounded p-0.5 text-muted opacity-60 hover:text-danger group-hover:opacity-100"><X className="size-3.5" /></button></div>)}</div>
          <div className="flex gap-2"><OpenButton multiple accept=".svg" onFiles={add} label="Add icons" /><Button size="sm" variant="ghost" onClick={() => setIcons([])}>Clear</Button></div>
        </>}
      </>}
      side={<>
        <Field label="Font name"><Input value={family} onChange={(e) => setFamily(e.target.value.replace(/[^A-Za-z0-9 _-]/g, ''))} /></Field>
        <Field label="CSS class prefix"><Input value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'icon')} /></Field>
        <Field label="First code point (hex)"><Input value={start} onChange={(e) => setStart(e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 5))} className="font-mono" /></Field>
        <Label hint={`${icons.length} icons`}>Output</Label>
        <p className="text-xs text-muted">A ZIP with OTF, TTF, WOFF and WOFF2 fonts, a CSS file with one class per icon, a demo page and a JSON map.</p>
        {job.busy && <Progress value={job.progress} label="Building the font" />}
        <ErrorNote error={job.error} />
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!icons.length} loading={job.busy} onClick={build}>Build icon font</Button>
        <p className="flex gap-1.5 text-xs text-muted"><Shapes className="size-4 shrink-0" />Icons drawn only with strokes have no fill. Convert strokes to outlines in your design app first.</p>
      </>}
    />
  )
}

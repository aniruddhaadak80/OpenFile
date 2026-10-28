import { useEffect, useMemo, useRef, useState } from 'react'
import { Label, Segmented, Slider, Switch, Textarea, ToolGrid, ErrorNote, CopyButton, Input } from '@/components/ui'
import { useLib } from '@/tools/dev/_b5/shell'
import { DlButton } from '@/lib/bcat/kit'

const TEMPLATES: [string, string][] = [
  ['Quadratic formula', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'],
  ["Euler's identity", 'e^{i\\pi} + 1 = 0'],
  ['Gaussian integral', '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}'],
  ['Sum', '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}'],
  ['Matrix', 'A = \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'],
  ['Limit', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'],
  ['Bayes', 'P(A \\mid B) = \\frac{P(B \\mid A)\\,P(A)}{P(B)}'],
  ['Maxwell', '\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}'],
  ['Chemistry', '\\mathrm{2H_2 + O_2 \\rightarrow 2H_2O}'],
  ['Cases', 'f(x) = \\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}'],
]

export default function LatexEquation() {
  const katex = useLib('katex', async () => { await import('katex/dist/katex.min.css'); return (await import('katex')).default })
  const [tex, setTex] = useState(TEMPLATES[0][1])
  const [display, setDisplay] = useState(true)
  const [size, setSize] = useState(36)
  const [color, setColor] = useState('#F5A524')
  const [bg, setBg] = useState<'none' | 'dark' | 'light'>('none')
  const [scale, setScale] = useState<'2' | '3' | '4'>('3')
  const box = useRef<HTMLDivElement>(null)

  const out = useMemo(() => {
    if (!katex) return null
    try { return { html: katex.renderToString(tex, { displayMode: display, throwOnError: true, output: 'html' }), mathml: katex.renderToString(tex, { displayMode: display, throwOnError: true, output: 'mathml' }), err: null } }
    catch (e: any) { return { html: '', mathml: '', err: String(e.message).replace(/^KaTeX parse error: /, '') } }
  }, [katex, tex, display])
  useEffect(() => { if (box.current && out?.html) box.current.innerHTML = out.html }, [out])

  const bgColor = bg === 'dark' ? '#0a0a0a' : bg === 'light' ? '#ffffff' : undefined
  const image = async (kind: 'png' | 'svg' | 'jpg') => {
    const h2i = await import('html-to-image')
    // export a tight copy sized to the equation itself, so wide equations are never clipped and there is no empty band
    const node = document.createElement('div')
    node.innerHTML = out?.html ?? ''
    node.style.cssText = `position:fixed;left:-100000px;top:0;display:inline-block;width:max-content;padding:12px;margin:0;font-size:${size}px;color:${color};line-height:1.2`
    node.querySelectorAll<HTMLElement>('.katex-display').forEach((el) => { el.style.margin = '0' })
    document.body.appendChild(node)
    try {
      if (document.fonts?.ready) await document.fonts.ready
      const w = Math.ceil(node.scrollWidth), h = Math.ceil(node.scrollHeight)
      const opts = { pixelRatio: +scale, width: w, height: h, backgroundColor: bgColor ?? (kind === 'jpg' ? '#ffffff' : undefined), style: { position: 'static', left: '0', top: '0' } as any }
      if (kind === 'svg') { const url = await h2i.toSvg(node, opts); return new Blob([decodeURIComponent(url.split(',')[1])], { type: 'image/svg+xml' }) }
      const url = kind === 'png' ? await h2i.toPng(node, opts) : await h2i.toJpeg(node, { ...opts, quality: 0.95 })
      return (await fetch(url)).blob()
    } finally { node.remove() }
  }

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div><Label>LaTeX</Label><Textarea value={tex} onChange={(e) => setTex(e.target.value)} className="min-h-28 font-mono" spellCheck={false} aria-label="LaTeX source" /></div>
          <div className="flex flex-wrap gap-1.5">{TEMPLATES.map(([n, t]) => <button key={n} type="button" onClick={() => setTex(t)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:text-fg cursor-pointer">{n}</button>)}</div>
          <ErrorNote error={out?.err ?? null} />
          <div className="grid min-h-48 place-items-center overflow-auto rounded-2xl border border-border p-6 checker" style={{ background: bgColor }}>
            <div ref={box} style={{ fontSize: size, color }} aria-label="Rendered equation" />
          </div>
        </div>
      }
      side={
        <>
          <Switch checked={display} onChange={setDisplay} label="Display style (centred, larger limits)" />
          <Slider label="Size" value={size} onChange={setSize} min={14} max={96} suffix="px" />
          <div className="flex items-center gap-2"><Label className="mb-0 flex-1">Colour</Label><input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent" /><Input value={color} onChange={(e) => setColor(e.target.value)} className="w-28 font-mono" aria-label="Colour hex" /></div>
          <div><Label>Background</Label><Segmented value={bg} onChange={setBg} options={[{ value: 'none', label: 'Transparent' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'White' }]} /></div>
          <div><Label>Image scale</Label><Segmented value={scale} onChange={setScale} options={[{ value: '2', label: '2x' }, { value: '3', label: '3x' }, { value: '4', label: '4x' }]} /></div>
          {out && !out.err && (
            <>
              <div className="flex flex-wrap gap-2">
                <DlButton variant="primary" name="equation.png" data={() => image('png')}>PNG</DlButton>
                <DlButton name="equation.svg" mime="image/svg+xml" data={() => image('svg')}>SVG</DlButton>
                <DlButton name="equation.jpg" data={() => image('jpg')}>JPG</DlButton>
              </div>
              <div className="flex flex-wrap gap-2"><CopyButton text={out.mathml} label="Copy MathML" /><CopyButton text={tex} label="Copy LaTeX" /></div>
            </>
          )}
          <p className="text-xs text-muted">Rendered with KaTeX on your device. MathML pastes into Word, LibreOffice and web pages as real, editable maths.</p>
        </>
      }
    />
  )
}

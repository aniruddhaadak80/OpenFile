import { useEffect, useRef, useState } from 'react'
import { RefreshCw, FileType } from 'lucide-react'
import { Button, Dropzone, Label, Progress, Switch, ToolGrid, ErrorNote, cn, useJob, CopyButton } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { BatchResults, uid, type Result } from '@/tools/image/_img/kit'
import { FONT_MIME, fontFaceCss, fontNames, readFont, sniffFont, writeFont, type FontKind } from '@/lib/b2/fonts'

type Out = Exclude<FontKind, 'otf'>
const OUTS: { id: Out; label: string; sub: string }[] = [
  { id: 'woff2', label: 'WOFF2', sub: 'Best for the web' },
  { id: 'woff', label: 'WOFF', sub: 'Older browsers' },
  { id: 'ttf', label: 'TTF', sub: 'Desktop, apps' },
  { id: 'eot', label: 'EOT', sub: 'Old Internet Explorer' },
  { id: 'svg', label: 'SVG font', sub: 'Legacy iOS, icon fonts' },
]
type Item = { id: string; file: File; kind: FontKind | null; family?: string; style?: string; glyphs?: number; previewFamily?: string; err?: string }

export default function FontConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [outs, setOuts] = useState<Out[]>(['woff2', 'woff'])
  const [hinting, setHinting] = useState(true)
  const [results, setResults] = useState<Result[] | null>(null)
  const [css, setCss] = useState('')
  const { busy, progress, error, run } = useJob()
  const faces = useRef<FontFace[]>([])
  useEffect(() => () => faces.current.forEach((f) => document.fonts.delete(f)), [])

  const add = (files: File[]) => run(async () => {
    setResults(null)
    for (const file of files) {
      const buf = await file.arrayBuffer()
      const it: Item = { id: uid(), file, kind: sniffFont(new Uint8Array(buf), file.name) }
      try {
        const { font } = await readFont(buf, file.name)
        const n = fontNames(font)
        it.family = n.family; it.style = n.style; it.glyphs = font.get().glyf?.length
        if (it.kind !== 'svg' && it.kind !== 'eot') {
          const fam = 'ofprev-' + it.id
          const ff = new FontFace(fam, buf); await ff.load().then(() => { document.fonts.add(ff); faces.current.push(ff); it.previewFamily = fam }).catch(() => {})
        }
      } catch (e: any) { it.err = e?.message || 'Could not read this font' }
      setItems((s) => [...s, it])
    }
  })

  const convert = () => run(async (setP) => {
    if (!outs.length) throw new Error('Pick at least one output format.')
    const res: Result[] = []; let cssAll = ''
    const ok = items.filter((i) => !i.err)
    for (let i = 0; i < ok.length; i++) {
      const it = ok[i]
      const { font } = await readFont(await it.file.arrayBuffer(), it.file.name)
      const n = fontNames(font)
      const made: { type: string; name: string }[] = []
      for (const o of outs) {
        const data = await writeFont(font, o, { hinting })
        const name = `${baseName(it.file.name)}.${o}`
        res.push({ id: it.id + o, name, blob: new Blob([data as BlobPart], { type: FONT_MIME[o] }), originalSize: it.file.size, note: `${(it.kind ?? '?').toUpperCase()} → ${o.toUpperCase()}` })
        made.push({ type: o, name })
      }
      cssAll += fontFaceCss(n.family, made, n.weight, n.italic) + '\n'
      setP((i + 1) / ok.length)
    }
    if (!res.length) throw new Error('No fonts could be converted.')
    res.push({ id: 'css', name: 'fonts.css', blob: new Blob([cssAll], { type: 'text/css' }), note: '@font-face rules' })
    setCss(cssAll); setResults(res)
  })

  const reset = () => { setItems([]); setResults(null); setCss('') }
  if (!items.length) return <Dropzone multiple accept=".ttf,.otf,.woff,.woff2,.eot,.svg" onFiles={add} label="Drop font files" sub="TTF, OTF, WOFF, WOFF2, EOT or SVG fonts · converted on your device" />
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center gap-3">
                  <FileType className="size-5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{it.file.name}</div><div className={cn('text-xs', it.err ? 'text-danger' : 'text-muted')}>{it.err ?? `${(it.kind ?? '').toUpperCase()} · ${it.family} ${it.style} · ${it.glyphs ?? '?'} glyphs · ${formatBytes(it.file.size)}`}</div></div>
                  <button onClick={() => setItems((s) => s.filter((x) => x.id !== it.id))} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-danger cursor-pointer">Remove</button>
                </div>
                {it.previewFamily && <div className="mt-2 truncate text-2xl" style={{ fontFamily: `'${it.previewFamily}'` }}>The quick brown fox jumps over the lazy dog 0123456789</div>}
              </div>
            ))}
          </div>
          <Dropzone compact multiple accept=".ttf,.otf,.woff,.woff2,.eot,.svg" onFiles={add} label="Add more fonts" />
        </>}
        side={<>
          <div>
            <Label hint={`${outs.length} selected`}>Convert to</Label>
            <div className="space-y-1.5">
              {OUTS.map((o) => (
                <button key={o.id} onClick={() => setOuts((a) => a.includes(o.id) ? a.filter((x) => x !== o.id) : [...a, o.id])} className={cn('flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left cursor-pointer', outs.includes(o.id) ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')} aria-pressed={outs.includes(o.id)}>
                  <span className="text-sm font-semibold">{o.label}</span><span className="text-[11px] text-muted">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <Switch checked={hinting} onChange={setHinting} label="Keep hinting (sharper on Windows)" />
          <p className="text-xs text-muted">OTF fonts are read and saved with TrueType outlines. A fonts.css file with ready-to-use @font-face rules is included.</p>
          {busy && <Progress value={progress} label="Converting" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<RefreshCw className="size-4" />} onClick={convert}>Convert {items.filter((i) => !i.err).length} font{items.length > 1 ? 's' : ''}</Button>
          <Button variant="ghost" className="w-full" onClick={reset}>Start over</Button>
        </>}
      />
      {results && <BatchResults results={results} zipName="fonts.zip" onReset={reset} title={`${results.length - 1} font files ready`}>
        <div className="rounded-xl border border-border bg-surface p-3"><div className="mb-2 flex items-center justify-between"><Label className="mb-0">@font-face CSS</Label><CopyButton text={css} /></div><pre className="max-h-60 overflow-auto font-mono text-xs scrollbar-thin">{css}</pre></div>
      </BatchResults>}
    </div>
  )
}

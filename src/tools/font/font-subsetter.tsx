import { useMemo, useState } from 'react'
import { Scissors } from 'lucide-react'
import { Button, Dropzone, Field, FileChip, Label, Segmented, Switch, Textarea, ToolGrid, ErrorNote, ResultCard, cn, useJob, CopyButton } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'

const RANGES: { id: string; label: string; ranges: [number, number][] }[] = [
  { id: 'basic', label: 'Basic Latin (A-Z, digits, punctuation)', ranges: [[0x20, 0x7e]] },
  { id: 'latin1', label: 'Latin-1 (Western European accents)', ranges: [[0xa0, 0xff]] },
  { id: 'latinext', label: 'Latin Extended-A (Central European)', ranges: [[0x100, 0x17f]] },
  { id: 'punct', label: 'Smart quotes, dashes, euro, bullets', ranges: [[0x2010, 0x2027], [0x2030, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122]] },
  { id: 'greek', label: 'Greek', ranges: [[0x370, 0x3ff]] },
  { id: 'cyrillic', label: 'Cyrillic', ranges: [[0x400, 0x4ff]] },
  { id: 'vietnamese', label: 'Vietnamese', ranges: [[0x102, 0x103], [0x110, 0x111], [0x128, 0x129], [0x168, 0x169], [0x1a0, 0x1a1], [0x1af, 0x1b0], [0x1ea0, 0x1ef9]] },
  { id: 'devanagari', label: 'Devanagari (Hindi, Marathi)', ranges: [[0x900, 0x97f]] },
  { id: 'bengali', label: 'Bengali', ranges: [[0x980, 0x9ff]] },
]

/** Parse "U+0020-007E, U+00A9, 41-5A" style ranges into code points. */
export function parseUnicodeRanges(s: string): number[] {
  const out: number[] = []
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const m = part.replace(/^u\+/i, '').match(/^([0-9a-f]+)(?:-(?:u\+)?([0-9a-f]+))?$/i)
    if (!m) continue
    const a = parseInt(m[1], 16), b = m[2] ? parseInt(m[2], 16) : a
    for (let c = Math.min(a, b); c <= Math.max(a, b) && out.length < 70000; c++) out.push(c)
  }
  return out
}

export default function FontSubsetter() {
  const [file, setFile] = useState<File | null>(null)
  const [buf, setBuf] = useState<ArrayBuffer | null>(null)
  const [info, setInfo] = useState('')
  const [text, setText] = useState('')
  const [sets, setSets] = useState<string[]>(['basic'])
  const [custom, setCustom] = useState('')
  const [fmt, setFmt] = useState<'woff2' | 'woff' | 'ttf'>('woff2')
  const [hinting, setHinting] = useState(false)
  const [result, setResult] = useState<{ blob: Blob; name: string; glyphs: number; css: string } | null>(null)
  const { busy, error, run } = useJob()

  const open = (f: File) => run(async () => {
    const b = await f.arrayBuffer()
    const { readFont, fontNames } = await import('@/lib/b2/fonts')
    const { font } = await readFont(b, f.name)
    const n = fontNames(font)
    setFile(f); setBuf(b); setInfo(`${n.family} ${n.style} · ${font.get().glyf.length} glyphs`); setResult(null)
  })

  const codes = useMemo(() => {
    const s = new Set<number>()
    for (const ch of text) s.add(ch.codePointAt(0)!)
    for (const id of sets) RANGES.find((r) => r.id === id)!.ranges.forEach(([a, b]) => { for (let c = a; c <= b; c++) s.add(c) })
    parseUnicodeRanges(custom).forEach((c) => s.add(c))
    return [...s].sort((a, b) => a - b)
  }, [text, sets, custom])

  const go = () => run(async () => {
    if (!buf || !file) return
    if (!codes.length) throw new Error('Add some characters or pick at least one range.')
    const { readFont, writeFont, fontNames, fontFaceCss, FONT_MIME } = await import('@/lib/b2/fonts')
    const { font } = await readFont(buf, file.name, { subset: codes, hinting })
    const out = await writeFont(font, fmt, { hinting })
    const name = `${baseName(file.name)}-subset.${fmt}`
    const n = fontNames(font)
    const ranges = compress(codes)
    const css = fontFaceCss(n.family, [{ type: fmt, name }], n.weight, n.italic).replace('font-display: swap;', `font-display: swap;\n  unicode-range: ${ranges};`)
    setResult({ blob: new Blob([out as BlobPart], { type: FONT_MIME[fmt] }), name, glyphs: font.get().glyf.length, css })
  })

  if (!file) return <div className="space-y-3"><Dropzone accept=".ttf,.otf,.woff,.woff2" onFiles={(f) => open(f[0])} label="Drop a font to subset" sub="Keep only the characters you use and save a tiny WOFF2" /><ErrorNote error={error} /></div>
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<div className="space-y-4">
          <FileChip file={file} extra={<span className="text-xs text-muted">{info}</span>} onRemove={() => { setFile(null); setResult(null) }} />
          <Field label="Characters to keep (paste your text)"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the text of your page, logo or app. Every character in it is kept." className="font-sans" /></Field>
          <div>
            <Label>Common ranges</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {RANGES.map((r) => <button key={r.id} onClick={() => setSets((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id])} aria-pressed={sets.includes(r.id)} className={cn('rounded-xl border px-3 py-2 text-left text-xs cursor-pointer', sets.includes(r.id) ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>{r.label}</button>)}
            </div>
          </div>
          <Field label="Extra unicode ranges"><Textarea value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="U+2190-21FF, U+2713" className="min-h-16" /></Field>
        </div>}
        side={<>
          <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-sm"><div className="text-xs text-muted">Characters selected</div><div className="text-2xl font-semibold">{codes.length.toLocaleString()}</div></div>
          <Field label="Output"><Segmented value={fmt} onChange={setFmt} options={[{ value: 'woff2', label: 'WOFF2' }, { value: 'woff', label: 'WOFF' }, { value: 'ttf', label: 'TTF' }]} /></Field>
          <Switch checked={hinting} onChange={setHinting} label="Keep hinting (bigger file)" />
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Scissors className="size-4" />} onClick={go}>Create subset</Button>
          <Button variant="ghost" className="w-full" onClick={() => { setFile(null); setResult(null) }}>Start over</Button>
        </>}
      />
      {result && <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} title={`Subset ready: ${result.glyphs} glyphs`}>
        <div className="rounded-xl border border-border bg-surface p-3"><div className="mb-2 flex items-center justify-between"><Label className="mb-0">@font-face CSS</Label><CopyButton text={result.css} /></div><pre className="overflow-auto font-mono text-xs">{result.css}</pre></div>
        <p className="mt-2 text-xs text-muted">{formatBytes(file.size)} → {formatBytes(result.blob.size)}. Characters not in the subset fall back to the next font in your CSS stack.</p>
      </ResultCard>}
    </div>
  )
}

function compress(codes: number[]) {
  const parts: string[] = []
  for (let i = 0; i < codes.length; i++) {
    let j = i; while (j + 1 < codes.length && codes[j + 1] === codes[j] + 1) j++
    const h = (n: number) => n.toString(16).toUpperCase()
    parts.push(i === j ? `U+${h(codes[i])}` : `U+${h(codes[i])}-${h(codes[j])}`); i = j
  }
  return parts.join(', ')
}

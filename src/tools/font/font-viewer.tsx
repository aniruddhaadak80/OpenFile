import { useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Dropzone, FileChip, Input, Label, Slider, Tabs, Textarea, ToolGrid, ErrorNote, cn, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'

type Tab = 'tester' | 'glyphs' | 'info' | 'features'
const PANGRAMS = ['The quick brown fox jumps over the lazy dog', 'Sphinx of black quartz, judge my vow', '0123456789 !?&@#%$*()[]{}', 'ÀÉÎÕÜ àéîõü ßæøœ ñ ç']

export default function FontViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [font, setFont] = useState<any>(null)
  const [family, setFamily] = useState('')
  const [tab, setTab] = useState<Tab>('tester')
  const [text, setText] = useState(PANGRAMS[0])
  const [size, setSize] = useState(48)
  const [lh, setLh] = useState(1.3)
  const [ls, setLs] = useState(0)
  const [feat, setFeat] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const { busy, error, run } = useJob()
  const faceRef = useRef<FontFace | null>(null)
  useEffect(() => () => { if (faceRef.current) document.fonts.delete(faceRef.current) }, [])

  const open = (f: File) => run(async () => {
    let buf = await f.arrayBuffer()
    const tag = String.fromCharCode(...new Uint8Array(buf.slice(0, 4)))
    if (tag === 'wOF2' || tag === 'wOFF') {
      const { readFont, writeFont } = await import('@/lib/b2/fonts')
      const { font: fe } = await readFont(buf, f.name)
      const out = await writeFont(fe, 'ttf') as Uint8Array
      buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
    }
    const opentype: any = await import('opentype.js')
    const parse = opentype.parse ?? opentype.default?.parse
    const ft = parse(buf)
    const fam = 'ofview-' + Math.random().toString(36).slice(2, 8)
    const face = new FontFace(fam, await f.arrayBuffer())
    await face.load(); document.fonts.add(face)
    if (faceRef.current) document.fonts.delete(faceRef.current)
    faceRef.current = face
    setFile(f); setFont(ft); setFamily(fam); setSel(null); setPage(0); setFeat({})
  })

  const names = useMemo(() => {
    if (!font) return [] as [string, string][]
    const n = font.names ?? {}
    const get = (k: string) => { const v = n[k] ?? n.windows?.[k] ?? n.macintosh?.[k]; return v ? (v.en ?? Object.values(v)[0]) as string : '' }
    return ([['Family', get('fontFamily')], ['Style', get('fontSubfamily')], ['Full name', get('fullName')], ['Version', get('version')], ['Designer', get('designer')], ['Manufacturer', get('manufacturer')], ['Copyright', get('copyright')], ['Licence', get('license')], ['Licence URL', get('licenseURL')], ['Description', get('description')]] as [string, string][]).filter(([, v]) => v)
  }, [font])
  const metrics = useMemo(() => font ? [['Units per em', font.unitsPerEm], ['Ascender', font.ascender], ['Descender', font.descender], ['Glyphs', font.numGlyphs], ['Weight class', font.tables?.os2?.usWeightClass ?? '-'], ['x-height', font.tables?.os2?.sxHeight ?? '-'], ['Cap height', font.tables?.os2?.sCapHeight ?? '-'], ['Line gap', font.tables?.hhea?.lineGap ?? '-'], ['Italic angle', font.tables?.post?.italicAngle ?? 0], ['Monospaced', font.tables?.post?.isFixedPitch ? 'Yes' : 'No'], ['Outlines', font.outlinesFormat === 'cff' ? 'CFF (PostScript)' : 'TrueType']] as [string, string | number][] : [], [font])
  const features = useMemo(() => {
    if (!font) return [] as string[]
    const set = new Set<string>()
    for (const t of ['gsub', 'gpos']) font.tables?.[t]?.features?.forEach((f: any) => set.add(f.tag))
    return [...set].sort()
  }, [font])
  const glyphs = useMemo(() => {
    if (!font) return [] as { i: number; name: string; unicode?: number }[]
    const out: { i: number; name: string; unicode?: number }[] = []
    for (let i = 0; i < font.numGlyphs; i++) { const g = font.glyphs.get(i); out.push({ i, name: g.name ?? `glyph${i}`, unicode: g.unicode }) }
    const s = q.trim().toLowerCase()
    return s ? out.filter((g) => g.name.toLowerCase().includes(s) || (g.unicode !== undefined && (String.fromCodePoint(g.unicode) === q.trim() || g.unicode.toString(16).padStart(4, '0') === s.replace(/^u\+/, '')))) : out
  }, [font, q])
  const PER = 120
  const featCss = Object.entries(feat).filter(([, v]) => v).map(([k]) => `"${k}" 1`).join(', ') || 'normal'

  const glyphSvg = (i: number, px: number) => {
    const g = font.glyphs.get(i)
    const scale = px / font.unitsPerEm
    const path = g.getPath(0, 0, px)
    const adv = Math.max(1, (g.advanceWidth ?? font.unitsPerEm) * scale)
    return { d: path.toPathData(2), w: adv, asc: font.ascender * scale, desc: font.descender * scale, g }
  }

  if (!font || !file) return <div className="space-y-3"><Dropzone accept=".ttf,.otf,.woff,.woff2" onFiles={(f) => open(f[0])} label="Drop a font to inspect" sub="TTF, OTF, WOFF or WOFF2 · glyphs, metrics, OpenType features and a type tester" /><ErrorNote error={error} /></div>
  const g = sel !== null ? glyphSvg(sel, 200) : null
  return (
    <ToolGrid
      main={<div className="space-y-4">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'tester', label: 'Type tester' }, { value: 'glyphs', label: `Glyphs (${font.numGlyphs})` }, { value: 'info', label: 'Info' }, { value: 'features', label: `Features (${features.length})` }]} />
        {tab === 'tester' && <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">{PANGRAMS.map((p) => <button key={p} onClick={() => setText(p)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent cursor-pointer">{p.slice(0, 18)}...</button>)}</div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-20 font-sans text-sm" aria-label="Sample text" />
          <div className="overflow-hidden rounded-2xl border border-border bg-surface p-5" style={{ fontFamily: `'${family}'`, fontSize: size, lineHeight: lh, letterSpacing: `${ls}em`, fontFeatureSettings: featCss, overflowWrap: 'anywhere' }}>{text}</div>
          {[72, 36, 24, 16, 12].map((s) => <div key={s} className="flex items-baseline gap-3 border-b border-border pb-2"><span className="w-10 shrink-0 font-mono text-[10px] text-muted">{s}px</span><span className="truncate" style={{ fontFamily: `'${family}'`, fontSize: s, fontFeatureSettings: featCss }}>{text}</span></div>)}
        </div>}
        {tab === 'glyphs' && <div className="space-y-3">
          <Input placeholder="Search by name, character or code (e.g. A, u+00e9, ampersand)" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 lg:grid-cols-10">
            {glyphs.slice(page * PER, page * PER + PER).map((gl) => {
              const s = glyphSvg(gl.i, 40)
              return <button key={gl.i} onClick={() => setSel(gl.i)} title={`${gl.name}${gl.unicode !== undefined ? ' U+' + gl.unicode.toString(16).toUpperCase().padStart(4, '0') : ''}`} className={cn('flex aspect-square flex-col items-center justify-between rounded-lg border p-1 cursor-pointer', sel === gl.i ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>
                <svg viewBox={`0 ${-s.asc} ${Math.max(s.w, 1)} ${s.asc - s.desc}`} className="h-3/4 w-full text-fg"><path d={s.d} fill="currentColor" /></svg>
                <span className="w-full truncate text-center font-mono text-[9px] text-muted">{gl.unicode !== undefined ? gl.unicode.toString(16).toUpperCase().padStart(4, '0') : gl.i}</span>
              </button>
            })}
          </div>
          {glyphs.length > PER && <div className="flex items-center justify-center gap-2 text-sm"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-muted">{page + 1} / {Math.ceil(glyphs.length / PER)}</span><Button size="sm" variant="outline" disabled={(page + 1) * PER >= glyphs.length} onClick={() => setPage(page + 1)}>Next</Button></div>}
        </div>}
        {tab === 'info' && <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">{names.map(([k, v]) => <div key={k} className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs"><div className="text-muted">{k}</div><div className="break-words">{v}</div></div>)}</div>
          <div className="grid grid-cols-2 content-start gap-1.5">{metrics.map(([k, v]) => <div key={k} className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs"><div className="text-muted">{k}</div><div className="font-medium">{String(v)}</div></div>)}</div>
        </div>}
        {tab === 'features' && <div className="space-y-3">
          {!features.length && <p className="text-sm text-muted">This font has no OpenType layout features.</p>}
          <div className="flex flex-wrap gap-1.5">{features.map((f) => <button key={f} onClick={() => setFeat((s) => ({ ...s, [f]: !s[f] }))} aria-pressed={!!feat[f]} className={cn('rounded-lg border px-2.5 py-1 font-mono text-xs cursor-pointer', feat[f] ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted')}>{f}</button>)}</div>
          {features.length > 0 && <p className="text-xs text-muted">Turn features on to see them in the type tester (for example liga, smcp, onum, tnum, ss01).</p>}
          <div className="rounded-2xl border border-border bg-surface p-5 text-4xl" style={{ fontFamily: `'${family}'`, fontFeatureSettings: featCss }}>{text}</div>
        </div>}
      </div>}
      side={<>
        <FileChip file={file} extra={<span className="text-xs text-muted">{formatBytes(file.size)}</span>} onRemove={() => { setFile(null); setFont(null) }} />
        {tab === 'tester' && <><Slider label="Size" value={size} onChange={setSize} min={8} max={200} suffix=" px" /><Slider label="Line height" value={lh} onChange={setLh} min={0.8} max={2.5} step={0.05} /><Slider label="Letter spacing" value={ls} onChange={setLs} min={-0.1} max={0.5} step={0.01} suffix=" em" /></>}
        {g && sel !== null && <div className="space-y-2">
          <Label>Glyph {sel}</Label>
          <div className="rounded-xl border border-border bg-surface-2/40 p-3">
            <svg viewBox={`-10 ${-g.asc - 10} ${g.w + 20} ${g.asc - g.desc + 20}`} className="mx-auto h-48 w-full text-fg">
              <line x1={-10} x2={g.w + 10} y1={0} y2={0} stroke="#2dd4bf" strokeWidth={0.8} />
              <line x1={-10} x2={g.w + 10} y1={-g.asc} y2={-g.asc} stroke="#F5A524" strokeWidth={0.6} strokeDasharray="3 3" />
              <line x1={-10} x2={g.w + 10} y1={-g.desc} y2={-g.desc} stroke="#F5A524" strokeWidth={0.6} strokeDasharray="3 3" />
              <line x1={0} x2={0} y1={-g.asc - 10} y2={-g.desc + 10} stroke="#888" strokeWidth={0.5} /><line x1={g.w} x2={g.w} y1={-g.asc - 10} y2={-g.desc + 10} stroke="#888" strokeWidth={0.5} />
              <path d={g.d} fill="currentColor" />
            </svg>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]"><span className="text-muted">Name</span><span className="truncate">{g.g.name}</span><span className="text-muted">Unicode</span><span>{g.g.unicode !== undefined ? 'U+' + g.g.unicode.toString(16).toUpperCase().padStart(4, '0') : 'none'}</span><span className="text-muted">Advance</span><span>{g.g.advanceWidth}</span></div>
          </div>
          <Button size="sm" variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={() => { const s = glyphSvg(sel, 512); downloadBlob(new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${-s.asc} ${s.w} ${s.asc - s.desc}"><path d="${s.d}"/></svg>`], { type: 'image/svg+xml' }), `${baseName(file.name)}-${g.g.name || sel}.svg`) }}>Save glyph as SVG</Button>
        </div>}
        <ErrorNote error={error} />
        {busy && <p className="text-xs text-muted">Reading font...</p>}
        <Button variant="ghost" className="w-full" onClick={() => { setFile(null); setFont(null) }}>Open another font</Button>
      </>}
    />
  )
}

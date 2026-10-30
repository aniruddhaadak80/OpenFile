import { useEffect, useState } from 'react'
import { PencilLine, Download } from 'lucide-react'
import { Button, Dropzone, Field, Input, Select, Switch, ToolGrid, ErrorNote, Progress, useJob } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { readFont, writeFont, FONT_MIME } from '@/lib/b2/fonts'

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({ value: String(w), label: `${w} ${['Thin', 'Extra Light', 'Light', 'Regular', 'Medium', 'Semi Bold', 'Bold', 'Extra Bold', 'Black'][w / 100 - 1]}` }))
const ps = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '').slice(0, 63) || 'Font'

export default function FontRenamer() {
  const [file, setFile] = useState<File | null>(null)
  const [font, setFont] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [f, setF] = useState({ family: '', style: 'Regular', version: '', copyright: '', designer: '', weight: '400', italic: false })
  const [out, setOut] = useState<'ttf' | 'woff' | 'woff2'>('woff2')
  const job = useJob()
  useEffect(() => {
    if (!file) return
    setErr(null)
    file.arrayBuffer().then((b) => readFont(b, file.name)).then(({ font }) => {
      const d = font.get(); const n = d.name || {}; const os2 = d['OS/2'] || {}
      setFont(font)
      setF({ family: n.preferredFamily || n.fontFamily || '', style: n.preferredSubFamily || n.fontSubFamily || 'Regular', version: (n.version || '').replace(/^Version\s*/i, ''), copyright: n.copyright || '', designer: n.designer || '', weight: String(Math.round((os2.usWeightClass || 400) / 100) * 100 || 400), italic: !!((os2.fsSelection ?? 0) & 1) })
    }).catch((e) => setErr(e?.message || 'Could not read this font.'))
  }, [file])
  const save = () => job.run(async (setP) => {
    if (!font || !file) return
    const d = font.get()
    const n = d.name || (d.name = {})
    const full = `${f.family} ${f.style}`.trim()
    const legacyStyle = /^(regular|bold|italic|bold italic)$/i.test(f.style) ? f.style : f.italic ? 'Italic' : 'Regular'
    Object.assign(n, { fontFamily: /^(regular|bold|italic|bold italic)$/i.test(f.style) ? f.family : full, fontSubFamily: legacyStyle, preferredFamily: f.family, preferredSubFamily: f.style, fullName: full, postScriptName: `${ps(f.family)}-${ps(f.style)}`, uniqueSubFamily: `${f.version || '1.000'};${ps(f.family)}-${ps(f.style)}`, version: `Version ${f.version || '1.000'}`, copyright: f.copyright, designer: f.designer })
    const os2 = d['OS/2'] || (d['OS/2'] = {})
    os2.usWeightClass = +f.weight
    let sel = (os2.fsSelection ?? 0) & ~0x61
    if (f.italic) sel |= 1
    if (+f.weight >= 700 && /bold/i.test(f.style)) sel |= 0x20
    if (!f.italic && !(sel & 0x20)) sel |= 0x40
    os2.fsSelection = sel
    if (d.head) d.head.macStyle = (+f.weight >= 700 && /bold/i.test(f.style) ? 1 : 0) | (f.italic ? 2 : 0)
    font.set(d); setP(0.5)
    const bytes = await writeFont(font, out)
    downloadBlob(new Blob([bytes as BlobPart], { type: FONT_MIME[out] }), `${ps(f.family)}-${ps(f.style)}.${out}`); setP(1)
  })
  if (!file) return <Dropzone accept=".ttf,.otf,.woff,.woff2,.eot" onFiles={(x) => setFile(x[0])} label="Drop a font" sub="Rename the family and style, set the weight and italic flag, and fix the version, copyright and designer fields. Useful when two fonts clash in a design app." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setFont(null) }} />
        <ErrorNote error={err} />
        {font && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Family name"><Input value={f.family} onChange={(e) => setF({ ...f, family: e.target.value })} /></Field>
          <Field label="Style"><Input value={f.style} onChange={(e) => setF({ ...f, style: e.target.value })} placeholder="Regular, Bold, Light Italic" /></Field>
          <Field label="Weight"><Select value={f.weight} onChange={(v) => setF({ ...f, weight: v })} options={WEIGHTS} /></Field>
          <Field label="Version"><Input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="1.000" /></Field>
          <Field label="Designer"><Input value={f.designer} onChange={(e) => setF({ ...f, designer: e.target.value })} /></Field>
          <Field label="Copyright"><Input value={f.copyright} onChange={(e) => setF({ ...f, copyright: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Switch checked={f.italic} onChange={(v) => setF({ ...f, italic: v })} label="Italic" /></div>
        </div>}
        {font && <p className="text-sm">Apps will show it as <b>{f.family || '...'}</b>, style <b>{f.style}</b>. PostScript name <span className="font-mono">{ps(f.family)}-{ps(f.style)}</span>.</p>}
      </>}
      side={<>
        <Field label="Save as"><Select value={out} onChange={(v) => setOut(v as 'ttf' | 'woff' | 'woff2')} options={[{ value: 'woff2', label: 'WOFF2 (web)' }, { value: 'woff', label: 'WOFF' }, { value: 'ttf', label: 'TTF (desktop)' }]} /></Field>
        {job.busy && <Progress value={job.progress} label="Writing font" />}
        <ErrorNote error={job.error} />
        <Button className="w-full" icon={<Download className="size-4" />} disabled={!font || !f.family.trim()} loading={job.busy} onClick={save}>Download renamed font</Button>
        <p className="flex gap-1.5 text-xs text-muted"><PencilLine className="size-4 shrink-0" />Only the name and style tables change, the glyphs stay the same. Respect the font licence: some licences do not allow renaming or require a new name for changed versions.</p>
      </>}
    />
  )
}

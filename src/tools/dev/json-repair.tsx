import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Button, Segmented, Select } from '@/components/ui'
import { Bar, Status, TwoPane, useStored, useLib, useDebounced } from './_b5/shell'

type Mode = 'repair' | 'json5-to-json' | 'json-to-json5'
const SAMPLE = `{
  // comments are fine
  name: 'OpenFile',
  tools: [ "pdf", "image", "video", ],
  'free': True,
  note: "a line
  break",
  size: 1_000,
  nested: { ok: None
`

function toJson5(v: unknown, indent: string, quote: "'" | '"', level = 0): string {
  const pad = indent.repeat(level + 1), end = indent.repeat(level)
  const str = (s: string) => quote + s.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote).replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + quote
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return String(v)
  if (typeof v === 'string') return str(v)
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + toJson5(x, indent, quote, level + 1)).join(',\n')},\n${end}]` : '[]'
  const e = Object.entries(v as Record<string, unknown>)
  return e.length ? `{\n${e.map(([k, x]) => `${pad}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : str(k)}: ${toJson5(x, indent, quote, level + 1)}`).join(',\n')},\n${end}}` : '{}'
}

export default function JsonRepair() {
  const [input, setInput] = useStored('b10:jsonfix:in', SAMPLE)
  const [mode, setMode] = useState<Mode>('repair')
  const [indent, setIndent] = useState<'2' | '4' | 'tab' | '0'>('2')
  const libs = useLib('b10-jsonrepair', async () => ({ repair: (await import('jsonrepair')).jsonrepair, JSON5: (await import('json5')).default }))
  const src = useDebounced(input, 150)
  const res = useMemo(() => {
    if (!libs || !src.trim()) return { out: '' }
    const ind = indent === 'tab' ? '\t' : ' '.repeat(Number(indent))
    try {
      if (mode === 'json-to-json5') return { out: toJson5(JSON.parse(src), ind || '  ', "'") }
      let parsed: unknown, fixed = false
      if (mode === 'json5-to-json') parsed = libs.JSON5.parse(src)
      else { try { parsed = JSON.parse(src) } catch { parsed = JSON.parse(libs.repair(src)); fixed = true } }
      return { out: JSON.stringify(parsed, null, ind), fixed }
    } catch (e) { return { err: (e as Error).message, out: '' } }
  }, [libs, src, mode, indent])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'repair', label: 'Repair broken JSON' }, { value: 'json5-to-json', label: 'JSON5 / JSONC to JSON' }, { value: 'json-to-json5', label: 'JSON to JSON5' }]} />
        <Select aria-label="Indent" value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tabs' }, { value: '0', label: 'Minified' }]} className="w-32" />
        <Button size="sm" variant="ghost" className="ml-auto" icon={<ArrowLeftRight className="size-4" />} disabled={!res.out} onClick={() => setInput(res.out)}>Use result as input</Button>
      </Bar>
      {!libs && <Status kind="info">Loading the parser...</Status>}
      {'err' in res && res.err && <Status kind="err">{mode === 'repair' ? 'This could not be repaired: ' : 'Could not parse: '}{res.err}</Status>}
      {'fixed' in res && res.out && <Status kind="ok">{res.fixed ? 'Repaired. Quotes, commas, comments, Python constants and missing brackets were fixed.' : 'This was already valid JSON. It has been formatted.'}</Status>}
      <TwoPane input={input} setInput={setInput} inputTitle={mode === 'json-to-json5' ? 'JSON' : 'Broken JSON, JSON5 or JSONC'} accept=".json,.json5,.jsonc,.txt,application/json" output={res.out} outputLang="json" outputTitle={mode === 'json-to-json5' ? 'JSON5' : 'Valid JSON'} outName={mode === 'json-to-json5' ? 'data.json5' : 'data.json'} outMime="application/json" />
    </div>
  )
}

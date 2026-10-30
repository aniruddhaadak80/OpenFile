import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Download, FileCode2 } from 'lucide-react'
import { Button, Select, Switch, Segmented, Input, CopyButton } from '@/components/ui'
import { downloadBlob, formatBytes, baseName } from '@/lib/files'
import { Bar, Status, Pane, CodeArea, CodeView, OpenFileButton, useStored } from '../dev/_b5/shell'
import { FORMATS, formatFromName, sniffText, loadLibs, parseData, serializeData, defaultOpts, type DataFormat, type Libs, type ConvOpts } from '@/lib/b5/dataconv'

const SAMPLE = `{
  "project": "OpenFile",
  "version": 3,
  "private": false,
  "owners": [
    { "name": "Asha", "role": "maintainer", "since": 2024 },
    { "name": "Ravi", "role": "reviewer", "since": 2025 }
  ],
  "settings": { "theme": "dark", "locale": "en-IN" }
}`

const fmtLabel = (f: DataFormat) => FORMATS.find((x) => x.id === f)!.label
const hexPreview = (b: Uint8Array) => Array.from(b.slice(0, 2048), (x) => x.toString(16).padStart(2, '0')).join(' ').replace(/((?:\S\S ){16})/g, '$1\n') + (b.length > 2048 ? '\n…' : '')

export default function DataConverter() {
  const [libs, setLibs] = useState<Libs | null>(null)
  const [text, setText] = useStored('b5:dataconv:text', SAMPLE)
  const [bin, setBin] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [from, setFrom] = useState<'auto' | DataFormat>('auto')
  const [to, setTo] = useStored<DataFormat>('b5:dataconv:to', 'yaml')
  const [opts, setOpts] = useState<ConvOpts>(defaultOpts)
  const [srcName, setSrcName] = useState('data')
  useEffect(() => { loadLibs().then(setLibs).catch(() => setLibs(null)) }, [])

  const effFrom: DataFormat = from !== 'auto' ? from : bin ? (formatFromName(bin.name) ?? 'msgpack') : sniffText(text)

  const res = useMemo(() => {
    if (!libs) return null
    const input = bin ? bin.bytes : text
    if (!bin && !text.trim()) return null
    try {
      const v = parseData(effFrom, input, libs, opts)
      const out = serializeData(to, v, libs, opts)
      return { out }
    } catch (e: any) { return { err: e?.message || String(e) } }
  }, [libs, text, bin, effFrom, to, opts])

  const meta = FORMATS.find((f) => f.id === to)!
  const outText = res && 'out' in res && typeof res.out === 'string' ? res.out : null
  const outBytes = res && 'out' in res && res.out instanceof Uint8Array ? res.out : null

  const openFile = async (f: File) => {
    const fmt = formatFromName(f.name)
    setSrcName(baseName(f.name))
    if (fmt && FORMATS.find((x) => x.id === fmt)?.binary) { setBin({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); setFrom(fmt) }
    else { setBin(null); setText(await f.text()); setFrom(fmt ?? 'auto') }
  }
  const swap = () => {
    if (outText != null) { setBin(null); setText(outText); setFrom(to); setTo(effFrom) }
    else if (outBytes) { setBin({ name: `${srcName}.${meta.ext}`, bytes: outBytes }); setFrom(to); setTo(effFrom) }
  }
  const download = () => {
    if (!res || !('out' in res)) return
    downloadBlob(new Blob([res.out as BlobPart], { type: meta.mime }), `${srcName}.${meta.ext}`)
  }
  const set = <K extends keyof ConvOpts>(k: K, v: ConvOpts[K]) => setOpts((o) => ({ ...o, [k]: v }))

  return (
    <div className="space-y-4">
      <Bar>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">From</span>
          <Select aria-label="From format" value={from} onChange={(v) => setFrom(v as any)} options={[{ value: 'auto', label: `Auto (${fmtLabel(effFrom)})` }, ...FORMATS.map((f) => ({ value: f.id, label: f.label }))]} className="w-44" />
        </div>
        <Button size="sm" variant="outline" icon={<ArrowLeftRight className="size-4" />} onClick={swap} disabled={!res || !('out' in res)} aria-label="Swap input and output">Swap</Button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">To</span>
          <Select aria-label="To format" value={to} onChange={setTo} options={FORMATS.map((f) => ({ value: f.id, label: f.label }))} className="w-40" />
        </div>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => { setBin(null); setText(SAMPLE); setFrom('auto') }}>Sample</Button>
          <OpenFileButton accept=".json,.yaml,.yml,.xml,.toml,.ini,.cfg,.conf,.csv,.tsv,.ndjson,.jsonl,.msgpack,.mpk,.cbor,.bson,text/*" onFile={openFile} />
        </div>
      </Bar>

      <Bar className="text-sm">
        <Segmented value={String(opts.indent) as '0' | '2' | '4'} onChange={(v) => set('indent', Number(v))} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: '0', label: 'Minified' }]} />
        {(to === 'csv' || to === 'tsv' || effFrom === 'csv' || effFrom === 'tsv') && <>
          <Switch checked={opts.flatten} onChange={(v) => set('flatten', v)} label="Flatten nested keys (a.b)" />
          <Switch checked={opts.csvHeader} onChange={(v) => set('csvHeader', v)} label="Header row" />
        </>}
        {(to === 'xml' || effFrom === 'xml') && <label className="flex items-center gap-2"><span className="text-xs text-muted">XML root</span><Input value={opts.xmlRoot} onChange={(e) => set('xmlRoot', e.target.value.replace(/[^\w.-]/g, '') || 'root')} className="h-8 w-28" /></label>}
      </Bar>

      {!libs ? <Status kind="info">Loading converters…</Status>
        : !res ? <Status kind="info">Paste data or open a file. Binary formats (MessagePack, CBOR, BSON) are opened as files.</Status>
          : 'err' in res ? <Status kind="err">Could not read this as {fmtLabel(effFrom)}: {res.err}</Status>
            : <Status kind="ok">{fmtLabel(effFrom)} converted to {fmtLabel(to)}{outBytes ? ` · ${formatBytes(outBytes.length)}` : outText ? ` · ${formatBytes(new Blob([outText]).size)}` : ''}</Status>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title={bin ? `${fmtLabel(effFrom)} file` : fmtLabel(effFrom)} className="h-[520px]" actions={<Button size="sm" variant="ghost" onClick={() => { setBin(null); setText('') }}>Clear</Button>}>
          {bin ? (
            <div className="space-y-3 p-4">
              <div className="text-sm"><span className="font-medium">{bin.name}</span> <span className="text-muted">· {formatBytes(bin.bytes.length)}</span></div>
              <pre className="scrollbar-thin max-h-[400px] overflow-auto rounded-lg bg-surface-2/50 p-3 font-mono text-[11px] leading-5 text-muted">{hexPreview(bin.bytes)}</pre>
            </div>
          ) : <CodeArea value={text} onChange={(v) => { setText(v) }} placeholder="Paste JSON, YAML, XML, TOML, INI, CSV or NDJSON" />}
        </Pane>
        <Pane title={meta.label} className="h-[520px]" actions={res && 'out' in res ? <>{outText != null && <CopyButton text={outText} variant="ghost" />}<Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={download}>Download</Button></> : null}>
          {outText != null ? <CodeView code={outText} lang={to === 'json' || to === 'ndjson' ? 'json' : 'generic'} className="h-full" />
            : outBytes ? <div className="space-y-3 p-4"><div className="text-sm text-muted">Binary output, {formatBytes(outBytes.length)}. Hex preview:</div><pre className="scrollbar-thin max-h-[400px] overflow-auto rounded-lg bg-surface-2/50 p-3 font-mono text-[11px] leading-5">{hexPreview(outBytes)}</pre></div>
              : <div className="grid h-full place-items-center p-6 text-sm text-muted">Output appears here</div>}
        </Pane>
      </div>
      <p className="text-xs text-muted">Notes: TOML and BSON need an object at the top level, so arrays are wrapped as <code className="font-mono">items</code>. TOML has no null, so null values are dropped. XML attributes use the <code className="font-mono">@_</code> prefix.</p>
    </div>
  )
}

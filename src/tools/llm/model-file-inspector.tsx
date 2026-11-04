import { useMemo, useState } from 'react'
import { Dropzone, Input, Label, ToolGrid, Empty, ErrorNote, Segmented } from '@/components/ui'
import { FileBar, Stat, Stats } from '@/lib/cf/ui'
import { parseGguf, parseSafetensors, sniffModel, NeedMore, fmtParams, fmtBytes, type ModelInfo } from '@/lib/r15/llm'
import { Panel, fmtNum, SampleButton } from '@/lib/r15/ui'
import { DlButton, toCsv, Bars } from '@/lib/bcat/kit'

const LIMIT = 512 * 1024 * 1024
async function inspect(f: File, onStatus: (s: string) => void): Promise<ModelInfo> {
  const head = new Uint8Array(await f.slice(0, 16).arrayBuffer())
  const kind = sniffModel(head) ?? (/\.gguf$/i.test(f.name) ? 'gguf' : /\.safetensors$/i.test(f.name) ? 'safetensors' : null)
  if (!kind) throw new Error('This is not a GGUF or safetensors model file.')
  let n = kind === 'gguf' ? 4 * 1024 * 1024 : 1024 * 1024
  for (;;) {
    const len = Math.min(n, f.size)
    onStatus(`Reading the first ${fmtBytes(len)} of ${fmtBytes(f.size)}`)
    const buf = await f.slice(0, len).arrayBuffer()
    try { return kind === 'gguf' ? parseGguf(buf) : parseSafetensors(buf) }
    catch (e) {
      if (!(e instanceof NeedMore)) throw e
      if (len >= f.size) throw new Error('The file ends before its header does. It may be cut short.')
      if (e.bytes > LIMIT) throw new Error('The header is larger than 512 MB, which is not normal for a model file.')
      n = Math.max(e.bytes, n * 2)
    }
  }
}
const val = (v: any): string => v && typeof v === 'object' && 'array' in v ? `[${v.length.toLocaleString()} ${v.array}s] ${v.items.slice(0, 6).map((x: any) => JSON.stringify(x)).join(', ')}${v.length > 6 ? ', ...' : ''}` : typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '...' : JSON.stringify(v)

export default function ModelFileInspector() {
  const [file, setFile] = useState<File | null>(null), [info, setInfo] = useState<ModelInfo | null>(null)
  const [status, setStatus] = useState(''), [error, setError] = useState<string | null>(null), [q, setQ] = useState(''), [tab, setTab] = useState<'meta' | 'tensors'>('meta')
  const open = async (f: File) => {
    setFile(f); setInfo(null); setError(null)
    try { setInfo(await inspect(f, setStatus)) } catch (e: any) { setError(e?.message || String(e)) } finally { setStatus('') }
  }
  const dtypes = useMemo(() => { const m = new Map<string, number>(); for (const t of info?.tensors ?? []) m.set(t.dtype, (m.get(t.dtype) ?? 0) + t.params); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, value: Math.round((v / Math.max(1, info!.params)) * 1000) / 10 })) }, [info])
  const ql = q.toLowerCase()
  const meta = Object.entries(info?.meta ?? {}).filter(([k, v]) => !ql || k.toLowerCase().includes(ql) || String(val(v)).toLowerCase().includes(ql))
  const tensors = (info?.tensors ?? []).filter((t) => !ql || t.name.toLowerCase().includes(ql))
  return (
    <ToolGrid
      main={<>
        {!file ? <><Dropzone accept=".gguf,.safetensors" onFiles={(f) => f[0] && open(f[0])} label="Drop a GGUF or safetensors model file" sub="Only the header at the start of the file is read, so even 70 GB files open in a second. Nothing is uploaded." /><SampleButton id="gguf" what="model file" onFiles={(f) => f[0] && open(f[0])} /></>
          : <FileBar name={file.name} size={file.size} onReset={() => { setFile(null); setInfo(null); setError(null) }} />}
        {status && <p className="text-sm text-muted" role="status">{status}</p>}
        <ErrorNote error={error} />
        {info ? <>
          <Stats cols={4}>
            <Stat label="Format" value={info.format} sub={info.version ? `version ${info.version}` : undefined} />
            <Stat label="Parameters" value={fmtParams(info.params)} sub={`${fmtNum(info.tensors.length)} tensors`} />
            <Stat label="Header" value={fmtBytes(info.headerBytes)} sub={file ? `${((info.headerBytes / file.size) * 100).toFixed(3)}% of the file` : undefined} />
            <Stat label="Bits per weight" value={file && info.params ? ((file.size * 8) / info.params).toFixed(2) : '-'} sub="file size over parameters" />
          </Stats>
          <Panel title="Summary"><dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{Object.entries(info.summary).map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1"><dt className="text-muted">{k}</dt><dd className="min-w-0 truncate text-right font-medium" title={v}>{v}</dd></div>)}</dl></Panel>
          {dtypes.length > 0 && <Panel title="Weights by type" hint="share of parameters"><Bars items={dtypes} unit="%" /></Panel>}
          <div className="flex flex-wrap items-center gap-2"><Segmented value={tab} onChange={setTab} options={[{ value: 'meta', label: `Metadata (${Object.keys(info.meta).length})` }, { value: 'tensors', label: `Tensors (${info.tensors.length})` }]} /><Input aria-label="Filter" className="max-w-xs" placeholder="Filter by name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {tab === 'meta' ? <div className="max-h-[28rem] overflow-auto rounded-xl border border-border scrollbar-thin"><table className="w-full text-left text-xs"><tbody>{meta.map(([k, v]) => <tr key={k} className="odd:bg-surface-2/30"><td className="border-b border-border/60 px-2 py-1 font-mono whitespace-nowrap align-top">{k}</td><td className="border-b border-border/60 px-2 py-1 font-mono break-all">{val(v)}</td></tr>)}</tbody></table></div>
            : <div className="max-h-[28rem] overflow-auto rounded-xl border border-border scrollbar-thin"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-surface-2"><tr><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Shape</th><th className="px-2 py-1.5">Type</th><th className="px-2 py-1.5 text-right">Parameters</th></tr></thead><tbody>{tensors.slice(0, 3000).map((t) => <tr key={t.name} className="odd:bg-surface-2/30"><td className="border-b border-border/60 px-2 py-1 font-mono break-all">{t.name}</td><td className="border-b border-border/60 px-2 py-1 font-mono whitespace-nowrap">{t.shape.join(' x ')}</td><td className="border-b border-border/60 px-2 py-1 font-mono">{t.dtype}</td><td className="border-b border-border/60 px-2 py-1 text-right font-mono">{fmtNum(t.params)}</td></tr>)}</tbody></table></div>}
        </> : !file && <Empty>Drop a model to see its architecture, quantization, context length, tokenizer and every tensor.</Empty>}
      </>}
      side={<>
        <Label>Downloads</Label>
        <DlButton className="w-full" disabled={!info} name={() => `${file?.name ?? 'model'}.header.json`} mime="application/json" data={() => JSON.stringify({ format: info!.format, version: info!.version, summary: info!.summary, metadata: info!.meta, tensors: info!.tensors }, null, 2)}>Header as JSON</DlButton>
        <DlButton className="w-full" disabled={!info} name={() => `${file?.name ?? 'model'}.tensors.csv`} mime="text/csv" data={() => toCsv([['name', 'shape', 'type', 'parameters'], ...info!.tensors.map((t) => [t.name, t.shape.join('x'), t.dtype, t.params])])}>Tensor list CSV</DlButton>
        <p className="text-xs text-muted">GGUF is the format llama.cpp, Ollama and LM Studio use. Safetensors is the Hugging Face weights format. Long lists such as the tokenizer vocabulary show their size and first items.</p>
      </>}
    />
  )
}

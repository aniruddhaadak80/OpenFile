import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Plus, Power, Search, Trash2, Upload, Wand2 } from 'lucide-react'
import { Button, Input, Select, Badge, CopyButton, cn } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import { Status, Pane, CodeArea, useStored, useDebounced } from './_b5/shell'
import { OPS, opById, runRecipe, isText, hexdump, utf8, text, type Step } from '@/lib/b5/encoding'

const PRESETS: { name: string; steps: Step[]; input: string }[] = [
  { name: 'Gzip then Base64', input: 'Compress me and make it safe to paste.', steps: [{ id: 'gzip', params: {} }, { id: 'to-b64', params: {} }] },
  { name: 'Base64 then Gunzip', input: 'H4sIAAAAAAAAA/NIzcnJV0grys9V8C9IzXPLzEkFACtqeFITAAAA', steps: [{ id: 'from-b64', params: {} }, { id: 'gunzip', params: {} }] },
  { name: 'Hex to text', input: '48 65 6c 6c 6f 20 4f 70 65 6e 46 69 6c 65', steps: [{ id: 'from-hex', params: {} }] },
  { name: 'XOR + hex', input: 'secret', steps: [{ id: 'xor', params: { key: 'k3y' } }, { id: 'to-hex', params: { sep: 'none' } }] },
  { name: 'Protobuf from Base64', input: 'CJYBEgd0ZXN0aW5n', steps: [{ id: 'from-b64', params: {} }, { id: 'proto-decode', params: {} }] },
  { name: 'Punycode a domain', input: 'bücher.example', steps: [{ id: 'puny-enc', params: {} }] },
]

export default function EncodingRecipes() {
  const [steps, setSteps] = useStored<Step[]>('b5:recipe:steps', PRESETS[0].steps)
  const [input, setInput] = useStored('b5:recipe:input', PRESETS[0].input)
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<{ out?: Uint8Array; err?: string; trace?: { name: string; size: number; err?: string }[] } | null>(null)
  const di = useDebounced(input, 150)

  useEffect(() => {
    let alive = true
    const data = file ? file.bytes : utf8(di)
    runRecipe(data, steps).then((r) => alive && setRes(r)).catch((e) => alive && setRes({ err: e.message, trace: e.trace }))
    return () => { alive = false }
  }, [di, file, steps])

  const groups = useMemo(() => {
    const m = new Map<string, typeof OPS>()
    for (const o of OPS) if (!q || o.name.toLowerCase().includes(q.toLowerCase())) { if (!m.has(o.group)) m.set(o.group, []); m.get(o.group)!.push(o) }
    return [...m]
  }, [q])

  const add = (id: string) => setSteps([...steps, { id, params: {} }])
  const upd = (i: number, s: Partial<Step>) => setSteps(steps.map((x, k) => (k === i ? { ...x, ...s } : x)))
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= steps.length) return; const n = steps.slice(); [n[i], n[j]] = [n[j], n[i]]; setSteps(n) }
  const out = res?.out
  const outIsText = out ? isText(out) : true
  const outStr = out ? (outIsText ? text(out) : hexdump(out, 16, 8192)) : ''

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_300px_1fr]">
      {/* palette */}
      <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an operation" className="pl-8" aria-label="Find an operation" /></div>
        <div className="scrollbar-thin max-h-[560px] space-y-3 overflow-auto pr-1">
          {groups.map(([g, ops]) => (
            <div key={g}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{g}</div>
              {ops.map((o) => <button key={o.id} onClick={() => add(o.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-fg/90 hover:bg-surface-2"><Plus className="size-3.5 text-accent" />{o.name}</button>)}
            </div>
          ))}
        </div>
      </div>

      {/* recipe */}
      <div className="space-y-2">
        <div className="flex items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Recipe</span>
          <Select value="" onChange={(v) => { const p = PRESETS.find((x) => x.name === v); if (p) { setSteps(p.steps); setInput(p.input); setFile(null) } }} options={[{ value: '', label: 'Load a preset' }, ...PRESETS.map((p) => ({ value: p.name, label: p.name }))]} className="h-8 flex-1 text-xs" />
          <Button size="sm" variant="ghost" onClick={() => setSteps([])} disabled={!steps.length}>Clear</Button>
        </div>
        {steps.length === 0 && <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted"><Wand2 className="mx-auto mb-2 size-5" />Pick operations on the left. They run top to bottom.</div>}
        {steps.map((s, i) => {
          const op = opById(s.id); if (!op) return null
          const t = res?.trace?.[steps.slice(0, i + 1).filter((x) => !x.off).length - 1]
          const failed = !s.off && t?.err
          return (
            <div key={i} className={cn('rounded-xl border bg-surface p-2.5 transition', s.off ? 'border-border opacity-50' : failed ? 'border-danger/50' : 'border-border')}>
              <div className="flex items-center gap-1">
                <span className="grid size-5 place-items-center rounded bg-accent/15 font-mono text-[10px] text-accent">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{op.name}</span>
                <button onClick={() => move(i, -1)} className="rounded p-1 text-muted hover:text-fg" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                <button onClick={() => move(i, 1)} className="rounded p-1 text-muted hover:text-fg" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                <button onClick={() => upd(i, { off: !s.off })} className={cn('rounded p-1 hover:text-fg', s.off ? 'text-muted' : 'text-success')} aria-label={s.off ? 'Enable step' : 'Disable step'}><Power className="size-3.5" /></button>
                <button onClick={() => setSteps(steps.filter((_, k) => k !== i))} className="rounded p-1 text-muted hover:text-danger" aria-label="Remove step"><Trash2 className="size-3.5" /></button>
              </div>
              {op.params?.map((p) => (
                <label key={p.key} className="mt-2 flex items-center gap-2 text-xs"><span className="w-20 shrink-0 text-muted">{p.label}</span>
                  {p.type === 'select' ? <Select value={String(s.params[p.key] ?? p.default)} onChange={(v) => upd(i, { params: { ...s.params, [p.key]: v } })} options={p.options!} className="h-8 text-xs" />
                    : <Input type={p.type === 'number' ? 'number' : 'text'} value={String(s.params[p.key] ?? p.default)} onChange={(e) => upd(i, { params: { ...s.params, [p.key]: e.target.value } })} className="h-8 text-xs" />}
                </label>
              ))}
              {!s.off && t && <div className={cn('mt-1.5 text-[11px]', failed ? 'text-danger' : 'text-muted')}>{failed ? t.err : `${formatBytes(t.size)}`}</div>}
            </div>
          )
        })}
      </div>

      {/* io */}
      <div className="min-w-0 space-y-3">
        <Pane title={file ? `Input file: ${file.name}` : 'Input'} className="h-[260px]" actions={<>
          <label className="inline-flex"><input type="file" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }) }} /><span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-xl px-3 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg"><Upload className="size-4" />Open file</span></label>
          <Button size="sm" variant="ghost" onClick={() => { setFile(null); setInput('') }}>Clear</Button></>}>
          {file ? <pre className="scrollbar-thin h-full overflow-auto p-3 font-mono text-[11px] text-muted">{hexdump(file.bytes, 16, 4096)}</pre> : <CodeArea value={input} onChange={setInput} placeholder="Type or paste input" minRows={8} />}
        </Pane>
        {res?.err ? <Status kind="err">{res.err}</Status> : out && <Status kind="ok">Output {formatBytes(out.length)}{!outIsText && ' of binary data (shown as a hexdump)'}</Status>}
        <Pane title="Output" className="h-[300px]" actions={out ? <>
          {outIsText && <CopyButton text={outStr} variant="ghost" />}
          {!outIsText && <Badge color="#38BDF8">BINARY</Badge>}
          <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([out as BlobPart]), outIsText ? 'output.txt' : 'output.bin')}>Download</Button>
          <Button size="sm" variant="ghost" onClick={() => { if (outIsText) { setFile(null); setInput(outStr) } else setFile({ name: 'output.bin', bytes: out }); setSteps([]) }}>Use as input</Button>
        </> : null}>
          <pre className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[13px] leading-5">{outStr}</pre>
        </Pane>
      </div>
    </div>
  )
}

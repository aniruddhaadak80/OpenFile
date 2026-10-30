import { useState } from 'react'
import { Cpu } from 'lucide-react'
import { Dropzone, ToolGrid, ErrorNote, Label } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { parseWasm, type WasmInfo } from '@/lib/b14/dev'
import { KV, DataTable } from './_b5/shell'
import { DlButton } from '@/lib/bcat/kit'
import { Tile } from '@/lib/b14/ui'

export default function WasmInspector() {
  const [file, setFile] = useState<File | null>(null)
  const [w, setW] = useState<WasmInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [valid, setValid] = useState<string>('')
  const open = async (f: File) => {
    setErr(null)
    try {
      const b = new Uint8Array(await f.arrayBuffer())
      setW(parseWasm(b)); setFile(f)
      try { setValid(WebAssembly.validate(b) ? 'Valid module, this browser can compile it.' : 'This browser cannot compile it (it may use features that are not supported here).') } catch { setValid('') }
    } catch (e: any) { setErr(e?.message || 'Could not read this file.') }
  }
  if (!w || !file) return <><Dropzone accept=".wasm,application/wasm" onFiles={(f) => open(f[0])} label="Drop a .wasm file" sub="See sections, imports, exports with signatures, memory, function names and the toolchain that built it." /><ErrorNote error={err} /></>
  const report = () => JSON.stringify({ file: file.name, version: w.version, sections: w.sections, imports: w.imports, exports: w.exports, functions: w.functions, memories: w.memories, tables: w.tables, globals: w.globals, dataSegments: w.dataSegments, customSections: w.customs, producers: w.producers, features: w.features }, null, 2)
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setW(null); setFile(null) }} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Tile label="Imports" value={w.imports.length} /><Tile label="Exports" value={w.exports.length} /><Tile label="Functions" value={w.functions} sub="defined here" /><Tile label="Size" value={formatBytes(file.size)} /></div>
        <Label hint={String(w.exports.length)}>Exports</Label>
        <DataTable columns={['Name', 'Kind', 'Signature']} rows={w.exports.map((e) => [e.name, e.kind, e.type ?? ''])} className="max-h-72" />
        <Label hint={String(w.imports.length)}>Imports</Label>
        <DataTable columns={['Module', 'Name', 'Kind', 'Type']} rows={w.imports.map((i) => [i.module, i.name, i.kind, i.type ?? ''])} className="max-h-72" />
        <Label>Sections</Label>
        <DataTable columns={['Section', 'Size', 'Offset']} rows={w.sections.map((s) => [s.name, formatBytes(s.size), '0x' + s.offset.toString(16)])} className="max-h-72" />
      </>}
      side={<>
        <KV label="Binary version" value={String(w.version)} copy={false} />
        {valid && <p className="text-sm">{valid}</p>}
        {w.memories.map((m, i) => <KV key={i} label={`Memory ${i}`} value={m} copy={false} />)}
        {w.tables.map((m, i) => <KV key={i} label={`Table ${i}`} value={m} copy={false} />)}
        <KV label="Globals / data segments" value={`${w.globals} / ${w.dataSegments}`} copy={false} />
        {w.start != null && <KV label="Start function" value={String(w.start)} copy={false} />}
        {w.producers.length > 0 && <div><Label>Built with</Label>{w.producers.map((p) => <div key={p} className="text-xs">{p}</div>)}</div>}
        {w.features.length > 0 && <div><Label>Target features</Label><div className="text-xs">{w.features.join(', ')}</div></div>}
        {w.customs.length > 0 && <div><Label>Custom sections</Label><div className="font-mono text-xs">{w.customs.join(', ')}</div></div>}
        {w.names.size > 0 && <p className="text-xs text-muted">{w.names.size} function names found in the name section.</p>}
        <DlButton name={file.name.replace(/\.wasm$/i, '') + '-report.json'} mime="application/json" data={report}>Download report (JSON)</DlButton>
        <p className="flex gap-1.5 text-xs text-muted"><Cpu className="size-4 shrink-0" />The module is only read, never run.</p>
      </>}
    />
  )
}

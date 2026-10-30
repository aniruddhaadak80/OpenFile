import { useState } from 'react'
import { Button, Input, Select, Field, Badge } from '@/components/ui'
import { Bar, Status } from './_b5/shell'
import { downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { minimalFile } from '@/lib/b10/dev'

type Kind = 'random' | 'zeros' | 'txt' | 'csv' | 'json' | 'pdf' | 'png' | 'bmp' | 'wav' | 'zip' | 'svg' | 'html'
const KINDS: { value: Kind; label: string; ext: string; mime: string; exact: boolean }[] = [
  { value: 'random', label: 'Random bytes (.bin)', ext: 'bin', mime: 'application/octet-stream', exact: true },
  { value: 'zeros', label: 'Zero bytes (.bin)', ext: 'bin', mime: 'application/octet-stream', exact: true },
  { value: 'txt', label: 'Text (.txt)', ext: 'txt', mime: 'text/plain', exact: true },
  { value: 'csv', label: 'CSV table (.csv)', ext: 'csv', mime: 'text/csv', exact: false },
  { value: 'json', label: 'JSON array (.json)', ext: 'json', mime: 'application/json', exact: false },
  { value: 'pdf', label: 'Valid PDF (.pdf)', ext: 'pdf', mime: 'application/pdf', exact: false },
  { value: 'png', label: 'Valid PNG (.png)', ext: 'png', mime: 'image/png', exact: true },
  { value: 'bmp', label: 'Valid BMP image (.bmp)', ext: 'bmp', mime: 'image/bmp', exact: false },
  { value: 'wav', label: 'Valid WAV tone (.wav)', ext: 'wav', mime: 'audio/wav', exact: true },
  { value: 'zip', label: 'Valid ZIP (.zip)', ext: 'zip', mime: 'application/zip', exact: true },
  { value: 'svg', label: 'SVG image (.svg)', ext: 'svg', mime: 'image/svg+xml', exact: true },
  { value: 'html', label: 'HTML page (.html)', ext: 'html', mime: 'text/html', exact: true },
]
const UNITS = { B: 1, KB: 1000, KiB: 1024, MB: 1000 ** 2, MiB: 1024 ** 2, GB: 1000 ** 3, GiB: 1024 ** 3 }
type Unit = keyof typeof UNITS
const PRESETS: [string, number, Unit][] = [['1 KB', 1, 'KB'], ['100 KB', 100, 'KB'], ['1 MB', 1, 'MB'], ['5 MB', 5, 'MB'], ['10 MB', 10, 'MB'], ['25 MB', 25, 'MB'], ['100 MB', 100, 'MB'], ['1 GB', 1, 'GB']]
const MAX = 2 * 1024 ** 3

export default function DummyFileGenerator() {
  const [kind, setKind] = useState<Kind>('random')
  const [amount, setAmount] = useState('5')
  const [unit, setUnit] = useState<Unit>('MB')
  const [count, setCount] = useState('1')
  const [name, setName] = useState('test-file')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const size = Math.round(Number(amount) * UNITS[unit])
  const k = KINDS.find((x) => x.value === kind)!
  const n = Math.max(1, Math.min(100, Math.floor(Number(count)) || 1))
  const tooBigForType = !['random', 'zeros', 'txt'].includes(kind) && size > 300 * 1024 ** 2

  const make = (): Blob => {
    if (kind === 'zeros') return new Blob([new Uint8Array(size)])
    if (kind === 'random') {
      const parts: Uint8Array[] = []
      for (let left = size; left > 0;) { const c = new Uint8Array(Math.min(left, 1 << 20)); for (let o = 0; o < c.length; o += 65536) crypto.getRandomValues(c.subarray(o, Math.min(c.length, o + 65536))); parts.push(c); left -= c.length }
      return new Blob(parts as BlobPart[])
    }
    if (kind === 'txt' && size > 64 * 1024 ** 2) { const chunk = minimalFile('txt', 1 << 20); const parts: BlobPart[] = []; for (let left = size; left > 0; left -= chunk.length) parts.push((left >= chunk.length ? chunk : chunk.subarray(0, left)) as BlobPart); return new Blob(parts) }
    return new Blob([minimalFile(kind, size) as BlobPart], { type: k.mime })
  }

  const go = async () => {
    setMsg(null)
    if (!Number.isFinite(size) || size < 1) { setMsg({ kind: 'err', text: 'Enter a size of at least 1 byte.' }); return }
    if (size * n > MAX) { setMsg({ kind: 'err', text: `That is ${formatBytes(size * n)} in total. Keep it under 2 GiB so your browser does not run out of memory.` }); return }
    setBusy(true)
    await new Promise((r) => setTimeout(r, 30))
    try {
      if (n === 1) { const b = make(); downloadBlob(b, `${name || 'test-file'}.${k.ext}`, k.mime); setMsg({ kind: 'ok', text: `Made ${name}.${k.ext}, exactly ${b.size.toLocaleString()} bytes (${formatBytes(b.size)}).` }) }
      else {
        const files = await Promise.all(Array.from({ length: n }, async (_, i) => ({ name: `${name || 'test-file'}-${i + 1}.${k.ext}`, data: new Uint8Array(await make().arrayBuffer()) })))
        downloadBlob(await zipFiles(files), `${name || 'test-file'}-x${n}.zip`, 'application/zip')
        setMsg({ kind: 'ok', text: `Made ${n} files of ${formatBytes(files[0].data.length)} each, in one ZIP.` })
      }
    } catch (e) { setMsg({ kind: 'err', text: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="File type"><Select value={kind} onChange={setKind} options={KINDS.map(({ value, label }) => ({ value, label }))} /></Field>
        <Field label="File name"><Input value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]/g, ''))} /></Field>
        <Field label="Size" hint={Number.isFinite(size) ? `${size.toLocaleString()} bytes` : ''}>
          <div className="flex gap-2"><Input aria-label="Size" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="flex-1" /><Select aria-label="Size unit" value={unit} onChange={setUnit} options={Object.keys(UNITS) as Unit[]} className="w-24" /></div>
        </Field>
        <Field label="How many files" hint="More than one comes as a ZIP"><Input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" /></Field>
      </div>
      <Bar>
        {PRESETS.map(([l, a, u]) => <Button key={l} size="sm" variant={Number(amount) === a && unit === u ? 'secondary' : 'ghost'} onClick={() => { setAmount(String(a)); setUnit(u) }}>{l}</Button>)}
      </Bar>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={go} loading={busy} disabled={tooBigForType}>Generate {n > 1 ? `${n} files` : 'file'}</Button>
        <Badge>{k.exact ? 'Exact size' : 'Size is close to the target'}</Badge>
        {kind !== 'random' && kind !== 'zeros' && <span className="text-sm text-muted">The file opens in normal apps, so it also works for testing previews.</span>}
      </div>
      {tooBigForType && <Status kind="err">Typed files are capped at 300 MB. Use random bytes, zero bytes or text for bigger files.</Status>}
      {msg && <Status kind={msg.kind}>{msg.text}</Status>}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Button, Dropzone, Label, Progress, Select, Textarea, ToolGrid, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { parseSums, algoByLen } from '@/lib/bcat/privacy'
import { DlButton } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

type Algo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'BLAKE3'
const SUMS_RE = /(sums?|\.sha\d*|\.md5|checksums?)(\.txt)?$/i
async function hasher(a: Algo) {
  const h = await import('hash-wasm')
  return a === 'MD5' ? h.createMD5() : a === 'SHA-1' ? h.createSHA1() : a === 'SHA-256' ? h.createSHA256() : a === 'SHA-384' ? h.createSHA384() : a === 'SHA-512' ? h.createSHA512() : h.createBLAKE3()
}
async function hashFile(f: File, a: Algo, onP: (p: number) => void) {
  const h = await hasher(a); h.init()
  const CH = 8 << 20
  for (let o = 0; o < f.size; o += CH) { h.update(new Uint8Array(await f.slice(o, o + CH).arrayBuffer())); onP(Math.min(1, (o + CH) / f.size)) }
  return h.digest('hex')
}
interface Row { name: string; size: number; hash?: string; expected?: string; status: 'match' | 'mismatch' | 'unlisted' | 'missing' | 'done' }

export default function ChecksumVerifier() {
  const [files, setFiles] = useState<File[]>([])
  const [sums, setSums] = useState('')
  const [algo, setAlgo] = useState<Algo | 'auto'>('auto')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [prog, setProg] = useState<number | null>(null)

  const add = async (fs: File[]) => {
    const list = fs.filter((f) => !(SUMS_RE.test(f.name) && f.size < 2e6))
    for (const s of fs.filter((f) => SUMS_RE.test(f.name) && f.size < 2e6)) { const t = await s.text(); setSums((p) => (p ? p + '\n' : '') + t) }
    setFiles((p) => [...p, ...list]); setRows(null)
  }
  const expected = useMemo(() => parseSums(sums), [sums])
  const realAlgo: Algo = algo !== 'auto' ? algo : ((expected[0]?.algo || 'SHA-256') as Algo)

  const go = async () => {
    const out: Row[] = []
    const total = files.reduce((s, f) => s + f.size, 0) || 1
    let doneBytes = 0
    for (const f of files) {
      const hash = await hashFile(f, realAlgo, (p) => setProg((doneBytes + p * f.size) / total))
      doneBytes += f.size
      const byName = expected.find((e) => e.name && (e.name === f.name || e.name.split('/').pop() === f.name))
      const single = expected.length === 1 && !expected[0].name ? expected[0] : undefined
      const exp = byName ?? single ?? expected.find((e) => e.hash === hash)
      out.push({ name: f.name, size: f.size, hash, expected: exp?.hash, status: !expected.length ? 'done' : !exp ? 'unlisted' : exp.hash === hash ? 'match' : 'mismatch' })
    }
    for (const e of expected) if (e.name && !files.some((f) => f.name === e.name || e.name.split('/').pop() === f.name)) out.push({ name: e.name, size: 0, expected: e.hash, status: 'missing' })
    setRows(out); setProg(null)
  }

  const count = (s: Row['status']) => rows?.filter((r) => r.status === s).length ?? 0
  const LABEL = { match: 'Match', mismatch: 'Does not match', unlisted: 'Not in the list', missing: 'File not added', done: 'Hashed' }
  const COLOR = { match: 'text-success', mismatch: 'text-danger', unlisted: 'text-warn', missing: 'text-warn', done: 'text-muted' }

  if (!files.length && !sums) return <Dropzone multiple onFiles={add} label="Drop files to check (and their checksum list)" sub="Add SHA256SUMS, .sha256 or .md5 files too, or paste the expected hash next. Large files are read in chunks." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          {rows && expected.length > 0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Match" value={count('match')} /><Stat label="Mismatch" value={count('mismatch')} /><Stat label="Not listed" value={count('unlisted')} /><Stat label="Missing" value={count('missing')} /></div>}
          {prog != null && <Progress value={prog} label={`Hashing with ${realAlgo}`} />}
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {(rows ?? files.map((f) => ({ name: f.name, size: f.size, status: 'done' } as Row))).map((r, i) => (
              <div key={i} className="space-y-0.5 px-3 py-2 text-sm">
                <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>{r.size > 0 && <span className="text-xs text-muted">{formatBytes(r.size)}</span>}{rows && <span className={cn('text-xs font-semibold', COLOR[r.status])}>{LABEL[r.status]}</span>}</div>
                {r.hash && <div className="break-all font-mono text-[11px] text-muted">{r.hash}</div>}
                {r.status === 'mismatch' && <div className="break-all font-mono text-[11px] text-danger">expected {r.expected}</div>}
              </div>
            ))}
          </div>
          {!files.length && <p className="rounded-xl border border-border bg-surface-2/50 p-3 text-sm text-muted">Checksum list loaded ({expected.length} {expected.length === 1 ? 'hash' : 'hashes'}). Now add the files to check.</p>}
          <Dropzone compact multiple onFiles={add} label={files.length ? 'Add more files' : 'Add the files to check'} />
        </div>
      }
      side={
        <>
          <div><Label hint={expected.length ? `${expected.length} hashes` : ''}>Expected checksums (optional)</Label><Textarea value={sums} onChange={(e) => { setSums(e.target.value); setRows(null) }} placeholder={'Paste one hash, or a list like:\ne3b0c442...b855  file.iso'} className="min-h-28 text-[11px]" aria-label="Expected checksums" /></div>
          <div><Label hint={algo === 'auto' && expected[0] ? `detected ${algoByLen(expected[0].hash.length)}` : ''}>Algorithm</Label><Select value={algo} onChange={setAlgo} options={[{ value: 'auto', label: 'Auto (from the list, else SHA-256)' }, 'MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'BLAKE3']} /></div>
          <Button className="w-full" icon={<BadgeCheck className="size-4" />} loading={prog != null} disabled={!files.length} onClick={go}>{expected.length ? 'Verify' : 'Calculate'} {files.length} file{files.length > 1 ? 's' : ''}</Button>
          {rows && rows.some((r) => r.hash) && <DlButton className="w-full" name={`${realAlgo.replace('-', '').toUpperCase()}SUMS`} data={() => rows.filter((r) => r.hash).map((r) => `${r.hash}  ${r.name}`).join('\n') + '\n'}>Save checksum file</DlButton>}
          <Button variant="ghost" className="w-full" onClick={() => { setFiles([]); setRows(null); setSums('') }}>Start over</Button>
        </>
      }
    />
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Type, FileDigit, Hash, Download, X, ListChecks } from 'lucide-react'
import { Card, Field, Input, Textarea, Switch, Segmented, Select, CopyButton, Dropzone, Progress, ErrorNote, Button, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { Chip, useDebounced, downloadText } from './_dev/kit'
import { HASH_ALGOS, algoById, algosForLength, blobChunks, hashBytes, hashChunks, hexToB64, parseChecksumList, parseKey, type HashGroup, type HashResult, type KeyFormat } from '@/lib/b5/hashes'

const GROUPS: HashGroup[] = ['Classic', 'SHA-2', 'SHA-3', 'BLAKE', 'Checksum', 'Other']
const PRESETS: { label: string; ids: string[] }[] = [
  { label: 'Common', ids: ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'] },
  { label: 'Modern', ids: ['SHA-256', 'SHA3-256', 'BLAKE2b-512', 'BLAKE3'] },
  { label: 'Checksums', ids: ['CRC32', 'CRC32C', 'Adler-32', 'xxHash64', 'xxHash3'] },
  { label: 'All', ids: HASH_ALGOS.map((a) => a.id) },
]
type Out = 'hex' | 'HEX' | 'base64'
interface FileRow { id: number; file: File; res?: HashResult; took?: number; error?: string }
let seq = 0

export default function HashGenerator() {
  const [mode, setMode] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<FileRow[]>([])
  const [algos, setAlgos] = useState<string[]>(['MD5', 'SHA-1', 'SHA-256', 'SHA-512', 'SHA3-256', 'BLAKE3', 'CRC32'])
  const [useKey, setUseKey] = useState(false)
  const [keyStr, setKeyStr] = useState('')
  const [keyFmt, setKeyFmt] = useState<KeyFormat>('utf8')
  const [out, setOut] = useState<Out>('hex')
  const [expected, setExpected] = useState('')
  const [sumList, setSumList] = useState('')
  const [textRes, setTextRes] = useState<HashResult>({})
  const [busy, setBusy] = useState<{ name: string; p: number } | null>(null)
  const [sumAlgo, setSumAlgo] = useState('SHA-256')
  const dText = useDebounced(text, 120)
  const runId = useRef(0)

  const ordered = useMemo(() => HASH_ALGOS.filter((a) => algos.includes(a.id)).map((a) => a.id), [algos])
  const keyInfo = useMemo<{ key: Uint8Array | null; error: string | null }>(() => {
    if (!useKey) return { key: null, error: null }
    try { return { key: parseKey(keyStr, keyFmt), error: null } } catch (e) { return { key: null, error: (e as Error).message } }
  }, [useKey, keyStr, keyFmt])
  const key = useKey ? keyInfo.key : null
  const keyBlocked = useKey && !!keyInfo.error

  useEffect(() => {
    if (mode !== 'text' || keyBlocked) return
    let alive = true
    hashBytes(new TextEncoder().encode(dText), ordered, key).then((r) => alive && setTextRes(r)).catch(() => {})
    return () => { alive = false }
  }, [dText, mode, key, ordered.join(), keyBlocked])

  const hashAll = async (rows: FileRow[]) => {
    if (keyBlocked || !rows.length) return
    const my = ++runId.current
    for (const row of rows) {
      if (my !== runId.current) return
      setBusy({ name: row.file.name, p: 0 })
      const t0 = performance.now()
      try {
        const res = await hashChunks(blobChunks(row.file, (p) => setBusy({ name: row.file.name, p })), ordered, key)
        if (my !== runId.current) return
        setFiles((fs) => fs.map((f) => f.id === row.id ? { ...f, res, took: performance.now() - t0, error: undefined } : f))
      } catch (e) {
        setFiles((fs) => fs.map((f) => f.id === row.id ? { ...f, error: (e as Error).message || 'Could not read this file' } : f))
      }
    }
    if (my === runId.current) setBusy(null)
  }
  const addFiles = (list: File[]) => {
    const rows = list.map((file) => ({ id: ++seq, file }))
    setFiles((fs) => [...fs, ...rows])
    hashAll(rows)
  }
  useEffect(() => { if (mode === 'file' && files.length) hashAll(files) }, [key, ordered.join()])

  const fmt = (h: string) => (out === 'base64' ? hexToB64(h) : out === 'HEX' ? h.toUpperCase() : h)
  const exp = expected.trim().replace(/\s/g, '')
  const allResults: { label: string; res: HashResult }[] = mode === 'text' ? [{ label: 'text', res: textRes }] : files.filter((f) => f.res).map((f) => ({ label: f.file.name, res: f.res! }))
  const match = useMemo(() => {
    if (!exp) return null
    for (const { label, res } of allResults) for (const id of ordered) {
      const h = res[id]?.hex; if (!h) continue
      if (h.toLowerCase() === exp.toLowerCase().replace(/^0x/, '') || hexToB64(h) === exp) return { id, label }
    }
    return false
  }, [exp, allResults, ordered])
  const lenHint = exp && /^[0-9a-f]+$/i.test(exp) ? algosForLength(exp.length) : []

  const listCheck = useMemo(() => {
    const items = parseChecksumList(sumList)
    if (!items.length || mode !== 'file') return []
    return items.map((it) => {
      const row = files.find((f) => f.file.name === it.name) ?? (files.length === 1 && !it.name ? files[0] : undefined)
      if (!row?.res) return { ...it, status: 'missing' as const }
      const hit = ordered.find((id) => row.res![id]?.hex === it.hash)
      return { ...it, status: hit ? ('ok' as const) : ('bad' as const), algo: hit ?? it.algo }
    })
  }, [sumList, files, ordered, mode])

  const exportSums = () => {
    const lines = files.filter((f) => f.res?.[sumAlgo]?.hex).map((f) => `${f.res![sumAlgo].hex}  ${f.file.name}`)
    downloadText(lines.join('\n') + '\n', `checksums.${sumAlgo.toLowerCase().replace(/[^a-z0-9]/g, '')}`)
  }

  const HashRows = ({ res, compact }: { res: HashResult; compact?: boolean }) => (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      {ordered.map((id) => {
        const r = res[id]; const a = algoById(id)!
        const ok = match && match.id === id && r?.hex
        const label = key && a.keyed === 'hmac' ? `HMAC-${id}` : key && a.keyed === 'native' ? `${id} (keyed)` : id
        return (
          <motion.div layout key={id} className={cn('rounded-xl border bg-surface px-4 py-2.5 transition', ok ? 'border-success/50 bg-success/5' : 'border-border')}>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-accent">{label}</span>
              <span className="text-[10px] text-muted">{a.bits} bit</span>
              {ok && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" />matches</span>}
              <div className="ml-auto">{r?.hex && <CopyButton text={fmt(r.hex)} variant="ghost" />}</div>
            </div>
            <div className="break-all font-mono text-[13px] text-fg/90">{r?.hex ? fmt(r.hex) : <span className="text-muted">{r?.error ?? 'computing'}</span>}</div>
          </motion.div>
        )
      })}
    </div>
  )

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'text', label: <span className="flex items-center gap-1.5"><Type className="size-3.5" />Text</span> }, { value: 'file', label: <span className="flex items-center gap-1.5"><FileDigit className="size-3.5" />Files</span> }]} />
        {keyInfo.error && <ErrorNote error={keyInfo.error} />}
        {mode === 'text' ? (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text, hashes update as you type (UTF-8)" className="min-h-36" />
            {ordered.length ? <HashRows res={textRes} /> : <p className="text-sm text-muted">Pick at least one algorithm.</p>}
            {!text && <p className="text-xs text-muted">Empty input still has a hash, for example SHA-256 of "" is e3b0c442...b855.</p>}
          </>
        ) : (
          <div className="space-y-4">
            <Dropzone multiple compact={files.length > 0} onFiles={addFiles} label={files.length ? 'Add more files' : 'Drop files to hash'} sub="Any size. Files are read in 4 MB chunks, so memory stays low. Nothing is uploaded." />
            {busy && <Progress value={busy.p * 100} label={`Hashing ${busy.name}`} />}
            {files.map((f) => (
              <Card key={f.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileDigit className="size-4 shrink-0 text-accent" />
                  <span className="min-w-0 truncate text-sm font-medium" title={f.file.name}>{f.file.name}</span>
                  <span className="shrink-0 text-xs text-muted">{formatBytes(f.file.size)}{f.took != null && f.took > 0 && ` | ${(f.took / 1000).toFixed(2)}s`}</span>
                  <button aria-label={`Remove ${f.file.name}`} className="ml-auto rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}><X className="size-4" /></button>
                </div>
                {f.error ? <ErrorNote error={f.error} /> : f.res ? <HashRows res={f.res} compact /> : <p className="text-xs text-muted">Waiting</p>}
              </Card>
            ))}
            {files.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={sumAlgo} onChange={setSumAlgo} options={ordered.length ? ordered : ['SHA-256']} className="w-40" />
                <Button variant="outline" icon={<Download className="size-4" />} onClick={exportSums} disabled={!files.some((f) => f.res?.[sumAlgo]?.hex)}>Save checksum file</Button>
                <Button variant="ghost" onClick={() => { runId.current++; setBusy(null); setFiles([]) }}>Clear all</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted"><span>Algorithms</span><span className="normal-case">{ordered.length} picked</span></div>
            <div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.label} onClick={() => setAlgos(p.ids)} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-fg">{p.label}</button>)}</div>
            {GROUPS.map((g) => (
              <div key={g}>
                <div className="mb-1 mt-2 text-[10px] uppercase tracking-wider text-muted">{g}</div>
                <div className="flex flex-wrap gap-1.5">{HASH_ALGOS.filter((a) => a.group === g).map((a) => <span key={a.id} title={a.note}><Chip active={algos.includes(a.id)} onClick={() => setAlgos((s) => s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])}>{a.id}</Chip></span>)}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <Switch checked={useKey} onChange={setUseKey} label="Secret key (HMAC / keyed BLAKE)" />
            <AnimatePresence>{useKey && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-2 overflow-hidden">
                <Input value={keyStr} onChange={(e) => setKeyStr(e.target.value)} placeholder="Secret key" className="font-mono" aria-label="Secret key" />
                <Segmented value={keyFmt} onChange={setKeyFmt} options={[{ value: 'utf8', label: 'Text' }, { value: 'hex', label: 'Hex' }, { value: 'base64', label: 'Base64' }]} />
                <p className="text-[11px] leading-relaxed text-muted">SHA, MD, RIPEMD, Whirlpool and SM3 use HMAC. BLAKE2 and BLAKE3 use their own keyed mode. CRC and xxHash have no keyed form.</p>
              </motion.div>
            )}</AnimatePresence>
          </div>
          <Field label="Output">
            <Segmented value={out} onChange={setOut} options={[{ value: 'hex', label: 'hex' }, { value: 'HEX', label: 'HEX' }, { value: 'base64', label: 'Base64' }]} />
          </Field>
          <Field label="Compare with expected hash" hint={lenHint.length ? `Length fits: ${lenHint.slice(0, 4).join(', ')}` : undefined}>
            <Input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Paste a checksum to verify" className="font-mono text-xs" />
          </Field>
          <AnimatePresence>
            {match !== null && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className={cn('flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium', match ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                {match ? <><CheckCircle2 className="size-4 shrink-0" /><span className="min-w-0 truncate">Match, {match.id}{mode === 'file' ? ` (${match.label})` : ''}</span></> : <><XCircle className="size-4" />No match with any picked hash</>}
              </motion.div>
            )}
          </AnimatePresence>
          {mode === 'file' && (
            <Field label={<span className="flex items-center gap-1.5"><ListChecks className="size-3.5" />Verify a checksum file</span>} hint="Paste the contents of SHA256SUMS, .md5 or similar">
              <Textarea value={sumList} onChange={(e) => setSumList(e.target.value)} placeholder={'e3b0c442...  file.iso'} className="min-h-20 text-xs" />
            </Field>
          )}
          {listCheck.length > 0 && (
            <ul className="space-y-1 text-xs">
              {listCheck.map((it, i) => (
                <li key={i} className="flex items-center gap-2">
                  {it.status === 'ok' ? <CheckCircle2 className="size-3.5 shrink-0 text-success" /> : it.status === 'bad' ? <XCircle className="size-3.5 shrink-0 text-danger" /> : <span className="size-3.5 shrink-0 rounded-full border border-border" />}
                  <span className="min-w-0 truncate">{it.name || '(no name)'}</span>
                  <span className="ml-auto shrink-0 text-muted">{it.status === 'ok' ? it.algo : it.status === 'bad' ? 'mismatch' : 'file not added'}</span>
                </li>
              ))}
            </ul>
          )}
          {mode === 'file' && files.length > 0 && <Button variant="outline" className="w-full" icon={<Hash className="size-4" />} onClick={() => hashAll(files)} loading={!!busy}>Hash again</Button>}
        </Card>
      </aside>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Type, FileDigit, Hash } from 'lucide-react'
import { Card, Field, Input, Textarea, Switch, Segmented, CopyButton, Dropzone, FileChip, Progress, ErrorNote, Button, useJob, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { Chip, useDebounced } from './_dev/kit'

type Algo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
const ALGOS: Algo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']
const CJ: Record<Algo, string> = { MD5: 'MD5', 'SHA-1': 'SHA1', 'SHA-256': 'SHA256', 'SHA-384': 'SHA384', 'SHA-512': 'SHA512' }
const BIG = 256 * 1024 * 1024
const CHUNK = 4 * 1024 * 1024

const toHex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
const hexToB64 = (h: string) => { let s = ''; for (let i = 0; i < h.length; i += 2) s += String.fromCharCode(parseInt(h.slice(i, i + 2), 16)); return btoa(s) }
const loadCJ = () => import('crypto-js').then((m: any) => m.default ?? m)

async function hashBytes(bytes: Uint8Array, algos: Algo[], key: string | null, onP?: (p: number) => void): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const enc = new TextEncoder()
  for (const a of algos) {
    if (a === 'MD5') {
      const CryptoJS = await loadCJ()
      const h = key != null ? CryptoJS.algo.HMAC.create(CryptoJS.algo.MD5, CryptoJS.enc.Utf8.parse(key)) : CryptoJS.algo.MD5.create()
      for (let o = 0; o < bytes.length; o += CHUNK) { h.update(CryptoJS.lib.WordArray.create(bytes.subarray(o, o + CHUNK))); onP?.(o / bytes.length); if (bytes.length > CHUNK) await new Promise((r) => setTimeout(r)) }
      out[a] = h.finalize().toString()
    } else if (key != null) {
      const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: a }, false, ['sign'])
      out[a] = toHex(new Uint8Array(await crypto.subtle.sign('HMAC', k, bytes as BufferSource)))
    } else out[a] = toHex(new Uint8Array(await crypto.subtle.digest(a, bytes as BufferSource)))
  }
  return out
}

async function hashFile(file: File, algos: Algo[], key: string | null, setP: (p: number) => void) {
  if (file.size <= BIG) {
    const buf = new Uint8Array(file.size)
    for (let o = 0; o < file.size; o += CHUNK) { buf.set(new Uint8Array(await file.slice(o, o + CHUNK).arrayBuffer()), o); setP(0.6 * Math.min(1, (o + CHUNK) / file.size)) }
    return hashBytes(buf, algos, key, (p) => setP(0.6 + 0.4 * p))
  }
  // Huge file: incremental crypto-js for every algorithm (streams, constant memory)
  const CryptoJS = await loadCJ()
  const hs = algos.map((a) => key != null ? CryptoJS.algo.HMAC.create(CryptoJS.algo[CJ[a]], CryptoJS.enc.Utf8.parse(key)) : CryptoJS.algo[CJ[a]].create())
  for (let o = 0; o < file.size; o += CHUNK) {
    const wa = CryptoJS.lib.WordArray.create(new Uint8Array(await file.slice(o, o + CHUNK).arrayBuffer()))
    hs.forEach((h: any) => h.update(wa))
    setP(Math.min(1, (o + CHUNK) / file.size))
  }
  return Object.fromEntries(algos.map((a, i) => [a, hs[i].finalize().toString()]))
}

export default function HashGenerator() {
  const [mode, setMode] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [algos, setAlgos] = useState<Algo[]>(['MD5', 'SHA-1', 'SHA-256', 'SHA-512'])
  const [useHmac, setUseHmac] = useState(false)
  const [key, setKey] = useState('')
  const [upper, setUpper] = useState(false)
  const [b64, setB64] = useState(false)
  const [expected, setExpected] = useState('')
  const [res, setRes] = useState<Record<string, string>>({})
  const [took, setTook] = useState<number | null>(null)
  const job = useJob()
  const dText = useDebounced(text, 120)

  const k = useHmac ? key : null
  useEffect(() => {
    if (mode !== 'text') return
    let alive = true
    hashBytes(new TextEncoder().encode(dText), ALGOS, k).then((r) => alive && setRes(r))
    return () => { alive = false }
  }, [dText, mode, k])

  useEffect(() => { setRes({}); setTook(null) }, [mode])

  const runFile = async (f: File) => {
    setFile(f); setRes({}); setTook(null)
    const t0 = performance.now()
    const r = await job.run((setP) => hashFile(f, ALGOS.filter((a) => algos.includes(a)), k, setP))
    if (r) { setRes(r); setTook(performance.now() - t0) }
  }
  useEffect(() => { if (mode === 'file' && file && !job.busy) runFile(file) }, [k, algos.join()])

  const fmt = (h: string) => (b64 ? hexToB64(h) : upper ? h.toUpperCase() : h)
  const exp = expected.trim().replace(/\s/g, '')
  const match = useMemo(() => {
    if (!exp) return null
    for (const a of algos) { const h = res[a]; if (!h) continue; if (h.toLowerCase() === exp.toLowerCase() || hexToB64(h) === exp) return a }
    return false
  }, [exp, res, algos])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'text', label: <span className="flex items-center gap-1.5"><Type className="size-3.5" />Text</span> }, { value: 'file', label: <span className="flex items-center gap-1.5"><FileDigit className="size-3.5" />File</span> }]} />
        {mode === 'text' ? (
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text, hashes update as you type (UTF-8)" className="min-h-40" />
        ) : !file ? (
          <Dropzone onFiles={(f) => runFile(f[0])} label="Drop any file to hash" sub="Any size, large files are streamed in chunks. Nothing is uploaded." />
        ) : (
          <div className="space-y-3">
            <FileChip file={file} onRemove={() => { setFile(null); setRes({}) }} extra={took != null && <span className="text-xs text-muted">{(took / 1000).toFixed(2)}s · {formatBytes(file.size / (took / 1000))}/s</span>} />
            {job.busy && <Progress value={job.progress} label={`Hashing ${formatBytes(file.size)}…`} />}
            <ErrorNote error={job.error} />
          </div>
        )}

        <div className="space-y-2">
          {ALGOS.filter((a) => algos.includes(a)).map((a) => {
            const h = res[a]; const ok = match === a
            return (
              <motion.div layout key={a} className={cn('rounded-xl border bg-surface px-4 py-3 transition', ok ? 'border-success/50 bg-success/5' : 'border-border')}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wider text-accent">{useHmac ? 'HMAC-' : ''}{a}</span>
                  <span className="text-[10px] text-muted">{a === 'MD5' ? 128 : a === 'SHA-1' ? 160 : Number(a.slice(4))} bit</span>
                  {ok && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" />matches expected</span>}
                  <div className="ml-auto">{h && <CopyButton text={fmt(h)} variant="ghost" />}</div>
                </div>
                <div className="break-all font-mono text-[13px] text-fg/90">{h ? fmt(h) : <span className="text-muted">{job.busy ? 'computing…' : mode === 'file' ? '-' : ''}</span>}</div>
              </motion.div>
            )
          })}
        </div>
        {mode === 'text' && !text && <p className="text-xs text-muted">Empty input still has a hash, e.g. SHA-256 of "" is e3b0c442…b855.</p>}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Algorithms</div>
            <div className="flex flex-wrap gap-1.5">{ALGOS.map((a) => <Chip key={a} active={algos.includes(a)} onClick={() => setAlgos((s) => s.includes(a) ? s.filter((x) => x !== a) : [...s, a])}>{a}</Chip>)}</div>
          </div>
          <div className="space-y-3">
            <Switch checked={useHmac} onChange={setUseHmac} label="HMAC (keyed hash)" />
            <AnimatePresence>{useHmac && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Secret key" className="font-mono" /></motion.div>}</AnimatePresence>
          </div>
          <div className="flex flex-col gap-3">
            <Switch checked={upper} onChange={(v) => { setUpper(v); if (v) setB64(false) }} label="Uppercase hex" />
            <Switch checked={b64} onChange={(v) => { setB64(v); if (v) setUpper(false) }} label="Base64 output" />
          </div>
          <Field label="Compare with expected hash">
            <Input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Paste a checksum to verify" className="font-mono text-xs" />
          </Field>
          <AnimatePresence>
            {match !== null && (
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className={cn('flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium', match ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                {match ? <><CheckCircle2 className="size-4" />Match, {match}</> : <><XCircle className="size-4" />No match with any selected hash</>}
              </motion.div>
            )}
          </AnimatePresence>
          {mode === 'file' && file && <Button variant="outline" className="w-full" icon={<Hash className="size-4" />} onClick={() => runFile(file)} loading={job.busy}>Re-hash</Button>}
        </Card>
      </aside>
    </div>
  )
}

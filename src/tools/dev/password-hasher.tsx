import { useState } from 'react'
import { Eye, EyeOff, Hash, ShieldCheck, ShieldX } from 'lucide-react'
import { Button, Input, Segmented, Select, Slider, Label, Progress, CopyButton, Textarea } from '@/components/ui'
import { Bar, Status, KV } from './_b5/shell'

type Algo = 'bcrypt' | 'argon2id' | 'argon2i' | 'argon2d' | 'scrypt' | 'pbkdf2'
const ALGOS: { value: Algo; label: string }[] = [
  { value: 'argon2id', label: 'Argon2id (recommended)' }, { value: 'bcrypt', label: 'bcrypt' }, { value: 'scrypt', label: 'scrypt' },
  { value: 'pbkdf2', label: 'PBKDF2' }, { value: 'argon2i', label: 'Argon2i' }, { value: 'argon2d', label: 'Argon2d' },
]
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const randSalt = (n = 16) => crypto.getRandomValues(new Uint8Array(n))

function detect(h: string): Algo | null {
  if (/^\$2[abxy]\$\d\d\$/.test(h)) return 'bcrypt'
  const m = h.match(/^\$(argon2id|argon2i|argon2d)\$/); if (m) return m[1] as Algo
  if (h.startsWith('$scrypt$')) return 'scrypt'
  if (h.startsWith('$pbkdf2-')) return 'pbkdf2'
  return null
}

export default function PasswordHasher() {
  const [mode, setMode] = useState<'hash' | 'verify'>('hash')
  const [algo, setAlgo] = useState<Algo>('argon2id')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [rounds, setRounds] = useState(10)
  const [mem, setMem] = useState(19) // MiB for argon2
  const [iters, setIters] = useState(2)
  const [par, setPar] = useState(1)
  const [logN, setLogN] = useState(15)
  const [pbIters, setPbIters] = useState(600000)
  const [pbHash, setPbHash] = useState<'sha256' | 'sha512' | 'sha1'>('sha256')
  const [out, setOut] = useState<{ hash: string; ms: number } | null>(null)
  const [hashIn, setHashIn] = useState('')
  const [verdict, setVerdict] = useState<{ ok: boolean; ms: number; algo: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  const doHash = async () => {
    setErr(null); setOut(null); setBusy(true); setProg(0)
    const t0 = performance.now()
    try {
      let hash = ''
      const hw = await import('hash-wasm')
      if (algo === 'bcrypt') {
        const bcrypt = (await import('bcryptjs')).default
        hash = await (bcrypt.hash as any)(pw, await bcrypt.genSalt(rounds), undefined, (p: number) => setProg(p))
      } else if (algo.startsWith('argon2')) {
        const fn = (hw as any)[algo] as typeof hw.argon2id
        hash = await fn({ password: pw, salt: randSalt(), parallelism: par, iterations: iters, memorySize: mem * 1024, hashLength: 32, outputType: 'encoded' })
      } else if (algo === 'scrypt') {
        const salt = randSalt()
        const key = await hw.scrypt({ password: pw, salt, costFactor: 2 ** logN, blockSize: 8, parallelism: par, hashLength: 32, outputType: 'binary' })
        hash = `$scrypt$ln=${logN},r=8,p=${par}$${b64(salt)}$${b64(key)}`
      } else {
        const salt = randSalt()
        const hf = pbHash === 'sha512' ? hw.createSHA512() : pbHash === 'sha1' ? hw.createSHA1() : hw.createSHA256()
        const key = await hw.pbkdf2({ password: pw, salt, iterations: pbIters, hashLength: pbHash === 'sha512' ? 64 : 32, hashFunction: hf, outputType: 'binary' })
        hash = `$pbkdf2-${pbHash}$i=${pbIters}$${b64(salt)}$${b64(key)}`
      }
      setOut({ hash, ms: performance.now() - t0 }); setProg(1)
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  const doVerify = async () => {
    setErr(null); setVerdict(null); setBusy(true)
    const h = hashIn.trim(); const a = detect(h); const t0 = performance.now()
    try {
      if (!a) throw new Error('Unknown hash format. Paste a bcrypt ($2b$...), Argon2 ($argon2id$...), scrypt ($scrypt$...) or PBKDF2 ($pbkdf2-sha256$...) string.')
      const hw = await import('hash-wasm')
      let ok = false
      if (a === 'bcrypt') ok = await (await import('bcryptjs')).default.compare(pw, h)
      else if (a.startsWith('argon2')) ok = await hw.argon2Verify({ password: pw, hash: h })
      else if (a === 'scrypt') {
        const m = h.match(/^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/); if (!m) throw new Error('Could not read the scrypt parameters.')
        const want = unb64(m[5])
        const key = await hw.scrypt({ password: pw, salt: unb64(m[4]), costFactor: 2 ** Number(m[1]), blockSize: Number(m[2]), parallelism: Number(m[3]), hashLength: want.length, outputType: 'binary' })
        ok = key.length === want.length && key.every((x, i) => x === want[i])
      } else {
        const m = h.match(/^\$pbkdf2-(sha1|sha256|sha512)\$i=(\d+)\$([^$]+)\$([^$]+)$/); if (!m) throw new Error('Could not read the PBKDF2 parameters.')
        const want = unb64(m[4])
        const hf = m[1] === 'sha512' ? hw.createSHA512() : m[1] === 'sha1' ? hw.createSHA1() : hw.createSHA256()
        const key = await hw.pbkdf2({ password: pw, salt: unb64(m[3]), iterations: Number(m[2]), hashLength: want.length, hashFunction: hf, outputType: 'binary' })
        ok = key.every((x, i) => x === want[i])
      }
      setVerdict({ ok, ms: performance.now() - t0, algo: a })
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Bar><Segmented value={mode} onChange={(m) => { setMode(m); setErr(null) }} options={[{ value: 'hash', label: 'Hash a password' }, { value: 'verify', label: 'Verify a hash' }]} /></Bar>
        <div>
          <Label>Password</Label>
          <div className="flex gap-2">
            <Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Type a password" autoComplete="off" aria-label="Password" onKeyDown={(e) => { if (e.key === 'Enter') (mode === 'hash' ? doHash : doVerify)() }} />
            <Button variant="outline" onClick={() => setShow(!show)} icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label={show ? 'Hide password' : 'Show password'} />
          </div>
        </div>
        {mode === 'verify' && <div><Label>Hash to check</Label><Textarea value={hashIn} onChange={(e) => setHashIn(e.target.value)} className="min-h-20" placeholder="$2b$10$... or $argon2id$v=19$..." />{hashIn.trim() && <p className="mt-1 text-xs text-muted">Detected: {detect(hashIn.trim()) ?? 'unknown'}</p>}</div>}
        <Button size="lg" loading={busy} icon={mode === 'hash' ? <Hash className="size-4" /> : <ShieldCheck className="size-4" />} onClick={mode === 'hash' ? doHash : doVerify} disabled={mode === 'verify' && !hashIn.trim()}>{mode === 'hash' ? 'Generate hash' : 'Check password'}</Button>
        {busy && algo === 'bcrypt' && mode === 'hash' && <Progress value={prog} label="Hashing" />}
        {err && <Status kind="err">{err}</Status>}
        {out && mode === 'hash' && <div className="space-y-2"><KV label={`${algo} hash`} value={out.hash} /><p className="text-xs text-muted">Took {out.ms.toFixed(0)} ms. A new random salt is used every time, so the same password gives a different hash each run. That is expected.</p></div>}
        {verdict && mode === 'verify' && (verdict.ok ? <Status kind="ok"><span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />Match. The password fits this {verdict.algo} hash ({verdict.ms.toFixed(0)} ms).</span></Status> : <Status kind="err"><span className="inline-flex items-center gap-2"><ShieldX className="size-4" />No match. This password does not produce that hash.</span></Status>)}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          {mode === 'hash' ? <>
            <div><Label>Algorithm</Label><Select value={algo} onChange={setAlgo} options={ALGOS} /></div>
            {algo === 'bcrypt' && <Slider label="Cost (rounds)" value={rounds} onChange={setRounds} min={4} max={15} />}
            {algo.startsWith('argon2') && <><Slider label="Memory" value={mem} onChange={setMem} min={1} max={256} suffix=" MiB" /><Slider label="Iterations" value={iters} onChange={setIters} min={1} max={10} /><Slider label="Parallelism" value={par} onChange={setPar} min={1} max={8} /></>}
            {algo === 'scrypt' && <><Slider label="Cost N = 2^" value={logN} onChange={setLogN} min={10} max={20} /><Slider label="Parallelism" value={par} onChange={setPar} min={1} max={8} /></>}
            {algo === 'pbkdf2' && <><div><Label>Hash function</Label><Select value={pbHash} onChange={setPbHash} options={[{ value: 'sha256', label: 'SHA-256' }, { value: 'sha512', label: 'SHA-512' }, { value: 'sha1', label: 'SHA-1 (legacy)' }]} /></div><div><Label>Iterations</Label><Input type="number" min={1000} value={pbIters} onChange={(e) => setPbIters(Math.max(1, Number(e.target.value) || 1))} /></div></>}
            <p className="text-xs text-muted">Defaults follow current OWASP guidance: Argon2id with 19 MiB and 2 passes, bcrypt cost 10 or more, PBKDF2-SHA256 with 600,000 iterations.</p>
          </> : <p className="text-sm text-muted">The algorithm and settings are read from the hash itself. Supports bcrypt, Argon2 (PHC format), and the scrypt and PBKDF2 strings this tool makes.</p>}
          <p className="text-xs text-muted">Everything runs in your browser with WebAssembly. Your password is never sent anywhere.</p>
        </div>
        {out && <CopyButton text={out.hash} label="Copy hash" size="md" variant="secondary" />}
      </aside>
    </div>
  )
}

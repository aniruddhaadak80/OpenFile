import { useState } from 'react'
import { Lock, Unlock, Eye, EyeOff, FileLock2 } from 'lucide-react'
import { Button, Input, Segmented, Select, Label, Textarea, Dropzone, FileChip, ResultCard, CopyButton } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { Bar, Status } from './_b5/shell'
import { encryptBytes, decryptBytes, opensslEncrypt, isContainer, isOpenSsl, toB64, fromB64, type EncAlgo } from '@/lib/b5/enc'

type Fmt = EncAlgo | 'openssl'
const FMTS: { value: Fmt; label: string }[] = [
  { value: 'aes-gcm', label: 'AES-256-GCM (recommended)' }, { value: 'chacha20', label: 'ChaCha20-Poly1305' },
  { value: 'aes-cbc', label: 'AES-256-CBC' }, { value: 'openssl', label: 'OpenSSL compatible (aes-256-cbc, pbkdf2)' },
]

function strength(p: string) {
  let s = 0; if (p.length >= 8) s++; if (p.length >= 14) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p)) s++
  return Math.min(4, s)
}

export default function EncryptionTool() {
  const [target, setTarget] = useState<'text' | 'file'>('text')
  const [dir, setDir] = useState<'enc' | 'dec'>('enc')
  const [fmt, setFmt] = useState<Fmt>('aes-gcm')
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [show, setShow] = useState(false)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [outText, setOutText] = useState('')
  const [outBlob, setOutBlob] = useState<{ blob: Blob; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const reset = () => { setOutText(''); setOutBlob(null); setErr(null); setNote('') }
  const go = async () => {
    reset()
    if (!pw) return setErr('Enter a password first.')
    if (dir === 'enc' && pw !== pw2) return setErr('The two passwords do not match.')
    setBusy(true)
    try {
      if (target === 'text') {
        if (dir === 'enc') {
          const data = new TextEncoder().encode(text)
          const c = fmt === 'openssl' ? await opensslEncrypt(data, pw) : await encryptBytes(data, pw, fmt)
          setOutText(toB64(c))
        } else {
          let bytes: Uint8Array
          try { bytes = fromB64(text.trim()) } catch { throw new Error('The input is not valid Base64. Paste the encrypted text exactly as it was produced.') }
          const r = await decryptBytes(bytes, pw)
          setOutText(new TextDecoder().decode(r.data)); setNote(`Decrypted (${r.algo === 'openssl' ? 'OpenSSL format' : r.algo.toUpperCase()}).`)
        }
      } else if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (dir === 'enc') {
          const c = fmt === 'openssl' ? await opensslEncrypt(bytes, pw) : await encryptBytes(bytes, pw, fmt)
          setOutBlob({ blob: new Blob([c as BlobPart], { type: 'application/octet-stream' }), name: file.name + (fmt === 'openssl' ? '.enc' : '.ofenc') })
        } else {
          const r = await decryptBytes(bytes, pw)
          const name = file.name.replace(/\.(ofenc|enc|aes)$/i, '') || 'decrypted.bin'
          setOutBlob({ blob: new Blob([r.data as BlobPart]), name: name === file.name ? `decrypted-${name}` : name })
          setNote(`Decrypted (${r.algo === 'openssl' ? 'OpenSSL format' : r.algo.toUpperCase()}).`)
        }
      }
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  const onFile = async (fs: File[]) => {
    const f = fs[0]; setFile(f); reset()
    const head = new Uint8Array(await f.slice(0, 32).arrayBuffer())
    if (isContainer(head) || isOpenSsl(head)) setDir('dec')
  }
  const st = strength(pw)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Bar>
          <Segmented value={target} onChange={(v) => { setTarget(v); reset() }} options={[{ value: 'text', label: 'Text' }, { value: 'file', label: 'File' }]} />
          <Segmented value={dir} onChange={(v) => { setDir(v); reset() }} options={[{ value: 'enc', label: <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" />Encrypt</span> }, { value: 'dec', label: <span className="inline-flex items-center gap-1.5"><Unlock className="size-3.5" />Decrypt</span> }]} />
        </Bar>
        {target === 'text' ? (
          <div className="space-y-3">
            <div><Label>{dir === 'enc' ? 'Text to encrypt' : 'Encrypted text (Base64)'}</Label><Textarea value={text} onChange={(e) => { setText(e.target.value); reset() }} className="min-h-40" placeholder={dir === 'enc' ? 'Type or paste a secret message' : 'Paste the Base64 output from this tool or from openssl enc -a'} /></div>
            {outText && <div><Label hint={<CopyButton text={outText} variant="ghost" />}>{dir === 'enc' ? 'Encrypted (Base64)' : 'Decrypted text'}</Label><Textarea readOnly value={outText} className="min-h-40" /></div>}
          </div>
        ) : !file ? <Dropzone onFiles={onFile} label="Drop a file to encrypt or decrypt" sub="Any file type. Encrypted files from this tool end in .ofenc. OpenSSL .enc files work too." /> : (
          <div className="space-y-3">
            <FileChip file={file} onRemove={() => { setFile(null); reset() }} />
            {outBlob && <ResultCard blob={outBlob.blob} filename={outBlob.name} title={dir === 'enc' ? 'File encrypted' : 'File decrypted'} onReset={() => { setFile(null); reset() }} />}
          </div>
        )}
        {err && <Status kind="err">{err}</Status>}
        {note && !err && <Status kind="ok">{note}</Status>}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          {dir === 'enc' && <label className="block"><Label>Cipher</Label><Select value={fmt} onChange={setFmt} options={FMTS} /></label>}
          <div>
            <Label>Password</Label>
            <div className="flex gap-2"><Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-label="Password" /><Button variant="outline" onClick={() => setShow(!show)} icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label={show ? 'Hide password' : 'Show password'} /></div>
            {dir === 'enc' && pw && <div className="mt-2 flex gap-1" aria-label={`Strength ${st} of 4`}>{[0, 1, 2, 3].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < st ? (st >= 3 ? 'bg-success' : 'bg-warn') : 'bg-surface-2'}`} />)}</div>}
          </div>
          {dir === 'enc' && <div><Label>Repeat password</Label><Input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" aria-label="Repeat password" /></div>}
          <Button className="w-full" size="lg" loading={busy} icon={dir === 'enc' ? <FileLock2 className="size-4" /> : <Unlock className="size-4" />} onClick={go} disabled={target === 'file' ? !file : !text}>{dir === 'enc' ? 'Encrypt' : 'Decrypt'}</Button>
          <div className="space-y-1.5 text-xs text-muted">
            <p>The key is derived from your password with PBKDF2-SHA256 (310,000 rounds) and a random salt. GCM and ChaCha20 also detect any change to the data.</p>
            <p>OpenSSL mode matches: <code className="font-mono">openssl enc -d -aes-256-cbc -pbkdf2 -in file.enc</code></p>
            <p>There is no way to recover data if you forget the password.</p>
            {file && <p>File size: {formatBytes(file.size)}</p>}
          </div>
        </div>
      </aside>
    </div>
  )
}

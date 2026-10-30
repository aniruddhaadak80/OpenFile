import { useState } from 'react'
import { KeyRound, Download, ShieldAlert } from 'lucide-react'
import { Button, Segmented, Select, Input, Label, CopyButton, Badge } from '@/components/ui'
import { downloadBlob, zipFiles } from '@/lib/files'
import { Bar, Status, Pane } from './_b5/shell'
import { generate, type KeyKind } from '@/lib/b5/keys'

type Res = Awaited<ReturnType<typeof generate>>
type View = 'pem' | 'ssh' | 'jwk'

function Block({ title, text, file, secret }: { title: string; text: string; file: string; secret?: boolean }) {
  return (
    <Pane title={<span className="inline-flex items-center gap-2">{title}{secret && <Badge color="#EF4444">KEEP PRIVATE</Badge>}</span>} actions={<><CopyButton text={text} variant="ghost" /><Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([text], { type: 'text/plain' }), file)}>Save</Button></>}>
      <pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11.5px] leading-5">{text}</pre>
    </Pane>
  )
}

export default function KeyGenerator() {
  const [kind, setKind] = useState<KeyKind>('ed25519')
  const [bits, setBits] = useState<'2048' | '3072' | '4096'>('3072')
  const [curve, setCurve] = useState<'P-256' | 'P-384' | 'P-521'>('P-256')
  const [usage, setUsage] = useState<'sign' | 'encrypt'>('sign')
  const [comment, setComment] = useState('me@laptop')
  const [view, setView] = useState<View>('ssh')
  const [res, setRes] = useState<Res | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ms, setMs] = useState(0)

  const go = async () => {
    setBusy(true); setErr(null); const t0 = performance.now()
    try { setRes(await generate({ kind, bits: Number(bits) as 2048, curve, comment, usage })); setMs(performance.now() - t0) } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }
  const base = kind === 'rsa' ? 'id_rsa' : kind === 'ecdsa' ? 'id_ecdsa' : 'id_ed25519'
  const saveAll = async () => { if (!res) return; downloadBlob(await zipFiles([{ name: base, data: res.sshPrivate }, { name: `${base}.pub`, data: res.sshPublic }, { name: 'private.pem', data: res.privatePem }, { name: 'public.pem', data: res.publicPem }, { name: 'private.jwk.json', data: JSON.stringify(res.jwkPriv, null, 2) }, { name: 'public.jwk.json', data: JSON.stringify(res.jwkPub, null, 2) }]), `${base}-keys.zip`) }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        {!res ? <Status kind="info">Pick a key type and press Generate. Keys are made with your browser's Web Crypto API and never leave this page.</Status> : (
          <>
            <Bar>
              <Segmented value={view} onChange={setView} options={[{ value: 'ssh', label: 'OpenSSH' }, { value: 'pem', label: 'PEM' }, { value: 'jwk', label: 'JWK' }]} />
              <span className="font-mono text-xs text-muted">{res.fingerprint}</span>
              <span className="text-xs text-muted">made in {ms.toFixed(0)} ms</span>
              <Button size="sm" variant="outline" className="ml-auto" icon={<Download className="size-4" />} onClick={saveAll}>All formats (ZIP)</Button>
            </Bar>
            {view === 'ssh' && <><Block title={`${base}.pub (public)`} text={res.sshPublic} file={`${base}.pub`} /><Block title={`${base} (private)`} text={res.sshPrivate} file={base} secret /></>}
            {view === 'pem' && <><Block title="Public key (SPKI PEM)" text={res.publicPem} file="public.pem" /><Block title="Private key (PKCS#8 PEM)" text={res.privatePem} file="private.pem" secret /></>}
            {view === 'jwk' && <><Block title="Public JWK" text={JSON.stringify(res.jwkPub, null, 2)} file="public.jwk.json" /><Block title="Private JWK" text={JSON.stringify(res.jwkPriv, null, 2)} file="private.jwk.json" secret /></>}
            {view === 'ssh' && <p className="text-xs text-muted">Save the private key as ~/.ssh/{base} and run <code className="font-mono">chmod 600 ~/.ssh/{base}</code>. Paste the .pub line into GitHub, GitLab or a server's authorized_keys. The private key has no passphrase; add one with <code className="font-mono">ssh-keygen -p -f ~/.ssh/{base}</code>.</p>}
          </>
        )}
        {err && <Status kind="err">{err}</Status>}
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div><Label>Key type</Label><Segmented value={kind} onChange={setKind} options={[{ value: 'ed25519', label: 'Ed25519' }, { value: 'ecdsa', label: 'ECDSA' }, { value: 'rsa', label: 'RSA' }]} /></div>
          {kind === 'rsa' && <><div><Label>Key size</Label><Segmented value={bits} onChange={setBits} options={[{ value: '2048', label: '2048' }, { value: '3072', label: '3072' }, { value: '4096', label: '4096' }]} /></div>
            <label className="block"><Label>Use for</Label><Select value={usage} onChange={setUsage} options={[{ value: 'sign', label: 'Signing and SSH (RSASSA-PKCS1)' }, { value: 'encrypt', label: 'Encryption (RSA-OAEP)' }]} /></label></>}
          {kind === 'ecdsa' && <div><Label>Curve</Label><Segmented value={curve} onChange={setCurve} options={['P-256', 'P-384', 'P-521']} /></div>}
          <div><Label>Comment (SSH)</Label><Input aria-label="Comment (SSH)" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="you@machine" /></div>
          <Button className="w-full" size="lg" loading={busy} icon={<KeyRound className="size-4" />} onClick={go}>Generate key pair</Button>
          <p className="flex gap-2 text-xs text-muted"><ShieldAlert className="size-4 shrink-0 text-warn" />Anyone with the private key can act as you. Store it safely and never share it.</p>
          {kind === 'rsa' && bits === '4096' && <p className="text-xs text-muted">4096-bit RSA can take a few seconds.</p>}
        </div>
      </aside>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { KeyRound, Lock, Unlock, PenLine, BadgeCheck, Info, Download, ShieldCheck, ShieldX, ShieldQuestion } from 'lucide-react'
import { Button, Input, Label, Textarea, Select, Switch, Segmented, Dropzone, FileChip, CopyButton, Badge, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { Status, KV, useStored, useDebounced } from './_b5/shell'
import * as P from '@/lib/b5/pgp'

type Tab = 'keys' | 'encrypt' | 'decrypt' | 'sign' | 'verify' | 'inspect'
const TABS: { value: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'keys', label: 'New key', icon: KeyRound }, { value: 'encrypt', label: 'Encrypt', icon: Lock }, { value: 'decrypt', label: 'Decrypt', icon: Unlock },
  { value: 'sign', label: 'Sign', icon: PenLine }, { value: 'verify', label: 'Verify', icon: BadgeCheck }, { value: 'inspect', label: 'Inspect key', icon: Info },
]

function KeyBox({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <Label hint={<label className="cursor-pointer text-accent hover:underline focus-within:underline focus-within:outline-2 focus-within:outline-accent rounded"><input type="file" className="sr-only" accept=".asc,.gpg,.pgp,.key,.txt,.pub" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onChange(await f.text()) }} />Open file</label>}>{label}</Label>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-28 text-[11px]" spellCheck={false} />
    </div>
  )
}
function Out({ text, file, label = 'Result' }: { text: string; file: string; label?: string }) {
  return (
    <div className="space-y-1">
      <Label hint={<span className="flex gap-1"><CopyButton text={text} variant="ghost" /><Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([text], { type: 'application/pgp-encrypted' }), file)}>Save</Button></span>}>{label}</Label>
      <Textarea readOnly value={text} className="min-h-40 text-[11px]" />
    </div>
  )
}
function Sigs({ sigs }: { sigs: { keyID: string; ok: boolean | null; err?: string }[] }) {
  if (!sigs.length) return <Status kind="info">The message is not signed.</Status>
  return <div className="space-y-1">{sigs.map((s, i) => s.ok === true ? <Status key={i} kind="ok"><span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />Good signature from key {s.keyID}</span></Status> : s.ok === false ? <Status key={i} kind="err"><span className="inline-flex items-center gap-2"><ShieldX className="size-4" />Bad signature from key {s.keyID}. {s.err}</span></Status> : <Status key={i} kind="info"><span className="inline-flex items-center gap-2"><ShieldQuestion className="size-4" />Signed by key {s.keyID}. Add the sender's public key to check it.</span></Status>)}</div>
}

export default function PgpTool() {
  const [tab, setTab] = useStored<Tab>('b5:pgp:tab', 'keys')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // shared keys
  const [pub, setPub] = useStored('b5:pgp:pub', '')
  const [priv, setPriv] = useState('')
  const [pass, setPass] = useState('')
  // generate
  const [g, setG] = useState({ name: '', email: '', passphrase: '', type: 'ecc' as 'ecc' | 'rsa' | 'curve25519', rsaBits: 4096, expiry: 0 })
  const [gen, setGen] = useState<{ publicKey: string; privateKey: string; revocation: string } | null>(null)
  // messages
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [armor, setArmor] = useState(true)
  const [password, setPassword] = useState('')
  const [signToo, setSignToo] = useState(false)
  const [result, setResult] = useState<string>('')
  const [sigs, setSigs] = useState<{ keyID: string; ok: boolean | null; err?: string }[] | null>(null)
  const [detached, setDetached] = useState(false)
  const [detSig, setDetSig] = useState('')
  const [inspect, setInspect] = useState('')
  const [info, setInfo] = useState<Awaited<ReturnType<typeof P.keyInfo>> | null>(null)
  const di = useDebounced(inspect, 300)

  useEffect(() => { setErr(null); setResult(''); setSigs(null) }, [tab])
  useEffect(() => { if (!di.trim()) return setInfo(null); P.keyInfo(di).then(setInfo).catch((e) => { setInfo(null); setErr(e.message) }) }, [di])

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn() } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) } }
  const doGen = () => run(async () => { if (!g.name && !g.email) throw new Error('Add a name or an email for the key.'); const r = await P.generate({ ...g, expiryDays: g.expiry || undefined }); setGen(r); setPub(r.publicKey) })
  const doEnc = () => run(async () => {
    if (file) { const r = await P.encrypt({ data: new Uint8Array(await file.arrayBuffer()), filename: file.name, publicKeys: pub, password, signKey: signToo ? priv : undefined, signPass: pass, armor }); if (typeof r === 'string') downloadBlob(new Blob([r], { type: 'text/plain' }), file.name + '.asc'); else downloadBlob(new Blob([r as BlobPart]), file.name + '.gpg'); setResult(typeof r === 'string' ? r : `Encrypted ${file.name} and saved it as ${file.name}.gpg`) }
    else setResult((await P.encrypt({ data: text, publicKeys: pub, password, signKey: signToo ? priv : undefined, signPass: pass, armor: true })) as string)
  })
  const doDec = () => run(async () => {
    const r = file ? await P.decrypt({ message: /\.asc$/i.test(file.name) ? await file.text() : new Uint8Array(await file.arrayBuffer()), privateKey: priv, passphrase: pass, password, verifyKeys: pub, binary: true }) : await P.decrypt({ message: text, privateKey: priv, passphrase: pass, password, verifyKeys: pub })
    setSigs(r.signatures)
    if (file) { const name = r.filename || file.name.replace(/\.(gpg|pgp|asc)$/i, '') || 'decrypted.bin'; downloadBlob(new Blob([r.data as BlobPart]), name); setResult(`Decrypted and saved ${name}`) } else setResult(String(r.data))
  })
  const doSign = () => run(async () => setResult(await P.sign({ text, privateKey: priv, passphrase: pass, detached })))
  const doVerify = () => run(async () => { const r = await P.verify({ signed: text, publicKeys: pub, detachedSig: detached ? detSig : undefined }); setSigs(r.signatures); setResult(r.text) })

  const fileZone = (tab === 'encrypt' || tab === 'decrypt') && (file ? <FileChip file={file} onRemove={() => setFile(null)} /> : <Dropzone compact onFiles={(f) => setFile(f[0])} label="Or drop a file" sub={tab === 'encrypt' ? 'Any file. Saved as .gpg (or .asc when armored).' : '.gpg, .pgp or .asc files'} />)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1.5" role="tablist">
        {TABS.map((t) => <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition', tab === t.value ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}><t.icon className="size-4" />{t.label}</button>)}
      </div>
      <p className="text-xs text-muted">OpenPGP (RFC 4880 and RFC 9580) via openpgp.js, loaded only when you use this tool. Keys and messages never leave your browser.</p>

      {tab === 'keys' && (
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
            <div><Label>Name</Label><Input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></div>
            <div><Label>Passphrase (recommended)</Label><Input type="password" value={g.passphrase} onChange={(e) => setG({ ...g, passphrase: e.target.value })} autoComplete="new-password" /></div>
            <div><Label>Key type</Label><Select value={g.type} onChange={(v) => setG({ ...g, type: v })} options={[{ value: 'ecc', label: 'ECC Curve25519 (widely supported)' }, { value: 'curve25519', label: 'Curve25519 v6 (newest, RFC 9580)' }, { value: 'rsa', label: 'RSA' }]} /></div>
            {g.type === 'rsa' && <div><Label>RSA size</Label><Segmented value={String(g.rsaBits) as '4096'} onChange={(v) => setG({ ...g, rsaBits: Number(v) })} options={['2048', '3072', '4096']} /></div>}
            <div><Label>Expires</Label><Select value={String(g.expiry)} onChange={(v) => setG({ ...g, expiry: Number(v) })} options={[{ value: '0', label: 'Never' }, { value: '365', label: '1 year' }, { value: '730', label: '2 years' }, { value: '1825', label: '5 years' }]} /></div>
            <Button className="w-full" loading={busy} icon={<KeyRound className="size-4" />} onClick={doGen}>Generate key pair</Button>
          </div>
          <div className="space-y-3">
            {gen ? <><Out label="Public key (share this)" text={gen.publicKey} file="public.asc" /><Out label="Private key (keep secret)" text={gen.privateKey} file="private.asc" /><Out label="Revocation certificate (store offline)" text={gen.revocation} file="revocation.asc" /></> : <Status kind="info">Your new key pair appears here. The public key is also filled in for the other tabs.</Status>}
          </div>
        </div>
      )}

      {(tab === 'encrypt' || tab === 'decrypt' || tab === 'sign' || tab === 'verify') && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-3">
            {!(file && (tab === 'encrypt' || tab === 'decrypt')) && <div><Label>{tab === 'encrypt' ? 'Message' : tab === 'decrypt' ? 'Encrypted message' : tab === 'sign' ? 'Text to sign' : detached ? 'Original text' : 'Signed message'}</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-44" placeholder={tab === 'decrypt' ? '-----BEGIN PGP MESSAGE-----' : tab === 'verify' && !detached ? '-----BEGIN PGP SIGNED MESSAGE-----' : ''} /></div>}
            {fileZone}
            {tab === 'verify' && detached && <div><Label>Detached signature</Label><Textarea value={detSig} onChange={(e) => setDetSig(e.target.value)} className="min-h-24 text-[11px]" placeholder="-----BEGIN PGP SIGNATURE-----" /></div>}
            {err && <Status kind="err">{err}</Status>}
            {sigs && <Sigs sigs={sigs} />}
            {result && (tab === 'decrypt' || tab === 'verify' ? <div><Label hint={<CopyButton text={result} variant="ghost" />}>{tab === 'decrypt' ? 'Decrypted' : 'Signed text'}</Label><pre className="scrollbar-thin max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm">{result}</pre></div> : <Out text={result} file={tab === 'sign' ? (detached ? 'signature.asc' : 'signed.asc') : 'message.asc'} />)}
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
            {(tab === 'encrypt' || tab === 'verify' || tab === 'decrypt') && <KeyBox label={tab === 'encrypt' ? 'Recipient public key(s)' : tab === 'verify' ? "Signer's public key" : "Sender's public key (to check the signature, optional)"} value={pub} onChange={setPub} placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----" />}
            {(tab === 'decrypt' || tab === 'sign' || (tab === 'encrypt' && signToo)) && <><KeyBox label="Your private key" value={priv} onChange={setPriv} placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----" /><div><Label>Passphrase</Label><Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" /></div></>}
            {(tab === 'encrypt' || tab === 'decrypt') && <div><Label>{tab === 'encrypt' ? 'Or also lock with a password' : 'Message password (if any)'}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" /></div>}
            {tab === 'encrypt' && <><Switch checked={signToo} onChange={setSignToo} label="Sign with my private key" />{file && <Switch checked={armor} onChange={setArmor} label="ASCII armor (.asc)" />}</>}
            {(tab === 'sign' || tab === 'verify') && <Switch checked={detached} onChange={setDetached} label="Detached signature" />}
            <Button className="w-full" size="lg" loading={busy} onClick={tab === 'encrypt' ? doEnc : tab === 'decrypt' ? doDec : tab === 'sign' ? doSign : doVerify}>{TABS.find((t) => t.value === tab)!.label}</Button>
          </div>
        </div>
      )}

      {tab === 'inspect' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <KeyBox label="Public or private key" value={inspect} onChange={setInspect} placeholder="Paste any armored PGP key block" />
          <div className="space-y-3">
            {err && <Status kind="err">{err}</Status>}
            {info?.map((k, i) => (
              <div key={i} className="space-y-2 rounded-2xl border border-border bg-surface p-4">
                <div className="flex flex-wrap gap-1.5">{k.isPrivate ? <Badge color="#EF4444">PRIVATE</Badge> : <Badge color="#14B8A6">PUBLIC</Badge>}{k.locked && <Badge color="#F5A524">PASSPHRASE PROTECTED</Badge>}{k.revoked && <Badge color="#EF4444">REVOKED</Badge>}{k.expires && k.expires.getTime() < Date.now() && <Badge color="#EF4444">EXPIRED</Badge>}</div>
                {k.users.map((u) => <div key={u} className="font-medium">{u}</div>)}
                <KV label="Fingerprint" value={k.fingerprint} /><KV label="Key ID" value={k.keyID} /><KV label="Algorithm" value={k.algorithm} />
                <KV label="Created" value={k.created.toUTCString()} /><KV label="Expires" value={k.expires ? k.expires.toUTCString() : 'Never'} />
                {k.subkeys.length > 0 && <KV label="Subkeys" value={k.subkeys.join('\n')} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

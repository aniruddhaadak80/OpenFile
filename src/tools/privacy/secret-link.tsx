import { useEffect, useState } from 'react'
import { Link2, LockOpen, QrCode } from 'lucide-react'
import { Button, Card, CopyButton, Input, Label, Segmented, Switch, Textarea, ErrorNote } from '@/components/ui'
import { downloadDataUrl } from '@/lib/files'
import { noteNeedsPassword, openNote, sealNote } from '@/lib/cf/priv'

const EXPIRY = [{ value: '0', label: 'Never' }, { value: '1', label: '1 hour' }, { value: '24', label: '1 day' }, { value: '168', label: '1 week' }]

export default function SecretLink() {
  const [frag] = useState(() => (typeof location !== 'undefined' && location.hash.startsWith('#v1.') ? location.hash.slice(1) : ''))
  const [text, setText] = useState(''), [pw, setPw] = useState(''), [usePw, setUsePw] = useState(false), [exp, setExp] = useState('24')
  const [link, setLink] = useState(''), [qr, setQr] = useState(''), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<{ text: string; created: number; exp: number } | null>(null), [openPw, setOpenPw] = useState('')
  useEffect(() => { if (frag && !noteNeedsPassword(frag)) open() }, []) // eslint-disable-line
  const create = async () => {
    setErr(null); setBusy(true)
    try {
      if (!text.trim()) throw new Error('Write the note first.')
      if (usePw && pw.length < 6) throw new Error('Use a password of at least 6 characters.')
      const payload = JSON.stringify({ t: text, c: Date.now(), e: +exp ? Date.now() + +exp * 3600e3 : 0 })
      const f = await sealNote(payload, usePw ? pw : '')
      const url = `${location.origin}${import.meta.env.BASE_URL.replace(/\/?$/, '/')}secret-link#${f}`
      setLink(url)
      if (url.length < 2900) { const Q = await import('qrcode'); setQr(await Q.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'L' })) } else setQr('')
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function open() {
    setErr(null); setBusy(true)
    try { const j = JSON.parse(await openNote(frag, openPw)); if (j.e && Date.now() > j.e) throw new Error('This note has expired. Ask the sender for a new link.'); setOpened({ text: j.t, created: j.c, exp: j.e }) } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  if (frag) return (
    <Card className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2 font-semibold"><LockOpen className="size-5 text-accent" />{opened ? 'Secret note' : 'Someone sent you a secret note'}</div>
      {!opened && <>{noteNeedsPassword(frag) && <div><Label>Password</Label><Input type="password" value={openPw} onChange={(e) => setOpenPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && open()} autoFocus /></div>}
        <Button icon={<LockOpen className="size-4" />} loading={busy} onClick={open}>Open note</Button></>}
      <ErrorNote error={err} />
      {opened && <><pre className="whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-2/60 p-4 text-sm">{opened.text}</pre>
        <div className="flex flex-wrap items-center gap-2"><CopyButton text={opened.text} /><span className="text-xs text-muted">Written {new Date(opened.created).toLocaleString()}{opened.exp ? `, expires ${new Date(opened.exp).toLocaleString()}` : ''}</span></div>
        <Button variant="outline" size="sm" onClick={() => { history.replaceState(null, '', location.pathname); location.reload() }}>Close and forget this link</Button></>}
      <p className="text-xs text-muted">The note was decrypted in this browser. The part of the link after # is never sent to any server, including ours.</p>
    </Card>
  )
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div><Label hint={`${text.length} characters`}>Your secret (a password, a key, a private message)</Label><Textarea value={text} onChange={(e) => { setText(e.target.value); setLink('') }} className="min-h-40 font-sans" placeholder="Wi-Fi: HomeNet, password: ..." /></div>
        <ErrorNote error={err} />
        {link && <Card className="space-y-3">
          <Label>Share this link</Label>
          <div className="break-all rounded-xl bg-surface-2/60 p-3 font-mono text-xs">{link}</div>
          <div className="flex flex-wrap gap-2"><CopyButton text={link} label="Copy link" />{qr && <Button size="sm" variant="outline" icon={<QrCode className="size-4" />} onClick={() => downloadDataUrl(qr, 'secret-link-qr.png')}>Save QR code</Button>}</div>
          {qr && <img src={qr} alt="QR code of the secret link" className="w-44 rounded-lg bg-white p-1" />}
          {usePw && <p className="text-sm text-warn">Send the password a different way (a call or another app), not next to the link.</p>}
        </Card>}
      </div>
      <Card className="space-y-4 self-start">
        <Switch checked={usePw} onChange={(v) => { setUsePw(v); setLink('') }} label="Also lock with a password" />
        {usePw && <Input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setLink('') }} placeholder="At least 6 characters" aria-label="Password" />}
        <div><Label>Expires after</Label><Segmented value={exp} onChange={(v) => { setExp(v); setLink('') }} options={EXPIRY} /></div>
        <Button className="w-full" icon={<Link2 className="size-4" />} loading={busy} onClick={create}>Create secret link</Button>
        <p className="text-xs text-muted">AES-256-GCM in your browser. The whole note lives inside the link, nothing is stored anywhere. Anyone who has the full link (and password) can read it, so share it only with the right person. Expiry is checked when the link is opened.</p>
      </Card>
    </div>
  )
}

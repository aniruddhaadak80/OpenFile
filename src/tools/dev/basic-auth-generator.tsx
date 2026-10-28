import { useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, Label, Segmented, Textarea } from '@/components/ui'
import { Bar, Status, KV } from './_b5/shell'

const b64 = (s: string) => { const b = new TextEncoder().encode(s); let r = ''; for (const x of b) r += String.fromCharCode(x); return btoa(r) }
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))

export default function BasicAuthGenerator() {
  const [mode, setMode] = useState<'make' | 'read'>('make')
  const [user, setUser] = useState('admin')
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [url, setUrl] = useState('https://api.example.com/v1/status')
  const [hdr, setHdr] = useState('')
  const token = b64(`${user}:${pass}`)
  const header = `Authorization: Basic ${token}`
  const decoded = useMemo(() => {
    const m = hdr.trim().replace(/^authorization:\s*/i, '').replace(/^basic\s+/i, '')
    if (!m) return null
    try { const s = unb64(m.replace(/\s+/g, '')); const i = s.indexOf(':'); return i < 0 ? { err: 'Decoded text has no colon, so it is not user:password.' } : { user: s.slice(0, i), pass: s.slice(i + 1) } } catch { return { err: 'Not valid Base64.' } }
  }, [hdr])
  return (
    <div className="space-y-4">
      <Bar><Segmented value={mode} onChange={setMode} options={[{ value: 'make', label: 'Build a header' }, { value: 'read', label: 'Decode a header' }]} /></Bar>
      {mode === 'make' ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div><Label>Username</Label><Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" /></div>
            <div><Label>Password</Label><div className="flex gap-2"><Input type={show ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" /><Button variant="outline" onClick={() => setShow(!show)} icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label={show ? 'Hide password' : 'Show password'} /></div></div>
            <div><Label>URL for examples</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} /></div>
            {user.includes(':') && <Status kind="err">Usernames cannot contain a colon in Basic auth.</Status>}
          </div>
          <div className="space-y-2">
            <KV label="Header" value={header} />
            <KV label="Token only" value={token} />
            <KV label="curl" value={`curl -H "${header}" ${url}`} />
            <KV label="curl (short form)" value={`curl -u '${user.replace(/'/g, `'\\''`)}:${pass.replace(/'/g, `'\\''`)}' ${url}`} />
            <KV label="fetch (JavaScript)" value={`fetch('${url}', { headers: { Authorization: 'Basic ${token}' } })`} />
            <KV label="URL with credentials" value={url.replace(/^(\w+:\/\/)/, `$1${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`)} />
            <p className="text-xs text-muted">Basic auth only encodes the password, it does not encrypt it. Always send it over HTTPS.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea value={hdr} onChange={(e) => setHdr(e.target.value)} placeholder="Authorization: Basic YWRtaW46c2VjcmV0" className="min-h-24" aria-label="Header to decode" />
          {decoded && ('err' in decoded ? <Status kind="err">{decoded.err}</Status> : <div className="grid gap-2 sm:grid-cols-2"><KV label="Username" value={decoded.user!} /><KV label="Password" value={decoded.pass!} /></div>)}
        </div>
      )}
    </div>
  )
}

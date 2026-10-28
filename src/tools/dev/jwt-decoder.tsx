import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, ShieldX, ShieldQuestion, Clock, KeyRound, PenLine, RefreshCw, FileCode2 } from 'lucide-react'
import { Button, Card, Field, Input, Select, Tabs, Badge, CopyButton, Textarea, cn } from '@/components/ui'
import { CodeView, Pane } from './_dev/kit'

type Alg = 'HS256' | 'HS384' | 'HS512'
const HASH: Record<Alg, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }

const b64urlToBytes = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u
}
const bytesToB64url = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const decodeSeg = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)))
const encodeSeg = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)))

async function hmac(alg: Alg, secret: string, data: string, secretIsB64: boolean) {
  const keyBytes = secretIsB64 ? b64urlToBytes(secret.trim()) : new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: HASH[alg] }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
}

const now = () => Math.floor(Date.now() / 1000)
const SAMPLE_PAYLOAD = () => ({ sub: '1234567890', name: 'Ada Lovelace', role: 'admin', iat: now(), exp: now() + 3600 })

function rel(sec: number) {
  const d = sec - now(), a = Math.abs(d)
  const u: [number, string][] = [[31536000, 'year'], [2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']]
  for (const [s, n] of u) if (a >= s) { const v = Math.floor(a / s); return d >= 0 ? `in ${v} ${n}${v > 1 ? 's' : ''}` : `${v} ${n}${v > 1 ? 's' : ''} ago` }
  return 'now'
}

const CLAIMS: Record<string, string> = { iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not before', iat: 'Issued at', jti: 'JWT ID', name: 'Name', email: 'Email', scope: 'Scope', role: 'Role' }

export default function JwtDecoder() {
  const [tab, setTab] = useState<'decode' | 'sign'>('decode')
  return (
    <div className="space-y-5">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'decode', label: <span className="flex items-center gap-2"><KeyRound className="size-4" />Decode & verify</span> }, { value: 'sign', label: <span className="flex items-center gap-2"><PenLine className="size-4" />Generate & sign</span> }]} />
      {tab === 'decode' ? <Decode /> : <Sign />}
    </div>
  )
}

function Decode() {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [b64Secret, setB64Secret] = useState(false)
  const [verify, setVerify] = useState<'idle' | 'ok' | 'bad' | 'unsupported'>('idle')
  const [, tick] = useState(0)
  const overlay = useRef<HTMLDivElement>(null)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])

  const parts = token.trim().split('.')
  const dec = useMemo(() => {
    const t = token.trim()
    if (!t) return null
    const p = t.split('.')
    if (p.length !== 3) return { error: `A JWT has 3 dot-separated parts — this has ${p.length}.` }
    try {
      const header = decodeSeg(p[0]); let payload: any
      try { payload = decodeSeg(p[1]) } catch { payload = new TextDecoder().decode(b64urlToBytes(p[1])) }
      return { header, payload }
    } catch (e: any) { return { error: 'Could not decode: segments must be Base64URL-encoded JSON. ' + (e?.message ?? '') } }
  }, [token])

  useEffect(() => {
    setVerify('idle')
    if (!dec || 'error' in dec || !secret) return
    const alg = dec.header?.alg as Alg
    if (!HASH[alg]) { setVerify('unsupported'); return }
    let alive = true
    const p = token.trim().split('.')
    hmac(alg, secret, `${p[0]}.${p[1]}`, b64Secret).then((sig) => alive && setVerify(bytesToB64url(sig) === p[2] ? 'ok' : 'bad')).catch(() => alive && setVerify('bad'))
    return () => { alive = false }
  }, [dec, secret, b64Secret, token])

  const payload = dec && !('error' in dec) ? dec.payload : null
  const exp = typeof payload?.exp === 'number' ? payload.exp : null
  const nbf = typeof payload?.nbf === 'number' ? payload.nbf : null
  const expired = exp !== null && exp < now()
  const notYet = nbf !== null && nbf > now()

  return (
    <div className="space-y-4">
      <Pane title="Encoded token" actions={<>
        <Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={async () => { const h = encodeSeg({ alg: 'HS256', typ: 'JWT' }), pl = encodeSeg(SAMPLE_PAYLOAD()); const s = bytesToB64url(await hmac('HS256', 'your-256-bit-secret', `${h}.${pl}`, false)); setToken(`${h}.${pl}.${s}`); setSecret('your-256-bit-secret') }}>Sample</Button>
        {token && <Button size="sm" variant="ghost" onClick={() => setToken('')}>Clear</Button>}
      </>}>
        <div className="relative">
          <textarea value={token} onScroll={(e) => { if (overlay.current) overlay.current.scrollTop = e.currentTarget.scrollTop }} onChange={(e) => setToken(e.target.value.replace(/^Bearer\s+/i, ''))} spellCheck={false} placeholder="Paste a JWT (eyJhbGciOi…) — a leading 'Bearer ' is stripped automatically"
            style={{ fieldSizing: 'content' } as React.CSSProperties} className="min-h-28 w-full resize-none bg-transparent p-4 font-mono text-sm text-transparent caret-fg outline-none placeholder:text-muted/60 break-all" />
          <div ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-all p-4 font-mono text-sm">
            {parts.map((p, i) => <span key={i}><span className={['text-[#f43f5e]', 'text-accent', 'text-[#06b6d4]'][i] ?? 'text-muted'}>{p}</span>{i < parts.length - 1 && <span className="text-muted">.</span>}</span>)}
          </div>
        </div>
      </Pane>

      {dec && 'error' in dec && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{dec.error}</div>}

      {payload !== null && dec && !('error' in dec) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge color="#8b6cff">ALG {dec.header.alg ?? '?'}</Badge>
            {dec.header.typ && <Badge color="#06b6d4">TYP {dec.header.typ}</Badge>}
            {exp !== null && (expired ? <Badge color="#ef4444">EXPIRED {rel(exp).toUpperCase()}</Badge> : <Badge color="#22c55e">VALID · EXPIRES {rel(exp).toUpperCase()}</Badge>)}
            {exp === null && <Badge color="#f59e0b">NO EXPIRY</Badge>}
            {notYet && <Badge color="#f59e0b">NOT ACTIVE YET</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Pane title={<span className="text-[#f43f5e]">Header</span>} actions={<CopyButton text={JSON.stringify(dec.header, null, 2)} variant="ghost" />}>
              <CodeView code={JSON.stringify(dec.header, null, 2)} lang="json" />
            </Pane>
            <Pane title={<span className="text-accent">Payload</span>} actions={<CopyButton text={typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)} variant="ghost" />}>
              <CodeView code={typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)} lang="json" className="max-h-96" />
            </Pane>
          </div>

          {typeof payload === 'object' && (
            <Card className="p-0">
              <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Claims</div>
              <div className="divide-y divide-border">
                {Object.entries(payload).map(([k, v]) => {
                  const time = ['exp', 'iat', 'nbf', 'auth_time', 'updated_at'].includes(k) && typeof v === 'number'
                  return (
                    <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2 text-sm sm:grid-cols-[160px_1fr]">
                      <div><span className="font-mono text-accent">{k}</span>{CLAIMS[k] && <div className="text-[11px] text-muted">{CLAIMS[k]}</div>}</div>
                      <div className="min-w-0 break-all font-mono text-[13px]">
                        {time ? <span className="flex flex-wrap items-center gap-2"><Clock className="size-3.5 text-muted" />{new Date((v as number) * 1000).toLocaleString()} <span className="text-muted">({rel(v as number)})</span>
                          {k === 'exp' && (expired ? <span className="text-danger">• expired</span> : <span className="text-success">• active</span>)}<span className="text-muted/60">{String(v)}</span></span>
                          : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          <Card className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><span className="text-[#06b6d4]">Signature</span> verification</div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input type="text" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Enter the HMAC secret to verify (HS256 / HS384 / HS512)" className="font-mono" />
              <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={b64Secret} onChange={(e) => setB64Secret(e.target.checked)} className="accent-[var(--accent)]" />Secret is Base64URL</label>
            </div>
            <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
              verify === 'ok' ? 'bg-success/10 text-success' : verify === 'bad' ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-muted')}>
              {verify === 'ok' ? <><ShieldCheck className="size-4" />Signature verified — the token was signed with this secret.</>
                : verify === 'bad' ? <><ShieldX className="size-4" />Invalid signature — wrong secret or the token was tampered with.</>
                : verify === 'unsupported' ? <><ShieldQuestion className="size-4" />Algorithm “{dec.header.alg}” uses public keys; only HMAC (HS*) verification is supported here.</>
                : <><ShieldQuestion className="size-4" />Enter a secret to verify the signature. Nothing leaves your browser.</>}
            </div>
          </Card>
        </motion.div>
      )}

      {!token && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Paste a token above. Decoding happens locally — tokens are never sent anywhere.</div>}
    </div>
  )
}

function Sign() {
  const [alg, setAlg] = useState<Alg>('HS256')
  const [header, setHeader] = useState('')
  const [payload, setPayload] = useState(() => JSON.stringify(SAMPLE_PAYLOAD(), null, 2))
  const [secret, setSecret] = useState('change-me-to-a-long-random-secret')
  const [out, setOut] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [expIn, setExpIn] = useState('3600')

  useEffect(() => { setHeader(JSON.stringify({ alg, typ: 'JWT' }, null, 2)) }, [alg])
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const h = JSON.parse(header || '{}'); h.alg = alg
        const p = JSON.parse(payload)
        if (!secret) throw new Error('Secret is required to sign')
        const hs = encodeSeg(h), ps = encodeSeg(p)
        const sig = bytesToB64url(await hmac(alg, secret, `${hs}.${ps}`, false))
        if (alive) { setOut(`${hs}.${ps}.${sig}`); setErr(null) }
      } catch (e: any) { if (alive) { setErr(e.message); setOut('') } }
    })()
    return () => { alive = false }
  }, [alg, header, payload, secret])

  const stamp = () => {
    try { const p = JSON.parse(payload); p.iat = now(); const n = Number(expIn); if (n > 0) p.exp = now() + n; else delete p.exp; setPayload(JSON.stringify(p, null, 2)) } catch { setErr('Payload must be valid JSON') }
  }
  const randomSecret = () => { const u = new Uint8Array(alg === 'HS256' ? 32 : alg === 'HS384' ? 48 : 64); crypto.getRandomValues(u); setSecret(bytesToB64url(u)) }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Algorithm"><Select value={alg} onChange={setAlg} options={['HS256', 'HS384', 'HS512']} /></Field>
            <Field label="Expires in (seconds)"><div className="flex gap-2"><Input value={expIn} onChange={(e) => setExpIn(e.target.value)} inputMode="numeric" /><Button variant="secondary" onClick={stamp} title="Set iat=now and exp">Stamp</Button></div></Field>
          </div>
          <Field label="Secret" hint={<button className="text-accent hover:underline inline-flex items-center gap-1" onClick={randomSecret}><RefreshCw className="size-3" />random</button>}>
            <Input value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono" />
          </Field>
          <Field label="Header"><Textarea value={header} onChange={(e) => setHeader(e.target.value)} className="min-h-20" /></Field>
          <Field label="Payload"><Textarea value={payload} onChange={(e) => setPayload(e.target.value)} className="min-h-56" /></Field>
        </Card>
      </div>
      <div className="space-y-3">
        <Pane title="Signed JWT" actions={out ? <CopyButton text={out} /> : null}>
          {err ? <div className="p-4 text-sm text-danger">{err}</div> : (
            <div className="break-all p-4 font-mono text-sm leading-relaxed">
              {out.split('.').map((p, i) => <span key={i}><span className={['text-[#f43f5e]', 'text-accent', 'text-[#06b6d4]'][i]}>{p}</span>{i < 2 && <span className="text-muted">.</span>}</span>)}
            </div>
          )}
        </Pane>
        <p className="text-xs text-muted">Signed with HMAC-{HASH[alg]} via the Web Crypto API. Use the Decode tab to inspect the result. Keep production secrets out of shared machines.</p>
      </div>
    </div>
  )
}

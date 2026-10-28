import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, ShieldX, ShieldQuestion, ShieldAlert, Clock, KeyRound, PenLine, RefreshCw, FileCode2, Wand2 } from 'lucide-react'
import { Button, Card, Field, Input, Select, Tabs, Badge, CopyButton, Textarea, Segmented, cn } from '@/components/ui'
import { CodeView, Pane } from './_dev/kit'
import { JWT_ALGS, isHmac, isSupported, detectKey, KEY_KIND_LABEL, importVerifyKey, importSignKey, verifyJwt, signJwt, generateKeys, type JwtAlg, type SecretFormat, type VerifyResult, type KeyPairOut } from '@/lib/b5/jwt'


const b64urlToBytes = (s: string) => {
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u
}
const bytesToB64url = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const decodeSeg = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)))
const encodeSeg = (o: unknown) => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)))

const SAMPLE_SECRET = 'your-256-bit-secret'
const ALG_DESC: Record<string, string> = { HS: 'HMAC with a shared secret', RS: 'RSA PKCS#1 v1.5', PS: 'RSA PSS', ES: 'ECDSA', Ed: 'Ed25519' }
const algDesc = (a: string) => ALG_DESC[a.slice(0, 2)] ?? ''

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
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'decode', label: <span className="flex items-center gap-2"><KeyRound className="size-4" />Decode and verify</span> }, { value: 'sign', label: <span className="flex items-center gap-2"><PenLine className="size-4" />Sign and make keys</span> }]} />
      {tab === 'decode' ? <Decode /> : <Sign />}
    </div>
  )
}

function Decode() {
  const [token, setToken] = useState('')
  const [secret, setSecret] = useState('')
  const [secretFmt, setSecretFmt] = useState<SecretFormat>('utf8')
  const [iss, setIss] = useState('')
  const [aud, setAud] = useState('')
  const [leeway, setLeeway] = useState('0')
  const [verify, setVerify] = useState<{ state: 'idle' | 'busy' | 'done' | 'unsupported' | 'error'; res?: VerifyResult; error?: string }>({ state: 'idle' })
  const [, tick] = useState(0)
  const overlay = useRef<HTMLDivElement>(null)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])

  const parts = token.trim().split('.')
  const dec = useMemo(() => {
    const t = token.trim()
    if (!t) return null
    const p = t.split('.')
    if (p.length !== 3) return { error: `A JWT has 3 dot-separated parts, this has ${p.length}.` }
    try {
      const header = decodeSeg(p[0]); let payload: any
      try { payload = decodeSeg(p[1]) } catch { payload = new TextDecoder().decode(b64urlToBytes(p[1])) }
      return { header, payload }
    } catch (e: any) { return { error: 'Could not decode: segments must be Base64URL-encoded JSON. ' + (e?.message ?? '') } }
  }, [token])

  const alg: string = dec && !('error' in dec) ? String(dec.header?.alg ?? '') : ''
  useEffect(() => {
    setVerify({ state: 'idle' })
    if (!dec || 'error' in dec || !secret.trim()) return
    if (!isSupported(alg)) { setVerify({ state: 'unsupported' }); return }
    let alive = true
    setVerify({ state: 'busy' })
    ;(async () => {
      try {
        const key = await importVerifyKey(alg, secret, secretFmt, dec.header?.kid)
        const res = await verifyJwt(token, key, { issuer: iss.trim(), audience: aud.trim(), clockTolerance: Math.max(0, Number(leeway) || 0) })
        if (alive) setVerify({ state: 'done', res })
      } catch (e) { if (alive) setVerify({ state: 'error', error: (e as Error).message }) }
    })()
    return () => { alive = false }
  }, [dec, secret, secretFmt, token, iss, aud, leeway, alg])

  const payload = dec && !('error' in dec) ? dec.payload : null
  const exp = typeof payload?.exp === 'number' ? payload.exp : null
  const nbf = typeof payload?.nbf === 'number' ? payload.nbf : null
  const expired = exp !== null && exp < now()
  const notYet = nbf !== null && nbf > now()

  return (
    <div className="space-y-4">
      <Pane title="Encoded token" actions={<>
        <Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={async () => { const k = await importSignKey('HS256', SAMPLE_SECRET, 'utf8'); setToken(await signJwt({ typ: 'JWT' }, SAMPLE_PAYLOAD(), 'HS256', k)); setSecret(SAMPLE_SECRET); setSecretFmt('utf8') }}>Sample</Button>
        {token && <Button size="sm" variant="ghost" onClick={() => setToken('')}>Clear</Button>}
      </>}>
        <div className="relative">
          <textarea value={token} onScroll={(e) => { if (overlay.current) overlay.current.scrollTop = e.currentTarget.scrollTop }} onChange={(e) => setToken(e.target.value.replace(/^Bearer\s+/i, ''))} spellCheck={false} placeholder="Paste a JWT (eyJhbGciOi...). A leading 'Bearer ' is removed for you"
            style={{ fieldSizing: 'content' } as React.CSSProperties} className="min-h-28 w-full resize-none bg-transparent p-4 font-mono text-sm text-transparent caret-fg outline-none placeholder:text-muted/60 break-all" />
          <div ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-all p-4 font-mono text-sm">
            {parts.map((p, i) => <span key={i}><span className={['text-[#ef4444]', 'text-accent', 'text-[#06b6d4]'][i] ?? 'text-muted'}>{p}</span>{i < parts.length - 1 && <span className="text-muted">.</span>}</span>)}
          </div>
        </div>
      </Pane>

      {dec && 'error' in dec && <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{dec.error}</div>}

      {payload !== null && dec && !('error' in dec) && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge color="#f5a524">ALG {dec.header.alg ?? '?'}</Badge>
            {dec.header.typ && <Badge color="#06b6d4">TYP {dec.header.typ}</Badge>}
            {exp !== null && (expired ? <Badge color="#ef4444">EXPIRED {rel(exp).toUpperCase()}</Badge> : <Badge color="#22c55e">VALID · EXPIRES {rel(exp).toUpperCase()}</Badge>)}
            {exp === null && <Badge color="#f59e0b">NO EXPIRY</Badge>}
            {notYet && <Badge color="#f59e0b">NOT ACTIVE YET</Badge>}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Pane title={<span className="text-[#ef4444]">Header</span>} actions={<CopyButton text={JSON.stringify(dec.header, null, 2)} variant="ghost" />}>
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
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold"><span className="text-[#06b6d4]">Signature</span> verification<span className="text-xs font-normal text-muted">{alg} {algDesc(alg) && `| ${algDesc(alg)}`}</span></div>
            {isHmac(alg) ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input type="text" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={`Shared secret for ${alg}`} className="font-mono" aria-label="Shared secret" />
                <Segmented value={secretFmt} onChange={setSecretFmt} options={[{ value: 'utf8', label: 'Text' }, { value: 'base64url', label: 'Base64' }]} />
              </div>
            ) : (
              <Field label="Public key" hint={secret.trim() ? KEY_KIND_LABEL[detectKey(secret)] : 'PEM public key, certificate, JWK or JWK Set (kid picks the key). A private key also works.'}>
                <Textarea value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={'-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'} className="min-h-28 text-xs" />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Expected issuer"><Input value={iss} onChange={(e) => setIss(e.target.value)} placeholder="optional" /></Field>
              <Field label="Expected audience"><Input value={aud} onChange={(e) => setAud(e.target.value)} placeholder="optional" /></Field>
              <Field label="Clock leeway (s)"><Input value={leeway} onChange={(e) => setLeeway(e.target.value)} inputMode="numeric" /></Field>
            </div>
            <VerifyStatus v={verify} alg={alg} />
          </Card>
        </motion.div>
      )}

      {!token && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">Paste a token above. Decoding happens locally, tokens are never sent anywhere.</div>}
    </div>
  )
}

function VerifyStatus({ v, alg }: { v: { state: string; res?: VerifyResult; error?: string }; alg: string }) {
  const box = (cls: string, icon: React.ReactNode, text: React.ReactNode) => <div className={cn('flex items-start gap-2 rounded-xl px-3 py-2 text-sm', cls)}><span className="mt-0.5 shrink-0">{icon}</span><span>{text}</span></div>
  if (v.state === 'unsupported') return box('bg-surface-2 text-muted', <ShieldQuestion className="size-4" />, alg === 'none' ? 'This token is unsigned (alg "none"), so there is nothing to verify. Never trust it.' : `The algorithm "${alg}" is not supported here. Supported: ${JWT_ALGS.join(', ')}.`)
  if (v.state === 'error') return box('bg-danger/10 text-danger', <ShieldX className="size-4" />, v.error)
  if (v.state === 'busy') return box('bg-surface-2 text-muted', <ShieldQuestion className="size-4" />, 'Checking')
  if (v.state === 'done' && v.res) {
    if (v.res.signature === 'bad') return box('bg-danger/10 text-danger', <ShieldX className="size-4" />, `Invalid signature. ${v.res.error ?? ''}. Wrong key, or the token was changed.`)
    if (!v.res.claims.ok) return box('bg-warn/10 text-warn', <ShieldAlert className="size-4" />, <>Signature verified, but the claims did not pass: {v.res.claims.problems.join('; ')}.</>)
    return box('bg-success/10 text-success', <ShieldCheck className="size-4" />, 'Signature verified and the claims are valid.')
  }
  return box('bg-surface-2 text-muted', <ShieldQuestion className="size-4" />, isHmac(alg) ? 'Enter the secret to verify the signature. Nothing leaves your browser.' : 'Paste the public key to verify the signature. Nothing leaves your browser.')
}

function Sign() {
  const [alg, setAlg] = useState<JwtAlg>('HS256')
  const [header, setHeader] = useState('')
  const [payload, setPayload] = useState(() => JSON.stringify(SAMPLE_PAYLOAD(), null, 2))
  const [secret, setSecret] = useState('change-me-to-a-long-random-secret')
  const [secretFmt, setSecretFmt] = useState<SecretFormat>('utf8')
  const [privKey, setPrivKey] = useState('')
  const [pair, setPair] = useState<KeyPairOut | null>(null)
  const [genBusy, setGenBusy] = useState(false)
  const [out, setOut] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [expIn, setExpIn] = useState('3600')
  const hs = isHmac(alg)

  useEffect(() => { setHeader((h) => { try { const o = JSON.parse(h || '{}'); return JSON.stringify({ ...o, alg, typ: o.typ ?? 'JWT' }, null, 2) } catch { return JSON.stringify({ alg, typ: 'JWT' }, null, 2) } }) }, [alg])
  useEffect(() => { if (!hs && pair && !pair.privatePem) setPair(null) }, [alg])
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        let h: Record<string, unknown>, p: unknown
        try { h = JSON.parse(header || '{}') } catch { throw new Error('Header must be valid JSON') }
        try { p = JSON.parse(payload) } catch { throw new Error('Payload must be valid JSON') }
        if (!hs && !privKey.trim()) throw new Error(`Paste a private key for ${alg}, or press Make a key pair`)
        const key = await importSignKey(alg, hs ? secret : privKey, secretFmt)
        const tok = await signJwt(h, p, alg, key)
        if (alive) { setOut(tok); setErr(null) }
      } catch (e: any) { if (alive) { setErr(e.message); setOut('') } }
    })()
    return () => { alive = false }
  }, [alg, header, payload, secret, secretFmt, privKey, hs])

  const stamp = () => {
    try { const p = JSON.parse(payload); p.iat = now(); const n = Number(expIn); if (n > 0) p.exp = now() + n; else delete p.exp; setPayload(JSON.stringify(p, null, 2)) } catch { setErr('Payload must be valid JSON') }
  }
  const makeKeys = async () => {
    setGenBusy(true)
    try {
      const k = await generateKeys(alg)
      setPair(k)
      if (hs) { setSecret(k.secret!); setSecretFmt('base64url') }
      else {
        setPrivKey(k.privatePem)
        const kid = JSON.parse(k.publicJwk).kid
        setHeader((h) => { try { return JSON.stringify({ ...JSON.parse(h || '{}'), kid }, null, 2) } catch { return h } })
      }
    } catch (e) { setErr((e as Error).message) } finally { setGenBusy(false) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Algorithm" hint={algDesc(alg)}><Select value={alg} onChange={setAlg} options={[...JWT_ALGS]} /></Field>
            <Field label="Expires in (seconds)"><div className="flex gap-2"><Input value={expIn} onChange={(e) => setExpIn(e.target.value)} inputMode="numeric" /><Button variant="secondary" onClick={stamp} title="Set iat to now and exp">Stamp</Button></div></Field>
          </div>
          {hs ? (
            <Field label="Secret" hint={<button className="inline-flex items-center gap-1 text-accent hover:underline" onClick={makeKeys}><RefreshCw className="size-3" />random</button>}>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono" aria-label="Secret" />
                <Segmented value={secretFmt} onChange={setSecretFmt} options={[{ value: 'utf8', label: 'Text' }, { value: 'base64url', label: 'Base64' }]} />
              </div>
            </Field>
          ) : (
            <Field label="Private key" hint={privKey.trim() ? KEY_KIND_LABEL[detectKey(privKey)] : 'PKCS#8 PEM or private JWK'}>
              <Textarea value={privKey} onChange={(e) => setPrivKey(e.target.value)} placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'} className="min-h-28 text-xs" />
            </Field>
          )}
          {!hs && <Button variant="outline" icon={<Wand2 className="size-4" />} loading={genBusy} onClick={makeKeys}>Make a {alg} key pair</Button>}
          <Field label="Header"><Textarea value={header} onChange={(e) => setHeader(e.target.value)} className="min-h-20" /></Field>
          <Field label="Payload"><Textarea value={payload} onChange={(e) => setPayload(e.target.value)} className="min-h-56" /></Field>
        </Card>
      </div>
      <div className="space-y-3">
        <Pane title="Signed JWT" actions={out ? <CopyButton text={out} /> : null}>
          {err ? <div className="p-4 text-sm text-danger">{err}</div> : (
            <div className="break-all p-4 font-mono text-sm leading-relaxed">
              {out.split('.').map((p, i) => <span key={i}><span className={['text-[#ef4444]', 'text-accent', 'text-[#06b6d4]'][i]}>{p}</span>{i < 2 && <span className="text-muted">.</span>}</span>)}
            </div>
          )}
        </Pane>
        {pair && !hs && pair.publicPem && (
          <>
            <Pane title="Public key (PEM), give this to verifiers" actions={<CopyButton text={pair.publicPem} variant="ghost" />}><CodeView code={pair.publicPem} lang="generic" className="max-h-48" /></Pane>
            <Pane title="Public JWK" actions={<CopyButton text={pair.publicJwk} variant="ghost" />}><CodeView code={pair.publicJwk} lang="json" className="max-h-48" /></Pane>
            <Pane title="Private JWK, keep it secret" actions={<CopyButton text={pair.privateJwk} variant="ghost" />}><CodeView code={pair.privateJwk} lang="json" className="max-h-48" /></Pane>
          </>
        )}
        {pair && hs && <Pane title="Secret as JWK" actions={<CopyButton text={pair.privateJwk} variant="ghost" />}><CodeView code={pair.privateJwk} lang="json" /></Pane>}
        <p className="text-xs text-muted">Signed in your browser with jose and the Web Crypto API. Keys are made locally and never leave this page. Keep production keys off shared machines.</p>
      </div>
    </div>
  )
}

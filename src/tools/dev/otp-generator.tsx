import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, ShieldCheck, ShieldX, Download } from 'lucide-react'
import { Button, Input, Segmented, Select, Label, CopyButton } from '@/components/ui'
import { downloadDataUrl } from '@/lib/files'
import { toast } from '@/components/toast'
import { Bar, Status, KV, useLib } from './_b5/shell'

export default function OtpGenerator() {
  const OTP = useLib('otpauth', () => import('otpauth'))
  const [type, setType] = useState<'totp' | 'hotp'>('totp')
  const [secret, setSecret] = useState('')
  const [issuer, setIssuer] = useState('OpenFile')
  const [label, setLabel] = useState('me@example.com')
  const [algo, setAlgo] = useState<'SHA1' | 'SHA256' | 'SHA512'>('SHA1')
  const [digits, setDigits] = useState<'6' | '8'>('6')
  const [period, setPeriod] = useState(30)
  const [counter, setCounter] = useState(0)
  const [uriIn, setUriIn] = useState('')
  const [check, setCheck] = useState('')
  const [now, setNow] = useState(Date.now())
  const [qr, setQr] = useState('')
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t) }, [])
  useEffect(() => { if (OTP && !secret) setSecret(new OTP.Secret({ size: 20 }).base32) }, [OTP])

  const otp = useMemo(() => {
    if (!OTP || !secret.trim()) return null
    try {
      const s = OTP.Secret.fromBase32(secret.replace(/\s+/g, '').toUpperCase())
      const common = { issuer, label, algorithm: algo, digits: Number(digits), secret: s }
      return type === 'totp' ? new OTP.TOTP({ ...common, period }) : new OTP.HOTP({ ...common, counter })
    } catch (e: any) { return { err: 'The secret must be Base32 (letters A to Z and digits 2 to 7).' } }
  }, [OTP, secret, issuer, label, algo, digits, period, counter, type])

  const valid = otp && !('err' in otp)
  const uri = valid ? (otp as any).toString() : ''
  useEffect(() => { if (!uri) return setQr(''); import('qrcode').then((Q) => Q.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' })).then(setQr) }, [uri])

  const code = valid ? (type === 'totp' ? (otp as any).generate({ timestamp: now }) : (otp as any).generate({ counter })) : ''
  const left = type === 'totp' ? period - Math.floor(now / 1000) % period : 0
  const nextCode = valid && type === 'totp' ? (otp as any).generate({ timestamp: now + period * 1000 }) : ''
  const delta = valid && check.replace(/\D/g, '').length === Number(digits) ? (type === 'totp' ? (otp as any).validate({ token: check.replace(/\D/g, ''), timestamp: now, window: 1 }) : (otp as any).validate({ token: check.replace(/\D/g, ''), counter, window: 10 })) : undefined

  const importUri = () => {
    if (!OTP) return
    try {
      const o: any = OTP.URI.parse(uriIn.trim())
      setType(o instanceof OTP.TOTP ? 'totp' : 'hotp'); setSecret(o.secret.base32); setIssuer(o.issuer); setLabel(o.label); setAlgo(o.algorithm); setDigits(String(o.digits) as '6'); if (o.period) setPeriod(o.period); if (o.counter !== undefined) setCounter(o.counter); setUriIn('')
    } catch { toast('That is not a valid otpauth:// link.', 'error') }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Bar><Segmented value={type} onChange={setType} options={[{ value: 'totp', label: 'TOTP (time based)' }, { value: 'hotp', label: 'HOTP (counter based)' }]} /></Bar>
        {otp && 'err' in otp && <Status kind="err">{otp.err}</Status>}
        {valid && (
          <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-surface p-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Current code</div>
              <div className="font-mono text-5xl font-semibold tracking-[0.15em] text-accent tabular-nums" aria-live="polite">{code.replace(/(\d{3})(?=\d)/g, '$1 ')}</div>
              <div className="mt-2 flex items-center gap-2"><CopyButton text={code} />{type === 'hotp' && <Button size="sm" variant="outline" onClick={() => setCounter(counter + 1)}>Next counter ({counter + 1})</Button>}</div>
            </div>
            {type === 'totp' && (
              <div className="flex items-center gap-4">
                <svg viewBox="0 0 36 36" className="size-20 -rotate-90" aria-label={`${left} seconds left`}>
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke={left <= 5 ? 'var(--color-danger)' : 'var(--accent)'} strokeWidth="3" strokeDasharray={`${(left / period) * 97.4} 97.4`} strokeLinecap="round" />
                </svg>
                <div><div className="font-display text-2xl tabular-nums">{left}s</div><div className="text-xs text-muted">next: <span className="font-mono">{nextCode}</span></div></div>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label hint={<button className="text-accent hover:underline" onClick={() => OTP && setSecret(new OTP.Secret({ size: 20 }).base32)}><RefreshCw className="mr-1 inline size-3" />New secret</button>}>Secret (Base32)</Label>
            <div className="flex gap-2"><Input value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono" spellCheck={false} /><CopyButton text={secret} label="" /></div>
          </div>
          <div><Label>Issuer</Label><Input value={issuer} onChange={(e) => setIssuer(e.target.value)} /></div>
          <div><Label>Account</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div><Label>Algorithm</Label><Select value={algo} onChange={setAlgo} options={['SHA1', 'SHA256', 'SHA512']} /></div>
          <div><Label>Digits</Label><Segmented value={digits} onChange={setDigits} options={['6', '8']} /></div>
          {type === 'totp' ? <div><Label>Period (seconds)</Label><Input type="number" min={5} max={300} value={period} onChange={(e) => setPeriod(Math.max(5, Number(e.target.value) || 30))} /></div> : <div><Label>Counter</Label><Input type="number" min={0} value={counter} onChange={(e) => setCounter(Math.max(0, Number(e.target.value) || 0))} /></div>}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <Label>Check a code</Label>
          <div className="flex flex-wrap items-center gap-3">
            <Input value={check} onChange={(e) => setCheck(e.target.value)} placeholder={'0'.repeat(Number(digits))} className="w-40 font-mono text-lg tracking-widest" inputMode="numeric" aria-label="Code to check" />
            {delta === null && <span className="inline-flex items-center gap-1.5 text-sm text-danger"><ShieldX className="size-4" />Not valid right now</span>}
            {typeof delta === 'number' && <span className="inline-flex items-center gap-1.5 text-sm text-success"><ShieldCheck className="size-4" />Valid{delta !== 0 ? ` (${type === 'totp' ? `${delta > 0 ? 'next' : 'previous'} time step` : `counter +${delta}`})` : ''}</span>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <Label>Import an otpauth:// link</Label>
          <div className="flex gap-2"><Input value={uriIn} onChange={(e) => setUriIn(e.target.value)} placeholder="otpauth://totp/Issuer:me?secret=...&issuer=..." className="font-mono text-xs" /><Button variant="outline" onClick={importUri} disabled={!uriIn.trim()}>Import</Button></div>
        </div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Scan with an authenticator app</div>
          {qr ? <img src={qr} alt="QR code for the authenticator app" className="mx-auto w-56 rounded-xl bg-white p-2" /> : <div className="mx-auto grid size-56 place-items-center rounded-xl bg-surface-2 text-sm text-muted">QR code</div>}
          {qr && <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadDataUrl(qr, `${issuer || 'otp'}-qr.png`)}>Save QR</Button>}
          {uri && <KV label="otpauth URI" value={uri} />}
          <p className="text-left text-xs text-muted">Works with Google Authenticator, Microsoft Authenticator, Authy, 1Password and others. Codes are computed locally and match RFC 6238 (TOTP) and RFC 4226 (HOTP).</p>
        </div>
      </aside>
    </div>
  )
}

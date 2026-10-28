import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { Button, Input, Badge } from '@/components/ui'
import { Status, KV, useLib, useDebounced } from './_b5/shell'

const LABEL = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
const COLOR = ['#EF4444', '#F97316', '#F5A524', '#84CC16', '#10B981']

function entropyBits(pw: string): number {
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/\d/.test(pw)) pool += 10
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33
  if (/[^\x00-\x7f]/.test(pw)) pool += 100
  return pool ? Math.round([...pw].length * Math.log2(pool)) : 0
}

export default function PasswordStrength() {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [userInputs, setUserInputs] = useState('')
  const zxcvbn = useLib('b10-zxcvbn', async () => (await import('zxcvbn')).default)
  const p = useDebounced(pw, 80)
  const r = useMemo(() => (zxcvbn && p ? zxcvbn(p.slice(0, 100), userInputs.split(/[\s,]+/).filter(Boolean)) : null), [zxcvbn, p, userInputs])
  const score = r?.score ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="relative">
        <Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" spellCheck={false} placeholder="Type a password to test it" aria-label="Password" className="h-14 pr-14 font-mono text-xl" />
        <Button size="sm" variant="ghost" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} />
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <motion.div key={i} className="h-2 flex-1 rounded-full" animate={{ backgroundColor: pw && i <= score ? COLOR[score] : 'rgba(127,127,127,.2)', scaleY: pw && i === score ? 1.4 : 1 }} transition={{ duration: 0.25 }} />)}
      </div>
      <p className="text-sm text-muted">Checked only in this tab with zxcvbn. Nothing you type is stored or sent.</p>
      {!zxcvbn && <Status kind="info">Loading the password checker (about 800 KB, once)...</Status>}
      {r && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-display text-2xl font-semibold" style={{ color: COLOR[score] }}>{LABEL[score]}</span>
            <Badge>{Math.round(r.guesses_log10 * 10) / 10} on a log10 guess scale</Badge>
            <Badge>{entropyBits(pw)} bits if fully random</Badge>
          </div>
          {r.feedback.warning && <Status kind="err">{r.feedback.warning}</Status>}
          {r.feedback.suggestions.length > 0 && <ul className="list-inside list-disc space-y-1 text-sm">{r.feedback.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>}
          <div className="grid gap-2 sm:grid-cols-2">
            <KV label="Online attack, 10 guesses a second" value={String(r.crack_times_display.online_no_throttling_10_per_second)} copy={false} />
            <KV label="Online attack, 100 guesses an hour" value={String(r.crack_times_display.online_throttling_100_per_hour)} copy={false} />
            <KV label="Offline attack, slow hash (10k a second)" value={String(r.crack_times_display.offline_slow_hashing_1e4_per_second)} copy={false} />
            <KV label="Offline attack, fast hash (10 billion a second)" value={String(r.crack_times_display.offline_fast_hashing_1e10_per_second)} copy={false} />
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 text-sm font-semibold">How it would be guessed</div>
            <div className="flex flex-wrap gap-2">
              {r.sequence.map((m, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm">
                  <code className="font-semibold">{show ? m.token : '*'.repeat(m.token.length)}</code>
                  <div className="text-xs text-muted">{m.pattern === 'dictionary' ? `${(m as { l33t?: boolean }).l33t ? 'leet ' : ''}word from ${(m as { dictionary_name?: string }).dictionary_name?.replace(/_/g, ' ')}` : m.pattern === 'bruteforce' ? 'random characters' : m.pattern}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <Input value={userInputs} onChange={(e) => setUserInputs(e.target.value)} placeholder="Optional: your name, email or site name, to check the password does not use them" aria-label="Words to avoid" />
    </div>
  )
}

/* Password input with show/hide, strength estimation and a generator */
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/components/ui'

export function strength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; bits: number; tips: string[] } {
  if (!pw) return { score: 0, label: 'Empty', bits: 0, tips: [] }
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/\d/.test(pw)) pool += 10
  if (/[^A-Za-z0-9]/.test(pw)) pool += 33
  let bits = pw.length * Math.log2(Math.max(pool, 2))
  const tips: string[] = []
  if (/(.)\1{2,}/.test(pw)) { bits -= 10; tips.push('Avoid repeated characters') }
  if (/(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf|zxcv)/i.test(pw)) { bits -= 12; tips.push('Avoid sequences like 1234 or qwerty') }
  if (/^(password|letmein|welcome|admin|iloveyou|monkey|dragon|qwerty)/i.test(pw)) { bits -= 25; tips.push('This is a very common password') }
  if (pw.length < 10) tips.push('Use at least 10–12 characters')
  if (pool < 60) tips.push('Mix upper & lower case, numbers and symbols')
  bits = Math.max(0, bits)
  const score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as 0 | 1 | 2 | 3 | 4
  return { score, bits: Math.round(bits), label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score], tips }
}

export function generatePassword(len = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?']
  const all = sets.join('')
  const rnd = new Uint32Array(len)
  crypto.getRandomValues(rnd)
  const chars = Array.from(rnd, (n) => all[n % all.length])
  sets.forEach((s, i) => { chars[i] = s[rnd[i] % s.length] })
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd[i] % (i + 1);[chars[i], chars[j]] = [chars[j], chars[i]] }
  return chars.join('')
}

export function PasswordInput({ value, onChange, placeholder, autoFocus, invalid, onEnter, autoComplete = 'new-password' }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; invalid?: boolean; onEnter?: () => void; autoComplete?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} autoComplete={autoComplete} spellCheck={false}
        onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
        className={cn('h-11 w-full rounded-xl border bg-surface-2/60 pl-3 pr-10 font-mono text-sm text-fg outline-none transition placeholder:font-sans placeholder:text-muted/70 focus:ring-2', invalid ? 'border-danger focus:ring-danger/20' : 'border-border focus:border-accent focus:ring-accent/20')} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-fg cursor-pointer" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function StrengthMeter({ pw }: { pw: string }) {
  const s = strength(pw)
  const colors = ['bg-danger', 'bg-danger', 'bg-warn', 'bg-success', 'bg-success']
  const text = ['text-danger', 'text-danger', 'text-warn', 'text-success', 'text-success']
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => <div key={i} className={cn('h-1.5 rounded-full transition-all duration-300', pw && s.score > i ? colors[s.score] : pw && i === 0 ? colors[0] : 'bg-surface-2')} />)}
      </div>
      {pw && <div className="flex justify-between text-xs"><span className={cn('font-medium', text[s.score])}>{s.label}</span><span className="font-mono text-muted">~{s.bits} bits</span></div>}
      {pw && s.tips[0] && s.score < 3 && <div className="text-xs text-muted">{s.tips[0]}</div>}
    </div>
  )
}

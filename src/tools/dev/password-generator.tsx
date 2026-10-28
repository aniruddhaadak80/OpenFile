import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Eye, EyeOff, History, Trash2, ShieldCheck } from 'lucide-react'
import { Button, Card, Field, Input, Segmented, Switch, Slider, CopyButton, Select, cn } from '@/components/ui'
import { copyText } from '@/lib/files'
import { toast } from '@/components/toast'
import { randInt, DownloadButton, Pane } from './_dev/kit'
import { WORDS } from './_dev/wordlist'

const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789' }
const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>/?~'
const AMBIG = /[Il1O0o|`'"]/g

function genPassword(len: number, sets: { upper: boolean; lower: boolean; digits: boolean; symbols: boolean }, symbols: string, noAmbig: boolean) {
  const groups: string[] = []
  if (sets.upper) groups.push(SETS.upper); if (sets.lower) groups.push(SETS.lower); if (sets.digits) groups.push(SETS.digits)
  if (sets.symbols && symbols) groups.push([...new Set(symbols)].join(''))
  const g = groups.map((s) => (noAmbig ? s.replace(AMBIG, '') : s)).filter(Boolean)
  if (!g.length) return { pw: '', pool: 0 }
  const all = g.join('')
  const chars: string[] = []
  // guarantee one from each group, then fill and shuffle (Fisher-Yates with CSPRNG)
  for (const s of g) if (chars.length < len) chars.push(s[randInt(s.length)])
  while (chars.length < len) chars.push(all[randInt(all.length)])
  for (let i = chars.length - 1; i > 0; i--) { const j = randInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] }
  return { pw: chars.join(''), pool: new Set(all).size }
}

function genPassphrase(n: number, sep: string, cap: boolean, num: boolean) {
  const w = Array.from({ length: n }, () => { const x = WORDS[randInt(WORDS.length)]; return cap ? x[0].toUpperCase() + x.slice(1) : x })
  if (num) { const i = randInt(w.length); w[i] = w[i] + randInt(10) }
  return w.join(sep)
}

function crackTime(bits: number) {
  // offline fast-hash attack: 1e10 guesses/s; average = half keyspace
  const sec = Math.pow(2, bits - 1) / 1e10
  if (sec < 1) return 'instantly'
  const u: [number, string][] = [[3.15e16, 'billion years'], [3.15e13, 'million years'], [3.15e10, 'thousand years'], [3.15e9, 'centuries'], [3.15e7, 'years'], [2.6e6, 'months'], [86400, 'days'], [3600, 'hours'], [60, 'minutes'], [1, 'seconds']]
  for (const [s, n] of u) if (sec >= s) { const v = sec / s; return `${v >= 1000 ? 'over 1000' : Math.round(v)} ${n}` }
  return 'seconds'
}
function rating(bits: number) {
  if (bits < 36) return { label: 'Very weak', color: '#ef4444', pct: 0.15 }
  if (bits < 60) return { label: 'Weak', color: '#f97316', pct: 0.35 }
  if (bits < 80) return { label: 'Reasonable', color: '#f59e0b', pct: 0.55 }
  if (bits < 110) return { label: 'Strong', color: '#22c55e', pct: 0.8 }
  return { label: 'Very strong', color: '#10b981', pct: 1 }
}

export default function PasswordGenerator() {
  const [mode, setMode] = useState<'password' | 'passphrase'>('password')
  const [len, setLen] = useState(20)
  const [sets, setSets] = useState({ upper: true, lower: true, digits: true, symbols: true })
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [noAmbig, setNoAmbig] = useState(false)
  const [words, setWords] = useState(5)
  const [sep, setSep] = useState('-')
  const [cap, setCap] = useState(true)
  const [num, setNum] = useState(true)
  const [bulk, setBulk] = useState('1')
  const [show, setShow] = useState(true)
  const [list, setList] = useState<{ pw: string; bits: number }[]>([])
  const [history, setHistory] = useState<string[]>([])

  const make = useCallback(() => {
    const n = Number(bulk)
    const out: { pw: string; bits: number }[] = []
    for (let i = 0; i < n; i++) {
      if (mode === 'password') { const { pw, pool } = genPassword(len, sets, symbols, noAmbig); out.push({ pw, bits: pool ? len * Math.log2(pool) : 0 }) }
      else { const pw = genPassphrase(words, sep, cap, num); out.push({ pw, bits: words * Math.log2(WORDS.length) + (num ? Math.log2(10 * words) : 0) }) }
    }
    setList(out)
    if (out[0]?.pw) setHistory((h) => [out[0].pw, ...h.filter((x) => x !== out[0].pw)].slice(0, 20))
  }, [mode, len, sets, symbols, noAmbig, words, sep, cap, num, bulk])

  useEffect(() => { make() }, [make])

  const main = list[0]
  const r = rating(main?.bits ?? 0)
  const anySet = Object.values(sets).some(Boolean)

  const colored = useMemo(() => (main?.pw ?? '').split('').map((c, i) => (
    <span key={i} className={/[0-9]/.test(c) ? 'text-[#06b6d4]' : /[a-zA-Z]/.test(c) ? '' : 'text-[#fdba74]'}>{c}</span>
  )), [main?.pw])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-surface-2"><motion.div className="h-full" animate={{ width: `${r.pct * 100}%`, backgroundColor: r.color }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <AnimatePresence mode="popLayout">
              <motion.div key={main?.pw} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                className="min-w-0 flex-1 break-all font-mono text-xl font-medium leading-relaxed sm:text-2xl">
                {!anySet && mode === 'password' ? <span className="text-base text-danger">Select at least one character set</span> : show ? colored : '•'.repeat(Math.min(main?.pw.length ?? 0, 64))}
              </motion.div>
            </AnimatePresence>
            <div className="flex gap-1">
              <Button variant="ghost" size="md" onClick={() => setShow(!show)} icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} aria-label="Toggle visibility" />
              <Button variant="secondary" size="md" onClick={make} icon={<RefreshCw className="size-4" />} aria-label="Regenerate" />
              <CopyButton text={main?.pw ?? ''} size="md" variant="outline" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Strength</div><div className="font-semibold" style={{ color: r.color }}>{r.label}</div></div>
            <div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Entropy</div><div className="font-mono font-semibold">{(main?.bits ?? 0).toFixed(1)} bits</div></div>
            <div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Time to crack</div><div className="font-semibold">{crackTime(main?.bits ?? 0)}</div></div>
          </div>
          <p className="mt-3 text-[11px] text-muted">Crack time assumes an offline attacker making 10 billion guesses/second against a fast hash. Generated with crypto.getRandomValues, never leaves your device.</p>
        </Card>

        {list.length > 1 && (
          <Pane title={`${list.length} passwords`} actions={<><CopyButton text={() => list.map((x) => x.pw).join('\n')} label="Copy all" variant="ghost" /><DownloadButton text={() => list.map((x) => x.pw).join('\n') + '\n'} filename="passwords.txt" /></>}>
            <div className="scrollbar-thin max-h-96 overflow-auto py-1 font-mono text-[13px]">
              {list.map((x, i) => (
                <button key={i} onClick={async () => { if (await copyText(x.pw)) toast('Copied') }} className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-2">
                  <span className="w-6 text-right text-[11px] text-muted">{i + 1}</span><span className="min-w-0 flex-1 break-all">{show ? x.pw : '•'.repeat(Math.min(x.pw.length, 40))}</span>
                </button>
              ))}
            </div>
          </Pane>
        )}

        {history.length > 1 && (
          <Pane title={<span className="flex items-center gap-1.5"><History className="size-3.5" />History (this session only)</span>} actions={<Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setHistory([])}>Clear</Button>}>
            <div className="divide-y divide-border">
              {history.slice(1).map((h, i) => (
                <div key={h + i} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted">{show ? h : '•'.repeat(Math.min(h.length, 40))}</span>
                  <CopyButton text={h} label="" variant="ghost" />
                </div>
              ))}
            </div>
          </Pane>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'password', label: 'Password' }, { value: 'passphrase', label: 'Passphrase' }]} className="w-full" />
          {mode === 'password' ? (
            <>
              <div>
                <Slider label="Length" value={len} onChange={setLen} min={4} max={128} />
                <div className="mt-2 flex gap-1.5">{[12, 16, 20, 32, 64].map((n) => <button key={n} onClick={() => setLen(n)} className={cn('flex-1 rounded-lg border py-1 text-xs', len === n ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg')}>{n}</button>)}</div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <Switch checked={sets.upper} onChange={(v) => setSets({ ...sets, upper: v })} label="Uppercase  A–Z" />
                <Switch checked={sets.lower} onChange={(v) => setSets({ ...sets, lower: v })} label="Lowercase  a–z" />
                <Switch checked={sets.digits} onChange={(v) => setSets({ ...sets, digits: v })} label="Digits  0–9" />
                <Switch checked={sets.symbols} onChange={(v) => setSets({ ...sets, symbols: v })} label="Symbols" />
                <Switch checked={noAmbig} onChange={setNoAmbig} label="Exclude ambiguous (I l 1 O 0 o |)" />
              </div>
              {sets.symbols && <Field label="Custom symbols" hint={<button className="text-accent hover:underline" onClick={() => setSymbols(DEFAULT_SYMBOLS)}>reset</button>}><Input value={symbols} onChange={(e) => setSymbols(e.target.value)} className="font-mono" /></Field>}
            </>
          ) : (
            <>
              <Slider label="Words" value={words} onChange={setWords} min={3} max={12} />
              <Field label="Separator"><Select value={sep} onChange={setSep} options={[{ value: '-', label: 'Hyphen  -' }, { value: ' ', label: 'Space' }, { value: '.', label: 'Dot  .' }, { value: '_', label: 'Underscore  _' }, { value: '', label: 'None' }, { value: ',', label: 'Comma  ,' }]} /></Field>
              <Switch checked={cap} onChange={setCap} label="Capitalize words" />
              <Switch checked={num} onChange={setNum} label="Add a digit" />
              <p className="text-xs text-muted">From a built-in list of {WORDS.length.toLocaleString()} memorable words (EFF short list), ~{Math.log2(WORDS.length).toFixed(1)} bits per word.</p>
            </>
          )}
          <Field label="Bulk generate"><Select value={bulk} onChange={setBulk} options={['1', '5', '10', '25', '50', '100'].map((v) => ({ value: v, label: v === '1' ? 'Just one' : `${v} at once` }))} /></Field>
          <Button className="w-full" icon={<ShieldCheck className="size-4" />} onClick={make}>Generate</Button>
        </Card>
      </aside>
    </div>
  )
}

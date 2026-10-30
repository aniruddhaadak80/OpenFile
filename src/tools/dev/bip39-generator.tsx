import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck, ShieldX, Eye, EyeOff, WifiOff } from 'lucide-react'
import { Button, Segmented, Select, Input, Label, Textarea, CopyButton, Spinner, cn } from '@/components/ui'
import { Bar, Status, KV } from './_b5/shell'

const LANGS = { english: 'English', spanish: 'Spanish', french: 'French', italian: 'Italian', portuguese: 'Portuguese', czech: 'Czech', japanese: 'Japanese', korean: 'Korean', 'simplified-chinese': 'Chinese (simplified)', 'traditional-chinese': 'Chinese (traditional)' } as const
type Lang = keyof typeof LANGS
const loaders: Record<Lang, () => Promise<{ wordlist: string[] }>> = {
  english: () => import('@scure/bip39/wordlists/english.js'), spanish: () => import('@scure/bip39/wordlists/spanish.js'), french: () => import('@scure/bip39/wordlists/french.js'), italian: () => import('@scure/bip39/wordlists/italian.js'), portuguese: () => import('@scure/bip39/wordlists/portuguese.js'), czech: () => import('@scure/bip39/wordlists/czech.js'), japanese: () => import('@scure/bip39/wordlists/japanese.js'), korean: () => import('@scure/bip39/wordlists/korean.js'), 'simplified-chinese': () => import('@scure/bip39/wordlists/simplified-chinese.js'), 'traditional-chinese': () => import('@scure/bip39/wordlists/traditional-chinese.js'),
}
const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')

export default function Bip39Generator() {
  const [mode, setMode] = useState<'gen' | 'check'>('gen')
  const [lang, setLang] = useState<Lang>('english')
  const [words, setWords] = useState<'12' | '15' | '18' | '21' | '24'>('12')
  const [list, setList] = useState<string[] | null>(null)
  const [lib, setLib] = useState<typeof import('@scure/bip39') | null>(null)
  const [mnemonic, setMnemonic] = useState('')
  const [pass, setPass] = useState('')
  const [hide, setHide] = useState(false)
  const [seed, setSeed] = useState('')
  const [input, setInput] = useState('')

  useEffect(() => { import('@scure/bip39').then(setLib) }, [])
  useEffect(() => { setList(null); loaders[lang]().then((m) => setList(m.wordlist)) }, [lang])
  const make = () => { if (lib && list) setMnemonic(lib.generateMnemonic(list, (Number(words) / 3) * 32)) }
  useEffect(() => { if (mode === 'gen') make() }, [lib, list, words])

  const phrase = mode === 'gen' ? mnemonic : input.trim().toLowerCase().replace(/\s+/g, ' ')
  const sep = lang === 'japanese' ? '\u3000' : ' '
  const valid = lib && list && phrase ? lib.validateMnemonic(phrase.split(' ').join(sep), list) : null
  const entropy = valid && lib && list ? hex(lib.mnemonicToEntropy(phrase.split(' ').join(sep), list)) : ''
  useEffect(() => { let alive = true; setSeed(''); if (valid && lib) lib.mnemonicToSeed(phrase.split(' ').join(sep), pass).then((s) => alive && setSeed(hex(s))); return () => { alive = false } }, [valid, phrase, pass, lib])
  const bad = mode === 'check' && list && phrase ? phrase.split(' ').filter((w) => !list.includes(w)) : []

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'gen', label: 'Generate' }, { value: 'check', label: 'Validate a phrase' }]} />
        <Select value={lang} onChange={setLang} options={Object.entries(LANGS).map(([value, label]) => ({ value: value as Lang, label }))} className="w-52" />
        {mode === 'gen' && <><Segmented value={words} onChange={setWords} options={['12', '15', '18', '21', '24'].map((w) => ({ value: w as '12', label: `${w} words` }))} /><Button size="sm" icon={<RefreshCw className="size-4" />} onClick={make}>New phrase</Button></>}
      </Bar>
      <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn"><WifiOff className="mt-0.5 size-4 shrink-0" />For a real wallet, disconnect from the internet first and write the words on paper. Anyone who sees this phrase can take the funds. Words are generated with your browser's secure random generator and never sent anywhere.</div>
      {!list || !lib ? <Spinner label="Loading word list…" /> : mode === 'gen' ? (
        <div className="space-y-2">
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" icon={hide ? <Eye className="size-4" /> : <EyeOff className="size-4" />} onClick={() => setHide(!hide)}>{hide ? 'Show' : 'Hide'}</Button><CopyButton text={mnemonic} /></div>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {mnemonic.split(/[\s\u3000]+/).map((w, i) => <li key={i} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"><span className="w-6 text-right font-mono text-xs text-muted">{i + 1}</span><span className={cn('font-mono text-[15px] font-medium', hide && 'blur-sm select-none')}>{w}</span></li>)}
          </ol>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type or paste 12 to 24 words separated by spaces" className="min-h-24 font-mono" aria-label="Mnemonic phrase" />
          {phrase && (valid ? <Status kind="ok"><span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />Valid {phrase.split(' ').length}-word phrase with a correct checksum.</span></Status>
            : <Status kind="err"><span className="inline-flex items-center gap-2"><ShieldX className="size-4" />Not valid.</span> {bad.length ? `Unknown word${bad.length > 1 ? 's' : ''}: ${bad.slice(0, 6).join(', ')}.` : ![12, 15, 18, 21, 24].includes(phrase.split(' ').length) ? `It has ${phrase.split(' ').length} words; it needs 12, 15, 18, 21 or 24.` : 'All words are known but the checksum does not match. A word may be wrong or out of order.'}</Status>)}
        </div>
      )}
      {valid && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>Optional passphrase (the "25th word")</Label>
            <Input aria-label="Optional passphrase (the &quot;25th word&quot;)" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Leave empty for none" autoComplete="off" />
            <KV label={`Entropy (${entropy.length * 4} bits)`} value={entropy} />
          </div>
          <KV label="BIP39 seed (512-bit, hex)" value={seed || '…'} />
        </div>
      )}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Button, Input, Segmented, Select, Switch, CopyButton } from '@/components/ui'
import { Bar, Status, useStored } from '../dev/_b5/shell'
import { numberToWords, wordsToNumber } from '@/lib/b10/text'

const CURRENCIES = {
  usd: { label: 'US dollar', major: 'dollar', majorPl: 'dollars', minor: 'cent', minorPl: 'cents' },
  inr: { label: 'Indian rupee', major: 'rupee', majorPl: 'rupees', minor: 'paisa', minorPl: 'paise' },
  eur: { label: 'Euro', major: 'euro', majorPl: 'euros', minor: 'cent', minorPl: 'cents' },
  gbp: { label: 'British pound', major: 'pound', majorPl: 'pounds', minor: 'penny', minorPl: 'pence' },
  bdt: { label: 'Bangladeshi taka', major: 'taka', majorPl: 'taka', minor: 'poisha', minorPl: 'poisha' },
  jpy: { label: 'Japanese yen', major: 'yen', majorPl: 'yen', minor: 'sen', minorPl: 'sen' },
  aud: { label: 'Australian dollar', major: 'dollar', majorPl: 'dollars', minor: 'cent', minorPl: 'cents' },
}
type Cur = keyof typeof CURRENCIES
type Mode = 'plain' | 'ordinal' | 'currency' | 'cheque' | 'year'
const titleCase = (s: string) => s.replace(/\b[a-z]/g, (m) => m.toUpperCase())

export default function NumbersToWords() {
  const [dir, setDir] = useState<'n2w' | 'w2n'>('n2w')
  const [num, setNum] = useStored('b10:n2w:num', '1250075.50')
  const [txt, setTxt] = useStored('b10:n2w:txt', 'twelve lakh fifty thousand and seventy-five')
  const [system, setSystem] = useStored<'intl' | 'indian'>('b10:n2w:sys', 'intl')
  const [mode, setMode] = useState<Mode>('plain')
  const [cur, setCur] = useStored<Cur>('b10:n2w:cur', 'usd')
  const [and, setAnd] = useState(false)
  const [caps, setCaps] = useState<'lower' | 'sentence' | 'title' | 'upper'>('sentence')
  const res = useMemo(() => {
    try {
      if (dir === 'w2n') { const v = wordsToNumber(txt); const [i, d] = v.split('.'); return { out: v, extra: Number(i).toLocaleString('en-US') + (d ? '.' + d : ''), extra2: system === 'indian' ? Number(i).toLocaleString('en-IN') + (d ? '.' + d : '') : '' } }
      let w = numberToWords(num, { system, and, mode, currency: CURRENCIES[cur] })
      w = caps === 'upper' ? w.toUpperCase() : caps === 'title' ? titleCase(w) : caps === 'sentence' ? w.charAt(0).toUpperCase() + w.slice(1) : w.toLowerCase()
      return { out: w }
    } catch (e) { return { err: (e as Error).message } }
  }, [dir, num, txt, system, and, mode, cur, caps])
  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={dir} onChange={setDir} options={[{ value: 'n2w', label: 'Number to words' }, { value: 'w2n', label: 'Words to number' }]} />
        <Segmented value={system} onChange={setSystem} options={[{ value: 'intl', label: 'Million, billion' }, { value: 'indian', label: 'Lakh, crore' }]} />
        {dir === 'n2w' && <Button size="sm" variant="ghost" className="ml-auto" icon={<ArrowLeftRight className="size-4" />} onClick={() => { if ('out' in res && res.out) { setTxt(res.out.toLowerCase().replace(/ only$/, '')); setDir('w2n') } }} disabled={mode !== 'plain'}>Check it back</Button>}
      </Bar>
      {dir === 'n2w' ? (
        <div className="space-y-3">
          <Input value={num} onChange={(e) => setNum(e.target.value)} inputMode="decimal" aria-label="Number" className="h-14 font-mono text-2xl" placeholder="1234.56" />
          <div className="flex flex-wrap items-center gap-3">
            <Segmented value={mode} onChange={setMode} options={[{ value: 'plain', label: 'Plain' }, { value: 'ordinal', label: 'Ordinal' }, { value: 'currency', label: 'Currency' }, { value: 'cheque', label: 'Cheque' }, { value: 'year', label: 'Year' }]} />
            {(mode === 'currency' || mode === 'cheque') && <Select aria-label="Currency" value={cur} onChange={setCur} options={Object.entries(CURRENCIES).map(([k, v]) => ({ value: k as Cur, label: v.label }))} className="w-48" />}
            <Select aria-label="Letter case" value={caps} onChange={setCaps} options={[{ value: 'sentence', label: 'Sentence case' }, { value: 'lower', label: 'lower case' }, { value: 'title', label: 'Title Case' }, { value: 'upper', label: 'UPPER CASE' }]} className="w-40" />
            <Switch checked={and} onChange={setAnd} label='Use "and" after hundred' />
          </div>
        </div>
      ) : (
        <Input value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Number in words" className="h-14 text-lg" placeholder="two hundred and five" />
      )}
      {'err' in res ? <Status kind="err">{res.err}</Status> : (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-start gap-3">
            <p className="flex-1 break-words font-display text-2xl leading-snug">{res.out}</p>
            <CopyButton text={res.out ?? ''} />
          </div>
          {'extra' in res && res.extra && <p className="mt-2 font-mono text-sm text-muted">{res.extra}{res.extra2 ? `  |  ${res.extra2}` : ''}</p>}
        </div>
      )}
    </div>
  )
}

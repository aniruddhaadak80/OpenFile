import { useMemo } from 'react'
import { Segmented, Switch, Input } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { romanLines } from '@/lib/b11/text'

export default function RomanNumerals() {
  const [t, setT] = useStored('b11:roman', '1994\nMMXXVI\n49')
  const out = useMemo(() => romanLines(t), [t])
  return <div className="space-y-4"><p className="text-sm text-muted">One number or numeral per line. Numbers 1 to 3999 become Roman numerals and numerals become numbers.</p><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="roman.txt" outMime="text/plain" /></div>
}

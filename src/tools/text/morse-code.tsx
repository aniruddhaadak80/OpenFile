import { useMemo } from 'react'
import { Segmented, Switch, Input } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { morseDecode } from '@/lib/b11/text'

export default function MorseCode() {
  const [t, setT] = useStored('b11:morse', 'HELLO WORLD')
  const out = useMemo(() => morseDecode(t), [t])
  return <div className="space-y-4"><p className="text-sm text-muted">Type text to get Morse, or paste dots and dashes to read it back. Letters are split by spaces and words by a slash.</p><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="morse.txt" outMime="text/plain" wrapOutput /></div>
}

import { useMemo } from 'react'
import { TwoPane, useStored } from '../dev/_b5/shell'
import { nato } from '@/lib/b12/text'

export default function NatoAlphabet() {
  const [t, setT] = useStored('b12:nato-alphabet', 'Hello world, this is OpenFile')
  const out = useMemo(() => nato(t), [t])
  return <div className="space-y-4"><p className="text-sm text-muted">Spell any text with the NATO phonetic alphabet, one line at a time.</p><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="nato-alphabet.txt" outMime="text/plain" /></div>
}

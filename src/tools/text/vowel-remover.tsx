import { useMemo } from 'react'
import { TwoPane, useStored } from '../dev/_b5/shell'
import { removeVowels } from '@/lib/b12/text'

export default function VowelRemover() {
  const [t, setT] = useStored('b12:vowel-remover', 'Hello world, this is OpenFile')
  const out = useMemo(() => removeVowels(t), [t])
  return <div className="space-y-4"><p className="text-sm text-muted">Strip vowels from every word.</p><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="vowel-remover.txt" outMime="text/plain" /></div>
}

import { useMemo } from 'react'
import { TwoPane, useStored } from '../dev/_b5/shell'
import { pigLatin } from '@/lib/b12/text'

export default function PigLatin() {
  const [t, setT] = useStored('b12:pig-latin', 'Hello world, this is OpenFile')
  const out = useMemo(() => pigLatin(t), [t])
  return <div className="space-y-4"><p className="text-sm text-muted">Type text and read it in Pig Latin. Everything runs in your browser.</p><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="pig-latin.txt" outMime="text/plain" /></div>
}

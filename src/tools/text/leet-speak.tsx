import { useMemo } from 'react'
import { TwoPane, useStored } from '../dev/_b5/shell'
import { leet } from '@/lib/b12/text'

export default function LeetSpeak() {
  const [t, setT] = useStored('b12:leet-speak', 'Hello world, this is OpenFile')
  const out = useMemo(() => leet(t), [t])
  return <div className="space-y-4"><p className="text-sm text-muted">Turn text into leet speak with number swaps.</p><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="leet-speak.txt" outMime="text/plain" /></div>
}

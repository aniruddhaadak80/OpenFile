import { useMemo } from 'react'
import { Segmented, Switch, Input } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { wrapText } from '@/lib/b11/text'

export default function TextWrapper() {
  const [t, setT] = useStored('b11:wrap', 'Paste a long paragraph here and it will be broken into lines of the width you pick, without splitting words.')
  const [n, setN] = useStored('b11:wrap:n', '40')
  const out = useMemo(() => wrapText(t, Math.max(5, parseInt(n) || 40)), [t, n])
  return <div className="space-y-4"><Bar><label className="text-sm">Line width</label><Input value={n} onChange={(e) => setN(e.target.value)} className="w-24" inputMode="numeric" /></Bar><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="wrapped.txt" outMime="text/plain" wrapOutput={false} /></div>
}

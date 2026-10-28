import { useMemo } from 'react'
import { TwoPane, useStored } from '../dev/_b5/shell'
import { upsideDown } from '@/lib/b12/text'

export default function UpsideDown() {
  const [t, setT] = useStored('b12:upside-down-text', 'Hello world, this is OpenFile')
  const out = useMemo(() => upsideDown(t), [t])
  return <div className="space-y-4"><p className="text-sm text-muted">Flip your text upside down with look-alike characters.</p><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="upside-down-text.txt" outMime="text/plain" /></div>
}

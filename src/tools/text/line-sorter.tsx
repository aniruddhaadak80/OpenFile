import { useMemo } from 'react'
import { Segmented, Switch, Input } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { sortLines, addLineNumbers, type SortMode } from '@/lib/b11/text'

export default function LineSorter() {
  const [t, setT] = useStored('b11:sort', 'item 10\nitem 2\nBanana\napple')
  const [m, setM] = useStored<SortMode>('b11:sort:m', 'natural')
  const [ic, setIc] = useStored('b11:sort:ic', true)
  const [num, setNum] = useStored('b11:sort:num', false)
  const out = useMemo(() => { const s = sortLines(t, m, ic); return num ? addLineNumbers(s, 1, '. ') : s }, [t, m, ic, num])
  return <div className="space-y-4"><Bar><Segmented value={m} onChange={setM} options={[{ value: 'natural', label: 'Natural' }, { value: 'az', label: 'A to Z' }, { value: 'za', label: 'Z to A' }, { value: 'length', label: 'Length' }, { value: 'numeric', label: 'Number' }, { value: 'reverse', label: 'Reverse' }, { value: 'random', label: 'Shuffle' }]} /><Switch checked={ic} onChange={setIc} label="Ignore case" /><Switch checked={num} onChange={setNum} label="Number lines" /></Bar><TwoPane input={t} setInput={setT} output={out} outputLang="generic" outName="sorted.txt" outMime="text/plain" accept=".txt,.csv,.log,text/*" /></div>
}

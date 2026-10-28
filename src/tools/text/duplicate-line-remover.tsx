import { useMemo } from 'react'
import { Segmented, Switch, Input } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { dedupe } from '@/lib/b11/text'
import { Status } from '../dev/_b5/shell'

export default function DupLines() {
  const [t, setT] = useStored('b11:dup', 'apple\nApple\nbanana\napple\n\ncherry')
  const [ic, setIc] = useStored('b11:dup:ic', true)
  const [tr, setTr] = useStored('b11:dup:tr', true)
  const [de, setDe] = useStored('b11:dup:de', false)
  const [od, setOd] = useStored('b11:dup:od', false)
  const r = useMemo(() => dedupe(t, { ignoreCase: ic, trim: tr, dropEmpty: de, onlyDuplicates: od }), [t, ic, tr, de, od])
  return <div className="space-y-4"><Bar><Switch checked={ic} onChange={setIc} label="Ignore case" /><Switch checked={tr} onChange={setTr} label="Trim spaces" /><Switch checked={de} onChange={setDe} label="Drop empty lines" /><Switch checked={od} onChange={setOd} label="Keep only repeated lines" /></Bar><Status kind="info">{r.removed} line{r.removed === 1 ? '' : 's'} removed</Status><TwoPane input={t} setInput={setT} output={r.text} outputLang="generic" outName="unique.txt" outMime="text/plain" accept=".txt,.csv,.log,text/*" /></div>
}

import { useMemo, useState } from 'react'
import { Segmented, Input, Switch, Select, Label } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { addLineNumbers, removeLineNumbers } from '@/lib/b5/textops'

const FORMATS = [{ value: '. ', label: '1. text' }, { value: ') ', label: '1) text' }, { value: ': ', label: '1: text' }, { value: '\t', label: '1⇥text (tab)' }, { value: ' | ', label: '1 | text' }, { value: '[{n}] ', label: '[1] text' }, { value: ' ', label: '1 text' }]

export default function LineNumbers() {
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [input, setInput] = useStored('b5:ln:input', 'First line\nSecond line\n\nFourth line after a blank')
  const [format, setFormat] = useState('. ')
  const [custom, setCustom] = useState('')
  const [start, setStart] = useState(1); const [step, setStep] = useState(1)
  const [pad, setPad] = useState<'none' | 'zero' | 'space'>('none')
  const [skipEmpty, setSkipEmpty] = useState(false)
  const out = useMemo(() => mode === 'add' ? addLineNumbers(input, { start, step, format: custom || format, pad, skipEmpty }) : removeLineNumbers(input), [mode, input, start, step, format, custom, pad, skipEmpty])
  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add numbers' }, { value: 'remove', label: 'Remove numbers' }]} />
        {mode === 'add' && <>
          <Select aria-label="Number format" value={format} onChange={setFormat} options={FORMATS} className="w-40" />
          <label className="flex items-center gap-1.5 text-sm"><span className="text-muted">Custom</span><Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Line {n}: " className="h-9 w-32 font-mono" /></label>
          <label className="flex items-center gap-1.5 text-sm"><span className="text-muted">Start</span><Input type="number" value={start} onChange={(e) => setStart(Number(e.target.value) || 0)} className="h-9 w-20" /></label>
          <label className="flex items-center gap-1.5 text-sm"><span className="text-muted">Step</span><Input type="number" value={step} onChange={(e) => setStep(Number(e.target.value) || 1)} className="h-9 w-20" /></label>
          <Segmented value={pad} onChange={setPad} options={[{ value: 'none', label: '1' }, { value: 'zero', label: '01' }, { value: 'space', label: ' 1' }]} />
          <Switch checked={skipEmpty} onChange={setSkipEmpty} label="Skip blank lines" />
        </>}
        {mode === 'remove' && <Label className="mb-0 normal-case tracking-normal">Strips leading numbers like 1. 1) [1] 001: and tab-separated numbers.</Label>}
      </Bar>
      <TwoPane input={input} setInput={setInput} output={out} outName="numbered.txt" accept="text/*" height="h-[440px]" />
    </div>
  )
}

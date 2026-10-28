import { useMemo } from 'react'
import { Segmented } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { reverseText } from '@/lib/b5/textops'

type Mode = 'chars' | 'words' | 'lines' | 'each-word' | 'each-line' | 'upside'
const MODES: { value: Mode; label: string }[] = [{ value: 'chars', label: 'Characters' }, { value: 'words', label: 'Word order' }, { value: 'lines', label: 'Line order' }, { value: 'each-word', label: 'Each word' }, { value: 'each-line', label: 'Each line' }, { value: 'upside', label: 'Upside down' }]

export default function TextReverser() {
  const [mode, setMode] = useStored<Mode>('b5:rev:mode', 'chars')
  const [input, setInput] = useStored('b5:rev:input', 'Hello world 👋\nThe quick brown fox\njumps over the lazy dog')
  const out = useMemo(() => reverseText(input, mode), [input, mode])
  return (
    <div className="space-y-4">
      <Bar><Segmented value={mode} onChange={setMode} options={MODES} /><span className="text-xs text-muted">Emoji and accented letters stay whole.</span></Bar>
      <TwoPane input={input} setInput={setInput} output={out} outName="reversed.txt" accept="text/*" height="h-[420px]" wrapOutput />
    </div>
  )
}

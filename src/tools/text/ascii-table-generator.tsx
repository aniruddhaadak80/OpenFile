import { useMemo, useState } from 'react'
import { Select, Switch, Slider } from '@/components/ui'
import { Bar, TwoPane, useStored } from '../dev/_b5/shell'
import { parseTable, renderTable, type TableStyle } from '@/lib/b10/text'

const STYLES: { value: TableStyle; label: string }[] = [
  { value: 'unicode', label: 'Unicode box ┌─┐' }, { value: 'rounded', label: 'Rounded ╭─╮' }, { value: 'double', label: 'Double ╔═╗' }, { value: 'heavy', label: 'Heavy ┏━┓' },
  { value: 'ascii', label: 'ASCII +-+' }, { value: 'markdown', label: 'Markdown | - |' }, { value: 'rst', label: 'reStructuredText grid' }, { value: 'compact', label: 'Plain columns' }, { value: 'dots', label: 'Dotted' },
]
const DELIMS = [{ value: 'auto', label: 'Detect separator' }, { value: ',', label: 'Comma' }, { value: '\t', label: 'Tab' }, { value: ';', label: 'Semicolon' }, { value: '|', label: 'Pipe' }, { value: '  ', label: 'Two or more spaces' }]
const SAMPLE = 'Tool,Category,Runs offline,Speed\nMerge PDF,PDF,yes,fast\nImage Compressor,Image,yes,very fast\nVideo to GIF,Video,yes,medium\n日本語 Font,Font,yes,fast'

export default function AsciiTableGenerator() {
  const [input, setInput] = useStored('b10:table:input', SAMPLE)
  const [style, setStyle] = useStored<TableStyle>('b10:table:style', 'unicode')
  const [delim, setDelim] = useState('auto')
  const [header, setHeader] = useState(true)
  const [rowLines, setRowLines] = useState(false)
  const [padding, setPadding] = useState(1)
  const [align, setAlign] = useState<'auto' | 'l' | 'c' | 'r'>('auto')
  const out = useMemo(() => {
    const rows = parseTable(input, delim === 'auto' ? undefined : delim)
    const cols = Math.max(0, ...rows.map((r) => r.length))
    return renderTable(rows, style, { header, rowLines, padding, align: align === 'auto' ? undefined : Array(cols).fill(align) })
  }, [input, style, delim, header, rowLines, padding, align])
  return (
    <div className="space-y-4">
      <Bar>
        <Select aria-label="Table style" value={style} onChange={setStyle} options={STYLES} className="w-56" />
        <Select aria-label="Input delimiter" value={delim} onChange={setDelim} options={DELIMS} className="w-48" />
        <Select aria-label="Alignment" value={align} onChange={setAlign} options={[{ value: 'auto', label: 'Align: numbers right' }, { value: 'l', label: 'Align left' }, { value: 'c', label: 'Align center' }, { value: 'r', label: 'Align right' }]} className="w-48" />
        <Switch checked={header} onChange={setHeader} label="First row is header" />
        {!['markdown', 'rst', 'compact'].includes(style) && <Switch checked={rowLines} onChange={setRowLines} label="Line between rows" />}
        <Slider label="Padding" value={padding} onChange={setPadding} min={0} max={4} className="w-36" />
      </Bar>
      <TwoPane input={input} setInput={setInput} inputTitle="CSV, TSV, Markdown or spaced columns" accept=".csv,.tsv,.txt,.md,text/*" output={out} outputTitle="Table" outName={style === 'markdown' ? 'table.md' : 'table.txt'} height="h-[460px]" />
    </div>
  )
}

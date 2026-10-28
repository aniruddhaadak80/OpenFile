import { useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button, Label, Textarea, ToolGrid, CopyButton, Empty } from '@/components/ui'
import { baseName } from '@/lib/files'
import { scanHidden, cleanHidden, type HiddenKind } from '@/lib/bcat/privacy'
import { DlButton, Pill, pal } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const KINDS: { id: HiddenKind; label: string }[] = [
  { id: 'zero-width', label: 'Zero width' }, { id: 'bidi', label: 'Direction controls' }, { id: 'tag', label: 'Invisible tags' }, { id: 'control', label: 'Control codes' }, { id: 'space', label: 'Odd spaces' }, { id: 'lookalike', label: 'Look-alike letters' },
]
const SAMPLE = 'Pay\u200b to this аccount: 1234\u00a05678.\nadmin\u202e txt.exe\nHello\u200d world\u{E0041}\u{E0042}'

export default function HiddenCharacterDetector() {
  const [text, setText] = useState(SAMPLE)
  const [name, setName] = useState('text')
  const [fix, setFix] = useState<HiddenKind[]>(['zero-width', 'bidi', 'tag', 'control', 'space', 'lookalike'])
  const hits = useMemo(() => scanHidden(text), [text])
  const clean = useMemo(() => cleanHidden(text, fix), [text, fix])
  const color = (k: HiddenKind) => pal(KINDS.findIndex((x) => x.id === k))

  const view: React.ReactNode[] = []
  let last = 0
  hits.forEach((h, i) => {
    view.push(text.slice(last, h.index))
    view.push(<span key={i} title={`${h.code} ${h.name}`} className="mx-px rounded px-1 font-mono text-[10px] font-bold text-black align-middle" style={{ background: color(h.kind) }}>{h.kind === 'lookalike' ? h.char : h.code.replace('U+', '')}</span>)
    last = h.index + h.char.length
  })
  view.push(text.slice(last))

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="flex items-center gap-2"><Label className="mb-0 mr-auto">Paste text</Label>
            <label><input type="file" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setName(baseName(f.name)); setText(await f.text()) } e.target.value = '' }} />
              <Button variant="outline" size="sm" icon={<FolderOpen className="size-4" />} onClick={(e) => (e.currentTarget.previousSibling as HTMLInputElement).click()}>Open file</Button></label></div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-36 text-sm" aria-label="Text to check" />
          <div className="grid grid-cols-3 gap-2"><Stat label="Characters" value={[...text].length} /><Stat label="Hidden or odd" value={hits.length} /><Stat label="Lines affected" value={new Set(hits.map((h) => h.line)).size} /></div>
          <Label>What is really there</Label>
          <div className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-surface p-3 text-sm leading-7">{view}</div>
          {hits.length ? (
            <div className="max-h-64 overflow-auto rounded-2xl border border-border">
              <table className="w-full text-xs"><thead className="bg-surface-2 text-left text-muted"><tr><th className="px-2 py-1">Line:col</th><th className="px-2 py-1">Code</th><th className="px-2 py-1">What it is</th></tr></thead>
                <tbody>{hits.slice(0, 500).map((h, i) => <tr key={i} className="border-t border-border"><td className="px-2 py-1 font-mono">{h.line}:{h.col}</td><td className="px-2 py-1 font-mono">{h.code}</td><td className="px-2 py-1"><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: color(h.kind) }} />{h.name}</td></tr>)}</tbody></table>
            </div>
          ) : <Empty>No hidden characters found. The text is clean.</Empty>}
        </div>
      }
      side={
        <>
          <div><Label>Clean these</Label><div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <Pill key={k.id} color={color(k.id)} active={fix.includes(k.id)} onClick={() => setFix((p) => (p.includes(k.id) ? p.filter((x) => x !== k.id) : [...p, k.id]))}>{k.label} {hits.filter((h) => h.kind === k.id).length || ''}</Pill>)}</div></div>
          <Label>Clean text</Label>
          <Textarea readOnly value={clean} className="min-h-28 text-xs" aria-label="Clean text" />
          <div className="flex flex-wrap gap-2"><CopyButton text={clean} label="Copy clean text" /><DlButton name={`${name}-clean.txt`} data={() => clean}>Download</DlButton></div>
          <p className="text-xs text-muted">Zero width and tag characters can hide watermarks or prompts in copied text. Direction controls can make a file name or code line read differently than it runs. Look-alike letters are used in fake links.</p>
        </>
      }
    />
  )
}

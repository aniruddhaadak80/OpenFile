import { useMemo, useState } from 'react'
import { Input, Segmented, Field, CopyButton } from '@/components/ui'
import { Bar, Pane, CodeView, DownloadButton, Chip, useStored } from './_b5/shell'
import { GITIGNORE, LICENCES } from '@/lib/b10/templates'

export default function GitignoreLicenseGenerator() {
  const [tab, setTab] = useState<'gitignore' | 'license'>('gitignore')
  const [picked, setPicked] = useStored<string[]>('b10:gi:picked', ['Node', 'Vite', 'Env', 'macOS', 'Windows', 'VS Code'])
  const [extra, setExtra] = useStored('b10:gi:extra', '')
  const [filter, setFilter] = useState('')
  const [lic, setLic] = useStored('b10:lic:id', 'MIT')
  const [holder, setHolder] = useStored('b10:lic:holder', '')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const gitignore = useMemo(() => {
    const seen = new Set<string>()
    const blocks = picked.filter((k) => GITIGNORE[k]).map((k) => GITIGNORE[k].split('\n').filter((l) => { if (l.startsWith('#') || !l.trim()) return true; if (seen.has(l)) return false; seen.add(l); return true }).join('\n'))
    if (extra.trim()) blocks.push('# Project\n' + extra.trim())
    return blocks.join('\n\n') + (blocks.length ? '\n' : '')
  }, [picked, extra])
  const L = LICENCES.find((l) => l.id === lic) ?? LICENCES[0]
  const licence = L.text(year, holder.trim() || 'Your Name')
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
  const keys = Object.keys(GITIGNORE).filter((k) => k.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="space-y-4">
      <Segmented value={tab} onChange={setTab} options={[{ value: 'gitignore', label: '.gitignore' }, { value: 'license', label: 'LICENSE' }]} />
      {tab === 'gitignore' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter stacks" aria-label="Filter stacks" />
            <div className="flex flex-wrap gap-2">{keys.map((k) => <Chip key={k} active={picked.includes(k)} onClick={() => toggle(k)}>{k}</Chip>)}</div>
            <Field label="Your own lines" hint="One pattern per line"><textarea value={extra} onChange={(e) => setExtra(e.target.value)} className="min-h-24 w-full rounded-xl border border-border bg-surface p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent" placeholder={'uploads/\n*.local.json'} /></Field>
          </div>
          <Pane title={`.gitignore (${picked.length} stacks)`} className="h-[520px]" actions={<><CopyButton text={gitignore} variant="ghost" /><DownloadButton text={gitignore} filename=".gitignore" /></>}>
            <CodeView code={gitignore || '# Pick a stack on the left'} className="h-full" />
          </Pane>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3">
            <div className="space-y-2">
              {LICENCES.map((l) => (
                <button key={l.id} type="button" onClick={() => setLic(l.id)} className={`block w-full rounded-xl border p-3 text-left transition ${lic === l.id ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:border-accent/50'}`}>
                  <div className="font-semibold">{l.name} <span className="ml-1 font-mono text-xs text-muted">{l.id}</span></div>
                  <div className="text-sm text-muted">{l.summary}</div>
                </button>
              ))}
            </div>
            <Bar>
              <Field label="Copyright holder" className="flex-1"><Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Your name or company" /></Field>
              <Field label="Year" className="w-28"><Input value={year} onChange={(e) => setYear(e.target.value)} /></Field>
            </Bar>
          </div>
          <Pane title="LICENSE" className="h-[620px]" actions={<><CopyButton text={licence} variant="ghost" /><DownloadButton text={licence} filename="LICENSE" /></>}>
            <pre className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px] leading-5">{licence}</pre>
          </Pane>
        </div>
      )}
    </div>
  )
}

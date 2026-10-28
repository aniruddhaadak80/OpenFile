import { useState } from 'react'
import { Input, Label, Switch, cn } from '@/components/ui'
import { KV, Chip } from './_b5/shell'
import { fromOctal, fromSymbolic, toOctal, toSymbolic, toUgo, type Mode } from '@/lib/b5/chmod'

const WHO = [['u', 'Owner'], ['g', 'Group'], ['o', 'Others']] as const
const WHAT = [['r', 'Read'], ['w', 'Write'], ['x', 'Execute']] as const
const PRESETS: [string, string][] = [['644', 'Files'], ['755', 'Scripts, folders'], ['600', 'Private key'], ['700', 'Private folder'], ['777', 'Everyone (avoid)'], ['1777', 'Shared /tmp'], ['2775', 'Group folder'], ['4755', 'setuid binary'], ['400', 'Read only']]

export default function ChmodCalculator() {
  const [mode, setMode] = useState<Mode>(fromOctal('755')!)
  const [octIn, setOctIn] = useState('755')
  const [symIn, setSymIn] = useState('rwxr-xr-x')
  const [file, setFile] = useState('script.sh')
  const update = (m: Mode, src?: 'oct' | 'sym') => { setMode(m); if (src !== 'oct') setOctIn(toOctal(m)); if (src !== 'sym') setSymIn(toSymbolic(m)) }
  const toggle = (who: 'u' | 'g' | 'o', what: 'r' | 'w' | 'x') => update({ ...mode, [who]: { ...mode[who], [what]: !mode[who][what] } })
  const oct = toOctal(mode)
  const octValid = !!fromOctal(octIn), symValid = !!fromSymbolic(symIn)
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Octal</Label><Input value={octIn} onChange={(e) => { setOctIn(e.target.value); const m = fromOctal(e.target.value); if (m) update(m, 'oct') }} className={cn('h-14 font-mono text-2xl', !octValid && 'border-danger')} aria-label="Octal permissions" /></div>
          <div><Label>Symbolic</Label><Input value={symIn} onChange={(e) => { setSymIn(e.target.value); const m = fromSymbolic(e.target.value); if (m) update(m, 'sym') }} className={cn('h-14 font-mono text-2xl', !symValid && 'border-danger')} aria-label="Symbolic permissions" /></div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2"><tr><th className="px-4 py-2 text-left font-medium text-muted"></th>{WHAT.map(([k, l]) => <th key={k} className="px-4 py-2 font-medium">{l}</th>)}<th className="px-4 py-2 font-mono text-muted">value</th></tr></thead>
            <tbody>
              {WHO.map(([w, wl]) => (
                <tr key={w} className="border-t border-border bg-surface">
                  <td className="px-4 py-3 font-medium">{wl}</td>
                  {WHAT.map(([k]) => <td key={k} className="px-4 py-3 text-center"><button role="checkbox" aria-checked={mode[w][k]} aria-label={`${wl} ${k}`} onClick={() => toggle(w, k)} className={cn('size-9 rounded-lg border font-mono font-semibold transition', mode[w][k] ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface-2 text-muted hover:border-accent/50')}>{mode[w][k] ? k : '-'}</button></td>)}
                  <td className="px-4 py-3 text-center font-mono text-lg">{(mode[w].r ? 4 : 0) + (mode[w].w ? 2 : 0) + (mode[w].x ? 1 : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-5 rounded-2xl border border-border bg-surface p-4">
          <Switch checked={mode.setuid} onChange={(v) => update({ ...mode, setuid: v })} label="setuid (4)" />
          <Switch checked={mode.setgid} onChange={(v) => update({ ...mode, setgid: v })} label="setgid (2)" />
          <Switch checked={mode.sticky} onChange={(v) => update({ ...mode, sticky: v })} label="Sticky bit (1)" />
        </div>
        <div className="flex flex-wrap gap-1.5">{PRESETS.map(([o, l]) => <Chip key={o} active={oct === o} onClick={() => update(fromOctal(o)!)}>{o} · {l}</Chip>)}</div>
      </div>
      <aside className="space-y-2 lg:sticky lg:top-24 lg:self-start">
        <div><Label>File name for commands</Label><Input value={file} onChange={(e) => setFile(e.target.value)} className="font-mono" /></div>
        <KV label="Octal" value={oct} />
        <KV label="ls -l view" value={'-' + toSymbolic(mode)} />
        <KV label="Command (octal)" value={`chmod ${oct} ${file}`} />
        <KV label="Command (symbolic)" value={`chmod ${toUgo(mode)} ${file}`} />
        <KV label="Recursive" value={`chmod -R ${oct} ${file}`} />
        {mode.o.w && <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">Others can write to this. That is rarely safe on shared machines.</p>}
      </aside>
    </div>
  )
}

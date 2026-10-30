import { useState } from 'react'
import { motion } from 'framer-motion'
import { Dices, RefreshCw } from 'lucide-react'
import { Button, Input, Label, Segmented, Switch, Textarea, Slider, CopyButton, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { Status, randInt, useStored } from '../dev/_b5/shell'
import { shuffle } from '@/lib/b5/textops'

type Tab = 'number' | 'dice' | 'coin' | 'list' | 'teams' | 'string' | 'port' | 'date'
const TABS: { value: Tab; label: string }[] = [{ value: 'number', label: 'Numbers' }, { value: 'dice', label: 'Dice' }, { value: 'coin', label: 'Coin' }, { value: 'list', label: 'Pick from list' }, { value: 'teams', label: 'Teams' }, { value: 'string', label: 'Strings' }, { value: 'port', label: 'Ports' }, { value: 'date', label: 'Dates' }]
const rnd = () => { const b = new Uint32Array(2); crypto.getRandomValues(b); return (b[0] * 2 ** 21 + (b[1] >>> 11)) / 2 ** 53 }
const randBetween = (a: number, b: number) => a + randInt(b - a + 1)
const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

export default function RandomGenerator() {
  const [tab, setTab] = useStored<Tab>('b5:rand:tab', 'number')
  const [res, setRes] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [spin, setSpin] = useState(0)
  // options
  const [min, setMin] = useState(1); const [max, setMax] = useState(100); const [count, setCount] = useState(1); const [unique, setUnique] = useState(false); const [dec, setDec] = useState(0); const [sortN, setSortN] = useState(false)
  const [dice, setDice] = useState('2d6'); const [coins, setCoins] = useState(1)
  const [list, setList] = useStored('b5:rand:list', 'Asha\nRavi\nMeera\nJohn\nSara\nKenji\nLina\nOmar')
  const [pick, setPick] = useState(1); const [teams, setTeams] = useState(2)
  const [len, setLen] = useState(16); const [sets, setSets] = useState({ lower: true, upper: true, digits: true, symbols: false, hex: false }); const [custom, setCustom] = useState('')
  const [portRange, setPortRange] = useState<'dynamic' | 'registered' | 'any'>('dynamic')
  const [d1, setD1] = useState('2026-01-01'); const [d2, setD2] = useState('2026-12-31'); const [withTime, setWithTime] = useState(false)

  const go = () => {
    setErr(null); setSpin((s) => s + 1)
    try {
      let out: string[] = []
      if (tab === 'number') {
        if (min > max) throw new Error('Min must be less than max.')
        const range = Math.floor(max) - Math.ceil(min) + 1
        if (unique && dec === 0 && count > range) throw new Error(`Only ${range} unique whole numbers fit between ${min} and ${max}.`)
        const seen = new Set<string>()
        while (out.length < Math.min(count, 10000)) { const v = dec ? (min + rnd() * (max - min)).toFixed(dec) : String(randBetween(Math.ceil(min), Math.floor(max))); if (unique && seen.has(v)) continue; seen.add(v); out.push(v) }
        if (sortN) out.sort((a, b) => Number(a) - Number(b))
      } else if (tab === 'dice') {
        const parts = dice.toLowerCase().replace(/\s/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/)
        if (!parts) throw new Error('Use dice notation like 2d6, d20 or 3d8+2.')
        const n = Math.min(100, Number(parts[1] || 1)), sides = Number(parts[2]), mod = Number(parts[3] || 0)
        if (sides < 2) throw new Error('A die needs at least 2 sides.')
        const rolls = Array.from({ length: n }, () => randBetween(1, sides))
        out = [String(rolls.reduce((a, b) => a + b, 0) + mod), ...rolls.map(String)]
      } else if (tab === 'coin') out = Array.from({ length: Math.min(1000, coins) }, () => (randInt(2) ? 'Heads' : 'Tails'))
      else if (tab === 'list' || tab === 'teams') {
        const items = list.split('\n').map((s) => s.trim()).filter(Boolean)
        if (!items.length) throw new Error('Add some items, one per line.')
        const sh = shuffle(items)
        if (tab === 'list') out = sh.slice(0, Math.min(pick, items.length))
        else { const t = Math.max(2, Math.min(teams, items.length)); const groups: string[][] = Array.from({ length: t }, () => []); sh.forEach((x, i) => groups[i % t].push(x)); out = groups.map((g, i) => `Team ${i + 1}: ${g.join(', ')}`) }
      } else if (tab === 'string') {
        const cs = custom || (sets.hex ? '0123456789abcdef' : (sets.lower ? 'abcdefghijklmnopqrstuvwxyz' : '') + (sets.upper ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' : '') + (sets.digits ? '0123456789' : '') + (sets.symbols ? '!@#$%^&*()-_=+[]{};:,.?/' : ''))
        if (!cs) throw new Error('Pick at least one character set.')
        const chars = Array.from(cs)
        out = Array.from({ length: Math.min(count, 1000) }, () => Array.from({ length: len }, () => chars[randInt(chars.length)]).join(''))
      } else if (tab === 'port') {
        const [lo, hi] = portRange === 'dynamic' ? [49152, 65535] : portRange === 'registered' ? [1024, 49151] : [1, 65535]
        out = Array.from({ length: Math.min(count, 1000) }, () => String(randBetween(lo, hi)))
      } else {
        const a = new Date(d1).getTime(), b = new Date(d2).getTime()
        if (!(a <= b)) throw new Error('The start date must be before the end date.')
        out = Array.from({ length: Math.min(count, 1000) }, () => { const t = new Date(a + rnd() * (b - a + 86399999)); return withTime ? t.toISOString().replace('T', ' ').slice(0, 19) : t.toISOString().slice(0, 10) })
      }
      setRes(out)
    } catch (e: any) { setErr(e.message); setRes([]) }
  }

  const headline = tab === 'dice' && res.length ? res[0] : tab === 'coin' && res.length === 1 ? res[0] : res.length === 1 ? res[0] : null
  const body = tab === 'dice' ? res.slice(1) : res
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1.5" role="tablist">{TABS.map((t) => <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => { setTab(t.value); setRes([]); setErr(null) }} className={cn('rounded-xl px-3 py-1.5 text-sm font-medium', tab === t.value ? 'bg-accent/15 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>{t.label}</button>)}</div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-3">
          <div className="grid min-h-56 place-items-center rounded-3xl border border-border bg-surface p-6 text-center">
            {res.length === 0 ? <div className="text-muted"><Dices className="mx-auto mb-2 size-10" />Press Generate</div> : (
              <motion.div key={spin} initial={{ scale: 0.6, opacity: 0, rotate: tab === 'dice' || tab === 'coin' ? -20 : 0 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="w-full space-y-3">
                {headline && <div className="font-display text-6xl font-bold text-accent tabular-nums">{headline}</div>}
                {tab === 'dice' && <div className="flex flex-wrap justify-center gap-2 text-5xl">{body.map((r, i) => <span key={i} title={r}>{/^\d*d6([+-]\d+)?$/i.test(dice.replace(/\s/g, '')) ? FACES[Number(r) - 1] : <span className="rounded-xl border border-border bg-surface-2 px-3 font-mono text-3xl">{r}</span>}</span>)}</div>}
                {tab === 'coin' && res.length > 1 && <div className="text-sm text-muted">Heads {res.filter((r) => r === 'Heads').length} · Tails {res.filter((r) => r === 'Tails').length}</div>}
                {!headline && tab !== 'dice' && <div className="scrollbar-thin max-h-72 overflow-auto"><div className={cn('flex flex-wrap justify-center gap-2', tab === 'teams' && 'flex-col items-stretch text-left')}>{res.map((r, i) => <span key={i} className="rounded-xl border border-border bg-surface-2 px-3 py-1.5 font-mono text-sm">{r}</span>)}</div></div>}
              </motion.div>
            )}
          </div>
          {err && <Status kind="err">{err}</Status>}
          {res.length > 0 && <div className="flex justify-end"><CopyButton text={res.join('\n')} label="Copy results" /></div>}
        </div>
        <aside className="space-y-4 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
          {tab === 'number' && <><div className="grid grid-cols-2 gap-2"><div><Label>Min</Label><Input aria-label="Min" type="number" value={min} onChange={(e) => setMin(Number(e.target.value))} /></div><div><Label>Max</Label><Input aria-label="Max" type="number" value={max} onChange={(e) => setMax(Number(e.target.value))} /></div></div><Slider label="How many" value={count} onChange={setCount} min={1} max={100} /><Slider label="Decimals" value={dec} onChange={setDec} min={0} max={6} /><Switch checked={unique} onChange={setUnique} label="No repeats" /><Switch checked={sortN} onChange={setSortN} label="Sort" /></>}
          {tab === 'dice' && <><div><Label>Dice</Label><Input aria-label="Dice" value={dice} onChange={(e) => setDice(e.target.value)} className="font-mono" /></div><div className="flex flex-wrap gap-1.5">{['d4', 'd6', '2d6', 'd8', 'd10', 'd12', 'd20', '3d6+2', 'd100'].map((d) => <button key={d} onClick={() => setDice(d)} className={cn('rounded-lg border px-2 py-1 font-mono text-xs', dice === d ? 'border-accent text-accent' : 'border-border text-muted')}>{d}</button>)}</div></>}
          {tab === 'coin' && <Slider label="Coins" value={coins} onChange={setCoins} min={1} max={100} />}
          {(tab === 'list' || tab === 'teams') && <><div><Label>Items, one per line</Label><Textarea aria-label="Items, one per line" value={list} onChange={(e) => setList(e.target.value)} className="min-h-40 font-sans text-sm" /></div>{tab === 'list' ? <Slider label="Pick" value={pick} onChange={setPick} min={1} max={Math.max(1, list.split('\n').filter((s) => s.trim()).length)} /> : <Slider label="Teams" value={teams} onChange={setTeams} min={2} max={12} />}</>}
          {tab === 'string' && <><Slider label="Length" value={len} onChange={setLen} min={1} max={128} /><Slider label="How many" value={count} onChange={setCount} min={1} max={100} />{(['lower', 'upper', 'digits', 'symbols', 'hex'] as const).map((k) => <Switch key={k} checked={sets[k]} onChange={(v) => setSets({ ...sets, [k]: v })} label={{ lower: 'a to z', upper: 'A to Z', digits: '0 to 9', symbols: 'Symbols', hex: 'Hex only' }[k]} />)}<div><Label>Or custom characters</Label><Input aria-label="Or custom characters" value={custom} onChange={(e) => setCustom(e.target.value)} className="font-mono" /></div></>}
          {tab === 'port' && <><Segmented value={portRange} onChange={setPortRange} options={[{ value: 'dynamic', label: '49152 to 65535' }, { value: 'registered', label: '1024 to 49151' }, { value: 'any', label: 'Any' }]} /><Slider label="How many" value={count} onChange={setCount} min={1} max={50} /><p className="text-xs text-muted">Dynamic ports are the safest choice for local dev servers.</p></>}
          {tab === 'date' && <><div><Label>From</Label><Input aria-label="From" type="date" value={d1} onChange={(e) => setD1(e.target.value)} /></div><div><Label>To</Label><Input aria-label="To" type="date" value={d2} onChange={(e) => setD2(e.target.value)} /></div><Slider label="How many" value={count} onChange={setCount} min={1} max={100} /><Switch checked={withTime} onChange={setWithTime} label="Include time" /></>}
          <Button className="w-full" size="lg" icon={<RefreshCw className="size-4" />} onClick={go}>Generate</Button>
          <p className="text-xs text-muted">Uses your browser's cryptographic random generator, so results are fair and unpredictable.</p>
        </aside>
      </div>
    </div>
  )
}

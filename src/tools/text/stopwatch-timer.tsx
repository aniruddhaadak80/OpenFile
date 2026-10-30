import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Flag, Bell, Maximize2 } from 'lucide-react'
import { Button, Segmented, Input, Label, Switch, cn } from '@/components/ui'
import { useStored, Chip, DownloadButton } from '../dev/_b5/shell'

const fmt = (ms: number, cs = true) => { const neg = ms < 0; ms = Math.abs(ms); const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10); return (neg ? '-' : '') + (h ? `${h}:` : '') + `${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}` + (cs ? `.${String(c).padStart(2, '0')}` : '') }
function beep(times = 3) { try { const ctx = new AudioContext(); for (let i = 0; i < times; i++) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.4); g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.4 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.4 + 0.3); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.4); o.stop(ctx.currentTime + i * 0.4 + 0.32) } setTimeout(() => ctx.close(), times * 400 + 200) } catch { /* no audio */ } }

function useTicker(on: boolean) { const [, set] = useState(0); useEffect(() => { if (!on) return; let r = 0; const f = () => { set((x) => x + 1); r = requestAnimationFrame(f) }; r = requestAnimationFrame(f); return () => cancelAnimationFrame(r) }, [on]) }

export default function StopwatchTimer() {
  const [mode, setMode] = useStored<'stopwatch' | 'timer' | 'interval'>('b5:sw:mode', 'stopwatch')
  const box = useRef<HTMLDivElement>(null)
  // stopwatch
  const [swStart, setSwStart] = useState<number | null>(null); const [swAcc, setSwAcc] = useState(0); const [laps, setLaps] = useState<number[]>([])
  const swNow = swAcc + (swStart ? performance.now() - swStart : 0)
  // timer
  const [dur, setDur] = useStored('b5:sw:dur', 5 * 60000)
  const [tEnd, setTEnd] = useState<number | null>(null); const [tLeft, setTLeft] = useState(dur); const [rang, setRang] = useState(false)
  const [h, setH] = useState(0); const [m, setM] = useState(5); const [s, setS] = useState(0)
  const [notify, setNotify] = useState(false)
  // interval
  const [work, setWork] = useState(40); const [rest, setRest] = useState(20); const [rounds, setRounds] = useState(8)
  const [iStart, setIStart] = useState<number | null>(null); const [iAcc, setIAcc] = useState(0)
  useTicker(!!swStart || !!tEnd || !!iStart)

  const remaining = tEnd ? tEnd - Date.now() : tLeft
  useEffect(() => { if (tEnd && remaining <= 0 && !rang) { setRang(true); setTEnd(null); setTLeft(0); beep(5); if (notify && 'Notification' in window && Notification.permission === 'granted') new Notification('Timer done', { body: `${fmt(dur, false)} is up` }) } }, [remaining, tEnd, rang])
  useEffect(() => { document.title = tEnd ? `${fmt(Math.max(0, remaining), false)} left` : swStart ? fmt(swNow, false) : document.title }, [Math.floor((tEnd ? remaining : swNow) / 1000)])

  const iEl = iAcc + (iStart ? performance.now() - iStart : 0)
  const cycle = (work + rest) * 1000
  const iRound = Math.floor(iEl / cycle) + 1
  const inWork = iEl % cycle < work * 1000
  const iPhaseLeft = inWork ? work * 1000 - (iEl % cycle) : cycle - (iEl % cycle)
  const iDone = iRound > rounds
  const lastPhase = useRef('')
  useEffect(() => { const k = `${iRound}-${inWork}`; if (iStart && lastPhase.current && k !== lastPhase.current) beep(iDone ? 4 : 1); lastPhase.current = iStart ? k : ''; if (iDone && iStart) { setIAcc(rounds * cycle); setIStart(null) } }, [iRound, inWork, iStart])

  const setFromInputs = (hh = h, mm = m, ss = s) => { const d = ((hh * 60 + mm) * 60 + ss) * 1000; setDur(d); setTLeft(d); setTEnd(null); setRang(false) }
  const big = mode === 'stopwatch' ? fmt(swNow) : mode === 'timer' ? fmt(Math.max(0, remaining), remaining < 60000) : iDone ? 'Done' : fmt(iPhaseLeft, false)
  const lapRows = laps.map((t, i) => ({ n: i + 1, t, split: t - (laps[i - 1] ?? 0) }))
  const best = lapRows.length > 1 ? Math.min(...lapRows.map((l) => l.split)) : -1, worst = lapRows.length > 1 ? Math.max(...lapRows.map((l) => l.split)) : -1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3"><Segmented value={mode} onChange={setMode} options={[{ value: 'stopwatch', label: 'Stopwatch' }, { value: 'timer', label: 'Countdown' }, { value: 'interval', label: 'Interval (HIIT)' }]} /><Button size="sm" variant="ghost" className="ml-auto" icon={<Maximize2 className="size-4" />} onClick={() => box.current?.requestFullscreen?.()}>Full screen</Button></div>
      <div ref={box} className={cn('grid place-items-center rounded-3xl border border-border bg-surface px-4 py-12 text-center', mode === 'interval' && !!iStart && (inWork ? 'bg-success/10' : 'bg-sky/10'), rang && 'animate-pulse bg-warn/10')}>
        {mode === 'interval' && !iDone && <div className={cn('mb-2 text-sm font-semibold uppercase tracking-widest', inWork ? 'text-success' : 'text-sky')}>{inWork ? 'Work' : 'Rest'} · round {Math.min(iRound, rounds)} of {rounds}</div>}
        <div className="font-mono text-6xl font-semibold tabular-nums sm:text-8xl" aria-live="off" role="timer">{big}</div>
        {mode === 'timer' && <div className="mx-auto mt-4 h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-gradient-brand transition-all" style={{ width: `${dur ? Math.max(0, Math.min(1, remaining / dur)) * 100 : 0}%` }} /></div>}
        {rang && <div className="mt-3 inline-flex items-center gap-2 text-warn"><Bell className="size-5" />Time is up</div>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {mode === 'stopwatch' && <>
            <Button size="lg" icon={swStart ? <Pause className="size-5" /> : <Play className="size-5" />} onClick={() => { if (swStart) { setSwAcc(swNow); setSwStart(null) } else setSwStart(performance.now()) }}>{swStart ? 'Pause' : swAcc ? 'Resume' : 'Start'}</Button>
            <Button size="lg" variant="outline" icon={<Flag className="size-5" />} disabled={!swStart} onClick={() => setLaps([...laps, swNow])}>Lap</Button>
            <Button size="lg" variant="ghost" icon={<RotateCcw className="size-5" />} onClick={() => { setSwStart(null); setSwAcc(0); setLaps([]) }}>Reset</Button>
          </>}
          {mode === 'timer' && <>
            <Button size="lg" icon={tEnd ? <Pause className="size-5" /> : <Play className="size-5" />} disabled={!dur} onClick={() => { if (tEnd) { setTLeft(tEnd - Date.now()); setTEnd(null) } else { setRang(false); setTEnd(Date.now() + (tLeft > 0 ? tLeft : dur)); if (tLeft <= 0) setTLeft(dur); if (notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission() } }}>{tEnd ? 'Pause' : 'Start'}</Button>
            <Button size="lg" variant="ghost" icon={<RotateCcw className="size-5" />} onClick={() => { setTEnd(null); setTLeft(dur); setRang(false) }}>Reset</Button>
          </>}
          {mode === 'interval' && <>
            <Button size="lg" icon={iStart ? <Pause className="size-5" /> : <Play className="size-5" />} onClick={() => { if (iStart) { setIAcc(iEl); setIStart(null) } else { if (iDone) setIAcc(0); setIStart(performance.now()) } }}>{iStart ? 'Pause' : 'Start'}</Button>
            <Button size="lg" variant="ghost" icon={<RotateCcw className="size-5" />} onClick={() => { setIStart(null); setIAcc(0) }}>Reset</Button>
          </>}
        </div>
      </div>
      {mode === 'stopwatch' && lapRows.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">Laps<DownloadButton text={() => 'lap,split,total\n' + lapRows.map((l) => `${l.n},${fmt(l.split)},${fmt(l.t)}`).join('\n')} filename="laps.csv" mime="text/csv" /></div>
          <div className="scrollbar-thin max-h-64 overflow-auto font-mono text-sm">{[...lapRows].reverse().map((l) => <div key={l.n} className={cn('flex justify-between border-b border-border/50 px-2 py-1.5', l.split === best && 'text-success', l.split === worst && 'text-danger')}><span>Lap {l.n}</span><span>{fmt(l.split)}</span><span className="text-muted">{fmt(l.t)}</span></div>)}</div>
        </div>
      )}
      {mode === 'timer' && !tEnd && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-end gap-3">
            {([['Hours', h, setH, 99], ['Minutes', m, setM, 59], ['Seconds', s, setS, 59]] as const).map(([l, v, f, max]) => <div key={l}><Label>{l}</Label><Input type="number" min={0} max={max} value={v} onChange={(e) => { const n = Math.max(0, Math.min(max, Number(e.target.value) || 0)); (f as (n: number) => void)(n); setFromInputs(l === 'Hours' ? n : h, l === 'Minutes' ? n : m, l === 'Seconds' ? n : s) }} className="w-24 text-center font-mono text-lg" /></div>)}
            <Switch checked={notify} onChange={setNotify} label="Desktop notification" />
          </div>
          <div className="flex flex-wrap gap-1.5">{[1, 3, 5, 10, 15, 25, 30, 45, 60].map((x) => <Chip key={x} active={dur === x * 60000} onClick={() => { setH(Math.floor(x / 60)); setM(x % 60); setS(0); setFromInputs(Math.floor(x / 60), x % 60, 0) }}>{x} min</Chip>)}</div>
        </div>
      )}
      {mode === 'interval' && !iStart && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-4">
          <div><Label>Work (s)</Label><Input aria-label="Work (s)" type="number" min={1} value={work} onChange={(e) => setWork(Math.max(1, Number(e.target.value) || 1))} className="w-24" /></div>
          <div><Label>Rest (s)</Label><Input aria-label="Rest (s)" type="number" min={0} value={rest} onChange={(e) => setRest(Math.max(0, Number(e.target.value) || 0))} className="w-24" /></div>
          <div><Label>Rounds</Label><Input aria-label="Rounds" type="number" min={1} value={rounds} onChange={(e) => setRounds(Math.max(1, Number(e.target.value) || 1))} className="w-24" /></div>
          <span className="text-sm text-muted">Total {fmt(rounds * (work + rest) * 1000, false)}. A beep marks each change.</span>
        </div>
      )}
    </div>
  )
}

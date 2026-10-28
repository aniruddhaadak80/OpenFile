import { useState } from 'react'
import { Scissors } from 'lucide-react'
import { Label, Slider, Segmented } from '@/components/ui'
import { ffRun } from '@/tools/video/_media/engine'
import { FxShell, AV_ACCEPT, runAudioFilter } from './_b4/FxShell'
import { parseSilenceLog, keepSegments, selectExpr } from './_b4/silence'

type Mode = 'edges' | 'all'

export default function SilenceRemover() {
  const [mode, setMode] = useState<Mode>('all')
  const [threshold, setThreshold] = useState(-40)
  const [minSilence, setMinSilence] = useState(0.6)
  const [keep, setKeep] = useState(0.15)
  const [stats, setStats] = useState<string | null>(null)
  return (
    <FxShell allowVideo accept={AV_ACCEPT} dropLabel="Drop audio or video with pauses" dropSub="Cut silent parts and long pauses automatically. Great for podcasts, lectures and talking-head videos." actionLabel="Remove silence" actionIcon={<Scissors className="size-5" />} suffix="no-silence"
      note={stats ? <p className="rounded-xl bg-success/10 px-3 py-2 text-xs text-success">{stats}</p> : null}
      process={async (ctx) => {
        setStats(null)
        if (mode === 'edges') {
          const af = `silenceremove=start_periods=1:start_threshold=${threshold}dB:start_silence=${keep},areverse,silenceremove=start_periods=1:start_threshold=${threshold}dB:start_silence=${keep},areverse`
          if (!ctx.isVideo) return runAudioFilter(ctx, af)
        }
        // pass 1: find the silences
        ctx.setLabel('Finding silent parts')
        const lines: string[] = []
        await ffRun({ inputs: [{ name: ctx.inName, file: ctx.file }], args: ['-i', ctx.inName, '-vn', '-af', `silencedetect=noise=${threshold}dB:d=${minSilence}`, '-ac', '1', '-ar', '8000', 'probe.wav'], output: 'probe.wav', duration: ctx.duration || undefined, onProgress: (p) => ctx.setProgress(p * 0.3), onLog: (l) => lines.push(l) })
        const dur = ctx.duration || +(lines.join('\n').match(/Duration:\s*(\d+):(\d+):([\d.]+)/)?.slice(1).reduce((a, x) => a * 60 + +x, 0) ?? 0)
        let silences = parseSilenceLog(lines, dur)
        if (mode === 'edges') silences = silences.filter((s) => s.start <= 0.05 || s.end >= dur - 0.05)
        const segs = keepSegments(silences, dur, keep)
        const removed = dur - segs.reduce((a, s) => a + s.end - s.start, 0)
        if (!silences.length || removed < 0.05) throw new Error('No silence was found with these settings. Try a higher threshold (for example -30 dB) or a shorter minimum pause.')
        setStats(`Removed ${removed.toFixed(1)} s of silence in ${silences.length} place${silences.length > 1 ? 's' : ''}. New length ${(dur - removed).toFixed(1)} s.`)
        ctx.setLabel('Cutting')
        const sel = selectExpr(segs)
        const sub = (p: number) => ctx.setProgress(0.3 + p * 0.7)
        if (ctx.isVideo) {
          return ffRun({ inputs: [{ name: ctx.inName, file: ctx.file }], args: ['-i', ctx.inName, '-vf', `select='${sel}',setpts=N/FRAME_RATE/TB`, '-af', `aselect='${sel}',asetpts=N/SR/TB`, ...ctx.vcodec(true), ...ctx.acodec, ctx.outName], output: ctx.outName, duration: dur - removed, onProgress: sub })
        }
        return ffRun({ inputs: [{ name: ctx.inName, file: ctx.file }], args: ['-i', ctx.inName, '-vn', '-af', `aselect='${sel}',asetpts=N/SR/TB`, ...ctx.acodec, ctx.outName], output: ctx.outName, duration: dur - removed, onProgress: sub })
      }}>
      <div><Label>What to remove</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'all', label: 'All pauses' }, { value: 'edges', label: 'Start and end only' }]} /></div>
      <Slider label="Silence threshold" value={threshold} onChange={setThreshold} min={-70} max={-15} suffix=" dB" />
      <p className="-mt-3 text-xs text-muted">Sound quieter than this counts as silence. Raise it for noisy rooms.</p>
      {mode === 'all' && <Slider label="Shortest pause to cut" value={minSilence} onChange={setMinSilence} min={0.2} max={3} step={0.1} suffix=" s" />}
      <Slider label="Keep at each cut" value={keep} onChange={setKeep} min={0} max={1} step={0.05} suffix=" s" />
      <p className="-mt-3 text-xs text-muted">A little pause left in keeps speech sounding natural.</p>
    </FxShell>
  )
}

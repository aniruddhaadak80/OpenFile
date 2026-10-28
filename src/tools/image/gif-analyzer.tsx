import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button, CopyButton, Dropzone, Segmented, ErrorNote, cn } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { type Anim, decodeAnim, parseWebp, sniff, totalDuration } from '@/lib/b3/anim'
import { inspectGif, type GifReport } from '@/lib/b3/anim/gif-inspect'
import { AnimPlayer, useFrameThumbs } from './_b3/anim-ui'

const DISPOSAL = ['Unspecified', 'Keep', 'Clear to background', 'Restore previous', '4', '5', '6', '7']
type Info = { kind: string; anim: Anim | null; gif?: GifReport; rows: [string, string][]; frames: { delay: number; extra: string }[]; palette?: [number, number, number][]; problems: string[] }

async function analyze(f: File): Promise<Info> {
  const b = new Uint8Array(await f.arrayBuffer())
  const kind = sniff(b, f.name)
  let anim: Anim | null = null, err = ''
  try { anim = await decodeAnim(f) } catch (e: any) { err = e?.message || String(e) }
  const rows: [string, string][] = [['File size', formatBytes(b.length)]]
  const frames: { delay: number; extra: string }[] = []
  const problems: string[] = err ? [err] : []
  let gif: GifReport | undefined, palette: [number, number, number][] | undefined
  if (kind === 'gif') {
    gif = inspectGif(b)
    rows.push(['Format', `GIF ${gif.version}`], ['Canvas', `${gif.width}×${gif.height}`], ['Global colours', gif.globalColors ? `${gif.globalColors}` : 'none'], ['Background index', String(gif.bgIndex)], ['Colour depth', `${gif.colorRes} bits`], ['Loop', gif.loop == null ? 'Plays once (no loop block)' : gif.loop === 0 ? 'Forever' : `${gif.loop} times`], ['End marker', gif.trailer ? 'Present' : 'Missing'])
    const comments = gif.blocks.filter((x) => x.kind === 'comment').map((x) => x.text).filter(Boolean)
    if (comments.length) rows.push(['Comments', comments.join(' | ')])
    const apps = gif.blocks.filter((x) => x.kind === 'app').map((x) => x.id)
    if (apps.length) rows.push(['App blocks', apps.join(', ')])
    let gce: any = null
    for (const bl of gif.blocks) {
      if (bl.kind === 'gce') gce = bl
      if (bl.kind === 'image') {
        frames.push({ delay: gce?.delay ?? 0, extra: `${bl.width}×${bl.height} at ${bl.left},${bl.top} · ${DISPOSAL[gce?.disposal ?? 0]}${gce?.transparentIndex != null ? ` · transparent #${gce.transparentIndex}` : ''}${bl.localColors ? ` · local ${bl.localColors} colours` : ''}${bl.interlaced ? ' · interlaced' : ''} · ${formatBytes(bl.dataBytes ?? 0)}${bl.complete ? '' : ' · CUT OFF'}` })
        gce = null
      }
    }
    palette = gif.palette
    problems.push(...gif.problems)
  } else if (kind === 'webp') {
    const w = parseWebp(b)
    rows.push(['Format', w.animated ? 'Animated WebP' : 'WebP'], ['Canvas', `${w.width}×${w.height}`], ['Alpha', w.hasAlpha ? 'Yes' : 'No'], ['Loop', w.loop === 0 ? 'Forever' : `${w.loop} times`], ['Background', `rgba(${w.background.join(', ')})`])
    w.frames.forEach((fr) => frames.push({ delay: fr.duration, extra: `${fr.width}×${fr.height} at ${fr.x},${fr.y} · ${fr.blend ? 'blend' : 'replace'} · ${fr.disposeToBg ? 'clear after' : 'keep'} · ${fr.hasAlpha ? 'lossless/alpha' : 'lossy'} · ${formatBytes(fr.data.length)}` }))
  } else if (anim) {
    rows.push(['Format', anim.source ?? kind.toUpperCase()], ['Canvas', `${anim.width}×${anim.height}`], ['Loop', anim.loop === 0 ? 'Forever' : `${anim.loop} times`])
    anim.frames.forEach((fr) => frames.push({ delay: fr.delay, extra: '' }))
  }
  if (anim) {
    const d = totalDuration(anim)
    rows.push(['Frames', String(anim.frames.length)], ['Total length', `${(d / 1000).toFixed(2)} s`], ['Average speed', `${(anim.frames.length / (d / 1000 || 1)).toFixed(1)} fps`])
    const delays = anim.frames.map((x) => x.delay)
    rows.push(['Delays', `${Math.min(...delays)} to ${Math.max(...delays)} ms`])
    let colors = new Set<number>()
    for (const fr of anim.frames.slice(0, 50)) { for (let i = 0; i < fr.rgba.length; i += 16) colors.add((fr.rgba[i] << 16) | (fr.rgba[i + 1] << 8) | fr.rgba[i + 2]); if (colors.size > 100000) break }
    rows.push(['Distinct colours (sampled)', colors.size > 100000 ? 'over 100,000' : colors.size.toLocaleString()])
    colors = new Set()
  }
  return { kind, anim, gif, rows, frames, palette, problems }
}

export default function GifAnalyzer() {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'frames' | 'palette' | 'blocks'>('frames')
  const thumbs = useFrameThumbs(info?.anim ?? null, 64)
  const open = async (f: File) => { setFile(f); setInfo(null); setError(null); setBusy(true); try { setInfo(await analyze(f)) } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) } }
  const report = useMemo(() => info ? [...info.rows.map(([k, v]) => `${k}: ${v}`), '', ...info.frames.map((f, i) => `Frame ${i + 1}: ${f.delay} ms ${f.extra}`), ...(info.problems.length ? ['', 'Problems:', ...info.problems] : [])].join('\n') : '', [info])
  if (!file) return <Dropzone accept="image/gif,image/png,image/webp,image/avif,.gif,.png,.apng,.webp,.avif" onFiles={(f) => open(f[0])} label="Drop a GIF, APNG or WebP to inspect" sub="Frames, delays, disposal, palette, loop count and file structure." />
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><Search className="size-4 text-accent" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>{info && <CopyButton text={report} label="Copy report" />}<Button variant="ghost" size="sm" onClick={() => { setFile(null); setInfo(null) }}>Start over</Button></div>
      {busy && <p className="text-sm text-muted">Reading file</p>}
      <ErrorNote error={error} />
      {info && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-4">
          {info.anim && <AnimPlayer anim={info.anim} maxH="40vh" />}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-2xl border border-border bg-surface p-4 text-sm">
            {info.rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-all font-mono text-xs leading-5">{v}</dd></div>)}
          </dl>
          {info.problems.length > 0 && <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm"><div className="mb-1 font-semibold">Problems found</div><ul className="list-disc space-y-1 pl-5 text-xs">{info.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
        </div>
        <div className="space-y-3">
          <Segmented value={view} onChange={setView} options={[{ value: 'frames', label: `Frames (${info.frames.length})` }, ...(info.palette?.length ? [{ value: 'palette' as const, label: `Palette (${info.palette.length})` }] : []), ...(info.gif ? [{ value: 'blocks' as const, label: `Blocks (${info.gif.blocks.length})` }] : [])]} />
          {view === 'frames' && <div className="max-h-[70vh] space-y-1 overflow-auto pr-1 scrollbar-thin">
            {info.frames.map((f, i) => <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-2 py-1.5">
              {thumbs[i] && <img src={thumbs[i]} alt="" className="checker size-10 rounded object-contain" />}
              <span className="w-8 font-mono text-xs text-muted">{i + 1}</span>
              <span className={cn('w-16 font-mono text-xs', f.delay < 20 ? 'text-warn' : '')}>{f.delay} ms</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted" title={f.extra}>{f.extra}</span>
            </div>)}
          </div>}
          {view === 'palette' && info.palette && <div className="grid grid-cols-16 gap-0.5 rounded-2xl border border-border p-2" style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
            {info.palette.map((c, i) => <div key={i} title={`#${i}: rgb(${c.join(', ')})`} className="aspect-square rounded-sm" style={{ background: `rgb(${c.join(',')})` }} />)}
          </div>}
          {view === 'blocks' && info.gif && <div className="max-h-[70vh] overflow-auto rounded-2xl border border-border font-mono text-[11px] scrollbar-thin">
            {info.gif.blocks.map((b, i) => <div key={i} className="flex gap-3 border-b border-border/60 px-3 py-1 last:border-0"><span className="w-16 text-muted">@{b.offset}</span><span className="w-20 text-accent">{b.kind}</span><span className="min-w-0 flex-1 truncate">{b.kind === 'gce' ? `delay ${b.delay}ms, dispose ${b.disposal}${b.transparentIndex != null ? `, transp ${b.transparentIndex}` : ''}` : b.kind === 'image' ? `${b.width}×${b.height} @${b.left},${b.top} lzw ${b.lzwMin} ${b.dataBytes}B` : b.id ?? b.text ?? ''}</span><span className="text-muted">{b.end - b.offset}B</span></div>)}
          </div>}
        </div>
      </div>}
    </div>
  )
}

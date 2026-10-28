import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Film, ArrowRight } from 'lucide-react'
import { Button, Label, Segmented, Slider, ToolGrid, ErrorNote } from '@/components/ui'
import { toast } from '@/components/toast'
import { type Anim, type OutFmt, ANIM_OR_VIDEO_ACCEPT, decodeAnim, resizeAnim, sniff } from '@/lib/b3/anim'
import { fmtTime, useVideoMeta } from '@/tools/video/_media/media'
import { TimeInput, VideoStage, Note } from '@/tools/video/_media/ui'
import { AnimBar, AnimDrop, AnimPlayer, AnimStats, ExportPanel, Loading } from './_b3/anim-ui'

const OUTS: OutFmt[] = ['gif', 'apng', 'webp', 'mp4', 'webm']
const isOut = (s: string | null): s is OutFmt => !!s && (OUTS as string[]).includes(s)

export default function AnimatedConverter() {
  const [params] = useSearchParams()
  const to = params.get('to')
  const [file, setFile] = useState<File | null>(null)
  const [isVideo, setIsVideo] = useState(false)
  const [anim, setAnim] = useState<Anim | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [maxW, setMaxW] = useState('0')
  // video options
  const { url, meta } = useVideoMeta(isVideo ? file : null)
  const [vStart, setVStart] = useState(0)
  const [vLen, setVLen] = useState(5)
  const [fps, setFps] = useState(12)
  const [vWidth, setVWidth] = useState('480')
  useEffect(() => { if (meta?.duration) setVLen(Math.min(10, meta.duration)) }, [meta])

  const reset = () => { setFile(null); setAnim(null); setError(null); setIsVideo(false) }
  const decode = async (f: File, video = false) => {
    setLoading(true); setError(null); setProgress(0)
    try {
      const a = await decodeAnim(f, { onProgress: setProgress, video: video ? { fps, width: +vWidth || undefined, start: vStart, duration: vLen } : undefined })
      setAnim(a)
    } catch (e: any) { const m = e?.message || String(e); setError(m); toast(m, 'error') } finally { setLoading(false) }
  }
  const onFile = async (f: File) => {
    setFile(f); setAnim(null)
    const head = new Uint8Array(await f.slice(0, 64).arrayBuffer())
    const v = sniff(head, f.name) === 'video' || f.type.startsWith('video/')
    setIsVideo(v)
    if (!v) decode(f)
  }
  const out = useMemo(() => (anim && +maxW && anim.width > +maxW ? resizeAnim(anim, +maxW, Math.round(anim.height * (+maxW / anim.width))) : anim), [anim, maxW])

  if (!file) return <AnimDrop onFile={onFile} accept={ANIM_OR_VIDEO_ACCEPT} label="Drop an animation or a video clip" sub="GIF, APNG, WebP, AVIF, MP4, WebM, MOV in. GIF, APNG, WebP, MP4, WebM out. All on your device." />
  if (loading) return <Loading progress={progress} label={isVideo ? 'Reading video frames' : 'Reading frames'} />
  if (isVideo && !anim) return (
    <ToolGrid
      main={<><AnimBar file={file} onReset={reset} /><VideoStage src={url} playable={meta?.playable !== false} /><ErrorNote error={error} /></>}
      side={<>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Start</Label><TimeInput value={vStart} onChange={setVStart} max={meta?.duration || Infinity} label="Start time" /></div>
          <div><Label>Length</Label><TimeInput value={vLen} onChange={(v) => setVLen(Math.max(0.2, Math.min(60, v)))} max={60} label="Clip length" /></div>
        </div>
        {meta?.duration ? <p className="text-xs text-muted">Video is {fmtTime(meta.duration, 1)} long. Up to 60 seconds can be turned into an animation.</p> : null}
        <Slider label="Frames per second" value={fps} onChange={setFps} min={2} max={30} />
        <div><Label>Width</Label><Segmented value={vWidth} onChange={setVWidth} options={['240', '320', '480', '640', '0'].map((v) => ({ value: v, label: v === '0' ? 'Original' : `${v}px` }))} /></div>
        <Button size="lg" className="w-full" icon={<Film className="size-5" />} onClick={() => decode(file, true)}>Read frames</Button>
        <Note>About {Math.round(vLen * fps)} frames. More frames and bigger sizes make larger files.</Note>
      </>}
    />
  )
  if (!anim || !out) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>

  return (
    <ToolGrid
      main={<>
        <AnimBar file={file} onReset={reset} />
        <AnimPlayer anim={out} />
        <AnimStats anim={out} file={file} />
      </>}
      side={<>
        <div className="flex items-center gap-2 text-sm"><span className="rounded-lg bg-surface-2 px-2 py-1 font-mono">{anim.source}</span><ArrowRight className="size-4 text-muted" /><span className="text-muted">pick a format below</span></div>
        <div><Label>Max width</Label><Segmented value={maxW} onChange={setMaxW} options={['0', '320', '480', '640', '800'].map((v) => ({ value: v, label: v === '0' ? 'Keep' : v }))} /></div>
        <ExportPanel anim={out} name={file.name} defaultFmt={isOut(to) ? to : anim.source === 'GIF' ? 'webp' : 'gif'} originalSize={file.size} onReset={reset} action="Convert" />
      </>}
    />
  )
}

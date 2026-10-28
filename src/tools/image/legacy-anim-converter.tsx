import { useState } from 'react'
import { Film } from 'lucide-react'
import { Button, Dropzone, Label, Segmented, Slider, ToolGrid } from '@/components/ui'
import { type Anim, type Frame, decodePng, videoToAnim } from '@/lib/b3/anim'
import { useMediaJob } from '@/tools/video/_media/media'
import { JobPanel, Note } from '@/tools/video/_media/ui'
import { AnimPlayer, AnimStats, ExportPanel } from './_b3/anim-ui'

const ACCEPT = '.fli,.flc,.flx,.anim,.anm,.iff,.lbm,.ilbm,.cdxl,.xl,.mng,.jng,.san,.smush,.nut,.vb,.son'
type Kind = 'flic' | 'iff' | 'anm' | 'cdxl' | 'mng' | 'smush' | 'siff' | 'unknown'

function kindOf(b: Uint8Array, name: string): Kind {
  const s = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n))
  const magic = b[4] | (b[5] << 8)
  if (magic === 0xaf11 || magic === 0xaf12 || magic === 0xaf44) return 'flic'
  if (s(0, 4) === 'FORM' && /ANIM|ILBM|PBM |ACBM|DEEP|RGB8|RGBN/.test(s(8, 4))) return 'iff'
  if (s(0, 4) === 'LPF ') return 'anm'
  if (b[0] === 0x8a && s(1, 3) === 'MNG') return 'mng'
  if (s(0, 4) === 'ANIM' || s(0, 4) === 'SANM') return 'smush'
  if (s(0, 4) === 'SIFF') return 'siff'
  if (/\.(cdxl|xl)$/i.test(name)) return 'cdxl'
  return 'unknown'
}
const LABEL: Record<Kind, string> = { flic: 'Autodesk FLI/FLC', iff: 'Amiga IFF / ANIM', anm: 'Deluxe Paint ANM', cdxl: 'Commodore CDXL', mng: 'MNG (animated PNG family)', smush: 'LucasArts Smush', siff: 'Beam SIFF', unknown: 'Unknown' }

async function readMng(bytes: Uint8Array): Promise<Anim> {
  const { loadMagick } = await import('@/lib/b2/magick')
  const m = await loadMagick()
  return m.ImageMagick.readCollection(bytes, (imgs: any) => {
    imgs.coalesce()
    const frames: Frame[] = []
    let W = 0, H = 0
    for (const img of imgs) {
      W = img.width; H = img.height
      const png: Uint8Array = img.write(m.MagickFormat.Png, (d: Uint8Array) => new Uint8Array(d))
      frames.push({ rgba: decodePng(png).frames[0].rgba, delay: Math.max(20, (img.animationDelay || 10) * 10) })
    }
    return { width: W, height: H, frames, loop: 0, source: 'MNG' } as Anim
  })
}

export default function LegacyAnimConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<Kind>('unknown')
  const [anim, setAnim] = useState<Anim | null>(null)
  const [fps, setFps] = useState(15)
  const [scale, setScale] = useState('1')
  const job = useMediaJob()
  const open = async (f: File) => {
    setFile(f); setAnim(null); job.reset()
    const head = new Uint8Array(await f.slice(0, 64).arrayBuffer())
    setKind(kindOf(head, f.name))
  }
  const read = () => job.run(async ({ setProgress, setLabel }) => {
    if (!file) return
    setLabel(kind === 'mng' ? 'Loading ImageMagick (about 15 MB, first time only)' : 'Decoding frames')
    let a: Anim
    if (kind === 'mng') a = await readMng(new Uint8Array(await file.arrayBuffer()))
    else {
      const ext = kind === 'flic' ? '.flc' : kind === 'cdxl' ? '.cdxl' : kind === 'iff' ? '.iff' : kind === 'anm' ? '.anm' : file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.bin'
      a = await videoToAnim(new File([file], 'legacy' + ext), { fps, maxFrames: 2000, onProgress: setProgress })
      a.source = LABEL[kind]
    }
    if (+scale > 1) {
      const { resizeAnim } = await import('@/lib/b3/anim')
      a = resizeAnim(a, a.width * +scale, a.height * +scale, false)
    }
    setAnim(a)
  })
  const reset = () => { setFile(null); setAnim(null) }
  if (!file) return (
    <div className="space-y-3">
      <Dropzone accept={ACCEPT} onFiles={(f) => open(f[0])} label="Drop a retro animation file" sub="FLI, FLC, Amiga ANIM / IFF, Deluxe Paint ANM, CDXL, MNG, Smush. Out comes GIF, APNG, WebP or MP4." />
      <Note>BPG and FLIF need decoders that are not available in the browser yet.</Note>
    </div>
  )
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{file.name}</span><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        {anim ? <><AnimPlayer anim={anim} /><AnimStats anim={anim} file={file} /></> : <div className="grid aspect-video place-items-center rounded-2xl border border-border bg-surface-2/40 text-sm text-muted">Detected: {LABEL[kind]}</div>}
        {kind === 'unknown' && !anim && <Note tone="warn">This file type was not recognised. You can still try; the video engine will attempt to read it.</Note>}
      </>}
      side={<>
        {kind !== 'mng' && <Slider label="Frames per second" value={fps} onChange={setFps} min={2} max={60} />}
        <div><Label>Pixel scale</Label><Segmented value={scale} onChange={setScale} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: `${v}×` }))} /></div>
        {!anim && <Button size="lg" className="w-full" icon={<Film className="size-5" />} onClick={read} loading={job.busy}>Read animation</Button>}
        <JobPanel job={job} onRetry={read} />
        {anim && <ExportPanel anim={anim} name={file.name} formats={['gif', 'apng', 'webp', 'mp4']} onReset={reset} />}
        {anim && <Button variant="ghost" size="sm" onClick={() => setAnim(null)}>Change settings</Button>}
      </>}
    />
  )
}

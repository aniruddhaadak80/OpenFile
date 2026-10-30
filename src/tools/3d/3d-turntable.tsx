import { useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Segmented, Select, Slider, ToolGrid, useJob, Progress } from '@/components/ui'
import { baseName, zipFiles } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { MODEL_ACCEPT, type Viewer } from '@/lib/b2/three-viewer'
import { ffRun } from '@/tools/video/_media/engine'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel } from '@/tools/video/_media/ui'
import { orbitPos } from '@/lib/b14/d3'
import { safeBlobUrl } from '../../lib/safe'

type Out = 'mp4' | 'gif' | 'webm' | 'png'
const SIZES = [{ value: '1080x1080', label: 'Square 1080' }, { value: '1920x1080', label: 'Wide 1920 x 1080' }, { value: '1080x1920', label: 'Vertical 1080 x 1920' }, { value: '720x720', label: 'Square 720' }, { value: '1280x720', label: 'Wide 1280 x 720' }]

export default function Turntable3d() {
  const [files, setFiles] = useState<File[] | null>(null)
  const [obj, setObj] = useState<any>(null)
  const [warn, setWarn] = useState<string[]>([])
  const [seconds, setSeconds] = useState(6)
  const [fps, setFps] = useState(30)
  const [size, setSize] = useState('1080x1080')
  const [elev, setElev] = useState(20)
  const [zoom, setZoom] = useState(100)
  const [turns, setTurns] = useState(1)
  const [dir, setDir] = useState<'1' | '-1'>('1')
  const [bg, setBg] = useState('#0B0D10')
  const [out, setOut] = useState<Out>('mp4')
  const [res, setRes] = useState<{ blob: Blob; name: string } | null>(null)
  const resUrl = useObjectUrl(res?.blob)
  const viewer = useRef<Viewer | null>(null)
  const load = useJob()
  const job = useMediaJob()

  const open = (fs: File[]) => load.run(async () => {
    const { loadModelFiles } = await import('@/lib/b2/three-viewer')
    const m = await loadModelFiles(fs)
    setObj(m.root); setWarn(m.warnings); setFiles(fs); setRes(null)
  })

  const render = () => job.run(async ({ setProgress, setLabel, signal }) => {
    const v = viewer.current
    if (!v || !v.root || !files) throw new Error('The model is not ready yet.')
    const { THREE } = await import('@/lib/b2/three-viewer')
    const [w, h] = size.split('x').map(Number)
    const n = Math.round(seconds * fps)
    const transparent = out === 'webm' || out === 'png'
    const box = new THREE.Box3().setFromObject(v.root), center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-6)
    const cam = v.camera, r = v.renderer
    const fitDist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.08 * (Math.max(1, w / h) > 1 ? 1 : h / w > 1 ? 1.25 : 1)
    const dist = fitDist * (100 / zoom)
    const prev = { pr: r.getPixelRatio(), pos: cam.position.clone(), target: v.controls.target.clone(), auto: v.controls.autoRotate, bg: v.scene.background, grid: v.grid.visible, axes: v.axes.visible }
    v.controls.autoRotate = false; v.grid.visible = false; v.axes.visible = false
    if (transparent) { v.scene.background = null; r.setClearColor(0x000000, 0) } else v.scene.background = new THREE.Color(bg)
    r.setPixelRatio(1); r.setSize(w, h, false); cam.aspect = w / h; cam.near = dist / 1000; cam.far = dist * 100; cam.updateProjectionMatrix()
    const frames: { name: string; file: Uint8Array }[] = []
    setLabel('Rendering frames')
    try {
      for (let i = 0; i < n; i++) {
        if (signal.aborted) return
        const p = orbitPos(i, n, dist, elev, [center.x, center.y, center.z], turns, +dir as 1 | -1)
        cam.position.set(p[0], p[1], p[2]); cam.lookAt(center); v.controls.target.copy(center)
        r.render(v.scene, cam)
        const b = await new Promise<Blob>((ok, bad) => r.domElement.toBlob((x) => (x ? ok(x) : bad(new Error('Could not read a frame.'))), transparent ? 'image/png' : 'image/jpeg', 0.92))
        frames.push({ name: `f${String(i).padStart(5, '0')}.${transparent ? 'png' : 'jpg'}`, file: new Uint8Array(await b.arrayBuffer()) })
        setProgress((i / n) * (out === 'png' ? 1 : 0.4))
        if (i % 4 === 0) await new Promise((x) => setTimeout(x, 0))
      }
    } finally {
      r.setPixelRatio(prev.pr); v.resize(); cam.position.copy(prev.pos); v.controls.target.copy(prev.target); v.controls.autoRotate = prev.auto
      v.scene.background = prev.bg; v.grid.visible = prev.grid; v.axes.visible = prev.axes; v.controls.update()
    }
    const base = baseName(files[0].name)
    if (out === 'png') { setRes({ blob: await zipFiles(frames.map((f) => ({ name: f.name.replace('f', 'frame-'), data: f.file }))), name: `${base}-turntable-frames.zip` }); return }
    setLabel('Encoding')
    const pat = transparent ? 'f%05d.png' : 'f%05d.jpg'
    const prog = (p: number) => setProgress(0.4 + p * 0.6)
    if (out === 'mp4') setRes({ name: `${base}-turntable.mp4`, blob: await ffRun({ inputs: frames, duration: seconds, onProgress: prog, output: 't.mp4', args: ['-framerate', String(fps), '-i', pat, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 't.mp4'] }) })
    else if (out === 'webm') setRes({ name: `${base}-turntable.webm`, blob: await ffRun({ inputs: frames, duration: seconds, onProgress: prog, output: 't.webm', args: ['-framerate', String(fps), '-i', pat, '-c:v', 'libvpx', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '3M', '-deadline', 'realtime', '-cpu-used', '8', 't.webm'] }) })
    else setRes({ name: `${base}-turntable.gif`, blob: await ffRun({ inputs: frames, duration: seconds, onProgress: prog, output: 't.gif', args: ['-framerate', String(fps), '-i', pat, '-vf', `fps=${Math.min(fps, 20)},scale=${Math.min(w, 600)}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=sierra2_4a`, 't.gif'] }) })
  })

  if (!files || !obj) return <>
    <Dropzone multiple accept={MODEL_ACCEPT} onFiles={open} label="Drop a 3D model" sub="GLB, GLTF, OBJ (with MTL and textures), STL, FBX, PLY, 3MF and more. Make a spinning turntable video for product pages, portfolios and social posts." />
    {load.busy && <div className="mt-3"><Progress value={0.5} label="Loading model" /></div>}
    {load.error && <p className="mt-3 text-sm text-danger">{load.error}</p>}
  </>
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          <TopBar file={files[0]} onReset={() => { if (job.busy) job.cancel(); setFiles(null); setObj(null); setRes(null) }} />
          <Viewer3D object={obj} screenshotName={baseName(files[0].name)} onReady={(v) => { viewer.current = v; v.setAutoRotate(true) }} />
          {warn.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
          <p className="text-xs text-muted">Set lighting and wireframe or clay look with the viewer buttons. The video uses what you see, from a slow orbit around the model.</p>
        </>}
        side={<>
          <Field label="Size"><Select value={size} onChange={setSize} options={SIZES} /></Field>
          <Slider label="Length" value={seconds} onChange={setSeconds} min={2} max={20} suffix=" s" />
          <Field label="Frame rate"><Segmented value={String(fps)} onChange={(v) => setFps(+v)} options={['24', '30', '60']} /></Field>
          <Slider label="Camera height" value={elev} onChange={setElev} min={-30} max={80} suffix="°" />
          <Slider label="Zoom" value={zoom} onChange={setZoom} min={50} max={200} suffix="%" />
          <Slider label="Turns" value={turns} onChange={setTurns} min={1} max={4} />
          <Field label="Direction"><Segmented value={dir} onChange={setDir} options={[{ value: '1', label: 'Left to right' }, { value: '-1', label: 'Right to left' }]} /></Field>
          <Field label="Format"><Select value={out} onChange={setOut} options={[{ value: 'mp4', label: 'MP4 video' }, { value: 'gif', label: 'GIF (loops)' }, { value: 'webm', label: 'WebM, clear background' }, { value: 'png', label: 'PNG frames (ZIP)' }]} /></Field>
          {(out === 'mp4' || out === 'gif') && <Field label="Background"><div className="flex items-center gap-2">{['#0B0D10', '#FFFFFF', '#F5F1E8', '#1F2933', '#0F2A2A'].map((c) => <button key={c} aria-label={`Background ${c}`} aria-pressed={bg === c} onClick={() => setBg(c)} className={`size-8 cursor-pointer rounded-lg border-2 ${bg === c ? 'border-accent' : 'border-border'}`} style={{ background: c }} />)}<Input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-8 w-12 p-1" aria-label="Custom background" /></div></Field>}
          <Button size="lg" className="w-full" icon={<Clapperboard className="size-5" />} onClick={render} loading={job.busy}>Make turntable</Button>
          <JobPanel job={job} onRetry={render} />
        </>}
      />
      {res && resUrl && (
        <ResultCard blob={res.blob} filename={res.name} title="Turntable ready" onReset={() => setRes(null)}>
          {res.name.endsWith('.gif') ? <img src={safeBlobUrl(resUrl)} alt="Turntable" className="max-h-80 rounded-xl" /> : res.name.endsWith('.zip') ? null : <video src={safeBlobUrl(resUrl)} controls autoPlay loop muted playsInline className="max-h-80 w-full rounded-xl bg-black" />}
        </ResultCard>
      )}
    </div>
  )
}

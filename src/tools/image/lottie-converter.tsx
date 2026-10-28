import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button, Dropzone, ErrorNote, Label, Segmented, Slider, ToolGrid } from '@/components/ui'
import { baseName } from '@/lib/files'
import type { Anim, Frame } from '@/lib/b3/anim'
import { useMediaJob } from '@/tools/video/_media/media'
import { JobPanel } from '@/tools/video/_media/ui'
import { AnimPlayer, AnimStats, ColorInput, ExportPanel } from './_b3/anim-ui'

const toB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }

type LottieJson = { w: number; h: number; fr: number; ip: number; op: number; nm?: string; assets?: any[]; layers?: any[] }

/** Read Lottie JSON, Telegram .tgs (gzipped JSON) or .lottie (zip). */
async function readLottie(file: File): Promise<LottieJson> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { gunzipSync, unzipSync, strFromU8 } = await import('fflate')
  let text: string
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) text = strFromU8(gunzipSync(bytes))
  else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = unzipSync(bytes)
    const names = Object.keys(zip)
    let animName = names.find((n) => /^animations\/.+\.json$/i.test(n))
    try { const m = JSON.parse(strFromU8(zip['manifest.json'])); const id = m?.animations?.[0]?.id; if (id && zip[`animations/${id}.json`]) animName = `animations/${id}.json` } catch { /* no manifest */ }
    if (!animName) throw new Error('No animation was found inside this .lottie file.')
    const json = JSON.parse(strFromU8(zip[animName])) as LottieJson
    // inline images packed in the archive
    for (const a of json.assets ?? []) {
      if (!a.p || a.e === 1) continue
      const path = names.find((n) => n.endsWith('/' + a.p) || n === `images/${a.p}`)
      if (path) { const ext = (a.p.split('.').pop() || 'png').toLowerCase(); const b64 = toB64(zip[path]); a.u = ''; a.p = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}`; a.e = 1 }
    }
    return json
  } else text = new TextDecoder().decode(bytes)
  const json = JSON.parse(text) as LottieJson
  if (!json || typeof json.w !== 'number' || !json.layers) throw new Error('This is not a Lottie animation (missing size or layers).')
  return json
}

async function renderFrames(json: LottieJson, o: { width: number; fps: number; bg: string | null; onProgress: (p: number) => void }): Promise<Anim> {
  const lottie = (await import('lottie-web')).default
  const scale = o.width / json.w
  const W = Math.round(json.w * scale), H = Math.round(json.h * scale)
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const holder = document.createElement('div'); holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;height:${H}px`
  document.body.appendChild(holder)
  const anim = lottie.loadAnimation({ container: holder, renderer: 'canvas', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(json)), rendererSettings: { context: ctx, clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' } as any })
  try {
    await new Promise<void>((res) => { if ((anim as any).isLoaded) res(); else { anim.addEventListener('DOMLoaded', () => res()); setTimeout(res, 3000) } })
    const total = json.op - json.ip
    const seconds = total / json.fr
    const n = Math.max(1, Math.min(600, Math.round(seconds * o.fps)))
    const frames: Frame[] = []
    const delay = Math.round(1000 / o.fps)
    for (let i = 0; i < n; i++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H)
      anim.goToAndStop((i / n) * total, true)
      let px = ctx.getImageData(0, 0, W, H).data
      if (o.bg) {
        const t = document.createElement('canvas'); t.width = W; t.height = H
        const tc = t.getContext('2d', { willReadFrequently: true })!; tc.fillStyle = o.bg; tc.fillRect(0, 0, W, H); tc.drawImage(canvas, 0, 0)
        px = tc.getImageData(0, 0, W, H).data
      }
      frames.push({ rgba: new Uint8ClampedArray(px), delay })
      if (i % 5 === 0) { o.onProgress(i / n); await new Promise((r) => setTimeout(r, 0)) }
    }
    o.onProgress(1)
    return { width: W, height: H, frames, loop: 0, source: 'Lottie' }
  } finally { anim.destroy(); holder.remove() }
}

export default function LottieConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [json, setJson] = useState<LottieJson | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [width, setWidth] = useState(512)
  const [fps, setFps] = useState(30)
  const [bgOn, setBgOn] = useState(false), [bg, setBg] = useState('#ffffff')
  const [anim, setAnim] = useState<Anim | null>(null)
  const job = useMediaJob()
  const live = useRef<HTMLDivElement>(null)
  const open = async (f: File) => {
    setFile(f); setError(null); setAnim(null)
    try { const j = await readLottie(f); setJson(j); setWidth(Math.min(512, j.w)); setFps(Math.min(60, Math.round(j.fr) || 30)) } catch (e: any) { setError(e?.message || 'Could not read this file.'); setJson(null) }
  }
  // live vector preview
  useEffect(() => {
    if (!json || !live.current) return
    let destroy = () => {}
    import('lottie-web').then(({ default: lottie }) => {
      if (!live.current) return
      live.current.innerHTML = ''
      const a = lottie.loadAnimation({ container: live.current, renderer: 'svg', loop: true, autoplay: true, animationData: JSON.parse(JSON.stringify(json)) })
      destroy = () => a.destroy()
    })
    return () => destroy()
  }, [json])
  const render = () => job.run(async ({ setProgress, setLabel }) => {
    if (!json) return
    setLabel('Rendering frames')
    setAnim(await renderFrames(json, { width, fps, bg: bgOn ? bg : null, onProgress: setProgress }))
  })
  const reset = () => { setFile(null); setJson(null); setAnim(null) }
  if (!file) return <Dropzone accept=".json,.tgs,.lottie,application/json" onFiles={(f) => open(f[0])} label="Drop a Lottie JSON, .lottie or Telegram .tgs sticker" sub="Preview it, then save as GIF, APNG, WebP, MP4 or WebM." />
  if (!json) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>
  const secs = (json.op - json.ip) / json.fr
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{file.name}</span><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        {anim ? <><AnimPlayer anim={anim} /><AnimStats anim={anim} /></> : <div className="checker grid place-items-center rounded-2xl border border-border p-4" style={bgOn ? { background: bg } : undefined}><div ref={live} className="aspect-square w-full max-w-sm" style={{ aspectRatio: `${json.w}/${json.h}` }} /></div>}
        <p className="text-center font-mono text-xs text-muted">{json.nm ? `${json.nm} · ` : ''}{json.w}×{json.h} · {Math.round(json.fr)} fps · {secs.toFixed(2)} s</p>
      </>}
      side={<>
        <Slider label="Width" value={width} onChange={(v) => { setWidth(v); setAnim(null) }} min={64} max={1024} step={8} suffix="px" />
        <Slider label="Frame rate" value={fps} onChange={(v) => { setFps(v); setAnim(null) }} min={5} max={60} suffix=" fps" />
        <div><Label>Background</Label><Segmented value={bgOn ? 'c' : 't'} onChange={(v) => { setBgOn(v === 'c'); setAnim(null) }} options={[{ value: 't', label: 'Transparent' }, { value: 'c', label: 'Colour' }]} />{bgOn && <ColorInput className="mt-2" value={bg} onChange={(v) => { setBg(v); setAnim(null) }} />}</div>
        {!anim && <Button size="lg" className="w-full" icon={<Sparkles className="size-5" />} onClick={render} loading={job.busy}>Render {Math.round(secs * fps)} frames</Button>}
        <JobPanel job={job} onRetry={render} />
        {anim && <ExportPanel anim={anim} name={baseName(file.name)} onReset={reset} />}
        {anim && <Button variant="ghost" size="sm" onClick={() => setAnim(null)}>Change settings</Button>}
      </>}
    />
  )
}

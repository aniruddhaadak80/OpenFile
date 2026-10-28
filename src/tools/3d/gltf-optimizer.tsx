import { useState } from 'react'
import { Zap } from 'lucide-react'
import { Button, Dropzone, Field, FileChip, Label, Progress, Segmented, Select, Slider, Switch, ToolGrid, ErrorNote, ResultCard, useJob } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { Viewer3D } from '@/lib/b2/Viewer3D'
import { ModelStatsGrid } from '@/lib/b2/ModelStats'
import type { Stats } from '@/lib/b2/three-viewer'

type TexFmt = 'keep' | 'webp' | 'jpeg' | 'png'

async function resizeTexture(bytes: Uint8Array, mime: string, max: number, fmt: TexFmt, quality: number): Promise<{ data: Uint8Array; mime: string } | null> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }))
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const target = fmt === 'keep' ? mime : `image/${fmt}`
  if (k === 1 && target === mime) { bmp.close(); return null }
  // keep power-of-two sizes when the source was power-of-two
  const pot = (n: number) => (n & (n - 1)) === 0
  let w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  if (pot(bmp.width) && pot(bmp.height)) { w = 2 ** Math.round(Math.log2(w)); h = 2 ** Math.round(Math.log2(h)) }
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h); bmp.close()
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, target, quality / 100))
  if (!blob || blob.type !== target) return null
  const data = new Uint8Array(await blob.arrayBuffer())
  return data.length < bytes.length || k < 1 ? { data, mime: target } : null
}

export default function GltfOptimizer() {
  const [files, setFiles] = useState<File[]>([])
  const [before, setBefore] = useState<{ root: any; anims: any[]; stats: Stats; size: number } | null>(null)
  const [after, setAfter] = useState<{ root: any; stats: Stats; blob: Blob } | null>(null)
  const [dedupe, setDedupe] = useState(true)
  const [weld, setWeld] = useState(true)
  const [simplify, setSimplify] = useState(false)
  const [ratio, setRatio] = useState(50)
  const [quantize, setQuantize] = useState(true)
  const [meshopt, setMeshopt] = useState(true)
  const [join, setJoin] = useState(false)
  const [texMax, setTexMax] = useState('2048')
  const [texFmt, setTexFmt] = useState<TexFmt>('webp')
  const [texQ, setTexQ] = useState(85)
  const [log, setLog] = useState<string[]>([])
  const [view, setView] = useState<'before' | 'after'>('after')
  const { busy, progress, error, run } = useJob()

  const open = (fs: File[]) => run(async () => {
    const all = [...files, ...fs]
    const { loadModelFiles, modelStats } = await import('@/lib/b2/three-viewer')
    const m = await loadModelFiles(all)
    if (!['glb', 'gltf'].includes(m.format)) throw new Error('Drop a GLB or glTF file. Use the 3D Converter first for other formats.')
    setFiles(all); setBefore({ root: m.root, anims: m.animations, stats: modelStats(m.root, m.animations.length), size: all.reduce((a, f) => a + f.size, 0) }); setAfter(null); setLog([])
  })

  const optimise = () => run(async (setP) => {
    const main = files.find((f) => /\.(glb|gltf)$/i.test(f.name))!
    const [{ WebIO }, { ALL_EXTENSIONS, EXTTextureWebP }, fn, { MeshoptEncoder }, { MeshoptDecoder }, { MeshoptSimplifier }] = await Promise.all([
      import('@gltf-transform/core'), import('@gltf-transform/extensions'), import('@gltf-transform/functions'),
      import('meshoptimizer/encoder'), import('meshoptimizer/decoder'), import('meshoptimizer/simplifier'),
    ])
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready])
    const io = new WebIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
    const steps: string[] = []
    let bytes = new Uint8Array(await main.arrayBuffer())
    // Draco input: decode through three.js and re-export as plain GLB first
    const usesDraco = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 200000))).includes('KHR_draco_mesh_compression')
    if (usesDraco || /\.gltf$/i.test(main.name)) {
      const { exportModel } = await import('@/lib/b2/three-viewer')
      bytes = new Uint8Array(await (await exportModel(before!.root, 'glb', before!.anims)).arrayBuffer())
      steps.push(usesDraco ? 'Decoded Draco compression' : 'Packed glTF and its files into one GLB')
    }
    setP(0.15)
    const doc = await io.readBinary(bytes)
    const t: any[] = []
    if (dedupe) { t.push(fn.dedup(), fn.prune()); steps.push('Removed duplicate and unused data') }
    if (join) { t.push(fn.flatten(), fn.join()); steps.push('Merged meshes that share a material') }
    if (weld || simplify) { t.push(fn.weld()); steps.push('Welded matching vertices') }
    if (simplify) { t.push(fn.simplify({ simplifier: MeshoptSimplifier, ratio: ratio / 100, error: 0.01 })); steps.push(`Simplified to about ${ratio}% of triangles`) }
    if (t.length) await doc.transform(...t)
    setP(0.5)
    const max = Number(texMax)
    const textures = doc.getRoot().listTextures()
    let tCount = 0
    for (let i = 0; i < textures.length; i++) {
      const tex = textures[i], img = tex.getImage(), mime = tex.getMimeType()
      if (!img || !/image\/(png|jpeg|webp)/.test(mime)) continue
      const r = await resizeTexture(img, mime, max, texFmt, texQ)
      if (r) {
        tex.setImage(r.data).setMimeType(r.mime)
        const uri = tex.getURI(); if (uri) tex.setURI(uri.replace(/\.[a-z]+$/i, '.' + r.mime.split('/')[1].replace('jpeg', 'jpg')))
        tCount++
      }
      setP(0.5 + (0.3 * (i + 1)) / textures.length)
    }
    if (tCount) steps.push(`Re-encoded ${tCount} texture${tCount > 1 ? 's' : ''}${texFmt !== 'keep' ? ' as ' + texFmt.toUpperCase() : ''} (max ${max}px)`)
    if (texFmt === 'webp' && tCount) doc.createExtension(EXTTextureWebP).setRequired(true)
    if (meshopt) { await doc.transform(fn.reorder({ encoder: MeshoptEncoder }), fn.quantize(), fn.meshopt({ encoder: MeshoptEncoder, level: 'medium' })); steps.push('Compressed geometry with Meshopt') }
    else if (quantize) { await doc.transform(fn.quantize()); steps.push('Quantised vertex data') }
    if (dedupe) await doc.transform(fn.prune())
    setP(0.9)
    const out = await io.writeBinary(doc)
    const blob = new Blob([out as BlobPart], { type: 'model/gltf-binary' })
    const { loadModelFiles, modelStats } = await import('@/lib/b2/three-viewer')
    const m = await loadModelFiles([new File([blob], baseName(main.name) + '.glb')])
    setAfter({ root: m.root, stats: modelStats(m.root, m.animations.length), blob }); setLog(steps); setView('after'); setP(1)
  })

  if (!before) return <div className="space-y-3"><Dropzone multiple accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2" onFiles={open} label="Drop a GLB or glTF model" sub="For .gltf, drop the .bin and textures together. Compress, simplify and shrink textures." />{busy && <Progress value={0.5} label="Loading" />}<ErrorNote error={error} /></div>
  const main = files.find((f) => /\.(glb|gltf)$/i.test(f.name))!
  return (
    <div className="space-y-6">
      <ToolGrid
        main={<>
          {after && <Segmented value={view} onChange={setView} options={[{ value: 'before', label: `Before · ${formatBytes(before.size)}` }, { value: 'after', label: `After · ${formatBytes(after.blob.size)}` }]} />}
          <Viewer3D object={view === 'after' && after ? after.root : before.root} clips={before.anims} screenshotName={baseName(main.name)} height="50vh" />
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Before</Label><ModelStatsGrid stats={before.stats} /></div>
            {after && <div><Label>After</Label><ModelStatsGrid stats={after.stats} /></div>}
          </div>
        </>}
        side={<>
          <FileChip file={main} extra={files.length > 1 ? <span className="text-xs text-muted">+{files.length - 1} files</span> : undefined} onRemove={() => { setFiles([]); setBefore(null); setAfter(null) }} />
          <Switch checked={dedupe} onChange={setDedupe} label="Remove duplicates and unused data" />
          <Switch checked={meshopt} onChange={setMeshopt} label="Meshopt geometry compression" />
          {!meshopt && <Switch checked={quantize} onChange={setQuantize} label="Quantise vertices" />}
          <Switch checked={weld} onChange={setWeld} label="Weld vertices" />
          <Switch checked={join} onChange={setJoin} label="Merge meshes (fewer draw calls)" />
          <Switch checked={simplify} onChange={setSimplify} label="Simplify geometry" />
          {simplify && <Slider label="Keep triangles" value={ratio} onChange={setRatio} min={5} max={95} suffix="%" />}
          <Field label="Max texture size"><Select value={texMax} onChange={setTexMax} options={['4096', '2048', '1024', '512', '256'].map((v) => ({ value: v, label: `${v} px` }))} /></Field>
          <Field label="Texture format"><Segmented value={texFmt} onChange={setTexFmt} options={[{ value: 'webp', label: 'WEBP' }, { value: 'jpeg', label: 'JPG' }, { value: 'png', label: 'PNG' }, { value: 'keep', label: 'Keep' }]} /></Field>
          {(texFmt === 'webp' || texFmt === 'jpeg') && <Slider label="Texture quality" value={texQ} onChange={setTexQ} min={40} max={100} suffix="%" />}
          {busy && <Progress value={progress} label="Optimising" />}
          <ErrorNote error={error} />
          <Button size="lg" className="w-full" loading={busy} icon={<Zap className="size-4" />} onClick={optimise}>Optimise</Button>
          <p className="text-[11px] text-muted">Meshopt and WebP need a recent viewer (three.js, Babylon.js, model-viewer and most engines support them). Turn them off for maximum compatibility.</p>
        </>}
      />
      {after && <ResultCard blob={after.blob} filename={`${baseName(main.name)}-optimized.glb`} originalSize={before.size} onReset={() => { setFiles([]); setBefore(null); setAfter(null) }}>
        <ul className="space-y-0.5 text-xs text-muted">{log.map((l) => <li key={l}>✓ {l}</li>)}</ul>
      </ResultCard>}
    </div>
  )
}

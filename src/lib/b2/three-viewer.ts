/* three.js viewer shell shared by the 3D and CAD tools (Batch 2).
   Orbit controls, studio lighting, grid, wireframe, auto-rotate, fit-to-view, animation playback and PNG screenshots.
   Also: model loading from local files (with sibling textures/.bin/.mtl) and export to GLB/GLTF/OBJ/STL/PLY/USDZ. */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export { THREE }

export type ViewerOpts = { background?: string; grid?: boolean }
export type Stats = { meshes: number; vertices: number; triangles: number; materials: number; textures: number; size: THREE.Vector3; animations: number; points: number }

export class Viewer {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
  controls: OrbitControls
  grid: THREE.GridHelper
  axes: THREE.AxesHelper
  root: THREE.Object3D | null = null
  mixer: THREE.AnimationMixer | null = null
  clips: THREE.AnimationClip[] = []
  private keyLight: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private env: THREE.Texture
  private clock = new THREE.Clock()
  private ro: ResizeObserver
  private raf = 0
  private wire = false
  private originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()

  constructor(public el: HTMLElement, opts: ViewerOpts = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    const pm = new THREE.PMREMGenerator(this.renderer)
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = this.env
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.6)
    this.keyLight.position.set(3, 5, 4)
    this.scene.add(this.hemi, this.keyLight, this.camera)
    this.grid = new THREE.GridHelper(10, 20, 0x888888, 0x444444)
    ;(this.grid.material as THREE.Material).transparent = true; (this.grid.material as THREE.Material).opacity = 0.35
    this.grid.visible = opts.grid ?? true
    this.axes = new THREE.AxesHelper(1); this.axes.visible = false
    this.scene.add(this.grid, this.axes)
    this.setBackground(opts.background ?? 'transparent')
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.camera.position.set(2, 1.5, 3)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(el)
    this.resize()
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.clock.getDelta()
      this.mixer?.update(dt)
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  resize() {
    const w = this.el.clientWidth || 300, h = this.el.clientHeight || 300
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix()
  }

  setBackground(bg: string) {
    if (bg === 'transparent') { this.scene.background = null; this.renderer.setClearColor(0x000000, 0) }
    else { this.scene.background = new THREE.Color(bg) }
  }
  setLighting(preset: 'studio' | 'soft' | 'flat' | 'dark') {
    const map = { studio: [1, 0.6, 1.6], soft: [0.7, 1.0, 0.8], flat: [0.0, 2.2, 0.0], dark: [0.25, 0.15, 2.2] } as const
    const [env, hemi, key] = map[preset]
    this.scene.environment = env > 0 ? this.env : null
    ;(this.scene as any).environmentIntensity = env
    this.hemi.intensity = hemi; this.keyLight.intensity = key
  }
  setExposure(v: number) { this.renderer.toneMappingExposure = v }

  setObject(obj: THREE.Object3D, clips: THREE.AnimationClip[] = []) {
    this.clear()
    this.root = obj
    this.scene.add(obj)
    this.clips = clips
    if (clips.length) { this.mixer = new THREE.AnimationMixer(obj) }
    this.fit()
    if (this.wire) this.setWireframe(true)
  }

  clear() {
    if (this.root) { this.scene.remove(this.root); disposeObject(this.root) }
    this.root = null; this.mixer?.stopAllAction(); this.mixer = null; this.clips = []; this.originalMaterials.clear()
  }

  playClip(i: number | null) {
    if (!this.mixer) return
    this.mixer.stopAllAction()
    if (i !== null && this.clips[i]) this.mixer.clipAction(this.clips[i]).reset().play()
  }

  /** Frame the model, size grid and axes to it. */
  fit() {
    if (!this.root) return
    const box = new THREE.Box3().setFromObject(this.root)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(size.length() / 2, 1e-6)
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 360) * 1.1
    this.camera.near = Math.max(dist / 1000, 1e-5); this.camera.far = dist * 100
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(center).add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(dist))
    this.controls.target.copy(center)
    this.controls.update()
    const g = Math.pow(10, Math.ceil(Math.log10(radius * 4)))
    this.grid.scale.setScalar(g / 10)
    this.grid.position.set(center.x, box.min.y, center.z)
    this.axes.scale.setScalar(radius)
    this.axes.position.copy(center)
    this.keyLight.position.copy(center).add(new THREE.Vector3(radius * 2, radius * 3, radius * 2.5))
  }

  setView(dir: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso') {
    if (!this.root) return
    const v = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], iso: [1, 0.8, 1] }[dir]
    const d = this.camera.position.distanceTo(this.controls.target)
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(...(v as [number, number, number])).normalize().multiplyScalar(d))
    this.controls.update()
  }

  setWireframe(on: boolean) {
    this.wire = on
    this.root?.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      mats.forEach((mat: any) => { if ('wireframe' in mat) mat.wireframe = on })
    })
  }
  /** Replace materials with a neutral clay material (useful for meshes without materials or to inspect shape). */
  setClay(on: boolean) {
    this.root?.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (on) { if (!this.originalMaterials.has(m)) this.originalMaterials.set(m, m.material); m.material = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.65, metalness: 0.05, wireframe: this.wire, side: THREE.DoubleSide }) }
      else if (this.originalMaterials.has(m)) { m.material = this.originalMaterials.get(m)!; this.originalMaterials.delete(m) }
    })
  }
  setAutoRotate(on: boolean) { this.controls.autoRotate = on; this.controls.autoRotateSpeed = 2 }

  screenshot(scale = 2, bg?: string): Promise<Blob> {
    const { width, height } = this.renderer.domElement
    const prevBg = this.scene.background
    if (bg) this.scene.background = new THREE.Color(bg)
    const pr = this.renderer.getPixelRatio()
    this.renderer.setPixelRatio(pr * scale)
    this.renderer.setSize(width / pr, height / pr, false)
    this.renderer.render(this.scene, this.camera)
    return new Promise((res, rej) => this.renderer.domElement.toBlob((b) => {
      this.renderer.setPixelRatio(pr); this.resize(); this.scene.background = prevBg
      b ? res(b) : rej(new Error('Screenshot failed'))
    }, 'image/png'))
  }

  dispose() {
    cancelAnimationFrame(this.raf); this.ro.disconnect(); this.clear(); this.controls.dispose(); this.env.dispose(); this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

export function disposeObject(o: THREE.Object3D) {
  o.traverse((c: any) => {
    c.geometry?.dispose?.()
    const mats = Array.isArray(c.material) ? c.material : c.material ? [c.material] : []
    mats.forEach((m: any) => { Object.values(m).forEach((v: any) => v?.isTexture && v.dispose()); m.dispose?.() })
  })
}

export function modelStats(root: THREE.Object3D, animations = 0): Stats {
  let meshes = 0, vertices = 0, triangles = 0, points = 0
  const mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>()
  root.updateMatrixWorld(true)
  root.traverse((o: any) => {
    if (o.isMesh || o.isPoints || o.isLine) {
      const g = o.geometry as THREE.BufferGeometry
      const n = g.attributes.position?.count ?? 0
      if (o.isMesh) { meshes++; vertices += n; triangles += g.index ? g.index.count / 3 : n / 3 }
      else if (o.isPoints) points += n
      ;(Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => { if (!m) return; mats.add(m); Object.values(m).forEach((v: any) => v?.isTexture && texs.add(v)) })
    }
  })
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  return { meshes, vertices, triangles: Math.round(triangles), materials: mats.size, textures: texs.size, size, animations, points }
}

/* ------------------------------------------------------------------ */
/* loading                                                              */
/* ------------------------------------------------------------------ */

export const MODEL_EXTS = ['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf', 'dae', '3ds', 'usdz', 'usda', 'usdc', 'usd', 'amf', 'wrl', 'vrml', 'off', 'pcd', 'xyz', 'vtk', 'vtp', 'kmz', '3dm', 'gcode', 'lwo', 'vox', 'pdb']
export const MODEL_ACCEPT = [...MODEL_EXTS, 'mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'tga', 'bmp', 'ktx2', 'dds'].map((e) => '.' + e).join(',')
export type Loaded = { root: THREE.Object3D; animations: THREE.AnimationClip[]; format: string; name: string; warnings: string[] }
const ext = (n: string) => n.toLowerCase().split('.').pop() ?? ''

function defaultMaterial(vertexColors: boolean) { return new THREE.MeshStandardMaterial({ color: vertexColors ? 0xffffff : 0xc9c4b8, roughness: 0.55, metalness: 0.1, vertexColors, side: THREE.DoubleSide }) }
function geometryToObject(g: THREE.BufferGeometry) {
  const vc = !!g.attributes.color
  if (!g.index && !g.attributes.normal && g.attributes.position && isPointCloud(g)) return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.01, vertexColors: vc, color: vc ? 0xffffff : 0xF5A524, sizeAttenuation: true }))
  if (!g.attributes.normal) g.computeVertexNormals()
  return new THREE.Mesh(g, defaultMaterial(vc))
}
function isPointCloud(g: THREE.BufferGeometry) { return (g as any).userData?.points === true || (g.attributes.position.count % 3 !== 0) }

/** Parse the ASCII OFF format (Object File Format). */
export function parseOFF(text: string): THREE.BufferGeometry {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean)
  let i = 0
  const head = lines[i++]
  let counts: number[]
  if (/^[CN]*OFF$/i.test(head) || /^[CN]*OFF\s*$/i.test(head)) counts = lines[i++].split(/\s+/).map(Number)
  else counts = head.replace(/^[CN]*OFF/i, '').trim().split(/\s+/).map(Number)
  const [nv, nf] = counts
  const pos: number[] = [], col: number[] = []
  const hasColor = /^C/i.test(head)
  for (let k = 0; k < nv; k++) { const p = lines[i++].split(/\s+/).map(Number); pos.push(p[0], p[1], p[2]); if (hasColor) { const s = p[3] > 1 ? 255 : 1; col.push(p[3] / s, p[4] / s, p[5] / s) } }
  const idx: number[] = []
  for (let k = 0; k < nf; k++) { const f = lines[i++].split(/\s+/).map(Number); const n = f[0]; for (let t = 1; t < n - 1; t++) idx.push(f[1], f[1 + t], f[2 + t]) }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  if (idx.length) g.setIndex(idx); else (g as any).userData.points = true
  g.computeVertexNormals()
  return g
}

async function dracoManager(files: Map<string, string>) {
  const [js, wasm] = await Promise.all([
    import('three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url'),
    import('three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url'),
  ])
  const m = new THREE.LoadingManager()
  m.setURLModifier((url) => {
    const name = decodeURIComponent(url.split(/[\\/]/).pop()!.split('?')[0])
    if (name === 'draco_wasm_wrapper.js') return (js as any).default
    if (name === 'draco_decoder.wasm') return (wasm as any).default
    return files.get(name) ?? files.get(name.toLowerCase()) ?? url
  })
  return m
}

/** Load a model from local files. The first file with a known model extension is the main one; others are resources. */
export async function loadModelFiles(list: File[]): Promise<Loaded> {
  const main = list.find((f) => MODEL_EXTS.includes(ext(f.name)) && ext(f.name) !== 'bin') ?? list[0]
  if (!main) throw new Error('No file given.')
  const kind = ext(main.name)
  if (!MODEL_EXTS.includes(kind)) throw new Error(`.${kind} is not a supported 3D format.`)
  const urls = new Map<string, string>()
  for (const f of list) { const u = URL.createObjectURL(f); urls.set(f.name, u); urls.set(f.name.toLowerCase(), u); urls.set(f.name.split('/').pop()!, u) }
  const manager = await dracoManager(urls)
  const missing: string[] = []
  manager.onError = (url) => { const n = decodeURIComponent(url.split(/[\\/]/).pop() || url); if (!n.startsWith('blob:')) missing.push(n) }
  const mainUrl = urls.get(main.name)!
  const warnings: string[] = []
  const buf = () => main.arrayBuffer()
  const text = () => main.text()
  let root: THREE.Object3D, animations: THREE.AnimationClip[] = []
  try {
    switch (kind) {
      case 'glb': case 'gltf': {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js')
        const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
        const draco = new DRACOLoader(manager); draco.setDecoderPath('./')
        const l = new GLTFLoader(manager); l.setDRACOLoader(draco); l.setMeshoptDecoder(MeshoptDecoder)
        const g = await l.parseAsync(await buf(), './')
        root = g.scene; animations = g.animations; draco.dispose(); break
      }
      case 'obj': {
        const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
        const l = new OBJLoader(manager)
        const src = await text()
        const mtlName = src.match(/^mtllib\s+(.+)$/m)?.[1]?.trim()
        const mtlFile = list.find((f) => ext(f.name) === 'mtl' && (!mtlName || f.name === mtlName.split(/[\\/]/).pop())) ?? list.find((f) => ext(f.name) === 'mtl')
        if (mtlFile) {
          const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js')
          const mats = new MTLLoader(manager).parse(await mtlFile.text(), './'); mats.preload(); l.setMaterials(mats)
        } else if (mtlName) warnings.push(`Materials file ${mtlName} was not added, so default materials are used.`)
        root = l.parse(src)
        if (!mtlFile) root.traverse((o: any) => { if (o.isMesh) o.material = defaultMaterial(!!o.geometry.attributes.color) })
        break
      }
      case 'stl': { const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js'); const g = new STLLoader(manager).parse(await buf()); root = new THREE.Mesh(g, defaultMaterial(!!g.attributes.color)); if (!g.attributes.normal) g.computeVertexNormals(); break }
      case 'ply': { const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js'); const g = new PLYLoader(manager).parse(await buf()); if (!g.index && g.attributes.position.count && !(g.attributes.normal)) (g as any).userData.points = true; root = geometryToObject(g); break }
      case 'fbx': { const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js'); const o = new FBXLoader(manager).parse(await buf(), './'); root = o; animations = (o as any).animations ?? []; break }
      case '3mf': { const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js'); root = new ThreeMFLoader(manager).parse(await buf()); break }
      case 'dae': { const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js'); const c: any = new ColladaLoader(manager).parse(await text(), './'); root = c.scene; animations = c.scene.animations ?? []; break }
      case '3ds': { const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js'); root = new TDSLoader(manager).parse(await buf(), './'); break }
      case 'usdz': case 'usda': case 'usdc': case 'usd': { const { USDLoader } = await import('three/examples/jsm/loaders/USDLoader.js'); const data = await buf(); root = await new Promise<THREE.Object3D>((res, rej) => { const r: any = (new USDLoader(manager) as any).parse(data, './', res, rej); if (r && r.isObject3D) res(r) }); break }
      case 'amf': { const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader.js'); root = new AMFLoader(manager).parse(await buf()); break }
      case 'wrl': case 'vrml': { const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js'); root = new VRMLLoader(manager).parse(await text(), './'); break }
      case 'off': root = geometryToObject(parseOFF(await text())); break
      case 'pcd': { const { PCDLoader } = await import('three/examples/jsm/loaders/PCDLoader.js'); const p = new PCDLoader(manager).parse(await buf()); (p.material as THREE.PointsMaterial).size = 0; root = p; break }
      case 'xyz': { const { XYZLoader } = await import('three/examples/jsm/loaders/XYZLoader.js'); const g = (new XYZLoader(manager) as any).parse(await text()) as THREE.BufferGeometry; (g as any).userData.points = true; root = geometryToObject(g); break }
      case 'vtk': case 'vtp': { const { VTKLoader } = await import('three/examples/jsm/loaders/VTKLoader.js'); const g = new VTKLoader(manager).parse(await buf(), './'); root = geometryToObject(g); break }
      case 'kmz': { const { KMZLoader } = await import('three/examples/jsm/loaders/KMZLoader.js'); const c: any = new KMZLoader(manager).parse(await buf()); root = c.scene; break }
      case '3dm': throw new Error('Rhino .3dm files need the rhino3dm engine, which is not bundled. Export from Rhino as OBJ, STL or glTF first.')
      case 'gcode': { const { GCodeLoader } = await import('three/examples/jsm/loaders/GCodeLoader.js'); root = new GCodeLoader(manager).parse(await text()); break }
      case 'lwo': { const { LWOLoader } = await import('three/examples/jsm/loaders/LWOLoader.js'); const r: any = new LWOLoader(manager).parse(await buf(), './', ''); root = new THREE.Group(); r.meshes.forEach((m: THREE.Object3D) => root.add(m)); animations = r.animations ?? []; break }
      case 'vox': { const { VOXLoader, VOXMesh } = await import('three/examples/jsm/loaders/VOXLoader.js') as any; const chunks = new VOXLoader(manager).parse(await buf()); root = new THREE.Group(); (Array.isArray(chunks) ? chunks : chunks.chunks ?? []).forEach((c: any) => VOXMesh && root.add(new VOXMesh(c))); break }
      case 'pdb': { const { PDBLoader } = await import('three/examples/jsm/loaders/PDBLoader.js'); const p: any = new PDBLoader(manager).parse(await text()); const g = p.geometryAtoms as THREE.BufferGeometry; (g as any).userData.points = true; const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.4, vertexColors: true })); root = pts; break }
      default: throw new Error(`.${kind} is not supported.`)
    }
  } catch (e: any) {
    throw new Error(`Could not read ${main.name}: ${e?.message || e}`)
  } finally {
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 30000)
  }
  if (missing.length) warnings.push(`Missing linked files: ${[...new Set(missing)].slice(0, 6).join(', ')}. Add them together with the model to see textures.`)
  // auto-size points
  const box = new THREE.Box3().setFromObject(root)
  const diag = box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).length()
  root.traverse((o: any) => { if (o.isPoints && o.material && (!o.material.size || o.material.size <= 0.011)) o.material.size = diag / 500 })
  root.name = root.name || main.name
  return { root, animations, format: kind, name: main.name, warnings }
}

/* ------------------------------------------------------------------ */
/* exporting                                                            */
/* ------------------------------------------------------------------ */

export type ExportFmt = 'glb' | 'gltf' | 'obj' | 'stl' | 'stl-ascii' | 'ply' | 'ply-ascii' | 'usdz'
export const EXPORT_LABEL: Record<ExportFmt, string> = { glb: 'GLB', gltf: 'glTF (embedded)', obj: 'OBJ', stl: 'STL (binary)', 'stl-ascii': 'STL (text)', ply: 'PLY (binary)', 'ply-ascii': 'PLY (text)', usdz: 'USDZ' }
export const EXPORT_EXT: Record<ExportFmt, string> = { glb: 'glb', gltf: 'gltf', obj: 'obj', stl: 'stl', 'stl-ascii': 'stl', ply: 'ply', 'ply-ascii': 'ply', usdz: 'usdz' }

export async function exportModel(root: THREE.Object3D, fmt: ExportFmt, animations: THREE.AnimationClip[] = []): Promise<Blob> {
  root.updateMatrixWorld(true)
  switch (fmt) {
    case 'glb': case 'gltf': {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
      const out = await new GLTFExporter().parseAsync(root, { binary: fmt === 'glb', animations, onlyVisible: true, embedImages: true, includeCustomExtensions: false, maxTextureSize: 4096 })
      return fmt === 'glb' ? new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' }) : new Blob([JSON.stringify(out, null, 1)], { type: 'model/gltf+json' })
    }
    case 'obj': { const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js'); return new Blob([new OBJExporter().parse(root)], { type: 'text/plain' }) }
    case 'stl': case 'stl-ascii': {
      const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js')
      const out = new STLExporter().parse(root, { binary: fmt === 'stl' }) as any
      return new Blob([out], { type: 'model/stl' })
    }
    case 'ply': case 'ply-ascii': {
      const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js')
      const out = await new Promise<any>((res) => new PLYExporter().parse(root, res, { binary: fmt === 'ply', excludeAttributes: [] }))
      return new Blob([out], { type: 'application/octet-stream' })
    }
    case 'usdz': {
      const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')
      // USDZ needs standard materials
      const clone = root.clone(true)
      clone.traverse((o: any) => { if (o.isMesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; o.material = mats.map((m: any) => m?.isMeshStandardMaterial ? m : new THREE.MeshStandardMaterial({ color: m?.color ?? 0xcccccc, map: m?.map ?? null })); if (o.material.length === 1) o.material = o.material[0] } })
      const out = await new USDZExporter().parseAsync(clone)
      return new Blob([out as BlobPart], { type: 'model/vnd.usdz+zip' })
    }
  }
}

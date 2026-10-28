/* Medical image volumes: DICOM (dicom-parser), NIfTI (nifti-reader-js) and NRRD (three NRRDLoader), all MIT.
   Every format becomes a stack of Float32 slices with a suggested window. */

export type Volume = {
  width: number; height: number; depth: number
  slices: Float32Array[] // one per depth, width*height
  rgb?: boolean // slices hold packed RGB (3 floats per pixel)
  min: number; max: number
  window: { center: number; width: number }
  spacing?: [number, number, number]
  meta: [string, string][]
  format: string
}

const TAGS: Record<string, string> = {
  x00100010: 'Patient name', x00100020: 'Patient ID', x00100030: 'Birth date', x00100040: 'Sex', x00080020: 'Study date', x00080030: 'Study time',
  x00080060: 'Modality', x00081030: 'Study description', x0008103e: 'Series description', x00080070: 'Manufacturer', x00081090: 'Model',
  x00180050: 'Slice thickness', x00280030: 'Pixel spacing', x00280010: 'Rows', x00280011: 'Columns', x00280100: 'Bits allocated',
  x00200013: 'Instance number', x00201041: 'Slice location', x00020010: 'Transfer syntax', x00080080: 'Institution', x00180015: 'Body part',
}

function stats(slices: Float32Array[]) {
  let min = Infinity, max = -Infinity
  for (const s of slices) for (let i = 0; i < s.length; i += 7) { const v = s[i]; if (v < min) min = v; if (v > max) max = v }
  if (!Number.isFinite(min)) { min = 0; max = 1 }
  return { min, max }
}

/** Parse one or more DICOM files into a sorted volume. */
export async function readDicom(files: { name: string; data: ArrayBuffer }[]): Promise<Volume> {
  const mod: any = await import('dicom-parser'); const dp = mod.default ?? mod
  type S = { inst: number; loc: number; pixels: Float32Array; rgb: boolean; w: number; h: number; ds: any }
  const out: S[] = []
  const errors: string[] = []
  for (const f of files) {
    try {
      const u8 = new Uint8Array(f.data)
      const ds = dp.parseDicom(u8)
      const w = ds.uint16('x00280011'), h = ds.uint16('x00280010')
      const pe = ds.elements.x7fe00010
      if (!w || !h || !pe) throw new Error('no image')
      const bits = ds.uint16('x00280100') ?? 16, signed = ds.uint16('x00280103') === 1, spp = ds.uint16('x00280002') ?? 1
      const frames = Number(ds.string('x00280008') ?? 1) || 1
      const slope = Number(ds.string('x00281053') ?? 1) || 1, inter = Number(ds.string('x00281052') ?? 0) || 0
      const ts = ds.string('x00020010') ?? ''
      const mono1 = (ds.string('x00280004') ?? '').trim() === 'MONOCHROME1'
      const instBase = Number(ds.string('x00200013') ?? out.length)
      const loc = Number(ds.string('x00201041') ?? (ds.string('x00200032') ?? '').split('\\')[2] ?? 0)
      if (pe.encapsulatedPixelData) {
        if (!/^1\.2\.840\.10008\.1\.2\.4\.(50|51)$/.test(ts)) throw new Error(`compressed with transfer syntax ${ts}, which is not supported. Uncompressed and baseline JPEG DICOM work.`)
        for (let fr = 0; fr < frames; fr++) {
          const bytes = pe.basicOffsetTable?.length ? dp.readEncapsulatedImageFrame(ds, pe, fr) : dp.readEncapsulatedPixelDataFromFragments(ds, pe, fr, 1)
          const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
          const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0)
          const d = ctx.getImageData(0, 0, w, h).data
          const px = new Float32Array(w * h * (spp === 3 ? 3 : 1))
          for (let i = 0; i < w * h; i++) { if (spp === 3) { px[i * 3] = d[i * 4]; px[i * 3 + 1] = d[i * 4 + 1]; px[i * 3 + 2] = d[i * 4 + 2] } else px[i] = d[i * 4] }
          out.push({ inst: instBase + fr / 1000, loc, pixels: px, rgb: spp === 3, w, h, ds })
        }
      } else {
        const per = w * h * spp
        for (let fr = 0; fr < frames; fr++) {
          const off = pe.dataOffset + fr * per * (bits / 8)
          const px = new Float32Array(per)
          const view = new DataView(u8.buffer, u8.byteOffset)
          for (let i = 0; i < per; i++) {
            let v: number
            if (bits === 8) v = signed ? view.getInt8(off + i) : u8[off + i]
            else if (bits === 32) v = signed ? view.getInt32(off + i * 4, true) : view.getUint32(off + i * 4, true)
            else v = signed ? view.getInt16(off + i * 2, true) : view.getUint16(off + i * 2, true)
            px[i] = spp === 3 ? v : v * slope + inter
          }
          if (mono1 && spp === 1) { let mx = -Infinity; for (const v of px) if (v > mx) mx = v; for (let i = 0; i < px.length; i++) px[i] = mx - px[i] }
          out.push({ inst: instBase + fr / 1000, loc, pixels: px, rgb: spp === 3, w, h, ds })
        }
      }
    } catch (e: any) { errors.push(`${f.name}: ${e?.message || e}`) }
  }
  if (!out.length) throw new Error(errors[0] ? `Could not read the DICOM data. ${errors[0]}` : 'No DICOM images found.')
  const w0 = out[0].w, h0 = out[0].h
  const same = out.filter((s) => s.w === w0 && s.h === h0)
  same.sort((a, b) => a.inst - b.inst || a.loc - b.loc)
  const ds = same[0].ds
  const st = stats(same.map((s) => s.pixels))
  const wc = Number((ds.string('x00281050') ?? '').split('\\')[0]), ww = Number((ds.string('x00281051') ?? '').split('\\')[0])
  const meta: [string, string][] = []
  for (const [tag, label] of Object.entries(TAGS)) { const v = ds.string(tag); if (v) meta.push([label, label === 'Patient name' ? v.replace(/\^/g, ' ') : v]) }
  meta.push(['Images', String(same.length)])
  if (errors.length) meta.push(['Skipped files', String(errors.length)])
  const ps = (ds.string('x00280030') ?? '').split('\\').map(Number)
  return { width: w0, height: h0, depth: same.length, slices: same.map((s) => s.pixels), rgb: same[0].rgb, ...st, window: Number.isFinite(wc) && ww > 0 ? { center: wc, width: ww } : { center: (st.min + st.max) / 2, width: st.max - st.min || 1 }, spacing: ps.length === 2 ? [ps[1], ps[0], Number(ds.string('x00180050') ?? 1)] : undefined, meta, format: 'DICOM' }
}

export async function readNifti(buf: ArrayBuffer): Promise<Volume> {
  const mod: any = await import('nifti-reader-js'); const nifti = mod.default ?? mod
  let data = buf
  if (nifti.isCompressed(data)) data = nifti.decompress(data)
  if (!nifti.isNIFTI(data)) throw new Error('This is not a NIfTI file.')
  const h = nifti.readHeader(data), img = nifti.readImage(h, data)
  const [, nx, ny, nz = 1] = h.dims
  const T: Record<number, any> = { 2: Uint8Array, 4: Int16Array, 8: Int32Array, 16: Float32Array, 64: Float64Array, 256: Int8Array, 512: Uint16Array, 768: Uint32Array }
  const Ctor = T[h.datatypeCode]
  if (!Ctor) throw new Error(`NIfTI data type ${h.datatypeCode} is not supported.`)
  const arr = new Ctor(img)
  const slope = h.scl_slope || 1, inter = h.scl_inter || 0
  const slices: Float32Array[] = []
  for (let z = 0; z < nz; z++) {
    const s = new Float32Array(nx * ny)
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) s[(ny - 1 - y) * nx + x] = arr[z * nx * ny + y * nx + x] * slope + inter
    slices.push(s)
  }
  const st = stats(slices)
  return { width: nx, height: ny, depth: nz, slices, ...st, window: { center: (st.min + st.max) / 2, width: st.max - st.min || 1 }, spacing: [h.pixDims[1], h.pixDims[2], h.pixDims[3]], meta: [['Dimensions', `${nx} × ${ny} × ${nz}`], ['Voxel size', `${h.pixDims.slice(1, 4).map((v: number) => +v.toFixed(3)).join(' × ')}`], ['Data type', String(h.datatypeCode)], ['Description', h.description || '-']], format: 'NIfTI' }
}

export async function readNrrd(buf: ArrayBuffer): Promise<Volume> {
  const { NRRDLoader } = await import('three/examples/jsm/loaders/NRRDLoader.js')
  const vol: any = (new NRRDLoader() as any).parse(buf)
  const [nx, ny, nz] = vol.xLength ? [vol.xLength, vol.yLength, vol.zLength] : vol.dimensions
  const data = vol.data
  const slices: Float32Array[] = []
  for (let z = 0; z < nz; z++) { const s = new Float32Array(nx * ny); for (let i = 0; i < nx * ny; i++) s[i] = data[z * nx * ny + i]; slices.push(s) }
  const st = stats(slices)
  return { width: nx, height: ny, depth: nz, slices, ...st, window: { center: (st.min + st.max) / 2, width: st.max - st.min || 1 }, spacing: vol.spacing, meta: [['Dimensions', `${nx} × ${ny} × ${nz}`], ['Spacing', (vol.spacing ?? []).map((v: number) => +v.toFixed(3)).join(' × ')]], format: 'NRRD' }
}

/** Render one slice with window/level into RGBA. */
export function renderSlice(v: Volume, z: number, center: number, width: number, invert: boolean, out?: Uint8ClampedArray): Uint8ClampedArray {
  const s = v.slices[Math.max(0, Math.min(v.depth - 1, z))]
  const n = v.width * v.height, o = out ?? new Uint8ClampedArray(n * 4)
  const lo = center - width / 2, k = 255 / Math.max(1e-9, width)
  for (let i = 0; i < n; i++) {
    if (v.rgb) { for (let c = 0; c < 3; c++) { const g = Math.max(0, Math.min(255, (s[i * 3 + c] - lo) * k)); o[i * 4 + c] = invert ? 255 - g : g } }
    else { let g = Math.max(0, Math.min(255, (s[i] - lo) * k)); if (invert) g = 255 - g; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g }
    o[i * 4 + 3] = 255
  }
  return o
}

export const PRESETS: { label: string; c: number; w: number }[] = [
  { label: 'Soft tissue', c: 40, w: 400 }, { label: 'Lung', c: -600, w: 1500 }, { label: 'Bone', c: 400, w: 1800 },
  { label: 'Brain', c: 40, w: 80 }, { label: 'Liver', c: 60, w: 160 }, { label: 'Abdomen', c: 50, w: 350 },
]

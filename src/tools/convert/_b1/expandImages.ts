/* Turn TIFF (every page) and SVG files into PNG files that the normal image pipeline can place. Other files pass through. */
const isTiff = (f: File) => /\.tiff?$/i.test(f.name) || f.type === 'image/tiff'
const isSvg = (f: File) => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml'
const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Could not encode image'))), 'image/png'))

export async function expandImageFiles(files: File[]): Promise<File[]> {
  const out: File[] = []
  for (const f of files) {
    if (isTiff(f)) {
      try {
        const mod: any = await import('utif'); const UTIF = mod.default ?? mod
        const buf = await f.arrayBuffer()
        const ifds = UTIF.decode(buf).filter((d: any) => d.width && d.height || d.t256)
        const base = f.name.replace(/\.[^.]+$/, '')
        let n = 0
        for (const ifd of ifds) {
          UTIF.decodeImage(buf, ifd)
          if (!ifd.width || !ifd.height) continue
          const rgba = new Uint8ClampedArray(UTIF.toRGBA8(ifd))
          const c = document.createElement('canvas'); c.width = ifd.width; c.height = ifd.height
          c.getContext('2d')!.putImageData(new ImageData(rgba, ifd.width, ifd.height), 0, 0)
          n++
          out.push(new File([await toPng(c)], ifds.length > 1 ? `${base}-page-${n}.png` : `${base}.png`, { type: 'image/png' }))
        }
        if (!n) out.push(f)
      } catch { out.push(f) }
      continue
    }
    if (isSvg(f)) {
      try {
        const { svgSize } = await import('./svg')
        const text = await f.text(); const s = svgSize(text)
        const scale = Math.min(4, 3000 / Math.max(s.w, s.h)) * (96 / 72)
        const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad svg')); i.src = url })
        const c = document.createElement('canvas'); c.width = Math.round(s.w * scale); c.height = Math.round(s.h * scale)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url)
        out.push(new File([await toPng(c)], f.name.replace(/\.svg$/i, '.png'), { type: 'image/png' }))
      } catch { out.push(f) }
      continue
    }
    out.push(f)
  }
  return out
}

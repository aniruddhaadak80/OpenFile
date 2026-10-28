/* Lazy loader for ImageMagick (WebAssembly, Apache-2.0). About 15 MB, fetched once and cached by the browser. */
import wasmUrl from '@imagemagick/magick-wasm/magick.wasm?url'

let ready: Promise<typeof import('@imagemagick/magick-wasm')> | null = null

export function loadMagick() {
  if (!ready) {
    ready = (async () => {
      const m = await import('@imagemagick/magick-wasm')
      const res = await fetch(wasmUrl)
      if (!res.ok) throw new Error('Could not download the ImageMagick engine.')
      await m.initializeImageMagick(new Uint8Array(await res.arrayBuffer()))
      return m
    })()
    ready.catch(() => { ready = null })
  }
  return ready
}

/** Read any ImageMagick-supported file and return PNG bytes plus its detected format and size. */
export async function magickToPng(bytes: Uint8Array, formatHint?: string): Promise<{ png: Uint8Array; format: string; width: number; height: number }> {
  const m = await loadMagick()
  const settings = new m.MagickReadSettings(formatHint ? { format: formatHint as any } : {})
  return m.ImageMagick.read(bytes, settings, (img) => {
    const format = String(img.format), width = img.width, height = img.height
    return img.write(m.MagickFormat.Png, (d) => ({ png: new Uint8Array(d), format, width, height }))
  })
}

/** Convert PNG bytes into another ImageMagick format. */
export async function pngToMagick(png: Uint8Array, format: string, quality = 90): Promise<Uint8Array> {
  const m = await loadMagick()
  return m.ImageMagick.read(png, m.MagickFormat.Png, (img) => {
    img.quality = quality
    if (format === 'PBM' || format === 'XBM' || format === 'WBMP') img.threshold(new m.Percentage(50))
    return img.write(format as any, (d) => new Uint8Array(d))
  })
}

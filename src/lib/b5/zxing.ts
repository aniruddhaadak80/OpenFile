/* Browser loader for the zxing-wasm reader with the .wasm file served from our own origin (no CDN). */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { scan, type ScanOpts, type ScanHit } from './barcode-read'

type Mod = typeof import('zxing-wasm/reader')
let modP: Promise<Mod> | null = null
export function loadZxing(): Promise<Mod> {
  return (modP ??= (async () => {
    const z = await import('zxing-wasm/reader')
    await z.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }, fireImmediately: true })
    return z
  })().catch((e) => { modP = null; throw e }))
}
export async function scanImage(input: ImageData | Blob, o: ScanOpts = {}): Promise<ScanHit[]> {
  return scan(await loadZxing(), input, o)
}

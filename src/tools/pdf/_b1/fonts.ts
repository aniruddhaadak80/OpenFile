/* Liberation Sans (SIL OFL, shipped with pdfjs-dist) for PDFs that need embedded fonts. */
import regUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url'
import boldUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url'
let cache: Promise<{ regular: Uint8Array; bold: Uint8Array; fontkit: any }> | null = null
export function loadSansFonts() {
  cache ??= (async () => {
    const [r, b, fk] = await Promise.all([fetch(regUrl).then((x) => x.arrayBuffer()), fetch(boldUrl).then((x) => x.arrayBuffer()), import('@pdf-lib/fontkit')])
    return { regular: new Uint8Array(r), bold: new Uint8Array(b), fontkit: (fk as any).default ?? fk }
  })()
  cache.catch(() => { cache = null })
  return cache
}

/* jsPDF helpers: Unicode (Liberation Sans) fonts + a live, debounced PDF preview rendered by pdf.js */
import { useEffect, useRef, useState } from 'react'
import regUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url'
import boldUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url'
import italicUrl from 'pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?url'
import { Spinner, cn } from '@/components/ui'

let fontCache: Promise<Record<string, string>> | null = null
function toB64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf); let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
async function loadFonts() {
  if (!fontCache) fontCache = (async () => {
    const entries = await Promise.all(([['normal', regUrl], ['bold', boldUrl], ['italic', italicUrl]] as const).map(async ([k, u]) => {
      const r = await fetch(u); if (!r.ok) throw new Error('font'); return [k, toB64(await r.arrayBuffer())] as const
    }))
    return Object.fromEntries(entries)
  })().catch((e) => { fontCache = null; throw e })
  return fontCache
}

/** Create a jsPDF doc with the Unicode "Sans" family registered (falls back to Helvetica when offline). */
export async function newDoc(format: 'a4' | 'letter' = 'a4') {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format, compress: true })
  let family = 'helvetica'
  try {
    const f = await loadFonts()
    for (const [style, b64] of Object.entries(f)) {
      const file = `LiberationSans-${style}.ttf`
      doc.addFileToVFS(file, b64)
      doc.addFont(file, 'Sans', style)
    }
    family = 'Sans'
  } catch { /* keep Helvetica */ }
  doc.setFont(family, 'normal')
  return { doc, family }
}

export { hexRgb, tint } from './color'

/** Renders a PDF blob (rebuilt on deps change, debounced) as page images */
export function LivePdfPreview({ build, deps, className, delay = 350 }: { build: () => Promise<Blob>; deps: unknown[]; className?: string; delay?: number }) {
  const [imgs, setImgs] = useState<string[]>([])
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const tok = useRef(0)
  useEffect(() => {
    const t = ++tok.current
    setBusy(true)
    const timer = setTimeout(async () => {
      try {
        const blob = await build()
        const { openPdfJs, renderPage } = await import('@/lib/pdf')
        const d = await openPdfJs(blob)
        const out: string[] = []
        for (let i = 1; i <= d.numPages; i++) { const c = await renderPage(d, i, 1.6); out.push(c.toDataURL('image/png')); c.width = c.height = 0 }
        void d.loadingTask.destroy()
        if (t === tok.current) { setImgs(out); setErr(null) }
      } catch (e: any) { if (t === tok.current) setErr(e?.message || 'Preview failed') }
      finally { if (t === tok.current) setBusy(false) }
    }, imgs.length ? delay : 0)
    return () => clearTimeout(timer)
  }, deps)
  return (
    <div className={cn('relative space-y-4', className)}>
      {imgs.length === 0 && busy && <div className="grid aspect-[1/1.414] place-items-center rounded-lg bg-white shadow-xl ring-1 ring-black/10"><Spinner label="Building preview…" /></div>}
      {imgs.map((src, i) => <img key={i} src={src} alt={`Page ${i + 1}`} className={cn('w-full rounded-sm bg-white shadow-xl ring-1 ring-black/10 transition-opacity duration-200', busy && 'opacity-80')} />)}
      {busy && imgs.length > 0 && <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-1"><Spinner /></div>}
      {err && <div className="text-sm text-danger">{err}</div>}
    </div>
  )
}

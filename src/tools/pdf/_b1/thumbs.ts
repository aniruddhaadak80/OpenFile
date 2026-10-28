/* Light thumbnail hook: renders the first `max` pages of a PDF to data URLs. */
import { useEffect, useState } from 'react'
import { openPdfJs, renderPage } from '@/lib/pdf'
export const PDF_ACCEPT = 'application/pdf,.pdf'
export function usePdfThumbsLite(file: Blob | null, max = 1, scale = 0.25) {
  const [thumbs, setThumbs] = useState<string[]>([])
  useEffect(() => {
    let cancel = false; setThumbs([])
    if (!file) return
    ;(async () => {
      const d = await openPdfJs(file)
      const out: string[] = []
      for (let i = 1; i <= Math.min(max, d.numPages); i++) { const c = await renderPage(d, i, scale); if (cancel) break; out.push(c.toDataURL('image/jpeg', 0.7)); setThumbs([...out]) }
      try { (d as any).loadingTask?.destroy?.() } catch { /* ignore */ }
    })().catch(() => {})
    return () => { cancel = true }
  }, [file, max, scale])
  return thumbs
}

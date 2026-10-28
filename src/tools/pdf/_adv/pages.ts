/* Page rendering + coordinate helpers shared by the pdf-adv tools (sign, edit, redact, fill, compare). */
import { useEffect, useState } from 'react'
import { openPdfJs, renderPage, type PdfJsDoc } from '@/lib/pdf'

/** A rendered page. w/h are the *displayed* page size in PDF points (rotation applied). */
export interface PageInfo {
  index: number
  src: string
  w: number
  h: number
  rotate: number
  /** pdf.js viewport transform at scale 1: PDF user space -> top-left viewport space */
  t: number[]
}

export function pdfError(e: any): string {
  if (e?.name === 'PasswordException') return 'This PDF is password-protected. Unlock it first with the Unlock PDF tool.'
  if (e?.name === 'InvalidPDFException') return 'This file does not look like a valid PDF. Try Repair PDF first.'
  return e?.message || 'Could not read this PDF.'
}

export async function pageInfo(doc: PdfJsDoc, i: number, scale: number): Promise<PageInfo> {
  const page = await doc.getPage(i + 1)
  const vp = page.getViewport({ scale: 1 })
  const c = await renderPage(doc, i + 1, scale)
  const src = c.toDataURL('image/jpeg', 0.88)
  c.width = c.height = 0
  return { index: i, src, w: vp.width, h: vp.height, rotate: ((vp.rotation % 360) + 360) % 360, t: [...vp.transform] }
}

/** Progressive renderer: pages appear one by one. */
export function usePdfPages(file: Blob | null, scale = 1.6) {
  const [pages, setPages] = useState<PageInfo[]>([])
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  useEffect(() => {
    let cancelled = false
    setPages([]); setDoc(null); setError(null); setTotal(0)
    if (!file) return
    ;(async () => {
      try {
        const d = await openPdfJs(file)
        if (cancelled) return
        setDoc(d); setTotal(d.numPages)
        const out: PageInfo[] = []
        const sc = Math.min(2.2, scale * Math.max(1, Math.min(1.5, window.devicePixelRatio || 1)))
        for (let i = 0; i < d.numPages; i++) {
          const p = await pageInfo(d, i, sc)
          if (cancelled) return
          out.push(p); setPages([...out])
        }
      } catch (e: any) { if (!cancelled) setError(pdfError(e)) }
    })()
    return () => { cancelled = true }
  }, [file, scale])
  return { pages, doc, total, error, loading: !!file && !error && (total === 0 || pages.length < total) }
}

/** Viewport (top-left, points) -> PDF user space. Handles rotation and crop-box offsets. */
export function toPdf(t: number[], x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = t
  const det = a * d - b * c
  const px = (d * (x - e) - c * (y - f)) / det
  const py = (-b * (x - e) + a * (y - f)) / det
  return [px, py]
}

/** PDF user space -> viewport (top-left, points) */
export function fromPdf(t: number[], x: number, y: number): [number, number] {
  const [a, b, c, d, e, f] = t
  return [a * x + c * y + e, b * x + d * y + f]
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? ''
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Render only the first page (cheap preview). Returns locked=true when a password is required. */
export function useFirstPage(file: Blob | null, password?: string) {
  const [state, setState] = useState<{ src: string | null; pages: number; locked: boolean; error: string | null; restricted: boolean }>({ src: null, pages: 0, locked: false, error: null, restricted: false })
  useEffect(() => {
    let cancelled = false
    setState({ src: null, pages: 0, locked: false, error: null, restricted: false })
    if (!file) return
    ;(async () => {
      try {
        const d = await openPdfJs(file, password)
        const c = await renderPage(d, 1, 0.6)
        const perms = await d.getPermissions().catch(() => null)
        if (!cancelled) setState({ src: c.toDataURL('image/jpeg', 0.8), pages: d.numPages, locked: false, error: null, restricted: !!perms })
        void d.loadingTask.destroy()
      } catch (e: any) {
        if (cancelled) return
        if (e?.name === 'PasswordException') setState((s) => ({ ...s, locked: true }))
        else setState((s) => ({ ...s, error: pdfError(e) }))
      }
    })()
    return () => { cancelled = true }
  }, [file, password])
  return state
}

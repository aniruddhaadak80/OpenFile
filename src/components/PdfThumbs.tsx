/* Renders thumbnails for every page of a PDF. Used by organize / delete / extract / rotate / split etc. */
import { useEffect, useState } from 'react'
import { openPdfJs, renderPage, type PdfJsDoc } from '@/lib/pdf'
import { cn, Spinner } from './ui'
import { Check } from 'lucide-react'

export function usePdfThumbs(file: Blob | null, scale = 0.35) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setThumbs([]); setDoc(null); setError(null)
    if (!file) return
    ;(async () => {
      try {
        const d = await openPdfJs(file)
        if (cancelled) return
        setDoc(d)
        const out: string[] = []
        for (let i = 1; i <= d.numPages; i++) {
          const c = await renderPage(d, i, scale)
          if (cancelled) return
          out.push(c.toDataURL('image/jpeg', 0.7))
          setThumbs([...out])
        }
      } catch (e: any) { if (!cancelled) setError(e?.name === 'PasswordException' ? 'This PDF is password-protected. Unlock it first with Unlock PDF.' : e?.message || 'Could not read PDF') }
    })()
    return () => { cancelled = true }
  }, [file, scale])
  return { thumbs, doc, numPages: doc?.numPages ?? 0, error, loading: !!file && !error && (!doc || thumbs.length < (doc?.numPages ?? 1)) }
}

export function PdfPageGrid({ file, selected, onToggle, rotations, labels, className }: { file: Blob; selected?: Set<number>; onToggle?: (i: number) => void; rotations?: Record<number, number>; labels?: (i: number) => React.ReactNode; className?: string }) {
  const { thumbs, numPages, error, loading } = usePdfThumbs(file)
  if (error) return <div className="text-sm text-danger">{error}</div>
  return (
    <div className={className}>
      {loading && <div className="mb-3"><Spinner label={`Rendering pages… ${thumbs.length}/${numPages || '?'}`} /></div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
        {thumbs.map((src, i) => {
          const sel = selected?.has(i)
          return (
            <button key={i} type="button" onClick={() => onToggle?.(i)} className={cn('group relative rounded-xl border-2 bg-surface-2 p-2 transition cursor-pointer', sel ? 'border-accent ring-4 ring-accent/20' : 'border-border hover:border-accent/50')}>
              <div className="flex aspect-[3/4] items-center justify-center overflow-hidden">
                <img src={src} alt={`Page ${i + 1}`} className="max-h-full max-w-full shadow transition-transform" style={{ transform: `rotate(${rotations?.[i] ?? 0}deg)` }} />
              </div>
              <div className="mt-1.5 text-center text-xs font-medium text-muted">{labels ? labels(i) : `Page ${i + 1}`}</div>
              {sel && <div className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow"><Check className="size-3.5" /></div>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Illustrations for a post, placed into the article without editing post bodies: each image is rendered through a portal
// into a slot inserted after a chapter heading's section (or at the end). Click any image to open the lightbox.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'
import { mediaFor, pub, type PostImage } from './media'

interface Slot { el: HTMLElement; img: PostImage; i: number }

export function PostFigures({ slug, rootRef }: { slug: string; rootRef: React.RefObject<HTMLElement | null> }) {
  const imgs = mediaFor(slug).images ?? []
  const [slots, setSlots] = useState<Slot[]>([])
  const [box, setBox] = useState<number | null>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !imgs.length) return
    const h2s = [...root.querySelectorAll<HTMLElement>(':scope h2[id]')].filter((h) => !h.closest('.not-prose'))
    const made: Slot[] = []
    const sectionEnd = (h: HTMLElement) => { let n: Element | null = h.nextElementSibling; let last: Element = h; while (n && n.tagName !== 'H2') { last = n; n = n.nextElementSibling } return last }
    const used = new Set<HTMLElement>()
    imgs.forEach((img, i) => {
      let anchor: Element | null = null
      if (img.after === 'end') anchor = root.querySelector(':scope > :last-child')
      else if (img.heading) { const h = h2s.find((x) => x.id === img.heading); if (h) anchor = sectionEnd(h) }
      if (!anchor) {
        // spread the rest across the post: after the first section, then evenly
        const k = typeof img.after === 'number' ? img.after : Math.round(((i + 1) * h2s.length) / (imgs.length + 1))
        const h = h2s[Math.min(h2s.length - 1, Math.max(0, k))]
        anchor = h ? sectionEnd(h) : root.lastElementChild
      }
      if (!anchor) return
      while (used.has(anchor as HTMLElement) && anchor.nextElementSibling) anchor = anchor.nextElementSibling
      const el = document.createElement('div')
      el.dataset.figureSlot = String(i)
      el.className = 'not-prose'
      anchor.after(el)
      used.add(el)
      made.push({ el, img, i })
    })
    setSlots(made)
    return () => { made.forEach((s) => s.el.remove()); setSlots([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  return <>
    {slots.map((s) => createPortal(
      <figure className="group my-8 overflow-hidden rounded-2xl border border-border bg-surface">
        <button onClick={() => setBox(s.i)} className="relative block w-full cursor-zoom-in" aria-label={`Open image: ${s.img.caption}`}>
          <img src={pub(slug, s.img.src)} alt={s.img.alt} loading="lazy" decoding="async" width={1600} height={900} className="block aspect-video w-full object-cover transition duration-500 group-hover:scale-[1.015]" />
          <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"><Expand className="size-4" /></span>
        </button>
        <figcaption className="border-t border-border px-4 py-2.5 text-xs text-muted">{s.img.caption}</figcaption>
      </figure>, s.el, `fig-${s.i}`))}
    {box !== null && <Lightbox slug={slug} imgs={imgs} index={box} onIndex={setBox} onClose={() => setBox(null)} />}
  </>
}

export function Lightbox({ slug, imgs, index, onIndex, onClose }: { slug: string; imgs: PostImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const go = useCallback((d: number) => onIndex((index + d + imgs.length) % imgs.length), [index, imgs.length, onIndex])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') { e.stopPropagation(); go(1) } else if (e.key === 'ArrowLeft') { e.stopPropagation(); go(-1) } }
    addEventListener('keydown', k, true)
    const o = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', k, true); document.body.style.overflow = o }
  }, [go, onClose])
  const img = imgs[index]
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Image viewer" className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur" onClick={onClose}>
      <button aria-label="Close" onClick={onClose} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"><X className="size-5" /></button>
      {imgs.length > 1 && <>
        <button aria-label="Previous image" onClick={(e) => { e.stopPropagation(); go(-1) }} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"><ChevronLeft className="size-6" /></button>
        <button aria-label="Next image" onClick={(e) => { e.stopPropagation(); go(1) }} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 cursor-pointer"><ChevronRight className="size-6" /></button>
      </>}
      <img src={pub(slug, img.src)} alt={img.alt} className="of-lightbox-img max-w-full rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <p className="mt-4 max-w-3xl text-center text-sm text-white/80" onClick={(e) => e.stopPropagation()}>{img.caption} <span className="text-white/50">({index + 1} of {imgs.length})</span></p>
    </div>, document.body)
}

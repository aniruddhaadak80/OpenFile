// Renders one docs page: markdown segments, tab groups and interactive components, in order.
// Headings from every markdown segment are collected for the "On this page" list and scroll-spy.
import { useEffect, useMemo } from 'react'
import { Markdown, renderMarkdown, type Heading } from '@/components/Markdown'
import { toast } from '@/components/toast'
import { segments } from './data'
import { COMPONENTS, DocTabs } from './widgets'

export function DocContent({ md, onHeadings, onRendered }: { md: string; onHeadings: (h: Heading[]) => void; onRendered?: () => void }) {
  const segs = useMemo(() => segments(md), [md])
  // ids match what each Markdown segment writes into the DOM
  const headings = useMemo(() => segs.flatMap((s) => (s.kind === 'md' ? renderMarkdown(s.md).headings : [])), [segs])
  useEffect(() => { onHeadings(headings) }, [headings])
  useEffect(() => { const t = setTimeout(() => onRendered?.(), 60); return () => clearTimeout(t) }, [md])

  // Copy buttons on code and the "#" links on headings: copy with a fallback for browsers without the async
  // clipboard, and always say what happened, so the click never feels like it did nothing.
  const onClickCapture = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    const btn = t.closest<HTMLButtonElement>('[data-copy]')
    if (btn) {
      e.stopPropagation()
      const code = btn.closest('.code-block')?.querySelector('code')?.textContent ?? ''
      void copy(code).then((ok) => {
        btn.textContent = ok ? 'Copied' : 'Press Ctrl+C'
        btn.classList.add('is-copied')
        btn.setAttribute('aria-live', 'polite')
        clearTimeout(Number(btn.dataset.timer))
        btn.dataset.timer = String(window.setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('is-copied') }, 2500))
        if (ok) toast('Code copied', 'success')
        else selectCode(btn)
      })
      return
    }
    const a = t.closest<HTMLAnchorElement>('a.heading-anchor')
    if (!a) return
    const url = `${location.origin}${location.pathname}${a.getAttribute('href')}`
    void copy(url).then((ok) => toast(ok ? 'Link to this section copied' : 'Link is in the address bar', ok ? 'success' : 'info'))
  }

  return (
    <div onClickCapture={onClickCapture}>
      {segs.map((s, i) => {
        if (s.kind === 'md') return <Markdown key={i} md={s.md} onRendered={onRendered} />
        if (s.kind === 'tabs') return <DocTabs key={i} group={s.group} tabs={s.tabs} />
        const C = COMPONENTS[s.name]
        return C ? <C key={i} /> : null
      })}
    </div>
  )
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall back below */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}
function selectCode(btn: HTMLElement) {
  const code = btn.closest('.code-block')?.querySelector('code')
  if (!code) return
  const r = document.createRange(); r.selectNodeContents(code)
  const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r)
}

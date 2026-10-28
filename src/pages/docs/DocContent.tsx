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

  // Heading "#" links: also copy the full URL, so a section can be shared in one click.
  const onClickCapture = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.heading-anchor')
    if (!a) return
    const url = `${location.origin}${location.pathname}${a.getAttribute('href')}`
    navigator.clipboard?.writeText(url).then(() => toast('Link to this section copied', 'info'), () => {})
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

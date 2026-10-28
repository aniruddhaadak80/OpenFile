// Markdown renderer for the docs: marked + highlight.js, GitHub-style callouts, copyable code blocks,
// internal links routed through react-router, and Mermaid diagrams rendered client-side (lazy-loaded).
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Marked, type Tokens } from 'marked'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import nginx from 'highlight.js/lib/languages/nginx'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import { slugify } from '@/lib/slug'

hljs.registerLanguage('bash', bash); hljs.registerAliases(['sh', 'shell', 'zsh', 'console'], { languageName: 'bash' })
hljs.registerLanguage('typescript', typescript); hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerLanguage('javascript', javascript); hljs.registerAliases(['js', 'jsx', 'mjs'], { languageName: 'javascript' })
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml); hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerLanguage('xml', xml); hljs.registerAliases(['html', 'svg'], { languageName: 'xml' })
hljs.registerLanguage('dockerfile', dockerfile); hljs.registerAliases(['docker'], { languageName: 'dockerfile' })
hljs.registerLanguage('nginx', nginx)
hljs.registerLanguage('markdown', markdown); hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerLanguage('plaintext', plaintext); hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' })

export interface Heading { id: string; text: string; depth: number }

const BASE = import.meta.env.BASE_URL || '/'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const CALLOUTS: Record<string, { label: string; icon: string }> = {
  NOTE: { label: 'Note', icon: '<path d="M12 16v-4M12 8h.01"/><circle cx="12" cy="12" r="10"/>' },
  TIP: { label: 'Tip', icon: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>' },
  IMPORTANT: { label: 'Important', icon: '<path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/>' },
  WARNING: { label: 'Warning', icon: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>' },
  CAUTION: { label: 'Caution', icon: '<path d="M12 9v4M12 17h.01"/><path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z"/>' },
}
const ICON = (d: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`

export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
  const headings: Heading[] = []
  const counts = new Map<string, number>()
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading(this: any, { tokens, depth, text }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens)
        if (depth === 1) return `<h1>${inner}</h1>`
        const base = slugify(text); const n = counts.get(base) ?? 0; counts.set(base, n + 1)
        const id = n ? `${base}-${n}` : base
        if (depth <= 3) headings.push({ id, text: inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, '’').replace(/&quot;/g, '"'), depth })
        return `<h${depth} id="${id}"><a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>`
      },
      code({ text, lang }: Tokens.Code) {
        const l = (lang || '').trim().split(/\s+/)[0].toLowerCase()
        if (l === 'mermaid') return `<div class="mermaid-block" data-src="${encodeURIComponent(text)}"><pre class="mermaid-fallback"><code>${esc(text)}</code></pre></div>`
        const known = l && hljs.getLanguage(l)
        const body = known ? hljs.highlight(text, { language: l, ignoreIllegals: true }).value : esc(text)
        const label = l || 'text'
        return `<div class="code-block"><div class="code-head"><span>${esc(label)}</span><button type="button" class="code-copy" data-copy>Copy</button></div><pre><code class="hljs language-${esc(label)}">${body}</code></pre></div>`
      },
      link(this: any, { href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens)
        const t = title ? ` title="${esc(title)}"` : ''
        if (href.startsWith('/') && !href.startsWith('//')) return `<a href="${esc(BASE + href.slice(1))}" data-internal="${esc(href)}"${t}>${inner}</a>`
        if (href.startsWith('#')) return `<a href="${esc(href)}" data-hash${t}>${inner}</a>`
        return `<a href="${esc(href)}" target="_blank" rel="noreferrer noopener"${t}>${inner}<span class="ext" aria-hidden="true">↗</span></a>`
      },
      blockquote(this: any, { tokens }: Tokens.Blockquote) {
        const inner: string = this.parser.parse(tokens)
        const m = inner.match(/^\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/)
        if (m) {
          const c = CALLOUTS[m[1]]
          return `<div class="callout callout-${m[1].toLowerCase()}"><div class="callout-title">${ICON(c.icon)}${c.label}</div>${inner.replace(m[0], '<p>')}</div>`
        }
        return `<blockquote>${inner}</blockquote>`
      },
    },
  })
  let html = marked.parse(md, { async: false }) as string
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>')
  return { html, headings }
}

let mermaidSeq = 0
async function renderMermaid(root: HTMLElement) {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'))
  if (!blocks.length) return
  const mermaid = (await import('mermaid')).default
  const dark = document.documentElement.classList.contains('dark')
  const css = getComputedStyle(document.documentElement)
  const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    themeVariables: {
      darkMode: dark, background: v('--surface', dark ? '#0f1119' : '#ffffff'),
      primaryColor: dark ? '#1d1838' : '#efeaff', primaryBorderColor: v('--accent', '#6d4aff'), primaryTextColor: v('--fg', dark ? '#eef0f8' : '#0d0f1a'),
      secondaryColor: dark ? '#10262c' : '#e6fbff', tertiaryColor: v('--surface-2', dark ? '#161a26' : '#f0f1f7'),
      lineColor: v('--muted', '#8b91a8'), textColor: v('--fg', dark ? '#eef0f8' : '#0d0f1a'),
      clusterBkg: v('--surface-2', dark ? '#161a26' : '#f0f1f7'), clusterBorder: v('--border', '#232838'),
      actorBkg: dark ? '#1d1838' : '#efeaff', actorBorder: v('--accent', '#6d4aff'), actorTextColor: v('--fg', '#eef0f8'), signalColor: v('--muted', '#8b91a8'), signalTextColor: v('--fg', '#eef0f8'),
      noteBkgColor: dark ? '#10262c' : '#e6fbff', noteBorderColor: v('--accent-2', '#06b6d4'), noteTextColor: v('--fg', '#eef0f8'),
    },
  })
  for (const el of blocks) {
    const src = decodeURIComponent(el.dataset.src || '')
    try {
      const { svg } = await mermaid.render(`of-mermaid-${++mermaidSeq}`, src)
      if (!el.isConnected) continue
      el.innerHTML = `<div class="mermaid-svg">${svg}</div>`
      el.classList.add('is-rendered')
    } catch (e) {
      console.warn('[docs] mermaid failed', e)
      document.getElementById(`dof-mermaid-${mermaidSeq}`)?.remove()
    }
  }
}

export function Markdown({ md, onHeadings, onRendered, className }: { md: string; onHeadings?: (h: Heading[]) => void; onRendered?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const { html, headings } = useMemo(() => renderMarkdown(md), [md])
  useEffect(() => { onHeadings?.(headings) }, [headings])

  // mermaid: render now, and again whenever the theme flips
  useEffect(() => {
    const root = ref.current
    if (!root) return
    let cancelled = false
    const run = () => { if (!cancelled) renderMermaid(root).then(() => !cancelled && onRendered?.()).catch(() => {}) }
    run()
    let lastDark = document.documentElement.classList.contains('dark')
    const themeMo = new MutationObserver(() => { const d = document.documentElement.classList.contains('dark'); if (d !== lastDark) { lastDark = d; root.querySelectorAll<HTMLElement>('.mermaid-block.is-rendered').forEach((el) => { el.classList.remove('is-rendered'); el.innerHTML = `<pre class="mermaid-fallback"><code>${esc(decodeURIComponent(el.dataset.src || ''))}</code></pre>` }); run() } })
    themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => { cancelled = true; themeMo.disconnect() }
  }, [html])

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    const copy = t.closest<HTMLButtonElement>('[data-copy]')
    if (copy) {
      const code = copy.closest('.code-block')?.querySelector('code')?.textContent ?? ''
      navigator.clipboard?.writeText(code).then(() => { copy.textContent = 'Copied'; copy.classList.add('is-copied'); setTimeout(() => { copy.textContent = 'Copy'; copy.classList.remove('is-copied') }, 1400) }).catch(() => {})
      return
    }
    const a = t.closest<HTMLAnchorElement>('a')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (a.dataset.internal) { e.preventDefault(); nav(a.dataset.internal); return }
    if (a.hasAttribute('data-hash') || a.classList.contains('heading-anchor')) {
      e.preventDefault()
      const id = decodeURIComponent(a.getAttribute('href')!.slice(1))
      document.getElementById(id)?.scrollIntoView({ behavior: document.documentElement.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'start' })
      history.replaceState(history.state, '', `#${id}`)
    }
  }

  return <div ref={ref} onClick={onClick} className={className ?? 'docs-prose'} dangerouslySetInnerHTML={{ __html: html }} />
}

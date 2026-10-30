import { useEffect, useRef, useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { Button, Segmented, Select, Switch } from '@/components/ui'
import { toast } from '@/components/toast'
import { Bar, Status, Pane, CodeArea, CodeView, OpenFileButton, DownloadButton, useStored, useDebounced } from '../dev/_b5/shell'
import { CopyButton } from '@/components/ui'

const SAMPLE = `<h1>Release notes</h1>
<p>Version <strong>3.0</strong> brings <em>faster</em> tools and a <a href="https://example.com/blog">new blog</a>.</p>
<ul><li>New data tools</li><li>Better <code>CSV</code> editing<ul><li>Sort and filter</li></ul></li></ul>
<blockquote><p>Everything still runs in your browser.</p></blockquote>
<pre><code class="language-js">const ok = true</code></pre>
<table><thead><tr><th>Tool</th><th>Status</th></tr></thead><tbody><tr><td>SQLite</td><td>New</td></tr><tr><td>Parquet</td><td>New</td></tr></tbody></table>
<p><img src="https://example.com/shot.png" alt="Screenshot"></p>`

export default function HtmlToMarkdown() {
  const [html, setHtml] = useStored('b5:h2m:html', SAMPLE)
  const [heading, setHeading] = useState<'atx' | 'setext'>('atx')
  const [bullet, setBullet] = useState<'-' | '*' | '+'>('-')
  const [fence, setFence] = useState<'fenced' | 'indented'>('fenced')
  const [strong, setStrong] = useState<'**' | '__'>('**')
  const [linkStyle, setLinkStyle] = useState<'inlined' | 'referenced'>('inlined')
  const [gfm, setGfm] = useState(true)
  const [view, setView] = useState<'md' | 'preview'>('md')
  const [md, setMd] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const paste = useRef<HTMLDivElement>(null)
  const dh = useDebounced(html, 200)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [{ default: TurndownService }, { default: DOMPurify }] = await Promise.all([import('turndown'), import('dompurify')])
        const td = new TurndownService({ headingStyle: heading, bulletListMarker: bullet, codeBlockStyle: fence, strongDelimiter: strong, emDelimiter: '*', linkStyle, hr: '---' })
        td.remove(['script', 'style', 'noscript', 'iframe'] as any)
        if (gfm) {
          td.addRule('strike', { filter: ['del', 's', 'strike'] as any, replacement: (c) => `~~${c}~~` })
          td.addRule('taskItem', { filter: (n) => n.nodeName === 'INPUT' && (n as HTMLInputElement).type === 'checkbox', replacement: (_c, n) => ((n as HTMLInputElement).checked ? '[x] ' : '[ ] ') })
          td.addRule('fencedLang', { filter: (n) => n.nodeName === 'PRE' && n.firstChild?.nodeName === 'CODE', replacement: (_c, n) => { const code = n.firstChild as HTMLElement; const lang = (code.className.match(/language-(\S+)/) ?? [])[1] ?? ''; return fence === 'fenced' ? `\n\n\`\`\`${lang}\n${code.textContent?.replace(/\n$/, '')}\n\`\`\`\n\n` : '\n\n' + (code.textContent ?? '').replace(/^/gm, '    ') + '\n\n' } })
          td.addRule('table', {
            filter: 'table',
            replacement: (_c, node) => {
              const rows = Array.from((node as HTMLTableElement).rows).map((r) => Array.from(r.cells).map((c) => (c.textContent ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()))
              if (!rows.length) return ''
              const w = Math.max(...rows.map((r) => r.length)); const norm = rows.map((r) => [...r, ...Array(w - r.length).fill('')])
              return '\n\n' + [`| ${norm[0].join(' | ')} |`, `| ${Array(w).fill('---').join(' | ')} |`, ...norm.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n') + '\n\n'
            },
          })
        }
        const clean = DOMPurify.sanitize(dh, { WHOLE_DOCUMENT: false })
        const out = td.turndown(clean)
        if (alive) { setMd(out); setErr(null) }
      } catch (e: any) { if (alive) setErr(e?.message || String(e)) }
    })()
    return () => { alive = false }
  }, [dh, heading, bullet, fence, strong, linkStyle, gfm])

  const [previewHtml, setPreviewHtml] = useState('')
  useEffect(() => { if (view !== 'preview') return; Promise.all([import('marked'), import('dompurify')]).then(async ([{ marked }, { default: P }]) => setPreviewHtml(P.sanitize(await marked.parse(md)))) }, [view, md])

  return (
    <div className="space-y-4">
      <Bar>
        <Select aria-label="Heading style" value={heading} onChange={setHeading} options={[{ value: 'atx', label: '# Headings' }, { value: 'setext', label: 'Underlined headings' }]} className="h-9 w-48" />
        <Segmented value={bullet} onChange={setBullet} options={['-', '*', '+']} />
        <Segmented value={strong} onChange={setStrong} options={[{ value: '**', label: '**bold**' }, { value: '__', label: '__bold__' }]} />
        <Segmented value={fence} onChange={setFence} options={[{ value: 'fenced', label: '``` code' }, { value: 'indented', label: 'Indented code' }]} />
        <Segmented value={linkStyle} onChange={setLinkStyle} options={[{ value: 'inlined', label: 'Inline links' }, { value: 'referenced', label: 'Reference links' }]} />
        <Switch checked={gfm} onChange={setGfm} label="GitHub tables and task lists" />
      </Bar>
      <div ref={paste} contentEditable suppressContentEditableWarning role="textbox" aria-label="Paste rich text here" tabIndex={0}
        onPaste={(e) => { const h = e.clipboardData.getData('text/html'); const t = e.clipboardData.getData('text/plain'); e.preventDefault(); if (h) { setHtml(h); toast('Rich text pasted and converted') } else if (t) setHtml(t); if (paste.current) paste.current.textContent = '' }}
        className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface px-4 text-sm text-muted outline-none focus:border-accent focus:text-fg empty:before:content-['Click_here_and_paste_from_a_web_page,_Word_or_Google_Docs_(Ctrl+V)']" />
      {err && <Status kind="err">{err}</Status>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="HTML" className="h-[480px]" actions={<><Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => setHtml(SAMPLE)}>Sample</Button><OpenFileButton accept=".html,.htm,text/html" onText={(t) => setHtml(t)} /><Button size="sm" variant="ghost" onClick={() => setHtml('')}>Clear</Button></>}>
          <CodeArea value={html} onChange={setHtml} placeholder="Paste HTML here" />
        </Pane>
        <Pane title={<Segmented value={view} onChange={setView} options={[{ value: 'md', label: 'Markdown' }, { value: 'preview', label: 'Preview' }]} />} className="h-[480px]" actions={md ? <><CopyButton text={md} variant="ghost" /><DownloadButton text={md} filename="converted.md" mime="text/markdown" /></> : null}>
          {view === 'md' ? <CodeView code={md} lang="plain" className="h-full" /> : <div className="prose-sm scrollbar-thin h-full overflow-auto p-5 text-sm leading-relaxed [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-3 [&_code]:font-mono [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-3 [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: previewHtml }} />}
        </Pane>
      </div>
    </div>
  )
}

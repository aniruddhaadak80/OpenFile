import { useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, Link2, Image as ImageIcon, Code, SquareCode, Quote, List, ListOrdered, ListChecks, Table, Minus, Columns2, Eye, PenLine, Download, FileCode2, Upload } from 'lucide-react'
import { Button, Segmented, CopyButton, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { useLib, useStored, useDebounced, downloadText } from '@/tools/dev/_dev/kit'

const SAMPLE = `# Welcome to the Markdown Editor ✍️

Write on the left, see the **live preview** on the right. Everything autosaves in your browser.

## Features
- **Bold**, *italic*, ~~strikethrough~~ and \`inline code\`
- [Links](https://openfile.app) and images
- Tables, task lists and fenced code blocks (GFM)

### Task list
- [x] Write the draft
- [ ] Add a table
- [ ] Export as HTML

### Table
| Tool | Category | Offline |
| :--- | :------: | ------: |
| PDF Merge | PDF | ✅ |
| JSON Formatter | Dev | ✅ |

> Tip: use **Ctrl/⌘ + B**, **I** and **K** for bold, italic and links.

\`\`\`js
function hello(name) {
  return \`Hello, \${name}!\`
}
\`\`\`

---
Made with OpenFile.
`

const EXPORT_CSS = `body{max-width:780px;margin:40px auto;padding:0 20px;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#1f2330}h1,h2,h3{line-height:1.25;margin-top:1.6em}h1{font-size:2em;border-bottom:1px solid #e3e5ee;padding-bottom:.3em}h2{font-size:1.5em;border-bottom:1px solid #e3e5ee;padding-bottom:.25em}a{color:#f5a524}code{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;background:#f0f1f7;padding:.15em .35em;border-radius:4px;font-size:.9em}pre{background:#0f1119;color:#eef0f8;padding:16px;border-radius:10px;overflow:auto}pre code{background:none;padding:0;color:inherit}blockquote{margin:1em 0;padding:.5em 1em;border-left:4px solid #f5a524;background:#f7f7fb;color:#5d6275}table{border-collapse:collapse;margin:1em 0}th,td{border:1px solid #e3e5ee;padding:6px 12px}th{background:#f7f7fb}img{max-width:100%;border-radius:8px}hr{border:0;border-top:1px solid #e3e5ee;margin:2em 0}ul.contains-task-list,li.task-list-item{list-style:none}li.task-list-item input{margin-right:.5em}@media(prefers-color-scheme:dark){body{background:#07080d;color:#eef0f8}code{background:#161a26}blockquote,th{background:#0f1119;color:#8b91a8}th,td,h1,h2,hr{border-color:#232838}}`

type Mode = 'split' | 'edit' | 'preview'

export default function MarkdownEditor() {
  const libs = useLib('marked+purify', async () => { const [m, p] = await Promise.all([import('marked'), import('dompurify')]); return { marked: m.marked, purify: (p as any).default ?? p } })
  const [md, setMd] = useStored('markdown-editor:doc', SAMPLE)
  const [mode, setMode] = useState<Mode>('split')
  const [sync, setSync] = useState(true)
  const ta = useRef<HTMLTextAreaElement>(null)
  const pv = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lock = useRef(false)
  const dmd = useDebounced(md, 60)

  const html = useMemo(() => {
    if (!libs) return ''
    const raw = libs.marked.parse(dmd, { gfm: true, breaks: false, async: false }) as string
    return libs.purify.sanitize(raw, { ADD_ATTR: ['target', 'checked', 'disabled'] }) as string
  }, [libs, dmd])
  useEffect(() => { pv.current?.querySelectorAll('a[href^="http"]').forEach((a) => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener') })
    // Rendered task-list checkboxes are read-only; name each one after its task so screen readers say what it is.
    pv.current?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((c) => { const t = (c.closest('li')?.textContent ?? '').trim().slice(0, 120); c.setAttribute('aria-label', `${t || 'Task'} (${c.checked ? 'done' : 'not done'})`) })
  }, [html])

  const stats = useMemo(() => { const w = md.trim() ? md.replace(/[#*_`>\-[\]()|~]/g, ' ').split(/\s+/).filter(Boolean).length : 0; return { w, c: md.length, l: md.split('\n').length, min: Math.max(1, Math.round(w / 238)) } }, [md])

  // ---------- editing helpers ----------
  const apply = (fn: (sel: string, before: string, after: string) => { text: string; selStart: number; selEnd: number }) => {
    const t = ta.current; if (!t) return
    const s = t.selectionStart, e = t.selectionEnd
    const r = fn(md.slice(s, e), md.slice(0, s), md.slice(e))
    setMd(md.slice(0, s) + r.text + md.slice(e))
    requestAnimationFrame(() => { t.focus(); t.selectionStart = s + r.selStart; t.selectionEnd = s + r.selEnd })
  }
  const wrap = (l: string, r = l, ph = 'text') => apply((sel) => { const x = sel || ph; return { text: l + x + r, selStart: l.length, selEnd: l.length + x.length } })
  const linePrefix = (p: string | ((i: number) => string)) => {
    const t = ta.current; if (!t) return
    const s = md.lastIndexOf('\n', t.selectionStart - 1) + 1; const eIdx = md.indexOf('\n', t.selectionEnd); const e = eIdx < 0 ? md.length : eIdx
    const block = md.slice(s, e).split('\n').map((l, i) => { const pre = typeof p === 'function' ? p(i) : p; return l.startsWith(pre) ? l.slice(pre.length) : pre + l.replace(/^(#{1,6} |> |- \[[ x]\] |- |\d+\. )/, '') }).join('\n')
    setMd(md.slice(0, s) + block + md.slice(e))
    requestAnimationFrame(() => { t.focus(); t.selectionStart = s; t.selectionEnd = s + block.length })
  }
  const insert = (txt: string) => apply(() => ({ text: txt, selStart: txt.length, selEnd: txt.length }))

  const TOOLS: { icon: any; title: string; run: () => void; sep?: boolean }[] = [
    { icon: Heading1, title: 'Heading 1', run: () => linePrefix('# ') }, { icon: Heading2, title: 'Heading 2', run: () => linePrefix('## ') }, { icon: Heading3, title: 'Heading 3', run: () => linePrefix('### ') },
    { icon: Bold, title: 'Bold (Ctrl+B)', run: () => wrap('**'), sep: true }, { icon: Italic, title: 'Italic (Ctrl+I)', run: () => wrap('*') }, { icon: Strikethrough, title: 'Strikethrough', run: () => wrap('~~') }, { icon: Code, title: 'Inline code', run: () => wrap('`', '`', 'code') },
    { icon: Link2, title: 'Link (Ctrl+K)', run: () => apply((sel) => { const x = sel || 'link text'; return { text: `[${x}](https://)`, selStart: x.length + 3, selEnd: x.length + 11 } }), sep: true },
    { icon: ImageIcon, title: 'Image', run: () => apply((sel) => { const x = sel || 'alt text'; return { text: `![${x}](https://)`, selStart: x.length + 4, selEnd: x.length + 12 } }) },
    { icon: Quote, title: 'Quote', run: () => linePrefix('> '), sep: true }, { icon: List, title: 'Bullet list', run: () => linePrefix('- ') }, { icon: ListOrdered, title: 'Numbered list', run: () => linePrefix((i) => `${i + 1}. `) }, { icon: ListChecks, title: 'Task list', run: () => linePrefix('- [ ] ') },
    { icon: SquareCode, title: 'Code block', run: () => apply((sel) => { const x = sel || 'code'; return { text: `\n\`\`\`js\n${x}\n\`\`\`\n`, selStart: 7, selEnd: 7 + x.length } }), sep: true },
    { icon: Table, title: 'Table', run: () => insert('\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n') },
    { icon: Minus, title: 'Horizontal rule', run: () => insert('\n\n---\n\n') },
  ]

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**') }
    else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*') }
    else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); TOOLS[7].run() }
    else if (e.key === 'Tab') { e.preventDefault(); insert('  ') }
    else if (e.key === 'Enter') {
      // continue lists
      const t = e.currentTarget; const s = t.selectionStart; const ls = md.lastIndexOf('\n', s - 1) + 1; const line = md.slice(ls, s)
      const m = /^(\s*)(- \[[ x]\] |[-*+] |(\d+)\. )/.exec(line)
      if (m) {
        e.preventDefault()
        if (line.trim() === m[2].trim()) { setMd(md.slice(0, ls) + md.slice(s)); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = ls }); return }
        const next = m[3] ? `${m[1]}${Number(m[3]) + 1}. ` : m[2].startsWith('- [') ? `${m[1]}- [ ] ` : m[1] + m[2]
        insert('\n' + next)
      }
    }
  }

  const syncScroll = (from: 'ed' | 'pv') => {
    if (!sync || mode !== 'split' || lock.current) return
    const a = from === 'ed' ? ta.current : pv.current, b = from === 'ed' ? pv.current : ta.current
    if (!a || !b) return
    lock.current = true
    const r = a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight)
    b.scrollTop = r * (b.scrollHeight - b.clientHeight)
    requestAnimationFrame(() => { lock.current = false })
  }

  const fullHtml = () => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${(md.match(/^#\s+(.+)$/m)?.[1] ?? 'Document').replace(/</g, '&lt;')}</title>\n<style>${EXPORT_CSS}</style>\n</head>\n<body>\n${html}\n</body>\n</html>\n`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-surface p-2">
        {TOOLS.map((t, i) => (
          <span key={i} className="flex items-center">
            {t.sep && <span className="mx-1 h-5 w-px bg-border" />}
            <button title={t.title} aria-label={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => { if (mode === 'preview') setMode('split'); t.run() }} className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-fg cursor-pointer"><t.icon className="size-4" /></button>
          </span>
        ))}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented value={mode} onChange={setMode} options={[{ value: 'edit', label: <PenLine className="size-3.5" /> }, { value: 'split', label: <Columns2 className="size-3.5" /> }, { value: 'preview', label: <Eye className="size-3.5" /> }]} />
        </div>
      </div>

      <div className={cn('grid gap-3', mode === 'split' && 'lg:grid-cols-2')}>
        {mode !== 'preview' && (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <textarea ref={ta} value={md} onChange={(e) => setMd(e.target.value)} onKeyDown={onKey} onScroll={() => syncScroll('ed')} spellCheck
              className="scrollbar-thin block h-[620px] w-full resize-none bg-transparent p-5 font-mono text-[14px] leading-7 outline-none" placeholder="# Start writing…" />
          </div>
        )}
        {mode !== 'edit' && (
          <div ref={pv} onScroll={() => syncScroll('pv')} className="scrollbar-thin h-[620px] overflow-auto rounded-2xl border border-border bg-surface p-6">
            {html ? <article className="prose-of max-w-none [&_input]:mr-2 [&_li:has(>input)]:list-none" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="text-sm text-muted">{libs ? 'Nothing to preview yet.' : 'Loading renderer…'}</div>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2">
        <span className="text-xs text-muted">{stats.w.toLocaleString()} words · {stats.c.toLocaleString()} chars · {stats.l} lines · ~{stats.min} min read · autosaved</span>
        <label className="ml-2 flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="accent-[var(--accent)]" />Sync scroll</label>
        <div className="ml-auto flex flex-wrap gap-1">
          <input ref={fileRef} type="file" hidden accept=".md,.markdown,.txt,text/*" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setMd(await f.text()); toast('Opened ' + f.name) } }} />
          <Button size="sm" variant="ghost" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Open</Button>
          <Button size="sm" variant="ghost" onClick={() => { if (confirm('Replace the document with the sample?')) setMd(SAMPLE) }}>Sample</Button>
          <CopyButton text={md} label="Copy MD" variant="ghost" />
          <CopyButton text={html} label="Copy HTML" variant="ghost" />
          <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadText(md, 'document.md', 'text/markdown')}>.md</Button>
          <Button size="sm" variant="outline" icon={<FileCode2 className="size-4" />} onClick={() => downloadText(fullHtml(), 'document.html', 'text/html')}>.html</Button>
        </div>
      </div>
    </div>
  )
}

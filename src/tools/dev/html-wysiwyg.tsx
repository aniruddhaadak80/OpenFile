import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Underline, Strikethrough, Code, Heading1, Heading2, Heading3, List, ListOrdered, Quote, SquareCode, Link2, Unlink, AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, Redo2, Minus, RemoveFormatting, Pilcrow } from 'lucide-react'
import { Button, Segmented, Switch, CopyButton, Spinner, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { Pane, CodeArea, OpenFileButton, DownloadButton, useStored } from './_b5/shell'

const START = `<h2>Welcome to the editor</h2><p>Type here like in a word processor. Use the toolbar or shortcuts such as <strong>Ctrl+B</strong> and <em>Ctrl+I</em>.</p><ul><li><p>The HTML on the right updates as you type</p></li><li><p>It is clean: no inline styles or junk spans</p></li></ul><blockquote><p>Paste rich text from other apps and it is tidied up.</p></blockquote>`

function pretty(html: string) {
  const blocks = /^(p|h[1-6]|ul|ol|li|blockquote|pre|hr|table|thead|tbody|tr|td|th|div)$/
  let out = '', depth = 0
  const tokens = html.replace(/>\s+</g, '><').split(/(<[^>]+>)/).filter(Boolean)
  for (const t of tokens) {
    const m = t.match(/^<(\/?)([a-z0-9]+)/i)
    if (m && blocks.test(m[2].toLowerCase())) {
      if (m[1]) { depth = Math.max(0, depth - 1); out += '\n' + '  '.repeat(depth) + t }
      else { out += '\n' + '  '.repeat(depth) + t; if (!/\/>$/.test(t) && m[2] !== 'hr') depth++ }
    } else out += t
  }
  return out.replace(/(<(li|p|h[1-6]|td|th)[^>]*>)\n\s*(?=[^<\s])/g, '$1').replace(/^\n/, '').replace(/\n\s*\n/g, '\n') + '\n'
}

export default function HtmlWysiwyg() {
  const host = useRef<HTMLDivElement>(null)
  const ed = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [html, setHtml] = useStored('b5:wysiwyg:html', START)
  const [, force] = useState(0)
  const [view, setView] = useState<'split' | 'editor' | 'source'>('split')
  const [fmt, setFmt] = useState(true)
  const [source, setSource] = useState('')
  const [sourceDirty, setSourceDirty] = useState(false)

  useEffect(() => {
    let editor: any, alive = true
    ;(async () => {
      const [{ Editor }, { default: StarterKit }, { default: TextAlign }] = await Promise.all([import('@tiptap/core'), import('@tiptap/starter-kit'), import('@tiptap/extension-text-align')])
      if (!alive || !host.current) return
      editor = new Editor({
        element: host.current,
        extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } } }), TextAlign.configure({ types: ['heading', 'paragraph'] })],
        content: html,
        editorProps: { attributes: { class: 'wysiwyg-body min-h-[420px] p-5 outline-none', 'aria-label': 'Rich text editor' } },
        onUpdate: ({ editor: e }: any) => { setHtml(e.getHTML()); setSourceDirty(false) },
        onSelectionUpdate: () => force((x) => x + 1),
        onTransaction: () => force((x) => x + 1),
      })
      ed.current = editor; setReady(true)
    })()
    return () => { alive = false; editor?.destroy() }
  }, [])

  const out = fmt ? pretty(html) : html
  useEffect(() => { if (!sourceDirty) setSource(out) }, [out, sourceDirty])
  const e = ed.current
  const chain = () => e.chain().focus()
  const is = (n: string, a?: any) => !!e?.isActive(n, a)
  const B = ({ on, active, label, children, disabled }: { on: () => void; active?: boolean; label: string; children: React.ReactNode; disabled?: boolean }) => (
    <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={on} disabled={disabled} aria-label={label} title={label} aria-pressed={active} className={cn('grid size-8 place-items-center rounded-lg transition disabled:opacity-40', active ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}>{children}</button>
  )
  const setLink = () => {
    const prev = e.getAttributes('link').href ?? ''
    const url = window.prompt('Link address (leave empty to remove)', prev)
    if (url === null) return
    if (!url) chain().extendMarkRange('link').unsetLink().run()
    else chain().extendMarkRange('link').setLink({ href: /^(https?:|mailto:|tel:|#|\/)/.test(url) ? url : 'https://' + url }).run()
  }
  const applySource = () => { try { e.commands.setContent(source, { emitUpdate: true }); setSourceDirty(false); toast('HTML loaded into the editor') } catch (err: any) { toast(err.message, 'error') } }

  return (
    <div className="space-y-3">
      <style>{`.wysiwyg-body h1{font-size:1.9em;font-weight:700;margin:.6em 0 .3em}.wysiwyg-body h2{font-size:1.5em;font-weight:700;margin:.6em 0 .3em}.wysiwyg-body h3{font-size:1.2em;font-weight:600;margin:.6em 0 .3em}.wysiwyg-body p{margin:.5em 0;line-height:1.65}.wysiwyg-body ul{list-style:disc;padding-left:1.5em}.wysiwyg-body ol{list-style:decimal;padding-left:1.5em}.wysiwyg-body blockquote{border-left:3px solid var(--accent);padding-left:1em;color:var(--muted);margin:.8em 0}.wysiwyg-body pre{background:var(--surface-2);padding:.8em 1em;border-radius:.6em;font-family:var(--font-mono);font-size:.9em;overflow:auto}.wysiwyg-body code{background:var(--surface-2);padding:.1em .35em;border-radius:.3em;font-family:var(--font-mono);font-size:.9em}.wysiwyg-body pre code{background:none;padding:0}.wysiwyg-body a{color:var(--accent);text-decoration:underline}.wysiwyg-body hr{border:0;border-top:1px solid var(--border);margin:1.2em 0}.wysiwyg-body p.is-editor-empty:first-child::before{content:'Start typing';color:var(--muted);float:left;height:0;pointer-events:none}`}</style>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={view} onChange={setView} options={[{ value: 'split', label: 'Editor and HTML' }, { value: 'editor', label: 'Editor only' }, { value: 'source', label: 'HTML only' }]} />
        <Switch checked={fmt} onChange={setFmt} label="Indent HTML" />
        <div className="ml-auto flex gap-1">
          <OpenFileButton accept=".html,.htm,text/html" onText={(t) => { const body = t.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? t; e?.commands.setContent(body, { emitUpdate: true }) }} label="Open HTML" />
          <Button size="sm" variant="ghost" onClick={() => e?.commands.clearContent(true)}>Clear</Button>
        </div>
      </div>
      <div className={cn('grid gap-4', view === 'split' && 'lg:grid-cols-2')}>
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface', view === 'source' && 'hidden')}>
          <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2/40 p-1.5" role="toolbar" aria-label="Formatting">
            {!ready ? <Spinner label="Loading editor…" /> : <>
              <B label="Undo" on={() => chain().undo().run()} disabled={!e.can().undo()}><Undo2 className="size-4" /></B>
              <B label="Redo" on={() => chain().redo().run()} disabled={!e.can().redo()}><Redo2 className="size-4" /></B>
              <span className="mx-1 h-5 w-px bg-border" />
              <B label="Paragraph" active={is('paragraph')} on={() => chain().setParagraph().run()}><Pilcrow className="size-4" /></B>
              <B label="Heading 1" active={is('heading', { level: 1 })} on={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 className="size-4" /></B>
              <B label="Heading 2" active={is('heading', { level: 2 })} on={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></B>
              <B label="Heading 3" active={is('heading', { level: 3 })} on={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className="size-4" /></B>
              <span className="mx-1 h-5 w-px bg-border" />
              <B label="Bold" active={is('bold')} on={() => chain().toggleBold().run()}><Bold className="size-4" /></B>
              <B label="Italic" active={is('italic')} on={() => chain().toggleItalic().run()}><Italic className="size-4" /></B>
              <B label="Underline" active={is('underline')} on={() => chain().toggleUnderline().run()}><Underline className="size-4" /></B>
              <B label="Strikethrough" active={is('strike')} on={() => chain().toggleStrike().run()}><Strikethrough className="size-4" /></B>
              <B label="Inline code" active={is('code')} on={() => chain().toggleCode().run()}><Code className="size-4" /></B>
              <B label={is('link') ? 'Edit link' : 'Add link'} active={is('link')} on={setLink}><Link2 className="size-4" /></B>
              {is('link') && <B label="Remove link" on={() => chain().unsetLink().run()}><Unlink className="size-4" /></B>}
              <span className="mx-1 h-5 w-px bg-border" />
              <B label="Bullet list" active={is('bulletList')} on={() => chain().toggleBulletList().run()}><List className="size-4" /></B>
              <B label="Numbered list" active={is('orderedList')} on={() => chain().toggleOrderedList().run()}><ListOrdered className="size-4" /></B>
              <B label="Quote" active={is('blockquote')} on={() => chain().toggleBlockquote().run()}><Quote className="size-4" /></B>
              <B label="Code block" active={is('codeBlock')} on={() => chain().toggleCodeBlock().run()}><SquareCode className="size-4" /></B>
              <B label="Divider" on={() => chain().setHorizontalRule().run()}><Minus className="size-4" /></B>
              <span className="mx-1 h-5 w-px bg-border" />
              <B label="Align left" active={e.isActive({ textAlign: 'left' })} on={() => chain().setTextAlign('left').run()}><AlignLeft className="size-4" /></B>
              <B label="Align center" active={e.isActive({ textAlign: 'center' })} on={() => chain().setTextAlign('center').run()}><AlignCenter className="size-4" /></B>
              <B label="Align right" active={e.isActive({ textAlign: 'right' })} on={() => chain().setTextAlign('right').run()}><AlignRight className="size-4" /></B>
              <B label="Justify" active={e.isActive({ textAlign: 'justify' })} on={() => chain().setTextAlign('justify').run()}><AlignJustify className="size-4" /></B>
              <B label="Clear formatting" on={() => chain().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="size-4" /></B>
            </>}
          </div>
          <div ref={host} className="scrollbar-thin max-h-[640px] overflow-auto" />
        </div>
        <Pane title="HTML" className={cn(view === 'editor' && 'hidden', 'min-h-[480px]')} actions={<>{sourceDirty && <Button size="sm" onClick={applySource}>Apply to editor</Button>}<CopyButton text={out} variant="ghost" /><DownloadButton text={() => `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Document</title>\n</head>\n<body>\n${out}</body>\n</html>\n`} filename="document.html" mime="text/html" /></>}>
          <CodeArea value={source} onChange={(v) => { setSource(v); setSourceDirty(true) }} minRows={22} />
        </Pane>
      </div>
      <p className="text-xs text-muted">Edit the HTML on the right and press Apply to load it back. Tags the editor does not support are simplified.</p>
    </div>
  )
}

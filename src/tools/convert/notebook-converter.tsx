import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileDown } from 'lucide-react'
import { Button, Dropzone, Field, Progress, Select, Switch, ToolGrid, useJob } from '@/components/ui'
import { baseName, downloadBlob, zipFiles } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { escapeHtml, sanitizeMarkup } from '@/lib/safe'
import { Tile } from '@/lib/b14/ui'
import { notebookToMd, notebookToScript, parseNotebook, scriptToNotebook, type Notebook } from '@/lib/b14/convert'

type Out = 'html' | 'md' | 'py' | 'pdf' | 'ipynb'
const NB_CSS = `body{font:14px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#1b1d21;background:#fff;max-width:900px;margin:0 auto;padding:24px}
.cell{margin:14px 0}.in{display:flex;gap:10px}.n{flex:0 0 52px;color:#8a8f98;font:12px monospace;text-align:right;padding-top:9px}.body{flex:1;min-width:0}
pre{margin:0;padding:10px 12px;border-radius:8px;overflow:auto;font:12.5px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
.code pre{background:#f6f5f1;border:1px solid #e7e4dc}.out pre{background:#fff;border-left:3px solid #14B8A6}.err pre{background:#fff4f2;border-left:3px solid #EF4444}
.out img{max-width:100%;margin:6px 0}.md h1,.md h2,.md h3{margin:.6em 0 .3em}.md table{border-collapse:collapse}.md td,.md th{border:1px solid #ddd;padding:3px 8px}
.hljs-keyword,.hljs-built_in{color:#B45309}.hljs-string{color:#047857}.hljs-number{color:#C2410C}.hljs-comment{color:#8a8f98}.hljs-title,.hljs-function{color:#0369A1}.hljs-literal{color:#0E7490}`

async function toHtml(nb: Notebook, title: string, outputs: boolean): Promise<string> {
  const { marked } = await import('marked')
  const hljs = (await import('highlight.js/lib/common')).default
  const lang = hljs.getLanguage(nb.language) ? nb.language : 'plaintext'
  const parts: string[] = []
  for (const c of nb.cells) {
    if (c.type === 'markdown') { parts.push(`<div class="cell md">${sanitizeMarkup(await marked.parse(c.source, { gfm: true }))}</div>`); continue }
    if (c.type === 'raw') { parts.push(`<div class="cell"><pre>${escapeHtml(c.source)}</pre></div>`); continue }
    const code = hljs.highlight(c.source, { language: lang, ignoreIllegals: true }).value
    let outs = ''
    if (outputs) for (const o of c.outputs) {
      if (o.kind === 'image' && o.data) outs += o.mime === 'image/svg+xml' ? `<img alt="Output" src="data:image/svg+xml;utf8,${encodeURIComponent(o.data)}">` : `<img alt="Output" src="data:${o.mime};base64,${o.data}">`
      else if (o.kind === 'html' && o.text) outs += `<div>${sanitizeMarkup(o.text)}</div>`
      else if (o.text) outs += `<div class="${o.kind === 'error' ? 'err' : ''}"><pre>${escapeHtml(o.text)}</pre></div>`
    }
    parts.push(`<div class="cell"><div class="in code"><div class="n">[${c.count ?? ' '}]</div><div class="body"><pre><code>${code}</code></pre></div></div>${outs ? `<div class="in out"><div class="n"></div><div class="body">${outs}</div></div>` : ''}</div>`)
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${NB_CSS}</style></head><body>${parts.join('\n')}</body></html>`
}

export default function NotebookConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [nb, setNb] = useState<Notebook | null>(null)
  const [script, setScript] = useState<string | null>(null)
  const [lang, setLang] = useState('python')
  const [out, setOut] = useState<Out>('html')
  const [outputs, setOutputs] = useState(true)
  const [html, setHtml] = useState('')
  const { busy, progress, error, run } = useJob()
  const open = (f: File) => run(async () => {
    const t = await f.text()
    if (/\.ipynb$/i.test(f.name) || t.trimStart().startsWith('{')) { setNb(parseNotebook(t)); setScript(null); setOut('html') }
    else { const l = /\.r$/i.test(f.name) ? 'r' : /\.jl$/i.test(f.name) ? 'julia' : /\.js$/i.test(f.name) ? 'javascript' : 'python'; setLang(l); setScript(t); setNb(parseNotebook(scriptToNotebook(t, l))); setOut('ipynb') }
    setFile(f)
  })
  const title = nb?.title || (file ? baseName(file.name) : 'Notebook')
  useEffect(() => { if (nb) toHtml(nb, title, outputs).then(setHtml) }, [nb, outputs])
  const stats = useMemo(() => nb ? { code: nb.cells.filter((c) => c.type === 'code').length, md: nb.cells.filter((c) => c.type === 'markdown').length, img: nb.cells.reduce((a, c) => a + c.outputs.filter((o) => o.kind === 'image').length, 0) } : null, [nb])

  const save = () => run(async (setP) => {
    if (!nb || !file) return
    const base = baseName(file.name)
    if (out === 'html') return downloadBlob(new Blob([html], { type: 'text/html' }), `${base}.html`)
    if (out === 'py') { const ext = { python: 'py', r: 'r', julia: 'jl', javascript: 'js' }[nb.language] ?? 'txt'; return downloadBlob(new Blob([notebookToScript(nb)], { type: 'text/plain' }), `${base}.${ext}`) }
    if (out === 'ipynb') return downloadBlob(new Blob([script != null ? scriptToNotebook(script, lang) : JSON.stringify(JSON.parse(await file.text()), null, 1)], { type: 'application/x-ipynb+json' }), `${base}.ipynb`)
    if (out === 'md') {
      const images: { name: string; data: string; mime: string }[] = []
      const md = notebookToMd(nb, { outputs, images })
      if (!images.length) return downloadBlob(new Blob([md], { type: 'text/markdown' }), `${base}.md`)
      const files = [{ name: `${base}.md`, data: md as string | Uint8Array }, ...images.map((im) => ({ name: im.name, data: im.mime === 'image/svg+xml' ? im.data : Uint8Array.from(atob(im.data), (c) => c.charCodeAt(0)) }))]
      return downloadBlob(await zipFiles(files), `${base}-markdown.zip`)
    }
    const { fromHtml } = await import('@/lib/b4/office')
    const body = html.replace(/^[\s\S]*<body>/, '').replace(/<\/body>[\s\S]*$/, '')
    downloadBlob(await fromHtml(`<style>${NB_CSS.replace(/body\{[^}]*\}/, '')}</style>${body}`, 'pdf', title, { onProgress: setP }), `${base}.pdf`)
  })

  if (!file || !nb) return <>
    <Dropzone accept=".ipynb,.py,.r,.jl,.js,.txt" onFiles={(f) => open(f[0])} label="Drop a Jupyter notebook (.ipynb)" sub="See it without Jupyter and save it as HTML, PDF, Markdown or a Python script. A .py file with # %% cells turns back into a notebook." />
    {error && <p className="mt-3 text-sm text-danger">{error}</p>}
  </>
  const outs: { value: Out; label: string }[] = script != null ? [{ value: 'ipynb', label: 'Notebook (.ipynb)' }, { value: 'html', label: 'HTML page' }, { value: 'md', label: 'Markdown' }] : [{ value: 'html', label: 'HTML page' }, { value: 'pdf', label: 'PDF' }, { value: 'md', label: 'Markdown' }, { value: 'py', label: 'Script with # %% cells' }]
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setNb(null) }} />
        {html ? <iframe title="Notebook preview" sandbox="" srcDoc={html} className="h-[70vh] w-full rounded-2xl border border-border bg-white" /> : <div className="h-[70vh] rounded-2xl skeleton" />}
      </>}
      side={<>
        {stats && <div className="grid grid-cols-3 gap-2"><Tile label="Code" value={stats.code} /><Tile label="Text" value={stats.md} /><Tile label="Charts" value={stats.img} /></div>}
        <p className="text-xs text-muted">Kernel: {nb.kernel}</p>
        <Field label="Save as"><Select value={out} onChange={setOut} options={outs} /></Field>
        {out !== 'py' && out !== 'ipynb' && <Switch checked={outputs} onChange={setOutputs} label="Include outputs and charts" />}
        {busy && <Progress value={progress} label="Saving" />}
        <Button size="lg" className="w-full" icon={out === 'ipynb' ? <BookOpen className="size-5" /> : <FileDown className="size-5" />} onClick={save} loading={busy}>Download</Button>
        <p className="text-xs text-muted">Nothing runs: the notebook is shown with the outputs saved in it. Scripts and widgets inside outputs are removed.</p>
      </>}
    />
  )
}

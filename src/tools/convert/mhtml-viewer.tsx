import { useEffect, useMemo, useState } from 'react'
import { Download, FileArchive, FileCode2, Globe, Image as ImageIcon, FileText } from 'lucide-react'
import { Button, Dropzone, Input, Segmented, ToolGrid, cn, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { sanitizeMarkup } from '@/lib/safe'
import { Tile } from '@/lib/b14/ui'
import { parseMhtml, partText, rewriteRefs, type Mht, type MhtPart } from '@/lib/b14/convert'

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s) }
const dataUrl = (p: MhtPart) => `data:${p.type || 'application/octet-stream'};base64,${b64(p.body)}`
const extFor = (p: MhtPart) => (p.location.split(/[?#]/)[0].split('/').pop()?.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? ({ 'text/html': 'html', 'text/css': 'css', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'font/woff2': 'woff2', 'application/javascript': 'js', 'text/javascript': 'js' } as Record<string, string>)[p.type] ?? 'bin')
const nameFor = (p: MhtPart, i: number) => { const n = p.location.split(/[?#]/)[0].split('/').pop() || ''; return (n && /\.[a-z0-9]{1,5}$/i.test(n) ? n : `part-${i + 1}.${extFor(p)}`).replace(/[^\w.\-]+/g, '_') }

/** One self-contained, script-free HTML file: every resource inlined as a data URL, CSS url() rewritten too. */
function buildPage(m: Mht): string {
  const root = m.parts[m.rootIndex]
  const urls = m.parts.map((p) => (p.type === 'text/css' ? `data:text/css;base64,${b64(new TextEncoder().encode(rewriteRefs(partText(p), m.parts, (i) => (m.parts[i].type === 'text/css' ? '' : dataUrl(m.parts[i])), p.location)))}` : dataUrl(p)))
  const raw = rewriteRefs(partText(root), m.parts, (i) => urls[i], root.location || m.from)
  // inline linked stylesheets as <style> so the sanitizer keeps them and sandboxed frames apply them
  const withCss = raw.replace(/<link\b[^>]*href=["']data:text\/css;base64,([^"']+)["'][^>]*>/gi, (_, d) => `<style>${new TextDecoder().decode(Uint8Array.from(atob(d), (c) => c.charCodeAt(0)))}</style>`)
  // drop refresh/redirect meta tags, repeating until none are left so a split tag cannot rebuild one
  let page = withCss, prev = ''
  while (page !== prev) { prev = page; page = page.replace(/<meta[^>]+http-equiv[^>]*>/gi, '') }
  return sanitizeMarkup(page)
}

export default function MhtmlViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [m, setM] = useState<Mht | null>(null)
  const [tab, setTab] = useState<'page' | 'parts' | 'text'>('page')
  const [q, setQ] = useState('')
  const { busy, error, run } = useJob()
  const open = (f: File) => run(async () => { const mh = parseMhtml(new Uint8Array(await f.arrayBuffer())); setM(mh); setFile(f) })
  const page = useMemo(() => (m ? buildPage(m) : ''), [m])
  const text = useMemo(() => { if (!page) return ''; const d = new DOMParser().parseFromString(page, 'text/html'); d.querySelectorAll('style,script,noscript').forEach((n) => n.remove()); return (d.body?.innerText || d.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim() }, [page])
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  useEffect(() => { if (!page) return; setFrameUrl(null); const id = setTimeout(() => setFrameUrl('ready'), 0); return () => clearTimeout(id) }, [page])
  const title = m?.subject || (file ? baseName(file.name) : '')
  const counts = useMemo(() => { const c = { img: 0, css: 0, font: 0, other: 0 }; m?.parts.forEach((p) => { if (p.type.startsWith('image/')) c.img++; else if (p.type === 'text/css') c.css++; else if (/font/.test(p.type)) c.font++; else c.other++ }); return c }, [m])

  if (!file || !m) return <>
    <Dropzone accept=".mhtml,.mht,.mhtm,message/rfc822" onFiles={(f) => open(f[0])} label="Drop an MHTML web archive" sub="Pages saved with Save as, Webpage single file (.mhtml or .mht). View them offline, pull out the pictures, or save a normal HTML file." />
    {busy && <p className="mt-3 text-sm text-muted">Reading archive</p>}
    {error && <p className="mt-3 text-sm text-danger">{error}</p>}
  </>
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setM(null) }} />
        <Segmented value={tab} onChange={setTab} options={[{ value: 'page', label: 'Page' }, { value: 'parts', label: `Files (${m.parts.length})` }, { value: 'text', label: 'Text' }]} />
        {tab === 'page' && (frameUrl ? <iframe title={title || 'Saved page'} sandbox="" srcDoc={page} className="h-[68vh] w-full rounded-2xl border border-border bg-white" /> : <div className="h-[68vh] rounded-2xl border border-border skeleton" />)}
        {tab === 'parts' && <>
          <Input placeholder="Filter files" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter files" />
          <div className="scrollbar-thin max-h-[60vh] divide-y divide-border overflow-auto rounded-2xl border border-border bg-surface">
            {m.parts.map((p, i) => ({ p, i })).filter(({ p }) => !q || (p.location + p.type).toLowerCase().includes(q.toLowerCase())).map(({ p, i }) => {
              const Icon = p.type.startsWith('image/') ? ImageIcon : p.type === 'text/html' ? Globe : p.type === 'text/css' ? FileCode2 : FileText
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {p.type.startsWith('image/') && p.type !== 'image/svg+xml' && p.body.length < 3_000_000 ? <img src={dataUrl(p)} alt="" className="size-10 shrink-0 rounded bg-white object-contain" /> : <Icon className={cn('size-5 shrink-0', i === m.rootIndex ? 'text-accent' : 'text-muted')} />}
                  <div className="min-w-0 flex-1"><div className="truncate">{nameFor(p, i)}{i === m.rootIndex && <span className="ml-2 text-xs text-accent">main page</span>}</div><div className="truncate text-xs text-muted">{p.type} · {formatBytes(p.body.length)}{p.location ? ` · ${p.location}` : ''}</div></div>
                  <Button size="sm" variant="ghost" aria-label={`Download ${nameFor(p, i)}`} icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([p.body as BlobPart], { type: p.type }), nameFor(p, i))} />
                </div>
              )
            })}
          </div>
        </>}
        {tab === 'text' && <pre className="scrollbar-thin max-h-[68vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-border bg-surface p-4 text-sm">{text || 'No text on this page.'}</pre>}
      </>}
      side={<>
        <div className="rounded-xl border border-border bg-surface px-3 py-2"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Page</div><div className="line-clamp-2 font-medium">{title || 'Untitled'}</div>{m.from && <div className="truncate text-xs text-muted" title={m.from}>{m.from}</div>}{m.date && <div className="text-xs text-muted">Saved {m.date}</div>}</div>
        <div className="grid grid-cols-2 gap-2"><Tile label="Pictures" value={counts.img} /><Tile label="Styles" value={counts.css} /><Tile label="Fonts" value={counts.font} /><Tile label="Other" value={counts.other} /></div>
        <Button className="w-full" icon={<Globe className="size-4" />} onClick={() => downloadBlob(new Blob([page.startsWith('<!') || page.startsWith('<html') ? page : `<!doctype html><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>${page}`], { type: 'text/html' }), `${baseName(file.name)}.html`)}>Save as one HTML file</Button>
        <Button className="w-full" variant="outline" icon={<FileArchive className="size-4" />} onClick={async () => downloadBlob(await zipFiles(m.parts.map((p, i) => ({ name: (p.type.startsWith('image/') ? 'images/' : p.type === 'text/css' ? 'css/' : i === m.rootIndex ? '' : 'other/') + (i === m.rootIndex ? 'index.html' : nameFor(p, i)), data: p.body }))), `${baseName(file.name)}-files.zip`)}>All files as ZIP</Button>
        <Button className="w-full" variant="outline" icon={<ImageIcon className="size-4" />} disabled={!counts.img} onClick={async () => downloadBlob(await zipFiles(m.parts.filter((p) => p.type.startsWith('image/')).map((p, i) => ({ name: nameFor(p, i), data: p.body }))), `${baseName(file.name)}-images.zip`)}>Pictures only (ZIP)</Button>
        <p className="text-xs text-muted">Scripts are removed and the page is shown in a locked frame, so nothing in it can run or load from the web.</p>
      </>}
    />
  )
}

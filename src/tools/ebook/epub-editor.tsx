import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Save, ImagePlus, Combine, X, GripVertical, ImageIcon } from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, Slider, Switch, Tabs, Textarea, ToolGrid, ResultCard, ErrorNote } from '@/components/ui'
import { baseName } from '@/lib/files'
import { TopBar, StatusLine } from '@/lib/b4/ui'
import type JSZipType from 'jszip'

interface Meta { title: string; author: string; language: string; publisher: string; description: string; series: string; seriesIndex: string; subjects: string; date: string }
interface Opened { zip: JSZipType; opfPath: string; opf: Document; coverPath?: string; coverType?: string }

const DC = 'http://purl.org/dc/elements/1.1/'
const OPF = 'http://www.idpf.org/2007/opf'
const resolve = (base: string, rel: string) => { const parts = base.split('/').slice(0, -1).concat(decodeURIComponent(rel).split('/')); const out: string[] = []; for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p) } return out.join('/') }
const byLocal = (d: Document | Element, n: string) => Array.from(d.getElementsByTagNameNS('*', n))

async function openEpubZip(file: Blob): Promise<Opened & { meta: Meta }> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file).catch(() => { throw new Error('This is not a valid EPUB file.') })
  const c = await zip.file('META-INF/container.xml')?.async('string')
  const opfPath = c ? byLocal(new DOMParser().parseFromString(c, 'application/xml'), 'rootfile')[0]?.getAttribute('full-path') : null
  if (!opfPath) throw new Error('EPUB container is missing its package file.')
  const opf = new DOMParser().parseFromString((await zip.file(opfPath)?.async('string')) ?? '', 'application/xml')
  if (opf.querySelector('parsererror')) throw new Error('The EPUB package file is damaged.')
  const items = byLocal(opf, 'item')
  let cover = items.find((i) => (i.getAttribute('properties') || '').split(/\s+/).includes('cover-image'))
  if (!cover) { const id = byLocal(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content'); cover = items.find((i) => i.getAttribute('id') === id) }
  const t = (n: string) => byLocal(opf, n)[0]?.textContent?.trim() ?? ''
  const metaAttr = (name: string) => byLocal(opf, 'meta').find((m) => m.getAttribute('name') === name)?.getAttribute('content') ?? ''
  const meta: Meta = {
    title: t('title'), author: byLocal(opf, 'creator').map((e) => e.textContent?.trim()).filter(Boolean).join(', '), language: t('language'), publisher: t('publisher'),
    description: t('description').replace(/<[^>]+>/g, ''), series: metaAttr('calibre:series') || (byLocal(opf, 'meta').find((m) => m.getAttribute('property') === 'belongs-to-collection')?.textContent ?? ''),
    seriesIndex: metaAttr('calibre:series_index'), subjects: byLocal(opf, 'subject').map((e) => e.textContent?.trim()).filter(Boolean).join(', '), date: t('date').slice(0, 10),
  }
  return { zip, opfPath, opf, meta, coverPath: cover ? resolve(opfPath, cover.getAttribute('href') || '') : undefined, coverType: cover?.getAttribute('media-type') || undefined }
}

function setDc(opf: Document, name: string, values: string[]) {
  const md = byLocal(opf, 'metadata')[0]
  byLocal(md, name).filter((e) => e.namespaceURI === DC).forEach((e) => e.remove())
  for (const v of values.filter(Boolean)) { const el = opf.createElementNS(DC, 'dc:' + name); el.textContent = v; md.appendChild(el) }
}
function setMeta(opf: Document, name: string, value: string) {
  const md = byLocal(opf, 'metadata')[0]
  byLocal(md, 'meta').filter((m) => m.getAttribute('name') === name).forEach((m) => m.remove())
  if (value) { const el = opf.createElementNS(OPF, 'meta'); el.setAttribute('name', name); el.setAttribute('content', value); md.appendChild(el) }
}

async function toImage(blob: Blob, type: string, maxW = 0, q = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const s = maxW && bmp.width > maxW ? maxW / bmp.width : 1
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  const ctx = c.getContext('2d')!
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) }
  ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close()
  return new Promise((r) => c.toBlob((b) => r(b!), type, q))
}

async function packEpub(zip: JSZipType): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const out = new JSZip()
  out.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  for (const [p, f] of Object.entries(zip.files)) { if (p === 'mimetype' || f.dir) continue; out.file(p, await f.async('uint8array')) }
  return out.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 9 } })
}

function EditTab() {
  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<Opened | null>(null)
  const [meta, setMetaState] = useState<Meta | null>(null)
  const [cover, setCover] = useState<Blob | null>(null)
  const [newCover, setNewCover] = useState<File | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [compress, setCompress] = useState(false)
  const [maxW, setMaxW] = useState(1200)
  const [q, setQ] = useState(75)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)

  useEffect(() => { const b = newCover ?? cover; if (!b) { setCoverUrl(null); return } const u = URL.createObjectURL(b); setCoverUrl(u); return () => URL.revokeObjectURL(u) }, [cover, newCover])
  const open = async (f: File) => {
    setFile(f); setError(null); setResult(null); setNewCover(null)
    try {
      const o = await openEpubZip(f); setBook(o); setMetaState(o.meta)
      setCover(o.coverPath ? (await o.zip.file(o.coverPath)?.async('blob')) ?? null : null)
    } catch (e: any) { setError(e?.message || 'Could not open this EPUB.') }
  }
  const save = async () => {
    if (!book || !meta || !file) return
    setBusy(true); setError(null); setResult(null)
    try {
      const { zip, opf, opfPath } = book
      setStatus('Updating details')
      setDc(opf, 'title', [meta.title]); setDc(opf, 'creator', meta.author.split(/\s*[,;&]\s*/))
      setDc(opf, 'language', [meta.language || 'en']); setDc(opf, 'publisher', [meta.publisher]); setDc(opf, 'description', [meta.description])
      setDc(opf, 'subject', meta.subjects.split(/\s*,\s*/)); if (meta.date) setDc(opf, 'date', [meta.date])
      setMeta(opf, 'calibre:series', meta.series); setMeta(opf, 'calibre:series_index', meta.series ? meta.seriesIndex : '')
      if (newCover) {
        setStatus('Replacing cover')
        if (book.coverPath) {
          const type = /png/.test(book.coverType || '') ? 'image/png' : 'image/jpeg'
          zip.file(book.coverPath, await toImage(newCover, type, 0, 0.92))
        } else {
          const href = 'openfile-cover.jpg'
          zip.file(resolve(opfPath, href), await toImage(newCover, 'image/jpeg', 0, 0.92))
          const item = opf.createElementNS(OPF, 'item'); item.setAttribute('id', 'openfile-cover'); item.setAttribute('href', href); item.setAttribute('media-type', 'image/jpeg')
          if ((byLocal(opf, 'package')[0]?.getAttribute('version') || '').startsWith('3')) item.setAttribute('properties', 'cover-image')
          byLocal(opf, 'manifest')[0].appendChild(item); setMeta(opf, 'cover', 'openfile-cover')
        }
      }
      if (compress) {
        const imgs = byLocal(opf, 'item').filter((i) => /image\/(jpeg|png)/.test(i.getAttribute('media-type') || ''))
        for (let i = 0; i < imgs.length; i++) {
          const path = resolve(opfPath, imgs[i].getAttribute('href') || ''); const f = zip.file(path); if (!f) continue
          setStatus(`Compressing image ${i + 1} of ${imgs.length}`)
          const orig = await f.async('blob')
          try { const type = imgs[i].getAttribute('media-type')!; const next = await toImage(orig, type, maxW, q / 100); if (next.size < orig.size) zip.file(path, next) } catch { /* keep original */ }
        }
      }
      let xml = new XMLSerializer().serializeToString(opf)
      if (!xml.startsWith('<?xml')) xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml
      zip.file(opfPath, xml)
      setStatus('Packing EPUB')
      setResult(await packEpub(zip))
    } catch (e: any) { setError(e?.message || 'Could not save the EPUB.') } finally { setBusy(false) }
  }

  if (!file) return <Dropzone accept=".epub" onFiles={(f) => open(f[0])} label="Drop an EPUB to edit" sub="Change the cover, title, author, series and description, or shrink the images inside." />
  const m = meta
  const upd = (k: keyof Meta) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMetaState((x) => (x ? { ...x, [k]: e.target.value } : x))
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { setFile(null); setBook(null); setMetaState(null); setResult(null) }} />
        <ErrorNote error={error} />
        {m && <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <div className="grid aspect-[2/3] place-items-center overflow-hidden rounded-xl border border-border bg-surface-2">{coverUrl ? <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" /> : <ImageIcon className="size-8 text-muted" />}</div>
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border px-2 py-2 text-xs font-medium hover:border-accent"><ImagePlus className="size-4" />New cover<input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setNewCover(f); e.target.value = '' }} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" className="sm:col-span-2"><Input value={m.title} onChange={upd('title')} /></Field>
            <Field label="Author(s)" hint="comma separated"><Input value={m.author} onChange={upd('author')} /></Field>
            <Field label="Language"><Input value={m.language} onChange={upd('language')} placeholder="en" /></Field>
            <Field label="Series"><Input value={m.series} onChange={upd('series')} /></Field>
            <Field label="Number in series"><Input value={m.seriesIndex} onChange={upd('seriesIndex')} inputMode="decimal" /></Field>
            <Field label="Publisher"><Input value={m.publisher} onChange={upd('publisher')} /></Field>
            <Field label="Publish date"><Input type="date" value={m.date} onChange={upd('date')} /></Field>
            <Field label="Tags" hint="comma separated" className="sm:col-span-2"><Input value={m.subjects} onChange={upd('subjects')} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={m.description} onChange={upd('description')} className="min-h-24 font-sans" /></Field>
          </div>
        </div>}
        {busy && <StatusLine text={status} />}
        {result && <ResultCard blob={result} filename={`${baseName(file.name)}-edited.epub`} originalSize={file.size} onReset={() => setResult(null)} />}
      </>}
      side={<>
        <Switch checked={compress} onChange={setCompress} label="Compress images inside" />
        {compress && <><Slider label="Max image width" value={maxW} onChange={setMaxW} min={600} max={2400} step={100} suffix=" px" /><Slider label="JPEG quality" value={q} onChange={setQ} min={40} max={95} suffix="%" /></>}
        <Button size="lg" className="w-full" icon={<Save className="size-5" />} onClick={save} loading={busy} disabled={!m}>Save EPUB</Button>
        <p className="text-xs text-muted">Only the details you change are touched. Chapters, styles and fonts stay exactly as they were.</p>
      </>}
    />
  )
}

function MergeTab() {
  const [files, setFiles] = useState<File[]>([])
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  const merge = async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      const { loadBook, writeEpub } = await import('@/lib/b4/book')
      const images = new Map<string, Blob>(); const chapters: { title: string; html: string }[] = []
      let cover: Blob | undefined; let lang = 'en'
      for (let i = 0; i < files.length; i++) {
        setStatus(`Reading ${files[i].name}`)
        const b = await loadBook(files[i])
        if (i === 0) { cover = b.cover; lang = b.language; if (!title) setTitle(b.title) }
        const prefix = `b${i + 1}-`
        for (const [n, blob] of b.images) images.set(prefix + n, blob)
        b.chapters.forEach((c, j) => chapters.push({ title: j === 0 && files.length > 1 ? `${b.title}: ${c.title}` : c.title, html: c.html.replace(/src="images\//g, `src="images/${prefix}`) }))
      }
      setStatus('Writing EPUB')
      setResult(await writeEpub({ title: title || 'Merged book', author, language: lang, chapters, images, cover }))
    } catch (e: any) { setError(e?.message || 'Could not merge these books.') } finally { setBusy(false) }
  }
  const move = (from: number, to: number) => setFiles((l) => { const x = [...l]; const [it] = x.splice(from, 1); x.splice(to, 0, it); return x })

  if (!files.length) return <Dropzone multiple accept=".epub,.mobi,.azw3,.fb2" onFiles={setFiles} label="Drop two or more e-books to merge" sub="They are joined in order into one EPUB with a combined table of contents." />
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><Label className="mb-0">{files.length} books, in this order</Label><Button variant="ghost" size="sm" onClick={() => { setFiles([]); setResult(null) }}>Start over</Button></div>
        <div className="space-y-2">
          <AnimatePresence initial={false}>{files.map((f, i) => (
            <motion.div key={f.name + i} layout draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { move(drag, i); setDrag(i) } }} onDragEnd={() => setDrag(null)}
              className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
              <GripVertical className="size-4 cursor-grab text-muted" /><span className="w-6 font-mono text-xs text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button className="cursor-pointer rounded px-1.5 text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up">↑</button>
              <button className="cursor-pointer rounded px-1.5 text-muted hover:text-fg disabled:opacity-30" disabled={i === files.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down">↓</button>
              <button className="cursor-pointer rounded p-1 text-muted hover:text-danger" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label="Remove"><X className="size-4" /></button>
            </motion.div>))}</AnimatePresence>
        </div>
        <Dropzone compact multiple accept=".epub,.mobi,.azw3,.fb2" onFiles={(f) => setFiles((l) => [...l, ...f])} label="Add more books" />
        {busy && <StatusLine text={status} />}
        <ErrorNote error={error} />
        {result && <ResultCard blob={result} filename={`${(title || 'merged').replace(/[\\/:*?"<>|]/g, '')}.epub`} onReset={() => setResult(null)} />}
      </>}
      side={<>
        <Field label="Title of the merged book"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Taken from the first book" /></Field>
        <Field label="Author"><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
        <Button size="lg" className="w-full" icon={<Combine className="size-5" />} onClick={merge} loading={busy} disabled={files.length < 2}>Merge {files.length} books</Button>
        <p className="text-xs text-muted">The cover of the first book is used. Images are kept, publisher styles are simplified.</p>
      </>}
    />
  )
}

export default function EpubEditor() {
  const [tab, setTab] = useState<'edit' | 'merge'>('edit')
  return <div className="space-y-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'edit', label: 'Edit details and cover' }, { value: 'merge', label: 'Merge books' }]} />{tab === 'edit' ? <EditTab /> : <MergeTab />}</div>
}

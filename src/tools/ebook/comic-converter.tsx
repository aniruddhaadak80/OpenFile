import { useEffect, useState } from 'react'
import { BookImage, RefreshCw } from 'lucide-react'
import { Button, Dropzone, Label, Select, Slider, Switch, ToolGrid, ResultCard, ErrorNote, Progress, cn } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { extractArchive, createArchive, cancelArchive, PasswordError } from '@/lib/b4/archive'
import { TopBar, StatusLine } from '@/lib/b4/ui'
import { Stat } from '@/tools/video/_media/ui'

type Page = { name: string; blob: Blob }
type Out = 'cbz' | 'pdf' | 'cb7' | 'zip'
const IMG = /\.(jpe?g|png|gif|webp|avif|bmp)$/i
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' }
/** Natural sort so page2 comes before page10. */
export const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

async function readPages(file: File, onStatus: (s: string, p?: number) => void): Promise<Page[]> {
  if (/\.pdf$/i.test(file.name)) {
    const { openPdfJs, renderPage } = await import('@/lib/pdf')
    const pdf = await openPdfJs(file)
    const pages: Page[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      onStatus(`Rendering page ${i} of ${pdf.numPages}`, i / pdf.numPages)
      const c = await renderPage(pdf, i, 2)
      pages.push({ name: `page-${String(i).padStart(4, '0')}.jpg`, blob: await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9)) })
    }
    return pages
  }
  onStatus('Unpacking')
  const { files } = await extractArchive(file, file.name.replace(/\.cbz$/i, '.zip').replace(/\.cbr$/i, '.rar').replace(/\.cb7$/i, '.7z').replace(/\.cbt$/i, '.tar'), { onStatus: (s) => onStatus(s) })
  const imgs = files.filter((f) => IMG.test(f.path) && !/(^|\/)(__MACOSX|\.)/.test(f.path)).sort((a, b) => naturalSort(a.path, b.path))
  if (!imgs.length) throw new Error('No page images were found inside this comic.')
  return imgs.map((f) => ({ name: f.path.split('/').pop()!, blob: new Blob([f.data as BlobPart], { type: MIME[f.path.split('.').pop()!.toLowerCase()] || 'image/jpeg' }) }))
}

async function recompress(p: Page, maxW: number, q: number, gray: boolean, type: 'image/jpeg' | 'image/webp'): Promise<Page> {
  const bmp = await createImageBitmap(p.blob)
  const s = maxW && bmp.width > maxW ? maxW / bmp.width : 1
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
  const ctx = c.getContext('2d')!
  if (gray) ctx.filter = 'grayscale(1)'
  ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close()
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, q))
  return { name: baseName(p.name) + (type === 'image/webp' ? '.webp' : '.jpg'), blob }
}

export default function ComicConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [pages, setPages] = useState<Page[] | null>(null)
  const [thumbs, setThumbs] = useState<string[]>([])
  const [out, setOut] = useState<Out>('pdf')
  const [shrink, setShrink] = useState(false)
  const [maxW, setMaxW] = useState(1600)
  const [q, setQ] = useState(80)
  const [gray, setGray] = useState(false)
  const [webp, setWebp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [p, setP] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)

  useEffect(() => {
    if (!pages) { setThumbs([]); return }
    const urls = pages.slice(0, 24).map((x) => URL.createObjectURL(x.blob)); setThumbs(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [pages])

  const open = async (f: File) => {
    setFile(f); setPages(null); setResult(null); setError(null); setBusy(true)
    try { const pg = await readPages(f, (s, x) => { setStatus(s); if (x != null) setP(x) }); setPages(pg); setOut(/\.pdf$/i.test(f.name) ? 'cbz' : 'pdf') }
    catch (e: any) { setError(e instanceof PasswordError ? 'This comic is locked with a password, which is not supported here.' : e?.message || 'Could not open this comic.') }
    finally { setBusy(false) }
  }

  const convert = async () => {
    if (!pages || !file) return
    setBusy(true); setError(null); setResult(null); setP(0)
    try {
      let list = pages
      if (shrink || gray) {
        const done: Page[] = []
        for (let i = 0; i < pages.length; i++) { setStatus(`Optimizing page ${i + 1} of ${pages.length}`); setP(i / pages.length); done.push(await recompress(pages[i], shrink ? maxW : 0, q / 100, gray, webp && out !== 'pdf' ? 'image/webp' : 'image/jpeg')) }
        list = done
      }
      const name = baseName(file.name)
      if (out === 'pdf') {
        const { PDFDocument } = await import('pdf-lib')
        const doc = await PDFDocument.create(); doc.setTitle(name)
        for (let i = 0; i < list.length; i++) {
          setStatus(`Adding page ${i + 1} of ${list.length}`); setP(i / list.length)
          let pg = list[i]
          if (!/jpe?g|png/.test(pg.blob.type)) pg = await recompress(pg, 0, 0.9, false, 'image/jpeg')
          const bytes = new Uint8Array(await pg.blob.arrayBuffer())
          const img = /png/.test(pg.blob.type) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
          const page = doc.addPage([img.width * 0.75, img.height * 0.75])
          page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
        }
        setResult({ blob: new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }), name: name + '.pdf' })
      } else {
        setStatus('Packing pages')
        const width = String(list.length).length
        const files = await Promise.all(list.map(async (x, i) => ({ path: `${String(i + 1).padStart(Math.max(3, width), '0')}${x.name.slice(x.name.lastIndexOf('.'))}`, data: new Uint8Array(await x.blob.arrayBuffer()) })))
        if (out === 'cb7') setResult({ blob: await createArchive(files, '7z', { level: 5, onStatus: setStatus }), name: name + '.cb7' })
        else {
          const { zipSync } = await import('fflate')
          const tree: Record<string, [Uint8Array, { level: 0 }]> = {}
          files.forEach((f) => { tree[f.path] = [f.data, { level: 0 }] })
          setResult({ blob: new Blob([zipSync(tree) as BlobPart], { type: 'application/zip' }), name: name + (out === 'cbz' ? '.cbz' : '-pages.zip') })
        }
      }
    } catch (e: any) { setError(e?.message || 'Conversion failed.') } finally { setBusy(false) }
  }

  if (!file) return <Dropzone accept=".cbz,.cbr,.cb7,.cbt,.zip,.rar,.7z,.pdf" onFiles={(f) => open(f[0])} label="Drop a comic book" sub="CBZ, CBR, CB7, CBT or PDF. Convert to PDF, CBZ, CB7 or a ZIP of images, and shrink big comics." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { if (busy) cancelArchive(); setFile(null); setPages(null); setResult(null) }} />
        {busy && <StatusLine text={status} progress={p} />}
        <ErrorNote error={error} />
        {pages && <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{thumbs.map((u, i) => <div key={i} className="overflow-hidden rounded-lg border border-border bg-surface-2"><img src={u} alt={`Page ${i + 1}`} className="aspect-[2/3] w-full object-cover" loading="lazy" /></div>)}</div>}
        {pages && pages.length > 24 && <p className="text-xs text-muted">Showing the first 24 of {pages.length} pages.</p>}
        {result && <ResultCard blob={result.blob} filename={result.name} originalSize={file.size} onReset={() => setResult(null)} />}
      </>}
      side={<>
        {pages && <div className="grid grid-cols-2 gap-2"><Stat label="Pages" value={pages.length} /><Stat label="Size" value={formatBytes(file.size)} /></div>}
        <div><Label>Convert to</Label><div className="grid grid-cols-2 gap-2">{([['pdf', 'PDF'], ['cbz', 'CBZ'], ['cb7', 'CB7'], ['zip', 'Images (ZIP)']] as [Out, string][]).map(([v, l]) => <button key={v} onClick={() => setOut(v)} className={cn('rounded-xl border px-2 py-2 text-sm font-medium transition cursor-pointer', out === v ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/50')}>{l}</button>)}</div></div>
        <Switch checked={shrink} onChange={setShrink} label="Shrink pages (smaller file)" />
        {shrink && <>
          <div><Label>Max page width</Label><Select value={String(maxW)} onChange={(v) => setMaxW(+v)} options={[{ value: '1024', label: '1024 px (phone)' }, { value: '1440', label: '1440 px (tablet)' }, { value: '1600', label: '1600 px' }, { value: '2048', label: '2048 px (HD)' }]} /></div>
          <Slider label="Quality" value={q} onChange={setQ} min={40} max={95} suffix="%" />
          {out !== 'pdf' && <Switch checked={webp} onChange={setWebp} label="Use WebP (even smaller)" />}
        </>}
        <Switch checked={gray} onChange={setGray} label="Grayscale (for e-ink readers)" />
        <Button size="lg" className="w-full" icon={<RefreshCw className="size-5" />} disabled={!pages || busy} loading={busy && !!pages} onClick={convert}>Convert</Button>
        {busy && pages && <Progress value={p} />}
        <p className="flex gap-1.5 text-xs text-muted"><BookImage className="size-4 shrink-0" />Pages keep their reading order. Files never leave your device.</p>
      </>}
    />
  )
}

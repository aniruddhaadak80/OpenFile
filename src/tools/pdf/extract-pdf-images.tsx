import { useEffect, useMemo, useState } from 'react'
import { Images, Download, Archive, Check } from 'lucide-react'
import { Button, Dropzone, ToolGrid, Progress, ErrorNote, Slider, Switch, Empty, Badge, cn, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { readBytes, Note } from './_b1/ui'
import type { ExtractResult } from './_b1/images'

const MIME = { jpg: 'image/jpeg', png: 'image/png', jp2: 'image/jp2' } as const

export default function ExtractPdfImages() {
  const [file, setFile] = useState<File | null>(null)
  const [res, setRes] = useState<ExtractResult | null>(null)
  const [minSize, setMinSize] = useState(32)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [pagesInName, setPagesInName] = useState(true)
  const job = useJob()
  const reset = () => { setFile(null); setRes(null); setSel(new Set()) }

  useEffect(() => {
    if (!file) return
    job.run(async (setP) => {
      const { extractImages } = await import('./_b1/images')
      const r = await extractImages(await readBytes(file), { minSize: 1, onProgress: setP })
      setRes(r); setSel(new Set(r.images.map((i) => i.id)))
      if (!r.images.length) toast('No embedded images found', 'info')
    })
  }, [file]) // eslint-disable-line

  const shown = useMemo(() => (res?.images ?? []).filter((i) => i.w >= minSize && i.h >= minSize), [res, minSize])
  const urls = useMemo(() => new Map(shown.filter((i) => i.ext !== 'jp2').map((i) => [i.id, URL.createObjectURL(new Blob([i.data as BlobPart], { type: MIME[i.ext] }))])), [shown])
  useEffect(() => () => { for (const u of urls.values()) URL.revokeObjectURL(u) }, [urls])
  const chosen = shown.filter((i) => sel.has(i.id))
  const nameOf = (i: (typeof shown)[number], k: number) => pagesInName ? i.name : `image-${String(k + 1).padStart(3, '0')}.${i.ext}`
  const zip = async () => downloadBlob(await zipFiles(chosen.map((i, k) => ({ name: nameOf(i, k), data: i.data }))), `${baseName(file!.name)}-images.zip`)
  const toggle = (id: string) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s) }

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to pull out its images" />
  return (
    <div className="space-y-4">
      <FileBar file={file} onReset={reset} />
      <ToolGrid
        main={<div className="space-y-3">
          {job.busy && <Progress value={job.progress} label="Finding images…" />}
          <ErrorNote error={job.error} />
          {res && !shown.length && <Empty>No images at or above this size. Photos drawn as vector shapes or text cannot be extracted as images. Try PDF to Image to export whole pages.</Empty>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {shown.map((i, k) => (
              <div key={i.id} className={cn('group relative overflow-hidden rounded-xl border-2 bg-surface transition', sel.has(i.id) ? 'border-accent' : 'border-border')}>
                <button type="button" onClick={() => toggle(i.id)} aria-pressed={sel.has(i.id)} aria-label={`Select ${i.name}`} className="checker block aspect-square w-full cursor-pointer">
                  {urls.get(i.id) ? <img src={urls.get(i.id)} alt="" className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center text-xs text-muted">JPEG 2000<br />(no preview)</div>}
                </button>
                {sel.has(i.id) && <div className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-on-accent shadow"><Check className="size-3.5" /></div>}
                <div className="flex items-center gap-1 p-2 text-[11px]">
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{i.w} × {i.h}</div><div className="truncate text-muted">{i.ext.toUpperCase()} · {formatBytes(i.data.length)} · p.{i.pages.map((p) => p + 1).join(',')}</div></div>
                  <button type="button" onClick={() => downloadBlob(new Blob([i.data as BlobPart], { type: MIME[i.ext] }), nameOf(i, k))} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-accent cursor-pointer" aria-label={`Download ${i.name}`}><Download className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>}
        side={<>
          {res && <div className="text-sm"><span className="font-mono text-2xl font-bold">{shown.length}</span> <span className="text-muted">images · {chosen.length} selected</span></div>}
          <Slider label="Skip images smaller than" value={minSize} min={1} max={400} onChange={setMinSize} suffix=" px" />
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSel(new Set(shown.map((i) => i.id)))}>Select all</Button><Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>None</Button></div>
          <Switch checked={pagesInName} onChange={setPagesInName} label="Put page numbers in file names" />
          {res?.skipped.filter((s) => s.reason !== 'smaller than the size limit').map((s) => <div key={s.reason} className="text-xs text-warn"><Badge color="var(--color-warn)">SKIPPED</Badge> {s.count} image{s.count > 1 ? 's' : ''} using {s.reason}. Use PDF to Image for those pages.</div>)}
          <Note>JPEG photos are saved byte for byte, exactly as stored in the PDF. Other images are saved as lossless PNG, with transparency kept. Each image appears once even if it is used on many pages.</Note>
          <Button className="w-full" size="lg" icon={<Archive className="size-5" />} disabled={!chosen.length} onClick={zip}>Download {chosen.length || ''} as ZIP</Button>
          <div className="flex items-center justify-center gap-1 text-xs text-muted"><Images className="size-3" />Nothing is uploaded.</div>
        </>}
      />
    </div>
  )
}

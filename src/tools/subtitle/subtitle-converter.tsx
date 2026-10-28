import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Download, X, Archive, Plus, Check, AlertCircle, Captions } from 'lucide-react'
import { Button, Dropzone, Label, Select, Switch, ToolGrid, Input, cn } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, zipFiles } from '@/lib/files'
import { parseSubtitles, writeSubtitles, SUB_FORMATS, SUB_ACCEPT, subExt, subMime, type SubFormat, type SubDoc } from '@/lib/b4/subtitles'
import { readTextFile, ENCODINGS } from '@/lib/b4/text'

type Item = { id: string; file: File; doc?: SubDoc; error?: string; encoding?: string }

export default function SubtitleConverter() {
  const [items, setItems] = useState<Item[]>([])
  const [to, setTo] = useState<SubFormat>('vtt')
  const [enc, setEnc] = useState('auto')
  const [fps, setFps] = useState('23.976')
  const [strip, setStrip] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const load = async (list: Item[], encoding: string) => Promise.all(list.map(async (it) => {
    try {
      const { text, encoding: used } = await readTextFile(it.file, encoding)
      return { ...it, doc: parseSubtitles(text, { name: it.file.name, fps: +fps || 23.976 }), error: undefined, encoding: used }
    } catch (e: any) { return { ...it, doc: undefined, error: e?.message || 'Could not read this file.' } }
  }))
  const add = async (files: File[]) => {
    const fresh = files.map((file) => ({ id: Math.random().toString(36).slice(2), file }))
    const parsed = await load(fresh, enc)
    setItems((l) => [...l, ...parsed]); if (!previewId && parsed[0]) setPreviewId(parsed[0].id)
  }
  useEffect(() => { if (items.length) load(items, enc).then(setItems) }, [enc, fps]) // eslint-disable-line react-hooks/exhaustive-deps

  const out = (it: Item) => (it.doc ? writeSubtitles(it.doc.cues, to, { fps: +fps || 23.976, stripTags: strip, assHeader: it.doc.assHeader, title: baseName(it.file.name) }) : '')
  const name = (it: Item) => `${baseName(it.file.name)}.${subExt(to)}`
  const ok = items.filter((i) => i.doc)
  const preview = useMemo(() => { const it = items.find((i) => i.id === previewId) ?? ok[0]; return it?.doc ? out(it).slice(0, 6000) : '' }, [items, previewId, to, strip, fps]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveAll = async () => {
    if (ok.length === 1) return downloadBlob(new Blob([out(ok[0])], { type: subMime(to) }), name(ok[0]))
    downloadBlob(await zipFiles(ok.map((i) => ({ name: name(i), data: out(i) }))), `subtitles-${subExt(to)}.zip`)
  }

  if (!items.length) return <Dropzone multiple accept={SUB_ACCEPT} onFiles={add} label="Drop subtitle files" sub="SRT, VTT, ASS, SSA, SBV, SUB, LRC, SAMI, TTML, DFXP, JSON or CSV. Convert one or many at once." />

  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><Label className="mb-0">{items.length} file{items.length > 1 ? 's' : ''}</Label><Button variant="ghost" size="sm" onClick={() => setItems([])}>Start over</Button></div>
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {items.map((it) => (
              <motion.div key={it.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={cn('flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5', previewId === it.id ? 'border-accent' : 'border-border')}>
                <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg', it.error ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success')}>{it.error ? <AlertCircle className="size-4" /> : <Check className="size-4" />}</div>
                <button className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => setPreviewId(it.id)}>
                  <div className="truncate text-sm font-medium">{it.file.name}</div>
                  <div className="text-xs text-muted">{formatBytes(it.file.size)}{it.doc && <> · {it.doc.format.toUpperCase()} · {it.doc.cues.length} lines · {it.encoding}</>}{it.error && <span className="text-danger"> · {it.error}</span>}</div>
                </button>
                {it.doc && <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([out(it)], { type: subMime(to) }), name(it))}>{subExt(to).toUpperCase()}</Button>}
                <button onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))} className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger cursor-pointer" aria-label="Remove"><X className="size-4" /></button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <Dropzone compact multiple accept={SUB_ACCEPT} onFiles={add} label={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" />Add more files</span>} />
        {preview && <div><Label>Preview</Label><pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-xs scrollbar-thin">{preview}</pre></div>}
      </>}
      side={<>
        <div><Label>Convert to</Label><Select value={to} onChange={setTo} options={SUB_FORMATS.map((f) => ({ value: f.id, label: f.label }))} /></div>
        <div><Label>Text encoding of the source</Label><Select value={enc} onChange={setEnc} options={ENCODINGS} /><p className="mt-1 text-xs text-muted">Pick one if accents or letters look broken.</p></div>
        <div><Label hint="for MicroDVD SUB">Frame rate</Label><Input value={fps} onChange={(e) => setFps(e.target.value)} inputMode="decimal" aria-label="Frame rate" /></div>
        <Switch checked={strip} onChange={setStrip} label="Remove styling tags (italic, colors)" />
        <Button size="lg" className="w-full" icon={ok.length > 1 ? <Archive className="size-5" /> : <RefreshCw className="size-5" />} disabled={!ok.length} onClick={saveAll}>
          {ok.length > 1 ? `Download ${ok.length} as ZIP` : `Download ${subExt(to).toUpperCase()}`}
        </Button>
        <p className="flex gap-1.5 text-xs text-muted"><Captions className="size-4 shrink-0" />Timing is kept to the millisecond. ASS styles are kept when converting ASS to ASS.</p>
      </>}
    />
  )
}

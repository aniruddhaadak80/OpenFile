import { useState } from 'react'
import { Captions, Download, Archive, AlertCircle } from 'lucide-react'
import { Button, Dropzone, Label, Select, ToolGrid, cn } from '@/components/ui'
import { baseName, downloadBlob, zipFiles } from '@/lib/files'
import { loadEngine, ffRunMany, extFromBlob } from '@/tools/video/_media/engine'
import { useMediaJob } from '@/tools/video/_media/media'
import { JobPanel, FileBar, Note } from '@/tools/video/_media/ui'
import { parseSubtitles, writeSubtitles, SUB_FORMATS, subExt, subMime, type SubFormat, type SubDoc } from '@/lib/b4/subtitles'

export interface SubStream { index: number; lang: string; codec: string; title: string; text: boolean; isDefault: boolean; forced: boolean }
const TEXT_CODECS = /^(subrip|srt|ass|ssa|mov_text|webvtt|text|microdvd|sami|stl|subviewer|jacosub|realtext|eia_608)$/

/** Parse subtitle streams from ffmpeg's banner. Pure, unit tested. */
export function parseSubStreams(log: string): SubStream[] {
  const out: SubStream[] = []
  const lines = log.split('\n')
  lines.forEach((l, i) => {
    const m = l.match(/Stream #\d+:(\d+)(?:\[0x[0-9a-f]+\])?(?:\((\w+)\))?: Subtitle: (\w+)/i)
    if (!m) return
    let title = ''
    for (let j = i + 1; j < Math.min(lines.length, i + 6) && !/Stream #/.test(lines[j]); j++) { const t = lines[j].match(/^\s+title\s*:\s*(.+)$/); if (t) title = t[1].trim() }
    out.push({ index: out.length, lang: m[2] && m[2] !== 'und' ? m[2] : '', codec: m[3].toLowerCase(), title, text: TEXT_CODECS.test(m[3].toLowerCase()), isDefault: /\(default\)/.test(l), forced: /\(forced\)/.test(l) })
  })
  return out
}

async function probeLog(file: File): Promise<string> {
  const ff = await loadEngine()
  const lines: string[] = []
  const onLog = ({ message }: { message: string }) => lines.push(message)
  const name = 'probe' + extFromBlob(file)
  ff.on('log', onLog)
  try {
    const { fetchFile } = await import('@ffmpeg/util')
    await ff.writeFile(name, await fetchFile(file))
    await ff.exec(['-hide_banner', '-i', name])
  } finally { ff.off('log', onLog); await ff.deleteFile(name).catch(() => {}) }
  return lines.join('\n')
}

export default function ExtractSubtitles() {
  const [file, setFile] = useState<File | null>(null)
  const [streams, setStreams] = useState<SubStream[] | null>(null)
  const [docs, setDocs] = useState<Map<number, SubDoc>>(new Map())
  const [fmt, setFmt] = useState<SubFormat>('srt')
  const job = useMediaJob()

  const open = (f: File) => { setFile(f); setStreams(null); setDocs(new Map()); scan(f) }
  const scan = (f: File) => job.run(async ({ setLabel }) => {
    setLabel('Looking for subtitle tracks')
    const s = parseSubStreams(await probeLog(f))
    setStreams(s)
    const text = s.filter((x) => x.text)
    if (!text.length) return
    setLabel(`Extracting ${text.length} track${text.length > 1 ? 's' : ''}`)
    const inName = 'in' + extFromBlob(f)
    const args = ['-i', inName]
    for (const t of text) args.push('-map', `0:s:${t.index}`, '-c:s', /^(ass|ssa)$/.test(t.codec) ? 'ass' : 'srt', `sub_${String(t.index).padStart(2, '0')}.${/^(ass|ssa)$/.test(t.codec) ? 'ass' : 'srt'}`)
    const outs = await ffRunMany({ inputs: [{ name: inName, file: f }], args, pattern: /^sub_\d+\.(srt|ass)$/ })
    const m = new Map<number, SubDoc>()
    for (const o of outs) { const idx = +o.name.match(/sub_(\d+)/)![1]; try { m.set(idx, parseSubtitles(await o.blob.text(), { name: o.name })) } catch { /* empty track */ } }
    setDocs(m)
  })

  const label = (s: SubStream) => [s.lang ? s.lang.toUpperCase() : `Track ${s.index + 1}`, s.title, s.forced ? 'forced' : '', s.isDefault ? 'default' : ''].filter(Boolean).join(' · ')
  const fileName = (s: SubStream) => `${baseName(file!.name)}.${s.lang || 'track' + (s.index + 1)}${s.forced ? '.forced' : ''}.${subExt(fmt)}`
  const text = (s: SubStream) => { const d = docs.get(s.index)!; return writeSubtitles(d.cues, fmt, { assHeader: d.assHeader }) }
  const ready = (streams ?? []).filter((s) => docs.has(s.index))

  if (!file) return <Dropzone accept="video/*,.mkv,.mp4,.mov,.webm,.m4v,.avi,.ts,.mks" onFiles={(f) => open(f[0])} label="Drop a video with subtitles" sub="Pull embedded subtitle tracks out of MKV, MP4, MOV and WEBM files as SRT, VTT, ASS and more." />
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { if (job.busy) job.cancel(); setFile(null) }} />
        {streams && !streams.length && <Note tone="warn">No subtitle tracks were found inside this video. Subtitles that are burned into the picture cannot be extracted as text.</Note>}
        {streams && streams.length > 0 && <div className="space-y-2">{streams.map((s) => {
          const d = docs.get(s.index)
          return (
            <div key={s.index} className={cn('flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5', s.text ? 'border-border' : 'border-warn/30')}>
              <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg', s.text ? 'bg-accent/10 text-accent' : 'bg-warn/10 text-warn')}>{s.text ? <Captions className="size-4" /> : <AlertCircle className="size-4" />}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{label(s)}</div><div className="text-xs text-muted">{s.codec}{d ? ` · ${d.cues.length} lines` : ''}{!s.text && ' · picture-based subtitles (PGS/VobSub) need OCR and cannot be saved as text here'}</div></div>
              {d && <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([text(s)], { type: subMime(fmt) }), fileName(s))}>{subExt(fmt).toUpperCase()}</Button>}
            </div>
          )
        })}</div>}
        {ready[0] && <div><Label>Preview of {label(ready[0])}</Label><pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-xs scrollbar-thin">{text(ready[0]).slice(0, 4000)}</pre></div>}
      </>}
      side={<>
        <div><Label>Save as</Label><Select value={fmt} onChange={setFmt} options={SUB_FORMATS.map((f) => ({ value: f.id, label: f.label }))} /></div>
        {ready.length > 1 && <Button size="lg" className="w-full" icon={<Archive className="size-5" />} onClick={async () => downloadBlob(await zipFiles(ready.map((s) => ({ name: fileName(s), data: text(s) }))), `${baseName(file.name)}-subtitles.zip`)}>Download all {ready.length} as ZIP</Button>}
        <JobPanel job={job} onRetry={() => scan(file)} />
        <p className="text-xs text-muted">The video is read on your device with ffmpeg. Large files need enough free memory in the browser.</p>
      </>}
    />
  )
}

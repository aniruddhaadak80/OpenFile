import { useEffect, useState } from 'react'
import { Tags, ImagePlus, Trash2, Music } from 'lucide-react'
import { Button, Dropzone, Field, Input, Textarea, ToolGrid, ResultCard, ErrorNote, Label } from '@/components/ui'
import { ffRun, extFromBlob } from '@/tools/video/_media/engine'
import { useMediaJob, useObjectUrl } from '@/tools/video/_media/media'
import { JobPanel, FileBar, Note, Stat } from '@/tools/video/_media/ui'
import { AUDIO_ACCEPT } from './_b4/FxShell'

interface Tags { title: string; artist: string; album: string; albumArtist: string; year: string; track: string; disc: string; genre: string; composer: string; comment: string; lyrics: string }
const EMPTY: Tags = { title: '', artist: '', album: '', albumArtist: '', year: '', track: '', disc: '', genre: '', composer: '', comment: '', lyrics: '' }
const FIELDS: [keyof Tags, string][] = [['title', 'Title'], ['artist', 'Artist'], ['album', 'Album'], ['albumArtist', 'Album artist'], ['year', 'Year'], ['genre', 'Genre'], ['track', 'Track (e.g. 3/12)'], ['disc', 'Disc (e.g. 1/2)'], ['composer', 'Composer']]

async function toJpeg(b: Blob): Promise<Blob> {
  if (/jpe?g|png/.test(b.type)) return b
  const bmp = await createImageBitmap(b)
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0)
  return new Promise((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.92))
}

export default function AudioTagEditor() {
  const [file, setFile] = useState<File | null>(null)
  const [tags, setTags] = useState<Tags>(EMPTY)
  const [info, setInfo] = useState<{ format: string; duration: number; bitrate?: number; sampleRate?: number; codec?: string } | null>(null)
  const [cover, setCover] = useState<Blob | null>(null)
  const [coverChanged, setCoverChanged] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const job = useMediaJob()
  const coverUrl = useObjectUrl(cover)
  const resultUrl = useObjectUrl(result)
  const ext = file ? extFromBlob(file).slice(1) : ''

  useEffect(() => {
    if (!file) return
    setError(null); setResult(null); setCoverChanged(false)
    ;(async () => {
      try {
        const mm = await import('music-metadata')
        const m = await mm.parseBlob(file, { skipCovers: false })
        const c = m.common
        setTags({ title: c.title ?? '', artist: c.artist ?? '', album: c.album ?? '', albumArtist: c.albumartist ?? '', year: c.year ? String(c.year) : '', track: c.track?.no ? `${c.track.no}${c.track.of ? '/' + c.track.of : ''}` : '', disc: c.disk?.no ? `${c.disk.no}${c.disk.of ? '/' + c.disk.of : ''}` : '', genre: (c.genre ?? []).join(', '), composer: (c.composer ?? []).join(', '), comment: (c.comment ?? []).map((x: any) => (typeof x === 'string' ? x : x.text)).filter(Boolean).join('\n'), lyrics: (c.lyrics ?? []).map((x: any) => (typeof x === 'string' ? x : x.text)).filter(Boolean).join('\n') })
        const pic = c.picture?.[0]
        setCover(pic ? new Blob([pic.data as BlobPart], { type: pic.format }) : null)
        setInfo({ format: m.format.container ?? ext.toUpperCase(), duration: m.format.duration ?? 0, bitrate: m.format.bitrate, sampleRate: m.format.sampleRate, codec: m.format.codec })
      } catch { setTags({ ...EMPTY, title: file.name.replace(/\.[^.]+$/, '') }); setInfo(null); setCover(null) }
    })()
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => file && job.run(async ({ setLabel, setProgress }) => {
    setResult(null); setLabel('Writing tags')
    if (ext === 'mp3') {
      const { ID3Writer } = await import('browser-id3-writer')
      const w = new ID3Writer(await file.arrayBuffer())
      if (tags.title) w.setFrame('TIT2', tags.title)
      if (tags.artist) w.setFrame('TPE1', tags.artist.split(/\s*;\s*/))
      if (tags.album) w.setFrame('TALB', tags.album)
      if (tags.albumArtist) w.setFrame('TPE2', tags.albumArtist)
      if (/^\d{4}$/.test(tags.year)) w.setFrame('TYER', +tags.year)
      if (tags.track) w.setFrame('TRCK', tags.track)
      if (tags.disc) w.setFrame('TPOS', tags.disc)
      if (tags.genre) w.setFrame('TCON', tags.genre.split(/\s*,\s*/))
      if (tags.composer) w.setFrame('TCOM', tags.composer.split(/\s*,\s*/))
      if (tags.comment) w.setFrame('COMM', { description: '', text: tags.comment } as any)
      if (tags.lyrics) w.setFrame('USLT', { description: '', lyrics: tags.lyrics })
      if (cover) w.setFrame('APIC', { type: 3 as any, data: await (await toJpeg(cover)).arrayBuffer(), description: 'Cover' })
      w.addTag()
      setResult(w.getBlob()); setProgress(1)
      return
    }
    const inName = 'in.' + ext, outName = 'out.' + ext
    const md: string[] = []
    const add = (k: string, v: string) => { md.push('-metadata', `${k}=${v}`) }
    add('title', tags.title); add('artist', tags.artist); add('album', tags.album); add('album_artist', tags.albumArtist); add('date', tags.year); add('track', tags.track); add('disc', tags.disc); add('genre', tags.genre); add('composer', tags.composer); add('comment', tags.comment); add('lyrics', tags.lyrics)
    const canCover = /^(m4a|mp4|m4b|flac|aac)$/.test(ext)
    const inputs: { name: string; file: Blob }[] = [{ name: inName, file }]
    let args = ['-i', inName]
    if (canCover && cover) {
      const jpg = await toJpeg(cover); const cn = /png/.test(jpg.type) ? 'cover.png' : 'cover.jpg'
      inputs.push({ name: cn, file: jpg })
      args = [...args, '-i', cn, '-map', '0:a', '-map', '1:0', '-c', 'copy', '-disposition:v:0', 'attached_pic', '-metadata:s:v', 'title=Cover', '-metadata:s:v', 'comment=Cover (front)']
    } else args = [...args, '-map', '0:a', ...(canCover && !cover && coverChanged ? [] : ['-map', '0:v?']), '-c', 'copy']
    setResult(await ffRun({ inputs, args: [...args, '-map_metadata', '-1', ...md, outName], output: outName, onProgress: setProgress }))
  })

  if (!file) return <Dropzone accept={AUDIO_ACCEPT + ',.m4b'} onFiles={(f) => setFile(f[0])} label="Drop a song to edit its tags" sub="Change title, artist, album, year, genre, lyrics and cover art in MP3, M4A, FLAC, OGG and more. No re-encoding, so quality stays the same." />
  const up = (k: keyof Tags) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTags((t) => ({ ...t, [k]: e.target.value }))
  const coverOk = ext === 'mp3' || /^(m4a|mp4|m4b|flac|aac)$/.test(ext)
  return (
    <ToolGrid
      main={<>
        <FileBar file={file} onReset={() => { setFile(null); setResult(null) }} />
        <ErrorNote error={error} />
        <div className="grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[180px_1fr]">
          <div className="space-y-2">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-xl border border-border bg-surface-2">{coverUrl ? <img src={coverUrl} alt="Cover art" className="h-full w-full object-cover" /> : <Music className="size-10 text-muted" />}</div>
            {coverOk ? <div className="flex gap-1.5">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border px-2 py-1.5 text-xs font-medium hover:border-accent"><ImagePlus className="size-4" />{cover ? 'Change' : 'Add cover'}<input type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCover(f); setCoverChanged(true) } e.target.value = '' }} /></label>
              {cover && <button className="cursor-pointer rounded-xl border border-border px-2 text-muted hover:text-danger" onClick={() => { setCover(null); setCoverChanged(true) }} aria-label="Remove cover"><Trash2 className="size-4" /></button>}
            </div> : <p className="text-xs text-muted">Cover art can be set for MP3, M4A and FLAC files.</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([k, l]) => <Field key={k} label={l} className={k === 'title' ? 'sm:col-span-2' : undefined}><Input value={tags[k]} onChange={up(k)} /></Field>)}
            <Field label="Comment" className="sm:col-span-2"><Input value={tags.comment} onChange={up('comment')} /></Field>
            <Field label="Lyrics" className="sm:col-span-2"><Textarea value={tags.lyrics} onChange={up('lyrics')} className="min-h-24 font-sans" /></Field>
          </div>
        </div>
        {result && <ResultCard blob={result} filename={file.name} onReset={() => setResult(null)} title="Tags saved">{resultUrl && <audio src={resultUrl} controls className="w-full" />}</ResultCard>}
      </>}
      side={<>
        {info && <div className="grid grid-cols-2 gap-2"><Stat label="Format" value={info.codec || info.format} /><Stat label="Length" value={`${Math.floor(info.duration / 60)}:${String(Math.round(info.duration % 60)).padStart(2, '0')}`} />{info.bitrate ? <Stat label="Bitrate" value={`${Math.round(info.bitrate / 1000)} kbps`} /> : null}{info.sampleRate ? <Stat label="Sample rate" value={`${info.sampleRate / 1000} kHz`} /> : null}</div>}
        <Button size="lg" className="w-full" icon={<Tags className="size-5" />} onClick={save} loading={job.busy}>Save tags</Button>
        <JobPanel job={job} onRetry={save} />
        {ext !== 'mp3' && <Note>{ext.toUpperCase()} tags are written with ffmpeg (about 30 MB, downloaded once). The audio is copied as is.</Note>}
        <Label className="mb-0">Tip</Label>
        <p className="-mt-3 text-xs text-muted">Separate several artists with a semicolon and several genres with a comma.</p>
      </>}
    />
  )
}

import { useEffect, useState } from 'react'
import { Captions } from 'lucide-react'
import { Input, Label, Segmented, Slider, Switch } from '@/components/ui'
import { burnSubsOp, softSubsOp } from '@/lib/b3/ffops'
import { ColorInput } from '@/tools/image/_img/kit'
import { VideoOpTool, FilePick, inName, outName } from './_b3/shell'
import { FONT_FAMILY, FONTS_DIR, assUseFont, countCues, fontInputs, subKind, type SubKind } from './_b3/subs'
import { Note } from './_media/ui'

export default function BurnSubtitles() {
  const [subs, setSubs] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<SubKind>('srt')
  const [mode, setMode] = useState<'burn' | 'soft'>('burn')
  const [container, setContainer] = useState<'mp4' | 'mkv'>('mp4')
  const [lang, setLang] = useState('eng')
  const [keepAss, setKeepAss] = useState(true)
  const [size, setSize] = useState(22)
  const [color, setColor] = useState('#ffffff')
  const [outline, setOutline] = useState('#000000')
  const [outlineW, setOutlineW] = useState(2)
  const [box, setBox] = useState(false)
  const [position, setPosition] = useState<'bottom' | 'top' | 'middle'>('bottom')
  const [margin, setMargin] = useState(24)
  useEffect(() => { if (!subs) { setText(''); return } subs.text().then((t) => { setText(t); setKind(subKind(subs.name, t)) }) }, [subs])
  const cues = text ? countCues(text, kind) : 0
  return (
    <VideoOpTool
      dropLabel="Drop a video to add subtitles" action={mode === 'burn' ? 'Burn in subtitles' : 'Add subtitle track'} icon={<Captions className="size-5" />}
      onReset={() => setSubs(null)}
      main={({ url, meta }) => (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-black/90">
          {meta?.playable !== false && url ? <video src={url} controls playsInline className="mx-auto max-h-[60vh] w-full object-contain" /> : <div className="aspect-video" />}
          {mode === 'burn' && subs && kind !== 'ass' && (
            <div className={`pointer-events-none absolute inset-x-0 flex justify-center px-4 ${position === 'top' ? 'top-[6%]' : position === 'middle' ? 'top-1/2 -translate-y-1/2' : 'bottom-[12%]'}`}>
              <span style={{ fontFamily: 'Arial, sans-serif', fontSize: `${size / 10}vmin`, color, WebkitTextStroke: outlineW ? `${outlineW / 2}px ${outline}` : undefined, background: box ? 'rgba(0,0,0,.5)' : undefined, padding: box ? '0 .3em' : undefined, fontWeight: 600 }}>Subtitle preview</span>
            </div>
          )}
        </div>
      )}
      side={() => <>
        <div><Label>Subtitle file</Label><FilePick file={subs} onFile={setSubs} accept=".srt,.vtt,.ass,.ssa,text/vtt" label="Drop an SRT, VTT or ASS file" /></div>
        {subs && <p className="text-xs text-muted">{kind.toUpperCase()} file with {cues} subtitle{cues === 1 ? '' : 's'}.</p>}
        <div><Label>Mode</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'burn', label: 'Burn in' }, { value: 'soft', label: 'Separate track' }]} /></div>
        {mode === 'soft' ? <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2"><Segmented value={container} onChange={setContainer} options={[{ value: 'mp4', label: 'MP4' }, { value: 'mkv', label: 'MKV' }]} /><Input value={lang} onChange={(e) => setLang(e.target.value.slice(0, 3))} aria-label="Language code" placeholder="eng" /></div>
          <Note>Viewers can turn these on and off in their player. Nothing is re-encoded, so it is very fast.</Note>
        </div> : kind === 'ass' && keepAss ? (
          <Switch checked={keepAss} onChange={setKeepAss} label="Keep the file's own styles" />
        ) : <div className="space-y-3">
          {kind === 'ass' && <Switch checked={keepAss} onChange={setKeepAss} label="Keep the file's own styles" />}
          <Slider label="Text size" value={size} onChange={setSize} min={10} max={60} />
          <div className="grid grid-cols-2 gap-2"><div><Label>Text</Label><ColorInput value={color} onChange={setColor} /></div><div><Label>Outline</Label><ColorInput value={outline} onChange={setOutline} /></div></div>
          <Slider label="Outline width" value={outlineW} onChange={setOutlineW} min={0} max={6} />
          <Switch checked={box} onChange={setBox} label="Dark box behind text" />
          <div><Label>Position</Label><Segmented value={position} onChange={setPosition} options={[{ value: 'bottom', label: 'Bottom' }, { value: 'middle', label: 'Middle' }, { value: 'top', label: 'Top' }]} /></div>
          <Slider label="Edge margin" value={margin} onChange={setMargin} min={0} max={120} />
        </div>}
      </>}
      disabled={() => !subs}
      onRun={async ({ file }, h) => {
        if (!subs) throw new Error('Choose a subtitle file first.')
        const info = await h.probe()
        const input = inName(file)
        if (mode === 'soft') {
          h.setLabel('Adding subtitle track')
          // convert ASS/VTT through ffmpeg's own subtitle encoders
          const sname = `subs.${kind === 'ass' ? 'ass' : kind}`
          const blob = await h.run(softSubsOp(input, sname, container, lang || 'und'), [{ name: input, file }, { name: sname, file: new TextEncoder().encode(text) }])
          return { blob, name: outName(file, 'subtitled', container), title: 'Subtitle track added' }
        }
        h.setLabel('Loading subtitle font')
        const fonts = await fontInputs()
        const sname = `subs.${kind}`
        const body = kind === 'ass' ? assUseFont(text) : text.replace(/^\uFEFF/, '')
        const style = kind === 'ass' && keepAss ? null : { font: FONT_FAMILY, size, color, outline, outlineW, box, position, margin }
        h.setLabel('Burning subtitles')
        const blob = await h.run(burnSubsOp(input, sname, FONTS_DIR, style, info.hasAudio), [{ name: input, file }, { name: sname, file: new TextEncoder().encode(body) }, ...fonts])
        return { blob, name: outName(file, 'subtitled'), title: 'Subtitles burned in', note: cues ? undefined : 'No subtitles were found in the file, so the video looks the same.' }
      }}
    />
  )
}

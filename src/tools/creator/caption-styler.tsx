import { useEffect, useMemo, useRef, useState } from 'react'
import { safeBlobUrl } from '@/lib/safe'
import { Captions, Download } from 'lucide-react'
import { Button, Card, Dropzone, Label, Segmented, Select, Slider, Switch, ResultCard } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { chunkCues, parseSubs, toAss, toSrt, type CapStyle, type Cue } from '@/lib/cf/creator'
import { FfProgress, useFfJob, ffProbe, ffRun, extOf } from '@/lib/cf/ff'
import { FileBar } from '@/lib/cf/ui'
import { FONT_FAMILY, FONTS_DIR, assUseFont, fontInputs } from '@/tools/video/_b3/subs'

const PRESETS: Record<string, Partial<CapStyle> & { label: string }> = {
  bold: { label: 'Bold pop', color: '#FFFFFF', outline: '#000000', outlineW: 6, box: false, bold: true, upper: true, words: 3, highlight: '#F5A524', karaoke: true },
  box: { label: 'Boxed', color: '#FFFFFF', outline: '#000000', outlineW: 2, box: true, boxColor: '#000000', boxAlpha: 0.7, bold: true, upper: false, words: 5, karaoke: false },
  gold: { label: 'Gold glow', color: '#F5A524', outline: '#1A1200', outlineW: 5, box: false, bold: true, upper: true, words: 2, highlight: '#FFFFFF', karaoke: true },
  clean: { label: 'Clean subtitle', color: '#FFFFFF', outline: '#000000', outlineW: 2.5, box: false, bold: false, upper: false, words: 0, karaoke: false },
  teal: { label: 'Teal label', color: '#04201D', outline: '#14B8A6', outlineW: 2, box: true, boxColor: '#14B8A6', boxAlpha: 1, bold: true, upper: false, words: 4, karaoke: false },
}
const SAMPLE = `1\n00:00:00,000 --> 00:00:02,500\nThis is how your captions will look\n\n2\n00:00:02,500 --> 00:00:05,000\nShort bold words keep people watching\n\n3\n00:00:05,000 --> 00:00:08,000\nand they work even with the sound off`

export default function CaptionStyler() {
  const [subsName, setSubsName] = useState('sample.srt')
  const [cues, setCues] = useState<Cue[]>(() => parseSubs(SAMPLE))
  const [video, setVideo] = useState<File | null>(null)
  const [vurl, setVurl] = useState<string | null>(null)
  const [st, setSt] = useState<CapStyle>({ font: FONT_FAMILY, size: 84, color: '#FFFFFF', outline: '#000000', outlineW: 6, box: false, boxColor: '#000000', boxAlpha: 0.7, bold: true, upper: true, pos: 'bottom', marginV: 380, words: 3, highlight: '#F5A524', karaoke: true })
  const [ratio, setRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [t, setT] = useState(0.6)
  const [out, setOut] = useState<Blob | null>(null)
  const job = useFfJob()
  const vref = useRef<HTMLVideoElement>(null)
  const set = (p: Partial<CapStyle>) => setSt((o) => ({ ...o, ...p }))
  const chunks = useMemo(() => chunkCues(cues, st.words), [cues, st.words])
  const [W, H] = ratio === '9:16' ? [1080, 1920] : ratio === '16:9' ? [1920, 1080] : [1080, 1080]
  useEffect(() => { if (!vref.current) return; const v = vref.current; const on = () => setT(v.currentTime); v.addEventListener('timeupdate', on); return () => v.removeEventListener('timeupdate', on) }, [vurl])
  const cur = chunks.find((c) => t >= c.start && t < c.end)
  const wi = cur ? Math.min(cur.words.length - 1, Math.floor(((t - cur.start) / Math.max(0.01, cur.end - cur.start)) * cur.words.length)) : -1
  const loadSubs = async (f: File) => { const c = parseSubs(await f.text()); if (!c.length) { job.setError('No subtitles found. Use an SRT or VTT file.'); return } setCues(c); setSubsName(f.name); setOut(null) }
  const loadVideo = (f: File) => { setVideo(f); setOut(null); if (vurl) URL.revokeObjectURL(vurl); setVurl(URL.createObjectURL(f)) }
  const assFor = (w: number, h: number) => toAss(cues, { ...st, size: Math.round(st.size * (h / 1920 > w / 1080 ? w / 1080 : h / 1920)), marginV: Math.round(st.marginV * (h / 1920)) }, w, h)
  const burn = () => job.run(async (p, l) => {
    if (!video) throw new Error('Add a video first.')
    l('Reading the video'); const info = await ffProbe(video)
    const w = info.width ?? W, h = info.height ?? H
    l('Loading caption font'); const fonts = await fontInputs()
    const input = 'in.' + (extOf(video.name) || 'mp4')
    l('Burning captions')
    const blob = await ffRun({ inputs: [{ name: input, file: video }, { name: 'subs.ass', file: new TextEncoder().encode(assUseFont(assFor(w, h))) }, ...fonts], args: ['-i', input, '-vf', `subtitles=subs.ass:fontsdir=${FONTS_DIR},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', ...(info.hasAudio ? ['-c:a', 'copy'] : ['-an']), '-movflags', '+faststart', 'out.mp4'], output: 'out.mp4', duration: info.duration, onProgress: p })
    setOut(blob)
  })
  const scale = 340 / W
  const lineY = st.pos === 'bottom' ? H - st.marginV : st.pos === 'top' ? st.marginV : H / 2
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Dropzone compact accept=".srt,.vtt,text/vtt" onFiles={(f) => loadSubs(f[0])} label="Captions: SRT or VTT" sub={`Now: ${subsName}, ${cues.length} lines`} />
          <Dropzone compact accept="video/*" onFiles={(f) => loadVideo(f[0])} label="Video to burn into (optional)" sub={video ? video.name : 'Preview works without one'} />
        </div>
        {video && <FileBar name={video.name} size={video.size} onReset={() => { setVideo(null); setVurl(null); setOut(null) }} />}
        <div className="flex justify-center rounded-2xl border border-border bg-surface-2/40 p-3">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-teal-900 via-slate-900 to-amber-900" style={{ width: W * scale, height: H * scale }}>
            {vurl && <video ref={vref} src={safeBlobUrl(vurl)} className="absolute inset-0 size-full object-cover" controls playsInline muted />}
            {cur && <div className="pointer-events-none absolute inset-x-3 text-center leading-tight" style={{ top: lineY * scale, transform: `translateY(${st.pos === 'bottom' ? '-100%' : st.pos === 'middle' ? '-50%' : '0'})`, fontFamily: 'Liberation Sans, Arial, sans-serif', fontWeight: st.bold ? 800 : 500, fontSize: st.size * scale, color: st.color }}>
              <span style={{ background: st.box ? `${st.boxColor}${Math.round(st.boxAlpha * 255).toString(16).padStart(2, '0')}` : undefined, padding: st.box ? '0.08em 0.3em' : undefined, borderRadius: 4, WebkitTextStroke: st.box ? undefined : `${Math.max(0.5, st.outlineW * scale * 1.2)}px ${st.outline}`, paintOrder: 'stroke fill', boxDecorationBreak: 'clone' }}>
                {cur.words.map((w, i) => <span key={i} style={{ color: st.karaoke && i <= wi ? st.highlight : undefined }}>{(st.upper ? w.toUpperCase() : w) + ' '}</span>)}
              </span></div>}
          </div>
        </div>
        {!vurl && <Slider label="Preview time" value={t} onChange={setT} min={0} max={Math.max(1, cues.at(-1)?.end ?? 1)} step={0.1} suffix=" s" />}
        <FfProgress job={job} />
        {out && <ResultCard blob={out} filename={(video?.name.replace(/\.[^.]+$/, '') ?? 'video') + '-captions.mp4'} title="Captions burned in" />}
      </div>
      <Card className="space-y-4 self-start">
        <div><Label>Style</Label><div className="flex flex-wrap gap-1.5">{Object.entries(PRESETS).map(([k, p]) => <button key={k} onClick={() => set(p)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:text-fg cursor-pointer">{p.label}</button>)}</div></div>
        {!video && <div><Label>Frame</Label><Segmented value={ratio} onChange={setRatio} options={['9:16', '16:9', '1:1']} /></div>}
        <Slider label="Words per caption (0 keeps lines)" value={st.words} onChange={(v) => set({ words: v })} min={0} max={8} />
        <Slider label="Text size" value={st.size} onChange={(v) => set({ size: v })} min={30} max={160} />
        <div><Label>Position</Label><Segmented value={st.pos} onChange={(v) => set({ pos: v })} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} /></div>
        {st.pos !== 'middle' && <Slider label="Distance from edge" value={st.marginV} onChange={(v) => set({ marginV: v })} min={20} max={800} step={10} />}
        <div className="grid grid-cols-3 gap-2 text-xs">{([['color', 'Text'], ['outline', 'Outline'], ['highlight', 'Highlight']] as const).map(([k, l]) => <label key={k} className="space-y-1"><span className="text-muted">{l}</span><input type="color" value={st[k]} onChange={(e) => set({ [k]: e.target.value } as any)} className="h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent" /></label>)}</div>
        <Slider label="Outline width" value={st.outlineW} onChange={(v) => set({ outlineW: v })} min={0} max={12} step={0.5} />
        <Switch checked={st.box} onChange={(v) => set({ box: v })} label="Background box" />
        {st.box && <div className="grid grid-cols-2 gap-2"><input type="color" aria-label="Box colour" value={st.boxColor} onChange={(e) => set({ boxColor: e.target.value })} className="h-9 w-full cursor-pointer rounded-lg border border-border bg-transparent" /><Slider ariaLabel="Box opacity" value={Math.round(st.boxAlpha * 100)} onChange={(v) => set({ boxAlpha: v / 100 })} min={10} max={100} /></div>}
        <Switch checked={st.bold} onChange={(v) => set({ bold: v })} label="Bold" /><Switch checked={st.upper} onChange={(v) => set({ upper: v })} label="UPPERCASE" /><Switch checked={st.karaoke} onChange={(v) => set({ karaoke: v })} label="Highlight the spoken word" />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([assFor(W, H)], { type: 'text/plain' }), subsName.replace(/\.\w+$/, '') + '-styled.ass')}>ASS file</Button>
          <Button variant="outline" size="sm" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([toSrt(chunks.map((c) => ({ ...c, text: st.upper ? c.text.toUpperCase() : c.text })))], { type: 'text/plain' }), subsName.replace(/\.\w+$/, '') + '-short.srt')}>Short SRT</Button>
        </div>
        <Button className="w-full" icon={<Captions className="size-4" />} disabled={!video || job.busy} onClick={burn}>Burn into video</Button>
        <p className="text-xs text-muted">Burning re-encodes the video on your device. A one minute clip takes about a minute.</p>
      </Card>
    </div>
  )
}

import { useState } from 'react'
import { Music } from 'lucide-react'
import { Label, Segmented, Slider, Switch } from '@/components/ui'
import { addAudioOp, type AudioMode } from '@/lib/b3/ffops'
import { VideoOpTool, FilePick, inName, outName } from './_b3/shell'
import { Note } from './_media/ui'
import { ffProbe } from './_media/engine'

export default function AddAudioToVideo() {
  const [audio, setAudio] = useState<File | null>(null)
  const [mode, setMode] = useState<AudioMode>('replace')
  const [vol, setVol] = useState(100)
  const [orig, setOrig] = useState(100)
  const [offset, setOffset] = useState(0)
  const [loop, setLoop] = useState(true)
  const [fit, setFit] = useState<'video' | 'shortest' | 'longest'>('video')
  return (
    <VideoOpTool
      dropLabel="Drop a video to add music or replace its sound" action={mode === 'replace' ? 'Replace audio' : mode === 'mix' ? 'Mix audio' : 'Add audio track'} icon={<Music className="size-5" />}
      onReset={() => setAudio(null)}
      side={() => <>
        <div><Label>Audio file</Label><FilePick file={audio} onFile={setAudio} accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.opus,video/*" label="Drop music or a voice-over" hint="MP3, WAV, M4A, OGG, FLAC, or a video to take its sound" /></div>
        <div><Label>How</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'replace', label: 'Replace' }, { value: 'mix', label: 'Mix with original' }, { value: 'add', label: 'Extra track' }]} /></div>
        <Slider label="New audio volume" value={vol} onChange={setVol} min={0} max={200} suffix="%" />
        {mode === 'mix' && <Slider label="Original volume" value={orig} onChange={setOrig} min={0} max={200} suffix="%" />}
        <div>
          <Slider label="Sync offset" value={offset} onChange={setOffset} min={-10} max={10} step={0.05} suffix=" s" />
          <p className="mt-1 text-xs text-muted">{offset > 0 ? `Audio starts ${offset}s after the video.` : offset < 0 ? `The first ${-offset}s of the audio are skipped.` : 'Audio and video start together.'}</p>
        </div>
        <Switch checked={loop} onChange={setLoop} label="Repeat audio if it is shorter" />
        {loop && fit === 'longest' && <p className="text-xs text-muted">The result is as long as the longer of the two files.</p>}
        <div><Label>Length</Label><Segmented value={fit} onChange={setFit} options={[{ value: 'video', label: 'Match video' }, { value: 'shortest', label: 'Shortest' }, { value: 'longest', label: 'Longest' }]} /></div>
        {mode === 'add' && <Note>Adds a second audio track (for example a commentary). Players let you switch tracks.</Note>}
      </>}
      disabled={() => !audio}
      onRun={async ({ file }, h) => {
        if (!audio) throw new Error('Choose an audio file first.')
        const info = await h.probe()
        if (!info.hasVideo) throw new Error('The first file has no video track.')
        h.setLabel('Adding audio')
        const input = inName(file), a = inName(audio, 'audio')
        // the audio length is needed to end a repeated track when the length is "Longest"
        const audioInfo = loop && fit === 'longest' ? await ffProbe(audio, a).catch(() => null) : null
        const op = addAudioOp(input, a, mode, { videoHasAudio: info.hasAudio, volume: vol / 100, originalVolume: orig / 100, offset, loop, fit, videoDuration: info.duration, audioDuration: audioInfo?.duration })
        const blob = await h.run(op, [{ name: input, file }, { name: a, file: audio }])
        return { blob, name: outName(file, 'with-audio'), title: 'Audio added', note: !info.hasAudio && mode !== 'replace' ? 'The video had no sound, so the new audio became its only track.' : undefined }
      }}
    />
  )
}

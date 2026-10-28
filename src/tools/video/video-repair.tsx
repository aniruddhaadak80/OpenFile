import { useState } from 'react'
import { Wrench } from 'lucide-react'
import { Label, Segmented } from '@/components/ui'
import { reencodeRepairOp, remuxOp } from '@/lib/b3/ffops'
import { extFromBlob, isCancel } from './_media/engine'
import { VideoOpTool, inName, outName } from './_b3/shell'
import { Note } from './_media/ui'

export default function VideoRepair() {
  const [mode, setMode] = useState<'auto' | 'quick' | 'deep'>('auto')
  return (
    <VideoOpTool
      dropLabel="Drop a video that will not play or seek" dropSub="MP4, MOV, MKV, WEBM, AVI, TS. Works on files your browser cannot open." action="Repair video" icon={<Wrench className="size-5" />}
      side={() => <>
        <div><Label>Method</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'auto', label: 'Automatic' }, { value: 'quick', label: 'Quick rebuild' }, { value: 'deep', label: 'Deep re-encode' }]} /></div>
        <p className="text-xs text-muted">{mode === 'quick' ? 'Rewrites the container and index without touching the picture. Fixes files that will not seek or start late on the web.' : mode === 'deep' ? 'Decodes every frame it can, skips damaged parts and writes a fresh MP4.' : 'Tries the quick rebuild first, then a deep re-encode if needed.'}</p>
        <Note>Files cut off mid-recording with no index (for example a phone that died while filming) need the original camera's settings to rebuild, which is not possible in the browser.</Note>
      </>}
      onRun={async ({ file }, h) => {
        const input = inName(file)
        const ext = extFromBlob(file).slice(1)
        const keep = ['mp4', 'mov', 'mkv', 'webm'].includes(ext) ? ext : 'mp4'
        if (mode !== 'deep') {
          try {
            h.setLabel('Rebuilding container')
            const blob = await h.run(remuxOp(input, keep, { genpts: true, ignoreErrors: true }), [{ name: input, file }])
            if (mode === 'quick' || blob.size > file.size * 0.5) return { blob, name: outName(file, 'repaired', keep), title: 'Container rebuilt', note: 'Streams were copied without re-encoding, so quality is unchanged.' }
          } catch (e) { if (isCancel(e) || mode === 'quick') throw e }
        }
        h.setLabel('Re-encoding readable frames')
        const blob = await h.run(reencodeRepairOp(input), [{ name: input, file }])
        return { blob, name: outName(file, 'repaired'), title: 'Video re-encoded', note: 'Any damaged frames were skipped.' }
      }}
    />
  )
}

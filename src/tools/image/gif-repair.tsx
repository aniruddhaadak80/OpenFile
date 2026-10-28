import { useState } from 'react'
import { Button, Dropzone, ErrorNote, Spinner, ToolGrid } from '@/components/ui'
import { type Anim, decodeGif } from '@/lib/b3/anim'
import { inspectGif, repairCandidates } from '@/lib/b3/anim/gif-inspect'
import { AnimPlayer, AnimStats, ExportPanel } from './_b3/anim-ui'
import { Note } from '@/tools/video/_media/ui'

export default function GifRepair() {
  const [file, setFile] = useState<File | null>(null)
  const [anim, setAnim] = useState<Anim | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const open = async (f: File) => {
    setFile(f); setAnim(null); setError(null); setBusy(true)
    try {
      const b = new Uint8Array(await f.arrayBuffer())
      const r = inspectGif(b)
      setProblems(r.problems)
      if (!r.valid) throw new Error('This does not look like a GIF at all (the header is missing). It may be another format with a .gif name.')
      let best: Anim | null = null
      // the untouched file first, then the repaired versions
      for (const c of [b, ...repairCandidates(b)]) {
        try { const a = decodeGif(c); if (!best || a.frames.length > best.frames.length) best = a } catch { /* next */ }
      }
      if (!best) throw new Error('No frames could be recovered from this file.')
      setAnim(best)
    } catch (e: any) { setError(e?.message || String(e)) } finally { setBusy(false) }
  }
  const reset = () => { setFile(null); setAnim(null); setProblems([]) }
  if (!file) return <Dropzone accept="image/gif,.gif" onFiles={(f) => open(f[0])} label="Drop a broken or cut-off GIF" sub="Recovers every frame that can still be read and writes a clean file." />
  if (busy) return <Spinner label="Recovering frames" />
  if (!anim) return <div className="space-y-3"><ErrorNote error={error} /><Button variant="outline" onClick={reset}>Try another file</Button></div>
  return (
    <ToolGrid
      main={<>
        <div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{file.name}</span><Button variant="ghost" size="sm" onClick={reset}>Start over</Button></div>
        <AnimPlayer anim={anim} />
        <AnimStats anim={anim} />
      </>}
      side={<>
        {problems.length ? <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs"><div className="mb-1 font-semibold text-fg">Found</div><ul className="list-disc space-y-1 pl-4">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div> : <Note>No structural problems were found. Re-saving still rebuilds the file cleanly, which fixes many odd playback issues.</Note>}
        <p className="text-sm">Recovered <span className="font-mono text-accent">{anim.frames.length}</span> frame{anim.frames.length === 1 ? '' : 's'}.</p>
        <ExportPanel anim={anim} name={file.name} suffix="-repaired" formats={['gif', 'webp', 'apng', 'mp4']} originalSize={file.size} onReset={reset} action="Save repaired file" />
      </>}
    />
  )
}

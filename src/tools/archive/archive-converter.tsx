import { useState } from 'react'
import { ArrowRightLeft, KeyRound } from 'lucide-react'
import { Button, Dropzone, Input, Label, Select, Slider, ToolGrid, ResultCard, ErrorNote } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { extractArchive, createArchive, cancelArchive, PasswordError, ARC_EXT, type ArcFormat } from '@/lib/b4/archive'
import { TopBar, StatusLine } from '@/lib/b4/ui'
import { Stat } from '@/tools/video/_media/ui'

const FORMATS: { value: ArcFormat; label: string }[] = [
  { value: 'zip', label: 'ZIP' }, { value: '7z', label: '7Z' }, { value: 'tar.gz', label: 'TAR.GZ' }, { value: 'tar.xz', label: 'TAR.XZ' },
  { value: 'tar.bz2', label: 'TAR.BZ2' }, { value: 'tar.zst', label: 'TAR.ZST' }, { value: 'tar', label: 'TAR' },
]
const stem = (n: string) => baseName(n.replace(/\.(tar\.(gz|xz|bz2|zst))$/i, '.x'))

export default function ArchiveConverter() {
  const [file, setFile] = useState<File | null>(null)
  const [to, setTo] = useState<ArcFormat>('zip')
  const [level, setLevel] = useState(6)
  const [pw, setPw] = useState('')
  const [needPw, setNeedPw] = useState(false)
  const [outPw, setOutPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; count: number } | null>(null)

  const run = async () => {
    if (!file) return
    setBusy(true); setError(null); setResult(null); setStatus('Unpacking')
    try {
      const { files } = await extractArchive(file, file.name, { password: pw || undefined, onStatus: setStatus })
      const real = files.filter((f) => !f.path.endsWith('/'))
      if (!real.length) throw new Error('The archive is empty.')
      setNeedPw(false); setStatus(`Packing ${real.length} files as ${to.toUpperCase()}`)
      const blob = await createArchive(files, to, { level, password: (to === 'zip' || to === '7z') && outPw ? outPw : undefined, onStatus: setStatus })
      setResult({ blob, count: real.length })
    } catch (e: any) {
      if (e instanceof PasswordError) { setNeedPw(true); setError(pw ? e.message : 'This archive is locked. Enter its password below.') }
      else if (e?.name !== 'CancelledError') setError(e?.message || 'Conversion failed.')
    } finally { setBusy(false) }
  }

  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} label="Drop an archive to convert" sub="RAR, 7Z, TAR, ISO, CAB, GZ, XZ, BZ2 and more to ZIP, 7Z or TAR. Works offline." />
  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={() => { if (busy) cancelArchive(); setFile(null); setResult(null); setError(null); setNeedPw(false); setPw('') }} />
        {busy && <StatusLine text={status} />}
        <ErrorNote error={error} />
        {result && <ResultCard blob={result.blob} filename={`${stem(file.name)}.${ARC_EXT[to]}`} originalSize={file.size} onReset={() => setResult(null)}>
          <div className="grid grid-cols-3 gap-2"><Stat label="Files" value={result.count} /><Stat label="Before" value={formatBytes(file.size)} /><Stat label="After" value={formatBytes(result.blob.size)} /></div>
        </ResultCard>}
      </>}
      side={<>
        <div><Label>Convert to</Label><Select value={to} onChange={setTo} options={FORMATS} /></div>
        {to !== 'tar' && <Slider label="Compression level" value={level} onChange={setLevel} min={1} max={9} />}
        {needPw && <div><Label>Password of the source archive</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Source password" /></div>}
        {(to === 'zip' || to === '7z') && <div><Label>New password (optional)</Label><Input type="password" value={outPw} onChange={(e) => setOutPw(e.target.value)} placeholder="No password" aria-label="New password" autoComplete="new-password" /></div>}
        <Button size="lg" className="w-full" icon={needPw ? <KeyRound className="size-5" /> : <ArrowRightLeft className="size-5" />} onClick={run} loading={busy}>Convert to {to.toUpperCase()}</Button>
        {busy && <Button variant="outline" className="w-full" onClick={() => { cancelArchive(); setBusy(false) }}>Cancel</Button>}
        <p className="text-xs text-muted">Folder structure and file names are kept. Converting a RAR to ZIP makes it open on any computer without extra apps.</p>
      </>}
    />
  )
}

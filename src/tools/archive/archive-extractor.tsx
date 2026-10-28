import { useMemo, useState } from 'react'
import { FolderOpen, Archive, KeyRound, CheckSquare, Square, Download } from 'lucide-react'
import { Button, Dropzone, Input, Label, ToolGrid, ErrorNote, Empty } from '@/components/ui'
import { toast } from '@/components/toast'
import { baseName, downloadBlob, formatBytes } from '@/lib/files'
import { extractArchive, buildTree, PasswordError, cancelArchive, type ArcFile, type TreeNode } from '@/lib/b4/archive'
import { FileTree, FilePreview, SearchBox, TopBar, StatusLine } from '@/lib/b4/ui'
import { Note, Stat } from '@/tools/video/_media/ui'

export async function zipEntries(files: ArcFile[], strip = ''): Promise<Blob> {
  const { zipSync } = await import('fflate')
  const tree: Record<string, Uint8Array> = {}
  for (const f of files) { if (f.path.endsWith('/')) continue; tree[strip && f.path.startsWith(strip) ? f.path.slice(strip.length) : f.path] = f.data }
  return new Blob([zipSync(tree, { level: 6 }) as BlobPart], { type: 'application/zip' })
}

export default function ArchiveExtractor() {
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<ArcFile[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [needPw, setNeedPw] = useState(false)
  const [pw, setPw] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<TreeNode | null>(null)
  const [filter, setFilter] = useState('')

  const open = async (f: File, password?: string) => {
    setFile(f); setBusy(true); setError(null); setWarning(null); setStatus('Opening archive')
    try {
      const r = await extractArchive(f, f.name, { password, onStatus: setStatus })
      const list = r.files.filter((x) => !x.path.endsWith('/') || r.files.length === 1)
      if (!list.length) throw new Error('The archive is empty.')
      setFiles(r.files); setWarning(r.warning ?? null); setNeedPw(false)
      setSelected(new Set(r.files.filter((x) => !x.path.endsWith('/')).map((x) => x.path)))
      const first = r.files.find((x) => !x.path.endsWith('/'))
      if (first) setActive({ name: first.path.split('/').pop()!, path: first.path, dir: false, size: first.data.length, children: [], file: first })
      toast(`Opened ${r.files.filter((x) => !x.path.endsWith('/')).length} files`, 'success')
    } catch (e: any) {
      if (e instanceof PasswordError) { setNeedPw(true); setError(password ? e.message : null) }
      else if (e?.name !== 'CancelledError') setError(e?.message || 'Could not open this archive.')
    } finally { setBusy(false) }
  }

  const tree = useMemo(() => (files ? buildTree(files) : null), [files])
  const real = useMemo(() => (files ?? []).filter((f) => !f.path.endsWith('/')), [files])
  const total = real.reduce((a, f) => a + f.data.length, 0)
  const sel = real.filter((f) => selected.has(f.path))
  const reset = () => { if (busy) cancelArchive(); setFile(null); setFiles(null); setError(null); setNeedPw(false); setPw(''); setActive(null); setFilter('') }

  const downloadSel = async () => {
    if (!sel.length) return toast('Select at least one file', 'error')
    if (sel.length === 1) return downloadBlob(new Blob([sel[0].data as BlobPart]), sel[0].path.split('/').pop()!)
    downloadBlob(await zipEntries(sel), `${baseName(baseName(file!.name))}${sel.length < real.length ? '-selected' : ''}.zip`)
  }

  if (!file) return <Dropzone onFiles={(f) => open(f[0])} label="Drop an archive to open it" sub="ZIP, 7Z, RAR, TAR, GZ, BZ2, XZ, ZST, ISO, CAB, DEB, RPM, JAR, APK and more. Nothing is uploaded." />

  return (
    <ToolGrid
      main={<>
        <TopBar file={file} onReset={reset} />
        {busy && <StatusLine text={status || 'Working'} />}
        <ErrorNote error={error} />
        {needPw && !busy && (
          <form className="space-y-2 rounded-xl border border-border bg-surface p-4" onSubmit={(e) => { e.preventDefault(); if (pw) open(file, pw) }}>
            <Label>Password</Label>
            <p className="text-sm text-muted">This archive is locked. Type its password to open it. The password stays on your device.</p>
            <div className="flex gap-2"><Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Archive password" aria-label="Archive password" /><Button type="submit" icon={<KeyRound className="size-4" />} disabled={!pw}>Open</Button></div>
          </form>
        )}
        {warning && <Note tone="warn">{warning}</Note>}
        {tree && <>
          <SearchBox value={filter} onChange={setFilter} />
          <FileTree root={tree} selected={selected} filter={filter} active={active?.path} onOpen={setActive}
            onToggle={(paths, on) => setSelected((s) => { const x = new Set(s); paths.forEach((p) => (on ? x.add(p) : x.delete(p))); return x })} />
          {active?.file ? <FilePreview file={active.file} /> : <Empty>Click a file to preview it.</Empty>}
        </>}
      </>}
      side={<>
        <div className="grid grid-cols-2 gap-2"><Stat label="Files" value={real.length || '-'} /><Stat label="Unpacked" value={files ? formatBytes(total) : '-'} /><Stat label="Archive" value={formatBytes(file.size)} /><Stat label="Selected" value={sel.length} /></div>
        {files && <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" icon={<CheckSquare className="size-4" />} onClick={() => setSelected(new Set(real.map((f) => f.path)))}>All</Button>
          <Button variant="outline" size="sm" className="flex-1" icon={<Square className="size-4" />} onClick={() => setSelected(new Set())}>None</Button>
        </div>}
        <Button size="lg" className="w-full" icon={sel.length === 1 ? <Download className="size-5" /> : <Archive className="size-5" />} disabled={!files || !sel.length} onClick={downloadSel}>
          {sel.length === 1 ? 'Download file' : `Download ${sel.length} as ZIP`}
        </Button>
        {busy && <Button variant="outline" className="w-full" onClick={reset}>Cancel</Button>}
        <p className="text-xs text-muted"><FolderOpen className="mr-1 inline size-3.5" />Files are unpacked in your browser with the 7-Zip engine. Click the small download icon on any row to save just that file.</p>
      </>}
    />
  )
}

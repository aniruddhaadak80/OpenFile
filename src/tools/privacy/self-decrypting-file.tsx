import { useState } from 'react'
import { LockKeyhole, Paperclip } from 'lucide-react'
import { Button, Dropzone, Field, Input, Segmented, Textarea, ToolGrid, ErrorNote, ResultCard } from '@/components/ui'
import { baseName, formatBytes } from '@/lib/files'
import { pack, buildHtml } from '@/lib/bcat/selfdecrypt'

export default function SelfDecryptingFile() {
  const [kind, setKind] = useState<'text' | 'file'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [title, setTitle] = useState('Private file')
  const [hint, setHint] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [out, setOut] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const go = async () => {
    setErr(null); setOut(null)
    if (pw.length < 6) return setErr('Use a password of at least 6 characters.')
    if (pw !== pw2) return setErr('The two passwords do not match.')
    if (kind === 'file' && !file) return setErr('Add a file first.')
    if (kind === 'text' && !note.trim()) return setErr('Write a note first.')
    if (file && file.size > 80 << 20) return setErr('Files over 80 MB make a very large HTML file that some browsers cannot open. Use the password ZIP tool for big files.')
    setBusy(true)
    try {
      const payload = kind === 'file' ? pack('file', file!.name, file!.type, new Uint8Array(await file!.arrayBuffer())) : pack('text', 'note.txt', 'text/plain', new TextEncoder().encode(note))
      const html = await buildHtml(payload, pw, title || 'Private file', hint)
      setOut(new Blob([html], { type: 'text/html' }))
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <Segmented value={kind} onChange={setKind} options={[{ value: 'file', label: 'Lock a file' }, { value: 'text', label: 'Lock a note' }]} />
          {kind === 'text' ? <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wi-Fi password, bank details, a private message" className="min-h-48 font-sans" aria-label="Note" />
            : file ? <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"><Paperclip className="size-4 text-accent" /><span className="flex-1 truncate">{file.name}</span><span className="text-muted">{formatBytes(file.size)}</span><Button size="sm" variant="ghost" onClick={() => setFile(null)}>Change</Button></div>
            : <Dropzone onFiles={(f) => { setFile(f[0]); setTitle(f[0].name) }} label="Drop the file to lock" sub="Any file type. It is encrypted inside one HTML page." />}
          {out && <ResultCard blob={out} filename={`${baseName(kind === 'file' && file ? file.name : 'note')}-locked.html`} title="Locked HTML file ready"><p className="text-xs text-muted">Send it by email, chat or USB. The person opens it in any browser and types the password. Share the password another way.</p></ResultCard>}
        </div>
      }
      side={
        <>
          <Field label="Page title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Repeat password"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Hint (optional, visible to anyone)"><Input value={hint} onChange={(e) => setHint(e.target.value)} /></Field>
          <ErrorNote error={err} />
          <Button className="w-full" icon={<LockKeyhole className="size-4" />} loading={busy} onClick={go}>Make locked HTML</Button>
          <p className="text-xs text-muted">The receiver needs no app or account. The page uses the browser's built-in AES-256-GCM with 250,000 rounds of PBKDF2, so a strong password is what keeps it safe.</p>
        </>
      }
    />
  )
}

import { useState } from 'react'
import { FileLock2, Unlock, Trash2, Eye, EyeOff } from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, Progress, Segmented, Slider, Tabs, ToolGrid, ErrorNote, ResultCard } from '@/components/ui'
import { formatBytes, downloadBlob, zipFiles } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'

async function zipjs() { const z = await import('@zip.js/zip.js'); z.configure({ useWebWorkers: false }); return z }
const pathOf = (f: File) => (f as any).webkitRelativePath || f.name
function strength(p: string) { let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p)) s++; return s }

function Create() {
  const [files, setFiles] = useState<File[]>([])
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [mode, setMode] = useState<'aes' | 'zipcrypto'>('aes')
  const [level, setLevel] = useState(6)
  const [name, setName] = useState('protected')
  const [prog, setProg] = useState<number | null>(null)
  const [out, setOut] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    setErr(null); setOut(null)
    if (pw.length < 4) return setErr('Use a password of at least 4 characters. Longer is much safer.')
    if (pw !== pw2) return setErr('The two passwords do not match.')
    setProg(0)
    try {
      const z = await zipjs()
      const w = new z.ZipWriter(new z.BlobWriter('application/zip'), { password: pw, encryptionStrength: 3, zipCrypto: mode === 'zipcrypto' })
      const total = files.reduce((s, f) => s + f.size, 0) || 1
      let done = 0
      for (const f of files) { await w.add(pathOf(f), new z.BlobReader(f), { level, lastModDate: new Date(f.lastModified) }); done += f.size; setProg(done / total) }
      setOut(await w.close())
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setProg(null) }
  }
  const st = strength(pw)

  if (!files.length) return <Dropzone multiple onFiles={setFiles} label="Drop files to put in a password ZIP" sub="Opens with the password in Windows, macOS, 7-Zip, WinRAR and phone file apps." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {files.map((f, i) => <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{pathOf(f)}</span><span className="text-xs text-muted">{formatBytes(f.size)}</span><button aria-label={`Remove ${f.name}`} className="text-muted hover:text-danger cursor-pointer" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button></div>)}
          </div>
          <Dropzone compact multiple onFiles={(f) => setFiles((p) => [...p, ...f])} label="Add more files" />
          {prog != null && <Progress value={prog} label="Encrypting" />}
          {out && <ResultCard blob={out} filename={`${name || 'protected'}.zip`} title="Password ZIP ready" onReset={() => { setFiles([]); setOut(null); setPw(''); setPw2('') }} />}
        </div>
      }
      side={
        <>
          <Field label="ZIP name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div>
            <Label hint={pw ? ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][st] : ''}>Password</Label>
            <div className="flex gap-2"><Input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-label="Password" />
              <Button variant="outline" size="md" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)} icon={show ? <EyeOff className="size-4" /> : <Eye className="size-4" />} /></div>
            <div className="mt-1.5 flex gap-1">{[0, 1, 2, 3, 4].map((i) => <span key={i} className={i < st ? 'h-1 flex-1 rounded-full' : 'h-1 flex-1 rounded-full bg-border'} style={i < st ? { background: st > 3 ? '#10B981' : st > 1 ? '#F5A524' : '#F97316' } : undefined} />)}</div>
          </div>
          <Field label="Repeat password"><Input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
          <div><Label>Encryption</Label><Segmented value={mode} onChange={setMode} options={[{ value: 'aes', label: 'AES-256 (strong)' }, { value: 'zipcrypto', label: 'ZipCrypto (old apps)' }]} /></div>
          {mode === 'zipcrypto' && <p className="text-xs text-warn">ZipCrypto opens in the built-in Windows extractor but is easy to crack. Use it only for low-risk files.</p>}
          <Slider label="Compression" value={level} onChange={setLevel} min={0} max={9} />
          <ErrorNote error={err} />
          <Button className="w-full" icon={<FileLock2 className="size-4" />} loading={prog != null} onClick={go}>Create password ZIP</Button>
          <p className="text-xs text-muted">File names inside a ZIP stay visible, only the contents are encrypted. Put files in a folder with a plain name if that matters.</p>
        </>
      }
    />
  )
}

interface Entry { filename: string; size: number; encrypted: boolean; directory: boolean; e: any }
function Open() {
  const [file, setFile] = useState<File | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [pw, setPw] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const open = async (f: File) => {
    setFile(f); setErr(null)
    try { const z = await zipjs(); const r = new z.ZipReader(new z.BlobReader(f)); const es = await r.getEntries(); setEntries(es.map((e: any) => ({ filename: e.filename, size: e.uncompressedSize, encrypted: e.encrypted, directory: e.directory, e }))) }
    catch (e: any) { setErr('This does not look like a ZIP file. ' + (e?.message ?? '')); setEntries(null) }
  }
  const get = async (en: Entry) => { const z = await zipjs(); return (await en.e.getData(new z.BlobWriter(), { password: en.encrypted ? pw : undefined })) as Blob }
  const one = async (en: Entry) => { setErr(null); try { downloadBlob(await get(en), en.filename.split('/').pop()!) } catch (e: any) { setErr(/password/i.test(e?.message) ? 'Wrong password.' : e?.message) } }
  const all = async () => {
    setErr(null); setBusy(true)
    try { const out = []; for (const en of entries!.filter((x) => !x.directory)) out.push({ name: en.filename, data: await get(en) }); downloadBlob(await zipFiles(out), file!.name.replace(/\.zip$/i, '') + '-unlocked.zip') }
    catch (e: any) { setErr(/password/i.test(e?.message) ? 'Wrong password.' : e?.message) } finally { setBusy(false) }
  }

  if (!file) return <Dropzone accept=".zip" onFiles={(f) => open(f[0])} label="Drop a password-protected ZIP" sub="AES and ZipCrypto archives. You need the password." />
  const enc = entries?.some((e) => e.encrypted)
  return (
    <div className="space-y-3">
      <TopBar file={file} onReset={() => { setFile(null); setEntries(null); setPw('') }} />
      {enc && <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); all() }}><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="ZIP password" aria-label="ZIP password" /><Button type="submit" icon={<Unlock className="size-4" />} loading={busy}>Unlock all</Button></form>}
      <ErrorNote error={err} />
      {entries && (
        <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {entries.filter((e) => !e.directory).map((en, i) => <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">{en.encrypted && <FileLock2 className="size-4 text-accent" />}<span className="min-w-0 flex-1 truncate">{en.filename}</span><span className="text-xs text-muted">{formatBytes(en.size)}</span><Button size="sm" variant="outline" onClick={() => one(en)}>Save</Button></div>)}
        </div>
      )}
      {entries && !enc && <p className="text-sm text-muted">This ZIP has no password.</p>}
    </div>
  )
}

export default function ZipEncrypt() {
  const [tab, setTab] = useState<'create' | 'open'>('create')
  return <div className="space-y-4"><Tabs value={tab} onChange={setTab} tabs={[{ value: 'create', label: 'Create password ZIP' }, { value: 'open', label: 'Open password ZIP' }]} />{tab === 'create' ? <Create /> : <Open />}</div>
}

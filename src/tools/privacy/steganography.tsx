import { useEffect, useState } from 'react'
import { EyeOff, Eye, Paperclip } from 'lucide-react'
import { Button, Dropzone, Field, Input, Label, Progress, Segmented, Tabs, Textarea, ToolGrid, ErrorNote, CopyButton, ResultCard } from '@/components/ui'
import { baseName, canvasToBlob, downloadBlob, formatBytes } from '@/lib/files'
import { TopBar } from '@/lib/b4/ui'
import { stegoCapacity, stegoEmbed, stegoExtract, pwEncrypt, pwDecrypt } from '@/lib/bcat/privacy'
import { useObjectUrl } from '@/lib/bcat/kit'

const F_ENC = 1, F_FILE = 2
async function pixels(file: File, flatten = false) {
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (flatten) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) } // transparent pixels cannot carry data
  ctx.drawImage(bmp, 0, 0); bmp.close()
  return { c, ctx, data: ctx.getImageData(0, 0, c.width, c.height) }
}

function Hide() {
  const [cover, setCover] = useState<File | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [kind, setKind] = useState<'text' | 'file'>('text')
  const [msg, setMsg] = useState('')
  const [secret, setSecret] = useState<File | null>(null)
  const [pw, setPw] = useState('')
  const [bits, setBits] = useState<'1' | '2'>('1')
  const [out, setOut] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const url = useObjectUrl(cover)
  useEffect(() => { if (cover) createImageBitmap(cover).then((b) => { setDims({ w: b.width, h: b.height }); b.close() }).catch(() => setErr('This image could not be opened.')) }, [cover])
  const size = kind === 'text' ? new TextEncoder().encode(msg).length : secret ? secret.size + secret.name.length + 2 : 0
  const cap = dims ? stegoCapacity(dims.w * dims.h, +bits) - (pw ? 32 : 0) : 0

  const go = async () => {
    setErr(null); setBusy(true)
    try {
      let payload: Uint8Array, flags = 0
      if (kind === 'text') payload = new TextEncoder().encode(msg)
      else { const name = new TextEncoder().encode(secret!.name), d = new Uint8Array(await secret!.arrayBuffer()); payload = new Uint8Array(2 + name.length + d.length); new DataView(payload.buffer).setUint16(0, name.length); payload.set(name, 2); payload.set(d, 2 + name.length); flags |= F_FILE }
      if (pw) { payload = await pwEncrypt(payload, pw); flags |= F_ENC }
      const { c, ctx, data } = await pixels(cover!, true)
      const px = stegoEmbed(data.data, payload, +bits, flags)
      ctx.putImageData(new ImageData(px, c.width, c.height), 0, 0)
      setOut(await canvasToBlob(c, 'image/png'))
    } catch (e: any) { setErr(e?.message || String(e)) } finally { setBusy(false) }
  }

  if (!cover) return <Dropzone accept="image/png,image/jpeg,image/webp,image/bmp" onFiles={(f) => { setCover(f[0]); setOut(null) }} label="Drop a cover image" sub="The secret is hidden in the colour of the pixels. The result is a PNG that looks the same." />
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={cover} onReset={() => { setCover(null); setOut(null); setDims(null) }} />
          {url && <img src={url} alt="Cover" className="max-h-72 rounded-2xl border border-border" />}
          <Segmented value={kind} onChange={setKind} options={[{ value: 'text', label: 'Hide text' }, { value: 'file', label: 'Hide a small file' }]} />
          {kind === 'text' ? <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Your secret message" className="font-sans" aria-label="Secret message" />
            : secret ? <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"><Paperclip className="size-4 text-accent" /><span className="flex-1 truncate">{secret.name}</span><span className="text-muted">{formatBytes(secret.size)}</span><Button size="sm" variant="ghost" onClick={() => setSecret(null)}>Change</Button></div>
            : <Dropzone compact onFiles={(f) => setSecret(f[0])} label="Drop the file to hide" />}
          {out && <ResultCard blob={out} filename={baseName(cover.name) + '-hidden.png'} title="Secret hidden in the image"><p className="text-xs text-muted">Share it as a file. Apps that re-compress photos (chat apps, social sites) destroy the hidden data.</p></ResultCard>}
        </div>
      }
      side={
        <>
          {dims && <div><Label hint={`${formatBytes(Math.max(0, size))} of ${formatBytes(Math.max(0, cap))}`}>Space used</Label><Progress value={cap > 0 ? size / cap : 1} /></div>}
          <div><Label>Bits per colour</Label><Segmented value={bits} onChange={setBits} options={[{ value: '1', label: '1 (invisible)' }, { value: '2', label: '2 (twice the space)' }]} /></div>
          <Field label="Password (optional, AES-256)"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="Leave empty for no password" /></Field>
          <ErrorNote error={err} />
          <Button className="w-full" icon={<EyeOff className="size-4" />} loading={busy} disabled={!size || size > cap} onClick={go}>Hide it</Button>
          {size > cap && <p className="text-xs text-danger">Too large for this image. Use a bigger image, 2 bits, or a shorter message.</p>}
        </>
      }
    />
  )
}

function Reveal() {
  const [file, setFile] = useState<File | null>(null)
  const [raw, setRaw] = useState<{ payload: Uint8Array; flags: number } | null | undefined>(undefined)
  const [pw, setPw] = useState('')
  const [text, setText] = useState<string | null>(null)
  const [hidden, setHidden] = useState<{ name: string; blob: Blob } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const open = async (f: File) => {
    setFile(f); setText(null); setHidden(null); setErr(null)
    try { const { data } = await pixels(f); const r = stegoExtract(data.data); setRaw(r); if (r && !(r.flags & F_ENC)) decode(r.payload, r.flags) } catch (e: any) { setErr(e?.message || 'Could not read this image'); setRaw(null) }
  }
  const decode = (p: Uint8Array, flags: number) => {
    if (flags & F_FILE) { const n = new DataView(p.buffer, p.byteOffset).getUint16(0); const name = new TextDecoder().decode(p.slice(2, 2 + n)); setHidden({ name, blob: new Blob([p.slice(2 + n) as BlobPart]) }) }
    else setText(new TextDecoder().decode(p))
  }
  const unlock = async () => { setErr(null); try { decode(await pwDecrypt(raw!.payload, pw), raw!.flags) } catch (e: any) { setErr(e.message) } }

  if (!file) return <Dropzone accept="image/png,image/bmp,image/webp" onFiles={(f) => open(f[0])} label="Drop an image with a hidden message" sub="Works with PNG images made by this tool." />
  return (
    <div className="space-y-3">
      <TopBar file={file} onReset={() => { setFile(null); setRaw(undefined) }} />
      {raw === null && <ErrorNote error="No hidden message found in this image. It may have been re-compressed or made with a different tool." />}
      {raw && (raw.flags & F_ENC) && text == null && !hidden ? (
        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); unlock() }}>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" aria-label="Password" />
          <Button type="submit" icon={<Eye className="size-4" />}>Unlock</Button>
        </form>
      ) : null}
      <ErrorNote error={raw ? err : null} />
      {text != null && <div className="space-y-2"><Label>Hidden message</Label><Textarea readOnly value={text} className="font-sans" aria-label="Hidden message" /><CopyButton text={text} /></div>}
      {hidden && <ResultCard blob={hidden.blob} filename={hidden.name} title="Hidden file found" />}
      {hidden && <Button variant="outline" onClick={() => downloadBlob(hidden.blob, hidden.name)}>Save {hidden.name}</Button>}
    </div>
  )
}

export default function Steganography() {
  const [tab, setTab] = useState<'hide' | 'reveal'>('hide')
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'hide', label: 'Hide' }, { value: 'reveal', label: 'Reveal' }]} />
      {tab === 'hide' ? <Hide /> : <Reveal />}
    </div>
  )
}

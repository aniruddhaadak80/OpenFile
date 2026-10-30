import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldCheck, Wand2, Printer, Copy as CopyIcon, FilePen, MessageSquare, ClipboardList, Layers, KeyRound, FileLock2 } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Switch, Segmented, Select, ErrorNote, ResultCard, Progress, useJob, CopyButton, cn, Field } from '@/components/ui'
import { toast } from '@/components/toast'
import { pdfBlob } from '@/lib/pdf'
import { renameExt } from '@/lib/files'
import { useFirstPage } from './_adv/pages'
import { PasswordInput, StrengthMeter, generatePassword, strength } from './_adv/password'

type PrintMode = 'high' | 'low' | 'none'
type Algo = 'AES-256' | 'AES-128'

export default function ProtectPdf() {
  const [file, setFile] = useState<File | null>(null)
  const preview = useFirstPage(file)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [ownerOn, setOwnerOn] = useState(false)
  const [owner, setOwner] = useState('')
  const [print, setPrint] = useState<PrintMode>('high')
  const [copy, setCopy] = useState(false)
  const [modify, setModify] = useState(false)
  const [annotate, setAnnotate] = useState(true)
  const [forms, setForms] = useState(true)
  const [assembly, setAssembly] = useState(false)
  const [algo, setAlgo] = useState<Algo>('AES-256')
  const [result, setResult] = useState<{ blob: Blob; owner: string; generated: boolean } | null>(null)
  const job = useJob()

  const mismatch = pw2.length > 0 && pw !== pw2
  const sameOwner = ownerOn && owner && owner === pw
  const ready = pw.length >= 1 && pw === pw2 && (!ownerOn || (owner.length > 0 && !sameOwner))
  const reset = () => { setFile(null); setResult(null); setPw(''); setPw2(''); setOwner(''); job.setError(null) }

  async function protect() {
    if (!file || !ready) return
    const out = await job.run(async (p) => {
      const { PDFDocument } = await import('@cantoo/pdf-lib')
      p(0.15)
      const bytes = new Uint8Array(await file.arrayBuffer())
      let doc
      try { doc = await PDFDocument.load(bytes, { updateMetadata: false }) } catch (e: any) {
        if (/encrypt/i.test(e?.message || '')) throw new Error('This PDF is already encrypted. Remove its password with Unlock PDF first, then protect it again.')
        throw new Error('Could not read this PDF. If it is damaged, run Repair PDF first.')
      }
      p(0.5)
      const generated = !ownerOn
      const ownerPassword = ownerOn ? owner : generatePassword(24)
      doc.encrypt({
        userPassword: pw, ownerPassword, algorithm: algo,
        permissions: {
          printing: print === 'none' ? false : print === 'low' ? 'lowResolution' : 'highResolution',
          copying: copy, contentAccessibility: true, modifying: modify, annotating: annotate, fillingForms: forms, documentAssembly: assembly,
        },
      })
      const saved = await doc.save({ useObjectStreams: false })
      p(0.9)
      // verify: must require the password and open with it
      const { openPdfJs } = await import('@/lib/pdf')
      let needsPw = false
      try { void (await openPdfJs(saved)).loadingTask.destroy() } catch (e: any) { needsPw = e?.name === 'PasswordException' }
      if (!needsPw) throw new Error('Verification failed: the output opened without a password.')
      ;void (await openPdfJs(saved, pw)).loadingTask.destroy()
      p(1)
      return { blob: pdfBlob(saved), owner: ownerPassword, generated }
    })
    if (out) { setResult(out); toast('PDF encrypted and verified') }
  }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a PDF to password-protect" sub="AES-256 encryption, done entirely in your browser." />

  if (result) return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <ResultCard blob={result.blob} filename={renameExt(file.name, 'pdf', '-protected')} originalSize={file.size} title={`Protected with ${algo}`} onReset={reset}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted"><KeyRound className="size-3.5" />Open password</div>
            <div className="flex items-center justify-between gap-2"><code className="truncate font-mono">{'•'.repeat(Math.min(pw.length, 16))}</code><CopyButton text={pw} label="Copy" /></div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted"><ShieldCheck className="size-3.5" />Owner password{result.generated && ' (generated)'}</div>
            <div className="flex items-center justify-between gap-2"><code className="truncate font-mono text-xs">{result.owner}</code><CopyButton text={result.owner} label="Copy" /></div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">Store the passwords somewhere safe, there is no way to recover a forgotten PDF password. {result.generated && 'The owner password unlocks full editing rights; keep it if you may need to change permissions later.'}</p>
      </ResultCard>
    </motion.div>
  )

  const perms: { icon: React.ElementType; label: string; hint: string; v: boolean; set: (v: boolean) => void }[] = [
    { icon: CopyIcon, label: 'Copy text & images', hint: 'Select and copy content', v: copy, set: setCopy },
    { icon: FilePen, label: 'Modify content', hint: 'Edit pages and text', v: modify, set: setModify },
    { icon: MessageSquare, label: 'Annotate & comment', hint: 'Add notes and highlights', v: annotate, set: setAnnotate },
    { icon: ClipboardList, label: 'Fill form fields', hint: 'Complete existing forms', v: forms, set: setForms },
    { icon: Layers, label: 'Assemble document', hint: 'Insert, rotate, delete pages', v: assembly, set: setAssembly },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface-2/40 p-6 sm:flex-row sm:items-start">
          <div className="relative w-40 shrink-0">
            {preview.src ? <img src={preview.src} alt="First page" className="w-full rounded-lg shadow-xl ring-1 ring-black/10" /> : <div className="aspect-[3/4] w-full animate-pulse rounded-lg bg-surface-2" />}
            <motion.div initial={{ scale: 0 }} animate={{ scale: ready ? 1 : 0.85, opacity: ready ? 1 : 0.5 }} className="absolute -bottom-3 -right-3 grid size-12 place-items-center rounded-2xl bg-gradient-brand text-on-accent shadow-xl shadow-accent/30"><Lock className="size-5" /></motion.div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <FileChip file={file} onRemove={reset} extra={preview.pages ? <span className="text-xs text-muted">{preview.pages} pages</span> : undefined} />
            {preview.locked && <ErrorNote error="This PDF already has a password. Use Unlock PDF first, then protect it with a new one." />}
            <ErrorNote error={preview.error} />
            <ul className="space-y-1.5 text-sm text-muted">
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />Anyone opening the file must enter the open password.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />Restrictions are enforced by PDF readers using a separate owner password.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />The output is verified before you download it.</li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <Label>Permissions for people with the open password</Label>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2/50 p-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium"><Printer className="size-4 text-accent" />Printing</span>
            <Segmented value={print} onChange={setPrint} options={[{ value: 'high', label: 'High quality' }, { value: 'low', label: 'Low-res' }, { value: 'none', label: 'Not allowed' }]} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {perms.map((pm) => (
              <button key={pm.label} type="button" onClick={() => pm.set(!pm.v)} className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition cursor-pointer', pm.v ? 'border-accent/40 bg-accent/5' : 'border-border hover:border-accent/30')}>
                <pm.icon className={cn('size-4 shrink-0', pm.v ? 'text-accent' : 'text-muted')} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{pm.label}</span><span className="block text-xs text-muted">{pm.hint}</span></span>
                <span className={cn('text-[10px] font-bold uppercase', pm.v ? 'text-success' : 'text-muted')}>{pm.v ? 'Allowed' : 'Blocked'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <div>
            <Label hint={<button type="button" className="inline-flex items-center gap-1 text-accent hover:underline cursor-pointer" onClick={() => { const g = generatePassword(16); setPw(g); setPw2(g); toast('Strong password generated, copy it before downloading', 'info') }}><Wand2 className="size-3" />Generate</button>}>Open password</Label>
            <PasswordInput value={pw} onChange={setPw} placeholder="Enter a password" autoFocus />
            <div className="mt-2"><StrengthMeter pw={pw} /></div>
          </div>
          <div>
            <Label>Confirm password</Label>
            <PasswordInput value={pw2} onChange={setPw2} placeholder="Re-enter password" invalid={mismatch} onEnter={protect} />
            {mismatch && <div className="mt-1 text-xs text-danger">Passwords do not match.</div>}
            {pw && pw === pw2 && <div className="mt-1 text-xs text-success">Passwords match.</div>}
          </div>
          <div className="space-y-2 border-t border-border pt-4">
            <Switch checked={ownerOn} onChange={setOwnerOn} label={<span className="text-sm">Set my own owner password</span>} />
            {ownerOn ? <>
              <PasswordInput value={owner} onChange={setOwner} placeholder="Owner (permissions) password" />
              {sameOwner && <div className="text-xs text-danger">Use a different owner password, otherwise the restrictions can be bypassed.</div>}
            </> : <p className="text-xs text-muted">A random owner password will be generated so the restrictions can't be bypassed with the open password.</p>}
          </div>
          <Field label="Encryption" className="border-t border-border pt-4"><Select value={algo} onChange={setAlgo} options={[{ value: 'AES-256', label: 'AES-256 (recommended)' }, { value: 'AES-128', label: 'AES-128 (older readers)' }]} /></Field>
          {job.busy && <Progress value={job.progress} label="Encrypting…" />}
          <ErrorNote error={job.error} />
          <Button size="lg" className="w-full" icon={<FileLock2 className="size-4" />} disabled={!ready || preview.locked} loading={job.busy} onClick={protect}>Protect PDF</Button>
          {pw && strength(pw).score < 2 && <p className="text-center text-xs text-warn">Weak passwords can be cracked quickly, consider a longer one.</p>}
        </div>
      </aside>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Unlock, KeyRound, ShieldAlert, ShieldCheck, Info } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Switch, ErrorNote, ResultCard, Progress, Spinner, useJob, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { openPdfJs, renderPage, pdfBlob } from '@/lib/pdf'
import { renameExt } from '@/lib/files'
import { useFirstPage } from './_adv/pages'
import { PasswordInput } from './_adv/password'

type Status = 'checking' | 'locked' | 'restricted' | 'open' | 'error'

export default function UnlockPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('checking')
  const [pw, setPw] = useState('')
  const [verified, setVerified] = useState<string | null>(null) // password that opened it
  const [wrong, setWrong] = useState(false)
  const [shake, setShake] = useState(0)
  const [forceRaster, setForceRaster] = useState(false)
  const [result, setResult] = useState<{ blob: Blob; method: 'decrypt' | 'raster' } | null>(null)
  const preview = useFirstPage(file, verified ?? undefined)
  const job = useJob()

  const reset = () => { setFile(null); setPw(''); setVerified(null); setResult(null); setWrong(false); setStatus('checking') }

  useEffect(() => {
    if (!file) return
    let alive = true
    setStatus('checking')
    ;(async () => {
      try {
        const d = await openPdfJs(file)
        const perms = await d.getPermissions().catch(() => null)
        void d.loadingTask.destroy()
        if (!alive) return
        setStatus(perms ? 'restricted' : 'open')
        if (perms) setVerified('')
      } catch (e: any) {
        if (!alive) return
        setStatus(e?.name === 'PasswordException' ? 'locked' : 'error')
      }
    })()
    return () => { alive = false }
  }, [file])

  async function check() {
    if (!file || !pw) return
    try {
      const d = await openPdfJs(file, pw); void d.loadingTask.destroy()
      setVerified(pw); setWrong(false)
      toast('Password accepted', 'success')
    } catch (e: any) {
      if (e?.name === 'PasswordException') { setWrong(true); setShake((n) => n + 1) }
      else job.setError(e?.message || 'Could not open the PDF')
    }
  }

  async function unlock() {
    if (!file || verified === null) return
    const out = await job.run(async (p) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!forceRaster) {
        try {
          const { PDFDocument } = await import('@cantoo/pdf-lib')
          p(0.2)
          const doc = await PDFDocument.load(bytes, { password: verified, updateMetadata: false })
          p(0.6)
          const saved = await doc.save()
          // verify it now opens with no password and no restrictions
          const d = await openPdfJs(saved); void d.loadingTask.destroy()
          p(1)
          return { blob: pdfBlob(saved), method: 'decrypt' as const }
        } catch (e) { console.warn('Lossless decrypt failed, rasterizing instead', e) }
      }
      // Fallback: render every page with pdf.js (which supports all encryption types) and rebuild
      const { PDFDocument } = await import('pdf-lib')
      const d = await openPdfJs(bytes, verified || undefined)
      const outDoc = await PDFDocument.create()
      for (let i = 1; i <= d.numPages; i++) {
        const page = await d.getPage(i)
        const vp = page.getViewport({ scale: 1 })
        const c = await renderPage(d, i, 2)
        const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Render failed'))), 'image/jpeg', 0.9))
        const img = await outDoc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
        outDoc.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height })
        c.width = c.height = 0
        p(i / d.numPages)
      }
      void d.loadingTask.destroy()
      return { blob: pdfBlob(await outDoc.save()), method: 'raster' as const }
    })
    if (out) { setResult(out); toast(out.method === 'decrypt' ? 'Password removed' : 'Unlocked (pages rebuilt as images)') }
  }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a password-protected PDF" sub="Only unlock files you own or are allowed to open. Nothing is uploaded." />

  if (result) return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <ResultCard blob={result.blob} filename={renameExt(file.name, 'pdf', '-unlocked')} originalSize={file.size} title="Your PDF is unlocked" onReset={reset}>
        <p className="text-sm text-muted">{result.method === 'decrypt'
          ? 'The encryption was removed losslessly, text, links and forms are intact. Anyone can now open, print and copy it.'
          : 'This file used encryption that could not be removed losslessly, so each page was re-rendered as a high-quality image. Text is no longer selectable; run OCR PDF if you need it searchable.'}</p>
      </ResultCard>
    </motion.div>
  )

  const unlocked = verified !== null
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-surface-2/40 p-6 sm:flex-row sm:items-start">
        <div className="relative w-44 shrink-0">
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-surface shadow-xl ring-1 ring-black/10">
            {preview.src ? <motion.img initial={{ filter: 'blur(12px)', opacity: 0.4 }} animate={{ filter: 'blur(0px)', opacity: 1 }} transition={{ duration: 0.5 }} src={preview.src} alt="First page" className="h-full w-full object-contain" />
              : <div className="grid h-full w-full place-items-center bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(127,127,127,.08)_8px,rgba(127,127,127,.08)_16px)]"><Lock className="size-10 text-muted/60" /></div>}
          </div>
          <motion.div key={unlocked ? 'u' : 'l'} initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} className={cn('absolute -bottom-3 -right-3 grid size-12 place-items-center rounded-2xl text-white shadow-xl', unlocked ? 'bg-success' : 'bg-gradient-brand')}>
            {unlocked ? <Unlock className="size-5" /> : <Lock className="size-5" />}
          </motion.div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <FileChip file={file} onRemove={reset} extra={preview.pages ? <span className="text-xs text-muted">{preview.pages} pages</span> : undefined} />
          {status === 'checking' && <Spinner label="Checking protection…" />}
          {status === 'locked' && !unlocked && <Note icon={Lock} tone="accent">This PDF needs a password to open. Enter it to remove the protection.</Note>}
          {status === 'restricted' && <Note icon={ShieldAlert} tone="warn">This PDF opens without a password but has owner restrictions (printing, copying or editing may be blocked). Unlocking removes them.</Note>}
          {status === 'open' && <Note icon={Info} tone="muted">This PDF isn't password-protected or restricted, there's nothing to unlock.</Note>}
          {status === 'error' && <ErrorNote error="This file could not be read as a PDF. It may be damaged, try Repair PDF." />}
          {unlocked && status === 'locked' && <Note icon={ShieldCheck} tone="success">Password verified. Ready to create an unprotected copy.</Note>}
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <AnimatePresence mode="wait">
            {status === 'locked' && !unlocked && (
              <motion.div key="pw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <Label>Document password</Label>
                <motion.div key={shake} animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}} transition={{ duration: 0.35 }}>
                  <PasswordInput value={pw} onChange={(v) => { setPw(v); setWrong(false) }} placeholder="Enter the password" autoFocus invalid={wrong} onEnter={check} autoComplete="current-password" />
                </motion.div>
                {wrong && <div className="text-xs text-danger">Incorrect password. Passwords are case-sensitive, check Caps Lock.</div>}
                <Button className="w-full" icon={<KeyRound className="size-4" />} disabled={!pw} onClick={check}>Verify password</Button>
              </motion.div>
            )}
          </AnimatePresence>
          {(unlocked || status === 'restricted') && (
            <>
              <Switch checked={forceRaster} onChange={setForceRaster} label={<span className="text-sm">Rebuild pages as images</span>} />
              <p className="-mt-2 text-xs text-muted">Only needed if the unlocked file misbehaves in your reader. Normally the password is removed losslessly.</p>
              {job.busy && <Progress value={job.progress} label="Removing protection…" />}
              <ErrorNote error={job.error} />
              <Button size="lg" className="w-full" icon={<Unlock className="size-4" />} loading={job.busy} onClick={unlock}>Unlock PDF</Button>
            </>
          )}
          {status === 'open' && <Button variant="outline" className="w-full" onClick={reset}>Choose another file</Button>}
        </div>
      </aside>
    </div>
  )
}

function Note({ icon: Icon, tone, children }: { icon: React.ElementType; tone: 'accent' | 'warn' | 'success' | 'muted'; children: React.ReactNode }) {
  const cls = { accent: 'border-accent/30 bg-accent/5 text-fg', warn: 'border-warn/30 bg-warn/10 text-fg', success: 'border-success/30 bg-success/10 text-fg', muted: 'border-border bg-surface-2/50 text-muted' }[tone]
  const ic = { accent: 'text-accent', warn: 'text-warn', success: 'text-success', muted: 'text-muted' }[tone]
  return <div className={cn('flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm', cls)}><Icon className={cn('mt-0.5 size-4 shrink-0', ic)} /><div>{children}</div></div>
}

import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, ShieldX, Clock, ChevronDown } from 'lucide-react'
import { Dropzone, Progress, ErrorNote, Empty, Badge, cn, useJob } from '@/components/ui'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { readBytes, Note } from './_b1/ui'
import type { SigReport } from './_b1/sig'

const fmt = (d?: Date) => (d ? d.toLocaleString() : 'unknown')

export default function VerifyPdfSignature() {
  const [file, setFile] = useState<File | null>(null)
  const [res, setRes] = useState<SigReport[] | null>(null)
  const job = useJob()
  useEffect(() => {
    if (!file) return
    setRes(null)
    job.run(async () => { const m = await import('./_b1/sig'); setRes(await m.verifyPdf(await readBytes(file))) })
  }, [file]) // eslint-disable-line
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a signed PDF to check its digital signatures" />
  return (
    <div className="space-y-4">
      <FileBar file={file} onReset={() => { setFile(null); setRes(null) }} />
      {job.busy && <Progress value={job.progress} label="Checking signatures…" />}
      <ErrorNote error={job.error} />
      {res && !res.length && <Empty>No digital signatures found. Drawn or typed signatures (pictures of a signature) are not digital signatures and cannot be verified.</Empty>}
      <div className="space-y-4">{res?.map((r, i) => <SigCard key={i} r={r} index={i} total={res.length} />)}</div>
      {res && res.length > 0 && <Note>"Intact" means the signed bytes match the signature and the certificate's key really made it. Whether you trust the signer depends on who issued the certificate, which this page cannot decide for you: check the issuer below. Revocation status is not checked offline.</Note>}
    </div>
  )
}

function SigCard({ r, index, total }: { r: SigReport; index: number; total: number }) {
  const [open, setOpen] = useState(index === total - 1)
  const intact = r.digestOk === true && r.signatureOk === true
  const broken = r.digestOk === false || r.signatureOk === false
  const Icon = broken ? ShieldX : intact ? ShieldCheck : ShieldAlert
  const tone = broken ? 'danger' : intact && r.certValidAtSigning !== false ? 'success' : 'warn'
  const rows: [string, React.ReactNode][] = [
    ['Document unchanged since signing', r.digestOk === true ? 'Yes' : r.digestOk === false ? 'No: the signed content was changed' : 'Could not check'],
    ['Signature made with the certificate', r.signatureOk === true ? 'Yes' : r.signatureOk === false ? 'No: the signature does not match' : 'Could not check this key type'],
    ['Covers the whole file', r.coversWholeFile ? 'Yes' : r.laterRevisions ? 'No: content was added after this signature (for example another signature or form data)' : 'No'],
    ['Certificate valid at signing time', r.certValidAtSigning === true ? 'Yes' : r.certValidAtSigning === false ? 'No: outside its validity dates' : 'Unknown'],
    ['Signed at', r.kind === 'timestamp' ? fmt(r.timestamp?.time) : fmt(r.signingTime ?? r.pdfTime)],
    ['Hash', r.digestAlg], ['Type', r.subFilter],
  ]
  if (r.reason) rows.push(['Reason', r.reason]); if (r.location) rows.push(['Location', r.location]); if (r.contact) rows.push(['Contact', r.contact])
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-surface', tone === 'danger' ? 'border-danger/40' : tone === 'success' ? 'border-success/40' : 'border-warn/40')}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer" aria-expanded={open}>
        <div className={cn('grid size-11 place-items-center rounded-xl', tone === 'danger' ? 'bg-danger/15 text-danger' : tone === 'success' ? 'bg-success/15 text-success' : 'bg-warn/15 text-warn')}><Icon className="size-6" /></div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{r.kind === 'timestamp' ? 'Document timestamp' : r.signer || 'Unknown signer'} <span className="text-xs font-normal text-muted">· {r.field}</span></div>
          <div className="text-sm text-muted">{broken ? 'Signature is broken or the file was changed' : intact ? (r.coversWholeFile ? 'Signature is intact' : 'Signature is intact for the part it covers') : 'Signature could not be fully checked'}</div>
        </div>
        {r.timestamp && <Badge color="var(--color-sky)"><Clock className="mr-1 size-3" />TIMESTAMP</Badge>}
        <ChevronDown className={cn('size-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="space-y-4 border-t border-border px-4 py-4">
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
        {r.timestamp && <div className="rounded-xl bg-surface-2/60 p-3 text-sm"><div className="font-medium">Trusted timestamp</div><div className="text-muted">{fmt(r.timestamp.time)}{r.timestamp.tsa ? ` by ${r.timestamp.tsa}` : ''} · {r.timestamp.imprintOk ? 'matches the signature' : r.timestamp.imprintOk === false ? 'does not match' : 'not checked'}</div></div>}
        {r.chain.length > 0 && <div><div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Certificate chain</div>
          <ol className="space-y-1.5">{r.chain.map((c, k) => (
            <li key={k} className="rounded-xl border border-border px-3 py-2 text-xs" style={{ marginLeft: k * 14 }}>
              <div className="break-words font-medium">{c.subject}</div>
              <div className="break-words text-muted">Issued by {c.selfSigned ? 'itself (self-signed)' : c.issuer}</div>
              <div className="text-muted">{c.keyType} · valid {c.notBefore?.toLocaleDateString()} to {c.notAfter?.toLocaleDateString()}{c.isCA ? ' · certificate authority' : ''} · {c.signedByNext === true ? 'issuer signature OK' : c.signedByNext === false ? 'issuer signature FAILS' : c.selfSigned ? '' : 'issuer not included in the file'}</div>
            </li>))}</ol></div>}
        {r.errors.length > 0 && <div className="space-y-1">{r.errors.map((e, k) => <div key={k} className="text-xs text-warn">{e}</div>)}</div>}
      </div>}
    </div>
  )
}

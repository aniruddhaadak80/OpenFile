import { Fragment, useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, Clock } from 'lucide-react'
import { Badge, Textarea, cn } from '@/components/ui'
import { Bar, Status, KV, OpenFileButton, DataTable, useDebounced } from './_b5/shell'
import { pemBlocks, decode, type Decoded } from '@/lib/b5/x509'

const HINT = 'Paste a PEM block (-----BEGIN CERTIFICATE-----, CERTIFICATE REQUEST, X509 CRL, PUBLIC KEY...) or open a .crt, .cer, .der, .pem, .csr or .crl file. Chains with several certificates work too.'

function NameTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/30 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">{rows.map(([k, v], i) => <Fragment key={i}><dt className="font-mono text-xs text-muted">{k}</dt><dd className="break-all">{v}</dd></Fragment>)}</dl>
    </div>
  )
}

function CertCard({ d, i }: { d: Decoded; i: number }) {
  if (d.type === 'asn1') return (
    <div className="rounded-2xl border border-border bg-surface p-4"><div className="mb-2 flex items-center gap-2"><Badge>{d.label}</Badge><span className="text-sm text-muted">ASN.1 structure</span></div><pre className="scrollbar-thin max-h-[480px] overflow-auto font-mono text-[12px] leading-5">{d.tree}</pre></div>
  )
  const now = Date.now()
  const status = d.type === 'cert' ? (now < d.notBefore.getTime() ? 'notyet' : now > d.notAfter.getTime() ? 'expired' : 'valid') : null
  const days = d.type === 'cert' ? Math.round((d.notAfter.getTime() - now) / 86400000) : 0
  const commonName = d.type !== 'crl' ? d.subject.find((r) => r[0] === 'CN')?.[1] : d.issuer.find((r) => r[0] === 'CN')?.[1]
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-muted">#{i + 1}</span>
        <Badge color={d.type === 'cert' ? '#14B8A6' : d.type === 'csr' ? '#38BDF8' : '#F5A524'}>{d.type === 'cert' ? 'CERTIFICATE' : d.type === 'csr' ? 'CSR' : 'CRL'}</Badge>
        <span className="font-semibold">{commonName ?? '(no common name)'}</span>
        {d.type === 'cert' && d.selfSigned && <Badge color="#A3A3A3">SELF-SIGNED</Badge>}
        {status && <span className={cn('ml-auto inline-flex items-center gap-1.5 text-sm', status === 'valid' ? 'text-success' : 'text-danger')}>{status === 'valid' ? <ShieldCheck className="size-4" /> : status === 'expired' ? <ShieldAlert className="size-4" /> : <Clock className="size-4" />}{status === 'valid' ? `Valid, expires in ${days} day${days === 1 ? '' : 's'}` : status === 'expired' ? `Expired ${-days} day${days === -1 ? '' : 's'} ago` : 'Not valid yet'}</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {d.type !== 'crl' && <NameTable title="Subject" rows={d.subject} />}
        {(d.type === 'cert' || d.type === 'crl') && <NameTable title="Issuer" rows={d.issuer} />}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{d.rows.map(([k, v]) => <KV key={k} label={k} value={v} />)}</div>
      {d.type !== 'crl' && d.ext.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">Extensions</div>
          {d.ext.map((e, k) => <div key={k} className="rounded-lg bg-surface-2/50 px-3 py-2"><div className="flex items-center gap-2 text-sm font-medium">{e.name}{e.critical && <Badge color="#EF4444">CRITICAL</Badge>}</div><pre className="mt-0.5 whitespace-pre-wrap break-all font-mono text-[12px] text-muted">{e.value}</pre></div>)}
        </div>
      )}
      {d.type === 'crl' && d.revoked.length > 0 && <DataTable columns={['Serial number', 'Revoked on']} rows={d.revoked} className="max-h-72" />}
    </div>
  )
}

export default function CertDecoder() {
  const [text, setText] = useState('')
  const [items, setItems] = useState<Decoded[]>([])
  const [err, setErr] = useState<string | null>(null)
  const dt = useDebounced(text, 200)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setErr(null)
      if (!dt.trim()) { setItems([]); return }
      const blocks = pemBlocks(dt)
      if (!blocks.length) { setItems([]); setErr('No PEM block found. ' + HINT); return }
      const out: Decoded[] = []
      for (const b of blocks) { try { out.push(await decode(b.der, b.label)) } catch (e: any) { if (alive) setErr(`Could not decode the ${b.label.toLowerCase()} block: ${e?.message || e}`) } }
      if (alive) setItems(out)
    })()
    return () => { alive = false }
  }, [dt])

  const openFile = async (f: File) => {
    const bytes = new Uint8Array(await f.arrayBuffer())
    const asText = new TextDecoder().decode(bytes.subarray(0, 64))
    if (/-----BEGIN/.test(asText) || /^[A-Za-z0-9+/=\s]+$/.test(asText)) setText(new TextDecoder().decode(bytes))
    else { // binary DER
      let s = ''; for (const b of bytes) s += String.fromCharCode(b)
      const label = /\.csr$/i.test(f.name) ? 'CERTIFICATE REQUEST' : /\.crl$/i.test(f.name) ? 'X509 CRL' : 'CERTIFICATE'
      setText(`-----BEGIN ${label}-----\n${btoa(s).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`)
    }
  }

  return (
    <div className="space-y-4">
      <Bar><span className="text-sm text-muted">Decode X.509 certificates, CSRs, CRLs and any ASN.1 DER structure.</span><div className="ml-auto"><OpenFileButton onFile={openFile} accept=".pem,.crt,.cer,.der,.csr,.crl,.key,.pub,.p7b,.txt" label="Open file" /></div></Bar>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={HINT} className="min-h-44" aria-label="PEM input" />
      {err && <Status kind="err">{err}</Status>}
      {items.length > 1 && <Status kind="ok">{items.length} blocks decoded. In a chain, the first is usually the site certificate and the last is closest to the root.</Status>}
      {items.map((d, i) => <CertCard key={i} d={d} i={i} />)}
    </div>
  )
}

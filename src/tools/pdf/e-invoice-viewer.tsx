import { useEffect, useMemo, useState } from 'react'
import { FileCheck2, Download, FileCode } from 'lucide-react'
import { Button, Card, Dropzone, ToolGrid, Progress, ErrorNote, Segmented, Field, Badge, useJob } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { pdfBlob } from '@/lib/pdf'
import { FileBar } from './_core/kit'
import { readBytes, CheckList, Score, Note } from './_b1/ui'
import { checkRules, parseInvoice, totals, UNITS, VAT_CATS, type Parsed, type Lang } from './_b1/einvoice'

const MEANS: Record<string, string> = { '58': 'SEPA bank transfer', '30': 'Bank transfer', '59': 'SEPA direct debit', '48': 'Card', '10': 'Cash', '1': 'Other', '31': 'Debit transfer', '42': 'Bank account', '49': 'Direct debit', '57': 'Standing agreement' }
const TYPES: Record<string, string> = { '380': 'Invoice', '381': 'Credit note', '384': 'Corrected invoice', '326': 'Partial invoice', '389': 'Self-billed invoice', '875': 'Partial construction invoice', '877': 'Final construction invoice' }

export default function EInvoiceViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [p, setP] = useState<Parsed | null>(null)
  const [xml, setXml] = useState('')
  const [src, setSrc] = useState('')
  const [lang, setLang] = useState<Lang>('en')
  const job = useJob(), pdf = useJob()
  useEffect(() => {
    if (!file) return
    setP(null)
    job.run(async () => {
      let text: string
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const { invoiceXmlFromPdf } = await import('./_b1/facturx')
        const r = await invoiceXmlFromPdf(await readBytes(file))
        if (!r) throw new Error('This PDF has no invoice XML inside. It is a plain PDF, not a Factur-X or ZUGFeRD e-invoice.')
        text = r.xml; setSrc(`${r.name} inside the PDF`)
      } else { text = await file.text(); setSrc('XML file') }
      setXml(text); setP(parseInvoice(text))
    })
  }, [file]) // eslint-disable-line
  const rules = useMemo(() => (p ? checkRules(p) : []), [p])
  const inv = p?.invoice
  const t = useMemo(() => (inv ? totals(inv) : null), [inv])
  const money = (n?: number) => (n === undefined ? '' : new Intl.NumberFormat(undefined, { style: 'currency', currency: /^[A-Z]{3}$/.test(inv?.currency ?? '') ? inv!.currency : 'EUR' }).format(n))
  const date = (s?: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString() : '')
  const kind = p ? (/xrechnung/i.test(p.guideline) ? 'XRechnung' : /factur-x|zugferd|en16931/i.test(p.guideline) ? 'EN 16931' : 'E-invoice') : ''
  const makePdf = () => pdf.run(async () => {
    if (!inv) return
    const [{ renderInvoicePdf }, { loadSansFonts }] = await Promise.all([import('./_b1/einvoice'), import('./_b1/fonts')])
    downloadBlob(pdfBlob(await renderInvoicePdf(inv, await loadSansFonts(), { lang })), `${baseName(file!.name)}-readable.pdf`)
  })

  if (!file) return <Dropzone accept=".xml,.pdf,application/xml,text/xml,application/pdf" onFiles={(f) => setFile(f[0])} label="Drop an XRechnung, UBL or CII XML file, or a Factur-X / ZUGFeRD PDF" sub="See the invoice in plain language and check it against EN 16931 rules. Nothing is uploaded." />
  return (
    <div className="space-y-4">
      <FileBar file={file} onReset={() => { setFile(null); setP(null) }} extra={p && <div className="flex flex-wrap gap-1.5"><Badge color="var(--color-sky)">{p.syntax}</Badge><Badge color="var(--color-teal)">{kind}</Badge></div>} />
      {job.busy && <Progress value={job.progress} label="Reading…" />}
      <ErrorNote error={job.error} />
      {inv && t && <ToolGrid
        main={<div className="space-y-4">
          <Card className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><div className="text-xs uppercase tracking-wide text-muted">{TYPES[inv.typeCode] ?? `Type ${inv.typeCode}`}</div><div className="font-display text-2xl font-bold">{inv.number || 'No number'}</div><div className="text-xs text-muted">Read from {src}</div></div>
              <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-sm">
                {([['Issued', date(inv.issueDate)], ['Due', date(inv.dueDate)], ['Delivered', date(inv.deliveryDate)], ['Buyer reference', inv.buyerReference], ['Order', inv.orderReference], ['Currency', inv.currency]] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
              </dl>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {([['From', inv.seller], ['Bill to', inv.buyer]] as const).map(([title, pt]) => (
                <div key={title} className="rounded-xl bg-surface-2/60 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted">{title}</div>
                  <div className="font-semibold">{pt.name}</div>
                  <div>{pt.street}</div><div>{pt.zip} {pt.city} {pt.country}</div>
                  {pt.vatId && <div className="text-muted">VAT ID {pt.vatId}</div>}{pt.taxId && <div className="text-muted">Tax no. {pt.taxId}</div>}
                  {[pt.contact, pt.email, pt.phone].filter(Boolean).map((v) => <div key={v} className="text-muted">{v}</div>)}
                </div>))}
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-2 font-medium">Item</th><th className="text-right font-medium">Qty</th><th className="pl-2 font-medium">Unit</th><th className="text-right font-medium">Price</th><th className="pl-3 font-medium">VAT</th><th className="text-right font-medium">Amount</th></tr></thead>
                <tbody className="divide-y divide-border">{inv.lines.map((l, i) => (
                  <tr key={i}><td className="py-2"><div className="font-medium">{l.name}</div>{l.description && <div className="text-xs text-muted">{l.description}</div>}</td><td className="text-right font-mono">{l.qty}</td><td className="pl-2 text-muted">{UNITS.find((u) => u.value === l.unit)?.label ?? l.unit}</td><td className="text-right font-mono">{money(l.price)}</td><td className="pl-3 text-muted">{l.vatCategory === 'S' ? `${l.vatRate}%` : VAT_CATS.find((c) => c.value === l.vatCategory)?.label ?? l.vatCategory}</td><td className="text-right font-mono">{money(p!.declared.lineAmounts[i])}</td></tr>))}</tbody>
              </table>
            </div>
            <div className="ml-auto max-w-sm space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted">Total without VAT</span><span className="font-mono">{money(p!.declared.taxBasis)}</span></div>
              {p!.declared.vat.map((g, i) => <div key={i} className="flex justify-between"><span className="text-muted">VAT {g.category === 'S' ? `${g.rate}%` : g.category} on {money(g.basis)}</span><span className="font-mono">{money(g.tax)}</span></div>)}
              <div className="flex justify-between border-t border-border pt-1 text-lg font-bold"><span>Total</span><span className="font-mono">{money(p!.declared.grandTotal)}</span></div>
              {p!.declared.duePayable !== undefined && p!.declared.duePayable !== p!.declared.grandTotal && <div className="flex justify-between"><span className="text-muted">Amount due</span><span className="font-mono font-semibold">{money(p!.declared.duePayable)}</span></div>}
            </div>
            {(inv.payment.iban || inv.payment.terms || inv.payment.meansCode) && <div className="rounded-xl bg-surface-2/60 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted">Payment</div>
              <div>{MEANS[inv.payment.meansCode] ?? `Code ${inv.payment.meansCode}`}</div>
              {inv.payment.iban && <div className="font-mono">IBAN {inv.payment.iban.replace(/(.{4})/g, '$1 ').trim()}{inv.payment.bic ? ` · BIC ${inv.payment.bic}` : ''}</div>}
              {inv.payment.accountName && <div>{inv.payment.accountName}</div>}{inv.payment.reference && <div>Reference: {inv.payment.reference}</div>}{inv.payment.terms && <div className="text-muted">{inv.payment.terms}</div>}
            </div>}
            {inv.note && <div className="whitespace-pre-wrap text-sm text-muted">{inv.note}</div>}
          </Card>
          <details className="rounded-2xl border border-border bg-surface p-3"><summary className="cursor-pointer text-sm font-medium">Raw XML</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted scrollbar-thin">{xml}</pre></details>
        </div>}
        side={<>
          <Score checks={rules.map((r) => ({ level: r.level, title: r.text }))} label="Business rules" />
          <div className="max-h-[40vh] overflow-auto scrollbar-thin"><CheckList checks={[...rules].sort((a, b) => ['fail', 'warn', 'pass'].indexOf(a.level) - ['fail', 'warn', 'pass'].indexOf(b.level)).map((r) => ({ level: r.level, title: r.text, detail: r.id }))} /></div>
          {Math.abs(t.grandTotal - (p!.declared.grandTotal ?? t.grandTotal)) > 0.011 && <div className="text-xs text-warn">Recalculated total from the lines: {money(t.grandTotal)}</div>}
          <Field label="Readable PDF language"><Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }, { value: 'fr', label: 'Français' }]} /></Field>
          <Button className="w-full" icon={<Download className="size-4" />} loading={pdf.busy} onClick={makePdf}>Download as readable PDF</Button>
          <Button className="w-full" variant="outline" icon={<FileCode className="size-4" />} onClick={() => downloadBlob(xml, `${baseName(file.name)}.xml`, 'application/xml')}>Save the XML</Button>
          <ErrorNote error={pdf.error} />
          <Note>Checks cover required fields, totals, VAT breakdown, IBAN and key XRechnung rules. They do not replace the official schema and Schematron validation used by public portals.</Note>
          <div className="flex items-center justify-center gap-1 text-xs text-muted"><FileCheck2 className="size-3" />Your invoice never leaves this tab.</div>
        </>}
      />}
    </div>
  )
}

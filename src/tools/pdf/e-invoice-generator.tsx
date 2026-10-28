import { useEffect, useMemo, useState } from 'react'
import { ReceiptEuro, Plus, Trash2, FileCode, Download, RotateCcw, Upload } from 'lucide-react'
import { Button, Card, Field, Input, Select, Segmented, Textarea, ToolGrid, Progress, ErrorNote, ResultCard, FileChip, Spinner, cn, useJob } from '@/components/ui'
import { openPdfJs, renderPage, pdfBlob } from '@/lib/pdf'
import { downloadBlob } from '@/lib/files'
import { toast } from '@/components/toast'
import { readBytes, Note, CheckList } from './_b1/ui'
import { UNITS, VAT_CATS, totals, checkRules, toCII, toUBL, parseInvoice, type Invoice, type Party, type Line, type Lang } from './_b1/einvoice'

type Format = 'facturx' | 'xr-cii' | 'xr-ubl'
const STORE = 'openfile.einvoice.seller'
const today = () => new Date().toISOString().slice(0, 10)
const plus = (d: string, days: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + days); return x.toISOString().slice(0, 10) }
const emptyParty = (): Party => ({ name: '', street: '', city: '', zip: '', country: 'DE', vatId: '', email: '' })
const newLine = (n: number): Line => ({ id: String(n), name: '', qty: 1, unit: 'C62', price: 0, vatCategory: 'S', vatRate: 19 })
function initial(): Invoice {
  let seller = emptyParty()
  try { const s = localStorage.getItem(STORE); if (s) seller = { ...seller, ...JSON.parse(s) } } catch { /* */ }
  const d = today()
  return { number: `INV-${d.slice(0, 4)}-001`, issueDate: d, dueDate: plus(d, 30), typeCode: '380', currency: 'EUR', seller, buyer: emptyParty(), lines: [newLine(1)], payment: { meansCode: '58', iban: (seller as any).iban ?? '', bic: (seller as any).bic ?? '', terms: 'Payable within 30 days' } }
}

export default function EInvoiceGenerator() {
  const [inv, setInv] = useState<Invoice>(initial)
  const [format, setFormat] = useState<Format>('facturx')
  const [lang, setLang] = useState<Lang>('en')
  const [ownPdf, setOwnPdf] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null)
  const job = useJob(), prev = useJob(), imp = useJob()
  const t = useMemo(() => totals(inv), [inv])
  const xml = useMemo(() => (format === 'xr-ubl' ? toUBL(inv) : toCII(inv, format === 'xr-cii' ? 'xrechnung-cii' : 'facturx')), [inv, format])
  const rules = useMemo(() => checkRules(parseInvoice(xml)), [xml])
  const problems = rules.filter((r) => r.level !== 'pass')
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: /^[A-Z]{3}$/.test(inv.currency) ? inv.currency : 'EUR' }).format(n)
  useEffect(() => setResult(null), [inv, format, lang, ownPdf])

  // live PDF preview (debounced)
  useEffect(() => {
    if (format !== 'facturx' || ownPdf) { setPreview(null); return }
    const tm = setTimeout(() => prev.run(async () => {
      const [{ renderInvoicePdf }, { loadSansFonts }] = await Promise.all([import('./_b1/einvoice'), import('./_b1/fonts')])
      const bytes = await renderInvoicePdf(inv, await loadSansFonts(), { lang })
      const d = await openPdfJs(bytes); const c = await renderPage(d, 1, 1.2)
      setPreview(c.toDataURL('image/jpeg', 0.85))
    }), 600)
    return () => clearTimeout(tm)
  }, [inv, lang, format, ownPdf]) // eslint-disable-line

  const set = (p: Partial<Invoice>) => setInv((x) => ({ ...x, ...p }))
  const setParty = (k: 'seller' | 'buyer', p: Partial<Party>) => setInv((x) => ({ ...x, [k]: { ...x[k], ...p } }))
  const setLine = (i: number, p: Partial<Line>) => setInv((x) => ({ ...x, lines: x.lines.map((l, k) => (k === i ? { ...l, ...p } : l)) }))
  const saveSeller = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...inv.seller, iban: inv.payment.iban, bic: inv.payment.bic })); toast('Your details are saved in this browser', 'success') } catch { toast('Could not save', 'error') } }

  const build = () => job.run(async (setP) => {
    const fails = rules.filter((r) => r.level === 'fail')
    if (fails.length) throw new Error(`Please fix ${fails.length} problem${fails.length > 1 ? 's' : ''} first: ${fails[0].text}`)
    if (format !== 'facturx') { setResult({ blob: new Blob([xml], { type: 'application/xml' }), name: `${inv.number}-${format === 'xr-ubl' ? 'xrechnung-ubl' : 'xrechnung-cii'}.xml` }); toast('XML invoice ready', 'success'); return }
    setP(0.2)
    let pdf: Uint8Array
    if (ownPdf) pdf = await readBytes(ownPdf)
    else { const [{ renderInvoicePdf }, { loadSansFonts }] = await Promise.all([import('./_b1/einvoice'), import('./_b1/fonts')]); pdf = await renderInvoicePdf(inv, await loadSansFonts(), { lang }) }
    setP(0.6)
    const { makeFacturX } = await import('./_b1/facturx')
    const r = await makeFacturX(pdf, xml, { title: `Invoice ${inv.number}`, author: inv.seller.name })
    setResult({ blob: pdfBlob(r.bytes), name: `${inv.number}-facturx.pdf` }); setP(1)
    toast(ownPdf && r.report.remaining.some((x) => x.level === 'fail') ? 'Done. Your PDF has fonts that are not embedded, so it may not pass strict PDF/A checks.' : 'Factur-X invoice ready', ownPdf && r.report.remaining.some((x) => x.level === 'fail') ? 'info' : 'success')
  })
  const importXml = (f: File) => imp.run(async () => {
    let text: string
    if (/\.pdf$/i.test(f.name)) { const { invoiceXmlFromPdf } = await import('./_b1/facturx'); const r = await invoiceXmlFromPdf(await readBytes(f)); if (!r) throw new Error('No invoice XML found inside this PDF.'); text = r.xml } else text = await f.text()
    const p = parseInvoice(text)
    setInv({ ...p.invoice, lines: p.invoice.lines.length ? p.invoice.lines : [newLine(1)], payment: { ...p.invoice.payment } })
    toast('Invoice loaded for editing', 'success')
  })

  const partyForm = (k: 'seller' | 'buyer', title: string) => {
    const p = inv[k]
    return (
      <Card className="space-y-2.5">
        <div className="flex items-center justify-between"><div className="text-sm font-semibold">{title}</div>{k === 'seller' && <button type="button" onClick={saveSeller} className="text-xs text-accent cursor-pointer">Remember my details</button>}</div>
        <Field label="Name"><Input value={p.name} onChange={(e) => setParty(k, { name: e.target.value })} /></Field>
        <Field label="Street"><Input value={p.street} onChange={(e) => setParty(k, { street: e.target.value })} /></Field>
        <div className="grid grid-cols-[1fr_2fr_70px] gap-2">
          <Field label="Postcode"><Input value={p.zip} onChange={(e) => setParty(k, { zip: e.target.value })} /></Field>
          <Field label="City"><Input value={p.city} onChange={(e) => setParty(k, { city: e.target.value })} /></Field>
          <Field label="Country"><Input value={p.country} maxLength={2} onChange={(e) => setParty(k, { country: e.target.value.toUpperCase() })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="VAT ID"><Input value={p.vatId} placeholder="DE123456789" onChange={(e) => setParty(k, { vatId: e.target.value })} /></Field>
          {k === 'seller' ? <Field label="Tax number"><Input value={p.taxId ?? ''} onChange={(e) => setParty(k, { taxId: e.target.value })} /></Field> : <Field label="Contact person"><Input value={p.contact ?? ''} onChange={(e) => setParty(k, { contact: e.target.value })} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Email"><Input type="email" value={p.email ?? ''} onChange={(e) => setParty(k, { email: e.target.value })} /></Field>
          {k === 'seller' ? <Field label="Contact person"><Input value={p.contact ?? ''} onChange={(e) => setParty(k, { contact: e.target.value })} /></Field> : <Field label="Phone"><Input value={p.phone ?? ''} onChange={(e) => setParty(k, { phone: e.target.value })} /></Field>}
        </div>
        {k === 'seller' && <Field label="Phone"><Input value={p.phone ?? ''} onChange={(e) => setParty(k, { phone: e.target.value })} /></Field>}
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {result && <ResultCard blob={result.blob} filename={result.name} title={format === 'facturx' ? 'Factur-X / ZUGFeRD invoice ready' : 'XRechnung XML ready'} onReset={() => setResult(null)}>
        {format === 'facturx' && <Button size="sm" variant="outline" icon={<FileCode className="size-3.5" />} onClick={() => downloadBlob(xml, 'factur-x.xml', 'application/xml')}>Also save the XML on its own</Button>}
      </ResultCard>}
      <ToolGrid
        main={<div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-semibold">Invoice</div>
              <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-accent"><Upload className="size-3.5" />Load an existing e-invoice<input type="file" hidden accept=".xml,.pdf,application/xml,text/xml,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) importXml(f); e.target.value = '' }} /></label></div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Number"><Input value={inv.number} onChange={(e) => set({ number: e.target.value })} /></Field>
              <Field label="Type"><Select value={inv.typeCode} onChange={(v) => set({ typeCode: v })} options={[{ value: '380', label: 'Invoice' }, { value: '381', label: 'Credit note' }, { value: '384', label: 'Corrected invoice' }, { value: '326', label: 'Partial invoice' }]} /></Field>
              <Field label="Currency"><Input value={inv.currency} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} /></Field>
              <Field label="Issue date"><Input type="date" value={inv.issueDate} onChange={(e) => set({ issueDate: e.target.value })} /></Field>
              <Field label="Due date"><Input type="date" value={inv.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} /></Field>
              <Field label="Delivery date"><Input type="date" value={inv.deliveryDate ?? ''} onChange={(e) => set({ deliveryDate: e.target.value || undefined })} /></Field>
              <Field label={format === 'facturx' ? 'Buyer reference' : 'Leitweg-ID (buyer reference)'}><Input value={inv.buyerReference ?? ''} onChange={(e) => set({ buyerReference: e.target.value || undefined })} /></Field>
              <Field label="Order number"><Input value={inv.orderReference ?? ''} onChange={(e) => set({ orderReference: e.target.value || undefined })} /></Field>
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">{partyForm('seller', 'From (you)')}{partyForm('buyer', 'Bill to')}</div>
          <Card className="space-y-2">
            <div className="text-sm font-semibold">Items</div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="py-1 text-left font-medium">Item</th><th className="w-20 text-left font-medium">Qty</th><th className="w-28 text-left font-medium">Unit</th><th className="w-28 text-left font-medium">Price</th><th className="w-36 text-left font-medium">VAT</th><th className="w-24 text-right font-medium">Amount</th><th className="w-8" /></tr></thead>
                <tbody>{inv.lines.map((l, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-2"><Input value={l.name} placeholder="Item or service" onChange={(e) => setLine(i, { name: e.target.value })} className="h-9" /><Input value={l.description ?? ''} placeholder="Details (optional)" onChange={(e) => setLine(i, { description: e.target.value || undefined })} className="mt-1 h-8 text-xs" /></td>
                    <td className="pr-2"><Input type="number" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} className="h-9" /></td>
                    <td className="pr-2"><Select value={l.unit} onChange={(v) => setLine(i, { unit: v })} options={UNITS} className="h-9" /></td>
                    <td className="pr-2"><Input type="number" step="0.01" value={l.price} onChange={(e) => setLine(i, { price: Number(e.target.value) })} className="h-9" /></td>
                    <td className="pr-2"><div className="flex gap-1"><Select value={l.vatCategory} onChange={(v) => setLine(i, { vatCategory: v })} options={VAT_CATS.map((c) => ({ value: c.value, label: c.value === 'S' ? 'Std' : c.label }))} className="h-9" />{l.vatCategory === 'S' && <Input type="number" step="any" value={l.vatRate} onChange={(e) => setLine(i, { vatRate: Number(e.target.value) })} className="h-9 w-16" aria-label="VAT rate in percent" />}</div></td>
                    <td className="pt-2 text-right font-mono">{money(t.lines[i] ?? 0)}</td>
                    <td className="pt-1"><button type="button" aria-label="Remove item" disabled={inv.lines.length < 2} onClick={() => set({ lines: inv.lines.filter((_, k) => k !== i) })} className="rounded p-1.5 text-muted hover:text-danger disabled:opacity-30 cursor-pointer"><Trash2 className="size-4" /></button></td>
                  </tr>))}</tbody>
              </table>
            </div>
            <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => set({ lines: [...inv.lines, { ...newLine(inv.lines.length + 1), vatRate: inv.lines[inv.lines.length - 1]?.vatRate ?? 19 }] })}>Add item</Button>
            {inv.lines.some((l) => !['S', 'Z'].includes(l.vatCategory)) && <Field label="VAT exemption reason (shown on the invoice)"><Input value={inv.exemptionReason ?? ''} placeholder="e.g. Reverse charge, Article 196 VAT Directive" onChange={(e) => set({ exemptionReason: e.target.value || undefined })} /></Field>}
            <div className="ml-auto max-w-xs space-y-1 pt-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Without VAT</span><span className="font-mono">{money(t.lineTotal)}</span></div>
              {t.vat.map((g) => <div key={g.category + g.rate} className="flex justify-between"><span className="text-muted">VAT {g.category === 'S' ? `${g.rate}%` : g.category}</span><span className="font-mono">{money(g.tax)}</span></div>)}
              <div className="flex justify-between border-t border-border pt-1 text-base font-bold"><span>Total</span><span className="font-mono">{money(t.grandTotal)}</span></div>
            </div>
          </Card>
          <Card className="space-y-2">
            <div className="text-sm font-semibold">Payment</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Method"><Select value={inv.payment.meansCode} onChange={(v) => set({ payment: { ...inv.payment, meansCode: v } })} options={[{ value: '58', label: 'SEPA bank transfer' }, { value: '30', label: 'Bank transfer' }, { value: '59', label: 'SEPA direct debit' }, { value: '48', label: 'Card' }, { value: '10', label: 'Cash' }, { value: '1', label: 'Other' }]} /></Field>
              <Field label="IBAN"><Input value={inv.payment.iban ?? ''} onChange={(e) => set({ payment: { ...inv.payment, iban: e.target.value } })} /></Field>
              <Field label="BIC"><Input value={inv.payment.bic ?? ''} onChange={(e) => set({ payment: { ...inv.payment, bic: e.target.value } })} /></Field>
              <Field label="Payment reference"><Input value={inv.payment.reference ?? ''} placeholder={inv.number} onChange={(e) => set({ payment: { ...inv.payment, reference: e.target.value || undefined } })} /></Field>
              <Field label="Terms" className="sm:col-span-2"><Input value={inv.payment.terms ?? ''} onChange={(e) => set({ payment: { ...inv.payment, terms: e.target.value || undefined } })} /></Field>
            </div>
            <Field label="Note on the invoice"><Textarea className="min-h-16 font-sans" value={inv.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} /></Field>
          </Card>
        </div>}
        side={<>
          <Field label="Format"><Segmented value={format} onChange={setFormat} options={[{ value: 'facturx', label: 'Factur-X / ZUGFeRD' }, { value: 'xr-cii', label: 'XRechnung CII' }, { value: 'xr-ubl', label: 'XRechnung UBL' }]} /></Field>
          <div className="-mt-3 text-xs text-muted">{format === 'facturx' ? 'A normal-looking PDF with the machine-readable invoice inside (EN 16931 profile). Accepted across the EU.' : 'Pure XML for German public sector and businesses that want XRechnung 3.0.'}</div>
          {format === 'facturx' && <>
            {ownPdf ? <FileChip file={ownPdf} onRemove={() => setOwnPdf(null)} /> : <label className={cn('flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-accent')}><Upload className="size-3.5" />Use my own PDF invoice instead<input type="file" hidden accept="application/pdf,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setOwnPdf(f); e.target.value = '' }} /></label>}
            {!ownPdf && <Field label="PDF language"><Segmented value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }, { value: 'fr', label: 'Français' }]} /></Field>}
            {!ownPdf && <div className="checker flex min-h-48 items-center justify-center rounded-xl p-2">{preview ? <img src={preview} alt="Invoice preview" className="max-h-80 bg-white shadow-lg" /> : <Spinner label="Preview…" />}</div>}
          </>}
          <div className="space-y-1.5"><div className="text-xs font-semibold uppercase tracking-wide text-muted">Checks ({problems.length ? `${problems.length} to fix` : 'all passed'})</div>
            {problems.length ? <CheckList checks={problems.slice(0, 8).map((r) => ({ level: r.level, title: r.text, detail: r.id }))} /> : <div className="rounded-xl border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">EN 16931 calculation and required-field checks passed.</div>}
          </div>
          {job.busy && <Progress value={job.progress} label="Building…" />}
          <ErrorNote error={job.error || imp.error || prev.error} />
          <Button className="w-full" size="lg" icon={format === 'facturx' ? <ReceiptEuro className="size-5" /> : <Download className="size-5" />} loading={job.busy} onClick={build}>{format === 'facturx' ? 'Create e-invoice PDF' : 'Download XML'}</Button>
          <button type="button" onClick={() => { setInv(initial()); setOwnPdf(null) }} className="mx-auto flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer"><RotateCcw className="size-3" />Start a new invoice</button>
          <Note>Everything is built in your browser. Your details are only stored if you press Remember my details. Check country-specific rules with your accountant.</Note>
        </>}
      />
    </div>
  )
}

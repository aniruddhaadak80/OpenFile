import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import { Plus, Trash2, Download, Save, FolderOpen, FilePlus2, ImagePlus, X, GripVertical, Building2, User, Receipt, Settings2, StickyNote, Eye, PencilLine, Sparkles } from 'lucide-react'
import { Button, Card, Field, Input, Textarea, Select, Switch, Segmented, Label, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, loadImage } from '@/lib/files'
import { uid } from './_adv/pages'
import { newDoc, LivePdfPreview } from './_adv/jspdf'
import { renderInvoice, calc, money, amountInWords, CURRENCIES, type Invoice, type LineItem, type TaxMode, type Template } from './_adv/invoice'

const CUR_KEY = 'openfile.invoice.current.v1'
const DRAFTS_KEY = 'openfile.invoice.drafts.v1'
const SEQ_KEY = 'openfile.invoice.seq.v1'
type Draft = { id: string; name: string; updated: number; data: Invoice }

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) }
const emptyParty = () => ({ name: '', address: '', taxId: '', email: '', phone: '' })
const nextNumber = () => { const n = (+(localStorage.getItem(SEQ_KEY) || '0')) + 1; return `INV-${new Date().getFullYear()}-${String(n).padStart(3, '0')}` }
const bumpSeq = () => localStorage.setItem(SEQ_KEY, String((+(localStorage.getItem(SEQ_KEY) || '0')) + 1))

function blank(prev?: Invoice): Invoice {
  return {
    template: prev?.template ?? 'modern', accent: prev?.accent ?? '#f5a524', currency: prev?.currency ?? 'INR', title: prev?.title ?? 'Tax Invoice',
    number: nextNumber(), date: iso(new Date()), due: addDays(15), placeOfSupply: '', poNumber: '',
    business: prev?.business ?? emptyParty(), client: emptyParty(), shipTo: '', showShipTo: false, logo: prev?.logo ?? null,
    items: [{ id: uid(), desc: '', hsn: '', qty: 1, rate: 0, tax: prev?.taxMode === 'none' ? 0 : 18 }],
    taxMode: prev?.taxMode ?? 'cgst', discountType: 'percent', discount: 0, shipping: 0, roundOff: prev?.roundOff ?? true,
    notes: prev?.notes ?? 'Thank you for your business.', terms: prev?.terms ?? 'Payment is due within 15 days of the invoice date.', payment: prev?.payment ?? '', signatory: prev?.signatory ?? 'Authorised Signatory',
  }
}
function sample(): Invoice {
  return {
    ...blank(), number: 'INV-2026-042', placeOfSupply: 'Karnataka (29)', poNumber: 'PO-7781', taxMode: 'igst',
    business: { name: 'Pixel & Pine Studio', address: '4th Floor, 12 Park Street\nKolkata, West Bengal 700016', taxId: '19ABCDE1234F1Z5', email: 'billing@pixelpine.in', phone: '+91 98300 12345' },
    client: { name: 'Acme Retail Pvt Ltd', address: '221 MG Road\nBengaluru, Karnataka 560001', taxId: '29AAACA1234B1Z2', email: 'accounts@acme.in', phone: '' },
    items: [
      { id: uid(), desc: 'Brand identity design, logo, colour system and guidelines', hsn: '998391', qty: 1, rate: 45000, tax: 18 },
      { id: uid(), desc: 'E-commerce website (8 templates, CMS setup)', hsn: '998314', qty: 1, rate: 120000, tax: 18 },
      { id: uid(), desc: 'Product photography (per image)', hsn: '998383', qty: 40, rate: 650, tax: 18 },
    ],
    discountType: 'percent', discount: 5, shipping: 0, payment: 'HDFC Bank · A/C 50100123456789 · IFSC HDFC0001234\nUPI: pixelpine@hdfcbank',
  }
}
function load(): Invoice { try { const s = localStorage.getItem(CUR_KEY); if (s) return { ...blank(), ...JSON.parse(s) } } catch { /* ignore */ } return blank() }

const TAX_MODES: { value: TaxMode; label: string }[] = [
  { value: 'cgst', label: 'GST · CGST + SGST (intra-state)' }, { value: 'igst', label: 'GST · IGST (inter-state)' }, { value: 'vat', label: 'VAT' }, { value: 'none', label: 'No tax' },
]
const ACCENTS = ['#f5a524', '#0ea5e9', '#059669', '#ef4444', '#14b8a6', '#111827']

export default function InvoiceGenerator() {
  const [inv, setInv] = useState<Invoice>(load)
  const [drafts, setDrafts] = useState<Draft[]>(() => { try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]') } catch { return [] } })
  const [showDrafts, setShowDrafts] = useState(false)
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')
  const [busy, setBusy] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)
  const t = useMemo(() => calc(inv), [inv])

  useEffect(() => { const h = setTimeout(() => { try { localStorage.setItem(CUR_KEY, JSON.stringify(inv)) } catch { /* quota */ } }, 400); return () => clearTimeout(h) }, [inv])

  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => setInv((s) => ({ ...s, [k]: v }))
  const setParty = (who: 'business' | 'client', k: keyof Invoice['business'], v: string) => setInv((s) => ({ ...s, [who]: { ...s[who], [k]: v } }))
  const setItem = (id: string, patch: Partial<LineItem>) => setInv((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const addItem = () => setInv((s) => ({ ...s, items: [...s.items, { id: uid(), desc: '', hsn: '', qty: 1, rate: 0, tax: s.items.at(-1)?.tax ?? (s.taxMode === 'none' ? 0 : 18) }] }))
  const gst = inv.taxMode === 'cgst' || inv.taxMode === 'igst'
  const taxLabel = gst ? 'GSTIN' : inv.taxMode === 'vat' ? 'VAT number' : 'Tax ID'

  async function build() {
    const { doc, family } = await newDoc('a4')
    renderInvoice(doc, family, inv)
    return doc.output('blob') as Blob
  }
  async function download() {
    setBusy(true)
    try { downloadBlob(await build(), `${(inv.number || 'invoice').replace(/[^\w.-]+/g, '_')}.pdf`, 'application/pdf'); toast('Invoice downloaded') }
    catch (e: any) { toast(e?.message || 'Could not create PDF', 'error') } finally { setBusy(false) }
  }
  function saveDraft() {
    const name = `${inv.number}${inv.client.name ? ' · ' + inv.client.name : ''}`
    const existing = drafts.find((d) => d.data.number === inv.number)
    const d: Draft = { id: existing?.id ?? uid(), name, updated: Date.now(), data: inv }
    const next = [d, ...drafts.filter((x) => x.id !== d.id)].slice(0, 30)
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(next)); setDrafts(next); toast(existing ? 'Draft updated' : 'Draft saved') } catch { toast('Storage is full, delete some drafts or remove the logo', 'error') }
  }
  function delDraft(id: string) { const next = drafts.filter((d) => d.id !== id); setDrafts(next); localStorage.setItem(DRAFTS_KEY, JSON.stringify(next)) }
  function newInvoice() { bumpSeq(); setInv(blank(inv)); toast('New invoice, your business details were kept', 'info') }
  async function onLogo(f: File) {
    try {
      const img = await loadImage(f)
      const s = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      set('logo', c.toDataURL('image/png'))
    } catch { toast('Could not read that image', 'error') }
  }

  const c = CURRENCIES.find((x) => x.code === inv.currency)!
  const m = (n: number) => money(n, inv.currency)

  const editor = (
    <div className="space-y-4">
      <Section icon={Settings2} title="Invoice">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><Input value={inv.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Invoice number"><Input value={inv.number} onChange={(e) => set('number', e.target.value)} /></Field>
          <Field label="Invoice date"><Input type="date" value={inv.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Due date"><Input type="date" value={inv.due} onChange={(e) => set('due', e.target.value)} /></Field>
          <Field label="Currency"><Select value={inv.currency} onChange={(v) => set('currency', v)} options={CURRENCIES.map((x) => ({ value: x.code, label: `${x.code} (${x.symbol})` }))} /></Field>
          <Field label="Tax"><Select value={inv.taxMode} onChange={(v) => set('taxMode', v)} options={TAX_MODES} /></Field>
          {gst && <Field label="Place of supply"><Input value={inv.placeOfSupply} onChange={(e) => set('placeOfSupply', e.target.value)} placeholder="e.g. Maharashtra (27)" /></Field>}
          <Field label="PO / reference"><Input value={inv.poNumber} onChange={(e) => set('poNumber', e.target.value)} placeholder="Optional" /></Field>
        </div>
      </Section>

      <Section icon={Building2} title="From (your business)">
        <div className="flex gap-3">
          <button type="button" onClick={() => logoRef.current?.click()} className="group relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface-2/50 text-muted transition hover:border-accent hover:text-accent cursor-pointer" title="Upload logo">
            {inv.logo ? <img src={inv.logo} alt="Logo" className="max-h-full max-w-full object-contain p-1" /> : <span className="flex flex-col items-center gap-1 text-[10px]"><ImagePlus className="size-5" />Logo</span>}
          </button>
          <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogo(f); e.target.value = '' }} />
          <div className="min-w-0 flex-1 space-y-2">
            <Input value={inv.business.name} onChange={(e) => setParty('business', 'name', e.target.value)} placeholder="Business name" />
            {inv.logo && <button className="text-xs text-muted hover:text-danger cursor-pointer" onClick={() => set('logo', null)}>Remove logo</button>}
          </div>
        </div>
        <PartyFields p={inv.business} taxLabel={taxLabel} onChange={(k, v) => setParty('business', k, v)} />
      </Section>

      <Section icon={User} title="Bill to">
        <Input value={inv.client.name} onChange={(e) => setParty('client', 'name', e.target.value)} placeholder="Client name" />
        <PartyFields p={inv.client} taxLabel={taxLabel} onChange={(k, v) => setParty('client', k, v)} />
        <Switch checked={inv.showShipTo} onChange={(v) => set('showShipTo', v)} label={<span className="text-sm">Different shipping address</span>} />
        {inv.showShipTo && <Textarea value={inv.shipTo} onChange={(e) => set('shipTo', e.target.value)} placeholder="Ship-to name & address" className="min-h-20 font-sans" />}
      </Section>

      <Section icon={Receipt} title="Line items" right={<span className="font-mono text-xs text-muted">{inv.items.length}</span>}>
        <div className="hidden grid-cols-[18px_1fr_64px_96px_64px_96px_28px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted sm:grid">
          <span /><span>Description{gst && ' / HSN'}</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">{inv.taxMode === 'none' ? '' : 'Tax %'}</span><span className="text-right">Amount</span><span />
        </div>
        <Reorder.Group axis="y" values={inv.items} onReorder={(items) => set('items', items)} className="space-y-2">
          <AnimatePresence initial={false}>
            {inv.items.map((it, i) => (
              <DragRow key={it.id} value={it}>{(grip) => (<>
                <span onPointerDown={grip} className="mt-3 touch-none" title="Drag to reorder"><GripVertical className="size-4 cursor-grab text-muted/60 active:cursor-grabbing" /></span>
                <div className="space-y-1.5">
                  <Input value={it.desc} onChange={(e) => setItem(it.id, { desc: e.target.value })} placeholder={`Item ${i + 1} description`} />
                  {gst && <Input value={it.hsn} onChange={(e) => setItem(it.id, { hsn: e.target.value })} placeholder="HSN / SAC code" className="h-8 text-xs" />}
                </div>
                <button type="button" onClick={() => set('items', inv.items.filter((x) => x.id !== it.id))} className="mt-2 grid size-7 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger cursor-pointer sm:order-last" aria-label="Remove item"><Trash2 className="size-4" /></button>
                <div className="col-span-3 grid grid-cols-4 gap-2 pl-[26px] sm:col-span-4 sm:col-start-3 sm:row-start-1 sm:grid-cols-[64px_96px_64px_96px] sm:pl-0">
                  <NumInput value={it.qty} onChange={(v) => setItem(it.id, { qty: v })} label="Qty" />
                  <NumInput value={it.rate} onChange={(v) => setItem(it.id, { rate: v })} label="Rate" />
                  {inv.taxMode !== 'none' ? <NumInput value={it.tax} onChange={(v) => setItem(it.id, { tax: v })} label="Tax %" list="tax-rates" /> : <span />}
                  <div className="flex h-10 items-center justify-end truncate text-right font-mono text-sm font-medium">{m(t.lines[i]?.amount ?? 0)}</div>
                </div>
              </>)}</DragRow>
            ))}
          </AnimatePresence>
        </Reorder.Group>
        <datalist id="tax-rates">{[0, 5, 12, 18, 28, 3, 0.25, 20, 7.5].map((r) => <option key={r} value={r} />)}</datalist>
        <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={addItem}>Add item</Button>
      </Section>

      <Section icon={Sparkles} title="Adjustments & totals">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Discount</Label>
            <div className="flex gap-2">
              <NumInput value={inv.discount} onChange={(v) => set('discount', v)} label="Discount" />
              <Segmented value={inv.discountType} onChange={(v) => set('discountType', v)} options={[{ value: 'percent', label: '%' }, { value: 'flat', label: c.symbol }]} />
            </div>
          </div>
          <div><Label>Shipping / other charges</Label><NumInput value={inv.shipping} onChange={(v) => set('shipping', v)} label="Shipping" /></div>
        </div>
        <Switch checked={inv.roundOff} onChange={(v) => set('roundOff', v)} label={<span className="text-sm">Round total to nearest whole unit</span>} />
        <div className="space-y-1.5 rounded-xl bg-surface-2/50 p-4 text-sm">
          <Row k="Subtotal" v={m(t.subtotal)} />
          {t.discount > 0 && <Row k="Discount" v={'−' + m(t.discount)} cls="text-success" />}
          {t.taxes.map((x) => <Row key={x.label} k={x.label} v={m(x.amount)} />)}
          {t.shipping > 0 && <Row k="Shipping" v={m(t.shipping)} />}
          {t.round !== 0 && <Row k="Round off" v={(t.round < 0 ? '−' : '+') + m(Math.abs(t.round))} />}
          <div className="flex items-baseline justify-between border-t border-border pt-2 text-base font-bold"><span>Total</span><motion.span key={t.total} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className="font-mono text-accent">{m(t.total)}</motion.span></div>
          <div className="pt-1 text-xs italic text-muted">{amountInWords(t.total, inv.currency)}</div>
        </div>
      </Section>

      <Section icon={StickyNote} title="Notes, terms & payment">
        <Field label="Payment details"><Textarea value={inv.payment} onChange={(e) => set('payment', e.target.value)} placeholder="Bank, account no., IFSC / SWIFT, UPI ID…" className="min-h-16 font-sans" /></Field>
        <Field label="Notes"><Textarea value={inv.notes} onChange={(e) => set('notes', e.target.value)} className="min-h-14 font-sans" /></Field>
        <Field label="Terms & conditions"><Textarea value={inv.terms} onChange={(e) => set('terms', e.target.value)} className="min-h-14 font-sans" /></Field>
        <Field label="Signatory"><Input value={inv.signatory} onChange={(e) => set('signatory', e.target.value)} /></Field>
      </Section>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2">
        <Segmented value={inv.template} onChange={(v: Template) => set('template', v)} options={[{ value: 'modern', label: 'Modern' }, { value: 'classic', label: 'Classic' }, { value: 'minimal', label: 'Minimal' }]} />
        <div className="flex items-center gap-1.5 px-2">
          {ACCENTS.map((a) => <button key={a} type="button" onClick={() => set('accent', a)} className={cn('size-5 rounded-full transition hover:scale-110 cursor-pointer', inv.accent === a && 'ring-2 ring-offset-2 ring-offset-surface')} style={{ background: a, ['--tw-ring-color' as any]: a }} aria-label={`Accent ${a}`} />)}
          <label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-border" style={{ background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }} title="Custom colour"><input type="color" value={inv.accent} onChange={(e) => set('accent', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></label>
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" icon={<FilePlus2 className="size-4" />} onClick={newInvoice}>New</Button>
          <Button size="sm" variant="ghost" icon={<Sparkles className="size-4" />} onClick={() => setInv(sample())}>Sample</Button>
          <Button size="sm" variant="ghost" icon={<Save className="size-4" />} onClick={saveDraft}>Save draft</Button>
          <Button size="sm" variant="ghost" icon={<FolderOpen className="size-4" />} onClick={() => setShowDrafts((v) => !v)}>Drafts{drafts.length ? ` (${drafts.length})` : ''}</Button>
          <Button size="sm" icon={<Download className="size-4" />} loading={busy} onClick={download}>Download PDF</Button>
        </div>
      </div>
      <AnimatePresence>
        {showDrafts && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="p-3">
              {drafts.length === 0 ? <div className="p-3 text-center text-sm text-muted">No saved drafts yet. Use “Save draft” to keep invoices on this device.</div> : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {drafts.map((d) => (
                    <li key={d.id} className="group flex items-center gap-2 rounded-xl border border-border p-2.5 transition hover:border-accent/50">
                      <button className="min-w-0 flex-1 text-left cursor-pointer" onClick={() => { setInv({ ...blank(), ...d.data }); setShowDrafts(false); toast('Draft loaded', 'info') }}>
                        <div className="truncate text-sm font-medium">{d.name}</div>
                        <div className="text-xs text-muted">{money(calc(d.data).total, d.data.currency)} · {new Date(d.updated).toLocaleDateString()}</div>
                      </button>
                      <button onClick={() => delDraft(d.id)} className="rounded-lg p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100 cursor-pointer" aria-label="Delete draft"><X className="size-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:hidden"><Segmented value={mobileTab} onChange={setMobileTab} options={[{ value: 'edit', label: <span className="inline-flex items-center gap-1"><PencilLine className="size-3.5" />Edit</span> }, { value: 'preview', label: <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />Preview</span> }]} /></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn(mobileTab === 'preview' && 'hidden lg:block')}>{editor}</div>
        <div className={cn('lg:sticky lg:top-24 lg:self-start', mobileTab === 'edit' && 'hidden lg:block')}>
          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-border bg-surface-2/50 p-4 scrollbar-thin">
            <LivePdfPreview build={build} deps={[inv]} />
          </div>
          <p className="mt-2 text-center text-xs text-muted">Live preview of the exact PDF.{inv.currency === 'INR' && ' The rupee is printed as “Rs.” for maximum font compatibility.'}</p>
        </div>
      </div>
    </div>
  )
}

function DragRow<T>({ value, children }: { value: T; children: (grip: (e: React.PointerEvent) => void) => React.ReactNode }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={value} dragListener={false} dragControls={controls} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
      className="grid grid-cols-[18px_1fr_28px] items-start gap-2 rounded-xl border border-border bg-surface-2/30 p-2 sm:grid-cols-[18px_1fr_64px_96px_64px_96px_28px] sm:border-0 sm:bg-transparent sm:p-0">
      {children((e) => controls.start(e))}
    </Reorder.Item>
  )
}

function Section({ icon: Icon, title, right, children }: { icon: React.ElementType; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2"><div className="grid size-7 place-items-center rounded-lg bg-accent/10 text-accent"><Icon className="size-4" /></div><h3 className="font-semibold">{title}</h3><div className="ml-auto">{right}</div></div>
      {children}
    </Card>
  )
}
function PartyFields({ p, taxLabel, onChange }: { p: Invoice['business']; taxLabel: string; onChange: (k: keyof Invoice['business'], v: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Textarea value={p.address} onChange={(e) => onChange('address', e.target.value)} placeholder="Address" className="min-h-[76px] font-sans sm:row-span-2" />
      <Input value={p.taxId} onChange={(e) => onChange('taxId', e.target.value.toUpperCase())} placeholder={taxLabel} />
      <div className="grid grid-cols-2 gap-2">
        <Input value={p.email} onChange={(e) => onChange('email', e.target.value)} placeholder="Email" type="email" />
        <Input value={p.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="Phone" />
      </div>
    </div>
  )
}
function NumInput({ value, onChange, label, list }: { value: number; onChange: (v: number) => void; label: string; list?: string }) {
  const [txt, setTxt] = useState(String(value ?? 0))
  useEffect(() => { if (parseFloat(txt) !== value) setTxt(String(value ?? 0)) }, [value])
  return <Input inputMode="decimal" aria-label={label} list={list} value={txt} onFocus={(e) => e.target.select()} onChange={(e) => { const s = e.target.value.replace(/[^\d.]/g, ''); setTxt(s); onChange(parseFloat(s) || 0) }} className="text-right font-mono" />
}
function Row({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return <div className="flex justify-between text-muted"><span>{k}</span><span className={cn('font-mono text-fg', cls)}>{v}</span></div>
}

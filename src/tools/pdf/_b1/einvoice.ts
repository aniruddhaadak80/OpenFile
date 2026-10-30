/* EN 16931 e-invoices: data model, totals, CII (Factur-X / ZUGFeRD / XRechnung) and UBL writers, a small XML reader,
 * a parser for both syntaxes, business-rule checks and a PDF renderer (pdf-lib + embedded Liberation Sans). Pure TS. */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export interface Party { name: string; street: string; city: string; zip: string; country: string; vatId: string; taxId?: string; email?: string; phone?: string; contact?: string; id?: string }
export interface Line { id: string; name: string; description?: string; qty: number; unit: string; price: number; vatCategory: string; vatRate: number }
export interface Invoice {
  number: string; issueDate: string; dueDate?: string; deliveryDate?: string; typeCode: string; currency: string; buyerReference?: string; orderReference?: string; note?: string
  seller: Party; buyer: Party; lines: Line[]
  payment: { meansCode: string; iban?: string; bic?: string; accountName?: string; terms?: string; reference?: string }
  exemptionReason?: string
}
export interface VatBreak { category: string; rate: number; basis: number; tax: number }
export interface Totals { lines: number[]; lineTotal: number; taxBasis: number; taxTotal: number; grandTotal: number; duePayable: number; vat: VatBreak[] }

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
export const UNITS: { value: string; label: string }[] = [
  { value: 'C62', label: 'piece' }, { value: 'H87', label: 'item' }, { value: 'HUR', label: 'hour' }, { value: 'DAY', label: 'day' }, { value: 'MON', label: 'month' },
  { value: 'KGM', label: 'kg' }, { value: 'MTR', label: 'metre' }, { value: 'LTR', label: 'litre' }, { value: 'MTK', label: 'm²' }, { value: 'LS', label: 'lump sum' }, { value: 'SET', label: 'set' },
]
export const VAT_CATS: { value: string; label: string }[] = [
  { value: 'S', label: 'Standard rate' }, { value: 'Z', label: 'Zero rated' }, { value: 'E', label: 'Exempt' }, { value: 'AE', label: 'Reverse charge' },
  { value: 'K', label: 'Intra-EU supply' }, { value: 'G', label: 'Export outside EU' }, { value: 'O', label: 'Not subject to VAT' },
]

export function totals(inv: Invoice): Totals {
  const lines = inv.lines.map((l) => r2(l.qty * l.price))
  const lineTotal = r2(lines.reduce((a, b) => a + b, 0))
  const groups = new Map<string, VatBreak>()
  inv.lines.forEach((l, i) => {
    const rate = ['S'].includes(l.vatCategory) ? l.vatRate : 0
    const k = `${l.vatCategory}|${rate}`
    const g = groups.get(k) ?? { category: l.vatCategory, rate, basis: 0, tax: 0 }
    g.basis = r2(g.basis + lines[i]); groups.set(k, g)
  })
  const vat = [...groups.values()].map((g) => ({ ...g, tax: r2((g.basis * g.rate) / 100) }))
  const taxTotal = r2(vat.reduce((a, g) => a + g.tax, 0))
  const grandTotal = r2(lineTotal + taxTotal)
  return { lines, lineTotal, taxBasis: lineTotal, taxTotal, grandTotal, duePayable: grandTotal, vat }
}

const x = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const amt = (n: number) => r2(n).toFixed(2)
const qtyS = (n: number) => String(Math.round(n * 10000) / 10000)
const d8 = (iso: string) => iso.replace(/-/g, '').slice(0, 8)
const exemption = (inv: Invoice, cat: string) => {
  if (cat === 'S' || cat === 'Z') return ''
  const reason = inv.exemptionReason || ({ AE: 'Reverse charge', K: 'Intra-community supply', G: 'Export outside the EU', E: 'Exempt from VAT', O: 'Not subject to VAT' } as Record<string, string>)[cat] || ''
  return reason
}

export type Profile = 'facturx' | 'xrechnung-cii'
export const GUIDELINE: Record<Profile | 'xrechnung-ubl', string> = {
  facturx: 'urn:cen.eu:en16931:2017',
  'xrechnung-cii': 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
  'xrechnung-ubl': 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
}

/* ---------------------------------------------------------------- CII (UN/CEFACT Cross Industry Invoice D16B) */
export function toCII(inv: Invoice, profile: Profile = 'facturx') {
  const t = totals(inv)
  const party = (p: Party, seller: boolean) => `${p.id ? `<ram:ID>${x(p.id)}</ram:ID>` : ''}<ram:Name>${x(p.name)}</ram:Name>${p.contact || p.email || p.phone ? `<ram:DefinedTradeContact>${p.contact ? `<ram:PersonName>${x(p.contact)}</ram:PersonName>` : ''}${p.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${x(p.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ''}${p.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${x(p.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ''}</ram:DefinedTradeContact>` : ''}<ram:PostalTradeAddress><ram:PostcodeCode>${x(p.zip)}</ram:PostcodeCode><ram:LineOne>${x(p.street)}</ram:LineOne><ram:CityName>${x(p.city)}</ram:CityName><ram:CountryID>${x(p.country.toUpperCase())}</ram:CountryID></ram:PostalTradeAddress>${p.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(p.email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}${p.taxId && seller ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${x(p.taxId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}${p.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(p.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}`
  const lines = inv.lines.map((l, i) => `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${x(l.id || i + 1)}</ram:LineID></ram:AssociatedDocumentLineDocument><ram:SpecifiedTradeProduct><ram:Name>${x(l.name)}</ram:Name>${l.description ? `<ram:Description>${x(l.description)}</ram:Description>` : ''}</ram:SpecifiedTradeProduct><ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${l.price.toFixed(2)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement><ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${x(l.unit)}">${qtyS(l.qty)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery><ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.vatCategory}</ram:CategoryCode>${l.vatCategory === 'S' || l.vatCategory === 'Z' ? `<ram:RateApplicablePercent>${l.vatCategory === 'S' ? l.vatRate : 0}</ram:RateApplicablePercent>` : '<ram:RateApplicablePercent>0</ram:RateApplicablePercent>'}</ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(t.lines[i])}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`).join('')
  const vat = t.vat.map((g) => { const reason = exemption(inv, g.category); return `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amt(g.tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${reason ? `<ram:ExemptionReason>${x(reason)}</ram:ExemptionReason>` : ''}<ram:BasisAmount>${amt(g.basis)}</ram:BasisAmount><ram:CategoryCode>${g.category}</ram:CategoryCode><ram:RateApplicablePercent>${g.rate}</ram:RateApplicablePercent></ram:ApplicableTradeTax>` }).join('')
  const pm = inv.payment
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext>${profile === 'xrechnung-cii' ? '<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>' : ''}<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${GUIDELINE[profile]}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>${x(inv.number)}</ram:ID><ram:TypeCode>${x(inv.typeCode)}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${d8(inv.issueDate)}</udt:DateTimeString></ram:IssueDateTime>${inv.note ? `<ram:IncludedNote><ram:Content>${x(inv.note)}</ram:Content></ram:IncludedNote>` : ''}</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>${lines}
<ram:ApplicableHeaderTradeAgreement>${inv.buyerReference ? `<ram:BuyerReference>${x(inv.buyerReference)}</ram:BuyerReference>` : ''}<ram:SellerTradeParty>${party(inv.seller, true)}</ram:SellerTradeParty><ram:BuyerTradeParty>${party(inv.buyer, false)}</ram:BuyerTradeParty>${inv.orderReference ? `<ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${x(inv.orderReference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>` : ''}</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery>${inv.deliveryDate ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d8(inv.deliveryDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ''}</ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement>${pm.reference ? `<ram:PaymentReference>${x(pm.reference)}</ram:PaymentReference>` : ''}<ram:InvoiceCurrencyCode>${x(inv.currency)}</ram:InvoiceCurrencyCode><ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>${x(pm.meansCode)}</ram:TypeCode>${pm.iban ? `<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${x(pm.iban.replace(/\s+/g, ''))}</ram:IBANID>${pm.accountName ? `<ram:AccountName>${x(pm.accountName)}</ram:AccountName>` : ''}</ram:PayeePartyCreditorFinancialAccount>` : ''}${pm.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${x(pm.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}</ram:SpecifiedTradeSettlementPaymentMeans>${vat}${pm.terms || inv.dueDate ? `<ram:SpecifiedTradePaymentTerms>${pm.terms ? `<ram:Description>${x(pm.terms)}</ram:Description>` : ''}${inv.dueDate ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${d8(inv.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>` : ''}</ram:SpecifiedTradePaymentTerms>` : ''}<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${amt(t.lineTotal)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${amt(t.taxBasis)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="${x(inv.currency)}">${amt(t.taxTotal)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${amt(t.grandTotal)}</ram:GrandTotalAmount><ram:DuePayableAmount>${amt(t.duePayable)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation></ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`
}

/* ---------------------------------------------------------------- UBL 2.1 */
export function toUBL(inv: Invoice) {
  const t = totals(inv)
  const credit = inv.typeCode === '381'
  const root = credit ? 'CreditNote' : 'Invoice'
  const party = (p: Party, tag: string) => `<cac:${tag}><cac:Party>${p.email ? `<cbc:EndpointID schemeID="EM">${x(p.email)}</cbc:EndpointID>` : ''}<cac:PartyName><cbc:Name>${x(p.name)}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>${x(p.street)}</cbc:StreetName><cbc:CityName>${x(p.city)}</cbc:CityName><cbc:PostalZone>${x(p.zip)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>${x(p.country.toUpperCase())}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>${p.vatId ? `<cac:PartyTaxScheme><cbc:CompanyID>${x(p.vatId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}<cac:PartyLegalEntity><cbc:RegistrationName>${x(p.name)}</cbc:RegistrationName></cac:PartyLegalEntity>${p.contact || p.phone || p.email ? `<cac:Contact>${p.contact ? `<cbc:Name>${x(p.contact)}</cbc:Name>` : ''}${p.phone ? `<cbc:Telephone>${x(p.phone)}</cbc:Telephone>` : ''}${p.email ? `<cbc:ElectronicMail>${x(p.email)}</cbc:ElectronicMail>` : ''}</cac:Contact>` : ''}</cac:Party></cac:${tag}>`
  const cat = (c: string, rate: number) => `<cbc:ID>${c}</cbc:ID><cbc:Percent>${c === 'S' ? rate : 0}</cbc:Percent>`
  const C = `currencyID="${x(inv.currency)}"`
  const lineTag = credit ? 'CreditNoteLine' : 'InvoiceLine', qtyTag = credit ? 'CreditedQuantity' : 'InvoicedQuantity'
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>${GUIDELINE['xrechnung-ubl']}</cbc:CustomizationID><cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
<cbc:ID>${x(inv.number)}</cbc:ID><cbc:IssueDate>${x(inv.issueDate)}</cbc:IssueDate>${inv.dueDate && !credit ? `<cbc:DueDate>${x(inv.dueDate)}</cbc:DueDate>` : ''}<cbc:${credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${x(inv.typeCode)}</cbc:${credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'}>${inv.note ? `<cbc:Note>${x(inv.note)}</cbc:Note>` : ''}<cbc:DocumentCurrencyCode>${x(inv.currency)}</cbc:DocumentCurrencyCode>${inv.buyerReference ? `<cbc:BuyerReference>${x(inv.buyerReference)}</cbc:BuyerReference>` : ''}${inv.orderReference ? `<cac:OrderReference><cbc:ID>${x(inv.orderReference)}</cbc:ID></cac:OrderReference>` : ''}
${party(inv.seller, 'AccountingSupplierParty')}${party(inv.buyer, 'AccountingCustomerParty')}${inv.deliveryDate ? `<cac:Delivery><cbc:ActualDeliveryDate>${x(inv.deliveryDate)}</cbc:ActualDeliveryDate></cac:Delivery>` : ''}
<cac:PaymentMeans><cbc:PaymentMeansCode>${x(inv.payment.meansCode)}</cbc:PaymentMeansCode>${inv.payment.reference ? `<cbc:PaymentID>${x(inv.payment.reference)}</cbc:PaymentID>` : ''}${inv.payment.iban ? `<cac:PayeeFinancialAccount><cbc:ID>${x(inv.payment.iban.replace(/\s+/g, ''))}</cbc:ID>${inv.payment.accountName ? `<cbc:Name>${x(inv.payment.accountName)}</cbc:Name>` : ''}${inv.payment.bic ? `<cac:FinancialInstitutionBranch><cbc:ID>${x(inv.payment.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ''}</cac:PayeeFinancialAccount>` : ''}</cac:PaymentMeans>${inv.payment.terms ? `<cac:PaymentTerms><cbc:Note>${x(inv.payment.terms)}</cbc:Note></cac:PaymentTerms>` : ''}
<cac:TaxTotal><cbc:TaxAmount ${C}>${amt(t.taxTotal)}</cbc:TaxAmount>${t.vat.map((g) => { const reason = exemption(inv, g.category); return `<cac:TaxSubtotal><cbc:TaxableAmount ${C}>${amt(g.basis)}</cbc:TaxableAmount><cbc:TaxAmount ${C}>${amt(g.tax)}</cbc:TaxAmount><cac:TaxCategory>${cat(g.category, g.rate)}${reason ? `<cbc:TaxExemptionReason>${x(reason)}</cbc:TaxExemptionReason>` : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>` }).join('')}</cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount ${C}>${amt(t.lineTotal)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount ${C}>${amt(t.taxBasis)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount ${C}>${amt(t.grandTotal)}</cbc:TaxInclusiveAmount><cbc:PayableAmount ${C}>${amt(t.duePayable)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
${inv.lines.map((l, i) => `<cac:${lineTag}><cbc:ID>${x(l.id || i + 1)}</cbc:ID><cbc:${qtyTag} unitCode="${x(l.unit)}">${qtyS(l.qty)}</cbc:${qtyTag}><cbc:LineExtensionAmount ${C}>${amt(t.lines[i])}</cbc:LineExtensionAmount><cac:Item>${l.description ? `<cbc:Description>${x(l.description)}</cbc:Description>` : ''}<cbc:Name>${x(l.name)}</cbc:Name><cac:ClassifiedTaxCategory>${cat(l.vatCategory, l.vatRate)}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount ${C}>${l.price.toFixed(2)}</cbc:PriceAmount></cac:Price></cac:${lineTag}>`).join('\n')}
</${root}>
`
}

/* ---------------------------------------------------------------- tiny XML reader (namespace prefixes dropped) */
export interface XNode { name: string; attrs: Record<string, string>; children: XNode[]; text: string }
export function parseXml(src: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' }
  const stack: XNode[] = [root]
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  const ent = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e.toLowerCase()])
  const local = (n: string) => n.replace(/^[^:]*:/, '')
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1]
    if (m[1] !== undefined) top.text += m[1]
    else if (m[2]) { if (stack.length > 1) stack.pop() }
    else if (m[3]) {
      const attrs: Record<string, string> = {}
      for (const a of (m[4] ?? '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[local(a[1])] = ent(a[2] ?? a[3] ?? '')
      const node: XNode = { name: local(m[3]), attrs, children: [], text: '' }
      top.children.push(node)
      if (!m[5]) stack.push(node)
    } else if (m[6] !== undefined) top.text += ent(m[6])
  }
  const doc = root.children[0]
  if (!doc) throw new Error('This file does not contain XML.')
  return doc
}
const kid = (n: XNode | undefined, ...path: string[]): XNode | undefined => { let c = n; for (const p of path) { c = c?.children.find((k) => k.name === p); if (!c) return undefined } return c }
const kidsOf = (n: XNode | undefined, name: string) => (n ? n.children.filter((k) => k.name === name) : [])
const txt = (n: XNode | undefined, ...path: string[]) => (kid(n, ...path)?.text ?? '').trim()
const num = (s: string) => (s ? Number(s) : 0)
const fromD8 = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s)

export type Syntax = 'CII' | 'UBL'
export interface Parsed { syntax: Syntax; guideline: string; invoice: Invoice; declared: { lineTotal?: number; taxBasis?: number; taxTotal?: number; grandTotal?: number; duePayable?: number; vat: VatBreak[]; lineAmounts: number[] } }

export function parseInvoice(xml: string): Parsed {
  // binary or non-XML files (a photo, an audio file) get a plain message instead of garbled characters
  if (!/^\s*</.test(xml.replace(/^\uFEFF/, ''))) throw new Error('This file is not an XML e-invoice. Choose a ZUGFeRD, Factur-X or XRechnung XML file (CII or UBL).')
  const doc = parseXml(xml)
  if (doc.name === 'CrossIndustryInvoice') return parseCII(doc)
  if (doc.name === 'Invoice' || doc.name === 'CreditNote') return parseUBL(doc)
  throw new Error(/^[\w.-]{1,60}$/.test(doc.name) ? `Unknown e-invoice format (root element "${doc.name}"). Expected a CII or UBL invoice.` : 'Unknown e-invoice format. Expected a CII or UBL invoice.')
}
function parseCII(d: XNode): Parsed {
  const tx = kid(d, 'SupplyChainTradeTransaction')
  const ag = kid(tx, 'ApplicableHeaderTradeAgreement'), st = kid(tx, 'ApplicableHeaderTradeSettlement')
  const party = (p: XNode | undefined): Party => {
    const regs = kidsOf(p, 'SpecifiedTaxRegistration').map((r) => kid(r, 'ID'))
    const addr = kid(p, 'PostalTradeAddress')
    return { name: txt(p, 'Name'), id: txt(p, 'ID') || undefined, street: [txt(addr, 'LineOne'), txt(addr, 'LineTwo')].filter(Boolean).join(', '), city: txt(addr, 'CityName'), zip: txt(addr, 'PostcodeCode'), country: txt(addr, 'CountryID'),
      vatId: (regs.find((r) => r?.attrs.schemeID === 'VA')?.text ?? '').trim(), taxId: (regs.find((r) => r?.attrs.schemeID === 'FC')?.text ?? '').trim() || undefined,
      email: txt(p, 'URIUniversalCommunication', 'URIID') || txt(p, 'DefinedTradeContact', 'EmailURIUniversalCommunication', 'URIID') || undefined, phone: txt(p, 'DefinedTradeContact', 'TelephoneUniversalCommunication', 'CompleteNumber') || undefined, contact: txt(p, 'DefinedTradeContact', 'PersonName') || undefined }
  }
  const lineAmounts: number[] = []
  const lines: Line[] = kidsOf(tx, 'IncludedSupplyChainTradeLineItem').map((li) => {
    const tax = kid(li, 'SpecifiedLineTradeSettlement', 'ApplicableTradeTax')
    lineAmounts.push(num(txt(li, 'SpecifiedLineTradeSettlement', 'SpecifiedTradeSettlementLineMonetarySummation', 'LineTotalAmount')))
    const q = kid(li, 'SpecifiedLineTradeDelivery', 'BilledQuantity')
    const basis = num(txt(li, 'SpecifiedLineTradeAgreement', 'NetPriceProductTradePrice', 'BasisQuantity')) || 1
    return { id: txt(li, 'AssociatedDocumentLineDocument', 'LineID'), name: txt(li, 'SpecifiedTradeProduct', 'Name'), description: txt(li, 'SpecifiedTradeProduct', 'Description') || undefined, qty: num(q?.text.trim() ?? ''), unit: q?.attrs.unitCode ?? 'C62', price: num(txt(li, 'SpecifiedLineTradeAgreement', 'NetPriceProductTradePrice', 'ChargeAmount')) / basis, vatCategory: txt(tax, 'CategoryCode'), vatRate: num(txt(tax, 'RateApplicablePercent')) }
  })
  const pmN = kid(st, 'SpecifiedTradeSettlementPaymentMeans')
  const sum = kid(st, 'SpecifiedTradeSettlementHeaderMonetarySummation')
  const terms = kid(st, 'SpecifiedTradePaymentTerms')
  const inv: Invoice = {
    number: txt(d, 'ExchangedDocument', 'ID'), typeCode: txt(d, 'ExchangedDocument', 'TypeCode'), issueDate: fromD8(txt(d, 'ExchangedDocument', 'IssueDateTime', 'DateTimeString')),
    dueDate: fromD8(txt(terms, 'DueDateDateTime', 'DateTimeString')) || undefined, deliveryDate: fromD8(txt(tx, 'ApplicableHeaderTradeDelivery', 'ActualDeliverySupplyChainEvent', 'OccurrenceDateTime', 'DateTimeString')) || undefined,
    currency: txt(st, 'InvoiceCurrencyCode'), buyerReference: txt(ag, 'BuyerReference') || undefined, orderReference: txt(ag, 'BuyerOrderReferencedDocument', 'IssuerAssignedID') || undefined,
    note: kidsOf(kid(d, 'ExchangedDocument'), 'IncludedNote').map((n) => txt(n, 'Content')).filter(Boolean).join('\n') || undefined,
    seller: party(kid(ag, 'SellerTradeParty')), buyer: party(kid(ag, 'BuyerTradeParty')), lines,
    payment: { meansCode: txt(pmN, 'TypeCode'), iban: txt(pmN, 'PayeePartyCreditorFinancialAccount', 'IBANID') || undefined, accountName: txt(pmN, 'PayeePartyCreditorFinancialAccount', 'AccountName') || undefined, bic: txt(pmN, 'PayeeSpecifiedCreditorFinancialInstitution', 'BICID') || undefined, terms: txt(terms, 'Description') || undefined, reference: txt(st, 'PaymentReference') || undefined },
  }
  const vat = kidsOf(st, 'ApplicableTradeTax').map((g) => ({ category: txt(g, 'CategoryCode'), rate: num(txt(g, 'RateApplicablePercent')), basis: num(txt(g, 'BasisAmount')), tax: num(txt(g, 'CalculatedAmount')) }))
  inv.exemptionReason = kidsOf(st, 'ApplicableTradeTax').map((g) => txt(g, 'ExemptionReason')).find(Boolean)
  const opt = (s: string) => (s ? Number(s) : undefined)
  return { syntax: 'CII', guideline: txt(d, 'ExchangedDocumentContext', 'GuidelineSpecifiedDocumentContextParameter', 'ID'), invoice: inv,
    declared: { lineTotal: opt(txt(sum, 'LineTotalAmount')), taxBasis: opt(txt(sum, 'TaxBasisTotalAmount')), taxTotal: opt(kidsOf(sum, 'TaxTotalAmount')[0]?.text.trim() ?? ''), grandTotal: opt(txt(sum, 'GrandTotalAmount')), duePayable: opt(txt(sum, 'DuePayableAmount')), vat, lineAmounts } }
}
function parseUBL(d: XNode): Parsed {
  const credit = d.name === 'CreditNote'
  const party = (p: XNode | undefined): Party => {
    const pp = kid(p, 'Party'), a = kid(pp, 'PostalAddress')
    return { name: txt(pp, 'PartyLegalEntity', 'RegistrationName') || txt(pp, 'PartyName', 'Name'), street: [txt(a, 'StreetName'), txt(a, 'AdditionalStreetName')].filter(Boolean).join(', '), city: txt(a, 'CityName'), zip: txt(a, 'PostalZone'), country: txt(a, 'Country', 'IdentificationCode'),
      vatId: kidsOf(pp, 'PartyTaxScheme').map((t) => ({ id: txt(t, 'CompanyID'), s: txt(t, 'TaxScheme', 'ID') })).find((t) => t.s === 'VAT')?.id ?? '', email: txt(pp, 'Contact', 'ElectronicMail') || txt(pp, 'EndpointID') || undefined, phone: txt(pp, 'Contact', 'Telephone') || undefined, contact: txt(pp, 'Contact', 'Name') || undefined }
  }
  const lineAmounts: number[] = []
  const lines: Line[] = kidsOf(d, credit ? 'CreditNoteLine' : 'InvoiceLine').map((li) => {
    const q = kid(li, credit ? 'CreditedQuantity' : 'InvoicedQuantity')
    const ct = kid(li, 'Item', 'ClassifiedTaxCategory')
    lineAmounts.push(num(txt(li, 'LineExtensionAmount')))
    const base = num(txt(li, 'Price', 'BaseQuantity')) || 1
    return { id: txt(li, 'ID'), name: txt(li, 'Item', 'Name'), description: txt(li, 'Item', 'Description') || undefined, qty: num(q?.text.trim() ?? ''), unit: q?.attrs.unitCode ?? 'C62', price: num(txt(li, 'Price', 'PriceAmount')) / base, vatCategory: txt(ct, 'ID'), vatRate: num(txt(ct, 'Percent')) }
  })
  const pm = kid(d, 'PaymentMeans'), lmt = kid(d, 'LegalMonetaryTotal')
  const taxTotals = kidsOf(d, 'TaxTotal')
  const tt = taxTotals.find((t) => kidsOf(t, 'TaxSubtotal').length) ?? taxTotals[0]
  const inv: Invoice = {
    number: txt(d, 'ID'), typeCode: txt(d, credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'), issueDate: txt(d, 'IssueDate'), dueDate: txt(d, 'DueDate') || txt(pm, 'PaymentDueDate') || undefined, deliveryDate: txt(d, 'Delivery', 'ActualDeliveryDate') || undefined,
    currency: txt(d, 'DocumentCurrencyCode'), buyerReference: txt(d, 'BuyerReference') || undefined, orderReference: txt(d, 'OrderReference', 'ID') || undefined, note: kidsOf(d, 'Note').map((n) => n.text.trim()).join('\n') || undefined,
    seller: party(kid(d, 'AccountingSupplierParty')), buyer: party(kid(d, 'AccountingCustomerParty')), lines,
    payment: { meansCode: txt(pm, 'PaymentMeansCode'), iban: txt(pm, 'PayeeFinancialAccount', 'ID') || undefined, accountName: txt(pm, 'PayeeFinancialAccount', 'Name') || undefined, bic: txt(pm, 'PayeeFinancialAccount', 'FinancialInstitutionBranch', 'ID') || undefined, terms: txt(d, 'PaymentTerms', 'Note') || undefined, reference: txt(pm, 'PaymentID') || undefined },
  }
  const vat = kidsOf(tt, 'TaxSubtotal').map((s) => ({ category: txt(s, 'TaxCategory', 'ID'), rate: num(txt(s, 'TaxCategory', 'Percent')), basis: num(txt(s, 'TaxableAmount')), tax: num(txt(s, 'TaxAmount')) }))
  inv.exemptionReason = kidsOf(tt, 'TaxSubtotal').map((s) => txt(s, 'TaxCategory', 'TaxExemptionReason')).find(Boolean)
  const opt = (s: string) => (s ? Number(s) : undefined)
  return { syntax: 'UBL', guideline: txt(d, 'CustomizationID'), invoice: inv,
    declared: { lineTotal: opt(txt(lmt, 'LineExtensionAmount')), taxBasis: opt(txt(lmt, 'TaxExclusiveAmount')), taxTotal: opt(txt(tt, 'TaxAmount')), grandTotal: opt(txt(lmt, 'TaxInclusiveAmount')), duePayable: opt(txt(lmt, 'PayableAmount')), vat, lineAmounts } }
}

/* ---------------------------------------------------------------- business rules (EN 16931 subset + XRechnung basics) */
export interface Rule { id: string; level: 'fail' | 'warn' | 'pass'; text: string }
export function checkRules(p: Parsed): Rule[] {
  const inv = p.invoice, d = p.declared, out: Rule[] = []
  const add = (id: string, ok: boolean, text: string, level: 'fail' | 'warn' = 'fail') => out.push({ id, level: ok ? 'pass' : level, text })
  const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 0.011
  add('BR-01', !!p.guideline, 'Specification identifier is present')
  add('BR-02', !!inv.number, 'Invoice number is present')
  add('BR-03', /^\d{4}-\d{2}-\d{2}$/.test(inv.issueDate), 'Issue date is present and valid')
  add('BR-04', !!inv.typeCode, 'Invoice type code is present')
  add('BR-05', /^[A-Z]{3}$/.test(inv.currency), 'Currency code is present')
  add('BR-06', !!inv.seller.name, 'Seller name is present')
  add('BR-07', !!inv.buyer.name, 'Buyer name is present')
  add('BR-09', /^[A-Z]{2}$/.test(inv.seller.country.toUpperCase()), 'Seller country code is present')
  add('BR-11', /^[A-Z]{2}$/.test(inv.buyer.country.toUpperCase()), 'Buyer country code is present')
  add('BR-16', inv.lines.length > 0, 'At least one invoice line')
  inv.lines.forEach((l, i) => {
    if (!l.name) out.push({ id: 'BR-25', level: 'fail', text: `Line ${i + 1}: item name is missing` })
    if (!l.vatCategory) out.push({ id: 'BR-CO-04', level: 'fail', text: `Line ${i + 1}: VAT category is missing` })
    const expect = r2(l.qty * l.price)
    if (d.lineAmounts[i] !== undefined && Math.abs(d.lineAmounts[i] - expect) > 0.011) out.push({ id: 'BR-LINE', level: 'warn', text: `Line ${i + 1}: net amount ${d.lineAmounts[i].toFixed(2)} differs from quantity × price (${expect.toFixed(2)})` })
  })
  const sumLines = r2(d.lineAmounts.reduce((a, b) => a + b, 0))
  add('BR-CO-10', near(d.lineTotal, sumLines), `Sum of line amounts (${sumLines.toFixed(2)}) equals the line total (${d.lineTotal?.toFixed(2) ?? 'missing'})`)
  const vatSum = r2(d.vat.reduce((a, g) => a + g.tax, 0))
  add('BR-CO-14', near(d.taxTotal, vatSum), `VAT total (${d.taxTotal?.toFixed(2) ?? 'missing'}) equals the sum of the VAT breakdown (${vatSum.toFixed(2)})`)
  if (d.taxBasis !== undefined && d.taxTotal !== undefined) add('BR-CO-15', near(d.grandTotal, r2(d.taxBasis + d.taxTotal)), `Total with VAT (${d.grandTotal?.toFixed(2)}) equals total without VAT plus VAT (${r2(d.taxBasis + d.taxTotal).toFixed(2)})`)
  for (const g of d.vat) {
    const basis = r2(inv.lines.reduce((a, l, i) => a + (l.vatCategory === g.category && (g.category !== 'S' || l.vatRate === g.rate) ? d.lineAmounts[i] ?? 0 : 0), 0))
    add(`BR-${g.category}-08`, Math.abs(basis - g.basis) < 0.011, `VAT ${g.category} ${g.rate}%: taxable amount ${g.basis.toFixed(2)} matches the lines (${basis.toFixed(2)})`)
    add(`BR-${g.category}-09`, Math.abs(r2((g.basis * g.rate) / 100) - g.tax) < 0.011, `VAT ${g.category} ${g.rate}%: VAT amount ${g.tax.toFixed(2)} is taxable amount × rate`)
  }
  if (inv.lines.some((l) => l.vatCategory === 'S')) add('BR-S-02', !!(inv.seller.vatId || inv.seller.taxId), 'Seller VAT number or tax number is present (standard rated items)')
  if (inv.lines.some((l) => l.vatCategory === 'AE')) add('BR-AE-02', !!inv.seller.vatId && !!inv.buyer.vatId, 'Seller and buyer VAT numbers are present (reverse charge)')
  if (inv.lines.some((l) => l.vatCategory === 'K')) add('BR-IC-02', !!inv.seller.vatId && !!inv.buyer.vatId, 'Seller and buyer VAT numbers are present (intra-EU supply)')
  if ((d.duePayable ?? 0) > 0) add('BR-CO-25', !!(inv.dueDate || inv.payment.terms), 'Due date or payment terms are given for an amount due', 'warn')
  if (/xrechnung/.test(p.guideline)) {
    add('BR-DE-15', !!inv.buyerReference, 'Buyer reference (Leitweg-ID) is present')
    add('BR-DE-1', !!inv.payment.meansCode, 'Payment instructions are present')
    add('BR-DE-2', !!(inv.seller.contact || inv.seller.email || inv.seller.phone), 'Seller contact is given')
    if (inv.payment.meansCode === '58') add('BR-DE-23', !!inv.payment.iban, 'IBAN is given for SEPA credit transfer')
  }
  if (inv.payment.iban) add('IBAN', ibanOk(inv.payment.iban), `IBAN ${inv.payment.iban} has a valid checksum`, 'warn')
  return out
}
export function ibanOk(iban: string) {
  const s = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
  let m = 0; for (const ch of r) m = (m * 10 + Number(ch)) % 97
  return m === 1
}

/* ---------------------------------------------------------------- PDF rendering */
export const LABELS = {
  en: { invoice: 'Invoice', credit: 'Credit note', number: 'Invoice no.', date: 'Date', due: 'Due date', delivery: 'Delivery date', ref: 'Buyer reference', order: 'Order', to: 'Bill to', from: 'From', item: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price', vat: 'VAT', amount: 'Amount', net: 'Total without VAT', taxTotal: 'VAT total', total: 'Total', pay: 'Payment', iban: 'IBAN', bic: 'BIC', vatId: 'VAT ID', taxId: 'Tax no.', terms: 'Terms', reference: 'Payment reference', page: 'Page' },
  de: { invoice: 'Rechnung', credit: 'Gutschrift', number: 'Rechnungsnr.', date: 'Datum', due: 'Fällig am', delivery: 'Leistungsdatum', ref: 'Leitweg-ID / Referenz', order: 'Bestellung', to: 'Rechnung an', from: 'Von', item: 'Beschreibung', qty: 'Menge', unit: 'Einheit', price: 'Einzelpreis', vat: 'USt.', amount: 'Betrag', net: 'Summe netto', taxTotal: 'Umsatzsteuer', total: 'Gesamtbetrag', pay: 'Zahlung', iban: 'IBAN', bic: 'BIC', vatId: 'USt-IdNr.', taxId: 'Steuernr.', terms: 'Bedingungen', reference: 'Verwendungszweck', page: 'Seite' },
  fr: { invoice: 'Facture', credit: 'Avoir', number: 'Facture n°', date: 'Date', due: 'Échéance', delivery: 'Date de livraison', ref: 'Référence acheteur', order: 'Commande', to: 'Facturé à', from: 'De', item: 'Désignation', qty: 'Qté', unit: 'Unité', price: 'Prix unitaire', vat: 'TVA', amount: 'Montant', net: 'Total HT', taxTotal: 'Total TVA', total: 'Total TTC', pay: 'Paiement', iban: 'IBAN', bic: 'BIC', vatId: 'N° TVA', taxId: 'N° fiscal', terms: 'Conditions', reference: 'Référence de paiement', page: 'Page' },
}
export type Lang = keyof typeof LABELS
export async function renderInvoicePdf(inv: Invoice, fonts: { regular: Uint8Array; bold: Uint8Array; fontkit: any }, o: { lang: Lang; accent?: [number, number, number]; logo?: { bytes: Uint8Array; png: boolean } } = { lang: 'en' }) {
  const L = LABELS[o.lang]
  const doc = await PDFDocument.create()
  doc.registerFontkit(fonts.fontkit)
  const F = await doc.embedFont(fonts.regular, { subset: true }), B = await doc.embedFont(fonts.bold, { subset: true })
  const t = totals(inv)
  const accent = o.accent ?? [0.96, 0.65, 0.14]
  const A = rgb(...accent), ink = rgb(0.1, 0.11, 0.13), mute = rgb(0.42, 0.44, 0.48), line = rgb(0.86, 0.87, 0.89)
  const W = 595.28, H = 841.89, M = 48
  const money = (n: number) => new Intl.NumberFormat(o.lang === 'en' ? 'en-GB' : o.lang, { style: 'currency', currency: inv.currency || 'EUR' }).format(n)
  const date = (s?: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString(o.lang === 'en' ? 'en-GB' : o.lang) : '')
  let page = doc.addPage([W, H]); let y = H - M
  const text = (p: PDFPage, s: string, x: number, yy: number, size = 9.5, f: PDFFont = F, color = ink, align: 'left' | 'right' = 'left') => { const w = f.widthOfTextAtSize(s, size); p.drawText(s, { x: align === 'right' ? x - w : x, y: yy, size, font: f, color }) }
  const wrap = (s: string, f: PDFFont, size: number, max: number) => { const out: string[] = []; for (const para of s.split('\n')) { let cur = ''; for (const w of para.split(/\s+/)) { const tryS = cur ? cur + ' ' + w : w; if (f.widthOfTextAtSize(tryS, size) > max && cur) { out.push(cur); cur = w } else cur = tryS } out.push(cur) } return out }
  // header band
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: A })
  if (o.logo) { const img = o.logo.png ? await doc.embedPng(o.logo.bytes) : await doc.embedJpg(o.logo.bytes); const s = Math.min(140 / img.width, 48 / img.height); page.drawImage(img, { x: M, y: y - img.height * s + 6, width: img.width * s, height: img.height * s }) }
  else text(page, inv.seller.name, M, y - 14, 15, B)
  text(page, inv.typeCode === '381' ? L.credit : L.invoice, W - M, y - 14, 22, B, ink, 'right')
  y -= 44
  const meta: [string, string][] = [[L.number, inv.number], [L.date, date(inv.issueDate)]]
  if (inv.dueDate) meta.push([L.due, date(inv.dueDate)]); if (inv.deliveryDate) meta.push([L.delivery, date(inv.deliveryDate)])
  if (inv.buyerReference) meta.push([L.ref, inv.buyerReference]); if (inv.orderReference) meta.push([L.order, inv.orderReference])
  meta.forEach(([k, v], i) => { text(page, k, W - M - 190, y - i * 13, 8.5, F, mute); text(page, v, W - M, y - i * 13, 9, B, ink, 'right') })
  const block = (title: string, p: Party, x: number, yy: number) => {
    text(page, title.toUpperCase(), x, yy, 7.5, B, mute); yy -= 13
    const rows = [p.name, p.street, `${p.zip} ${p.city}`.trim(), p.country.toUpperCase(), p.vatId ? `${L.vatId}: ${p.vatId}` : '', p.taxId ? `${L.taxId}: ${p.taxId}` : '', p.contact ?? '', p.email ?? '', p.phone ?? ''].filter(Boolean)
    rows.forEach((r, i) => text(page, r, x, yy - i * 12, i === 0 ? 10 : 9, i === 0 ? B : F)); return yy - rows.length * 12
  }
  const y1 = block(L.from, inv.seller, M, y), y2 = block(L.to, inv.buyer, M + 175, y)
  y = Math.min(y1, y2, y - meta.length * 13) - 26
  // table
  const cols = { item: M, qty: 330, unit: 372, price: 455, vat: 488, amount: W - M }
  const head = () => {
    page.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 20, color: rgb(0.96, 0.96, 0.97) })
    text(page, L.item, cols.item, y, 8.5, B, mute); text(page, L.qty, cols.qty, y, 8.5, B, mute, 'right'); text(page, L.unit, cols.unit, y, 8.5, B, mute); text(page, L.price, cols.price, y, 8.5, B, mute, 'right'); text(page, L.vat, cols.vat, y, 8.5, B, mute); text(page, L.amount, cols.amount, y, 8.5, B, mute, 'right')
    y -= 22
  }
  head()
  inv.lines.forEach((l, i) => {
    const nameLines = wrap(l.name, B, 9.5, 270), desc = l.description ? wrap(l.description, F, 8.5, 270) : []
    const hgt = nameLines.length * 12 + desc.length * 11 + 10
    if (y - hgt < M + 140) { page = doc.addPage([W, H]); y = H - M - 10; head() }
    nameLines.forEach((s, k) => text(page, s, cols.item, y - k * 12, 9.5, B))
    desc.forEach((s, k) => text(page, s, cols.item, y - nameLines.length * 12 - k * 11, 8.5, F, mute))
    text(page, qtyS(l.qty), cols.qty, y, 9.5, F, ink, 'right'); text(page, UNITS.find((u) => u.value === l.unit)?.label ?? l.unit, cols.unit, y, 9, F, mute)
    text(page, money(l.price), cols.price, y, 9.5, F, ink, 'right'); text(page, l.vatCategory === 'S' ? `${l.vatRate}%` : l.vatCategory, cols.vat, y, 9, F, mute); text(page, money(t.lines[i]), cols.amount, y, 9.5, B, ink, 'right')
    const bottom = y - (nameLines.length - 1) * 12 - desc.length * 11
    page.drawLine({ start: { x: M - 6, y: bottom - 7 }, end: { x: W - M + 6, y: bottom - 7 }, thickness: 0.5, color: line })
    y = bottom - 21
  })
  // totals
  y -= 8
  const tot = (k: string, v: string, bold = false) => { text(page, k, W - M - 200, y, bold ? 11 : 9.5, bold ? B : F, bold ? ink : mute); text(page, v, W - M, y, bold ? 11 : 9.5, bold ? B : F, ink, 'right'); y -= bold ? 18 : 14 }
  tot(L.net, money(t.lineTotal))
  for (const g of t.vat) tot(`${L.vat} ${g.category === 'S' ? g.rate + '%' : g.category} (${money(g.basis)})`, money(g.tax))
  page.drawLine({ start: { x: W - M - 200, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 1, color: A })
  y -= 4; tot(L.total, money(t.grandTotal), true)
  const reason = t.vat.map((g) => exemption(inv, g.category)).filter(Boolean)[0]
  if (reason) { text(page, reason, M, y, 8.5, F, mute); y -= 14 }
  // payment and notes
  y -= 10
  const payRows = [inv.payment.iban ? `${L.iban}: ${inv.payment.iban}` : '', inv.payment.bic ? `${L.bic}: ${inv.payment.bic}` : '', inv.payment.accountName ?? '', inv.payment.reference ? `${L.reference}: ${inv.payment.reference}` : '', inv.payment.terms ? `${L.terms}: ${inv.payment.terms}` : ''].filter(Boolean)
  if (payRows.length) { text(page, L.pay.toUpperCase(), M, y, 7.5, B, mute); y -= 13; payRows.forEach((r) => { for (const s of wrap(r, F, 9, W - 2 * M)) { text(page, s, M, y, 9); y -= 12 } }) }
  if (inv.note) { y -= 8; for (const s of wrap(inv.note, F, 9, W - 2 * M)) { if (y < M) { page = doc.addPage([W, H]); y = H - M } text(page, s, M, y, 9, F, mute); y -= 12 } }
  const pages = doc.getPages()
  pages.forEach((p, i) => text(p, `${inv.seller.name} · ${L.number} ${inv.number} · ${L.page} ${i + 1}/${pages.length}`, W / 2 - F.widthOfTextAtSize(`${inv.seller.name} · ${L.number} ${inv.number} · ${L.page} ${i + 1}/${pages.length}`, 7.5) / 2, 24, 7.5, F, mute))
  doc.setTitle(`${inv.typeCode === '381' ? L.credit : L.invoice} ${inv.number}`); doc.setAuthor(inv.seller.name); doc.setSubject(`${L.invoice} ${inv.number}`); doc.setCreator('OpenFile E-Invoice')
  return doc.save()
}

export const FX_XMP_SCHEMA = `<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
<pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
<pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
<pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The type of the hybrid document in capital letters, e.g. INVOICE or ORDER</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description></rdf:li>
<rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description></rdf:li>
</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas>
</rdf:Description>
`
export const fxDescription = (level = 'EN 16931') => `<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>${level}</fx:ConformanceLevel></rdf:Description>
`

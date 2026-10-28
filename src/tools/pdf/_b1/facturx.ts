/* Build a Factur-X / ZUGFeRD hybrid: PDF/A-3b with the CII XML attached as factur-x.xml. */
import { editAttachments, listAttachments, open } from './core'
import { convertToPdfa } from './pdfa'
import { FX_XMP_SCHEMA, fxDescription } from './einvoice'

export async function makeFacturX(pdf: Uint8Array, ciiXml: string, meta: { title?: string; author?: string } = {}) {
  const xml = new TextEncoder().encode(ciiXml)
  const withXml = await editAttachments(pdf, new Set(), [{ name: 'factur-x.xml', data: xml, mime: 'text/xml', description: 'Factur-X invoice data (EN 16931)', relationship: 'Alternative' }])
  return convertToPdfa(withXml, '3b', meta, { xmpSchemas: FX_XMP_SCHEMA, xmpDescriptions: fxDescription('EN 16931'), keepAttachments: true })
}

const XML_NAMES = /^(factur-x|zugferd-invoice|zugferd|xrechnung|ZUGFeRD-invoice|invoice)\.xml$/i
/** Find the invoice XML inside a hybrid PDF. */
export async function invoiceXmlFromPdf(pdf: Uint8Array) {
  const doc = await open(pdf)
  const atts = listAttachments(doc).filter((a) => a.data && /\.xml$/i.test(a.name))
  const pick = atts.find((a) => XML_NAMES.test(a.name)) ?? atts[0]
  return pick ? { name: pick.name, xml: new TextDecoder().decode(pick.data!) } : null
}

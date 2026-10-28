/* Digital signatures: sign with a PKCS#12 certificate (CMS detached, SHA-256) and verify existing signatures.
 * node-forge handles ASN.1, PKCS#12 and CMS building; WebCrypto verifies RSA, RSA-PSS and ECDSA signatures. */
import forge from 'node-forge'
import { PDFDocument, PDFName, PDFArray, PDFDict, PDFHexString, PDFString, PDFNumber, PDFRef, PDFStream, StandardFonts, PDFFont } from 'pdf-lib'
import { open, assertNotEncrypted, dictOf, arrOf, nameOf, numOf, textOf, lookup, allObjects, latin1, pdfDate, type Bytes } from './core'

const asn1 = forge.asn1
const subtle = () => globalThis.crypto.subtle
const toBin = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return s }
const fromBin = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u }
const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('')

export const SIG_BYTES = 16384

/* ================================================================ PKCS#12 */
export interface Identity { key: forge.pki.rsa.PrivateKey; cert: forge.pki.Certificate; chain: forge.pki.Certificate[]; subject: string; issuer: string; notBefore: Date; notAfter: Date }
export function readP12(p12: Uint8Array, password: string): Identity {
  let p: forge.pkcs12.Pkcs12Pfx
  try { p = forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(toBin(p12)), false, password) } catch (e: any) {
    const m = String(e?.message ?? e)
    if (/mac|password|invalid/i.test(m)) throw new Error('Could not open the certificate. The password may be wrong.')
    if (/OID is not RSA|not RSA/i.test(m)) throw new Error('Only RSA certificates are supported for signing in the browser right now.')
    throw new Error('This does not look like a valid .p12 or .pfx certificate file. (' + m + ')')
  }
  const keyBags = [...(p.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []), ...(p.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])]
  const certBags = p.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const key = keyBags.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined
  if (!key) throw new Error('The certificate file has no private key. Export it again with the private key included.')
  const certs = certBags.map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[]
  if (!certs.length) throw new Error('The certificate file has no certificate inside.')
  // the signer cert is the one whose public key matches the private key
  const cert = certs.find((c) => (c.publicKey as any).n?.equals?.((key as any).n)) ?? certs[0]
  const chain = certs.filter((c) => c !== cert)
  return { key, cert, chain, subject: dn(cert.subject.attributes), issuer: dn(cert.issuer.attributes), notBefore: cert.validity.notBefore, notAfter: cert.validity.notAfter }
}
const dn = (attrs: any[]) => attrs.map((a) => `${a.shortName ?? a.name ?? a.type}=${a.value}`).join(', ')
export const cnOf = (subject: string) => subject.match(/CN=([^,]+)/)?.[1] ?? subject

/** Create a self-signed RSA test certificate as a .p12 (uses WebCrypto for fast key generation). */
export async function makeTestCertificate(o: { name: string; email?: string; org?: string; password: string; years?: number }) {
  const kp = await subtle().generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', kp.privateKey))
  const key = forge.pki.privateKeyFromAsn1(asn1.fromDer(toBin(pkcs8))) as forge.pki.rsa.PrivateKey
  const pub = forge.pki.setRsaPublicKey((key as any).n, (key as any).e)
  const cert = forge.pki.createCertificate()
  cert.publicKey = pub
  cert.serialNumber = '01' + hex(globalThis.crypto.getRandomValues(new Uint8Array(8)))
  cert.validity.notBefore = new Date(Date.now() - 60000)
  cert.validity.notAfter = new Date(Date.now() + (o.years ?? 3) * 365 * 864e5)
  const attrs: any[] = [{ name: 'commonName', value: o.name }]
  if (o.org) attrs.push({ name: 'organizationName', value: o.org })
  if (o.email) attrs.push({ name: 'emailAddress', value: o.email })
  cert.setSubject(attrs); cert.setIssuer(attrs)
  cert.setExtensions([{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, nonRepudiation: true }, { name: 'extKeyUsage', emailProtection: true }])
  cert.sign(key, forge.md.sha256.create())
  const p12 = forge.pkcs12.toPkcs12Asn1(key, [cert], o.password, { algorithm: '3des', friendlyName: o.name })
  return fromBin(asn1.toDer(p12).getBytes())
}

/* ================================================================ signing */
export interface SignOpts { reason?: string; location?: string; contact?: string; visible?: { page: number; rect: [number, number, number, number] } | null; fieldName?: string; date?: Date }
export async function signPdf(bytes: Bytes, id: Identity, o: SignOpts = {}) {
  const doc = await open(bytes); assertNotEncrypted(doc)
  const ctx = doc.context
  // object numbers used by xref streams are not registered by the parser; never reuse them
  const sizes = [...latin1(bytes.length > 32e6 ? bytes.subarray(bytes.length - 8e6) : bytes).matchAll(/\/Size\s+(\d+)/g)].map((m) => Number(m[1]))
  if (sizes.length) ctx.largestObjectNumber = Math.max(ctx.largestObjectNumber, Math.max(...sizes) - 1)
  const origMax = ctx.largestObjectNumber
  const date = o.date ?? new Date()
  const byteRange = PDFArray.withContext(ctx)
  byteRange.push(PDFNumber.of(0)); for (let i = 0; i < 3; i++) byteRange.push(PDFName.of('**********'))
  const signer = cnOf(id.subject)
  const sig = ctx.obj({
    Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached',
    ByteRange: byteRange, Contents: PDFHexString.of('0'.repeat(SIG_BYTES * 2)),
    M: PDFString.of(pdfDate(date)), Name: PDFHexString.fromText(signer),
    ...(o.reason ? { Reason: PDFHexString.fromText(o.reason) } : {}),
    ...(o.location ? { Location: PDFHexString.fromText(o.location) } : {}),
    ...(o.contact ? { ContactInfo: PDFHexString.fromText(o.contact) } : {}),
    Prop_Build: { App: { Name: 'OpenFile' } },
  })
  const sigRef = ctx.register(sig)
  const pages = doc.getPages()
  const page = pages[Math.max(0, Math.min(pages.length - 1, o.visible?.page ?? 0))]
  const rect = o.visible ? o.visible.rect : [0, 0, 0, 0]
  const form = doc.getForm()
  const existing = new Set(form.getFields().map((f) => f.getName()))
  let fname = o.fieldName || 'Signature1', n = 1
  while (existing.has(fname)) fname = `Signature${++n}`
  const widget: Record<string, any> = { Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: PDFHexString.fromText(fname), V: sigRef, Rect: rect, F: 132, P: page.ref }
  if (o.visible) {
    const font = await doc.embedFont(StandardFonts.Helvetica)
    widget.AP = { N: appearance(doc, font, rect, [`Digitally signed by ${signer}`, `Date: ${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`, ...(o.reason ? [`Reason: ${o.reason}`] : []), ...(o.location ? [`Location: ${o.location}`] : [])]) }
  }
  const wref = ctx.register(ctx.obj(widget))
  const annots = page.node.lookup(PDFName.of('Annots'))
  if (annots instanceof PDFArray) annots.push(wref); else page.node.set(PDFName.of('Annots'), ctx.obj([wref]))
  form.acroForm.addField(wref)
  form.acroForm.dict.set(PDFName.of('SigFlags'), PDFNumber.of(3))
  // append the signature as an incremental update so earlier signatures stay valid
  const changed: PDFRef[] = [page.ref]
  const root = ctx.trailerInfo.Root as PDFRef
  if (root instanceof PDFRef) changed.push(root)
  const afRef = doc.catalog.get(PDFName.of('AcroForm'))
  if (afRef instanceof PDFRef) changed.push(afRef)
  const pdf = await incrementalSave(doc, bytes, origMax, changed)
  return embedSignature(pdf, (data) => cmsSign(data, id, date))
}

/** Write only new and changed objects after the original bytes, with an xref section that points back (/Prev). */
export async function incrementalSave(doc: PDFDocument, original: Uint8Array, origMax: number, changed: PDFRef[]) {
  await (doc as any).flush?.()
  const ctx = doc.context
  const refs = new Map<string, PDFRef>()
  for (const r of changed) refs.set(r.toString(), r)
  for (const [ref] of ctx.enumerateIndirectObjects()) if (ref.objectNumber > origMax) refs.set(ref.toString(), ref)
  const list = [...refs.values()].sort((a, b) => a.objectNumber - b.objectNumber)
  const head = latin1(original.subarray(Math.max(0, original.length - 2048)))
  const m = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(head) ?? [...head.matchAll(/startxref\s+(\d+)/g)].pop()
  if (!m) throw new Error('Could not find the end of the original file structure. Try Repair PDF first.')
  const prev = Number(m[1])
  const prevIsTable = latin1(original.subarray(prev, prev + 4)) === 'xref'
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = [original]
  let offset = original.length
  if (original[original.length - 1] !== 10) { chunks.push(enc.encode('\n')); offset += 1 }
  const offsets = new Map<number, number>()
  for (const r of list) {
    const obj = ctx.lookup(r)
    if (!obj) continue
    const hdr = enc.encode(`${r.objectNumber} ${r.generationNumber} obj\n`)
    const body = new Uint8Array(obj.sizeInBytes()); obj.copyBytesInto(body, 0)
    const tail = enc.encode('\nendobj\n')
    offsets.set(r.objectNumber, offset)
    chunks.push(hdr, body, tail); offset += hdr.length + body.length + tail.length
  }
  const t = ctx.trailerInfo
  const idArr = t.ID ? (() => { const b = new Uint8Array((t.ID as any).sizeInBytes()); (t.ID as any).copyBytesInto(b, 0); return latin1(b) })() : ''
  const rootStr = String(t.Root), infoStr = t.Info ? String(t.Info) : ''
  if (prevIsTable) {
    let x = 'xref\n'
    const nums = [...offsets.keys()].sort((a, b) => a - b)
    for (let i = 0; i < nums.length;) {
      let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
      x += `${nums[i]} ${j - i + 1}\n`
      for (let k = i; k <= j; k++) x += `${String(offsets.get(nums[k])).padStart(10, '0')} 00000 n\r\n`
      i = j + 1
    }
    x += `trailer\n<< /Size ${ctx.largestObjectNumber + 1} /Root ${rootStr}${infoStr ? ` /Info ${infoStr}` : ''}${idArr ? ` /ID ${idArr}` : ''} /Prev ${prev} >>\nstartxref\n${offset}\n%%EOF\n`
    chunks.push(enc.encode(x))
  } else {
    const xrefNum = ctx.largestObjectNumber + 1
    offsets.set(xrefNum, offset)
    const nums = [...offsets.keys()].sort((a, b) => a - b)
    const index: number[] = []; const rows: number[] = []
    for (let i = 0; i < nums.length;) { let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++; index.push(nums[i], j - i + 1); for (let k = i; k <= j; k++) rows.push(nums[k]); i = j + 1 }
    const data = new Uint8Array(rows.length * 7)
    rows.forEach((n, r) => { const o = offsets.get(n)!; data[r * 7] = 1; data[r * 7 + 1] = (o >>> 24) & 255; data[r * 7 + 2] = (o >>> 16) & 255; data[r * 7 + 3] = (o >>> 8) & 255; data[r * 7 + 4] = o & 255 })
    const dict = `<< /Type /XRef /Size ${xrefNum + 1} /Index [${index.join(' ')}] /W [1 4 2] /Root ${rootStr}${infoStr ? ` /Info ${infoStr}` : ''}${idArr ? ` /ID ${idArr}` : ''} /Prev ${prev} /Length ${data.length} >>`
    chunks.push(enc.encode(`${xrefNum} 0 obj\n${dict}\nstream\n`), data, enc.encode(`\nendstream\nendobj\nstartxref\n${offset}\n%%EOF\n`))
  }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0)); let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}

function appearance(doc: PDFDocument, font: PDFFont, rect: number[], lines: string[]) {
  const w = rect[2] - rect[0], h = rect[3] - rect[1]
  const size = Math.max(5, Math.min(11, h / (lines.length * 1.35 + 0.5), ...lines.map((l) => (w - 8) / Math.max(1, font.widthOfTextAtSize(l, 1)))))
  const safe = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1')
  let ops = `q 0.95 0.97 0.98 rg 0 0 ${w} ${h} re f 0.18 0.55 0.6 RG 1 w 0.5 0.5 ${w - 1} ${h - 1} re S Q\nBT /F1 ${size.toFixed(2)} Tf 0.1 0.12 0.15 rg\n`
  lines.forEach((l, i) => { ops += `1 0 0 1 4 ${(h - 4 - size * (i + 1) * 1.25).toFixed(2)} Tm (${safe(l)}) Tj\n` })
  ops += 'ET'
  return doc.context.register(doc.context.flateStream(ops, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, h], Resources: { Font: { F1: font.ref } } }))
}

/** Fill the ByteRange and Contents placeholders of a saved PDF. */
export async function embedSignature(pdf: Uint8Array, sign: (signed: Uint8Array) => Promise<Uint8Array> | Uint8Array) {
  const text = latin1(pdf)
  const brMarker = '/ByteRange [ 0 /********** /********** /********** ]'
  let brPos = text.lastIndexOf(brMarker)
  let brLen = brMarker.length
  if (brPos < 0) { const m = /\/ByteRange\s*\[\s*0\s+\/\*{10}\s+\/\*{10}\s+\/\*{10}\s*\]/.exec(text); if (!m) throw new Error('Signature placeholder not found'); brPos = m.index; brLen = m[0].length }
  const zeros = '<' + '0'.repeat(SIG_BYTES * 2) + '>'
  const cPos = text.lastIndexOf(zeros)
  if (cPos < 0) throw new Error('Signature contents placeholder not found')
  const a = cPos, b = cPos + zeros.length, c = pdf.length - b
  let br = `/ByteRange [0 ${a} ${b} ${c}]`
  if (br.length > brLen) throw new Error('Byte range too long')
  br = br.padEnd(brLen, ' ')
  const out = new Uint8Array(pdf)
  for (let i = 0; i < br.length; i++) out[brPos + i] = br.charCodeAt(i)
  const signed = new Uint8Array(a + c); signed.set(out.subarray(0, a), 0); signed.set(out.subarray(b), a)
  const der = await sign(signed)
  if (der.length > SIG_BYTES) throw new Error('Signature is larger than the reserved space')
  const h = hex(der).padEnd(SIG_BYTES * 2, '0')
  for (let i = 0; i < h.length; i++) out[a + 1 + i] = h.charCodeAt(i)
  return out
}

function cmsSign(data: Uint8Array, id: Identity, date: Date) {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(toBin(data))
  p7.addCertificate(id.cert)
  for (const c of id.chain) p7.addCertificate(c)
  p7.addSigner({
    key: id.key as any, certificate: id.cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest } as any, { type: forge.pki.oids.signingTime, value: date as any }],
  })
  p7.sign({ detached: true })
  return fromBin(asn1.toDer(p7.toAsn1()).getBytes())
}

/* ================================================================ verification */
export interface CertInfo { subject: string; issuer: string; serial: string; notBefore: Date; notAfter: Date; selfSigned: boolean; keyType: string; isCA: boolean; signedByNext?: boolean | null }
export interface SigReport {
  field: string; signer: string; subFilter: string; signingTime?: Date; pdfTime?: Date; reason?: string; location?: string; contact?: string
  byteRange: number[]; coversWholeFile: boolean; laterRevisions: boolean
  digestAlg: string; digestOk: boolean | null; signatureOk: boolean | null; certValidAtSigning: boolean | null
  chain: CertInfo[]; timestamp?: { time: Date; tsa?: string; imprintOk: boolean | null }
  errors: string[]; kind: 'signature' | 'timestamp'
}

const OID = {
  sha1: '1.3.14.3.2.26', sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3',
  messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5', timeStampToken: '1.2.840.113549.1.9.16.2.14', tstInfo: '1.2.840.113549.1.9.16.1.4', signedData: '1.2.840.113549.1.7.2',
  rsa: '1.2.840.113549.1.1.1', pss: '1.2.840.113549.1.1.10', ec: '1.2.840.10045.2.1',
}
const HASH_BY_OID: Record<string, string> = { [OID.sha1]: 'SHA-1', [OID.sha256]: 'SHA-256', [OID.sha384]: 'SHA-384', [OID.sha512]: 'SHA-512' }
const SIGALG: Record<string, { kind: 'rsa' | 'ec' | 'pss'; hash?: string }> = {
  '1.2.840.113549.1.1.1': { kind: 'rsa' }, '1.2.840.113549.1.1.5': { kind: 'rsa', hash: 'SHA-1' }, '1.2.840.113549.1.1.11': { kind: 'rsa', hash: 'SHA-256' },
  '1.2.840.113549.1.1.12': { kind: 'rsa', hash: 'SHA-384' }, '1.2.840.113549.1.1.13': { kind: 'rsa', hash: 'SHA-512' }, '1.2.840.113549.1.1.10': { kind: 'pss' },
  '1.2.840.10045.4.1': { kind: 'ec', hash: 'SHA-1' }, '1.2.840.10045.4.3.2': { kind: 'ec', hash: 'SHA-256' }, '1.2.840.10045.4.3.3': { kind: 'ec', hash: 'SHA-384' }, '1.2.840.10045.4.3.4': { kind: 'ec', hash: 'SHA-512' },
}
const CURVES: Record<string, string> = { '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521' }
const NAMES: Record<string, string> = { '2.5.4.3': 'CN', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '1.2.840.113549.1.9.1': 'E', '2.5.4.5': 'SERIALNUMBER', '2.5.4.42': 'GN', '2.5.4.4': 'SN' }

type Node = forge.asn1.Asn1
const kids = (n: Node) => (Array.isArray(n.value) ? (n.value as Node[]) : [])
const oidOf = (n: Node | undefined) => (n && n.type === asn1.Type.OID ? asn1.derToOid(n.value as string) : '')
const der = (n: Node) => fromBin(asn1.toDer(n).getBytes())
function nameStr(n: Node) {
  return kids(n).map((set) => kids(set).map((atv) => { const [o, v] = kids(atv); return `${NAMES[oidOf(o)] ?? oidOf(o)}=${typeof v?.value === 'string' ? decodeStr(v) : ''}` }).join('+')).join(', ')
}
function decodeStr(v: Node) { const s = v.value as string; if (v.type === asn1.Type.BMPSTRING) { let o = ''; for (let i = 0; i + 1 < s.length; i += 2) o += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1)); return o } try { return forge.util.decodeUtf8(s) } catch { return s } }
function timeOf(n: Node) { try { return n.type === asn1.Type.UTCTIME ? asn1.utcTimeToDate(n.value as string) : asn1.generalizedTimeToDate(n.value as string) } catch { return undefined } }

interface ParsedCert { node: Node; tbs: Uint8Array; subject: string; issuer: string; issuerNode: Node; subjectNode: Node; serial: string; notBefore?: Date; notAfter?: Date; spki: Uint8Array; keyAlg: string; curve?: string; sigAlg: string; sigParams?: Node; sig: Uint8Array; isCA: boolean }
function parseCert(n: Node): ParsedCert {
  const [tbsN, algN, sigN] = kids(n)
  const t = kids(tbsN)
  let i = 0
  if (t[0].tagClass === asn1.Class.CONTEXT_SPECIFIC && t[0].type === 0) i = 1
  const serial = hex(fromBin(t[i].value as string)); const issuerNode = t[i + 2]; const validity = kids(t[i + 3]); const subjectNode = t[i + 4]; const spkiN = t[i + 5]
  const keyAlgN = kids(kids(spkiN)[0])
  let isCA = false
  const ext = t.find((x) => x.tagClass === asn1.Class.CONTEXT_SPECIFIC && x.type === 3)
  if (ext) for (const e of kids(kids(ext)[0] ?? ({ value: [] } as any))) { const ek = kids(e); if (oidOf(ek[0]) === '2.5.29.19') { try { const bc = asn1.fromDer(ek[ek.length - 1].value as string); isCA = kids(bc).some((x) => x.type === asn1.Type.BOOLEAN && (x.value as string).charCodeAt(0) !== 0) } catch { /* */ } } }
  const sigBits = sigN.value as string
  return {
    node: n, tbs: der(tbsN), subject: nameStr(subjectNode), issuer: nameStr(issuerNode), issuerNode, subjectNode, serial,
    notBefore: timeOf(validity[0]), notAfter: timeOf(validity[1]), spki: der(spkiN), keyAlg: oidOf(keyAlgN[0]), curve: CURVES[oidOf(keyAlgN[1])],
    sigAlg: oidOf(kids(algN)[0]), sigParams: kids(algN)[1], sig: fromBin(sigBits.slice(1)), isCA,
  }
}

/** ECDSA DER (SEQ r s) to raw r||s for WebCrypto */
function ecdsaRaw(sig: Uint8Array, curve: string) {
  const size = curve === 'P-256' ? 32 : curve === 'P-384' ? 48 : 66
  const n = asn1.fromDer(toBin(sig))
  const [r, s] = kids(n).map((x) => fromBin(x.value as string))
  const fix = (v: Uint8Array) => { let a = v; while (a.length > size && a[0] === 0) a = a.subarray(1); const o = new Uint8Array(size); o.set(a, size - a.length); return o }
  const out = new Uint8Array(size * 2); out.set(fix(r), 0); out.set(fix(s), size); return out
}
function pssParams(p?: Node) {
  let hash = 'SHA-1', salt = 20
  for (const k of p ? kids(p) : []) {
    if (k.tagClass !== asn1.Class.CONTEXT_SPECIFIC) continue
    const inner = kids(k)[0]
    if (k.type === 0) hash = HASH_BY_OID[oidOf(kids(inner)[0])] ?? hash
    if (k.type === 2 && inner) salt = parseInt(hex(fromBin(inner.value as string)), 16)
  }
  return { hash, salt }
}
export async function verifyWith(spki: Uint8Array, keyAlg: string, curve: string | undefined, sigAlgOid: string, sigParams: Node | undefined, digestHash: string, data: Uint8Array, sig: Uint8Array): Promise<boolean | null> {
  const a = SIGALG[sigAlgOid] ?? (keyAlg === OID.rsa ? { kind: 'rsa' as const } : keyAlg === OID.ec ? { kind: 'ec' as const } : undefined)
  if (!a) return null
  try {
    if (a.kind === 'rsa') {
      const k = await subtle().importKey('spki', spki as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: a.hash ?? digestHash }, false, ['verify'])
      return await subtle().verify('RSASSA-PKCS1-v1_5', k, sig as BufferSource, data as BufferSource)
    }
    if (a.kind === 'pss') {
      const p = pssParams(sigParams)
      const k = await subtle().importKey('spki', spki as BufferSource, { name: 'RSA-PSS', hash: p.hash }, false, ['verify'])
      return await subtle().verify({ name: 'RSA-PSS', saltLength: p.salt }, k, sig as BufferSource, data as BufferSource)
    }
    if (!curve) return null
    const k = await subtle().importKey('spki', spki as BufferSource, { name: 'ECDSA', namedCurve: curve }, false, ['verify'])
    return await subtle().verify({ name: 'ECDSA', hash: a.hash ?? digestHash }, k, ecdsaRaw(sig, curve) as BufferSource, data as BufferSource)
  } catch { return null }
}
async function digest(alg: string, data: Uint8Array) { return new Uint8Array(await subtle().digest(alg, data as BufferSource)) }
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

/** Parse CMS SignedData and verify it against the signed bytes. */
export async function verifyCms(cmsDer: Uint8Array, signed: Uint8Array) {
  const errors: string[] = []
  const root = asn1.fromDer(toBin(cmsDer), { strict: false, parseAllBytes: false } as any)
  const [ct, content] = kids(root)
  if (oidOf(ct) !== OID.signedData) throw new Error('Not a CMS signed-data structure')
  const sd = kids(kids(content)[0])
  const encap = kids(sd[2])
  const eContentType = oidOf(encap[0])
  const certsN = sd.find((x) => x.tagClass === asn1.Class.CONTEXT_SPECIFIC && x.type === 0)
  const certs = certsN ? kids(certsN).filter((c) => c.type === asn1.Type.SEQUENCE).map(parseCert) : []
  const signerInfos = kids(sd[sd.length - 1])
  const si = kids(signerInfos[0])
  if (!si.length) throw new Error('No signer information')
  const sid = si[1]
  let signerCert: ParsedCert | undefined
  if (sid.type === asn1.Type.SEQUENCE) { const serial = hex(fromBin(kids(sid)[1].value as string)); signerCert = certs.find((c) => c.serial === serial) }
  else signerCert = certs[0]
  if (!signerCert) { signerCert = certs[0]; errors.push('Signer certificate could not be matched exactly') }
  const digestOid = oidOf(kids(si[2])[0]); const hashName = HASH_BY_OID[digestOid] ?? 'SHA-256'
  let k = 3
  let signedAttrs: Node | undefined
  if (si[k].tagClass === asn1.Class.CONTEXT_SPECIFIC && si[k].type === 0) { signedAttrs = si[k]; k++ }
  const sigAlgN = kids(si[k]); const sigValue = fromBin(si[k + 1].value as string)
  const unsigned = si[k + 2]
  let messageDigest: Uint8Array | undefined, signingTime: Date | undefined
  if (signedAttrs) for (const attr of kids(signedAttrs)) {
    const [o, vals] = kids(attr); const v = kids(vals)[0]
    if (oidOf(o) === OID.messageDigest) messageDigest = fromBin(v.value as string)
    if (oidOf(o) === OID.signingTime) signingTime = timeOf(v)
  }
  // eContent embedded (timestamp tokens) vs detached
  let eContent: Uint8Array | undefined
  if (encap[1]) { const inner = kids(encap[1])[0]; eContent = typeof inner?.value === 'string' ? fromBin(inner.value as string) : inner ? der(inner) : undefined }
  const actual = await digest(hashName, eContent ?? signed)
  const digestOk = messageDigest ? eq(actual, messageDigest) : null
  let signatureOk: boolean | null = null
  if (signerCert) {
    let toVerify: Uint8Array
    if (signedAttrs) { const setNode = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, kids(signedAttrs)); toVerify = der(setNode) } else toVerify = eContent ?? signed
    signatureOk = await verifyWith(signerCert.spki, signerCert.keyAlg, signerCert.curve, oidOf(sigAlgN[0]), sigAlgN[1], hashName, toVerify, sigValue)
    if (!signedAttrs && signatureOk === null) errors.push('Signature without signed attributes could not be checked')
  }
  // timestamp token in unsigned attributes
  let timestamp: SigReport['timestamp']
  if (unsigned) for (const attr of kids(unsigned)) {
    const [o, vals] = kids(attr)
    if (oidOf(o) !== OID.timeStampToken) continue
    try {
      const tokenDer = der(kids(vals)[0])
      const tst = parseTstInfo(tokenDer)
      const imprint = await digest(tst.hash, sigValue)
      timestamp = { time: tst.time, tsa: tst.tsa, imprintOk: eq(imprint, tst.imprint) }
    } catch { errors.push('Timestamp token could not be read') }
  }
  let tstInfo: ReturnType<typeof parseTstInfoContent> | undefined
  if (eContentType === OID.tstInfo && eContent) { tstInfo = parseTstInfoContent(eContent) }
  // chain: order from signer upwards
  const chain: CertInfo[] = []
  const used = new Set<ParsedCert>()
  let cur: ParsedCert | undefined = signerCert
  while (cur && !used.has(cur) && chain.length < 10) {
    used.add(cur)
    const c0: ParsedCert = cur
    const self: boolean = c0.subject === c0.issuer
    const issuer: ParsedCert | undefined = self ? c0 : certs.find((c) => c.subject === c0.issuer && !used.has(c))
    let signedByNext: boolean | null = null
    if (issuer) signedByNext = await verifyWith(issuer.spki, issuer.keyAlg, issuer.curve, cur.sigAlg, cur.sigParams, 'SHA-256', cur.tbs, cur.sig)
    chain.push({ subject: cur.subject, issuer: cur.issuer, serial: cur.serial, notBefore: cur.notBefore!, notAfter: cur.notAfter!, selfSigned: self, keyType: cur.keyAlg === OID.ec ? `EC ${cur.curve ?? ''}` : 'RSA', isCA: cur.isCA, signedByNext })
    cur = self ? undefined : issuer
  }
  return { digestOk, signatureOk, signingTime, hashName, chain, timestamp, errors, tstInfo, actual, signerSubject: signerCert?.subject ?? '' }
}
function parseTstInfoContent(content: Uint8Array) {
  const t = kids(asn1.fromDer(toBin(content)))
  const imprint = kids(t[2]); const hash = HASH_BY_OID[oidOf(kids(imprint[0])[0])] ?? 'SHA-256'
  const time = timeOf(t[4])!
  const tsaN = t.find((x) => x.tagClass === asn1.Class.CONTEXT_SPECIFIC && x.type === 0)
  let tsa: string | undefined
  try { if (tsaN) { const g = kids(tsaN)[0]; const nm = kids(g)[0]; tsa = nm ? nameStr(nm) : undefined } } catch { /* */ }
  return { hash, imprint: fromBin(imprint[1].value as string), time, tsa }
}
function parseTstInfo(tokenDer: Uint8Array) {
  const root = asn1.fromDer(toBin(tokenDer))
  const sd = kids(kids(kids(root)[1])[0])
  const encap = kids(sd[2])
  const inner = kids(encap[1])[0]
  return parseTstInfoContent(fromBin(inner.value as string))
}

/** Find and verify every signature in a PDF. */
export async function verifyPdf(bytes: Uint8Array): Promise<SigReport[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const sigs: { field: string; dict: PDFDict }[] = []
  const seen = new Set<string>()
  const af = dictOf(doc, doc.catalog.get(PDFName.of('AcroForm')))
  const walk = (a: PDFArray | undefined, prefix: string, depth: number) => {
    if (!a || depth > 20) return
    for (let i = 0; i < a.size(); i++) {
      const raw = a.get(i); const d = dictOf(doc, raw); if (!d) continue
      const name = [prefix, textOf(doc, d.get(PDFName.of('T')))].filter(Boolean).join('.')
      const v = d.get(PDFName.of('V')); const vd = dictOf(doc, v)
      if (nameOf(doc, d.get(PDFName.of('FT'))) === 'Sig' && vd && vd.get(PDFName.of('ByteRange'))) { const key = (v instanceof PDFRef ? v.toString() : name); if (!seen.has(key)) { seen.add(key); sigs.push({ field: name || 'Signature', dict: vd }) } }
      walk(arrOf(doc, d.get(PDFName.of('Kids'))), name, depth + 1)
    }
  }
  walk(af ? arrOf(doc, af.get(PDFName.of('Fields'))) : undefined, '', 0)
  if (!sigs.length) for (const [ref, obj] of allObjects(doc)) {
    if (obj instanceof PDFDict && obj.get(PDFName.of('ByteRange')) && obj.get(PDFName.of('Contents')) && !seen.has(ref.toString())) sigs.push({ field: 'Signature', dict: obj })
  }
  const out: SigReport[] = []
  for (const { field, dict } of sigs) {
    const br = arrOf(doc, dict.get(PDFName.of('ByteRange')))
    const byteRange = br ? br.asArray().map((x) => numOf(doc, x) ?? 0) : []
    const subFilter = nameOf(doc, dict.get(PDFName.of('SubFilter'))) ?? '?'
    const contents = lookup(doc, dict.get(PDFName.of('Contents')))
    const rep: SigReport = {
      field, signer: textOf(doc, dict.get(PDFName.of('Name'))) ?? '', subFilter, byteRange, reason: textOf(doc, dict.get(PDFName.of('Reason'))), location: textOf(doc, dict.get(PDFName.of('Location'))), contact: textOf(doc, dict.get(PDFName.of('ContactInfo'))),
      pdfTime: parsePdfDate(textOf(doc, dict.get(PDFName.of('M')))), coversWholeFile: false, laterRevisions: false, digestAlg: '?', digestOk: null, signatureOk: null, certValidAtSigning: null, chain: [], errors: [],
      kind: subFilter === 'ETSI.RFC3161' ? 'timestamp' : 'signature',
    }
    try {
      if (byteRange.length !== 4) throw new Error('Malformed byte range')
      const [a, b, c, d] = byteRange
      const end = c + d
      rep.coversWholeFile = a === 0 && end === bytes.length
      rep.laterRevisions = end < bytes.length
      if (end > bytes.length || b > c) throw new Error('Byte range points outside the file')
      const signed = new Uint8Array(b + d); signed.set(bytes.subarray(a, a + b), 0); signed.set(bytes.subarray(c, c + d), b)
      let cms = (contents instanceof PDFHexString || contents instanceof PDFString) ? contents.asBytes() : new Uint8Array(0)
      cms = trimDer(cms)
      if (!cms.length) throw new Error('Empty signature value')
      if (subFilter === 'adbe.x509.rsa_sha1') throw new Error('Old adbe.x509.rsa_sha1 signatures are not supported yet')
      const v = await verifyCms(cms, signed)
      rep.digestAlg = v.hashName
      rep.chain = v.chain
      rep.errors.push(...v.errors)
      rep.timestamp = v.timestamp
      if (rep.kind === 'timestamp' && v.tstInfo) {
        const imprint = await digest(v.tstInfo.hash, signed)
        rep.digestOk = eq(imprint, v.tstInfo.imprint) && v.digestOk !== false
        rep.signatureOk = v.signatureOk
        rep.signingTime = v.tstInfo.time
        rep.timestamp = { time: v.tstInfo.time, tsa: v.tstInfo.tsa, imprintOk: eq(imprint, v.tstInfo.imprint) }
      } else { rep.digestOk = v.digestOk; rep.signatureOk = v.signatureOk; rep.signingTime = v.signingTime }
      if (!rep.signer) rep.signer = cnOf(v.signerSubject.replace(/, /g, ','))
      const when = rep.timestamp?.time ?? rep.signingTime ?? rep.pdfTime
      const sc = v.chain[0]
      if (sc && when) rep.certValidAtSigning = when >= sc.notBefore && when <= sc.notAfter
    } catch (e: any) { rep.errors.push(e?.message ?? String(e)) }
    out.push(rep)
  }
  return out
}
function trimDer(b: Uint8Array) {
  // drop trailing zero padding using the DER length header
  if (b[0] !== 0x30) return b
  let len = b[1], off = 2
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[2 + i]; off = 2 + n }
  return b.subarray(0, Math.min(b.length, off + len))
}
export function parsePdfDate(s?: string) {
  if (!s) return undefined
  const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?/.exec(s)
  if (!m) return undefined
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', z, th = '00', tm = '00'] = m
  let t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se)
  if (z === '+' || z === '-') t -= (z === '+' ? 1 : -1) * (+th * 60 + +tm) * 60000
  return new Date(t)
}

export { PDFStream }

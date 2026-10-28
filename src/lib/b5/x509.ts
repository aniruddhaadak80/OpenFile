/* X.509 / CSR / CRL decoding with pkijs + asn1js. */
export const OIDS: Record<string, string> = {
  '2.5.4.3': 'CN', '2.5.4.6': 'C', '2.5.4.7': 'L', '2.5.4.8': 'ST', '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.5': 'serialNumber', '2.5.4.9': 'street', '2.5.4.17': 'postalCode', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '1.2.840.113549.1.9.1': 'emailAddress', '0.9.2342.19200300.100.1.25': 'DC', '2.5.4.97': 'organizationIdentifier', '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionC', '2.5.4.15': 'businessCategory',
  '1.2.840.113549.1.1.1': 'RSA', '1.2.840.10045.2.1': 'EC', '1.3.101.112': 'Ed25519', '1.3.101.113': 'Ed448', '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption', '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption', '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption', '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption', '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256', '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384', '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.2.840.10045.3.1.7': 'P-256', '1.3.132.0.34': 'P-384', '1.3.132.0.35': 'P-521',
  '2.5.29.17': 'Subject Alternative Name', '2.5.29.19': 'Basic Constraints', '2.5.29.15': 'Key Usage', '2.5.29.37': 'Extended Key Usage', '2.5.29.14': 'Subject Key Identifier', '2.5.29.35': 'Authority Key Identifier', '2.5.29.31': 'CRL Distribution Points', '1.3.6.1.5.5.7.1.1': 'Authority Information Access', '2.5.29.32': 'Certificate Policies', '1.3.6.1.4.1.11129.2.4.2': 'Signed Certificate Timestamps', '2.5.29.18': 'Issuer Alternative Name', '2.5.29.30': 'Name Constraints', '2.5.29.20': 'CRL Number', '2.5.29.21': 'Reason Code',
  '1.3.6.1.5.5.7.3.1': 'TLS server auth', '1.3.6.1.5.5.7.3.2': 'TLS client auth', '1.3.6.1.5.5.7.3.3': 'Code signing', '1.3.6.1.5.5.7.3.4': 'Email protection', '1.3.6.1.5.5.7.3.8': 'Time stamping', '1.3.6.1.5.5.7.3.9': 'OCSP signing', '1.3.6.1.5.5.7.48.1': 'OCSP', '1.3.6.1.5.5.7.48.2': 'CA Issuers', '2.23.140.1.2.1': 'Domain validated', '2.23.140.1.2.2': 'Organization validated', '2.23.140.1.1': 'Extended validation', '1.2.840.113549.1.9.14': 'Extension request',
}
export const oidName = (o: string) => OIDS[o] ?? o

const hex = (b: ArrayBuffer | Uint8Array, sep = ':') => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0').toUpperCase()).join(sep)

export function pemBlocks(text: string): { label: string; der: Uint8Array }[] {
  const out: { label: string; der: Uint8Array }[] = []
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push({ label: m[1], der: Uint8Array.from(atob(m[2].replace(/[^A-Za-z0-9+/=]/g, '')), (c) => c.charCodeAt(0)) })
  if (!out.length) {
    const t = text.trim()
    if (/^[A-Za-z0-9+/=\s]+$/.test(t) && t.length > 40) out.push({ label: 'UNKNOWN', der: Uint8Array.from(atob(t.replace(/\s+/g, '')), (c) => c.charCodeAt(0)) })
  }
  return out
}

function nameStr(n: any) { return n.typesAndValues.map((tv: any) => `${oidName(tv.type)}=${tv.value.valueBlock.value}`).join(', ') }
function nameRows(n: any) { return n.typesAndValues.map((tv: any) => [oidName(tv.type), String(tv.value.valueBlock.value)] as [string, string]) }

const KU = ['Digital signature', 'Non repudiation', 'Key encipherment', 'Data encipherment', 'Key agreement', 'Certificate sign', 'CRL sign', 'Encipher only', 'Decipher only']
const GN = ['otherName', 'email', 'DNS', 'x400', 'dirName', 'ediParty', 'URI', 'IP', 'registeredID']

function extValue(e: any, asn1: any): string {
  const p = e.parsedValue
  try {
    switch (e.extnID) {
      case '2.5.29.17': case '2.5.29.18': return p.altNames.map((a: any) => `${GN[a.type]}: ${a.type === 7 ? ipStr(a.value.valueBlock.valueHexView) : a.type === 4 ? nameStr(a.value) : a.value}`).join('\n')
      case '2.5.29.19': return `CA: ${p.cA ? 'yes' : 'no'}${p.pathLenConstraint !== undefined ? `, path length ${typeof p.pathLenConstraint === 'number' ? p.pathLenConstraint : p.pathLenConstraint.valueBlock.valueDec}` : ''}`
      case '2.5.29.15': { const v = p.valueBlock.valueHexView as Uint8Array; const bits = (v[0] ?? 0) | ((v[1] ?? 0) << 8); return KU.filter((_, i) => (i < 8 ? (v[0] >> (7 - i)) & 1 : (v[1] >> 7) & 1)).join(', ') || String(bits) }
      case '2.5.29.37': return p.keyPurposes.map(oidName).join(', ')
      case '2.5.29.14': return hex(p.valueBlock.valueHexView)
      case '2.5.29.35': return p.keyIdentifier ? hex(p.keyIdentifier.valueBlock.valueHexView) : '(none)'
      case '2.5.29.31': return p.distributionPoints.flatMap((d: any) => (d.distributionPoint ?? []).map((g: any) => g.value)).join('\n')
      case '1.3.6.1.5.5.7.1.1': return p.accessDescriptions.map((a: any) => `${oidName(a.accessMethod)}: ${a.accessLocation.value}`).join('\n')
      case '2.5.29.32': return p.certificatePolicies.map((c: any) => oidName(c.policyIdentifier)).join(', ')
    }
  } catch { /* fall through */ }
  return hex(e.extnValue.valueBlock.valueHexView, ' ').slice(0, 300)
  void asn1
}
const ipStr = (b: Uint8Array) => (b.length === 4 ? Array.from(b).join('.') : Array.from({ length: 8 }, (_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(':'))

async function keyInfo(spki: any) {
  const alg = oidName(spki.algorithm.algorithmId)
  let size = ''
  try {
    if (alg === 'RSA') { const pk = spki.parsedKey; let m = pk.modulus.valueBlock.valueHexView as Uint8Array; if (m[0] === 0) m = m.subarray(1); size = `${m.length * 8} bit` }
    else if (alg === 'EC') size = oidName(spki.algorithm.algorithmParams.valueBlock.toString())
  } catch { /* ignore */ }
  if (alg === 'EC' && !size) { try { size = oidName(spki.algorithm.algorithmParams.getValue?.() ?? '') } catch { /* ignore */ } }
  return { alg, size }
}

async function digest(alg: string, b: Uint8Array) { return hex(await crypto.subtle.digest(alg, b as unknown as BufferSource)) }

export type Decoded =
  | { type: 'cert'; rows: [string, string][]; subject: [string, string][]; issuer: [string, string][]; ext: { name: string; critical: boolean; value: string }[]; notBefore: Date; notAfter: Date; selfSigned: boolean; label: string }
  | { type: 'csr'; rows: [string, string][]; subject: [string, string][]; ext: { name: string; critical: boolean; value: string }[]; label: string; sigOk: boolean | null }
  | { type: 'crl'; rows: [string, string][]; issuer: [string, string][]; revoked: [string, string][]; label: string }
  | { type: 'asn1'; tree: string; label: string }

export async function decode(der: Uint8Array, label: string): Promise<Decoded> {
  const asn1js = await import('asn1js'); const pkijs = await import('pkijs')
  const buf = der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer
  const tryCert = !/REQUEST|CRL/.test(label)
  if (tryCert) {
    try {
      const c = pkijs.Certificate.fromBER(buf)
      const k = await keyInfo(c.subjectPublicKeyInfo)
      const ext = (c.extensions ?? []).map((e: any) => ({ name: oidName(e.extnID), critical: !!e.critical, value: extValue(e, asn1js) }))
      return {
        type: 'cert', label, subject: nameRows(c.subject), issuer: nameRows(c.issuer), ext, notBefore: c.notBefore.value, notAfter: c.notAfter.value, selfSigned: nameStr(c.subject) === nameStr(c.issuer),
        rows: [['Version', `v${c.version + 1}`], ['Serial number', hex(c.serialNumber.valueBlock.valueHexView)], ['Signature algorithm', oidName(c.signatureAlgorithm.algorithmId)], ['Public key', `${k.alg}${k.size ? ' ' + k.size : ''}`], ['Valid from', c.notBefore.value.toUTCString()], ['Valid until', c.notAfter.value.toUTCString()], ['SHA-256 fingerprint', await digest('SHA-256', der)], ['SHA-1 fingerprint', await digest('SHA-1', der)]],
      }
    } catch (e) { if (label === 'CERTIFICATE') throw e }
  }
  if (/REQUEST/.test(label) || label === 'UNKNOWN') {
    try {
      const r = pkijs.CertificationRequest.fromBER(buf)
      const k = await keyInfo(r.subjectPublicKeyInfo)
      let sigOk: boolean | null = null; try { sigOk = await r.verify() } catch { sigOk = null }
      const extAttr = (r.attributes ?? []).find((a: any) => a.type === '1.2.840.113549.1.9.14')
      let ext: { name: string; critical: boolean; value: string }[] = []
      if (extAttr) { const exts = new pkijs.Extensions({ schema: extAttr.values[0] }); ext = exts.extensions.map((e: any) => ({ name: oidName(e.extnID), critical: !!e.critical, value: extValue(e, asn1js) })) }
      return { type: 'csr', label, subject: nameRows(r.subject), ext, sigOk, rows: [['Signature algorithm', oidName(r.signatureAlgorithm.algorithmId)], ['Public key', `${k.alg}${k.size ? ' ' + k.size : ''}`], ['Signature', sigOk === null ? 'Could not check' : sigOk ? 'Valid (self-signed by the key)' : 'Invalid']] }
    } catch (e) { if (/REQUEST/.test(label)) throw e }
  }
  if (/CRL/.test(label) || label === 'UNKNOWN') {
    try {
      const l = pkijs.CertificateRevocationList.fromBER(buf)
      return { type: 'crl', label, issuer: nameRows(l.issuer), revoked: (l.revokedCertificates ?? []).slice(0, 2000).map((rc: any) => [hex(rc.userCertificate.valueBlock.valueHexView), rc.revocationDate.value.toUTCString()]), rows: [['This update', l.thisUpdate.value.toUTCString()], ['Next update', l.nextUpdate?.value?.toUTCString() ?? ''], ['Signature algorithm', oidName(l.signatureAlgorithm.algorithmId)], ['Revoked certificates', String(l.revokedCertificates?.length ?? 0)]] }
    } catch (e) { if (/CRL/.test(label)) throw e }
  }
  return { type: 'asn1', label, tree: await asn1Tree(der) }
}

export async function asn1Tree(der: Uint8Array): Promise<string> {
  const asn1js = await import('asn1js')
  const r = asn1js.fromBER(der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer)
  if (r.offset === -1) throw new Error('This is not valid DER/BER data.')
  const lines: string[] = []
  const CLS = ['', 'UNIVERSAL', 'APPLICATION', 'CONTEXT', 'PRIVATE']
  const walk = (n: any, d: number) => {
    if (!n?.idBlock) return
    const ib = n.idBlock; const name = ib.tagClass === 1 ? (n.constructor.NAME ?? n.constructor.name) : `[${ib.tagNumber}] ${CLS[ib.tagClass]}`
    let val = ''
    const vb = n.valueBlock
    if (n instanceof asn1js.ObjectIdentifier) val = `${vb.toString()} ${OIDS[vb.toString()] ? `(${OIDS[vb.toString()]})` : ''}`
    else if (n instanceof asn1js.Integer) val = vb.valueHexView.length <= 6 ? String(vb.valueDec) : hex(vb.valueHexView, '')
    else if (typeof vb?.value === 'string') val = JSON.stringify(vb.value)
    else if (n instanceof asn1js.UTCTime || n instanceof asn1js.GeneralizedTime) val = n.toDate().toISOString()
    else if (n instanceof asn1js.Boolean) val = String(vb.value)
    else if (vb?.valueHexView && !vb.value?.length) val = `${vb.valueHexView.length} bytes ${hex(vb.valueHexView.subarray(0, 24), '')}${vb.valueHexView.length > 24 ? '…' : ''}`
    lines.push(`${'  '.repeat(d)}${name}${val ? ' ' + val : ''}`)
    if (Array.isArray(vb?.value)) for (const c of vb.value) walk(c, d + 1)
  }
  walk(r.result, 0)
  return lines.join('\n')
}

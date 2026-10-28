/* Key pair generation with Web Crypto and OpenSSH encoding (pure). */
export type KeyKind = 'rsa' | 'ecdsa' | 'ed25519'
const subtle = () => globalThis.crypto.subtle
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
const b64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
export const pem = (label: string, der: Uint8Array) => `-----BEGIN ${label}-----\n${b64(der).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`

function sshString(...parts: (Uint8Array | string)[]) {
  const enc = parts.map((p) => (typeof p === 'string' ? new TextEncoder().encode(p) : p))
  const len = enc.reduce((a, p) => a + 4 + p.length, 0)
  const out = new Uint8Array(len); const dv = new DataView(out.buffer); let o = 0
  for (const p of enc) { dv.setUint32(o, p.length); out.set(p, o + 4); o += 4 + p.length }
  return out
}
/** SSH mpint: big-endian, leading zero if high bit set. */
const mpint = (u: Uint8Array) => { let i = 0; while (i < u.length - 1 && u[i] === 0) i++; const v = u.subarray(i); return v[0] & 0x80 ? Uint8Array.from([0, ...v]) : v }
const concat = (...a: Uint8Array[]) => { const out = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length } return out }

export type GenOpts = { kind: KeyKind; bits?: 2048 | 3072 | 4096; curve?: 'P-256' | 'P-384' | 'P-521'; comment?: string; usage?: 'sign' | 'encrypt' }

export async function generate(o: GenOpts) {
  let alg: any, usages: KeyUsage[]
  if (o.kind === 'rsa') { alg = o.usage === 'encrypt' ? { name: 'RSA-OAEP', modulusLength: o.bits ?? 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5', modulusLength: o.bits ?? 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }; usages = o.usage === 'encrypt' ? ['encrypt', 'decrypt'] : ['sign', 'verify'] }
  else if (o.kind === 'ecdsa') { alg = { name: 'ECDSA', namedCurve: o.curve ?? 'P-256' }; usages = ['sign', 'verify'] }
  else { alg = { name: 'Ed25519' }; usages = ['sign', 'verify'] }
  let pair: CryptoKeyPair
  try { pair = (await subtle().generateKey(alg, true, usages)) as CryptoKeyPair } catch (e: any) { throw new Error(o.kind === 'ed25519' ? 'This browser cannot make Ed25519 keys yet. Try a recent Chrome, Edge, Firefox or Safari.' : e?.message || String(e)) }
  const spki = new Uint8Array(await subtle().exportKey('spki', pair.publicKey))
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey))
  const jwkPub = await subtle().exportKey('jwk', pair.publicKey)
  const jwkPriv = await subtle().exportKey('jwk', pair.privateKey)
  const ssh = sshKeys(o, jwkPub, jwkPriv)
  const fp = 'SHA256:' + b64(new Uint8Array(await subtle().digest('SHA-256', ssh.blob as unknown as BufferSource))).replace(/=+$/, '')
  return { publicPem: pem('PUBLIC KEY', spki), privatePem: pem('PRIVATE KEY', pkcs8), jwkPub, jwkPriv, sshPublic: ssh.pub, sshPrivate: ssh.priv, fingerprint: fp }
}

function sshKeys(o: GenOpts, pub: JsonWebKey, priv: JsonWebKey) {
  const comment = o.comment ?? ''
  let type: string, blob: Uint8Array, privPart: Uint8Array
  if (o.kind === 'rsa') {
    type = 'ssh-rsa'
    const n = mpint(b64u(pub.n!)), e = mpint(b64u(pub.e!))
    blob = sshString(type, e, n)
    privPart = sshString(type, n, e, mpint(b64u(priv.d!)), mpint(b64u(priv.qi!)), mpint(b64u(priv.p!)), mpint(b64u(priv.q!)))
  } else if (o.kind === 'ecdsa') {
    const c = ({ 'P-256': 'nistp256', 'P-384': 'nistp384', 'P-521': 'nistp521' } as const)[o.curve ?? 'P-256']
    type = `ecdsa-sha2-${c}`
    const Q = concat(Uint8Array.of(4), b64u(pub.x!), b64u(pub.y!))
    blob = sshString(type, c, Q)
    privPart = sshString(type, c, Q, mpint(b64u(priv.d!)))
  } else {
    type = 'ssh-ed25519'
    const pk = b64u(pub.x!)
    blob = sshString(type, pk)
    privPart = sshString(type, pk, concat(b64u(priv.d!), pk))
  }
  const check = crypto.getRandomValues(new Uint8Array(4))
  let body = concat(check, check, privPart, sshString(comment))
  const padN = (8 - (body.length % 8)) % 8
  body = concat(body, Uint8Array.from({ length: padN }, (_, i) => i + 1))
  const whole = concat(new TextEncoder().encode('openssh-key-v1\0'), sshString('none', 'none', new Uint8Array(0)), new Uint8Array([0, 0, 0, 1]), sshString(blob), sshString(body))
  return { blob, pub: `${type} ${b64(blob)}${comment ? ' ' + comment : ''}\n`, priv: pem('OPENSSH PRIVATE KEY', whole).replace(/(.{70})/g, '$1').replace(/^(-----BEGIN OPENSSH PRIVATE KEY-----\n)([\s\S]*?)(\n-----END)/, (_m, a, body2, c) => a + body2.replace(/\n/g, '').match(/.{1,70}/g)!.join('\n') + c) }
}

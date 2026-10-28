/* JWT sign / verify helpers on top of jose (MIT). Pure logic, also used by Node tests. */
export const JWT_ALGS = ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'] as const
export type JwtAlg = (typeof JWT_ALGS)[number]
export const isHmac = (a: string) => /^HS(256|384|512)$/.test(a)
export const isSupported = (a: string): a is JwtAlg => (JWT_ALGS as readonly string[]).includes(a)
export type SecretFormat = 'utf8' | 'base64url'

type Jose = typeof import('jose')
let joseP: Promise<Jose> | null = null
export const loadJose = () => (joseP ??= import('jose'))
type Key = Awaited<ReturnType<Jose['importSPKI']>> | Uint8Array

export function secretBytes(s: string, fmt: SecretFormat): Uint8Array {
  if (fmt === 'utf8') return new TextEncoder().encode(s)
  const t = s.trim().replace(/\s/g, '')
  if (/[^A-Za-z0-9+/=_-]/.test(t)) throw new Error('The secret is not valid Base64 or Base64URL')
  const b = t.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const bin = atob(b + '==='.slice((b.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export type KeyKind = 'secret' | 'jwk' | 'jwks' | 'spki' | 'pkcs8' | 'x509' | 'unknown'
export function detectKey(text: string): KeyKind {
  const t = text.trim()
  if (!t) return 'unknown'
  if (t.startsWith('{')) { try { const j = JSON.parse(t); return Array.isArray(j.keys) ? 'jwks' : j.kty ? 'jwk' : 'unknown' } catch { return 'unknown' } }
  if (/-----BEGIN PUBLIC KEY-----/.test(t)) return 'spki'
  if (/-----BEGIN PRIVATE KEY-----/.test(t)) return 'pkcs8'
  if (/-----BEGIN CERTIFICATE-----/.test(t)) return 'x509'
  if (/-----BEGIN (RSA|EC) (PUBLIC|PRIVATE) KEY-----/.test(t)) return 'unknown'
  return 'secret'
}
export const KEY_KIND_LABEL: Record<KeyKind, string> = { secret: 'Shared secret', jwk: 'JWK', jwks: 'JWK Set', spki: 'Public key (PEM, SPKI)', pkcs8: 'Private key (PEM, PKCS#8)', x509: 'X.509 certificate (PEM)', unknown: 'Unknown key format' }

function pemHint(text: string) {
  if (/BEGIN RSA (PUBLIC|PRIVATE) KEY/.test(text)) return 'This is a PKCS#1 RSA key. Convert it to PKCS#8 or SPKI first, for example: openssl pkcs8 -topk8 -nocrypt -in key.pem'
  if (/BEGIN EC PRIVATE KEY/.test(text)) return 'This is a SEC1 EC key. Convert it to PKCS#8 first: openssl pkcs8 -topk8 -nocrypt -in key.pem'
  return 'Paste a PEM (SPKI public key, PKCS#8 private key or certificate) or a JWK.'
}

/** Import a key for verifying. For JWKS, the token header kid picks the key. */
export async function importVerifyKey(alg: string, text: string, secretFmt: SecretFormat, kid?: string): Promise<Key> {
  const jose = await loadJose()
  if (isHmac(alg)) {
    const t = text.trim()
    if (t.startsWith('{')) { const j = JSON.parse(t); if (j.kty === 'oct') return jose.importJWK(j, alg) as Promise<Key> }
    if (!text) throw new Error('Enter the shared secret')
    return secretBytes(text, secretFmt)
  }
  const kind = detectKey(text)
  if (kind === 'spki') return jose.importSPKI(text.trim(), alg)
  if (kind === 'x509') return jose.importX509(text.trim(), alg)
  if (kind === 'pkcs8') {
    // Derive the public key from a private key so users can paste either.
    const priv = await jose.importPKCS8(text.trim(), alg, { extractable: true })
    const jwk = await jose.exportJWK(priv)
    return jose.importJWK(publicJwk(jwk), alg) as Promise<Key>
  }
  if (kind === 'jwk') { const j = JSON.parse(text); return jose.importJWK(publicJwk(j), alg) as Promise<Key> }
  if (kind === 'jwks') {
    const set = JSON.parse(text) as { keys: Record<string, unknown>[] }
    const pick = (kid && set.keys.find((k) => k.kid === kid)) || set.keys.find((k) => !k.alg || k.alg === alg)
    if (!pick) throw new Error(kid ? `No key with kid "${kid}" in this JWK Set` : 'No matching key in this JWK Set')
    return jose.importJWK(publicJwk(pick as any), alg) as Promise<Key>
  }
  throw new Error(pemHint(text))
}

/** Import a key for signing. */
export async function importSignKey(alg: string, text: string, secretFmt: SecretFormat): Promise<Key> {
  const jose = await loadJose()
  if (isHmac(alg)) {
    if (!text) throw new Error('Enter a secret to sign with')
    return secretBytes(text, secretFmt)
  }
  const kind = detectKey(text)
  if (kind === 'pkcs8') return jose.importPKCS8(text.trim(), alg)
  if (kind === 'jwk') { const j = JSON.parse(text); if (!j.d) throw new Error('This JWK is a public key. Signing needs the private key (with "d").'); return jose.importJWK(j, alg) as Promise<Key> }
  if (kind === 'spki' || kind === 'x509') throw new Error('That is a public key. Signing needs the private key (PKCS#8 PEM or private JWK).')
  throw new Error(pemHint(text))
}

const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']
export function publicJwk<T extends Record<string, unknown>>(jwk: T): T {
  if (jwk.kty === 'oct') return jwk
  const o: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(jwk)) if (!PRIVATE_FIELDS.includes(k) && k !== 'key_ops' && k !== 'ext') o[k] = v
  return o as T
}

export interface VerifyResult {
  signature: 'ok' | 'bad'
  error?: string
  claims: { ok: boolean; problems: string[] }
}
export async function verifyJwt(token: string, key: Key, opts: { issuer?: string; audience?: string; clockTolerance?: number; now?: Date } = {}): Promise<VerifyResult> {
  const jose = await loadJose()
  try { await jose.compactVerify(token.trim(), key) } catch (e) {
    const code = (e as { code?: string }).code
    return { signature: 'bad', error: code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED' ? 'Signature does not match this key' : (e as Error).message, claims: { ok: false, problems: [] } }
  }
  const problems: string[] = []
  try {
    await jose.jwtVerify(token.trim(), key, { issuer: opts.issuer || undefined, audience: opts.audience || undefined, clockTolerance: opts.clockTolerance ?? 0, currentDate: opts.now })
  } catch (e) { problems.push(claimMessage(e as Error & { code?: string; claim?: string })) }
  return { signature: 'ok', claims: { ok: problems.length === 0, problems } }
}
function claimMessage(e: Error & { code?: string; claim?: string }) {
  if (e.code === 'ERR_JWT_EXPIRED') return 'The token has expired (exp)'
  if (e.claim === 'nbf') return 'The token is not active yet (nbf)'
  if (e.claim === 'iss') return 'Issuer (iss) does not match'
  if (e.claim === 'aud') return 'Audience (aud) does not match'
  if (e.code === 'ERR_JWT_INVALID') return 'The payload is not a JSON object, so claims cannot be checked'
  return e.message
}

export async function signJwt(header: Record<string, unknown>, payload: unknown, alg: string, key: Key): Promise<string> {
  const jose = await loadJose()
  const enc = new TextEncoder().encode(JSON.stringify(payload))
  return new jose.CompactSign(enc).setProtectedHeader({ ...header, alg }).sign(key)
}

export interface KeyPairOut { privatePem: string; publicPem: string; privateJwk: string; publicJwk: string; secret?: string }
export async function generateKeys(alg: string): Promise<KeyPairOut> {
  const jose = await loadJose()
  if (isHmac(alg)) {
    const n = Number(alg.slice(2)) / 8
    const bytes = crypto.getRandomValues(new Uint8Array(n))
    const secret = jose.base64url.encode(bytes)
    const jwk = JSON.stringify({ kty: 'oct', k: secret, alg }, null, 2)
    return { privatePem: '', publicPem: '', privateJwk: jwk, publicJwk: jwk, secret }
  }
  const { publicKey, privateKey } = await jose.generateKeyPair(alg, { extractable: true, ...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}) })
  const kid = await jose.calculateJwkThumbprint(await jose.exportJWK(publicKey))
  const pub = { ...(await jose.exportJWK(publicKey)), alg, use: 'sig', kid }
  const priv = { ...(await jose.exportJWK(privateKey)), alg, use: 'sig', kid }
  return { privatePem: await jose.exportPKCS8(privateKey), publicPem: await jose.exportSPKI(publicKey), privateJwk: JSON.stringify(priv, null, 2), publicJwk: JSON.stringify(pub, null, 2) }
}

/** Decode without verifying. */
export function decodeParts(token: string): { header: any; payload: any } {
  const p = token.trim().split('.')
  if (p.length !== 3) throw new Error(`A JWT has 3 dot separated parts, this has ${p.length}.`)
  const dec = (s: string) => new TextDecoder().decode(secretBytes(s, 'base64url'))
  const header = JSON.parse(dec(p[0]))
  let payload: any
  try { payload = JSON.parse(dec(p[1])) } catch { payload = dec(p[1]) }
  return { header, payload }
}

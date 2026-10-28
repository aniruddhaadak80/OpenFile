/* OpenPGP helpers on top of openpgp.js (LGPL, loaded on demand). */
type PGP = typeof import('openpgp')
let p: Promise<PGP> | null = null
export const loadPgp = () => (p ??= import('openpgp'))

const ALGOS: Record<string, string> = { rsaEncryptSign: 'RSA', rsaEncrypt: 'RSA', rsaSign: 'RSA', ecdh: 'ECDH', ecdsa: 'ECDSA', eddsa: 'EdDSA (legacy)', eddsaLegacy: 'EdDSA (legacy)', ed25519: 'Ed25519', x25519: 'X25519', ed448: 'Ed448', x448: 'X448', elgamal: 'ElGamal', dsa: 'DSA' }

export async function generate(o: { name: string; email: string; passphrase?: string; type: 'ecc' | 'rsa' | 'curve25519'; rsaBits?: number; expiryDays?: number }) {
  const pgp = await loadPgp()
  const r = await pgp.generateKey({ userIDs: [{ name: o.name, email: o.email }], passphrase: o.passphrase || undefined, type: o.type, rsaBits: o.type === 'rsa' ? o.rsaBits ?? 4096 : undefined, keyExpirationTime: o.expiryDays ? o.expiryDays * 86400 : 0, format: 'armored' })
  return { publicKey: r.publicKey, privateKey: r.privateKey, revocation: r.revocationCertificate }
}

export async function readKeys(armored: string) {
  const pgp = await loadPgp()
  const keys = await pgp.readKeys({ armoredKeys: armored })
  return keys
}

export async function keyInfo(armored: string) {
  const pgp = await loadPgp()
  const keys = await pgp.readKeys({ armoredKeys: armored.trim() })
  return Promise.all(keys.map(async (k) => {
    let exp: Date | number | null = null; try { exp = await k.getExpirationTime() } catch { exp = null }
    const alg = k.getAlgorithmInfo()
    return {
      fingerprint: k.getFingerprint().toUpperCase().replace(/(.{4})/g, '$1 ').trim(), keyID: k.getKeyID().toHex().toUpperCase(), users: k.getUserIDs(), created: k.getCreationTime(),
      expires: exp === Infinity || exp === null ? null : (exp as Date), algorithm: `${ALGOS[alg.algorithm] ?? alg.algorithm}${alg.bits ? ` ${alg.bits}-bit` : ''}${alg.curve ? ` (${alg.curve})` : ''}`,
      isPrivate: k.isPrivate(), locked: k.isPrivate() ? !(k as any).isDecrypted() : false,
      subkeys: k.getSubkeys().map((s) => { const a = s.getAlgorithmInfo(); return `${s.getKeyID().toHex().toUpperCase()} ${ALGOS[a.algorithm] ?? a.algorithm}${a.bits ? ' ' + a.bits : ''}` }),
      revoked: await k.isRevoked().catch(() => false),
    }
  }))
}

async function unlock(armored: string, passphrase: string) {
  const pgp = await loadPgp()
  const key = await pgp.readPrivateKey({ armoredKey: armored.trim() })
  if (key.isDecrypted()) return key
  if (!passphrase) throw new Error('This private key is protected. Enter its passphrase.')
  try { return await pgp.decryptKey({ privateKey: key, passphrase }) } catch { throw new Error('Wrong passphrase for the private key.') }
}

export async function encrypt(o: { data: string | Uint8Array; publicKeys: string; signKey?: string; signPass?: string; password?: string; armor: boolean; filename?: string }) {
  const pgp = await loadPgp()
  const message = typeof o.data === 'string' ? await pgp.createMessage({ text: o.data }) : await pgp.createMessage({ binary: o.data, filename: o.filename, format: 'binary' })
  const encryptionKeys = o.publicKeys.trim() ? await pgp.readKeys({ armoredKeys: o.publicKeys.trim() }) : undefined
  if (!encryptionKeys && !o.password) throw new Error('Add a recipient public key or a password.')
  const signingKeys = o.signKey?.trim() ? await unlock(o.signKey, o.signPass ?? '') : undefined
  if (o.armor) return (await pgp.encrypt({ message, encryptionKeys, passwords: o.password ? [o.password] : undefined, signingKeys, format: 'armored' })) as string
  return (await pgp.encrypt({ message, encryptionKeys, passwords: o.password ? [o.password] : undefined, signingKeys, format: 'binary' })) as Uint8Array
}

export async function decrypt(o: { message: string | Uint8Array; privateKey?: string; passphrase?: string; password?: string; verifyKeys?: string; binary?: boolean }) {
  const pgp = await loadPgp()
  const message = typeof o.message === 'string' ? await pgp.readMessage({ armoredMessage: o.message.trim() }) : await pgp.readMessage({ binaryMessage: o.message })
  const decryptionKeys = o.privateKey?.trim() ? await unlock(o.privateKey, o.passphrase ?? '') : undefined
  if (!decryptionKeys && !o.password) throw new Error('Add your private key, or the password the message was encrypted with.')
  const verificationKeys = o.verifyKeys?.trim() ? await pgp.readKeys({ armoredKeys: o.verifyKeys.trim() }) : undefined
  let r: any
  try { r = await pgp.decrypt({ message, decryptionKeys, passwords: o.password ? [o.password] : undefined, verificationKeys, format: o.binary ? 'binary' : 'utf8' }) } catch (e: any) { throw new Error(/session key|decrypt/i.test(e?.message) ? 'Could not decrypt. The key or password does not match this message.' : e?.message || String(e)) }
  const sigs = await Promise.all((r.signatures ?? []).map(async (s: any) => { try { await s.verified; return { keyID: s.keyID.toHex().toUpperCase(), ok: true } } catch (e: any) { return { keyID: s.keyID.toHex().toUpperCase(), ok: false, err: e?.message } } }))
  return { data: r.data as string | Uint8Array, filename: r.filename as string | undefined, signatures: verificationKeys ? sigs : sigs.map((s) => ({ ...s, ok: null as boolean | null })) }
}

export async function sign(o: { text: string; privateKey: string; passphrase?: string; detached: boolean }) {
  const pgp = await loadPgp()
  const signingKeys = await unlock(o.privateKey, o.passphrase ?? '')
  if (o.detached) return pgp.sign({ message: await pgp.createMessage({ text: o.text }), signingKeys, detached: true, format: 'armored' }) as Promise<string>
  return pgp.sign({ message: await pgp.createCleartextMessage({ text: o.text }), signingKeys, format: 'armored' }) as Promise<string>
}

export async function verify(o: { signed: string; publicKeys: string; detachedSig?: string }) {
  const pgp = await loadPgp()
  const verificationKeys = await pgp.readKeys({ armoredKeys: o.publicKeys.trim() })
  let r: any, text: string
  if (o.detachedSig?.trim()) { r = await pgp.verify({ message: await pgp.createMessage({ text: o.signed }), signature: await pgp.readSignature({ armoredSignature: o.detachedSig.trim() }), verificationKeys }); text = o.signed }
  else if (/BEGIN PGP SIGNED MESSAGE/.test(o.signed)) { const m = await pgp.readCleartextMessage({ cleartextMessage: o.signed.trim() }); r = await pgp.verify({ message: m, verificationKeys }); text = m.getText() }
  else { const m = await pgp.readMessage({ armoredMessage: o.signed.trim() }); r = await pgp.verify({ message: m, verificationKeys }); text = String(r.data) }
  const sigs = await Promise.all(r.signatures.map(async (s: any) => { try { await s.verified; const sig = await s.signature; return { keyID: s.keyID.toHex().toUpperCase(), ok: true, date: sig.packets[0]?.created as Date | undefined } } catch (e: any) { return { keyID: s.keyID.toHex().toUpperCase(), ok: false, err: e?.message as string } } }))
  return { text, signatures: sigs }
}

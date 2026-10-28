import assert from 'node:assert/strict'
import * as J from '../../../src/lib/b5/jwt.ts'
const payload = { sub: '42', iss: 'me', aud: 'you', iat: 1700000000, exp: Math.floor(Date.now() / 1000) + 600 }
// HS256 against a known vector from RFC-style sample
const hsKey = await J.importSignKey('HS256', 'your-256-bit-secret', 'utf8')
const t = await J.signJwt({ typ: 'JWT' }, payload, 'HS256', hsKey)
const vk = await J.importVerifyKey('HS256', 'your-256-bit-secret', 'utf8')
let r = await J.verifyJwt(t, vk, { issuer: 'me', audience: 'you' })
assert.equal(r.signature, 'ok'); assert.ok(r.claims.ok)
r = await J.verifyJwt(t, await J.importVerifyKey('HS256', 'wrong', 'utf8')); assert.equal(r.signature, 'bad')
r = await J.verifyJwt(t, vk, { audience: 'other' }); assert.equal(r.signature, 'ok'); assert.match(r.claims.problems[0], /Audience/)
// jwt.io sample token
const sample = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
r = await J.verifyJwt(sample, vk); assert.equal(r.signature, 'ok')
for (const alg of ['RS256', 'PS384', 'ES256', 'ES512', 'EdDSA']) {
  const k = await J.generateKeys(alg)
  assert.equal(J.detectKey(k.privatePem), 'pkcs8'); assert.equal(J.detectKey(k.publicPem), 'spki'); assert.equal(J.detectKey(k.publicJwk), 'jwk')
  const tok = await J.signJwt({ typ: 'JWT', kid: JSON.parse(k.publicJwk).kid }, payload, alg, await J.importSignKey(alg, k.privatePem, 'utf8'))
  for (const pubText of [k.publicPem, k.publicJwk, k.privatePem, JSON.stringify({ keys: [JSON.parse(k.publicJwk)] })]) {
    const key = await J.importVerifyKey(alg, pubText, 'utf8', JSON.parse(k.publicJwk).kid)
    assert.equal((await J.verifyJwt(tok, key)).signature, 'ok', alg)
  }
  const tok2 = await J.signJwt({}, payload, alg, await J.importSignKey(alg, k.privateJwk, 'utf8'))
  assert.equal((await J.verifyJwt(tok2, await J.importVerifyKey(alg, k.publicPem, 'utf8'))).signature, 'ok')
}
const expired = await J.signJwt({}, { exp: 1000 }, 'HS256', hsKey)
r = await J.verifyJwt(expired, vk); assert.equal(r.signature, 'ok'); assert.match(r.claims.problems[0], /expired/)
assert.deepEqual(J.decodeParts(sample).payload.name, 'John Doe')
await assert.rejects(J.importVerifyKey('RS256', '-----BEGIN RSA PUBLIC KEY-----\nAAA\n-----END RSA PUBLIC KEY-----', 'utf8'), /PKCS#1/)
const hk = await J.generateKeys('HS512'); assert.equal(J.secretBytes(hk.secret, 'base64url').length, 64)
console.log('jwt ok')

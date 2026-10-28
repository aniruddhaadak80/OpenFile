import assert from 'node:assert/strict'
import { encryptBytes, decryptBytes, opensslEncrypt, toB64, fromB64 } from '../../../src/lib/b5/enc.ts'
import { execSync } from 'node:child_process'
import { writeFileSync, readFileSync } from 'node:fs'
const msg = new TextEncoder().encode('hello openfile ✓')
for (const a of ['aes-gcm', 'aes-cbc', 'chacha20']) {
  const c = await encryptBytes(msg, 'pw', a, 1000)
  const d = await decryptBytes(fromB64(toB64(c)), 'pw')
  assert.equal(new TextDecoder().decode(d.data), 'hello openfile ✓', a)
  await assert.rejects(decryptBytes(c, 'bad'))
}
const o = await opensslEncrypt(msg, 'pw')
writeFileSync('/tmp/b5.enc', o)
try {
  const plain = execSync('openssl enc -d -aes-256-cbc -pbkdf2 -md sha256 -pass pass:pw -in /tmp/b5.enc').toString()
  assert.equal(plain, 'hello openfile ✓')
  execSync('printf "from openssl" | openssl enc -aes-256-cbc -pbkdf2 -md sha256 -pass pass:pw -out /tmp/b5b.enc')
  const d2 = await decryptBytes(new Uint8Array(readFileSync('/tmp/b5b.enc')), 'pw')
  assert.equal(new TextDecoder().decode(d2.data), 'from openssl')
  console.log('openssl interop ok')
} catch (e) { if (String(e).includes('not found')) console.log('openssl missing, skipped'); else throw e }
console.log('enc ok')

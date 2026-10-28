import assert from 'node:assert/strict'
import { generate } from '../../../src/lib/b5/keys.ts'
import { writeFileSync, chmodSync } from 'node:fs'
import { execSync } from 'node:child_process'
const hasSsh = (() => { try { execSync('which ssh-keygen'); return true } catch { return false } })()
for (const o of [{ kind: 'rsa', bits: 2048 }, { kind: 'ecdsa', curve: 'P-256' }, { kind: 'ecdsa', curve: 'P-521' }, { kind: 'ed25519' }]) {
  const k = await generate({ ...o, comment: 'test@openfile' })
  assert.match(k.publicPem, /BEGIN PUBLIC KEY/); assert.match(k.sshPublic, /^(ssh-|ecdsa-)/)
  if (hasSsh) {
    writeFileSync('/tmp/k', k.sshPrivate); chmodSync('/tmp/k', 0o600)
    const derived = execSync('ssh-keygen -y -f /tmp/k').toString().trim()
    assert.equal(derived.split(' ').slice(0, 2).join(' '), k.sshPublic.trim().split(' ').slice(0, 2).join(' '), o.kind)
    writeFileSync('/tmp/k.pub', k.sshPublic)
    const fp = execSync('ssh-keygen -lf /tmp/k.pub').toString()
    assert.ok(fp.includes(k.fingerprint), 'fingerprint ' + o.kind)
    const pemOk = execSync('openssl pkey -in /dev/stdin -noout -text', { input: k.privatePem }).toString(); assert.ok(pemOk.length > 10)
  }
}
console.log('keys ok', hasSsh ? '(verified with ssh-keygen)' : '(ssh-keygen missing)')

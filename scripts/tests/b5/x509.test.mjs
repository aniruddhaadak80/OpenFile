import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { pemBlocks, decode } from '../../../src/lib/b5/x509.ts'
if (!existsSync('/tmp/c.pem')) { console.log('no fixtures, skipped'); process.exit(0) }
const [c] = pemBlocks(readFileSync('/tmp/c.pem', 'utf8'))
const d = await decode(c.der, c.label)
assert.equal(d.type, 'cert'); assert.deepEqual(d.subject[0], ['CN', 'example.com'])
const san = d.ext.find((e) => e.name === 'Subject Alternative Name'); assert.match(san.value, /DNS: www.example.com/); assert.match(san.value, /IP: 10.0.0.1/)
assert.ok(d.rows.find((r) => r[0] === 'Public key')[1].includes('EC'))
console.log(d.rows.map((r) => r.join(': ')).join('\n')); console.log(d.ext)
const [r] = pemBlocks(readFileSync('/tmp/r.pem', 'utf8')); const dr = await decode(r.der, r.label); assert.equal(dr.type, 'csr'); assert.equal(dr.sigOk, true)
const [rc] = pemBlocks(readFileSync('/tmp/rc.pem', 'utf8')); const drc = await decode(rc.der, rc.label); assert.ok(drc.rows.find((x) => x[0] === 'Public key')[1].includes('2048'))
const [k] = pemBlocks(readFileSync('/tmp/rk.pem', 'utf8')); const dk = await decode(k.der, k.label); assert.equal(dk.type, 'asn1'); assert.match(dk.tree, /SEQUENCE/i); console.log(dk.tree.split("\n").slice(0,6).join("\n")); console.log(d.rows[3])
console.log('x509 ok')

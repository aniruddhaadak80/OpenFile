// Run: node --experimental-strip-types scripts/tests/b4/archive.test.mjs
// Exercises the exact 7z command lines the worker uses, against the real 7z-wasm engine.
import assert from 'node:assert/strict'
import SevenZip from '7z-wasm'
import { createArgs, buildTree } from '../../../src/lib/b4/archive.ts'

async function engine() { const log = []; const sz = await SevenZip({ print: (s) => log.push(s), printErr: (s) => log.push(s), noExitRuntime: true }); return { sz, log } }
async function create(fmt, opts) {
  const { sz, log } = await engine()
  sz.FS.mkdir('/in'); sz.FS.mkdir('/in/docs'); sz.FS.writeFile('/in/docs/a.txt', 'hello world '.repeat(50)); sz.FS.writeFile('/in/-dash.txt', 'dash')
  sz.FS.chdir('/in'); sz.callMain(createArgs(fmt, ['docs', '-dash.txt'], opts))
  assert.ok(!/ERROR/.test(log.join('\n')), log.join('\n'))
  return sz.FS.readFile(fmt === 'zip' ? '/out.zip' : fmt === '7z' ? '/out.7z' : '/out.tar')
}
async function extract(data, name, pw = '') {
  const { sz, log } = await engine()
  sz.FS.writeFile('/' + name, data); sz.FS.mkdir('/out')
  sz.callMain(['x', '/' + name, '-o/out', '-y', '-aou', '-p' + pw, '-bb0', '-bd'])
  return { log: log.join('\n'), read: (p) => sz.FS.readFile('/out/' + p, { encoding: 'utf8' }) }
}
for (const [fmt, opts] of [['zip', {}], ['zip', { password: 'pw' }], ['7z', { password: 'pw', encryptNames: true }], ['tar', {}]]) {
  const data = await create(fmt, opts)
  const ext = fmt === 'tar' ? 'tar' : fmt
  const bad = await extract(data, 'x.' + ext, opts.password ? 'nope' : '')
  if (opts.password) assert.match(bad.log, /Wrong password|Can not open encrypted/)
  const ok = await extract(data, 'x.' + ext, opts.password ?? '')
  assert.ok(!/ERROR/.test(ok.log), ok.log)
  assert.equal(ok.read('docs/a.txt').length, 600); assert.equal(ok.read('-dash.txt'), 'dash')
}
// single-stream compressors used for tar.xz and tar.bz2
for (const t of ['xz', 'bzip2', 'gzip']) {
  const { sz, log } = await engine()
  sz.FS.writeFile('/data', 'abc'.repeat(1000)); sz.FS.chdir('/')
  sz.callMain(['a', '-t' + t, '-mx=6', '-bd', '-y', '/out.bin', '--', 'data'])
  assert.ok(!/ERROR/.test(log.join('\n')), t)
  const back = await extract(sz.FS.readFile('/out.bin'), 'in.' + (t === 'bzip2' ? 'bz2' : t === 'gzip' ? 'gz' : 'xz'))
  assert.match(back.log, /Everything is Ok/)
}
const tree = buildTree([{ path: 'a/b.txt', data: new Uint8Array(3) }, { path: 'a/c/d.txt', data: new Uint8Array(5) }, { path: 'z.txt', data: new Uint8Array(1) }])
assert.equal(tree.size, 9); assert.equal(tree.children[0].name, 'a'); assert.equal(tree.children[0].size, 8)
console.log('archive: all tests passed')

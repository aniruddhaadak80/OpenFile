// Checks a Tauri updater feed the way an installed OpenFile would, before users see it:
//  - latest.json parses, has a semantic version (optionally equal to --expect), notes and a pub_date
//  - every platform entry (windows, macOS Intel and Apple silicon, Linux) is present
//  - every URL answers 200 and the downloaded file's minisign signature verifies against the public key in
//    desktop/src-tauri/tauri.conf.json (ed25519, prehashed BLAKE2b-512 or legacy), including the trusted comment
//  - the version is newer than --older (for example 1.1.0), so an older install would be offered the update
// Usage: node scripts/verify-updater.mjs <latest.json path or URL> [--expect 1.2.0] [--older 1.1.0] [--no-download]
import { readFileSync } from 'node:fs'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const src = args[0]
const REQUIRED = ['windows-x86_64', 'darwin-x86_64', 'darwin-aarch64', 'linux-x86_64']
let failed = 0
const fail = (m) => { failed++; console.error(`FAIL ${m}`) }
const ok = (m) => console.log(`ok   ${m}`)

const b64text = (s) => Buffer.from(s.trim(), 'base64').toString('utf8')
function parseKey(pubB64) {
  const lines = b64text(pubB64).split('\n').map((l) => l.trim()).filter(Boolean)
  const raw = Buffer.from(lines[1], 'base64')
  if (raw.length !== 42 || raw.subarray(0, 2).toString() !== 'Ed') throw new Error('not a minisign ed25519 public key')
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw.subarray(10)]), format: 'der', type: 'spki' })
  return { id: raw.subarray(2, 10).toString('hex'), key }
}
export function verifyMinisign(data, sigB64, pub) {
  const lines = b64text(sigB64).split('\n').map((l) => l.replace(/\r$/, ''))
  const sigLine = Buffer.from(lines[1].trim(), 'base64')
  const trusted = lines.find((l) => l.startsWith('trusted comment: '))?.slice('trusted comment: '.length) ?? ''
  const global = Buffer.from((lines[lines.findIndex((l) => l.startsWith('trusted comment: ')) + 1] || '').trim(), 'base64')
  const alg = sigLine.subarray(0, 2).toString()
  const id = sigLine.subarray(2, 10).toString('hex')
  const sig = sigLine.subarray(10, 74)
  if (id !== pub.id) return { ok: false, why: `signed by key ${id}, expected ${pub.id}` }
  const msg = alg === 'ED' ? createHash('blake2b512').update(data).digest() : data
  if (!verify(null, msg, pub.key, sig)) return { ok: false, why: 'file signature does not match' }
  if (global.length === 64 && !verify(null, Buffer.concat([sig, Buffer.from(trusted)]), pub.key, global)) return { ok: false, why: 'trusted comment signature does not match' }
  return { ok: true, why: `${alg === 'ED' ? 'prehashed' : 'legacy'} ed25519, key ${id}, "${trusted}"` }
}

function cmp(a, b) {
  const p = (v) => v.replace(/^v/, '').split(/[-+]/)[0].split('.').map(Number)
  const x = p(a), y = p(b)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1
  const pa = a.includes('-'), pb = b.includes('-')
  return pa === pb ? 0 : pa ? -1 : 1
}

async function main() {
  if (!src) { console.error('usage: verify-updater.mjs <latest.json> [--expect x.y.z] [--older x.y.z]'); process.exit(2) }
  const conf = JSON.parse(readFileSync(join(root, 'desktop/src-tauri/tauri.conf.json'), 'utf8'))
  const pub = parseKey(conf.plugins.updater.pubkey)
  ok(`public key ${pub.id} from tauri.conf.json`)
  const text = /^https?:/.test(src) ? await (await fetch(src, { redirect: 'follow' })).text() : readFileSync(src, 'utf8')
  const feed = JSON.parse(text)
  if (!/^\d+\.\d+\.\d+/.test(feed.version || '')) fail(`version "${feed.version}" is not semantic`); else ok(`version ${feed.version}`)
  if (opt('--expect') && feed.version !== opt('--expect').replace(/^v/, '')) fail(`version ${feed.version} is not the expected ${opt('--expect')}`)
  if (opt('--older')) { if (cmp(feed.version, opt('--older')) > 0) ok(`an install of ${opt('--older')} is offered ${feed.version}`); else fail(`${feed.version} is not newer than ${opt('--older')}`) }
  if (!feed.pub_date || isNaN(Date.parse(feed.pub_date))) fail('pub_date missing or invalid'); else ok(`pub_date ${feed.pub_date}`)
  if (typeof feed.notes !== 'string') fail('notes missing')
  const plats = feed.platforms || {}
  for (const k of REQUIRED) if (!plats[k]) fail(`platform ${k} missing`)
  const seen = new Map()
  for (const [k, p] of Object.entries(plats)) {
    if (!p.url || !p.signature) { fail(`${k}: url or signature missing`); continue }
    if (!p.url.startsWith('https://github.com/aniruddhaadak80/OpenFile/releases/download/')) fail(`${k}: url outside the project's releases: ${p.url}`)
    if (args.includes('--no-download')) continue
    let data = seen.get(p.url)
    if (!data) {
      const r = await fetch(p.url, { redirect: 'follow' })
      if (r.status !== 200) { fail(`${k}: ${p.url} answered ${r.status}`); continue }
      data = Buffer.from(await r.arrayBuffer())
      seen.set(p.url, data)
      ok(`${k}: ${p.url.split('/').pop()} 200, ${(data.length / 1048576).toFixed(1)} MB`)
    }
    const v = verifyMinisign(data, p.signature, pub)
    if (v.ok) ok(`${k}: signature verified (${v.why})`); else fail(`${k}: ${v.why}`)
  }
  if (failed) { console.error(`${failed} check(s) failed`); process.exit(1) }
  console.log('updater feed verified')
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1) })

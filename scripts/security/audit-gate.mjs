#!/usr/bin/env node
// Fails CI on any high or critical advisory in production dependencies (npm audit --omit=dev),
// except advisories listed in scripts/security/audit-allowlist.json with a reviewed reason.
// An allowlisted advisory is reported again as soon as npm offers a non-breaking fix, so it gets fixed.
// Usage: node scripts/security/audit-gate.mjs            (runs npm audit itself)
//        node scripts/security/audit-gate.mjs audit.json (reads a saved `npm audit --json` report)
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const allow = JSON.parse(readFileSync(join(here, 'audit-allowlist.json'), 'utf8')).advisories
const allowed = new Map(allow.map((a) => [a.id, a]))

let raw
if (process.argv[2]) raw = readFileSync(process.argv[2], 'utf8')
else {
  try { raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', maxBuffer: 64 << 20 }) }
  catch (e) { raw = e.stdout } // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw)
const vulns = report.vulnerabilities ?? {}
const SEV = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 }

const blocking = [], accepted = [], fixable = []
for (const [pkg, v] of Object.entries(vulns)) {
  for (const via of v.via ?? []) {
    if (typeof via !== 'object') continue // inherited from another package, reported there
    if ((SEV[via.severity] ?? 0) < SEV.high) continue
    const id = (via.url || '').split('/').pop()
    const row = `${via.severity.padEnd(8)} ${pkg}@${via.range}  ${id}  ${via.title}`
    const fix = v.fixAvailable
    const safeFix = fix === true || (fix && typeof fix === 'object' && !fix.isSemVerMajor)
    if (!allowed.has(id)) blocking.push(row)
    else if (safeFix) fixable.push(`${row}  (a non-breaking fix is now available: npm audit fix)`)
    else accepted.push(`${row}  [accepted: ${allowed.get(id).reason}]`)
  }
}

const meta = report.metadata?.vulnerabilities ?? {}
console.log(`npm audit --omit=dev: ${meta.critical ?? 0} critical, ${meta.high ?? 0} high, ${meta.moderate ?? 0} moderate, ${meta.low ?? 0} low`)
if (accepted.length) console.log(`\nReviewed and accepted (no safe fix yet):\n  ${accepted.join('\n  ')}`)
if (fixable.length) console.log(`\nAllowlisted but now fixable:\n  ${fixable.join('\n  ')}`)
if (blocking.length) console.log(`\nNew high or critical advisories:\n  ${blocking.join('\n  ')}`)
if (blocking.length || fixable.length) {
  console.log('\nFix the dependency, or after review add the advisory id with a reason to scripts/security/audit-allowlist.json.')
  process.exit(1)
}
console.log('\nNo unreviewed high or critical advisories.')

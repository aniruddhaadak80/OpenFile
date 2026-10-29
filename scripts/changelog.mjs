// Release notes from Conventional Commits (https://www.conventionalcommits.org).
//   feat -> Added, fix -> Fixed, perf -> Performance, refactor -> Changed, docs -> Docs, build/ci -> Build,
//   "!" after the type or a "BREAKING CHANGE:" footer -> Breaking changes. chore, test and style are left out.
//   Commits that do not follow the format are listed under Other changes, so nothing is lost.
// Usage:
//   node scripts/changelog.mjs --version v1.2.0                  print the notes for HEAD since the previous tag
//   node scripts/changelog.mjs --version v1.2.0 --write          also put them at the top of CHANGELOG.md (replaces an
//                                                                 existing section for the same version)
//   node scripts/changelog.mjs --from v1.1.0 --to v1.2.0 --out notes.md
// The release workflow runs it for every tag and uses the result as the GitHub Release notes and in latest.json.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined }
const git = (c) => execSync(`git ${c}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 }).toString().trim()
const REPO = 'https://github.com/aniruddhaadak80/OpenFile'

const to = opt('--to') || 'HEAD'
const version = (opt('--version') || (to !== 'HEAD' ? to : '')).replace(/^v?/, 'v')
let from = opt('--from')
if (!from) {
  // previous version tag reachable from "to", skipping "to" itself when it is a tag
  try {
    const tags = git(`tag --merged ${to} --sort=-v:refname`).split('\n').filter((t) => /^v\d+\.\d+\.\d+/.test(t) && t !== version && t !== to)
    from = tags[0]
  } catch { from = undefined }
}
const range = from ? `${from}..${to}` : to
const raw = git(`log ${range} --no-merges --format=%h%x1f%s%x1f%b%x1e`)
const GROUPS = [['breaking', 'Breaking changes'], ['feat', 'Added'], ['fix', 'Fixed'], ['perf', 'Performance'], ['refactor', 'Changed'], ['docs', 'Docs'], ['build', 'Build'], ['other', 'Other changes']]
const MAP = { feat: 'feat', fix: 'fix', perf: 'perf', refactor: 'refactor', revert: 'fix', docs: 'docs', build: 'build', ci: 'build' }
const SKIP = new Set(['chore', 'test', 'style'])
const groups = Object.fromEntries(GROUPS.map(([k]) => [k, []]))

for (const rec of raw.split('\x1e')) {
  const [hash, subject, body = ''] = rec.trim().split('\x1f')
  if (!hash || !subject) continue
  const m = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/)
  const link = `([${hash}](${REPO}/commit/${hash}))`
  if (!m) { groups.other.push(`- ${subject} ${link}`); continue }
  const [, type, scope, bang, desc] = m
  const t = type.toLowerCase()
  if (!MAP[t] && !SKIP.has(t)) { groups.other.push(`- ${subject} ${link}`); continue } // "Blog: ..." is not a commit type
  if (SKIP.has(t) && !bang) continue
  const line = `- ${scope ? `**${scope}**: ` : ''}${desc} ${link}`
  if (bang || /^BREAKING[ -]CHANGE:/m.test(body)) groups.breaking.push(line)
  groups[MAP[t] || 'other'].push(line)
}

const date = (() => { try { return git(`log -1 --format=%cs ${to}`) } catch { return new Date().toISOString().slice(0, 10) } })()
let md = `## ${version || 'Unreleased'} (${date})\n\n`
const any = GROUPS.some(([k]) => groups[k].length)
if (!any) md += 'Maintenance release.\n\n'
for (const [k, title] of GROUPS) if (groups[k].length) md += `### ${title}\n\n${groups[k].join('\n')}\n\n`
if (from) md += `Full list: ${REPO}/compare/${from}...${version || to}\n`
md = md.trimEnd() + '\n'

const out = opt('--out')
if (out) writeFileSync(out, md)
if (args.includes('--write')) {
  const p = join(root, 'CHANGELOG.md')
  let cl = readFileSync(p, 'utf8')
  const esc = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const existing = new RegExp(`^## ${esc} [^\\n]*\\n[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm')
  if (existing.test(cl)) cl = cl.replace(existing, md + '\n')
  else {
    const head = cl.indexOf('# Changelog')
    const first = cl.indexOf('\n## ', head >= 0 ? head : 0)
    cl = first >= 0 ? cl.slice(0, first + 1) + md + '\n' + cl.slice(first + 1) : cl.trimEnd() + '\n\n' + md
  }
  writeFileSync(p, cl)
  console.error(`changelog: wrote ${version} to CHANGELOG.md (${range})`)
}
if (!out) process.stdout.write(md)

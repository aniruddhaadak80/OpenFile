// Copies the built app (../../dist) into this package and stamps the version.
//   node scripts/prepare-dist.mjs [--version 1.2.0] [--from ../../dist]
// Tool demo videos (*.mp4, *.webm) are left out to keep the package small; the app shows their
// poster images instead. Source maps are left out too.
import { cpSync, existsSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const from = resolve(pkgDir, arg('--from') || '../../dist')
const to = join(pkgDir, 'dist')
if (!existsSync(join(from, 'index.html'))) { console.error(`prepare-dist: ${from}/index.html not found, build the app first`); process.exit(1) }

const SKIP = new Set(['.mp4', '.webm', '.map', '.br', '.gz'])
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true, filter: (src) => !SKIP.has(extname(src).toLowerCase()) })

const version = arg('--version')
if (version) {
  const p = join(pkgDir, 'package.json')
  const pkg = JSON.parse(readFileSync(p, 'utf8'))
  pkg.version = version
  writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n')
}
const license = resolve(pkgDir, '../../LICENSE')
if (existsSync(license)) copyFileSync(license, join(pkgDir, 'LICENSE'))

let n = 0, bytes = 0
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else { n++; bytes += s.size } } }
walk(to)
console.log(`prepare-dist: ${n} files, ${(bytes / 1048576).toFixed(1)} MB in ${to}${version ? `, version ${version}` : ''}`)

// Writes <dist>/version.json after a build: the app version, git commit, build time and tool count.
// The desktop and mobile apps compare their bundled copy with the hosted one at
// https://aniruddhaadak80.github.io/OpenFile/version.json to offer newer tools between releases (hybrid mode),
// and the Settings Updates panel shows the build. Runs for both bases ("/" on Vercel, "/OpenFile/" on Pages).
// "shell" is the oldest app version whose native features this web build relies on; older apps keep their copy.
// Usage: node scripts/gen-version.mjs [dist]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.argv[2] || 'dist'
const MIN_SHELL = '1.2.0'
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const git = (c) => { try { return execSync(c, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
const commit = process.env.GITHUB_SHA?.slice(0, 7) || git('git rev-parse --short HEAD') || 'unknown'

let tools = 0
try {
  const { runnerImport } = await import('vite')
  const { module: reg } = await runnerImport(join(root, 'src/tools/registry.ts'), { configFile: false, logLevel: 'silent', resolve: { alias: { '@': join(root, 'src') } } })
  tools = reg.TOOLS.length
} catch {
  // fallback: tool pages pre-rendered by postbuild
  try { tools = (readFileSync(join(root, out, 'sitemap.xml'), 'utf8').match(/<loc>/g) || []).length } catch { tools = 0 }
}

if (!existsSync(out)) { console.error(`gen-version: ${out} not found`); process.exit(1) }
const base = (readFileSync(join(out, 'index.html'), 'utf8').match(/(?:src|href)="([^"]*?)assets\//)?.[1]) || '/'
const info = { version: pkg.version, commit, builtAt: new Date().toISOString(), tools, shell: MIN_SHELL, base }
writeFileSync(join(out, 'version.json'), JSON.stringify(info, null, 2) + '\n')
console.log(`gen-version: ${join(out, 'version.json')} v${info.version} ${commit} ${tools} tools base ${base}`)

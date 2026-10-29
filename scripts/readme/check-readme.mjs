#!/usr/bin/env node
// README check: keeps README.md honest about the catalog and the films.
//
//   node scripts/readme/check-readme.mjs          exit 1 and list every problem
//   node scripts/readme/check-readme.mjs --warn   print problems but exit 0
//
// It runs before every build (prebuild). When it fails, run `npm run docs:catalog`, which rewrites
// every generated count and table, then commit README.md.
//
// What it checks
//   counts   the tools and categories badges, the tagline, the stats alt text and the catalog headline
//            match src/tools/registry.ts (plus src/tools/batches), read the same way as gen-readme-catalog
//   catalog  one catalog row per tool and one <details> block per category
//   media    the GIF teasers exist and stay under 10 MB, and the README never links a relative .mp4
//            (GitHub cannot play those, it shows a raw file view)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WARN = process.argv.includes('--warn')
const rel = (p) => path.join(ROOT, p)

async function loadCatalog() {
  const { build } = await import(pathToFileURL(rel('node_modules/esbuild/lib/main.js')).href)
  const out = await build({
    entryPoints: [rel('src/tools/registry.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [{
      name: 'strip-vite-glob',
      setup(b) {
        b.onLoad({ filter: /registry\.ts$/ }, (a) => ({
          contents: fs.readFileSync(a.path, 'utf8').replace(/import\.meta\.glob\([^)]*\)/g, '({})'),
          loader: 'ts',
        }))
      },
    }],
  })
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
  if (!Array.isArray(mod.TOOLS) || !Array.isArray(mod.CATEGORIES)) throw new Error('registry exports missing')
  const used = mod.CATEGORIES.filter((c) => mod.TOOLS.some((t) => t.category === c.id))
  return { tools: mod.TOOLS, categories: used }
}

let catalog
try {
  catalog = await loadCatalog()
} catch (e) {
  // Never block a build because the checker itself could not load the registry.
  console.warn(`[readme] skipped, could not read the registry: ${e.message}`)
  process.exit(0)
}

const TOTAL = catalog.tools.length
const NCAT = catalog.categories.length
if (!fs.existsSync(rel('README.md'))) {
  console.warn('[readme] skipped, README.md is not in this checkout')
  process.exit(0)
}
const readme = fs.readFileSync(rel('README.md'), 'utf8')
const problems = []

function expectAll(label, re, want) {
  const found = [...readme.matchAll(re)].map((m) => Number(m[1]))
  if (!found.length) problems.push(`${label}: not found in README`)
  for (const n of found) if (n !== want) problems.push(`${label}: README says ${n}, registry has ${want}`)
}

// Counts
expectAll('tools badge', /img\.shields\.io\/badge\/tools-(\d+)-/g, TOTAL)
expectAll('categories badge', /img\.shields\.io\/badge\/categories-(\d+)-/g, NCAT)
expectAll('tagline tools', /<b>(\d+) free, open-source tools<\/b>/g, TOTAL)
expectAll('tagline studios', /<b>(\d+) studios<\/b>/g, NCAT)
expectAll('stats alt tools', /alt="(\d+) tools · \d+ categories/g, TOTAL)
expectAll('stats alt categories', /alt="\d+ tools · (\d+) categories/g, NCAT)
expectAll("What's new tools", /OpenFile now has \*\*(\d+) tools in \d+ studios\*\*/g, TOTAL)
expectAll("What's new studios", /OpenFile now has \*\*\d+ tools in (\d+) studios\*\*/g, NCAT)
expectAll('catalog headline tools', /> \*\*(\d+) tools across \d+ studios\.\*\*/g, TOTAL)
expectAll('catalog headline studios', /> \*\*\d+ tools across (\d+) studios\.\*\*/g, NCAT)

// Catalog rows
const block = readme.match(/<!-- catalog:start -->([\s\S]*?)<!-- catalog:end -->/)
if (!block) problems.push('catalog: markers <!-- catalog:start --> / <!-- catalog:end --> not found')
else {
  const rows = (block[1].match(/<tr><td><a href=/g) || []).length
  const groups = (block[1].match(/<details/g) || []).length
  if (rows !== TOTAL) problems.push(`catalog: ${rows} tool rows, registry has ${TOTAL} tools`)
  if (groups !== NCAT) problems.push(`catalog: ${groups} category groups, registry has ${NCAT} categories`)
}

// Media
const MAX = 10 * 1024 * 1024
for (const gif of ['docs/assets/readme/launch-teaser.gif', 'docs/assets/readme/apps-teaser.gif']) {
  if (!fs.existsSync(rel(gif))) problems.push(`media: ${gif} is missing (bash scripts/readme/make-gifs.sh)`)
  else if (fs.statSync(rel(gif)).size > MAX) problems.push(`media: ${gif} is over 10 MB`)
  else if (!readme.includes(gif)) problems.push(`media: README does not show ${gif}`)
}
const relMp4 = [...readme.matchAll(/(?:href|src)="(?!https?:)([^"]+\.mp4)"/g)].map((m) => m[1])
for (const m of relMp4) problems.push(`media: relative mp4 link "${m}" does not play on GitHub, link the GitHub Pages copy instead`)

if (problems.length) {
  console.error(`[readme] ${problems.length} problem(s), registry has ${TOTAL} tools in ${NCAT} categories:`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error('[readme] fix: npm run docs:catalog (counts and catalog), bash scripts/readme/make-gifs.sh (GIFs)')
  process.exit(WARN ? 0 : 1)
}
console.log(`[readme] ok, ${TOTAL} tools in ${NCAT} categories, catalog and media in sync`)

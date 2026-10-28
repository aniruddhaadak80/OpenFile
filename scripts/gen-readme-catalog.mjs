#!/usr/bin/env node
// Regenerates every place in the README and docs that depends on the tool catalog.
//
//   node scripts/gen-readme-catalog.mjs          write the files
//   node scripts/gen-readme-catalog.mjs --check  exit 1 if any file is out of date (for CI)
//
// Source of truth: src/tools/registry.ts plus every batch file it imports (src/tools/batches/b*.ts).
// The registry is bundled with esbuild (already a Vite dependency) so the real TOOLS and CATEGORIES arrays
// are used. If that fails for any reason, a regex parser reads slug, name, desc, category, badge, popular
// and pipeline straight from the source files instead.
//
// What it updates (all blocks are rerunnable):
//   README.md               badge, tagline and alt text counts, What's new, toolbox grid, full catalog,
//                           mermaid pie and mindmap, architecture count, repo tree, roadmap counts
//   docs/assets/stats.svg   the animated "in numbers" strip (gold on black)
//   docs/assets/category-orbit.svg  the animated category orbit
//   docs/ARCHITECTURE.md    tools per category table and the tool count
//   docs/TOOL_GUIDE.md      category list
//   docs/assets/hero.svg, launch-card.svg, quickstart-terminal.svg  the tool count in their text
//
// Generated blocks sit between markers such as <!-- catalog:start --> and <!-- catalog:end -->.
// Anything outside the markers is hand-written and left alone, apart from a few count patterns
// (for example "329 tools") that are updated in place with regexes.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://openfile-studio.vercel.app'
const CHECK = process.argv.includes('--check')
const rel = (p) => path.join(ROOT, p)
const read = (p) => fs.readFileSync(rel(p), 'utf8')

/* ------------------------------------------------------------------ catalog loading */

async function loadViaEsbuild() {
  const { build } = await import(pathToFileURL(path.join(ROOT, 'node_modules/esbuild/lib/main.js')).href)
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
        // import.meta.glob is a Vite feature; the catalog arrays do not need it.
        b.onLoad({ filter: /registry\.ts$/ }, (a) => ({
          contents: fs.readFileSync(a.path, 'utf8').replace(/import\.meta\.glob\([^)]*\)/g, '({})'),
          loader: 'ts',
        }))
      },
    }],
  })
  const code = out.outputFiles[0].text
  const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
  if (!Array.isArray(mod.TOOLS) || !Array.isArray(mod.CATEGORIES)) throw new Error('registry exports missing')
  return { tools: mod.TOOLS, categories: mod.CATEGORIES, via: 'esbuild' }
}

function unquote(s) {
  return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

function loadViaRegex() {
  const regSrc = read('src/tools/registry.ts')
  const str = (field, chunk) => {
    const m = chunk.match(new RegExp(`\\b${field}:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`))
    return m ? unquote(m[2]) : undefined
  }
  // Categories, in registry order.
  const catBlock = regSrc.match(/ALL_CATEGORIES[^=]*=\s*\[([\s\S]*?)\n\]/)
  const categories = []
  for (const line of (catBlock ? catBlock[1] : '').split('\n')) {
    const id = str('id', line)
    if (id) categories.push({ id, name: str('name', line), blurb: str('blurb', line), color: str('color', line) })
  }
  // Source files in the order TOOLS is spread: core first, then the batches in import order.
  const files = [{ file: 'src/tools/registry.ts', src: regSrc.slice(regSrc.indexOf('CORE_TOOLS')) }]
  for (const m of regSrc.matchAll(/import\s*\{\s*\w+\s*\}\s*from\s*'\.\/batches\/(\w+)'/g)) {
    files.push({ file: `src/tools/batches/${m[1]}.ts`, src: read(`src/tools/batches/${m[1]}.ts`) })
  }
  const tools = []
  for (const { src } of files) {
    const starts = [...src.matchAll(/\bslug:\s*'/g)].map((m) => m.index)
    starts.forEach((start, i) => {
      const chunk = src.slice(start, starts[i + 1] ?? src.length)
      const t = {
        slug: str('slug', chunk),
        name: str('name', chunk),
        desc: str('desc', chunk),
        category: str('category', chunk),
        badge: str('badge', chunk),
        popular: /\bpopular:\s*true/.test(chunk),
        pipeline: str('pipeline', chunk),
      }
      if (t.slug && t.name && t.category) tools.push(t)
    })
  }
  const used = categories.filter((c) => tools.some((t) => t.category === c.id))
  return { tools, categories: used, via: 'regex' }
}

async function loadCatalog() {
  try {
    return await loadViaEsbuild()
  } catch (e) {
    console.warn(`[catalog] esbuild import failed (${e.message}), falling back to the regex parser`)
    return loadViaRegex()
  }
}

/* ------------------------------------------------------------------ helpers */

const EMOJI = {
  pdf: '📄', convert: '🔄', image: '🖼️', video: '🎬', audio: '🎧', dev: '🧑‍💻', text: '📝', design: '🖌️',
  data: '📊', ai: '🤖', '3d': '🧊', archive: '🗜️', ebook: '📚', font: '🔤', cad: '📐', subtitle: '💬',
}
// Short labels for the orbit and mindmap where the full name is too long.
const SHORT = { pdf: 'PDF', dev: 'Developer', text: 'Text', archive: 'Archives', ebook: 'eBooks', font: 'Fonts', subtitle: 'Subtitles' }

// Colors that must never appear (brand rule). Anything in this range is swapped for gold.
function safeColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#F5A524'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d < 0.08) return '#' + m[1].toUpperCase() // greys are fine
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return h >= 250 && h <= 345 ? '#F5A524' : '#' + m[1].toUpperCase()
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// House style: no em or en dashes and no exclamation marks in prose.
const tidy = (s) => String(s ?? '')
  .replace(/\s*[\u2014\u2013]\s*/g, ', ')
  .replace(/!+/g, '.')
  .replace(/\s+/g, ' ')
  .trim()
const link = (slug) => `${SITE}/${slug}`
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

function replaceBlock(text, name, body, file) {
  const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`)
  if (!re.test(text)) throw new Error(`${file}: markers <!-- ${name}:start --> / <!-- ${name}:end --> not found`)
  return text.replace(re, `$1\n${body.trim()}\n$2`)
}

/* ------------------------------------------------------------------ main */

const { tools, categories, via } = await loadCatalog()
const byCat = new Map(categories.map((c) => [c.id, tools.filter((t) => t.category === c.id)]))
const TOTAL = tools.length
const NCAT = categories.length
for (const c of categories) c.color = safeColor(c.color)

const dupes = tools.map((t) => t.slug).filter((s, i, a) => a.indexOf(s) !== i)
if (dupes.length) console.warn(`[catalog] duplicate slugs: ${[...new Set(dupes)].join(', ')}`)

const has = (slug) => tools.some((t) => t.slug === slug)
const nameOf = (slug) => tools.find((t) => t.slug === slug)?.name ?? slug
const missing = []
const tl = (slug, label) => {
  if (!has(slug)) { missing.push(slug); return esc(label ?? slug) }
  return `[${(label ?? nameOf(slug)).replace(/([[\]])/g, '\\$1')}](${link(slug)})`
}

let previewCount = 0
try {
  // Count only entries whose video file is really there (paths are relative to public/ or to public/media/tools/).
  const idx = JSON.parse(read('public/media/tools/index.json'))
  previewCount = Object.values(idx).filter((e) => e && e.video && (
    fs.existsSync(rel(path.join('public', e.video))) || fs.existsSync(rel(path.join('public/media/tools', e.video)))
  )).length
} catch { /* optional */ }

const picks = (cat, n) => {
  const list = byCat.get(cat) ?? []
  const pop = list.filter((t) => t.popular)
  return [...pop, ...list.filter((t) => !t.popular)].slice(0, n)
}

/* ---------- What's new */
function whatsNew() {
  const L = []
  L.push(`OpenFile now has **${TOTAL} tools in ${NCAT} studios**. This release adds whole new studios, more on-device AI and a smoother way to get files in.`)
  L.push('')
  L.push(`- 🧊 **3D viewer and converter**: ${tl('3d-viewer')} opens GLB, glTF, OBJ, STL, PLY, FBX and more with orbit controls. ${tl('3d-converter')} moves models between formats and ${tl('gltf-optimizer')} shrinks them.`)
  L.push(`- 🔤 **Fonts**: ${tl('font-converter')} (TTF, OTF, WOFF, WOFF2), ${tl('font-viewer')} and ${tl('font-subsetter')} for tiny web fonts.`)
  L.push(`- 🗜️ **Archives**: ${tl('archive-extractor')} reads ZIP, 7Z, RAR, TAR and more. ${tl('archive-creator')} packs files, with optional AES-256 ZIP passwords, and ${tl('archive-converter')} turns RAR or 7Z into ZIP.`)
  L.push(`- 📚 **eBooks**: ${tl('ebook-reader')}, ${tl('ebook-converter')} (EPUB, MOBI, AZW3, FB2 and more), ${tl('epub-editor')} and ${tl('comic-converter')} for CBZ and CBR.`)
  L.push(`- 💬 **Subtitles**: ${tl('subtitle-converter')}, ${tl('subtitle-editor')}, ${tl('subtitle-sync')} and ${tl('extract-subtitles')} from MKV and MP4.`)
  L.push(`- 📐 **CAD and DXF**: ${tl('dxf-viewer')} with layers and measuring, and ${tl('cad-converter')} for clean vector output you can print.`)
  L.push(`- 📊 **Data**: ${tl('sqlite-viewer')}, ${tl('parquet-viewer')}, ${tl('csv-editor')} and ${tl('geo-converter')} for GPX, KML, GeoJSON and Shapefile.`)
  L.push(`- 🤖 **On-device AI**: ${tl('chat-pdf')}, ${tl('colorize-photo')}, ${tl('object-remover')}, ${tl('photo-enhancer')} and ${tl('pdf-summarizer')}. Models download once and then run on your device.`)
  L.push(`- 🧲 **Drop anything**: drag a file onto any page. OpenFile reads its bytes to work out the type and suggests the right tools.`)
  L.push(`- ⚖️ **Compare tools**: on the [tools page](${SITE}/tools), pick up to three tools and see formats, engines, offline support and batch support side by side.`)
  L.push(`- 📲 **Share target**: install the app, then share files from other apps straight into OpenFile.`)
  L.push(`- 🎞️ **Per-tool preview videos**: short previews on tool pages and cards${previewCount ? ` (${previewCount} so far)` : ''}.`)
  L.push(`- ✨ **New hero**: a gold ring in motion, with file chips that turn into their converted format. It pauses off screen and respects reduced motion.`)
  L.push('')
  L.push('Full list of changes: **[CHANGELOG.md](CHANGELOG.md)**')
  return L.join('\n')
}

/* ---------- Toolbox grid (4 cards per row) */
function toolbox() {
  const cells = categories.map((c) => {
    const list = byCat.get(c.id)
    const top = picks(c.id, 3).map((t) => `<a href="${link(t.slug)}">${esc(t.name)}</a>`).join('<br/>')
    const hex = c.color.slice(1)
    return [
      `<td width="25%" valign="top" align="center">`,
      `<h3>${EMOJI[c.id] ?? '🧰'}<br/>${esc(c.name)}</h3>`,
      `<img src="https://img.shields.io/badge/${list.length}-tools-${hex}?style=flat-square&labelColor=0B0D10" alt="${plural(list.length, 'tool')}"/><br/>`,
      `<sub>${esc(tidy(c.blurb))}</sub><br/><br/>`,
      top + '<br/>',
      `<a href="${SITE}/category/${c.id}"><b>Browse all →</b></a>`,
      `</td>`,
    ].join('\n')
  })
  const rows = []
  for (let i = 0; i < cells.length; i += 4) rows.push(`<tr>\n${cells.slice(i, i + 4).join('\n')}\n</tr>`)
  return `<table>\n${rows.join('\n')}\n</table>`
}

/* ---------- Full catalog */
function catalog() {
  const tagOf = (t) => {
    const tags = []
    if (t.badge === 'HOT') tags.push('🔥 Hot')
    if (t.badge === 'NEW') tags.push('✨ New')
    if (t.badge === 'AI') tags.push('🤖 AI')
    if (t.badge === 'PRO') tags.push('💎 Pro')
    if (t.popular) tags.push('⭐ Popular')
    if (t.pipeline) tags.push('🔁 Pipeline')
    return tags.join(' · ')
  }
  const out = []
  out.push(`> **${TOTAL} tools across ${NCAT} studios.** Each name is a deep link, \`${SITE}/<slug>\`, that opens the tool directly.`)
  out.push('> Legend: 🔥 Hot · ✨ New · 🤖 AI · ⭐ Popular · 🔁 Usable as a Workspace pipeline step')
  out.push('')
  categories.forEach((c, i) => {
    const list = byCat.get(c.id)
    out.push(i === 0 ? '<details open>' : '<details>')
    out.push(`<summary><b>${EMOJI[c.id] ?? '🧰'} ${esc(c.name)}</b>, ${plural(list.length, 'tool')} · <i>${esc(tidy(c.blurb))}</i></summary>`)
    out.push('<br/>')
    out.push('<table>')
    out.push('<tr><th align="left">Tool</th><th align="left">What it does</th><th align="left">Tags</th></tr>')
    for (const t of list) {
      out.push(`<tr><td><a href="${link(t.slug)}"><b>${esc(tidy(t.name))}</b></a></td><td>${esc(tidy(t.desc))}</td><td><sub>${tagOf(t)}</sub></td></tr>`)
    }
    out.push('</table>')
    out.push(`<p align="right"><a href="${SITE}/category/${c.id}">Open the ${esc(c.name)} studio ↗</a></p>`)
    out.push('</details>')
    out.push('')
  })
  return out.join('\n')
}

/* ---------- Mermaid: pie + mindmap */
const mm = (s) => tidy(s).replace(/&/g, 'and').replace(/[()[\]{}:"`#;]/g, '').replace(/\s+/g, ' ').trim()
function charts() {
  const pieVars = categories.slice(0, 12).map((c, i) => `'pie${i + 1}':'${c.color}'`).join(',')
  const pie = [
    '### 📊 Tools per category',
    '',
    '```mermaid',
    `%%{init: {'theme':'base','themeVariables':{${pieVars},'pieTitleTextSize':'20px','pieTitleTextColor':'#F5A524','pieSectionTextColor':'#050505','pieLegendTextColor':'#A8A29E','pieStrokeColor':'#050505','pieStrokeWidth':'2px','pieOuterStrokeColor':'#F5A524','pieOuterStrokeWidth':'2px','pieOpacity':'1'}}}%%`,
    'pie showData',
    `    title ${TOTAL} tools across ${NCAT} studios`,
    ...categories.map((c) => `    "${mm(c.name)}" : ${byCat.get(c.id).length}`),
    '```',
  ]
  const scale = categories.slice(0, 12).map((c, i) => `'cScale${i}':'${c.color}','cScaleLabel${i}':'#050505','cScaleInv${i}':'#050505'`).join(',')
  const mind = [
    '### 🧭 Category map',
    '',
    '```mermaid',
    `%%{init: {'theme':'base','themeVariables':{'primaryColor':'#F5A524','primaryTextColor':'#050505','primaryBorderColor':'#FFB224','lineColor':'#F5A524','fontFamily':'system-ui, sans-serif',${scale}}}}%%`,
    'mindmap',
    `  root(("OpenFile · ${TOTAL} tools"))`,
  ]
  for (const c of categories) {
    mind.push(`    ${mm(SHORT[c.id] ?? c.name)}`)
    const names = picks(c.id, 6).map((t) => mm(t.name))
    for (let i = 0; i < names.length; i += 3) mind.push(`      ${names.slice(i, i + 3).join(' · ')}`)
  }
  mind.push('```')
  return [...pie, '', ...mind].join('\n')
}

/* ---------- Repo tree */
function tree() {
  const toolDirs = fs.readdirSync(rel('src/tools'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'batches').map((d) => d.name + '/')
  const order = categories.map((c) => c.id + '/')
  toolDirs.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b))
  const batches = fs.existsSync(rel('src/tools/batches'))
    ? fs.readdirSync(rel('src/tools/batches')).filter((f) => f.endsWith('.ts')).map((f) => f.replace(/\.ts$/, '')).sort()
    : []
  // Wrap the category folders over two lines so the tree stays readable.
  const half = Math.ceil(toolDirs.length / 2)
  const dirsA = toolDirs.slice(0, half).join(' ')
  const dirsB = toolDirs.slice(half).join(' ')
  return [
    '```text',
    'OpenFile/',
    '├─ api/                      # optional Vercel functions (receive URLs, never files)',
    '│  ├─ health.ts              #   GET /api/health',
    '│  ├─ fetch-page.ts          #   GET /api/fetch-page?url=   (HTML → PDF)',
    '│  └─ meta.ts                #   GET /api/meta?url=         (link previews)',
    '├─ docs/',
    '│  ├─ assets/                # animated SVG artwork for this README',
    '│  ├─ ARCHITECTURE.md        # deep dive: engines, routing, pipelines',
    '│  └─ TOOL_GUIDE.md          # how to write a new tool',
    '├─ public/',
    '│  ├─ media/                 # launch.mp4, poster.jpg, tools/ preview videos + index.json',
    '│  ├─ og.png · icons         # social card, favicons, PWA icons',
    '│  ├─ manifest.webmanifest   # installable PWA + share target',
    '│  └─ sw.js                  # offline service worker',
    '├─ scripts/                  # postbuild, icons, launch film and preview video tooling',
    '│  └─ gen-readme-catalog.mjs # regenerates the catalog parts of README and docs',
    '├─ src/',
    '│  ├─ blog/                  # blog posts with live demos',
    '│  ├─ components/            # UI kit, layout, command palette, drop anything, compare, previews',
    '│  ├─ docs/                  # in-app docs pages (Markdown) and nav',
    '│  ├─ lib/                   # files · pdf · ffmpeg · detect · handoff · store (IndexedDB) · prefs',
    '│  ├─ pages/                 # Home, Tools, ToolPage, Workspace, Docs, Blog, History, Settings',
    '│  │  └─ workspace/steps.ts  # pipeline steps + presets',
    '│  └─ tools/',
    `│     ├─ registry.ts         # the catalog, ${TOTAL} tools, ${NCAT} categories`,
    batches.length ? `│     ├─ batches/            # more catalog entries: ${batches.join(', ')}` : null,
    '│     ├─ engines.ts · guides.ts  # "How it works" content for every tool page',
    `│     └─ ${dirsA}`,
    dirsB ? `│        ${dirsB}` : null,
    '├─ .github/workflows/        # GitHub Pages deploy',
    '├─ CHANGELOG.md              # release notes',
    '└─ vercel.json               # SPA rewrites + security headers',
    '```',
  ].filter((l) => l !== null).join('\n')
}

/* ---------- Category list for TOOL_GUIDE and the ARCHITECTURE table */
function categoryList() {
  const L = [
    `${NCAT} categories, ${TOTAL} tools. The \`category\` field of a tool must be one of these ids, and the tool file goes in \`src/tools/<id>/<slug>.tsx\`.`,
    '',
    '| Id | Studio | Tools | What it covers |',
    '|---|---|--:|---|',
    ...categories.map((c) => `| \`${c.id}\` | ${EMOJI[c.id] ?? ''} ${c.name} | ${byCat.get(c.id).length} | ${tidy(c.blurb)} |`),
  ]
  return L.join('\n')
}
function archTable() {
  return [
    '| Category | Tools |',
    '|---|:-:|',
    ...categories.map((c) => `| ${EMOJI[c.id] ?? ''} ${c.name} | ${byCat.get(c.id).length} |`),
    `| **Total** | **${TOTAL}** |`,
  ].join('\n')
}

/* ---------- SVG: stats strip (same style as before: gold on black, animated) */
function statsSvg() {
  const cards = [
    { v: String(TOTAL), label: 'TOOLS', color: '#F5A524' },
    { v: String(NCAT), label: 'CATEGORIES', color: '#14B8A6' },
    { v: '0', label: 'UPLOADS', color: '#10B981' },
    { v: '100%', label: 'OPEN SOURCE', color: '#22D3EE' },
  ]
  const g = cards.map((c, i) => {
    const x = (20 + i * 295).toFixed(1)
    const begin = `${(i * 0.25).toFixed(2).replace(/0$/, '')}s`
    return `  <g transform="translate(${x} 20)">
    <rect width="275.0" height="130" rx="20" fill="#111418" stroke="${c.color}" stroke-opacity=".45"/>
    <rect x="1" y="1" width="273.0" height="128" rx="19" fill="${c.color}" opacity=".06"><animate attributeName="opacity" values=".04;.14;.04" dur="3s" begin="${begin}" repeatCount="indefinite"/></rect>
    <g>
      <animateTransform attributeName="transform" type="translate" values="0 14;0 0;0 0" keyTimes="0;.12;1" dur="8s" begin="${begin}" repeatCount="indefinite"/>
      <text x="137.5" y="72" text-anchor="middle" font-size="54" font-weight="800" fill="${c.color}">${c.v}<animate attributeName="opacity" values="0;1;1" keyTimes="0;.12;1" dur="8s" begin="${begin}" repeatCount="indefinite"/></text>
    </g>
    <text x="137.5" y="102" text-anchor="middle" font-size="16" font-weight="600" letter-spacing="2" fill="#A8A29E">${c.label}</text>
    <rect x="30" y="114" width="215.0" height="4" rx="2" fill="#262A31"/>
    <rect x="30" y="114" width="215.0" height="4" rx="2" fill="${c.color}"><animate attributeName="width" values="0;215.0;215.0" keyTimes="0;.3;1" dur="8s" begin="${begin}" repeatCount="indefinite"/></rect>
  </g>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="170" viewBox="0 0 1200 170" role="img" aria-label="${TOTAL} tools, ${NCAT} categories, 0 uploads, 100% open source">
  <title>OpenFile in numbers</title>
  <g font-family="system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <rect width="1200" height="170" rx="26" fill="#050505"/>
${g}
  </g>
</svg>
`
}

/* ---------- SVG: category orbit (two staggered rings so 16 studios fit) */
function orbitSvg() {
  const W = 1000, H = 780, cx = 500, cy = 390
  const n = categories.length
  const radii = n > 8 ? [235, 330] : [225, 225]
  const nodes = categories.map((c, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180)
    const r = radii[i % 2]
    return { c, x: +(Math.cos(a) * r).toFixed(1), y: +(Math.sin(a) * r).toFixed(1), count: byCat.get(c.id).length }
  })
  const lines = nodes.map((p) => `<line x1="0" y1="0" x2="${p.x}" y2="${p.y}" stroke="${p.c.color}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 7"><animate attributeName="stroke-dashoffset" from="0" to="-20" dur="1.2s" repeatCount="indefinite"/></line>`).join('')
  const pills = nodes.map((p, i) => {
    const label = SHORT[p.c.id] ?? p.c.name
    const w = Math.max(104, Math.round(label.length * 9 + 26))
    return `    <g transform="translate(${p.x} ${p.y})"><g>
      <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="80s" repeatCount="indefinite"/>
      <circle r="48" fill="${p.c.color}" opacity=".12"><animate attributeName="r" values="42;52;42" dur="3s" begin="-${(i * 0.3).toFixed(1)}s" repeatCount="indefinite"/></circle>
      <rect x="-${(w / 2).toFixed(1)}" y="-28" width="${w}" height="56" rx="16" fill="#111418" stroke="${p.c.color}" stroke-width="2"/>
      <text y="-4" text-anchor="middle" font-size="15" font-weight="700" fill="#F5F3EE">${esc(label)}</text>
      <text y="17" text-anchor="middle" font-size="13" font-weight="600" fill="${p.c.color}">${plural(p.count, 'tool')}</text>
    </g></g>`
  }).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${NCAT} tool categories orbiting the OpenFile core">
  <title>OpenFile categories</title>
  <defs>
    <radialGradient id="core"><stop offset="0" stop-color="#FFB224"/><stop offset=".7" stop-color="#F5A524"/><stop offset="1" stop-color="#9A5B05"/></radialGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#FFB224" stop-opacity=".5"/><stop offset="1" stop-color="#FFB224" stop-opacity="0"/></radialGradient>
  </defs>
  <g font-family="system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <rect width="${W}" height="${H}" rx="28" fill="#050505"/>
  <circle cx="${cx}" cy="${cy}" r="${radii[1]}" fill="none" stroke="#F5A524" stroke-opacity=".22" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="${radii[0]}" fill="none" stroke="#F5A524" stroke-opacity=".28" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="155" fill="none" stroke="#14B8A6" stroke-opacity=".3" stroke-dasharray="2 9" stroke-width="2">
    <animateTransform attributeName="transform" type="rotate" from="360 ${cx} ${cy}" to="0 ${cx} ${cy}" dur="40s" repeatCount="indefinite"/></circle>
  <g transform="translate(${cx} ${cy})"><g>
    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="80s" repeatCount="indefinite"/>
    ${lines}
${pills}
  </g></g>
  <circle cx="${cx}" cy="${cy}" r="120" fill="url(#halo)"><animate attributeName="r" values="100;135;100" dur="4s" repeatCount="indefinite"/></circle>
  <circle cx="${cx}" cy="${cy}" r="74" fill="#0B0D10" stroke="url(#core)" stroke-width="6"/>
  <circle cx="${cx}" cy="${cy}" r="82" fill="none" stroke="#FFB224" stroke-opacity=".35" stroke-width="2"><animate attributeName="stroke-opacity" values=".15;.6;.15" dur="3s" repeatCount="indefinite"/></circle>
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="40" font-weight="800" fill="#F5A524">${TOTAL}</text>
  <text x="${cx}" y="${cy + 30}" text-anchor="middle" font-size="14" font-weight="600" letter-spacing="2" fill="#F5F3EE">TOOLS</text>
  </g>
</svg>
`
}

/* ------------------------------------------------------------------ README */
function updateReadme(text) {
  let s = text
  // Generated blocks
  s = replaceBlock(s, 'whatsnew', whatsNew(), 'README.md')
  s = replaceBlock(s, 'toolbox', toolbox(), 'README.md')
  s = replaceBlock(s, 'catalog', catalog(), 'README.md')
  s = replaceBlock(s, 'charts', charts(), 'README.md')
  s = replaceBlock(s, 'tree', tree(), 'README.md')
  // Inline counts (patterns match any number, so reruns keep working)
  s = s.replace(/(img\.shields\.io\/badge\/tools-)\d+(-)/g, `$1${TOTAL}$2`)
  s = s.replace(/alt="\d+ tools"(\/>\s*\n\s*<img src="https:\/\/img\.shields\.io\/badge\/uploads)/, `alt="${TOTAL} tools"$1`)
  s = s.replace(/<b>\d+ free, open-source tools<\/b>/g, `<b>${TOTAL} free, open-source tools</b>`)
  s = s.replace(/alt="\d+ tools · \d+ categories · /g, `alt="${TOTAL} tools · ${NCAT} categories · `)
  s = s.replace(/alt="(?:\d+|Eight|Sixteen) studios orbiting/g, `alt="${NCAT} studios orbiting`)
  s = s.replace(/(Tool registry<br\/>)\d+ tools/g, `$1${TOTAL} tools`)
  s = s.replace(/the homepage stays light even with \d+ tools/g, `the homepage stays light even with ${TOTAL} tools`)
  s = s.replace(/\d+ in-browser tools : \d+ studios/g, `${TOTAL} in-browser tools : ${NCAT} studios`)
  s = s.replace(/- \[x\] \d+ in-browser tools across \d+ studios/g, `- [x] ${TOTAL} in-browser tools across ${NCAT} studios`)
  return s
}

/* ------------------------------------------------------------------ write */
const targets = [
  ['README.md', updateReadme],
  ['docs/assets/stats.svg', () => statsSvg()],
  ['docs/assets/category-orbit.svg', () => orbitSvg()],
  ['docs/ARCHITECTURE.md', (t) => replaceBlock(t, 'arch-counts', archTable(), 'docs/ARCHITECTURE.md')
    .replace(/Every one of its \d+ tools/g, `Every one of its ${TOTAL} tools`)],
  ['docs/TOOL_GUIDE.md', (t) => replaceBlock(t, 'categories', categoryList(), 'docs/TOOL_GUIDE.md')],
  // Hand-made README artwork: only the tool count inside the text is touched.
  ['docs/assets/hero.svg', (t) => t.replace(/>\d+ tools for PDF/g, `>${TOTAL} tools for PDF`)],
  ['docs/assets/launch-card.svg', (t) => t.replace(/· \d+ tools ·/g, `· ${TOTAL} tools ·`)],
  ['docs/assets/quickstart-terminal.svg', (t) => t.replace(/Drop a file: \d+ tools,/g, `Drop a file: ${TOTAL} tools,`)],
]

let stale = 0
for (const [file, fn] of targets) {
  const before = fs.existsSync(rel(file)) ? read(file) : ''
  const after = fn(before)
  if (after === before) { console.log(`  unchanged  ${file}`); continue }
  stale++
  if (CHECK) console.log(`  STALE      ${file}`)
  else { fs.writeFileSync(rel(file), after); console.log(`  updated    ${file}`) }
}

if (missing.length) console.warn(`[catalog] What's new links to slugs that are not in the registry: ${missing.join(', ')}`)
console.log(`[catalog] ${TOTAL} tools in ${NCAT} categories (read via ${via})`)
for (const c of categories) console.log(`  ${c.id.padEnd(9)} ${String(byCat.get(c.id).length).padStart(3)}  ${c.name}`)
if (CHECK && stale) { console.error(`${stale} file(s) out of date. Run: node scripts/gen-readme-catalog.mjs`); process.exit(1) }

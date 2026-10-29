// Parity check: every tool, category and blog post must ship the same assets as the older ones.
// Exits non-zero and lists every gap when something is missing. Run it before every push:
//   node scripts/check-parity.mjs            (human readable report)
//   node scripts/check-parity.mjs --json     (machine readable report)
//
// Tools      public/media/tools/<slug>.mp4 + .jpg, an index.json entry, an icon in src/components/icons.ts,
//            name/desc/category/icon set, a component at src/tools/<category>/<slug>.tsx, a row in the README catalog.
// Categories name, blurb, colour, at least one tool, a hover preview (the lead tool picked the same way as
//            categoryInfo in src/components/hero/pool.ts has a video and poster), a row in docs/TOOL_GUIDE.md.
// Blog posts a manifest entry with cover loop, explainer film, illustrations and narration voices, the matching files in
//            public/media/blog/<slug>/ (cover, loop, poster, captions, word timings per voice) and 2+ quiz questions.
// Docs       every category has its /docs/tools/<id> guide page, every tool an entry on it with steps and engines.
//            With --dist (after a build) the pre-rendered tool, category and docs pages must exist as well.
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rd = (p) => readFileSync(join(root, p), 'utf8')
const has = (p) => existsSync(join(root, p)) && statSync(join(root, p)).size > 0
const asJson = process.argv.includes('--json')

const { runnerImport } = await import('vite')
const cfg = { configFile: false, logLevel: 'silent', resolve: { alias: { '@': join(root, 'src') } } }
const reg = (await runnerImport(join(root, 'src/tools/registry.ts'), cfg)).module
const TOOLS = reg.TOOLS
const CATEGORIES = reg.CATEGORIES

const gaps = { tools: [], categories: [], posts: [] }
const add = (kind, id, what) => gaps[kind].push({ id, what })

/* ---------- tools ---------- */
const index = has('public/media/tools/index.json') ? JSON.parse(rd('public/media/tools/index.json')) : {}
const icons = rd('src/components/icons.ts')
const iconNames = new Set((icons.match(/import\s*\{([^}]*)\}\s*from\s*'lucide-react'/)?.[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean))
const readme = has('README.md') ? rd('README.md') : ''
const catIds = new Set(CATEGORIES.map((c) => c.id))
const seen = new Set()
const hasMedia = (slug) => has(`public/media/tools/${slug}.mp4`) && has(`public/media/tools/${slug}.jpg`) && !!index[slug]?.video
for (const t of TOOLS) {
  const s = t.slug
  if (seen.has(s)) add('tools', s, 'duplicate slug')
  seen.add(s)
  for (const k of ['name', 'desc', 'category', 'icon']) if (!t[k]) add('tools', s, `missing ${k}`)
  if (t.category && !catIds.has(t.category)) add('tools', s, `unknown category ${t.category}`)
  if (!has(`src/tools/${t.category}/${s}.tsx`)) add('tools', s, `no component src/tools/${t.category}/${s}.tsx`)
  if (!has(`public/media/tools/${s}.mp4`)) add('tools', s, 'no preview video')
  if (!has(`public/media/tools/${s}.jpg`)) add('tools', s, 'no preview poster')
  if (!index[s]) add('tools', s, 'no media index.json entry')
  else if (!index[s].video || !index[s].poster) add('tools', s, 'index.json entry lacks video or poster')
  if (t.icon && !iconNames.has(t.icon)) add('tools', s, `icon ${t.icon} not in src/components/icons.ts (run node scripts/gen-icons.mjs)`)
  if (readme && !readme.includes(`/${s})`) && !readme.includes(`/${s}"`) && !readme.includes(`\`${s}\``)) add('tools', s, 'not in README catalog (npm run docs:catalog)')
}
for (const k of Object.keys(index)) if (!seen.has(k)) add('tools', k, 'index.json entry for a tool that is not in the registry')

/* ---------- categories ---------- */
const guide = has('docs/TOOL_GUIDE.md') ? rd('docs/TOOL_GUIDE.md') : ''
for (const c of CATEGORIES) {
  for (const k of ['name', 'blurb', 'color']) if (!c[k]) add('categories', c.id, `missing ${k}`)
  const list = TOOLS.filter((t) => t.category === c.id)
  if (!list.length) { add('categories', c.id, 'no tools'); continue }
  const lead = list.find((t) => t.popular) ?? list[0] // same pick as categoryInfo in src/components/hero/pool.ts
  if (!hasMedia(lead.slug)) add('categories', c.id, `hover card lead tool ${lead.slug} has no preview video`)
  if (!guide.includes(`| \`${c.id}\` |`)) add('categories', c.id, 'no row in docs/TOOL_GUIDE.md categories table (npm run docs:catalog)')
}

/* ---------- docs: one guide page per category, one docs entry per tool ---------- */
let navPages = [], categoryDoc = null
try { navPages = (await runnerImport(join(root, 'src/pages/docs/nav.ts'), cfg)).module.ALL_PAGES ?? [] } catch (e) { add('categories', '*', `docs nav could not be loaded: ${e?.message || e}`) }
try { categoryDoc = (await runnerImport(join(root, 'src/docs/content.ts'), cfg)).module.categoryDoc } catch (e) { add('categories', '*', `docs content could not be loaded: ${e?.message || e}`) }
const docText = {}
for (const c of CATEGORIES) {
  if (!navPages.some((p) => p.path === `/docs/tools/${c.id}`)) add('categories', c.id, `no docs page /docs/tools/${c.id} in src/pages/docs/nav.ts`)
  if (categoryDoc) { try { docText[c.id] = categoryDoc(c.id) } catch (e) { add('categories', c.id, `docs page fails to render: ${e?.message || e}`) } }
}
for (const t of TOOLS) {
  const md = docText[t.category]
  if (!md) continue
  const i = md.indexOf(`\n## ${t.name}\n`)
  if (i < 0 || !md.includes(`](/${t.slug})`)) { add('tools', t.slug, `no entry on docs page /docs/tools/${t.category}`); continue }
  const sec = md.slice(i, md.indexOf('\n## ', i + 4) > 0 ? md.indexOf('\n## ', i + 4) : undefined)
  if (!/\n1\. /.test(sec)) add('tools', t.slug, 'docs entry has no how-to steps')
  if (!sec.includes('**Under the hood:**')) add('tools', t.slug, 'docs entry has no engine line')
}
// After a build (CI passes --dist), the pre-rendered pages must exist too
if (process.argv.includes('--dist')) {
  for (const t of TOOLS) if (!has(`dist/${t.slug}/index.html`)) add('tools', t.slug, `no pre-rendered page dist/${t.slug}/index.html`)
  for (const c of CATEGORIES) {
    if (!has(`dist/docs/tools/${c.id}/index.html`)) add('categories', c.id, `no pre-rendered docs page dist/docs/tools/${c.id}/index.html`)
    if (!has(`dist/category/${c.id}/index.html`)) add('categories', c.id, `no pre-rendered category page dist/category/${c.id}/index.html`)
  }
}

/* ---------- blog posts ---------- */
const meta = rd('src/blog/meta.ts')
const slugs = [...meta.matchAll(/\{\s*slug:\s*'([^']+)'/g)].map((m) => m[1])
const manifest = has('src/blog/media/manifest.json') ? JSON.parse(rd('src/blog/media/manifest.json')) : { posts: {} }
const quizSrc = rd('src/blog/media/quizzes.ts')
for (const s of slugs) {
  const m = manifest.posts?.[s]
  const dir = `public/media/blog/${s}`
  if (!m) { add('posts', s, 'no entry in src/blog/media/manifest.json (run scripts/blog-media/make.py)'); continue }
  if (!has(`${dir}/cover.webp`)) add('posts', s, 'no cover.webp')
  if (!m.loop) add('posts', s, 'manifest has no cover loop')
  if (!has(`${dir}/loop.mp4`) || !has(`${dir}/loop.webm`)) add('posts', s, 'no loop.mp4 / loop.webm')
  if (!m.video?.dur || !m.video?.mp4) add('posts', s, 'manifest has no explainer film')
  if (!has(`${dir}/video-poster.webp`)) add('posts', s, 'no video-poster.webp')
  if (!has(`${dir}/captions.vtt`)) add('posts', s, 'no captions.vtt')
  if (!m.images?.length) add('posts', s, 'no illustrations')
  for (const im of m.images ?? []) if (!has(`${dir}/${im.src}`)) add('posts', s, `illustration ${im.src} missing`)
  if (!m.voices?.length) add('posts', s, 'no read-aloud narration')
  for (const v of m.voices ?? []) {
    if (!has(`${dir}/read-${v.id}.json`)) add('posts', s, `no word timings read-${v.id}.json`)
    else { try { const j = JSON.parse(rd(`${dir}/read-${v.id}.json`)); if (!Array.isArray(j.b) || !j.b.length || !j.b.some((x) => Array.isArray(x[2]) && x[2].length)) add('posts', s, `read-${v.id}.json has no timings`) } catch { add('posts', s, `read-${v.id}.json is not valid JSON`) } }
    if (!v.mp3 || !v.dur) add('posts', s, `narration ${v.id} has no audio`)
  }
  const qm = quizSrc.match(new RegExp(`'${s.replace(/[-]/g, '\\-')}':\\s*\\[([\\s\\S]*?)\\n\\s*\\],`))
  const nq = qm ? (qm[1].match(/\{\s*q:/g) ?? []).length : 0
  if (nq < 2) add('posts', s, `quiz has ${nq} questions, needs 2`)
}

/* ---------- report ---------- */
const docsChecked = Object.keys(docText).length
const total = gaps.tools.length + gaps.categories.length + gaps.posts.length
if (asJson) console.log(JSON.stringify({ tools: TOOLS.length, categories: CATEGORIES.length, posts: slugs.length, gaps }, null, 2))
else {
  console.log(`check-parity: ${TOOLS.length} tools, ${CATEGORIES.length} categories, ${slugs.length} blog posts, ${docsChecked} docs guide pages checked`)
  for (const [kind, list] of Object.entries(gaps)) {
    if (!list.length) { console.log(`  ${kind}: ok`); continue }
    console.log(`  ${kind}: ${list.length} gaps`)
    for (const g of list) console.log(`    - ${g.id}: ${g.what}`)
  }
  console.log(total ? `check-parity: FAILED with ${total} gaps` : 'check-parity: all assets at parity')
}
process.exit(total ? 1 : 0)

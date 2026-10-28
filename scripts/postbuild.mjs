// Post-build step for every deployment target.
//  1. Pre-renders a copy of index.html for every route (dist/<route>/index.html) with a route-specific
//     <title>, description, canonical URL and Open Graph tags, so deep links return HTTP 200 on hosts
//     without SPA rewrites (GitHub Pages) and crawlers see meaningful metadata.
//  2. Writes sitemap.xml and robots.txt for the right base URL.
//  3. Keeps the 404.html SPA fallback and .nojekyll for GitHub Pages.
//
// Usage: node scripts/postbuild.mjs [outDir=dist]
// Env:   VITE_BASE (optional; detected from the built index.html), SITE_URL (absolute origin + base override)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.argv[2] || 'dist'
const indexPath = join(outDir, 'index.html')
if (!existsSync(indexPath)) { console.error(`postbuild: ${indexPath} not found, run vite build first`); process.exit(1) }
const shell = readFileSync(indexPath, 'utf8')

// ---- base path: env wins, else read it from the built asset URLs ----
const detected = shell.match(/(?:src|href)="([^"]*?)assets\//)?.[1]
let base = process.env.VITE_BASE || detected || '/'
if (!base.startsWith('/')) base = '/' + base
if (!base.endsWith('/')) base += '/'
const defaultSite = base === '/' ? 'https://openfile-studio.vercel.app' : `https://aniruddhaadak80.github.io${base.replace(/\/$/, '')}`
const site = (process.env.SITE_URL || defaultSite).replace(/\/+$/, '')
const abs = (route) => `${site}/${route ? route.replace(/^\/+/, '') : ''}`

// ---- read routes from source (regex keeps this script dependency-free) ----
const registry = readFileSync(join(root, 'src/tools/registry.ts'), 'utf8')
const unq = (s) => s.replace(/\\'/g, "'")
const tools = [...registry.matchAll(/\{\s*slug:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)+)',\s*desc:\s*'((?:[^'\\]|\\.)+)',\s*category:\s*'(\w+)'/g)].map((m) => ({ slug: m[1], name: unq(m[2]), desc: unq(m[3]), category: m[4] }))
const categories = [...registry.matchAll(/\{\s*id:\s*'(\w+)',\s*name:\s*'([^']+)',\s*blurb:\s*'([^']+)'/g)].map((m) => ({ id: m[1], name: m[2], blurb: m[3] }))
const nav = readFileSync(join(root, 'src/docs/nav.ts'), 'utf8')
const docs = [...nav.matchAll(/\{\s*id:\s*'([^']+)',\s*path:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)+)',\s*description:\s*'((?:[^'\\]|\\.)+)'/g)].map((m) => ({ id: m[1], path: m[2], title: unq(m[3]), description: unq(m[4]) }))
if (!tools.length || !categories.length || !docs.length) { console.error(`postbuild: could not parse routes (tools=${tools.length}, categories=${categories.length}, docs=${docs.length})`); process.exit(1) }

const N = tools.length
const routes = [
  { path: '', title: shell.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'OpenFile', desc: `OpenFile: ${N}+ free, open-source tools to merge, split, compress, sign and convert PDFs, edit images, trim video, transcribe audio and format code. 100% in your browser, zero uploads.`, priority: '1.0', freq: 'weekly' },
  { path: 'tools', title: 'All tools | OpenFile', desc: `${N} tools for documents, images, media and code, all running in your browser.`, priority: '0.9', freq: 'weekly' },
  { path: 'workspace', title: 'Workspace | OpenFile', desc: 'Chain steps into a recipe and batch-process hundreds of images or PDFs locally, in your browser.', priority: '0.8', freq: 'monthly' },
  { path: 'about', title: 'About | OpenFile', desc: `OpenFile is an open-source workbench of ${N}+ utilities that run entirely in your browser.`, priority: '0.5', freq: 'monthly' },
  { path: 'privacy', title: 'Privacy | OpenFile', desc: 'Short version: we never see your files. Everything is processed locally in your browser.', priority: '0.4', freq: 'yearly' },
  { path: 'status', title: 'Status | OpenFile', desc: 'Server API status and the browser capabilities OpenFile can use on your device.', priority: '0.3', freq: 'monthly' },
  { path: 'history', title: 'History | OpenFile', desc: 'Your recent tools, favorites and activity, stored only in this browser.', priority: '0.3', freq: 'monthly', noindex: true },
  { path: 'settings', title: 'Settings | OpenFile', desc: 'Theme, motion, default image quality, download names and backup of your OpenFile settings.', priority: '0.3', freq: 'monthly', noindex: true },
  ...categories.map((c) => ({ path: `category/${c.id}`, title: `${c.name} | OpenFile`, desc: `${c.blurb}. ${tools.filter((t) => t.category === c.id).length} free tools that run 100% in your browser.`, priority: '0.8', freq: 'weekly' })),
  ...docs.map((d) => ({ path: d.path.replace(/^\//, ''), title: d.id === 'changelog' ? 'Changelog | OpenFile' : `${d.title} | OpenFile Docs`, desc: d.description, priority: d.id === 'getting-started' ? '0.8' : '0.6', freq: 'monthly' })),
  { path: 'docs/getting-started', title: 'Getting started | OpenFile Docs', desc: docs.find((d) => d.id === 'getting-started')?.description ?? '', priority: '0.5', freq: 'monthly', canonical: 'docs', nositemap: true },
  ...tools.map((t) => ({ path: t.slug, title: `${t.name} | Free and private in your browser | OpenFile`, desc: `${t.desc} Free, no uploads, no sign-up. Runs 100% in your browser.`, priority: '0.9', freq: 'monthly' })),
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function render(r) {
  let html = shell
  const url = abs(r.canonical ?? r.path)
  const set = (re, tag) => { html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`) }
  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(r.title)}</title>`)
  set(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(r.desc)}" />`)
  set(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(r.title)}" />`)
  set(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(r.desc)}" />`)
  set(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`)
  set(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${abs('og.png')}" />`)
  set(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`)
  if (r.noindex) set(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex" />')
  return html
}

let written = 0
for (const r of routes) {
  const html = render(r)
  if (!r.path) { writeFileSync(indexPath, html); continue }
  const dir = join(outDir, r.path)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
  written++
}

// 404 fallback = the untouched SPA shell (relative to the base, so GitHub Pages serves the app for unknown URLs)
writeFileSync(join(outDir, '404.html'), shell)
writeFileSync(join(outDir, '.nojekyll'), '')

const today = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.filter((r) => !r.noindex && !r.nositemap).map((r) => `  <url><loc>${abs(r.path)}</loc><lastmod>${today}</lastmod><changefreq>${r.freq}</changefreq><priority>${r.priority}</priority></url>`).join('\n')}
</urlset>
`
writeFileSync(join(outDir, 'sitemap.xml'), sitemap)
writeFileSync(join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: ${base}history\nDisallow: ${base}settings\n\nSitemap: ${abs('sitemap.xml')}\n`)

console.log(`postbuild: base=${base} site=${site} · ${written} route pages · ${routes.filter((r) => !r.noindex && !r.nositemap).length} sitemap URLs · 404.html · robots.txt · .nojekyll`)

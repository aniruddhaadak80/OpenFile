// Post-build step for every deployment target.
//  1. Pre-renders a copy of index.html for every route (dist/<route>/index.html) with a route-specific
//     <title>, description, canonical URL and Open Graph tags, so deep links return HTTP 200 on hosts
//     without SPA rewrites (GitHub Pages) and crawlers see meaningful metadata.
//  2. Writes sitemap.xml and robots.txt for the right base URL.
//  3. Keeps the 404.html SPA fallback and .nojekyll for GitHub Pages.
//  4. SEO extras: JSON-LD per route (WebSite + SearchAction, SoftwareApplication + HowTo + FAQPage per tool,
//     BreadcrumbList, CollectionPage per category, BlogPosting, Person), visible pre-rendered HTML inside
//     #root (React replaces it on load, crawlers without JS read it), an Open Graph PNG per category
//     (SVG rendered with sharp when it is installed), sitemap lastmod from git, humans.txt,
//     .well-known/security.txt, llms.txt and llms-full.txt.
//
// Usage: node scripts/postbuild.mjs [outDir=dist]
// Env:   VITE_BASE (optional; detected from the built index.html), SITE_URL (absolute origin + base override)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = process.argv[2] || 'dist'
const indexPath = join(outDir, 'index.html')
if (!existsSync(indexPath)) { console.error(`postbuild: ${indexPath} not found, run vite build first`); process.exit(1) }
// strip anything an earlier postbuild run injected, so running it twice gives the same output
const shell = readFileSync(indexPath, 'utf8')
  .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
  .replace(/\s*<style id="pr-css">[\s\S]*?<\/style>/g, '')
  .replace(/<div id="root">[\s\S]*?<\/div>(\s*<script|\s*<\/body>)/, '<div id="root"></div>$1')

// ---- base path: env wins, else read it from the built asset URLs ----
const detected = shell.match(/(?:src|href)="([^"]*?)assets\//)?.[1]
let base = process.env.VITE_BASE || detected || '/'
if (!base.startsWith('/')) base = '/' + base
if (!base.endsWith('/')) base += '/'
const defaultSite = base === '/' ? 'https://openfile-studio.vercel.app' : `https://aniruddhaadak80.github.io${base.replace(/\/$/, '')}`
const site = (process.env.SITE_URL || defaultSite).replace(/\/+$/, '')
const abs = (route) => `${site}/${route ? route.replace(/^\/+/, '') : ''}`

// ---- read routes from source ----
// Preferred: import the real registry and guide generator through Vite's module runner, so categories are
// the filtered list (no empty ones) and every tool has its generated steps and FAQ.
// Fallback: the old regex parse of registry.ts and batches/*.ts (dependency free).
const unq = (s) => s.replace(/\\'/g, "'")
let tools = [], categories = [], guideFor = () => null
try {
  const { runnerImport } = await import('vite')
  const cfg = { configFile: false, logLevel: 'silent', resolve: { alias: { '@': join(root, 'src') } } }
  const { module: reg } = await runnerImport(join(root, 'src/tools/registry.ts'), cfg)
  const { module: gd } = await runnerImport(join(root, 'src/tools/guides.ts'), cfg)
  tools = reg.TOOLS.map((t) => ({ ...t }))
  categories = reg.CATEGORIES.map((c) => ({ ...c }))
  const bySlug = new Map(reg.TOOLS.map((t) => [t.slug, t]))
  guideFor = (slug) => { try { const g = gd.toolGuide(bySlug.get(slug)); return { how: g.how, steps: g.steps, tips: g.tips, faq: g.faq, related: (g.related || []).map((r) => r.slug), engines: (g.engines || []).map((e) => e.name), inputs: g.inputs, outputs: g.outputs } } catch { return null } }
} catch (e) {
  console.warn('postbuild: registry import failed, falling back to regex parse:', e?.message || e)
  const batchDir = join(root, 'src/tools/batches')
  const registry = [readFileSync(join(root, 'src/tools/registry.ts'), 'utf8'), ...(existsSync(batchDir) ? readdirSync(batchDir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(batchDir, f), 'utf8')) : [])].join('\n')
  tools = [...registry.matchAll(/\{\s*slug:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)+)',\s*desc:\s*'((?:[^'\\]|\\.)+)',\s*category:\s*'(\w+)'/g)].map((m) => ({ slug: m[1], name: unq(m[2]), desc: unq(m[3]), category: m[4] })).filter((t, i, a) => a.findIndex((x) => x.slug === t.slug) === i)
  categories = [...registry.matchAll(/\{\s*id:\s*'(\w+)',\s*name:\s*'([^']+)',\s*blurb:\s*'([^']+)',\s*color:\s*'([^']+)'/g)].map((m) => ({ id: m[1], name: m[2], blurb: m[3], color: m[4] }))
}
categories = categories.filter((c) => tools.some((t) => t.category === c.id)) // never publish an empty category
const nav = readFileSync(join(root, 'src/docs/nav.ts'), 'utf8')
const docs = [...nav.matchAll(/\{\s*id:\s*'([^']+)',\s*path:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)+)',\s*description:\s*'((?:[^'\\]|\\.)+)'/g)].map((m) => ({ id: m[1], path: m[2], title: unq(m[3]), description: unq(m[4]) }))
// docs site routes (src/pages/docs/nav.ts) plus one tool guide per category; first definition of a path wins
{
  const siteNav = existsSync(join(root, 'src/pages/docs/nav.ts')) ? readFileSync(join(root, 'src/pages/docs/nav.ts'), 'utf8') : ''
  const extra = [...siteNav.matchAll(/\{\s*id:\s*'([^']+)',\s*path:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)+)',\s*description:\s*'((?:[^'\\]|\\.)+)'/g)].map((m) => ({ id: m[1], path: m[2], title: unq(m[3]), description: unq(m[4]) }))
  for (const c of categories) extra.push({ id: `tools-${c.id}`, path: `/docs/tools/${c.id}`, title: c.name, description: `Guide to every ${c.name} tool: ${c.blurb.toLowerCase()}.` })
  for (const d of extra) if (!docs.some((x) => x.path === d.path)) docs.push(d)
}
const blogSrc = existsSync(join(root, 'src/blog/meta.ts')) ? readFileSync(join(root, 'src/blog/meta.ts'), 'utf8') : ''
const posts = [...blogSrc.matchAll(/\{\s*slug:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)+)',\s*description:\s*'((?:[^'\\]|\\.)+)',\s*date:\s*'([\d-]+)',\s*tags:\s*\[([^\]]*)\]/g)].map((m) => ({ slug: m[1], title: unq(m[2]), description: unq(m[3]), date: m[4], tags: [...m[5].matchAll(/'([^']+)'/g)].map((t) => t[1]) }))
if (!tools.length || !categories.length || !docs.length) { console.error(`postbuild: could not parse routes (tools=${tools.length}, categories=${categories.length}, docs=${docs.length})`); process.exit(1) }

// docs pages for categories without tools are skipped too
const liveDocs = docs.filter((d) => !d.id.startsWith('tools-') || categories.some((c) => `tools-${c.id}` === d.id))
const N = tools.length
const catOf = (id) => categories.find((c) => c.id === id)
const routes = [
  { kind: 'home', path: '', title: shell.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? 'OpenFile', desc: `OpenFile: ${N}+ free, open-source tools to merge, split, compress, sign and convert PDFs, edit images, trim video, transcribe audio and format code. 100% in your browser, zero uploads.`, priority: '1.0', freq: 'weekly' },
  { kind: 'tools', path: 'tools', title: 'All tools | OpenFile', desc: `${N} tools for documents, images, media and code, all running in your browser.`, priority: '0.9', freq: 'weekly' },
  { kind: 'page', path: 'workspace', title: 'Workspace | OpenFile', h1: 'Workspace', desc: 'Chain steps into a recipe and batch-process hundreds of images or PDFs locally, in your browser.', priority: '0.8', freq: 'monthly' },
  { kind: 'about', path: 'about', title: 'About | OpenFile', h1: 'About OpenFile', desc: `OpenFile is an open-source workbench of ${N}+ utilities that run entirely in your browser.`, priority: '0.5', freq: 'monthly' },
  { kind: 'page', path: 'privacy', title: 'Privacy | OpenFile', h1: 'Privacy Policy', desc: 'Short version: we never see your files. Everything is processed locally in your browser.', priority: '0.4', freq: 'yearly' },
  { kind: 'page', path: 'install', title: 'Install OpenFile | Web, Windows, macOS, Linux, Android and iPhone', h1: 'Install OpenFile', desc: 'Install OpenFile as an app on any device: a web app that works offline, desktop apps for Windows, macOS and Linux, an Android APK and iPhone home screen. Free, private, open source.', priority: '0.8', freq: 'monthly' },
  { kind: 'page', path: 'download', title: 'Download OpenFile | Desktop and mobile apps', h1: 'Download OpenFile', desc: 'Download OpenFile for Windows, macOS, Linux and Android, or install the web app.', priority: '0.4', freq: 'monthly', canonical: 'install', nositemap: true },
  { kind: 'page', path: 'open', title: 'Open a file | OpenFile', h1: 'Open a file', desc: 'Open any file and OpenFile finds the right tool for it, on your device.', priority: '0.4', freq: 'monthly' },
  { kind: 'page', path: 'status', title: 'Status | OpenFile', h1: 'System status', desc: 'Server API status and the browser capabilities OpenFile can use on your device.', priority: '0.3', freq: 'monthly' },
  { kind: 'page', path: 'history', title: 'History | OpenFile', h1: 'History', desc: 'Your recent tools, favorites and activity, stored only in this browser.', priority: '0.3', freq: 'monthly', noindex: true },
  { kind: 'page', path: 'settings', title: 'Settings | OpenFile', h1: 'Settings', desc: 'Theme, motion, default image quality, download names and backup of your OpenFile settings.', priority: '0.3', freq: 'monthly', noindex: true },
  ...categories.map((c) => ({ kind: 'category', cat: c, path: `category/${c.id}`, title: `${c.name} | OpenFile`, h1: c.name, desc: `${c.blurb}. ${tools.filter((t) => t.category === c.id).length} free tools that run 100% in your browser.`, priority: '0.8', freq: 'weekly', og: `og/category-${c.id}.png` })),
  ...liveDocs.map((d) => ({ kind: 'doc', doc: d, path: d.path.replace(/^\//, ''), title: d.id === 'changelog' ? 'Changelog | OpenFile' : `${d.title} | OpenFile Docs`, h1: d.title, desc: d.description, priority: d.id === 'getting-started' ? '0.8' : '0.6', freq: 'monthly', og: d.id.startsWith('tools-') && catOf(d.id.slice(6)) ? `og/category-${d.id.slice(6)}.png` : undefined })),
  { kind: 'doc', doc: liveDocs.find((d) => d.id === 'getting-started'), path: 'docs/getting-started', title: 'Getting started | OpenFile Docs', h1: 'Getting started', desc: docs.find((d) => d.id === 'getting-started')?.description ?? '', priority: '0.5', freq: 'monthly', canonical: 'docs', nositemap: true },
  { kind: 'blog', path: 'blog', title: 'Blog | OpenFile', h1: 'OpenFile blog', desc: 'Guides, tips and behind the scenes notes on private, in-browser file tools, with live demos.', priority: '0.7', freq: 'weekly' },
  ...posts.map((p) => ({ kind: 'post', post: p, path: `blog/${p.slug}`, title: `${p.title} | OpenFile Blog`, h1: p.title, desc: p.description, priority: '0.6', freq: 'monthly', lastmod: p.date })),
  ...tools.map((t) => ({ kind: 'tool', tool: t, path: t.slug, title: `${t.name} | Free and private in your browser | OpenFile`, h1: t.name, desc: `${t.desc} Free, no uploads, no sign-up. Runs 100% in your browser.`, priority: '0.9', freq: 'monthly', og: catOf(t.category) ? `og/category-${t.category}.png` : undefined })),
]

// ---- lastmod from git: newest commit date that touched a route's source file ----
const gitDates = new Map()
try {
  const { execSync } = await import('node:child_process')
  const out = execSync('git log --format=@%cs --name-only -- src', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 })
  let d = ''
  for (const line of out.split('\n')) { if (line.startsWith('@')) d = line.slice(1); else if (line && !gitDates.has(line)) gitDates.set(line, d) }
} catch { /* not a git checkout: use today */ }
const dateOf = (...files) => files.map((f) => gitDates.get(f)).filter(Boolean).sort().pop()
for (const r of routes) {
  if (r.lastmod) continue
  if (r.kind === 'tool') r.lastmod = dateOf(`src/tools/${r.tool.category}/${r.tool.slug}.tsx`)
  else if (r.kind === 'doc' && r.doc) r.lastmod = dateOf(`src/docs/pages/${r.doc.id}.md`, 'src/docs/content.ts')
  else if (r.kind === 'category') r.lastmod = tools.filter((t) => t.category === r.cat.id).map((t) => dateOf(`src/tools/${t.category}/${t.slug}.tsx`)).filter(Boolean).sort().pop()
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const plain = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\*\*|__|`/g, '')

// ---- structured data ----
const AUTHOR = { '@type': 'Person', name: 'Aniruddha Adak', url: abs('about#author'), sameAs: ['https://github.com/aniruddhaadak80', 'https://dev.to/aniruddhaadak', 'https://www.linkedin.com/in/aniruddha-adak', 'https://x.com/asi369_', 'https://devpost.com/aniruddhaadak'] }
const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })) })
function jsonLd(r) {
  const g = []
  const url = abs(r.canonical ?? r.path)
  if (r.kind === 'home') {
    g.push({ '@type': 'WebSite', '@id': abs('') + '#website', name: 'OpenFile', url: abs(''), description: r.desc, inLanguage: 'en', publisher: AUTHOR, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${abs('tools')}?q={search_term_string}` }, 'query-input': 'required name=search_term_string' } })
    g.push({ '@type': 'SoftwareApplication', name: 'OpenFile', url: abs(''), applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: AUTHOR, image: abs('og.png') })
  }
  if (r.kind === 'tool') {
    const t = r.tool, c = catOf(t.category), gd = guideFor(t.slug)
    g.push({ '@type': 'SoftwareApplication', name: t.name, description: t.desc, url, applicationCategory: 'UtilitiesApplication', applicationSubCategory: c?.name, operatingSystem: 'Any (web browser)', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: AUTHOR, image: abs(r.og ?? 'og.png'), ...(gd?.engines?.length ? { softwareRequirements: gd.engines.join(', ') } : {}) })
    if (gd?.steps?.length) g.push({ '@type': 'HowTo', name: `How to use ${t.name}`, step: gd.steps.map((x, i) => ({ '@type': 'HowToStep', position: i + 1, text: plain(x) })) })
    if (gd?.faq?.length) g.push({ '@type': 'FAQPage', mainEntity: gd.faq.map((f) => ({ '@type': 'Question', name: plain(f.q), acceptedAnswer: { '@type': 'Answer', text: plain(f.a) } })) })
    g.push(crumbs([['Home', ''], [c?.name ?? t.category, `category/${t.category}`], [t.name, t.slug]]))
  }
  if (r.kind === 'category') {
    const list = tools.filter((t) => t.category === r.cat.id)
    g.push({ '@type': 'CollectionPage', name: r.cat.name, description: r.desc, url, mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(t.slug), name: t.name })) } })
    g.push(crumbs([['Home', ''], ['All tools', 'tools'], [r.cat.name, r.path]]))
  }
  if (r.kind === 'tools') g.push({ '@type': 'CollectionPage', name: 'All tools', description: r.desc, url }, crumbs([['Home', ''], ['All tools', 'tools']]))
  if (r.kind === 'post') {
    const p = r.post
    g.push({ '@type': 'BlogPosting', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.date, url, mainEntityOfPage: url, image: abs('og.png'), keywords: p.tags.join(', '), author: AUTHOR, publisher: { '@type': 'Organization', name: 'OpenFile', logo: { '@type': 'ImageObject', url: abs('icon-512.png') } } })
    g.push(crumbs([['Home', ''], ['Blog', 'blog'], [p.title, r.path]]))
  }
  if (r.kind === 'blog') g.push({ '@type': 'Blog', name: 'OpenFile Blog', url, author: AUTHOR, blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.title, url: abs('blog/' + p.slug), datePublished: p.date })) }, crumbs([['Home', ''], ['Blog', 'blog']]))
  if (r.kind === 'about') g.push({ ...AUTHOR, image: abs('author/aniruddha-adak.webp'), jobTitle: 'Open-source developer', homeLocation: { '@type': 'Place', name: 'Kolkata area, West Bengal, India' } }, crumbs([['Home', ''], ['About', 'about']]))
  if (r.kind === 'doc') g.push(crumbs([['Home', ''], ['Docs', 'docs'], ...(r.path === 'docs' ? [] : [[r.h1, r.path]])]))
  if (r.kind === 'page') g.push(crumbs([['Home', ''], [r.h1, r.path]]))
  return g.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': g }).replace(/</g, '\\u003c')}</script>` : ''
}

// ---- visible pre-rendered content (replaced by React on load) ----
const link = (path, text) => `<a href="${esc(base + path)}">${esc(text)}</a>`
const toolLi = (t) => `<li>${link(t.slug, t.name)}: ${esc(t.desc)}</li>`
function body(r) {
  const nav = `<nav aria-label="Site">${link('', 'OpenFile')} | ${link('tools', 'All tools')} | ${link('workspace', 'Workspace')} | ${link('docs', 'Docs')} | ${link('blog', 'Blog')} | ${link('install', 'Install')} | ${link('about', 'About')}</nav>`
  let main = ''
  if (r.kind === 'home') {
    main = `<h1>Every file tool. One private tab.</h1><p>${esc(r.desc)}</p><h2>Categories</h2><ul>${categories.map((c) => `<li>${link('category/' + c.id, c.name)}: ${esc(c.blurb)} (${tools.filter((t) => t.category === c.id).length} tools)</li>`).join('')}</ul><h2>Popular tools</h2><ul>${tools.filter((t) => t.popular).slice(0, 16).map(toolLi).join('')}</ul>`
  } else if (r.kind === 'tools') {
    main = `<h1>All tools</h1><p>${esc(r.desc)}</p>${categories.map((c) => `<h2>${link('category/' + c.id, c.name)}</h2><ul>${tools.filter((t) => t.category === c.id).map(toolLi).join('')}</ul>`).join('')}`
  } else if (r.kind === 'category') {
    main = `<p>${link('', 'Home')} / ${link('tools', 'All tools')} / ${esc(r.cat.name)}</p><h1>${esc(r.cat.name)}</h1><p>${esc(r.desc)}</p><ul>${tools.filter((t) => t.category === r.cat.id).map(toolLi).join('')}</ul>`
  } else if (r.kind === 'tool') {
    const t = r.tool, c = catOf(t.category), gd = guideFor(t.slug)
    main = `<p>${link('', 'Home')} / ${c ? link('category/' + c.id, c.name) : ''} / ${esc(t.name)}</p><h1>${esc(t.name)}</h1><p>${esc(t.desc)}</p><p>Free, no uploads, no sign-up. Runs 100% in your browser.</p>`
    if (gd) {
      if (gd.how) main += `<h2>How ${esc(t.name)} works</h2><p>${esc(plain(gd.how))}</p>`
      if (gd.inputs?.length || gd.outputs?.length) main += `<p>${gd.inputs?.length ? `Input: ${esc(gd.inputs.join(', '))}. ` : ''}${gd.outputs?.length ? `Output: ${esc(gd.outputs.join(', '))}.` : ''}</p>`
      if (gd.steps?.length) main += `<h2>How to use ${esc(t.name)}</h2><ol>${gd.steps.map((x) => `<li>${esc(plain(x))}</li>`).join('')}</ol>`
      if (gd.tips?.length) main += `<h2>Tips</h2><ul>${gd.tips.map((x) => `<li>${esc(plain(x))}</li>`).join('')}</ul>`
      if (gd.faq?.length) main += `<h2>${esc(t.name)} FAQ</h2><dl>${gd.faq.map((f) => `<dt>${esc(plain(f.q))}</dt><dd>${esc(plain(f.a))}</dd>`).join('')}</dl>`
      const rel = (gd.related || []).map((s) => tools.find((x) => x.slug === s)).filter(Boolean)
      if (rel.length) main += `<h2>Related tools</h2><ul>${rel.map(toolLi).join('')}</ul>`
    }
  } else if (r.kind === 'blog') {
    main = `<h1>${esc(r.h1)}</h1><p>${esc(r.desc)}</p><ul>${posts.map((p) => `<li>${link('blog/' + p.slug, p.title)} (${p.date}): ${esc(p.description)}</li>`).join('')}</ul>`
  } else if (r.kind === 'post') {
    main = `<p>${link('blog', 'Blog')}</p><article><h1>${esc(r.post.title)}</h1><p>By ${link('about#author', 'Aniruddha Adak')}, <time datetime="${r.post.date}">${r.post.date}</time></p><p>${esc(r.post.description)}</p></article>`
  } else if (r.kind === 'doc') {
    main = `<p>${link('docs', 'Docs')}</p><h1>${esc(r.h1)}</h1><p>${esc(r.desc)}</p><h2>All guides</h2><ul>${liveDocs.map((d) => `<li>${link(d.path.replace(/^\//, ''), d.title)}: ${esc(d.description)}</li>`).join('')}</ul>`
    if (r.doc?.id?.startsWith('tools-')) main += `<h2>Tools</h2><ul>${tools.filter((t) => `tools-${t.category}` === r.doc.id).map(toolLi).join('')}</ul>`
  } else if (r.path === 'install') {
    const rel = 'https://github.com/aniruddhaadak80/OpenFile/releases/latest'
    main = `<h1>${esc(r.h1)}</h1><p>${esc(r.desc)}</p><h2>Platforms</h2><ul><li>Web app: install from Chrome, Edge, Safari or Samsung Internet. Works offline.</li><li>Windows 10 and 11: <a href="${rel}">.exe and .msi installers</a>.</li><li>macOS: <a href="${rel}">universal .dmg</a> for Apple silicon and Intel.</li><li>Linux: <a href="${rel}">AppImage, .deb and .rpm</a>.</li><li>Android: install the web app from Chrome or the <a href="${rel}">APK</a>.</li><li>iPhone and iPad: Safari, Share, Add to Home Screen.</li><li>ChromeOS: install the web app from Chrome.</li></ul><p>Your files never leave your device.</p>`
  } else {
    main = `<h1>${esc(r.h1 ?? r.title)}</h1><p>${esc(r.desc)}</p>`
  }
  // Keep counts like "349+" on one line: a line break is allowed between a digit and "+", so wrap them.
  main = main.replace(/(\d[\d,]*)\+/g, '<span style="white-space:nowrap">$1+</span>')
  return `<div id="prerender" class="pr">${nav}<main>${main}</main><p class="pr-note">OpenFile runs in your browser. Turn on JavaScript to use the tools.</p></div>`
}
const PR_CSS = `<style id="pr-css">.pr{max-width:860px;margin:0 auto;padding:32px 20px 64px;font:16px/1.65 Inter,ui-sans-serif,system-ui,sans-serif;color:#ECEEF1;background:#0B0D10}.pr a{color:#F5A524}.pr h1{font:700 2.25rem/1.15 "Space Grotesk",Inter,sans-serif;margin:.8em 0 .4em}.pr h2{font-size:1.3rem;margin:1.6em 0 .5em}.pr nav{font-size:14px;opacity:.85}.pr li{margin:.3em 0}.pr dt{font-weight:600;margin-top:.8em}.pr dd{margin:0 0 0 1em;color:#B6BCC5}.pr-note{margin-top:2em;font-size:13px;color:#8B929C}html[data-theme=light] .pr{background:#FAFAF7;color:#16140F}html[data-theme=light] .pr a{color:#8a5a00}</style>`

function render(r) {
  let html = shell
  const url = abs(r.canonical ?? r.path)
  const img = abs(r.og && existsSync(join(outDir, r.og)) ? r.og : 'og.png')
  const set = (re, tag) => { html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`) }
  set(/<title>[\s\S]*?<\/title>/, `<title>${esc(r.title)}</title>`)
  set(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(r.desc)}" />`)
  set(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(r.title)}" />`)
  set(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(r.desc)}" />`)
  set(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`)
  set(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${img}" />`)
  set(/<meta property="og:image:width"[^>]*>/, '<meta property="og:image:width" content="1200" />')
  set(/<meta property="og:image:height"[^>]*>/, '<meta property="og:image:height" content="630" />')
  set(/<meta property="og:site_name"[^>]*>/, '<meta property="og:site_name" content="OpenFile" />')
  if (r.kind === 'post') { set(/<meta property="og:type"[^>]*>/, '<meta property="og:type" content="article" />'); set(/<meta property="article:published_time"[^>]*>/, `<meta property="article:published_time" content="${r.post.date}" />`) }
  set(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(r.title)}" />`)
  set(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(r.desc)}" />`)
  set(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${img}" />`)
  set(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`)
  if (r.noindex) set(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex" />')
  html = html.replace('</head>', `    ${jsonLd(r)}\n    ${PR_CSS}\n  </head>`)
  html = html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${body(r)}</div>`)
  return html
}

// ---- Open Graph image per category (SVG, rendered to PNG with sharp when available) ----
const wrap = (text, max) => text.split(' ').reduce((lines, w) => { const last = lines[lines.length - 1]; if (last && (last + ' ' + w).length <= max) lines[lines.length - 1] = last + ' ' + w; else lines.push(w); return lines }, [])
const ogSvg = (c, n) => {
  const t = (s) => esc(s)
  const accents = ['#F5A524', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8']
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="a" cx="78%" cy="38%" r="60%"><stop offset="0" stop-color="${c.color}" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="10%" cy="100%" r="55%"><stop offset="0" stop-color="#14B8A6" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#FFD27A"/><stop offset=".5" stop-color="#F5A524"/><stop offset="1" stop-color="#C77D0A"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#050505"/><rect width="1200" height="630" fill="url(#a)"/><rect width="1200" height="630" fill="url(#b)"/>
  <g opacity=".08" stroke="#fff">${Array.from({ length: 28 }, (_, i) => `<path d="M${i * 44} 0V630"/>`).join('')}${Array.from({ length: 15 }, (_, i) => `<path d="M0 ${i * 44}H1200"/>`).join('')}</g>
  <circle cx="930" cy="300" r="190" fill="none" stroke="url(#g)" stroke-width="6"/>
  <circle cx="930" cy="300" r="225" fill="none" stroke="#F5A524" stroke-opacity=".35" stroke-width="2" stroke-dasharray="4 14"/>
  <circle cx="930" cy="300" r="150" fill="none" stroke="#14B8A6" stroke-opacity=".5" stroke-width="2" stroke-dasharray="120 820"/>
  <circle cx="930" cy="300" r="80" fill="${c.color}" fill-opacity=".18"/>
  <text x="930" y="322" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="64" font-weight="700" fill="${c.color}">${n}</text>
  ${accents.map((a, i) => `<circle cx="${930 + Math.cos(i * 1.256 - 1.57) * 190}" cy="${300 + Math.sin(i * 1.256 - 1.57) * 190}" r="12" fill="${a}"/>`).join('')}
  <text x="80" y="120" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" font-weight="700" fill="#F5A524" letter-spacing="4">OPENFILE</text>
  <text x="80" y="250" font-family="DejaVu Sans, Arial, sans-serif" font-size="76" font-weight="700" fill="#F5F5F4">${t(c.name)}</text>
  <text x="80" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="32" fill="#B6BCC5">${wrap(c.blurb, 32).slice(0, 3).map((l, i) => `<tspan x="80" dy="${i ? 44 : 0}">${t(l)}</tspan>`).join('')}</text>
  <rect x="80" y="470" width="460" height="64" rx="32" fill="url(#g)"/>
  <text x="310" y="512" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="28" font-weight="700" fill="#0A0700">${n} free tools, no uploads</text>
  <text x="80" y="590" font-family="DejaVu Sans, Arial, sans-serif" font-size="24" fill="#8A8A85">${t(site.replace(/^https?:\/\//, ''))}</text>
</svg>`
}
let ogCount = 0
{
  let sharp = null
  try { sharp = (await import('sharp')).default } catch { /* optional */ }
  mkdirSync(join(outDir, 'og'), { recursive: true })
  for (const c of categories) {
    const n = tools.filter((t) => t.category === c.id).length
    const svg = ogSvg(c, n)
    writeFileSync(join(outDir, 'og', `category-${c.id}.svg`), svg)
    if (sharp) { try { await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(outDir, 'og', `category-${c.id}.png`)); ogCount++ } catch (e) { console.warn('postbuild: og png failed for', c.id, e?.message) } }
  }
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
writeFileSync(join(outDir, '404.html'), shell.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>'))
writeFileSync(join(outDir, '.nojekyll'), '')

const today = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.filter((r) => !r.noindex && !r.nositemap).map((r) => `  <url><loc>${abs(r.path)}</loc><lastmod>${r.lastmod ?? today}</lastmod><changefreq>${r.freq}</changefreq><priority>${r.priority}</priority></url>`).join('\n')}
</urlset>
`
writeFileSync(join(outDir, 'sitemap.xml'), sitemap)
writeFileSync(join(outDir, 'robots.txt'), `# OpenFile: every file tool, private, in your browser\nUser-agent: *\nAllow: /\nDisallow: ${base}history\nDisallow: ${base}settings\nDisallow: ${base}share-target\n\nSitemap: ${abs('sitemap.xml')}\n# AI and LLM summary: ${abs('llms.txt')}\n`)

// ---- humans.txt, security.txt, llms.txt ----
writeFileSync(join(outDir, 'humans.txt'), `/* TEAM */
Author: Aniruddha Adak
Role: Creator and maintainer
Site: https://github.com/aniruddhaadak80
From: West Bengal, India

/* THANKS */
Every open-source project OpenFile builds on: pdf-lib, PDF.js, ffmpeg.wasm, Tesseract.js, Transformers.js and many more.

/* SITE */
Last update: ${today}
Language: English
Standards: HTML5, CSS3, WebAssembly, PWA
Components: React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion
Tools: ${N}
Source: https://github.com/aniruddhaadak80/OpenFile
`)
mkdirSync(join(outDir, '.well-known'), { recursive: true })
const expires = new Date(Date.now() + 365 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z')
const security = `Contact: https://github.com/aniruddhaadak80/OpenFile/security/advisories/new
Contact: https://github.com/aniruddhaadak80/OpenFile/issues
Expires: ${expires}
Preferred-Languages: en
Canonical: ${abs('.well-known/security.txt')}
Policy: https://github.com/aniruddhaadak80/OpenFile/security/policy
`
writeFileSync(join(outDir, '.well-known', 'security.txt'), security)
writeFileSync(join(outDir, 'security.txt'), security)
const llms = `# OpenFile

> ${N}+ free, open-source file tools that run entirely in the browser. PDFs, images, video, audio, data, code and more. Files are processed on the user's device with WebAssembly, Canvas and on-device AI. Nothing is uploaded, there is no account and no watermark.

Key facts:
- Every tool runs client-side. There is no file upload endpoint.
- Some tools download an open-source engine once (ffmpeg.wasm, Tesseract, AI models), then work offline.
- Each tool has its own page at ${abs('')}<slug> with steps, tips and an FAQ.
- Search tools: ${abs('tools')}?q=<words>. Filter by format: ${abs('tools')}?format=PDF
- MIT licensed: https://github.com/aniruddhaadak80/OpenFile

## Categories
${categories.map((c) => `- [${c.name}](${abs('category/' + c.id)}): ${c.blurb}. ${tools.filter((t) => t.category === c.id).length} tools.`).join('\n')}

## Docs
${liveDocs.map((d) => `- [${d.title}](${abs(d.path.replace(/^\//, ''))}): ${d.description}`).join('\n')}

## Popular tools
${tools.filter((t) => t.popular).map((t) => `- [${t.name}](${abs(t.slug)}): ${t.desc}`).join('\n')}

## Optional
- [Full tool list](${abs('llms-full.txt')})
- [Blog](${abs('blog')})
`
writeFileSync(join(outDir, 'llms.txt'), llms)
writeFileSync(join(outDir, 'llms-full.txt'), `# OpenFile: all ${N} tools\n\n${categories.map((c) => `## ${c.name}\n\n${c.blurb}.\n\n${tools.filter((t) => t.category === c.id).map((t) => { const g = guideFor(t.slug); return `### [${t.name}](${abs(t.slug)})\n${t.desc}${g?.inputs?.length ? `\nInput: ${g.inputs.join(', ')}.` : ''}${g?.outputs?.length ? ` Output: ${g.outputs.join(', ')}.` : ''}${g?.steps?.length ? `\nSteps: ${g.steps.map((x, i) => `${i + 1}. ${plain(x)}`).join(' ')}` : ''}` }).join('\n\n')}`).join('\n\n')}\n`)

// ---- RSS feed for the blog ----
if (posts.length) {
  const rfc = (d) => new Date(d + 'T09:00:00Z').toUTCString()
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date))
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="${base}rss.xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>OpenFile Blog</title>
    <link>${abs('blog')}</link>
    <description>Guides, tips and notes on private, in-browser file tools.</description>
    <language>en</language>
    <lastBuildDate>${rfc(sorted[0].date)}</lastBuildDate>
    <atom:link href="${abs('blog/rss.xml')}" rel="self" type="application/rss+xml" />
${sorted.map((p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${abs('blog/' + p.slug)}</link>
      <guid isPermaLink="true">${abs('blog/' + p.slug)}</guid>
      <pubDate>${rfc(p.date)}</pubDate>
      <description>${esc(p.description)}</description>
${p.tags.map((t) => `      <category>${esc(t)}</category>`).join('\n')}
    </item>`).join('\n')}
  </channel>
</rss>
`
  mkdirSync(join(outDir, 'blog'), { recursive: true })
  writeFileSync(join(outDir, 'blog', 'rss.xml'), rss)
}

// ---- installable web app: base-absolute manifest URLs and the service worker precache list ----
// The manifest in public/ uses relative URLs (they resolve against the manifest itself, so they work at any base).
// Here they become explicit absolute paths for this base ("/" on Vercel, "/OpenFile/" on GitHub Pages).
let swInfo = ''
try {
  const mPath = join(outDir, 'manifest.webmanifest')
  const m = JSON.parse(readFileSync(mPath, 'utf8'))
  const fix = (u) => (typeof u === 'string' && !/^[a-z]+:/i.test(u) ? base + u.replace(/^\.\//, '').replace(/^\.$/, '') : u)
  m.id = base; m.start_url = fix(m.start_url); m.scope = base
  for (const k of ['icons', 'screenshots']) for (const i of m[k] || []) i.src = fix(i.src)
  for (const sc of m.shortcuts || []) { sc.url = fix(sc.url); for (const i of sc.icons || []) i.src = fix(i.src) }
  for (const fh of m.file_handlers || []) { fh.action = fix(fh.action); for (const i of fh.icons || []) i.src = fix(i.src) }
  if (m.share_target) m.share_target.action = fix(m.share_target.action)
  writeFileSync(mPath, JSON.stringify(m, null, 2))
  // shell = everything index.html loads up front (entry JS, CSS, preloaded chunks and fonts) plus the install assets
  const html = readFileSync(indexPath, 'utf8')
  const shellFiles = [...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((x) => x[1]).filter((u) => u.startsWith(base) && !u.endsWith('.xml') && !u.endsWith('humans.txt')).map((u) => u.slice(base.length)))]
  const extra = ['offline.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'install/index.html', 'tools/index.html', 'open/index.html'].filter((f) => existsSync(join(outDir, f)))
  const pre = [...new Set([...shellFiles, ...extra])].filter((f) => existsSync(join(outDir, f.split('?')[0])))
  const build = (() => { try { return execSyncGit('git rev-parse --short HEAD') } catch { return '' } })() || Date.now().toString(36)
  const swPath = join(outDir, 'sw.js')
  let sw = readFileSync(swPath, 'utf8')
  sw = sw.replace("'__OF_BUILD__'", `'${build}-${Date.now().toString(36)}'`).replace(/\/\*__OF_PRECACHE__\*\/\[[^\]]*\]/, `/*__OF_PRECACHE__*/${JSON.stringify(pre)}`)
  writeFileSync(swPath, sw)
  swInfo = ` | manifest for ${base} | sw precache ${pre.length} files`
} catch (e) { console.warn('postbuild: manifest or sw step skipped:', e?.message || e) }
function execSyncGit(cmd) { return String(require_('node:child_process').execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })).trim() }

console.log(`postbuild: base=${base} site=${site}${swInfo} | ${tools.length} tools in ${categories.length} categories | ${written} route pages with JSON-LD and prerendered HTML | ${routes.filter((r) => !r.noindex && !r.nositemap).length} sitemap URLs | ${ogCount} category OG images | ${posts.length} blog posts + rss.xml | humans.txt, security.txt, llms.txt | 404.html | robots.txt | .nojekyll`)

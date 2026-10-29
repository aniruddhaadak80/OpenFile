// Extract the readable text of every blog post, in the same block order the read-aloud player uses in the browser.
// Bundles src/blog/posts.tsx with esbuild (live demos and app imports stubbed out), renders each body to static HTML,
// then walks the HTML.  Output: scripts/blog-media/.cache/text/<slug>.json  { slug, blocks: [{ tag, id, text }] }
// Block rule (keep in sync with src/blog/media/readable.ts): h2, h3, p, li, blockquote that are not inside
// .not-prose, figure, table or pre, are not inside another block, and have text.
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const cache = join(here, '.cache')
mkdirSync(join(cache, 'text'), { recursive: true })

const blogFiles = [join(root, 'src/blog/posts.tsx'), ...readdirSync(join(root, 'src/blog/posts')).filter((f) => f.endsWith('.tsx')).map((f) => join(root, 'src/blog/posts', f))]
const importedNames = (spec) => {
  const names = new Set()
  for (const f of blogFiles) {
    const s = readFileSync(f, 'utf8')
    for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      if (m[2] !== spec) continue
      m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '')).filter(Boolean).forEach((n) => names.add(n))
    }
  }
  return names
}

const out = join(cache, 'posts.bundle.mjs')
const coverOut = join(cache, 'cover.bundle.mjs')
const stubPlugin = {
    name: 'stub', setup(b) {
      b.onResolve({ filter: /(^\.\.?\/(demos|demos-more|media\/.*))$|^@\/|^framer-motion$|^lucide-react$/ }, (a) => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => {
        const lines = [`import { createElement } from 'react'`, `const C = () => createElement('figure', { className: 'not-prose' }, 'demo')`]
        for (const n of importedNames(a.path)) lines.push(`export const ${n} = C`)
        if (a.path === '@/components/ui') lines.push(`export const cn = (...x) => x.filter(Boolean).join(' ')`)
        return { contents: lines.join('\n'), loader: 'js' }
      })
    },
  }
const opts = { bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react-dom', 'react-router-dom', 'react/jsx-runtime'], logLevel: 'error', absWorkingDir: root, plugins: [stubPlugin] }
await build({ ...opts, entryPoints: [join(root, 'src/blog/posts.tsx')], outfile: out })
await build({ ...opts, entryPoints: [join(root, 'src/blog/Cover.tsx')], outfile: coverOut })

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')
const { MemoryRouter } = await import('react-router-dom')
const { POST_BODIES } = await import(pathToFileURL(out).href + '?t=' + Date.now())
const { Cover } = await import(pathToFileURL(coverOut).href + '?t=' + Date.now())
mkdirSync(join(cache, 'cover'), { recursive: true })

// ---- tiny HTML walker (renderToStaticMarkup output is well formed)
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'track', 'wbr', 'col'])
const ent = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
function parse(html) {
  const rootN = { tag: '#root', attrs: '', children: [] }
  const stack = [rootN]
  const re = /<(\/?)([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:="[^"]*")?)*)\s*(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1]
    if (m[5] != null) { top.children.push({ text: ent(m[5]) }); continue }
    const tag = m[2].toLowerCase()
    if (m[1]) { while (stack.length > 1 && stack.pop().tag !== tag); continue }
    const n = { tag, attrs: m[3] || '', children: [] }
    top.children.push(n)
    if (!VOID.has(tag) && !m[4]) stack.push(n)
  }
  return rootN
}
const textOf = (n) => n.text != null ? n.text : n.tag === 'br' ? ' ' : n.children.map(textOf).join('')
const attr = (n, k) => (n.attrs.match(new RegExp(`\\s${k}="([^"]*)"`)) || [])[1] || ''
const BLOCK = new Set(['h2', 'h3', 'p', 'li', 'blockquote'])
const SKIP = (n) => ['figure', 'table', 'pre', 'svg', 'button', 'script', 'style'].includes(n.tag) || /\bnot-prose\b/.test(attr(n, 'class'))
export const norm = (s) => s.replace(/\s+/g, ' ').trim()
function blocksOf(tree) {
  const res = []
  const walk = (n) => {
    if (n.text != null) return
    if (n.tag !== '#root' && SKIP(n)) return
    if (BLOCK.has(n.tag)) {
      const t = norm(textOf(n))
      const terms = []
      const tw = (x) => { if (x.text != null) return; if (['strong', 'code', 'b', 'a'].includes(x.tag)) { const v = norm(textOf(x)); if (v && v.length < 40 && !terms.includes(v)) terms.push(v) } x.children.forEach(tw) }
      n.children.forEach(tw)
      if (t) res.push({ tag: n.tag, id: attr(n, 'id'), text: t, ...(terms.length ? { terms } : {}) })
      return
    }
    n.children.forEach(walk)
  }
  walk(tree)
  return res
}

const metaSrc = readFileSync(join(root, 'src/blog/meta.ts'), 'utf8')
const unq = (s) => s.replace(/\\'/g, "'")
const posts = [...metaSrc.matchAll(/\{\s*slug:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)+)',\s*description:\s*'((?:[^'\\]|\\.)+)',\s*date:\s*'([\d-]+)',\s*tags:\s*\[([^\]]*)\],\s*minutes:\s*(\d+),\s*cover:\s*'([a-z]+)',\s*tools:\s*\[([^\]]*)\]/g)]
  .map((m) => ({ slug: m[1], title: unq(m[2]), description: unq(m[3]), date: m[4], tags: [...m[5].matchAll(/'([^']+)'/g)].map((t) => t[1]), minutes: +m[6], cover: m[7], tools: [...m[8].matchAll(/'([^']+)'/g)].map((t) => t[1]) }))

let total = 0
for (const p of posts) {
  const Body = POST_BODIES[p.slug]
  if (!Body) { console.warn('no body for', p.slug); continue }
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Body)))
  const blocks = blocksOf(parse(html))
  const words = blocks.reduce((a, b) => a + b.text.split(' ').length, 0)
  total += words
  writeFileSync(join(cache, 'cover', p.slug + '.svg'), renderToStaticMarkup(React.createElement(Cover, { kind: p.cover, title: p.title })).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))
  writeFileSync(join(cache, 'text', p.slug + '.json'), JSON.stringify({ ...p, words, blocks }, null, 1))
}
writeFileSync(join(cache, 'posts.json'), JSON.stringify(posts, null, 1))
console.log(`extract: ${posts.length} posts, ${total} words`)

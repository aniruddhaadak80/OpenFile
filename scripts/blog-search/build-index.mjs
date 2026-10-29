#!/usr/bin/env node
// Blog search index: reads every post body (src/blog/posts.tsx and src/blog/posts/*.tsx), pulls out the
// plain text with a small JSX scanner, splits it into sections by H2/H3 heading and writes
// src/blog/search/index.generated.json. The blog page loads that file lazily, only when someone focuses
// the search box (or opens a shared search link), so the first page load stays small.
//
//   node scripts/blog-search/build-index.mjs           write the index
//   node scripts/blog-search/build-index.mjs --check   exit 1 when the committed index is out of date
//
// Runs in prebuild. Titles, descriptions and tags are not copied here: the page reads them from
// src/blog/meta.ts, so only the body text and a has:quiz flag live in the index.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const blog = path.join(root, 'src/blog')
const out = path.join(blog, 'search/index.generated.json')

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '...', times: 'x', middot: '.', ndash: '-' }
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
  return ENT[e.toLowerCase()] ?? m
})
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const BLOCK = new Set(['p', 'li', 'ul', 'ol', 'h2', 'h3', 'h4', 'H2', 'H3', 'td', 'th', 'tr', 'div', 'blockquote', 'pre', 'figure', 'figcaption', 'Note', 'Tip', 'Warn', 'Table', 'section', 'br'])
const HEAD = new Set(['H2', 'H3', 'h2', 'h3'])
// attributes whose strings are prose worth searching
const PROSE_ATTR = { Table: ['head', 'rows'], Note: ['title'], Warn: ['title'] }

/** Scan JSX source starting at a fragment or element and return [{ h, id, text }] sections. */
export function extractSections(src) {
  const secs = [{ h: '', id: '', parts: [] }]
  let cur = secs[0]
  let i = 0
  const emit = (t) => { if (t) cur.parts.push(t) }

  const skipWs = () => { while (i < src.length && /\s/.test(src[i])) i++ }
  const readString = (q) => { // at opening quote
    let s = ''
    i++
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') { s += src[i + 1] ?? ''; i += 2; continue }
      if (q === '`' && src[i] === '$' && src[i + 1] === '{') { const inner = readExpr(true); s += inner; continue }
      s += src[i++]
    }
    i++
    return s
  }
  // reads {...} starting at '{' (or after "${" when tpl) and returns harvested prose
  function readExpr(tpl = false) {
    i += tpl ? 2 : 1
    let depth = 1, got = [], prev = '{'
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
      if (c === '"' || c === "'" || c === '`') { const s = readString(c); if (/[A-Za-z0-9]/.test(s)) got.push(s); else if (s && !s.trim()) got.push(' '); prev = 'x'; continue }
      if (c === '{' || c === '(' || c === '[') { depth += c === '{' ? 1 : 0; prev = c; i++; continue }
      if (c === '}') { depth--; i++; prev = '}'; continue }
      if (c === '<' && /[(\[{,?:=&|>]/.test(prev) && /[A-Za-z>]/.test(src[i + 1] ?? '')) {
        const parts = []
        readElement(parts)
        got.push(parts.join(''))
        prev = 'x'
        continue
      }
      if (!/\s/.test(c)) prev = c
      i++
    }
    return got.length === 1 ? got[0] : got.join(' ')
  }
  // reads an element at '<' and pushes text into sink (array) or emits into sections when sink is null
  function readElement(sink) {
    const push = (t) => { if (sink) sink.push(t); else emit(t) }
    i++ // <
    if (src[i] === '>') { i++; readChildren(sink, ''); return } // fragment
    let name = ''
    while (i < src.length && /[\w.$-]/.test(src[i])) name += src[i++]
    const attrs = []
    let selfClose = false
    for (;;) {
      skipWs()
      if (src[i] === '/' && src[i + 1] === '>') { i += 2; selfClose = true; break }
      if (src[i] === '>') { i++; break }
      if (src[i] === '{') { readExpr(); continue } // spread
      let an = ''
      while (i < src.length && /[\w:-]/.test(src[i])) an += src[i++]
      skipWs()
      if (src[i] === '=') {
        i++; skipWs()
        let val = ''
        if (src[i] === '"' || src[i] === "'") val = readString(src[i])
        else if (src[i] === '{') val = readExpr()
        if ((PROSE_ATTR[name] || []).includes(an)) attrs.push(val)
      }
      if (!an && src[i] !== '/' && src[i] !== '>') i++ // safety
    }
    const isHead = HEAD.has(name) && !sink
    if (isHead) { const inner = []; if (!selfClose) readChildren(inner, name); const h = clean(inner.join('')); cur = { h, id: slugify(h), parts: [] }; secs.push(cur); return }
    if (attrs.length) push(' ' + attrs.join(' ') + ' ')
    if (!selfClose) readChildren(sink, name)
    if (BLOCK.has(name)) push(' ')
  }
  function readChildren(sink, name) {
    const push = (t) => { if (sink) sink.push(t); else emit(t) }
    let text = ''
    const flush = () => {
      if (!text) return
      // JSX whitespace rule: lines that contain a newline are trimmed and joined with a space
      const t = /\n/.test(text) ? text.split('\n').map((l, k, a) => (k === 0 ? l.replace(/\s+$/, '') : k === a.length - 1 ? l.replace(/^\s+/, '') : l.trim())).filter((l) => l).join(' ') : text
      push(decode(t))
      text = ''
    }
    while (i < src.length) {
      const c = src[i]
      if (c === '<' && src[i + 1] === '/') { flush(); const e = src.indexOf('>', i); i = e < 0 ? src.length : e + 1; return }
      if (c === '<') { flush(); readElement(sink); continue }
      if (c === '{') { flush(); const s = readExpr(); if (s) push(s); continue }
      text += c
      i++
    }
    flush()
    void name
  }

  const start = src.indexOf('<')
  if (start < 0) return []
  i = start
  readElement(null)
  return secs.map((s) => ({ h: s.h, id: s.id, text: clean(s.parts.join('')) })).filter((s) => s.text || s.h)
}

const clean = (s) => s.replace(/\s+/g, ' ').replace(/\s+([.,;:?)])/g, '$1').replace(/\(\s+/g, '(').trim()

/** Body JSX of a function: from its `return` to the end of the returned expression. */
function bodyOf(src, fnName) {
  const re = fnName ? new RegExp(`function\\s+${fnName}\\s*\\(`) : /export\s+default\s+function\s+\w*\s*\(/
  const m = re.exec(src)
  if (!m) return null
  const r = src.indexOf('return', m.index)
  if (r < 0) return null
  return src.slice(r + 6)
}

export function buildIndex() {
  const legacy = fs.readFileSync(path.join(blog, 'posts.tsx'), 'utf8')
  const map = {}
  const reg = /POST_BODIES[^\n]*\{\s*\n([\s\S]*?)\n\}/.exec(legacy)
  if (!reg) throw new Error('POST_BODIES not found in src/blog/posts.tsx')
  for (const [, slug, ident] of reg[1].matchAll(/'([^']+)'\s*:\s*(\w+)/g)) map[slug] = ident
  const imports = {}
  for (const [, ident, file] of legacy.matchAll(/import\s+(\w+)\s+from\s+'\.\/posts\/([^']+)'/g)) imports[ident] = file
  const quizSrc = fs.existsSync(path.join(blog, 'media/quizzes.ts')) ? fs.readFileSync(path.join(blog, 'media/quizzes.ts'), 'utf8') : ''
  const quiz = new Set([...quizSrc.matchAll(/^\s{2}'([^']+)'\s*:\s*\[/gm)].map((m) => m[1]))
  const posts = {}
  for (const slug of Object.keys(map).sort()) {
    const ident = map[slug]
    let body
    if (imports[ident]) body = bodyOf(fs.readFileSync(path.join(blog, 'posts', imports[ident] + '.tsx'), 'utf8'), null)
    else body = bodyOf(legacy, ident)
    if (!body) { console.warn(`blog-search: no body found for ${slug}`); continue }
    const secs = extractSections(body)
    posts[slug] = { q: quiz.has(slug) ? 1 : 0, s: secs.map((s) => [s.id, s.h, s.text]) }
  }
  return { v: 1, posts }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const json = JSON.stringify(buildIndex()) + '\n'
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
    if (cur !== json) { console.error('blog-search: src/blog/search/index.generated.json is out of date. Run node scripts/blog-search/build-index.mjs'); process.exit(1) }
    console.log('blog-search: index is up to date')
  } else {
    fs.mkdirSync(path.dirname(out), { recursive: true })
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
    if (cur !== json) fs.writeFileSync(out, json)
    const n = Object.keys(JSON.parse(json).posts).length
    console.log(`blog-search: indexed ${n} posts, ${(json.length / 1024).toFixed(1)} KB`)
  }
}

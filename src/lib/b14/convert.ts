/* Convert helpers for round 14: MHTML parsing, Jupyter notebooks, tables and slides to Markdown, metafile headers.
 * Pure TypeScript, unit tested in Node (scripts/tests/b14/convert.test.mjs). */

/* ---------------- Markdown bits ---------------- */
const mdCell = (v: unknown) => String(v ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()

/** A list of rows to a GitHub flavoured Markdown table (first row is the header). */
export function tableToMd(rows: unknown[][], maxRows = 5000): string {
  const clean = rows.filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''))
  if (!clean.length) return ''
  const w = Math.max(...clean.map((r) => r.length))
  const pad = (r: unknown[]) => Array.from({ length: w }, (_, i) => mdCell(r[i]))
  const [head, ...body] = clean
  const h = pad(head).map((c, i) => c || `Column ${i + 1}`)
  const out = [`| ${h.join(' | ')} |`, `| ${h.map(() => '---').join(' | ')} |`, ...body.slice(0, maxRows).map((r) => `| ${pad(r).join(' | ')} |`)]
  if (body.length > maxRows) out.push('', `_${body.length - maxRows} more rows not shown._`)
  return out.join('\n')
}

/** Code fence that never collides with backticks inside the code. */
export function fence(code: string, lang = ''): string {
  const runs = code.match(/`{3,}/g) ?? []
  const n = Math.max(3, ...runs.map((r) => r.length + 1))
  const f = '`'.repeat(n)
  return `${f}${lang}\n${code.replace(/\s+$/, '')}\n${f}`
}

const xmlUnescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&')

/** Paragraph texts of one PPTX slide XML (a:p elements, runs joined). */
export function slideParagraphs(xml: string): string[] {
  const out: string[] = []
  for (const p of xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? []) {
    const t = (p.match(/<a:t>([\s\S]*?)<\/a:t>|<a:br\/>/g) ?? []).map((x) => (x === '<a:br/>' ? '\n' : xmlUnescape(x.replace(/<\/?a:t>/g, '')))).join('')
    if (t.trim()) out.push(t.trim())
  }
  return out
}

/** Slides (title first) to Markdown, one section per slide. */
export function slidesToMd(slides: { paras: string[]; notes?: string[] }[], title = ''): string {
  const parts: string[] = title ? [`# ${title}`, ''] : []
  slides.forEach((s, i) => {
    const [head, ...rest] = s.paras
    parts.push(`## ${i + 1}. ${head ?? 'Slide'}`, '')
    rest.forEach((r) => parts.push(r.split('\n').map((l) => `- ${l}`).join('\n')))
    if (s.notes?.length) parts.push('', ...s.notes.map((n) => `> ${n}`))
    parts.push('')
  })
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** Any JSON value as a readable Markdown outline (objects become nested lists, arrays of objects become tables). */
export function jsonToMd(v: unknown, depth = 0): string {
  const ind = '  '.repeat(depth)
  if (Array.isArray(v)) {
    if (v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const keys = [...new Set(v.flatMap((x) => Object.keys(x as object)))]
      if (keys.length <= 12 && v.every((x) => Object.values(x as object).every((y) => y === null || typeof y !== 'object'))) return tableToMd([keys, ...v.map((x) => keys.map((k) => (x as any)[k]))])
    }
    return v.map((x) => (x && typeof x === 'object' ? `${ind}-\n${jsonToMd(x, depth + 1)}` : `${ind}- ${String(x)}`)).join('\n')
  }
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => (x && typeof x === 'object' ? `${ind}- **${k}**\n${jsonToMd(x, depth + 1)}` : `${ind}- **${k}**: ${String(x)}`)).join('\n')
  return `${ind}${String(v)}`
}

/* ---------------- Jupyter notebooks ---------------- */
export interface NbOutput { kind: 'text' | 'image' | 'html' | 'error'; text?: string; mime?: string; data?: string }
export interface NbCell { type: 'code' | 'markdown' | 'raw'; source: string; outputs: NbOutput[]; count?: number | null }
export interface Notebook { cells: NbCell[]; language: string; kernel: string; title: string }

const src = (s: unknown) => (Array.isArray(s) ? s.join('') : typeof s === 'string' ? s : '')
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

/** Parse an .ipynb (nbformat 3 or 4) into a simple cell model. */
export function parseNotebook(text: string): Notebook {
  let j: any
  try { j = JSON.parse(text) } catch { throw new Error('This is not a valid notebook. An .ipynb file is JSON and this one could not be read.') }
  const raw: any[] = j.cells ?? j.worksheets?.[0]?.cells
  if (!Array.isArray(raw)) throw new Error('No cells found. Is this a Jupyter notebook (.ipynb)?')
  const language = j.metadata?.language_info?.name || j.metadata?.kernelspec?.language || 'python'
  const cells: NbCell[] = raw.map((c) => {
    const type = c.cell_type === 'markdown' || c.cell_type === 'heading' ? 'markdown' : c.cell_type === 'raw' ? 'raw' : 'code'
    let source = src(c.source ?? c.input)
    if (c.cell_type === 'heading') source = '#'.repeat(c.level || 1) + ' ' + source
    const outputs: NbOutput[] = []
    for (const o of c.outputs ?? []) {
      if (o.output_type === 'stream') outputs.push({ kind: 'text', text: stripAnsi(src(o.text)) })
      else if (o.output_type === 'error' || o.output_type === 'pyerr') outputs.push({ kind: 'error', text: stripAnsi([`${o.ename}: ${o.evalue}`, ...(o.traceback ?? [])].join('\n')) })
      else {
        const d = o.data ?? o
        const img = ['image/png', 'image/jpeg', 'image/svg+xml', 'png', 'jpeg'].find((m) => d[m])
        if (img) { const mime = img.includes('/') ? img : `image/${img}`; outputs.push({ kind: 'image', mime, data: src(d[img]).replace(/\s+/g, mime === 'image/svg+xml' ? ' ' : '') }) }
        else if (d['text/html'] || d.html) outputs.push({ kind: 'html', text: src(d['text/html'] ?? d.html) })
        else if (d['text/markdown']) outputs.push({ kind: 'text', text: src(d['text/markdown']) })
        else if (d['text/plain'] || d.text) outputs.push({ kind: 'text', text: src(d['text/plain'] ?? d.text) })
      }
    }
    return { type, source, outputs, count: c.execution_count ?? c.prompt_number ?? null }
  })
  const firstHead = cells.find((c) => c.type === 'markdown' && /^#\s+/m.test(c.source))?.source.match(/^#\s+(.+)$/m)?.[1]
  return { cells, language, kernel: j.metadata?.kernelspec?.display_name || language, title: firstHead?.trim() || '' }
}

/** Notebook to Markdown. Images come back as separate files when `images` is given, otherwise inline data URLs. */
export function notebookToMd(nb: Notebook, o: { outputs?: boolean; images?: { name: string; data: string; mime: string }[] } = {}): string {
  const parts: string[] = []
  let n = 0
  for (const c of nb.cells) {
    if (c.type === 'markdown') { parts.push(c.source.trim()); continue }
    if (c.type === 'raw') { parts.push(fence(c.source)); continue }
    if (c.source.trim()) parts.push(fence(c.source, nb.language))
    if (o.outputs === false) continue
    for (const out of c.outputs) {
      if (out.kind === 'image' && out.data) {
        const ext = out.mime === 'image/svg+xml' ? 'svg' : out.mime === 'image/jpeg' ? 'jpg' : 'png'
        n++
        if (o.images) { const name = `images/output-${n}.${ext}`; o.images.push({ name, data: out.data, mime: out.mime! }); parts.push(`![Output ${n}](${name})`) }
        else parts.push(`![Output ${n}](data:${out.mime};${out.mime === 'image/svg+xml' ? 'utf8,' + encodeURIComponent(out.data) : 'base64,' + out.data})`)
      } else if (out.text?.trim()) parts.push(out.kind === 'html' ? out.text.trim() : fence(out.text, 'text'))
    }
  }
  return parts.filter(Boolean).join('\n\n') + '\n'
}

/** Notebook to a script in percent format (# %%), which VS Code, Spyder and Jupytext read as cells. */
export function notebookToScript(nb: Notebook): string {
  const py = /python|^$/i.test(nb.language)
  const cmt = py || /r|julia|ruby|bash|sh/i.test(nb.language) ? '#' : '//'
  return nb.cells.map((c) => {
    if (c.type === 'code') return `${cmt} %%\n${c.source.replace(/\s+$/, '')}`
    const body = c.source.replace(/\s+$/, '').split('\n').map((l) => (l ? `${cmt} ${l}` : cmt)).join('\n')
    return `${cmt} %% [${c.type}]\n${body}`
  }).join('\n\n') + '\n'
}

/** Percent format script (# %% cells) or plain code back to an nbformat 4 notebook. */
export function scriptToNotebook(code: string, language = 'python'): string {
  const lines = code.replace(/\r\n?/g, '\n').split('\n')
  const cells: { cell_type: string; source: string[]; metadata: object; outputs?: unknown[]; execution_count?: null }[] = []
  let cur: { type: string; lines: string[] } | null = null
  const push = () => {
    if (!cur) return
    while (cur.lines.length && !cur.lines[cur.lines.length - 1].trim()) cur.lines.pop()
    while (cur.lines.length && !cur.lines[0].trim()) cur.lines.shift()
    if (!cur.lines.length && cur.type !== 'code') return
    let ls = cur.lines
    if (cur.type === 'markdown') ls = ls.map((l) => l.replace(/^\s*(#|\/\/)\s?/, ''))
    const source = ls.map((l, i) => (i < ls.length - 1 ? l + '\n' : l))
    if (cur.type === 'code' && !source.length) return
    cells.push(cur.type === 'code' ? { cell_type: 'code', source, metadata: {}, outputs: [], execution_count: null } : { cell_type: cur.type, source, metadata: {} })
  }
  const marker = /^\s*(#|\/\/)\s*%%(.*)$/
  const hasMarkers = lines.some((l) => marker.test(l))
  if (!hasMarkers) cur = { type: 'code', lines }
  else for (const l of lines) {
    const m = l.match(marker)
    if (m) { push(); cur = { type: /\[\s*markdown\s*\]|\bmd\b/i.test(m[2]) ? 'markdown' : /\[\s*raw\s*\]/i.test(m[2]) ? 'raw' : 'code', lines: [] } }
    else { if (!cur) cur = { type: 'code', lines: [] }; cur.lines.push(l) }
  }
  push()
  const ext = { python: '.py', r: '.r', julia: '.jl', javascript: '.js' }[language] ?? '.txt'
  return JSON.stringify({ cells, metadata: { kernelspec: { name: language === 'python' ? 'python3' : language, display_name: language === 'python' ? 'Python 3' : language, language }, language_info: { name: language, file_extension: ext } }, nbformat: 4, nbformat_minor: 5 }, null, 1) + '\n'
}

/* ---------------- MHTML ---------------- */
export interface MhtPart { type: string; location: string; id: string; encoding: string; charset: string; body: Uint8Array }
export interface Mht { subject: string; date: string; from: string; parts: MhtPart[]; rootIndex: number }

const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s }
const toBytes = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u }

export function decodeQP(s: string): Uint8Array {
  const t = s.replace(/=\r?\n/g, '')
  const out: number[] = []
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { out.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2 }
    else out.push(t.charCodeAt(i) & 255)
  }
  return Uint8Array.from(out)
}
export function decodeB64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, '')
  if (typeof atob === 'function') return toBytes(atob(clean))
  return Uint8Array.from((globalThis as any).Buffer.from(clean, 'base64'))
}
/** RFC 2047 encoded words like =?utf-8?Q?Hello?= in headers. */
export function decodeWords(s: string): string {
  return s.replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (_, cs, enc, txt) => {
    const bytes = enc.toUpperCase() === 'B' ? decodeB64(txt) : decodeQP(txt.replace(/_/g, ' '))
    try { return new TextDecoder(cs).decode(bytes) } catch { return latin1(bytes) }
  })
}
function headers(block: string) {
  const h: Record<string, string> = {}
  for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) { const i = line.indexOf(':'); if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim() }
  return h
}
const param = (v: string, k: string) => v.match(new RegExp(`${k}\\s*=\\s*"([^"]*)"|${k}\\s*=\\s*([^;\\s]+)`, 'i'))?.slice(1).find((x) => x !== undefined) ?? ''

/** Parse a .mhtml / .mht web archive (also single part saved pages). */
export function parseMhtml(input: Uint8Array | string): Mht {
  const s = typeof input === 'string' ? input : latin1(input)
  const split = s.search(/\r?\n\r?\n/)
  if (split < 0) throw new Error('This file has no MIME headers. Is it an .mhtml or .mht web archive?')
  const top = headers(s.slice(0, split))
  const ctype = top['content-type'] || ''
  const boundary = param(ctype, 'boundary')
  const parts: MhtPart[] = []
  const mkPart = (h: Record<string, string>, body: string): MhtPart => {
    const enc = (h['content-transfer-encoding'] || '').toLowerCase()
    const data = enc === 'base64' ? decodeB64(body) : enc === 'quoted-printable' ? decodeQP(body) : toBytes(body)
    const ct = h['content-type'] || 'text/plain'
    return { type: ct.split(';')[0].trim().toLowerCase(), location: decodeWords(h['content-location'] || ''), id: (h['content-id'] || '').replace(/^<|>$/g, ''), encoding: enc, charset: param(ct, 'charset').toLowerCase(), body: data }
  }
  if (!boundary) {
    if (!/text\/html/i.test(ctype) && !/<html/i.test(s)) throw new Error('No parts found in this archive.')
    parts.push(mkPart(top, s.slice(split).replace(/^\r?\n\r?\n/, '')))
  } else {
    const chunks = s.split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`))
    for (const ch of chunks.slice(1)) {
      const k = ch.search(/\r?\n\r?\n/)
      if (k < 0) continue
      const h = headers(ch.slice(0, k))
      if (!Object.keys(h).length) continue
      parts.push(mkPart(h, ch.slice(k).replace(/^\r?\n\r?\n/, '')))
    }
  }
  if (!parts.length) throw new Error('No parts found in this archive.')
  const start = param(ctype, 'start').replace(/^<|>$/g, '')
  let rootIndex = start ? parts.findIndex((p) => p.id === start) : -1
  if (rootIndex < 0) rootIndex = Math.max(0, parts.findIndex((p) => p.type === 'text/html'))
  return { subject: decodeWords(top.subject || ''), date: top.date || '', from: decodeWords(top['snapshot-content-location'] || top.from || ''), parts, rootIndex }
}

export function partText(p: MhtPart): string {
  try { return new TextDecoder(p.charset || 'utf-8').decode(p.body) } catch { return new TextDecoder('utf-8').decode(p.body) }
}

/** Replace every reference to an archived resource (by full URL, cid: or relative path) with a new URL. */
export function rewriteRefs(text: string, parts: MhtPart[], urlFor: (i: number) => string, base = ''): string {
  const map = new Map<string, string>()
  parts.forEach((p, i) => {
    const u = urlFor(i)
    if (p.location) { map.set(p.location, u); try { const l = new URL(p.location); map.set(l.pathname + l.search, u); if (base) { const b = new URL(base); if (b.origin === l.origin) { const rel = l.pathname.split('/').pop()!; if (rel) map.set(rel, u) } } } catch { /* relative */ } }
    if (p.id) { map.set('cid:' + p.id, u) }
  })
  const keys = [...map.keys()].filter(Boolean).sort((a, b) => b.length - a.length)
  if (!keys.length) return text
  const esc = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const amp = (k: string) => esc(k).replace(/&/g, '(?:&|&amp;)')
  const re = new RegExp(`(["'(=\\s])(${keys.map(amp).join('|')})(?=["')\\s>])`, 'g')
  return text.replace(re, (_, pre, k) => pre + (map.get(k) ?? map.get(k.replace(/&amp;/g, '&')) ?? k))
}

/* ---------------- metafile headers ---------------- */
export interface MetaInfo { kind: 'emf' | 'wmf'; width: number; height: number; x: number; y: number; dpi?: number; mmWidth?: number; mmHeight?: number; records?: number }

/** Read the size of an EMF or WMF picture from its header. */
export function metafileInfo(buf: ArrayBuffer): MetaInfo {
  const v = new DataView(buf)
  if (buf.byteLength < 18) throw new Error('This file is too small to be a metafile.')
  if (v.getUint32(0, true) === 1 && buf.byteLength >= 88 && v.getUint32(40, true) === 0x464d4520) {
    const l = v.getInt32(8, true), t = v.getInt32(12, true), r = v.getInt32(16, true), b = v.getInt32(20, true)
    const fl = v.getInt32(24, true), ft = v.getInt32(28, true), fr = v.getInt32(32, true), fb = v.getInt32(36, true)
    return { kind: 'emf', x: l, y: t, width: Math.max(1, r - l + 1), height: Math.max(1, b - t + 1), mmWidth: (fr - fl) / 100, mmHeight: (fb - ft) / 100, records: v.getUint32(52, true) }
  }
  if (v.getUint32(0, true) === 0x9ac6cdd7) {
    const l = v.getInt16(6, true), t = v.getInt16(8, true), r = v.getInt16(10, true), b = v.getInt16(12, true), inch = v.getUint16(14, true) || 1440
    return { kind: 'wmf', x: l, y: t, width: Math.max(1, r - l), height: Math.max(1, b - t), dpi: inch, mmWidth: ((r - l) / inch) * 25.4, mmHeight: ((b - t) / inch) * 25.4 }
  }
  const type = v.getUint16(0, true), hsize = v.getUint16(2, true)
  if ((type === 1 || type === 2) && hsize === 9) {
    // plain WMF: find META_SETWINDOWORG (0x020B) and META_SETWINDOWEXT (0x020C)
    let p = 18, w = 0, h = 0, x = 0, y = 0
    while (p + 6 <= buf.byteLength) {
      const size = v.getUint32(p, true) * 2, fn = v.getUint16(p + 4, true)
      if (size < 6) break
      if (fn === 0x020c && p + 10 <= buf.byteLength) { h = Math.abs(v.getInt16(p + 6, true)); w = Math.abs(v.getInt16(p + 8, true)) }
      if (fn === 0x020b && p + 10 <= buf.byteLength) { y = v.getInt16(p + 6, true); x = v.getInt16(p + 8, true) }
      if (fn === 0 || (w && h)) break
      p += size
    }
    return { kind: 'wmf', x, y, width: w || 1000, height: h || 1000 }
  }
  throw new Error('This does not look like an EMF or WMF file.')
}

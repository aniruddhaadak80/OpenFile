// Docs data layer: builds each page's markdown from its source file, fills generated facts, expands directives,
// splits the result into renderable segments and builds the search index. Every number or list comes from code.
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { toolFormats, allFormats } from '@/lib/formats'
import { SHORTCUTS } from '@/components/Overlays'
import { STEPS, PRESETS } from '@/pages/workspace/steps'
import { ACCENTS, FONTS, DEFAULT_PREFS } from '@/lib/prefs'
import { THEME_OPTIONS } from '@/components/ThemeSwitcher'
import { HISTORY_LIMIT } from '@/lib/db'
import { MODELS } from '@/lib/b4/ai'
import { categoryDoc } from '@/docs/content'
import { slugify } from '@/lib/slug'
import type { Category } from '@/tools/registry'
import { ALL_PAGES, type DocPage } from './nav'
import generatedRaw from './generated.json?raw'
import changelogRaw from '../../../CHANGELOG.md?raw'
import vercelRaw from '../../../vercel.json?raw'

export interface Generated {
  packageVersion: string; appVersion: string; latestRelease: string; toolCount: number; categoryCount: number
  globalShortcuts: { group: string; items: { keys: string[]; label: string }[] }[]
  sketchShortcuts: { group: string; items: { label: string; keys: string }[] }[]
  aiModels: { id: string; files: string[]; tools: string[]; size: string | null }[]
  aiTools: string[]
  manifest: { display: string; fileHandlers: { name: string; exts: string[] }[]; shareAccept: string[]; shortcuts: { name: string; url: string }[] }
  ffmpegFiles: { name: string; bytes: number }[]
  testDirs: string[]; testFiles: string[]
  workflows: { file: string; name: string }[]
  roadmap: { done: string[]; next: string[]; timeline: string }
  lastUpdated: Record<string, string>
}
export const GEN: Generated = JSON.parse(generatedRaw)

const MD = import.meta.glob('./content/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const LEGACY = import.meta.glob('../../docs/pages/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Keys the docs themselves listen to. Rendered on the shortcuts page and used by the docs code. */
export const DOCS_SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['/'], label: 'Open docs search' },
  { keys: ['Up', 'Down'], label: 'Move through search results' },
  { keys: ['Enter'], label: 'Open the highlighted result' },
  { keys: ['Esc'], label: 'Close search or the docs menu' },
  { keys: ['Left', 'Right'], label: 'Switch tabs when a tab list has focus' },
]

const SITE = 'https://openfile-studio.vercel.app'
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const cell = (s: string) => String(s).replace(/\|/g, '\\|')
const kbd = (k: string) => `<kbd>${k}</kbd>`
const toolName = (slug: string) => TOOLS.find((t) => t.slug === slug)?.name ?? slug
const toolLink = (slug: string) => (TOOLS.some((t) => t.slug === slug) ? `[${cell(toolName(slug))}](/${slug})` : `\`${slug}\``)
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`

/* ---------------- facts ---------------- */
// Registry inputs sometimes describe things rather than formats ("Text", "Any file", "Folder"): keep real formats only.
const NOT_FORMATS = new Set(['TEXT', 'FILES', 'FOLDER', 'FOLDERS', 'FORM', 'CAMERA', 'BINARY', 'ATTACHMENTS', 'URL', 'QR', 'CURL', 'LICENSE', 'IMAGE', 'IMAGES', 'VIDEO', 'AUDIO'])
export const isFormat = (f: string) => /^\.?[A-Z0-9][A-Z0-9.]{0,9}$/.test(f) && !NOT_FORMATS.has(f)
export const realFormats = () => allFormats().filter((x) => isFormat(x.format))
export const AI_TOOL_SLUGS = GEN.aiTools.filter((s) => TOOLS.some((t) => t.slug === s))
export function facts(): Record<string, string> {
  const img = STEPS.filter((s) => s.mode === 'image'), pdf = STEPS.filter((s) => s.mode === 'pdf')
  return {
    TOOL_COUNT: String(TOOLS.length),
    CATEGORY_COUNT: String(CATEGORIES.length),
    FORMAT_COUNT: String(realFormats().length),
    AI_TOOL_COUNT: String(AI_TOOL_SLUGS.length),
    AI_MODEL_COUNT: String(GEN.aiModels.length),
    STEP_COUNT: String(STEPS.length),
    IMAGE_STEP_COUNT: String(img.length),
    PDF_STEP_COUNT: String(pdf.length),
    PRESET_COUNT: String(PRESETS.length),
    PIPELINE_TOOL_COUNT: String(TOOLS.filter((t) => t.pipeline).length),
    THEME_COUNT: String(THEME_OPTIONS.length),
    THEME_LIST: list(THEME_OPTIONS.map((t) => `**${t.label}**`)),
    ACCENT_COUNT: String(Object.keys(ACCENTS).length),
    ACCENT_LIST: list(Object.values(ACCENTS).map((a) => a.name)),
    FONT_LIST: list(Object.values(FONTS).map((f) => f.name)),
    DEFAULT_QUALITY: String(DEFAULT_PREFS.imageQuality),
    DEFAULT_NAMING: DEFAULT_PREFS.outputNaming,
    HISTORY_LIMIT: HISTORY_LIMIT.toLocaleString('en-US'),
    APP_VERSION: GEN.appVersion || GEN.packageVersion,
    LATEST_RELEASE: GEN.latestRelease,
    SHORTCUT_COUNT: String(SHORTCUTS.reduce((n, g) => n + g.items.length, 0)),
    SKETCH_SHORTCUT_COUNT: String(GEN.sketchShortcuts.reduce((n, g) => n + g.items.length, 0)),
  }
}
export function fill(md: string): string {
  const f = facts()
  return md.replace(/\{\{(=?)([A-Z_]+)\}\}/g, (m, esc, k) => (esc ? `{{${k}}}` : f[k] ?? m))
}

/* ---------------- directives that expand to markdown ---------------- */
function sections(md: string, names: string[]): string {
  const parts = md.split(/^(?=## )/m)
  return names.map((n) => parts.find((p) => p.replace(/^## /, '').split('\n')[0].trim().toLowerCase() === n.trim().toLowerCase()) ?? '').filter(Boolean).join('\n')
}
function legacy(id: string, only?: string): string {
  const raw = LEGACY[`../../docs/pages/${id}.md`] ?? ''
  const body = raw.replace(/^# .*\n/, '')
  return only ? sections(body, only.split(',')) : body
}

function changelogMd(): string {
  // Internal links: point release notes at this deployment instead of the Vercel origin.
  let raw = changelogRaw.replace(new RegExp(`${SITE.replace(/\./g, '\\.')}/`, 'g'), '/')
  const at = raw.search(/^# Changelog/m)
  const pre = at > 0 ? raw.slice(0, at).trim() : ''
  if (at > 0) raw = raw.slice(at)
  if (!pre) return raw
  // Notes added above the title (newest builds not yet in a numbered release) go first, under one heading.
  const [title, ...rest] = raw.split(/^(?=## )/m)
  return `${title.trim()}\n\n## Latest changes\n\n${pre.replace(/^## (.*)$/gm, '### $1')}\n\n${rest.join('')}`
}

function roadmapMd(): string {
  const r = GEN.roadmap
  const out: string[] = []
  if (r.timeline) out.push('## Timeline', '', '```mermaid', r.timeline.replace(/%%\{init[\s\S]*?\}%%\n?/, '').trim(), '```', '')
  if (r.done.length) out.push('## Shipped', '', ...r.done.map((d) => `- [x] ${d}`), '')
  if (r.next.length) out.push('## Next', '', ...r.next.map((d) => `- [ ] ${d}`), '')
  return out.join('\n')
}

function workspaceStepsMd(): string {
  const fmt = (p: (typeof STEPS)[number]['params'][number]) => `${p.label}${p.options ? ` (${p.options.join(', ')})` : ''}, default \`${String(p.default)}\``
  const table = (mode: 'image' | 'pdf') => ['| Step | What it does | Settings |', '| --- | --- | --- |', ...STEPS.filter((s) => s.mode === mode).map((s) => `| **${cell(s.name)}** | ${cell(s.desc)} | ${s.params.length ? cell(s.params.map(fmt).join('; ')) : 'none'} |`)].join('\n')
  return `## Image steps\n\n${table('image')}\n\n## PDF steps\n\n${table('pdf')}\n`
}
function workspacePresetsMd(): string {
  const name = (id: string) => STEPS.find((s) => s.id === id)?.name ?? id
  return `## Presets\n\nStart from a preset, then change any step. Presets are a starting point, not a lock.\n\n| Preset | Mode | Steps |\n| --- | --- | --- |\n${PRESETS.map((p) => `| **${cell(p.name)}** | ${p.mode === 'image' ? 'Images' : 'PDF'} | ${p.steps.map((s) => name(s.id)).join(', then ')} |`).join('\n')}\n`
}

function shortcutsAppMd(): string {
  return `## App shortcuts\n\n${SHORTCUTS.map((g) => `### ${g.group}\n\n| Keys | Action |\n| --- | --- |\n${g.items.map(([keys, label]) => `| ${keys.map((k) => (k === 'Drop' ? 'Drag a file' : kbd(k))).join(keys[0] === 'G' ? ' then ' : ' + ')} | ${cell(label)} |`).join('\n')}`).join('\n\n')}\n`
}
function shortcutsDocsMd(): string {
  return `## Docs shortcuts\n\n| Keys | Action |\n| --- | --- |\n${DOCS_SHORTCUTS.map((s) => `| ${s.keys.map(kbd).join(' ')} | ${s.label} |`).join('\n')}\n`
}
function shortcutsSketchMd(): string {
  const KEY_RE = /^(Ctrl|Shift|Alt|Cmd|Space|Enter|Esc|Del|Backspace|Tab|Home|End|F\d{1,2}|[A-Za-z0-9?'=\-\u2212\[\]\/]{1,2})$/
  const tok = (x: string) => (KEY_RE.test(x.trim()) ? kbd(cell(x.trim())) : cell(x.trim()))
  const keys = (k: string) => k.split(' · ').map((part) => part.split(' or ').map((alt) => alt.split(/\s*\+\s*/).map((x) => x.split(' / ').map(tok).join(' / ')).join(' + ')).join(' or ')).join(', ')
  return `## Sketch board shortcuts\n\nThe [Sketch board](/sketch-board) has its own keys. Press ${kbd('?')} on the board to see them there.\n\n${GEN.sketchShortcuts.map((g) => `### ${g.group}\n\n| Action | Keys |\n| --- | --- |\n${g.items.map((i) => `| ${cell(i.label)} | ${keys(i.keys)} |`).join('\n')}`).join('\n\n')}\n`
}

function aiModelsMd(): string {
  const groups: [string, string, string][] = [['chat', 'Chat with PDF, question generator', 'chat'], ['summarize', 'Summaries', 'summarize'], ['translate', 'Translation', 'translate'], ['embed', 'Finding passages for chat', 'embed']]
  const rows = groups.flatMap(([key, use]) => ((MODELS as any)[key] as { id: string; label: string; size: string; dtype?: Record<string, string> }[]).map((m) => `| ${use} | ${cell(m.label)} | \`${m.id}\` | ${m.size} | ${m.dtype?.wasm ?? 'default'} | ${m.dtype?.webgpu ?? 'default'} |`))
  return `### Document and text AI\n\nThese models power the text tools. You can pick between them in the tool where there is more than one.\n\n| Used for | Model | Id | Download | CPU weights | GPU weights |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n`
}
function aiCatalogMd(): string {
  return `### Every model in the source\n\nFound by scanning the tool code at build time.\n\n| Model | Download | Used by |\n| --- | --- | --- |\n${GEN.aiModels.map((m) => `| \`${cell(m.id)}\` | ${m.size ?? 'shown in the tool before it downloads'} | ${m.tools.map(toolLink).join(', ') || `shared helper in ${m.files.map((f) => `\`${f}\``).join(', ')}, not used by a tool yet`} |`).join('\n')}\n\n### Tools that use on-device AI or OCR\n\n${AI_TOOL_SLUGS.map((s) => `- ${toolLink(s)}: ${cell(TOOLS.find((t) => t.slug === s)?.desc ?? '')}`).join('\n')}\n`
}

function securityHeadersMd(): string {
  try {
    const v = JSON.parse(vercelRaw) as { headers?: { source: string; headers: { key: string; value: string }[] }[] }
    const all = v.headers?.find((h) => h.source === '/(.*)')?.headers ?? []
    return `| Header | Value |\n| --- | --- |\n${all.map((h) => `| \`${h.key}\` | \`${cell(h.value)}\` |`).join('\n')}\n`
  } catch { return '' }
}

function categoryListMd(): string {
  return `| Category | Tools | What it covers |\n| --- | --: | --- |\n${CATEGORIES.map((c) => `| [${cell(c.name)}](/docs/tools/${c.id}) | ${TOOLS.filter((t) => t.category === c.id).length} | ${cell(c.blurb)} |`).join('\n')}\n`
}

const EXPAND: Record<string, (arg: string) => string> = {
  include: (arg) => { const m = arg.match(/^legacy:([\w-]+)(?:#(.+))?$/); return m ? legacy(m[1], m[2]) : '' },
  changelog: changelogMd,
  roadmap: roadmapMd,
  'workspace-steps': workspaceStepsMd,
  'workspace-presets': workspacePresetsMd,
  'shortcuts-app': shortcutsAppMd,
  'shortcuts-docs': shortcutsDocsMd,
  'shortcuts-sketch': shortcutsSketchMd,
  'ai-models': aiModelsMd,
  'ai-catalog': aiCatalogMd,
  'security-headers': securityHeadersMd,
  'category-list': categoryListMd,
  ffmpeg: () => (GEN.ffmpegFiles.length ? `> [!NOTE]\n> OpenFile serves its own copy of the ffmpeg core, so video and audio tools do not depend on a third-party CDN: ${GEN.ffmpegFiles.map((f) => `\`${f.name}\` (${mb(f.bytes)})`).join(' and ')}. If that copy cannot be reached, the tools fall back to public CDNs.\n` : ''),
  'file-handlers': () => `| File type | Extensions |\n| --- | --- |\n${GEN.manifest.fileHandlers.map((h) => `| ${cell(h.name)} | ${h.exts.map((e) => `\`${e}\``).join(' ')} |`).join('\n')}\n`,
  'share-accept': () => `The share sheet can send these types to OpenFile: ${GEN.manifest.shareAccept.map((a) => `\`${a}\``).join(', ')}.\n`,
  'app-shortcuts': () => GEN.manifest.shortcuts.map((s) => `- [${cell(s.name)}](${s.url})`).join('\n') + '\n',
  tests: () => `There are **${GEN.testFiles.length} test files** in ${GEN.testDirs.length} folders under \`scripts/tests/\` (${GEN.testDirs.map((d) => `\`${d}\``).join(', ')}).\n`,
  workflows: () => `| Workflow | File |\n| --- | --- |\n${GEN.workflows.map((w) => `| ${cell(w.name)} | [\`${w.file}\`](https://github.com/aniruddhaadak80/OpenFile/blob/main/${w.file}) |`).join('\n')}\n`,
}

/** The page's markdown with every directive except components and tabs expanded, and facts filled in. */
export function pageMarkdown(page: DocPage): string {
  let md: string
  if (page.source === 'category') md = categoryDoc(page.id.slice(6) as Category)
  else if (page.source === 'legacy') md = LEGACY[`../../docs/pages/${page.file}.md`] ?? `# ${page.title}\n\n${page.description}`
  else md = MD[`./content/${page.id === 'themes' ? 'themes' : page.id}.md`] ?? `# ${page.title}\n\n${page.description}`
  md = md.replace(/^::([\w-]+)(?:[ \t]+(.+))?$/gm, (line, name, arg) => (name === 'component' ? line : EXPAND[name] ? EXPAND[name]((arg ?? '').trim()) : line))
  return fill(md)
}

/* ---------------- segments ---------------- */
export type Segment = { kind: 'md'; md: string } | { kind: 'component'; name: string } | { kind: 'tabs'; group: string; tabs: { label: string; md: string }[] }
export function segments(md: string): Segment[] {
  const out: Segment[] = []
  const lines = md.split('\n')
  let buf: string[] = []
  let fence = false
  const flush = () => { if (buf.join('').trim()) out.push({ kind: 'md', md: buf.join('\n') }); buf = [] }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^```/.test(line)) fence = !fence
    if (!fence) {
      const comp = line.match(/^::component\s+([\w-]+)\s*$/)
      if (comp) { flush(); out.push({ kind: 'component', name: comp[1] }); continue }
      const tabs = line.match(/^:::tabs(?:\s+([\w-]+))?\s*$/)
      if (tabs) {
        flush()
        const seg: Segment & { kind: 'tabs' } = { kind: 'tabs', group: tabs[1] ?? 'tabs', tabs: [] }
        let inner = false
        for (i++; i < lines.length; i++) {
          const l = lines[i]
          if (/^```/.test(l)) inner = !inner
          if (!inner && /^:::\s*$/.test(l)) break
          const t = !inner && l.match(/^@tab\s+(.+)$/)
          if (t) seg.tabs.push({ label: t[1].trim(), md: '' })
          else if (seg.tabs.length) seg.tabs[seg.tabs.length - 1].md += l + '\n'
        }
        out.push(seg)
        continue
      }
    }
    buf.push(line)
  }
  flush()
  return out
}

/* ---------------- search ---------------- */
export interface SearchEntry { kind: 'Docs' | 'Tool' | 'Category'; path: string; anchor: string; title: string; context: string; text: string; words: string[] }
const plain = (md: string) => md
  .replace(/```mermaid[\s\S]*?```/g, ' ').replace(/```\w*/g, ' ')
  .replace(/<kbd>(.*?)<\/kbd>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^>\s?\[!\w+\]/gm, '').replace(/^::.*$/gm, ' ').replace(/^:::.*$/gm, ' ').replace(/^@tab\s+/gm, '')
  .replace(/[#>*_`|]/g, ' ').replace(/-{3,}/g, ' ').replace(/\s+/g, ' ').trim()
const wordsOf = (s: string) => [...new Set(s.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g) ?? [])]

let INDEX: SearchEntry[] | null = null
export function searchIndex(): SearchEntry[] {
  if (INDEX) return INDEX
  const entries: SearchEntry[] = []
  for (const page of ALL_PAGES) {
    const md = pageMarkdown(page)
    const counts = new Map<string, number>()
    let heading = page.title, anchor = '', buf: string[] = [], fence = false
    const flush = () => { const text = plain(buf.join('\n')); entries.push({ kind: page.source === 'category' ? 'Category' : 'Docs', path: page.path, anchor, title: heading, context: page.title, text, words: wordsOf(`${heading} ${page.title}`) }); buf = [] }
    for (const line of md.split('\n')) {
      if (line.startsWith('```')) fence = !fence
      const m = !fence && line.match(/^(#{1,3})\s+(.*)$/)
      if (m) {
        if (m[1].length === 1) continue
        flush()
        heading = m[2].replace(/<[^>]+>/g, '')
        const base = slugify(m[2]); const n = counts.get(base) ?? 0; counts.set(base, n + 1)
        anchor = n ? `${base}-${n}` : base
      } else buf.push(line)
    }
    flush()
  }
  for (const t of TOOLS) {
    const f = toolFormats(t)
    entries.push({ kind: 'Tool', path: `/${t.slug}`, anchor: '', title: t.name, context: CATEGORIES.find((c) => c.id === t.category)?.name ?? t.category, text: `${t.desc} ${(t.tags ?? []).join(' ')} ${f.all.join(' ')}`, words: wordsOf(`${t.name} ${(t.tags ?? []).join(' ')} ${f.all.join(' ')}`) })
  }
  INDEX = entries
  return entries
}

function lev1(a: string, b: string): boolean {
  // true when a and b differ by at most one edit
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) { const d = [...a].map((ch, k) => (ch === b[k] ? -1 : k)).filter((k) => k >= 0); if (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]]) return true }
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}
const subseq = (q: string, w: string) => { let i = 0; for (const ch of w) if (ch === q[i]) i++; return i === q.length }

export interface SearchHit extends SearchEntry { score: number; snippet: string }
export function searchDocs(q: string, limit = 24): SearchHit[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const terms = s.split(/\s+/).filter(Boolean)
  const hits: SearchHit[] = []
  for (const e of searchIndex()) {
    const h = e.title.toLowerCase(), c = e.context.toLowerCase(), t = e.text.toLowerCase()
    let score = 0, ok = true
    for (const x of terms) {
      let sc = 0
      if (h.includes(x)) sc += h.startsWith(x) ? 14 : 9
      if (c.includes(x)) sc += 3
      if (t.includes(x)) sc += 1
      if (!sc && x.length >= 3) {
        // fuzzy: a typo (one edit) or the letters in order inside a title word
        if (e.words.some((w) => (x.length >= 4 && lev1(x, w)) || (w.length <= x.length + 4 && w[0] === x[0] && subseq(x, w)))) sc += 4
      }
      if (!sc) { ok = false; break }
      score += sc
    }
    if (!ok) continue
    if (h === s) score += 25
    if (e.kind === 'Tool') score += 1
    if (!e.anchor && e.kind !== 'Tool') score += 2
    const i = t.indexOf(terms[0])
    const start = Math.max(0, i - 50)
    const snippet = i < 0 ? e.text.slice(0, 140) : (start > 0 ? '…' : '') + e.text.slice(start, start + 150) + (start + 150 < e.text.length ? '…' : '')
    hits.push({ ...e, score, snippet })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

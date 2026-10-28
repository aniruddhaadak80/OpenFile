// Docs content: hand-written markdown pages (src/docs/pages/*.md) plus category guides generated from the tool registry.
import { CATEGORIES, TOOLS, type Category } from '@/tools/registry'
import { toolGuide, ENGINE_INFO, HEAVY_ENGINES } from '@/tools/guides'
import { DOC_NAV, type DocNavItem } from './nav'
import { slugify } from '@/lib/slug'

const RAW = import.meta.glob('./pages/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const page = (id: string) => RAW[`./pages/${id}.md`]

const fill = (md: string) => md.replace(/\{\{TOOL_COUNT\}\}/g, String(TOOLS.length)).replace(/\{\{CATEGORY_COUNT\}\}/g, String(CATEGORIES.length))
const cell = (s: string) => s.replace(/\|/g, '\\|')

export function categoryDoc(cat: Category): string {
  const c = CATEGORIES.find((x) => x.id === cat)!
  const tools = TOOLS.filter((t) => t.category === cat)
  const guides = tools.map((t) => ({ t, g: toolGuide(t) }))
  const heavy = [...new Set(guides.flatMap(({ g }) => g.engineKeys.filter((k) => HEAVY_ENGINES.includes(k))))]
  const engines = [...new Set(guides.flatMap(({ g }) => g.engineKeys))].filter((k) => k !== 'Plain TypeScript')
  const out: string[] = []
  out.push(`# ${c.name}`, '')
  out.push(`${c.blurb}. This category has **${tools.length} tools**, and every one of them runs entirely in your browser. Files are never uploaded.`, '')
  if (engines.length) out.push(`Engines used in this category: ${engines.map((k) => ENGINE_INFO[k]?.name ?? k).join(', ')}.`, '')
  if (heavy.length) {
    out.push('> [!NOTE]', `> Some tools here download an engine the first time you use them, then cache it: ${heavy.map((k) => `**${ENGINE_INFO[k].name}** (${ENGINE_INFO[k].download})`).join('; ')}. Only the engine is downloaded, never your files.`, '')
  }
  out.push('## At a glance', '', '| Tool | What it does | Runs on |', '| --- | --- | --- |')
  for (const { t, g } of guides) out.push(`| [${cell(t.name)}](/${t.slug})${t.badge ? ` \`${t.badge}\`` : ''} | ${cell(t.desc)} | ${g.engines.slice(0, 2).map((e) => e.name).join(', ')} |`)
  out.push('')
  for (const { t, g } of guides) {
    out.push(`## ${t.name}`, '')
    out.push(t.desc, '')
    const meta = [`[Open ${t.name} →](/${t.slug})`]
    if (g.inputs?.length) meta.push(`**Input:** ${g.inputs.join(', ')}`)
    if (g.outputs?.length) meta.push(`**Output:** ${g.outputs.join(', ')}`)
    if (t.pipeline) meta.push(`**Workspace step:** available in ${t.pipeline === 'image' ? 'image' : 'PDF'} pipelines`)
    out.push(meta.join(' · '), '')
    out.push('**How to use**', '')
    g.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`))
    out.push('')
    if (g.tips.length) { out.push('**Tips**', ''); g.tips.forEach((s) => out.push(`- ${s}`)); out.push('') }
    out.push(`**Under the hood:** ${g.engines.map((e) => `${e.name} (${e.what})`).join('; ')}.`, '')
    if (g.firstUse) out.push(`**First use:** ${g.firstUse}.`, '')
  }
  out.push('## Related guides', '', ...CATEGORIES.filter((x) => x.id !== cat).map((x) => `- [${x.name}](/docs/tools/${x.id}): ${x.blurb.toLowerCase()}`), '')
  return out.join('\n')
}

export function docMarkdown(item: DocNavItem): string {
  if (item.id.startsWith('tools-')) return categoryDoc(item.id.slice(6) as Category)
  return fill(page(item.id) ?? `# ${item.title}\n\n${item.description}`)
}

/* ---------------- search index ---------------- */
export interface SearchEntry { docId: string; path: string; docTitle: string; heading: string; anchor: string; text: string; level: number }

export { slugify }

const plain = (md: string) => md
  .replace(/```[\s\S]*?```/g, (m) => (m.startsWith('```mermaid') ? ' ' : m.replace(/```\w*/g, ' ')))
  .replace(/<kbd>(.*?)<\/kbd>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^>\s?\[!\w+\]/gm, '').replace(/[#>*_`|]/g, ' ').replace(/-{3,}/g, ' ').replace(/\s+/g, ' ').trim()

let INDEX: SearchEntry[] | null = null
export function searchIndex(): SearchEntry[] {
  if (INDEX) return INDEX
  const entries: SearchEntry[] = []
  for (const item of DOC_NAV) {
    const md = docMarkdown(item)
    const lines = md.split('\n')
    let heading = item.title, anchor = '', level = 1, buf: string[] = []
    const counts = new Map<string, number>()
    let inFence = false
    const flush = () => { const text = plain(buf.join('\n')); if (text || level === 1) entries.push({ docId: item.id, path: item.path, docTitle: item.title, heading, anchor, text, level }); buf = [] }
    for (const line of lines) {
      if (line.startsWith('```')) inFence = !inFence
      const m = !inFence && line.match(/^(#{1,3})\s+(.*)$/)
      if (m) {
        if (m[1].length === 1) { heading = m[2]; continue }
        flush()
        heading = m[2].replace(/<[^>]+>/g, ''); level = m[1].length
        const base = slugify(m[2]); const n = counts.get(base) ?? 0; counts.set(base, n + 1)
        anchor = n ? `${base}-${n}` : base
      } else buf.push(line)
    }
    flush()
  }
  INDEX = entries
  return entries
}

export interface SearchHit extends SearchEntry { score: number; snippet: string }
export function searchDocs(q: string, limit = 12): SearchHit[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  const terms = s.split(/\s+/).filter(Boolean)
  const hits: SearchHit[] = []
  for (const e of searchIndex()) {
    const h = e.heading.toLowerCase(), d = e.docTitle.toLowerCase(), t = e.text.toLowerCase()
    if (!terms.every((x) => h.includes(x) || t.includes(x) || d.includes(x))) continue
    let score = 0
    for (const x of terms) { if (h.includes(x)) score += 8; if (h.startsWith(x)) score += 4; if (d.includes(x)) score += 3; if (t.includes(x)) score += 1 }
    if (h === s) score += 20
    if (e.level === 1) score += 2
    const i = t.indexOf(terms[0])
    const start = Math.max(0, i - 50)
    const snippet = i < 0 ? e.text.slice(0, 140) : (start > 0 ? '…' : '') + e.text.slice(start, start + 150) + (start + 150 < e.text.length ? '…' : '')
    hits.push({ ...e, score, snippet })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

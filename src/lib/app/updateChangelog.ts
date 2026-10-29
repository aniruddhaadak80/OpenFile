// "What's new": release notes from CHANGELOG.md (loaded on demand so it never weighs on the first page load)
// and a tiny, safe Markdown to HTML renderer for release notes (headings, lists, bold, code, links).

export interface ChangelogEntry { title: string; version: string | null; date: string | null; body: string }

const RAW = 'https://raw.githubusercontent.com/aniruddhaadak80/OpenFile/main/CHANGELOG.md'

/** Newest notes from GitHub when online (so an older copy can show what the update brings), else the bundled file. */
export async function loadChangelog(limit = 4): Promise<ChangelogEntry[]> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000)
      const r = await fetch(RAW, { cache: 'no-store', signal: ctl.signal }).finally(() => clearTimeout(t))
      if (r.ok) { const list = parseChangelog(await r.text()); if (list.length) return list.slice(0, limit) }
    } catch { /* offline: use the bundled copy */ }
  }
  const raw: string = (await import('../../../CHANGELOG.md?raw')).default
  return parseChangelog(raw).slice(0, limit)
}

/** Splits CHANGELOG.md into "## ..." sections that carry a version (v1.2.0, 1.2.0) in their heading. */
export function parseChangelog(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = []
  const parts = md.split(/^## /m).slice(1)
  for (const p of parts) {
    const nl = p.indexOf('\n')
    const title = (nl < 0 ? p : p.slice(0, nl)).trim()
    const version = title.match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)?.[1] ?? null
    if (!version) continue
    const date = title.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
    out.push({ title, version, date, body: (nl < 0 ? '' : p.slice(nl + 1)).trim() })
  }
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
function inline(s: string): string {
  let h = esc(s)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>')
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`)
  h = h.replace(/&lt;kbd&gt;(.*?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>')
  return h
}

/** Markdown subset to HTML. Everything is escaped first, so release notes cannot inject markup. */
export function renderNotes(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n')
  let html = '', list = false
  const close = () => { if (list) { html += '</ul>'; list = false } }
  for (const l of lines) {
    const t = l.trim()
    if (!t) { close(); continue }
    const h = t.match(/^(#{1,6})\s+(.*)$/)
    if (h) { close(); const lvl = Math.min(6, h[1].length + 2); html += `<h${lvl}>${inline(h[2])}</h${lvl}>`; continue }
    const li = t.match(/^[-*]\s+(.*)$/)
    if (li) { if (!list) { html += '<ul>'; list = true } html += `<li>${inline(li[1])}</li>`; continue }
    if (/^\|/.test(t)) { close(); html += `<p class="font-mono text-xs">${inline(t)}</p>`; continue }
    close(); html += `<p>${inline(t)}</p>`
  }
  close()
  return html
}

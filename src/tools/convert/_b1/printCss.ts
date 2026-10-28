/* Print-CSS helpers for HTML to PDF: apply @media print rules, read @page size and margins, strip backgrounds. Pure string work. */
const MM = 72 / 25.4
const NAMED: Record<string, [number, number]> = { a3: [841.89, 1190.55], a4: [595.28, 841.89], a5: [419.53, 595.28], a6: [297.64, 419.53], b4: [708.66, 1000.63], b5: [498.9, 708.66], letter: [612, 792], legal: [612, 1008], ledger: [1224, 792], tabloid: [792, 1224] }
export const toPt = (v: string): number | null => {
  const m = /^(-?[\d.]+)(mm|cm|in|pt|pc|px|q)?$/i.exec(v.trim()); if (!m) return null
  const n = parseFloat(m[1]); const u = (m[2] ?? 'px').toLowerCase()
  return u === 'mm' ? n * MM : u === 'cm' ? n * MM * 10 : u === 'in' ? n * 72 : u === 'pt' ? n : u === 'pc' ? n * 12 : u === 'q' ? (n * MM) / 4 : n * 0.75
}

/** Read the first @page rule: size (pt) and margins (pt). */
export function readAtPage(html: string): { size?: { w: number; h: number }; margin?: { top: number; right: number; bottom: number; left: number } } {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n')
  const rule = /@page\s*(?::first|:left|:right)?\s*\{([^}]*)\}/i.exec(css)
  if (!rule) return {}
  const out: ReturnType<typeof readAtPage> = {}
  const size = /(?:^|;)\s*size\s*:\s*([^;]+)/i.exec(rule[1])?.[1].trim().toLowerCase()
  if (size && size !== 'auto') {
    const parts = size.split(/\s+/)
    const land = parts.includes('landscape'), port = parts.includes('portrait')
    const named = parts.find((p) => NAMED[p])
    let w: number | null = null, h: number | null = null
    if (named) [w, h] = NAMED[named]
    else { const nums = parts.map(toPt).filter((n): n is number => n !== null); if (nums.length === 1) w = h = nums[0]; else if (nums.length >= 2) [w, h] = nums }
    if (w && h) { if ((land && w < h) || (port && w > h)) [w, h] = [h, w]; out.size = { w, h } }
    else if (land || port) out.size = land ? { w: NAMED.a4[1], h: NAMED.a4[0] } : { w: NAMED.a4[0], h: NAMED.a4[1] }
  }
  const mg = /(?:^|;)\s*margin\s*:\s*([^;]+)/i.exec(rule[1])?.[1].trim()
  if (mg) {
    const v = mg.split(/\s+/).map(toPt)
    if (v.every((x) => x !== null)) { const [t, r = t, b = t, l = r] = v as number[]; out.margin = { top: t, right: r, bottom: b, left: l } }
  }
  return out
}

/** Make print rules win: @media print becomes all, @media screen is switched off, print-only stylesheets are enabled. */
export function applyPrintMedia(html: string) {
  return html
    .replace(/@media\s+print\b/gi, '@media all')
    .replace(/@media\s+screen\b/gi, '@media not all')
    .replace(/(<(?:link|style)\b[^>]*\bmedia\s*=\s*["'])\s*print\s*(["'])/gi, '$1all$2')
    .replace(/(<(?:link|style)\b[^>]*\bmedia\s*=\s*["'])\s*screen\s*(["'])/gi, '$1not all$2')
}

export function injectCss(html: string, css: string) {
  const tag = `<style data-openfile>${css}</style>`
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tag}</head>`) : tag + html
}
export const NO_BACKGROUNDS = '*,*::before,*::after{background:transparent!important;background-image:none!important;box-shadow:none!important;text-shadow:none!important}html,body{background:#fff!important}'
export const GRAYSCALE = 'html{filter:grayscale(1)}'

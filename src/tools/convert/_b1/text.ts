/* Text helpers shared by the writers (no imports, so Node tests can load them). */
import type { Run } from '../_conv/pdfText'
export const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function runsHtml(runs: Run[]) {
  return runs.map((r) => { let t = escHtml(r.text); if (r.bold) t = `<strong>${t}</strong>`; if (r.italic) t = `<em>${t}</em>`; return t }).join('')
}
const mdEsc = (s: string) => s.replace(/([\\`*_[\]#|<>])/g, '\\$1')
export function runsMd(runs: Run[]) {
  return runs.map((r) => {
    const raw = r.text
    if (!raw.trim()) return raw
    const lead = raw.match(/^\s*/)![0], trail = raw.match(/\s*$/)![0]
    let t = mdEsc(raw.trim())
    if (r.bold && r.italic) t = `***${t}***`; else if (r.bold) t = `**${t}**`; else if (r.italic) t = `*${t}*`
    return lead + t + trail
  }).join('').replace(/\*\*\s*\*\*/g, ' ')
}

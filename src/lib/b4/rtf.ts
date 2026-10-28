/* RTF helpers: full render to HTML with rtf.js (MIT, handles fonts, colors, tables and WMF/EMF pictures),
 * and a dependency-free plain-text fallback. */

export async function rtfToHtml(buf: ArrayBuffer): Promise<string> {
  try {
    const { RTFJS, WMFJS, EMFJS } = await import('rtf.js')
    RTFJS.loggingEnabled(false); WMFJS.loggingEnabled(false); EMFJS.loggingEnabled(false)
    const doc = new RTFJS.Document(buf, {})
    const els = await doc.render()
    const box = document.createElement('div')
    els.forEach((e) => box.appendChild(e))
    // rtf.js renders pictures as <img src="data:..."> or inline <svg>; turn svg into images so they survive conversions
    for (const svg of Array.from(box.querySelectorAll('svg'))) {
      const xml = new XMLSerializer().serializeToString(svg)
      const img = document.createElement('img'); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml))); svg.replaceWith(img)
    }
    return box.innerHTML
  } catch {
    const text = rtfToText(new TextDecoder('latin1').decode(buf))
    return text.split(/\n\s*\n/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`).join('\n')
  }
}

export async function rtfMeta(buf: ArrayBuffer): Promise<Record<string, any>> {
  try { const { RTFJS } = await import('rtf.js'); return new RTFJS.Document(buf, {}).metadata() } catch { return {} }
}

/** Strip RTF control words to plain text. Pure, unit tested. */
export function rtfToText(rtf: string): string {
  let out = ''
  const stack: { skip: boolean; uc: number }[] = []
  let skip = false, uc = 1, pendingSkip = 0
  const DEST = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|headerl|headerr|footerl|footerr|footnote|fldinst|themedata|colorschememapping|latentstyles|datastore|xmlnstbl|listtable|listoverridetable|rsidtbl|generator|filetbl|revtbl|pgdsctbl|mmathPr|wgrffmtfilter)$/
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i]
    if (c === '{') { stack.push({ skip, uc }); continue }
    if (c === '}') { const s = stack.pop(); if (s) { skip = s.skip; uc = s.uc } continue }
    if (c === '\\') {
      const n = rtf[i + 1]
      if (n === '\\' || n === '{' || n === '}') { if (!skip) out += n; i++; continue }
      if (n === '*') { skip = true; i++; continue }
      if (n === "'") { const hex = rtf.substr(i + 2, 2); i += 3; if (pendingSkip > 0) { pendingSkip--; continue } if (!skip) out += String.fromCharCode(parseInt(hex, 16)); continue }
      if (n === '~') { if (!skip) out += '\u00a0'; i++; continue }
      if (n === '-' || n === '_') { i++; continue }
      const m = rtf.slice(i + 1).match(/^([a-zA-Z]+)(-?\d+)? ?/)
      if (!m) { i++; continue }
      i += m[0].length
      const word = m[1], arg = m[2] != null ? +m[2] : null
      if (DEST.test(word)) { skip = true; continue }
      if (skip) continue
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n'
      else if (word === 'tab' || word === 'cell') out += '\t'
      else if (word === 'row') out += '\n'
      else if (word === 'uc' && arg != null) uc = arg
      else if (word === 'u' && arg != null) { out += String.fromCharCode(arg < 0 ? arg + 65536 : arg); pendingSkip = uc }
      else if (word === 'emdash') out += '\u2014'
      else if (word === 'endash') out += '\u2013'
      else if (word === 'bullet') out += '\u2022'
      else if (word === 'lquote') out += '\u2018'
      else if (word === 'rquote') out += '\u2019'
      else if (word === 'ldblquote') out += '\u201c'
      else if (word === 'rdblquote') out += '\u201d'
      continue
    }
    if (c === '\r' || c === '\n') continue
    if (skip) continue
    if (pendingSkip > 0) { pendingSkip--; continue }
    out += c
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

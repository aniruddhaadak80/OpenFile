/* Minimal ODT (OpenDocument Text) to HTML: headings, paragraphs, bold/italic spans, lists, tables, links and images. */
export async function odtToHtml(file: Blob): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(file).catch(() => { throw new Error('This is not a valid ODT file.') })
  const xml = await zip.file('content.xml')?.async('string')
  if (!xml) throw new Error('This ODT file has no content.')
  const styles = (await zip.file('styles.xml')?.async('string')) ?? ''
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const sdoc = new DOMParser().parseFromString(styles, 'application/xml')
  const bold = new Set<string>(), italic = new Set<string>(), under = new Set<string>()
  for (const d of [doc, sdoc]) for (const st of Array.from(d.getElementsByTagNameNS('*', 'style'))) {
    const name = st.getAttribute('style:name') || ''
    const tp = st.getElementsByTagNameNS('*', 'text-properties')[0]
    if (!tp) continue
    if (/bold|[6-9]00/.test(tp.getAttribute('fo:font-weight') || '')) bold.add(name)
    if (tp.getAttribute('fo:font-style') === 'italic') italic.add(name)
    if ((tp.getAttribute('style:text-underline-style') || 'none') !== 'none') under.add(name)
  }
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const imgUrl = async (href: string) => { const f = zip.file(href); if (!f) return ''; const b = await f.async('base64'); const ext = href.split('.').pop()?.toLowerCase(); return `data:image/${ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext};base64,${b}` }
  const inline = async (el: Element): Promise<string> => {
    let s = ''
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) { s += esc(n.textContent ?? ''); continue }
      if (n.nodeType !== 1) continue
      const e = n as Element, ln = e.localName
      if (ln === 's') s += ' '.repeat(+(e.getAttribute('text:c') || 1))
      else if (ln === 'tab') s += '\t'
      else if (ln === 'line-break') s += '<br/>'
      else if (ln === 'a') s += `<a href="${esc(e.getAttribute('xlink:href') || '')}">${await inline(e)}</a>`
      else if (ln === 'frame') { const im = e.getElementsByTagNameNS('*', 'image')[0]; if (im) { const u = await imgUrl(im.getAttribute('xlink:href') || ''); if (u) s += `<img src="${u}" alt=""/>` } }
      else if (ln === 'span') {
        const st = e.getAttribute('text:style-name') || ''
        let inner = await inline(e)
        if (bold.has(st)) inner = `<b>${inner}</b>`
        if (italic.has(st)) inner = `<i>${inner}</i>`
        if (under.has(st)) inner = `<u>${inner}</u>`
        s += inner
      } else if (ln !== 'note' && ln !== 'annotation' && ln !== 'bookmark' && ln !== 'bookmark-start' && ln !== 'bookmark-end') s += await inline(e)
    }
    return s
  }
  const block = async (el: Element): Promise<string> => {
    let s = ''
    for (const e of Array.from(el.children)) {
      const ln = e.localName
      if (ln === 'h') { const lv = Math.min(6, +(e.getAttribute('text:outline-level') || 1)); s += `<h${lv}>${await inline(e)}</h${lv}>\n` }
      else if (ln === 'p') { const st = e.getAttribute('text:style-name') || ''; let t = await inline(e); if (bold.has(st)) t = `<b>${t}</b>`; s += `<p>${t}</p>\n` }
      else if (ln === 'list') { s += '<ul>'; for (const li of Array.from(e.children).filter((x) => x.localName === 'list-item')) s += `<li>${(await block(li)).replace(/<\/?p>/g, '')}</li>`; s += '</ul>\n' }
      else if (ln === 'table') {
        s += '<table>'
        for (const row of Array.from(e.getElementsByTagNameNS('*', 'table-row'))) { s += '<tr>'; for (const c of Array.from(row.children).filter((x) => x.localName === 'table-cell')) s += `<td>${(await block(c)).replace(/<\/?p>/g, ' ')}</td>`; s += '</tr>' }
        s += '</table>\n'
      } else if (ln === 'section' || ln === 'text' || ln === 'body') s += await block(e)
    }
    return s
  }
  const body = doc.getElementsByTagNameNS('*', 'text')[0]
  return body ? block(body) : ''
}

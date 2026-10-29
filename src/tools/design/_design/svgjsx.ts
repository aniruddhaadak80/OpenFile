/* SVG → React JSX component converter (DOM based, browser only) */
const KEEP = /^(data-|aria-)/
const SPECIAL: Record<string, string> = { class: 'className', for: 'htmlFor', 'xlink:href': 'xlinkHref', 'xml:space': 'xmlSpace', 'xml:lang': 'xmlLang', 'xmlns:xlink': 'xmlnsXlink', tabindex: 'tabIndex' }
export function attrToJsx(name: string) {
  if (SPECIAL[name]) return SPECIAL[name]
  if (KEEP.test(name)) return name
  return name.replace(/[:-]([a-z])/g, (_, c) => c.toUpperCase())
}
export function styleToObject(style: string) {
  const parts = style.split(';').map((s) => s.trim()).filter(Boolean)
  const entries = parts.map((p) => { const i = p.indexOf(':'); const k = p.slice(0, i).trim(); const v = p.slice(i + 1).trim(); return [k.startsWith('--') ? `'${k}'` : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v] })
  return `{{ ${entries.map(([k, v]) => `${k}: ${/^-?\d+(\.\d+)?$/.test(v) ? v : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')}'`}`).join(', ')} }}`
}

export function svgToJsx(svg: string, opts: { name: string; typescript: boolean; currentColor: boolean; spreadProps: boolean; removeDims: boolean; memo?: boolean }) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Not a valid SVG document')
  const lines: string[] = []
  const walk = (el: Element, depth: number) => {
    const pad = '  '.repeat(depth)
    const attrs: string[] = []
    for (const a of Array.from(el.attributes)) {
      let n = a.name, v = a.value
      if (el === root && (n === 'xmlns:xlink' || n === 'version' || n === 'xml:space')) continue
      if (el === root && opts.removeDims && (n === 'width' || n === 'height')) continue
      if (opts.currentColor && (n === 'fill' || n === 'stroke') && v !== 'none' && !v.startsWith('url(')) v = 'currentColor'
      if (n === 'style') { attrs.push(`style=${styleToObject(v)}`); continue }
      attrs.push(`${attrToJsx(n)}="${v.replace(/"/g, '&quot;')}"`)
    }
    if (el === root && opts.spreadProps) attrs.push('{...props}')
    const tag = el.nodeName
    const kids = Array.from(el.childNodes).filter((c) => c.nodeType === 1 || (c.nodeType === 3 && c.textContent!.trim()))
    const open = `${pad}<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}`
    if (!kids.length) { lines.push(open + ' />'); return }
    lines.push(open + '>')
    for (const k of kids) {
      if (k.nodeType === 3) lines.push(`${pad}  {${JSON.stringify(k.textContent!.trim())}}`)
      else if (k.nodeName === 'style') lines.push(`${pad}  <style>{\`${(k.textContent ?? '').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\`}</style>`)
      else walk(k as Element, depth + 1)
    }
    lines.push(`${pad}</${tag}>`)
  }
  walk(root, 2)
  const name = (opts.name || 'Icon').replace(/[^A-Za-z0-9_]/g, '').replace(/^[^A-Za-z]+/, '') || 'Icon'
  const comp = name[0].toUpperCase() + name.slice(1)
  const sig = opts.typescript ? `(props: SVGProps<SVGSVGElement>)` : `(props)`
  const head = opts.typescript ? `import type { SVGProps } from 'react'\n\n` : ''
  return `${head}export default function ${comp}${sig} {\n  return (\n${lines.join('\n')}\n  )\n}\n`
}

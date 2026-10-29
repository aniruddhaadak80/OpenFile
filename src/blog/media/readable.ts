// Turns the article into readable blocks and wraps every word in a span, so the read-aloud player can highlight,
// follow and start from any word. The block rule matches scripts/blog-media/extract.mjs (used to make the narration):
// h2, h3, p, li, blockquote outside .not-prose, figure, table and pre, not nested in another block, with text.

export interface ReadBlock { el: HTMLElement; tag: string; words: HTMLElement[][]; text: string }

const BLOCK = 'h1[data-read-title], h2, h3, p, li, blockquote'
const SKIP = '.not-prose, figure, table, pre, svg, button, script, style, [data-read-skip]'

export function collectBlocks(root: HTMLElement, title?: HTMLElement | null): ReadBlock[] {
  const els: HTMLElement[] = []
  if (title) els.push(title)
  root.querySelectorAll<HTMLElement>(BLOCK).forEach((el) => {
    if (el.closest(SKIP)) return
    const parent = el.parentElement?.closest(BLOCK)
    if (parent && root.contains(parent)) return
    if (!(el.textContent || '').trim()) return
    els.push(el)
  })
  return els.map(wrapBlock)
}

/** Wrap words in <span class="rw">. Fragments of one word split by inline tags (like <strong>.mid</strong>,) share an index. */
function wrapBlock(el: HTMLElement): ReadBlock {
  const words: HTMLElement[][] = []
  if (el.dataset.readWrapped) {
    el.querySelectorAll<HTMLElement>('span.rw').forEach((s) => { const i = +s.dataset.w!; (words[i] ||= []).push(s) })
    return { el, tag: el.tagName.toLowerCase(), words, text: norm(el.textContent || '') }
  }
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  let idx = -1
  let prevSpace = true
  for (const tn of nodes) {
    const s = tn.data
    if (!s) continue
    const frag = document.createDocumentFragment()
    const parts = s.split(/(\s+)/)
    for (const part of parts) {
      if (!part) continue
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); prevSpace = true; continue }
      if (prevSpace) idx++
      prevSpace = false
      const sp = document.createElement('span')
      sp.className = 'rw'
      sp.dataset.w = String(idx)
      sp.textContent = part
      frag.appendChild(sp)
      ;(words[idx] ||= []).push(sp)
    }
    tn.parentNode?.replaceChild(frag, tn)
  }
  el.dataset.readWrapped = '1'
  el.classList.add('rb')
  return { el, tag: el.tagName.toLowerCase(), words: words.filter(Boolean), text: norm(el.textContent || '') }
}

export const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Line up narration blocks (word counts) with DOM blocks. Returns, per narration block, the DOM block index or -1. */
export function alignBlocks(dom: ReadBlock[], counts: number[]): number[] {
  const map: number[] = new Array(counts.length).fill(-1)
  let d = 0
  for (let i = 0; i < counts.length && d < dom.length; i++) {
    if (dom[d].words.length === counts[i]) { map[i] = d++; continue }
    // look ahead a little on both sides for the next exact match
    let found = false
    for (let k = 1; k <= 3 && !found; k++) {
      if (dom[d + k] && dom[d + k].words.length === counts[i]) { d += k; map[i] = d++; found = true }
      else if (counts[i + k] !== undefined && counts[i + k] === dom[d].words.length) { i += k - 1; found = true }
    }
    if (!found) { if (Math.abs(dom[d].words.length - counts[i]) <= Math.max(2, counts[i] * 0.15)) map[i] = d; d++ }
  }
  return map
}

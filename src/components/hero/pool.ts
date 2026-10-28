// Data for the Home hero ring: the format chip pool, the hero palette, and a small seeded random source so
// every visit gets a different mix of chips, colours, drift paths and showcased tools.
import { CATEGORIES, TOOLS, toolBySlug, type Category, type ToolMeta } from '@/tools/registry'
import { toolFormats } from '@/lib/formats'

/** The only colours the hero uses for chips: gold, amber, teal, cyan, emerald, sky, orange, lime. */
export const HERO_PALETTE = ['#F5A524', '#FBBF24', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8', '#FB923C', '#A3E635'] as const

export interface FormatEntry {
  /** Label on the chip */
  f: string
  cat: Category
  /** Best tool for this format */
  slug: string
  /** Optional query string, e.g. ?to=webp */
  q?: string
  /** The chip can briefly "convert" into this format... */
  to?: string
  /** ...and then links to this tool */
  toSlug?: string
  toQ?: string
}

// Every slug here exists in src/tools/registry.ts or src/tools/batches/*.ts. Unknown slugs are filtered out
// at load time anyway, so a renamed tool can never produce a dead link.
const RAW_POOL: FormatEntry[] = [
  { f: 'PDF', cat: 'pdf', slug: 'compress-pdf', to: 'DOCX', toSlug: 'pdf-to-word' },
  { f: 'DOCX', cat: 'convert', slug: 'document-converter', to: 'PDF', toSlug: 'word-to-pdf' },
  { f: 'XLSX', cat: 'data', slug: 'csv-editor', to: 'PDF', toSlug: 'excel-to-pdf' },
  { f: 'PPTX', cat: 'convert', slug: 'office-viewer', to: 'PDF', toSlug: 'powerpoint-to-pdf' },
  { f: 'JPG', cat: 'image', slug: 'image-compressor', to: 'WEBP', toSlug: 'image-converter', toQ: '?to=webp' },
  { f: 'PNG', cat: 'image', slug: 'image-converter', q: '?to=png', to: 'SVG', toSlug: 'image-to-svg' },
  { f: 'WEBP', cat: 'image', slug: 'image-converter', q: '?to=webp', to: 'JPG', toSlug: 'image-converter', toQ: '?to=jpg' },
  { f: 'AVIF', cat: 'image', slug: 'image-converter', q: '?to=avif', to: 'PNG', toSlug: 'image-converter', toQ: '?to=png' },
  { f: 'HEIC', cat: 'convert', slug: 'heic-converter', to: 'JPG', toSlug: 'heic-converter' },
  { f: 'PSD', cat: 'image', slug: 'psd-viewer', to: 'PNG', toSlug: 'psd-viewer' },
  { f: 'TIFF', cat: 'ai', slug: 'photo-enhancer', to: 'JPG', toSlug: 'pro-image-converter' },
  { f: 'DNG', cat: 'image', slug: 'raw-converter', to: 'JPG', toSlug: 'raw-converter' },
  { f: 'SVG', cat: 'design', slug: 'svg-optimizer', to: 'PNG', toSlug: 'svg-converter' },
  { f: 'ICO', cat: 'design', slug: 'icon-converter', to: 'PNG', toSlug: 'icon-converter' },
  { f: 'GIF', cat: 'image', slug: 'gif-editor', to: 'MP4', toSlug: 'animated-converter' },
  { f: 'MP4', cat: 'video', slug: 'video-compressor', to: 'GIF', toSlug: 'video-to-gif' },
  { f: 'MOV', cat: 'video', slug: 'video-converter', to: 'MP4', toSlug: 'video-converter' },
  { f: 'WEBM', cat: 'video', slug: 'video-converter', to: 'MP4', toSlug: 'video-converter' },
  { f: 'MP3', cat: 'audio', slug: 'audio-editor', to: 'WAV', toSlug: 'audio-converter' },
  { f: 'WAV', cat: 'audio', slug: 'audio-converter', to: 'MP3', toSlug: 'audio-converter' },
  { f: 'FLAC', cat: 'audio', slug: 'audio-converter', to: 'MP3', toSlug: 'audio-converter' },
  { f: 'OPUS', cat: 'audio', slug: 'audio-converter', to: 'WAV', toSlug: 'audio-converter' },
  { f: 'MIDI', cat: 'audio', slug: 'midi-player', to: 'MP3', toSlug: 'midi-player' },
  { f: 'ZIP', cat: 'archive', slug: 'archive-extractor', to: '7Z', toSlug: 'archive-converter' },
  { f: '7Z', cat: 'archive', slug: 'archive-extractor', to: 'ZIP', toSlug: 'archive-converter' },
  { f: 'RAR', cat: 'archive', slug: 'archive-extractor', to: 'ZIP', toSlug: 'archive-converter' },
  { f: 'EPUB', cat: 'ebook', slug: 'ebook-converter', to: 'PDF', toSlug: 'epub-to-pdf' },
  { f: 'MOBI', cat: 'ebook', slug: 'ebook-converter', to: 'EPUB', toSlug: 'ebook-converter' },
  { f: 'CBZ', cat: 'ebook', slug: 'comic-converter', to: 'PDF', toSlug: 'comic-converter' },
  { f: 'TTF', cat: 'font', slug: 'font-converter', to: 'WOFF2', toSlug: 'font-converter' },
  { f: 'WOFF2', cat: 'font', slug: 'font-viewer', to: 'TTF', toSlug: 'font-converter' },
  { f: 'GLB', cat: '3d', slug: '3d-viewer', to: 'STL', toSlug: '3d-converter' },
  { f: 'STL', cat: '3d', slug: 'stl-inspector', to: 'GLB', toSlug: '3d-converter' },
  { f: 'OBJ', cat: '3d', slug: '3d-viewer', to: 'GLB', toSlug: '3d-converter' },
  { f: 'DXF', cat: 'cad', slug: 'dxf-viewer', to: 'PDF', toSlug: 'cad-converter' },
  { f: 'SRT', cat: 'subtitle', slug: 'subtitle-editor', to: 'VTT', toSlug: 'subtitle-converter' },
  { f: 'VTT', cat: 'subtitle', slug: 'subtitle-converter', to: 'SRT', toSlug: 'subtitle-converter' },
  { f: 'CSV', cat: 'data', slug: 'csv-editor', to: 'JSON', toSlug: 'data-converter' },
  { f: 'JSON', cat: 'dev', slug: 'json-formatter', to: 'YAML', toSlug: 'yaml-json' },
  { f: 'SQLITE', cat: 'data', slug: 'sqlite-viewer', to: 'CSV', toSlug: 'sqlite-viewer' },
  { f: 'PARQUET', cat: 'data', slug: 'parquet-viewer', to: 'CSV', toSlug: 'parquet-viewer' },
  { f: 'GPX', cat: 'data', slug: 'geo-converter', to: 'KML', toSlug: 'geo-converter' },
  { f: 'MD', cat: 'text', slug: 'markdown-editor', to: 'DOCX', toSlug: 'markdown-to-docx' },
  { f: 'TXT', cat: 'ai', slug: 'pdf-summarizer', to: 'MP3', toSlug: 'pdf-to-speech' },
]

export const FORMAT_POOL: FormatEntry[] = RAW_POOL.filter((e) => toolBySlug(e.slug) && (!e.toSlug || toolBySlug(e.toSlug)))

/** Tools the core showcase can cycle through: well-known tools with good preview videos. */
const SHOWCASE_SLUGS = [
  'merge-pdf', 'compress-pdf', 'sign-pdf', 'edit-pdf', 'pdf-to-word', 'background-remover', 'image-compressor', 'image-converter',
  'video-to-gif', 'video-trimmer', 'audio-editor', 'audio-converter', 'gif-editor', '3d-viewer', 'archive-extractor', 'subtitle-editor',
  'ebook-converter', 'font-converter', 'csv-editor', 'qr-generator', 'json-formatter', 'heic-converter', 'dxf-viewer', 'photo-enhancer',
  'video-compressor', 'scan-to-pdf', 'ocr-pdf', 'color-palette',
].filter((s) => toolBySlug(s))

/* ---------------- seeded random ---------------- */
export function makeSeed(): number {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] || 1 } catch { return (Date.now() ^ (Math.random() * 1e9)) >>> 0 }
}
export function mulberry32(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export type Rng = () => number
export const between = (r: Rng, a: number, b: number) => a + r() * (b - a)
export function shuffle<T>(r: Rng, arr: readonly T[]): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

export interface HeroChip extends FormatEntry { color: string; drift: number; driftDur: number; driftDelay: number }

export interface HeroVisit {
  outer: HeroChip[]
  inner: HeroChip[]
  flyers: HeroChip[]
  showcase: string[]
  orbitOuter: number
  orbitInner: number
  phase: number
  catOffset: number
  comet: { dur: number; delay: number; start: number }
  stream: { a: number; r: number; d: number; delay: number; s: number; teal: boolean }[]
}

/** Everything that varies per visit, from one seed. Chips are spread over as many categories as possible. */
export function planVisit(seed: number, nOuter = 5, nInner = 4): HeroVisit {
  const r = mulberry32(seed)
  // one familiar format always makes it onto the ring, the rest come from every category in turn
  const headline = shuffle(r, FORMAT_POOL.filter((e) => ['PDF', 'JPG', 'PNG', 'MP4', 'MP3', 'GIF'].includes(e.f)))[0]
  const byCat = new Map<Category, FormatEntry[]>()
  for (const e of shuffle(r, FORMAT_POOL)) if (e !== headline) byCat.set(e.cat, [...(byCat.get(e.cat) ?? []), e])
  const picked: FormatEntry[] = headline ? [headline] : []
  const cats = shuffle(r, [...byCat.keys()])
  // round-robin over shuffled categories so one visit never shows four image formats
  for (let round = 0; picked.length < nOuter + nInner + 6 && round < 4; round++) for (const c of cats) { const e = byCat.get(c)?.[round]; if (e && picked.length < nOuter + nInner + 6) picked.push(e) }
  const colors = shuffle(r, HERO_PALETTE)
  const chip = (e: FormatEntry, i: number): HeroChip => ({ ...e, color: colors[i % colors.length], drift: Math.floor(r() * 4), driftDur: between(r, 5.5, 11), driftDelay: -between(r, 0, 9) })
  const chips = picked.map(chip)
  return {
    outer: chips.slice(0, nOuter),
    inner: chips.slice(nOuter, nOuter + nInner),
    flyers: chips.slice(nOuter + nInner),
    showcase: shuffle(r, SHOWCASE_SLUGS).slice(0, 6),
    orbitOuter: between(r, 40, 56),
    orbitInner: between(r, 28, 40),
    phase: r() * Math.PI * 2,
    catOffset: Math.floor(r() * CATEGORIES.length),
    comet: { dur: between(r, 9, 15), delay: between(r, 1.5, 5), start: Math.floor(r() * 360) },
    stream: Array.from({ length: 22 }, (_, i) => ({ a: (i / 22) * 360 + r() * 14, r: 34 + r() * 14, d: 2.4 + r() * 2.8, delay: -r() * 4.5, s: 1.6 + r() * 2.6, teal: r() < 0.34 })),
  }
}

/* ---------------- hover card info ---------------- */
export interface HoverInfo {
  key: string
  title: string
  desc: string
  ins: string[]
  outs: string[]
  /** Slug whose preview poster and video to show */
  media?: string
  href: string
  color: string
  extra?: string
  /** Half the item's height in px, so the card clears it */
  h?: number
  /** Position of the item centre, in % of the ring box */
  x: number
  y: number
}

const top = (a: string[], n = 4) => (a.length > n ? [...a.slice(0, n), `+${a.length - n}`] : a)

export function toolInfo(t: ToolMeta) {
  const f = toolFormats(t)
  return { title: t.name, desc: t.desc, ins: top(f.inputs), outs: top(f.outputs) }
}

export function chipInfo(c: HeroChip, flipped: boolean): Omit<HoverInfo, 'x' | 'y' | 'key'> {
  const slug = flipped && c.toSlug ? c.toSlug : c.slug
  const t = toolBySlug(slug)!
  const info = toolInfo(t)
  const href = '/' + slug + ((flipped ? c.toQ : c.q) ?? '')
  if (flipped && c.to) return { ...info, ins: [c.f], outs: [c.to], media: slug, href, color: c.color, extra: `${c.f} to ${c.to}` }
  return { ...info, ins: info.ins.length ? info.ins : [c.f], media: slug, href, color: c.color }
}

export function categoryInfo(id: Category): Omit<HoverInfo, 'x' | 'y' | 'key'> {
  const c = CATEGORIES.find((x) => x.id === id)!
  const list = TOOLS.filter((t) => t.category === id)
  const lead = list.find((t) => t.popular) ?? list[0]
  const fmts = [...new Set(list.flatMap((t) => toolFormats(t).inputs))].filter((x) => x.length <= 6)
  return { title: c.name, desc: c.blurb, ins: top(fmts, 5), outs: [], media: lead?.slug, href: `/category/${id}`, color: c.color, extra: `${list.length} ${list.length === 1 ? 'tool' : 'tools'}` }
}

const base = import.meta.env.BASE_URL
export const posterUrl = (slug: string) => `${base}media/tools/${slug}.jpg`
export const videoUrl = (slug: string) => `${base}media/tools/${slug}.mp4`

/** Skip autoplaying previews on data saver or very slow connections. */
export function lightData(): boolean {
  const c = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !!c && (!!c.saveData || /(^|-)2g$/.test(c.effectiveType ?? ''))
}

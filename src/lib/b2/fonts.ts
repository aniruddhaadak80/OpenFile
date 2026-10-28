/* Font helpers built on fonteditor-core (MIT). Shared by font-converter and font-subsetter. */
import woff2Wasm from '../../../node_modules/fonteditor-core/woff2/woff2.wasm?url'

export type FontKind = 'ttf' | 'otf' | 'woff' | 'woff2' | 'eot' | 'svg'

export function sniffFont(u8: Uint8Array, name = ''): FontKind | null {
  const tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3])
  if (tag === 'wOFF') return 'woff'
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'OTTO') return 'otf'
  if ((u8[0] === 0 && u8[1] === 1 && u8[2] === 0 && u8[3] === 0) || tag === 'true') return 'ttf'
  if (u8.length > 36 && u8[34] === 0x4c && u8[35] === 0x50) return 'eot'
  const head = new TextDecoder().decode(u8.slice(0, 400)).trim()
  if (head.startsWith('<') && /<svg|<font/i.test(head)) return 'svg'
  const ext = name.toLowerCase().split('.').pop() as FontKind
  return ['ttf', 'otf', 'woff', 'woff2', 'eot', 'svg'].includes(ext) ? ext : null
}

let core: Promise<any> | null = null
export function loadFontCore() {
  if (!core) {
    core = (async () => {
      const m: any = await import('fonteditor-core')
      const lib = m.Font ? m : m.default
      if (!lib.woff2.isInited()) await lib.woff2.init(woff2Wasm)
      return lib
    })()
    core.catch(() => { core = null })
  }
  return core
}

/** EOT wraps a plain TTF; strip the header so every reader path can handle it. */
function eotToTtf(u8: Uint8Array): Uint8Array {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const fontDataSize = v.getUint32(4, true), flags = v.getUint32(12, true)
  if (flags & 0x4) throw new Error('This EOT file is compressed (MicroType Express), which is not supported.')
  if (flags & 0x10000000) throw new Error('This EOT file is XOR-encrypted, which is not supported.')
  return u8.slice(u8.length - fontDataSize)
}

export async function readFont(buf: ArrayBuffer, name: string, opts: { subset?: number[]; hinting?: boolean; kerning?: boolean } = {}) {
  const lib = await loadFontCore()
  const { unzlibSync } = await import('fflate')
  let u8 = new Uint8Array(buf)
  let kind = sniffFont(u8, name)
  if (!kind) throw new Error('This file does not look like a TTF, OTF, WOFF, WOFF2, EOT or SVG font.')
  const original = kind
  if (kind === 'eot') { u8 = eotToTtf(u8) as Uint8Array<ArrayBuffer>; kind = 'ttf' }
  const input = kind === 'svg' ? new TextDecoder().decode(u8) : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
  const font = lib.Font.create(input, {
    type: kind, subset: opts.subset, hinting: opts.hinting ?? true, kerning: opts.kerning ?? true, compound2simple: false,
    inflate: (d: number[]) => Array.from(unzlibSync(Uint8Array.from(d))),
  })
  return { font, kind: original as FontKind }
}

export async function writeFont(font: any, type: Exclude<FontKind, 'otf'>, opts: { hinting?: boolean; kerning?: boolean } = {}): Promise<Uint8Array | string> {
  const { zlibSync } = await import('fflate')
  const out = font.write({ type, toBuffer: false, hinting: opts.hinting ?? true, kerning: opts.kerning ?? true, deflate: (d: number[]) => Array.from(zlibSync(Uint8Array.from(d), { level: 9 })) })
  return typeof out === 'string' ? out : new Uint8Array(out)
}

export const FONT_MIME: Record<string, string> = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', eot: 'application/vnd.ms-fontobject', svg: 'image/svg+xml' }
export const CSS_FORMAT: Record<string, string> = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2', eot: 'embedded-opentype', svg: 'svg' }

/** Read family/style names from the font's name table. */
export function fontNames(font: any): { family: string; style: string; full: string; version: string; weight: number; italic: boolean } {
  const d = font.get()
  const n = d.name || {}
  const os2 = d['OS/2'] || {}
  return { family: n.fontFamily || n.preferredFamily || 'Custom Font', style: n.fontSubFamily || 'Regular', full: n.fullName || '', version: n.version || '', weight: os2.usWeightClass || 400, italic: !!((os2.fsSelection ?? 0) & 1) }
}

export function fontFaceCss(family: string, files: { type: string; name: string }[], weight = 400, italic = false) {
  const order = ['eot', 'woff2', 'woff', 'ttf', 'otf', 'svg']
  const sorted = [...files].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  const eot = sorted.find((f) => f.type === 'eot')
  const src = sorted.map((f) => f.type === 'eot' ? `url('${f.name}?#iefix') format('embedded-opentype')` : f.type === 'svg' ? `url('${f.name}#${family.replace(/\s+/g, '')}') format('svg')` : `url('${f.name}') format('${CSS_FORMAT[f.type]}')`)
  return `@font-face {\n  font-family: '${family}';\n${eot ? `  src: url('${eot.name}');\n` : ''}  src: ${src.join(',\n       ')};\n  font-weight: ${weight};\n  font-style: ${italic ? 'italic' : 'normal'};\n  font-display: swap;\n}\n`
}

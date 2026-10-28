/* Convert frames to monochrome byte arrays for microcontroller displays (pure, Node-tested).
 * Horizontal mode matches Adafruit GFX drawBitmap (MSB first, rows padded to bytes).
 * Vertical mode matches SSD1306 page layout and U8g2 drawXBM uses horizontal LSB first (XBM). */

export type BitOrder = 'gfx' | 'xbm' | 'ssd1306'

/** RGBA -> 1 bit per pixel, using luminance and an optional ordered dither. */
export function toMono(rgba: Uint8ClampedArray, w: number, h: number, threshold = 128, invert = false, dither = false): Uint8Array {
  const out = new Uint8Array(w * h)
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const a = rgba[i + 3] / 255
    const lum = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a // transparent counts as black
    const t = dither ? threshold + (bayer[(y & 3) * 4 + (x & 3)] - 7.5) * 16 : threshold
    let on = lum >= t
    if (invert) on = !on
    out[y * w + x] = on ? 1 : 0
  }
  return out
}

export function packBits(bits: Uint8Array, w: number, h: number, order: BitOrder): Uint8Array {
  if (order === 'ssd1306') {
    const pages = Math.ceil(h / 8)
    const out = new Uint8Array(w * pages)
    for (let p = 0; p < pages; p++) for (let x = 0; x < w; x++) {
      let b = 0
      for (let k = 0; k < 8; k++) { const y = p * 8 + k; if (y < h && bits[y * w + x]) b |= 1 << k }
      out[p * w + x] = b
    }
    return out
  }
  const rowBytes = Math.ceil(w / 8)
  const out = new Uint8Array(rowBytes * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bits[y * w + x]) continue
    const bit = order === 'gfx' ? 7 - (x & 7) : x & 7
    out[y * rowBytes + (x >> 3)] |= 1 << bit
  }
  return out
}

export function cIdent(s: string) { const id = s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1'); return id || 'bitmap' }

export function toCArray(frames: Uint8Array[], w: number, h: number, name: string, order: BitOrder, delays: number[], progmem = true): string {
  const id = cIdent(name)
  const pm = progmem ? ' PROGMEM' : ''
  const lines: string[] = [`// ${w}x${h}, ${frames.length} frame${frames.length === 1 ? '' : 's'}, ${order === 'gfx' ? 'horizontal, MSB first (Adafruit GFX drawBitmap)' : order === 'xbm' ? 'horizontal, LSB first (XBM, U8g2 drawXBM)' : 'vertical pages (SSD1306 buffer)'}`, `#define ${id.toUpperCase()}_WIDTH ${w}`, `#define ${id.toUpperCase()}_HEIGHT ${h}`, `#define ${id.toUpperCase()}_FRAMES ${frames.length}`, '']
  frames.forEach((f, i) => {
    lines.push(`const unsigned char ${id}_${i}[]${pm} = {`)
    for (let k = 0; k < f.length; k += 16) lines.push('  ' + Array.from(f.subarray(k, k + 16)).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(', ') + (k + 16 < f.length ? ',' : ''))
    lines.push('};')
  })
  lines.push('', `const unsigned char* const ${id}_frames[${frames.length}]${pm} = { ${frames.map((_, i) => `${id}_${i}`).join(', ')} };`)
  lines.push(`const unsigned int ${id}_delays[${frames.length}]${pm} = { ${delays.map((d) => Math.round(d)).join(', ')} };`)
  return lines.join('\n')
}

export function arduinoSketch(id: string, order: BitOrder) {
  const ID = cIdent(id), U = ID.toUpperCase()
  if (order === 'xbm') return `// U8g2 example\n#include <U8g2lib.h>\nU8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0);\n// paste the arrays here\nvoid setup() { u8g2.begin(); }\nvoid loop() {\n  for (int i = 0; i < ${U}_FRAMES; i++) {\n    u8g2.clearBuffer();\n    u8g2.drawXBMP(0, 0, ${U}_WIDTH, ${U}_HEIGHT, (const uint8_t*)pgm_read_ptr(&${ID}_frames[i]));\n    u8g2.sendBuffer();\n    delay(pgm_read_word(&${ID}_delays[i]));\n  }\n}`
  return `// Adafruit SSD1306 example\n#include <Adafruit_SSD1306.h>\nAdafruit_SSD1306 display(128, 64, &Wire, -1);\n// paste the arrays here\nvoid setup() { display.begin(SSD1306_SWITCHCAPVCC, 0x3C); }\nvoid loop() {\n  for (int i = 0; i < ${U}_FRAMES; i++) {\n    display.clearDisplay();\n    display.drawBitmap(0, 0, (const uint8_t*)pgm_read_ptr(&${ID}_frames[i]), ${U}_WIDTH, ${U}_HEIGHT, SSD1306_WHITE);\n    display.display();\n    delay(pgm_read_word(&${ID}_delays[i]));\n  }\n}`
}

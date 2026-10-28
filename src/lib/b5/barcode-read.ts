/* Barcode reading on top of zxing-wasm (MIT). Pure helpers that take the loaded module, so Node tests can drive them. */
export interface ScanHit { text: string; format: string; label: string; symbology: string; points: { x: number; y: number }[]; bytesHex?: string; ecLevel?: string; contentType?: string }

export const FORMAT_GROUPS: { id: string; label: string; formats: string[] }[] = [
  { id: 'all', label: 'All types', formats: [] },
  { id: 'qr', label: 'QR (incl. Micro, rMQR)', formats: ['QRCode'] },
  { id: 'retail', label: 'EAN / UPC / ISBN', formats: ['EANUPC'] },
  { id: 'code128', label: 'Code 128', formats: ['Code128'] },
  { id: 'code39', label: 'Code 39 / 93', formats: ['Code39', 'Code93'] },
  { id: 'datamatrix', label: 'Data Matrix', formats: ['DataMatrix'] },
  { id: 'pdf417', label: 'PDF417', formats: ['PDF417'] },
  { id: 'aztec', label: 'Aztec', formats: ['Aztec'] },
  { id: 'itf', label: 'ITF / ITF-14', formats: ['ITF'] },
  { id: 'codabar', label: 'Codabar', formats: ['Codabar'] },
  { id: 'databar', label: 'GS1 DataBar', formats: ['DataBar'] },
  { id: 'maxicode', label: 'MaxiCode', formats: ['MaxiCode'] },
]
export function formatsFor(groups: string[]): string[] {
  if (!groups.length || groups.includes('all')) return []
  return FORMAT_GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.formats)
}

const LABELS: Record<string, string> = { QRCode: 'QR Code', MicroQRCode: 'Micro QR', RMQRCode: 'rMQR', EAN13: 'EAN-13', EAN8: 'EAN-8', UPCA: 'UPC-A', UPCE: 'UPC-E', ISBN: 'ISBN', Code128: 'Code 128', Code39: 'Code 39', Code39Ext: 'Code 39 Ext', Code93: 'Code 93', DataMatrix: 'Data Matrix', PDF417: 'PDF417', MicroPDF417: 'MicroPDF417', CompactPDF417: 'Compact PDF417', Aztec: 'Aztec', AztecCode: 'Aztec', AztecRune: 'Aztec Rune', ITF: 'ITF', ITF14: 'ITF-14', Codabar: 'Codabar', MaxiCode: 'MaxiCode', DataBar: 'DataBar', DataBarExp: 'DataBar Expanded', DataBarLtd: 'DataBar Limited' }
export const formatLabel = (f: string) => LABELS[f] ?? f.replace(/([a-z])([A-Z0-9])/g, '$1 $2')

export interface ScanOpts { formats?: string[]; thorough?: boolean; max?: number }
type ReaderMod = { readBarcodes: (input: any, opts?: any) => Promise<any[]> }

export async function scan(mod: ReaderMod, input: ImageData | Blob | Uint8Array, o: ScanOpts = {}): Promise<ScanHit[]> {
  const res = await mod.readBarcodes(input, {
    formats: o.formats ?? [],
    tryHarder: !!o.thorough,
    tryRotate: !!o.thorough,
    tryInvert: true,
    tryDownscale: true,
    maxNumberOfSymbols: o.max ?? (o.thorough ? 32 : 4),
  })
  const seen = new Set<string>()
  const out: ScanHit[] = []
  for (const r of res) {
    if (!r.isValid && !r.text) continue
    const key = r.format + '|' + r.text
    if (seen.has(key)) continue
    seen.add(key)
    const p = r.position
    const bytes: Uint8Array | undefined = r.bytes
    out.push({
      text: r.text,
      format: r.format,
      label: formatLabel(r.format),
      symbology: r.symbology,
      points: p ? [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map((q: any) => ({ x: q.x, y: q.y })) : [],
      bytesHex: bytes && bytes.length && bytes.length <= 4096 ? Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ') : undefined,
      ecLevel: r.ecLevel || undefined,
      contentType: typeof r.contentType === 'string' ? r.contentType : undefined,
    })
  }
  return out
}

/** EAN/UPC check digit validity, handy to show for retail codes. */
export function gtinValid(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false
  const d = code.split('').map(Number)
  const check = d.pop()!
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

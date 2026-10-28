import { useEffect, useMemo, useRef, useState } from 'react'
import { Dropzone, Label, ToolGrid } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { TopBar, StatusLine } from '@/lib/b4/ui'
import { entropy, entropyBlocks, entropyVerdict } from '@/lib/bcat/privacy'
import { DlButton, Bars } from '@/lib/bcat/kit'
import { Stat } from '@/tools/dev/_b5/shell'

const LIMIT = 256 << 20
const hue = (h: number) => (h > 7.6 ? '#F97316' : h > 6.5 ? '#F5A524' : h > 4.5 ? '#22D3EE' : '#10B981')

export default function EntropyAnalyzer() {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const cv = useRef<HTMLCanvasElement>(null)

  useEffect(() => { if (file) file.slice(0, LIMIT).arrayBuffer().then((b) => setBytes(new Uint8Array(b))) }, [file])
  const blocks = useMemo(() => (bytes ? entropyBlocks(bytes, 400) : []), [bytes])
  const total = useMemo(() => (bytes ? entropy(bytes) : 0), [bytes])
  const freq = useMemo(() => { if (!bytes) return null; const f = new Uint32Array(256); for (const b of bytes) f[b]++; return f }, [bytes])
  const kinds = useMemo(() => {
    if (!bytes) return []
    let zero = 0, ascii = 0, high = 0
    for (const b of bytes) { if (b === 0) zero++; else if ((b >= 32 && b < 127) || b === 9 || b === 10 || b === 13) ascii++; else if (b >= 128) high++ }
    const n = bytes.length || 1
    return [{ label: 'Printable text', value: +(ascii / n * 100).toFixed(1) }, { label: 'Zero bytes', value: +(zero / n * 100).toFixed(1) }, { label: 'High bytes (128+)', value: +(high / n * 100).toFixed(1) }, { label: 'Other control', value: +((n - zero - ascii - high) / n * 100).toFixed(1) }]
  }, [bytes])

  useEffect(() => {
    const c = cv.current; if (!c || !blocks.length) return
    const W = c.clientWidth || 800, H = 220, dpr = window.devicePixelRatio || 1
    c.width = W * dpr; c.height = H * dpr
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, H)
    const bw = W / blocks.length
    ctx.strokeStyle = 'rgba(128,128,128,.25)'; ctx.setLineDash([3, 4])
    for (const y of [2, 4, 6, 8]) { const py = H - (y / 8) * (H - 10); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke() }
    ctx.setLineDash([])
    blocks.forEach((b, i) => { const h = (b.h / 8) * (H - 10); ctx.fillStyle = hue(b.h); ctx.globalAlpha = hover === i ? 1 : 0.85; ctx.fillRect(i * bw, H - h, Math.max(1, bw - 0.5), h) })
    ctx.globalAlpha = 1
  }, [blocks, hover])

  if (!file) return <Dropzone onFiles={(f) => setFile(f[0])} label="Drop any file to map its entropy" sub="Spot encrypted, compressed or hidden regions. Large files: the first 256 MB are read." />
  if (!bytes) return <StatusLine text="Reading the file" />
  const hb = hover != null ? blocks[hover] : null
  const high = blocks.filter((b) => b.h > 7.6).length / Math.max(1, blocks.length)
  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <TopBar file={file} onReset={() => { setFile(null); setBytes(null) }} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Entropy" value={total.toFixed(3)} sub="bits per byte, max 8" /><Stat label="Verdict" value={<span className="text-sm">{entropyVerdict(total)}</span>} /><Stat label="High entropy area" value={`${Math.round(high * 100)}%`} /><Stat label="Read" value={formatBytes(bytes.length)} /></div>
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-2 flex text-xs text-muted"><span>Entropy across the file (start to end)</span><span className="ml-auto font-mono">{hb ? `offset 0x${hb.offset.toString(16)} · ${hb.h.toFixed(2)} · ${entropyVerdict(hb.h)}` : 'Hover the chart'}</span></div>
            <canvas ref={cv} className="h-[220px] w-full" aria-label="Entropy chart" onMouseLeave={() => setHover(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.min(blocks.length - 1, Math.floor(((e.clientX - r.left) / r.width) * blocks.length))) }} />
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">{[['#10B981', 'Text, under 4.5'], ['#22D3EE', 'Binary 4.5 to 6.5'], ['#F5A524', 'Packed 6.5 to 7.6'], ['#F97316', 'Encrypted or compressed, 7.6+']].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>)}</div>
          </div>
          {freq && (
            <div className="rounded-2xl border border-border bg-surface p-3"><Label>Byte histogram (0 to 255)</Label>
              <div className="flex h-24 items-end gap-px" aria-hidden>{Array.from(freq).map((v, i) => { const m = Math.max(...freq); return <span key={i} className="flex-1 rounded-t-sm bg-accent/80" style={{ height: `${Math.max(1, (Math.log1p(v) / Math.log1p(m)) * 100)}%` }} /> })}</div>
            </div>
          )}
        </div>
      }
      side={
        <>
          <Label>Byte types</Label>
          <Bars items={kinds} max={100} unit="%" />
          <DlButton className="w-full" name={file.name + '-entropy.csv'} mime="text/csv" data={() => 'offset,size,entropy\r\n' + blocks.map((b) => `${b.offset},${b.size},${b.h.toFixed(4)}`).join('\r\n')}>Download block data (CSV)</DlButton>
          <p className="text-xs text-muted">Entropy measures how random the bytes look. Text sits around 4 to 5, ZIP, JPEG and encrypted data sit near 8. A flat high band inside an otherwise normal file can mean hidden or packed data.</p>
        </>
      }
    />
  )
}

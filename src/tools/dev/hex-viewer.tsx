import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, Download } from 'lucide-react'
import { Button, Dropzone, Input, Segmented, Switch, Badge, Spinner, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, formatBytes } from '@/lib/files'
import { Bar, KV, Status } from './_b5/shell'
import { extractStrings, findAll, patternBytes } from '@/lib/b5/bytes'

const ROW_H = 22
const MAX = 512 * 1024 * 1024

export default function HexViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [width, setWidth] = useState<'8' | '16' | '32'>('16')
  const [tab, setTab] = useState<'hex' | 'strings'>('hex')
  const [sel, setSel] = useState(0)
  const [scroll, setScroll] = useState(0)
  const [q, setQ] = useState(''); const [qMode, setQMode] = useState<'text' | 'hex'>('text')
  const [hits, setHits] = useState<number[]>([]); const [hitI, setHitI] = useState(0)
  const [jump, setJump] = useState('')
  const [le, setLe] = useState(true)
  const [minLen, setMinLen] = useState(5); const [sq, setSq] = useState('')
  const [loading, setLoading] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const W = Number(width)

  const open = async (fs: File[]) => {
    const f = fs[0]
    if (f.size > MAX) return toast('Files up to 512 MB can be opened here.', 'error')
    setLoading(true); setFile(f); setBytes(new Uint8Array(await f.arrayBuffer())); setSel(0); setHits([]); setLoading(false)
  }

  const rows = bytes ? Math.ceil(bytes.length / W) : 0
  const viewH = 560
  const first = Math.max(0, Math.floor(scroll / ROW_H) - 4)
  const last = Math.min(rows, first + Math.ceil(viewH / ROW_H) + 8)
  const pat = useMemo(() => patternBytes(q, qMode), [q, qMode])
  const hitSet = useMemo(() => { const s = new Set<number>(); if (pat) for (const h of hits) for (let k = 0; k < pat.length; k++) s.add(h + k); return s }, [hits, pat])

  const goTo = (off: number) => { if (!bytes) return; const o = Math.max(0, Math.min(bytes.length - 1, off)); setSel(o); const top = Math.floor(o / W) * ROW_H; box.current?.scrollTo({ top: Math.max(0, top - viewH / 3) }) }
  const search = () => { if (!bytes || !pat) return setHits([]); const h = findAll(bytes, pat); setHits(h); setHitI(0); if (h.length) goTo(h[0]); else toast('No matches', 'info') }
  const step = (d: number) => { if (!hits.length) return; const i = (hitI + d + hits.length) % hits.length; setHitI(i); goTo(hits[i]) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!bytes || tab !== 'hex' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      const m: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: W, ArrowUp: -W, PageDown: W * 20, PageUp: -W * 20 }
      if (m[e.key] !== undefined) { e.preventDefault(); goTo(sel + m[e.key]) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [bytes, sel, W, tab])

  const insp = useMemo(() => {
    if (!bytes) return null
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const o = sel; const avail = bytes.length - o
    const g = <T,>(n: number, f: () => T) => (avail >= n ? String(f()) : '')
    return [
      ['Offset', `${o} (0x${o.toString(16).toUpperCase()})`], ['Binary', bytes[o].toString(2).padStart(8, '0')],
      ['Int8', g(1, () => dv.getInt8(o))], ['UInt8', g(1, () => dv.getUint8(o))],
      ['Int16', g(2, () => dv.getInt16(o, le))], ['UInt16', g(2, () => dv.getUint16(o, le))],
      ['Int32', g(4, () => dv.getInt32(o, le))], ['UInt32', g(4, () => dv.getUint32(o, le))],
      ['Int64', g(8, () => dv.getBigInt64(o, le))], ['UInt64', g(8, () => dv.getBigUint64(o, le))],
      ['Float32', g(4, () => dv.getFloat32(o, le))], ['Float64', g(8, () => dv.getFloat64(o, le))],
      ['ASCII', bytes[o] >= 32 && bytes[o] < 127 ? String.fromCharCode(bytes[o]) : '.'],
      ['UTF-8 from here', (() => { try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(o, o + 16)).replace(/[\x00-\x1f]/g, '.') } catch { return '' } })()],
    ]
  }, [bytes, sel, le])

  const strings = useMemo(() => (bytes && tab === 'strings' ? extractStrings(bytes, minLen) : []), [bytes, tab, minLen])
  const shownStrings = sq ? strings.filter((s) => s.text.toLowerCase().includes(sq.toLowerCase())) : strings

  if (!bytes) return (<div className="space-y-3"><Dropzone onFiles={open} label="Drop any file to view its bytes" sub="Hex and ASCII side by side, byte search, a data inspector and string extraction. Up to 512 MB." />{loading && <Spinner label="Reading file…" />}</div>)

  return (
    <div className="space-y-4">
      <Bar>
        <span className="truncate font-medium">{file?.name}</span><Badge>{formatBytes(bytes.length)}</Badge>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'hex', label: 'Hex view' }, { value: 'strings', label: 'Strings' }]} />
        {tab === 'hex' && <Segmented value={width} onChange={setWidth} options={['8', '16', '32'].map((w) => ({ value: w as '8', label: `${w} / row` }))} />}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setBytes(null); setFile(null) }}>Open another</Button>
      </Bar>

      {tab === 'hex' ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder={qMode === 'hex' ? 'de ad be ef' : 'Find text'} className="w-56 pl-8 font-mono" aria-label="Search bytes" /></div>
              <Segmented value={qMode} onChange={setQMode} options={[{ value: 'text', label: 'Text' }, { value: 'hex', label: 'Hex' }]} />
              <Button size="sm" onClick={search} disabled={!pat}>Find</Button>
              {hits.length > 0 && <><span className="font-mono text-xs text-muted">{hitI + 1} of {hits.length}{hits.length >= 10000 ? '+' : ''}</span><Button size="sm" variant="ghost" icon={<ChevronUp className="size-4" />} onClick={() => step(-1)} aria-label="Previous match" /><Button size="sm" variant="ghost" icon={<ChevronDown className="size-4" />} onClick={() => step(1)} aria-label="Next match" /></>}
              <Input value={jump} onChange={(e) => setJump(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const v = jump.trim(); const n = /^0x/i.test(v) ? parseInt(v, 16) : parseInt(v, 10); if (!isNaN(n)) goTo(n) } }} placeholder="Go to offset (0x1F0)" className="ml-auto w-44 font-mono" aria-label="Go to offset" />
            </div>
            <div ref={box} className="scrollbar-thin overflow-auto rounded-xl border border-border bg-surface font-mono text-[12px]" style={{ height: viewH }} onScroll={(e) => setScroll(e.currentTarget.scrollTop)} tabIndex={0} aria-label="Hex view. Use arrow keys to move.">
              <div style={{ height: rows * ROW_H, position: 'relative', minWidth: W * 34 + 120 }}>
                {Array.from({ length: last - first }, (_, k) => {
                  const r = first + k; const off = r * W; const row = bytes.subarray(off, off + W)
                  return (
                    <div key={r} className="absolute left-0 flex items-center gap-4 px-3" style={{ top: r * ROW_H, height: ROW_H }}>
                      <span className="w-20 shrink-0 text-muted">{off.toString(16).padStart(8, '0')}</span>
                      <span className="flex">{Array.from(row, (x, i) => <button key={i} onClick={() => setSel(off + i)} className={cn('w-[22px] text-center', i % 8 === 7 && 'mr-1.5', sel === off + i ? 'rounded bg-accent text-on-accent' : hitSet.has(off + i) ? 'rounded bg-warn/30' : x === 0 ? 'text-muted/50' : 'text-fg hover:bg-surface-2')}>{x.toString(16).padStart(2, '0')}</button>)}</span>
                      <span className="whitespace-pre text-muted">{Array.from(row, (x, i) => <span key={i} onClick={() => setSel(off + i)} className={cn('cursor-pointer', sel === off + i && 'bg-accent text-on-accent', hitSet.has(off + i) && sel !== off + i && 'bg-warn/30')}>{x >= 32 && x < 127 ? String.fromCharCode(x) : '.'}</span>)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <aside className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Data inspector</span><Switch checked={le} onChange={setLe} label={le ? 'Little endian' : 'Big endian'} /></div>
            {insp?.map(([k, v]) => <KV key={k} label={k} value={v} />)}
            <Button size="sm" variant="outline" className="w-full" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([bytes.slice(sel, sel + 4096) as BlobPart]), `bytes-${sel.toString(16)}.bin`)}>Save 4 KB from here</Button>
          </aside>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={sq} onChange={(e) => setSq(e.target.value)} placeholder="Filter strings" className="w-64" aria-label="Filter strings" />
            <label className="flex items-center gap-2 text-sm"><span className="text-muted">Min length</span><Input type="number" min={3} max={64} value={minLen} onChange={(e) => setMinLen(Math.max(3, Number(e.target.value) || 4))} className="w-20" /></label>
            <span className="text-xs text-muted">{shownStrings.length.toLocaleString()} strings{strings.length >= 20000 ? ' (first 20,000)' : ''}</span>
            <Button size="sm" variant="ghost" className="ml-auto" icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([shownStrings.map((s) => `${s.offset.toString(16).padStart(8, '0')}\t${s.enc}\t${s.text}`).join('\n')], { type: 'text/plain' }), `${file?.name}-strings.txt`)}>Save list</Button>
          </div>
          {shownStrings.length === 0 ? <Status kind="info">No readable strings of that length.</Status> : (
            <div className="scrollbar-thin max-h-[560px] overflow-auto rounded-xl border border-border bg-surface font-mono text-[12px]">
              {shownStrings.slice(0, 3000).map((s, i) => <button key={i} onClick={() => { setTab('hex'); setTimeout(() => goTo(s.offset), 0) }} className="flex w-full gap-3 border-b border-border/50 px-3 py-1 text-left hover:bg-surface-2"><span className="w-20 shrink-0 text-muted">{s.offset.toString(16).padStart(8, '0')}</span>{s.enc === 'utf16le' && <span className="shrink-0 text-sky">u16</span>}<span className="truncate">{s.text}</span></button>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

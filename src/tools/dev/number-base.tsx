import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { Card, Segmented, Slider, CopyButton, Switch, cn } from '@/components/ui'

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
function parseBig(s: string, radix: number): bigint {
  let t = s.trim().toLowerCase().replace(/[\s_']/g, '')
  let neg = false
  if (t.startsWith('-')) { neg = true; t = t.slice(1) } else if (t.startsWith('+')) t = t.slice(1)
  if (radix === 16) t = t.replace(/^0x/, ''); if (radix === 2) t = t.replace(/^0b/, ''); if (radix === 8) t = t.replace(/^0o/, '')
  if (!t) throw new Error('empty')
  const R = BigInt(radix); let v = 0n
  for (const ch of t) { const d = DIGITS.indexOf(ch); if (d < 0 || d >= radix) throw new Error(`“${ch}” is not a valid base-${radix} digit`); v = v * R + BigInt(d) }
  return neg ? -v : v
}
const group = (s: string, n: number, sep = ' ') => { const neg = s.startsWith('-'); const b = neg ? s.slice(1) : s; const out = b.replace(new RegExp(`\\B(?=(.{${n}})+$)`, 'g'), sep); return (neg ? '-' : '') + out }

const FIELDS: { r: number; name: string; prefix: string; grp: number }[] = [
  { r: 2, name: 'Binary', prefix: '0b', grp: 4 }, { r: 8, name: 'Octal', prefix: '0o', grp: 3 }, { r: 10, name: 'Decimal', prefix: '', grp: 3 },
  { r: 16, name: 'Hexadecimal', prefix: '0x', grp: 4 }, { r: 32, name: 'Base 32 (radix)', prefix: '', grp: 4 }, { r: 36, name: 'Base 36', prefix: '', grp: 4 },
]

export default function NumberBase() {
  const [src, setSrc] = useState<{ r: number; text: string }>({ r: 10, text: '2026' })
  const [custom, setCustom] = useState(7)
  const [width, setWidth] = useState<'8' | '16' | '32' | '64' | '128'>('32')
  const [grouped, setGrouped] = useState(true)
  const [upper, setUpper] = useState(true)

  const parsed = useMemo(() => { if (!src.text.trim()) return { v: null as bigint | null, err: null as string | null }; try { return { v: parseBig(src.text, src.r), err: null } } catch (e: any) { return { v: null, err: e.message === 'empty' ? null : e.message } } }, [src])
  const v = parsed.v
  const W = BigInt(width)
  const mask = (1n << W) - 1n
  const unsigned = v === null ? null : ((v % (1n << W)) + (1n << W)) % (1n << W) // two's complement bit pattern
  const signed = unsigned === null ? null : unsigned >= 1n << (W - 1n) ? unsigned - (1n << W) : unsigned
  const overflow = v !== null && (v > mask || v < -(1n << (W - 1n)))

  const show = (r: number, val: bigint | null) => {
    if (val === null) return ''
    let s = val.toString(r); if (upper) s = s.toUpperCase()
    return s
  }
  const fieldVal = (r: number) => (src.r === r ? src.text : show(r, v))

  const bits = unsigned === null ? [] : unsigned.toString(2).padStart(Number(width), '0').split('')
  const flip = (i: number) => { if (unsigned === null) return; const nb = unsigned ^ (1n << BigInt(Number(width) - 1 - i)); setSrc({ r: 10, text: nb.toString() }) }

  const row = ({ r, name, prefix, grp }: { r: number; name: string; prefix: string; grp: number }) => {
    const val = fieldVal(r)
    const isSrc = src.r === r
    return (
      <div key={r} className={cn('rounded-xl border bg-surface p-3 transition', isSrc ? 'border-accent ring-2 ring-accent/15' : 'border-border')}>
        <div className="mb-1.5 flex items-center gap-2 text-xs"><span className="font-semibold uppercase tracking-wide text-muted">{name}</span><span className="text-muted/70">base {r}</span>
          <div className="ml-auto">{val && <CopyButton text={prefix + val.replace(/^-/, '')} label="" variant="ghost" />}</div></div>
        <div className="flex items-center gap-1 font-mono">
          {prefix && <span className="text-muted">{prefix}</span>}
          <input value={val} onChange={(e) => setSrc({ r, text: e.target.value })} spellCheck={false} inputMode={r === 10 ? 'numeric' : 'text'}
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none" placeholder="0" />
        </div>
        {grouped && val && !isSrc && val.length > grp && <div className="mt-1 break-all font-mono text-[11px] text-muted">{group(val, grp)}</div>}
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        {parsed.err && <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger"><AlertTriangle className="size-4" />{parsed.err}</div>}
        <div className="grid gap-3 md:grid-cols-2">
          {FIELDS.map((f) => row(f))}
          <div className={cn('rounded-xl border bg-surface p-3 md:col-span-2', src.r === custom && !FIELDS.some((f) => f.r === custom) ? 'border-accent ring-2 ring-accent/15' : 'border-border')}>
            <div className="mb-2 flex items-center gap-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted">Custom base</span><Slider value={custom} onChange={setCustom} min={2} max={36} className="flex-1" /><span className="w-8 font-mono text-sm">{custom}</span></div>
            <input value={fieldVal(custom)} onChange={(e) => setSrc({ r: custom, text: e.target.value })} spellCheck={false} className="w-full bg-transparent font-mono text-[17px] outline-none" placeholder="0" />
          </div>
        </div>

        {v !== null && (
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold">Bit view</span>
              <Segmented value={width} onChange={setWidth} options={['8', '16', '32', '64', '128'].map((w) => ({ value: w as any, label: `${w}-bit` }))} />
              {overflow && <span className="text-xs text-warn">Value doesn't fit in {width} bits, showing the low {width} bits</span>}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-2 font-mono">
              {Array.from({ length: Number(width) / 8 }, (_, byte) => (
                <div key={byte} className="flex flex-col items-center gap-1">
                  <div className="flex gap-0.5">
                    {bits.slice(byte * 8, byte * 8 + 8).map((b, k) => {
                      const i = byte * 8 + k
                      return <motion.button key={i} whileTap={{ scale: 0.85 }} onClick={() => flip(i)} title={`bit ${Number(width) - 1 - i}`}
                        className={cn('grid h-7 w-5 place-items-center rounded text-xs font-semibold transition cursor-pointer', b === '1' ? 'bg-accent text-on-accent shadow-sm shadow-accent/40' : 'bg-surface-2 text-muted hover:bg-border', i === 0 && 'ring-1 ring-warn/60')}>{b}</motion.button>
                    })}
                  </div>
                  <span className="text-[10px] text-muted">{(Number(width) - 1 - byte * 8)}–{Number(width) - 8 - byte * 8} · 0x{parseInt(bits.slice(byte * 8, byte * 8 + 8).join(''), 2).toString(16).toUpperCase().padStart(2, '0')}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Info label={`Unsigned (${width}-bit)`} value={unsigned!.toString()} />
              <Info label={`Signed / two's complement`} value={signed!.toString()} />
              <Info label="Two's complement hex" value={'0x' + unsigned!.toString(16).toUpperCase().padStart(Number(width) / 4, '0')} />
              <Info label="Set bits (popcount)" value={String(bits.filter((b) => b === '1').length)} />
              <Info label="One's complement (NOT)" value={'0b' + group((~unsigned! & mask).toString(2).padStart(Number(width), '0'), 4, '_')} />
              <Info label="Bit length" value={String(v === 0n ? 0 : (v < 0n ? -v : v).toString(2).length)} />
            </div>
            <p className="text-[11px] text-muted">Click any bit to flip it. The leftmost bit (outlined) is the sign bit in two's complement.</p>
          </Card>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <Switch checked={upper} onChange={setUpper} label="Uppercase digits" />
          <Switch checked={grouped} onChange={setGrouped} label="Show digit grouping" />
          <div className="space-y-1 text-xs text-muted">
            <p>Arbitrary precision, powered by BigInt, so 100+ digit numbers convert exactly.</p>
            <p>Negative numbers work in every base (with a leading −). Prefixes 0x / 0b / 0o and separators like _ or spaces are accepted.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[['255', 10], ['-1', 10], ['deadbeef', 16], ['1010_1010', 2], ['777', 8], ['18446744073709551615', 10]].map(([t, r]) => (
              <button key={t as string} onClick={() => setSrc({ r: r as number, text: t as string })} className="rounded-lg border border-border px-2 py-1 font-mono text-[11px] text-muted hover:border-accent hover:text-fg">{t as string}<sub className="ml-0.5">{r}</sub></button>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-2/50 px-3 py-2">
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div><div className="break-all font-mono text-[13px]">{value}</div></div>
      <CopyButton text={value} label="" variant="ghost" />
    </div>
  )
}

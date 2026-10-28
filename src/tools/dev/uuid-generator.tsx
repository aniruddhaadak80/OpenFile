import { Fragment, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { Button, Card, Field, Input, Segmented, Switch, CopyButton, Slider, cn } from '@/components/ui'
import { DownloadButton, Pane } from './_dev/kit'

type Ver = 'v4' | 'v7' | 'v1' | 'nil'
const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')
const fmt36 = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`

function v4() { const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; return fmt36(hex(b)) }

let lastMs = 0, seq = 0
function v7() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  let ms = Date.now()
  if (ms <= lastMs) { seq++; if (seq > 0xfff) { lastMs++; seq = 0 } ms = lastMs } else { lastMs = ms; seq = b[6] & 0x07 } // keep monotonic within a ms
  const t = BigInt(ms)
  for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn)
  b[6] = 0x70 | ((seq >> 8) & 0x0f); b[7] = seq & 0xff
  b[8] = (b[8] & 0x3f) | 0x80
  return fmt36(hex(b))
}

const GREG = 122192928000000000n // 100ns intervals between 1582-10-15 and 1970-01-01
let v1Last = 0n, v1Sub = 0n
const v1Node = (() => { const n = crypto.getRandomValues(new Uint8Array(6)); n[0] |= 0x01; return hex(n) })()
const v1Clock = crypto.getRandomValues(new Uint16Array(1))[0] & 0x3fff
function v1() {
  let t = BigInt(Date.now()) * 10000n + GREG
  if (t <= v1Last) { v1Sub++; t = v1Last + 1n } else v1Sub = 0n
  v1Last = t
  const low = (t & 0xffffffffn).toString(16).padStart(8, '0')
  const mid = ((t >> 32n) & 0xffffn).toString(16).padStart(4, '0')
  const hi = (((t >> 48n) & 0x0fffn) | 0x1000n).toString(16).padStart(4, '0')
  const cs = ((v1Clock & 0x3fff) | 0x8000).toString(16).padStart(4, '0')
  return `${low}-${mid}-${hi}-${cs}-${v1Node}`
}
const NIL = '00000000-0000-0000-0000-000000000000'
const gen = (v: Ver) => (v === 'v4' ? v4() : v === 'v7' ? v7() : v === 'v1' ? v1() : NIL)

function parseUuid(s: string) {
  const clean = s.trim().replace(/^urn:uuid:/i, '').replace(/^[{(]|[})]$/g, '')
  const h = clean.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(h)) return { valid: false as const, reason: 'Must be 32 hex digits (optionally hyphenated 8-4-4-4-12, braces or urn:uuid: prefix).' }
  if (clean.includes('-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return { valid: false as const, reason: 'Hyphens are in the wrong positions (expected 8-4-4-4-12).' }
  const std = fmt36(h)
  if (h === '0'.repeat(32)) return { valid: true as const, std, version: 'NIL', variant: '-', info: [] as [string, string][] }
  if (h === 'f'.repeat(32)) return { valid: true as const, std, version: 'MAX', variant: '-', info: [] as [string, string][] }
  const version = parseInt(h[12], 16)
  const vn = parseInt(h[16], 16)
  const variant = vn < 8 ? 'NCS (reserved)' : vn < 12 ? 'RFC 9562 / 4122' : vn < 14 ? 'Microsoft (reserved)' : 'Future (reserved)'
  const info: [string, string][] = []
  if (version === 7) {
    const ms = Number(BigInt('0x' + h.slice(0, 12)))
    info.push(['Timestamp', new Date(ms).toISOString()], ['Local time', new Date(ms).toLocaleString()], ['Unix ms', String(ms)])
  }
  if (version === 1 || version === 6) {
    const t = version === 1
      ? (BigInt('0x' + h.slice(13, 16)) << 48n) | (BigInt('0x' + h.slice(8, 12)) << 32n) | BigInt('0x' + h.slice(0, 8))
      : (BigInt('0x' + h.slice(0, 12)) << 12n) | BigInt('0x' + h.slice(13, 16))
    const ms = Number((t - GREG) / 10000n)
    info.push(['Timestamp', new Date(ms).toISOString()], ['Clock sequence', String(parseInt(h.slice(16, 20), 16) & 0x3fff)], ['Node', h.slice(20).match(/../g)!.join(':')])
  }
  const desc: Record<number, string> = { 1: 'Time-based (Gregorian)', 2: 'DCE Security', 3: 'Name-based (MD5)', 4: 'Random', 5: 'Name-based (SHA-1)', 6: 'Reordered time', 7: 'Unix-time ordered', 8: 'Custom' }
  return { valid: true as const, std, version: `v${version} · ${desc[version] ?? 'Unknown'}`, variant, info }
}

export default function UuidGenerator() {
  const [ver, setVer] = useState<Ver>('v4')
  const [count, setCount] = useState(10)
  const [upper, setUpper] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const [braces, setBraces] = useState(false)
  const [quotes, setQuotes] = useState(false)
  const [list, setList] = useState<string[]>([])
  const [check, setCheck] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => { setList(Array.from({ length: ver === 'nil' ? 1 : count }, () => gen(ver))) }, [ver, count, nonce])

  const format = (u: string) => { let s = hyphens ? u : u.replace(/-/g, ''); if (upper) s = s.toUpperCase(); if (braces) s = `{${s}}`; if (quotes) s = `"${s}"`; return s }
  const out = useMemo(() => list.map(format), [list, upper, hyphens, braces, quotes])
  const parsed = check.trim() ? parseUuid(check) : null

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <motion.div key={out[0]} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-transparent p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{ver === 'nil' ? 'NIL UUID' : `UUID ${ver}`}</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 break-all font-mono text-lg font-semibold sm:text-2xl">{out[0]}</div>
            <CopyButton text={out[0] ?? ''} size="md" />
          </div>
        </motion.div>

        <Pane title={`${out.length} UUID${out.length > 1 ? 's' : ''}`} actions={<><CopyButton text={() => out.join('\n')} label="Copy all" variant="ghost" /><DownloadButton text={() => out.join('\n') + '\n'} filename={`uuids-${ver}.txt`} /></>}>
          <div className="scrollbar-thin max-h-[440px] overflow-auto py-1 font-mono text-[13px]">
            {out.map((u, i) => (
              <div key={i} className="group flex items-center gap-3 px-3 py-1 hover:bg-surface-2">
                <span className="w-10 shrink-0 text-right text-[11px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 break-all">{u}</span>
                <span className="opacity-0 transition group-hover:opacity-100"><CopyButton text={u} label="" variant="ghost" /></span>
              </div>
            ))}
          </div>
        </Pane>

        <Card className="space-y-3">
          <Field label="Validate / parse a UUID"><Input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="e.g. 0190f3a2-7b1c-7cde-9f12-3456789abcde" className="font-mono" /></Field>
          {parsed && (parsed.valid ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-success"><CheckCircle2 className="size-4" />Valid UUID</div>
              <div className="grid gap-1.5 rounded-xl bg-surface-2/50 p-3 text-[13px] sm:grid-cols-[140px_1fr]">
                <span className="text-muted">Canonical</span><span className="break-all font-mono">{parsed.std}</span>
                <span className="text-muted">Version</span><span>{parsed.version}</span>
                <span className="text-muted">Variant</span><span>{parsed.variant}</span>
                {parsed.info.map(([k, v]) => <Fragment key={k}><span className="text-muted">{k}</span><span className="break-all font-mono">{v}</span></Fragment>)}
              </div>
            </div>
          ) : <div className="flex items-start gap-2 text-sm text-danger"><XCircle className="mt-0.5 size-4 shrink-0" />{parsed.reason}</div>)}
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Version</div>
            <Segmented value={ver} onChange={setVer} options={[{ value: 'v4', label: 'v4 random' }, { value: 'v7', label: 'v7 time' }, { value: 'v1', label: 'v1' }, { value: 'nil', label: 'NIL' }]} />
            <p className="mt-2 text-xs text-muted">{ver === 'v4' ? '122 random bits from crypto.getRandomValues.' : ver === 'v7' ? 'Unix-ms timestamp prefix, sortable, great for database keys. Monotonic within a millisecond.' : ver === 'v1' ? 'Gregorian timestamp + clock sequence + random node ID (no MAC address is used).' : 'All zeros, a placeholder value.'}</p>
          </div>
          {ver !== 'nil' && <div className="space-y-2">
            <Slider label="How many" value={count} onChange={setCount} min={1} max={1000} />
            <div className="flex gap-1.5">{[1, 10, 100, 500, 1000].map((n) => <button key={n} onClick={() => setCount(n)} className={cn('flex-1 rounded-lg border py-1 text-xs', count === n ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg')}>{n}</button>)}</div>
          </div>}
          <div className="flex flex-col gap-3">
            <Switch checked={upper} onChange={setUpper} label="Uppercase" />
            <Switch checked={hyphens} onChange={setHyphens} label="Hyphens" />
            <Switch checked={braces} onChange={setBraces} label="Wrap in { braces }" />
            <Switch checked={quotes} onChange={setQuotes} label='Wrap in "quotes"' />
          </div>
          <Button className="w-full" icon={<RefreshCw className="size-4" />} onClick={() => setNonce((n) => n + 1)} disabled={ver === 'nil'}>Regenerate</Button>
        </Card>
      </aside>
    </div>
  )
}

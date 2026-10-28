import { Fragment, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { Button, Card, Field, Input, Textarea, Select, Switch, CopyButton, Slider, ErrorNote, cn } from '@/components/ui'
import { DownloadButton, Pane } from './_dev/kit'
import { generateMany, parseUlid, ulidToUuid, nanoCollision, NAMESPACES, NANO_ALPHABETS, type IdKind } from '@/lib/b5/ids'

const fmt36 = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
const GREG = 122192928000000000n // 100ns intervals between 1582-10-15 and 1970-01-01

const KINDS: { value: IdKind; label: string; desc: string }[] = [
  { value: 'v4', label: 'UUID v4', desc: '122 random bits from crypto.getRandomValues. The usual choice.' },
  { value: 'v7', label: 'UUID v7', desc: 'Starts with a Unix millisecond timestamp, so IDs sort by time. Great for database keys.' },
  { value: 'ulid', label: 'ULID', desc: '26 characters, Crockford Base32, sorts by time. Monotonic inside one millisecond.' },
  { value: 'nanoid', label: 'NanoID', desc: 'Short random IDs with your own length and alphabet. URL safe by default.' },
  { value: 'v1', label: 'UUID v1', desc: 'Gregorian timestamp, clock sequence and a random node ID (no MAC address is used).' },
  { value: 'v6', label: 'UUID v6', desc: 'Like v1 but with the time fields reordered so IDs sort by time.' },
  { value: 'v5', label: 'UUID v5', desc: 'Name based with SHA-1. The same namespace and name always give the same UUID.' },
  { value: 'v3', label: 'UUID v3', desc: 'Name based with MD5. Prefer v5 for new work.' },
  { value: 'nil', label: 'NIL', desc: 'All zeros, a placeholder value.' },
  { value: 'max', label: 'MAX', desc: 'All ones (ffff...), the upper bound placeholder.' },
]
const isUuid = (k: IdKind) => k !== 'ulid' && k !== 'nanoid'

function parseUuid(s: string) {
  const clean = s.trim().replace(/^urn:uuid:/i, '').replace(/^[{(]|[})]$/g, '')
  const h = clean.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(h)) return { valid: false as const, reason: 'Not a UUID or ULID. A UUID is 32 hex digits (hyphens 8-4-4-4-12, braces or urn:uuid: are fine). A ULID is 26 Base32 characters.' }
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
  return { valid: true as const, std, version: `v${version} | ${desc[version] ?? 'Unknown'}`, variant, info }
}

type Parsed = ReturnType<typeof parseUuid>
function parseAny(s: string): Parsed {
  const t = s.trim()
  if (/^[0-9A-Za-z]{26}$/.test(t)) {
    const u = parseUlid(t)
    if (u) return { valid: true as const, std: t.toUpperCase(), version: 'ULID', variant: '-', info: [['Timestamp', u.date.toISOString()], ['Local time', u.date.toLocaleString()], ['Unix ms', String(u.ms)], ['As UUID', ulidToUuid(t)]] as [string, string][] }
  }
  return parseUuid(t)
}

export default function UuidGenerator() {
  const [kind, setKind] = useState<IdKind>('v4')
  const [count, setCount] = useState(10)
  const [upper, setUpper] = useState(false)
  const [hyphens, setHyphens] = useState(true)
  const [braces, setBraces] = useState(false)
  const [quotes, setQuotes] = useState(false)
  const [nsKey, setNsKey] = useState('DNS')
  const [nsCustom, setNsCustom] = useState('')
  const [names, setNames] = useState('example.com')
  const [nanoSize, setNanoSize] = useState(21)
  const [alphaKey, setAlphaKey] = useState('URL safe (default)')
  const [alphaCustom, setAlphaCustom] = useState('')
  const [sep, setSep] = useState<'newline' | 'comma' | 'space' | 'json' | 'sql'>('newline')
  const [list, setList] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [check, setCheck] = useState('')
  const [nonce, setNonce] = useState(0)

  const namespace = nsKey === 'Custom' ? nsCustom.trim() : NAMESPACES[nsKey]
  const alphabet = alphaKey === 'Custom' ? alphaCustom : NANO_ALPHABETS[alphaKey]
  useEffect(() => {
    try { setList(generateMany(kind, count, { namespace, name: names, nanoSize, nanoAlphabet: alphabet })); setError(null) }
    catch (e) { setList([]); setError((e as Error).message) }
  }, [kind, count, nonce, namespace, names, nanoSize, alphabet])

  const format = (u: string) => {
    let v = u
    if (isUuid(kind)) { if (!hyphens) v = v.replace(/-/g, ''); v = upper ? v.toUpperCase() : v.toLowerCase(); if (braces) v = `{${v}}` }
    if (quotes || sep === 'json' || sep === 'sql') v = sep === 'sql' ? `'${v}'` : `"${v}"`
    return v
  }
  const out = useMemo(() => list.map(format), [list, upper, hyphens, braces, quotes, sep, kind])
  const joined = () => sep === 'comma' ? out.join(', ') : sep === 'space' ? out.join(' ') : sep === 'json' ? '[\n  ' + out.join(',\n  ') + '\n]' : sep === 'sql' ? '(' + out.join(', ') + ')' : out.join('\n')
  const parsed = check.trim() ? parseAny(check) : null
  const info = KINDS.find((k) => k.value === kind)!
  const nameBased = kind === 'v3' || kind === 'v5'
  const fixed = kind === 'nil' || kind === 'max'
  const nanoLen = new Set(Array.from(alphabet || '')).size

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-4">
        <ErrorNote error={error} />
        {out[0] && (
          <motion.div key={out[0]} initial={{ opacity: 0.4, y: -4 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-gradient-to-br from-accent/10 to-transparent p-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{info.label}</div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 break-all font-mono text-lg font-semibold sm:text-2xl">{out[0]}</div>
              <CopyButton text={out[0] ?? ''} size="md" />
            </div>
          </motion.div>
        )}

        <Pane title={`${out.length} ID${out.length === 1 ? '' : 's'}`} actions={<><CopyButton text={joined} label="Copy all" variant="ghost" /><DownloadButton text={() => joined() + '\n'} filename={`ids-${kind}.${sep === 'json' ? 'json' : 'txt'}`} /></>}>
          <div className="scrollbar-thin max-h-[440px] overflow-auto py-1 font-mono text-[13px]">
            {out.slice(0, 2000).map((u, i) => (
              <div key={i} className="group flex items-center gap-3 px-3 py-1 hover:bg-surface-2">
                <span className="w-12 shrink-0 text-right text-[11px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 break-all">{u}</span>
                {nameBased && <span className="hidden max-w-[30%] truncate text-[11px] text-muted sm:inline">{names.split(/\r?\n/)[i]}</span>}
                <span className="opacity-0 transition focus-within:opacity-100 group-hover:opacity-100"><CopyButton text={u} label="" variant="ghost" /></span>
              </div>
            ))}
            {out.length > 2000 && <p className="px-3 py-2 text-xs text-muted">Showing the first 2,000. Copy or download to get all {out.length.toLocaleString()}.</p>}
          </div>
        </Pane>

        <Card className="space-y-3">
          <Field label="Check and decode a UUID or ULID"><Input value={check} onChange={(e) => setCheck(e.target.value)} placeholder="e.g. 0190f3a2-7b1c-7cde-9f12-3456789abcde or 01ARZ3NDEKTSV4RRFFQ69G5FAV" className="font-mono" /></Field>
          {parsed && (parsed.valid ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-success"><CheckCircle2 className="size-4" />Valid {parsed.version === 'ULID' ? 'ULID' : 'UUID'}</div>
              <div className="grid gap-1.5 rounded-xl bg-surface-2/50 p-3 text-[13px] sm:grid-cols-[140px_1fr]">
                <span className="text-muted">Canonical</span><span className="break-all font-mono">{parsed.std}</span>
                <span className="text-muted">Version</span><span>{parsed.version}</span>
                {parsed.variant !== '-' && <><span className="text-muted">Variant</span><span>{parsed.variant}</span></>}
                {parsed.info.map(([k, v]) => <Fragment key={k}><span className="text-muted">{k}</span><span className="break-all font-mono">{v}</span></Fragment>)}
              </div>
            </div>
          ) : <div className="flex items-start gap-2 text-sm text-danger"><XCircle className="mt-0.5 size-4 shrink-0" />{parsed.reason}</div>)}
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Type</div>
            <div className="grid grid-cols-2 gap-1.5">
              {KINDS.map((k) => <button key={k.value} onClick={() => setKind(k.value)} aria-pressed={kind === k.value} className={cn('rounded-lg border px-2 py-1.5 text-xs font-medium transition', kind === k.value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}>{k.label}</button>)}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{info.desc}</p>
          </div>
          {nameBased && (
            <div className="space-y-3">
              <Field label="Namespace">
                <Select value={nsKey} onChange={setNsKey} options={[...Object.keys(NAMESPACES), 'Custom']} />
              </Field>
              {nsKey === 'Custom' && <Input value={nsCustom} onChange={(e) => setNsCustom(e.target.value)} placeholder="Namespace UUID" className="font-mono text-xs" aria-label="Custom namespace UUID" />}
              <Field label="Names" hint="One per line, one UUID each">
                <Textarea value={names} onChange={(e) => setNames(e.target.value)} className="min-h-24 text-xs" />
              </Field>
            </div>
          )}
          {kind === 'nanoid' && (
            <div className="space-y-3">
              <Slider label="Length" value={nanoSize} onChange={setNanoSize} min={4} max={64} />
              <Field label="Alphabet"><Select value={alphaKey} onChange={setAlphaKey} options={[...Object.keys(NANO_ALPHABETS), 'Custom']} /></Field>
              {alphaKey === 'Custom' && <Input value={alphaCustom} onChange={(e) => setAlphaCustom(e.target.value)} placeholder="Characters to use" className="font-mono text-xs" aria-label="Custom alphabet" />}
              {nanoLen >= 2 && <p className="text-[11px] text-muted">About {Math.round(nanoSize * Math.log2(nanoLen))} bits. You would need roughly {fmtBig(nanoCollision(nanoSize, nanoLen))} IDs for a 1% chance of one collision.</p>}
            </div>
          )}
          {!nameBased && !fixed && <div className="space-y-2">
            <Slider label="How many" value={count} onChange={setCount} min={1} max={10000} />
            <div className="flex gap-1.5">{[1, 10, 100, 1000, 10000].map((n) => <button key={n} onClick={() => setCount(n)} className={cn('flex-1 rounded-lg border py-1 text-xs', count === n ? 'border-accent text-accent' : 'border-border text-muted hover:text-fg')}>{n.toLocaleString()}</button>)}</div>
          </div>}
          <div className="flex flex-col gap-3">
            {isUuid(kind) && <>
              <Switch checked={upper} onChange={setUpper} label="Uppercase" />
              <Switch checked={hyphens} onChange={setHyphens} label="Hyphens" />
              <Switch checked={braces} onChange={setBraces} label="Wrap in { braces }" />
            </>}
            <Switch checked={quotes} onChange={setQuotes} label='Wrap in "quotes"' />
          </div>
          <Field label="Copy and download as">
            <Select value={sep} onChange={setSep} options={[{ value: 'newline', label: 'One per line' }, { value: 'comma', label: 'Comma separated' }, { value: 'space', label: 'Space separated' }, { value: 'json', label: 'JSON array' }, { value: 'sql', label: "SQL IN ('...')" }]} />
          </Field>
          <Button className="w-full" icon={<RefreshCw className="size-4" />} onClick={() => setNonce((n) => n + 1)} disabled={fixed || nameBased}>Regenerate</Button>
        </Card>
      </aside>
    </div>
  )
}

function fmtBig(n: number) {
  if (!isFinite(n)) return 'a practically endless number of'
  if (n < 1e6) return Math.round(n).toLocaleString()
  const units = [[1e18, 'quintillion'], [1e15, 'quadrillion'], [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million']] as const
  for (const [v, w] of units) if (n >= v) return n / v >= 1000 ? n.toExponential(1) : `${(n / v).toFixed(1)} ${w}`
  return String(n)
}

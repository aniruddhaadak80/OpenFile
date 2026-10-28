import { useMemo, useState } from 'react'
import { Button, Dropzone, FileChip, Input, Select, Switch, Tabs, CopyButton, Badge } from '@/components/ui'
import { Bar, Stat, Status, DownloadButton } from './_b5/shell'
import { formatBytes } from '@/lib/files'

interface HarHeader { name: string; value: string }
interface HarEntry {
  startedDateTime: string; time: number
  request: { method: string; url: string; httpVersion?: string; headers: HarHeader[]; queryString?: HarHeader[]; postData?: { mimeType?: string; text?: string }; cookies?: HarHeader[] }
  response: { status: number; statusText?: string; headers: HarHeader[]; content: { size: number; mimeType?: string; text?: string; encoding?: string }; bodySize?: number; _transferSize?: number }
  timings?: Record<string, number>; serverIPAddress?: string; _resourceType?: string
}

const SECRET_HEADERS = /^(authorization|cookie|set-cookie|x-api-key|x-auth-token|proxy-authorization|x-csrf-token|x-xsrf-token)$/i
const SECRET_PARAMS = /(token|key|secret|password|passwd|session|auth|sig|signature|code)/i
const KIND_OF = (e: HarEntry) => {
  const m = (e.response.content.mimeType || '').toLowerCase(), r = (e._resourceType || '').toLowerCase()
  if (r === 'xhr' || r === 'fetch' || m.includes('json')) return 'Fetch/XHR'
  if (m.includes('javascript')) return 'JS'
  if (m.includes('css')) return 'CSS'
  if (m.startsWith('image/')) return 'Img'
  if (m.includes('font')) return 'Font'
  if (m.includes('html')) return 'Doc'
  if (m.startsWith('video/') || m.startsWith('audio/')) return 'Media'
  return 'Other'
}
const TIMING_COLORS: Record<string, string> = { blocked: '#737373', dns: '#14B8A6', connect: '#F97316', ssl: '#FBBF24', send: '#22D3EE', wait: '#10B981', receive: '#38BDF8' }

function redact(har: { log: { entries: HarEntry[] } }) {
  const clone = JSON.parse(JSON.stringify(har)) as { log: { entries: HarEntry[] } }
  const scrubUrl = (u: string) => { try { const x = new URL(u); for (const k of [...x.searchParams.keys()]) if (SECRET_PARAMS.test(k)) x.searchParams.set(k, 'REDACTED'); return x.toString() } catch { return u } }
  for (const e of clone.log.entries) {
    e.request.url = scrubUrl(e.request.url)
    for (const h of [...e.request.headers, ...e.response.headers]) if (SECRET_HEADERS.test(h.name)) h.value = 'REDACTED'
    if (e.request.cookies) e.request.cookies.forEach((c) => (c.value = 'REDACTED'))
    if (e.request.queryString) e.request.queryString.forEach((q) => { if (SECRET_PARAMS.test(q.name)) q.value = 'REDACTED' })
    if (e.request.postData?.text && /password|token|secret/i.test(e.request.postData.text)) e.request.postData.text = 'REDACTED'
  }
  return clone
}
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
function toCurl(e: HarEntry): string {
  const parts = ['curl', shq(e.request.url)]
  if (e.request.method !== 'GET') parts.push('-X', e.request.method)
  for (const h of e.request.headers) if (!h.name.startsWith(':') && !/^(content-length|accept-encoding|connection|host)$/i.test(h.name)) parts.push('-H', shq(`${h.name}: ${h.value}`))
  if (e.request.postData?.text) parts.push('--data-raw', shq(e.request.postData.text))
  return parts.join(' \\\n  ')
}

export default function HarViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [har, setHar] = useState<{ log: { entries: HarEntry[]; pages?: unknown[]; creator?: { name: string; version: string } } } | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('All')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [tab, setTab] = useState<'headers' | 'payload' | 'response' | 'timing'>('headers')
  const open = async (f: File) => {
    setErr(''); setSel(null)
    try { const j = JSON.parse(await f.text()); if (!j?.log?.entries) throw new Error('No log.entries found. Save the file from the browser Network panel with "Save all as HAR".'); setHar(j); setFile(f) } catch (e) { setErr((e as Error).message) }
  }
  const entries = har?.log.entries ?? []
  const t0 = useMemo(() => Math.min(...entries.map((e) => new Date(e.startedDateTime).getTime())), [entries])
  const tEnd = useMemo(() => Math.max(...entries.map((e) => new Date(e.startedDateTime).getTime() + Math.max(0, e.time))), [entries])
  const shown = useMemo(() => entries.map((e, i) => ({ e, i })).filter(({ e }) => (kind === 'All' || KIND_OF(e) === kind) && (!errorsOnly || e.response.status >= 400 || e.response.status === 0) && (!q || e.request.url.toLowerCase().includes(q.toLowerCase()))), [entries, kind, errorsOnly, q])
  const total = Math.max(1, tEnd - t0)
  const bytes = entries.reduce((a, e) => a + Math.max(0, e.response._transferSize ?? e.response.bodySize ?? e.response.content.size ?? 0), 0)
  const cur = sel != null ? entries[sel] : null

  if (!har) return <div className="space-y-3"><Dropzone onFiles={(f) => open(f[0])} accept=".har,.json,application/json" label="Drop a .har file" sub="Export it from DevTools, Network panel, Save all as HAR" />{err && <Status kind="err">{err}</Status>}</div>
  return (
    <div className="space-y-4">
      <Bar>
        {file && <FileChip file={file} />}
        <DownloadButton text={() => JSON.stringify(redact(har as { log: { entries: HarEntry[] } }), null, 2)} filename={(file?.name ?? 'capture.har').replace(/\.har$/i, '') + '-redacted.har'} label="Save redacted copy" variant="outline" />
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setHar(null); setFile(null) }}>Start over</Button>
      </Bar>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Requests" value={entries.length} />
        <Stat label="Transferred" value={formatBytes(bytes)} />
        <Stat label="Total time" value={`${(total / 1000).toFixed(2)} s`} />
        <Stat label="Errors" value={entries.filter((e) => e.response.status >= 400 || e.response.status === 0).length} />
        <Stat label="Domains" value={new Set(entries.map((e) => { try { return new URL(e.request.url).host } catch { return '' } })).size} />
      </div>
      <Bar>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by URL" className="h-9 w-64" aria-label="Filter by URL" />
        <Select value={kind} onChange={setKind} options={['All', 'Fetch/XHR', 'Doc', 'JS', 'CSS', 'Img', 'Font', 'Media', 'Other']} className="w-36" />
        <Switch checked={errorsOnly} onChange={setErrorsOnly} label="Errors only" />
        <span className="ml-auto text-xs text-muted">{shown.length} shown</span>
      </Bar>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="scrollbar-thin max-h-[560px] overflow-auto rounded-2xl border border-border">
          <table className="w-full text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-surface-2"><tr><th className="px-2 py-2">Status</th><th className="px-2">Method</th><th className="px-2">Name</th><th className="px-2">Type</th><th className="px-2 text-right">Size</th><th className="px-2 text-right">Time</th><th className="w-[30%] px-2">Waterfall</th></tr></thead>
            <tbody>
              {shown.slice(0, 3000).map(({ e, i }) => {
                const start = new Date(e.startedDateTime).getTime() - t0
                const st = e.response.status
                let u: URL | null = null; try { u = new URL(e.request.url) } catch { /* data url */ }
                return (
                  <tr key={i} onClick={() => setSel(i)} className={`cursor-pointer border-b border-border/60 ${sel === i ? 'bg-accent/10' : 'odd:bg-surface even:bg-surface-2/30 hover:bg-accent/5'}`}>
                    <td className={`px-2 py-1 font-mono ${st >= 400 || st === 0 ? 'text-danger' : st >= 300 ? 'text-warn' : ''}`}>{st || 'fail'}</td>
                    <td className="px-2 font-mono">{e.request.method}</td>
                    <td className="max-w-[260px] truncate px-2" title={e.request.url}>{u ? (u.pathname.split('/').pop() || u.host) + u.search : e.request.url.slice(0, 60)}</td>
                    <td className="px-2 text-muted">{KIND_OF(e)}</td>
                    <td className="px-2 text-right tabular-nums">{formatBytes(Math.max(0, e.response._transferSize ?? e.response.bodySize ?? e.response.content.size ?? 0))}</td>
                    <td className="px-2 text-right tabular-nums">{Math.round(e.time)} ms</td>
                    <td className="px-2"><div className="relative h-2.5 rounded bg-surface-2/50"><div className="absolute h-full rounded bg-gradient-brand" style={{ left: `${(start / total) * 100}%`, width: `${Math.max(0.4, (Math.max(0, e.time) / total) * 100)}%` }} /></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3">
          {!cur ? <div className="grid h-full min-h-40 place-items-center text-sm text-muted">Pick a request to see its details</div> : (
            <div className="space-y-3">
              <div className="flex items-start gap-2"><Badge>{cur.request.method}</Badge><code className="min-w-0 flex-1 break-all text-xs">{cur.request.url}</code></div>
              <div className="flex flex-wrap gap-2"><CopyButton text={toCurl(cur)} label="Copy as cURL" /><CopyButton text={cur.request.url} label="Copy URL" /></div>
              <Tabs value={tab} onChange={setTab} tabs={[{ value: 'headers', label: 'Headers' }, { value: 'payload', label: 'Payload' }, { value: 'response', label: 'Response' }, { value: 'timing', label: 'Timing' }]} />
              <div className="scrollbar-thin max-h-[380px] overflow-auto text-[12.5px]">
                {tab === 'headers' && (['request', 'response'] as const).map((side) => (
                  <div key={side} className="mb-3"><div className="mb-1 font-semibold capitalize">{side} headers {side === 'response' && `(${cur.response.status} ${cur.response.statusText ?? ''})`}</div>
                    {cur[side].headers.map((h, j) => <div key={j} className="grid grid-cols-[40%_60%] gap-2 border-b border-border/40 py-0.5"><span className="truncate font-mono text-muted" title={h.name}>{h.name}</span><span className="break-all font-mono">{h.value}</span></div>)}</div>
                ))}
                {tab === 'payload' && (cur.request.queryString?.length || cur.request.postData?.text ? <>
                  {cur.request.queryString?.map((p, j) => <div key={j} className="grid grid-cols-[40%_60%] gap-2 border-b border-border/40 py-0.5"><span className="font-mono text-muted">{p.name}</span><span className="break-all font-mono">{decodeURIComponent(p.value)}</span></div>)}
                  {cur.request.postData?.text && <pre className="mt-2 whitespace-pre-wrap break-all font-mono">{cur.request.postData.text.slice(0, 50000)}</pre>}
                </> : <p className="text-muted">No query string or body.</p>)}
                {tab === 'response' && (cur.response.content.text ? (cur.response.content.mimeType?.startsWith('image/') && cur.response.content.encoding === 'base64'
                  ? <img alt="Response" className="checker max-h-80 rounded" src={`data:${cur.response.content.mimeType};base64,${cur.response.content.text}`} />
                  : <pre className="whitespace-pre-wrap break-all font-mono">{(cur.response.content.encoding === 'base64' ? (() => { try { return atob(cur.response.content.text!) } catch { return cur.response.content.text! } })() : cur.response.content.text).slice(0, 100000)}</pre>) : <p className="text-muted">The HAR file has no saved body for this response.</p>)}
                {tab === 'timing' && cur.timings && (
                  <div className="space-y-1.5">{Object.entries(cur.timings).filter(([k, v]) => TIMING_COLORS[k] && v > 0).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2"><span className="w-16 capitalize text-muted">{k === 'wait' ? 'waiting' : k}</span><div className="h-3 flex-1 rounded bg-surface-2/50"><div className="h-full rounded" style={{ width: `${Math.max(1, (v / Math.max(1, cur.time)) * 100)}%`, background: TIMING_COLORS[k] }} /></div><span className="w-16 text-right tabular-nums">{v.toFixed(1)} ms</span></div>
                  ))}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Terminal, AlertTriangle, Info, FileCode2 } from 'lucide-react'
import { Button, Badge, CopyButton, cn } from '@/components/ui'
import { CodeArea, CodeView, Pane, DownloadButton, useStored } from './_dev/kit'
import { parseCurl, LANGS } from './_dev/curl'

const SAMPLES = [
  { name: 'JSON POST', cmd: `curl -X POST 'https://api.example.com/v1/users' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer sk_live_123' \\\n  --data-raw '{"name":"Ada Lovelace","role":"admin","active":true}'` },
  { name: 'GET + query', cmd: `curl -G https://api.example.com/search \\\n  -d q=open%20source -d page=2 \\\n  -H 'Accept: application/json' --compressed -L` },
  { name: 'File upload', cmd: `curl -u admin:s3cret \\\n  -F 'title=Quarterly report' \\\n  -F 'file=@./report.pdf;type=application/pdf' \\\n  https://files.example.com/upload` },
  { name: 'Form + cookies', cmd: `curl 'https://example.com/login' -X PUT -k -m 10 \\\n  -b 'session=abc; theme=dark' \\\n  -A 'OpenFile/1.0' \\\n  -d 'username=ada&password=p%40ss'` },
]
const METHOD_COLOR: Record<string, string> = { GET: '#22c55e', POST: '#f59e0b', PUT: '#3b82f6', PATCH: '#14b8a6', DELETE: '#ef4444', HEAD: '#64748b', OPTIONS: '#64748b' }

export default function CurlToCode() {
  const [cmd, setCmd] = useStored('curl-to-code:cmd', SAMPLES[0].cmd)
  const [lang, setLang] = useStored<string>('curl-to-code:lang', 'js')

  const parsed = useMemo(() => { if (!cmd.trim()) return null; try { return { r: parseCurl(cmd) } } catch (e: any) { return { err: e.message as string } } }, [cmd])
  const L = LANGS.find((l) => l.id === lang) ?? LANGS[0]
  const code = useMemo(() => (parsed && 'r' in parsed ? L.gen(parsed.r!) : ''), [parsed, L])
  const r = parsed && 'r' in parsed ? parsed.r! : null

  return (
    <div className="space-y-4">
      <Pane title={<span className="flex items-center gap-1.5"><Terminal className="size-3.5" />cURL command</span>} actions={<>
        <span className="hidden text-xs text-muted sm:inline"><FileCode2 className="mr-1 inline size-3.5" />Samples:</span>
        {SAMPLES.map((s) => <Button key={s.name} size="sm" variant="ghost" onClick={() => setCmd(s.cmd)}>{s.name}</Button>)}
      </>}>
        <CodeArea value={cmd} onChange={setCmd} minRows={6} placeholder="curl https://api.example.com -H 'Accept: application/json'" className="h-44" />
      </Pane>

      {parsed && 'err' in parsed && <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger"><AlertTriangle className="size-4" />{parsed.err}</div>}

      {r && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-surface p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md px-2 py-0.5 font-mono text-xs font-bold" style={{ background: (METHOD_COLOR[r.method] ?? '#64748b') + '22', color: METHOD_COLOR[r.method] ?? '#64748b' }}>{r.method}</span>
            <span className="min-w-0 flex-1 break-all font-mono text-xs">{r.url}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.headers.length > 0 && <Badge>{r.headers.length} HEADER{r.headers.length > 1 ? 'S' : ''}</Badge>}
            {r.bodyKind !== 'none' && <Badge color="#06b6d4">{r.bodyKind.toUpperCase()} BODY</Badge>}
            {r.auth && <Badge color="#f59e0b">BASIC AUTH</Badge>}
            {r.insecure && <Badge color="#ef4444">INSECURE</Badge>}
            {r.follow && <Badge color="#22c55e">FOLLOW REDIRECTS</Badge>}
            {r.compressed && <Badge color="#64748b">COMPRESSED</Badge>}
            {r.timeout && <Badge color="#64748b">TIMEOUT {r.timeout}s</Badge>}
          </div>
          {r.headers.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer text-xs text-muted hover:text-fg">Headers & body</summary>
              <div className="mt-2 grid gap-1 font-mono text-xs">
                {r.headers.map(([k, v], i) => <div key={i} className="break-all"><span className="text-accent">{k}</span>: {v}</div>)}
                {r.body && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-2 p-2">{r.body}</pre>}
                {r.form.map((f, i) => <div key={i}><span className="text-[#06b6d4]">{f.name}</span> = {f.file ? `📎 ${f.value}` : f.value}</div>)}
              </div>
            </details>
          )}
          {r.warnings.length > 0 && <div className="mt-2 space-y-0.5">{r.warnings.map((w, i) => <div key={i} className="flex items-center gap-1.5 text-xs text-warn"><Info className="size-3.5" />{w}</div>)}</div>}
        </motion.div>
      )}

      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {LANGS.map((l) => (
          <button key={l.id} onClick={() => setLang(l.id)} className={cn('shrink-0 rounded-xl border px-3 py-1.5 text-sm font-medium transition cursor-pointer', lang === l.id ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-muted hover:text-fg')}>{l.label}</button>
        ))}
      </div>

      <Pane title={L.label} actions={code ? <><CopyButton text={code} /><DownloadButton text={code} filename={`request.${L.ext}`} /></> : null}>
        {code ? <motion.div key={lang} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><CodeView code={code} lang={lang === 'python' || lang === 'ruby' ? 'py' : 'js'} className="max-h-[560px]" /></motion.div>
          : <div className="p-8 text-center text-sm text-muted">Paste a cURL command, e.g. from your browser's DevTools → Network → right-click → Copy as cURL.</div>}
      </Pane>
    </div>
  )
}

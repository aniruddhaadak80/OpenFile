import { useMemo, useState } from 'react'
import { FileCog } from 'lucide-react'
import { Field, Input, Select, Tabs, Textarea, Label } from '@/components/ui'
import { readEnvAny, parseEnv, writeEnv, compareEnv, type EnvFormat } from '@/lib/b14/dev'
import { TwoPane, Status } from './_b5/shell'

const SAMPLE = '# Database\nDATABASE_URL="postgres://app:secret@localhost:5432/app"\nREDIS_URL=redis://localhost:6379\n\n# App\nNODE_ENV=production\nPORT=8080\nGREETING="Hello, world"\nexport FEATURE_FLAGS=search,beta\n'
const FORMATS: { value: EnvFormat; label: string; ext: string }[] = [
  { value: 'json', label: 'JSON', ext: 'json' }, { value: 'yaml', label: 'YAML', ext: 'yaml' }, { value: 'compose', label: 'Docker Compose', ext: 'yml' },
  { value: 'k8s-configmap', label: 'Kubernetes ConfigMap', ext: 'yaml' }, { value: 'k8s-secret', label: 'Kubernetes Secret (base64)', ext: 'yaml' }, { value: 'github', label: 'GitHub Actions env', ext: 'yml' },
  { value: 'dockerfile', label: 'Dockerfile ENV', ext: 'txt' }, { value: 'shell', label: 'Shell exports', ext: 'sh' }, { value: 'powershell', label: 'PowerShell', ext: 'ps1' }, { value: 'env', label: '.env (cleaned)', ext: 'env' },
]

export default function EnvConverter() {
  const [tab, setTab] = useState<'convert' | 'compare'>('convert')
  const [input, setInput] = useState(SAMPLE)
  const [fmt, setFmt] = useState<EnvFormat>('json')
  const [name, setName] = useState('app-config')
  const [a, setA] = useState(SAMPLE)
  const [b, setB] = useState('DATABASE_URL=\nREDIS_URL=\nNODE_ENV=\nPORT=\nSENTRY_DSN=\n')
  const res = useMemo(() => { try { const entries = readEnvAny(input); const errs = input.trim().startsWith('{') ? [] : parseEnv(input).errors; return { out: writeEnv(entries, fmt, name), n: entries.length, errs, error: null as string | null } } catch (e: any) { return { out: '', n: 0, errs: [], error: e.message as string } } }, [input, fmt, name])
  const cmp = useMemo(() => { try { return compareEnv(readEnvAny(a), readEnvAny(b)) } catch { return null } }, [a, b])
  const f = FORMATS.find((x) => x.value === fmt)!
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'convert', label: 'Convert' }, { value: 'compare', label: 'Compare with .env.example' }]} />
      {tab === 'convert' ? <>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Convert to" className="min-w-56"><Select value={fmt} onChange={setFmt} options={FORMATS.map((x) => ({ value: x.value, label: x.label }))} /></Field>
          {(fmt === 'k8s-configmap' || fmt === 'k8s-secret') && <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value.replace(/[^a-z0-9-.]/g, '-'))} /></Field>}
        </div>
        <TwoPane inputTitle=".env, JSON or YAML" input={input} setInput={setInput} accept=".env,.txt,.json,.yaml,.yml,.example,.local" output={res.out} outputLang={fmt === 'json' ? 'json' : 'generic'} outputTitle={`${f.label} (${res.n} variables)`} outName={fmt === 'dockerfile' ? 'Dockerfile.env' : fmt === 'env' ? '.env' : `env.${f.ext}`} />
        {res.error ? <Status kind="err">{res.error}</Status> : res.errs.length ? <Status kind="warn">{res.errs.slice(0, 3).join('. ')}</Status> : <Status kind="ok">Read {res.n} variables. Comments, export and quotes are handled.</Status>}
        <p className="flex gap-1.5 text-xs text-muted"><FileCog className="size-4 shrink-0" />Secrets stay on your device. Kubernetes Secret values are base64 encoded, which is not encryption.</p>
      </> : <>
        <div className="grid gap-4 lg:grid-cols-2">
          <div><Label>Your .env</Label><Textarea value={a} onChange={(e) => setA(e.target.value)} className="min-h-56 font-mono text-xs" aria-label="Your .env" /></div>
          <div><Label>.env.example (expected keys)</Label><Textarea value={b} onChange={(e) => setB(e.target.value)} className="min-h-56 font-mono text-xs" aria-label=".env.example" /></div>
        </div>
        {cmp && <div className="grid gap-3 sm:grid-cols-3">
          <List title="Missing from your .env" items={cmp.onlyB} tone="warn" />
          <List title="Extra in your .env" items={cmp.onlyA} tone="info" />
          <List title="Empty in your .env" items={cmp.empty} tone="warn" />
        </div>}
      </>}
    </div>
  )
}
function List({ title, items, tone }: { title: string; items: string[]; tone: 'warn' | 'info' }) {
  return <div className="rounded-xl border border-border bg-surface p-3"><div className="mb-2 text-sm font-medium">{title} <span className="text-muted">({items.length})</span></div>{items.length ? items.map((k) => <div key={k} className={`font-mono text-xs ${tone === 'warn' ? 'text-warn' : 'text-muted'}`}>{k}</div>) : <div className="text-xs text-success">None</div>}</div>
}

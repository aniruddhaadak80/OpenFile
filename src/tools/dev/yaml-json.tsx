import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftRight, CheckCircle2, AlertTriangle, FileCode2 } from 'lucide-react'
import { Button, Segmented, Switch, CopyButton, cn } from '@/components/ui'
import { CodeArea, CodeView, Pane, OpenFileButton, DownloadButton, useLib, useStored, useTextDrop } from './_dev/kit'
import { validateJson, JsonError, sortDeep } from './_dev/jsonParse'

const SAMPLE_YAML = `# Service configuration
service:
  name: openfile-api
  version: 2.4.1
  replicas: 3
  enabled: true
  ports: [80, 443]
env:
  - name: NODE_ENV
    value: production
  - name: LOG_LEVEL
    value: info
limits:
  cpu: "500m"
  memory: 512Mi
description: >
  Folded text becomes a
  single line in JSON.
`

type Dir = 'y2j' | 'j2y'

export default function YamlJson() {
  const yaml = useLib('js-yaml', () => import('js-yaml'))
  const [dir, setDir] = useState<Dir>('y2j')
  const [input, setInput] = useStored('yaml-json:input', SAMPLE_YAML)
  const [indent, setIndent] = useState<'2' | '4'>('2')
  const [sort, setSort] = useState(false)
  const [multi, setMulti] = useState(true)
  const [flow, setFlow] = useState(false)
  const drop = useTextDrop((t, name) => { setInput(t); setDir(/\.json$/i.test(name) ? 'j2y' : 'y2j') })

  const res = useMemo(() => {
    if (!yaml || !input.trim()) return null
    const ind = Number(indent)
    try {
      if (dir === 'y2j') {
        const docs = yaml.loadAll(input).filter((d) => d !== undefined)
        let v: unknown = docs.length > 1 && multi ? docs : docs[0] ?? null
        if (sort) v = sortDeep(v)
        return { out: JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x instanceof Date ? x.toISOString() : x), ind), docs: docs.length }
      }
      validateJson(input)
      let v = JSON.parse(input); if (sort) v = sortDeep(v)
      return { out: yaml.dump(v, { indent: ind, lineWidth: 120, noRefs: true, flowLevel: flow ? 1 : -1 }), docs: 1 }
    } catch (e: any) {
      if (e instanceof JsonError) return { err: e.message, line: e.line, col: e.col }
      const mark = e?.mark
      return { err: (e?.reason ?? e?.message ?? String(e)) + (mark ? ` at line ${mark.line + 1}, column ${mark.column + 1}` : ''), line: mark ? mark.line + 1 : undefined, col: mark ? mark.column + 1 : undefined, snippet: mark?.snippet as string | undefined }
    }
  }, [yaml, input, dir, indent, sort, multi, flow])

  const swap = () => { if (res && 'out' in res && res.out) { setInput(res.out); setDir(dir === 'y2j' ? 'j2y' : 'y2j') } }
  const inLang = dir === 'y2j' ? 'YAML' : 'JSON', outLang = dir === 'y2j' ? 'JSON' : 'YAML'

  return (
    <div className="space-y-4" {...drop.props}>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <Segmented value={dir} onChange={setDir} options={[{ value: 'y2j', label: 'YAML → JSON' }, { value: 'j2y', label: 'JSON → YAML' }]} />
        <Segmented value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }]} />
        <Switch checked={sort} onChange={setSort} label="Sort keys" />
        {dir === 'y2j' ? <Switch checked={multi} onChange={setMulti} label="Multi-doc → array" /> : <Switch checked={flow} onChange={setFlow} label="Compact (flow) style" />}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => { setDir('y2j'); setInput(SAMPLE_YAML) }}>Sample</Button>
          <OpenFileButton accept=".yaml,.yml,.json,text/*" onText={(t, n) => { setInput(t); setDir(/\.json$/i.test(n) ? 'j2y' : 'y2j') }} />
        </div>
      </div>

      <motion.div layout className={cn('flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm', !res ? 'border-border bg-surface text-muted' : 'err' in res ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/5 text-success', drop.over && 'ring-2 ring-accent')}>
        {!res ? (yaml ? `Paste ${inLang} or drop a file.` : 'Loading parser…') : 'err' in res ? <><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div className="min-w-0"><div className="font-medium">Invalid {inLang}: {res.err}</div>{res.snippet && <pre className="mt-1 overflow-x-auto font-mono text-xs text-fg/80">{res.snippet}</pre>}</div></>
          : <><CheckCircle2 className="size-4" />Valid {inLang}{res.docs > 1 ? ` · ${res.docs} documents` : ''} → converted to {outLang}</>}
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Pane title={inLang} className="h-[540px]" actions={<Button size="sm" variant="ghost" onClick={() => setInput('')}>Clear</Button>}>
          <CodeArea value={input} onChange={setInput} errorLine={res && 'err' in res ? res.line ?? null : null} />
        </Pane>
        <div className="flex items-center justify-center"><Button variant="outline" size="sm" icon={<ArrowLeftRight className="size-4" />} onClick={swap} title="Use output as input">Swap</Button></div>
        <Pane title={outLang} className="h-[540px]" actions={res && 'out' in res ? <><CopyButton text={res.out!} variant="ghost" /><DownloadButton text={res.out!} filename={dir === 'y2j' ? 'converted.json' : 'converted.yaml'} mime={dir === 'y2j' ? 'application/json' : 'application/yaml'} /></> : null}>
          {res && 'out' in res ? <CodeView code={res.out!} lang={dir === 'y2j' ? 'json' : 'py'} className="h-full" /> : <div className="grid h-full place-items-center p-6 text-sm text-muted">Output appears here</div>}
        </Pane>
      </div>
    </div>
  )
}

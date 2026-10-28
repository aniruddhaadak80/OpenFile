import { useEffect, useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { Button, Segmented, Input, CopyButton } from '@/components/ui'
import { Bar, Status, Pane, CodeArea, CodeView, OpenFileButton, DownloadButton, useStored, useDebounced, Chip } from '../dev/_b5/shell'
import { validateJson } from '../dev/_dev/jsonParse'

type Lang = 'jsonpath' | 'jsonata' | 'js'
const SAMPLE = `{
  "store": {
    "books": [
      { "title": "Sayings of the Century", "author": "Nigel Rees", "category": "reference", "price": 8.95 },
      { "title": "Sword of Honour", "author": "Evelyn Waugh", "category": "fiction", "price": 12.99 },
      { "title": "Moby Dick", "author": "Herman Melville", "category": "fiction", "isbn": "0-553-21311-3", "price": 8.99 },
      { "title": "The Lord of the Rings", "author": "J. R. R. Tolkien", "category": "fiction", "isbn": "0-395-19395-8", "price": 22.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`
const EXAMPLES: Record<Lang, [string, string][]> = {
  jsonpath: [['$.store.books[*].author', 'All authors'], ['$..price', 'Every price'], ['$.store.books[?(@.price < 10)]', 'Books under 10'], ['$.store.books[-1:]', 'Last book'], ['$..books[?(@.isbn)].title', 'Books with ISBN']],
  jsonata: [['store.books.title', 'All titles'], ['$sum(store.books.price)', 'Total price'], ['store.books[price < 10].{"t": title, "p": price}', 'Reshape cheap books'], ['$count(store.books[category="fiction"])', 'Count fiction'], ['store.books^(>price)[0].title', 'Most expensive']],
  js: [['data.store.books.map(b => b.title)', 'All titles'], ['data.store.books.filter(b => b.price > 10)', 'Price over 10'], ['Object.keys(data.store)', 'Top keys'], ['data.store.books.reduce((s, b) => s + b.price, 0)', 'Sum of prices']],
}
const HELP: Record<Lang, string> = {
  jsonpath: 'JSONPath: $ is the root, .. searches deep, [*] means every item, [?(@.x)] filters.',
  jsonata: 'JSONata: a query and transform language with paths, filters in [ ], functions like $sum and $count, and object building.',
  js: 'JavaScript: write an expression using the variable data. It runs only in your browser tab.',
}

export default function JsonQuery() {
  const [json, setJson] = useStored('b5:jq:json', SAMPLE)
  const [lang, setLang] = useStored<Lang>('b5:jq:lang', 'jsonpath')
  const [q, setQ] = useState(EXAMPLES.jsonpath[0][0])
  const [out, setOut] = useState<{ text?: string; err?: string; count?: number; ms?: number } | null>(null)
  const dj = useDebounced(json, 200), dq = useDebounced(q, 200)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!dj.trim() || !dq.trim()) { setOut(null); return }
      let data: unknown
      try { validateJson(dj); data = JSON.parse(dj) } catch (e: any) { setOut({ err: 'Input is not valid JSON: ' + e.message }); return }
      const t0 = performance.now()
      try {
        let r: unknown
        if (lang === 'jsonpath') { const { JSONPath } = await import('jsonpath-plus'); r = JSONPath({ path: dq, json: data as any, wrap: true }) }
        else if (lang === 'jsonata') { const jsonata = (await import('jsonata')).default; r = await jsonata(dq).evaluate(data) }
        else { r = new Function('data', `"use strict"; return (${dq});`)(structuredClone(data)) }
        if (!alive) return
        const text = r === undefined ? 'No match' : JSON.stringify(r, null, 2)
        setOut({ text, count: Array.isArray(r) ? r.length : r === undefined ? 0 : 1, ms: performance.now() - t0 })
      } catch (e: any) { if (alive) setOut({ err: e?.message || String(e) }) }
    })()
    return () => { alive = false }
  }, [dj, dq, lang])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={lang} onChange={(v) => { setLang(v); setQ(EXAMPLES[v][0][0]) }} options={[{ value: 'jsonpath', label: 'JSONPath' }, { value: 'jsonata', label: 'JSONata' }, { value: 'js', label: 'JavaScript' }]} />
        <span className="text-xs text-muted">{HELP[lang]}</span>
        <div className="ml-auto"><Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => setJson(SAMPLE)}>Sample</Button></div>
      </Bar>
      <div className="space-y-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-12 font-mono text-[14px]" placeholder="Type a query" aria-label="Query" spellCheck={false} />
        <div className="flex flex-wrap gap-1.5">{EXAMPLES[lang].map(([ex, label]) => <Chip key={ex} active={q === ex} onClick={() => setQ(ex)} title={ex}>{label}</Chip>)}</div>
      </div>
      {out?.err ? <Status kind="err">{out.err}</Status> : out ? <Status kind="ok">{lang === 'jsonpath' ? `${out.count} match${out.count === 1 ? '' : 'es'}` : 'Result ready'} · {out.ms?.toFixed(1)} ms</Status> : <Status kind="info">Paste JSON and type a query.</Status>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="JSON" className="h-[480px]" actions={<><OpenFileButton accept=".json,application/json,text/*" onText={(t) => setJson(t)} /><Button size="sm" variant="ghost" onClick={() => setJson('')}>Clear</Button></>}>
          <CodeArea value={json} onChange={setJson} />
        </Pane>
        <Pane title="Result" className="h-[480px]" actions={out?.text ? <><CopyButton text={out.text} variant="ghost" /><DownloadButton text={out.text} filename="result.json" mime="application/json" /></> : null}>
          {out?.text ? <CodeView code={out.text} lang="json" className="h-full" /> : <div className="grid h-full place-items-center text-sm text-muted">Result appears here</div>}
        </Pane>
      </div>
    </div>
  )
}

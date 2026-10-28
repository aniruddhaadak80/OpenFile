import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUp, Trash2 } from 'lucide-react'
import { Button, Card, Switch, CopyButton } from '@/components/ui'
import { useStored } from '@/tools/dev/_dev/kit'

const SMALL = new Set('a an and as at but by en for if in nor of on or per the to v vs via with from into onto over up out'.split(' '))
const splitWords = (s: string) => s.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
const perLine = (s: string, fn: (l: string) => string) => s.split('\n').map(fn).join('\n')

function title(s: string, smart: boolean) {
  return perLine(s, (line) => {
    const parts = line.split(/(\s+)/)
    const wordIdx = parts.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i >= 0)
    const first = wordIdx[0], last = wordIdx[wordIdx.length - 1]
    return parts.map((p, i) => {
      if (!/\S/.test(p)) return p
      const lower = p.toLowerCase()
      if (smart && i !== first && i !== last && SMALL.has(lower.replace(/[^\p{L}]/gu, ''))) return lower
      if (smart && /^[A-Z0-9]{2,}$/.test(p)) return p // keep acronyms
      return p.replace(/^([^\p{L}]*)(\p{L})(.*)$/u, (_, a, b, c) => a + b.toUpperCase() + c.toLowerCase()).replace(/-(\p{L})/gu, (_, x) => '-' + x.toUpperCase())
    }).join('')
  })
}
function sentence(s: string) {
  return s.toLowerCase().replace(/(^\s*|[.!?…]\s+|\n\s*)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\bi\b/g, 'I')
}

const CASES: { id: string; name: string; fn: (s: string, smart: boolean) => string; sample: string }[] = [
  { id: 'upper', name: 'UPPER CASE', fn: (s) => s.toUpperCase(), sample: 'HELLO WORLD' },
  { id: 'lower', name: 'lower case', fn: (s) => s.toLowerCase(), sample: 'hello world' },
  { id: 'title', name: 'Title Case', fn: (s, smart) => title(s, smart), sample: 'The Lord of the Rings' },
  { id: 'sentence', name: 'Sentence case', fn: sentence, sample: 'Hello world. How are you?' },
  { id: 'camel', name: 'camelCase', fn: (s) => perLine(s, (l) => splitWords(l).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')), sample: 'helloWorld' },
  { id: 'pascal', name: 'PascalCase', fn: (s) => perLine(s, (l) => splitWords(l).map(cap).join('')), sample: 'HelloWorld' },
  { id: 'snake', name: 'snake_case', fn: (s) => perLine(s, (l) => splitWords(l).map((w) => w.toLowerCase()).join('_')), sample: 'hello_world' },
  { id: 'kebab', name: 'kebab-case', fn: (s) => perLine(s, (l) => splitWords(l).map((w) => w.toLowerCase()).join('-')), sample: 'hello-world' },
  { id: 'constant', name: 'CONSTANT_CASE', fn: (s) => perLine(s, (l) => splitWords(l).map((w) => w.toUpperCase()).join('_')), sample: 'HELLO_WORLD' },
  { id: 'dot', name: 'dot.case', fn: (s) => perLine(s, (l) => splitWords(l).map((w) => w.toLowerCase()).join('.')), sample: 'hello.world' },
  { id: 'path', name: 'path/case', fn: (s) => perLine(s, (l) => splitWords(l).map((w) => w.toLowerCase()).join('/')), sample: 'hello/world' },
  { id: 'train', name: 'Train-Case', fn: (s) => perLine(s, (l) => splitWords(l).map(cap).join('-')), sample: 'Hello-World' },
  { id: 'alt', name: 'aLtErNaTiNg', fn: (s) => { let i = 0; return [...s].map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join('') }, sample: 'hElLo wOrLd' },
  { id: 'inverse', name: 'iNVERSE cASE', fn: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''), sample: 'hELLO wORLD' },
]

export default function CaseConverter() {
  const [text, setText] = useStored('case-converter:text', 'The quick brown fox jumps over the lazy dog\nuserProfile_settings-v2')
  const [smart, setSmart] = useState(true)
  const out = useMemo(() => CASES.map((c) => ({ ...c, out: c.fn(text, smart) })), [text, smart])

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
          <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted">Input · {text.length} chars</span>
          <Switch checked={smart} onChange={setSmart} label={<span className="text-xs text-muted">Smart title case (keep “of”, “the”… lowercase, keep ACRONYMS)</span>} />
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setText('')}>Clear</Button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text to convert…" className="scrollbar-thin min-h-40 w-full resize-y bg-transparent p-4 text-[15px] leading-relaxed outline-none" />
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {out.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.015 }} className="group flex flex-col rounded-2xl border border-border bg-surface p-3 transition hover:border-accent/50">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-accent">{c.name}</span>
              <div className="ml-auto flex gap-1 opacity-70 transition group-hover:opacity-100">
                <Button size="sm" variant="ghost" icon={<ArrowUp className="size-3.5" />} onClick={() => setText(c.out)} title="Use as input" aria-label="Use as input" />
                <CopyButton text={c.out} label="" variant="ghost" />
              </div>
            </div>
            <div className="scrollbar-thin max-h-32 min-h-10 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-[13px] text-fg/90">{c.out || <span className="text-muted">{c.sample}</span>}</div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

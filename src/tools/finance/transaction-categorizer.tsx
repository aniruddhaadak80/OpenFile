import { useEffect, useMemo, useRef, useState } from 'react'
import { Tags } from 'lucide-react'
import { Button, Label, Select, ToolGrid, Empty, Textarea } from '@/components/ui'
import { baseName } from '@/lib/files'
import { CATEGORIES, ruleCategory, type Txn } from '@/lib/r13/finance'
import { useStatement, StatementDrop, CsvColumns, TxnTable } from '@/lib/r13/ui'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { Bars, DlButton } from '@/lib/bcat/kit'
import { exportTxns } from '@/lib/r13/export'

const dot = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

export default function TransactionCategorizer() {
  const st = useStatement()
  const ai = useVision(VMODELS.embed, { quick: true })
  const picked = useRef(false)
  const [labels, setLabels] = useState(CATEGORIES.map((c) => c.name).join('\n'))
  const [cats, setCats] = useState<string[] | null>(null)
  const [conf, setConf] = useState<number[]>([])
  const txns = st.stmt?.txns ?? []
  useEffect(() => { setCats(null) }, [st.stmt])
  // the MiniLM model is small (25 MB) and fine on a CPU, but without WebGPU start in Quick mode so nothing downloads unasked
  useEffect(() => { const id = setTimeout(() => { if (!picked.current && !ai.gpuOk) ai.setEngine('quick') }, 400); return () => clearTimeout(id) }, [ai.gpuOk]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = labels.split('\n').map((s) => s.trim()).filter(Boolean)
  const go = () => {
    if (ai.engine === 'quick') { setCats(txns.map((t) => { const c = ruleCategory(t.description, t.amount); return list.includes(c) ? c : 'Other' })); setConf(txns.map(() => 1)); return }
    void ai.run(async () => {
      // describe each category in a few words so the model has more to match than one word
      const desc = list.map((l) => { const c = CATEGORIES.find((x) => x.name === l); return c ? `${l}: ${c.hint}, ${c.words.slice(0, 6).join(', ')}` : l })
      const uniq = [...new Set(txns.map((t) => t.description.toLowerCase().replace(/\d{4,}/g, ' ').replace(/\s+/g, ' ').trim()))]
      const vecs = await ai.infer<number[][]>([...desc, ...uniq.map((u) => `Bank payment: ${u}`)], {}, { onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Reading ${Math.min(d, t)} of ${t}`) } })
      const cv = vecs.slice(0, desc.length), byDesc = new Map<string, { c: string; s: number }>()
      uniq.forEach((u, i) => { const v = vecs[desc.length + i]; let best = 0, bs = -1; cv.forEach((c, j) => { const s = dot(v, c); if (s > bs) { bs = s; best = j } }); byDesc.set(u, { c: list[best], s: bs }) })
      const out = txns.map((t) => {
        const r = byDesc.get(t.description.toLowerCase().replace(/\d{4,}/g, ' ').replace(/\s+/g, ' ').trim())
        const rule = ruleCategory(t.description, t.amount)
        // a keyword hit beats a weak model guess
        return rule !== 'Other' && list.includes(rule) && (r?.s ?? 0) < 0.45 ? { c: rule, s: 0.9 } : r ?? { c: 'Other', s: 0 }
      })
      setCats(out.map((o) => o.c)); setConf(out.map((o) => o.s))
    })
  }
  const labelled: Txn[] = useMemo(() => txns.map((t, i) => ({ ...t, category: cats?.[i] ?? t.category })), [txns, cats])
  const totals = useMemo(() => { const m = new Map<string, number>(); labelled.forEach((t) => { if (t.amount < 0 && t.category) m.set(t.category, (m.get(t.category) ?? 0) - t.amount) }); return [...m.entries()].map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value) }, [labelled])
  return (
    <ToolGrid
      main={<>
        <StatementDrop st={st} label="Drop a bank statement to label" sub="OFX, QIF, CAMT, MT940 or CSV. Each payment gets a category on your device. Nothing is uploaded." />
        {txns.length > 0 ? <>
          {cats && totals.length > 0 && <div className="rounded-2xl border border-border bg-surface p-4"><Label>Spending by category</Label><Bars items={totals} /></div>}
          <TxnTable txns={labelled} currency={st.stmt?.currency} extra={{ head: 'Category', cell: (t, i) => cats ? <Select aria-label="Category" className="h-8 min-w-36 text-xs" value={t.category ?? 'Other'} onChange={(v) => setCats((c) => c && c.map((x, j) => (j === i ? v : x)))} options={[...new Set([...list, 'Other'])]} /> : <span className="text-xs text-muted">{conf.length ? '' : 'Press Label'}</span> }} />
        </> : st.file && !st.error && <Empty>No transactions yet. Check the columns on the right.</Empty>}
      </>}
      side={<>
        <CsvColumns st={st} />
        <div onClickCapture={() => { picked.current = true }}><EnginePanel ai={ai} quickLabel="Keyword rules" quickNote="Keyword rules match well known shop and service names. Instant, no download. The AI model also understands names it has never seen." /></div>
        <div><Label hint={`${list.length}`}>Categories, one per line</Label><Textarea value={labels} onChange={(e) => setLabels(e.target.value)} className="min-h-32 text-xs" aria-label="Categories" /></div>
        <VisionProgress ai={ai} />
        <Button className="w-full" icon={<Tags className="size-4" />} loading={ai.busy} disabled={!txns.length} onClick={go}>Label {txns.length || ''} transactions</Button>
        {cats && <div className="grid grid-cols-2 gap-2">
          <DlButton name={() => `${baseName(st.file?.name ?? 'statement')}-labelled.csv`} data={() => exportTxns(labelled, 'csv')}>CSV</DlButton>
          <DlButton name={() => `${baseName(st.file?.name ?? 'statement')}-labelled.xlsx`} data={() => exportTxns(labelled, 'xlsx')}>Excel</DlButton>
          <DlButton name={() => `${baseName(st.file?.name ?? 'statement')}-labelled.qif`} data={() => exportTxns(labelled, 'qif')}>QIF</DlButton>
          <DlButton name={() => `${baseName(st.file?.name ?? 'statement')}-labelled.json`} data={() => exportTxns(labelled, 'json')}>JSON</DlButton>
        </div>}
        <p className="text-xs text-muted">You can change any label in the table before you download. The AI compares meanings with MiniLM sentence embeddings (about 25 MB, downloaded once).</p>
      </>}
    />
  )
}

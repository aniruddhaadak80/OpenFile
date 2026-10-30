import { useMemo, useState } from 'react'
import { FileSearch } from 'lucide-react'
import { Button, Dropzone, Textarea, ToolGrid, ErrorNote, Label, Input, cn } from '@/components/ui'
import { parseEdi, ediToJson } from '@/lib/b14/data'
import { KV } from '../dev/_b5/shell'
import { DlButton } from '@/lib/bcat/kit'

const SAMPLE = 'MSH|^~\\&|LABSYS|CITYHOSP|EHR|CLINIC|20261029103000||ORU^R01|MSG00042|P|2.5\rPID|1||884421^^^CITYHOSP^MR||Rao^Asha^K||19900314|F|||12 Lake Road^^Pune^MH^411001\rPV1|1|O|LAB^^^CITYHOSP\rOBR|1||LAB9921|GLU^Glucose fasting|||20261029090000\rOBX|1|NM|GLU^Glucose||92|mg/dL|70-99|N|||F\rOBX|2|NM|HBA1C^Hemoglobin A1c||5.4|%|4.0-5.6|N|||F'

export default function EdiViewer() {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(0)
  const doc = useMemo(() => { if (!text.trim()) return null; try { return { d: parseEdi(text), error: null as string | null } } catch (e: any) { return { d: null, error: e.message as string } } }, [text])
  const d = doc?.d
  if (!text) return <div className="space-y-3"><Dropzone accept=".hl7,.edi,.x12,.txt,.dat,.edifact,.837,.835,.850,.810,.856" onFiles={async (f) => setText(await f[0].text())} label="Drop an HL7, X12 or EDIFACT file" sub="Read healthcare (HL7 v2) and business EDI messages (X12 850, 810, 837, EDIFACT ORDERS, INVOIC) as a clear table, then export JSON." /><Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>Try a sample HL7 lab result</Button></div>
  const segs = d?.segments.map((s, i) => ({ s, i })).filter(({ s }) => !q || s.id.toLowerCase().includes(q.toLowerCase()) || s.elements.some((e) => e.some((r) => r.some((c) => c.toLowerCase().includes(q.toLowerCase()))))) ?? []
  return (
    <ToolGrid
      main={<>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-28 font-mono text-[11px]" aria-label="EDI message" />
        <ErrorNote error={doc?.error ?? null} />
        {d && <>
          <div className="grid gap-2 sm:grid-cols-3">{Object.entries(d.summary).filter(([, v]) => v).map(([k, v]) => <KV key={k} label={k} value={v} mono={false} />)}</div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search segments and values" aria-label="Search" />
          <div className="space-y-1.5">{segs.map(({ s, i }) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border bg-surface">
              <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left" aria-expanded={open === i}>
                <span className="w-12 font-mono text-sm font-bold text-accent">{s.id}</span><span className="text-sm">{s.name ?? 'Segment'}</span><span className="ml-auto truncate font-mono text-[11px] text-muted">{s.elements.length} fields</span>
              </button>
              {open === i && <div className="border-t border-border">{s.elements.map((e, k) => { const val = e.map((r) => r.join(` ${d.seps.component} `)).join(` ${d.seps.repeat || '~'} `); if (!val.trim()) return null; return <div key={k} className={cn('grid grid-cols-[4.5rem_1fr] gap-2 px-3 py-1 text-xs', k % 2 === 1 && 'bg-surface-2/30')}><span className="font-mono text-muted">{s.id}-{k + 1}</span><span className="break-all font-mono">{e.length > 1 || e[0].length > 1 ? e.map((r, ri) => <span key={ri} className="mr-2 inline-flex flex-wrap gap-1">{r.map((c, ci) => <span key={ci} className="rounded bg-surface-2 px-1">{c || ' '}</span>)}</span>) : e[0][0]}</span></div> })}</div>}
            </div>))}</div>
        </>}
      </>}
      side={<>
        {d && <><Label>{d.kind}</Label><p className="text-xs text-muted">{d.segments.length} segments. Separators: field <code>{d.seps.element}</code>, component <code>{d.seps.component}</code>{d.seps.repeat ? <>, repeat <code>{d.seps.repeat}</code></> : null}.</p>
          <DlButton className="w-full" name={`message-${d.kind.toLowerCase()}.json`} mime="application/json" data={() => JSON.stringify(ediToJson(d), null, 2)}>Download JSON</DlButton></>}
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setText('')}>Open another</Button>
        <p className="flex gap-1.5 text-xs text-muted"><FileSearch className="size-4 shrink-0" />Health and order data stays on your device. Field names follow the segment position (PID-5 is the patient name).</p>
      </>}
    />
  )
}

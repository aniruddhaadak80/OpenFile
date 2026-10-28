import { useEffect, useMemo, useState } from 'react'
import { FormInput, Type, AlignLeft, CheckSquare, CircleDot, ChevronDownSquare, List, PenLine, MousePointer2, Trash2, Copy, Save } from 'lucide-react'
import { Button, Dropzone, ResultCard, Switch, ToolGrid, Progress, ErrorNote, Input, Textarea, Spinner, Field, Select, Slider, cn, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT, PageStepper, usePdfDoc } from './_core/kit'
import { readBytes, Note, RectEditor, usePage, uid, vpToPdf } from './_b1/ui'
import type { FieldKind } from './_b1/forms'

type F = { id: string; kind: FieldKind; name: string; page: number; x0: number; y0: number; x1: number; y1: number; value: string; options: string; checked: boolean; required: boolean; readOnly: boolean; fontSize: number; maxLength: number; radioValue: string; tooltip: string; align: 'left' | 'center' | 'right' }
const KINDS: { kind: FieldKind; label: string; icon: any; color: string; size: [number, number] }[] = [
  { kind: 'text', label: 'Text', icon: Type, color: '#F5A524', size: [160, 20] },
  { kind: 'multiline', label: 'Paragraph', icon: AlignLeft, color: '#FB923C', size: [220, 70] },
  { kind: 'checkbox', label: 'Checkbox', icon: CheckSquare, color: '#2DD4BF', size: [14, 14] },
  { kind: 'radio', label: 'Radio', icon: CircleDot, color: '#22D3EE', size: [14, 14] },
  { kind: 'dropdown', label: 'Dropdown', icon: ChevronDownSquare, color: '#38BDF8', size: [150, 20] },
  { kind: 'list', label: 'List', icon: List, color: '#60A5FA', size: [150, 60] },
  { kind: 'signature', label: 'Signature', icon: PenLine, color: '#84CC16', size: [180, 50] },
]
const kindOf = (k: FieldKind) => KINDS.find((x) => x.kind === k)!

export default function CreatePdfForm() {
  const [file, setFile] = useState<File | null>(null)
  const { doc, numPages, error } = usePdfDoc(file)
  const [page, setPage] = useState(0)
  const img = usePage(doc, page + 1, 760)
  const [tool, setTool] = useState<FieldKind | null>('text')
  const [fields, setFields] = useState<F[]>([])
  const [existing, setExisting] = useState<string[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [result, setResult] = useState<Blob | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setFields([]); setResult(null); setSel(null); setPage(0) }

  useEffect(() => { if (!file) return; import('./_b1/forms').then(async (m) => setExisting(await m.existingFieldNames(await readBytes(file)))).catch(() => {}) }, [file])
  const onPage = useMemo(() => fields.filter((f) => f.page === page), [fields, page])
  const cur = fields.find((f) => f.id === sel)
  const upd = (id: string, p: Partial<F>) => { setFields((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x))); setResult(null) }
  const nextName = (k: FieldKind) => {
    const base = k === 'radio' ? 'Choice' : kindOf(k).label
    const used = new Set([...fields.map((f) => f.name), ...existing])
    if (k === 'radio') { const last = [...fields].reverse().find((f) => f.kind === 'radio'); if (last) return last.name }
    let i = 1; while (used.has(`${base} ${i}`)) i++; return `${base} ${i}`
  }
  const create = (r: { x0: number; y0: number; x1: number; y1: number }) => {
    if (!tool) return
    const k = kindOf(tool)
    // a tiny drag or a click: use the default size for this field type
    let { x0, y0, x1, y1 } = r
    if (x1 - x0 < 10 && y1 - y0 < 10 && img) { x1 = Math.min(img.w, x0 + k.size[0]); y1 = Math.min(img.h, y0 + k.size[1]) }
    if (tool === 'checkbox' || tool === 'radio') { const s = Math.max(10, Math.min(x1 - x0, y1 - y0)); x1 = x0 + s; y1 = y0 + s }
    const name = nextName(tool)
    const radioCount = fields.filter((f) => f.kind === 'radio' && f.name === name).length
    const f: F = { id: uid(), kind: tool, name, page, x0, y0, x1, y1, value: '', options: 'Option 1\nOption 2\nOption 3', checked: false, required: false, readOnly: false, fontSize: 0, maxLength: 0, radioValue: `Option ${radioCount + 1}`, tooltip: '', align: 'left' }
    setFields((a) => [...a, f]); setSel(f.id); setResult(null)
  }
  const duplicate = () => { if (!cur) return; const h = cur.y1 - cur.y0; const f = { ...cur, id: uid(), y0: cur.y0 + h + 6, y1: cur.y1 + h + 6, name: cur.kind === 'radio' ? cur.name : nextName(cur.kind), radioValue: cur.kind === 'radio' ? `Option ${fields.filter((x) => x.kind === 'radio' && x.name === cur.name).length + 1}` : cur.radioValue, checked: false }; setFields((a) => [...a, f]); setSel(f.id); setResult(null) }

  const save = () => job.run(async (setP) => {
    if (!file || !doc) return
    if (!fields.length) throw new Error('Add at least one field first.')
    const m = await import('./_b1/forms'); setP(0.2)
    const specs = []
    for (const f of fields) {
      const vp = (await doc.getPage(f.page + 1)).getViewport({ scale: 1 })
      specs.push({ kind: f.kind, name: f.name, page: f.page, rect: vpToPdf(vp, f), value: f.value, options: f.options.split('\n'), checked: f.checked, required: f.required, readOnly: f.readOnly, fontSize: f.fontSize, maxLength: f.maxLength || undefined, radioValue: f.radioValue, tooltip: f.tooltip, align: f.align })
    }
    setResult(pdfBlob(await m.createFields(await readBytes(file), specs))); setP(1); toast(`Saved ${fields.length} fields`, 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to turn it into a fillable form" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {error && <ErrorNote error={error} />}
      {result && <ResultCard blob={result} filename={`${baseName(file.name)}-fillable.pdf`} title="Fillable PDF ready" onReset={reset} />}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setTool(null)} className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer', tool === null ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}><MousePointer2 className="size-3.5" />Select</button>
            {KINDS.map((k) => <button key={k.kind} type="button" onClick={() => setTool(k.kind)} className={cn('inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer', tool === k.kind ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-fg')}><k.icon className="size-3.5" />{k.label}</button>)}
            <div className="flex-1" />
            {numPages > 1 && <PageStepper page={page} total={numPages} onChange={(p) => { setPage(p); setSel(null) }} />}
          </div>
          <div className="checker flex min-h-80 items-center justify-center rounded-xl p-4">
            {img ? <div className="w-full max-w-[760px]"><RectEditor src={img.src} pageW={img.w} pageH={img.h} drawEnabled={!!tool} selected={sel} onSelect={setSel} minSize={0}
              rects={onPage.map((f) => ({ id: f.id, x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, label: f.kind === 'radio' ? `${f.name}: ${f.radioValue}` : f.name, color: kindOf(f.kind).color }))}
              onChange={(id, r) => upd(id, r)} onCreate={create} /></div> : <Spinner label="Rendering…" />}
          </div>
          <div className="mt-2 text-xs text-muted">Pick a field type, then click or drag on the page. Drag a field to move it, use its corner to resize, arrow keys to nudge (Alt + arrows resize).</div>
        </div>}
        side={<>
          {cur ? <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">{(() => { const K = kindOf(cur.kind); return <><K.icon className="size-4" style={{ color: K.color }} />{K.label} field</> })()}</div>
            <Field label={cur.kind === 'radio' ? 'Group name' : 'Field name'}><Input value={cur.name} onChange={(e) => upd(cur.id, { name: e.target.value })} /></Field>
            {cur.kind === 'radio' && <Field label="This option's value"><Input value={cur.radioValue} onChange={(e) => upd(cur.id, { radioValue: e.target.value })} /></Field>}
            {(cur.kind === 'text' || cur.kind === 'multiline') && <>
              <Field label="Default text"><Input value={cur.value} onChange={(e) => upd(cur.id, { value: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Max characters"><Input type="number" min={0} value={cur.maxLength} onChange={(e) => upd(cur.id, { maxLength: Math.max(0, Number(e.target.value)) })} /></Field>
                <Field label="Align"><Select value={cur.align} onChange={(v) => upd(cur.id, { align: v })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} /></Field>
              </div>
            </>}
            {(cur.kind === 'dropdown' || cur.kind === 'list') && <>
              <Field label="Choices (one per line)"><Textarea className="min-h-24" value={cur.options} onChange={(e) => upd(cur.id, { options: e.target.value })} /></Field>
              <Field label="Selected by default"><Select value={cur.value} onChange={(v) => upd(cur.id, { value: v })} options={[{ value: '', label: 'None' }, ...cur.options.split('\n').map((o) => o.trim()).filter(Boolean).map((o) => ({ value: o, label: o }))]} /></Field>
            </>}
            {['text', 'multiline', 'dropdown', 'list'].includes(cur.kind) && <Slider label="Font size" value={cur.fontSize} min={0} max={24} onChange={(v) => upd(cur.id, { fontSize: v })} suffix={cur.fontSize ? ' pt' : ' (auto)'} />}
            {(cur.kind === 'checkbox' || cur.kind === 'radio') && <Switch checked={cur.checked} onChange={(v) => setFields((a) => a.map((x) => x.id === cur.id ? { ...x, checked: v } : (v && cur.kind === 'radio' && x.kind === 'radio' && x.name === cur.name ? { ...x, checked: false } : x)))} label="Checked by default" />}
            <Field label="Tooltip"><Input value={cur.tooltip} placeholder="Help text shown on hover" onChange={(e) => upd(cur.id, { tooltip: e.target.value })} /></Field>
            {cur.kind !== 'signature' && <div className="space-y-2"><Switch checked={cur.required} onChange={(v) => upd(cur.id, { required: v })} label="Required" /><Switch checked={cur.readOnly} onChange={(v) => upd(cur.id, { readOnly: v })} label="Read only" /></div>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" icon={<Copy className="size-3.5" />} onClick={duplicate}>Duplicate below</Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => { setFields((a) => a.filter((x) => x.id !== cur.id)); setSel(null); setResult(null) }}>Delete</Button>
            </div>
          </div> : <Note>Select a field to change its name, default value and choices. Radio buttons with the same group name work together, so only one can be picked.</Note>}
          <div className="border-t border-border pt-3 text-xs text-muted">{fields.length} new field{fields.length === 1 ? '' : 's'}{existing.length ? ` · ${existing.length} already in the file (kept)` : ''}</div>
          {job.busy && <Progress value={job.progress} label="Saving…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Save className="size-5" />} loading={job.busy} disabled={!fields.length} onClick={save}>Save fillable PDF</Button>
          <div className="flex items-center justify-center gap-1 text-xs text-muted"><FormInput className="size-3" />Fields work in Acrobat, browsers and most PDF apps.</div>
        </>}
      />
    </div>
  )
}

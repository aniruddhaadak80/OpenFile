import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ClipboardList, Download, RotateCcw, Eraser, FileJson, Upload, CheckSquare, Lock, PenLine, AlertTriangle, Asterisk } from 'lucide-react'
import { Button, Dropzone, FileChip, Label, Input, Textarea, Select, Switch, Spinner, ErrorNote, ResultCard, Progress, useJob, cn, Empty } from '@/components/ui'
import { toast } from '@/components/toast'
import { pdfBlob } from '@/lib/pdf'
import { renameExt, downloadBlob, baseName } from '@/lib/files'
import { usePdfPages, fromPdf, type PageInfo } from './_adv/pages'
import { readFields, fillForm, type FieldInfo, type FieldValue } from './_adv/forms'
import { PageNav } from './_adv/ui'

export default function FillPdfForm() {
  const [file, setFile] = useState<File | null>(null)
  const { pages, total, error: loadErr } = usePdfPages(file, 1.4)
  const [fields, setFields] = useState<FieldInfo[] | null>(null)
  const [hasXfa, setHasXfa] = useState(false)
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [cur, setCur] = useState(0)
  const [focus, setFocus] = useState<string | null>(null)
  const [flatten, setFlatten] = useState(false)
  const [scope, setScope] = useState<'page' | 'all'>('all')
  const [result, setResult] = useState<{ blob: Blob; warning: string | null } | null>(null)
  const [readErr, setReadErr] = useState<string | null>(null)
  const job = useJob()
  const jsonInput = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file) return
    let alive = true
    setFields(null); setReadErr(null)
    file.arrayBuffer().then((b) => readFields(b)).then((r) => {
      if (!alive) return
      setFields(r.fields); setHasXfa(r.hasXfa)
      setValues(Object.fromEntries(r.fields.map((f) => [f.name, f.value])))
    }).catch((e) => { if (alive) setReadErr(e?.message || 'Could not read the form in this PDF') })
    return () => { alive = false }
  }, [file])

  const fillable = useMemo(() => (fields ?? []).filter((f) => ['text', 'checkbox', 'radio', 'dropdown', 'list'].includes(f.kind)), [fields])
  const filled = fillable.filter((f) => { const v = values[f.name]; return Array.isArray(v) ? v.length : typeof v === 'boolean' ? v : !!v }).length
  const missing = fillable.filter((f) => f.required && !(Array.isArray(values[f.name]) ? (values[f.name] as string[]).length : values[f.name]))
  const visible = scope === 'all' ? fillable : fillable.filter((f) => f.widgets.some((w) => w.page === cur))
  const set = (name: string, v: FieldValue) => setValues((s) => ({ ...s, [name]: v }))
  const reset = () => { setFile(null); setFields(null); setValues({}); setResult(null); setCur(0) }

  function jumpTo(f: FieldInfo, focusInput = true) {
    setFocus(f.name)
    const pg = f.widgets[0]?.page
    if (pg !== undefined && pg !== cur) setCur(pg)
    if (focusInput) requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(f.name)}"]`)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      el?.querySelector<HTMLElement>('input,textarea,select,button')?.focus({ preventScroll: true })
    })
  }

  async function save() {
    if (!file) return
    const out = await job.run(async (p) => { p(0.3); const r = await fillForm(await file.arrayBuffer(), values, flatten); p(1); return r })
    if (out) { setResult({ blob: pdfBlob(out.bytes), warning: out.warning }); toast(flatten ? 'Form filled and flattened' : 'Form filled') }
  }

  function exportJson() {
    downloadBlob(JSON.stringify(values, null, 2), `${baseName(file!.name)}-form-data.json`, 'application/json')
  }
  async function importJson(f: File) {
    try {
      const data = JSON.parse(await f.text())
      let n = 0
      setValues((s) => { const next = { ...s }; for (const k of Object.keys(data)) if (k in next) { next[k] = data[k]; n++ } return next })
      setTimeout(() => toast(`Loaded values for ${n} field${n === 1 ? '' : 's'}`), 0)
    } catch { toast('That is not a valid JSON data file', 'error') }
  }

  if (!file) return <Dropzone accept="application/pdf,.pdf" onFiles={(f) => setFile(f[0])} label="Drop a fillable PDF form" sub="Text boxes, checkboxes, radio buttons and dropdowns are detected automatically." />

  if (result) return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <ResultCard blob={result.blob} filename={renameExt(file.name, 'pdf', flatten ? '-filled-flat' : '-filled')} title={`${filled} of ${fillable.length} fields filled`} onReset={reset}>
        {result.warning && <div className="mb-2 flex gap-2 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn"><AlertTriangle className="size-4 shrink-0" />{result.warning}</div>}
        <button className="text-xs text-muted hover:text-fg hover:underline cursor-pointer" onClick={() => setResult(null)}>Back to the form</button>
      </ResultCard>
    </motion.div>
  )

  const page = pages[cur]
  const noFields = fields && fillable.length === 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-3">
        <ErrorNote error={loadErr || readErr} />
        {page ? (
          <div className="overflow-auto rounded-2xl border border-border bg-surface-2/50 p-3 sm:p-6 checker">
            <div className="mx-auto" style={{ maxWidth: Math.round(Math.min(800, page.w * 1.3)) }}>
              <FormPage page={page} fields={fillable} values={values} focus={focus} onPick={(f) => jumpTo(f)} onToggle={(f, opt) => {
                if (f.readOnly) return
                if (f.kind === 'checkbox') set(f.name, !values[f.name])
                else if (f.kind === 'radio' && opt) set(f.name, opt)
              }} />
            </div>
          </div>
        ) : !loadErr && <div className="grid h-96 place-items-center rounded-2xl border border-border bg-surface-2/40"><Spinner label="Rendering pages…" /></div>}
        {total > 0 && <PageNav pages={pages} total={total} current={cur} onChange={setCur}
          badge={(i) => { const n = fillable.filter((f) => f.widgets[0]?.page === i).length; return n ? <span className="absolute right-1 top-1 rounded-full bg-accent px-1 text-[9px] font-bold text-on-accent">{n}</span> : null }} />}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <FileChip file={file} onRemove={reset} />
          {!fields && !readErr && <Spinner label="Detecting form fields…" />}
          {hasXfa && <div className="flex gap-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn"><AlertTriangle className="size-4 shrink-0" />This is an XFA (LiveCycle) form. Its AcroForm fields are filled and the XFA layer is removed so every reader shows your values.</div>}
          {noFields && (
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="space-y-3 rounded-xl border border-dashed border-border p-5 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted"><ClipboardList className="size-6" /></div>
              <div className="font-semibold">No fillable fields found</div>
              <p className="text-sm text-muted">This PDF doesn't contain interactive form fields (it may be a scanned or printed form). You can still type on it with <Link to="/edit-pdf" className="text-accent hover:underline">Edit PDF</Link> or sign it with <Link to="/sign-pdf" className="text-accent hover:underline">Sign PDF</Link>.</p>
            </motion.div>
          )}
          {fields && fillable.length > 0 && (<>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted"><span>{filled} of {fillable.length} filled</span>{missing.length > 0 && <span className="text-warn">{missing.length} required left</span>}</div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><motion.div className="h-full rounded-full bg-gradient-brand" animate={{ width: `${(filled / fillable.length) * 100}%` }} /></div>
            </div>
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                {(['all', 'page'] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={cn('rounded-md px-2.5 py-1 transition cursor-pointer', scope === s ? 'bg-surface-2 font-medium text-fg' : 'text-muted')}>{s === 'all' ? 'All fields' : `Page ${cur + 1}`}</button>)}
              </div>
              <div className="flex gap-1">
                <IconBtn title="Reset to original" onClick={() => setValues(Object.fromEntries(fields.map((f) => [f.name, f.value])))}><RotateCcw className="size-3.5" /></IconBtn>
                <IconBtn title="Clear all" onClick={() => setValues(Object.fromEntries(fillable.map((f) => [f.name, f.kind === 'checkbox' ? false : f.kind === 'list' ? [] : ''])))}><Eraser className="size-3.5" /></IconBtn>
                <IconBtn title="Export data (JSON)" onClick={exportJson}><FileJson className="size-3.5" /></IconBtn>
                <IconBtn title="Import data (JSON)" onClick={() => jsonInput.current?.click()}><Upload className="size-3.5" /></IconBtn>
                <input ref={jsonInput} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
              </div>
            </div>
            <div ref={listRef} className="-mx-1 max-h-[52vh] space-y-2.5 overflow-y-auto px-1 py-1 scrollbar-thin">
              {visible.length === 0 && <Empty>No fields on this page.</Empty>}
              {visible.map((f) => (
                <div key={f.name} data-field={f.name} onFocusCapture={() => jumpTo(f, false)} className={cn('rounded-xl border p-3 transition', focus === f.name ? 'border-accent bg-accent/5 ring-2 ring-accent/15' : 'border-border')}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
                    <span className="truncate capitalize">{f.label}</span>
                    {f.required && <Asterisk className="size-3 text-danger" />}
                    {f.readOnly && <Lock className="size-3" />}
                    <span className="ml-auto shrink-0 font-mono text-[10px] opacity-60">p{(f.widgets[0]?.page ?? 0) + 1}</span>
                  </div>
                  <FieldInput f={f} value={values[f.name]} onChange={(v) => set(f.name, v)} />
                </div>
              ))}
            </div>
            {fields.some((f) => f.kind === 'signature') && <div className="flex items-center gap-2 text-xs text-muted"><PenLine className="size-3.5" />Signature fields can be signed afterwards with Sign PDF.</div>}
            <div className="space-y-1 border-t border-border pt-4">
              <Switch checked={flatten} onChange={setFlatten} label={<span className="text-sm">Flatten (make values permanent)</span>} />
              <p className="text-xs text-muted">{flatten ? 'Fields are merged into the page and can no longer be edited.' : 'Fields stay editable in any PDF reader.'}</p>
            </div>
            {job.busy && <Progress value={job.progress} label="Writing form…" />}
            <ErrorNote error={job.error} />
            <Button size="lg" className="w-full" icon={<Download className="size-4" />} loading={job.busy} onClick={save}>Save filled PDF</Button>
          </>)}
        </div>
      </aside>
    </div>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg cursor-pointer">{children}</button>
}

function FieldInput({ f, value, onChange }: { f: FieldInfo; value: FieldValue | undefined; onChange: (v: FieldValue) => void }) {
  const dis = f.readOnly
  if (f.kind === 'text') {
    const s = String(value ?? '')
    const counter = f.maxLength ? <div className="mt-1 text-right font-mono text-[10px] text-muted">{s.length}/{f.maxLength}</div> : null
    return f.multiline
      ? <><Textarea aria-label={f.label} value={s} disabled={dis} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} className="min-h-20 font-sans" />{counter}</>
      : <><Input aria-label={f.label} value={s} disabled={dis} maxLength={f.maxLength} onChange={(e) => onChange(e.target.value)} />{counter}</>
  }
  if (f.kind === 'checkbox') return (
    <button type="button" disabled={dis} onClick={() => onChange(!value)} className={cn('flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition cursor-pointer disabled:opacity-50', value ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40')}>
      <span className={cn('grid size-4 place-items-center rounded border', value ? 'border-accent bg-accent text-on-accent' : 'border-border')}>{value && <CheckSquare className="size-3" />}</span>{value ? 'Checked' : 'Not checked'}
    </button>
  )
  if (f.kind === 'radio') return (
    <div className="flex flex-wrap gap-1.5">
      {(f.options ?? []).map((o) => (
        <button key={o} type="button" disabled={dis} onClick={() => onChange(value === o ? '' : o)} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition cursor-pointer', value === o ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40')}>
          <span className={cn('size-3 rounded-full border', value === o ? 'border-4 border-accent' : 'border-border')} />{o}
        </button>
      ))}
    </div>
  )
  if (f.kind === 'dropdown') {
    const opts = f.options ?? []
    const s = String(value ?? '')
    return (
      <div className="space-y-1.5">
        <label className="block"><span className="sr-only">{f.label}</span><Select value={opts.includes(s) ? s : s ? '__custom' : ''} onChange={(v) => onChange(v === '__custom' ? s || ' ' : v)}
          options={[{ value: '', label: '(select)' }, ...opts.map((o) => ({ value: o, label: o })), ...(f.editable ? [{ value: '__custom', label: 'Other…' }] : [])]} /></label>
        {f.editable && s && !opts.includes(s) && <Input aria-label={`${f.label}, custom value`} value={s.trim()} onChange={(e) => onChange(e.target.value)} placeholder="Custom value" />}
      </div>
    )
  }
  if (f.kind === 'list') {
    const arr = Array.isArray(value) ? value : []
    return (
      <div className="flex flex-wrap gap-1.5">
        {(f.options ?? []).map((o) => {
          const on = arr.includes(o)
          return <button key={o} type="button" disabled={dis} onClick={() => onChange(f.multi ? (on ? arr.filter((x) => x !== o) : [...arr, o]) : (on ? [] : [o]))} className={cn('rounded-lg border px-2.5 py-1 text-xs transition cursor-pointer', on ? 'border-accent bg-accent/10 text-fg' : 'border-border text-muted hover:border-accent/40')}>{o}</button>
        })}
      </div>
    )
  }
  return null
}

function FormPage({ page, fields, values, focus, onPick, onToggle }: { page: PageInfo; fields: FieldInfo[]; values: Record<string, FieldValue>; focus: string | null; onPick: (f: FieldInfo) => void; onToggle: (f: FieldInfo, opt?: string) => void }) {
  const boxes = fields.flatMap((f) => f.widgets.filter((w) => w.page === page.index).map((w, i) => {
    const a = fromPdf(page.t, w.x, w.y), b = fromPdf(page.t, w.x + w.w, w.y + w.h)
    const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1])
    return { f, w, key: `${f.name}#${i}`, x, y, bw: Math.abs(b[0] - a[0]), bh: Math.abs(b[1] - a[1]) }
  }))
  return (
    <div className="relative w-full bg-white shadow-xl ring-1 ring-black/10" style={{ aspectRatio: `${page.w} / ${page.h}`, containerType: 'inline-size' } as React.CSSProperties}>
      <img src={page.src} alt={`Page ${page.index + 1}`} className="absolute inset-0 h-full w-full" draggable={false} />
      <AnimatePresence>
        {boxes.map(({ f, w, key, x, y, bw, bh }) => {
          const v = values[f.name]
          const active = focus === f.name
          const isOn = f.kind === 'checkbox' ? !!v : f.kind === 'radio' ? v === w.option : false
          const txt = f.kind === 'text' ? String(v ?? '') : f.kind === 'dropdown' ? String(v ?? '') : f.kind === 'list' ? (Array.isArray(v) ? v.join(', ') : '') : ''
          return (
            <motion.button type="button" key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} title={f.label}
              onClick={() => { if (f.kind === 'checkbox' || f.kind === 'radio') onToggle(f, w.option); onPick(f) }}
              className={cn('absolute overflow-hidden rounded-[2px] border text-left transition cursor-pointer', active ? 'border-accent bg-accent/20 ring-2 ring-accent/40' : 'border-sky-500/60 bg-sky-400/15 hover:bg-sky-400/25')}
              style={{ left: `${(x / page.w) * 100}%`, top: `${(y / page.h) * 100}%`, width: `${(bw / page.w) * 100}%`, height: `${(bh / page.h) * 100}%` }}>
              {(f.kind === 'checkbox' || f.kind === 'radio') && isOn && <span className="absolute inset-0 grid place-items-center font-bold text-slate-900" style={{ fontSize: `${Math.min(bw, bh) * 0.85 / page.w * 100}cqw` }}>{f.kind === 'checkbox' ? '✓' : '●'}</span>}
              {txt && <span className={cn('absolute inset-x-0.5 text-slate-900', f.multiline ? 'top-0 whitespace-pre-wrap' : 'top-1/2 -translate-y-1/2 truncate')} style={{ fontSize: `${Math.min(bh * (f.multiline ? 0.18 : 0.62), 14) / page.w * 100}cqw`, lineHeight: 1.15 }}>{txt}</span>}
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

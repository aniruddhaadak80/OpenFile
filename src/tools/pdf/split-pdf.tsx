import { useEffect, useMemo, useRef, useState } from 'react'
import { Scissors } from 'lucide-react'
import { Button, Dropzone, Field, Input, ResultCard, Segmented, Slider, Switch, ToolGrid, Progress, ErrorNote, Spinner, useJob } from '@/components/ui'
import { usePdfThumbs } from '@/components/PdfThumbs'
import { pdfBlob, openPdfJs, allText, type PdfJsDoc } from '@/lib/pdf'
import { groupsFromStarts, groupsFromSeparators, textStarts, bookmarkStarts, scanPage, slugPart, type SplitPlan, type PageScan } from './_b1/splitPoints'
import { baseName, formatBytes } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, MultiResult, PDF_ACCEPT, Thumb, ops, readBytes, motion, type OutFile } from './_core/kit'

type Mode = 'ranges' | 'every' | 'each' | 'size' | 'bookmarks' | 'text' | 'separator'
type SepKind = 'blank' | 'qr' | 'both'
const SMART: Mode[] = ['bookmarks', 'text', 'separator']
// gold, teal, cyan, emerald and sky tones only
const HUES = [40, 175, 190, 152, 199, 28, 160, 210, 48, 140]

function rangesGroups(input: string, total: number): { groups: number[][]; error: string | null } {
  const g: number[][] = []
  for (const part of input.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d*)\s*-\s*(\d*)$/)
    let a: number, b: number
    if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : total } else if (/^\d+$/.test(part)) a = b = +part
    else return { groups: g, error: `"${part}" isn't a range, use 1-3, 5, 8-` }
    const lo = Math.max(1, Math.min(a, b)), hi = Math.min(total, Math.max(a, b))
    if (lo > total) return { groups: g, error: `Page ${lo} is beyond the end of the document (${total} pages)` }
    const arr: number[] = []
    if (a <= b) for (let i = lo; i <= hi; i++) arr.push(i - 1); else for (let i = hi; i >= lo; i--) arr.push(i - 1)
    g.push(arr)
  }
  return { groups: g, error: null }
}

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, numPages, error: loadErr, loading } = usePdfThumbs(file)
  const [mode, setMode] = useState<Mode>('ranges')
  const [ranges, setRanges] = useState('')
  const [every, setEvery] = useState(2)
  const [sizeMb, setSizeMb] = useState(2)
  const [single, setSingle] = useState(false)
  const [results, setResults] = useState<OutFile[] | null>(null)
  const job = useJob()
  // smart modes
  const [depth, setDepth] = useState<'1' | '2'>('1')
  const [query, setQuery] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [caseSens, setCaseSens] = useState(false)
  const [sepKind, setSepKind] = useState<SepKind>('blank')
  const [inkPct, setInkPct] = useState(0.5)
  const [qrFilter, setQrFilter] = useState('')
  const [dropSep, setDropSep] = useState(true)
  const [doc, setDoc] = useState<PdfJsDoc | null>(null)
  const [texts, setTexts] = useState<string[] | null>(null)
  const [scans, setScans] = useState<{ qr: boolean; list: PageScan[] } | null>(null)
  const [scanP, setScanP] = useState<number | null>(null)
  const [smart, setSmart] = useState<SplitPlan | null>(null)
  const [smartErr, setSmartErr] = useState<string | null>(null)
  const scanToken = useRef(0)
  const isSmart = SMART.includes(mode)

  useEffect(() => { setDoc(null); setTexts(null); setScans(null); setSmart(null); setSmartErr(null); scanToken.current++ }, [file])
  useEffect(() => {
    if (!file || !isSmart || doc) return
    let alive = true
    openPdfJs(file).then((d) => { if (alive) setDoc(d) }).catch(() => alive && setSmartErr('This PDF could not be opened for analysis.'))
    return () => { alive = false }
  }, [file, isSmart, doc])
  useEffect(() => {
    if (mode !== 'text' || !doc || texts) return
    let alive = true
    allText(doc).then((t) => { if (alive) setTexts(t) }).catch(() => alive && setSmartErr('Could not read the text of this PDF.'))
    return () => { alive = false }
  }, [mode, doc, texts])
  useEffect(() => {
    if (mode !== 'separator' || !doc) return
    const wantQr = sepKind !== 'blank'
    if (scans && (scans.qr || !wantQr)) return
    const t = ++scanToken.current
    ;(async () => {
      const list: PageScan[] = []
      setScanP(0)
      for (let i = 0; i < doc.numPages; i++) {
        if (t !== scanToken.current) return
        try { list.push(await scanPage(doc, i, wantQr)) } catch { list.push({ ink: 1, qr: null }) }
        setScanP((i + 1) / doc.numPages)
      }
      if (t === scanToken.current) { setScans({ qr: wantQr, list }); setScanP(null) }
    })()
  }, [mode, doc, sepKind, scans])
  useEffect(() => {
    if (!isSmart || !numPages) { setSmart(null); return }
    let alive = true
    ;(async () => {
      if (mode === 'bookmarks') {
        if (!doc) return
        const b = await bookmarkStarts(doc, +depth)
        if (!alive) return
        if (!b.starts.length) { setSmart(null); setSmartErr('This PDF has no bookmarks to split by. Try the text or separator modes, or add bookmarks with Edit Bookmarks first.'); return }
        setSmartErr(null); setSmart(groupsFromStarts(b.starts, numPages, b.labels))
      } else if (mode === 'text') {
        if (!texts) return
        const r = textStarts(texts, query, { regex: useRegex, caseSensitive: caseSens })
        if (r.error) { setSmartErr(r.error); setSmart(null); return }
        if (texts.every((x) => !x.trim())) { setSmartErr('This PDF has no selectable text. Run OCR PDF on it first.'); setSmart(null); return }
        setSmartErr(query.trim() && !r.starts.length ? 'No page contains that text.' : null)
        setSmart(r.starts.length ? groupsFromStarts(r.starts, numPages, r.labels) : null)
      } else if (mode === 'separator') {
        if (!scans) { setSmart(null); return }
        const f = qrFilter.trim().toLowerCase()
        const isSep = scans.list.map((sc) => {
          const blank = sc.ink * 100 < inkPct
          const qr = !!sc.qr && (!f || sc.qr.toLowerCase().includes(f))
          return sepKind === 'blank' ? blank : sepKind === 'qr' ? qr : blank || qr
        })
        const plan = groupsFromSeparators(isSep, dropSep, scans.list.map((sc) => sc.qr))
        setSmartErr(isSep.some(Boolean) ? null : 'No separator pages found. Adjust the settings below.')
        setSmart(isSep.some(Boolean) && plan.groups.length ? plan : null)
      }
    })().catch(() => alive && setSmartErr('Could not work out the split points.'))
    return () => { alive = false }
  }, [mode, isSmart, numPages, doc, depth, texts, query, useRegex, caseSens, scans, sepKind, inkPct, qrFilter, dropSep])

  const reset = () => { setFile(null); setResults(null); setRanges(''); job.setError(null) }

  const plan = useMemo(() => {
    if (!numPages) return { groups: [] as number[][], error: null as string | null }
    if (mode === 'each') return { groups: Array.from({ length: numPages }, (_, i) => [i]), error: null }
    if (mode === 'every') { const g: number[][] = []; for (let i = 0; i < numPages; i += every) g.push(Array.from({ length: Math.min(every, numPages - i) }, (_, k) => i + k)); return { groups: g, error: null } }
    if (mode === 'ranges') return rangesGroups(ranges, numPages)
    if (isSmart) return { groups: smart?.groups ?? [], error: null }
    return { groups: [], error: null }
  }, [mode, ranges, every, numPages, isSmart, smart])
  const droppedSet = useMemo(() => new Set(isSmart ? smart?.dropped ?? [] : []), [isSmart, smart])

  const groupOf = useMemo(() => { const m = new Map<number, number>(); plan.groups.forEach((g, k) => g.forEach((p) => { if (!m.has(p)) m.set(p, k) })); return m }, [plan])
  const singleOut = mode === 'ranges' && single

  const run = () => job.run(async (setP) => {
    if (!file) return
    const o = await ops()
    const bytes = await readBytes(file)
    let groups = plan.groups
    if (mode === 'size') groups = await o.groupsBySize(bytes, sizeMb * 1024 * 1024, (p) => setP(p * 0.5))
    if (!groups.length) throw new Error(mode === 'ranges' ? 'Type at least one page range, e.g. 1-3, 4-6.' : smartErr || 'Nothing to split.')
    const base = baseName(file.name)
    if (singleOut) {
      const out = await o.pick(bytes, groups.flat())
      setResults([{ name: `${base}-extracted.pdf`, blob: pdfBlob(out), pages: groups.flat().length }])
    } else {
      const outs = await o.splitGroups(bytes, groups, (p) => setP((mode === 'size' ? 0.5 : 0) + p * (mode === 'size' ? 0.5 : 1)))
      const pad = String(groups.length).length
      setResults(outs.map((b, k) => {
        const g = groups[k]
        const smartLabel = isSmart ? slugPart(smart?.labels[k] ?? '') : ''
        const label = smartLabel ? smartLabel : mode === 'each' ? `page-${String(g[0] + 1).padStart(String(numPages).length, '0')}` : g.length === 1 ? `p${g[0] + 1}` : `p${Math.min(...g) + 1}-${Math.max(...g) + 1}`
        return { name: `${base}-${String(k + 1).padStart(pad, '0')}-${label}.pdf`, blob: pdfBlob(b), pages: g.length, note: mode === 'size' && b.length > sizeMb * 1048576 ? 'single page exceeds limit' : undefined }
      }))
    }
    setP(1); toast('Split complete', 'success')
  })

  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to split" />

  return (
    <div className="space-y-4">
      <FileBar file={file} pages={numPages} onReset={reset} />
      {results ? (
        results.length === 1
          ? <ResultCard blob={results[0].blob} filename={results[0].name} title={`${results[0].pages} page${results[0].pages === 1 ? '' : 's'} extracted`} onReset={reset} />
          : <MultiResult files={results} zipName={`${baseName(file.name)}-split.zip`} onReset={reset} originalSize={file.size} title={`Split into ${results.length} files`} />
      ) : null}
      <ToolGrid
        main={<div className="rounded-2xl border border-border bg-surface p-4">
          {loadErr ? <div className="text-sm text-danger">{loadErr}</div> : <>
            {loading && <div className="mb-3"><Spinner label={`Rendering pages… ${thumbs.length}/${numPages || '?'}`} /></div>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
              {Array.from({ length: numPages }, (_, i) => {
                const g = groupOf.get(i)
                const hue = g !== undefined ? HUES[g % HUES.length] : null
                const startsGroup = g !== undefined && plan.groups[g][0] === i
                return (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(i, 20) * 0.01 }} className="relative">
                    <Thumb src={thumbs[i]} dim={(mode === 'ranges' || isSmart) && g === undefined && plan.groups.length > 0} label={droppedSet.has(i) ? `Page ${i + 1} (separator, left out)` : `Page ${i + 1}`}
                      className={hue !== null ? '!border-transparent' : ''}
                      badge={hue !== null ? <div className="pointer-events-none absolute inset-0 rounded-xl ring-2" style={{ boxShadow: `inset 0 0 0 2px hsl(${hue} 80% 60%)`, background: `hsl(${hue} 80% 60% / .08)` }} /> : null}>
                      {startsGroup && !singleOut && <div className="absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow" style={{ background: `hsl(${hue} 70% 50%)` }}>#{g! + 1}</div>}
                    </Thumb>
                  </motion.div>
                )
              })}
            </div>
          </>}
        </div>}
        side={<>
          <Field label="Split mode">
            <Segmented value={mode} onChange={(m) => { setMode(m); setResults(null) }} className="w-full" options={[{ value: 'ranges', label: 'Ranges' }, { value: 'every', label: 'Every N' }, { value: 'each', label: 'Each page' }, { value: 'size', label: 'By size' }, { value: 'bookmarks', label: 'Bookmarks' }, { value: 'text', label: 'Text match' }, { value: 'separator', label: 'Separator pages' }]} />
          </Field>
          {mode === 'ranges' && <>
            <Field label="Page ranges" hint={plan.groups.length ? `${plan.groups.length} part${plan.groups.length > 1 ? 's' : ''}` : undefined}>
              <Input value={ranges} onChange={(e) => { setRanges(e.target.value); setResults(null) }} placeholder="e.g. 1-3, 4-8, 9-" autoFocus />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {numPages > 1 && [['First half / second half', `1-${Math.ceil(numPages / 2)}, ${Math.ceil(numPages / 2) + 1}-`], ['Remove first page', '2-'], ['Odd pages', Array.from({ length: Math.ceil(numPages / 2) }, (_, i) => i * 2 + 1).join(',')]].map(([l, v]) => (
                <button key={l} type="button" onClick={() => setRanges(v)} className="rounded-lg border border-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent cursor-pointer">{l}</button>
              ))}
            </div>
            <Switch checked={single} onChange={setSingle} label="Merge all ranges into one PDF" />
          </>}
          {mode === 'every' && <Slider label="Pages per file" value={every} min={1} max={Math.max(2, Math.min(50, numPages))} onChange={setEvery} suffix={` → ${Math.ceil(numPages / every)} files`} />}
          {mode === 'each' && <div className="text-sm text-muted">Every page becomes its own PDF ({numPages} files, delivered as a ZIP).</div>}
          {mode === 'size' && <>
            <Field label="Maximum size per file" hint={`${formatBytes(sizeMb * 1048576)}`}>
              <Input type="number" min={0.1} step={0.5} value={sizeMb} onChange={(e) => setSizeMb(Math.max(0.1, +e.target.value || 0.1))} />
            </Field>
            <div className="text-xs text-muted">Pages are grouped so each part stays under the limit (approximate, shared fonts are counted once per part). Original file: {formatBytes(file.size)}.</div>
          </>}
          {mode === 'bookmarks' && <>
            <Field label="Bookmark level">
              <Segmented value={depth} onChange={setDepth} className="w-full" options={[{ value: '1', label: 'Chapters only' }, { value: '2', label: 'Chapters and sections' }]} />
            </Field>
            <div className="text-xs text-muted">Each bookmark starts a new file, named after the bookmark. Pages before the first bookmark go into their own file.</div>
          </>}
          {mode === 'text' && <>
            <Field label="Start a new file at pages containing" hint={smart ? `${smart.groups.length} parts` : undefined}>
              <Input value={query} onChange={(e) => { setQuery(e.target.value); setResults(null) }} placeholder={useRegex ? 'e.g. Invoice No\\.\\s*\\d+' : 'e.g. Invoice number'} />
            </Field>
            <Switch checked={caseSens} onChange={setCaseSens} label="Match case" />
            <Switch checked={useRegex} onChange={setUseRegex} label="Regular expression" />
            {!texts && doc && <Spinner label="Reading text…" />}
          </>}
          {mode === 'separator' && <>
            <Field label="Separator pages are">
              <Segmented value={sepKind} onChange={setSepKind} className="w-full" options={[{ value: 'blank', label: 'Blank' }, { value: 'qr', label: 'QR code' }, { value: 'both', label: 'Either' }]} />
            </Field>
            {sepKind !== 'qr' && <Slider label="Counts as blank below" value={inkPct} min={0.05} max={3} step={0.05} onChange={setInkPct} suffix="% ink" />}
            {sepKind !== 'blank' && <Field label="Only QR codes containing (optional)"><Input value={qrFilter} onChange={(e) => setQrFilter(e.target.value)} placeholder="e.g. SPLIT" /></Field>}
            <Switch checked={dropSep} onChange={setDropSep} label="Leave separator pages out" />
            {scanP !== null && <Progress value={scanP} label="Checking pages for separators…" />}
            <div className="text-xs text-muted">Print a blank sheet or a QR code page between documents before scanning, then split the scan here in one go.</div>
          </>}
          {isSmart && smartErr && <div className="text-xs text-warn">{smartErr}</div>}
          {plan.error && <div className="text-xs text-danger">{plan.error}</div>}
          {job.busy && <Progress value={job.progress} label="Splitting…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Scissors className="size-5" />} loading={job.busy} disabled={!numPages || !!plan.error || ((mode === 'ranges' || isSmart) && !plan.groups.length)} onClick={run}>
            {singleOut ? 'Extract to one PDF' : mode === 'size' ? 'Split by size' : `Split into ${plan.groups.length || '…'} file${plan.groups.length === 1 ? '' : 's'}`}
          </Button>
        </>}
      />
    </div>
  )
}

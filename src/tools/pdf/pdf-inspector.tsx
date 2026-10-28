import { useEffect, useState } from 'react'
import { FileSearch, Copy } from 'lucide-react'
import { Button, Dropzone, Progress, ErrorNote, Card, Badge, Tabs, useJob } from '@/components/ui'
import { baseName, downloadBlob, formatBytes, copyText } from '@/lib/files'
import { openPdfJs } from '@/lib/pdf'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { core, readBytes } from './_b1/ui'
import type { StructReport } from './_b1/core'

type TextStats = { words: number; chars: number; charsNoSpace: number; lines: number; textPages: number; perPage: number[]; topWords: [string, number][] }

export default function PdfInspector() {
  const [file, setFile] = useState<File | null>(null)
  const [s, setS] = useState<StructReport | null>(null)
  const [t, setT] = useState<TextStats | null>(null)
  const [tab, setTab] = useState<'overview' | 'fonts' | 'images' | 'meta'>('overview')
  const job = useJob()
  const reset = () => { setFile(null); setS(null); setT(null); setTab('overview') }

  useEffect(() => {
    if (!file) return
    job.run(async (setP) => {
      const C = await core(); const raw = await readBytes(file)
      setS(C.inspectStructure(await C.open(raw), raw)); setP(0.2)
      try {
        const d = await openPdfJs(raw)
        let words = 0, chars = 0, nos = 0, lines = 0, textPages = 0
        const perPage: number[] = []; const freq = new Map<string, number>()
        for (let i = 1; i <= d.numPages; i++) {
          const tc = await (await d.getPage(i)).getTextContent()
          let txt = ''
          for (const it of tc.items as any[]) { if (!('str' in it)) continue; txt += it.str + (it.hasEOL ? '\n' : ' '); if (it.hasEOL) lines++ }
          const w = txt.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
          words += w.length; perPage.push(w.length); if (w.length) textPages++
          chars += txt.replace(/\s+/g, ' ').trim().length; nos += txt.replace(/\s/g, '').length
          for (const x of w) { const k = x.toLowerCase(); if (k.length > 3) freq.set(k, (freq.get(k) ?? 0) + 1) }
          setP(0.2 + 0.8 * (i / d.numPages))
        }
        setT({ words, chars, charsNoSpace: nos, lines, textPages, perPage, topWords: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15) })
      } catch { /* encrypted for pdf.js: structure report is still useful */ }
    })
  }, [file]) // eslint-disable-line

  const report = () => JSON.stringify({ file: file?.name, size: file?.size, structure: s ? { ...s, xmp: s.xmp ? `${s.xmp.length} chars` : null } : null, text: t }, null, 2)
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to see everything inside it" />
  const readMin = t ? Math.max(1, Math.round(t.words / 230)) : 0
  const totalAnn = s ? Object.entries(s.annotations).filter(([k]) => k !== 'Widget' && k !== 'Popup').reduce((a, [, n]) => a + n, 0) : 0
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={s?.pages} onReset={reset} extra={s && <div className="flex gap-1.5"><Button size="sm" variant="outline" icon={<Copy className="size-3.5" />} onClick={async () => { if (await copyText(report())) toast('Report copied') }}>Copy report</Button><Button size="sm" variant="outline" onClick={() => downloadBlob(report(), `${baseName(file.name)}-report.json`, 'application/json')}>JSON</Button></div>} />
      {job.busy && <Progress value={job.progress} label="Inspecting…" />}
      <ErrorNote error={job.error} />
      {s && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[['Pages', s.pages], ['File size', formatBytes(file.size)], ['PDF version', s.version], ['Words', t ? t.words.toLocaleString() : '…'], ['Characters', t ? t.chars.toLocaleString() : '…'], ['Reading time', t ? `${readMin} min` : '…'], ['Fonts', s.fonts.length], ['Images', s.images.length], ['Form fields', s.formFields], ['Annotations', totalAnn], ['Bookmarks', s.outlineItems], ['Attachments', s.attachments]].map(([k, v]) => (
            <Card key={k as string} className="p-3"><div className="text-[10px] font-medium uppercase tracking-wide text-muted">{k}</div><div className="mt-0.5 truncate font-mono text-lg font-bold">{v}</div></Card>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {s.encrypted && <Badge color="var(--color-warn)">ENCRYPTED</Badge>}
          {s.linearized && <Badge color="var(--color-success)">WEB OPTIMIZED</Badge>}
          {s.tagged && <Badge color="var(--color-success)">TAGGED</Badge>}
          {s.pdfaClaim && <Badge color="var(--color-sky)">{s.pdfaClaim.toUpperCase()}</Badge>}
          {s.pdfuaClaim && <Badge color="var(--color-sky)">PDF/UA</Badge>}
          {s.javascript && <Badge color="var(--color-danger)">JAVASCRIPT</Badge>}
          {s.signatures > 0 && <Badge color="var(--color-teal)">{s.signatures} SIGNATURE{s.signatures > 1 ? 'S' : ''}</Badge>}
          {s.xfa && <Badge color="var(--color-warn)">XFA FORM</Badge>}
          {s.transparency && <Badge color="var(--color-muted)">TRANSPARENCY</Badge>}
          {s.incrementalUpdates > 0 && <Badge color="var(--color-muted)">{s.incrementalUpdates} INCREMENTAL UPDATE{s.incrementalUpdates > 1 ? 'S' : ''}</Badge>}
          {t && t.textPages < s.pages && <Badge color="var(--color-warn)">{s.pages - t.textPages} PAGE{s.pages - t.textPages > 1 ? 'S' : ''} WITHOUT TEXT</Badge>}
        </div>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }, { value: 'fonts', label: `Fonts (${s.fonts.length})` }, { value: 'images', label: `Images (${s.images.length})` }, { value: 'meta', label: 'Metadata' }]} />
        {tab === 'overview' && <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-2"><div className="text-sm font-semibold">Page sizes</div>
            {s.pageSizes.map((p, i) => <div key={i} className="flex justify-between text-sm"><span>{p.label}</span><span className="font-mono text-muted">{p.w.toFixed(0)} × {p.h.toFixed(0)} pt · {p.count} page{p.count > 1 ? 's' : ''}</span></div>)}
          </Card>
          <Card className="space-y-2"><div className="text-sm font-semibold">Structure</div>
            {[['Objects', s.objects], ['Layers', s.layers], ['Language', s.lang ?? 'not set'], ['Output intents', s.outputIntents.join('; ') || 'none'], ['Actions', s.actions.join(', ') || 'none'], ['Lines of text', t?.lines ?? '…'], ['Characters without spaces', t?.charsNoSpace.toLocaleString() ?? '…']].map(([k, v]) => <div key={k as string} className="flex justify-between gap-3 text-sm"><span className="text-muted">{k}</span><span className="truncate text-right font-mono">{v}</span></div>)}
          </Card>
          {t && t.perPage.length > 1 && <Card className="md:col-span-2"><div className="mb-2 text-sm font-semibold">Words per page</div>
            <div className="flex h-24 items-end gap-px">{t.perPage.map((n, i) => { const max = Math.max(...t.perPage, 1); return <div key={i} title={`Page ${i + 1}: ${n} words`} className="min-w-[2px] flex-1 rounded-t bg-accent/70 hover:bg-accent" style={{ height: `${Math.max(2, (n / max) * 100)}%` }} /> })}</div>
          </Card>}
          {t && t.topWords.length > 0 && <Card className="md:col-span-2"><div className="mb-2 text-sm font-semibold">Most used words</div><div className="flex flex-wrap gap-1.5">{t.topWords.map(([w, n]) => <span key={w} className="rounded-lg bg-surface-2 px-2 py-1 text-xs">{w} <span className="font-mono text-muted">{n}</span></span>)}</div></Card>}
        </div>}
        {tab === 'fonts' && <Table head={['Font', 'Type', 'Embedded', 'Subset', 'Unicode map']} rows={s.fonts.map((f) => [f.name, f.type, f.embedded ? 'Yes' : 'No', f.subset ? 'Yes' : 'No', f.toUnicode ? 'Yes' : 'No'])} empty="No fonts. The pages are probably scanned images." />}
        {tab === 'images' && <Table head={['#', 'Size (px)', 'Compression', 'Colors', 'Bits', 'Stored size']} rows={s.images.map((im, i) => [String(i + 1), `${im.w} × ${im.h}`, im.filter, im.colorSpace, String(im.bpc || '-'), formatBytes(im.bytes)])} empty="No embedded images." />}
        {tab === 'meta' && <div className="space-y-3">
          <Table head={['Field', 'Value']} rows={Object.entries(s.info)} empty="No document info dictionary." />
          {s.xmp && <Card><div className="mb-2 text-sm font-semibold">XMP metadata</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted scrollbar-thin">{s.xmp}</pre></Card>}
        </div>}
      </>}
      {!s && !job.busy && !job.error && <div className="flex justify-center"><FileSearch className="size-6 animate-pulse text-muted" /></div>}
    </div>
  )
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">{empty}</div>
  return (
    <div className="overflow-auto rounded-2xl border border-border scrollbar-thin">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2/60 text-xs uppercase tracking-wide text-muted"><tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border bg-surface">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="max-w-[28rem] truncate px-3 py-2 font-mono text-xs">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

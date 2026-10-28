import { useEffect, useState } from 'react'
import { Zap, Check } from 'lucide-react'
import { Button, Dropzone, ResultCard, Switch, ToolGrid, Progress, ErrorNote, Segmented, Field, useJob } from '@/components/ui'
import { pdfBlob } from '@/lib/pdf'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { FileBar, PDF_ACCEPT } from './_core/kit'
import { core, readBytes, Note, CheckList } from './_b1/ui'
import type { StructReport } from './_b1/core'

export default function LinearizePdf() {
  const [file, setFile] = useState<File | null>(null)
  const [info, setInfo] = useState<StructReport | null>(null)
  const [objStreams, setObjStreams] = useState<'generate' | 'preserve' | 'disable'>('generate')
  const [recompress, setRecompress] = useState(true)
  const [removeUnref, setRemoveUnref] = useState(true)
  const [result, setResult] = useState<{ blob: Blob; log: string[] } | null>(null)
  const job = useJob()
  const reset = () => { setFile(null); setInfo(null); setResult(null) }
  useEffect(() => {
    if (!file) return
    ;(async () => { const C = await core(); const b = await readBytes(file); setInfo(C.inspectStructure(await C.open(b), b)) })().catch((e) => job.setError(e.message))
  }, [file]) // eslint-disable-line
  const run = () => job.run(async (setP) => {
    if (!file) return
    setP(0.15)
    const { runQpdf } = await import('./_b1/qpdf')
    setP(0.35)
    const args = ['--linearize', `--object-streams=${objStreams}`]
    if (recompress) args.push('--compress-streams=y', '--recompress-flate', '--compression-level=9')
    if (removeUnref) args.push('--remove-unreferenced-resources=yes')
    const r = await runQpdf(await readBytes(file), [...args, '{in}', '{out}'])
    if (!r.out || r.code === 2) throw new Error('This PDF could not be optimized. ' + (r.log.filter((l) => /error|invalid|password/i.test(l))[0] ?? 'It may be damaged or encrypted.'))
    setResult({ blob: pdfBlob(r.out), log: r.log.filter((l) => l.trim()) }); setP(1); toast('PDF optimized for fast web view', 'success')
  })
  const ch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setResult(null) }
  if (!file) return <Dropzone accept={PDF_ACCEPT} onFiles={(f) => setFile(f[0])} label="Drop a PDF to optimize it for fast web viewing" />
  return (
    <div className="space-y-4">
      <FileBar file={file} pages={info?.pages} onReset={reset} />
      {result && <ResultCard blob={result.blob} filename={`${baseName(file.name)}-web.pdf`} originalSize={file.size} title="Web-optimized PDF ready" onReset={reset}>
        <ul className="space-y-1 text-sm"><li className="flex gap-2"><Check className="mt-0.5 size-4 text-success" />Linearized: the first page shows while the rest downloads</li>{recompress && <li className="flex gap-2"><Check className="mt-0.5 size-4 text-success" />Streams recompressed at the highest level</li>}{objStreams === 'generate' && <li className="flex gap-2"><Check className="mt-0.5 size-4 text-success" />Small objects packed into compressed object streams</li>}</ul>
        {result.log.length > 0 && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Engine notes ({result.log.length})</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">{result.log.join('\n')}</pre></details>}
      </ResultCard>}
      <ToolGrid
        main={<div className="space-y-3"><div className="text-sm font-medium">Current file</div>{info && <CheckList checks={[
          { level: info.linearized ? 'pass' : 'warn', title: info.linearized ? 'Already linearized' : 'Not linearized', detail: info.linearized ? 'It may still benefit from recompression.' : 'Browsers must download the whole file before showing page 1.' },
          { level: info.incrementalUpdates ? 'warn' : 'pass', title: info.incrementalUpdates ? `${info.incrementalUpdates} incremental update${info.incrementalUpdates > 1 ? 's' : ''}` : 'No incremental updates', detail: info.incrementalUpdates ? 'Old versions of edited objects are still stored. Optimizing drops them.' + (info.signatures ? ' This also removes the validity of existing digital signatures.' : '') : undefined },
          { level: 'info', title: `PDF ${info.version}, ${info.objects.toLocaleString()} objects, ${info.pages} pages` },
        ]} />}</div>}
        side={<>
          <Field label="Object streams"><Segmented value={objStreams} onChange={ch(setObjStreams)} options={[{ value: 'generate', label: 'Pack (smaller)' }, { value: 'preserve', label: 'Keep as is' }, { value: 'disable', label: 'Off (old readers)' }]} /></Field>
          <div className="space-y-3"><Switch checked={recompress} onChange={ch(setRecompress)} label="Recompress streams at maximum level" /><Switch checked={removeUnref} onChange={ch(setRemoveUnref)} label="Drop unused fonts and images" /></div>
          <Note>Uses the qpdf engine compiled to WebAssembly. It loads once (about 1.3 MB) and then runs offline. Page content and quality are not changed.</Note>
          {job.busy && <Progress value={job.progress} label="Optimizing…" />}
          <ErrorNote error={job.error} />
          <Button className="w-full" size="lg" icon={<Zap className="size-5" />} loading={job.busy} onClick={run}>Optimize for web</Button>
        </>}
      />
    </div>
  )
}

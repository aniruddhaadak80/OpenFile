import { useEffect, useState } from 'react'
import { Search, FileText, Trash2 } from 'lucide-react'
import { Button, Dropzone, Input, Label, ToolGrid, Empty } from '@/components/ui'
import { formatBytes } from '@/lib/files'
import { chunkText } from '@/lib/b4/ai'
import { VMODELS } from '@/lib/bcat/vision'
import { useVision, EnginePanel, VisionProgress } from '@/lib/bcat/aiui'
import { bm25, dot } from '@/lib/bcat/quick'
import { toCsv, DlButton } from '@/lib/bcat/kit'

interface Chunk { file: string; page: number; text: string; vec?: number[] }
interface Hit { c: Chunk; score: number }
const DOC = /\.(pdf|docx|epub|odt|rtf|html?)$/i
const ACCEPT = '.pdf,.docx,.epub,.odt,.rtf,.html,.htm,.txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.log,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.go,.rs,.rb,.php,.css,.sql,.ini,.toml,.srt,.vtt'

function snippet(text: string, q: string) {
  const words = q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []
  const parts = text.split(new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '$^'})`, 'gi'))
  return parts.map((p, i) => (i % 2 ? <mark key={i} className="rounded bg-accent/25 text-fg">{p}</mark> : p))
}

export default function SemanticFileSearch() {
  const [files, setFiles] = useState<File[]>([])
  const [chunks, setChunks] = useState<Chunk[] | null>(null)
  const [indexed, setIndexed] = useState<'ai' | 'quick' | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const ai = useVision(VMODELS.embed, { quick: true })

  useEffect(() => { setChunks(null); setIndexed(null); setHits(null) }, [files, ai.engine])

  const read = async () => {
    const out: Chunk[] = []
    const { docPages } = await import('@/lib/b4/doctext')
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      ai.setStatus(`Reading ${f.name}`); ai.setProgress(i / files.length)
      try {
        const pages = DOC.test(f.name) ? await docPages(f) : [{ page: 1, text: await f.text() }]
        for (const p of pages) for (const t of chunkText(p.text, 700, 100)) out.push({ file: f.name, page: p.page, text: t })
      } catch { /* skip unreadable file */ }
    }
    return out
  }

  const search = () => ai.run(async () => {
    if (!q.trim()) throw new Error('Type what you are looking for.')
    let idx = chunks
    if (!idx || indexed !== ai.engine) {
      idx = await read()
      if (!idx.length) throw new Error('No readable text found in these files.')
      if (ai.engine === 'ai') {
        ai.setStatus(`Indexing ${idx.length} passages`)
        const vecs = await ai.infer<number[][]>(idx.map((c) => c.text), {}, { onProgress: (d, t) => { ai.setProgress(d / t); ai.setStatus(`Indexing passage ${d} of ${t}`) } })
        idx = idx.map((c, i) => ({ ...c, vec: vecs[i] }))
      }
      setChunks(idx); setIndexed(ai.engine)
    }
    const kw = bm25(idx.map((c) => c.text), q)
    const kwMax = kw[0]?.score || 1
    const kwScore = new Map(kw.map((k) => [k.index, k.score / kwMax]))
    let ranked: Hit[]
    if (ai.engine === 'ai') {
      const [qv] = await ai.infer<number[][]>([q])
      ranked = idx.map((c, i) => ({ c, score: dot(c.vec ?? [], qv) * 0.85 + (kwScore.get(i) ?? 0) * 0.15 }))
    } else ranked = kw.map((k) => ({ c: idx![k.index], score: k.score / kwMax }))
    setHits(ranked.sort((a, b) => b.score - a.score).slice(0, 12))
  })

  if (!files.length) return <Dropzone multiple accept={ACCEPT} onFiles={setFiles} label="Drop documents to search by meaning" sub="PDF, Word, EPUB, text, Markdown, CSV, code and more. Ask in plain words, matching passages show up even without the exact words." />
  return (
    <ToolGrid
      main={
        <div className="space-y-4">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search() }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="For example: when is the payment due" aria-label="Search" />
            <Button type="submit" icon={<Search className="size-4" />} loading={ai.busy}>Search</Button>
          </form>
          {hits && !hits.length && <Empty>No matches. Try other words.</Empty>}
          {hits?.map((h, i) => (
            <div key={i} className="rounded-2xl border border-border bg-surface p-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-muted"><FileText className="size-3.5 text-accent" /><span className="truncate font-medium text-fg">{h.c.file}</span>{h.c.page > 1 || DOC.test(h.c.file) ? <span>page {h.c.page}</span> : null}<span className="ml-auto font-mono">{Math.round(h.score * 100)}</span></div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{snippet(h.c.text, q)}</p>
            </div>
          ))}
          {!hits && <Empty>Type a question or topic and press Search. The first search reads and indexes your files.</Empty>}
        </div>
      }
      side={
        <>
          <div><Label hint={`${files.length}`}>Files</Label>
            <div className="max-h-48 space-y-1 overflow-auto">{files.map((f, i) => <div key={i} className="flex items-center gap-2 text-xs"><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-muted">{formatBytes(f.size)}</span><button aria-label={`Remove ${f.name}`} className="text-muted hover:text-danger cursor-pointer" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></button></div>)}</div>
            <Dropzone compact multiple accept={ACCEPT} onFiles={(f) => setFiles((p) => [...p, ...f])} label="Add files" className="mt-2" />
          </div>
          <EnginePanel ai={ai} quickLabel="Keywords" quickNote="Keyword mode ranks passages by matching words (BM25). Instant, no download, but it needs the same words." />
          <VisionProgress ai={ai} />
          {chunks && <p className="text-xs text-muted">{chunks.length} passages indexed from {files.length} files.</p>}
          {hits && hits.length > 0 && <DlButton className="w-full" name="search-results.csv" mime="text/csv" data={() => toCsv([['score', 'file', 'page', 'passage'], ...hits.map((h) => [h.score.toFixed(3), h.c.file, h.c.page, h.c.text])])}>Download results (CSV)</DlButton>}
          <Button variant="ghost" className="w-full" onClick={() => { ai.cancel(); setFiles([]) }}>Start over</Button>
        </>
      }
    />
  )
}

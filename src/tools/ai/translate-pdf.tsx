import { useState } from 'react'
import { Languages, ArrowRightLeft, Download, FileDown } from 'lucide-react'
import { Button, Label, Select, ToolGrid, Progress } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { translateTexts, chunkText, MODELS, NLLB_LANGS } from '@/lib/b4/ai'
import { useAiState, ModelPanel, AiProgress, useDocInput, DocInput } from '@/lib/b4/aiui'
import { Note } from '@/tools/video/_media/ui'

type Para = { page: number; src: string; out?: string }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default function TranslatePdf() {
  const doc = useDocInput()
  const [src, setSrc] = useState('eng_Latn')
  const [tgt, setTgt] = useState('spa_Latn')
  const [paras, setParas] = useState<Para[]>([])
  const [making, setMaking] = useState<string | null>(null)
  const [mp, setMp] = useState(0)
  const ai = useAiState(MODELS.translate)

  const go = () => ai.run(async () => {
    const list: Para[] = []
    for (const p of doc.pages) for (const c of chunkText(p.text, 450)) list.push({ page: p.page, src: c })
    if (!list.length) throw new Error('There is no text to translate.')
    setParas(list)
    ai.setStatus(`Translating ${list.length} passages`)
    const out: string[] = await translateTexts(ai.info, ai.device, list.map((x) => x.src), src, tgt, ai.callbacks({
      onProgress: (d, t, partial) => { ai.setProgress(d / t); ai.setStatus(`Translated ${d} of ${t} passages`); setParas((l) => l.map((x, i) => (i === d - 1 ? { ...x, out: partial } : x))) },
    }))
    setParas(list.map((x, i) => ({ ...x, out: out[i] })))
  })

  const done = paras.length > 0 && paras.every((p) => p.out != null)
  const tgtName = NLLB_LANGS.find((l) => l.code === tgt)?.name ?? tgt
  const html = () => {
    let h = '', last = 0
    for (const p of paras) { if (p.page !== last && doc.pages.length > 1 && doc.file?.name.toLowerCase().endsWith('.pdf')) { h += `<h3 style="color:#888;font-size:10pt;margin-top:18pt">Page ${p.page}</h3>`; last = p.page } h += `<p>${esc(p.out ?? '')}</p>` }
    return h
  }
  const save = async (fmt: 'txt' | 'docx' | 'pdf') => {
    setMaking(fmt); setMp(0)
    try {
      const base = `${doc.name}-${tgtName.toLowerCase().replace(/\W+/g, '-')}`
      if (fmt === 'txt') downloadBlob(new Blob([paras.map((p) => p.out).join('\n\n')], { type: 'text/plain' }), `${base}.txt`)
      else { const { fromHtml } = await import('@/lib/b4/office'); downloadBlob(await fromHtml(html(), fmt, base, { onProgress: setMp }), `${base}.${fmt}`) }
    } finally { setMaking(null) }
  }
  const swap = () => { setSrc(tgt); setTgt(src) }

  return (
    <ToolGrid
      main={<>
        <DocInput doc={doc} label="Drop a document to translate" sub="PDF, DOCX, EPUB, TXT, Markdown, HTML, RTF or ODT. Translated on your device, nothing is uploaded." />
        {paras.length > 0 && (
          <div className="max-h-[65vh] space-y-2 overflow-auto rounded-2xl border border-border bg-surface p-3 scrollbar-thin">
            {paras.map((p, i) => (
              <div key={i} className="grid gap-3 border-b border-border pb-2 last:border-0 sm:grid-cols-2">
                <p className="text-sm text-muted">{p.src}</p>
                <p className="text-sm">{p.out ?? <span className="text-muted/60">...</span>}</p>
              </div>
            ))}
          </div>
        )}
        {done && (
          <div className="flex flex-wrap gap-2">
            <Button icon={<FileDown className="size-4" />} onClick={() => save('pdf')} loading={making === 'pdf'}>PDF</Button>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => save('docx')} loading={making === 'docx'}>Word (DOCX)</Button>
            <Button variant="outline" icon={<Download className="size-4" />} onClick={() => save('txt')}>Text</Button>
          </div>
        )}
        {making === 'pdf' && <Progress value={mp} label="Making PDF" />}
      </>}
      side={<>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div><Label>From</Label><Select value={src} onChange={setSrc} options={NLLB_LANGS.map((l) => ({ value: l.code, label: l.name }))} /></div>
          <Button variant="ghost" size="md" icon={<ArrowRightLeft className="size-4" />} onClick={swap} aria-label="Swap languages" />
          <div><Label>To</Label><Select value={tgt} onChange={setTgt} options={NLLB_LANGS.map((l) => ({ value: l.code, label: l.name }))} /></div>
        </div>
        <ModelPanel ai={ai} models={MODELS.translate} />
        <Button size="lg" className="w-full" icon={<Languages className="size-5" />} onClick={go} loading={ai.busy} disabled={!doc.ready || src === tgt}>Translate to {tgtName}</Button>
        <AiProgress ai={ai} />
        <Note>The text is translated and rebuilt as a clean document. The original page layout and images are not kept. Long documents take a while on the CPU.</Note>
      </>}
    />
  )
}

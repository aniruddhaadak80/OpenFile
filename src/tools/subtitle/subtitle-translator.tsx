import { useState } from 'react'
import { Languages, Download, ArrowRightLeft } from 'lucide-react'
import { Button, Dropzone, Label, Select, Switch, ToolGrid, ErrorNote } from '@/components/ui'
import { baseName, downloadBlob } from '@/lib/files'
import { parseSubtitles, writeSubtitles, plainText, fmtClock, SUB_FORMATS, SUB_ACCEPT, subExt, subMime, type SubDoc, type SubFormat } from '@/lib/b4/subtitles'
import { readTextFile } from '@/lib/b4/text'
import { translateTexts, MODELS, NLLB_LANGS } from '@/lib/b4/ai'
import { useAiState, ModelPanel, AiProgress } from '@/lib/b4/aiui'
import { TopBar } from '@/lib/b4/ui'

export default function SubtitleTranslator() {
  const [file, setFile] = useState<File | null>(null)
  const [doc, setDoc] = useState<SubDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [src, setSrc] = useState('eng_Latn')
  const [tgt, setTgt] = useState('spa_Latn')
  const [out, setOut] = useState<string[]>([])
  const [both, setBoth] = useState(false)
  const [fmt, setFmt] = useState<SubFormat>('srt')
  const ai = useAiState(MODELS.translate)

  const open = async (f: File) => {
    setFile(f); setError(null); setOut([])
    try { const d = parseSubtitles((await readTextFile(f)).text, { name: f.name }); setDoc(d); setFmt(d.format === 'txt' ? 'srt' : d.format) } catch (e: any) { setError(e?.message || 'Could not read this subtitle file.') }
  }
  const go = () => doc && ai.run(async () => {
    setOut([])
    const texts = doc.cues.map((c) => plainText(c.text).replace(/\s*\n\s*/g, ' ').trim())
    const res: string[] = await translateTexts(ai.info, ai.device, texts, src, tgt, ai.callbacks({ onProgress: (d, t, partial) => { ai.setProgress(d / t); ai.setStatus(`Translated ${d} of ${t} lines`); setOut((o) => { const n = [...o]; n[d - 1] = partial ?? ''; return n }) } }))
    setOut(res)
  })
  const wrap = (s: string) => { if (s.length <= 42) return s; const mid = s.lastIndexOf(' ', Math.ceil(s.length / 2) + 6); return mid > 10 ? s.slice(0, mid) + '\n' + s.slice(mid + 1) : s }
  const save = () => {
    if (!doc || !file) return
    const cues = doc.cues.map((c, i) => ({ ...c, text: both ? `${wrap(out[i] ?? '')}\n<i>${plainText(c.text).replace(/\n/g, ' ')}</i>` : wrap(out[i] ?? c.text) }))
    const code = NLLB_LANGS.find((l) => l.code === tgt)?.code.slice(0, 2) ?? 'xx'
    downloadBlob(new Blob([writeSubtitles(cues, fmt, { assHeader: doc.assHeader, lang: code })], { type: subMime(fmt) }), `${baseName(file.name)}.${code}.${subExt(fmt)}`)
  }
  const done = doc && out.length === doc.cues.length && out.every((x) => x != null)

  return (
    <ToolGrid
      main={<>
        {!file ? <Dropzone accept={SUB_ACCEPT} onFiles={(f) => open(f[0])} label="Drop a subtitle file to translate" sub="SRT, VTT, ASS and more. Timing stays exactly the same. Translated on your device." />
          : <TopBar file={file} onReset={() => { setFile(null); setDoc(null); setOut([]) }} extra={doc ? <span className="text-xs text-muted">{doc.cues.length} lines</span> : undefined} />}
        <ErrorNote error={error} />
        {doc && <div className="max-h-[65vh] overflow-auto rounded-xl border border-border bg-surface scrollbar-thin">
          <table className="w-full text-sm"><tbody>{doc.cues.slice(0, 1000).map((c, i) => (
            <tr key={i} className="border-b border-border align-top last:border-0">
              <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-muted">{fmtClock(c.start, '.')}</td>
              <td className="px-3 py-1.5 text-muted">{plainText(c.text)}</td>
              <td className="px-3 py-1.5">{out[i] ?? ''}</td>
            </tr>))}</tbody></table>
        </div>}
      </>}
      side={<>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div><Label>From</Label><Select value={src} onChange={setSrc} options={NLLB_LANGS.map((l) => ({ value: l.code, label: l.name }))} /></div>
          <Button variant="ghost" icon={<ArrowRightLeft className="size-4" />} onClick={() => { setSrc(tgt); setTgt(src) }} aria-label="Swap languages" />
          <div><Label>To</Label><Select value={tgt} onChange={setTgt} options={NLLB_LANGS.map((l) => ({ value: l.code, label: l.name }))} /></div>
        </div>
        <ModelPanel ai={ai} models={MODELS.translate} />
        <Button size="lg" className="w-full" icon={<Languages className="size-5" />} onClick={go} loading={ai.busy} disabled={!doc || src === tgt}>Translate {doc ? doc.cues.length + ' lines' : ''}</Button>
        <AiProgress ai={ai} />
        {done && <>
          <Switch checked={both} onChange={setBoth} label="Keep the original line too (two languages)" />
          <div><Label>Save as</Label><Select value={fmt} onChange={setFmt} options={SUB_FORMATS.filter((f) => f.id !== 'txt').map((f) => ({ value: f.id, label: f.label }))} /></div>
          <Button className="w-full" icon={<Download className="size-4" />} onClick={save}>Download translated subtitles</Button>
        </>}
      </>}
    />
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Button, Dropzone, FileChip, Select, Switch, Segmented, Badge } from '@/components/ui'
import { Bar, Pane, Status, Stat, CodeArea, useStored } from '../dev/_b5/shell'
import { downloadBlob, zipFiles, formatBytes } from '@/lib/files'
import { ENCODINGS, detectEncoding, fixMojibake } from '@/lib/b10/dev'

const LABELS: Record<string, string> = {
  'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE', 'windows-1252': 'Windows-1252 (Western)', 'iso-8859-1': 'ISO-8859-1 (Latin-1)', 'iso-8859-2': 'ISO-8859-2 (Central European)', 'iso-8859-15': 'ISO-8859-15 (Latin-9)',
  'windows-1250': 'Windows-1250 (Central European)', 'windows-1251': 'Windows-1251 (Cyrillic)', 'koi8-r': 'KOI8-R (Russian)', 'windows-1253': 'Windows-1253 (Greek)', 'windows-1254': 'Windows-1254 (Turkish)', 'windows-1255': 'Windows-1255 (Hebrew)',
  'windows-1256': 'Windows-1256 (Arabic)', 'windows-1257': 'Windows-1257 (Baltic)', 'windows-874': 'Windows-874 (Thai)', shift_jis: 'Shift_JIS (Japanese)', 'euc-jp': 'EUC-JP (Japanese)', 'iso-2022-jp': 'ISO-2022-JP (Japanese)', gbk: 'GBK (Simplified Chinese)',
  gb18030: 'GB18030 (Chinese)', big5: 'Big5 (Traditional Chinese)', 'euc-kr': 'EUC-KR (Korean)', ibm866: 'IBM866 (DOS Cyrillic)', macintosh: 'Mac Roman',
}
const opts = ENCODINGS.map((e) => ({ value: e as string, label: LABELS[e] ?? e }))

interface Item { file: File; bytes: Uint8Array; detected: string; confidence: number; chosen: string; ranked: { encoding: string; score: number }[] }

function encodeOut(text: string, target: 'utf-8' | 'utf-16le' | 'utf-16be', bom: boolean, eol: 'keep' | 'lf' | 'crlf'): Uint8Array {
  const t = eol === 'lf' ? text.replace(/\r\n?/g, '\n') : eol === 'crlf' ? text.replace(/\r?\n/g, '\r\n') : text
  if (target === 'utf-8') { const b = new TextEncoder().encode(t); if (!bom) return b; const o = new Uint8Array(b.length + 3); o.set([0xef, 0xbb, 0xbf]); o.set(b, 3); return o }
  const o = new Uint8Array(t.length * 2 + (bom ? 2 : 0)); let k = 0
  if (bom) { o[k++] = target === 'utf-16le' ? 0xff : 0xfe; o[k++] = target === 'utf-16le' ? 0xfe : 0xff }
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); if (target === 'utf-16le') { o[k++] = c & 0xff; o[k++] = c >> 8 } else { o[k++] = c >> 8; o[k++] = c & 0xff } }
  return o
}
const decode = (b: Uint8Array, enc: string) => { const strip = enc === 'utf-8' && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : enc.startsWith('utf-16') && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) ? 2 : 0; return new TextDecoder(enc).decode(b.subarray(strip)) }

export default function TextEncodingConverter() {
  const [mode, setMode] = useState<'files' | 'mojibake'>('files')
  const [items, setItems] = useState<Item[]>([])
  const [active, setActive] = useState(0)
  const [target, setTarget] = useStored<'utf-8' | 'utf-16le' | 'utf-16be'>('b10:enc:target', 'utf-8')
  const [bom, setBom] = useState(false)
  const [eol, setEol] = useState<'keep' | 'lf' | 'crlf'>('keep')
  const [moji, setMoji] = useStored('b10:enc:moji', 'CafÃ© dÃ©jÃ\u00a0 vu, naÃ¯ve rÃ©sumÃ©. Itâ€™s â€œquotedâ€\u009d.')
  const add = async (files: File[]) => {
    const next: Item[] = []
    for (const f of files) { const bytes = new Uint8Array(await f.arrayBuffer()); const d = detectEncoding(bytes); next.push({ file: f, bytes, detected: d.encoding, confidence: d.confidence, chosen: d.encoding, ranked: d.ranked }) }
    setItems((p) => [...p, ...next])
  }
  useEffect(() => { if (active >= items.length) setActive(Math.max(0, items.length - 1)) }, [items.length, active])
  const cur = items[active]
  const preview = useMemo(() => { if (!cur) return ''; try { return decode(cur.bytes.subarray(0, 200_000), cur.chosen) } catch (e) { return 'Could not decode: ' + (e as Error).message } }, [cur])
  const bad = (preview.match(/\uFFFD/g) || []).length
  const outName = (f: File) => f.name
  const convertOne = (it: Item) => encodeOut(decode(it.bytes, it.chosen), target, bom, eol)
  const downloadAll = async () => {
    if (items.length === 1) { downloadBlob(convertOne(items[0]), outName(items[0].file), 'text/plain'); return }
    downloadBlob(await zipFiles(items.map((it) => ({ name: outName(it.file), data: convertOne(it) }))), 'converted-text.zip', 'application/zip')
  }
  const setChosen = (enc: string) => setItems((p) => p.map((it, i) => (i === active ? { ...it, chosen: enc } : it)))

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'files', label: 'Convert files' }, { value: 'mojibake', label: 'Fix garbled text' }]} />
        {mode === 'files' && <>
          <span className="text-sm text-muted">Save as</span>
          <Select value={target} onChange={setTarget} options={[{ value: 'utf-8', label: 'UTF-8' }, { value: 'utf-16le', label: 'UTF-16 LE' }, { value: 'utf-16be', label: 'UTF-16 BE' }]} className="w-36" />
          <Switch checked={bom} onChange={setBom} label="Add BOM" />
          <Select value={eol} onChange={setEol} options={[{ value: 'keep', label: 'Keep line endings' }, { value: 'lf', label: 'LF (Linux, Mac)' }, { value: 'crlf', label: 'CRLF (Windows)' }]} className="w-44" />
        </>}
      </Bar>
      {mode === 'mojibake' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Pane title="Garbled text (like Ã© or â€™)" className="h-72"><CodeArea value={moji} onChange={setMoji} lineNumbers={false} /></Pane>
          <Pane title="Repaired" className="h-72"><pre className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px]">{fixMojibake(moji)}</pre></Pane>
        </div>
      ) : !items.length ? (
        <Dropzone multiple onFiles={add} accept=".txt,.csv,.tsv,.srt,.sub,.ass,.vtt,.html,.htm,.xml,.json,.md,.ini,.log,.nfo,.cue,.m3u,.properties,.sql,text/*" label="Drop text files in any encoding" sub="Subtitles, CSV exports, old documents. The encoding is detected for you." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {items.map((it, i) => (
              <div key={i} role="button" tabIndex={0} onClick={() => setActive(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(i) } }} className={`rounded-xl border px-1 text-left transition ${i === active ? 'border-accent' : 'border-transparent'}`}>
                <FileChip file={it.file} onRemove={() => setItems((p) => p.filter((_, j) => j !== i))} extra={<Badge>{LABELS[it.chosen] ?? it.chosen}</Badge>} />
              </div>
            ))}
            <Dropzone compact multiple onFiles={add} accept="text/*,.srt,.csv,.txt,.ass,.sub" label="Add more" />
          </div>
          {cur && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Detected" value={LABELS[cur.detected] ?? cur.detected} sub={`${Math.round(cur.confidence * 100)}% sure`} />
                <Stat label="Size" value={formatBytes(cur.bytes.length)} />
                <Stat label="Unreadable characters" value={bad} sub={bad ? 'Try another encoding' : 'Looks clean'} />
                <Stat label="Line endings" value={/\r\n/.test(preview) ? 'CRLF' : /\r/.test(preview) ? 'CR' : 'LF'} />
              </div>
              <Bar>
                <span className="text-sm text-muted">Read this file as</span>
                <Select value={cur.chosen} onChange={setChosen} options={opts} className="w-72" />
                {cur.ranked.length > 1 && <span className="text-xs text-muted">Other likely: {cur.ranked.slice(1, 4).map((r) => LABELS[r.encoding] ?? r.encoding).join(', ')}</span>}
                <Button className="ml-auto" onClick={downloadAll}>{items.length > 1 ? `Convert ${items.length} files (ZIP)` : 'Convert and download'}</Button>
                <Button variant="ghost" onClick={() => setItems([])}>Start over</Button>
              </Bar>
              {bad > 0 && <Status kind="err">{bad} characters could not be read with {LABELS[cur.chosen] ?? cur.chosen}. Pick another encoding above and watch the preview.</Status>}
              <Pane title="Preview" className="h-80"><pre className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-[13px]">{preview.slice(0, 20000)}</pre></Pane>
            </>
          )}
        </>
      )}
    </div>
  )
}

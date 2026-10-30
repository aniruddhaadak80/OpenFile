import { useMemo, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Button, Label, Segmented, Textarea, ToolGrid, CopyButton } from '@/components/ui'
import { baseName } from '@/lib/files'
import { toast } from '@/components/toast'
import { findPii, redact, PII_LABEL, type PiiKind, type MaskStyle } from '@/lib/bcat/privacy'
import { DlButton, Pill, pal } from '@/lib/bcat/kit'
import { readTextFile } from '@/tools/dev/_dev/kit'

const SAMPLE = `Hi team, please refund Rahul Verma (rahul.verma@example.com, +91 98765 43210).
Card on file: 4111 1111 1111 1111, IBAN GB82 WEST 1234 5698 7654 32.
PAN ABCDE1234F, Aadhaar 2345 6789 0123. Login came from 192.168.1.24 on 2026-03-14.
US contact SSN 123-45-6789. Notes at https://intranet.example.com/case/88.`
const KINDS = Object.keys(PII_LABEL) as PiiKind[]

export default function PiiRedactor() {
  const [text, setText] = useState(SAMPLE)
  const [name, setName] = useState('text')
  const [kinds, setKinds] = useState<PiiKind[]>(KINDS.filter((k) => k !== 'date' && k !== 'url'))
  const [style, setStyle] = useState<MaskStyle>('label')
  const hits = useMemo(() => findPii(text, kinds), [text, kinds])
  const out = useMemo(() => redact(text, hits, style), [text, hits, style])
  const counts = (k: PiiKind) => findPii(text, [k]).length

  const open = async (f: File) => {
    try {
      setName(baseName(f.name))
      if (/\.(pdf|docx|epub|odt|rtf|html?)$/i.test(f.name)) { const { docPages } = await import('@/lib/b4/doctext'); setText((await docPages(f)).map((p) => p.text).join('\n\n')) }
      else { const t = await readTextFile(f); if (t == null) return; setText(t) }
    } catch (e: any) { toast(e?.message || 'Could not read this file', 'error') }
  }

  // highlighted original
  const marked: React.ReactNode[] = []
  let last = 0
  hits.forEach((h, i) => { marked.push(text.slice(last, h.start)); marked.push(<mark key={i} className="rounded px-0.5 text-black" style={{ background: pal(KINDS.indexOf(h.kind)) }} title={PII_LABEL[h.kind]}>{h.text}</mark>); last = h.end })
  marked.push(text.slice(last))

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="mb-0 mr-auto">Your text</Label>
            <label><input type="file" hidden accept=".txt,.md,.csv,.tsv,.json,.log,.xml,.html,.pdf,.docx,.rtf,.odt" onChange={(e) => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = '' }} />
              <Button variant="outline" size="sm" icon={<FolderOpen className="size-4" />} onClick={(e) => (e.currentTarget.previousSibling as HTMLInputElement).click()}>Open file</Button></label>
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-40 font-sans text-sm" aria-label="Text to redact" />
          <Label>Found ({hits.length})</Label>
          <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-border bg-surface p-3 text-sm leading-relaxed">{marked}</div>
          <Label>Redacted</Label>
          <Textarea readOnly value={out} className="min-h-40 font-sans text-sm" aria-label="Redacted text" />
        </div>
      }
      side={
        <>
          <div><Label>What to find</Label>
            <div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <Pill key={k} color={pal(KINDS.indexOf(k))} active={kinds.includes(k)} onClick={() => setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}>{PII_LABEL[k]} {counts(k) || ''}</Pill>)}</div>
          </div>
          <div><Label>Replace with</Label><Segmented value={style} onChange={setStyle} options={[{ value: 'label', label: '[EMAIL]' }, { value: 'token', label: '[EMAIL_1]' }, { value: 'partial', label: 'Partial' }, { value: 'block', label: '████' }]} /></div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={out} label="Copy redacted" />
            <DlButton name={`${name}-redacted.txt`} data={() => out}>Download</DlButton>
            <DlButton name={`${name}-pii-report.csv`} mime="text/csv" data={() => 'type,value,position\r\n' + hits.map((h) => `${PII_LABEL[h.kind]},"${h.text.replace(/"/g, '""')}",${h.start}`).join('\r\n')}>Report</DlButton>
          </div>
          <p className="text-xs text-muted">Card numbers are checked with the Luhn rule and IBANs with their checksum, so random digits are not flagged. Always read the result before you share it. Names are not detected here, use the entity extractor for that.</p>
        </>
      }
    />
  )
}

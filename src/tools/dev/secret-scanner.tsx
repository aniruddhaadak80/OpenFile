import { useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button, Dropzone, Switch, Badge, Progress, Segmented } from '@/components/ui'
import { Bar, Pane, CodeArea, Status, Stat, DataTable, DownloadButton } from './_b5/shell'
import { scanSecrets, maskSecret, type SecretHit } from '@/lib/b10/dev'
import { formatBytes } from '@/lib/files'

const BINARY_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|tiff?|psd|pdf|zip|gz|tgz|7z|rar|xz|bz2|zst|jar|war|apk|ipa|exe|dll|so|dylib|o|a|class|pyc|wasm|woff2?|ttf|otf|eot|mp[34]|m4a|wav|flac|ogg|webm|mov|avi|mkv|sqlite|db|bin|dat|iso|dmg|heic)$/i
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|vendor|__pycache__)\//

interface Scanned { name: string; size: number }

export default function SecretScanner() {
  const [mode, setMode] = useState<'files' | 'paste'>('files')
  const [paste, setPaste] = useState('')
  const [entropy, setEntropy] = useState(false)
  const [hits, setHits] = useState<SecretHit[] | null>(null)
  const [scanned, setScanned] = useState<Scanned[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [reveal, setReveal] = useState(false)

  const scanFiles = async (files: File[]) => {
    setHits(null); setProgress(0)
    const all: SecretHit[] = []
    const done: Scanned[] = []
    const queue: { name: string; text: () => Promise<string>; size: number }[] = []
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        const { unzipSync } = await import('fflate')
        const z = unzipSync(new Uint8Array(await f.arrayBuffer()))
        for (const [p, data] of Object.entries(z)) if (!p.endsWith('/') && !SKIP_DIR.test(p) && !BINARY_EXT.test(p) && data.length < 20e6) queue.push({ name: `${f.name}/${p}`, size: data.length, text: async () => new TextDecoder().decode(data) })
      } else {
        const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        if (SKIP_DIR.test(path) || BINARY_EXT.test(path) || f.size > 20e6) continue
        queue.push({ name: path, size: f.size, text: () => f.text() })
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i]
      const text = await q.text()
      if (text.includes('\u0000')) continue
      all.push(...scanSecrets(text, q.name, { entropy }))
      done.push({ name: q.name, size: q.size })
      if (i % 20 === 0) { setProgress(Math.round((i / queue.length) * 100)); await new Promise((r) => setTimeout(r, 0)) }
    }
    setScanned(done); setHits(all); setProgress(null)
  }
  const scanPaste = () => { setScanned([{ name: 'pasted text', size: paste.length }]); setHits(scanSecrets(paste, 'pasted text', { entropy })) }
  const high = hits?.filter((h) => h.rule.severity === 'high').length ?? 0
  const report = () => JSON.stringify(hits?.map((h) => ({ rule: h.rule.id, name: h.rule.name, severity: h.rule.severity, file: h.file, line: h.line, column: h.col, match: maskSecret(h.match) })), null, 2)

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'files', label: 'Files, folder or ZIP' }, { value: 'paste', label: 'Paste text' }]} />
        <Switch checked={entropy} onChange={setEntropy} label="Also flag random-looking strings" />
        {hits && <Switch checked={reveal} onChange={setReveal} label="Show full matches" />}
        {hits && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setHits(null); setScanned([]) }}>Start over</Button>}
      </Bar>
      {!hits && (mode === 'files' ? (
        <div className="space-y-3">
          <Dropzone multiple onFiles={scanFiles} label="Drop source files or a ZIP of your project" sub="Scanned in your browser. node_modules, .git and build folders are skipped." />
          <FolderPicker onFiles={scanFiles} />
          {progress !== null && <Progress value={progress} label="Scanning" />}
        </div>
      ) : (
        <Pane title="Text to scan" className="h-72" actions={<Button size="sm" onClick={scanPaste} disabled={!paste.trim()}>Scan</Button>}><CodeArea value={paste} onChange={setPaste} placeholder="Paste a config file, a log or a code snippet" /></Pane>
      ))}
      {hits && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Files scanned" value={scanned.length.toLocaleString()} sub={formatBytes(scanned.reduce((a, s) => a + s.size, 0))} />
            <Stat label="Findings" value={hits.length} />
            <Stat label="High risk" value={high} />
            <Stat label="Files with findings" value={new Set(hits.map((h) => h.file)).size} />
          </div>
          {hits.length ? <Status kind="err"><span className="inline-flex items-center gap-2"><ShieldAlert className="size-4" />Found {hits.length} possible secret{hits.length > 1 ? 's' : ''}. Rotate any real key before you share or commit these files.</span></Status>
            : <Status kind="ok"><span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />No secrets found in {scanned.length} file{scanned.length === 1 ? '' : 's'}.</span></Status>}
          {hits.length > 0 && (
            <Pane title="Findings" actions={<DownloadButton text={report} filename="secret-scan.json" mime="application/json" label="Report" />}>
              <DataTable className="max-h-[520px] border-0" columns={['Risk', 'Type', 'File', 'Line', 'Match', 'Context']} rows={hits.map((h) => [h.rule.severity, h.rule.name, h.file, `${h.line}:${h.col}`, reveal ? h.match : maskSecret(h.match), h.preview])} />
            </Pane>
          )}
          <div className="flex flex-wrap gap-2">{[...new Set(hits.map((h) => h.rule.name))].map((n) => <Badge key={n}>{n}: {hits.filter((h) => h.rule.name === n).length}</Badge>)}</div>
        </>
      )}
    </div>
  )
}

function FolderPicker({ onFiles }: { onFiles: (f: File[]) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm hover:border-accent focus-within:ring-2 focus-within:ring-accent">
      <input type="file" className="sr-only" multiple {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) onFiles(f) }} />
      Or pick a whole folder
    </label>
  )
}

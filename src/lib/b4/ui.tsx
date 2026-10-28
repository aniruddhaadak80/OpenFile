/* Shared UI for batch 4 tools (archives, ebooks, subtitles, documents, AI). */
import React, { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, FileText, FileImage, FileAudio, FileVideo, FileArchive, File as FileIcon, Download, Search, RotateCcw, Cpu } from 'lucide-react'
import { Button, Input, Progress, FileChip, cn } from '@/components/ui'
import { downloadBlob, formatBytes } from '@/lib/files'
import type { ArcFile, TreeNode } from './archive'

export const extOfName = (n: string) => (n.split('/').pop()!.split('.').length > 1 ? n.split('.').pop()!.toLowerCase() : '')
const IMG = /^(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/
const TXT = /^(txt|md|markdown|json|xml|html?|css|js|mjs|ts|tsx|jsx|csv|tsv|log|ini|cfg|conf|yml|yaml|toml|py|rb|go|rs|java|c|h|cpp|hpp|cs|php|sh|bat|ps1|sql|srt|vtt|ass|opf|ncx|xhtml|svg|plist|properties|gradle|env|gitignore|license|readme)$/
export const mimeByExt: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', pdf: 'application/pdf', txt: 'text/plain', html: 'text/html', htm: 'text/html', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', mp4: 'video/mp4', webm: 'video/webm', zip: 'application/zip', epub: 'application/epub+zip', css: 'text/css', xml: 'application/xml', csv: 'text/csv' }
export const blobOf = (f: ArcFile) => new Blob([f.data as BlobPart], { type: mimeByExt[extOfName(f.path)] || 'application/octet-stream' })

function iconFor(name: string) {
  const e = extOfName(name)
  if (IMG.test(e)) return FileImage
  if (/^(mp3|wav|ogg|flac|m4a|aac|opus)$/.test(e)) return FileAudio
  if (/^(mp4|webm|mkv|mov|avi)$/.test(e)) return FileVideo
  if (/^(zip|7z|rar|tar|gz|xz|bz2|zst)$/.test(e)) return FileArchive
  if (TXT.test(e)) return FileText
  return FileIcon
}

/** Collapsible folder tree with checkboxes. */
export function FileTree({ root, selected, onToggle, onOpen, active, filter }: { root: TreeNode; selected: Set<string>; onToggle: (paths: string[], on: boolean) => void; onOpen: (n: TreeNode) => void; active?: string; filter?: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(root.children.length === 1 && root.children[0].dir ? [root.children[0].path] : []))
  const q = (filter || '').toLowerCase()
  const leaves = (n: TreeNode): string[] => (n.dir ? n.children.flatMap(leaves) : [n.path])
  const matches = (n: TreeNode): boolean => !q || (n.dir ? n.children.some(matches) : n.path.toLowerCase().includes(q))
  const row = (n: TreeNode, depth: number): React.ReactNode => {
    if (!matches(n)) return null
    const isOpen = q ? true : open.has(n.path)
    const ls = leaves(n)
    const on = ls.length > 0 && ls.every((p) => selected.has(p))
    const some = !on && ls.some((p) => selected.has(p))
    const Icon = n.dir ? (isOpen ? FolderOpen : Folder) : iconFor(n.name)
    return (
      <div key={n.path}>
        <div className={cn('group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2', active === n.path && 'bg-accent/10')} style={{ paddingLeft: 8 + depth * 16 }}>
          <input type="checkbox" aria-label={`Select ${n.name}`} checked={on} ref={(el) => { if (el) el.indeterminate = some }} onChange={(e) => onToggle(ls, e.target.checked)} className="size-4 cursor-pointer accent-[var(--accent)]" />
          {n.dir ? (
            <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left" onClick={() => setOpen((s) => { const x = new Set(s); x.has(n.path) ? x.delete(n.path) : x.add(n.path); return x })} aria-expanded={isOpen}>
              <ChevronRight className={cn('size-3.5 shrink-0 text-muted transition', isOpen && 'rotate-90')} />
              <Icon className="size-4 shrink-0 text-accent" /><span className="truncate font-medium">{n.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">{ls.length} · {formatBytes(n.size)}</span>
            </button>
          ) : (
            <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left" onClick={() => onOpen(n)}>
              <span className="w-3.5 shrink-0" /><Icon className="size-4 shrink-0 text-muted" /><span className="truncate">{n.name}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted">{formatBytes(n.size)}</span>
            </button>
          )}
          {!n.dir && n.file && <button aria-label={`Download ${n.name}`} onClick={() => downloadBlob(blobOf(n.file!), n.name)} className="rounded p-1 text-muted opacity-60 hover:text-accent group-hover:opacity-100 cursor-pointer"><Download className="size-3.5" /></button>}
        </div>
        {n.dir && isOpen && n.children.map((c) => row(c, depth + 1))}
      </div>
    )
  }
  return <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-surface p-1 scrollbar-thin">{root.children.map((c) => row(c, 0))}</div>
}

export function SearchBox({ value, onChange, placeholder = 'Filter files' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" aria-label={placeholder} /></div>
}

/** Inline preview of an extracted file: image, text, audio, video, or a download hint. */
export function FilePreview({ file }: { file: ArcFile }) {
  const e = extOfName(file.path)
  const blob = useMemo(() => blobOf(file), [file])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u) }, [blob])
  const text = useMemo(() => (TXT.test(e) || (!IMG.test(e) && looksText(file.data)) ? new TextDecoder().decode(file.data.subarray(0, 200_000)) : null), [file, e])
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2"><div className="min-w-0 flex-1 truncate text-sm font-medium">{file.path}</div><Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => downloadBlob(blob, file.path.split('/').pop()!)}>Save</Button></div>
      {IMG.test(e) && url ? <div className="checker grid place-items-center rounded-xl border border-border p-3"><img src={url} alt={file.path} className="max-h-[50vh] max-w-full object-contain" /></div>
        : /^(mp3|wav|ogg|m4a|flac|aac|opus)$/.test(e) && url ? <audio src={url} controls className="w-full" />
        : /^(mp4|webm|mov)$/.test(e) && url ? <video src={url} controls className="max-h-[50vh] w-full rounded-xl bg-black" />
        : e === 'pdf' && url ? <iframe title={file.path} src={url} className="h-[50vh] w-full rounded-xl border border-border bg-white" />
        : text != null ? <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-xs scrollbar-thin">{text}{file.data.length > 200_000 ? '\n\n[Preview cut at 200 KB]' : ''}</pre>
        : <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">No preview for this file type. Use Save to download it.</div>}
    </div>
  )
}

export function looksText(d: Uint8Array) {
  const n = Math.min(d.length, 4096)
  if (!n) return false
  let bad = 0
  for (let i = 0; i < n; i++) { const c = d[i]; if (c === 0) return false; if (c < 9 || (c > 13 && c < 32)) bad++ }
  return bad / n < 0.02
}

export function TopBar({ file, onReset, extra, label = 'Start over' }: { file: { name: string; size: number }; onReset: () => void; extra?: React.ReactNode; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1"><FileChip file={file} extra={extra} /></div>
      <Button variant="ghost" size="sm" icon={<RotateCcw className="size-4" />} onClick={onReset}>{label}</Button>
    </div>
  )
}

export function StatusLine({ text, progress }: { text: string; progress?: number }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/50 p-3">
      <div className="flex items-center gap-2 text-sm"><Cpu className="size-4 animate-pulse text-accent" />{text}</div>
      {progress != null && <Progress value={progress} />}
    </div>
  )
}

/** Simple markdown-ish safe text block */
export function Prose({ html, className }: { html: string; className?: string }) {
  return <div className={cn('prose-sm max-w-none text-sm leading-relaxed [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_a]:text-accent [&_img]:max-w-full [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-2 [&_code]:font-mono', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

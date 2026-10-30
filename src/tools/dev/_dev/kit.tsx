/* Shared helpers for dev + text tools (owned by the "dev" agent). */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button, cn } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { toast } from '@/components/toast'

/** Lazily load a module once and cache it across components. */
const modCache = new Map<string, Promise<any>>()
export function useLib<T>(key: string, loader: () => Promise<T>): T | null {
  const [mod, setMod] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    if (!modCache.has(key)) modCache.set(key, loader())
    modCache.get(key)!.then((m) => alive && setMod(() => m)).catch((e) => { console.error(e); toast('Failed to load a library, check your connection', 'error') })
    return () => { alive = false }
  }, [key])
  return mod
}

/** Persist state in localStorage. */
export function useStored<T>(key: string, init: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem('of:' + key); return s != null ? (JSON.parse(s) as T) : init } catch { return init }
  })
  useEffect(() => { try { localStorage.setItem('of:' + key, JSON.stringify(v)) } catch { /* quota */ } }, [key, v])
  return [v, setV]
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export const downloadText = (text: string, filename: string, mime = 'text/plain') => downloadBlob(new Blob([text], { type: mime + ';charset=utf-8' }), filename)

export function Stat({ label, value, sub, className }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-surface-2/40 px-3 py-2.5', className)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 truncate font-display text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

/** Panel with a header row (title + actions) and body. */
/** The text title of the surrounding Pane, so a CodeArea inside it gets that title as its accessible name. */
const PaneTitle = createContext<string | undefined>(undefined)
export function Pane({ title, actions, children, className, bodyClass }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/40 px-3 py-2">
          <div className="mr-auto text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
          {actions}
        </div>
      )}
      <div className={cn('min-h-0 flex-1', bodyClass)}><PaneTitle.Provider value={typeof title === 'string' ? title : undefined}>{children}</PaneTitle.Provider></div>
    </div>
  )
}

/** Plain code textarea that fills a Pane, with optional line numbers. */
export function CodeArea({ value, onChange, placeholder, readOnly, className, lineNumbers = true, errorLine, minRows = 14, spellCheck = false, onKeyDown, label }: {
  label?: string; value: string; onChange?: (v: string) => void; placeholder?: string; readOnly?: boolean; className?: string; lineNumbers?: boolean; errorLine?: number | null; minRows?: number; spellCheck?: boolean; onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>
}) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const gut = useRef<HTMLDivElement>(null)
  const pane = useContext(PaneTitle)
  const lines = Math.max(1, value.split('\n').length)
  return (
    <div className={cn('relative flex h-full min-h-0', className)} style={{ minHeight: minRows * 20 + 16 }}>
      {lineNumbers && (
        <div ref={gut} aria-hidden className="w-11 shrink-0 select-none overflow-hidden border-r border-border bg-surface-2/40 py-2 pr-2 text-right font-mono text-[11px] leading-5 text-muted/70">
          {Array.from({ length: Math.min(lines, 20000) }, (_, i) => <div key={i} className={cn(errorLine === i + 1 && 'bg-danger/20 text-danger font-bold')}>{i + 1}</div>)}
        </div>
      )}
      <textarea
        ref={ta} value={value} readOnly={readOnly} spellCheck={spellCheck} placeholder={placeholder} aria-label={label || pane || (readOnly ? 'Output' : 'Input')}
        onChange={(e) => onChange?.(e.target.value)}
        onScroll={(e) => { if (gut.current) gut.current.scrollTop = e.currentTarget.scrollTop }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.defaultPrevented) return
          if (e.key === 'Tab' && !readOnly && onChange) {
            e.preventDefault(); const t = e.currentTarget; const s = t.selectionStart, en = t.selectionEnd
            const nv = value.slice(0, s) + '  ' + value.slice(en); onChange(nv)
            requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2 })
          }
        }}
        className="scrollbar-thin h-full min-h-0 w-full flex-1 resize-none whitespace-pre bg-transparent px-3 py-2 font-mono text-[13px] leading-5 text-fg outline-none placeholder:text-muted/60"
        style={{ tabSize: 2 }}
      />
    </div>
  )
}

/** Small file-open button that reads text. */
/** True when the bytes look like a binary file (NUL bytes or many control characters), not text. */
export function looksBinary(b: Uint8Array) {
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return false // UTF-16 text with a BOM
  const n = Math.min(b.length, 8192); let ctrl = 0
  for (let i = 0; i < n; i++) { const c = b[i]; if (c === 0) return true; if (c < 9 || (c > 13 && c < 32)) ctrl++ }
  return n > 0 && ctrl / n > 0.1
}
/** Read a file as text, or show a plain message and return null when it is not a text file. */
export async function readTextFile(f: File): Promise<string | null> {
  const b = new Uint8Array(await f.arrayBuffer())
  if (looksBinary(b)) { toast(`${f.name} is not a text file, so it was not opened. Choose a text file such as .json, .csv or .txt.`, 'error'); return null }
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b)
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b)
  return new TextDecoder().decode(b)
}

export function OpenFileButton({ onText, onFile, accept, label = 'Open', size = 'sm' }: { onText?: (t: string, name: string) => void; onFile?: (f: File) => void; accept?: string; label?: string; size?: 'sm' | 'md' }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={ref} type="file" hidden accept={accept} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; onFile?.(f); if (onText) { const t = await readTextFile(f); if (t != null) onText(t, f.name) } }} />
      <Button size={size} variant="ghost" icon={<Upload className="size-4" />} onClick={() => ref.current?.click()}>{label}</Button>
    </>
  )
}

export function DownloadButton({ text, filename, mime, label = 'Download', size = 'sm', variant = 'ghost' }: { text: string | (() => string); filename: string; mime?: string; label?: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'outline' | 'secondary' | 'primary' }) {
  return <Button size={size} variant={variant} icon={<Download className="size-4" />} onClick={() => downloadText(typeof text === 'function' ? text() : text, filename, mime)}>{label}</Button>
}

/** Drop text files anywhere on a region. */
export function useTextDrop(onText: (t: string, name: string) => void) {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true) },
      onDragLeave: () => setOver(false),
      onDrop: async (e: React.DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (!f) return; const t = await readTextFile(f); if (t != null) onText(t, f.name) },
    },
  }
}

/** Escape HTML for dangerouslySetInnerHTML highlighters. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Tiny multi-language syntax highlighter → HTML string (tokens colored with inline classes). */
const KW = /\b(const|let|var|function|return|await|async|import|from|export|new|if|else|for|while|try|catch|throw|class|public|private|static|void|fn|use|let|mut|package|func|def|end|do|require|using|var|val|true|false|null|nil|None|True|False|struct|impl|match|in|of|final|string|int|bool|echo|as|with|go|defer|main|self|this|then|elif|import|unwrap|try!|guard|print|println|Ok|Err)\b/g
const SQL_KW = new Set('select from where and or join left right inner outer full cross on group by order having limit insert into values update set delete create table alter drop as distinct case when then else end not null is in like ilike union all with primary key references foreign index default asc desc offset returning exists between unique constraint check view trigger function procedure begin commit rollback transaction grant revoke truncate cascade if replace column add rename to using over partition window row rows fetch first next only top count sum avg min max coalesce cast int integer bigint smallint varchar char text boolean bool date timestamp timestamptz numeric decimal float real serial bigserial uuid json jsonb auto_increment engine charset collate lateral natural except intersect merge upsert conflict do nothing'.split(' '))
export type HlLang = 'js' | 'py' | 'json' | 'sql' | 'generic' | 'plain' | 'conf'
export function highlightCode(code: string, lang: HlLang = 'generic'): string {
  // prose (Markdown) is shown as is; config files (.gitignore) only dim their # comment lines
  if (lang === 'plain') return esc(code)
  if (lang === 'conf') return code.split('\n').map((l) => (/^\s*#/.test(l) ? `<span class="text-muted italic">${esc(l)}</span>` : esc(l))).join('\n')
  // tokenise: strings, comments, numbers, keywords
  const re = lang === 'sql'
    ? /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.)*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g
    : lang === 'py' ? /(#[^\n]*)|("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b-?\d+(?:\.\d+)?\b)|(\b[a-zA-Z_][\w!]*\b)/g
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_][\w!]*\b)/g
  let out = '', last = 0, m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index)); last = re.lastIndex
    const t = esc(m[0])
    if (m[1]) out += `<span class="text-muted italic">${t}</span>`
    else if (m[2]) {
      if (lang === 'json' && /^\s*:/.test(code.slice(re.lastIndex))) out += `<span class="text-accent">${t}</span>`
      else out += `<span class="text-success">${t}</span>`
    }
    else if (m[3]) out += `<span class="text-warn">${t}</span>`
    else if (m[4]) {
      if (lang === 'sql') out += SQL_KW.has(m[4].toLowerCase()) ? `<span class="text-accent font-semibold">${t}</span>` : t
      else if (lang === 'json') out += /^(true|false|null)$/.test(m[4]) ? `<span class="text-[#fdba74]">${t}</span>` : t
      else { KW.lastIndex = 0; out += KW.test(m[4]) ? `<span class="text-accent font-medium">${t}</span>` : /^[A-Z]/.test(m[4]) ? `<span class="text-[#22d3ee]">${t}</span>` : t }
    }
    else out += t
  }
  return out + esc(code.slice(last))
}

export function CodeView({ code, lang = 'generic', className }: { code: string; lang?: HlLang; className?: string }) {
  const html = React.useMemo(() => (code.length > 300000 ? esc(code) : highlightCode(code, lang)), [code, lang])
  return <pre className={cn('scrollbar-thin overflow-auto whitespace-pre p-4 font-mono text-[13px] leading-5', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

export function Chip({ active, onClick, children, title }: { active?: boolean; onClick?: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer', active ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2/50 text-muted hover:text-fg hover:border-accent/50')}>{children}</button>
  )
}

/** crypto-strong random integer in [0, max) */
export function randInt(max: number): number {
  if (max <= 0) return 0
  const lim = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  while (true) { crypto.getRandomValues(buf); if (buf[0] < lim) return buf[0] % max }
}

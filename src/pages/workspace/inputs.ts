/* Ways to get files into the Workspace: drop (folders too), folder picker, paste, public URLs, ZIPs, samples, watch folder. */
import { kindOf, type Kind } from './catalog'
import { unzipItems, mimeFor } from './steps'
import { safeUrl } from '@/lib/safe'

export type InFile = { id: string; name: string; path?: string; blob: Blob; kind: Kind; added: number; origin: 'drop' | 'folder' | 'paste' | 'url' | 'zip' | 'sample' | 'watch' | 'picker' }
let seq = 0
export const fileId = () => 'f' + Date.now().toString(36) + (seq++).toString(36)
export const MAX_FILES = 2000

export function toIn(blob: Blob, name: string, origin: InFile['origin'], path?: string): InFile {
  const type = blob.type || mimeFor(name)
  const b = blob.type ? blob : new Blob([blob], { type })
  return { id: fileId(), name, path, blob: b, kind: kindOf(name, type), added: Date.now(), origin }
}

/** Expand ZIPs into their files when `unpack` is on. */
export async function expand(list: InFile[], unpack: boolean): Promise<InFile[]> {
  if (!unpack) return list
  const out: InFile[] = []
  for (const f of list) {
    if (f.kind !== 'archive') { out.push(f); continue }
    try { (await unzipItems(f.blob)).forEach((x) => out.push(toIn(x.blob, x.name, 'zip', `${f.name.replace(/\.zip$/i, '')}/${x.path}`))) }
    catch { out.push(f) }
  }
  return out
}

/** Read a drop, walking into folders (webkitGetAsEntry). Falls back to the flat file list. */
export async function fromDrop(dt: DataTransfer): Promise<InFile[]> {
  const items = Array.from(dt.items || []).filter((i) => i.kind === 'file')
  const entries = items.map((i) => (i as any).webkitGetAsEntry?.() as any).filter(Boolean)
  if (!entries.length) return Array.from(dt.files).map((f) => toIn(f, f.name, 'drop'))
  const out: InFile[] = []
  const walk = async (e: any, prefix: string): Promise<void> => {
    if (out.length >= MAX_FILES) return
    if (e.isFile) { const f: File = await new Promise((r, j) => e.file(r, j)); out.push(toIn(f, f.name, prefix ? 'folder' : 'drop', prefix ? prefix + f.name : undefined)); return }
    if (e.isDirectory) {
      const reader = e.createReader()
      for (;;) {
        const batch: any[] = await new Promise((r, j) => reader.readEntries(r, j))
        if (!batch.length) break
        for (const c of batch) await walk(c, prefix + e.name + '/')
      }
    }
  }
  for (const e of entries) await walk(e, '')
  return out
}

/** Files from <input webkitdirectory> keep their relative path. */
export const fromPicker = (list: FileList | null, folder = false): InFile[] =>
  Array.from(list || []).slice(0, MAX_FILES).map((f) => toIn(f, f.name, folder ? 'folder' : 'picker', folder ? (f as any).webkitRelativePath || undefined : undefined))

/** Files and text from a paste event. Text becomes a .txt file. */
export function fromPaste(e: ClipboardEvent | React.ClipboardEvent): InFile[] {
  const cd = (e as ClipboardEvent).clipboardData
  if (!cd) return []
  const files = Array.from(cd.files || [])
  if (files.length) return files.map((f, i) => toIn(f, f.name && f.name !== 'image.png' ? f.name : `pasted-${Date.now().toString(36)}-${i}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, 'paste'))
  const text = cd.getData('text/plain')
  if (text && text.trim()) return [toIn(new Blob([text], { type: 'text/plain' }), `pasted-${Date.now().toString(36)}.txt`, 'paste')]
  return []
}

/** Read images and text from the async clipboard API (the Paste button). */
export async function fromClipboardApi(): Promise<InFile[]> {
  const out: InFile[] = []
  const nav = navigator.clipboard as any
  if (nav?.read) {
    const items = await nav.read()
    for (const it of items) {
      const img = it.types.find((t: string) => t.startsWith('image/'))
      if (img) { const b = await it.getType(img); out.push(toIn(b, `pasted-${Date.now().toString(36)}.${img.split('/')[1].replace('jpeg', 'jpg')}`, 'paste')); continue }
      if (it.types.includes('text/plain')) { const t = await (await it.getType('text/plain')).text(); if (t.trim()) out.push(toIn(new Blob([t], { type: 'text/plain' }), `pasted-${Date.now().toString(36)}.txt`, 'paste')) }
    }
    return out
  }
  const t = await navigator.clipboard.readText()
  return t.trim() ? [toIn(new Blob([t], { type: 'text/plain' }), `pasted-${Date.now().toString(36)}.txt`, 'paste')] : []
}

/** Only plain http(s) links to public files. */
export function checkUrl(raw: string): URL | null {
  const s = safeUrl(raw.trim())
  if (!s) return null
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:' ? u : null } catch { return null }
}

export const URL_MAX = 512 * 1024 * 1024

/** Download a public file. The other site must allow it (CORS), otherwise the browser blocks the read. */
export async function fromUrl(raw: string, signal?: AbortSignal): Promise<InFile> {
  const u = checkUrl(raw)
  if (!u) throw new Error('Use a full http or https link to a file.')
  let res: Response
  try { res = await fetch(u.href, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal }) }
  catch { throw new Error('That site does not allow other pages to read its files (CORS). Download it and drop it here instead.') }
  if (!res.ok) throw new Error(`The link answered ${res.status}.`)
  const len = Number(res.headers.get('content-length') || 0)
  if (len > URL_MAX) throw new Error('That file is larger than 512 MB.')
  const blob = await res.blob()
  if (blob.size > URL_MAX) throw new Error('That file is larger than 512 MB.')
  const cd = res.headers.get('content-disposition') || ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  let name = m ? decodeURIComponent(m[1]) : decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'download')
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 160) || 'download'
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) { const e = (blob.type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('svg+xml', 'svg').split(';')[0]; name += '.' + e }
  return toIn(blob, name, 'url')
}

const base = () => (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
export async function fromSamples(names: string[]): Promise<InFile[]> {
  const out = await Promise.all(names.map(async (n) => {
    const r = await fetch(`${base()}media/workspace/samples/${encodeURIComponent(n)}`)
    if (!r.ok) throw new Error('Could not load sample ' + n)
    return toIn(await r.blob(), n, 'sample')
  }))
  return out
}

/* ---------- watch folder (File System Access API, Chromium) ---------- */
export const canWatch = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export type Watcher = { name: string; stop: () => void }
/** Poll a folder every few seconds and report files that are new or changed since the last look. */
export async function watchFolder(onNew: (f: InFile[]) => void, every = 3000): Promise<Watcher> {
  const dir: any = await (window as any).showDirectoryPicker({ mode: 'read' })
  const seen = new Map<string, number>()
  let stopped = false
  const scan = async (h: any, prefix: string, found: InFile[]) => {
    for await (const [name, entry] of h.entries()) {
      if (entry.kind === 'directory') { if (prefix.split('/').length < 4) await scan(entry, prefix + name + '/', found); continue }
      const f: File = await entry.getFile()
      const key = prefix + name
      if (seen.get(key) === f.lastModified) continue
      seen.set(key, f.lastModified)
      found.push(toIn(f, f.name, 'watch', prefix ? key : undefined))
    }
  }
  const tick = async () => {
    if (stopped) return
    const found: InFile[] = []
    try { await scan(dir, '', found) } catch { /* folder went away or permission dropped */ }
    if (found.length) onNew(found)
    if (!stopped) timer = window.setTimeout(tick, every)
  }
  let timer = window.setTimeout(tick, 0)
  return { name: dir.name, stop: () => { stopped = true; clearTimeout(timer) } }
}

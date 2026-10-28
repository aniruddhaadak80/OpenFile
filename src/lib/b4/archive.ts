/* Client for the 7-Zip worker: extract any archive, create 7Z/ZIP/TAR(+GZ/XZ/BZ2) and single-file streams. */
export interface ArcFile { path: string; data: Uint8Array }
export class PasswordError extends Error { constructor(m: string) { super(m); this.name = 'PasswordError' } }

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void; onStatus?: (s: string) => void }>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./sevenzip.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const m = e.data, p = pending.get(m.id)
      if (!p) return
      if (m.type === 'status') return p.onStatus?.(m.text)
      pending.delete(m.id)
      if (m.type === 'done') p.resolve(m)
      else p.reject(m.code === 'PASSWORD' ? new PasswordError(m.message) : new Error(m.message))
    }
    worker.onerror = (e) => {
      const err = new Error(e.message || 'The archive engine crashed. The file may be too large for the browser.')
      pending.forEach((p) => p.reject(err)); pending.clear(); worker?.terminate(); worker = null
    }
  }
  return worker
}

/** Stop any running archive job (the worker is re-created on next use). */
export function cancelArchive() {
  worker?.terminate(); worker = null
  pending.forEach((p) => p.reject(Object.assign(new Error('Cancelled'), { name: 'CancelledError' }))); pending.clear()
}

function send(msg: any, transfer: Transferable[], onStatus?: (s: string) => void): Promise<any> {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onStatus })
    getWorker().postMessage({ ...msg, id }, transfer)
  })
}

const bytes = async (b: Blob | Uint8Array) => (b instanceof Uint8Array ? b.slice() : new Uint8Array(await b.arrayBuffer()))

/** Extract every entry. Nested single .tar inside .gz/.xz/.bz2/.zst is unpacked too. */
export async function extractArchive(file: Blob, name: string, opts: { password?: string; onStatus?: (s: string) => void; unwrapTar?: boolean } = {}): Promise<{ files: ArcFile[]; warning?: string }> {
  const data = await bytes(file)
  const r = await send({ op: 'extract', name, data, password: opts.password }, [data.buffer], opts.onStatus)
  let files: ArcFile[] = r.files
  if (opts.unwrapTar !== false && files.length === 1 && /\.(tar|cpio)$/i.test(files[0].path) && !/\.(tar|cpio)$/i.test(name)) {
    const inner = await send({ op: 'extract', name: files[0].path, data: files[0].data }, [files[0].data.buffer], opts.onStatus)
    files = inner.files
  }
  return { files, warning: r.warning }
}

export type ArcFormat = 'zip' | '7z' | 'tar' | 'tar.gz' | 'tar.xz' | 'tar.bz2' | 'tar.zst'
export const ARC_EXT: Record<ArcFormat, string> = { zip: 'zip', '7z': '7z', tar: 'tar', 'tar.gz': 'tar.gz', 'tar.xz': 'tar.xz', 'tar.bz2': 'tar.bz2', 'tar.zst': 'tar.zst' }
export const ARC_MIME: Record<ArcFormat, string> = { zip: 'application/zip', '7z': 'application/x-7z-compressed', tar: 'application/x-tar', 'tar.gz': 'application/gzip', 'tar.xz': 'application/x-xz', 'tar.bz2': 'application/x-bzip2', 'tar.zst': 'application/zstd' }

export interface CreateOpts { level?: number; password?: string; encryptNames?: boolean; zipAes?: boolean; onStatus?: (s: string) => void }

/** Build the 7z command line for an archive (pure, unit tested). */
export function createArgs(fmt: ArcFormat, entries: string[], o: { level?: number; password?: string; encryptNames?: boolean; zipAes?: boolean }) {
  const lvl = Math.max(0, Math.min(9, o.level ?? 5))
  const base = (type: string, out: string) => ['a', '-t' + type, '-mx=' + lvl, '-bd', '-y', out]
  if (fmt === 'zip') return [...base('zip', '/out.zip'), ...(o.password ? ['-p' + o.password, ...(o.zipAes !== false ? ['-mem=AES256'] : [])] : []), '-mcu=on', '--', ...entries]
  if (fmt === '7z') return [...base('7z', '/out.7z'), ...(o.password ? ['-p' + o.password, ...(o.encryptNames ? ['-mhe=on'] : [])] : []), '--', ...entries]
  return ['a', '-ttar', '-bd', '-y', '/out.tar', '--', ...entries]
}

export async function createArchive(files: ArcFile[], fmt: ArcFormat, o: CreateOpts = {}): Promise<Blob> {
  const top = [...new Set(files.map((f) => f.path.replace(/^\/+/, '').split('/')[0]).filter(Boolean))]
  if (!top.length) throw new Error('Add at least one file.')
  const tr = files.map((f) => f.data.buffer as ArrayBuffer)
  const outName = fmt === 'zip' ? '/out.zip' : fmt === '7z' ? '/out.7z' : '/out.tar'
  const r = await send({ op: 'create', files, args: createArgs(fmt, top, o), outName }, tr, o.onStatus)
  let out: Uint8Array = r.files[0].data
  if (fmt.startsWith('tar.')) out = await compressStream(out, fmt.slice(4) as StreamFormat, { level: o.level, onStatus: o.onStatus })
  return new Blob([out as BlobPart], { type: ARC_MIME[fmt] })
}

export type StreamFormat = 'gz' | 'xz' | 'bz2' | 'zst'
const STREAM_TYPE: Record<StreamFormat, string> = { gz: 'gzip', xz: 'xz', bz2: 'bzip2', zst: 'zstd' }

/** Compress one buffer to gzip, xz, bzip2 or zstd. gzip goes through fflate (fast, no engine download). */
export async function compressStream(data: Uint8Array, fmt: StreamFormat, o: { level?: number; name?: string; onStatus?: (s: string) => void } = {}): Promise<Uint8Array> {
  const lvl = Math.max(1, Math.min(9, o.level ?? 6))
  if (fmt === 'gz') { const { gzipSync } = await import('fflate'); return gzipSync(data, { level: lvl as any, filename: o.name }) }
  if (fmt === 'zst') {
    const z = await import('@bokuweb/zstd-wasm'); await z.init()
    return z.compress(data, Math.round(lvl * 2.1))
  }
  const name = o.name || 'data'
  const r = await send({ op: 'run', files: [{ path: name, data }], args: ['a', '-t' + STREAM_TYPE[fmt], '-mx=' + lvl, '-bd', '-y', '/out.bin', '--', name], outputs: ['/out.bin'] }, [data.buffer as ArrayBuffer], o.onStatus)
  return r.files[0].data
}

export async function decompressStream(data: Uint8Array, fmt: StreamFormat, o: { onStatus?: (s: string) => void } = {}): Promise<Uint8Array> {
  if (fmt === 'gz') { const { gunzipSync } = await import('fflate'); return gunzipSync(data) }
  if (fmt === 'zst') { const z = await import('@bokuweb/zstd-wasm'); await z.init(); return z.decompress(data) }
  const r = await extractArchive(new Blob([data as BlobPart]), 'in.' + fmt, { onStatus: o.onStatus, unwrapTar: false })
  const f = r.files.find((x) => !x.path.endsWith('/'))
  if (!f) throw new Error('Nothing could be decompressed from this file.')
  return f.data
}

/** Group a flat list into a folder tree for display. */
export interface TreeNode { name: string; path: string; dir: boolean; size: number; children: TreeNode[]; file?: ArcFile }
export function buildTree(files: ArcFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', dir: true, size: 0, children: [] }
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean)
    let cur = root
    parts.forEach((p, i) => {
      const last = i === parts.length - 1
      const isDir = !last || f.path.endsWith('/')
      let n = cur.children.find((c) => c.name === p && c.dir === isDir)
      if (!n) { n = { name: p, path: parts.slice(0, i + 1).join('/') + (isDir ? '/' : ''), dir: isDir, size: 0, children: [] }; cur.children.push(n) }
      if (last && !isDir) { n.file = f; n.size = f.data.length }
      cur = n
    })
  }
  const sum = (n: TreeNode): number => { if (n.dir) { n.size = n.children.reduce((a, c) => a + sum(c), 0); n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.dir ? -1 : 1)) } return n.size }
  sum(root)
  return root
}

export const isArchiveName = (n: string) => /\.(zip|7z|rar|tar|tgz|tbz2?|txz|gz|bz2|xz|zst|lz|lzma|z|cab|iso|cpio|deb|rpm|arj|lzh|lha|chm|dmg|jar|apk|ipa|war|ear|xpi|cbz|cbr|cb7|cbt|wim|img|vhd|vhdx|msi|nsis|udf|squashfs|swm|xar|pkg)$/i.test(n)

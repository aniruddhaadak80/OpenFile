/// <reference lib="webworker" />
/* 7-Zip (7z-wasm, LGPL-2.1 with the unRAR restriction) in a Web Worker.
 * The engine is a separately loaded WASM asset, fetched on first use and cached by the browser.
 * Each job gets a fresh module instance so a failed run never leaves state behind. */
import SevenZip from '7z-wasm'
import wasmUrl from '7z-wasm/7zz.wasm?url'

type InFile = { path: string; data: Uint8Array }
type Job =
  | { id: number; op: 'extract'; name: string; data: Uint8Array; password?: string }
  | { id: number; op: 'create'; files: InFile[]; args: string[]; outName: string }
  | { id: number; op: 'run'; files: InFile[]; args: string[]; outputs: string[] }

const post = (m: any, t?: Transferable[]) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, t ?? [])
let wasmBinary: ArrayBuffer | null = null

async function engine(id: number, log: string[]) {
  if (!wasmBinary) {
    post({ id, type: 'status', text: 'Downloading the archive engine (about 1.6 MB, first time only)' })
    const r = await fetch(wasmUrl)
    if (!r.ok) throw new Error('Could not download the archive engine. Check your connection and try again.')
    wasmBinary = await r.arrayBuffer()
  }
  return SevenZip({ wasmBinary: wasmBinary.slice(0), print: (s: string) => log.push(s), printErr: (s: string) => log.push(s), noExitRuntime: true } as any)
}

function mkdirp(FS: any, p: string) {
  let cur = ''
  for (const part of p.split('/').filter(Boolean)) { cur += '/' + part; try { FS.mkdir(cur) } catch { /* exists */ } }
}

function walk(FS: any, dir: string, prefix = ''): InFile[] {
  const out: InFile[] = []
  for (const n of FS.readdir(dir) as string[]) {
    if (n === '.' || n === '..') continue
    const full = dir + '/' + n, rel = prefix ? prefix + '/' + n : n
    const st = FS.stat(full)
    if (FS.isDir(st.mode)) { const kids = walk(FS, full, rel); if (!kids.length) out.push({ path: rel + '/', data: new Uint8Array(0) }); else out.push(...kids) }
    else out.push({ path: rel, data: FS.readFile(full) })
  }
  return out
}

function explain(log: string[]): string {
  const t = log.join('\n')
  if (/Wrong password|Can not open encrypted archive|Data Error in encrypted file/i.test(t)) return 'PASSWORD'
  if (/Can not open the file as archive|Cannot open the file as archive|is not archive/i.test(t)) return 'This file is not an archive the engine can open, or it is damaged.'
  if (/Unsupported Method/i.test(t)) return 'This archive uses a compression method that is not supported.'
  if (/Unexpected end of archive|Headers Error|CRC Failed|Data Error/i.test(t)) return 'The archive is damaged or incomplete. Some files may be missing.'
  if (/out of memory|Cannot allocate/i.test(t)) return 'The browser ran out of memory. Try a smaller archive.'
  const line = log.filter((l) => /error|cannot|can not/i.test(l)).slice(-2).join(' ').trim()
  return line ? 'The archive engine reported: ' + line.slice(0, 200) : 'The archive engine failed.'
}

/** Run 7z. Exit codes are not reliable in this build, so errors are read from the log. */
function call(sz: any, args: string[], log: string[]): number {
  const before = log.length
  let code = 0
  try { const r = sz.callMain(args); if (typeof r === 'number') code = r } catch (e: any) {
    if (typeof e === 'number') code = e
    else if (e && typeof e.status === 'number') code = e.status
    else { log.push(String(e?.message || e)); code = 2 }
  }
  const fresh = log.slice(before).join('\n')
  if (!code && /ERROR:|Can ?not open|Wrong password|is not archive|Unexpected end|Headers Error|CRC Failed|Data Error/i.test(fresh)) code = 2
  return code
}

self.onmessage = async (ev: MessageEvent<Job>) => {
  const job = ev.data
  const log: string[] = []
  try {
    const sz = await engine(job.id, log)
    const FS = sz.FS
    post({ id: job.id, type: 'status', text: 'Working' })
    if (job.op === 'extract') {
      const safe = 'in_' + job.name.replace(/[^\w.\-]+/g, '_')
      FS.writeFile('/' + safe, job.data)
      FS.mkdir('/out')
      const code = call(sz, ['x', '/' + safe, '-o/out', '-y', '-aou', '-p' + (job.password ?? ''), '-bb0', '-bd'], log)
      let files: InFile[] = []
      try { files = walk(FS, '/out') } catch { files = [] }
      const err = code !== 0 ? explain(log) : ''
      if (err === 'PASSWORD') { files = []; post({ id: job.id, type: 'error', code: 'PASSWORD', message: job.password ? 'That password is not right. Try again.' : 'This archive is protected with a password.' }); return }
      if (!files.length && code !== 0) throw new Error(err)
      post({ id: job.id, type: 'done', files, warning: code !== 0 ? err : undefined }, files.map((f) => f.data.buffer as ArrayBuffer))
      return
    }
    // create / run: write inputs under /in, then call 7z from there
    mkdirp(FS, '/in')
    for (const f of job.files) {
      const p = '/in/' + f.path.replace(/^\/+/, '')
      if (p.endsWith('/')) { mkdirp(FS, p); continue }
      mkdirp(FS, p.slice(0, p.lastIndexOf('/')))
      FS.writeFile(p, f.data)
    }
    FS.chdir('/in')
    const code = call(sz, job.args, log)
    if (code !== 0) { const e = explain(log); throw new Error(e === 'PASSWORD' ? 'Wrong password.' : e) }
    const names = job.op === 'create' ? [job.outName] : job.outputs
    const outs: InFile[] = []
    for (const n of names) { try { outs.push({ path: n, data: FS.readFile(n) }) } catch { /* missing */ } }
    if (!outs.length) throw new Error(explain(log))
    post({ id: job.id, type: 'done', files: outs }, outs.map((f) => f.data.buffer as ArrayBuffer))
  } catch (e: any) {
    post({ id: job.id, type: 'error', message: e?.message || String(e) })
  }
}

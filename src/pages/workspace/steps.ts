// Pipeline steps for the OpenFile Workspace. The catalog (names, settings, accepted files) is in catalog.ts;
// this file holds the code that runs each step. Steps reuse the shared tool libraries: the image worker pool,
// pdf-lib and pdf.js helpers, the self-hosted ffmpeg engine, the never-bigger compress guard, fflate, papaparse,
// SheetJS, tesseract.js and the background removal worker.
import { CATALOG, CATS, kindOf, extOf, type StepMeta, type ParamDef as PD, type Cat } from './catalog'
import { renamePattern } from './recipe'
import { imagePool } from './pool'
import { waitTurn } from './engine'
import { notSmaller, planVideo, videoArgs, audioArgs, RETRY_FACTOR, type VideoSource } from '@/lib/compress-guard'
import { baseName } from '@/lib/files'

export type Mode = Cat
export type ParamDef = PD
export type Item = { name: string; blob: Blob; path?: string; kept?: boolean; note?: string }
export type StepDef = StepMeta & { mode: Cat; run: (items: Item[], p: Record<string, any>, onP: (r: number) => void, signal?: AbortSignal) => Promise<Item[]> }

const IMG_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' }
const kindOfItem = (it: Item) => kindOf(it.name, it.blob.type)
const withExt = (name: string, ext: string) => `${baseName(name)}.${ext}`
const check = (s?: AbortSignal) => { if (s?.aborted) throw new Error('Cancelled') }

/** Run `fn` on each file in turn (the engine already sends one file at a time; the docs demo sends several). */
const perFile = (fn: (it: Item, p: Record<string, any>, onP: (r: number) => void, signal?: AbortSignal) => Promise<Item[]>) =>
  async (items: Item[], p: Record<string, any>, onP: (r: number) => void, signal?: AbortSignal) => {
    const out: Item[] = []
    for (let i = 0; i < items.length; i++) { check(signal); await waitTurn(signal); out.push(...(await fn(items[i], p, (r) => onP((i + r) / items.length), signal))) }
    onP(1)
    return out
  }

/* ---------- image ---------- */
const imageStep = (id: string) => perFile(async (it, p) => {
  const blob = await imagePool.run(it.blob, { step: id, params: p, type: it.blob.type || 'image/png' })
  const ext = IMG_EXT[blob.type] || 'png'
  if (id === 'img-compress' && notSmaller(it.blob.size, blob.size)) return [{ ...it, kept: true, note: 'Already as small as it gets at this quality, original kept' }]
  return [{ name: withExt(it.name, ext), blob, path: it.path }]
})

let bgWorker: Worker | null = null
let bgSeq = 0
const bgRemove = perFile(async (it, p, onP, signal) => {
  if (!bgWorker) bgWorker = new Worker(new URL('../../tools/image/bg-remover.worker.ts', import.meta.url), { type: 'module' })
  const w = bgWorker
  const id = 'ws' + ++bgSeq
  const blob = await new Promise<Blob>((resolve, reject) => {
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data; if (m.id !== id) return
      if (m.type === 'progress') { if (m.total) onP(Math.min(0.95, m.cur / m.total)) }
      else { w.removeEventListener('message', onMsg); m.type === 'done' ? resolve(m.blob) : reject(new Error(m.message || 'Background removal failed')) }
    }
    w.addEventListener('message', onMsg)
    signal?.addEventListener('abort', () => { w.terminate(); bgWorker = null; reject(new Error('Cancelled')) }, { once: true })
    w.postMessage({ id, file: it.blob, model: p.model, preferGpu: true })
  })
  return [{ name: withExt(it.name, 'png'), blob, path: it.path }]
})

/* ---------- pdf ---------- */
const pdfOut = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' })
const eachPdf = (fn: (doc: any, p: Record<string, any>) => Promise<void>) => perFile(async (it, p) => {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await it.blob.arrayBuffer(), { ignoreEncryption: true })
  await fn(doc, p)
  return [{ name: it.name, blob: pdfOut(await doc.save()), path: it.path }]
})

async function imageBytesForPdf(b: Blob): Promise<{ bytes: Uint8Array; png: boolean }> {
  if (b.type === 'image/jpeg' || b.type === 'image/png') return { bytes: new Uint8Array(await b.arrayBuffer()), png: b.type === 'image/png' }
  const png = await imagePool.run(b, { step: 'img-convert', params: { format: 'png', quality: 100 }, type: b.type })
  return { bytes: new Uint8Array(await png.arrayBuffer()), png: true }
}

/* ---------- media (ffmpeg) ---------- */
const media = () => import('@/tools/video/_media/engine')
const VIDEO_MIME: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska' }
async function ff(it: Item, args: (input: string) => string[], output: string, onP: (r: number) => void, signal?: AbortSignal, duration?: number) {
  const m = await media()
  const input = 'in' + m.extFromBlob(new File([it.blob], it.name, { type: it.blob.type }))
  const stop = () => m.cancelEngine()
  signal?.addEventListener('abort', stop, { once: true })
  try { return await m.ffRun({ inputs: [{ name: input, file: it.blob }], args: args(input), output, duration, onProgress: onP } as any) }
  finally { signal?.removeEventListener('abort', stop) }
}

const vidCompress = perFile(async (it, p, onP, signal) => {
  const m = await media()
  const probe = await m.ffProbe(it.blob, 'probe' + m.extFromBlob(new File([it.blob], it.name)))
  if (!probe.duration) throw new Error('Could not read the length of this video')
  const src: VideoSource = { sizeBytes: it.blob.size, duration: probe.duration, width: probe.width || 0, height: probe.height || 0, fps: probe.fps, hasAudio: probe.hasAudio, videoKbps: probe.videoKbps, audioKbps: probe.audioKbps, acodec: probe.acodec }
  const opts = { preset: p.preset, res: p.res === 'original' ? 'original' as const : Number(p.res), noAudio: !!p.noAudio }
  const landscape = (src.width || 16) >= (src.height || 9)
  const encode = (factor?: number, from = 0, span = 1) => { const plan = planVideo(src, { ...opts, factor }); return ff(it, (i) => ['-i', i, ...videoArgs(plan, 26, landscape), ...audioArgs(plan), '-movflags', '+faststart', 'out.mp4'], 'out.mp4', (r) => onP(from + r * span), signal, probe.duration) }
  const a = await encode(undefined, 0, 0.5)
  if (!notSmaller(it.blob.size, a.size)) return [{ name: withExt(it.name, 'mp4'), blob: a, path: it.path }]
  const b = await encode(RETRY_FACTOR, 0.5, 0.5)
  if (!notSmaller(it.blob.size, b.size)) return [{ name: withExt(it.name, 'mp4'), blob: b, path: it.path, note: 'Second, lower bitrate try' }]
  return [{ ...it, kept: true, note: 'This video is already as small as it gets at this quality, original kept' }]
})

/* ---------- data ---------- */
async function readTable(it: Item): Promise<Record<string, unknown>[]> {
  const e = extOf(it.name)
  if (e === 'json') {
    const j = JSON.parse(await it.blob.text())
    const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [j]
    return arr.map((r: unknown) => (r && typeof r === 'object' && !Array.isArray(r) ? r as Record<string, unknown> : { value: r }))
  }
  if (e === 'csv' || e === 'tsv') {
    const Papa = (await import('papaparse')).default
    return Papa.parse<Record<string, unknown>>(await it.blob.text(), { header: true, skipEmptyLines: true, dynamicTyping: true }).data
  }
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(await it.blob.arrayBuffer()), { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
}
const flat = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])))

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* ---------- checksum ---------- */
async function digest(algo: string, b: Blob) {
  const h = await crypto.subtle.digest(algo, await b.arrayBuffer())
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('')
}

const RUN: Record<string, StepDef['run']> = {
  'img-resize': imageStep('img-resize'), 'img-convert': imageStep('img-convert'), 'img-compress': imageStep('img-compress'), 'img-crop': imageStep('img-crop'),
  'img-rotate': imageStep('img-rotate'), 'img-grayscale': imageStep('img-grayscale'), 'img-watermark': imageStep('img-watermark'), 'img-round': imageStep('img-round'),
  'img-strip': imageStep('img-strip'), 'img-bg-remove': bgRemove,

  'pdf-merge': async (items, p, onP) => {
    const { PDFDocument } = await import('pdf-lib'); const out = await PDFDocument.create()
    for (let i = 0; i < items.length; i++) { const d = await PDFDocument.load(await items[i].blob.arrayBuffer(), { ignoreEncryption: true }); (await out.copyPages(d, d.getPageIndices())).forEach((pg) => out.addPage(pg)); onP((i + 1) / items.length) }
    return [{ name: `${String(p.name || 'merged').replace(/[\\/]/g, '_')}.pdf`, blob: pdfOut(await out.save()) }]
  },
  'pdf-split': perFile(async (it, p, onP) => {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.load(await it.blob.arrayBuffer(), { ignoreEncryption: true })
    const n = src.getPageCount(), every = Math.max(1, Math.floor(p.every)), out: Item[] = []
    for (let s = 0; s < n; s += every) {
      const d = await PDFDocument.create(); const idx = Array.from({ length: Math.min(every, n - s) }, (_, k) => s + k)
      ;(await d.copyPages(src, idx)).forEach((pg) => d.addPage(pg))
      out.push({ name: `${baseName(it.name)}-p${String(s + 1).padStart(3, '0')}${every > 1 ? '-' + (idx.at(-1)! + 1) : ''}.pdf`, blob: pdfOut(await d.save()), path: it.path })
      onP(Math.min(1, (s + every) / n))
    }
    return out
  }),
  'pdf-compress': perFile(async (it, p, onP, signal) => {
    const { rasterizePdf } = await import('@/lib/pdf')
    const bytes = await rasterizePdf(it.blob, { scale: Number(p.dpi) / 72, quality: p.quality / 100, onProgress: onP, transform: () => waitTurn(signal) })
    const blob = pdfOut(bytes)
    return notSmaller(it.blob.size, blob.size) ? [{ ...it, kept: true, note: 'Already as small as it gets, original kept' }] : [{ name: it.name, blob, path: it.path }]
  }),
  'pdf-rotate': eachPdf(async (doc, p) => { const { degrees } = await import('pdf-lib'); doc.getPages().forEach((pg: any) => pg.setRotation(degrees((pg.getRotation().angle + Number(p.angle)) % 360))) }),
  'pdf-numbers': eachPdf(async (doc, p) => { const { StandardFonts, rgb } = await import('pdf-lib'); const f = await doc.embedFont(StandardFonts.Helvetica); const pages = doc.getPages(); pages.forEach((pg: any, i: number) => { const t = String(p.format).replace('{n}', String(i + 1)).replace('{total}', String(pages.length)); const w = f.widthOfTextAtSize(t, p.size); pg.drawText(t, { x: (pg.getWidth() - w) / 2, y: 20, size: p.size, font: f, color: rgb(0.3, 0.3, 0.35) }) }) }),
  'pdf-watermark': eachPdf(async (doc, p) => { const { StandardFonts, rgb, degrees } = await import('pdf-lib'); const f = await doc.embedFont(StandardFonts.HelveticaBold); const text = String(p.text).replace(/[^\x20-\x7e]/g, '?'); doc.getPages().forEach((pg: any) => { const s = Math.min(pg.getWidth(), pg.getHeight()) / 8; const w = f.widthOfTextAtSize(text, s); pg.drawText(text, { x: pg.getWidth() / 2 - (w / 2) * 0.7, y: pg.getHeight() / 2 - (w / 2) * 0.7, size: s, font: f, color: rgb(0.85, 0.1, 0.1), opacity: p.opacity / 100, rotate: degrees(45) }) }) }),
  'pdf-meta': eachPdf(async (doc) => { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer('OpenFile'); doc.setCreator('OpenFile') }),
  'pdf-gray': perFile(async (it, _p, onP, signal) => {
    const { rasterizePdf } = await import('@/lib/pdf')
    const bytes = await rasterizePdf(it.blob, { scale: 1.6, quality: 0.85, onProgress: onP, transform: async (ctx, c) => { await waitTurn(signal); const d = ctx.getImageData(0, 0, c.width, c.height); const a = d.data; for (let k = 0; k < a.length; k += 4) { const g = a[k] * 0.299 + a[k + 1] * 0.587 + a[k + 2] * 0.114; a[k] = a[k + 1] = a[k + 2] = g } ctx.putImageData(d, 0, 0) } })
    return [{ name: it.name, blob: pdfOut(bytes), path: it.path }]
  }),
  'pdf-from-images': async (items, p, onP) => {
    const { PDFDocument } = await import('pdf-lib')
    const size = p.page === 'A4' ? [595.28, 841.89] : p.page === 'Letter' ? [612, 792] : null
    const add = async (doc: any, it: Item) => {
      const { bytes, png } = await imageBytesForPdf(it.blob)
      const img = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
      if (!size) { const pg = doc.addPage([img.width, img.height]); pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height }); return }
      const [W, H] = img.width > img.height ? [size[1], size[0]] : size
      const k = Math.min((W - 48) / img.width, (H - 48) / img.height, 1)
      const pg = doc.addPage([W, H]); pg.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k })
    }
    if (p.mode === 'one per image') {
      const out: Item[] = []
      for (let i = 0; i < items.length; i++) { const d = await PDFDocument.create(); await add(d, items[i]); out.push({ name: withExt(items[i].name, 'pdf'), blob: pdfOut(await d.save()), path: items[i].path }); onP((i + 1) / items.length) }
      return out
    }
    const d = await PDFDocument.create()
    for (let i = 0; i < items.length; i++) { await add(d, items[i]); onP((i + 1) / items.length) }
    return [{ name: `${String(p.name || 'images').replace(/[\\/]/g, '_')}.pdf`, blob: pdfOut(await d.save()) }]
  },
  'pdf-to-images': perFile(async (it, p, onP, signal) => {
    const { openPdfJs, renderPage } = await import('@/lib/pdf')
    const doc = await openPdfJs(await it.blob.arrayBuffer())
    const type = 'image/' + p.format, out: Item[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      await waitTurn(signal)
      const c = await renderPage(doc, i, Number(p.dpi) / 72)
      const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('Could not encode page'))), type, 0.9))
      out.push({ name: `${baseName(it.name)}-p${String(i).padStart(3, '0')}.${IMG_EXT[blob.type] || 'png'}`, blob, path: it.path })
      c.width = c.height = 0
      onP(i / doc.numPages)
    }
    return out
  }),
  'pdf-ocr': perFile(async (it, p, onP, signal) => {
    const { createWorker } = await import('tesseract.js')
    let page = 0, pages = 1
    const worker = await createWorker(p.lang, 1, { logger: (m: any) => { if (m.status === 'recognizing text') onP((page + m.progress) / pages) } })
    const stop = () => { worker.terminate() }
    signal?.addEventListener('abort', stop, { once: true })
    try {
      const texts: string[] = []
      if (kindOfItem(it) === 'pdf') {
        const { openPdfJs, renderPage } = await import('@/lib/pdf')
        const doc = await openPdfJs(await it.blob.arrayBuffer()); pages = doc.numPages
        for (page = 0; page < pages; page++) { check(signal); await waitTurn(signal); const c = await renderPage(doc, page + 1, 2); const r = await worker.recognize(c); texts.push(`--- page ${page + 1} ---\n${r.data.text}`); c.width = c.height = 0 }
      } else { const r = await worker.recognize(it.blob); texts.push(r.data.text) }
      return [{ name: withExt(it.name, 'txt'), blob: new Blob([texts.join('\n\n')], { type: 'text/plain' }), path: it.path }]
    } finally { signal?.removeEventListener('abort', stop); await worker.terminate().catch(() => {}) }
  }),

  'av-trim': perFile(async (it, p, onP, signal) => {
    const e = extOf(it.name) || 'mp4'
    const out = 'out.' + e
    return [{ name: `${baseName(it.name)}-trim.${e}`, blob: await ff(it, (i) => ['-ss', String(p.start), '-i', i, '-t', String(p.length), '-c', 'copy', '-avoid_negative_ts', 'make_zero', out], out, onP, signal, Number(p.length)), path: it.path }]
  }),
  'av-convert': perFile(async (it, p, onP, signal) => {
    const isVideo = kindOfItem(it) === 'video'
    const to = isVideo ? p.video : p.audio
    if (extOf(it.name) === to) return [it]
    const codec: Record<string, string[]> = { mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'], mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'], mkv: ['-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac'], webm: ['-c:v', 'libvpx', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libvorbis'], mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '3'], m4a: ['-vn', '-c:a', 'aac', '-b:a', '160k'], wav: ['-vn', '-c:a', 'pcm_s16le'], ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'], flac: ['-vn', '-c:a', 'flac'] }
    const out = 'out.' + to
    const blob = await ff(it, (i) => ['-i', i, ...codec[to], out], out, onP, signal)
    return [{ name: withExt(it.name, to), blob: isVideo ? new Blob([blob], { type: VIDEO_MIME[to] }) : blob, path: it.path }]
  }),
  'vid-compress': vidCompress,
  'av-extract-audio': perFile(async (it, p, onP, signal) => {
    const args: Record<string, string[]> = { mp3: ['-c:a', 'libmp3lame', '-q:a', '3'], m4a: ['-c:a', 'aac', '-b:a', '160k'], wav: ['-c:a', 'pcm_s16le'] }
    const out = 'out.' + p.format
    return [{ name: withExt(it.name, p.format), blob: await ff(it, (i) => ['-i', i, '-vn', ...args[p.format], out], out, onP, signal), path: it.path }]
  }),
  'vid-gif': perFile(async (it, p, onP, signal) => {
    const vf = `fps=${Math.round(p.fps)},scale=${Math.round(p.width)}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192[pal];[b][pal]paletteuse=dither=sierra2_4a`
    return [{ name: withExt(it.name, 'gif'), blob: await ff(it, (i) => ['-t', String(p.length), '-i', i, '-filter_complex', vf, '-loop', '0', 'out.gif'], 'out.gif', onP, signal, Number(p.length)), path: it.path }]
  }),

  'data-convert': perFile(async (it, p) => {
    const from = extOf(it.name)
    if (from === p.to) return [it]
    const rows = await readTable(it)
    if (p.to === 'json') return [{ name: withExt(it.name, 'json'), blob: new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), path: it.path }]
    if (p.to === 'csv') { const Papa = (await import('papaparse')).default; return [{ name: withExt(it.name, 'csv'), blob: new Blob([Papa.unparse(flat(rows))], { type: 'text/csv' }), path: it.path }] }
    const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat(rows)), 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    return [{ name: withExt(it.name, 'xlsx'), blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), path: it.path }]
  }),
  'text-replace': perFile(async (it, p) => {
    if (['xlsx', 'xls', 'ods'].includes(extOf(it.name))) return [it]
    const text = await it.blob.text()
    let re: RegExp
    try { re = new RegExp(p.regex ? String(p.find) : escapeRe(String(p.find)), p.caseSensitive ? 'g' : 'gi') } catch { throw new Error('The find pattern is not a valid regular expression') }
    if (!p.find) return [it]
    const out = text.replace(re, String(p.replace))
    return [{ name: it.name, blob: new Blob([out], { type: it.blob.type || 'text/plain' }), path: it.path }]
  }),

  'zip-all': async (items, p, onP) => {
    const { zipSync } = await import('fflate')
    const entries: Record<string, Uint8Array> = {}
    const used = new Set<string>()
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      let n = (p.folders && it.path ? it.path.replace(/^\/+/, '').replace(/[^/]+$/, '') : '') + it.name, k = 1
      n = n.split('/').filter((s) => s && s !== '..' && s !== '.').join('/') || 'file'
      while (used.has(n)) n = n.replace(/(-\d+)?(\.[^./]+)?$/, (_m, _d, e) => `-${k++}${e || ''}`)
      used.add(n); entries[n] = new Uint8Array(await it.blob.arrayBuffer()); onP((i + 1) / items.length * 0.8)
    }
    return [{ name: `${String(p.name || 'files').replace(/[\\/]/g, '_')}.zip`, blob: new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: 'application/zip' }) }]
  },
  unzip: perFile(async (it) => (await unzipItems(it.blob, baseName(it.name))).map((x) => ({ ...x, path: (it.path ? it.path.replace(/[^/]+$/, '') : '') + baseName(it.name) + '/' + x.path }))),

  'file-rename': async (items, p, onP) => {
    onP(1); const d = new Date().toISOString().slice(0, 10)
    return items.map((it, i) => ({ ...it, name: renamePattern(String(p.pattern), { name: it.name, n: Number(p.start) + i, date: d, ext: extOf(it.name), kind: kindOfItem(it) }, p.case) }))
  },
  checksum: async (items, p, onP) => {
    const lines: string[] = []
    for (let i = 0; i < items.length; i++) { lines.push(`${await digest(p.algo, items[i].blob)}  ${items[i].path ? items[i].path!.replace(/[^/]+$/, '') : ''}${items[i].name}`); onP((i + 1) / items.length) }
    return [...items, { name: `checksums.${String(p.algo).toLowerCase().replace('-', '')}`, blob: new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }) }]
  },
}

/** Unpack a ZIP into items (skips folders, macOS metadata and anything that tries to climb out with ../). */
export async function unzipItems(blob: Blob, root = ''): Promise<Item[]> {
  const { unzipSync } = await import('fflate')
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
  const out: Item[] = []
  for (const [full, data] of Object.entries(files)) {
    if (full.endsWith('/') || full.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(full)) continue
    const parts = full.split('/').filter((s) => s && s !== '..' && s !== '.')
    const name = parts.pop(); if (!name) continue
    out.push({ name, path: parts.length ? parts.join('/') + '/' + name : name, blob: new Blob([data as BlobPart], { type: mimeFor(name) }) })
  }
  void root
  return out
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac', csv: 'text/csv', json: 'application/json', txt: 'text/plain', md: 'text/markdown', zip: 'application/zip', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
export const mimeFor = (name: string) => MIME[extOf(name)] || 'application/octet-stream'

/** Every step with its runner. `mode` is the step's category (kept for the docs tables). */
export const STEPS: StepDef[] = CATALOG.map((m) => {
  const run = RUN[m.id]
  // a step only touches the files it accepts; the rest pass through (the engine does the same)
  const wrapped: StepDef['run'] = async (items, p, onP, signal) => {
    const take = items.filter((it) => m.accepts === 'any' || (m.accepts as string[]).includes(kindOfItem(it)))
    const pass = items.filter((it) => !take.includes(it))
    return [...(take.length ? await run(take, p, onP, signal) : []), ...pass]
  }
  return { ...m, mode: m.cat, run: wrapped }
})
export const STEP_BY_ID: Record<string, StepDef> = Object.fromEntries(STEPS.map((s) => [s.id, s]))
export const rawRun = (id: string) => RUN[id]
export { CATS }

/** Built-in starting points (also used by the docs). */
export const PRESETS: { name: string; mode: Cat; steps: { id: string; params?: Record<string, any> }[] }[] = [
  { name: 'Web-ready photos', mode: 'image', steps: [{ id: 'img-resize', params: { maxW: 1920, maxH: 1920 } }, { id: 'img-convert', params: { format: 'webp', quality: 80 } }] },
  { name: 'Product catalog', mode: 'image', steps: [{ id: 'img-resize', params: { maxW: 1200, maxH: 1200 } }, { id: 'img-watermark' }, { id: 'img-convert', params: { format: 'jpeg', quality: 85 } }, { id: 'file-rename', params: { pattern: 'product-{n}' } }] },
  { name: 'Social avatars', mode: 'image', steps: [{ id: 'img-crop', params: { ratio: '1:1' } }, { id: 'img-resize', params: { maxW: 512, maxH: 512 } }, { id: 'img-round', params: { radius: 50 } }] },
  { name: 'Share-safe PDF pack', mode: 'pdf', steps: [{ id: 'pdf-merge' }, { id: 'pdf-numbers' }, { id: 'pdf-meta' }] },
  { name: 'Confidential drafts', mode: 'pdf', steps: [{ id: 'pdf-watermark' }, { id: 'pdf-meta' }] },
  { name: 'Shrink scans', mode: 'pdf', steps: [{ id: 'pdf-gray' }, { id: 'pdf-compress' }] },
]

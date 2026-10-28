// Node harness: runs the same self-hosted ffmpeg.wasm core the browser uses (public/ffmpeg).
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../..')
globalThis.self ??= globalThis
globalThis.location ??= { href: 'file:///tmp/' }
let createP
export async function ffmpeg(args, files = {}, outputs = []) {
  createP ??= import(url.pathToFileURL(path.join(root, 'public/ffmpeg/ffmpeg-core.js')).href).then((m) => m.default)
  const create = await createP
  const wasmBinary = fs.readFileSync(path.join(root, 'public/ffmpeg/ffmpeg-core.wasm'))
  const logs = []
  const m = await create({ wasmBinary })
  m.setLogger(({ message }) => logs.push(message))
  for (const [n, d] of Object.entries(files)) {
    const dir = path.posix.dirname(n); if (dir !== '.' && dir !== '/') m.FS.mkdirTree(dir)
    m.FS.writeFile(n, d)
  }
  const code = m.exec(...args)
  const out = {}
  for (const o of outputs) { try { out[o] = m.FS.readFile(o) } catch { out[o] = null } }
  return { code, logs, out, ls: m.FS.readdir('/') }
}

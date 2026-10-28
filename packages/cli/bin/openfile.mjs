#!/usr/bin/env node
// OpenFile CLI: serves the prebuilt OpenFile app on your machine, fully offline.
//   npx @aniruddhaadak80/openfile [--port 5173] [--host 127.0.0.1] [--open | --no-open] [--isolate]
// No dependencies: only Node's own http, fs and path modules.
import { createServer } from 'node:http'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))

const HELP = `OpenFile ${pkg.version}: 300+ private file tools, served from your own machine.

Usage
  npx @aniruddhaadak80/openfile [options]

Options
  -p, --port <n>     Port to listen on (default 5173, or the PORT env var)
  -H, --host <name>  Interface to bind (default 127.0.0.1; use 0.0.0.0 to share on your network)
      --open         Open the browser after start (default when run in a terminal)
      --no-open      Do not open the browser
      --isolate      Send COOP and COEP headers for cross-origin isolation (multi-threaded on-device AI)
      --dir <path>   Serve another build folder instead of the bundled app
  -v, --version      Print the version
  -h, --help         Print this help
`

function parseArgs(argv) {
  const o = { port: undefined, host: '127.0.0.1', open: undefined, isolate: false, dir: join(here, '..', 'dist') }
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]
    let val
    if (a.startsWith('--') && a.includes('=')) { val = a.slice(a.indexOf('=') + 1); a = a.slice(0, a.indexOf('=')) }
    const next = () => { if (val !== undefined) return val; const v = argv[++i]; if (v === undefined) fail(`${a} needs a value`); return v }
    switch (a) {
      case '-p': case '--port': o.port = Number(next()); break
      case '-H': case '--host': o.host = next(); break
      case '--open': o.open = true; break
      case '--no-open': o.open = false; break
      case '--isolate': o.isolate = true; break
      case '--dir': o.dir = resolve(next()); break
      case '-v': case '--version': console.log(pkg.version); process.exit(0)
      case '-h': case '--help': console.log(HELP); process.exit(0)
      default: fail(`unknown option ${a}\n\n${HELP}`)
    }
  }
  if (o.port !== undefined && !(Number.isInteger(o.port) && o.port > 0 && o.port < 65536)) fail('--port must be a number from 1 to 65535')
  return o
}

function fail(msg) { console.error(`openfile: ${msg}`); process.exit(1) }

const opts = parseArgs(process.argv.slice(2))
const root = resolve(opts.dir)
if (!existsSync(join(root, 'index.html'))) fail(`no index.html in ${root}`)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.xsl': 'text/xsl; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf', '.onnx': 'application/octet-stream', '.data': 'application/octet-stream', '.bin': 'application/octet-stream',
}
const IMMUTABLE = /^\/(assets|fonts|ffmpeg)\//
const STATIC = /^\/(assets|fonts|ffmpeg|media|og)\//

function cacheControl(urlPath, file) {
  if (file.endsWith('.html') || urlPath === '/sw.js' || urlPath.endsWith('.webmanifest')) return 'no-cache'
  if (IMMUTABLE.test(urlPath)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}

function baseHeaders() {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), display-capture=(self)',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  }
  if (opts.isolate) h['Cross-Origin-Embedder-Policy'] = 'credentialless'
  return h
}

// map a URL path to a file inside root, or null; never escapes root
function resolveFile(urlPath) {
  const p = normalize(join(root, urlPath))
  if (p !== root && !p.startsWith(root + sep)) return null
  try {
    const st = statSync(p)
    if (st.isFile()) return p
    if (st.isDirectory() && existsSync(join(p, 'index.html'))) return join(p, 'index.html')
  } catch { /* not found */ }
  return null
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...baseHeaders(), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
  res.end(body)
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' })
  let urlPath
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { return send(res, 400, 'Bad Request') }
  if (urlPath.includes('\0')) return send(res, 400, 'Bad Request')
  if (urlPath === '/healthz') return send(res, 200, 'ok')

  let file = resolveFile(urlPath)
  if (!file) {
    // missing static files are a real 404; every other path is an app route
    if (STATIC.test(urlPath) || extname(urlPath) && !urlPath.endsWith('.html')) return send(res, 404, 'Not Found')
    file = join(root, 'index.html')
  }

  const st = statSync(file)
  const headers = {
    ...baseHeaders(),
    'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': cacheControl(urlPath, file),
    'Last-Modified': st.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
  }
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`
  headers.ETag = etag
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end() }

  let start = 0, end = st.size - 1, status = 200
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
  if (range && st.size > 0) {
    if (range[1] === '' && range[2] !== '') { start = Math.max(0, st.size - Number(range[2])) }
    else { start = Number(range[1]); if (range[2] !== '') end = Math.min(end, Number(range[2])) }
    if (start > end || start >= st.size) return send(res, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${st.size}` })
    status = 206
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`
  }
  headers['Content-Length'] = st.size === 0 ? 0 : end - start + 1
  res.writeHead(status, headers)
  if (req.method === 'HEAD' || st.size === 0) return res.end()
  createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res)
})

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : ['xdg-open', [url]]
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref() } catch { /* no browser */ }
}

const explicitPort = opts.port !== undefined || process.env.PORT !== undefined
let port = opts.port ?? (Number(process.env.PORT) || 5173)
let tries = 0
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && !explicitPort && tries < 20) { tries++; port++; return server.listen(port, opts.host) }
  fail(e.code === 'EADDRINUSE' ? `port ${port} is in use; pick another with --port` : e.message)
})
server.on('listening', () => {
  const shown = ['0.0.0.0', '::', '127.0.0.1', '::1'].includes(opts.host) ? 'localhost' : opts.host
  const url = `http://${shown}:${port}/`
  console.log(`\n  OpenFile ${pkg.version} is running at ${url}`)
  if (opts.host === '0.0.0.0' || opts.host === '::') console.log('  Shared on your network. Files still stay in each visitor\'s browser.')
  console.log('  Everything runs in your browser. Press Ctrl+C to stop.\n')
  const shouldOpen = opts.open ?? (process.stdout.isTTY && !process.env.CI)
  if (shouldOpen) openBrowser(url)
})
server.listen(port, opts.host)

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0) })

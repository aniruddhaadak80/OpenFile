// OpenFile service worker.
//  - Precaches the app shell (index.html, entry JS and CSS, manifest, icons, offline page) at install.
//  - Pages: network first with a short timeout, then the cached page, then the cached shell, then offline.html.
//  - Hashed assets, wasm engines, fonts and on-device AI models: cache first at runtime, so a tool that worked
//    once keeps working offline.
//  - Updates wait until the page says so ("New version ready, reload"), then take over in one step.
// scripts/postbuild.mjs replaces the two placeholders below with the build id and the shell file list.
const BUILD = '__OF_BUILD__'
const PRECACHE = /*__OF_PRECACHE__*/[]
const SHELL = `openfile-shell-${BUILD}`
const ASSETS = 'openfile-assets-v2'
const MODELS = 'openfile-models-v1'
const SHARE = 'openfile-share'
const KEEP = new Set([SHELL, ASSETS, MODELS, SHARE])
const scope = self.registration.scope // ends with "/": "https://host/" on Vercel, "https://host/OpenFile/" on Pages
const SHELL_URL = scope + 'index.html'
const OFFLINE_URL = scope + 'offline.html'

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL)
    const urls = [...new Set(['', 'index.html', 'offline.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', ...PRECACHE])].map((u) => new URL(u, scope).href)
    // one bad entry must not fail the whole install, so add them one by one
    await Promise.all(urls.map((u) => fetch(u, { cache: 'reload' }).then((r) => { if (r.ok) return c.put(u, r) }).catch(() => {})))
    // first install: there is nothing to replace, take over straight away
    if (!self.registration.active) await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('openfile') && !KEEP.has(k)).map((k) => caches.delete(k)))
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.enable() } catch { /* not supported */ } }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (e) => {
  const d = e.data || {}
  if (d === 'SKIP_WAITING' || d.type === 'SKIP_WAITING') self.skipWaiting()
  if (d.type === 'GET_VERSION' && e.ports && e.ports[0]) e.ports[0].postMessage({ build: BUILD, shell: PRECACHE.length })
})

// Web Share Target: the OS share sheet POSTs files here (see manifest share_target). Keep them in a cache,
// then open the app, which reads them back and shows the "Drop anything" sheet (components/DropFlow.tsx).
async function receiveShare(req) {
  try {
    const form = await req.formData()
    const files = form.getAll('files').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f)
    const c = await caches.open(SHARE)
    for (const k of await c.keys()) await c.delete(k)
    let i = 0
    for (const f of files) {
      await c.put(new Request(`${scope}__share/${Date.now()}-${i++}`), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'shared-file') } }))
    }
    return Response.redirect(`${scope}?shared=${files.length}`, 303)
  } catch {
    return Response.redirect(scope, 303)
  }
}

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))

async function page(e) {
  const req = e.request
  const shell = await caches.open(SHELL)
  try {
    const pre = e.preloadResponse ? await e.preloadResponse : null
    const res = pre || await Promise.race([fetch(req), timeout(6000)])
    if (res && res.ok && res.type === 'basic') shell.put(req, res.clone())
    return res
  } catch {
    return (await shell.match(req, { ignoreSearch: true }))
      || (await shell.match(SHELL_URL)) || (await shell.match(scope))
      || (await shell.match(OFFLINE_URL))
      || new Response('<h1>Offline</h1><p>Open OpenFile once while online so it can work offline.</p>', { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }
}

async function cacheFirst(req, name) {
  const c = await caches.open(name)
  const hit = await c.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) c.put(req, res.clone()).catch(() => {})
  return res
}

async function staleWhileRevalidate(e, name) {
  const c = await caches.open(name)
  const hit = await c.match(e.request)
  const net = fetch(e.request).then((res) => { if (res.ok && res.type === 'basic') c.put(e.request, res.clone()).catch(() => {}); return res }).catch(() => hit)
  if (hit) { e.waitUntil(net.then(() => {}, () => {})); return hit }
  return net
}

const MODEL_HOST = /(^|\.)huggingface\.co$|(^|\.)hf\.co$|cdn-lfs|staticimgly\.com$|cdn\.jsdelivr\.net$|unpkg\.com$|fonts\.(googleapis|gstatic)\.com$|tessdata|cdn\.img\.ly$/

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) { e.respondWith(receiveShare(req)); return }
  if (req.method !== 'GET') return
  if (req.headers.has('range')) return // video and audio seeking: let the network handle partial content
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return
  const same = url.origin === self.location.origin
  if (same && url.pathname.includes('/api/')) return
  if (req.mode === 'navigate') { e.respondWith(page(e)); return }
  if (same) {
    if (/\/(assets|ffmpeg|fonts)\//.test(url.pathname) || /\.(wasm|onnx|data|traineddata)$/.test(url.pathname)) { e.respondWith(cacheFirst(req, ASSETS)); return }
    if (url.pathname.includes('/media/') && /\.(mp4|webm|mp3)$/.test(url.pathname)) return // large demo videos stay on the network
    if (url.pathname.endsWith('/sw.js')) return
    e.respondWith(staleWhileRevalidate(e, SHELL))
    return
  }
  if (MODEL_HOST.test(url.hostname)) e.respondWith(cacheFirst(req, MODELS))
})

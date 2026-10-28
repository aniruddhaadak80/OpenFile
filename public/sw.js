// OpenFile service worker: network-first for pages, cache-first for hashed assets & engines → works offline after first visit
const CACHE = 'openfile-v1'
self.addEventListener('install', (e) => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'openfile-share').map((k) => caches.delete(k)))).then(() => self.clients.claim())))
// Web Share Target: the OS share sheet POSTs files here (see manifest share_target). Keep them in a cache,
// then open the app, which reads them back and shows the "Drop anything" sheet (components/DropFlow.tsx).
async function receiveShare(req) {
  const scope = self.registration.scope
  try {
    const form = await req.formData()
    const files = form.getAll('files').filter((f) => f && typeof f === 'object' && 'arrayBuffer' in f)
    const c = await caches.open('openfile-share')
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

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) { e.respondWith(receiveShare(req)); return }
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.pathname.includes('/api/')) return
  const isAsset = url.pathname.includes('/assets/') || url.pathname.includes('/fonts/') || /cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com/.test(url.host)
  if (isAsset) {
    e.respondWith(caches.open(CACHE).then(async (c) => { const hit = await c.match(req); if (hit) return hit; const res = await fetch(req); if (res.ok && res.type !== 'opaque') c.put(req, res.clone()); return res }))
  } else if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res }).catch(() => caches.match(req).then((r) => r || caches.match(self.registration.scope))))
  }
})

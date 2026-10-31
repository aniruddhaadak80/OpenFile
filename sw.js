// OpenFile service worker.
//  - Precaches the app shell (index.html, entry JS and CSS, manifest, icons, offline page) at install.
//  - Pages: network first with a short timeout, then the cached page, then the cached shell, then offline.html.
//  - Hashed assets, wasm engines, fonts and on-device AI models: cache first at runtime, so a tool that worked
//    once keeps working offline.
//  - Updates wait until the page says so ("New version ready, reload"), then take over in one step:
//    the page posts SKIP_WAITING, the new worker activates, claims every tab (clients.claim) and the page reloads
//    on controllerchange (src/lib/app/pwa.ts). The page checks for a new worker every 30 minutes, on focus and
//    when it becomes visible again (iOS home screen apps resume through visibilitychange).
// scripts/postbuild.mjs replaces the two placeholders below with the build id and the shell file list.
const BUILD = '22725ae-mvwqlj24'
const PRECACHE = /*__OF_PRECACHE__*/["favicon.svg","apple-touch-icon.png","manifest.webmanifest","fonts/inter-latin.woff2","fonts/space-grotesk-latin.woff2","assets/index--rrWVhH1.js","assets/rolldown-runtime-BCiCTKAo.js","assets/browser-Ddioz8iZ.js","assets/purify.es-Cm0RpNuY.js","assets/safe-CIOrKQxe.js","assets/files-DFsEDWi8.js","assets/chunk-6KYCQHYJ-C5FQvVQ4.js","assets/ui-BnOkXGVZ.js","assets/activity-g2wCfeSW.js","assets/accessibility-RPv0CsuR.js","assets/aperture-BleSd13J.js","assets/archive-D8dHyfYs.js","assets/arrow-down-a-z-rrE-WtRO.js","assets/arrow-down-up-DOP0g4HW.js","assets/arrow-left-right-BwHa-HA8.js","assets/arrow-right-left-DpFdNQLu.js","assets/audio-lines-Pznb0LMW.js","assets/audio-waveform-Dzu9ctDT.js","assets/badge-check-DwWOmcCE.js","assets/bell-ring-H1I-mxos.js","assets/book-bookmark-DzW0uKGl.js","assets/book-check-CDArCsZ2.js","assets/book-image-BG05uBja.js","assets/book-open-DyJTEY3f.js","assets/box-ZHpesI2j.js","assets/braces-C1vZxebT.js","assets/brain-circuit-C2hinjOH.js","assets/brush-cleaning-BHWag9c5.js","assets/calendar-range-U7SX2nip.js","assets/calculator-CmNzpvVP.js","assets/calendar-clock-D1WJ5nTw.js","assets/calendar-days-CEzNsz8f.js","assets/camera-Ye9qkdtu.js","assets/captions-eXAwT42U.js","assets/case-upper-B61Zu2Ek.js","assets/chart-column-D1qc9lNS.js","assets/clapperboard-BuMlXSo4.js","assets/clipboard-list-B1n9RBtI.js","assets/clock-CZYuizH_.js","assets/code-xml-ieDbzYZu.js","assets/cog-C06VRbMk.js","assets/code-CsP2Evcq.js","assets/columns-2-BMiY-cyq.js","assets/columns-3-p6RAOwum.js","assets/combine-Btr4OOuK.js","assets/compass-oC4ayjDU.js","assets/contact-IE645X7L.js","assets/contrast-BJkVP8Vh.js","assets/copy-minus-DJF9w2IJ.js","assets/cpu-Bov5vvVy.js","assets/crop-BWh7Pp8C.js","assets/database-Bfjd9RBz.js","assets/dices-BOp6JFBw.js","assets/droplets-CdXiWZD7.js","assets/ear-hrjja-cu.js","assets/earth-BXoP1PFV.js","assets/eighth-note-BVOFr4OT.js","assets/eighth-notes-gHFLdQds.js","assets/eraser-DBXoHpNv.js","assets/external-link-S5r3zBwo.js","assets/eye-off-xwdrYgT8.js","assets/eye-DXu1QXPr.js","assets/face-grinning-CaSwf7MA.js","assets/face-slightly-smiling-C1vJCriB.js","assets/file-archive-B9UU-t_Z.js","assets/file-braces-DWqJTeN3.js","assets/file-check-corner-CZOBx6J9.js","assets/file-code-corner-xj9WqU_Q.js","assets/file-code-D8rXs4Cb.js","assets/file-cog-BtxqGDbF.js","assets/file-digit-YormvvL0.js","assets/file-down-BYsLbxic.js","assets/file-image-6fF9VMld.js","assets/file-key-UsdPhle2.js","assets/file-lock-CS5fZd-7.js","assets/file-output-DXmcwVM6.js","assets/file-pen-line-IXL_-tii.js","assets/file-pen-C9C0A5PF.js","assets/file-play-DblxLcMb.js","assets/file-plus-UENNCvhG.js","assets/file-search-CfR9k88L.js","assets/file-spreadsheet-iLwCQHhH.js","assets/file-stack-CDtXj0-_.js","assets/file-text-CYMRj2Dk.js","assets/file-type-Ed1_ijPs.js","assets/file-x-corner-ClXfxk1o.js","assets/film-BsIl1Lfy.js","assets/fingerprint-pattern-BoHq3nwf.js","assets/flame-7IbTFNWZ.js","assets/folder-open-ByaqSUx-.js","assets/library-BK2vJnro.js","assets/workflow-B3efTWAR.js","assets/gallery-vertical-uGkGEIhr.js","assets/gauge-DrYRnR-B.js","assets/gift-yccjA3Iw.js","assets/git-compare-DRLzFrhZ.js","assets/git-pull-request-DmNx_ua2.js","assets/globe-BLjtY8Gx.js","assets/graduation-cap-CYb7wnrZ.js","assets/grid-2x2-BjRqXt_F.js","assets/grid-3x3-Mf-xE2xv.js","assets/hash-Dhen4H9c.js","assets/highlighter-FP560f57.js","assets/image-down-D0J9UHoC.js","assets/image-plus-ZRCVktrb.js","assets/image-C9ik3_IZ.js","assets/images-Dc6teI0Y.js","assets/key-round-CwJ9XFgY.js","assets/keyboard-RfG8C5Pq.js","assets/languages-B9bXyuxv.js","assets/layers-2-w6GlZdSK.js","assets/layers-DVkGyzQu.js","assets/layout-grid-CTOpxF4f.js","assets/link-2-C5VOuWqu.js","assets/list-checks-B6IQGPBg.js","assets/list-music-DMnCQ6Kf.js","assets/list-ordered-F-odMtL_.js","assets/list-tree-g_-43V1s.js","assets/locate-fixed-hjN4B9vd.js","assets/lock-keyhole-B6kizY5j.js","assets/lock-open-Bqt7wJ0-.js","assets/lock-B8f-_BrR.js","assets/magnet-BxeQTxQk.js","assets/mail-DYTqFBG6.js","assets/map-pin-p3Iex16h.js","assets/map-pinned-BprvIdcL.js","assets/merge-BgPsR8eK.js","assets/message-square-off-DB4XxRad.js","assets/message-square-text-B12ae7lz.js","assets/mic-off-CotGbkBm.js","assets/mic-DGt2nE98.js","assets/minimize-2-C0tX0mIq.js","assets/monitor-cog-DyiRg0OY.js","assets/monitor-play-MP38fIgP.js","assets/monitor-CDtjhWXq.js","assets/mountain-DyvbTWau.js","assets/paintbrush-D4L9VeMj.js","assets/palette-1hn9AlqH.js","assets/panel-top-BusBCgDT.js","assets/paperclip-CIDixk2t.js","assets/pen-line-CJi4s1Wj.js","assets/pen-tool-CMESSorO.js","assets/pencil-line-DBN6hxJE.js","assets/phone-BiXGesI3.js","assets/picture-in-picture-2-DoPLyFIx.js","assets/pipette-CgzLMKDW.js","assets/presentation-CqZ_tSPs.js","assets/printer-B7OaSzi3.js","assets/qr-code-CQ0b3gE7.js","assets/quote-BBcTzBWA.js","assets/receipt-euro-Ci9y-uXK.js","assets/receipt-DWSjzzue.js","assets/rectangle-ellipsis-ayycee4g.js","assets/refresh-cw-Cg9jeUu1.js","assets/repeat-DMmVY5ZM.js","assets/replace-ypzGpkid.js","assets/rewind-C2_M8_XZ.js","assets/rotate-cw-XdXw5J0_.js","assets/route-DJC9cX0z.js","assets/rows-3-BCoJkkCw.js","assets/ruler-NU-5gIWZ.js","assets/scaling-CpOO4i-Q.js","assets/scan-face-grn_81vU.js","assets/scan-line-B3S-vNVN.js","assets/scan-search-BiJX9Yf9.js","assets/scan-text-J9oXsoDA.js","assets/scissors-CuzHybTM.js","assets/shapes-d_JQ2dkO.js","assets/sheet-DlseCT5f.js","assets/shield-alert-BCOyjto7.js","assets/shield-check-se9KKy86.js","assets/shield-question-mark-DzkHJSTJ.js","assets/shuffle-DXVuI4h3.js","assets/sigma-Cnt01TrM.js","assets/signature-rSbs3Y6k.js","assets/sliders-horizontal-BKnecuOn.js","assets/sliders-vertical-D51NTgYk.js","assets/smartphone-BKudC5kG.js","assets/snowflake-BdAvvh5D.js","assets/sparkles-DjYB7mUV.js","assets/spell-check-C9RW2-_X.js","assets/spline-Dpe-YCpC.js","assets/split-ERhk35yL.js","assets/square-centerline-dashed-vertical-B0t7jlOp.js","assets/square-centerline-dashed-horizontal-DgYJUsmM.js","assets/square-split-horizontal-DHYDgDmq.js","assets/square-53G_z9b7.js","assets/stamp-CfwLSUpv.js","assets/table-2-DJbDoe-b.js","assets/table-C8NINXKd.js","assets/tag-ICCls-RY.js","assets/tags-C8i-Eute.js","assets/target-DZlje8Lm.js","assets/terminal-C_6jyPq4.js","assets/text-align-start-D8fJog2A.js","assets/text-wrap-C3NndJmZ.js","assets/timer-D-25gGd0.js","assets/trash-CwsZkUnm.js","assets/trending-up-BhEsPH8o.js","assets/triangles-centerline-dashed-horizontal-CqmZyRPa.js","assets/type-DAdHir-P.js","assets/unlink-B1tvd_pa.js","assets/utensils-DRpgfa6H.js","assets/vibrate-CMgfpj1X.js","assets/video-D95ZJyPs.js","assets/volume-2-D13ITtoQ.js","assets/volume-x-DhLk8fK_.js","assets/wand-sparkles-DdITqy-w.js","assets/wrench-BElE3MvU.js","assets/zap-C-8rB4oO.js","assets/zoom-in-BsQ13r52.js","assets/icons-9MfZ9GQ5.js","assets/corner-down-left-DSi0Ajl_.js","assets/platform-tlK_XIGi.js","assets/index-Ym1dJOCq.css","","tools","workspace","docs","blog","install","about","category/pdf","category/convert","category/image","category/video","category/audio","category/dev","category/text","category/design","category/data","category/ai","category/3d","category/archive","category/ebook","category/font","category/cad","category/subtitle","category/privacy","category/geo","category/office","category/science","category/creator","category/study","category/web","category/time","category/finance","category/health","merge-pdf","split-pdf","compress-pdf","sign-pdf","invoice-generator","pdf-to-image","image-to-pdf","pdf-to-word","word-to-pdf","image-compressor","image-converter","image-resizer","background-remover","video-trimmer","video-compressor","screen-recorder","offline.html","icon-maskable-192.png","icon-maskable-512.png","install/index.html","tools/index.html","open/index.html"]
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
    if (url.pathname.endsWith('/version.json')) return // update checks always ask the network
    e.respondWith(staleWhileRevalidate(e, SHELL))
    return
  }
  if (MODEL_HOST.test(url.hostname)) e.respondWith(cacheFirst(req, MODELS))
})

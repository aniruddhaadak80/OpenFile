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
const BUILD = '450b930-mw23ml2l'
const PRECACHE = /*__OF_PRECACHE__*/["favicon.svg","apple-touch-icon.png","manifest.webmanifest","fonts/inter-latin.woff2","fonts/space-grotesk-latin.woff2","assets/index-JaXVyceF.js","assets/rolldown-runtime-BCiCTKAo.js","assets/browser-Ddioz8iZ.js","assets/purify.es-Cm0RpNuY.js","assets/safe-CIOrKQxe.js","assets/files-DFsEDWi8.js","assets/chunk-6KYCQHYJ-C5FQvVQ4.js","assets/ui-DzFkf8NZ.js","assets/activity-BKSomLVe.js","assets/accessibility-nHo-_FIg.js","assets/aperture-Cwp1NSzm.js","assets/archive-BeH5GLwP.js","assets/arrow-down-a-z-B7xj3OoU.js","assets/arrow-down-up-CXNgLOS-.js","assets/arrow-left-right-BJ6O10-w.js","assets/arrow-right-left-CHV1ggmS.js","assets/audio-lines-CAm4vFpa.js","assets/audio-waveform-BY1gTqtH.js","assets/badge-check-DY0vmJFb.js","assets/bell-ring-BTo2w28X.js","assets/book-bookmark-CV3eLOn2.js","assets/book-check-PGm1gKlS.js","assets/book-image-CK_C_l6g.js","assets/book-open-DXtz4UAe.js","assets/box-DGGGyjiN.js","assets/brain-circuit-DiDY2Dov.js","assets/braces-CDZNNSeI.js","assets/brush-cleaning-DlqHz-fM.js","assets/calendar-range-D_qE09at.js","assets/calculator-Cn_MXDz-.js","assets/calendar-clock-C1QWz4ip.js","assets/calendar-days-CLE_mCBI.js","assets/camera-CBFP0s0E.js","assets/captions-KAS5Ukja.js","assets/case-upper-BCZ8EMvL.js","assets/chart-column-CPp9TV1K.js","assets/clapperboard-DkKk2zCf.js","assets/clipboard-list-BOfNeOTx.js","assets/clock-CbjQtDXm.js","assets/code-xml-zt3iaJkK.js","assets/code-BoycoZfF.js","assets/cog-B38SoQAg.js","assets/columns-2-CSpyG09N.js","assets/columns-3-Bcbt0_eg.js","assets/combine-Cbgt01NZ.js","assets/compass-DifHgDkR.js","assets/contact-CPdLh3DN.js","assets/contrast-DOYJ7k2-.js","assets/copy-minus-oM0EKsYM.js","assets/cpu-B8It5x47.js","assets/crop-Ce_xGlTa.js","assets/database-C39sUCbx.js","assets/dices-DQ2OOQ2J.js","assets/droplets-8nb9Q1Y4.js","assets/ear-C0C39hn6.js","assets/earth-Cj2C2aZZ.js","assets/eighth-note-CCGEOOvU.js","assets/eighth-notes-ZgRWdItH.js","assets/eraser-BV2eGmYK.js","assets/external-link-BTWTbLLk.js","assets/eye-off-Ck4ZpO5Y.js","assets/eye-Dn0gRaNj.js","assets/face-grinning-6ibltwPT.js","assets/face-slightly-smiling-CsxY4ISJ.js","assets/file-archive-UoqrRC4h.js","assets/file-braces-K-xPv7Lv.js","assets/file-check-corner-Cwo5ircT.js","assets/file-code-corner-BhViCh5t.js","assets/file-code-CtyON50x.js","assets/file-cog-BdfQVyv0.js","assets/file-digit-CaTVhI0N.js","assets/file-down-BX-4ktHN.js","assets/file-image-D3u8J-HL.js","assets/file-key-hJY6S9hg.js","assets/file-lock-pZywlnCv.js","assets/file-output-DY5E1C8f.js","assets/file-pen-line-BAXjYrLB.js","assets/file-pen-DafYZr8A.js","assets/file-play-CtId6k41.js","assets/file-plus-ePJS7TKB.js","assets/file-search-hR6Bim-x.js","assets/file-spreadsheet-Bp9oeVs0.js","assets/file-stack-B-n3b_JB.js","assets/file-text-pEn-VfQX.js","assets/file-type-BzVSypMJ.js","assets/file-x-corner-g7UEDOds.js","assets/film-DrhLOsnK.js","assets/fingerprint-pattern-BSP09-cc.js","assets/flame-CQzTCQT9.js","assets/folder-open-WJ8WJ30k.js","assets/workflow-DAn3uPv2.js","assets/library-D6DchAxQ.js","assets/gallery-vertical-Etp0bhqR.js","assets/gauge-D1aHJHIU.js","assets/gift-Cbybzz4-.js","assets/git-compare-CD3j8Oub.js","assets/git-pull-request-TONF4bWw.js","assets/globe-Bvqp7aHa.js","assets/graduation-cap-BYSBziHh.js","assets/grid-2x2-B0DqQqju.js","assets/grid-3x3-Br5Bsi8Y.js","assets/hash-C-kmStwW.js","assets/highlighter-AnlsShMl.js","assets/image-down-B1FIm5CB.js","assets/image-plus-Baiu3P88.js","assets/image-CWow1cZu.js","assets/images-CJ0W7vXQ.js","assets/key-round-ShFkxZS_.js","assets/keyboard-B0YXO_On.js","assets/languages-DccT8C-X.js","assets/layers-2-De_nNFr3.js","assets/layers-H5JazT0d.js","assets/layout-grid-D0AKB4wb.js","assets/link-2-kSlhnvf1.js","assets/list-checks-CS8rELSO.js","assets/list-music-CeMXe7B4.js","assets/list-ordered-CzgsTddv.js","assets/list-tree-B-J7E8xx.js","assets/locate-fixed-CqpXlFb3.js","assets/lock-keyhole-B0Hzdnqn.js","assets/lock-open-B-Ods9zk.js","assets/lock-TvJXO5qi.js","assets/magnet-CyqvtLkn.js","assets/mail-C9HfGrFN.js","assets/map-pin-DbSOtTIk.js","assets/map-pinned-CrbZjwaM.js","assets/merge-CWDBUmA7.js","assets/message-square-off-_glw5djQ.js","assets/message-square-text-D_dPT-0d.js","assets/mic-off-8eCaWK8e.js","assets/mic-Dy81UG_2.js","assets/minimize-2-COj5L-XV.js","assets/monitor-cog-BzUH5PIf.js","assets/monitor-play-C7NVwr96.js","assets/monitor-BxvbeMJa.js","assets/mountain-DYkAGcMU.js","assets/paintbrush-8g5yBfPj.js","assets/palette-5lEnFIkF.js","assets/panel-top-LxO0-Xu3.js","assets/paperclip-DFTysgjb.js","assets/pen-line-BuvrVeLY.js","assets/pen-tool-DyFqB2bc.js","assets/pencil-line-6e7z18Dx.js","assets/phone-k9F_eJbm.js","assets/picture-in-picture-2-Bstvv7ZE.js","assets/pipette-BYNoGCu2.js","assets/plug-DfGFSvyV.js","assets/presentation-BilVJtaS.js","assets/printer-kaLM2aY6.js","assets/qr-code-BxnsoBot.js","assets/quote-CDPq5x_r.js","assets/receipt-euro-CBRV4k86.js","assets/receipt-CY79HsXl.js","assets/rectangle-ellipsis-G_1e_6nc.js","assets/refresh-cw-DJvh85j1.js","assets/repeat-CDoDwvE4.js","assets/replace-D9uHIh2G.js","assets/rewind-DHhMgWH4.js","assets/rotate-cw-Bn1Tbirb.js","assets/route-BNAcDIs7.js","assets/rows-3-CxdkyQDR.js","assets/ruler-Cun0ZwoJ.js","assets/scaling-BrUzpn-3.js","assets/scan-face-CJqPDBzg.js","assets/scan-line-BwMv3lQW.js","assets/scan-search-XYZtWshZ.js","assets/scan-text-BHAuwBY-.js","assets/scissors-Kx366zC_.js","assets/shapes-CEGNVg9o.js","assets/sheet-Dx488Tol.js","assets/shield-alert-Pp0OgdP3.js","assets/shield-check-H-fuQEZT.js","assets/shield-question-mark-qXCEibYJ.js","assets/shuffle-B9ssbPot.js","assets/sigma-Bj-Og8Ko.js","assets/signature-Xre_1S9o.js","assets/sliders-horizontal-13KSQhoc.js","assets/sliders-vertical-D5uiHgeb.js","assets/smartphone-mQYYfRmj.js","assets/snowflake-BOY_9NqR.js","assets/sparkles-Cs5iuLpK.js","assets/spell-check-EVeXjq1F.js","assets/spline-TOWfKIaV.js","assets/split-CldkTV8i.js","assets/square-centerline-dashed-vertical-Ba68jJWE.js","assets/square-centerline-dashed-horizontal-BclW-ql9.js","assets/square-split-horizontal-CkDpsnfe.js","assets/square-BpVBceKv.js","assets/stamp-DBtqWaLm.js","assets/table-2-Cd67bv6m.js","assets/table-DCWUq2oO.js","assets/tags-DoTC_mTw.js","assets/tag-4q0TP7Xy.js","assets/target-Dgvh1knd.js","assets/terminal-E-Cnp6h3.js","assets/text-align-start-BuXZIMsz.js","assets/text-wrap-haZ99v8H.js","assets/timer-guBb8gcA.js","assets/trash-DI5rABHR.js","assets/trending-up-BOjPkefl.js","assets/triangles-centerline-dashed-horizontal-CZXgKivd.js","assets/type-frRijfcW.js","assets/unlink-Dp9YrC7A.js","assets/utensils-C6HW3hHk.js","assets/vibrate-sKUHulpG.js","assets/video-D8U8qXUY.js","assets/volume-2-fQZ3Q_xx.js","assets/volume-x-CjYduB2k.js","assets/wand-sparkles-9zhYbEaI.js","assets/wrench-DjZGBYn7.js","assets/zap-Co3GxRc9.js","assets/zoom-in-izCsBM8X.js","assets/icons-BvQOYckk.js","assets/corner-down-left-CkTgl316.js","assets/platform-tlK_XIGi.js","assets/index-C9OX4ovP.css","","tools","workspace","docs","blog","install","about","category/pdf","category/convert","category/image","category/video","category/audio","category/dev","category/text","category/design","category/data","category/ai","category/3d","category/archive","category/ebook","category/font","category/cad","category/subtitle","category/privacy","category/geo","category/office","category/science","category/creator","category/study","category/web","category/time","category/finance","category/health","category/llm","category/exports","merge-pdf","split-pdf","compress-pdf","sign-pdf","invoice-generator","pdf-to-image","image-to-pdf","pdf-to-word","word-to-pdf","image-compressor","image-converter","image-resizer","background-remover","video-trimmer","video-compressor","screen-recorder","offline.html","icon-maskable-192.png","icon-maskable-512.png","install/index.html","tools/index.html","open/index.html"]
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

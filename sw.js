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
const BUILD = 'ddf8a5e-mwaemu1k'
const PRECACHE = /*__OF_PRECACHE__*/["favicon.svg","apple-touch-icon.png","manifest.webmanifest","fonts/inter-latin.woff2","fonts/space-grotesk-latin.woff2","assets/index-ubXCtzD4.js","assets/rolldown-runtime-BCiCTKAo.js","assets/browser-BOcwnBRW.js","assets/purify.es-Cm0RpNuY.js","assets/safe-kR-jJp7X.js","assets/files-DNe_5uDt.js","assets/chunk-6KYCQHYJ-DRLEeXFN.js","assets/ui-v8VrfU8u.js","assets/monitor-B7X45H90.js","assets/palette-CYrA7vda.js","assets/shield-check-DBiO58xr.js","assets/keyboard-GSt5gLV5.js","assets/compass-D8v4Bz5j.js","assets/platform-tlK_XIGi.js","assets/refresh-cw-CTYdMugS.js","assets/calendar-clock-BBSefNOB.js","assets/clock-B6b04Twj.js","assets/external-link-BZiIRUeM.js","assets/globe-DgpeohTj.js","assets/sparkles-B1PsqoZP.js","assets/corner-down-left-Dccs7yxi.js","assets/book-open-wOkcGP9G.js","assets/accessibility-D4enddL6.js","assets/activity-BYw2RkU7.js","assets/text-align-start-V2mQqrab.js","assets/aperture-CEvfT1Zk.js","assets/archive-92JxY0dq.js","assets/arrow-down-a-z-CH5iMeb9.js","assets/arrow-down-up-BTTNnDsY.js","assets/arrow-left-right-Ca36zvOj.js","assets/arrow-right-left-0qnrvWlQ.js","assets/audio-lines-ezmkV7NA.js","assets/audio-waveform-x18_vGtj.js","assets/badge-check-C3LnTjKT.js","assets/chart-column-C6lsgV9I.js","assets/bell-ring-HYpN5Sqv.js","assets/book-check-DEr5K9td.js","assets/book-image-cwsG_YLs.js","assets/book-bookmark-DuuOGFyW.js","assets/box-CCBGpafG.js","assets/braces-C5fSGTBB.js","assets/brain-circuit-BfdTRAcB.js","assets/brush-cleaning-CE9ue-W0.js","assets/calendar-range-CuMIhFki.js","assets/calculator-CRTQjA_O.js","assets/calendar-days-BTlx5jmW.js","assets/camera-D3CbX3kn.js","assets/captions-BsuAlljt.js","assets/case-upper-DxLjMTiJ.js","assets/clapperboard-0v3ndIkO.js","assets/clipboard-list-nNqrLChO.js","assets/code-BHz6uRFQ.js","assets/code-xml-M0Q-dFEB.js","assets/cog-BV4xxHfW.js","assets/columns-2-DkpA58G0.js","assets/columns-3-CXwvtj3J.js","assets/combine-pVnna-pL.js","assets/contact-BOAv3VZ4.js","assets/contrast-s8dcR4Tq.js","assets/copy-minus-BSMaZeoC.js","assets/cpu-pb9veTpw.js","assets/crop-DFAL0Bnn.js","assets/database-DAZQddTd.js","assets/dices-C8lhyUXD.js","assets/droplets-xACQb5vx.js","assets/ear-CC_u2F6P.js","assets/eraser-9sXOF8fe.js","assets/eye-DgFbJKnZ.js","assets/eye-off-BmC9M8v2.js","assets/file-archive-DWEgxWvs.js","assets/file-check-corner-DPpi5AEM.js","assets/file-code-DD-Nwf6R.js","assets/file-code-corner-D1IICVOO.js","assets/file-cog-BCZaWM6K.js","assets/file-digit-Db2DPika.js","assets/file-down-DIb8V8na.js","assets/file-image-DobKl-Qy.js","assets/file-braces-MAi3BXQq.js","assets/file-key-CVSng7ed.js","assets/file-lock-UQZG4isJ.js","assets/file-output-C7dNOc_r.js","assets/file-pen-D4-juE0Y.js","assets/file-pen-line-C7xaQsMl.js","assets/file-plus-CokTo_30.js","assets/file-search-CGkdaPb_.js","assets/file-spreadsheet-DW-AbTX0.js","assets/file-stack-C0qtAcYa.js","assets/file-text-CKTlioM0.js","assets/file-type-DXcgbgpt.js","assets/file-play-Clo5kjs3.js","assets/file-x-corner-DuvmkInm.js","assets/film-CQ8yeRyi.js","assets/workflow-Qy9vZ8oh.js","assets/fingerprint-pattern-BgcVRaWT.js","assets/flame-_kpaG5ai.js","assets/square-centerline-dashed-horizontal-B8-UBRD5.js","assets/triangles-centerline-dashed-horizontal-BYPrP3FB.js","assets/square-centerline-dashed-vertical-B9_PAc77.js","assets/folder-open-DU7lElOB.js","assets/rectangle-ellipsis-BPI7qum9.js","assets/library-Cc6PAQC-.js","assets/gallery-vertical-KcEE91pJ.js","assets/gauge-BGg4sJ9m.js","assets/gift-0zhePaAc.js","assets/git-compare-B85_VHD3.js","assets/git-pull-request-Bxvw8Rk5.js","assets/earth-Bgve9d7z.js","assets/graduation-cap-CK2Lv5Jb.js","assets/grid-2x2-_AVzEw8t.js","assets/grid-3x3-CVtR-Y2U.js","assets/hash-BI1nf3Ei.js","assets/highlighter-CnwAMC-s.js","assets/image-down-BSdULPzY.js","assets/image-7D4mUbDO.js","assets/image-plus-JOib_DBZ.js","assets/images-BjsxpvvE.js","assets/key-round-CmNXmCiv.js","assets/languages-BNAeMbRX.js","assets/face-grinning-DQgbi2kd.js","assets/layers-CCUsft5y.js","assets/layers-2-DzrsVCFQ.js","assets/layout-grid-BrkLJWcO.js","assets/link-2-Deo66Urj.js","assets/list-checks-M5tUAxb2.js","assets/list-music-CMwObGla.js","assets/list-ordered-DoJVrOQS.js","assets/list-tree-CSEQyroO.js","assets/locate-fixed-BJJ2ex24.js","assets/lock-C6RN-Y6D.js","assets/lock-keyhole-BmasdpG9.js","assets/magnet-BdTVfQzk.js","assets/mail-B-tRmtgT.js","assets/map-pin-CAG42B8P.js","assets/map-pinned-DvtahecI.js","assets/merge-CKgWOYfX.js","assets/message-square-off-DWqAWEoW.js","assets/message-square-text-B13foevI.js","assets/mic-D_IS-ZbY.js","assets/mic-off-BOk7SBhd.js","assets/minimize-2-OJrAmD9g.js","assets/monitor-cog-BeBDxaOy.js","assets/monitor-play-Bw34db6v.js","assets/mountain-DBY-ALix.js","assets/eighth-notes-DS_x_Mxt.js","assets/eighth-note-COCMYSGA.js","assets/paintbrush-CxwLRhdH.js","assets/panel-top-D1_TYyIm.js","assets/paperclip-Bb-LEs-o.js","assets/pen-line-dyPV_9Vm.js","assets/pen-tool-CFJeylw_.js","assets/pencil-line-BBbHlc41.js","assets/phone-c_jXucg9.js","assets/picture-in-picture-2-FeDTetox.js","assets/pipette-Bj3wCw-w.js","assets/plug-BY6iBmMo.js","assets/presentation-AFNy5ZOy.js","assets/printer-FnpFBQvm.js","assets/qr-code-txtMk048.js","assets/quote-BA2-zzwi.js","assets/receipt-2jVMa3uF.js","assets/receipt-euro-CiSU-XWh.js","assets/repeat-CiC9tLB7.js","assets/replace-BpZAajo6.js","assets/rewind-Dv3AWNKq.js","assets/rotate-cw-BQj7U-QC.js","assets/route-DZHJfw6o.js","assets/rows-3-bDD-wiEP.js","assets/ruler-DfAT6QPf.js","assets/scaling-2_XNPCSy.js","assets/scan-face-CAg65bph.js","assets/scan-line-BxnSmRyL.js","assets/scan-search-CGw2kcZ_.js","assets/scan-text-CkQO89tk.js","assets/scissors-BeRVI04x.js","assets/shapes-DUPC8LSk.js","assets/sheet-DAMb5onB.js","assets/shield-exclamation-point-DGpVSeP-.js","assets/shield-question-mark-BarQwajd.js","assets/shuffle-C8uin1l9.js","assets/sigma-CogcDjpJ.js","assets/signature-Dji8F_Qx.js","assets/sliders-horizontal-CFXj_br6.js","assets/sliders-vertical-MZ_Mgb20.js","assets/smartphone-D2eBybqU.js","assets/face-slightly-smiling-BDiy_ARr.js","assets/snowflake-B-7EakH0.js","assets/spell-check-q40SAPw3.js","assets/spline-fQWbxQCG.js","assets/split-Bygsjdqb.js","assets/square-split-horizontal-BG84mOq9.js","assets/square-C2jY-s0v.js","assets/stamp-CPczCBc-.js","assets/table-uav9FvsP.js","assets/table-2-BUJNmcko.js","assets/tag-yTZ55ww-.js","assets/tags-BScdDtuF.js","assets/target-B9514Agu.js","assets/terminal-LTH-Hd4b.js","assets/timer-Dc14AtXC.js","assets/trash-BQzpMr1W.js","assets/trending-up-DZzMNcHy.js","assets/type-BlWNx16i.js","assets/unlink-B2d7KbQ6.js","assets/lock-open-DcaDOWc5.js","assets/utensils-Bs0e_vMu.js","assets/vibrate-DmtqqWRX.js","assets/video-Dbz0fELO.js","assets/volume-2-DgAHPq42.js","assets/volume-x-ifWr2z4T.js","assets/wand-sparkles-CXOlLTkD.js","assets/text-wrap-D9oNOJ7J.js","assets/wrench-B_5im3A-.js","assets/zap-CZeY14Cy.js","assets/zoom-in-BMk2clPi.js","assets/icons-BcNYi9aj.js","assets/index-SnAhc7Ro.css","","tools","workspace","docs","blog","install","about","category/pdf","category/convert","category/image","category/video","category/audio","category/dev","category/text","category/design","category/data","category/ai","category/3d","category/archive","category/ebook","category/font","category/cad","category/subtitle","category/privacy","category/geo","category/office","category/science","category/creator","category/study","category/web","category/time","category/finance","category/health","category/llm","category/exports","merge-pdf","split-pdf","compress-pdf","sign-pdf","invoice-generator","pdf-to-image","image-to-pdf","pdf-to-word","word-to-pdf","image-compressor","image-converter","image-resizer","background-remover","video-trimmer","video-compressor","screen-recorder","offline.html","icon-maskable-192.png","icon-maskable-512.png","install/index.html","tools/index.html","open/index.html"]
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

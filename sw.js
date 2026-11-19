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
const BUILD = 'e73beee-mwneonyg'
const PRECACHE = /*__OF_PRECACHE__*/["favicon.svg","apple-touch-icon.png","manifest.webmanifest","fonts/inter-latin.woff2","fonts/space-grotesk-latin.woff2","assets/index-DaynVZHO.js","assets/rolldown-runtime-BCiCTKAo.js","assets/browser-BOcwnBRW.js","assets/purify.es-Cm0RpNuY.js","assets/safe-kR-jJp7X.js","assets/files-DNe_5uDt.js","assets/chunk-6KYCQHYJ-DRLEeXFN.js","assets/ui-BHuET80z.js","assets/monitor-Dav2TJP1.js","assets/palette-DARfdVkM.js","assets/shield-check-D-PbPgKd.js","assets/keyboard-Ce5e_UhL.js","assets/compass-BIXBvHWP.js","assets/platform-tlK_XIGi.js","assets/refresh-cw-ClB6aysc.js","assets/calendar-clock-uRNFhOG-.js","assets/clock-DBHDXDH3.js","assets/external-link-pQC1CmJw.js","assets/globe-DE1y0kMK.js","assets/sparkles-BQ6EP7Nd.js","assets/corner-down-left-CWaTggJ3.js","assets/book-open-DGBmbilC.js","assets/accessibility-D4n8iXKC.js","assets/activity-DZwCn9Hr.js","assets/text-align-start-Dpr-cxGO.js","assets/aperture-CZQ5fTgq.js","assets/archive-fdJQ0nRI.js","assets/arrow-down-a-z-DHxuiBWy.js","assets/arrow-down-up-B730HclH.js","assets/arrow-left-right-CH1KfeMp.js","assets/arrow-right-left-lLvWAee7.js","assets/audio-lines-CWkiijiu.js","assets/audio-waveform-BKsFBjW-.js","assets/badge-check-BTVQyRYF.js","assets/chart-column-CaZu02r1.js","assets/bell-ring-BlThCMgw.js","assets/book-check-DnzdrZ9p.js","assets/book-image-DG029LXx.js","assets/book-bookmark-CR2Cc7gp.js","assets/box-Dw1mFaS6.js","assets/braces-BvRPaPYS.js","assets/brain-circuit-qYl6yHPw.js","assets/brush-cleaning-SKKy3ayd.js","assets/calendar-range-CcbA702O.js","assets/calculator-CxXZrWjp.js","assets/calendar-days-BQiSHfxt.js","assets/camera-DIYHmg4Q.js","assets/captions-BEubQM_L.js","assets/case-upper-BoAOA4ya.js","assets/clapperboard-CeHuimla.js","assets/clipboard-list-DHKWeRUv.js","assets/code-BKwzXwbd.js","assets/code-xml-_RzfTFgz.js","assets/cog-DiUQT6oG.js","assets/columns-2-kRncReP8.js","assets/columns-3-QvjYorKt.js","assets/combine-C2vp-uOs.js","assets/contact-d1Tzrv5s.js","assets/contrast-DLcy3ofj.js","assets/copy-minus-aXPg9QQX.js","assets/cpu-Depc-7_6.js","assets/crop-FiU1J11r.js","assets/database-CRixeyVM.js","assets/dices-S7o8bEkg.js","assets/droplets-Cig73eJG.js","assets/ear-CVHl1M4S.js","assets/eraser-BVy29kYp.js","assets/eye-BfeRNtzJ.js","assets/eye-off-Vu-IFor8.js","assets/file-archive-of_HUqiM.js","assets/file-check-corner-DL7FQd-H.js","assets/file-code-CPcWgL2W.js","assets/file-code-corner-CFywpv_w.js","assets/file-cog-FWX1X0_w.js","assets/file-digit-DI3P4lWp.js","assets/file-down-CpPBv9jy.js","assets/file-image-OIBx1XeJ.js","assets/file-braces-Bxyx6M1p.js","assets/file-key-BkmCxmMY.js","assets/file-lock-AOC87FW3.js","assets/file-output-Br9jaywE.js","assets/file-pen-D9_pNEr_.js","assets/file-pen-line-C9h6Q6JW.js","assets/file-plus-Dm4TCUP9.js","assets/file-search-C02mgBUd.js","assets/file-spreadsheet-Ce3n3Yqq.js","assets/file-stack--B83-NOS.js","assets/file-text-sGY58EC4.js","assets/file-type-B1L_-WY5.js","assets/file-play-DDaY2Fes.js","assets/file-x-corner-DT2GfX-A.js","assets/film-ziX_qOlP.js","assets/workflow-B5RsfA6P.js","assets/fingerprint-pattern-BTht-TgG.js","assets/flame-Cv1HpqdH.js","assets/square-centerline-dashed-horizontal-BuFXRLw1.js","assets/triangles-centerline-dashed-horizontal-C_qSti_6.js","assets/square-centerline-dashed-vertical-WIl4aYNN.js","assets/folder-open-CfIRNlq5.js","assets/rectangle-ellipsis-DdDA7uZR.js","assets/library-CpA6A1h8.js","assets/gallery-vertical-CWPdVc3r.js","assets/gauge-DJf-rA82.js","assets/gift-BTWTx7qc.js","assets/git-compare-Ax5aoWfY.js","assets/git-pull-request-CKB8HsG3.js","assets/earth-DFnZvQOE.js","assets/graduation-cap-i_j_KnTc.js","assets/grid-2x2-BkndQ3qg.js","assets/grid-3x3-BoyLpBaP.js","assets/hash-C9U5BCQZ.js","assets/highlighter-CrJ5t8XZ.js","assets/image-down-Cq8Zc6U0.js","assets/image-DgEch9TT.js","assets/image-plus-DQ9BwjUM.js","assets/images-B9fXwNp7.js","assets/key-round-BnEFrEbC.js","assets/languages-BUmwXeCL.js","assets/face-grinning-D8_QVfmq.js","assets/layers-B4qX8_6i.js","assets/layers-2-CJld4CAp.js","assets/layout-grid-DZWOEbPX.js","assets/link-2-Dl9H1guO.js","assets/list-checks-DKTFY8lZ.js","assets/list-music-0RHV7Gai.js","assets/list-ordered-CO9IC5ry.js","assets/list-tree-DlgnkScm.js","assets/locate-fixed-C2btAKDm.js","assets/lock-BJG2J6Mv.js","assets/lock-keyhole-u9n-Dg_c.js","assets/magnet-rcoWQwx5.js","assets/mail-DMDDUiYm.js","assets/map-pin-d5G7xyRX.js","assets/map-pinned-BwE7UX_Q.js","assets/merge-CuG_sTh3.js","assets/message-square-off-Dr2_Tc4q.js","assets/message-square-text-CkDgKnsE.js","assets/mic-BjdNa97o.js","assets/mic-off-kSWYG2aK.js","assets/minimize-2-BKCeS9Oe.js","assets/monitor-cog-Bu5r8lBt.js","assets/monitor-play-CzhJgyls.js","assets/mountain-BhgCjKRx.js","assets/eighth-notes-DRLLnMJ0.js","assets/eighth-note-BAthdECO.js","assets/paintbrush-DC5b19Lc.js","assets/panel-top-ZB5gM5b_.js","assets/paperclip-DT8-Dr-O.js","assets/pen-line-BogyNGg8.js","assets/pen-tool-B_ioRaS9.js","assets/pencil-line-DMS6G98f.js","assets/phone-Cg_yHsDR.js","assets/picture-in-picture-2-CqO68bSf.js","assets/pipette-D4vw76XM.js","assets/plug-BW4Xtv3H.js","assets/presentation-B5iqGc69.js","assets/printer-C4Yilwv1.js","assets/qr-code-B6xbm3Wg.js","assets/quote-BKf6xTEI.js","assets/receipt-CHfYCtsp.js","assets/receipt-euro-D_YkdLQk.js","assets/repeat-Q0CFfxSB.js","assets/replace-ChtVZNJH.js","assets/rewind-CArp8-dA.js","assets/rotate-cw-DbG-sR0s.js","assets/route-Cm9MaMab.js","assets/rows-3-BcwyMeGn.js","assets/ruler-3sawi5EU.js","assets/scaling-Bn2bUx2E.js","assets/scan-face-BGjIhwHL.js","assets/scan-line-CSr5ajet.js","assets/scan-search-CB6nB9fK.js","assets/scan-text-D19nbbuf.js","assets/scissors-DgHZYYof.js","assets/shapes-D4bqsoQ_.js","assets/sheet-DA3ogmYy.js","assets/shield-exclamation-point-DsQz0eEg.js","assets/shield-question-mark-DUSp94Ao.js","assets/shuffle-a4SufEad.js","assets/sigma-Dwk8Y9Ly.js","assets/signature-lLHwm4PN.js","assets/sliders-horizontal-BL16MfJu.js","assets/sliders-vertical-D4X5WbXM.js","assets/smartphone-CSb2vMPE.js","assets/face-slightly-smiling-BFzY6ykF.js","assets/snowflake-PoXZDLY0.js","assets/spell-check-CS-QmKjo.js","assets/spline-DkUrG5rG.js","assets/split-05koYv0g.js","assets/square-split-horizontal-BBVujaAP.js","assets/square-BB2EN7X5.js","assets/stamp-DRywA7jN.js","assets/table-DrKRlyIf.js","assets/table-2-EiXGVLbj.js","assets/tag-BZGA8JSh.js","assets/tags-DBqEPk9T.js","assets/target-Bu_RUfNb.js","assets/terminal-C66IT2fo.js","assets/timer-18UmnS0U.js","assets/trash-Bs3goSLX.js","assets/trending-up-CaKKDQM0.js","assets/type-YSUiOHbm.js","assets/unlink-BkJvUYo3.js","assets/lock-open-C3rtoTur.js","assets/utensils-hTAhpt_1.js","assets/vibrate-w-T_rYu_.js","assets/video-TC3nfFGe.js","assets/volume-2-sZ5wBwgN.js","assets/volume-x-72l_Wydr.js","assets/wand-sparkles-Da7fNTFp.js","assets/text-wrap-4X4XV4zV.js","assets/wrench-9dr2kcSj.js","assets/zap-C81E0_RP.js","assets/zoom-in-CtNdtvbf.js","assets/icons-O0xpBuh4.js","assets/index-aA4mCu3e.css","","tools","workspace","docs","blog","install","about","category/pdf","category/convert","category/image","category/video","category/audio","category/dev","category/text","category/design","category/data","category/ai","category/3d","category/archive","category/ebook","category/font","category/cad","category/subtitle","category/privacy","category/geo","category/office","category/science","category/creator","category/study","category/web","category/time","category/finance","category/health","category/llm","category/exports","merge-pdf","split-pdf","compress-pdf","sign-pdf","invoice-generator","pdf-to-image","image-to-pdf","pdf-to-word","word-to-pdf","image-compressor","image-converter","image-resizer","background-remover","video-trimmer","video-compressor","screen-recorder","offline.html","icon-maskable-192.png","icon-maskable-512.png","install/index.html","tools/index.html","open/index.html"]
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

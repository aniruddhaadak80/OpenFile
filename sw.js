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
const BUILD = '196da2c-mwsz7idd'
const PRECACHE = /*__OF_PRECACHE__*/["favicon.svg","apple-touch-icon.png","manifest.webmanifest","fonts/inter-latin.woff2","fonts/space-grotesk-latin.woff2","assets/index-CvR_OrwR.js","assets/rolldown-runtime-BCiCTKAo.js","assets/browser-BOcwnBRW.js","assets/purify.es-DmniTo1o.js","assets/safe-C8PDbZoY.js","assets/files-SQY9fTwH.js","assets/chunk-YDNE64FV-DsTvLWbC.js","assets/ui-CciUr1vH.js","assets/monitor-BXIidy5s.js","assets/palette-CW8qujHg.js","assets/shield-check-CDmVPiAy.js","assets/keyboard-DHhEv-6r.js","assets/compass-Cxm4cBkQ.js","assets/platform-tlK_XIGi.js","assets/refresh-cw-C70r6H5K.js","assets/calendar-clock-BtsfyXs7.js","assets/clock-Bv4nn-Ec.js","assets/external-link-PlX3QWQV.js","assets/globe-CNwoySPz.js","assets/sparkles-DsQaRglS.js","assets/corner-down-left-BjV8OS8J.js","assets/book-open-CWYcoECR.js","assets/accessibility-De7yJvPg.js","assets/activity-C7s0-4QM.js","assets/text-align-start-DRgzmKzu.js","assets/aperture-iF5xnfMg.js","assets/archive-BHJxMBaj.js","assets/arrow-down-a-z-C1BjBk3r.js","assets/arrow-down-up-BZp5HvHM.js","assets/arrow-left-right-DUQudO2O.js","assets/arrow-right-left-DY-KiD-G.js","assets/audio-lines-CHyICxvh.js","assets/audio-waveform-BcQY5NDF.js","assets/badge-check-DeHIcPzO.js","assets/chart-column-2VVO14ie.js","assets/bell-ring-uc5ftVc4.js","assets/book-check-PGZfGrPQ.js","assets/book-image-Bo1WwVCW.js","assets/book-bookmark-BwSuDfsv.js","assets/box-BUC7HQ6y.js","assets/braces-aFYuAq3J.js","assets/brain-circuit-4ntJTfq_.js","assets/brush-cleaning-ChJr9Hgd.js","assets/calendar-range-Dd_6cJ-j.js","assets/calculator-CyxU0gUq.js","assets/calendar-days-B_nDdo48.js","assets/camera-DKqgB1HR.js","assets/captions-DL0svT08.js","assets/case-upper-CFD27Bgy.js","assets/clapperboard-6O0j2asR.js","assets/clipboard-list-CgB17cZr.js","assets/code-gjtId2jp.js","assets/code-xml-k-45TRpN.js","assets/cog-CmBXfnY6.js","assets/columns-2-C6Ux2bq0.js","assets/columns-3-Cw8DQ7-n.js","assets/combine-NjdbFY3c.js","assets/contact-C_VvAK7j.js","assets/contrast-DpmPJR-o.js","assets/copy-minus-ntG92Ftg.js","assets/cpu-CzQpSwAr.js","assets/crop-B5-2F0YO.js","assets/database-DRne_bjv.js","assets/dices-CaJk7Vki.js","assets/droplets-DSa-1jci.js","assets/ear-Cl37zXrq.js","assets/eraser-d34t-W2F.js","assets/eye-BgXnM_1y.js","assets/eye-off-ff6Mc7Xs.js","assets/file-archive-6QQUxYRf.js","assets/file-check-corner-BWc0oYMz.js","assets/file-code-CHlZX1ai.js","assets/file-code-corner-CKCVsqBb.js","assets/file-cog-CTQqOE4t.js","assets/file-digit-D3ZJiqc3.js","assets/file-down-C-lCKuwM.js","assets/file-image-kvOUmIJj.js","assets/file-braces-D_8ieswk.js","assets/file-key-CfHrygC2.js","assets/file-lock-enCauonG.js","assets/file-output-BaWsNh9Z.js","assets/file-pen-DF5qNF8r.js","assets/file-pen-line-B3lTmyNH.js","assets/file-plus-B06v14IE.js","assets/file-search-gFjom55G.js","assets/file-spreadsheet-DN_XdFN1.js","assets/file-stack-BBbJsGd_.js","assets/file-text-DWZSVmvy.js","assets/file-type-_Y7F1-lB.js","assets/file-play-DkfhDtuM.js","assets/file-x-corner-B-tS6fby.js","assets/film-C0gUqqjm.js","assets/workflow-C31D1L1V.js","assets/fingerprint-pattern-TYMILwtG.js","assets/flame-DvUNGso9.js","assets/square-axis-dashed-vertical-G9SB3f1t.js","assets/carets-to-axis-dashed-horizontal-N7jgXpKh.js","assets/square-axis-dashed-horizontal-zWQ54o7Q.js","assets/folder-open-BdMP734X.js","assets/rectangle-ellipsis-DZSXAt7S.js","assets/library-sL1LaKhD.js","assets/gallery-vertical-3jnuvCA-.js","assets/gauge-VhragZCL.js","assets/gift-CtINO4cc.js","assets/git-compare-DKVKXRfi.js","assets/git-pull-request-DLrNP19D.js","assets/earth-OjmGTXrS.js","assets/graduation-cap-CLw5V38W.js","assets/grid-2x2-CNX5O4DY.js","assets/grid-3x3-Co90gBaE.js","assets/hash-UJYhGwZT.js","assets/highlighter-CTimu2bQ.js","assets/image-down-jelSxuX2.js","assets/image-CjcwQpne.js","assets/image-plus-CGoV9J_j.js","assets/images-Cay2bLhk.js","assets/key-round-Cx8Fd_pm.js","assets/languages-BMQQYQk4.js","assets/face-grinning-CEYs5Iqv.js","assets/layers-HCcfpxVL.js","assets/layers-2-CFTpXmqO.js","assets/layout-grid-CL9VHbTr.js","assets/link-2-B4nHsERt.js","assets/list-checks-DMUzFZPM.js","assets/list-music-5Qbs8go7.js","assets/list-ordered-B_liS2Hq.js","assets/list-tree-CYlBDXvF.js","assets/locate-fixed-CWEGOofP.js","assets/lock-XVu1pwbB.js","assets/lock-keyhole-BmJ-pDFT.js","assets/magnet-B7hR0I0V.js","assets/mail-C07hntZM.js","assets/map-pin-D9yz3wKS.js","assets/map-pinned-CL8kw2H8.js","assets/merge-DK5Z2qFh.js","assets/message-square-off-CKtnqSoj.js","assets/message-square-text-UPalOliw.js","assets/mic-DgfA7fV6.js","assets/mic-off-pxdPsda0.js","assets/minimize-2-BFodxG_0.js","assets/monitor-cog-ClopDwI1.js","assets/monitor-play-p6jdDEGl.js","assets/mountain-BUwy0mjB.js","assets/eighth-notes-CLQiluXb.js","assets/eighth-note-DNvr-eM-.js","assets/paintbrush-pEwa9y29.js","assets/panel-top-Ch5wEVmK.js","assets/paperclip-Ba5T9JyG.js","assets/pen-line-WgvXjuNg.js","assets/pen-tool-CR_GgwVN.js","assets/pencil-line-C6Zc7IsO.js","assets/phone-D32EMGKd.js","assets/picture-in-picture-2-B449NUjk.js","assets/pipette-DcS_mFLO.js","assets/plug-DFP3k64o.js","assets/presentation-men2WAMl.js","assets/printer-CmFwX7LC.js","assets/qr-code-DMYdhCkT.js","assets/quote-DrIJloi3.js","assets/receipt-3gzaiwUY.js","assets/receipt-euro-DpaSInXt.js","assets/repeat-DvTMsw4f.js","assets/replace-BGhSLP94.js","assets/rewind-C69VmpRP.js","assets/rotate-cw-2O5u3PqX.js","assets/route-B96oo-o-.js","assets/rows-3-Byp6TSS8.js","assets/ruler-BauPBXGX.js","assets/scaling-CP5sv4Kd.js","assets/scan-face-C03AQH6c.js","assets/scan-line-BvXxDAV0.js","assets/scan-search-loDQkMBl.js","assets/scan-text-DToUBRtA.js","assets/scissors-5cG6WFN0.js","assets/shapes-CD3EbuJX.js","assets/sheet-C85L5gxM.js","assets/shield-exclamation-point-DPBMACqz.js","assets/shield-question-mark-DSa8UrDE.js","assets/shuffle-DZQmMf9U.js","assets/sigma-BbOFE1oE.js","assets/signature-DvSXb8pH.js","assets/sliders-horizontal-BjqjaeRY.js","assets/sliders-vertical-DGBdCYcD.js","assets/smartphone-BNK6vozG.js","assets/face-slightly-smiling-BozRnWxP.js","assets/snowflake-C7y9eIF3.js","assets/spell-check-Kp8QrXAc.js","assets/spline-DwXildGQ.js","assets/split-CPWrFAh6.js","assets/square-split-horizontal-_Z7mil-K.js","assets/square-BYn70lLV.js","assets/stamp-7bhbTnRe.js","assets/table-BncM0SAR.js","assets/table-2-BhrnrNwr.js","assets/tag-BTYFShwM.js","assets/tags-B8pYX-uo.js","assets/target-DpLtEJzB.js","assets/terminal-CPu8Gpsi.js","assets/timer-CFU_35_J.js","assets/trash-BcmzIRwX.js","assets/trending-up-DeMTLNvP.js","assets/type-BGp4Su15.js","assets/unlink-Bww41iKa.js","assets/lock-open-D5ybcN2p.js","assets/utensils-3-YKhmrK.js","assets/vibrate-D6KoBJNJ.js","assets/video-DdQZOlcy.js","assets/volume-2-BCwNxDR0.js","assets/volume-x-D7bfV2Zv.js","assets/wand-sparkles-B7BmWOuu.js","assets/text-wrap-CzIwv9Ni.js","assets/wrench-qJY_lfjO.js","assets/zap-2T_lp1lT.js","assets/zoom-in-CoiuGUAo.js","assets/icons-BSezWG7P.js","assets/index-aA4mCu3e.css","","tools","workspace","docs","blog","install","about","category/pdf","category/convert","category/image","category/video","category/audio","category/dev","category/text","category/design","category/data","category/ai","category/3d","category/archive","category/ebook","category/font","category/cad","category/subtitle","category/privacy","category/geo","category/office","category/science","category/creator","category/study","category/web","category/time","category/finance","category/health","category/llm","category/exports","merge-pdf","split-pdf","compress-pdf","sign-pdf","invoice-generator","pdf-to-image","image-to-pdf","pdf-to-word","word-to-pdf","image-compressor","image-converter","image-resizer","background-remover","video-trimmer","video-compressor","screen-recorder","offline.html","icon-maskable-192.png","icon-maskable-512.png","install/index.html","tools/index.html","open/index.html"]
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

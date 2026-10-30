/* Pause decorative CSS animations in parts of the page that are off screen.
 * The home page alone runs over a hundred infinite CSS animations (hero ring, floating category icons, gradient text in
 * every section). Browsers without a GPU compositor (WebKit on Linux, low-end phones) could not finish a frame with
 * all of them running, so requestAnimationFrame stopped firing and taps waited for the page to settle.
 * Sections outside the viewport get data-offscreen, and index.css pauses every animation inside them. */
const SELECTOR = 'main section, main .hr-root, main [data-anim-root], footer'

export function startOffscreenMotion(): () => void {
  if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) e.target.toggleAttribute('data-offscreen', !e.isIntersecting)
  }, { rootMargin: '200px 0px' })
  const seen = new WeakSet<Element>()
  let queued = 0
  const scan = () => {
    queued = 0
    document.querySelectorAll(SELECTOR).forEach((el) => { if (!seen.has(el)) { seen.add(el); io.observe(el) } })
  }
  const mo = new MutationObserver(() => { if (!queued) queued = window.setTimeout(scan, 150) })
  mo.observe(document.body, { childList: true, subtree: true })
  scan()
  return () => { mo.disconnect(); io.disconnect(); if (queued) clearTimeout(queued) }
}

/* Frame watchdog. If timers run normally but the browser produces almost no animation frames for over a second, the
 * page is more than this device can draw (seen in WebKit without a GPU, where the home hero kept every frame from
 * finishing, taps waited and route changes stalled because page transitions run on frames). The page then switches to
 * a lite look for the rest of the session: no animations, transitions, filters, blur or background canvases. */
const LITE_KEY = 'of:lite'
const RELOAD_KEY = 'of:lite-reload'

/** True when WebGL is missing or runs on a software rasterizer (SwiftShader, llvmpipe): no GPU to composite with. */
function softwareGraphics(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return true
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '')
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
  } catch { return false }
}

/** Count animation frames and 100 ms timer ticks over `ms`. Timers ticking while frames stall means the main thread
 * was free but the page could not be drawn. */
function probeFrames(ms: number, done: (frames: number, ticks: number) => void): () => void {
  let frames = 0, ticks = 0, on = true
  const t0 = performance.now()
  const f = () => { if (!on) return; frames++; if (performance.now() - t0 < ms) requestAnimationFrame(f) }
  requestAnimationFrame(f)
  const iv = window.setInterval(() => { ticks++ }, 100)
  const t = window.setTimeout(() => { clearInterval(iv); if (on) done(frames, ticks) }, ms + 50)
  return () => { on = false; clearInterval(iv); clearTimeout(t) }
}
const stalled = (frames: number, ticks: number, ms: number): boolean => document.visibilityState === 'visible' && ticks >= Math.floor(ms / 100) - 3 && frames < 3

/** Switch to the lite look for this session. While the page is still starting, also load it once more so the lite look
 * is in place before the first frame: an engine that has stopped drawing never draws a class added afterwards. */
function goLite(reload: boolean) {
  const root = document.documentElement
  root.classList.add('of-lite')
  try {
    sessionStorage.setItem(LITE_KEY, '1')
    if (!reload || sessionStorage.getItem(RELOAD_KEY)) return
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch { return }
  // after the load event, so a navigation that is still loading is not cut off
  if (document.readyState === 'complete') location.reload()
  else window.addEventListener('load', () => location.reload(), { once: true })
}

/* Called from main.tsx before the first render. The lite look has to be in place before the first frame: once WebKit
 * without a GPU starts drawing the full home page it stops producing frames, and a class added later is never drawn
 * (CI diagnostics, Oct 2026: lite before the first frame kept the page drawing and taps worked; lite added later left
 * it at 0 frames and taps timed out). WebKit reports no GPU details (always "Apple GPU") and no memory size, so phones
 * (under 640 px) start lite unless the device shows it has headroom: more than 4 CPU cores and more than 4 GB of memory
 * when reported, a hardware renderer and no Save-Data. Safari reports 4 cores on every iPhone, so iPhones get the lite
 * look; 8-core Android phones keep the full (already lighter) phone hero. Tablet and desktop sizes always start full,
 * and the frame watchdog below still switches them to lite if they stall. */
export function applyLiteBeforePaint(): void {
  const root = document.documentElement
  try { if (sessionStorage.getItem(LITE_KEY) === '1') { root.classList.add('of-lite'); return } } catch { /* storage blocked */ }
  if (typeof matchMedia === 'undefined' || !matchMedia('(max-width: 639px)').matches) return
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  const slow = !!nav.connection?.saveData || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) || (nav.hardwareConcurrency || 0) <= 4 || softwareGraphics()
  if (slow) root.classList.add('of-lite')
}

export function startFrameWatchdog(): () => void {
  if (typeof requestAnimationFrame === 'undefined') return () => {}
  const root = document.documentElement
  if (root.classList.contains('of-lite')) return () => {}
  try { if (sessionStorage.getItem(LITE_KEY) === '1') { root.classList.add('of-lite'); return () => {} } } catch { /* storage blocked */ }
  let stopped = false
  let timer = 0
  let cancel = () => {}
  const probe = () => {
    if (stopped) return
    if (root.classList.contains('of-lite')) return
    if (document.visibilityState !== 'visible') { timer = window.setTimeout(probe, 2000); return }
    cancel = probeFrames(1200, (frames, ticks) => {
      if (stopped || root.classList.contains('of-lite')) return
      // still starting (first 6 s): reload once with the lite look; later on, just switch for the rest of the session
      if (stalled(frames, ticks, 1200)) return goLite(performance.now() < 6000)
      timer = window.setTimeout(probe, 4000)
    })
  }
  // first check once the page has had a moment to settle, then every few seconds for the first minute
  timer = window.setTimeout(probe, 600)
  const stopAfter = window.setTimeout(() => { stopped = true }, 60_000)
  return () => { stopped = true; cancel(); clearTimeout(timer); clearTimeout(stopAfter) }
}

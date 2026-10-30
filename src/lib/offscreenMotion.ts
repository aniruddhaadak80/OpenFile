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

/* Called from main.tsx before the first render. The lite look has to be in place before the first frame: once WebKit
 * without a GPU starts drawing the full home page it stops producing frames, and a class added later is never drawn.
 * Phones (under 640 px) get it up front when the device says it is slow: Save-Data, 2 GB of memory or less, or no GPU
 * graphics. CPU core counts are not used (Safari reports 4 on every iPhone). Desktop sizes keep the full look. */
export function applyLiteBeforePaint(): void {
  const root = document.documentElement
  try { if (sessionStorage.getItem(LITE_KEY) === '1') { root.classList.add('of-lite'); return } } catch { /* storage blocked */ }
  if (typeof matchMedia === 'undefined' || !matchMedia('(max-width: 639px)').matches) return
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  if (nav.connection?.saveData || (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || softwareGraphics()) root.classList.add('of-lite')
}

export function startFrameWatchdog(): () => void {
  if (typeof requestAnimationFrame === 'undefined') return () => {}
  const root = document.documentElement
  if (root.classList.contains('of-lite')) return () => {}
  try { if (sessionStorage.getItem(LITE_KEY) === '1') { root.classList.add('of-lite'); return () => {} } } catch { /* storage blocked */ }
  let stopped = false
  let timer = 0
  const probe = () => {
    if (stopped || root.classList.contains('of-lite')) return
    if (document.visibilityState !== 'visible') { timer = window.setTimeout(probe, 2000); return }
    let frames = 0, ticks = 0
    const t0 = performance.now()
    const f = () => { frames++; if (performance.now() - t0 < 1200) requestAnimationFrame(f) }
    requestAnimationFrame(f)
    const iv = window.setInterval(() => { ticks++ }, 100)
    timer = window.setTimeout(() => {
      clearInterval(iv)
      if (stopped) return
      // timers kept running (the main thread was free) yet frames all but stopped, while the page stayed visible
      if (document.visibilityState === 'visible' && ticks >= 8 && frames < 3) {
        root.classList.add('of-lite')
        try {
          sessionStorage.setItem(LITE_KEY, '1')
          // Tripped while the page was still starting: the engine may never draw the class change, so load the page
          // again once with the lite look applied before the first frame (applyLiteBeforePaint reads the flag).
          if (performance.now() < 6000 && !sessionStorage.getItem(RELOAD_KEY)) { sessionStorage.setItem(RELOAD_KEY, '1'); location.reload() }
        } catch { /* storage blocked */ }
        return
      }
      timer = window.setTimeout(probe, 4000)
    }, 1250)
  }
  // first check once the page has had a moment to settle, then every few seconds while things look fine
  timer = window.setTimeout(probe, 600)
  const stopAfter = window.setTimeout(() => { stopped = true }, 60_000)
  return () => { stopped = true; clearTimeout(timer); clearTimeout(stopAfter) }
}

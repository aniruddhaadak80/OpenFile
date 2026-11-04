// Ends the boot splash painted by index.html: fades the splash out and the app in.
// Called once the first real route content has committed (see BootDone in Layout).
let done = false
export function bootDone() {
  if (done || typeof document === 'undefined') return
  done = true
  const html = document.documentElement
  // the app came up after the failsafe in index.html gave up (a very slow first start): hide the fallback screen
  if (html.classList.contains('of-fail')) { html.classList.remove('of-fail'); document.getElementById('of-splash')?.remove(); return }
  if (!html.classList.contains('of-boot')) return
  requestAnimationFrame(() => {
    html.classList.add('of-ready')
    html.classList.remove('of-boot')
    setTimeout(() => { document.getElementById('of-splash')?.remove(); html.classList.remove('of-ready') }, 700)
  })
}

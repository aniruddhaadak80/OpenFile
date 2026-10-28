// Ends the boot splash painted by index.html: fades the splash out and the app in.
// Called once the first real route content has committed (see BootDone in Layout).
let done = false
export function bootDone() {
  if (done || typeof document === 'undefined') return
  done = true
  const html = document.documentElement
  if (!html.classList.contains('of-boot')) return
  requestAnimationFrame(() => {
    html.classList.add('of-ready')
    html.classList.remove('of-boot')
    setTimeout(() => { document.getElementById('of-splash')?.remove(); html.classList.remove('of-ready') }, 700)
  })
}

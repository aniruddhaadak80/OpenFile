// Layout checks on phone, tablet and desktop sizes for the main pages, plus Back navigation on the blog.
// Every page must load with no uncaught errors, no console errors, nothing wider than the screen, a working
// header menu and a reachable footer. Runs in one Chromium job in CI (see cross-platform-test.yml) to keep it cheap.
import { test as base, expect, type Page, type ConsoleMessage } from '@playwright/test'

const CONSOLE_ALLOW: RegExp[] = [
  // Open-source Playwright Chromium has no H.264; preview .mp4 files can fail to decode there (the app hides them).
  /Failed to load resource.*\.mp4/i,
  /MEDIA_ERR_SRC_NOT_SUPPORTED|NotSupportedError.*(video|media)/i,
]

const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use, testInfo) => {
    const errors: string[] = []
    await page.addInitScript(() => {
      try {
        localStorage.setItem('of:tour-done', '1')
        localStorage.setItem('of:install-dismissed', String(Date.now()))
      } catch { /* storage may be blocked */ }
    })
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.name}: ${e.message}`))
    page.on('console', (m: ConsoleMessage) => {
      if (m.type() !== 'error') return
      const text = `${m.text()} ${m.location()?.url ?? ''}`
      if (!CONSOLE_ALLOW.some((r) => r.test(text))) errors.push(`console.error: ${text.trim()}`)
    })
    page.on('crash', () => errors.push('page crashed'))
    await use(errors)
    if (errors.length) await testInfo.attach('page-errors', { body: errors.join('\n'), contentType: 'text/plain' })
    expect(errors, `Uncaught page errors or console errors on ${testInfo.title}`).toEqual([])
  },
})

const VIEWPORTS = [
  { name: 'phone-360', width: 360, height: 780 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1440', width: 1440, height: 900 },
]

const CATEGORIES = ['pdf', 'convert', 'image', 'video', 'audio', 'dev', 'text', 'design', 'data', 'ai', '3d', 'archive', 'ebook', 'font', 'cad', 'subtitle', 'privacy', 'geo', 'office', 'science', 'creator']
const PAGES = [
  '/', '/tools', '/merge-pdf', '/image-compressor', '/json-formatter', '/video-trimmer', '/blog', '/blog/how-openfile-keeps-files-private',
  '/docs', '/docs/install', '/install', '/about', '/settings', '/this-page-does-not-exist-e2e',
]

/** Elements whose right edge sticks out past the screen, for a readable failure message. */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const doc = document.documentElement.scrollWidth
    if (doc <= vw + 1) return null
    const out: string[] = []
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width && r.right > vw + 1) {
        // report the outermost offender only
        let p = el.parentElement, inner = false
        while (p) { if (p.getBoundingClientRect().right > vw + 1) { inner = true; break } p = p.parentElement }
        if (!inner || out.length === 0) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)}`)
        if (out.length > 4) break
      }
    }
    return { vw, doc, out }
  })
}

async function open(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('load')
  await expect(page.locator('main#main')).toBeVisible()
  await page.waitForTimeout(800)
}

async function checkHeaderAndFooter(page: Page, width: number) {
  if (width < 768) {
    const btn = page.getByRole('button', { name: 'Open menu' })
    await expect(btn).toBeVisible()
    // WebKit on Linux has reported this header button as never "stable" (its box changes between frames), which made
    // a normal click wait forever. Sample the box for a few frames first so a real layout shift shows up in the log,
    // then fall back to a forced click; the checks below still prove the menu opens and works.
    // The sampling gives up after 2 s: when the engine stops firing requestAnimationFrame it must log that, not hang.
    const boxes = await btn.evaluate((el) => new Promise<string[]>((done) => {
      const out: string[] = []
      const box = () => { const r = el.getBoundingClientRect(); return `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)}x${r.height.toFixed(1)}` }
      const step = () => { out.push(box()); if (out.length < 8) requestAnimationFrame(step); else done(out) }
      requestAnimationFrame(step)
      setTimeout(() => done(out.length ? out : [box(), 'no animation frame within 2 s']), 2000)
    }))
    if (boxes.includes('no animation frame within 2 s')) console.log(`[${page.url()}] requestAnimationFrame did not fire within 2 s`)
    else if (new Set(boxes).size > 1) console.log(`[${page.url()}] Open menu button moved between frames: ${boxes.join(' | ')}`)
    await btn.click({ timeout: 8000 }).catch(async () => { console.log(`[${page.url()}] Open menu click was not actionable, forcing it`); await btn.click({ force: true }) })
    const menu = page.locator('#mobile-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('link', { name: 'All Tools' })).toBeVisible()
    const box = await menu.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= width + 1, 'mobile menu fits the screen').toBe(true)
    const close = page.getByRole('button', { name: 'Close menu' })
    await close.click({ timeout: 8000 }).catch(() => close.click({ force: true }))
    await expect(menu).toBeHidden()
  } else {
    const tools = page.locator('header nav').getByRole('button', { name: 'Tools' })
    await expect(tools).toBeVisible()
    await tools.click()
    await expect(page.locator('header').getByRole('link', { name: /^All \d+ tools$/ }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('header').getByRole('link', { name: /^All \d+ tools$/ }).first()).toBeHidden()
  }
  const footer = page.locator('footer')
  // scrollIntoViewIfNeeded waits for the element to be stable across animation frames; never hang on that
  await footer.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(async () => { console.log(`[${page.url()}] footer scroll was not stable, scrolling directly`); await footer.evaluate((el) => el.scrollIntoView()) })
  await expect(footer).toBeVisible()
  expect(await footer.locator('a[href]').count(), 'footer has links').toBeGreaterThan(10)
  // the privacy policy link, not the footer category grid's /category/privacy link (hidden in a scroller at 360px)
  const link = footer.locator('a[href$="/privacy"]:not([href*="/category/"])').first()
  await link.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => link.evaluate((el) => el.scrollIntoView({ block: 'center' })))
  await expect(link).toBeInViewport()
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.width < 1024, isMobile: vp.width < 768 })

    test(`pages fit the screen at ${vp.width}px`, async ({ page, errors }) => {
      void errors
      test.setTimeout(240_000)
      const bad: string[] = []
      for (const p of PAGES) {
        await open(page, p)
        const o = await overflow(page)
        if (o) bad.push(`${p}: page is ${o.doc}px wide on a ${o.vw}px screen. ${o.out.join(' | ')}`)
      }
      expect(bad, 'pages wider than the screen').toEqual([])
    })

    test(`category pages fit the screen at ${vp.width}px`, async ({ page, errors }) => {
      void errors
      test.setTimeout(240_000)
      const bad: string[] = []
      for (const c of CATEGORIES) {
        await open(page, `/category/${c}`)
        await expect(page.locator('main a[href*="/"]').first()).toBeVisible()
        const o = await overflow(page)
        if (o) bad.push(`/category/${c}: page is ${o.doc}px wide on a ${o.vw}px screen. ${o.out.join(' | ')}`)
      }
      expect(bad, 'category pages wider than the screen').toEqual([])
    })

    test(`header menu and footer work at ${vp.width}px`, async ({ page, errors }) => {
      void errors
      for (const p of ['/', '/blog', '/merge-pdf']) {
        await open(page, p)
        await checkHeaderAndFooter(page, vp.width)
      }
    })
  })
}

test.describe('blog navigation', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('Back from a post returns to the same search, results and scroll position', async ({ page, errors }) => {
    void errors
    await open(page, '/blog')
    // the search section and its input share the label; target the input itself
    const box = page.locator('input[aria-label="Search the blog"]')
    await box.fill('pdf')
    await expect(page).toHaveURL(/[?&]q=pdf/)
    await page.keyboard.press('Escape')
    const results = page.locator('main ul[aria-label="Search results"]:not([role])')
    const cards = results.locator('a[href*="/blog/"]')
    await expect(cards.first()).toBeVisible()
    const n = await cards.count()
    expect(n, 'search finds several posts').toBeGreaterThan(1)
    const target = cards.nth(Math.min(n - 1, 3))
    await target.scrollIntoViewIfNeeded()
    // mouse.wheel is not supported in mobile WebKit; scroll the page itself
    await page.evaluate(() => window.scrollBy(0, 200))
    await page.waitForTimeout(400)
    const before = await page.evaluate(() => window.scrollY)
    const href = await target.getAttribute('href')
    await target.click()
    await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
    await expect(page.locator('h1').first()).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\/blog\/?\?(.*&)?q=pdf/)
    await expect(box).toHaveValue('pdf')
    await expect(cards.first()).toBeVisible()
    await expect.poll(() => cards.count(), { message: 'same number of results after Back' }).toBe(n)
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000, message: 'scroll position restored after Back' }).toBeGreaterThan(Math.max(0, before - 150))
    await page.goForward()
    await expect(page.locator('h1').first()).toBeVisible()
    await page.goBack()
    await expect(box).toHaveValue('pdf')
  })

  test('old and short addresses redirect to the right tool', async ({ page, errors }) => {
    void errors
    for (const [from, to] of [['/sketch', '/sketch-board'], ['/ppt-to-pdf', '/powerpoint-to-pdf'], ['/docs/tools/images', '/docs/tools/image']]) {
      await page.goto(from)
      await expect(page, `${from} goes to ${to}`).toHaveURL(new RegExp(`${to}/?$`))
      // let the redirect target finish loading before the next goto, so it cannot interrupt that navigation
      await expect(page.locator('main#main')).toBeVisible()
      await page.waitForLoadState('load')
      await page.waitForTimeout(500)
    }
  })
})

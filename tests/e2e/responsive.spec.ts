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
    await btn.click()
    const menu = page.locator('#mobile-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('link', { name: 'All Tools' })).toBeVisible()
    const box = await menu.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= width + 1, 'mobile menu fits the screen').toBe(true)
    await page.getByRole('button', { name: 'Close menu' }).click()
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
  await footer.scrollIntoViewIfNeeded()
  await expect(footer).toBeVisible()
  expect(await footer.locator('a[href]').count(), 'footer has links').toBeGreaterThan(10)
  const link = footer.getByRole('link', { name: 'Privacy' }).first()
  await link.scrollIntoViewIfNeeded()
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
    const box = page.getByRole('combobox', { name: 'Search the blog' }).or(page.getByRole('searchbox', { name: 'Search the blog' })).or(page.getByLabel('Search the blog')).first()
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
    await page.mouse.wheel(0, 200)
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
    }
  })
})

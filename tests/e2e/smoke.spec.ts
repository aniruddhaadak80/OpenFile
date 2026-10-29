// Smoke tests for the built OpenFile web app. Every test fails on an uncaught page error,
// and on any console error that is not in the short, explained allowlist below.
import { test as base, expect, type Page, type ConsoleMessage } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = (p: string) => path.join(root, 'scripts/tests', p)

// Console messages that are environment noise, not app bugs. Keep each entry explained.
const CONSOLE_ALLOW: RegExp[] = [
  // Open-source Playwright builds of Chromium and WebKit on some OSes ship without H.264, so the
  // preview .mp4 can fail to decode there. Real Chrome, Edge and Safari play it; the app hides the player on error.
  /Failed to load resource.*\.mp4/i,
  /MEDIA_ERR_SRC_NOT_SUPPORTED|NotSupportedError.*(video|media)/i,
]

type Guard = { errors: string[] }

const test = base.extend<{ guard: Guard }>({
  guard: async ({ page }, use, testInfo) => {
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
      if (CONSOLE_ALLOW.some((r) => r.test(text))) return
      errors.push(`console.error: ${text.trim()}`)
    })
    page.on('crash', () => errors.push('page crashed'))
    await use({ errors })
    if (errors.length) await testInfo.attach('page-errors', { body: errors.join('\n'), contentType: 'text/plain' })
    expect(errors, `Uncaught page errors or console errors on ${testInfo.title}`).toEqual([])
  },
})

async function settle(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForTimeout(1500)
}

async function makePdf(pages: number, label: string): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([400, 300])
    p.drawText(`${label} page ${i + 1}`, { x: 40, y: 150, size: 24, font })
  }
  return Buffer.from(await doc.save())
}

test('home page loads with no console errors', async ({ page, guard }) => {
  void guard
  await page.goto('/')
  await expect(page).toHaveTitle(/OpenFile/)
  await expect(page.locator('a[href$="/merge-pdf"]').first()).toBeVisible()
  await settle(page)
})

test('category page lists its tools', async ({ page, guard }) => {
  void guard
  await page.goto('/category/pdf')
  await expect(page.locator('a[href$="/merge-pdf"]').first()).toBeVisible()
  await expect(page.locator('a[href$="/split-pdf"], a[href$="/compress-pdf"]').first()).toBeVisible()
  await settle(page)
})

test('tool page shows the preview video player', async ({ page, guard }) => {
  void guard
  await page.goto('/merge-pdf')
  await expect(page.getByRole('heading', { level: 1, name: /Merge PDF/ })).toBeVisible()
  const play = page.getByRole('button', { name: 'Play the Merge PDF preview' })
  await expect(play).toBeVisible()
  await play.click()
  // The play button is replaced by a <video> pointing at the preview. Some engine builds cannot play H.264 at all
  // (Playwright WebKit on Windows has no media backend, open-source Chromium has no H.264); there the app hides the
  // player on its error event, which is the intended fallback. So: the player must appear, or the section must be
  // gone, and the video file itself must be served.
  const video = page.locator('video[src*="merge-pdf.mp4"]')
  const section = page.getByRole('region', { name: 'Merge PDF preview video' })
  await expect(async () => {
    expect((await video.count()) > 0 || (await section.count()) === 0, 'video player shown, or hidden after a decode error').toBe(true)
  }).toPass({ timeout: 15_000 })
  if (await video.count()) await expect(video).toHaveAttribute('src', /merge-pdf\.mp4$/)
  const res = await page.request.get('/media/tools/merge-pdf.mp4')
  expect(res.status(), 'preview video is served').toBe(200)
  expect(res.headers()['content-type'] ?? '').toMatch(/video\/mp4/)
  expect((await res.body()).subarray(4, 8).toString(), 'MP4 ftyp box').toBe('ftyp')
  await settle(page)
})

test('tool: merge two PDFs', async ({ page, guard }) => {
  void guard
  await page.goto('/merge-pdf')
  await page.locator('input[type=file]').first().setInputFiles([
    { name: 'a.pdf', mimeType: 'application/pdf', buffer: await makePdf(1, 'Alpha') },
    { name: 'b.pdf', mimeType: 'application/pdf', buffer: await makePdf(2, 'Beta') },
  ])
  await expect(page.getByText('3 pages', { exact: false }).first()).toBeVisible()
  const btn = page.getByRole('button', { name: 'Merge 2 PDFs' })
  await expect(btn).toBeEnabled()
  await btn.click()
  await expect(page.getByText('Merged 3 pages')).toBeVisible({ timeout: 60_000 })
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download' }).click()
  const file = await (await dl).path()
  const bytes = readFileSync(file)
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  const merged = await PDFDocument.load(bytes)
  expect(merged.getPageCount()).toBe(3)
})

test('tool: resize and convert an image to PNG', async ({ page, guard }) => {
  void guard
  await page.goto('/image-resizer')
  await page.locator('input[type=file]').first().setInputFiles(fixture('b2/fixtures/photo.jpg'))
  await expect(page.getByText('600×600').first()).toBeVisible()
  const width = page.getByRole('spinbutton', { name: /Width/ })
  await width.fill('300')
  await page.getByRole('button', { name: 'PNG', exact: true }).click()
  await page.getByRole('button', { name: 'Resize image' }).click()
  await expect(page.getByText('Your image is ready')).toBeVisible({ timeout: 60_000 })
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download', exact: true }).click()
  const d = await dl
  expect(d.suggestedFilename()).toMatch(/\.png$/)
  const png = readFileSync(await d.path())
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.readUInt32BE(16), 'width').toBe(300)
  expect(png.readUInt32BE(20), 'height').toBe(300)
})

test('tool: text case converter', async ({ page, guard }) => {
  void guard
  await page.goto('/case-converter')
  const input = page.getByPlaceholder('Type or paste text to convert')
  await input.fill('Cross platform smoke test')
  await expect(page.getByText('cross_platform_smoke_test', { exact: true })).toBeVisible()
  await expect(page.getByText('CROSS_PLATFORM_SMOKE_TEST', { exact: true })).toBeVisible()
  await expect(page.getByText('crossPlatformSmokeTest', { exact: true })).toBeVisible()
})

test('docs page loads', async ({ page, guard }) => {
  void guard
  await page.goto('/docs')
  await expect(page.locator('h1').first()).toBeVisible()
  await settle(page)
})

test('blog post page loads', async ({ page, guard }) => {
  void guard
  await page.goto('/blog/how-openfile-keeps-files-private')
  await expect(page.getByRole('heading', { level: 1, name: /How OpenFile keeps your files private/ })).toBeVisible()
  await settle(page)
})

test('settings: theme switch applies', async ({ page, guard }) => {
  void guard
  await page.goto('/settings')
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  const themes = page.getByRole('radiogroup', { name: 'Theme' }).first()
  await themes.getByRole('radio', { name: 'Sun' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await themes.getByRole('radio', { name: 'Black' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'black')
  await themes.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('unknown address shows the 404 page', async ({ page, guard }) => {
  void guard
  await page.goto('/this-page-does-not-exist-e2e')
  await expect(page.getByText('That page wandered off')).toBeVisible()
  await expect(page.getByText('404').first()).toBeVisible()
})

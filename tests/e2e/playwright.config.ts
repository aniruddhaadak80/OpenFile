// Cross-browser smoke tests for the built web app (vite build, then vite preview).
// Run locally: npm run build && npx playwright test -c tests/e2e/playwright.config.ts
// CI: .github/workflows/cross-platform-test.yml runs this on Windows, macOS and Linux runners.
import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 4173)

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }], ['github']] : 'list',
  outputDir: '../../test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    { name: 'chromium', testMatch: /smoke\.spec\.ts$/, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: /smoke\.spec\.ts$/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: /smoke\.spec\.ts$/, use: { ...devices['Desktop Safari'] } },
    // Phone, tablet and desktop layouts (responsive.spec.ts) run once on Linux, not in every OS and browser job.
    { name: 'responsive', testMatch: /responsive\.spec\.ts$/, use: { ...devices['Desktop Chrome'] } },
    // Safari engine on a phone-sized screen: the phone layout and blog navigation checks only.
    { name: 'responsive-webkit', testMatch: /responsive\.spec\.ts$/, grep: /phone-390|blog navigation/, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})

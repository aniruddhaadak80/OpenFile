// Checks the start screen in index.html against a built dist/ served at BASE (default http://127.0.0.1:8791/):
//  1. a normal start ends with the app on screen and the fallback hidden
//  2. when the app code cannot load, the "OpenFile did not finish starting" screen with Try again shows instead of
//     an empty window
// Screenshots go to OUT (default app-start). Usage: node tests/apps/fallback-check.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://127.0.0.1:8791/'
const OUT = process.env.OUT || 'app-start'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
let failed = false

const ok = await browser.newPage({ viewport: { width: 1280, height: 840 } })
await ok.goto(BASE, { waitUntil: 'load' })
await ok.waitForFunction(() => !document.documentElement.classList.contains('of-boot'), null, { timeout: 30000 }).catch(() => {})
await ok.waitForTimeout(1500)
const okState = await ok.evaluate(() => ({ cls: document.documentElement.className, root: document.getElementById('root')?.childElementCount || 0 }))
const okFallback = await ok.isVisible('#of-fallback')
await ok.screenshot({ path: `${OUT}/web-start-normal.png` })
console.log('normal start:', JSON.stringify(okState), 'fallback visible:', okFallback)
if (okFallback || !okState.root || okState.cls.includes('of-fail')) { console.log('::error::normal start did not end on the app'); failed = true }

const bad = await browser.newPage({ viewport: { width: 1280, height: 840 } })
await bad.route(/\/assets\/.*\.js$/, (r) => r.abort())
await bad.goto(BASE, { waitUntil: 'load' })
await bad.waitForTimeout(3000)
const badFallback = await bad.isVisible('#of-fallback')
const retry = await bad.isVisible('#of-fallback button')
await bad.screenshot({ path: `${OUT}/web-start-fallback.png` })
console.log('app code blocked: fallback visible:', badFallback, 'Try again button:', retry)
if (!badFallback || !retry) { console.log('::error::the fallback screen did not show when the app code could not load'); failed = true }

await browser.close()
console.log(failed ? 'FAIL: start screen' : 'PASS: start screen')
process.exit(failed ? 1 : 0)

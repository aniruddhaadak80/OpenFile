import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyPrefs } from './lib/prefs'
import { registerPWA } from './lib/app/pwa'
import { isChunkError, reloadOnceForStaleChunk, watchStaleChunks } from './components/ErrorBoundary'
import { applyLiteBeforePaint } from './lib/offscreenMotion'

// apply saved theme + motion preference before first paint (prefs.ts reads localStorage synchronously)
try { applyPrefs() } catch { document.documentElement.classList.add('dark') }
// slow phones without a GPU get the lite look before the first frame (src/lib/offscreenMotion.ts)
try { applyLiteBeforePaint() } catch { /* never block boot */ }

// if the app crashes before its first route commits, drop the splash and show the pre-rendered guide instead of a blank page
const bootFail = () => { const h = document.documentElement; if (h.classList.contains('of-boot')) { h.classList.remove('of-boot'); h.classList.add('of-fail') } }
// a lazy page whose hashed chunk is gone after a deploy reloads once to fetch the current build
watchStaleChunks()
createRoot(document.getElementById('root')!, { onUncaughtError: (e) => { if (e instanceof Error && isChunkError(e) && reloadOnceForStaleChunk()) return; console.error(e); bootFail() } }).render(<StrictMode><App /></StrictMode>)

// service worker with an update flow ("New version ready, reload"); registered at BASE_URL so the scope is
// "/" on Vercel and "/OpenFile/" on GitHub Pages (src/lib/app/pwa.ts)
registerPWA()

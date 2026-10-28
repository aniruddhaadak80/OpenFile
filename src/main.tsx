import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyPrefs } from './lib/prefs'
import { registerPWA } from './lib/app/pwa'

// apply saved theme + motion preference before first paint (prefs.ts reads localStorage synchronously)
try { applyPrefs() } catch { document.documentElement.classList.add('dark') }

// if the app crashes before its first route commits, drop the splash and show the pre-rendered guide instead of a blank page
const bootFail = () => { const h = document.documentElement; if (h.classList.contains('of-boot')) { h.classList.remove('of-boot'); h.classList.add('of-fail') } }
createRoot(document.getElementById('root')!, { onUncaughtError: (e) => { console.error(e); bootFail() } }).render(<StrictMode><App /></StrictMode>)

// service worker with an update flow ("New version ready, reload"); registered at BASE_URL so the scope is
// "/" on Vercel and "/OpenFile/" on GitHub Pages (src/lib/app/pwa.ts)
registerPWA()

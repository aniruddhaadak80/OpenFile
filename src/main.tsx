import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyPrefs } from './lib/prefs'

// apply saved theme + motion preference before first paint (prefs.ts reads localStorage synchronously)
try { applyPrefs() } catch { document.documentElement.classList.add('dark') }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}))
}

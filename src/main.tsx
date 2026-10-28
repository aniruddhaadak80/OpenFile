import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// apply saved theme before first paint
try { const t = JSON.parse(localStorage.getItem('of:theme') || 'null'); document.documentElement.classList.toggle('dark', t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches) } catch { document.documentElement.classList.add('dark') }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}))
}

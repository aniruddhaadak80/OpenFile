import { useEffect, useState } from 'react'

function useLocal<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial } catch { return initial } })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} ; window.dispatchEvent(new CustomEvent('of-store', { detail: key })) }, [key, v])
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail === key) { try { const s = localStorage.getItem(key); if (s && s !== JSON.stringify(v)) setV(JSON.parse(s)) } catch {} } }
    window.addEventListener('of-store', h); return () => window.removeEventListener('of-store', h)
  })
  return [v, setV] as const
}

export function useFavorites() {
  const [fav, setFav] = useLocal<string[]>('of:favorites', [])
  return { fav, isFav: (s: string) => fav.includes(s), toggle: (s: string) => setFav(fav.includes(s) ? fav.filter((x) => x !== s) : [s, ...fav]) }
}
export function useRecent() {
  const [recent, setRecent] = useLocal<string[]>('of:recent', [])
  return { recent, push: (s: string) => setRecent([s, ...recent.filter((x) => x !== s)].slice(0, 8)) }
}
export function useTheme() {
  const [theme, setTheme] = useLocal<'dark' | 'light'>('of:theme', window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}

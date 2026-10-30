// Lets a post's "All posts" link go back to the list the reader came from (same search, filters and scroll), the
// same as the browser Back button, instead of opening a fresh, unfiltered blog index.
const KEY = 'of:blog-list'
let listIdx = -1
let lastSearch: string | null = null
const histIdx = (): number => { const i = (window.history.state as { idx?: unknown } | null)?.idx; return typeof i === 'number' ? i : -1 }

/** Called by the blog index whenever its query string changes. */
export function rememberBlogList(search: string) {
  lastSearch = search
  listIdx = histIdx()
  try { sessionStorage.setItem(KEY, search) } catch { /* storage may be blocked */ }
}
/** True when the history entry right before this one is the blog index, so history Back lands on that list. */
export function cameFromBlogList() { const i = histIdx(); return i > 0 && listIdx >= 0 && i === listIdx + 1 }
/** The blog index address with the last search the reader used in this tab. */
export function blogListHref() {
  let s = lastSearch
  if (s == null) { try { s = sessionStorage.getItem(KEY) } catch { s = null } }
  return '/blog' + (s && s.startsWith('?') ? s : '')
}

// Docs site navigation. One page per line: scripts/postbuild.mjs reads id, path, title and description from this
// file to pre-render each route and the sitemap, and scripts/gen-docs.mjs reads id and edit for "last updated".
// `edit` is the source file (or files, comma separated) behind the page: the "Edit this page" link opens the first.
// Tool guide pages (/docs/tools/<category>) are added from the registry below, so new categories appear on their own.
import { CATEGORIES, TOOLS } from '@/tools/registry'

export type DocSource = 'md' | 'legacy' | 'category'
export interface DocPage {
  id: string; path: string; title: string; description: string; group: string; edit: string
  source: DocSource
  /** markdown file id in src/pages/docs/content (source md) or src/docs/pages (source legacy) */
  file?: string
  icon?: string
  parent?: string
}

export const DOC_GROUPS = ['Start here', 'Using OpenFile', 'Devices and offline', 'Privacy and AI', 'Reference', 'Help', 'Project'] as const

export const DOC_PAGES: DocPage[] = [
  { id: 'getting-started', path: '/docs', title: 'Getting started', description: 'Your first file in 30 seconds: pick a tool, drop a file, download the result. Nothing is uploaded.', group: 'Start here', edit: 'src/pages/docs/content/getting-started.md', source: 'md', icon: 'Rocket' },
  { id: 'install', path: '/docs/install', title: 'Install on every device', description: 'Install OpenFile as a web app, a desktop app for Windows, macOS and Linux, an Android APK or on iPhone.', group: 'Start here', edit: 'src/pages/docs/content/install.md', source: 'md', icon: 'Download' },
  { id: 'how-it-works', path: '/docs/how-it-works', title: 'How OpenFile works', description: 'The zero-upload privacy architecture, the processing engines and first-use model downloads.', group: 'Start here', edit: 'src/docs/pages/how-it-works.md', source: 'legacy', file: 'how-it-works', icon: 'Cpu' },
  { id: 'using-tools', path: '/docs/using-tools', title: 'Using tools', description: 'Drop zones, batches, page ranges, presets, history, undo and where your downloads go.', group: 'Using OpenFile', edit: 'src/pages/docs/content/using-tools.md', source: 'md', icon: 'MousePointerClick' },
  { id: 'workspace', path: '/docs/workspace', title: 'Workspace pipelines and recipes', description: 'Chain steps into reusable recipes and batch-process hundreds of images or PDFs, with a live demo.', group: 'Using OpenFile', edit: 'src/pages/docs/content/workspace.md,src/docs/pages/workspace.md', source: 'md', icon: 'Workflow' },
  { id: 'keyboard-shortcuts', path: '/docs/keyboard-shortcuts', title: 'Command palette and shortcuts', description: 'The command palette and every keyboard shortcut, generated from the real shortcut tables.', group: 'Using OpenFile', edit: 'src/pages/docs/content/keyboard-shortcuts.md,src/components/Overlays.tsx', source: 'md', icon: 'Keyboard' },
  { id: 'themes', path: '/docs/themes-accessibility', title: 'Themes and accessibility', description: 'Black, dark, light and system themes, accent colors, fonts, density, reduced motion and keyboard use.', group: 'Using OpenFile', edit: 'src/pages/docs/content/themes.md,src/lib/prefs.ts', source: 'md', icon: 'Palette' },
  { id: 'sketch-board', path: '/docs/sketch-board', title: 'Sketch board', description: 'The infinite whiteboard: tools, boards, sharing, presenting, exporting and shortcuts.', group: 'Using OpenFile', edit: 'src/docs/pages/sketch-board.md', source: 'legacy', file: 'sketch-board', icon: 'PencilRuler' },
  { id: 'local-data', path: '/docs/local-data', title: 'Favorites, history and settings', description: 'How favorites, recent tools, activity history and settings are stored locally in IndexedDB.', group: 'Using OpenFile', edit: 'src/docs/pages/local-data.md', source: 'legacy', file: 'local-data', icon: 'Database' },
  { id: 'offline', path: '/docs/offline', title: 'Offline and PWA', description: 'How the service worker caches the app, engines and models, how updates work and how to clear data.', group: 'Devices and offline', edit: 'src/pages/docs/content/offline.md,public/sw.js', source: 'md', icon: 'WifiOff' },
  { id: 'open-with', path: '/docs/open-with', title: 'Open with and share target', description: 'Open files from your system with OpenFile and send files to it from the share sheet.', group: 'Devices and offline', edit: 'src/pages/docs/content/open-with.md,public/manifest.webmanifest', source: 'md', icon: 'Share2' },
  { id: 'local-ai', path: '/docs/local-ai', title: 'Local AI', description: 'Which AI models run on your device, their sizes, first-run downloads, WebGPU or CPU, cancelling and privacy.', group: 'Privacy and AI', edit: 'src/pages/docs/content/local-ai.md,src/lib/b4/ai.ts', source: 'md', icon: 'Sparkles' },
  { id: 'privacy-security', path: '/docs/privacy-security', title: 'Privacy and security', description: 'No uploads, how to verify it yourself in the DevTools network tab, headers and what is stored locally.', group: 'Privacy and AI', edit: 'src/pages/docs/content/privacy-security.md', source: 'md', icon: 'ShieldCheck' },
  { id: 'browser-support', path: '/docs/browser-support', title: 'Browser support', description: 'Which browsers and platform features each group of tools needs.', group: 'Privacy and AI', edit: 'src/docs/pages/browser-support.md', source: 'legacy', file: 'browser-support', icon: 'Globe' },
  { id: 'formats', path: '/docs/formats', title: 'Formats supported', description: 'A searchable matrix of every input and output format, generated from the tool registry.', group: 'Reference', edit: 'src/pages/docs/content/formats.md,src/lib/formats.ts', source: 'md', icon: 'FileType' },
  { id: 'tools', path: '/docs/tools', title: 'Full tools reference', description: 'Every tool with its description, formats and link, generated from the registry. Filter and search.', group: 'Reference', edit: 'src/pages/docs/content/tools.md,src/tools/registry.ts', source: 'md', icon: 'LayoutGrid' },
  { id: 'api', path: '/docs/api', title: 'API reference', description: 'The optional Vercel serverless routes: /api/health, /api/fetch-page and /api/meta.', group: 'Reference', edit: 'src/docs/pages/api.md', source: 'legacy', file: 'api', icon: 'Code2' },
  { id: 'self-hosting', path: '/docs/self-hosting', title: 'Self-hosting', description: 'Deploy OpenFile to Vercel, GitHub Pages, any static host or Docker with nginx.', group: 'Reference', edit: 'src/docs/pages/self-hosting.md', source: 'legacy', file: 'self-hosting', icon: 'Server' },
  { id: 'troubleshooting', path: '/docs/troubleshooting', title: 'Troubleshooting', description: 'Large files, memory, browser support, Safari quirks, unsigned app warnings and quick fixes.', group: 'Help', edit: 'src/pages/docs/content/troubleshooting.md', source: 'md', icon: 'LifeBuoy' },
  { id: 'faq', path: '/docs/faq', title: 'FAQ', description: 'Answers to common questions about privacy, limits, offline use and troubleshooting.', group: 'Help', edit: 'src/docs/pages/faq.md', source: 'legacy', file: 'faq', icon: 'HelpCircle' },
  { id: 'developer', path: '/docs/developer', title: 'Developer guide', description: 'Architecture, adding a tool, batch files, tests, builds, Pages and Vercel base paths and releasing the apps.', group: 'Project', edit: 'src/pages/docs/content/developer.md', source: 'md', icon: 'Terminal' },
  { id: 'contributing', path: '/docs/contributing', title: 'Contributing', description: 'Set up the project, follow the conventions and send your first pull request.', group: 'Project', edit: 'src/pages/docs/content/contributing.md,src/docs/pages/contributing.md', source: 'md', icon: 'GitPullRequest' },
  { id: 'changelog', path: '/changelog', title: 'Changelog', description: 'Release notes for every OpenFile version, rendered from CHANGELOG.md.', group: 'Project', edit: 'CHANGELOG.md', source: 'md', icon: 'History' },
  { id: 'roadmap', path: '/docs/roadmap', title: 'Roadmap', description: 'What has shipped and what comes next, generated from the project roadmap.', group: 'Project', edit: 'src/pages/docs/content/roadmap.md,README.md', source: 'md', icon: 'Map' },
]

/** Tool guide pages, one per category that has tools. Nested under "Full tools reference" in the sidebar. */
export const CATEGORY_PAGES: DocPage[] = CATEGORIES.map((c) => ({
  id: `tools-${c.id}`, path: `/docs/tools/${c.id}`, title: c.name, description: `Guide to every ${c.name} tool: ${c.blurb.toLowerCase()}.`,
  group: 'Reference', edit: 'src/tools/guides.ts', source: 'category' as const, parent: 'tools',
}))

/** Reading order: the order of the sidebar, with tool guides right after the full reference. */
export const ALL_PAGES: DocPage[] = DOC_PAGES.flatMap((p) => (p.id === 'tools' ? [p, ...CATEGORY_PAGES] : [p]))

const norm = (p: string) => p.replace(/\/+$/, '') || '/'
export function pageByPath(path: string): DocPage | undefined {
  const p = norm(path)
  if (p === '/docs/getting-started') return DOC_PAGES[0]
  return ALL_PAGES.find((d) => d.path === p)
}
// Plural or longer names people guess for a category guide (/docs/tools/images) point at the real page.
export function docAlias(path: string): string | undefined {
  const m = norm(path).match(/^\/docs\/tools\/([a-z0-9-]+)$/)
  if (!m) return undefined
  const key = m[1]
  const named: Record<string, string> = { developer: 'dev', images: 'image', videos: 'video', maps: 'geo', gps: 'geo', security: 'privacy', sheets: 'office', ebooks: 'ebook', books: 'ebook', archives: 'archive', fonts: 'font', subtitles: 'subtitle', documents: 'convert', converters: 'convert' }
  const id = named[key] ?? (key.endsWith('s') ? key.slice(0, -1) : '')
  return id && CATEGORY_PAGES.some((c) => c.path === `/docs/tools/${id}`) ? `/docs/tools/${id}` : undefined
}
export const pageById = (id: string) => ALL_PAGES.find((d) => d.id === id)
export const toolCountFor = (cat: string) => TOOLS.filter((t) => t.category === cat).length

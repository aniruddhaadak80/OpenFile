// Docs navigation. Keep one entry per line: scripts/postbuild.mjs reads `path:` and `title:` from this file
// to pre-render deep links and the sitemap.
export interface DocNavItem { id: string; path: string; title: string; description: string; section: string }

export const DOC_SECTIONS = ['Getting started', 'Tool guides', 'Features', 'Reference', 'Project'] as const

export const DOC_NAV: DocNavItem[] = [
  { id: 'getting-started', path: '/docs', title: 'Getting started', description: 'What OpenFile is, how to use your first tool, install it as an app and work offline.', section: 'Getting started' },
  { id: 'how-it-works', path: '/docs/how-it-works', title: 'How OpenFile works', description: 'The zero-upload privacy architecture, the processing engines and first-use model downloads.', section: 'Getting started' },
  { id: 'keyboard-shortcuts', path: '/docs/keyboard-shortcuts', title: 'Keyboard shortcuts', description: 'Global, command palette, docs and Sketch board keyboard shortcuts.', section: 'Getting started' },
  { id: 'tools-pdf', path: '/docs/tools/pdf', title: 'PDF tools', description: 'Guide to every PDF tool: merge, split, compress, sign, protect, OCR and more.', section: 'Tool guides' },
  { id: 'tools-convert', path: '/docs/tools/convert', title: 'Convert', description: 'Guide to converting between PDF, Word, Excel, PowerPoint, Markdown, HTML and images.', section: 'Tool guides' },
  { id: 'tools-image', path: '/docs/tools/image', title: 'Image tools', description: 'Guide to compressing, resizing, converting, background removal, upscaling and editing images.', section: 'Tool guides' },
  { id: 'tools-video', path: '/docs/tools/video', title: 'Video tools', description: 'Guide to trimming, compressing, converting, GIFs and recording video in the browser.', section: 'Tool guides' },
  { id: 'tools-audio', path: '/docs/tools/audio', title: 'Audio tools', description: 'Guide to editing, converting, recording and transcribing audio on-device.', section: 'Tool guides' },
  { id: 'tools-dev', path: '/docs/tools/dev', title: 'Developer tools', description: 'Guide to JSON, JWT, hashes, regex, QR codes, cURL conversion and other developer utilities.', section: 'Tool guides' },
  { id: 'tools-text', path: '/docs/tools/text', title: 'Text & data tools', description: 'Guide to diffing, counting, case conversion, Markdown and text cleanup tools.', section: 'Tool guides' },
  { id: 'tools-design', path: '/docs/tools/design', title: 'Design tools', description: 'Guide to colors, gradients, CSS, favicons, SVG and the Sketch whiteboard.', section: 'Tool guides' },
  { id: 'workspace', path: '/docs/workspace', title: 'Workspace pipelines', description: 'Chain steps into reusable recipes and batch-process hundreds of images or PDFs.', section: 'Features' },
  { id: 'sketch-board', path: '/docs/sketch-board', title: 'Sketch board', description: 'The infinite whiteboard: tools, boards, sharing, presenting, exporting and shortcuts.', section: 'Features' },
  { id: 'local-data', path: '/docs/local-data', title: 'Favorites, history & settings', description: 'How favorites, recent tools, activity history and settings are stored locally in IndexedDB.', section: 'Features' },
  { id: 'self-hosting', path: '/docs/self-hosting', title: 'Self-hosting', description: 'Deploy OpenFile to Vercel, GitHub Pages, any static host or Docker with nginx.', section: 'Reference' },
  { id: 'api', path: '/docs/api', title: 'API reference', description: 'The optional Vercel serverless routes: /api/health, /api/fetch-page and /api/meta.', section: 'Reference' },
  { id: 'browser-support', path: '/docs/browser-support', title: 'Browser support', description: 'Which browsers and platform features each group of tools needs.', section: 'Reference' },
  { id: 'faq', path: '/docs/faq', title: 'FAQ', description: 'Answers to common questions about privacy, limits, offline use and troubleshooting.', section: 'Reference' },
  { id: 'contributing', path: '/docs/contributing', title: 'Contributing & adding a tool', description: 'Set up the project, follow the tool conventions and add a new tool to the registry.', section: 'Project' },
  { id: 'changelog', path: '/changelog', title: 'Changelog', description: 'Release notes for every OpenFile version.', section: 'Project' },
]

export const docById = (id: string) => DOC_NAV.find((d) => d.id === id)
export const docByPath = (path: string) => DOC_NAV.find((d) => d.path === path.replace(/\/+$/, '') || (d.id === 'getting-started' && path.replace(/\/+$/, '') === '/docs/getting-started'))

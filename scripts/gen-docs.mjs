// Generates the facts the docs need straight from the source, so nothing numeric or listy is ever hand-typed.
// Runs before every build (package.json prebuild). Safe to run any time: output only changes when the source does.
//
// Writes:
//   src/pages/docs/generated.json   shortcuts, AI models, manifest file handling, ffmpeg files, tests, roadmap,
//                                   versions and "last updated" dates for every docs page (from git)
//   docs/SHORTCUTS.md               full keyboard shortcut reference
//   docs/AI.md, docs/TOOL_GUIDE.md, docs/ARCHITECTURE.md, docs/PRIVACY.md, docs/TROUBLESHOOTING.md
//                                   only the blocks between <!-- gen:NAME:start --> and <!-- gen:NAME:end -->
//
// Usage: node scripts/gen-docs.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const rd = (p) => readFileSync(join(root, p), 'utf8')
const has = (p) => existsSync(join(root, p))
const OUT = 'src/pages/docs/generated.json'
const git = (cmd) => { try { return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }

/* ---------- 1. registry: tools and categories (same loader postbuild uses) ---------- */
let TOOLS = [], CATEGORIES = [], toolFormats = null, ENGINES = {}
try {
  const { runnerImport } = await import('vite')
  const cfg = { configFile: false, logLevel: 'silent', resolve: { alias: { '@': join(root, 'src') } } }
  TOOLS = (await runnerImport(join(root, 'src/tools/registry.ts'), cfg)).module.TOOLS.map((t) => ({ ...t }))
  CATEGORIES = (await runnerImport(join(root, 'src/tools/registry.ts'), cfg)).module.CATEGORIES.map((c) => ({ ...c }))
  try { toolFormats = (await runnerImport(join(root, 'src/lib/formats.ts'), cfg)).module.toolFormats } catch { /* optional */ }
  try { ENGINES = (await runnerImport(join(root, 'src/tools/engines.ts'), cfg)).module.ENGINES } catch { /* optional */ }
} catch (e) {
  console.warn('gen-docs: registry import failed, counts in docs/*.md are left as they are:', e?.message || e)
}

/* ---------- 2. shortcut tables parsed from the real config ---------- */
function literalAfter(src, marker) {
  const i = src.indexOf(marker)
  if (i < 0) return null
  let j = src.indexOf('[', src.indexOf('=', i))
  let depth = 0, str = null
  for (let k = j; k < src.length; k++) {
    const ch = src[k]
    if (str) { if (ch === '\\') { k++; continue } if (ch === str) str = null; continue }
    if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue }
    if (ch === '[') depth++
    if (ch === ']') { depth--; if (depth === 0) { try { return Function(`return (${src.slice(j, k + 1)})`)() } catch { return null } } }
  }
  return null
}
const globalShortcuts = (literalAfter(rd('src/components/Overlays.tsx'), 'export const SHORTCUTS') || []).map((g) => ({ group: g.group, items: g.items.map(([keys, label]) => ({ keys, label })) }))
const sketchSrc = has('src/tools/design/_design/sketch/ui.tsx') ? rd('src/tools/design/_design/sketch/ui.tsx') : ''
const sketchShortcuts = (literalAfter(sketchSrc, 'const SHORTCUTS') || []).map(([group, list]) => ({ group, items: list.map(([label, keys]) => ({ label, keys })) }))

/* ---------- 3. on-device AI models found in the source ---------- */
function walk(dir, out = []) {
  for (const f of readdirSync(join(root, dir))) {
    const p = `${dir}/${f}`
    if (f === 'node_modules' || f.startsWith('.')) continue
    if (statSync(join(root, p)).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f)) out.push(p)
  }
  return out
}
const srcFiles = [...walk('src/tools'), ...walk('src/lib')]
const fileText = new Map(srcFiles.map((f) => [f, rd(f)]))
const toolOfFile = (f) => { const m = f.match(/^src\/tools\/([^/_]+)\/([^/_][^/]*)\.tsx$/); return m && TOOLS.some((t) => t.slug === m[2]) ? m[2] : null }
const MODEL_RE = /['"`]((?:Xenova|onnx-community|HuggingFaceTB|briaai|hexgrad|Helsinki-NLP|mixedbread-ai|sentence-transformers|openai|facebook|microsoft|Qwen)\/[A-Za-z0-9._-]+?)['"`]/g
const HF_URL_RE = /https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\/[^'"`\s]+?\/([\w.-]+\.onnx)/g
const SIZE_RE = /(?:about|~|roughly)\s?(\d+(?:\.\d+)?(?:\s?(?:to|-)\s?\d+(?:\.\d+)?)?)\s?(MB|GB)/i
const models = new Map()
for (const [f, txt] of fileText) {
  const add = (id, file) => {
    if (/-$/.test(id)) return // template prefixes such as 'Xenova/whisper-' + size
    const m = models.get(id) ?? { id, files: new Set(), size: null }
    m.files.add(file)
    models.set(id, m)
  }
  for (const m of txt.matchAll(MODEL_RE)) add(m[1], f)
  for (const m of txt.matchAll(HF_URL_RE)) add(`${m[1]} (${m[2]})`, f)
}
// a model is used by the tool files that define it, or by tool files that import (directly or one step removed)
// the module defining it. When the module groups models under keys (MODELS.chat), only tools naming that key count.
const resolveImport = (from, spec) => {
  let base
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2)
  else if (spec.startsWith('.')) base = join(dirname(from), spec).replace(/\\/g, '/')
  else return null
  base = base.replace(/\.(ts|tsx)$/, '')
  return [base + '.ts', base + '.tsx', base + '/index.ts'].find((f) => fileText.has(f)) || null
}
const importsOf = new Map([...fileText.entries()].map(([f, t]) => [f, [...t.matchAll(/(?:from\s+|import\s*\(|new URL\()\s*['"]([^'"]+)['"]/g)].map((m) => resolveImport(f, m[1])).filter(Boolean)]))
const importers = (file) => [...importsOf.entries()].filter(([, deps]) => deps.includes(file)).map(([f]) => f)
const keyOf = (txt, id) => {
  const at = txt.indexOf(id); if (at < 0) return null
  const before = txt.slice(Math.max(0, at - 400), at)
  const m = [...before.matchAll(/(\w+):\s*\[/g)].pop()
  return m && txt.includes('export const MODELS') ? m[1] : null
}
const aiModels = [...models.values()].map((m) => {
  const files = [...m.files]
  const users = new Set()
  for (const f of files) {
    const own = toolOfFile(f); if (own) users.add(own)
    const key = keyOf(fileText.get(f), m.id.split(' ')[0])
    const near = importers(f).flatMap((g) => [g, ...importers(g)])
    for (const g of near) {
      const t = toolOfFile(g); if (!t) continue
      if (key && !fileText.get(g).includes(`MODELS.${key}`)) continue
      users.add(t)
    }
  }
  // size: an "about N MB" on the same line as the model id, or anywhere in a file that defines only this model
  let size = null
  const fmt = (s) => `about ${s[1].replace(/\s?-\s?/, ' to ')} ${s[2].toUpperCase()}`
  for (const f of files) {
    const txt = fileText.get(f)
    const line = txt.split('\n').find((l) => l.includes(m.id.split(' ')[0]))
    const s = line && line.match(SIZE_RE)
    if (s) { size = fmt(s); break }
    const only = [...models.values()].filter((x) => x.files.has(f)).length === 1
    const s2 = only && txt.match(SIZE_RE)
    if (s2) { size = fmt(s2); break }
  }
  if (!size && users.size) for (const t of users) {
    const f = srcFiles.find((x) => x.endsWith(`/${t}.tsx`))
    const only = [...models.values()].filter((x) => [...x.files].some((y) => y === f || importers(y).includes(f))).length === 1
    const s = only && f && fileText.get(f).match(SIZE_RE)
    if (s) { size = fmt(s); break }
  }
  return { id: m.id, files: files.sort(), tools: [...users].sort(), size }
}).sort((a, b) => a.id.localeCompare(b.id))
const whisperSizes = (fileText.get('src/tools/audio/audio-transcriber.tsx') || '').match(/Xenova\/whisper-\w+/g)
if (whisperSizes) for (const id of new Set(whisperSizes)) if (!aiModels.some((m) => m.id === id)) aiModels.push({ id, files: ['src/tools/audio/audio-transcriber.tsx'], tools: ['audio-transcriber'], size: null })
const AI_ENGINE_KEYS = ['Transformers.js (ONNX)', 'IMG.LY background removal', 'Tesseract.js']
const aiTools = TOOLS.filter((t) => t.category === 'ai' || t.badge === 'AI' || (ENGINES[t.slug] || []).some((k) => AI_ENGINE_KEYS.includes(k)) || aiModels.some((m) => m.tools.includes(t.slug))).map((t) => t.slug)

/* ---------- 4. manifest: Open with and share target ---------- */
let manifest = { fileHandlers: [], shareAccept: [], shortcuts: [], display: '' }
try {
  const m = JSON.parse(rd('public/manifest.webmanifest'))
  manifest = {
    display: m.display || '',
    fileHandlers: (m.file_handlers || []).map((h) => ({ name: h.name, exts: [...new Set(Object.values(h.accept || {}).flat())] })),
    shareAccept: (m.share_target?.params?.files || []).flatMap((f) => f.accept || []),
    shortcuts: (m.shortcuts || []).map((s) => ({ name: s.name, url: String(s.url).replace(/^\.\//, '/').replace(/\?.*$/, '') })),
  }
} catch { /* keep defaults */ }

/* ---------- 5. engines shipped with the app, tests, versions, workflows ---------- */
const ffmpegFiles = has('public/ffmpeg') ? readdirSync(join(root, 'public/ffmpeg')).map((f) => ({ name: f, bytes: statSync(join(root, 'public/ffmpeg', f)).size })) : []
const testDirs = has('scripts/tests') ? readdirSync(join(root, 'scripts/tests')).filter((d) => statSync(join(root, 'scripts/tests', d)).isDirectory()) : []
const testFiles = testDirs.flatMap((d) => readdirSync(join(root, 'scripts/tests', d)).filter((f) => /\.test\.m?[jt]s$/.test(f)).map((f) => `scripts/tests/${d}/${f}`))
let appVersion = ''
try { appVersion = JSON.parse(rd('desktop/src-tauri/tauri.conf.json')).version || '' } catch { /* none */ }
const pkg = JSON.parse(rd('package.json'))
const workflows = has('.github/workflows') ? readdirSync(join(root, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f)).map((f) => ({ file: `.github/workflows/${f}`, name: (rd(`.github/workflows/${f}`).match(/^name:\s*(.+)$/m) || [])[1] || f })) : []
const changelog = has('CHANGELOG.md') ? rd('CHANGELOG.md') : ''
const latestRelease = (changelog.match(/^##\s+(v\d+\.\d+\.\d+)[^\n]*/m) || [])[1] || ''

/* ---------- 6. roadmap from the README (checklist and timeline) ---------- */
let roadmap = { done: [], next: [], timeline: '' }
{
  const readme = has('README.md') ? rd('README.md') : ''
  const sec = readme.split(/^## /m).find((s) => /^\S*\s*Roadmap/.test(s)) || ''
  const items = [...sec.matchAll(/^- \[( |x)\] (.+)$/gm)].map((m) => ({ done: m[1] === 'x', text: m[2].replace(/\*\*/g, '').trim() }))
  roadmap = { done: items.filter((i) => i.done).map((i) => i.text), next: items.filter((i) => !i.done).map((i) => i.text), timeline: (sec.match(/```mermaid\n([\s\S]*?)```/) || [])[1] || '' }
}

/* ---------- 7. last updated per docs page, from git ---------- */
const navSrc = has('src/pages/docs/nav.ts') ? rd('src/pages/docs/nav.ts') : ''
const pages = [...navSrc.matchAll(/\{\s*id:\s*'([^']+)',[^\n]*?edit:\s*'([^']+)'/g)].map((m) => ({ id: m[1], edit: m[2] }))
const shallow = git('git rev-parse --is-shallow-repository') === 'true'
let prev = {}
try { prev = JSON.parse(rd(OUT)).lastUpdated || {} } catch { /* first run */ }
const lastUpdated = {}
for (const p of pages) {
  const files = p.edit.split(',').map((s) => s.trim())
  const today = new Date().toISOString().slice(0, 10)
  const d = files.map((f) => git(`git log -1 --format=%cs -- "${f}"`) || (has(f) && !git(`git ls-files -- "${f}"`) ? today : '')).filter(Boolean).sort().pop()
  // shallow CI clones only know one commit, so keep the dates from the committed file when we have them
  lastUpdated[p.id] = shallow && prev[p.id] ? prev[p.id] : (d || prev[p.id] || '')
}

const data = {
  note: 'Generated by scripts/gen-docs.mjs. Do not edit by hand.',
  packageVersion: pkg.version, appVersion, latestRelease,
  toolCount: TOOLS.length, categoryCount: CATEGORIES.length,
  globalShortcuts, sketchShortcuts, aiModels, aiTools, manifest, ffmpegFiles, testDirs, testFiles, workflows, roadmap, lastUpdated,
}
const json = JSON.stringify(data, null, 2) + '\n'
if (!has(OUT) || rd(OUT) !== json) writeFileSync(join(root, OUT), json)

/* ---------- 8. repo docs ---------- */
const KEY_RE = /^(Ctrl|Shift|Alt|Cmd|Space|Enter|Esc|Del|Backspace|Tab|Home|End|F\d{1,2}|[A-Za-z0-9?'=\-\u2212\[\]\/]{1,2})$/
const keyTok = (x) => (KEY_RE.test(x.trim()) ? `<kbd>${x.trim()}</kbd>` : x.trim())
const sketchKeys = (k) => k.split(' · ').map((part) => part.split(' or ').map((alt) => alt.split(/\s*\+\s*/).map((x) => x.split(' / ').map(keyTok).join(' / ')).join(' + ')).join(' or ')).join(', ')
const toolLink = (slug) => { const t = TOOLS.find((x) => x.slug === slug); return t ? `[${t.name}](https://openfile-studio.vercel.app/${slug})` : slug }
const shortcutsMd = `# Keyboard shortcuts

Generated by \`scripts/gen-docs.mjs\` from the real shortcut tables in \`src/components/Overlays.tsx\` and the Sketch board (\`src/tools/design/_design/sketch/ui.tsx\`). Do not edit by hand. In the app, press <kbd>?</kbd> to see the same list, or open [/docs/keyboard-shortcuts](https://openfile-studio.vercel.app/docs/keyboard-shortcuts).

On macOS use <kbd>Cmd</kbd> wherever <kbd>Ctrl</kbd> is listed. Single-key shortcuts are ignored while you type in a field.

## App

${globalShortcuts.map((g) => `### ${g.group}\n\n| Keys | Action |\n| --- | --- |\n${g.items.map((i) => `| ${i.keys.map((k) => (k === 'Drop' ? 'Drag a file' : `<kbd>${k}</kbd>`)).join(i.keys[0] === 'G' ? ' then ' : ' + ')} | ${i.label} |`).join('\n')}`).join('\n\n')}

## Docs

| Keys | Action |
| --- | --- |
| <kbd>/</kbd> | Open docs search |
| <kbd>Up</kbd> <kbd>Down</kbd> | Move through search results |
| <kbd>Enter</kbd> | Open the highlighted result |
| <kbd>Esc</kbd> | Close search or the docs menu |
| <kbd>Left</kbd> <kbd>Right</kbd> | Switch tabs when a tab list has focus |

## Sketch board

${sketchShortcuts.map((g) => `### ${g.group}\n\n| Action | Keys |\n| --- | --- |\n${g.items.map((i) => `| ${i.label} | ${sketchKeys(i.keys)} |`).join('\n')}`).join('\n\n')}
`
writeIfChanged('docs/SHORTCUTS.md', shortcutsMd)

const counts = TOOLS.length ? { tools: TOOLS.length, cats: CATEGORIES.length } : null
const blocks = {
  'ai-models': `| Model | Download | Used by |\n| --- | --- | --- |\n${aiModels.map((m) => `| \`${m.id}\` | ${m.size ?? 'shown in the tool before it downloads'} | ${m.tools.map(toolLink).join(', ') || `shared helper ${m.files.map((f) => `\`${f}\``).join(', ')}, not yet used by a tool`} |`).join('\n')}\n\n${aiTools.length} tools use on-device AI or OCR: ${aiTools.map(toolLink).join(', ')}.`,
  counts: counts ? `OpenFile has **${counts.tools} tools in ${counts.cats} categories**. ${CATEGORIES.map((c) => `${c.name} ${TOOLS.filter((t) => t.category === c.id).length}`).join(', ')}.` : '',
  'share-target': `File types the share sheet can send to OpenFile: ${manifest.shareAccept.map((a) => `\`${a}\``).join(', ')}.\n\nOpen with OpenFile (installed web app, Chrome and Edge on desktop):\n\n${manifest.fileHandlers.map((h) => `- ${h.name}: ${h.exts.join(', ')}`).join('\n')}`,
  ffmpeg: ffmpegFiles.length ? `Self-hosted ffmpeg files in \`public/ffmpeg\`: ${ffmpegFiles.map((f) => `\`${f.name}\` (${(f.bytes / 1048576).toFixed(1)} MB)`).join(', ')}.` : '',
  tests: `${testFiles.length} test files in ${testDirs.length} folders under \`scripts/tests\` (${testDirs.join(', ')}).`,
}
for (const f of ['docs/AI.md', 'docs/TOOL_GUIDE.md', 'docs/ARCHITECTURE.md', 'docs/PRIVACY.md', 'docs/TROUBLESHOOTING.md']) {
  if (!has(f)) continue
  let s = rd(f)
  for (const [name, body] of Object.entries(blocks)) {
    if (!body) continue
    s = s.replace(new RegExp(`(<!-- gen:${name}:start -->)[\\s\\S]*?(<!-- gen:${name}:end -->)`, 'g'), `$1\n${body}\n$2`)
  }
  writeIfChanged(f, s)
}
function writeIfChanged(f, s) { if (!has(f) || rd(f) !== s) writeFileSync(join(root, f), s) }

console.log(`gen-docs: ${TOOLS.length} tools, ${CATEGORIES.length} categories, ${globalShortcuts.reduce((n, g) => n + g.items.length, 0)} app and ${sketchShortcuts.reduce((n, g) => n + g.items.length, 0)} sketch shortcuts, ${aiModels.length} AI models in ${aiTools.length} tools, ${pages.length} docs pages dated${shallow ? ' (shallow clone, kept committed dates)' : ''}`)

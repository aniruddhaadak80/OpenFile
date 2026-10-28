// Slims a web build (dist/) before it is packed into the desktop (Tauri) and mobile (Capacitor) apps.
//  - Tool preview videos (about 80 MB) are not bundled: media/tools/index.json is rewritten to stream them from the
//    public site instead, so previews still play when online and the installers stay smaller. Posters stay local.
//  - The service worker is not needed inside the apps (every file ships in the package); it is left in place
//    because the app code skips registration when it detects Tauri or Capacitor.
// Usage: node scripts/prepare-app-dist.mjs [dist] [remoteBase=https://aniruddhaadak80.github.io/OpenFile/]
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] || 'dist'
const remote = (process.argv[3] || 'https://aniruddhaadak80.github.io/OpenFile/').replace(/\/?$/, '/')
const media = join(dir, 'media', 'tools')
let removed = 0, bytes = 0
if (existsSync(join(media, 'index.json'))) {
  const idx = JSON.parse(readFileSync(join(media, 'index.json'), 'utf8'))
  for (const v of Object.values(idx)) if (v && typeof v === 'object' && typeof v.video === 'string' && !/^https?:/.test(v.video)) v.video = remote + v.video.replace(/^\//, '')
  writeFileSync(join(media, 'index.json'), JSON.stringify(idx))
  for (const f of readdirSync(media)) if (f.endsWith('.mp4')) { bytes += statSync(join(media, f)).size; rmSync(join(media, f)); removed++ }
}
console.log(`prepare-app-dist: ${removed} preview videos (${(bytes / 1048576).toFixed(1)} MB) now stream from ${remote}`)

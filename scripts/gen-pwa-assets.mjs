// Generates the install assets used by the web app manifest, the desktop app and the mobile apps.
//   public/icon-maskable-192.png, public/icon-maskable-512.png  maskable icons with an 80% safe zone
//   public/apple-touch-icon.png                                  180x180 for iOS home screens
//   public/screenshots/wide-*.png, narrow-*.png                  manifest screenshots (richer install sheet)
//   desktop/app-icon.png                                         1024x1024 source for `tauri icon`
//   mobile/resources/*                                           Android launcher icons and splash
// Usage: node scripts/gen-pwa-assets.mjs   (needs sharp, already a dependency of the build)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pub = join(root, 'public')
const out = (p) => { mkdirSync(dirname(p), { recursive: true }); return p }

// the mark from favicon.svg without its rounded black tile, so it can be placed on any background
const MARK = `<defs><linearGradient id="g" x1="8" y1="6" x2="58" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#FFD27A"/><stop offset=".45" stop-color="#FFB224"/><stop offset="1" stop-color="#E08A00"/></linearGradient><radialGradient id="r" cx="32" cy="38" r="14" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#FFB224" stop-opacity=".35"/><stop offset="1" stop-color="#FFB224" stop-opacity="0"/></radialGradient></defs><path d="M22 13h14l10 10v25a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V17a4 4 0 0 1 4-4Z" stroke="url(#g)" stroke-width="2.5" stroke-linejoin="round" fill="none"/><path d="M36 13v8a2 2 0 0 0 2 2h8" stroke="url(#g)" stroke-width="2.5" stroke-linejoin="round" fill="none"/><circle cx="32" cy="38" r="12" fill="url(#r)"/><circle cx="32" cy="38" r="6.5" stroke="url(#g)" stroke-width="3" fill="none"/>`

/** full-bleed black square with the mark scaled to `scale` of the canvas (maskable safe zone is the inner 80% circle) */
const markSquare = (scale, rounded = false) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${rounded ? '<rect width="64" height="64" rx="14" fill="#000"/>' : '<rect width="64" height="64" fill="#000"/>'}<g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${MARK}</g></svg>`
const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out(file))

await png(markSquare(0.62), 192, join(pub, 'icon-maskable-192.png'))
await png(markSquare(0.62), 512, join(pub, 'icon-maskable-512.png'))
await png(markSquare(0.86), 180, join(pub, 'apple-touch-icon.png'))
await png(markSquare(0.9, true), 1024, join(root, 'desktop/app-icon.png'))

// Android launcher icons (legacy + round + adaptive foreground) written straight into the Capacitor project when present
const android = join(root, 'mobile/android/app/src/main/res')
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
for (const [d, s] of Object.entries(dens)) {
  const dir = join(android, `mipmap-${d}`)
  if (!existsSync(join(android))) break
  await png(markSquare(0.8, true), s, join(dir, 'ic_launcher.png'))
  await png(markSquare(0.8, true), s, join(dir, 'ic_launcher_round.png'))
  // adaptive foreground is 108dp with a 72dp visible area: keep the mark inside the middle 60%
  const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(${32 - 32 * 0.58} ${32 - 32 * 0.58}) scale(0.58)">${MARK}</g></svg>`
  await sharp(Buffer.from(fg), { density: 600 }).resize(Math.round(s * 2.25), Math.round(s * 2.25)).png().toFile(out(join(dir, 'ic_launcher_foreground.png')))
}

// Android splash screens and iOS app icon + splash, when the Capacitor projects exist
if (existsSync(android)) {
  const { readdirSync } = await import('node:fs')
  for (const dir of readdirSync(android).filter((d) => d.startsWith('drawable'))) {
    const f = join(android, dir, 'splash.png')
    if (!existsSync(f)) continue
    const meta = await sharp(f).metadata()
    const side = Math.round(Math.min(meta.width, meta.height) * 0.28)
    const mark = await sharp(Buffer.from(markSquare(1))).resize(side, side).png().toBuffer()
    await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: '#000000' } }).composite([{ input: mark, gravity: 'center' }]).png().toFile(f + '.tmp')
    const { renameSync } = await import('node:fs'); renameSync(f + '.tmp', f)
  }
  writeFileSync(join(android, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n')
}
const iosAssets = join(root, 'mobile/ios/App/App/Assets.xcassets')
if (existsSync(iosAssets)) {
  await png(markSquare(0.8), 1024, join(iosAssets, 'AppIcon.appiconset/AppIcon-512@2x.png'))
  const mark = await sharp(Buffer.from(markSquare(1))).resize(640, 640).png().toBuffer()
  for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#000000' } }).composite([{ input: mark, gravity: 'center' }]).png().toFile(out(join(iosAssets, 'Splash.imageset', n)))
  }
}

// ---- manifest screenshots: a drawn picture of the app (header, hero, tool grid), no photos needed ----
const font = "font-family='Inter, Arial, Helvetica, sans-serif'"
const cats = [['PDF', '#F5A524'], ['Image', '#14B8A6'], ['Video', '#22D3EE'], ['Audio', '#10B981'], ['Convert', '#38BDF8'], ['Developer', '#F97316'], ['Data', '#84CC16'], ['AI', '#FFD27A']]
const tools = [['Merge PDF', 0], ['Compress images', 1], ['Trim video', 2], ['Transcribe audio', 3], ['HEIC to JPG', 4], ['JSON formatter', 5], ['CSV to Excel', 6], ['Remove background', 7], ['Sign PDF', 0], ['Resize images', 1], ['Video to GIF', 2], ['Audio cutter', 3]]
function screen(w, h, variant) {
  const narrow = w < h
  const pad = narrow ? 40 : 64
  const cols = narrow ? 2 : 4
  const cardW = (w - pad * 2 - (cols - 1) * 20) / cols
  const cardH = narrow ? 150 : 132
  const heroY = narrow ? 200 : 170
  const title = variant === 0 ? ['Every file tool.', 'One private tab.'] : ['Works offline.', 'Stays private.']
  const gridY = heroY + (narrow ? 330 : 250)
  let cards = ''
  const n = narrow ? 8 : 8
  for (let i = 0; i < n; i++) {
    const tl = tools[(i + variant * 4) % tools.length], c = cats[tl[1]], x = pad + (i % cols) * (cardW + 20), y = gridY + Math.floor(i / cols) * (cardH + 20)
    if (y + cardH > h - 30) break
    cards += `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="18" fill="#0E1116" stroke="#22262D"/>
      <rect x="${x + 20}" y="${y + 20}" width="44" height="44" rx="12" fill="${c[1]}" fill-opacity=".16"/><circle cx="${x + 42}" cy="${y + 42}" r="9" fill="none" stroke="${c[1]}" stroke-width="3"/>
      <text x="${x + 20}" y="${y + 96}" ${font} font-size="${narrow ? 24 : 22}" font-weight="700" fill="#F4F4F5">${tl[0]}</text>
      <text x="${x + 20}" y="${y + 122}" ${font} font-size="16" fill="${c[1]}">${c[0]}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><radialGradient id="glow" cx="${narrow ? 0.5 : 0.3}" cy="0.2" r="0.7"><stop stop-color="#F5A524" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <linearGradient id="t" x1="0" x2="1"><stop stop-color="#FFD27A"/><stop offset=".5" stop-color="#F5A524"/><stop offset="1" stop-color="#14B8A6"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="#000"/><rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g transform="translate(${pad} ${narrow ? 40 : 34}) scale(${narrow ? 0.75 : 0.62})"><rect width="64" height="64" rx="16" fill="#000"/>${MARK}</g>
  <text x="${pad + (narrow ? 60 : 50)}" y="${narrow ? 80 : 66}" ${font} font-size="${narrow ? 30 : 26}" font-weight="700" fill="#F4F4F5">OpenFile</text>
  ${narrow ? '' : `<rect x="${w - pad - 300}" y="34" width="300" height="40" rx="12" fill="#0E1116" stroke="#22262D"/><text x="${w - pad - 280}" y="60" ${font} font-size="16" fill="#9CA3AF">Search tools</text>`}
  <text x="${pad}" y="${heroY}" ${font} font-size="${narrow ? 64 : 64}" font-weight="800" fill="#F4F4F5">${title[0]}</text>
  <text x="${pad}" y="${heroY + (narrow ? 76 : 74)}" ${font} font-size="${narrow ? 64 : 64}" font-weight="800" fill="url(#t)">${title[1]}</text>
  <text x="${pad}" y="${heroY + (narrow ? 140 : 130)}" ${font} font-size="${narrow ? 26 : 24}" fill="#9CA3AF">${narrow ? 'PDF, images, video, audio, code.' : 'PDF, images, video, audio and code tools that run on your device. No uploads.'}</text>
  ${narrow ? `<text x="${pad}" y="${heroY + 176}" ${font} font-size="26" fill="#9CA3AF">No uploads, ever.</text>` : ''}
  <rect x="${pad}" y="${heroY + (narrow ? 210 : 160)}" width="${narrow ? 250 : 210}" height="${narrow ? 64 : 52}" rx="14" fill="#F5A524"/><text x="${pad + (narrow ? 30 : 28)}" y="${heroY + (narrow ? 251 : 193)}" ${font} font-size="${narrow ? 26 : 20}" font-weight="700" fill="#000">${variant === 0 ? 'Browse tools' : 'Install the app'}</text>
  ${cards}
</svg>`
}
for (const [w, h, name] of [[1280, 720, 'wide-1'], [1280, 720, 'wide-2'], [720, 1280, 'narrow-1'], [720, 1280, 'narrow-2']]) {
  await sharp(Buffer.from(screen(w, h, name.endsWith('2') ? 1 : 0))).png({ compressionLevel: 9 }).toFile(out(join(pub, 'screenshots', `${name}.png`)))
}
console.log('[gen-pwa-assets] icons, screenshots and app icons written')

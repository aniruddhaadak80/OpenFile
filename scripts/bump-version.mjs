// Sets one version everywhere the apps read it, so a release never ships mismatched numbers.
//   package.json, package-lock.json, desktop/package.json, desktop/src-tauri/tauri.conf.json, desktop/src-tauri/Cargo.toml,
//   mobile/package.json, Android versionName and versionCode, iOS MARKETING_VERSION and CURRENT_PROJECT_VERSION.
// versionCode is (major*10000 + minor*100 + patch)*100 + 99 for a release (1.2.0 -> 1020099) and + the last number of
// the prerelease for a prerelease (1.3.0-beta.2 -> 1030002), so it always grows: 1.3.0-beta.2 < 1.3.0 < 1.3.1.
// The Android updater refuses an APK whose versionCode is not higher than the installed one.
// Usage: node scripts/bump-version.mjs <x.y.z[-pre]>   |   node scripts/bump-version.mjs --check
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = process.argv[2]
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/

const files = {
  pkg: 'package.json', lock: 'package-lock.json', desktopPkg: 'desktop/package.json', tauri: 'desktop/src-tauri/tauri.conf.json',
  cargo: 'desktop/src-tauri/Cargo.toml', mobilePkg: 'mobile/package.json', gradle: 'mobile/android/app/build.gradle', ios: 'mobile/ios/App/App.xcodeproj/project.pbxproj',
}
const read = (f) => readFileSync(join(root, f), 'utf8')
const write = (f, s) => writeFileSync(join(root, f), s)

function current() {
  const found = {}
  found.pkg = JSON.parse(read(files.pkg)).version
  if (existsSync(join(root, files.lock))) found.lock = JSON.parse(read(files.lock)).version
  found.desktopPkg = JSON.parse(read(files.desktopPkg)).version
  found.tauri = JSON.parse(read(files.tauri)).version
  found.cargo = read(files.cargo).match(/^version\s*=\s*"([^"]+)"/m)?.[1]
  found.mobilePkg = JSON.parse(read(files.mobilePkg)).version
  found.gradle = read(files.gradle).match(/versionName\s+"([^"]+)"/)?.[1]
  found.ios = read(files.ios).match(/MARKETING_VERSION = ([^;]+);/)?.[1]
  return found
}

if (!arg || arg === '--check') {
  const v = current()
  const set = new Set(Object.values(v))
  console.table(v)
  if (set.size !== 1) { console.error('bump-version: versions differ'); process.exit(arg === '--check' ? 1 : 0) }
  console.log(`bump-version: all files at ${[...set][0]}`)
  process.exit(0)
}

const m = arg.replace(/^v/, '').match(SEMVER)
if (!m) { console.error(`bump-version: "${arg}" is not a semantic version like 1.2.0 or 1.3.0-beta.1`); process.exit(1) }
const version = arg.replace(/^v/, '')
const preNum = m[4] ? Math.min(98, +((m[4].match(/(\d+)(?!.*\d)/) || [0, 0])[1])) : 99
const code = (+m[1] * 10000 + +m[2] * 100 + +m[3]) * 100 + preNum

const json = (f, fn) => { const o = JSON.parse(read(f)); fn(o); write(f, JSON.stringify(o, null, 2) + '\n') }
json(files.pkg, (o) => { o.version = version })
if (existsSync(join(root, files.lock))) json(files.lock, (o) => { o.version = version; if (o.packages?.['']) o.packages[''].version = version })
json(files.desktopPkg, (o) => { o.version = version })
json(files.tauri, (o) => { o.version = version })
json(files.mobilePkg, (o) => { o.version = version })
write(files.cargo, read(files.cargo).replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`))
write(files.gradle, read(files.gradle).replace(/versionName\s+"[^"]+"/, `versionName "${version}"`).replace(/versionCode\s+\d+/, `versionCode ${code}`))
write(files.ios, read(files.ios).replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version.replace(/-.*/, '')};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`))
console.log(`bump-version: ${version} (Android versionCode and iOS build ${code})`)
console.log('Next: node scripts/changelog.mjs --write v' + version + ', commit "chore(release): v' + version + '", tag v' + version)

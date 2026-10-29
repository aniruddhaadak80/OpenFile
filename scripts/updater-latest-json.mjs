// Builds the Tauri updater feed (latest.json) for a release from the per-platform fragments the desktop jobs write.
// Fragment format: { "<platform-key>": { "url": "...", "signature": "<contents of the .sig file>" }, ... }
// Usage: node scripts/updater-latest-json.mjs <version> <notes.md> <out.json> fragment1.json [fragment2.json ...]
import { readFileSync, writeFileSync } from 'node:fs'

const [version, notesFile, out, ...frags] = process.argv.slice(2)
if (!version || !out || !frags.length) { console.error('usage: updater-latest-json.mjs <version> <notes.md> <out.json> <fragments...>'); process.exit(2) }
const platforms = {}
for (const f of frags) Object.assign(platforms, JSON.parse(readFileSync(f, 'utf8')))
let notes = ''
try { notes = readFileSync(notesFile, 'utf8').trim() } catch { /* no notes */ }
const feed = { version: version.replace(/^v/, ''), notes, pub_date: new Date().toISOString(), platforms }
writeFileSync(out, JSON.stringify(feed, null, 2) + '\n')
console.log(`latest.json for ${feed.version}: ${Object.keys(platforms).sort().join(', ')}`)

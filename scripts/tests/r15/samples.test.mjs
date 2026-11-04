// Unit tests for the "Try a sample" files of round 15: every sample must be read by the real parser with sensible results.
// Run: node --experimental-strip-types --no-warnings scripts/tests/r15/samples.test.mjs
import assert from 'node:assert/strict'
import * as S from '../../../src/lib/r15/samples.ts'
import * as X from '../../../src/lib/r15/exports.ts'
import * as L from '../../../src/lib/r15/llm.ts'
import Papa from 'papaparse'
import JSZip from 'jszip'

let n = 0
const t = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }
const one = async (id) => { const f = await S.makeSample(id); assert.ok(f.length >= 1, id); for (const x of f) assert.ok(x.size > 200, `${id} ${x.name} too small`); return f }

await t('samples are the same on every call', async () => {
  for (const id of ['whatsapp', 'spotify', 'instagram', 'netflix', 'x', 'youtube', 'location', 'ai-chats', 'gguf']) {
    const [a] = await S.makeSample(id), [b] = await S.makeSample(id)
    assert.equal(Buffer.from(await a.arrayBuffer()).compare(Buffer.from(await b.arrayBuffer())), 0, id)
  }
})
await t('whatsapp sample', async () => {
  const [f] = await one('whatsapp')
  assert.match(f.name, /^WhatsApp Chat with .+\.txt$/)
  const chat = X.parseWhatsApp(await f.text())
  assert.equal(chat.order, 'dmy'); assert.ok(chat.messages.length > 300); assert.ok(chat.system >= 3)
  const st = X.waStats(chat)
  assert.equal(st.people.length, 4); assert.ok(st.topEmoji.length > 0); assert.ok(st.people.some((p) => p.media > 0)); assert.ok(st.people.some((p) => p.deleted > 0))
})
await t('spotify sample', async () => {
  const [f] = await one('spotify')
  const plays = X.parseSpotify(JSON.parse(await f.text()))
  assert.ok(plays.length > 500); assert.ok(plays.some((p) => p.kind === 'podcast')); assert.ok(plays.some((p) => p.skipped))
  const st = X.spotifyStats(plays); assert.equal(st.artists[0].label, 'The Lantern Choir'); assert.ok(st.hours > 5)
})
await t('instagram sample', async () => {
  const fs = await one('instagram')
  assert.deepEqual(fs.map((f) => X.igKind(f.name)), ['followers', 'following'])
  const c = X.compareFollows(X.igUsers(await fs[0].text()), X.igUsers(await fs[1].text()))
  assert.ok(c.notBack.length > 5 && c.fans.length > 5 && c.mutual.length > 20)
})
await t('ai chats sample', async () => {
  const [f] = await one('ai-chats')
  const cs = X.parseChats(await f.text())
  assert.equal(cs.length, 4); assert.ok(cs.every((c) => c.source === 'ChatGPT' && c.messages.length >= 2 && c.messages[0].role === 'user')); assert.ok(cs.every((c) => c.model === 'gpt-4o'))
  assert.ok(X.chatToMarkdown(cs[0]).includes('#'))
})
await t('location sample', async () => {
  const [f] = await one('location')
  const r = X.parseLocation(JSON.parse(await f.text()))
  assert.match(r.format, /Timeline/); assert.ok(r.points.filter((p) => p.kind === 'visit').length > 40); assert.ok(r.points.filter((p) => p.kind === 'path').length > 100)
  assert.ok(X.toGpx(r.points).includes('<trk>'))
})
await t('youtube sample', async () => {
  const [f] = await one('youtube')
  const ws = X.parseYouTubeJson(JSON.parse(await f.text()))
  assert.ok(ws.length > 100); assert.ok(ws.every((w) => w.channel !== 'Unknown or removed')); assert.ok(ws.some((w) => w.music))
  const raw = JSON.parse(await f.text()); assert.ok(raw.length > ws.length, 'ads are skipped')
})
await t('netflix sample', async () => {
  const [f] = await one('netflix')
  const rows = Papa.parse(await f.text(), { skipEmptyLines: true }).data
  const r = X.parseNetflix(rows)
  assert.match(r.format, /ViewingActivity/); assert.ok(r.views.length > 50); assert.ok(r.views.every((v) => !/Trailer/.test(v.title)))
  const st = X.netflixStats(r.views); assert.ok(st.hours > 10); assert.ok(st.films >= 1); assert.ok(st.shows.length >= 3)
})
await t('x sample', async () => {
  const [f] = await one('x')
  const ps = X.parseXArchive(await f.text())
  assert.ok(ps.length > 50); assert.ok(ps.some((p) => p.repost)); assert.ok(ps.some((p) => p.reply)); assert.ok(ps.some((p) => p.tags.length)); assert.ok(ps.every((p) => !isNaN(p.t.getTime())))
})
await t('explorer sample', async () => {
  const [f] = await one('explorer')
  const zip = await JSZip.loadAsync(await f.arrayBuffer())
  const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir)
  assert.equal(X.guessService(paths), 'Discord')
  const lists = X.findRecordLists(JSON.parse(await zip.file('messages/c400000000000000001/messages.json').async('string')))
  assert.ok(lists.length >= 1 && lists[0].count >= 60 && lists[0].first)
})
await t('gguf sample', async () => {
  const [f] = await one('gguf')
  const head = new Uint8Array(await f.slice(0, 16).arrayBuffer())
  assert.equal(L.sniffModel(head), 'gguf')
  const info = L.parseGguf(await f.arrayBuffer())
  assert.equal(info.summary.Architecture, 'llama'); assert.equal(info.summary.Quantization, 'Q4_K_M'); assert.equal(info.summary.Layers, '22'); assert.equal(info.summary.Vocabulary, '32000')
  assert.ok(info.params > 1.0e9 && info.params < 1.2e9, String(info.params)); assert.equal(info.tensors.length, 22 * 9 + 3); assert.equal(info.summary['Chat template'], 'yes')
})
console.log(`samples: ${n} tests passed`)

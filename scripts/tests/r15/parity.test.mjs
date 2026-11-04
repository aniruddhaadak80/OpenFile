// Parity tests for the AI Builder and Data Exports studios: workspace recipes, smart drop, guides and the docs model scan.
// Run: node --no-warnings scripts/tests/r15/parity.test.mjs   (uses Vite's module runner for the @/ imports)
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const { runnerImport } = await import('vite')
const cfg = { configFile: false, logLevel: 'silent', resolve: { alias: { '@': join(root, 'src') } } }
const load = async (p) => (await runnerImport(join(root, p), cfg)).module

let n = 0
const t = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }
const reg = await load('src/tools/registry.ts')
const NEW = reg.TOOLS.filter((x) => x.category === 'llm' || x.category === 'exports')

await t('18 tools in the two studios', () => assert.equal(NEW.length, 18))
await t('workspace recipes for the new studios are valid and ship media and samples', async () => {
  const { BUILTINS, SAMPLE_FILES, builtinRecipe } = await load('src/pages/workspace/recipes.ts')
  const { validateRecipe } = await load('src/pages/workspace/recipe.ts')
  const { metaOf, kindOf } = await load('src/pages/workspace/catalog.ts')
  for (const id of ['llm-chunk', 'llm-tokens', 'chat-to-csv']) assert.ok(metaOf(id), id)
  assert.equal(kindOf('train.jsonl'), 'text')
  for (const id of ['rag-ready', 'chat-table']) {
    const b = BUILTINS.find((x) => x.id === id); assert.ok(b, id)
    const v = validateRecipe(builtinRecipe(b)); assert.ok(v.ok !== false && !(v.errors?.length), id + ' ' + JSON.stringify(v.errors ?? v))
    for (const s of b.samples) { assert.ok(SAMPLE_FILES.includes(s), s); assert.ok(existsSync(join(root, 'public/media/workspace/samples', s)), s) }
    for (const ext of ['mp4', 'jpg']) assert.ok(existsSync(join(root, `public/media/workspace/${id}.${ext}`)), `${id}.${ext}`)
  }
})
await t('chat sample for the workspace parses as a WhatsApp chat', async () => {
  const X = await load('src/lib/r15/exports.ts')
  const c = X.parseWhatsApp(readFileSync(join(root, 'public/media/workspace/samples/chat.txt'), 'utf8'))
  assert.equal(c.order, 'dmy'); assert.ok(c.messages.length >= 150); assert.ok(c.system >= 2)
  const L = await load('src/lib/r15/llm.ts')
  const md = readFileSync(join(root, 'public/media/workspace/samples/handbook.md'), 'utf8')
  const ch = L.chunkText(md, { size: 120, overlap: 20, measure: L.estimateTokens, separators: L.SPLITTERS.markdown })
  assert.ok(ch.length >= 3); for (const c of ch) assert.equal(md.slice(c.start, c.end), c.text)
})
await t('smart drop knows the new formats', async () => {
  const D = await load('src/lib/detect.ts')
  const H = await load('src/lib/handoff.ts')
  const S = await load('src/lib/r15/samples.ts')
  const [g] = S.sampleGguf()
  assert.equal(D.sniff(new Uint8Array(await g.slice(0, 4100).arrayBuffer()), 'GGUF'), 'GGUF')
  const enc = new TextEncoder()
  assert.equal(D.sniff(enc.encode('{"messages":[{"role":"user","content":"hi"}]}\n{"messages":[]}\n'), 'JSONL'), 'JSONL')
  assert.equal(D.sniff(enc.encode('{"a":1}'), 'JSON'), 'JSON')
  const st = new Uint8Array(40); st[0] = 20; st.set(enc.encode('{"__metadata__":{}}'), 8)
  assert.equal(D.sniff(st, 'SAFETENSORS'), 'SAFETENSORS')
  const fit = new Uint8Array(20); fit[0] = 14; fit.set(enc.encode('.FIT'), 8)
  assert.equal(D.sniff(fit, 'FIT'), 'FIT')
  assert.equal(D.formatLabel('GGUF'), 'GGUF model')
  const f = (name) => new File(['x'], name)
  assert.deepEqual(H.suggestFor(f('model.Q4_K_M.gguf')), ['model-file-inspector'])
  assert.equal(H.suggestFor(f('WhatsApp Chat with Mum.txt'))[0], 'whatsapp-chat-analyzer')
  assert.equal(H.suggestFor(f('conversations.json'))[0], 'ai-chat-export-viewer')
  assert.equal(H.suggestFor(f('watch-history.html'))[0], 'youtube-history-stats')
  assert.equal(H.suggestFor(f('train.jsonl'))[0], 'finetune-dataset-checker')
  assert.equal(H.suggestFor(f('statement.ofx'))[0], 'bank-statement-converter')
  for (const slug of ['model-file-inspector', 'whatsapp-chat-analyzer', 'ai-chat-export-viewer', 'youtube-history-stats', 'finetune-dataset-checker']) assert.ok(reg.toolBySlug(slug), slug)
  assert.equal(D.toolsForFormat('GGUF', f('m.gguf'))[0].slug, 'model-file-inspector')
})
await t('guides: FAQs, engines and links into the new studios', async () => {
  const G = await load('src/tools/guides.ts')
  const { ENGINES } = await load('src/tools/engines.ts')
  for (const tool of NEW) {
    const g = G.toolGuide(tool)
    assert.ok(g.faq.length >= 5, tool.slug + ' faq'); assert.ok(ENGINES[tool.slug], tool.slug + ' engines')
    for (const e of ENGINES[tool.slug]) assert.ok(G.ENGINE_INFO[e], e)
    for (const f of g.faq) { assert.ok(!/[\u2013\u2014!]/.test(f.q + f.a), tool.slug + ': ' + f.q) }
  }
  assert.ok(G.toolGuide(reg.toolBySlug('token-counter')).firstUse.includes('tokenizer'))
  const into = reg.TOOLS.filter((x) => x.category !== 'llm' && x.category !== 'exports').filter((x) => G.toolGuide(x).related.some((r) => r.category === 'llm' || r.category === 'exports'))
  assert.ok(into.length >= 20, `only ${into.length} older tools link to the new studios`)
})
await t('docs model scan: export tools do not claim AI models', () => {
  const gen = JSON.parse(readFileSync(join(root, 'src/pages/docs/generated.json'), 'utf8'))
  const exportsSlugs = NEW.filter((x) => x.category === 'exports').map((x) => x.slug)
  for (const m of gen.aiModels) for (const s of exportsSlugs) assert.ok(!m.tools.includes(s), `${m.id} lists ${s}`)
  const gpt = gen.aiModels.find((m) => m.id === 'Xenova/gpt-4o'); assert.ok(gpt.tools.includes('token-counter'))
  const depth = gen.aiModels.find((m) => m.id === 'onnx-community/depth-anything-v2-small'); assert.deepEqual(depth.tools, ['depth-map'])
})
console.log(`r15 parity: ${n} tests passed`)
process.exit(0)

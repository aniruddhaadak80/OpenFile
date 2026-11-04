// Unit tests for round 15: AI Builder (src/lib/r15/llm.ts) and Data Exports (src/lib/r15/exports.ts).
// Run: node --experimental-strip-types --no-warnings scripts/tests/r15/r15.test.mjs
import assert from 'node:assert/strict'
import * as L from '../../../src/lib/r15/llm.ts'
import * as X from '../../../src/lib/r15/exports.ts'

let n = 0
const t = (name, fn) => { try { fn(); n++ } catch (e) { console.error('FAIL', name); throw e } }

/* ---------- tokens and chunks ---------- */
t('estimate tokens', () => {
  assert.equal(L.estimateTokens(''), 0)
  const e = L.estimateTokens('The quick brown fox jumps over the lazy dog.')
  assert.ok(e >= 9 && e <= 14, String(e))
  assert.equal(L.estimateTokens('你好世界'), 4)
})
t('chunks are exact substrings, sized and ordered', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about a topic. `).join('') + '\n\n' + 'Another paragraph here. '.repeat(20)
  const ch = L.chunkText(text, { size: 200, overlap: 40 })
  assert.ok(ch.length > 5)
  for (const c of ch) { assert.equal(text.slice(c.start, c.end), c.text); assert.ok(c.size <= 200, `${c.size}`) }
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].start >= ch[i - 1].start)
  assert.ok(ch.some((c, i) => i && c.start < ch[i - 1].end), 'overlap present')
  const no = L.chunkText(text, { size: 200, overlap: 0 })
  for (let i = 1; i < no.length; i++) assert.ok(no[i].start >= no[i - 1].end)
})
t('chunk hard cut when no separator', () => {
  const ch = L.chunkText('x'.repeat(1050), { size: 100 })
  assert.equal(ch.length, 11); assert.equal(ch.map((c) => c.text).join(''), 'x'.repeat(1050))
})
t('markdown splitter keeps headings at chunk starts', () => {
  const md = '# Title\nIntro text.\n## One\n' + 'a b c d e. '.repeat(10) + '\n## Two\n' + 'f g h i j. '.repeat(10)
  const ch = L.chunkText(md, { size: 140, separators: L.SPLITTERS.markdown })
  assert.ok(ch.some((c) => c.text.startsWith('## Two')))
})
t('word measure', () => {
  const ch = L.chunkText('one two three four five six seven eight nine ten', { size: 4, measure: L.countWords })
  assert.ok(ch.every((c) => L.countWords(c.text) <= 4)); assert.equal(ch.length, 3)
})

/* ---------- datasets ---------- */
const DS = [
  JSON.stringify({ messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello.' }] }),
  JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
  '{bad json',
  JSON.stringify({ messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello.' }] }),
  JSON.stringify({ messages: [{ role: 'robot', content: 'x' }, { role: 'assistant', content: '' }] }),
  '',
  JSON.stringify({ instruction: 'Add 2 and 2', input: '', output: '4' }),
].join('\n')
t('dataset check finds each problem with its line', () => {
  const r = L.checkDataset(DS)
  assert.equal(r.rows, 6); assert.equal(r.valid, 3); assert.equal(r.duplicates, 1); assert.equal(r.format, 'chat')
  const at = (line) => r.issues.filter((i) => i.line === line).map((i) => i.msg).join(' | ')
  assert.match(at(2), /No assistant message/)
  assert.match(at(3), /Not valid JSON/)
  assert.match(at(4), /Same as line 1/)
  assert.match(at(5), /role "robot"/); assert.match(at(5), /no content/)
  assert.equal(r.formats.alpaca, 1)
})
t('token limit flags rows', () => { const r = L.checkDataset(DS, () => 5000, 4096); assert.ok(r.issues.some((i) => /over the 4096 limit/.test(i.msg))) })
t('dpo and sharegpt detection', () => {
  assert.equal(L.detectRow({ prompt: 'p', chosen: 'a', rejected: 'b' }), 'dpo')
  assert.equal(L.detectRow({ conversations: [{ from: 'human', value: 'x' }] }), 'sharegpt')
  assert.deepEqual(L.checkRow({ input: { messages: [{ role: 'user', content: 'q' }] }, preferred_output: [{ role: 'assistant', content: 'same' }], non_preferred_output: [{ role: 'assistant', content: 'same' }] }).warns, ['Preferred and rejected replies are the same.'])
})
t('split is seeded and complete', () => {
  const a = Array.from({ length: 100 }, (_, i) => i)
  const s1 = L.splitTrainVal(a, 0.1, 7), s2 = L.splitTrainVal(a, 0.1, 7)
  assert.equal(s1.val.length, 10); assert.equal(s1.train.length, 90); assert.deepEqual(s1.val, s2.val)
  assert.deepEqual([...s1.train, ...s1.val].sort((x, y) => x - y), a)
})
t('convert between formats', () => {
  const c = L.toConv({ conversations: [{ from: 'system', value: 'S' }, { from: 'human', value: 'Q' }, { from: 'gpt', value: 'A' }] })
  assert.deepEqual(L.fromConv(c, 'chat'), { messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }] })
  assert.deepEqual(L.fromConv(c, 'alpaca'), { instruction: 'Q', input: '', output: 'A', system: 'S' })
  assert.deepEqual(L.fromConv(L.toConv({ prompt: 'P', completion: 'C' }), 'sharegpt', 'Sys'), { conversations: [{ from: 'system', value: 'Sys' }, { from: 'human', value: 'P' }, { from: 'gpt', value: 'C' }] })
  const cs = L.csvToConvs([['q', 'a'], ['hi', 'hello'], ['', '']], { user: 0, assistant: 1 })
  assert.equal(cs.length, 1); assert.equal(cs[0].turns[1].content, 'hello')
})

/* ---------- model files ---------- */
function gguf() {
  const parts = []; const enc = new TextEncoder()
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); parts.push(b) }
  const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); parts.push(b) }
  const str = (s) => { const e = enc.encode(s); u64(e.length); parts.push(Buffer.from(e)) }
  parts.push(Buffer.from('GGUF')); u32(3); u64(2); u64(5)
  str('general.architecture'); u32(8); str('llama')
  str('general.name'); u32(8); str('Tiny Test')
  str('general.file_type'); u32(4); u32(15)
  str('llama.context_length'); u32(4); u32(8192)
  str('tokenizer.ggml.tokens'); u32(9); u32(8); u64(20); for (let i = 0; i < 20; i++) str('tok' + i)
  str('token_embd.weight'); u32(2); u64(64); u64(20); u32(12); u64(0)
  str('output.weight'); u32(2); u64(64); u64(20); u32(14); u64(4096)
  return new Uint8Array(Buffer.concat(parts)).buffer
}
t('gguf header', () => {
  const g = gguf()
  const m = L.parseGguf(g)
  assert.equal(m.version, 3); assert.equal(m.tensors.length, 2); assert.equal(m.params, 2560)
  assert.equal(m.summary.Quantization, 'Q4_K_M'); assert.equal(m.summary['Context length'], '8192'); assert.equal(m.summary.Vocabulary, '20')
  assert.equal(m.tensors[0].dtype, 'Q4_K'); assert.equal(m.meta['tokenizer.ggml.tokens'].items.length, 16)
  assert.equal(L.sniffModel(new Uint8Array(g.slice(0, 16))), 'gguf')
  assert.throws(() => L.parseGguf(g.slice(0, 60)), (e) => e instanceof L.NeedMore)
  assert.throws(() => L.parseGguf(new TextEncoder().encode('NOPE....').buffer), /not a GGUF/)
})
t('safetensors header', () => {
  const head = JSON.stringify({ __metadata__: { format: 'pt' }, 'a.weight': { dtype: 'F16', shape: [4, 8], data_offsets: [0, 64] }, 'b.bias': { dtype: 'F32', shape: [8], data_offsets: [64, 96] } })
  const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(head.length))
  const buf = new Uint8Array(Buffer.concat([b, Buffer.from(head), Buffer.alloc(96)])).buffer
  const m = L.parseSafetensors(buf)
  assert.equal(m.params, 40); assert.equal(m.summary['Weights size'], '96 B'); assert.equal(L.sniffModel(new Uint8Array(buf.slice(0, 16))), 'safetensors')
})

/* ---------- templates ---------- */
t('template vars and fill', () => {
  const tpl = 'Hi {{ name }}, write about {{topic|cats}} in {{ name }} style.'
  assert.deepEqual(L.findVars(tpl), [{ name: 'name', def: '' }, { name: 'topic', def: 'cats' }])
  assert.equal(L.fillTemplate(tpl, { name: 'Ann' }), 'Hi Ann, write about cats in Ann style.')
  assert.equal(L.detectStyle('Use ${x} and ${y}'), 'dollar')
  assert.deepEqual(L.findVars('Use {a} and {b} but not {{c}}', 'single').map((v) => v.name), ['a', 'b'])
  assert.equal(L.fillTemplate('{a} {b}', { a: '1' }, 'single', false), '1 ')
})

/* ---------- MCP ---------- */
const SV = [{ name: 'files', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/me'], env: { GITHUB_TOKEN: 'ghp_abc' } }, { name: 'docs', transport: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer x' } }]
t('mcp build for each app', () => {
  const cd = JSON.parse(L.buildMcp(SV, 'claude-desktop'))
  assert.equal(cd.mcpServers.files.command, 'npx'); assert.deepEqual(cd.mcpServers.docs.args.slice(0, 3), ['-y', 'mcp-remote', 'https://mcp.example.com/mcp'])
  const vs = JSON.parse(L.buildMcp(SV, 'vscode', { inputs: true }))
  assert.equal(vs.servers.files.type, 'stdio'); assert.equal(vs.servers.files.env.GITHUB_TOKEN, '${input:github-token}'); assert.equal(vs.inputs[0].password, true); assert.equal(vs.servers.docs.type, 'http')
  assert.equal(JSON.parse(L.buildMcp(SV, 'windsurf')).mcpServers.docs.serverUrl, 'https://mcp.example.com/mcp')
  assert.equal(JSON.parse(L.buildMcp(SV, 'gemini')).mcpServers.docs.httpUrl, 'https://mcp.example.com/mcp')
  const cli = L.buildMcp(SV, 'claude-code', { inputs: false })
  assert.match(cli, /^claude mcp add --transport stdio files --env GITHUB_TOKEN=ghp_abc -- npx -y @modelcontextprotocol\/server-filesystem \/home\/me$/m)
  assert.match(cli, /--transport http docs https:\/\/mcp.example.com\/mcp --header 'Authorization: Bearer x'/)
})
t('mcp parse round trip and warnings', () => {
  for (const tg of ['claude-desktop', 'cursor', 'vscode', 'windsurf', 'claude-code', 'gemini']) {
    const back = L.parseMcp(L.buildMcp(SV, tg))
    assert.equal(back.length, 2, tg); assert.equal(back.find((s) => s.name === 'docs').url, 'https://mcp.example.com/mcp', tg)
  }
  assert.deepEqual(L.shellSplit(`npx -y "my server" '/a b/c'`), ['npx', '-y', 'my server', '/a b/c'])
  const w = L.mcpWarnings([...SV, { name: 'x', transport: 'stdio', command: 'npx', args: ['./srv.js'] }, { name: 'y', transport: 'http', url: 'http://example.com' }])
  assert.ok(w.some((s) => /GITHUB_TOKEN holds a secret/.test(s))); assert.ok(w.some((s) => /add -y/.test(s))); assert.ok(w.some((s) => /relative path/.test(s))); assert.ok(w.some((s) => /plain http/.test(s)))
})

/* ---------- embeddings ---------- */
t('cosine, pca, pairs', () => {
  assert.equal(Math.round(L.cosine([1, 0], [1, 0]) * 1000), 1000)
  const v = [[1, 0, 0], [0.9, 0.1, 0], [0, 1, 0], [0, 0.9, 0.1]]
  const p = L.pca2(v); assert.equal(p.length, 4)
  const d = (a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1])
  assert.ok(d(0, 1) < d(0, 2))
  const tp = L.topPairs(['a', 'b', 'c', 'd'], L.simMatrix(v), 2).map((x) => `${x.a}${x.b}`).sort(); assert.deepEqual(tp, ['01', '23'])
  assert.deepEqual(L.topPairs(['a', 'b', 'c', 'd'], L.simMatrix(v), 1, true).map((x) => `${x.a}${x.b}`), ['02'])
})

/* ---------- streams ---------- */
t('openai chat stream with tool call', () => {
  const s = [
    'data: {"id":"1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":"Hel"}}]}',
    'data: {"id":"1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"lo"}}]}',
    'data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":"{\\"ci"}}]}}]}',
    'data: {"id":"1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ty\\":\\"Pune\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":12,"completion_tokens":7,"total_tokens":19}}',
    'data: [DONE]'].join('\n\n')
  const r = L.readStream(s)
  assert.equal(r.text, 'Hello'); assert.equal(r.tools[0].name, 'get_weather'); assert.equal(r.tools[0].args, '{"city":"Pune"}'); assert.equal(r.usage.total, 19); assert.equal(r.stop, 'tool_calls'); assert.equal(r.model, 'gpt-4o-mini')
})
t('anthropic stream', () => {
  const s = [
    'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-4-5","usage":{"input_tokens":25,"output_tokens":1}}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi there"}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"search"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"q\\":1}"}}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":15}}',
    'event: message_stop\ndata: {"type":"message_stop"}'].join('\n\n')
  const r = L.readStream(s)
  assert.equal(r.provider, 'Anthropic Messages'); assert.equal(r.text, 'Hi there'); assert.equal(r.tools[0].args, '{"q":1}'); assert.deepEqual([r.usage.input, r.usage.output, r.usage.total], [25, 15, 40]); assert.equal(r.stop, 'tool_use')
})
t('responses api, gemini, ollama, plain json', () => {
  const resp = L.readStream('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Ok"}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"model":"gpt-5","status":"completed","usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}}')
  assert.equal(resp.text, 'Ok'); assert.equal(resp.usage.total, 5); assert.equal(resp.provider, 'OpenAI Responses')
  const gem = L.readStream('data: {"candidates":[{"content":{"parts":[{"text":"A"}]}}]}\n\ndata: {"candidates":[{"content":{"parts":[{"text":"B"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2,"totalTokenCount":6},"modelVersion":"gemini-2.5-flash"}')
  assert.equal(gem.text, 'AB'); assert.equal(gem.usage.total, 6); assert.equal(gem.stop, 'STOP')
  const ol = L.readStream('{"model":"llama3","message":{"content":"x"},"done":false}\n{"model":"llama3","message":{"content":"y"},"done":true,"done_reason":"stop","prompt_eval_count":5,"eval_count":2}')
  assert.equal(ol.text, 'xy'); assert.equal(ol.usage.total, 7)
  const an = L.readStream('{"type":"message","model":"claude","content":[{"type":"text","text":"Yo"},{"type":"tool_use","id":"a","name":"f","input":{"k":2}}],"stop_reason":"end_turn","usage":{"input_tokens":1,"output_tokens":2}}')
  assert.equal(an.text, 'Yo'); assert.equal(an.tools[0].args, '{"k":2}')
  assert.ok(L.readStream('').errors.length)
})

/* ---------- WhatsApp ---------- */
t('whatsapp android 12h month first', () => {
  const txt = ['12/31/23, 9:15\u202fPM - Messages and calls are end-to-end encrypted.', '12/31/23, 9:15\u202fPM - Ann: Happy new year 🎉🎉', '12/31/23, 9:20\u202fPM - Bob: Same to you', 'second line', '1/1/24, 12:05\u202fAM - Ann: <Media omitted>', '1/13/24, 10:00\u202fAM - Bob: This message was deleted'].join('\n')
  const c = X.parseWhatsApp(txt)
  assert.equal(c.order, 'mdy'); assert.equal(c.messages.length, 4); assert.equal(c.system, 1)
  assert.equal(c.messages[1].text, 'Same to you\nsecond line'); assert.equal(c.messages[2].t.getHours(), 0); assert.ok(c.messages[2].media); assert.ok(c.messages[3].deleted)
  assert.equal(c.messages[0].t.getHours(), 21)
  const s = X.waStats(c)
  assert.equal(s.people[0].messages, 2); assert.equal(s.topEmoji[0].label, '🎉'); assert.equal(s.topEmoji[0].value, 2); assert.equal(s.people.find((p) => p.who === 'Bob').medianReplyMin, 5)
})
t('whatsapp iphone 24h day first', () => {
  const txt = ['[25/12/2023, 08:01:02] Ann: Morning', '[25/12/2023, 08:03:00] \u200eBob: \u200eimage omitted', '[26/12/2023, 19:00:00] Ann: Bye'].join('\n')
  const c = X.parseWhatsApp(txt)
  assert.equal(c.order, 'dmy'); assert.equal(c.messages.length, 3); assert.equal(c.messages[1].who, 'Bob'); assert.ok(c.messages[1].media)
  assert.equal(c.messages[2].t.getDate(), 26); assert.equal(X.waStats(c).streak, 2)
})

/* ---------- Spotify ---------- */
t('spotify both formats', () => {
  const ext = [{ ts: '2024-03-01T10:00:00Z', ms_played: 200000, master_metadata_track_name: 'Song A', master_metadata_album_artist_name: 'Artist 1', master_metadata_album_album_name: 'Album', reason_end: 'trackdone', skipped: false },
    { ts: '2024-03-01T10:04:00Z', ms_played: 5000, master_metadata_track_name: 'Song B', master_metadata_album_artist_name: 'Artist 2', reason_end: 'fwdbtn', skipped: true },
    { ts: '2024-04-02T10:00:00Z', ms_played: 600000, master_metadata_track_name: null, episode_name: 'Ep 1', episode_show_name: 'Pod' }]
  const acc = [{ endTime: '2024-05-01 08:00', artistName: 'Artist 1', trackName: 'Song A', msPlayed: 100000 }]
  const p = X.parseSpotify([...ext, ...acc])
  assert.equal(p.length, 4)
  const s = X.spotifyStats(p)
  assert.equal(s.plays, 3); assert.equal(s.artists[0].label, 'Artist 1'); assert.equal(s.shows[0].label, 'Pod'); assert.equal(s.skipRate, 50); assert.equal(s.months.length, 3); assert.ok(s.extended)
  assert.equal(X.spotifyStats(p, { by: 'plays' }).tracks[0].value, 2)
})

/* ---------- Instagram ---------- */
t('instagram followers json old and new and html', () => {
  const followers = JSON.stringify([{ title: '', string_list_data: [{ href: 'https://www.instagram.com/ann', value: 'ann', timestamp: 1700000000 }] }, { title: '', string_list_data: [{ href: 'https://www.instagram.com/cat', value: 'cat', timestamp: 1700000000 }] }])
  const following = JSON.stringify({ relationships_following: [{ title: 'ann', string_list_data: [{ href: 'https://www.instagram.com/_u/ann', timestamp: 1700000000 }] }, { title: 'bob', string_list_data: [{ href: 'https://www.instagram.com/_u/bob', timestamp: 1700000000 }] }] })
  const c = X.compareFollows(X.igUsers(followers), X.igUsers(following))
  assert.deepEqual(c.notBack.map((u) => u.user), ['bob']); assert.deepEqual(c.fans.map((u) => u.user), ['cat']); assert.deepEqual(c.mutual.map((u) => u.user), ['ann'])
  const html = '<div><a target="_blank" href="https://www.instagram.com/dan">dan</a></div><div><a href="https://www.instagram.com/eve/">eve</a></div>'
  assert.deepEqual(X.igUsers(html).map((u) => u.user), ['dan', 'eve'])
  assert.equal(X.igKind('connections/followers_and_following/followers_1.json'), 'followers'); assert.equal(X.igKind('x/following.html'), 'following'); assert.equal(X.igKind('x/blocked.json'), null)
})

/* ---------- ChatGPT / Claude ---------- */
t('chatgpt tree follows current node', () => {
  const conv = [{ title: 'Trip', create_time: 1700000000, update_time: 1700000500, current_node: 'c', mapping: {
    r: { id: 'r', message: null, parent: null, children: ['s'] },
    s: { id: 's', message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } }, parent: 'r', children: ['u'] },
    u: { id: 'u', message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['Plan a trip'] }, create_time: 1700000001 }, parent: 's', children: ['a', 'c'] },
    a: { id: 'a', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['old answer'] } }, parent: 'u', children: [] },
    c: { id: 'c', message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['New answer'] }, metadata: { model_slug: 'gpt-4o' } }, parent: 'u', children: [] } } }]
  const [c] = X.parseChats(JSON.stringify(conv))
  assert.equal(c.messages.length, 2); assert.equal(c.messages[1].text, 'New answer'); assert.equal(c.model, 'gpt-4o')
  assert.match(X.chatToMarkdown(c), /^# Trip\n\nChatGPT · gpt-4o/)
})
t('claude export', () => {
  const [c] = X.parseChats(JSON.stringify([{ uuid: 'u1', name: 'Code help', created_at: '2025-01-02T03:04:05Z', updated_at: '2025-01-02T03:10:00Z', chat_messages: [{ sender: 'human', text: 'Fix this', attachments: [{ file_name: 'a.py' }] }, { sender: 'assistant', text: '', content: [{ type: 'text', text: 'Done.' }] }] }]))
  assert.equal(c.source, 'Claude'); assert.equal(c.messages[0].text, 'Fix this\n\n[files: a.py]'); assert.equal(c.messages[1].text, 'Done.')
  assert.equal(X.safeName('a/b:c?'), 'a b c')
})

/* ---------- location ---------- */
t('location formats', () => {
  const rec = X.parseLocation({ locations: [{ latitudeE7: 185204000, longitudeE7: 738567000, timestamp: '2024-01-01T10:00:00Z' }, { latitudeE7: 185304000, longitudeE7: 738567000, timestamp: '2024-01-01T10:10:00Z' }] })
  assert.equal(rec.points.length, 2)
  const st = X.locStats(rec.points); assert.equal(st.totalKm, 1); assert.equal(st.days, 1)
  const dev = X.parseLocation({ semanticSegments: [{ startTime: '2024-02-01T09:00:00.000+05:30', endTime: '2024-02-01T10:00:00.000+05:30', visit: { topCandidate: { semanticType: 'HOME', placeLocation: { latLng: '18.5204°, 73.8567°' } } } }, { startTime: '2024-02-01T10:00:00.000+05:30', timelinePath: [{ point: '18.52°, 73.85°', time: '2024-02-01T10:05:00.000+05:30' }] }] })
  assert.equal(dev.points.length, 2); assert.equal(dev.points[0].kind, 'visit')
  const ios = X.parseLocation([{ startTime: '2024-03-01T09:00:00Z', endTime: '2024-03-01T09:30:00Z', visit: { topCandidate: { placeLocation: 'geo:18.52,73.85' } } }])
  assert.equal(ios.points[0].lat, 18.52)
  const sem = X.parseLocation({ timelineObjects: [{ placeVisit: { location: { latitudeE7: 185204000, longitudeE7: 738567000, name: 'Cafe' }, duration: { startTimestamp: '2022-01-01T10:00:00Z', endTimestamp: '2022-01-01T11:00:00Z' } } }] })
  assert.equal(sem.points[0].name, 'Cafe')
  const gpx = X.toGpx(rec.points); assert.match(gpx, /<trkpt lat="18.5204000" lon="73.8567000"><time>2024-01-01T10:00:00.000Z/)
  assert.match(X.toKml([...rec.points, ...sem.points]), /<name>Cafe<\/name>/)
  assert.equal(JSON.parse(X.toGeoJson(rec.points)).features.length, 2)
  assert.throws(() => X.parseLocation({ foo: 1 }), /not a Google location history/)
})

/* ---------- YouTube ---------- */
t('youtube json and html', () => {
  const j = X.parseYouTubeJson([{ header: 'YouTube', title: 'Watched How GPS works', titleUrl: 'https://www.youtube.com/watch?v=1', subtitles: [{ name: 'Science Ch' }], time: '2024-01-01T10:00:00Z' }, { header: 'YouTube', title: 'Watched Ad', titleUrl: 'https://www.youtube.com/watch?v=2', time: '2024-01-01T10:00:00Z', details: [{ name: 'From Google Ads' }] }])
  assert.equal(j.length, 1); assert.equal(j[0].title, 'How GPS works'); assert.equal(j[0].channel, 'Science Ch')
  const html = '<div class="outer-cell mdl-cell"><div class="mdl-grid"><div class="header-cell"><p class="mdl-typography--title">YouTube<br></p></div><div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">Watched\u00a0<a href="https://www.youtube.com/watch?v=abc">Rust &amp; WASM</a><br><a href="https://www.youtube.com/channel/UC1">Dev Talks</a><br>Mar 5, 2024, 7:30:00\u202fPM IST<br></div></div></div>'
  const h = X.parseYouTubeHtml(html)
  assert.equal(h.length, 1); assert.equal(h[0].title, 'Rust & WASM'); assert.equal(h[0].channel, 'Dev Talks'); assert.equal(h[0].t.getHours(), 19)
  assert.equal(X.watchStats([...j, ...h]).uniqueChannels, 2)
})

/* ---------- Netflix ---------- */
t('netflix both csvs', () => {
  const full = [['Profile Name', 'Start Time', 'Duration', 'Attributes', 'Title', 'Supplemental Video Type', 'Device Type', 'Bookmark', 'Latest Bookmark', 'Country'],
    ['Ann', '2024-01-01 20:00:00', '00:45:00', '', 'Dark: Season 1: Secrets (Episode 1)', '', 'TV', '00:45:00', '00:45:00', 'IN'],
    ['Ann', '2024-01-01 20:50:00', '00:50:00', '', 'Dark: Season 1: Lies (Episode 2)', '', 'TV', '', '', 'IN'],
    ['Ann', '2024-01-01 21:45:00', '00:01:00', '', 'Dark: Season 2 (Trailer)', 'TRAILER', 'TV', '', '', 'IN'],
    ['Ann', '2024-01-02 21:45:00', '01:30:00', '', 'Glass Onion', '', 'Phone', '', '', 'IN']]
  const a = X.parseNetflix(full)
  assert.equal(a.views.length, 3)
  const s = X.netflixStats(a.views)
  assert.equal(s.hours, 3.1); assert.equal(s.shows[0].label, 'Dark'); assert.equal(s.films, 1); assert.equal(s.showHours[0].value, 1.6)
  const short = [['Title', 'Date'], ['Dark: Season 1: Secrets', '13/01/2024'], ['Glass Onion', '14/01/2024']]
  assert.equal(X.netflixOrder(short), 'dmy')
  const b = X.parseNetflix(short, 'dmy'); assert.equal(b.views[0].t.getMonth(), 0); assert.equal(b.views[0].show, 'Dark')
  assert.throws(() => X.parseNetflix([['a', 'b']]), /not a Netflix/)
})

/* ---------- X archive ---------- */
t('x archive tweets.js', () => {
  const js = 'window.YTD.tweets.part0 = ' + JSON.stringify([{ tweet: { id_str: '1', created_at: 'Wed Oct 10 20:19:24 +0000 2018', full_text: 'Learning #rust today with @ann https://t.co/x', favorite_count: '5', retweet_count: '1', entities: { hashtags: [{ text: 'rust' }], user_mentions: [{ screen_name: 'ann' }], urls: [{ expanded_url: 'https://www.rust-lang.org/learn' }] } } }, { tweet: { id_str: '2', created_at: 'Thu Oct 11 08:00:00 +0000 2018', full_text: 'RT @bob: hello &amp; welcome', favorite_count: '0', retweet_count: '3', entities: {} } }])
  const p = X.parseXArchive(js)
  assert.equal(p.length, 2); assert.equal(p[1].text, 'RT @bob: hello & welcome'); assert.ok(p[1].repost)
  const s = X.xStats(p)
  assert.equal(s.reposts, 1); assert.equal(s.likes, 5); assert.equal(s.tags[0].label, '#rust'); assert.equal(s.domains[0].label, 'rust-lang.org'); assert.equal(s.best[0].id, '1')
})

/* ---------- any export ---------- */
t('record lists, flat rows, service guess', () => {
  const v = { relationships_following: [{ title: 'a', string_list_data: [{ timestamp: 1700000000 }] }, { title: 'b', string_list_data: [{ timestamp: 1710000000 }] }], meta: { n: 1 } }
  const l = X.findRecordLists(v)
  assert.equal(l[0].path, '$.relationships_following'); assert.equal(l[0].count, 2)
  const l2 = X.findRecordLists([{ ts: '2020-01-01T00:00:00Z', a: 1 }, { ts: '2021-06-01T00:00:00Z', a: 2 }])
  assert.deepEqual([l2[0].first, l2[0].last], ['2020-01-01', '2021-06-01'])
  assert.deepEqual(X.flatRow({ a: { b: 1, c: [1] }, d: null }), { 'a.b': '1', 'a.c': '[1]', d: '' })
  assert.deepEqual(X.jsonFromJs('window.YTD.like.part0 = [1];'), [1])
  assert.equal(X.guessService(['MyData/StreamingHistory_music_0.json']), 'Spotify')
  assert.equal(X.guessService(['data/tweets.js', 'data/account.js']), 'X (Twitter)')
  assert.equal(X.guessService(['connections/followers_and_following/followers_1.json']), 'Instagram')
  assert.equal(X.monthSeries(new Map([['2024-01', 1], ['2024-03', 2]])).length, 3)
})

console.log(`r15 tests: ${n} passed`)

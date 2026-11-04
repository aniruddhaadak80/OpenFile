/* Round 15: logic for the AI Builder tools. Pure functions with no imports, so they run in unit tests under Node. */

/* ---------------- tokens ---------------- */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/g
/** A quick token estimate with no tokenizer: about 4 characters per token for Latin text, 1 per CJK character. */
export function estimateTokens(s: string): number {
  if (!s) return 0
  const cjk = (s.match(CJK) ?? []).length
  const rest = s.length - cjk
  const words = (s.replace(CJK, ' ').match(/\S+/g) ?? []).length
  // blend of the character rule and the word rule (1.3 tokens per word), which is closer for code and short words
  return Math.max(1, Math.round(cjk + (rest / 4 + words * 1.3) / 2))
}
export const countWords = (s: string) => (s.match(/\S+/g) ?? []).length

/* ---------------- chunking ---------------- */
export interface Chunk { i: number; text: string; start: number; end: number; size: number }
export type Measure = (s: string) => number
interface Piece { start: number; end: number }

const SEPS_TEXT = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ']
const SEPS_MD = ['\n# ', '\n## ', '\n### ', '\n#### ', '\n```', ...SEPS_TEXT]
const SEPS_CODE = ['\nclass ', '\nfunction ', '\ndef ', '\nexport ', '\nconst ', '\n\n', '\n', ' ']
export const SPLITTERS = { text: SEPS_TEXT, markdown: SEPS_MD, code: SEPS_CODE } as const

/** Split [start, end) of text at sep. Heading and code style separators (starting with a newline) begin the next piece;
 *  sentence separators end the piece they close. Concatenating the pieces gives back the original range. */
function splitAt(text: string, p: Piece, sep: string): Piece[] {
  const out: Piece[] = []
  const lead = sep.startsWith('\n') && sep.trim().length > 0
  let from = p.start, k = text.indexOf(sep, p.start)
  while (k >= 0 && k < p.end) {
    const cut = lead ? k + 1 : k + sep.length
    if (cut > from && cut < p.end) { out.push({ start: from, end: cut }); from = cut }
    k = text.indexOf(sep, k + sep.length)
  }
  out.push({ start: from, end: p.end })
  return out.filter((x) => x.end > x.start)
}

/** Recursive splitter: tries each separator in turn so chunks break at the largest natural boundary that fits. */
export function chunkText(text: string, o: { size: number; overlap?: number; measure?: Measure; separators?: readonly string[]; trim?: boolean }): Chunk[] {
  const size = Math.max(1, o.size), overlap = Math.max(0, Math.min(o.overlap ?? 0, size - 1))
  const len = o.measure ?? ((s: string) => s.length)
  const seps = o.separators ?? SEPS_TEXT
  const m = (p: Piece) => len(text.slice(p.start, p.end))
  // 1. break everything down into pieces no bigger than size
  const atoms: Piece[] = []
  const rec = (p: Piece, level: number) => {
    if (m(p) <= size) { atoms.push(p); return }
    let i = level
    while (i < seps.length && text.slice(p.start, p.end).indexOf(seps[i]) < 0) i++
    if (i >= seps.length) { // no separator left: hard cut by characters
      let s = p.start
      while (s < p.end) {
        let e = Math.min(p.end, s + Math.max(1, size))
        while (e > s + 1 && len(text.slice(s, e)) > size) e = s + Math.max(1, Math.floor((e - s) * 0.8))
        atoms.push({ start: s, end: e }); s = e
      }
      return
    }
    for (const q of splitAt(text, p, seps[i])) rec(q, i + 1)
  }
  if (text.length) rec({ start: 0, end: text.length }, 0)
  // 2. merge pieces greedily, carrying a tail of up to `overlap` into the next chunk
  const chunks: Chunk[] = []
  let cur: Piece[] = []
  const emit = () => {
    if (!cur.length) return
    let s = cur[0].start, e = cur[cur.length - 1].end
    if (o.trim !== false) { while (s < e && /\s/.test(text[s])) s++; while (e > s && /\s/.test(text[e - 1])) e-- }
    if (e > s) { const t = text.slice(s, e); if (!chunks.length || chunks[chunks.length - 1].start !== s || chunks[chunks.length - 1].end !== e) chunks.push({ i: chunks.length, text: t, start: s, end: e, size: len(t) }) }
  }
  for (const a of atoms) {
    if (cur.length && len(text.slice(cur[0].start, a.end)) > size) {
      emit()
      const keep: Piece[] = []
      for (let j = cur.length - 1; j >= 0; j--) {
        if (!overlap) break
        const cand = [cur[j], ...keep]
        if (len(text.slice(cand[0].start, cand[cand.length - 1].end)) > overlap) break
        if (len(text.slice(cur[j].start, a.end)) > size) break
        keep.unshift(cur[j])
      }
      cur = keep
    }
    cur.push(a)
  }
  emit()
  return chunks
}

/* ---------------- fine-tune datasets ---------------- */
export type DsFormat = 'chat' | 'prompt' | 'alpaca' | 'sharegpt' | 'dpo' | 'unknown'
export interface Turn { role: 'system' | 'user' | 'assistant' | 'tool'; content: string }
export interface Conv { turns: Turn[] }
export interface RowIssue { line: number; level: 'error' | 'warn'; msg: string }
export interface DsReport { rows: number; valid: number; format: DsFormat; formats: Record<string, number>; issues: RowIssue[]; duplicates: number; tokens: { total: number; min: number; max: number; mean: number; p95: number }; records: { line: number; value: any; ok: boolean; tokens: number; dup?: boolean }[] }

export function detectRow(v: any): DsFormat {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'unknown'
  if ((v.preferred_output && v.non_preferred_output) || ('chosen' in v && 'rejected' in v)) return 'dpo'
  if (Array.isArray(v.messages)) return 'chat'
  if (Array.isArray(v.conversations)) return 'sharegpt'
  if ('instruction' in v && 'output' in v) return 'alpaca'
  if ('prompt' in v && 'completion' in v) return 'prompt'
  return 'unknown'
}

/** Parse JSONL (or a JSON array) into records with line numbers. */
export function parseJsonl(text: string): { line: number; value?: any; error?: string }[] {
  const t = text.replace(/^\uFEFF/, '').trim()
  if (t.startsWith('[')) {
    try { const a = JSON.parse(t); if (Array.isArray(a)) return a.map((value, i) => ({ line: i + 1, value })) } catch { /* fall through to lines */ }
  }
  const out: { line: number; value?: any; error?: string }[] = []
  text.split(/\r?\n/).forEach((ln, i) => {
    if (!ln.trim()) return
    try { out.push({ line: i + 1, value: JSON.parse(ln) }) } catch (e: any) { out.push({ line: i + 1, error: 'Not valid JSON: ' + String(e?.message || e).replace(/^.*?JSON[^:]*: ?/i, '').slice(0, 80) }) }
  })
  return out
}

const contentText = (c: any): string => typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => typeof p === 'string' ? p : p?.text ?? p?.content ?? '').join('') : c == null ? '' : String(c?.text ?? '')

/** Turn any supported row into a conversation (DPO rows give the prompt plus the preferred reply). */
export function toConv(v: any, fmt = detectRow(v)): Conv | null {
  const role = (r: string): Turn['role'] => r === 'human' || r === 'user' ? 'user' : r === 'gpt' || r === 'assistant' || r === 'bot' || r === 'model' ? 'assistant' : r === 'system' || r === 'developer' ? 'system' : r === 'tool' || r === 'function' || r === 'function_response' || r === 'observation' ? 'tool' : 'user'
  if (fmt === 'chat') return { turns: v.messages.map((m: any) => ({ role: role(String(m?.role ?? '')), content: contentText(m?.content) })) }
  if (fmt === 'sharegpt') return { turns: v.conversations.map((m: any) => ({ role: role(String(m?.from ?? m?.role ?? '')), content: contentText(m?.value ?? m?.content) })) }
  if (fmt === 'alpaca') { const turns: Turn[] = []; if (v.system) turns.push({ role: 'system', content: String(v.system) }); turns.push({ role: 'user', content: [v.instruction, v.input].filter((x) => x != null && String(x).trim()).join('\n\n') }, { role: 'assistant', content: String(v.output ?? '') }); return { turns } }
  if (fmt === 'prompt') return { turns: [{ role: 'user', content: String(v.prompt ?? '') }, { role: 'assistant', content: String(v.completion ?? '') }] }
  if (fmt === 'dpo') {
    const p = v.input?.messages ? v.input.messages.map((m: any) => ({ role: role(m.role), content: contentText(m.content) })) : [{ role: 'user' as const, content: contentText(v.prompt ?? v.input) }]
    const pref = Array.isArray(v.preferred_output) ? contentText(v.preferred_output[0]?.content) : contentText(v.chosen?.[v.chosen?.length - 1]?.content ?? v.chosen)
    return { turns: [...p, { role: 'assistant', content: pref }] }
  }
  return null
}

/** The text of a row's conversation (for token counts) and how many turns it has. */
export function convText(v: any): { text: string; turns: number } | null {
  const c = toConv(v)
  if (c) return { text: c.turns.map((t) => t.content).join('\n'), turns: c.turns.length }
  if (detectRow(v) === 'unknown' && v && typeof v === 'object') return { text: JSON.stringify(v), turns: 0 }
  return null
}

const ROLES = new Set(['system', 'developer', 'user', 'assistant', 'tool', 'function'])
/** Check one row. Returns error and warning messages. */
export function checkRow(v: any): { fmt: DsFormat; errors: string[]; warns: string[] } {
  const fmt = detectRow(v), errors: string[] = [], warns: string[] = []
  if (fmt === 'unknown') { errors.push('Unknown row shape. Expected messages, conversations, instruction/output, prompt/completion or a preference pair.'); return { fmt, errors, warns } }
  if (fmt === 'chat') {
    const ms = v.messages as any[]
    if (!ms.length) errors.push('messages is empty.')
    ms.forEach((m, i) => {
      if (!m || typeof m !== 'object') { errors.push(`Message ${i + 1} is not an object.`); return }
      if (!ROLES.has(m.role)) errors.push(`Message ${i + 1} has role "${m.role ?? ''}". Use system, user, assistant or tool.`)
      const hasCalls = Array.isArray(m.tool_calls) && m.tool_calls.length > 0
      if (!contentText(m.content).trim() && !hasCalls) (m.role === 'assistant' ? errors : warns).push(`Message ${i + 1} (${m.role}) has no content.`)
      if ((m.role === 'system' || m.role === 'developer') && i > 0) warns.push(`System message at position ${i + 1}. Put it first.`)
      if ('weight' in m && m.weight !== 0 && m.weight !== 1) errors.push(`Message ${i + 1} weight must be 0 or 1.`)
    })
    const conv = ms.filter((m) => m && m.role !== 'system' && m.role !== 'developer')
    if (ms.length && !ms.some((m) => m?.role === 'assistant')) errors.push('No assistant message to learn from.')
    if (conv.length && conv[conv.length - 1]?.role !== 'assistant') warns.push('The last message is not from the assistant.')
    for (let i = 1; i < conv.length; i++) if (conv[i].role === conv[i - 1].role && conv[i].role !== 'tool' && conv[i].role !== 'assistant') { warns.push('Two user messages in a row.'); break }
  } else if (fmt === 'sharegpt') {
    const cs = v.conversations as any[]
    if (!cs.length) errors.push('conversations is empty.')
    cs.forEach((m, i) => { if (!contentText(m?.value ?? m?.content).trim()) errors.push(`Turn ${i + 1} has no value.`) })
    if (cs.length && !['gpt', 'assistant', 'model'].includes(cs[cs.length - 1]?.from ?? cs[cs.length - 1]?.role)) warns.push('The last turn is not from the model (gpt).')
  } else if (fmt === 'alpaca') {
    if (!String(v.instruction ?? '').trim()) errors.push('instruction is empty.')
    if (!String(v.output ?? '').trim()) errors.push('output is empty.')
  } else if (fmt === 'prompt') {
    if (!String(v.prompt ?? '').trim()) warns.push('prompt is empty.')
    if (!String(v.completion ?? '').trim()) errors.push('completion is empty.')
  } else if (fmt === 'dpo') {
    const a = toConv(v, 'dpo')!
    if (!a.turns[a.turns.length - 1].content.trim()) errors.push('The preferred reply is empty.')
    const rej = Array.isArray(v.non_preferred_output) ? contentText(v.non_preferred_output[0]?.content) : contentText(v.rejected?.[v.rejected?.length - 1]?.content ?? v.rejected)
    if (!rej.trim()) errors.push('The rejected reply is empty.')
    if (rej.trim() && rej.trim() === a.turns[a.turns.length - 1].content.trim()) warns.push('Preferred and rejected replies are the same.')
  }
  return { fmt, errors, warns }
}

const pct = (sorted: number[], p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
/** Validate a whole dataset. measure counts tokens for one conversation's text. */
export function checkDataset(text: string, measure: Measure = estimateTokens, maxTokens = 0): DsReport {
  const parsed = parseJsonl(text)
  const issues: RowIssue[] = [], formats: Record<string, number> = {}, seen = new Map<string, number>(), records: DsReport['records'] = []
  let duplicates = 0
  for (const r of parsed) {
    if (r.error) { issues.push({ line: r.line, level: 'error', msg: r.error }); records.push({ line: r.line, value: null, ok: false, tokens: 0 }); continue }
    const c = checkRow(r.value)
    formats[c.fmt] = (formats[c.fmt] ?? 0) + 1
    c.errors.forEach((msg) => issues.push({ line: r.line, level: 'error', msg }))
    c.warns.forEach((msg) => issues.push({ line: r.line, level: 'warn', msg }))
    const ct = convText(r.value)
    const tokens = ct ? measure(ct.text) + ct.turns * 4 : 0
    const conv = toConv(r.value, c.fmt)
    if (maxTokens && tokens > maxTokens) issues.push({ line: r.line, level: 'error', msg: `About ${tokens} tokens, over the ${maxTokens} limit.` })
    const key = JSON.stringify(conv?.turns ?? r.value)
    const dup = seen.has(key)
    if (dup) { duplicates++; issues.push({ line: r.line, level: 'warn', msg: `Same as line ${seen.get(key)}.` }) } else seen.set(key, r.line)
    records.push({ line: r.line, value: r.value, ok: !c.errors.length && !(maxTokens && tokens > maxTokens), tokens, dup })
  }
  const toks = records.filter((r) => r.value).map((r) => r.tokens).sort((a, b) => a - b)
  const total = toks.reduce((a, b) => a + b, 0)
  const fmt = (Object.entries(formats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown') as DsFormat
  return { rows: parsed.length, valid: records.filter((r) => r.ok).length, format: fmt, formats, issues, duplicates, tokens: { total, min: toks[0] ?? 0, max: toks[toks.length - 1] ?? 0, mean: toks.length ? Math.round(total / toks.length) : 0, p95: pct(toks, 0.95) }, records }
}

/** Seeded shuffle (mulberry32) so the same seed gives the same split. */
export function seededShuffle<T>(a: T[], seed = 42): T[] {
  let s = seed >>> 0
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const b = a.slice()
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}
export function splitTrainVal<T>(a: T[], valShare: number, seed = 42): { train: T[]; val: T[] } {
  const b = seededShuffle(a, seed)
  const n = Math.max(a.length > 1 ? 1 : 0, Math.round(a.length * valShare))
  return { val: b.slice(0, n), train: b.slice(n) }
}

/* ---------------- dataset conversion ---------------- */
export type OutFormat = 'chat' | 'sharegpt' | 'alpaca' | 'prompt'
export function fromConv(c: Conv, to: OutFormat, system?: string): any {
  let turns = c.turns.slice()
  if (system && !turns.some((t) => t.role === 'system')) turns = [{ role: 'system', content: system }, ...turns]
  if (to === 'chat') return { messages: turns.map((t) => ({ role: t.role, content: t.content })) }
  if (to === 'sharegpt') return { conversations: turns.map((t) => ({ from: t.role === 'user' ? 'human' : t.role === 'assistant' ? 'gpt' : t.role, value: t.content })) }
  const sys = turns.filter((t) => t.role === 'system').map((t) => t.content).join('\n')
  const rest = turns.filter((t) => t.role !== 'system')
  const lastA = rest.map((t) => t.role).lastIndexOf('assistant')
  const before = rest.slice(0, lastA < 0 ? rest.length : lastA)
  const out = lastA < 0 ? '' : rest[lastA].content
  const prompt = before.length === 1 ? before[0].content : before.map((t) => `${t.role === 'user' ? 'User' : t.role === 'assistant' ? 'Assistant' : 'Tool'}: ${t.content}`).join('\n')
  if (to === 'alpaca') return { instruction: prompt, input: '', output: out, ...(sys ? { system: sys } : {}) }
  return { prompt: sys ? `${sys}\n\n${prompt}` : prompt, completion: out }
}

/** Rows from a CSV (first row is the header) to conversations, using named columns. */
export function csvToConvs(rows: string[][], cols: { user: number; assistant: number; system?: number; input?: number }): Conv[] {
  return rows.slice(1).filter((r) => r.some((c) => String(c).trim())).map((r) => {
    const turns: Turn[] = []
    if (cols.system != null && cols.system >= 0 && String(r[cols.system] ?? '').trim()) turns.push({ role: 'system', content: String(r[cols.system]) })
    const u = [r[cols.user], cols.input != null && cols.input >= 0 ? r[cols.input] : ''].filter((x) => x != null && String(x).trim()).join('\n\n')
    turns.push({ role: 'user', content: u }, { role: 'assistant', content: String(r[cols.assistant] ?? '') })
    return { turns }
  })
}

/* ---------------- model files: GGUF and safetensors ---------------- */
export class NeedMore extends Error { bytes: number; constructor(bytes: number) { super(`Need ${bytes} bytes`); this.bytes = bytes } }
const GGML_TYPES: Record<number, string> = { 0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 6: 'Q5_0', 7: 'Q5_1', 8: 'Q8_0', 9: 'Q8_1', 10: 'Q2_K', 11: 'Q3_K', 12: 'Q4_K', 13: 'Q5_K', 14: 'Q6_K', 15: 'Q8_K', 16: 'IQ2_XXS', 17: 'IQ2_XS', 18: 'IQ3_XXS', 19: 'IQ1_S', 20: 'IQ4_NL', 21: 'IQ3_S', 22: 'IQ2_S', 23: 'IQ4_XS', 24: 'I8', 25: 'I16', 26: 'I32', 27: 'I64', 28: 'F64', 29: 'IQ1_M', 30: 'BF16', 34: 'TQ1_0', 35: 'TQ2_0', 39: 'MXFP4' }
const FILE_TYPES: Record<number, string> = { 0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 7: 'Q8_0', 8: 'Q5_0', 9: 'Q5_1', 10: 'Q2_K', 11: 'Q3_K_S', 12: 'Q3_K_M', 13: 'Q3_K_L', 14: 'Q4_K_S', 15: 'Q4_K_M', 16: 'Q5_K_S', 17: 'Q5_K_M', 18: 'Q6_K', 19: 'IQ2_XXS', 20: 'IQ2_XS', 21: 'Q2_K_S', 22: 'IQ3_XS', 23: 'IQ3_XXS', 24: 'IQ1_S', 25: 'IQ4_NL', 26: 'IQ3_S', 27: 'IQ3_M', 28: 'IQ2_S', 29: 'IQ2_M', 30: 'IQ4_XS', 31: 'IQ1_M', 32: 'BF16', 36: 'TQ1_0', 37: 'TQ2_0', 38: 'MXFP4_MOE' }
export interface TensorInfo { name: string; shape: number[]; dtype: string; params: number; offset?: number }
export interface ModelInfo { format: 'GGUF' | 'safetensors'; version?: number; meta: Record<string, any>; tensors: TensorInfo[]; params: number; headerBytes: number; summary: Record<string, string> }

/** Read a GGUF header. Throws NeedMore when the buffer stops before the end of the header. Long arrays keep their first 16 items. */
export function parseGguf(buf: ArrayBuffer): ModelInfo {
  const dv = new DataView(buf), dec = new TextDecoder()
  let p = 0
  const need = (n: number) => { if (p + n > buf.byteLength) throw new NeedMore(Math.max(buf.byteLength * 2, p + n + 1024)) }
  const u32 = () => { need(4); const v = dv.getUint32(p, true); p += 4; return v }
  const u64 = () => { need(8); const v = Number(dv.getBigUint64(p, true)); p += 8; return v }
  if (buf.byteLength < 4) throw new NeedMore(64)
  if (dec.decode(new Uint8Array(buf, 0, 4)) !== 'GGUF') throw new Error('This is not a GGUF file (the first bytes are not GGUF).')
  p = 4
  const version = u32()
  if (version < 1 || version > 3) throw new Error(`GGUF version ${version} is not supported.`)
  const cnt = () => version === 1 ? u32() : u64()
  const str = () => { const n = cnt(); need(n); const s = dec.decode(new Uint8Array(buf, p, n)); p += n; return s }
  const val = (t: number): any => {
    switch (t) {
      case 0: need(1); return dv.getUint8(p++)
      case 1: need(1); return dv.getInt8(p++)
      case 2: { need(2); const v = dv.getUint16(p, true); p += 2; return v }
      case 3: { need(2); const v = dv.getInt16(p, true); p += 2; return v }
      case 4: return u32()
      case 5: { need(4); const v = dv.getInt32(p, true); p += 4; return v }
      case 6: { need(4); const v = dv.getFloat32(p, true); p += 4; return Math.round(v * 1e6) / 1e6 }
      case 7: need(1); return dv.getUint8(p++) !== 0
      case 8: return str()
      case 9: {
        const at = u32(), n = cnt(), keep: any[] = []
        const fixed: Record<number, number> = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 }
        for (let i = 0; i < n; i++) {
          if (i >= 16 && fixed[at]) { need(fixed[at] * (n - i)); p += fixed[at] * (n - i); break }
          const v = val(at); if (i < 16) keep.push(v)
        }
        return { array: at === 8 ? 'string' : 'number', length: n, items: keep }
      }
      case 10: return u64()
      case 11: { need(8); const v = Number(dv.getBigInt64(p, true)); p += 8; return v }
      case 12: { need(8); const v = dv.getFloat64(p, true); p += 8; return v }
      default: throw new Error(`Unknown GGUF value type ${t}.`)
    }
  }
  const nT = cnt(), nKV = cnt()
  if (nT > 1e6 || nKV > 1e5) throw new Error('This GGUF header looks damaged.')
  const meta: Record<string, any> = {}
  for (let i = 0; i < nKV; i++) { const k = str(); const t = u32(); meta[k] = val(t) }
  const tensors: TensorInfo[] = []
  for (let i = 0; i < nT; i++) {
    const name = str(), nd = u32(), shape: number[] = []
    for (let d = 0; d < nd; d++) shape.push(u64())
    const ty = u32(), offset = u64()
    tensors.push({ name, shape, dtype: GGML_TYPES[ty] ?? `type ${ty}`, params: shape.reduce((a, b) => a * b, 1), offset })
  }
  const params = tensors.reduce((a, t) => a + t.params, 0)
  const arch = String(meta['general.architecture'] ?? '')
  const g = (k: string) => meta[`${arch}.${k}`]
  const summary: Record<string, string> = {}
  const set = (k: string, v: any) => { if (v != null && v !== '') summary[k] = String(v) }
  set('Name', meta['general.name']); set('Architecture', arch); set('Size label', meta['general.size_label'])
  set('Quantization', meta['general.file_type'] != null ? FILE_TYPES[meta['general.file_type']] ?? meta['general.file_type'] : '')
  set('Parameters', fmtParams(params)); set('Context length', g('context_length')); set('Embedding size', g('embedding_length'))
  set('Layers', g('block_count')); set('Attention heads', g('attention.head_count')); set('KV heads', g('attention.head_count_kv'))
  set('Experts', g('expert_count')); set('Vocabulary', meta['tokenizer.ggml.tokens']?.length); set('Tokenizer', meta['tokenizer.ggml.model'])
  set('License', meta['general.license']); set('Chat template', meta['tokenizer.chat_template'] ? 'yes' : '')
  return { format: 'GGUF', version, meta, tensors, params, headerBytes: p, summary }
}

const ST_BYTES: Record<string, number> = { F64: 8, F32: 4, F16: 2, BF16: 2, I64: 8, I32: 4, I16: 2, I8: 1, U8: 1, BOOL: 1, F8_E4M3: 1, F8_E5M2: 1, U16: 2, U32: 4, U64: 8 }
/** Read a safetensors header: 8 byte length, then JSON. */
export function parseSafetensors(buf: ArrayBuffer): ModelInfo {
  if (buf.byteLength < 8) throw new NeedMore(1024)
  const n = Number(new DataView(buf).getBigUint64(0, true))
  if (n <= 1 || n > 200 * 1024 * 1024) throw new Error('This is not a safetensors file (bad header size).')
  if (8 + n > buf.byteLength) throw new NeedMore(8 + n)
  const raw = new TextDecoder().decode(new Uint8Array(buf, 8, n))
  if (!raw.trimStart().startsWith('{')) throw new Error('This is not a safetensors file (the header is not JSON).')
  const j = JSON.parse(raw)
  const meta = j.__metadata__ ?? {}
  const tensors: TensorInfo[] = Object.entries(j).filter(([k]) => k !== '__metadata__').map(([name, v]: [string, any]) => ({ name, shape: v.shape ?? [], dtype: v.dtype ?? '?', params: (v.shape ?? []).reduce((a: number, b: number) => a * b, 1), offset: v.data_offsets?.[0] }))
  const params = tensors.reduce((a, t) => a + t.params, 0)
  const dt = new Map<string, number>(); for (const t of tensors) dt.set(t.dtype, (dt.get(t.dtype) ?? 0) + t.params)
  const bytes = tensors.reduce((a, t) => a + t.params * (ST_BYTES[t.dtype] ?? 0), 0)
  const summary: Record<string, string> = { Parameters: fmtParams(params), Tensors: String(tensors.length), 'Data types': [...dt.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / Math.max(1, params)) * 100)}%`).join(', '), 'Weights size': fmtBytes(bytes) }
  if (meta.format) summary.Format = meta.format
  return { format: 'safetensors', meta, tensors, params, headerBytes: 8 + n, summary }
}

export function sniffModel(head: Uint8Array): 'gguf' | 'safetensors' | null {
  if (head[0] === 0x47 && head[1] === 0x47 && head[2] === 0x55 && head[3] === 0x46) return 'gguf'
  if (head.length >= 9) { const n = head[0] | (head[1] << 8) | (head[2] << 16) | (head[3] << 24); if (head[4] === 0 && head[5] === 0 && n > 2 && head[8] === 0x7b) return 'safetensors' }
  return null
}
export function fmtParams(n: number) { return n >= 1e9 ? `${(n / 1e9).toFixed(2)} B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} K` : String(n) }
export function fmtBytes(n: number) { return n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B` }

/* ---------------- prompt templates ---------------- */
export type VarStyle = 'double' | 'single' | 'dollar'
const VAR_RE: Record<VarStyle, RegExp> = {
  double: /\{\{\s*([A-Za-z_][\w.-]*)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g,
  single: /(?<![{$])\{\s*([A-Za-z_][\w.-]*)\s*\}(?!\})/g,
  dollar: /\$\{\s*([A-Za-z_][\w.-]*)\s*\}/g,
}
export function detectStyle(t: string): VarStyle { return /\{\{\s*[A-Za-z_]/.test(t) ? 'double' : /\$\{[A-Za-z_]/.test(t) ? 'dollar' : 'single' }
/** Variables in order of first use, with any default written as {{name|default}}. */
export function findVars(t: string, style = detectStyle(t)): { name: string; def: string }[] {
  const out = new Map<string, string>()
  for (const m of t.matchAll(VAR_RE[style])) if (!out.has(m[1])) out.set(m[1], m[2] ?? '')
  return [...out.entries()].map(([name, def]) => ({ name, def }))
}
export function fillTemplate(t: string, values: Record<string, string>, style = detectStyle(t), keepMissing = true): string {
  return t.replace(VAR_RE[style], (all: string, name: string, ...rest: any[]) => { const def = style === 'double' && typeof rest[0] === 'string' ? rest[0] : undefined; const v = values[name]; return v != null && v !== '' ? v : def != null && def !== '' ? def : keepMissing ? all : '' })
}

/* ---------------- MCP configs ---------------- */
export interface McpServer { name: string; transport: 'stdio' | 'http' | 'sse'; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }
export type McpTarget = 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'claude-code' | 'gemini'
export const MCP_TARGETS: { value: McpTarget; label: string; file: string }[] = [
  { value: 'claude-desktop', label: 'Claude Desktop', file: 'claude_desktop_config.json' },
  { value: 'cursor', label: 'Cursor', file: '.cursor/mcp.json' },
  { value: 'vscode', label: 'VS Code', file: '.vscode/mcp.json' },
  { value: 'windsurf', label: 'Windsurf', file: 'mcp_config.json' },
  { value: 'claude-code', label: 'Claude Code', file: '.mcp.json' },
  { value: 'gemini', label: 'Gemini CLI', file: 'settings.json' },
]
/** Split a command line into words, keeping quoted parts together. */
export function shellSplit(s: string): string[] {
  const out: string[] = []; let cur = '', q: string | null = null, any = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]; else cur += c }
    else if (c === '"' || c === "'") { q = c; any = true }
    else if (/\s/.test(c)) { if (cur || any) out.push(cur); cur = ''; any = false }
    else cur += c
  }
  if (cur || any) out.push(cur)
  return out
}
export const SECRET_KEY = /(key|token|secret|password|passwd|pat|auth|credential)/i
export const SECRET_VAL = /^(sk-|sk_|ghp_|gho_|github_pat_|xox[abp]-|glpat-|AKIA|AIza|ya29\.|eyJ)/
const clean = (o: Record<string, string> | undefined) => (o && Object.keys(o).length ? o : undefined)
const envId = (k: string) => k.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export function buildMcp(servers: McpServer[], target: McpTarget, o: { inputs?: boolean } = {}): string {
  const valid = servers.filter((s) => s.name.trim() && (s.transport === 'stdio' ? s.command?.trim() : s.url?.trim()))
  if (target === 'claude-code' && o.inputs === false) {
    return valid.map((s) => s.transport === 'stdio'
      ? ['claude mcp add', `--transport stdio`, q(s.name), ...Object.entries(s.env ?? {}).map(([k, v]) => `--env ${q(`${k}=${v}`)}`), '--', q(s.command!), ...(s.args ?? []).map(q)].join(' ')
      : ['claude mcp add', `--transport ${s.transport}`, q(s.name), q(s.url!), ...Object.entries(s.headers ?? {}).map(([k, v]) => `--header ${q(`${k}: ${v}`)}`)].join(' ')).join('\n')
  }
  const inputs: any[] = []
  const map: Record<string, any> = {}
  for (const s of valid) {
    if (s.transport === 'stdio') {
      let env = clean(s.env)
      if (target === 'vscode' && o.inputs && env) {
        env = Object.fromEntries(Object.entries(env).map(([k, v]) => { if (SECRET_KEY.test(k) || SECRET_VAL.test(v)) { const id = envId(k); if (!inputs.some((x) => x.id === id)) inputs.push({ type: 'promptString', id, description: `${k} for ${s.name}`, password: true }); return [k, `\${input:${id}}`] } return [k, v] }))
      }
      const base = { command: s.command, ...(s.args?.length ? { args: s.args } : {}), ...(env ? { env } : {}) }
      map[s.name] = target === 'vscode' || target === 'claude-code' ? { type: 'stdio', ...base } : base
    } else {
      const headers = clean(s.headers)
      if (target === 'claude-desktop') map[s.name] = { command: 'npx', args: ['-y', 'mcp-remote', s.url, ...Object.entries(s.headers ?? {}).flatMap(([k, v]) => ['--header', `${k}: ${v}`])] }
      else if (target === 'vscode' || target === 'claude-code') map[s.name] = { type: s.transport, url: s.url, ...(headers ? { headers } : {}) }
      else if (target === 'windsurf') map[s.name] = { serverUrl: s.url, ...(headers ? { headers } : {}) }
      else if (target === 'gemini') map[s.name] = s.transport === 'sse' ? { url: s.url, ...(headers ? { headers } : {}) } : { httpUrl: s.url, ...(headers ? { headers } : {}) }
      else map[s.name] = { url: s.url, ...(headers ? { headers } : {}) }
    }
  }
  const doc = target === 'vscode' ? { ...(inputs.length ? { inputs } : {}), servers: map } : { mcpServers: map }
  return JSON.stringify(doc, null, 2)
}
const q = (s: string) => /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`

/** Read any of the common MCP config shapes back into a server list. */
export function parseMcp(text: string): McpServer[] {
  const j = JSON.parse(text)
  const map = j.mcpServers ?? j.servers ?? j.mcp?.servers ?? j['mcp.servers'] ?? j
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('No mcpServers or servers object found.')
  const out: McpServer[] = []
  for (const [name, v] of Object.entries<any>(map)) {
    if (!v || typeof v !== 'object') continue
    const url = v.url ?? v.serverUrl ?? v.httpUrl
    if (v.command === 'npx' && Array.isArray(v.args) && v.args.includes('mcp-remote')) {
      const a = v.args.filter((x: string) => x !== '-y' && x !== 'mcp-remote'); const headers: Record<string, string> = {}
      for (let i = 0; i < a.length; i++) if (a[i] === '--header' && a[i + 1]) { const [k, ...r] = a[i + 1].split(':'); headers[k.trim()] = r.join(':').trim(); i++ }
      out.push({ name, transport: 'http', url: a.find((x: string) => /^https?:/.test(x)), headers: clean(headers) }); continue
    }
    if (url) out.push({ name, transport: v.type === 'sse' ? 'sse' : 'http', url, headers: clean(v.headers) })
    else if (v.command) out.push({ name, transport: 'stdio', command: v.command, args: Array.isArray(v.args) ? v.args.map(String) : [], env: clean(v.env) })
  }
  if (!out.length) throw new Error('No servers with a command or url were found.')
  return out
}

export function mcpWarnings(servers: McpServer[]): string[] {
  const w: string[] = [], names = new Set<string>()
  for (const s of servers) {
    if (!s.name.trim()) { w.push('A server has no name.'); continue }
    if (names.has(s.name)) w.push(`Two servers are called ${s.name}. Only the last one is kept.`)
    names.add(s.name)
    if (!/^[\w.-]+$/.test(s.name)) w.push(`${s.name}: use letters, numbers, dots, dashes or underscores in the name.`)
    if (s.transport === 'stdio') {
      if (!s.command?.trim()) w.push(`${s.name}: no command.`)
      if (s.command === 'npx' && !(s.args ?? []).some((a) => a === '-y' || a === '--yes')) w.push(`${s.name}: add -y after npx so it does not stop to ask before installing.`)
      for (const a of s.args ?? []) if (/^\.{1,2}\//.test(a)) { w.push(`${s.name}: ${a} is a relative path. Apps start servers from their own folder, so use a full path.`); break }
      for (const [k, v] of Object.entries(s.env ?? {})) if (SECRET_KEY.test(k) || SECRET_VAL.test(v)) w.push(`${s.name}: ${k} holds a secret in plain text. Keep this file out of git, or use VS Code inputs.`)
    } else {
      if (!s.url?.trim()) w.push(`${s.name}: no URL.`)
      else if (/^http:\/\//.test(s.url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(s.url)) w.push(`${s.name}: the URL is plain http. Use https for remote servers.`)
      for (const [k, v] of Object.entries(s.headers ?? {})) if (SECRET_KEY.test(k) || /^bearer\s/i.test(v)) w.push(`${s.name}: header ${k} holds a secret in plain text.`)
    }
  }
  return [...new Set(w)]
}

/* ---------------- embeddings ---------------- */
export function cosine(a: number[], b: number[]) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] } return na && nb ? d / Math.sqrt(na * nb) : 0 }
export function simMatrix(v: number[][]) { return v.map((a) => v.map((b) => cosine(a, b))) }
/** Two principal components by power iteration, for a 2D map of the vectors. */
export function pca2(v: number[][]): [number, number][] {
  const n = v.length; if (!n) return []
  const d = v[0].length, mean = new Array(d).fill(0)
  for (const r of v) for (let i = 0; i < d; i++) mean[i] += r[i] / n
  const X = v.map((r) => r.map((x, i) => x - mean[i]))
  const comps: number[][] = []
  for (let c = 0; c < 2; c++) {
    let w = Array.from({ length: d }, (_, i) => Math.sin(i * 12.9898 + c * 78.233))
    for (let it = 0; it < 60; it++) {
      const s = X.map((r) => r.reduce((a, x, i) => a + x * w[i], 0))
      const nw = new Array(d).fill(0); X.forEach((r, k) => { for (let i = 0; i < d; i++) nw[i] += r[i] * s[k] })
      for (const p of comps) { const dp = nw.reduce((a, x, i) => a + x * p[i], 0); for (let i = 0; i < d; i++) nw[i] -= dp * p[i] }
      const norm = Math.hypot(...nw) || 1; w = nw.map((x) => x / norm)
    }
    comps.push(w)
  }
  return X.map((r) => [r.reduce((a, x, i) => a + x * comps[0][i], 0), r.reduce((a, x, i) => a + x * comps[1][i], 0)])
}
export function topPairs(texts: string[], m: number[][], k = 5, far = false) {
  const p: { a: number; b: number; s: number }[] = []
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) p.push({ a: i, b: j, s: m[i][j] })
  return p.sort((x, y) => far ? x.s - y.s : y.s - x.s).slice(0, k)
}

/* ---------------- streamed and plain LLM responses ---------------- */
export interface ToolCall { id?: string; name: string; args: string }
export interface StreamResult { provider: string; model?: string; text: string; reasoning: string; tools: ToolCall[]; usage: { input?: number; output?: number; total?: number; cached?: number }; stop?: string; events: number; errors: string[] }

/** Split pasted text into JSON payloads: SSE data lines, NDJSON lines, a JSON array of chunks or one JSON object. */
export function payloads(text: string): { event?: string; data: any }[] {
  const t = text.replace(/^\uFEFF/, '').trim()
  if (!t) return []
  if (/^(data|event|id|retry):/m.test(t)) {
    const out: { event?: string; data: any }[] = []
    for (const block of t.split(/\r?\n\r?\n+/)) {
      let ev: string | undefined; const data: string[] = []
      for (const ln of block.split(/\r?\n/)) { if (ln.startsWith('event:')) ev = ln.slice(6).trim(); else if (ln.startsWith('data:')) data.push(ln.slice(5).replace(/^ /, '')) }
      const d = data.join('\n').trim()
      if (!d || d === '[DONE]') continue
      try { out.push({ event: ev, data: JSON.parse(d) }) } catch { out.push({ event: ev, data: { __bad: d.slice(0, 80) } }) }
    }
    return out
  }
  try { const j = JSON.parse(t); return (Array.isArray(j) ? j : [j]).map((data) => ({ data })) } catch { /* NDJSON */ }
  return t.split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return { data: JSON.parse(l) } } catch { return { data: { __bad: l.slice(0, 80) } } } })
}

export function readStream(text: string): StreamResult {
  const ps = payloads(text)
  const r: StreamResult = { provider: 'Unknown', text: '', reasoning: '', tools: [], usage: {}, events: ps.length, errors: [] }
  const toolsByIdx = new Map<string, ToolCall>()
  const tool = (k: string, init: Partial<ToolCall> = {}) => { let c = toolsByIdx.get(k); if (!c) { c = { name: '', args: '', ...init }; toolsByIdx.set(k, c) } return c }
  for (const { event, data: d } of ps) {
    if (!d || typeof d !== 'object') continue
    if (d.__bad) { r.errors.push(`Could not read: ${d.__bad}`); continue }
    if (d.error) { r.errors.push(typeof d.error === 'string' ? d.error : d.error.message ?? JSON.stringify(d.error)); continue }
    const type: string = d.type ?? event ?? ''
    // Anthropic Messages
    if (type === 'message_start' || type.startsWith('content_block') || type === 'message_delta' || (d.type === 'message' && Array.isArray(d.content))) {
      r.provider = 'Anthropic Messages'
      const m = d.message ?? (d.type === 'message' ? d : null)
      if (m) { r.model = m.model ?? r.model; if (m.usage) { r.usage.input = m.usage.input_tokens; r.usage.cached = m.usage.cache_read_input_tokens || undefined; if (m.usage.output_tokens) r.usage.output = m.usage.output_tokens } if (m.stop_reason) r.stop = m.stop_reason
        if (Array.isArray(m.content)) for (const [i, b] of m.content.entries()) { if (b.type === 'text') r.text += b.text ?? ''; else if (b.type === 'thinking') r.reasoning += b.thinking ?? ''; else if (b.type === 'tool_use') tool('a' + i, { id: b.id, name: b.name }).args = JSON.stringify(b.input ?? {}) } }
      if (type === 'content_block_start' && d.content_block?.type === 'tool_use') tool('a' + d.index, { id: d.content_block.id, name: d.content_block.name })
      if (type === 'content_block_delta') { const x = d.delta ?? {}; if (x.type === 'text_delta') r.text += x.text ?? ''; else if (x.type === 'thinking_delta') r.reasoning += x.thinking ?? ''; else if (x.type === 'input_json_delta') tool('a' + d.index).args += x.partial_json ?? '' }
      if (type === 'message_delta') { if (d.delta?.stop_reason) r.stop = d.delta.stop_reason; if (d.usage?.output_tokens != null) r.usage.output = d.usage.output_tokens }
      continue
    }
    // OpenAI Responses API
    if (type.startsWith('response.') || d.object === 'response') {
      r.provider = 'OpenAI Responses'
      const resp = d.response ?? (d.object === 'response' ? d : null)
      if (resp) { r.model = resp.model ?? r.model; if (resp.usage) { r.usage.input = resp.usage.input_tokens; r.usage.output = resp.usage.output_tokens; r.usage.total = resp.usage.total_tokens; r.usage.cached = resp.usage.input_tokens_details?.cached_tokens || undefined } if (resp.status && resp.status !== 'in_progress') r.stop = resp.status
        if (d.object === 'response') for (const it of resp.output ?? []) { if (it.type === 'message') r.text += (it.content ?? []).map((c: any) => c.text ?? '').join(''); else if (it.type === 'function_call') tool('r' + it.id, { id: it.call_id, name: it.name }).args = it.arguments ?? ''; else if (it.type === 'reasoning') r.reasoning += (it.summary ?? []).map((s: any) => s.text ?? '').join('\n') } }
      if (type === 'response.output_text.delta') r.text += d.delta ?? ''
      if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') r.reasoning += d.delta ?? ''
      if (type === 'response.output_item.added' && d.item?.type === 'function_call') tool('r' + d.item.id, { id: d.item.call_id, name: d.item.name })
      if (type === 'response.function_call_arguments.delta') tool('r' + d.item_id).args += d.delta ?? ''
      continue
    }
    // OpenAI Chat Completions (also Groq, Mistral, DeepSeek, OpenRouter, vLLM, LM Studio)
    if (Array.isArray(d.choices)) {
      r.provider = d.object === 'chat.completion.chunk' || d.choices[0]?.delta ? 'OpenAI Chat Completions (stream)' : 'OpenAI Chat Completions'
      r.model = d.model ?? r.model
      for (const ch of d.choices) {
        const x = ch.delta ?? ch.message ?? {}
        if (typeof x.content === 'string') r.text += x.content
        if (typeof x.reasoning_content === 'string') r.reasoning += x.reasoning_content
        else if (typeof x.reasoning === 'string') r.reasoning += x.reasoning
        for (const tc of x.tool_calls ?? []) { const c = tool('o' + (tc.index ?? tc.id), {}); if (tc.id) c.id = tc.id; if (tc.function?.name) c.name += tc.function.name; if (tc.function?.arguments) c.args += tc.function.arguments }
        if (typeof ch.text === 'string') r.text += ch.text
        if (ch.finish_reason) r.stop = ch.finish_reason
      }
      if (d.usage) { r.usage.input = d.usage.prompt_tokens; r.usage.output = d.usage.completion_tokens; r.usage.total = d.usage.total_tokens; r.usage.cached = d.usage.prompt_tokens_details?.cached_tokens || undefined }
      continue
    }
    // Google Gemini
    if (Array.isArray(d.candidates) || d.usageMetadata) {
      r.provider = 'Google Gemini'
      r.model = d.modelVersion ?? r.model
      for (const c of d.candidates ?? []) { for (const p of c.content?.parts ?? []) { if (p.thought && p.text) r.reasoning += p.text; else if (p.text) r.text += p.text; if (p.functionCall) r.tools.push({ name: p.functionCall.name, args: JSON.stringify(p.functionCall.args ?? {}) }) } if (c.finishReason) r.stop = c.finishReason }
      if (d.usageMetadata) { r.usage.input = d.usageMetadata.promptTokenCount; r.usage.output = d.usageMetadata.candidatesTokenCount; r.usage.total = d.usageMetadata.totalTokenCount; r.usage.cached = d.usageMetadata.cachedContentTokenCount || undefined }
      continue
    }
    // Ollama
    if ('done' in d && (d.message || 'response' in d)) {
      r.provider = 'Ollama'; r.model = d.model ?? r.model
      if (d.message?.content) r.text += d.message.content
      if (d.message?.thinking) r.reasoning += d.message.thinking
      if (typeof d.response === 'string') r.text += d.response
      for (const tc of d.message?.tool_calls ?? []) r.tools.push({ name: tc.function?.name ?? '', args: JSON.stringify(tc.function?.arguments ?? {}) })
      if (d.done) { r.stop = d.done_reason ?? 'done'; r.usage.input = d.prompt_eval_count; r.usage.output = d.eval_count }
      continue
    }
  }
  r.tools.push(...toolsByIdx.values())
  if (r.usage.total == null && r.usage.input != null && r.usage.output != null) r.usage.total = r.usage.input + r.usage.output
  if (!ps.length) r.errors.push('Nothing to read. Paste a stream (data: lines) or a JSON response.')
  return r
}

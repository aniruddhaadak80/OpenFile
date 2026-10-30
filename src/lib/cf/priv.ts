/* Privacy helpers: URL tracking cleanup, email header analysis, CSV anonymising, secret links.
 * Pure functions (Web Crypto is available in Node 20+ as globalThis.crypto) so they can be tested. */

/* ---------------- tracking parameters ---------------- */
export const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_name', 'utm_reader', 'utm_social', 'utm_brand', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'yclid', 'twclid', 'ttclid', 'li_fat_id', 'igshid', 'igsh', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver', 'mkt_tok', 'oly_anon_id', 'oly_enc_id', 'vero_id', 'vero_conv', '_ga', '_gl', 'ref_src', 'ref_url', 's_cid', 'spm', 'scm', 'si', 'srsltid', 'trk', 'trkCampaign', 'cmpid', 'ICID', 'icid', 'ncid', 'sr_share', 'share_id', 'xtor', 'at_medium', 'at_campaign', 'wt_mc', 'pk_campaign', 'pk_kwd', 'pk_source', 'pk_medium', 'piwik_campaign', 'mtm_campaign', 'mtm_source', 'mtm_medium', 'rb_clickid', 's_kwcid', 'ef_id', 'epik', 'irclickid', 'cvid', 'ocid', 'ved', 'ei', 'sca_esv', 'feature', 'pp']
const SITE_PARAMS: Record<string, string[]> = {
  'amazon.': ['ref', 'ref_', 'pf_rd_r', 'pf_rd_p', 'pf_rd_s', 'pf_rd_t', 'pf_rd_i', 'pf_rd_m', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'pd_rd_i', 'psc', 'qid', 'sr', 'keywords', 'crid', 'sprefix', 'content-id', 'th', 'linkCode', 'tag', 'linkId', 'camp', 'creative', 'dib', 'dib_tag'],
  'youtube.': ['si', 'feature', 'pp', 'ab_channel'], 'youtu.be': ['si', 'feature'],
  'twitter.com': ['s', 't', 'ref_src'], 'x.com': ['s', 't'],
  'instagram.com': ['igshid', 'igsh', 'img_index'], 'facebook.com': ['mibextid', 'rdid', 'share_url'],
  'linkedin.com': ['trk', 'trackingId', 'lipi', 'refId', 'midToken', 'midSig', 'trkEmail', 'eid', 'rcm'],
  'spotify.com': ['si', 'context', 'nd'], 'tiktok.com': ['_r', '_t', 'is_from_webapp', 'sender_device', 'web_id'],
  'reddit.com': ['share_id', 'utm_name', 'rdt'], 'aliexpress.': ['spm', 'scm', 'pvid', 'algo_pvid', 'algo_exp_id', 'gatewayAdapt', 'aff_platform', 'aff_trace_key', 'sk'],
  'flipkart.com': ['affid', 'affExtParam1', 'affExtParam2', 'pid', 'lid', 'marketplace', 'srno', 'otracker', 'fm', 'iid', 'ppt', 'ppn', 'ssid', 'qH'],
}
export interface CleanResult { input: string; output: string; removed: string[]; unwrapped?: string; changed: boolean }
/** Some links wrap the real target in a redirect (Google, Facebook, Outlook safe links). */
function unwrap(u: URL): URL | null {
  const h = u.hostname, p = u.pathname
  const tryParam = (...ks: string[]) => { for (const k of ks) { const v = u.searchParams.get(k); if (v && /^https?:\/\//i.test(v)) { try { return new URL(v) } catch { /* not a url */ } } } return null }
  if (/(^|\.)google\./.test(h) && p === '/url') return tryParam('q', 'url')
  if (/safelinks\.protection\.outlook\.com$/.test(h)) return tryParam('url')
  if (/^l\.(facebook|instagram|messenger)\.com$/.test(h) || /^lm\.facebook\.com$/.test(h)) return tryParam('u')
  if (/(^|\.)youtube\.com$/.test(h) && p === '/redirect') return tryParam('q')
  if (/^out\.reddit\.com$/.test(h)) return tryParam('url')
  if (/(^|\.)linkedin\.com$/.test(h) && p.startsWith('/redir')) return tryParam('url')
  return null
}
export function cleanUrl(input: string, o: { siteRules?: boolean; unwrap?: boolean; extra?: string[]; keep?: string[]; dropHash?: boolean } = {}): CleanResult {
  const raw = input.trim()
  let u: URL
  try { u = new URL(raw) } catch { return { input, output: input, removed: [], changed: false } }
  let unwrapped: string | undefined
  if (o.unwrap !== false) { for (let i = 0; i < 3; i++) { const w = unwrap(u); if (!w) break; u = w; unwrapped = w.toString() } }
  const removed: string[] = []
  const site = o.siteRules !== false ? Object.entries(SITE_PARAMS).filter(([k]) => u.hostname.includes(k)).flatMap(([, v]) => v) : []
  const kill = new Set([...TRACKING_PARAMS, ...site, ...(o.extra ?? [])].map((x) => x.toLowerCase()))
  const keep = new Set((o.keep ?? []).map((x) => x.toLowerCase()))
  for (const k of [...u.searchParams.keys()]) { const lk = k.toLowerCase(); if (!keep.has(lk) && (kill.has(lk) || lk.startsWith('utm_') || lk.startsWith('hsa_') || lk.startsWith('pk_') || lk.startsWith('mtm_'))) { removed.push(k); u.searchParams.delete(k) } }
  if (u.hostname.includes('amazon.')) { const m = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/); if (m) { if (u.pathname !== `/dp/${m[1]}`) removed.push('path'); u.pathname = `/dp/${m[1]}` } }
  if (o.dropHash && u.hash) { removed.push('#' + u.hash.slice(1, 20)); u.hash = '' }
  if (/^#?:~:text=/.test(u.hash)) { removed.push('text fragment'); u.hash = '' }
  let out = u.toString(); if (!u.search && out.endsWith('?')) out = out.slice(0, -1)
  return { input, output: out, removed: [...new Set(removed)], unwrapped, changed: out !== raw }
}
const URL_RE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi
/** Clean every link inside a block of text and keep the rest of the text as it is. */
export function cleanText(text: string, o: Parameters<typeof cleanUrl>[1] = {}) {
  const results: CleanResult[] = []
  const out = text.replace(URL_RE, (m) => { const trail = m.match(/[.,;:!?]+$/)?.[0] ?? ''; const core = trail ? m.slice(0, -trail.length) : m; const r = cleanUrl(core, o); results.push(r); return r.output + trail })
  return { text: out, results }
}

/* ---------------- email headers ---------------- */
export interface Hop { from: string; by: string; with: string; date?: Date; delay?: number; ip?: string; raw: string }
export interface HeaderReport { fields: { name: string; value: string }[]; hops: Hop[]; from?: string; returnPath?: string; replyTo?: string; subject?: string; date?: string; messageId?: string; spf?: string; dkim?: string; dmarc?: string; arc?: string; warnings: string[]; originIp?: string; client?: string }
export function unfoldHeaders(raw: string) {
  const head = raw.replace(/\r/g, '').split(/\n\n/)[0]
  const lines = head.split('\n'), out: { name: string; value: string }[] = []
  for (const l of lines) {
    if (/^[ \t]/.test(l) && out.length) out[out.length - 1].value += ' ' + l.trim()
    else { const m = l.match(/^([!-9;-~]+):\s?(.*)$/); if (m) out.push({ name: m[1], value: m[2] }) }
  }
  return out
}
const emailIn = (s?: string) => s?.match(/<([^>]+)>/)?.[1] ?? s?.match(/[\w.+-]+@[\w.-]+/)?.[0]
const domainOf = (e?: string) => e?.split('@')[1]?.toLowerCase().replace(/>$/, '')
const isPrivateIp = (ip: string) => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1|fe80:|fc|fd)/i.test(ip)
export function analyzeHeaders(raw: string): HeaderReport {
  const fields = unfoldHeaders(raw)
  const get = (n: string) => fields.find((f) => f.name.toLowerCase() === n)?.value
  const all = (n: string) => fields.filter((f) => f.name.toLowerCase() === n).map((f) => f.value)
  const received = all('received').reverse() // oldest first
  const hops: Hop[] = received.map((r) => {
    const from = r.match(/\bfrom\s+(.+?)(?=\s+by\s|\s+with\s|;|$)/i)?.[1]?.trim() ?? ''
    const by = r.match(/\bby\s+(.+?)(?=\s+with\s|\s+id\s|\s+for\s|;|$)/i)?.[1]?.trim() ?? ''
    const wi = r.match(/\bwith\s+(\S+)/i)?.[1] ?? ''
    const ds = r.split(';').pop()?.trim()
    const d = ds ? new Date(ds.replace(/\s*\([^)]*\)\s*$/, '')) : undefined
    const ip = r.match(/\[((?:\d{1,3}\.){3}\d{1,3}|[0-9a-f:]{6,})\]/i)?.[1] ?? r.match(/\(((?:\d{1,3}\.){3}\d{1,3})\)/)?.[1]
    return { from, by, with: wi, date: d && !isNaN(+d) ? d : undefined, ip, raw: r }
  })
  for (let i = 1; i < hops.length; i++) if (hops[i].date && hops[i - 1].date) hops[i].delay = (+hops[i].date! - +hops[i - 1].date!) / 1000
  const ar = all('authentication-results').join(' ; ') + ' ' + all('arc-authentication-results').join(' ')
  const res = (k: string) => ar.match(new RegExp(`\\b${k}=(\\w+)`, 'i'))?.[1]?.toLowerCase()
  const r: HeaderReport = { fields, hops, from: get('from'), returnPath: get('return-path'), replyTo: get('reply-to'), subject: get('subject'), date: get('date'), messageId: get('message-id'), spf: res('spf') ?? get('received-spf')?.split(/\s/)[0]?.toLowerCase(), dkim: res('dkim'), dmarc: res('dmarc'), arc: res('arc'), warnings: [] }
  r.client = get('x-mailer') ?? get('user-agent')
  r.originIp = hops.map((h) => h.ip).find((ip) => ip && !isPrivateIp(ip)) ?? get('x-originating-ip')?.replace(/[[\]]/g, '')
  const fd = domainOf(emailIn(r.from)), rp = domainOf(emailIn(r.returnPath)), rt = domainOf(emailIn(r.replyTo))
  if (r.spf && r.spf !== 'pass') r.warnings.push(`SPF is ${r.spf}: the sending server is not on the list the domain allows.`)
  if (r.dkim && r.dkim !== 'pass') r.warnings.push(`DKIM is ${r.dkim}: the signature did not check out, so the message may have been changed.`)
  if (r.dmarc && r.dmarc !== 'pass') r.warnings.push(`DMARC is ${r.dmarc}: the From domain could not be confirmed.`)
  if (!r.spf && !r.dkim && !r.dmarc) r.warnings.push('No authentication results found. Paste the full original headers to see SPF, DKIM and DMARC.')
  if (fd && rt && fd !== rt && !rt.endsWith('.' + fd)) r.warnings.push(`Replies go to a different domain (${rt}) than the sender (${fd}). This is common in phishing.`)
  if (fd && rp && fd !== rp && !rp.endsWith('.' + fd) && !fd.endsWith('.' + rp)) r.warnings.push(`Return-Path domain (${rp}) differs from From (${fd}). Often fine for mailing services, but check.`)
  const slow = hops.filter((h) => (h.delay ?? 0) > 300)
  if (slow.length) r.warnings.push(`${slow.length} hop${slow.length > 1 ? 's' : ''} took over 5 minutes.`)
  if (/[^\x00-\x7f]/.test(r.from ?? '') || /xn--/.test(r.from ?? '')) r.warnings.push('The From address uses non-Latin or punycode characters. Check it is not a look-alike domain.')
  return r
}

/* ---------------- CSV anonymising ---------------- */
export type AnonMode = 'keep' | 'drop' | 'hash' | 'mask' | 'fake' | 'shift-date' | 'round' | 'initials' | 'generalize'
export async function sha256Hex(s: string, salt: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '\u0000' + s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
export function maskValue(s: string) {
  if (!s) return s
  if (/@/.test(s)) { const [u, d] = s.split('@'); return (u[0] ?? '') + '***@' + d.replace(/^[^.]+/, (m) => m[0] + '***') }
  const digits = s.replace(/\D/g, '')
  if (digits.length >= 6 && digits.length >= s.replace(/\s/g, '').length * 0.7) { let k = 0; const keep = 4; return s.replace(/\d/g, (d) => (++k > digits.length - keep ? d : '*')) }
  return s.length <= 2 ? '*'.repeat(s.length) : s[0] + '*'.repeat(Math.max(1, s.length - 2)) + s[s.length - 1]
}
export const initialsOf = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + '.').join(' ')
/** Turn an age or number into a band like 30-39. */
export function generalize(v: string, width = 10) { const n = parseFloat(v); if (!isFinite(n)) return v; const lo = Math.floor(n / width) * width; return `${lo}-${lo + width - 1}` }
export function shiftDate(v: string, days: number) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/) ; if (!m) { const t = Date.parse(v); if (isNaN(t)) return v; const d = new Date(t + days * 864e5); return d.toISOString().slice(0, 10) }
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + days * 864e5); return d.toISOString().slice(0, 10) + m[4]
}
const FIRST = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Riya', 'Arjun', 'Maya', 'Leo', 'Nora', 'Kai', 'Ivy', 'Omar', 'Zara', 'Ben', 'Lina', 'Ravi', 'Tara', 'Eli', 'Mina', 'Noah', 'Ana', 'Dev', 'Sara', 'Tom', 'Yuki', 'Ali', 'Ella', 'Hugo', 'Isha', 'Max']
const LAST = ['Reed', 'Shah', 'Cole', 'Park', 'Das', 'Fox', 'Gray', 'Hill', 'Iyer', 'Khan', 'Lane', 'Moss', 'Nair', 'Ortiz', 'Pope', 'Quinn', 'Roy', 'Sen', 'Tan', 'Vale', 'West', 'Young', 'Bose', 'Clark', 'Dunn', 'Ellis', 'Ford', 'Gill', 'Hart', 'Jain']
/** Same input always gets the same fake value (from the hash), so joins between files still work. */
export function fakeFromHash(hex: string, kind: 'name' | 'email' | 'phone' | 'id' | 'text') {
  const n = parseInt(hex.slice(0, 8), 16), m = parseInt(hex.slice(8, 16), 16)
  const name = `${FIRST[n % FIRST.length]} ${LAST[m % LAST.length]}`
  if (kind === 'name') return name
  if (kind === 'email') return `${name.toLowerCase().replace(' ', '.')}${n % 100}@example.com`
  if (kind === 'phone') return `+1 555 ${String(n % 900 + 100)} ${String(m % 9000 + 1000)}`
  if (kind === 'id') return 'ID-' + hex.slice(0, 8).toUpperCase()
  return 'Person ' + hex.slice(0, 6).toUpperCase()
}
/** Guess what a column holds from its header and some values. */
export function guessColumn(head: string, values: string[]): { kind: 'name' | 'email' | 'phone' | 'id' | 'date' | 'number' | 'address' | 'text'; suggest: AnonMode } {
  const h = head.toLowerCase(), v = values.filter(Boolean).slice(0, 50)
  const share = (re: RegExp) => (v.length ? v.filter((x) => re.test(x)).length / v.length : 0)
  if (/e-?mail/.test(h) || share(/^[^@\s]+@[^@\s]+\.\w+$/) > 0.6) return { kind: 'email', suggest: 'fake' }
  if (/phone|mobile|tel|whatsapp/.test(h) || share(/^\+?[\d\s().-]{7,}$/) > 0.7) return { kind: 'phone', suggest: 'mask' }
  if (/(^|_|\s)(name|first|last|surname|customer|patient|employee|contact)(_|\s|$)/.test(h)) return { kind: 'name', suggest: 'fake' }
  if (/(dob|birth|date|joined|created|visit)/.test(h) || share(/^\d{4}-\d{2}-\d{2}/) > 0.7) return { kind: 'date', suggest: 'shift-date' }
  if (/(address|street|city|zip|postal|pin ?code)/.test(h)) return { kind: 'address', suggest: 'drop' }
  if (/(^id$|_id$|\bid\b|ssn|aadhaar|pan|passport|account|card|iban|uuid)/.test(h)) return { kind: 'id', suggest: 'hash' }
  if (/(age|salary|income|amount|price|score)/.test(h) || share(/^-?\d+(\.\d+)?$/) > 0.8) return { kind: 'number', suggest: /age/.test(h) ? 'generalize' : 'keep' }
  return { kind: 'text', suggest: 'keep' }
}

/* ---------------- secret links ---------------- */
const b64u = (u: Uint8Array) => { let s = ''; for (const x of u) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
async function deflate(u: Uint8Array) { const { deflateSync } = await import('fflate'); return deflateSync(u, { level: 9 }) }
async function inflate(u: Uint8Array) { const { inflateSync } = await import('fflate'); return inflateSync(u) }
/** Encrypt a note with AES-256-GCM. With a password the key comes from PBKDF2; without one a random key goes in the link. */
export async function sealNote(text: string, password = '', iterations = 210000) {
  const data = await deflate(new TextEncoder().encode(text))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  let key: CryptoKey, keyPart = '', salt = new Uint8Array(0)
  if (password) {
    salt = crypto.getRandomValues(new Uint8Array(16))
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
    key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  } else {
    const raw = crypto.getRandomValues(new Uint8Array(32))
    key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
    keyPart = b64u(raw)
  }
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  // fragment: v1.<p|k>.<salt>.<iv>.<ciphertext>[.<key>]
  return ['v1', password ? 'p' : 'k', b64u(salt), b64u(iv), b64u(ct), ...(keyPart ? [keyPart] : [])].join('.')
}
export const noteNeedsPassword = (frag: string) => frag.replace(/^#/, '').split('.')[1] === 'p'
export async function openNote(frag: string, password = '', iterations = 210000) {
  const p = frag.replace(/^#/, '').split('.')
  if (p[0] !== 'v1' || p.length < 5) throw new Error('This link is not a complete secret note. Check that the whole link was copied.')
  const [, mode, s, iv, ct, k] = p
  let key: CryptoKey
  if (mode === 'p') {
    if (!password) throw new Error('This note needs its password.')
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
    key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64u(s), iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
  } else { if (!k) throw new Error('The key part of this link is missing.'); key = await crypto.subtle.importKey('raw', unb64u(k), 'AES-GCM', false, ['decrypt']) }
  try {
    const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv) }, key, unb64u(ct)))
    return new TextDecoder().decode(await inflate(pt))
  } catch { throw new Error(mode === 'p' ? 'Wrong password, or the link was changed.' : 'This link was changed or cut short, so it cannot be opened.') }
}

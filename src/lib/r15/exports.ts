/* Round 15: logic for the Data Exports tools. Pure functions with no imports, so they run in unit tests under Node. */

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const valid = (d: Date) => !isNaN(d.getTime())
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const wd = (d: Date) => (d.getDay() + 6) % 7

export interface Count { label: string; value: number }
export function topN(m: Map<string, number>, n = 10): Count[] { return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([label, value]) => ({ label, value })) }
const inc = (m: Map<string, number>, k: string, v = 1) => m.set(k, (m.get(k) ?? 0) + v)
/** Fill missing months between the first and last so charts do not hide quiet months. */
export function monthSeries(m: Map<string, number>): Count[] {
  const keys = [...m.keys()].sort()
  if (!keys.length) return []
  const out: Count[] = []
  let [y, mo] = keys[0].split('-').map(Number)
  const [ly, lm] = keys[keys.length - 1].split('-').map(Number)
  while (y < ly || (y === ly && mo <= lm)) { const k = `${y}-${pad(mo)}`; out.push({ label: k, value: m.get(k) ?? 0 }); mo++; if (mo > 12) { mo = 1; y++ } }
  return out
}

const STOP = new Set('the a an and or but to of in on at for with is it this that i you he she we they me my your our be are was were am have has had do does did not no yes so if then than just like get got go going im its dont can will would could should what when where who how why there here all some any one also from by as up out about ok okay oh yeah u ur lol haha hai ki ka ke ko se hai'.split(' '))
export function words(s: string): string[] { return (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)) }
export const emojis = (s: string) => s.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu) ?? []

/* ---------------- WhatsApp ---------------- */
export interface WaMsg { t: Date; who: string; text: string; media: boolean; deleted: boolean }
export interface WaChat { messages: WaMsg[]; system: number; order: 'dmy' | 'mdy' | 'ymd' }
const WA_LINE = /^[\u200e\u200f\u202a\u202c]*\[?(\d{1,4})[./-](\d{1,2})[./-](\d{1,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?[\s\u202f\u00a0]*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-\u2013~]\s*)?(.*)$/
const WA_MEDIA = /^(<media omitted>|<\S+ omitted>|\u200e?(image|video|audio|sticker|gif|document|contact card) omitted$|<attached: .+>|.+ \(file attached\)$|\u200e?<attached:)/i
const WA_DELETED = /^(this message was deleted|you deleted this message|\u200e?this message was deleted\.?)$/i

/** Guess whether dates are day first or month first from the numbers seen. */
export function waOrder(lines: string[]): 'dmy' | 'mdy' | 'ymd' {
  let a = 0, b = 0
  for (const l of lines) { const m = WA_LINE.exec(l); if (!m) continue; if (m[1].length === 4) return 'ymd'; if (+m[1] > 12) a++; if (+m[2] > 12) b++ }
  return b > a ? 'mdy' : 'dmy'
}
export function parseWhatsApp(text: string, order?: 'dmy' | 'mdy' | 'ymd'): WaChat {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const ord = order ?? waOrder(lines.slice(0, 3000))
  const messages: WaMsg[] = []
  let system = 0, last: WaMsg | null = null
  for (const raw of lines) {
    const m = WA_LINE.exec(raw)
    if (m && m[8] !== undefined) {
      let [d, mo, y] = ord === 'mdy' ? [+m[2], +m[1], +m[3]] : ord === 'ymd' ? [+m[3], +m[2], +m[1]] : [+m[1], +m[2], +m[3]]
      if (y < 100) y += 2000
      let h = +m[4]
      const ap = m[7]?.toLowerCase().replace(/[.\s]/g, '')
      if (ap === 'pm' && h < 12) h += 12
      if (ap === 'am' && h === 12) h = 0
      const t = new Date(y, mo - 1, d, h, +m[5], +(m[6] ?? 0))
      const rest = m[8]
      const k = rest.indexOf(': ')
      if (!valid(t) || mo > 12 || d > 31) { if (last) last.text += '\n' + raw; continue }
      if (k <= 0 || k > 60) { system++; last = null; continue }
      const who = rest.slice(0, k).replace(/^[\u200e\u202a\u202c~\s]+|[\u200e\u202a\u202c\s]+$/g, '')
      const body = rest.slice(k + 2).replace(/^\u200e/, '')
      last = { t, who, text: body, media: WA_MEDIA.test(body.trim()), deleted: WA_DELETED.test(body.trim()) }
      messages.push(last)
    } else if (last && raw.trim()) last.text += '\n' + raw
  }
  return { messages, system, order: ord }
}

export interface WaPerson { who: string; messages: number; words: number; media: number; emoji: number; deleted: number; avgWords: number; medianReplyMin: number | null; starts: number }
export interface WaStats { people: WaPerson[]; hours: number[]; weekdays: number[]; months: Count[]; topWords: Count[]; topEmoji: Count[]; first?: Date; last?: Date; days: number; activeDays: number; streak: number; busiestDay?: Count; total: number }
export function waStats(chat: WaChat): WaStats {
  const ms = chat.messages
  const per = new Map<string, WaPerson & { replies: number[] }>()
  const hours = new Array(24).fill(0), weekdays = new Array(7).fill(0), months = new Map<string, number>(), wmap = new Map<string, number>(), emap = new Map<string, number>(), dmap = new Map<string, number>()
  let prev: WaMsg | null = null
  for (const m of ms) {
    let p = per.get(m.who)
    if (!p) { p = { who: m.who, messages: 0, words: 0, media: 0, emoji: 0, deleted: 0, avgWords: 0, medianReplyMin: null, starts: 0, replies: [] }; per.set(m.who, p) }
    p.messages++
    if (m.media) p.media++
    else if (m.deleted) p.deleted++
    else { const w = words(m.text); p.words += (m.text.match(/\S+/g) ?? []).length; w.forEach((x) => inc(wmap, x)); const e = emojis(m.text); p.emoji += e.length; e.forEach((x) => inc(emap, x)) }
    hours[m.t.getHours()]++; weekdays[wd(m.t)]++; inc(months, monthKey(m.t)); inc(dmap, dayKey(m.t))
    if (prev) {
      const gap = (m.t.getTime() - prev.t.getTime()) / 60000
      if (gap > 8 * 60) p.starts++
      else if (prev.who !== m.who && gap >= 0) p.replies.push(gap)
    } else p.starts++
    prev = m
  }
  const people = [...per.values()].map(({ replies, ...p }) => { const r = replies.sort((a, b) => a - b); return { ...p, avgWords: p.messages - p.media ? Math.round((p.words / Math.max(1, p.messages - p.media - p.deleted)) * 10) / 10 : 0, medianReplyMin: r.length ? Math.round(r[Math.floor(r.length / 2)] * 10) / 10 : null } }).sort((a, b) => b.messages - a.messages)
  const days = [...dmap.keys()].sort()
  let streak = 0, run = 0, prevDay: number | null = null
  for (const k of days) { const t = new Date(k + 'T00:00:00').getTime(); run = prevDay != null && Math.round((t - prevDay) / 864e5) === 1 ? run + 1 : 1; streak = Math.max(streak, run); prevDay = t }
  const first = ms[0]?.t, last = ms[ms.length - 1]?.t
  return { people, hours, weekdays, months: monthSeries(months), topWords: topN(wmap, 30), topEmoji: topN(emap, 15), first, last, days: first && last ? Math.floor((last.getTime() - first.getTime()) / 864e5) + 1 : 0, activeDays: days.length, streak, busiestDay: topN(dmap, 1)[0], total: ms.length }
}

/* ---------------- Spotify ---------------- */
export interface Play { t: Date; ms: number; track: string; artist: string; album?: string; kind: 'music' | 'podcast' | 'audiobook'; skipped?: boolean; reasonEnd?: string; platform?: string; country?: string; shuffle?: boolean }
/** Read any Spotify history JSON array: account data (endTime, msPlayed) or extended history (ts, ms_played). */
export function parseSpotify(arr: any[]): Play[] {
  const out: Play[] = []
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue
    if ('ts' in r && 'ms_played' in r) {
      const t = new Date(r.ts)
      if (!valid(t)) continue
      if (r.master_metadata_track_name) out.push({ t, ms: +r.ms_played || 0, track: r.master_metadata_track_name, artist: r.master_metadata_album_artist_name ?? 'Unknown', album: r.master_metadata_album_album_name ?? undefined, kind: 'music', skipped: r.skipped === true || r.reason_end === 'fwdbtn', reasonEnd: r.reason_end ?? undefined, platform: r.platform ?? undefined, country: r.conn_country ?? undefined, shuffle: r.shuffle ?? undefined })
      else if (r.episode_name) out.push({ t, ms: +r.ms_played || 0, track: r.episode_name, artist: r.episode_show_name ?? 'Unknown', kind: 'podcast', reasonEnd: r.reason_end ?? undefined })
      else if (r.audiobook_title) out.push({ t, ms: +r.ms_played || 0, track: r.audiobook_chapter_title ?? r.audiobook_title, artist: r.audiobook_title, kind: 'audiobook' })
    } else if ('endTime' in r && 'msPlayed' in r) {
      const t = new Date(String(r.endTime).replace(' ', 'T') + (String(r.endTime).length <= 16 ? ':00Z' : 'Z'))
      if (!valid(t)) continue
      if (r.trackName) out.push({ t, ms: +r.msPlayed || 0, track: r.trackName, artist: r.artistName ?? 'Unknown', kind: 'music' })
      else if (r.episodeName) out.push({ t, ms: +r.msPlayed || 0, track: r.episodeName, artist: r.podcastName ?? 'Unknown', kind: 'podcast' })
    }
  }
  return out.sort((a, b) => a.t.getTime() - b.t.getTime())
}
export interface SpotifyStats { plays: number; hours: number; artists: Count[]; tracks: Count[]; albums: Count[]; shows: Count[]; months: Count[]; hourOfDay: number[]; weekdays: number[]; skipRate: number | null; uniqueTracks: number; uniqueArtists: number; first?: Date; last?: Date; topDay?: Count; extended: boolean }
/** minMs: plays shorter than this are not counted (Spotify counts a stream after 30 s). by: rank by minutes or play count. */
export function spotifyStats(plays: Play[], o: { minMs?: number; by?: 'minutes' | 'plays'; from?: Date; to?: Date } = {}): SpotifyStats {
  const min = o.minMs ?? 30000, byMin = (o.by ?? 'minutes') === 'minutes'
  const ps = plays.filter((p) => (!o.from || p.t >= o.from) && (!o.to || p.t <= o.to))
  const A = new Map<string, number>(), T = new Map<string, number>(), L = new Map<string, number>(), S = new Map<string, number>(), M = new Map<string, number>(), D = new Map<string, number>()
  const hod = new Array(24).fill(0), wk = new Array(7).fill(0)
  let ms = 0, n = 0, skips = 0, withSkip = 0
  const extended = ps.some((p) => p.reasonEnd != null)
  for (const p of ps) {
    if (p.skipped != null || p.reasonEnd != null) { withSkip++; if (p.skipped) skips++ }
    if (p.ms < min) continue
    n++; ms += p.ms
    const v = byMin ? p.ms / 60000 : 1
    if (p.kind === 'music') { inc(A, p.artist, v); inc(T, `${p.track} · ${p.artist}`, v); if (p.album) inc(L, `${p.album} · ${p.artist}`, v) } else inc(S, p.artist, v)
    inc(M, monthKey(p.t), p.ms / 3600000); inc(D, dayKey(p.t), p.ms / 60000)
    hod[p.t.getHours()] += p.ms / 3600000; wk[wd(p.t)] += p.ms / 3600000
  }
  const r = (c: Count[]) => c.map((x) => ({ label: x.label, value: Math.round(x.value * 10) / 10 }))
  const music = ps.filter((p) => p.kind === 'music' && p.ms >= min)
  return { plays: n, hours: Math.round((ms / 3600000) * 10) / 10, artists: r(topN(A, 50)), tracks: r(topN(T, 50)), albums: r(topN(L, 50)), shows: r(topN(S, 20)), months: r(monthSeries(M)), hourOfDay: hod.map((x) => Math.round(x * 10) / 10), weekdays: wk.map((x) => Math.round(x * 10) / 10), skipRate: withSkip ? Math.round((skips / withSkip) * 1000) / 10 : null, uniqueTracks: new Set(music.map((p) => p.track + '\u0000' + p.artist)).size, uniqueArtists: new Set(music.map((p) => p.artist)).size, first: ps[0]?.t, last: ps[ps.length - 1]?.t, topDay: r(topN(D, 1))[0], extended }
}

/* ---------------- Instagram followers ---------------- */
export interface IgUser { user: string; href?: string; t?: Date }
const igName = (href?: string) => href ? (href.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '').replace(/^@/, '') : ''
/** Users from an Instagram followers or following file, JSON (old and 2025 layouts) or HTML. */
export function igUsers(text: string): IgUser[] {
  const t = text.trim()
  const out = new Map<string, IgUser>()
  const add = (user: string, href?: string, ts?: number) => { user = user.trim().replace(/^@/, ''); if (!user || /^(_u|accounts|explore|p|reel|stories)$/i.test(user)) return; const k = user.toLowerCase(); if (!out.has(k)) out.set(k, { user, href, t: ts ? new Date(ts * 1000) : undefined }) }
  if (t.startsWith('{') || t.startsWith('[')) {
    const j = JSON.parse(t)
    const list: any[] = Array.isArray(j) ? j : Object.values(j).find((v) => Array.isArray(v)) as any[] ?? []
    for (const e of list) {
      const s = e?.string_list_data?.[0] ?? {}
      add(s.value || (e?.title && !/\s/.test(e.title) ? e.title : '') || igName(s.href), s.href, s.timestamp)
    }
  } else {
    for (const m of t.matchAll(/<a[^>]+href="https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([^"/?#]+)\/?"[^>]*>([^<]*)<\/a>/gi)) add(m[2]?.trim() && !/\s/.test(m[2].trim()) ? m[2] : m[1], `https://www.instagram.com/${m[1]}`)
  }
  return [...out.values()]
}
export function compareFollows(followers: IgUser[], following: IgUser[]) {
  const fr = new Set(followers.map((u) => u.user.toLowerCase())), fg = new Set(following.map((u) => u.user.toLowerCase()))
  return { notBack: following.filter((u) => !fr.has(u.user.toLowerCase())), fans: followers.filter((u) => !fg.has(u.user.toLowerCase())), mutual: following.filter((u) => fr.has(u.user.toLowerCase())) }
}
/** Which Instagram file a path is, by name. */
export function igKind(path: string): 'followers' | 'following' | null {
  const n = path.toLowerCase().split('/').pop() ?? ''
  if (/^followers(_\d+)?\.(json|html)$/.test(n)) return 'followers'
  if (/^following\.(json|html)$/.test(n)) return 'following'
  return null
}

/* ---------------- ChatGPT and Claude exports ---------------- */
export interface ChatMsg { role: 'user' | 'assistant' | 'system' | 'tool'; text: string; t?: Date }
export interface Conversation { id: string; title: string; created?: Date; updated?: Date; source: 'ChatGPT' | 'Claude'; model?: string; messages: ChatMsg[] }
const sec = (x: any) => (typeof x === 'number' ? new Date(x * 1000) : typeof x === 'string' ? new Date(x) : undefined)
function gptText(m: any): string {
  const c = m?.content ?? {}
  if (c.content_type === 'text' || c.content_type === 'multimodal_text') return (c.parts ?? []).map((p: any) => typeof p === 'string' ? p : p?.content_type === 'image_asset_pointer' ? '[image]' : p?.text ?? '').join('\n').trim()
  if (c.content_type === 'code') return c.text ? '```\n' + c.text + '\n```' : ''
  if (c.content_type === 'execution_output') return c.text ? '```\n' + c.text + '\n```' : ''
  if (c.content_type === 'tether_quote') return c.text ? `> ${c.title ?? ''}\n> ${c.text}` : ''
  return ''
}
/** Read conversations.json from a ChatGPT or Claude data export. */
export function parseChats(text: string): Conversation[] {
  const j = JSON.parse(text)
  const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.conversations) ? j.conversations : []
  const out: Conversation[] = []
  for (const c of arr) {
    if (c?.mapping) {
      const map = c.mapping as Record<string, any>
      let node = c.current_node && map[c.current_node] ? c.current_node : Object.keys(map).find((k) => !map[k].children?.length)
      const chain: any[] = []
      const guard = new Set<string>()
      while (node && map[node] && !guard.has(node)) { guard.add(node); chain.unshift(map[node]); node = map[node].parent }
      const messages: ChatMsg[] = []
      let model: string | undefined
      for (const n of chain) {
        const m = n.message
        if (!m || m.metadata?.is_visually_hidden_from_conversation) continue
        const role = m.author?.role
        if (role === 'system') continue
        const text = gptText(m)
        if (!text) continue
        model = m.metadata?.model_slug ?? model
        messages.push({ role: role === 'user' ? 'user' : role === 'tool' ? 'tool' : 'assistant', text, t: sec(m.create_time) })
      }
      out.push({ id: c.conversation_id ?? c.id ?? String(out.length), title: c.title || 'Untitled chat', created: sec(c.create_time), updated: sec(c.update_time), source: 'ChatGPT', model, messages })
    } else if (Array.isArray(c?.chat_messages)) {
      const messages: ChatMsg[] = c.chat_messages.map((m: any) => {
        let text = typeof m.text === 'string' && m.text ? m.text : (m.content ?? []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('\n')
        const files = [...(m.attachments ?? []), ...(m.files ?? [])].map((f: any) => f.file_name).filter(Boolean)
        if (files.length) text += `\n\n[files: ${files.join(', ')}]`
        return { role: m.sender === 'human' ? 'user' : 'assistant', text: text.trim(), t: sec(m.created_at) }
      }).filter((m: ChatMsg) => m.text)
      out.push({ id: c.uuid ?? String(out.length), title: c.name || 'Untitled chat', created: sec(c.created_at), updated: sec(c.updated_at), source: 'Claude', messages })
    }
  }
  if (!out.length && arr.length) throw new Error('No ChatGPT or Claude conversations found in this file.')
  return out.sort((a, b) => (b.updated?.getTime() ?? 0) - (a.updated?.getTime() ?? 0))
}
const iso = (d?: Date) => (d && valid(d) ? d.toISOString().replace('T', ' ').slice(0, 16) : '')
export function chatToMarkdown(c: Conversation): string {
  const head = [`# ${c.title}`, '', `${c.source}${c.model ? ` · ${c.model}` : ''}${c.created ? ` · ${iso(c.created)}` : ''}`, '']
  return head.concat(c.messages.flatMap((m) => [`## ${m.role === 'user' ? 'You' : m.role === 'tool' ? 'Tool' : c.source === 'Claude' ? 'Claude' : 'ChatGPT'}`, '', m.text, ''])).join('\n')
}
export const safeName = (s: string) => (s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chat')

/* ---------------- Google location history ---------------- */
export interface Pt { t?: Date; lat: number; lon: number; kind: 'path' | 'visit' | 'raw'; name?: string; end?: Date; activity?: string }
const e7 = (v: any) => (typeof v === 'number' ? v / 1e7 : NaN)
/** "51.5°, -0.12°" or "geo:51.5,-0.12" to numbers. */
export function latLngStr(s: any): [number, number] | null {
  if (typeof s !== 'string') return null
  const m = s.replace(/^geo:/, '').match(/(-?\d+(?:\.\d+)?)\s*°?\s*,\s*(-?\d+(?:\.\d+)?)/)
  return m ? [+m[1], +m[2]] : null
}
export function parseLocation(j: any): { points: Pt[]; format: string } {
  const pts: Pt[] = []
  const ok = (lat: number, lon: number) => isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)
  const push = (p: Pt) => { if (ok(p.lat, p.lon)) pts.push(p) }
  if (Array.isArray(j?.locations)) {
    for (const l of j.locations) push({ lat: e7(l.latitudeE7), lon: e7(l.longitudeE7), t: l.timestamp ? new Date(l.timestamp) : l.timestampMs ? new Date(+l.timestampMs) : undefined, kind: 'raw' })
    return { points: pts, format: 'Records.json (Takeout)' }
  }
  if (Array.isArray(j?.timelineObjects)) {
    for (const o of j.timelineObjects) {
      if (o.placeVisit) { const l = o.placeVisit.location ?? {}; push({ lat: e7(l.latitudeE7), lon: e7(l.longitudeE7), t: sec(o.placeVisit.duration?.startTimestamp), end: sec(o.placeVisit.duration?.endTimestamp), kind: 'visit', name: l.name ?? l.address }) }
      if (o.activitySegment) {
        const a = o.activitySegment, t0 = sec(a.duration?.startTimestamp)
        const raw = a.simplifiedRawPath?.points ?? []
        const way = a.waypointPath?.waypoints ?? []
        push({ lat: e7(a.startLocation?.latitudeE7), lon: e7(a.startLocation?.longitudeE7), t: t0, kind: 'path', activity: a.activityType })
        for (const p of raw) push({ lat: e7(p.latE7), lon: e7(p.lngE7), t: p.timestamp ? new Date(p.timestamp) : undefined, kind: 'path', activity: a.activityType })
        if (!raw.length) for (const p of way) push({ lat: e7(p.latE7), lon: e7(p.lngE7), kind: 'path', activity: a.activityType })
        push({ lat: e7(a.endLocation?.latitudeE7), lon: e7(a.endLocation?.longitudeE7), t: sec(a.duration?.endTimestamp), kind: 'path', activity: a.activityType })
      }
    }
    return { points: pts, format: 'Semantic Location History (Takeout)' }
  }
  const segs: any[] | null = Array.isArray(j?.semanticSegments) ? j.semanticSegments : Array.isArray(j) && j.some((x) => x?.startTime && (x.visit || x.activity || x.timelinePath)) ? j : null
  if (segs) {
    for (const s of segs) {
      const t0 = s.startTime ? new Date(s.startTime) : undefined
      if (s.visit) { const ll = latLngStr(s.visit.topCandidate?.placeLocation?.latLng ?? s.visit.topCandidate?.placeLocation); if (ll) push({ lat: ll[0], lon: ll[1], t: t0, end: s.endTime ? new Date(s.endTime) : undefined, kind: 'visit', name: s.visit.topCandidate?.semanticType ?? undefined }) }
      if (s.activity) { const a = latLngStr(s.activity.start?.latLng ?? s.activity.start), b = latLngStr(s.activity.end?.latLng ?? s.activity.end); const act = s.activity.topCandidate?.type; if (a) push({ lat: a[0], lon: a[1], t: t0, kind: 'path', activity: act }); if (b) push({ lat: b[0], lon: b[1], t: s.endTime ? new Date(s.endTime) : undefined, kind: 'path', activity: act }) }
      for (const p of s.timelinePath ?? []) { const ll = latLngStr(p.point); if (ll) push({ lat: ll[0], lon: ll[1], t: p.time ? new Date(p.time) : t0 && p.durationMinutesOffsetFromStartTime != null ? new Date(t0.getTime() + +p.durationMinutesOffsetFromStartTime * 60000) : undefined, kind: 'path' }) }
    }
    for (const r of j?.rawSignals ?? []) { const ll = latLngStr(r.position?.LatLng ?? r.position?.latLng); if (ll) push({ lat: ll[0], lon: ll[1], t: r.position?.timestamp ? new Date(r.position.timestamp) : undefined, kind: 'raw' }) }
    return { points: pts, format: 'Timeline (on device export)' }
  }
  throw new Error('This is not a Google location history file. Use Timeline.json from your phone, or Records.json or a Semantic Location History month from Takeout.')
}
export function haversine(a: Pt, b: Pt) { const R = 6371008.8, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }
export function locStats(pts: Pt[]) {
  const timed = pts.filter((p) => p.t && valid(p.t)).sort((a, b) => a.t!.getTime() - b.t!.getTime())
  const byDay = new Map<string, number>(), km = new Map<string, number>()
  for (const p of timed) inc(byDay, dayKey(p.t!))
  const path = timed.filter((p) => p.kind !== 'visit')
  for (let i = 1; i < path.length; i++) { const d = haversine(path[i - 1], path[i]); if (d < 300000 && dayKey(path[i].t!) === dayKey(path[i - 1].t!)) inc(km, monthKey(path[i].t!), d / 1000) }
  const places = new Map<string, number>()
  for (const p of pts) if (p.kind === 'visit') inc(places, p.name ?? `${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}`)
  return { points: pts.length, visits: pts.filter((p) => p.kind === 'visit').length, first: timed[0]?.t, last: timed[timed.length - 1]?.t, days: byDay.size, kmByMonth: monthSeries(km).map((c) => ({ label: c.label, value: Math.round(c.value) })), totalKm: Math.round([...km.values()].reduce((a, b) => a + b, 0)), places: topN(places, 15) }
}
const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!))
/** GPX with one track per day for movement and a waypoint per visit. */
export function toGpx(pts: Pt[], name = 'Location history'): string {
  const days = new Map<string, Pt[]>()
  for (const p of pts) if (p.kind !== 'visit' && p.t) { const k = dayKey(p.t); (days.get(k) ?? days.set(k, []).get(k)!).push(p) }
  const wpt = pts.filter((p) => p.kind === 'visit').map((p) => `  <wpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${p.t ? `<time>${p.t.toISOString()}</time>` : ''}<name>${xml(p.name ?? 'Visit')}</name></wpt>`)
  const trk = [...days.entries()].sort().map(([d, ps]) => `  <trk><name>${d}</name><trkseg>\n${ps.sort((a, b) => a.t!.getTime() - b.t!.getTime()).map((p) => `    <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><time>${p.t!.toISOString()}</time></trkpt>`).join('\n')}\n  </trkseg></trk>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="OpenFile" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${xml(name)}</name></metadata>\n${[...wpt, ...trk].join('\n')}\n</gpx>\n`
}
export function toKml(pts: Pt[], name = 'Location history'): string {
  const days = new Map<string, Pt[]>()
  for (const p of pts) if (p.kind !== 'visit' && p.t) { const k = dayKey(p.t); (days.get(k) ?? days.set(k, []).get(k)!).push(p) }
  const visits = pts.filter((p) => p.kind === 'visit').map((p) => `<Placemark><name>${xml(p.name ?? 'Visit')}</name>${p.t ? `<TimeStamp><when>${p.t.toISOString()}</when></TimeStamp>` : ''}<Point><coordinates>${p.lon},${p.lat}</coordinates></Point></Placemark>`)
  const lines = [...days.entries()].sort().filter(([, ps]) => ps.length > 1).map(([d, ps]) => `<Placemark><name>${d}</name><LineString><tessellate>1</tessellate><coordinates>${ps.sort((a, b) => a.t!.getTime() - b.t!.getTime()).map((p) => `${p.lon},${p.lat}`).join(' ')}</coordinates></LineString></Placemark>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(name)}</name>\n${[...visits, ...lines].join('\n')}\n</Document></kml>\n`
}
export function toGeoJson(pts: Pt[]): string {
  return JSON.stringify({ type: 'FeatureCollection', features: pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { kind: p.kind, ...(p.t ? { time: p.t.toISOString() } : {}), ...(p.end ? { end: p.end.toISOString() } : {}), ...(p.name ? { name: p.name } : {}), ...(p.activity ? { activity: p.activity } : {}) } })) })
}

/* ---------------- YouTube watch history ---------------- */
export interface Watch { t: Date; title: string; url?: string; channel: string; music: boolean }
export function parseYouTubeJson(arr: any[]): Watch[] {
  const out: Watch[] = []
  for (const r of arr) {
    if (!r?.time || !r.title) continue
    if ((r.details ?? []).some((d: any) => /ads/i.test(d?.name ?? ''))) continue
    const t = new Date(r.time)
    if (!valid(t)) continue
    if (!r.titleUrl && /^(watched|visited|viewed)\s/i.test(r.title) === false) continue
    out.push({ t, title: String(r.title).replace(/^Watched\s+/i, ''), url: r.titleUrl, channel: r.subtitles?.[0]?.name ?? 'Unknown or removed', music: r.header === 'YouTube Music' })
  }
  return out.sort((a, b) => a.t.getTime() - b.t.getTime())
}
const ent = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\u202f/g, ' ')
/** Takeout watch-history.html: each outer cell holds the video link, the channel link and the date. */
export function parseYouTubeHtml(html: string): Watch[] {
  const out: Watch[] = []
  const cells = html.split(/<div class="outer-cell/).slice(1)
  for (const c of cells) {
    const body = c.match(/<div class="content-cell[^"]*mdl-typography--body-1">([\s\S]*?)<\/div>/)?.[1]
    if (!body || /From Google Ads/i.test(c)) continue
    const links = [...body.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)]
    const video = links.find((l) => /watch\?v=|youtu\.be\//.test(l[1]))
    if (!video) continue
    const channel = links.find((l) => /\/channel\/|\/@|\/c\/|\/user\//.test(l[1]))
    const lastText = ent(body.replace(/<a [\s\S]*?<\/a>/g, '').split(/<br\s*\/?>/).map((s) => s.replace(/<[^>]+>/g, '').trim()).filter(Boolean).pop() ?? '')
    const t = new Date(lastText.replace(/\s+[A-Z]{2,5}([+-]\d+(:\d+)?)?$/, ''))
    if (!valid(t)) continue
    out.push({ t, title: ent(video[2]).trim(), url: ent(video[1]), channel: channel ? ent(channel[2]).trim() : 'Unknown or removed', music: /YouTube Music/.test(c.slice(0, 400)) })
  }
  return out.sort((a, b) => a.t.getTime() - b.t.getTime())
}
export function watchStats(ws: Watch[]) {
  const ch = new Map<string, number>(), vids = new Map<string, number>(), M = new Map<string, number>()
  const hod = new Array(24).fill(0), wk = new Array(7).fill(0)
  for (const w of ws) { inc(ch, w.channel); inc(vids, w.title); inc(M, monthKey(w.t)); hod[w.t.getHours()]++; wk[wd(w.t)]++ }
  const days = new Set(ws.map((w) => dayKey(w.t))).size
  return { total: ws.length, channels: topN(ch, 30), rewatched: topN(vids, 15).filter((c) => c.value > 1), months: monthSeries(M), hourOfDay: hod, weekdays: wk, days, perDay: days ? Math.round((ws.length / days) * 10) / 10 : 0, first: ws[0]?.t, last: ws[ws.length - 1]?.t, uniqueChannels: ch.size }
}

/* ---------------- Netflix ---------------- */
export interface View { t: Date; title: string; show: string; kind: 'episode' | 'film'; sec?: number; profile?: string; device?: string }
/** Show name from an episode title like "Show: Season 2: Episode name". */
export function showOf(title: string): { show: string; episode: boolean } {
  const m = title.match(/^(.*?):\s*(Season|Series|Limited Series|Part|Volume|Vol\.|Chapter|Book|Collection|Temporada|Staffel|Saison)\b/i)
  if (m) return { show: m[1].trim(), episode: true }
  const parts = title.split(': ')
  if (parts.length >= 3) return { show: parts[0].trim(), episode: true }
  return { show: title.trim(), episode: false }
}
const hms = (s: string) => { const m = String(s).match(/^(\d+):(\d{2}):(\d{2})$/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : undefined }
/** Rows (header first) from ViewingActivity.csv or NetflixViewingHistory.csv. dateOrder is for the short web export dates. */
export function parseNetflix(rows: string[][], dateOrder: 'mdy' | 'dmy' = 'mdy'): { views: View[]; format: string } {
  const h = (rows[0] ?? []).map((c) => String(c).trim().toLowerCase())
  const col = (n: string) => h.indexOf(n)
  const out: View[] = []
  if (col('start time') >= 0 && col('title') >= 0) {
    const ti = col('title'), st = col('start time'), du = col('duration'), pr = col('profile name'), sv = col('supplemental video type'), dv = col('device type')
    for (const r of rows.slice(1)) {
      if (sv >= 0 && String(r[sv] ?? '').trim()) continue // trailers, hooks, teasers
      const t = new Date(String(r[st] ?? '').replace(' ', 'T') + 'Z')
      if (!valid(t) || !r[ti]) continue
      const s = showOf(String(r[ti]))
      out.push({ t, title: String(r[ti]), show: s.show, kind: s.episode ? 'episode' : 'film', sec: du >= 0 ? hms(String(r[du] ?? '')) : undefined, profile: pr >= 0 ? String(r[pr] ?? '') : undefined, device: dv >= 0 ? String(r[dv] ?? '') : undefined })
    }
    return { views: out.sort((a, b) => a.t.getTime() - b.t.getTime()), format: 'ViewingActivity.csv (full data request)' }
  }
  if (col('title') >= 0 && col('date') >= 0) {
    const ti = col('title'), da = col('date')
    for (const r of rows.slice(1)) {
      const m = String(r[da] ?? '').match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/)
      if (!m || !r[ti]) continue
      let [a, b, c] = [+m[1], +m[2], +m[3]]
      let y: number, mo: number, d: number
      if (m[1].length === 4) [y, mo, d] = [a, b, c]
      else { if (c < 100) c += 2000; y = c; [mo, d] = dateOrder === 'mdy' ? [a, b] : [b, a] }
      const t = new Date(y, mo - 1, d, 12)
      if (!valid(t)) continue
      const s = showOf(String(r[ti]))
      out.push({ t, title: String(r[ti]), show: s.show, kind: s.episode ? 'episode' : 'film' })
    }
    return { views: out.sort((a, b) => a.t.getTime() - b.t.getTime()), format: 'NetflixViewingHistory.csv (account page)' }
  }
  throw new Error('This is not a Netflix viewing history CSV. It needs Title and Date columns, or Title, Start Time and Duration.')
}
/** Guess d/m or m/d for the short export from the numbers seen. */
export function netflixOrder(rows: string[][]): 'mdy' | 'dmy' {
  let a = 0, b = 0
  for (const r of rows.slice(1, 3000)) for (const c of r) { const m = String(c).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/); if (m) { if (+m[1] > 12) a++; if (+m[2] > 12) b++ } }
  return a > b ? 'dmy' : 'mdy'
}
export function netflixStats(vs: View[]) {
  const shows = new Map<string, number>(), showTime = new Map<string, number>(), films: string[] = [], M = new Map<string, number>(), prof = new Map<string, number>(), dev = new Map<string, number>()
  const hod = new Array(24).fill(0), wk = new Array(7).fill(0)
  let sec = 0
  const hasTime = vs.some((v) => v.sec != null)
  for (const v of vs) {
    if (v.kind === 'episode') inc(shows, v.show); else films.push(v.title)
    if (v.sec != null) { sec += v.sec; inc(showTime, v.show, v.sec / 3600) }
    inc(M, monthKey(v.t), hasTime ? (v.sec ?? 0) / 3600 : 1)
    if (v.profile) inc(prof, v.profile, 1)
    if (v.device) inc(dev, v.device, 1)
    if (hasTime) { hod[v.t.getHours()]++; wk[wd(v.t)]++ } else wk[wd(v.t)]++
  }
  const days = new Map<string, number>(); for (const v of vs) if (v.kind === 'episode') inc(days, `${dayKey(v.t)}\u0000${v.show}`)
  const binge = topN(days, 5).filter((c) => c.value >= 3).map((c) => { const [d, s] = c.label.split('\u0000'); return { label: `${s} (${d})`, value: c.value } })
  return { total: vs.length, episodes: vs.filter((v) => v.kind === 'episode').length, films: new Set(films).size, shows: topN(shows, 25), showHours: topN(showTime, 25).map((c) => ({ label: c.label, value: Math.round(c.value * 10) / 10 })), hours: hasTime ? Math.round((sec / 3600) * 10) / 10 : null, months: monthSeries(M).map((c) => ({ label: c.label, value: Math.round(c.value * 10) / 10 })), profiles: topN(prof, 10), devices: topN(dev, 10), hourOfDay: hasTime ? hod : null, weekdays: wk, binge, first: vs[0]?.t, last: vs[vs.length - 1]?.t, hasTime }
}

/* ---------------- X / Twitter archive ---------------- */
export interface Post { id: string; t: Date; text: string; likes: number; reposts: number; reply?: string; repost: boolean; tags: string[]; mentions: string[]; urls: string[]; media: number }
/** tweets.js: "window.YTD.tweets.part0 = [...]". Also accepts plain JSON. */
export function parseXArchive(text: string): Post[] {
  const s = text.replace(/^\uFEFF/, '').replace(/^\s*window\.YTD\.[\w.]+\s*=\s*/, '').trim().replace(/;\s*$/, '')
  const arr = JSON.parse(s)
  if (!Array.isArray(arr)) throw new Error('This is not a tweets.js file from an X archive.')
  const out: Post[] = []
  for (const x of arr) {
    const tw = x?.tweet ?? x
    if (!tw?.created_at || tw.full_text == null && tw.text == null) continue
    const t = new Date(tw.created_at)
    if (!valid(t)) continue
    const text = ent(String(tw.full_text ?? tw.text))
    out.push({ id: String(tw.id_str ?? tw.id ?? ''), t, text, likes: +tw.favorite_count || 0, reposts: +tw.retweet_count || 0, reply: tw.in_reply_to_screen_name ?? undefined, repost: /^RT @/.test(text), tags: (tw.entities?.hashtags ?? []).map((h: any) => h.text), mentions: (tw.entities?.user_mentions ?? []).map((m: any) => m.screen_name), urls: (tw.entities?.urls ?? []).map((u: any) => u.expanded_url).filter(Boolean), media: (tw.extended_entities?.media ?? tw.entities?.media ?? []).length })
  }
  if (!out.length) throw new Error('No posts were found in this file.')
  return out.sort((a, b) => a.t.getTime() - b.t.getTime())
}
export function xStats(ps: Post[]) {
  const M = new Map<string, number>(), tags = new Map<string, number>(), men = new Map<string, number>(), w = new Map<string, number>(), dom = new Map<string, number>()
  const hod = new Array(24).fill(0), wk = new Array(7).fill(0)
  for (const p of ps) {
    inc(M, monthKey(p.t)); hod[p.t.getHours()]++; wk[wd(p.t)]++
    p.tags.forEach((x) => inc(tags, '#' + x)); p.mentions.forEach((x) => inc(men, '@' + x))
    p.urls.forEach((u) => { try { inc(dom, new URL(u).hostname.replace(/^www\./, '')) } catch { /* skip */ } })
    if (!p.repost) words(p.text.replace(/https?:\/\/\S+/g, '').replace(/[@#]\w+/g, '')).forEach((x) => inc(w, x))
  }
  const own = ps.filter((p) => !p.repost)
  return { total: ps.length, original: own.filter((p) => !p.reply).length, replies: ps.filter((p) => p.reply).length, reposts: ps.filter((p) => p.repost).length, likes: own.reduce((a, p) => a + p.likes, 0), months: monthSeries(M), hourOfDay: hod, weekdays: wk, tags: topN(tags, 15), mentions: topN(men, 15), words: topN(w, 30), domains: topN(dom, 10), best: own.slice().sort((a, b) => b.likes + b.reposts - (a.likes + a.reposts)).slice(0, 10), first: ps[0]?.t, last: ps[ps.length - 1]?.t }
}

/* ---------------- any export: find the record lists inside a JSON file ---------------- */
export interface RecordList { path: string; count: number; keys: string[]; first?: string; last?: string; sample: any }
const DATE_KEY = /(time|date|timestamp|created|updated|_at$|^ts$|when)/i
function dateOf(v: any): number | null {
  if (typeof v === 'number') { if (v > 946684800 && v < 4102444800) return v * 1000; if (v > 946684800000 && v < 4102444800000) return v; return null }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}|^\w{3},? \w{3} \d|^\w{3} \d{1,2},? \d{4}/.test(v)) { const t = Date.parse(v); return isNaN(t) ? null : t }
  return null
}
/** Walk a parsed JSON value and list every array of objects with its size, keys and the date range of any time field. */
export function findRecordLists(v: any, path = '$', out: RecordList[] = [], depth = 0): RecordList[] {
  if (depth > 6 || v == null || typeof v !== 'object') return out
  if (Array.isArray(v)) {
    const objs = v.filter((x) => x && typeof x === 'object' && !Array.isArray(x))
    if (objs.length && objs.length >= v.length * 0.8) {
      const keys = new Map<string, number>()
      for (const o of objs.slice(0, 200)) for (const k of Object.keys(o)) inc(keys, k)
      let lo = Infinity, hi = -Infinity
      const dk = [...keys.keys()].filter((k) => DATE_KEY.test(k))
      for (const o of objs) for (const k of dk) { const t = dateOf(o[k]); if (t != null) { lo = Math.min(lo, t); hi = Math.max(hi, t) } }
      out.push({ path, count: v.length, keys: topN(keys, 12).map((c) => c.label), first: isFinite(lo) ? new Date(lo).toISOString().slice(0, 10) : undefined, last: isFinite(hi) ? new Date(hi).toISOString().slice(0, 10) : undefined, sample: objs[0] })
      // one level into the first record, for nested lists like string_list_data
      if (depth < 6) for (const [k, x] of Object.entries(objs[0])) if (Array.isArray(x) && x.length > 3) findRecordLists(x, `${path}[0].${k}`, out, depth + 1)
    } else v.slice(0, 50).forEach((x, i) => findRecordLists(x, `${path}[${i}]`, out, depth + 1))
    return out
  }
  for (const [k, x] of Object.entries(v)) findRecordLists(x, `${path}.${k}`, out, depth + 1)
  return out
}
/** Flatten one level of nested objects into columns for a table. */
export function flatRow(o: any, prefix = '', out: Record<string, string> = {}, depth = 0): Record<string, string> {
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) flatRow(v, key, out, depth + 1)
    else out[key] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
  return out
}
/** Read the JSON inside a JS wrapper such as "window.YTD.x.part0 = [...]". */
export function jsonFromJs(text: string): any { return JSON.parse(text.replace(/^\uFEFF/, '').replace(/^\s*[\w.$]+\s*=\s*/, '').trim().replace(/;\s*$/, '')) }
/** Which service an export ZIP comes from, by its file names. */
export function guessService(paths: string[]): string {
  const p = paths.map((x) => x.toLowerCase())
  const has = (re: RegExp) => p.some((x) => re.test(x))
  if (has(/streaming_history|streamhistory|streaminghistory/)) return 'Spotify'
  if (has(/connections\/followers_and_following|your_instagram_activity/)) return 'Instagram'
  if (has(/conversations\.json/) && has(/chat\.html|message_feedback|shared_conversations/)) return 'ChatGPT'
  if (has(/conversations\.json/) && has(/users\.json|projects\.json/)) return 'Claude'
  if (has(/^takeout\/|\/takeout\//) || has(/watch-history\.(json|html)/)) return 'Google Takeout'
  if (has(/data\/tweets\.js|data\/tweet\.js/)) return 'X (Twitter)'
  if (has(/viewingactivity\.csv|content_interaction/)) return 'Netflix'
  if (has(/your_activity_across_facebook|your_facebook_activity/)) return 'Facebook'
  if (has(/^messages\/c\d+|servers\/index\.json|account\/user\.json/)) return 'Discord'
  if (has(/user_data\.json|user_data_tiktok\.json/)) return 'TikTok'
  if (has(/^_chat\.txt$|whatsapp chat/)) return 'WhatsApp'
  if (has(/connections\.csv/) && has(/profile\.csv/)) return 'LinkedIn'
  return 'Unknown'
}

/* Round 15: "Try a sample" files for the Data Exports tools and the model file inspector.
 * Every sample is made up (people, songs, shows, places and posts are invented) and built in the browser from a
 * fixed seed, so nothing is downloaded and the same button always gives the same file. The shapes follow the
 * real exports closely enough that the parsers in exports.ts and llm.ts read them like the real thing. */

export type SampleId = 'whatsapp' | 'spotify' | 'instagram' | 'ai-chats' | 'location' | 'youtube' | 'netflix' | 'x' | 'explorer' | 'gguf'

/** Small seeded random source (mulberry32), so samples are the same on every click. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
type R = () => number
const pick = <T,>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length)]
const int = (r: R, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const pad = (n: number) => String(n).padStart(2, '0')
const DAY = 86400000
/** Samples end on this date so charts look the same for everyone. */
const END = Date.UTC(2026, 9, 31, 20, 0, 0)
const isoZ = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')
const text = (name: string, body: string, type = 'text/plain') => new File([body], name, { type })

/* ---------------- WhatsApp: an Android group chat, day first dates ---------------- */
export function sampleWhatsApp(): File[] {
  const r = rng(7)
  const who = ['Asha', 'Ravi', 'Meera', 'Kabir']
  const lines = [
    'Hi all, is everyone free on Saturday for the trek?', 'I am in. What time do we leave?', 'Can we start at 6? It gets hot after 10.',
    'Six works for me', 'Who is bringing the stove?', 'I can bring it, and the tea', 'Do not forget the rain jackets this time 😅',
    'Haha yes, last time was a mess', 'Train or car?', 'Car is easier, I can drive', 'Great, I will book the homestay',
    'Sent the money for the homestay 👍', 'Got it, thanks', 'Weather says light rain in the evening', 'Perfect for chai on the porch ☕',
    'Who has the map?', 'I downloaded it offline', 'Running 10 minutes late, sorry', 'No problem, we are getting breakfast',
    'That view from the top 😍', 'Best trip this year', 'Sending photos tonight', 'Can someone share the expense sheet?',
    'Here it is, everyone owes 850', 'Paid', 'Paid 👍', 'Next one in November?', 'Yes please, maybe the waterfall route',
    'Count me in', 'I will check the dates and get back', 'Happy birthday Meera 🎉🎂', 'Thank you all ❤️', 'Cake on Friday then 😄',
  ]
  const out: string[] = []
  let t = Date.UTC(2026, 7, 14, 4, 10)
  const stamp = (ms: number) => { const d = new Date(ms); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
  out.push(`${stamp(t)} - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them. Tap to learn more.`)
  out.push(`${stamp(t + 60000)} - Asha created group "Weekend trek"`)
  out.push(`${stamp(t + 120000)} - Asha added Ravi, Meera and Kabir`)
  let last = 'Asha'
  for (let i = 0; i < 420; i++) {
    t += r() < 0.18 ? int(r, 6, 40) * 3600000 : int(r, 1, 25) * 60000
    if (t > END) break
    const d = new Date(t)
    if (d.getUTCHours() < 6 && r() < 0.8) t += 6 * 3600000
    let w = pick(r, who); if (w === last && r() < 0.6) w = pick(r, who); last = w
    const roll = r()
    const body = roll < 0.07 ? '<Media omitted>' : roll < 0.085 ? 'This message was deleted' : pick(r, lines)
    out.push(`${stamp(t)} - ${w}: ${body}`)
    if (r() < 0.04) out.push('and one more thing, check the group photo')
  }
  return [text('WhatsApp Chat with Weekend trek.txt', out.join('\n') + '\n')]
}

/* ---------------- Spotify: Extended streaming history ---------------- */
export function sampleSpotify(): File[] {
  const r = rng(11)
  const artists: { a: string; album: string; tracks: string[]; w: number }[] = [
    { a: 'The Lantern Choir', album: 'Harbour Nights', tracks: ['Low Tide', 'Paper Boats', 'Salt and Light', 'Northbound'], w: 9 },
    { a: 'Mira Sol', album: 'Quiet Engines', tracks: ['Copper Sky', 'Slow Rivers', 'Afterglow'], w: 7 },
    { a: 'Kites Over Delhi', album: 'Monsoon Tapes', tracks: ['First Rain', 'Rooftops', 'Old Radio', 'Petrichor'], w: 6 },
    { a: 'Night Bus', album: 'Last Stop', tracks: ['Neon Rain', 'Window Seat', 'Two AM'], w: 5 },
    { a: 'Asha Rao Trio', album: 'Blue Hours', tracks: ['Raga for Tuesday', 'Teal', 'Long Walk Home'], w: 3 },
    { a: 'Field Notes', album: 'Small Weather', tracks: ['Cloud Atlas', 'Frost', 'Green Line'], w: 2 },
  ]
  const shows = [{ s: 'Files and Formats', e: ['Why PDFs are hard', 'The story of JPEG', 'ZIP files explained'] }, { s: 'Morning Run Club', e: ['Easy miles', 'Zone 2 talk', 'Race week'] }]
  const bag = artists.flatMap((x) => Array<typeof x>(x.w).fill(x))
  const rows: any[] = []
  let t = END - 180 * DAY
  while (t < END) {
    t += r() < 0.1 ? int(r, 8, 20) * 3600000 : int(r, 2, 6) * 60000
    const h = new Date(t).getUTCHours()
    if (h > 18 || h < 1) { if (r() < 0.6) t += 9 * 3600000 }
    if (r() < 0.06) {
      const sh = pick(r, shows)
      rows.push({ ts: isoZ(t), platform: 'android', ms_played: int(r, 600, 2400) * 1000, conn_country: 'IN', master_metadata_track_name: null, master_metadata_album_artist_name: null, master_metadata_album_album_name: null, episode_name: pick(r, sh.e), episode_show_name: sh.s, reason_start: 'clickrow', reason_end: 'endplay', shuffle: false, skipped: false })
      continue
    }
    const ar = pick(r, bag), skip = r() < 0.14
    rows.push({ ts: isoZ(t), platform: r() < 0.7 ? 'android' : 'windows', ms_played: skip ? int(r, 3, 28) * 1000 : int(r, 150, 260) * 1000, conn_country: 'IN', master_metadata_track_name: pick(r, ar.tracks), master_metadata_album_artist_name: ar.a, master_metadata_album_album_name: ar.album, episode_name: null, episode_show_name: null, reason_start: 'trackdone', reason_end: skip ? 'fwdbtn' : 'trackdone', shuffle: r() < 0.4, skipped: skip })
  }
  return [text('Streaming_History_Audio_2026.json', JSON.stringify(rows, null, 1), 'application/json')]
}

/* ---------------- Instagram: followers_1.json (old layout) and following.json (2025 layout) ---------------- */
export function sampleInstagram(): File[] {
  const r = rng(13)
  const first = ['asha', 'ravi', 'meera', 'kabir', 'neel', 'tara', 'ishan', 'diya', 'arjun', 'zoya', 'veer', 'anya', 'kiran', 'rohan', 'sara', 'dev']
  const tail = ['.clicks', '_travels', '.codes', '_reads', '.bakes', '_runs', '.art', '_studio', '.daily', '_film']
  const users = new Set<string>()
  while (users.size < 120) users.add(pick(r, first) + pick(r, tail) + (r() < 0.3 ? int(r, 1, 99) : ''))
  const all = [...users]
  const ts = () => Math.floor((END - int(r, 1, 900) * DAY) / 1000)
  const followers = all.filter(() => r() < 0.72)
  const following = all.filter((u) => (followers.includes(u) ? r() < 0.8 : r() < 0.55))
  const fr = followers.map((u) => ({ title: '', media_list_data: [], string_list_data: [{ href: `https://www.instagram.com/${u}`, value: u, timestamp: ts() }] }))
  const fg = { relationships_following: following.map((u) => ({ title: u, string_list_data: [{ href: `https://www.instagram.com/_u/${u}`, timestamp: ts() }] })) }
  return [text('followers_1.json', JSON.stringify(fr, null, 2), 'application/json'), text('following.json', JSON.stringify(fg, null, 2), 'application/json')]
}

/* ---------------- ChatGPT: conversations.json with the message tree ---------------- */
export function sampleAiChats(): File[] {
  const chats: { title: string; turns: [string, string][] }[] = [
    { title: 'Packing list for a rainy trek', turns: [['Make me a short packing list for a two day trek in light rain.', 'Here is a light list:\n\n- Rain jacket and a pack cover\n- Quick dry shirt and a warm layer\n- Head torch, power bank, 2 litres of water\n- Snacks, a small first aid kit and dry socks in a zip bag'], ['Anything for the phone?', 'Keep it in a zip bag with the power bank, and download the map before you go so it works offline.']] },
    { title: 'Explain cosine similarity', turns: [['Explain cosine similarity in two lines.', 'It measures the angle between two vectors, ignoring their length. 1 means they point the same way (same meaning), 0 means they are unrelated.']] },
    { title: 'CSV dates fix', turns: [['My CSV has dates like 03/04/2026. How do I know if it is day first?', 'Look for a value over 12 in either position. If the first number goes above 12 anywhere, it is day first. If neither does, you need to know where the file came from.'], ['Can you write a regex for it?', '```\n^(\\d{1,2})/(\\d{1,2})/(\\d{4})$\n```\nThen compare the first two groups against 12.']] },
    { title: 'Birthday message for Meera', turns: [['Write a short, warm birthday message for a friend who loves trekking.', 'Happy birthday Meera. Here is to more early starts, muddy trails and chai at the top. Thank you for always carrying the stove.']] },
  ]
  let t = END / 1000 - 40 * 86400
  const out = chats.map((c, ci) => {
    const mapping: Record<string, any> = {}
    const root = `root-${ci}`
    mapping[root] = { id: root, message: null, parent: null, children: [`sys-${ci}`] }
    mapping[`sys-${ci}`] = { id: `sys-${ci}`, message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] }, create_time: t, metadata: { is_visually_hidden_from_conversation: true } }, parent: root, children: [] }
    let prev = `sys-${ci}`, start = t
    c.turns.forEach(([u, a], ti) => {
      const uid = `u-${ci}-${ti}`, aid = `a-${ci}-${ti}`
      t += 90
      mapping[prev].children.push(uid)
      mapping[uid] = { id: uid, message: { author: { role: 'user' }, content: { content_type: 'text', parts: [u] }, create_time: t, metadata: {} }, parent: prev, children: [aid] }
      t += 20
      mapping[aid] = { id: aid, message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: [a] }, create_time: t, metadata: { model_slug: 'gpt-4o' } }, parent: uid, children: [] }
      prev = aid
    })
    const conv = { title: c.title, create_time: start, update_time: t, mapping, current_node: prev, conversation_id: `sample-${ci + 1}` }
    t += 6 * 86400
    return conv
  })
  return [text('conversations.json', JSON.stringify(out, null, 1), 'application/json')]
}

/* ---------------- Google Timeline: the on-device export (semanticSegments) ---------------- */
export function sampleLocation(): File[] {
  const r = rng(17)
  const home: [number, number] = [22.5751, 88.4279], work: [number, number] = [22.5697, 88.4338], park: [number, number] = [22.5867, 88.4080], cafe: [number, number] = [22.5803, 88.4170]
  const ll = (p: [number, number]) => `${p[0].toFixed(7)}°, ${p[1].toFixed(7)}°`
  const segs: any[] = []
  const iso = (ms: number) => new Date(ms).toISOString()
  for (let d = 30; d >= 1; d--) {
    const day = END - d * DAY - 10 * 3600000
    const weekend = new Date(day).getUTCDay() % 6 === 0
    const stops = weekend ? [home, r() < 0.5 ? park : cafe, home] : [home, work, r() < 0.3 ? cafe : home, home]
    let t = day + int(r, 0, 40) * 60000
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1]
      const stay = int(r, 40, 300) * 60000
      segs.push({ startTime: iso(t), endTime: iso(t + stay), visit: { hierarchyLevel: 0, probability: 0.9, topCandidate: { placeId: `sample-${i}`, semanticType: a === home ? 'HOME' : a === work ? 'WORK' : 'UNKNOWN', probability: 0.8, placeLocation: { latLng: ll(a) } } } })
      t += stay
      if (a === b) continue
      const move = int(r, 12, 35) * 60000
      segs.push({ startTime: iso(t), endTime: iso(t + move), activity: { start: { latLng: ll(a) }, end: { latLng: ll(b) }, distanceMeters: 900, topCandidate: { type: r() < 0.6 ? 'WALKING' : 'IN_PASSENGER_VEHICLE', probability: 0.7 } } })
      const path = Array.from({ length: 6 }, (_, k) => ({ point: ll([a[0] + ((b[0] - a[0]) * (k + 1)) / 7 + (r() - 0.5) * 0.0008, a[1] + ((b[1] - a[1]) * (k + 1)) / 7 + (r() - 0.5) * 0.0008]), time: iso(t + (move * (k + 1)) / 7) }))
      segs.push({ startTime: iso(t), endTime: iso(t + move), timelinePath: path })
      t += move
    }
  }
  return [text('Timeline.json', JSON.stringify({ semanticSegments: segs, rawSignals: [], userLocationProfile: {} }, null, 1), 'application/json')]
}

/* ---------------- YouTube: Takeout watch-history.json ---------------- */
export function sampleYouTube(): File[] {
  const r = rng(19)
  const ch: { n: string; v: string[]; w: number; music?: boolean }[] = [
    { n: 'Pixel Kitchen', v: ['Dal tadka in 20 minutes', 'Perfect rotis every time', 'One pot biryani'], w: 6 },
    { n: 'Byte Sized', v: ['How ZIP files work', 'What is a token', 'Regex in 10 minutes', 'Git branches, simply'], w: 8 },
    { n: 'Trail Diaries', v: ['Monsoon trek in the hills', 'Packing light for two days', 'Sunrise at the summit'], w: 4 },
    { n: 'Lo-fi Lantern', v: ['Rainy day study mix', 'Late night coding beats'], w: 3, music: true },
    { n: 'Cricket Corner', v: ['Top 10 catches of the season', 'Final over, ball by ball'], w: 3 },
  ]
  const bag = ch.flatMap((c) => Array<typeof c>(c.w).fill(c))
  const rows: any[] = []
  let t = END - 150 * DAY
  while (t < END) {
    t += r() < 0.2 ? int(r, 10, 30) * 3600000 : int(r, 8, 40) * 60000
    if (r() < 0.05) { rows.push({ header: 'YouTube', title: 'Watched an ad', titleUrl: 'https://www.youtube.com/watch?v=adsample', time: isoZ(t), products: ['YouTube'], details: [{ name: 'From Google Ads' }], activityControls: ['YouTube watch history'] }); continue }
    const c = pick(r, bag), title = pick(r, c.v)
    const id = (title.length * 7919 + c.n.length * 31).toString(36).padStart(11, 'x').slice(0, 11)
    rows.push({ header: c.music ? 'YouTube Music' : 'YouTube', title: `Watched ${title}`, titleUrl: `https://www.youtube.com/watch?v=${id}`, subtitles: [{ name: c.n, url: `https://www.youtube.com/channel/UC${c.n.replace(/\W/g, '')}` }], time: isoZ(t), products: ['YouTube'], activityControls: ['YouTube watch history'] })
  }
  return [text('watch-history.json', JSON.stringify(rows.reverse(), null, 1), 'application/json')]
}

/* ---------------- Netflix: ViewingActivity.csv from a data request ---------------- */
export function sampleNetflix(): File[] {
  const r = rng(23)
  const shows = [
    { s: 'Harbour Lights', seasons: 2, eps: 8, min: 48, w: 5 }, { s: 'The Quiet Office', seasons: 3, eps: 10, min: 24, w: 4 },
    { s: 'Monsoon Diaries', seasons: 1, eps: 6, min: 42, w: 3 }, { s: 'Code Red Kitchen', seasons: 2, eps: 9, min: 35, w: 2 },
  ]
  const films = [{ t: 'The Long Road North', min: 118 }, { t: 'Paper Kites', min: 96 }, { t: 'Night Market', min: 104 }]
  const bag = shows.flatMap((x) => Array<typeof x>(x.w).fill(x))
  const prog = new Map<string, number>()
  const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = ['Profile Name,Start Time,Duration,Attributes,Title,Supplemental Video Type,Device Type,Bookmark,Latest Bookmark,Country']
  let t = END - 120 * DAY
  const dur = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}:${pad(int(r, 0, 59))}`
  while (t < END) {
    t += int(r, 6, 40) * 3600000
    const prof = r() < 0.8 ? 'Asha' : 'Kids'
    const dev = pick(r, ['Android TV', 'Android Phone', 'Chrome PC (Cadmium)'])
    if (r() < 0.12) { const f = pick(r, films); rows.push([prof, new Date(t).toISOString().slice(0, 19).replace('T', ' '), dur(f.min - int(r, 0, 10)), '', f.t, '', dev, '', 'Not latest view', 'IN (India)'].map(q).join(',')); continue }
    if (r() < 0.06) { rows.push([prof, new Date(t).toISOString().slice(0, 19).replace('T', ' '), '00:01:12', 'Autoplayed: user action: None; ', 'Harbour Lights: Season 3 (Trailer)', 'TRAILER', dev, '', '', 'IN (India)'].map(q).join(',')); continue }
    const sh = pick(r, bag), n = r() < 0.35 ? int(r, 3, 5) : 1
    for (let k = 0; k < n; k++) {
      const i = prog.get(sh.s) ?? 0; prog.set(sh.s, i + 1)
      const season = Math.min(sh.seasons, 1 + Math.floor(i / sh.eps)), ep = (i % sh.eps) + 1
      rows.push([prof, new Date(t).toISOString().slice(0, 19).replace('T', ' '), dur(sh.min - int(r, 0, 6)), '', `${sh.s}: Season ${season}: Episode ${ep}`, '', dev, '', 'Not latest view', 'IN (India)'].map(q).join(','))
      t += (sh.min + int(r, 1, 5)) * 60000
    }
  }
  return [text('ViewingActivity.csv', rows.join('\n') + '\n', 'text/csv')]
}

/* ---------------- X: data/tweets.js from the archive ---------------- */
export function sampleX(): File[] {
  const r = rng(29)
  const posts = [
    'Shipped a small update today. Smaller files, same quality. #buildinpublic', 'Morning walk, then coffee, then code. The usual. #devlife',
    'Reminder: your data export is yours. Open it on your own device. #privacy', 'Tried chunking docs by headings for RAG, answers got much better #ai #rag',
    'Anyone else count tokens before every long prompt? #llm', 'Rain all day in Kolkata. Perfect for a long reading session',
    'Fixed a date parsing bug that only shows up after the 12th of the month. Classic. #javascript', 'New blog post on file formats is up #webdev',
    'Thanks for all the kind replies on yesterday\'s thread', 'Weekend trek photos coming soon',
  ]
  const tags = (s: string) => [...s.matchAll(/#(\w+)/g)].map((m) => ({ text: m[1], indices: [m.index ?? 0, (m.index ?? 0) + m[0].length] }))
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const created = (ms: number) => { const d = new Date(ms); return `${wd[d.getUTCDay()]} ${mo[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000 ${d.getUTCFullYear()}` }
  const arr: any[] = []
  let t = END - 300 * DAY, id = 1850000000000000000n
  while (t < END) {
    t += int(r, 6, 72) * 3600000
    id += BigInt(int(r, 1000, 900000))
    const roll = r()
    let full = pick(r, posts), reply: string | undefined, mentions: any[] = []
    if (roll < 0.15) { reply = pick(r, ['meera_runs', 'kabir.codes']); full = `@${reply} ${pick(r, ['Agreed, thanks', 'Ha, same here', 'Good point, will try that'])}`; mentions = [{ screen_name: reply, name: reply, id_str: '1', indices: [0, reply.length + 1] }] }
    else if (roll < 0.25) { const who = pick(r, ['openfile_app', 'trail_diaries']); full = `RT @${who}: ${pick(r, posts)}`; mentions = [{ screen_name: who, name: who, id_str: '2', indices: [3, who.length + 4] }] }
    const urls = r() < 0.15 ? [{ url: 'https://t.co/sample', expanded_url: 'https://aniruddhaadak80.github.io/OpenFile/blog', display_url: 'aniruddhaadak80.github.io/OpenFile/blog', indices: [0, 0] }] : []
    if (urls.length) full += ' https://t.co/sample'
    arr.push({ tweet: { edit_info: { initial: { editTweetIds: [String(id)], editableUntil: isoZ(t + 3600000), editsRemaining: '5', isEditEligible: true } }, retweeted: false, source: '<a href="https://mobile.twitter.com" rel="nofollow">Twitter Web App</a>', entities: { hashtags: tags(full), symbols: [], user_mentions: mentions, urls }, display_text_range: ['0', String(full.length)], favorite_count: String(full.startsWith('RT @') ? 0 : int(r, 0, 60)), id_str: String(id), truncated: false, retweet_count: String(int(r, 0, 12)), id: String(id), created_at: created(t), favorited: false, full_text: full, lang: 'en', ...(reply ? { in_reply_to_screen_name: reply, in_reply_to_status_id_str: String(id - 5n) } : {}) } })
  }
  return [text('tweets.js', `window.YTD.tweets.part0 = ${JSON.stringify(arr.reverse(), null, 2)}`, 'text/javascript')]
}

/* ---------------- Data Export Explorer: a small Discord style data package ---------------- */
export async function sampleExplorer(): Promise<File[]> {
  const r = rng(31)
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('README.txt', 'Sample data package made up by OpenFile. The folders follow the layout many apps use for their "download your data" exports.\n')
  zip.file('account/user.json', JSON.stringify({ id: '100000000000000001', username: 'sample_user', email: 'sample@example.com', verified: true, connections: [{ type: 'github', name: 'sample-user', visibility: 1 }, { type: 'spotify', name: 'Sample', visibility: 0 }], relationships: Array.from({ length: 24 }, (_, i) => ({ id: String(200 + i), type: 1, nickname: null, user: { username: `friend_${i + 1}` } })), payments: [] }, null, 2))
  zip.file('servers/index.json', JSON.stringify({ '300000000000000001': 'File Format Fans', '300000000000000002': 'Weekend Trekkers', '300000000000000003': 'Open Source Club' }, null, 2))
  const channels = [['400000000000000001', 'general'], ['400000000000000002', 'help'], ['400000000000000003', 'trek-plans']]
  zip.file('messages/index.json', JSON.stringify(Object.fromEntries(channels.map(([id, n]) => [id, n])), null, 2))
  for (const [id, n] of channels) {
    let t = END - 200 * DAY
    const msgs = Array.from({ length: int(r, 60, 160) }, (_, i) => { t += int(r, 1, 60) * 3600000; return { ID: String(500000 + i), Timestamp: new Date(t).toISOString().replace('T', ' ').slice(0, 19), Contents: pick(r, ['hello', 'has anyone tried the new release?', 'thanks, that fixed it', 'see you on saturday', 'what format is this file?', 'it worked offline too']), Attachments: r() < 0.1 ? 'https://cdn.example.com/sample.png' : '' } })
    zip.file(`messages/c${id}/channel.json`, JSON.stringify({ id, type: 0, name: n, guild: { id: '300000000000000001', name: 'File Format Fans' } }, null, 2))
    zip.file(`messages/c${id}/messages.json`, JSON.stringify(msgs.reverse(), null, 1))
  }
  let t = END - 90 * DAY
  zip.file('activity/analytics/events-2026.json', JSON.stringify(Array.from({ length: 300 }, () => { t += int(r, 1, 8) * 3600000; return { event_type: pick(r, ['app_opened', 'message_sent', 'voice_joined', 'reaction_added']), timestamp: new Date(t).toISOString(), os: pick(r, ['Android', 'Windows', 'Linux']) } }), null, 1))
  const blob = await zip.generateAsync({ type: 'blob' })
  return [new File([blob], 'sample-data-package.zip', { type: 'application/zip' })]
}

/* ---------------- GGUF: a header only file shaped like a small Llama model ---------------- */
export function sampleGguf(): File[] {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const u32 = (v: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); parts.push(b) }
  const u64 = (v: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); parts.push(b) }
  const f32 = (v: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); parts.push(b) }
  const str = (s: string) => { const e = enc.encode(s); u64(e.length); parts.push(e) }
  const L = 22, E = 2048, FF = 5632, H = 32, KV = 4, V = 32000, CTX = 4096
  const vocab = ['<unk>', '<s>', '</s>', ...Array.from({ length: 256 }, (_, i) => `<0x${i.toString(16).toUpperCase().padStart(2, '0')}>`)]
  const common = ['▁the', '▁a', '▁to', '▁and', '▁of', '▁in', '▁is', '▁file', '▁your', '▁browser', 'ing', 'ed', '▁on', '▁it', 'er', '▁for']
  while (vocab.length < V) vocab.push(vocab.length < 259 + common.length ? common[vocab.length - 259] : `▁t${vocab.length}`)
  const kv: [string, number, () => void][] = [
    ['general.architecture', 8, () => str('llama')],
    ['general.name', 8, () => str('OpenFile Sample 1.1B Chat')],
    ['general.size_label', 8, () => str('1.1B')],
    ['general.license', 8, () => str('apache-2.0')],
    ['general.file_type', 4, () => u32(15)],
    ['general.quantization_version', 4, () => u32(2)],
    ['llama.context_length', 4, () => u32(CTX)],
    ['llama.embedding_length', 4, () => u32(E)],
    ['llama.block_count', 4, () => u32(L)],
    ['llama.feed_forward_length', 4, () => u32(FF)],
    ['llama.attention.head_count', 4, () => u32(H)],
    ['llama.attention.head_count_kv', 4, () => u32(KV)],
    ['llama.rope.freq_base', 6, () => f32(10000)],
    ['llama.attention.layer_norm_rms_epsilon', 6, () => f32(0.00001)],
    ['tokenizer.ggml.model', 8, () => str('llama')],
    ['tokenizer.ggml.tokens', 9, () => { u32(8); u64(vocab.length); for (const v of vocab) str(v) }],
    ['tokenizer.ggml.scores', 9, () => { u32(6); u64(V); for (let i = 0; i < V; i++) f32(-i) }],
    ['tokenizer.ggml.bos_token_id', 4, () => u32(1)],
    ['tokenizer.ggml.eos_token_id', 4, () => u32(2)],
    ['tokenizer.chat_template', 8, () => str("{% for m in messages %}<|{{ m['role'] }}|>\n{{ m['content'] }}</s>\n{% endfor %}<|assistant|>\n")],
  ]
  const tensors: [string, number[], number][] = [['token_embd.weight', [E, V], 14]]
  for (let i = 0; i < L; i++) {
    tensors.push([`blk.${i}.attn_norm.weight`, [E], 0], [`blk.${i}.attn_q.weight`, [E, E], 12], [`blk.${i}.attn_k.weight`, [E, (E / H) * KV], 12], [`blk.${i}.attn_v.weight`, [E, (E / H) * KV], 14],
      [`blk.${i}.attn_output.weight`, [E, E], 12], [`blk.${i}.ffn_norm.weight`, [E], 0], [`blk.${i}.ffn_gate.weight`, [E, FF], 12], [`blk.${i}.ffn_up.weight`, [E, FF], 12], [`blk.${i}.ffn_down.weight`, [FF, E], 14])
  }
  tensors.push(['output_norm.weight', [E], 0], ['output.weight', [E, V], 14])
  parts.push(enc.encode('GGUF')); u32(3); u64(tensors.length); u64(kv.length)
  for (const [k, t, w] of kv) { str(k); u32(t); w() }
  let off = 0
  for (const [n, shape, ty] of tensors) { str(n); u32(shape.length); for (const d of shape) u64(d); u32(ty); u64(off); off += 32 * Math.ceil((shape.reduce((a, b) => a * b, 1) * 0.6) / 32) }
  return [new File(parts as BlobPart[], 'openfile-sample-1.1b-chat.Q4_K_M.gguf', { type: 'application/octet-stream' })]
}

const MAKERS: Record<SampleId, () => File[] | Promise<File[]>> = {
  whatsapp: sampleWhatsApp, spotify: sampleSpotify, instagram: sampleInstagram, 'ai-chats': sampleAiChats, location: sampleLocation,
  youtube: sampleYouTube, netflix: sampleNetflix, x: sampleX, explorer: sampleExplorer, gguf: sampleGguf,
}
/** Files for a "Try a sample" button. */
export async function makeSample(id: SampleId): Promise<File[]> { return MAKERS[id]() }

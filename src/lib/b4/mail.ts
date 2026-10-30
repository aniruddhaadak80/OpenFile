/* Email model for the email viewer: EML (postal-mime, MIT-0), MSG (@kenjiuno/msgreader, Apache-2.0) and MBOX. */
export interface Addr { name?: string; address?: string }
export interface MailAtt { filename: string; mimeType: string; data: Uint8Array; contentId?: string; inline: boolean }
export interface Mail { subject: string; from?: Addr; to: Addr[]; cc: Addr[]; bcc: Addr[]; replyTo?: Addr[]; date?: Date; html?: string; text?: string; attachments: MailAtt[]; headers: { key: string; value: string }[] }

export const fmtAddr = (a?: Addr) => (!a ? '' : a.name && a.address ? `${a.name} <${a.address}>` : a.name || a.address || '')

/** Split an mbox file into raw messages. Pure, unit tested. */
export function splitMbox(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let cur: string[] | null = null
  for (const l of lines) {
    if (/^From \S+.*\d{4}\s*$/.test(l) || /^From \S+ /.test(l) && (cur === null || cur[cur.length - 1] === '')) { if (cur && cur.join('').trim()) out.push(cur.join('\n')); cur = []; continue }
    if (cur) cur.push(l.replace(/^>(>*From )/, '$1'))
  }
  if (cur && cur.join('').trim()) out.push(cur.join('\n'))
  return out
}

export async function parseEml(data: ArrayBuffer | string): Promise<Mail> {
  const PostalMime = (await import('postal-mime')).default
  const e: any = await PostalMime.parse(data)
  const list = (x: any): Addr[] => (Array.isArray(x) ? x.flatMap((a: any) => (a.group ? list(a.group) : [{ name: a.name, address: a.address }])) : [])
  return {
    subject: e.subject ?? '', from: e.from ? { name: e.from.name, address: e.from.address } : undefined, to: list(e.to), cc: list(e.cc), bcc: list(e.bcc), replyTo: list(e.replyTo),
    date: e.date ? new Date(e.date) : undefined, html: e.html, text: e.text,
    attachments: (e.attachments ?? []).map((a: any) => ({ filename: a.filename || 'attachment', mimeType: a.mimeType || 'application/octet-stream', data: typeof a.content === 'string' ? new TextEncoder().encode(a.content) : new Uint8Array(a.content), contentId: a.contentId?.replace(/^<|>$/g, ''), inline: a.disposition === 'inline' || !!a.related })),
    headers: (e.headers ?? []).map((h: any) => ({ key: h.key, value: h.value })),
  }
}

export async function parseMsg(buf: ArrayBuffer): Promise<Mail> {
  // The package is CommonJS with exports.default; depending on bundler interop the class sits at .default or .default.default.
  const mod: any = await import('@kenjiuno/msgreader')
  const MsgReader = [mod?.default?.default, mod?.default, mod].find((c) => typeof c === 'function')
  if (!MsgReader) throw new Error('The Outlook MSG reader could not be loaded.')
  const r = new MsgReader(buf)
  const d: any = r.getFileData()
  if (d.error) throw new Error('This MSG file could not be read.')
  const rec = (t: string) => (d.recipients ?? []).filter((x: any) => (x.recipType ?? 'to') === t).map((x: any) => ({ name: x.name, address: x.smtpAddress || x.email }))
  let html: string | undefined = d.bodyHtml
  if (!html && d.html) html = new TextDecoder().decode(d.html)
  const atts: MailAtt[] = []
  for (const a of d.attachments ?? []) {
    try { const x: any = r.getAttachment(a); atts.push({ filename: x.fileName || a.fileName || 'attachment', mimeType: a.attachMimeTag || 'application/octet-stream', data: x.content, contentId: a.pidContentId, inline: !!a.attachmentHidden }) } catch { /* skip broken attachment */ }
  }
  const headers = String(d.headers ?? '').split(/\r?\n(?=\S)/).map((l) => { const i = l.indexOf(':'); return i > 0 ? { key: l.slice(0, i).toLowerCase(), value: l.slice(i + 1).trim() } : null }).filter(Boolean) as { key: string; value: string }[]
  const when = d.messageDeliveryTime || d.clientSubmitTime || d.creationTime
  return { subject: d.subject ?? '', from: { name: d.senderName, address: d.senderSmtpAddress || d.senderEmail }, to: rec('to'), cc: rec('cc'), bcc: rec('bcc'), date: when ? new Date(when) : undefined, html, text: d.body, attachments: atts, headers }
}

export async function openMail(file: File): Promise<Mail[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.msg')) return [await parseMsg(await file.arrayBuffer())]
  if (name.endsWith('.mbox') || name.endsWith('.mbx') || (!name.includes('.') && /^From /.test(await file.slice(0, 5).text()))) {
    const raw = splitMbox(await file.text())
    if (!raw.length) throw new Error('No messages were found in this MBOX file.')
    const out: Mail[] = []
    for (const m of raw.slice(0, 2000)) { try { out.push(await parseEml(m)) } catch { /* skip */ } }
    return out
  }
  return [await parseEml(await file.arrayBuffer())]
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Safe HTML body: sanitized, cid: images inlined, remote images optionally blocked. */
export async function mailHtml(m: Mail, allowRemote: boolean): Promise<string> {
  const DOMPurify = (await import('dompurify')).default
  let html = m.html ?? (m.text ? `<pre style="white-space:pre-wrap;font-family:inherit">${esc(m.text)}</pre>` : '<p><i>This message has no body.</i></p>')
  for (const a of m.attachments) if (a.contentId) {
    let s = ''; for (let i = 0; i < a.data.length; i += 0x8000) s += String.fromCharCode(...a.data.subarray(i, i + 0x8000))
    html = html.split(`cid:${a.contentId}`).join(`data:${a.mimeType};base64,${btoa(s)}`)
  }
  const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: false, FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'], FORBID_ATTR: ['onerror', 'onload'] })
  if (allowRemote) return clean
  return clean.replace(/(<img[^>]+src=)(["'])https?:[^"']*\2/gi, '$1$2data:image/gif;base64,R0lGODlhAQABAAAAACw=$2').replace(/url\((['"]?)https?:[^)]*\1\)/gi, 'none')
}
export const hasRemote = (m: Mail) => /<img[^>]+src=["']https?:/i.test(m.html ?? '')

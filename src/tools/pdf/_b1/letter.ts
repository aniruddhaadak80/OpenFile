/* Cover letter PDF (pdf-lib + embedded Liberation Sans) and application bundling. Pure, testable. */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export interface Letter {
  name: string; title?: string; email?: string; phone?: string; address?: string; links?: string
  recipient?: string; company?: string; companyAddress?: string; date: string; subject?: string
  greeting: string; body: string; closing: string
}
export type LetterStyle = 'classic' | 'modern' | 'minimal'

export const TEMPLATES: { id: string; label: string; subject: string; body: string }[] = [
  { id: 'general', label: 'Experienced professional', subject: 'Application for {role}', body: `I am writing to apply for the {role} position at {company}. With several years of experience in my field, I have built the skills and judgement this role calls for, and I would be glad to bring them to your team.\n\nIn my current role I have led projects from first idea to delivery, worked closely with colleagues across teams, and kept a steady focus on results that matter to customers. I enjoy solving hard problems and explaining them in simple words.\n\nWhat draws me to {company} is the way you combine quality with a clear mission. I would welcome the chance to discuss how my experience can help you reach your goals. Thank you for your time and consideration.` },
  { id: 'graduate', label: 'Graduate or internship', subject: 'Application for {role}', body: `I am excited to apply for the {role} role at {company}. I recently completed my degree, where I gained a solid grounding in the core skills of this field through coursework, projects and teamwork.\n\nDuring my studies I built practical projects, took part in competitions and learned to pick up new tools quickly. I am curious, reliable and comfortable asking questions, and I learn best by doing real work alongside experienced people.\n\nI would be grateful for the opportunity to grow with {company} and contribute from day one. My resume is attached, and I would be happy to talk at any time that suits you.` },
  { id: 'change', label: 'Career change', subject: 'Application for {role}', body: `I am writing to express my interest in the {role} position at {company}. Although my background is in a different field, the skills I have built there carry over well, and I have spent the past year preparing for this move.\n\nIn my previous work I managed priorities under pressure, communicated with many kinds of people and took responsibility for outcomes. Alongside that, I have completed training and hands-on projects to build the specific skills this role needs.\n\nI bring a fresh point of view and a strong will to learn. I would value the chance to show how my experience can add to your team, and I look forward to hearing from you.` },
]

const wrap = (s: string, f: PDFFont, size: number, max: number) => {
  const out: string[] = []
  for (const para of s.split('\n')) { let cur = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const t = cur ? cur + ' ' + w : w; if (f.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w } else cur = t } out.push(cur) }
  return out
}

export async function renderLetter(l: Letter, fonts: { regular: Uint8Array; bold: Uint8Array; fontkit: any }, o: { style: LetterStyle; accent: [number, number, number]; size: 'a4' | 'letter'; fontSize: number }) {
  const doc = await PDFDocument.create(); doc.registerFontkit(fonts.fontkit)
  const F = await doc.embedFont(fonts.regular, { subset: true }), B = await doc.embedFont(fonts.bold, { subset: true })
  const [W, H] = o.size === 'a4' ? [595.28, 841.89] : [612, 792]
  const A = rgb(...o.accent), ink = rgb(0.1, 0.11, 0.13), mute = rgb(0.42, 0.44, 0.48)
  const M = 64, fs = o.fontSize, lh = fs * 1.5
  let page = doc.addPage([W, H]); let y = H - M
  const draw = (p: PDFPage, s: string, x: number, yy: number, size: number, f: PDFFont, c = ink) => p.drawText(s, { x, y: yy, size, font: f, color: c })
  const contact = [l.email, l.phone, l.address, ...(l.links ?? '').split(/[\n,]+/).map((s) => s.trim())].filter(Boolean) as string[]
  if (o.style === 'modern') {
    page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: A })
    draw(page, l.name, M, H - 58, 24, B, rgb(1, 1, 1)); if (l.title) draw(page, l.title, M, H - 80, 11, F, rgb(1, 1, 1))
    const line = contact.join('  ·  ')
    wrap(line, F, 8.5, W - 2 * M).forEach((s, i) => draw(page, s, M, H - 98 - i * 10, 8.5, F, rgb(1, 1, 1)))
    y = H - 150
  } else if (o.style === 'classic') {
    const nw = B.widthOfTextAtSize(l.name, 20); draw(page, l.name, (W - nw) / 2, y - 10, 20, B)
    if (l.title) { const tw = F.widthOfTextAtSize(l.title, 10.5); draw(page, l.title, (W - tw) / 2, y - 27, 10.5, F, mute) }
    const line = contact.join('  |  ')
    const rows = wrap(line, F, 8.5, W - 2 * M)
    rows.forEach((s, i) => { const w = F.widthOfTextAtSize(s, 8.5); draw(page, s, (W - w) / 2, y - 42 - i * 11, 8.5, F, mute) })
    y -= 50 + rows.length * 11
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: A })
    y -= 30
  } else {
    draw(page, l.name, M, y - 8, 17, B); y -= 24
    if (l.title) { draw(page, l.title, M, y, 10, F, A); y -= 15 }
    contact.forEach((c) => { draw(page, c, M, y, 8.5, F, mute); y -= 11 })
    y -= 22
  }
  const block = (lines: string[], f: PDFFont = F, c = ink) => { for (const s of lines) { draw(page, s, M, y, fs, f, c); y -= lh * 0.9 } }
  block([l.date], F, mute); y -= lh * 0.5
  const to = [l.recipient, l.company, ...(l.companyAddress ?? '').split('\n')].map((s) => s?.trim()).filter(Boolean) as string[]
  if (to.length) { block(to); y -= lh * 0.6 }
  if (l.subject) { block(wrap(l.subject, B, fs, W - 2 * M), B); y -= lh * 0.4 }
  block([l.greeting]); y -= lh * 0.3
  for (const para of l.body.split(/\n\s*\n/)) {
    for (const s of wrap(para.trim(), F, fs, W - 2 * M)) { if (y < M + lh) { page = doc.addPage([W, H]); y = H - M } draw(page, s, M, y, fs, F); y -= lh }
    y -= lh * 0.5
  }
  if (y < M + lh * 4) { page = doc.addPage([W, H]); y = H - M }
  block([l.closing]); y -= lh * 1.8
  block([l.name], B)
  doc.setTitle(`Cover letter - ${l.name}`); doc.setAuthor(l.name); doc.setCreator('OpenFile Cover Letter Builder')
  return doc.save()
}

export interface Enclosure { name: string; bytes: Uint8Array; kind: 'pdf' | 'jpg' | 'png' }
/** Letter first, then each enclosure (PDF pages copied, images placed on A4), with bookmarks. */
export async function bundleApplication(letter: Uint8Array, encl: Enclosure[], o: { title: string; author: string; bookmarks: boolean }) {
  const out = await PDFDocument.load(letter)
  const marks: { title: string; page: number; level: number }[] = [{ title: 'Cover letter', page: 0, level: 0 }]
  for (const e of encl) {
    const start = out.getPageCount()
    if (e.kind === 'pdf') { const src = await PDFDocument.load(e.bytes, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)) }
    else {
      const img = e.kind === 'png' ? await out.embedPng(e.bytes) : await out.embedJpg(e.bytes)
      let [W, H] = [595.28, 841.89]; if (img.width > img.height) [W, H] = [H, W]
      const p = out.addPage([W, H]); const s = Math.min((W - 48) / img.width, (H - 48) / img.height)
      p.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s })
    }
    marks.push({ title: e.name.replace(/\.[^.]+$/, ''), page: start, level: 0 })
  }
  if (o.bookmarks && encl.length) { const { writeOutline } = await import('./core'); writeOutline(out, marks, true) }
  out.setTitle(o.title); out.setAuthor(o.author)
  return out.save()
}

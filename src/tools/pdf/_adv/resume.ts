/* Resume model + ATS-friendly jsPDF renderer (Modern / Classic / Minimal). Pure: no React. */
import type { jsPDF } from 'jspdf'
import { hexRgb } from './color'

export type ResumeTemplate = 'modern' | 'classic' | 'minimal'
export type SectionKey = 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'links'
export interface Experience { id: string; role: string; company: string; location: string; start: string; end: string; current: boolean; bullets: string }
export interface Education { id: string; degree: string; school: string; location: string; start: string; end: string; grade: string; details: string }
export interface SkillGroup { id: string; group: string; items: string }
export interface Project { id: string; name: string; link: string; tech: string; description: string }
export interface Cert { id: string; name: string; issuer: string; date: string; link: string }
export interface LinkItem { id: string; label: string; url: string }
export interface Resume {
  template: ResumeTemplate; accent: string; pageSize: 'a4' | 'letter'
  contact: { name: string; title: string; email: string; phone: string; location: string; website: string; linkedin: string; github: string }
  summary: string
  experience: Experience[]; education: Education[]; skills: SkillGroup[]; projects: Project[]; certifications: Cert[]; links: LinkItem[]
  order: SectionKey[]
  hidden: SectionKey[]
}

export const SECTION_TITLES: Record<SectionKey, string> = { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', projects: 'Projects', certifications: 'Certifications', links: 'Links' }
export const DEFAULT_ORDER: SectionKey[] = ['summary', 'experience', 'projects', 'skills', 'education', 'certifications', 'links']

const rid = () => Math.random().toString(36).slice(2, 9)
export function emptyResume(): Resume {
  return {
    template: 'modern', accent: '#2563eb', pageSize: 'a4',
    contact: { name: '', title: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '' },
    summary: '', experience: [], education: [], skills: [], projects: [], certifications: [], links: [], order: [...DEFAULT_ORDER], hidden: [],
  }
}
export function sampleResume(): Resume {
  return {
    ...emptyResume(),
    contact: { name: 'Priya Sharma', title: 'Full-Stack Software Engineer', email: 'priya.sharma@example.com', phone: '+91 98765 43210', location: 'Bengaluru, India', website: 'priyasharma.dev', linkedin: 'linkedin.com/in/priyasharma', github: 'github.com/priyasharma' },
    summary: 'Full-stack engineer with 4+ years of experience building fast, accessible web products with React, TypeScript and Node.js. Led the rebuild of a checkout flow used by 2M+ monthly customers and mentored a team of five. Passionate about developer experience, performance and open source.',
    experience: [
      { id: rid(), role: 'Senior Software Engineer', company: 'Flipkart', location: 'Bengaluru', start: 'Jan 2024', end: '', current: true, bullets: 'Led a 5-engineer squad rebuilding checkout in React + TypeScript, cutting page load time by 38%\nDesigned a feature-flag platform adopted by 40+ teams, reducing risky releases by 60%\nMentored 3 junior engineers; ran weekly frontend architecture reviews' },
      { id: rid(), role: 'Software Engineer', company: 'Razorpay', location: 'Bengaluru', start: 'Jul 2021', end: 'Dec 2023', current: false, bullets: 'Built merchant dashboard analytics with Node.js, PostgreSQL and React Query\nImproved API p95 latency from 420ms to 160ms through caching and query optimisation\nShipped accessibility fixes that took the dashboard to WCAG 2.1 AA' },
    ],
    projects: [
      { id: rid(), name: 'OpenFile', link: 'github.com/priyasharma/openfile', tech: 'React, WebAssembly, pdf-lib', description: 'Privacy-first file toolkit that runs entirely in the browser; 3k+ GitHub stars' },
      { id: rid(), name: 'TypeScript Handbook (Hindi)', link: 'ts-hindi.dev', tech: 'Docusaurus', description: 'Community translation of the TypeScript handbook read by 50k+ developers' },
    ],
    skills: [
      { id: rid(), group: 'Languages', items: 'TypeScript, JavaScript, Python, SQL, Go' },
      { id: rid(), group: 'Frontend', items: 'React, Next.js, Tailwind CSS, Vite, Testing Library' },
      { id: rid(), group: 'Backend & Cloud', items: 'Node.js, PostgreSQL, Redis, Docker, AWS, GitHub Actions' },
    ],
    education: [{ id: rid(), degree: 'B.Tech in Computer Science & Engineering', school: 'Jadavpur University', location: 'Kolkata', start: '2017', end: '2021', grade: 'CGPA 8.7/10', details: 'Coursework: Data Structures, Operating Systems, Distributed Systems' }],
    certifications: [{ id: rid(), name: 'AWS Certified Developer – Associate', issuer: 'Amazon Web Services', date: '2023', link: '' }],
    links: [],
  }
}

export function renderResume(doc: jsPDF, family: string, r: Resume) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const tpl = r.template
  const M = tpl === 'minimal' ? 54 : 46
  const accent = hexRgb(r.accent)
  const dark: [number, number, number] = [20, 23, 33], body: [number, number, number] = [45, 50, 64], mid: [number, number, number] = [104, 110, 128], rule: [number, number, number] = [214, 218, 228]
  const F = (style: 'normal' | 'bold' | 'italic', size: number, color = body) => { doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(...color) }
  const LH = 1.32
  let y = M
  const ensure = (h: number) => { if (y + h > H - M) { doc.addPage(); y = M } }
  const width = W - 2 * M
  const c = r.contact
  const url = (s: string) => (/^https?:\/\//i.test(s) ? s : s.includes('@') && !s.includes('/') ? `mailto:${s}` : `https://${s}`)

  // ---------- header ----------
  const contactBits = [c.email, c.phone, c.location, c.website, c.linkedin, c.github].filter(Boolean)
  if (tpl === 'classic') {
    F('bold', 22, dark); doc.text(c.name || 'Your Name', W / 2, y + 6, { align: 'center' }); y += 26
    if (c.title) { F('normal', 11, accent); doc.text(c.title, W / 2, y, { align: 'center' }); y += 16 }
    F('normal', 8.8, mid)
    y = contactLine(contactBits, y, 'center')
    y += 6
    doc.setDrawColor(...dark); doc.setLineWidth(0.9); doc.line(M, y, W - M, y); y += 16
  } else if (tpl === 'modern') {
    doc.setFillColor(...accent); doc.rect(0, 0, 8, H, 'F')
    F('bold', 24, dark); doc.text(c.name || 'Your Name', M, y + 10); y += 28
    if (c.title) { F('bold', 11.5, accent); doc.text(c.title, M, y); y += 16 }
    F('normal', 8.8, mid)
    y = contactLine(contactBits, y, 'left')
    y += 12
  } else {
    F('normal', 21, dark); doc.text(c.name || 'Your Name', M, y + 8); y += 24
    if (c.title) { F('normal', 10.5, mid); doc.text(c.title, M, y); y += 15 }
    F('normal', 8.5, mid)
    y = contactLine(contactBits, y, 'left')
    y += 14
  }

  function contactLine(bits: string[], yy: number, align: 'left' | 'center') {
    const sep = '   |   '
    // wrap into rows that fit
    const rows: string[][] = [[]]
    for (const b of bits) {
      const row = rows[rows.length - 1]
      const test = [...row, b].join(sep)
      if (row.length && doc.getTextWidth(test) > width) rows.push([b]); else row.push(b)
    }
    for (const row of rows) {
      if (!row.length) continue
      const full = row.join(sep)
      let x = align === 'center' ? (W - doc.getTextWidth(full)) / 2 : M
      row.forEach((b, i) => {
        const isLink = b.includes('@') || b.includes('.') && !/^\+?[\d\s()-]+$/.test(b) && b !== c.location
        if (isLink) doc.textWithLink(b, x, yy, { url: url(b) }); else doc.text(b, x, yy)
        x += doc.getTextWidth(b)
        if (i < row.length - 1) { doc.text(sep, x, yy); x += doc.getTextWidth(sep) }
      })
      yy += 12
    }
    return yy
  }

  const heading = (title: string) => {
    ensure(40)
    y += 6
    if (tpl === 'modern') {
      F('bold', 11, accent); doc.setCharSpace(1.2); doc.text(title.toUpperCase(), M, y); doc.setCharSpace(0)
      doc.setDrawColor(...accent); doc.setLineWidth(1.6); doc.line(M, y + 5, M + 26, y + 5)
      doc.setDrawColor(...rule); doc.setLineWidth(0.5); doc.line(M + 30, y + 5, W - M, y + 5)
      y += 19
    } else if (tpl === 'classic') {
      F('bold', 11, dark); doc.setCharSpace(1); doc.text(title.toUpperCase(), M, y); doc.setCharSpace(0)
      doc.setDrawColor(...rule); doc.setLineWidth(0.6); doc.line(M, y + 4, W - M, y + 4)
      y += 17
    } else {
      F('bold', 8.5, mid); doc.setCharSpace(2); doc.text(title.toUpperCase(), M, y); doc.setCharSpace(0)
      y += 15
    }
  }
  const para = (text: string, size = 9.6, color = body, indent = 0) => {
    F('normal', size, color)
    const lines = doc.splitTextToSize(text, width - indent) as string[]
    for (const l of lines) { ensure(size * LH); doc.text(l, M + indent, y); y += size * LH }
  }
  const bullets = (text: string) => {
    const items = text.split('\n').map((s) => s.replace(/^\s*[-•*▪◦]\s*/, '').trim()).filter(Boolean)
    for (const it of items) {
      F('normal', 9.6, body)
      const lines = doc.splitTextToSize(it, width - 14) as string[]
      ensure(9.6 * LH)
      doc.setFillColor(...(tpl === 'modern' ? accent : mid)); doc.circle(M + 4, y - 3.2, 1.3, 'F')
      for (const l of lines) { ensure(9.6 * LH); doc.text(l, M + 13, y); y += 9.6 * LH }
      y += 1.5
    }
  }
  /** title row: left bold + right muted (dates) */
  const titleRow = (left: string, right: string, sub?: string, subRight?: string) => {
    ensure(30)
    F('bold', 10.5, dark)
    const rw = right ? (F('normal', 9, mid), doc.getTextWidth(right)) : 0
    F('bold', 10.5, dark)
    const l = doc.splitTextToSize(left, width - rw - 12) as string[]
    doc.text(l, M, y)
    if (right) { F('normal', 9, mid); doc.text(right, W - M, y, { align: 'right' }) }
    y += 10.5 * LH * l.length
    if (sub || subRight) {
      F(tpl === 'minimal' ? 'normal' : 'italic', 9.6, tpl === 'modern' ? accent : mid)
      if (sub) doc.text(sub, M, y)
      if (subRight) { F('normal', 9, mid); doc.text(subRight, W - M, y, { align: 'right' }) }
      y += 9.6 * LH
    }
    y += 2
  }
  const range = (s: string, e: string, cur?: boolean) => [s, cur ? 'Present' : e].filter(Boolean).join(' – ')

  for (const key of r.order) {
    if (r.hidden.includes(key)) continue
    if (key === 'summary' && r.summary.trim()) { heading(SECTION_TITLES.summary); para(r.summary); y += 6 }
    if (key === 'experience' && r.experience.length) {
      heading(SECTION_TITLES.experience)
      for (const e of r.experience) { titleRow(e.role || 'Role', range(e.start, e.end, e.current), e.company, e.location); if (e.bullets.trim()) bullets(e.bullets); y += 5 }
    }
    if (key === 'projects' && r.projects.length) {
      heading(SECTION_TITLES.projects)
      for (const p of r.projects) {
        ensure(30)
        F('bold', 10.5, dark); doc.text(p.name || 'Project', M, y)
        let x = M + doc.getTextWidth(p.name || 'Project')
        if (p.tech) { F('normal', 9, mid); const t = `  ·  ${p.tech}`; const fit = doc.splitTextToSize(t, W - M - x - (p.link ? 120 : 0))[0] as string; doc.text(fit, x, y); x += doc.getTextWidth(fit) }
        if (p.link) { F('normal', 9, accent); const lk = p.link.replace(/^https?:\/\//, ''); doc.textWithLink(lk, W - M - doc.getTextWidth(lk), y, { url: url(p.link) }) }
        y += 10.5 * LH + 1
        if (p.description.trim()) bullets(p.description)
        y += 4
      }
    }
    if (key === 'skills' && r.skills.length) {
      heading(SECTION_TITLES.skills)
      for (const s of r.skills) {
        ensure(14)
        if (s.group) {
          F('bold', 9.6, dark); const g = `${s.group}: `; const gw = Math.min(doc.getTextWidth(g), 130)
          doc.text(g, M, y)
          F('normal', 9.6, body)
          const lines = doc.splitTextToSize(s.items, width - gw) as string[]
          lines.forEach((l, i) => { if (i) ensure(9.6 * LH); doc.text(l, M + gw, y); y += 9.6 * LH })
        } else para(s.items)
        y += 2
      }
      y += 4
    }
    if (key === 'education' && r.education.length) {
      heading(SECTION_TITLES.education)
      for (const e of r.education) {
        titleRow(e.degree || 'Degree', range(e.start, e.end), [e.school, e.location].filter(Boolean).join(', '), e.grade)
        if (e.details.trim()) para(e.details, 9.2, mid)
        y += 5
      }
    }
    if (key === 'certifications' && r.certifications.length) {
      heading(SECTION_TITLES.certifications)
      for (const ct of r.certifications) {
        ensure(14)
        F('bold', 9.8, dark); doc.text(ct.name || 'Certification', M, y)
        const nx = M + doc.getTextWidth(ct.name || 'Certification')
        if (ct.issuer) { F('normal', 9.4, mid); doc.text(` — ${ct.issuer}`, nx, y) }
        if (ct.date) { F('normal', 9, mid); doc.text(ct.date, W - M, y, { align: 'right' }) }
        if (ct.link) { y += 11; F('normal', 8.8, accent); doc.textWithLink(ct.link.replace(/^https?:\/\//, ''), M, y, { url: url(ct.link) }) }
        y += 9.8 * LH + 2
      }
      y += 4
    }
    if (key === 'links' && r.links.length) {
      heading(SECTION_TITLES.links)
      for (const l of r.links) {
        ensure(14)
        F('bold', 9.6, dark); const lab = l.label ? `${l.label}: ` : ''; doc.text(lab, M, y)
        F('normal', 9.6, accent); doc.textWithLink(l.url.replace(/^https?:\/\//, ''), M + doc.getTextWidth(lab), y, { url: url(l.url) })
        y += 9.6 * LH + 1
      }
    }
  }

  const n = doc.getNumberOfPages()
  if (tpl === 'modern') for (let p = 2; p <= n; p++) { doc.setPage(p); doc.setFillColor(...accent); doc.rect(0, 0, 8, H, 'F') }
  if (n > 1) for (let p = 1; p <= n; p++) { doc.setPage(p); F('normal', 8, mid); doc.text(`${c.name || ''}  ·  ${p}/${n}`, W - M, H - 24, { align: 'right' }) }
  doc.setProperties({ title: `${c.name || 'Resume'} — Resume`, subject: c.title, author: c.name, keywords: r.skills.map((s) => s.items).join(', '), creator: 'OpenFile Resume Builder' })
}

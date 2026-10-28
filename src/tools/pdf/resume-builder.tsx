import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Upload, FileJson, Sparkles, Trash2, Plus, ChevronUp, ChevronDown, Eye, EyeOff, User, AlignLeft, Briefcase, GraduationCap, Wrench, FolderGit2, Award, Link2, ListOrdered, PencilLine, RotateCcw } from 'lucide-react'
import { Button, Card, Field, Input, Textarea, Segmented, Switch, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, baseName } from '@/lib/files'
import { newDoc, LivePdfPreview } from './_adv/jspdf'
import { renderResume, emptyResume, sampleResume, SECTION_TITLES, DEFAULT_ORDER, type Resume, type SectionKey, type ResumeTemplate } from './_adv/resume'

const KEY = 'openfile.resume.v1'
const ACCENTS = ['#2563eb', '#7c3aed', '#0d9488', '#dc2626', '#ea580c', '#111827']
const ICONS: Record<SectionKey, React.ElementType> = { summary: AlignLeft, experience: Briefcase, education: GraduationCap, skills: Wrench, projects: FolderGit2, certifications: Award, links: Link2 }
const rid = () => Math.random().toString(36).slice(2, 9)

function normalize(r: any): Resume {
  const base = emptyResume()
  const out: Resume = { ...base, ...r, contact: { ...base.contact, ...(r?.contact ?? {}) } }
  for (const k of ['experience', 'education', 'skills', 'projects', 'certifications', 'links'] as const) out[k] = Array.isArray(r?.[k]) ? r[k].map((x: any) => ({ id: rid(), ...x })) : []
  const order = Array.isArray(r?.order) ? r.order.filter((k: string) => DEFAULT_ORDER.includes(k as SectionKey)) : []
  out.order = [...order, ...DEFAULT_ORDER.filter((k) => !order.includes(k))]
  out.hidden = Array.isArray(r?.hidden) ? r.hidden : []
  return out
}
function loadSaved(): Resume { try { const s = localStorage.getItem(KEY); if (s) return normalize(JSON.parse(s)) } catch { /* ignore */ } return emptyResume() }

export default function ResumeBuilder() {
  const [r, setR] = useState<Resume>(loadSaved)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { const h = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(r)); setSavedAt(Date.now()) } catch { /* quota */ } }, 500); return () => clearTimeout(h) }, [r])

  const set = <K extends keyof Resume>(k: K, v: Resume[K]) => setR((s) => ({ ...s, [k]: v }))
  const setC = (k: keyof Resume['contact'], v: string) => setR((s) => ({ ...s, contact: { ...s.contact, [k]: v } }))

  async function build() { const { doc, family } = await newDoc(r.pageSize); renderResume(doc, family, r); return doc.output('blob') as Blob }
  async function download() {
    setBusy(true)
    try { downloadBlob(await build(), `${(r.contact.name || 'resume').trim().replace(/\s+/g, '_')}_Resume.pdf`, 'application/pdf'); toast('Resume downloaded') }
    catch (e: any) { toast(e?.message || 'Could not create PDF', 'error') } finally { setBusy(false) }
  }
  function exportJson() { const { ...data } = r; downloadBlob(JSON.stringify(data, null, 2), `${(r.contact.name || 'resume').replace(/\s+/g, '_')}.resume.json`, 'application/json') }
  async function importJson(f: File) {
    try { setR(normalize(JSON.parse(await f.text()))); toast(`Imported ${baseName(f.name)}`) } catch { toast('That file is not a valid resume JSON', 'error') }
  }
  const moveSection = (k: SectionKey, d: -1 | 1) => setR((s) => { const o = [...s.order]; const i = o.indexOf(k), j = i + d; if (j < 0 || j >= o.length) return s; [o[i], o[j]] = [o[j], o[i]]; return { ...s, order: o } })
  const toggleHidden = (k: SectionKey) => setR((s) => ({ ...s, hidden: s.hidden.includes(k) ? s.hidden.filter((x) => x !== k) : [...s.hidden, k] }))

  const sectionEditor = (k: SectionKey) => {
    switch (k) {
      case 'summary': return (
        <Field label="Professional summary" hint={`${r.summary.length} chars`}>
          <Textarea value={r.summary} onChange={(e) => set('summary', e.target.value)} placeholder="2–4 sentences: who you are, your strongest results, what you're looking for." className="min-h-24 font-sans" />
        </Field>
      )
      case 'experience': return <List items={r.experience} onChange={(v) => set('experience', v)} addLabel="Add experience"
        make={() => ({ id: rid(), role: '', company: '', location: '', start: '', end: '', current: false, bullets: '' })}
        title={(e) => e.role || e.company ? `${e.role}${e.company ? ' · ' + e.company : ''}` : 'New position'}
        render={(e, u) => (<>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={e.role} onChange={(x) => u({ role: x.target.value })} placeholder="Job title" />
            <Input value={e.company} onChange={(x) => u({ company: x.target.value })} placeholder="Company" />
            <Input value={e.start} onChange={(x) => u({ start: x.target.value })} placeholder="Start (e.g. Jan 2023)" />
            <Input value={e.current ? 'Present' : e.end} disabled={e.current} onChange={(x) => u({ end: x.target.value })} placeholder="End" />
            <Input value={e.location} onChange={(x) => u({ location: x.target.value })} placeholder="Location / Remote" />
            <div className="flex items-center"><Switch checked={e.current} onChange={(v) => u({ current: v })} label={<span className="text-sm">I work here now</span>} /></div>
          </div>
          <Textarea value={e.bullets} onChange={(x) => u({ bullets: x.target.value })} placeholder={'One achievement per line — start with a verb, add numbers\nLed …\nImproved … by 30%'} className="min-h-24 font-sans" />
        </>)} />
      case 'education': return <List items={r.education} onChange={(v) => set('education', v)} addLabel="Add education"
        make={() => ({ id: rid(), degree: '', school: '', location: '', start: '', end: '', grade: '', details: '' })}
        title={(e) => e.degree || e.school || 'New education'}
        render={(e, u) => (<>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={e.degree} onChange={(x) => u({ degree: x.target.value })} placeholder="Degree / qualification" />
            <Input value={e.school} onChange={(x) => u({ school: x.target.value })} placeholder="School / university" />
            <Input value={e.start} onChange={(x) => u({ start: x.target.value })} placeholder="Start year" />
            <Input value={e.end} onChange={(x) => u({ end: x.target.value })} placeholder="End year (or expected)" />
            <Input value={e.location} onChange={(x) => u({ location: x.target.value })} placeholder="Location" />
            <Input value={e.grade} onChange={(x) => u({ grade: x.target.value })} placeholder="Grade (CGPA / %)" />
          </div>
          <Input value={e.details} onChange={(x) => u({ details: x.target.value })} placeholder="Honours, coursework, thesis… (optional)" />
        </>)} />
      case 'skills': return <List items={r.skills} onChange={(v) => set('skills', v)} addLabel="Add skill group"
        make={() => ({ id: rid(), group: '', items: '' })}
        title={(s) => s.group || 'Skill group'}
        render={(s, u) => (
          <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <Input value={s.group} onChange={(x) => u({ group: x.target.value })} placeholder="Group (e.g. Languages)" />
            <Input value={s.items} onChange={(x) => u({ items: x.target.value })} placeholder="Comma-separated skills" />
          </div>
        )} />
      case 'projects': return <List items={r.projects} onChange={(v) => set('projects', v)} addLabel="Add project"
        make={() => ({ id: rid(), name: '', link: '', tech: '', description: '' })}
        title={(p) => p.name || 'New project'}
        render={(p, u) => (<>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={p.name} onChange={(x) => u({ name: x.target.value })} placeholder="Project name" />
            <Input value={p.link} onChange={(x) => u({ link: x.target.value })} placeholder="Link (github.com/…)" />
          </div>
          <Input value={p.tech} onChange={(x) => u({ tech: x.target.value })} placeholder="Tech stack" />
          <Textarea value={p.description} onChange={(x) => u({ description: x.target.value })} placeholder="What it does & impact — one point per line" className="min-h-16 font-sans" />
        </>)} />
      case 'certifications': return <List items={r.certifications} onChange={(v) => set('certifications', v)} addLabel="Add certification"
        make={() => ({ id: rid(), name: '', issuer: '', date: '', link: '' })}
        title={(c) => c.name || 'New certification'}
        render={(c, u) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={c.name} onChange={(x) => u({ name: x.target.value })} placeholder="Certification" />
            <Input value={c.issuer} onChange={(x) => u({ issuer: x.target.value })} placeholder="Issuer" />
            <Input value={c.date} onChange={(x) => u({ date: x.target.value })} placeholder="Date" />
            <Input value={c.link} onChange={(x) => u({ link: x.target.value })} placeholder="Credential URL (optional)" />
          </div>
        )} />
      case 'links': return <List items={r.links} onChange={(v) => set('links', v)} addLabel="Add link"
        make={() => ({ id: rid(), label: '', url: '' })}
        title={(l) => l.label || l.url || 'New link'}
        render={(l, u) => (
          <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <Input value={l.label} onChange={(x) => u({ label: x.target.value })} placeholder="Label (e.g. Portfolio)" />
            <Input value={l.url} onChange={(x) => u({ url: x.target.value })} placeholder="URL" />
          </div>
        )} />
    }
  }

  const editor = (
    <div className="space-y-4">
      <Card className="space-y-3">
        <Head icon={User} title="Contact" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={r.contact.name} onChange={(e) => setC('name', e.target.value)} placeholder="Full name" className="font-semibold" />
          <Input value={r.contact.title} onChange={(e) => setC('title', e.target.value)} placeholder="Headline (e.g. Data Analyst)" />
          <Input value={r.contact.email} onChange={(e) => setC('email', e.target.value)} placeholder="Email" type="email" />
          <Input value={r.contact.phone} onChange={(e) => setC('phone', e.target.value)} placeholder="Phone" />
          <Input value={r.contact.location} onChange={(e) => setC('location', e.target.value)} placeholder="City, Country" />
          <Input value={r.contact.website} onChange={(e) => setC('website', e.target.value)} placeholder="Website / portfolio" />
          <Input value={r.contact.linkedin} onChange={(e) => setC('linkedin', e.target.value)} placeholder="linkedin.com/in/…" />
          <Input value={r.contact.github} onChange={(e) => setC('github', e.target.value)} placeholder="github.com/…" />
        </div>
      </Card>
      {r.order.map((k, i) => {
        const hidden = r.hidden.includes(k)
        return (
          <motion.div layout key={k} transition={{ type: 'spring', stiffness: 400, damping: 34 }}>
            <Card className={cn('space-y-3 transition', hidden && 'opacity-60')}>
              <Head icon={ICONS[k]} title={SECTION_TITLES[k]} right={
                <div className="flex items-center gap-0.5">
                  <IconBtn title="Move section up" disabled={i === 0} onClick={() => moveSection(k, -1)}><ChevronUp className="size-4" /></IconBtn>
                  <IconBtn title="Move section down" disabled={i === r.order.length - 1} onClick={() => moveSection(k, 1)}><ChevronDown className="size-4" /></IconBtn>
                  <IconBtn title={hidden ? 'Show in PDF' : 'Hide from PDF'} onClick={() => toggleHidden(k)}>{hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</IconBtn>
                </div>
              } />
              {!hidden && sectionEditor(k)}
            </Card>
          </motion.div>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2">
        <Segmented value={r.template} onChange={(v: ResumeTemplate) => set('template', v)} options={[{ value: 'modern', label: 'Modern' }, { value: 'classic', label: 'Classic' }, { value: 'minimal', label: 'Minimal' }]} />
        <div className="flex items-center gap-1.5 px-1">
          {ACCENTS.map((a) => <button key={a} type="button" onClick={() => set('accent', a)} className={cn('size-5 rounded-full transition hover:scale-110 cursor-pointer', r.accent === a && 'ring-2 ring-offset-2 ring-offset-surface')} style={{ background: a, ['--tw-ring-color' as any]: a }} aria-label={`Accent ${a}`} />)}
          <label className="relative size-5 cursor-pointer overflow-hidden rounded-full border border-border" style={{ background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }} title="Custom colour"><input type="color" value={r.accent} onChange={(e) => set('accent', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></label>
        </div>
        <Segmented value={r.pageSize} onChange={(v: 'a4' | 'letter') => set('pageSize', v)} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} />
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" icon={<Sparkles className="size-4" />} onClick={() => { setR(sampleResume()); toast('Sample data loaded', 'info') }}>Sample</Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { if (confirm('Clear the whole resume? (Export JSON first if you want a backup.)')) setR(emptyResume()) }}>Clear</Button>
          <Button size="sm" variant="ghost" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Import</Button>
          <Button size="sm" variant="ghost" icon={<FileJson className="size-4" />} onClick={exportJson}>Export</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = '' }} />
          <Button size="sm" icon={<Download className="size-4" />} loading={busy} onClick={download}>Download PDF</Button>
        </div>
      </div>
      <div className="lg:hidden"><Segmented value={tab} onChange={setTab} options={[{ value: 'edit', label: <span className="inline-flex items-center gap-1"><PencilLine className="size-3.5" />Edit</span> }, { value: 'preview', label: <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />Preview</span> }]} /></div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn(tab === 'preview' && 'hidden lg:block')}>{editor}</div>
        <div className={cn('lg:sticky lg:top-24 lg:self-start', tab === 'edit' && 'hidden lg:block')}>
          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-border bg-surface-2/50 p-4 scrollbar-thin">
            <LivePdfPreview build={build} deps={[r]} />
          </div>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted"><ListOrdered className="size-3.5" />Single-column, real-text PDF that applicant tracking systems can parse.{savedAt && ' · Autosaved'}</p>
        </div>
      </div>
    </div>
  )
}

function Head({ icon: Icon, title, right }: { icon: React.ElementType; title: string; right?: React.ReactNode }) {
  return <div className="flex items-center gap-2"><div className="grid size-7 place-items-center rounded-lg bg-accent/10 text-accent"><Icon className="size-4" /></div><h3 className="font-semibold">{title}</h3><div className="ml-auto">{right}</div></div>
}
function IconBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="grid size-7 place-items-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-30 disabled:pointer-events-none cursor-pointer">{children}</button>
}

function List<T extends { id: string }>({ items, onChange, make, render, title, addLabel }: { items: T[]; onChange: (v: T[]) => void; make: () => T; render: (it: T, update: (p: Partial<T>) => void) => React.ReactNode; title: (it: T) => string; addLabel: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const move = (i: number, d: -1 | 1) => { const a = [...items]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a) }
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {items.map((it, i) => {
          const isOpen = open === it.id || items.length === 1
          return (
            <motion.div layout key={it.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-xl border border-border bg-surface-2/30">
              <div className="flex items-center gap-1 px-3 py-2">
                <button type="button" onClick={() => setOpen(isOpen && items.length > 1 ? null : it.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium cursor-pointer">{title(it)}</button>
                <IconBtn title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp className="size-4" /></IconBtn>
                <IconBtn title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ChevronDown className="size-4" /></IconBtn>
                <IconBtn title="Remove" onClick={() => onChange(items.filter((x) => x.id !== it.id))}><Trash2 className="size-4" /></IconBtn>
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="space-y-2 border-t border-border p-3">{render(it, (p) => onChange(items.map((x) => (x.id === it.id ? { ...x, ...p } : x))))}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </AnimatePresence>
      <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => { const n = make(); onChange([...items, n]); setOpen(n.id) }}>{addLabel}</Button>
    </div>
  )
}

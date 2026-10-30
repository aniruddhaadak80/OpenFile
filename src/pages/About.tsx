import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Cpu, Code2, MapPin, GraduationCap, Bot, GitPullRequest, Newspaper, ArrowUpRight, Heart } from 'lucide-react'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { catGroups, colsClass, evenCols, spanClass } from '@/lib/catgrid'
import { Github } from '@/components/Logo'
import { REPO_URL } from '@/components/Layout'
import { AUTHOR } from '@/lib/author'
import { SocialIcon } from '@/components/Author'
import { Aurora, GoldRing, Reveal, Stagger, StaggerItem, Magnetic, spotlightMove } from '@/components/motion'
import { setJsonLd, setPageMeta } from '@/lib/seo'
import { Button } from '@/components/ui'

export default function About() {
  useEffect(() => {
    setPageMeta('About | OpenFile', `OpenFile is an open-source workbench of ${TOOLS.length}+ file tools that run in your browser, made by ${AUTHOR.name}.`)
    setJsonLd('about', { '@context': 'https://schema.org', '@type': 'Person', name: AUTHOR.name, url: location.origin + import.meta.env.BASE_URL + 'about#author', image: location.origin + AUTHOR.photo, jobTitle: 'Open-source developer', homeLocation: { '@type': 'Place', name: AUTHOR.location }, sameAs: AUTHOR.links.map((l) => l.url) })
    return () => setJsonLd('about', null)
  }, [])
  useEffect(() => { if (location.hash === '#author') setTimeout(() => document.getElementById('author')?.scrollIntoView({ behavior: 'smooth' }), 120) }, [])
  const stack = ['React 19', 'TypeScript', 'Vite', 'Tailwind CSS 4', 'Framer Motion', 'pdf-lib', 'PDF.js', 'ffmpeg.wasm', 'Tesseract.js', 'Transformers.js', 'Kokoro TTS', 'IMG.LY background removal', 'fflate', 'SheetJS', 'docx and mammoth', 'Dexie', 'Vercel Functions']
  const facts = [
    { i: MapPin, t: 'From West Bengal, India', d: 'Kolkata area.' },
    { i: GraduationCap, t: 'B.Tech, Computer Science and Engineering', d: 'Class of 2026.' },
    { i: Bot, t: 'Agentic harnesses', d: 'Builds harnesses and production-grade agent skills.' },
    { i: GitPullRequest, t: 'Open source and hackathons', d: 'Active contributor and frequent hackathon builder: MLH Global Hack Week, Hacktoberfest and DEV challenges.' },
    { i: Newspaper, t: 'Daily AI news', d: 'Writes a daily AI news roundup on DEV.' },
  ]
  return (
    <div className="relative">
      {/* -------- intro -------- */}
      <section className="relative overflow-hidden">
        <Aurora density={30} />
        <div className="dot-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-20">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-xs font-bold uppercase tracking-widest text-accent">About OpenFile</motion.div>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Files are personal.<br /><span className="text-gradient">Your tools should be too.</span></motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6 max-w-3xl text-lg leading-relaxed text-muted">OpenFile is an open-source workbench of <span className="whitespace-nowrap">{TOOLS.length}+</span> tools for PDFs, images, video, audio, data and code. Instead of uploading documents to someone else's server, every tool runs inside your browser using WebAssembly, Canvas, Web Workers and on-device AI models.</motion.p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Stagger className="relative mt-8 grid gap-4 sm:mt-10 sm:grid-cols-3">
          {[[ShieldCheck, 'Zero uploads', 'Your files never touch a server.'], [Cpu, 'Local compute', 'Runs on your own device.'], [Code2, 'Open source', 'MIT licensed on GitHub.']].map(([I, t, d]: any) => (
            <StaggerItem key={t}><div onPointerMove={spotlightMove} className="spotlight flex h-full flex-col rounded-2xl border border-border bg-surface p-6"><span className="grid size-11 place-items-center rounded-xl bg-accent/10"><I className="size-5 text-accent" /></span><div className="mt-4 font-semibold">{t}</div><div className="mt-1 text-sm leading-relaxed text-muted">{d}</div></div></StaggerItem>
          ))}
        </Stagger>

        {/* -------- author -------- */}
        <section id="author" className="scroll-mt-24 pt-20 sm:pt-24">
          <Reveal>
            <div className="on-dark relative overflow-hidden rounded-[2rem] border border-border bg-black text-white">
              <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(520px 320px at 22% 40%, color-mix(in oklab, var(--accent-glow) 22%, transparent), transparent 70%)' }} />
              <div className="relative grid items-center gap-8 p-6 sm:p-10 md:grid-cols-[auto_1fr] md:gap-10 lg:p-12">
                <div className="mx-auto max-w-full">
                  <GoldRing size={300}>
                    <motion.img src={AUTHOR.photo} alt={`Portrait of ${AUTHOR.name}`} width={196} height={196} loading="lazy" decoding="async"
                      initial={{ scale: 0.9, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                      className="size-[196px] rounded-full object-cover" style={{ boxShadow: '0 0 0 3px var(--accent), 0 0 60px 8px color-mix(in oklab, var(--accent-glow) 50%, transparent)' }} />
                  </GoldRing>
                </div>
                <div className="min-w-0 text-center md:text-left">
                  <div className="text-xs font-bold uppercase tracking-widest text-accent">The author</div>
                  <h2 className="mt-2 font-display text-4xl font-bold tracking-tight sm:text-5xl">{AUTHOR.name}</h2>
                  <p className="mx-auto mt-3 max-w-xl text-lg text-white/75 md:mx-0">Open-source developer from West Bengal, India. I build agentic harnesses and production-grade agent skills, contribute to open source, and write daily AI news on DEV.</p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start">
                    {AUTHOR.links.map((l, i) => (
                      <motion.a key={l.id} href={l.url} target="_blank" rel="noreferrer me" initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.05 }}
                        className="group flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm transition hover:-translate-y-0.5 hover:border-accent hover:text-accent">
                        <SocialIcon id={l.id} className="size-4" />{l.label}<ArrowUpRight className="size-3 opacity-50 transition group-hover:opacity-100" />
                      </motion.a>
                    ))}
                  </div>
                </div>
              </div>
              <div className="relative grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
                {facts.map(({ i: I, t, d }, k) => (
                  <motion.div key={t} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: k * 0.06 }} className={`bg-black p-5 ${k === facts.length - 1 ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
                    <I className="size-5 text-accent" />
                    <div className="mt-3 text-sm font-semibold">{t}</div>
                    <div className="mt-1 text-xs leading-relaxed text-white/60">{d}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        {/* -------- inside -------- */}
        <section className="pt-20 sm:pt-24">
          <Reveal><h2 className="font-display text-2xl font-bold sm:text-3xl">What is inside</h2><p className="mt-2 text-muted">{TOOLS.length} tools in {CATEGORIES.length} categories. Pick one to see them all.</p></Reveal>
          {catGroups(CATEGORIES).map((group, gi) => { const lay = gi === 0 ? { base: 1, sm: 2, lg: 4 } : { base: 1, sm: 2, lg: evenCols(group.length, [5, 4, 3]) }; return group.length > 0 && (
          <Stagger key={gi} className={`${gi ? "mt-3" : "mt-6"} grid gap-3 ${colsClass(lay)}`}>
            {group.map((c, i) => (
              <StaggerItem key={c.id} className={spanClass(i, group.length, lay)}><Link to={`/category/${c.id}`} onPointerMove={spotlightMove} className="spotlight flex h-full min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3" style={{ ['--c' as string]: c.color }}><span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: c.color }} /><span className="truncate">{c.name}</span></span><span className="shrink-0 text-sm text-muted">{TOOLS.filter((t) => t.category === c.id).length} {TOOLS.filter((t) => t.category === c.id).length === 1 ? "tool" : "tools"}</span></Link></StaggerItem>
            ))}
          </Stagger>) })}
        </section>

        <section className="pt-20 sm:pt-24">
          <Reveal><h2 className="font-display text-2xl font-bold sm:text-3xl">Built with</h2><p className="mt-2 text-muted">Open web standards and open-source libraries, all running on your device.</p></Reveal>
          <Stagger className="mt-6 flex flex-wrap gap-2">{stack.map((s) => <StaggerItem key={s}><span className="block rounded-lg border border-border bg-surface px-3 py-1.5 text-sm transition hover:border-accent">{s}</span></StaggerItem>)}</Stagger>
        </section>

        <Reveal className="mt-20 sm:mt-24">
          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-semibold"><Heart className="size-4 text-accent" /> Contributions welcome</div>
              <p className="mt-2 text-sm text-muted">Found a bug or want a new tool? Open an issue or a pull request. Every tool is one file, so it is a friendly codebase to start with.</p>
            </div>
            <Magnetic><a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-block max-w-full"><Button icon={<Github className="size-4" />} className="max-w-full">Star on GitHub</Button></a></Magnetic>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

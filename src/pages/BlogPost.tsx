import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, useScroll, useSpring } from 'framer-motion'
import { ArrowLeft, Clock, Calendar, Share2, Check } from 'lucide-react'
import { POSTS, postBySlug, formatDate } from '@/blog/meta'
import { POST_BODIES } from '@/blog/posts'
import { PostTools } from '@/blog/demos'
import { Cover } from '@/blog/Cover'
import { PostCard } from '@/blog/PostCard'
import { setJsonLd, setPageMeta } from '@/lib/seo'
import { AuthorAvatar, SocialLinks } from '@/components/Author'
import { AUTHOR } from '@/lib/author'
import { copyText } from '@/lib/files'
import { cn } from '@/components/ui'
import NotFound from './NotFound'

export default function BlogPost() {
  const { slug = '' } = useParams()
  const post = postBySlug(slug)
  const Body = POST_BODIES[slug]
  const articleRef = useRef<HTMLElement>(null)
  const [toc, setToc] = useState<{ id: string; text: string; level: number }[]>([])
  const [active, setActive] = useState('')
  const [copied, setCopied] = useState(false)
  const { scrollYProgress } = useScroll({ target: articleRef, offset: ['start start', 'end end'] })
  const progress = useSpring(scrollYProgress, { stiffness: 160, damping: 30 })

  useEffect(() => {
    if (!post) return
    setPageMeta(`${post.title} | OpenFile Blog`, post.description)
    setJsonLd('post', { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.description, datePublished: post.date, author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.links[0].url }, keywords: post.tags.join(', ') })
    return () => setJsonLd('post', null)
  }, [slug])

  useEffect(() => {
    const el = articleRef.current
    if (!el) return
    const hs = [...el.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]')]
    setToc(hs.map((h) => ({ id: h.id, text: h.textContent || '', level: h.tagName === 'H3' ? 3 : 2 })))
    const io = new IntersectionObserver((entries) => { const v = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive(v.target.id) }, { rootMargin: '-80px 0px -65% 0px' })
    hs.forEach((h) => io.observe(h))
    return () => io.disconnect()
  }, [slug])

  if (!post || !Body) return <NotFound />
  const idx = POSTS.findIndex((p) => p.slug === slug)
  const more = [...POSTS.slice(idx + 1), ...POSTS.slice(0, idx)].filter((p) => p.tags.some((t) => post.tags.includes(t))).concat(POSTS.filter((p) => p.slug !== slug)).filter((p, i, a) => a.findIndex((x) => x.slug === p.slug) === i).slice(0, 3)
  const share = async () => {
    const url = location.href
    if (navigator.share) { try { await navigator.share({ title: post.title, url }); return } catch { /* cancelled */ } }
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
  }

  return (
    <div className="relative">
      <motion.div className="fixed inset-x-0 top-16 z-40 h-0.5 origin-left bg-gradient-brand" style={{ scaleX: progress }} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96" style={{ background: 'radial-gradient(700px 260px at 50% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent)' }} />
      <div className="relative mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> All posts</Link>
        <header className="mx-auto mt-6 max-w-3xl text-center">
          <div className="flex flex-wrap justify-center gap-1.5">{post.tags.map((t) => <Link key={t} to={`/blog?tag=${t}`} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent">#{t}</Link>)}</div>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">{post.title}</motion.h1>
          <p className="mt-4 text-lg text-muted">{post.description}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-2"><AuthorAvatar size={28} /> {AUTHOR.name}</span>
            <span className="flex items-center gap-1"><Calendar className="size-3.5" /><time dateTime={post.date}>{formatDate(post.date)}</time></span>
            <span className="flex items-center gap-1"><Clock className="size-3.5" />{post.minutes} min read</span>
            <button onClick={share} className="flex items-center gap-1 hover:text-fg cursor-pointer">{copied ? <Check className="size-3.5 text-success" /> : <Share2 className="size-3.5" />}{copied ? 'Link copied' : 'Share'}</button>
          </div>
        </header>
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-3xl border border-border shadow-glow">
          <Cover kind={post.cover} title={post.title} className="aspect-[2/1]" />
        </motion.div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
          <article ref={articleRef} className="docs-prose mx-auto w-full max-w-3xl">
            <Body />
            <PostTools slugs={post.tools} />
            <div className="not-prose mt-12 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-5">
              <AuthorAvatar size={56} />
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold">Written by {AUTHOR.name}</div>
                <div className="text-sm text-muted">{AUTHOR.tagline}. Builds agentic harnesses and agent skills, and writes daily AI news on DEV.</div>
              </div>
              <SocialLinks size="sm" />
            </div>
          </article>
          <aside className="hidden lg:block">
            <nav className="sticky top-24 text-sm" aria-label="On this page">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">On this page</div>
              <ul className="space-y-1 border-l border-border">
                {toc.map((h) => (
                  <li key={h.id}><a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${h.id}`) }}
                    className={cn('-ml-px block border-l-2 py-1 transition', h.level === 3 ? 'pl-6 text-xs' : 'pl-3', active === h.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>{h.text}</a></li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>

        <section className="mt-20">
          <h2 className="font-display text-2xl font-bold">Keep reading</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{more.map((p, i) => <PostCard key={p.slug} p={p} i={i} />)}</div>
        </section>
      </div>
    </div>
  )
}

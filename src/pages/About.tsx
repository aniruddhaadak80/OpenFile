import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Cpu, Code2, Heart } from 'lucide-react'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { Logo, Github } from '@/components/Logo'
import { REPO_URL } from '@/components/Layout'

export default function About() {
  useEffect(() => { document.title = 'About — OpenFile' }, [])
  const stack = ['React 19', 'TypeScript', 'Vite', 'Tailwind CSS 4', 'pdf-lib', 'PDF.js', 'ffmpeg.wasm', 'Tesseract.js', 'Transformers.js (Whisper)', 'IMG.LY background removal', 'fflate', 'SheetJS', 'docx / mammoth', 'Vercel Functions']
  return (
    <div className="mx-auto max-w-4xl px-4 pt-16 sm:px-6">
      <Logo size={56} />
      <h1 className="mt-6 font-display text-5xl font-bold tracking-tight">Files are personal.<br /><span className="text-gradient">Your tools should be too.</span></h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">OpenFile is an open-source workbench of {TOOLS.length}+ utilities for PDFs, images, video, audio, data and code. Instead of uploading documents to someone else’s server, every tool runs inside your browser using WebAssembly, Canvas, Web Workers and on-device AI models.</p>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {[[ShieldCheck, 'Zero uploads', 'Your files never touch a server.'], [Cpu, 'Local compute', 'WASM + WebGPU on your hardware.'], [Code2, 'Open source', 'MIT licensed on GitHub.']].map(([I, t, d]: any) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-5"><I className="size-6 text-accent" /><div className="mt-3 font-semibold">{t}</div><div className="text-sm text-muted">{d}</div></div>
        ))}
      </div>
      <h2 className="mt-16 font-display text-2xl font-bold">What’s inside</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((c) => <Link key={c.id} to={`/category/${c.id}`} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:border-accent"><span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: c.color }} />{c.name}</span><span className="text-sm text-muted">{TOOLS.filter((t) => t.category === c.id).length} tools</span></Link>)}
      </div>
      <h2 className="mt-16 font-display text-2xl font-bold">Built with</h2>
      <div className="mt-4 flex flex-wrap gap-2">{stack.map((s) => <span key={s} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">{s}</span>)}</div>
      <div className="mt-16 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-2 font-semibold"><Heart className="size-4 text-danger" /> Made by Aniruddha Adak</div>
        <p className="mt-2 text-sm text-muted">Found a bug or want a new tool? Open an issue or a pull request — contributions are very welcome.</p>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-fg px-4 py-2 text-sm font-medium text-bg"><Github className="size-4" /> aniruddhaadak80/OpenFile</a>
      </div>
    </div>
  )
}

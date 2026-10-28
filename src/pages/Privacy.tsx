import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, WifiOff, Eye, Database } from 'lucide-react'
import { Github } from '@/components/Logo'
import { setPageMeta } from '@/lib/seo'
import { REPO_URL } from '@/components/Layout'

export default function Privacy() {
  useEffect(() => { setPageMeta('Privacy | OpenFile', 'Short version: we never see your files. Everything is processed locally in your browser.') }, [])
  const s = [
    ['Your files stay on your device', 'All file processing happens locally in your browser. OpenFile has no file-upload endpoint, and files you open are held only in your tab’s memory until you close or reload it.'],
    ['Downloads of engines and models', 'Some tools fetch open-source processing engines (for example ffmpeg.wasm, Tesseract language data, or AI model weights) from public CDNs the first time you use them. Only the engine is downloaded, your file is never sent.'],
    ['Local storage', 'We store your theme, favorites, recent tools and saved Workspace recipes in your browser’s localStorage. You can clear them at any time from your browser settings.'],
    ['Optional server features', 'When deployed on Vercel, a few optional API routes exist (health check and fetching a public web page for HTML to PDF). They receive only the URL you type, never your files, and keep no logs beyond the hosting platform’s defaults.'],
    ['No accounts, no tracking', 'There are no accounts, cookies for advertising, or third-party trackers.'],
    ['Contact', 'Questions? Open an issue on the GitHub repository.'],
  ]
  const verify = [
    'Open your browser developer tools (F12) and pick the Network tab.',
    'Open any tool and drop a file.',
    'Run the tool. You will see no request that carries your file. Engines may download once.',
    'Turn off Wi-Fi and run the tool again. It still works.',
  ]
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <h1 className="font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Short version: we never see your files.</p>
        <div className="mt-10 space-y-8">{s.map(([h, p]) => <section key={h}><h2 className="text-lg font-semibold">{h}</h2><p className="mt-2 leading-relaxed text-muted">{p}</p></section>)}</div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-success/30 bg-success/5 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Eye className="size-4 text-success" /> Check it yourself</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">{verify.map((v) => <li key={v}>{v}</li>)}</ol>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 text-sm">
          <ul className="space-y-3">
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" /><span>Zero uploads, by design</span></li>
            <li className="flex gap-2"><WifiOff className="mt-0.5 size-4 shrink-0 text-accent" /><span>Works offline after the first load</span></li>
            <li className="flex gap-2"><Database className="mt-0.5 size-4 shrink-0 text-accent" /><span>Settings and history live in this browser. <Link to="/settings#privacy" className="text-accent hover:underline">Manage or clear them</Link></span></li>
            <li className="flex gap-2"><Github className="mt-0.5 size-4 shrink-0 text-accent" /><span>Open source. <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">Read the code</a></span></li>
          </ul>
          <Link to="/blog/how-openfile-keeps-files-private" className="mt-4 block text-accent hover:underline">How OpenFile keeps files private</Link>
        </div>
      </aside>
    </div>
  )
}

import { useEffect } from 'react'
export default function Privacy() {
  useEffect(() => { document.title = 'Privacy | OpenFile' }, [])
  const s = [
    ['Your files stay on your device', 'All file processing happens locally in your browser. OpenFile has no file-upload endpoint, and files you open are held only in your tab’s memory until you close or reload it.'],
    ['Downloads of engines and models', 'Some tools fetch open-source processing engines (for example ffmpeg.wasm, Tesseract language data, or AI model weights) from public CDNs the first time you use them. Only the engine is downloaded, your file is never sent.'],
    ['Local storage', 'We store your theme, favorites, recent tools and saved Workspace recipes in your browser’s localStorage. You can clear them at any time from your browser settings.'],
    ['Optional server features', 'When deployed on Vercel, a few optional API routes exist (health check and fetching a public web page for HTML to PDF). They receive only the URL you type, never your files, and keep no logs beyond the hosting platform’s defaults.'],
    ['No accounts, no tracking', 'There are no accounts, cookies for advertising, or third-party trackers.'],
    ['Contact', 'Questions? Open an issue on the GitHub repository.'],
  ]
  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 sm:px-6">
      <h1 className="font-display text-4xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Short version: we never see your files.</p>
      <div className="mt-10 space-y-8">{s.map(([h, p]) => <section key={h}><h2 className="text-lg font-semibold">{h}</h2><p className="mt-2 leading-relaxed text-muted">{p}</p></section>)}</div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Globe } from 'lucide-react'
import { Input, Label, Textarea, Select, Segmented, CopyButton, Switch } from '@/components/ui'
import { Pane, CodeView, DownloadButton, useStored, esc } from './_b5/shell'

type F = { title: string; desc: string; url: string; image: string; site: string; type: string; twitter: string; card: 'summary' | 'summary_large_image'; author: string; keywords: string; theme: string; locale: string; robots: string; canonical: boolean }
const INIT: F = { title: 'OpenFile: free, private file tools', desc: 'Convert, compress and edit PDFs, images, video and audio right in your browser. Nothing is uploaded.', url: 'https://example.com/', image: 'https://example.com/og.png', site: 'OpenFile', type: 'website', twitter: '', card: 'summary_large_image', author: '', keywords: 'pdf, image, converter', theme: '#F5A524', locale: 'en_US', robots: 'index, follow', canonical: true }
const a = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export default function MetaTagGenerator() {
  const [f, setF] = useStored<F>('b5:meta:f', INIT)
  const [preview, setPreview] = useState<'google' | 'facebook' | 'x' | 'linkedin'>('google')
  const set = <K extends keyof F>(k: K, v: F[K]) => setF({ ...f, [k]: v })
  const html = useMemo(() => {
    const L: string[] = ['<!-- Primary -->', `<title>${esc(f.title)}</title>`, `<meta name="title" content="${a(f.title)}">`, `<meta name="description" content="${a(f.desc)}">`]
    if (f.keywords) L.push(`<meta name="keywords" content="${a(f.keywords)}">`)
    if (f.author) L.push(`<meta name="author" content="${a(f.author)}">`)
    L.push(`<meta name="robots" content="${a(f.robots)}">`, '<meta name="viewport" content="width=device-width, initial-scale=1">')
    if (f.theme) L.push(`<meta name="theme-color" content="${a(f.theme)}">`)
    if (f.canonical && f.url) L.push(`<link rel="canonical" href="${a(f.url)}">`)
    L.push('', '<!-- Open Graph -->', `<meta property="og:type" content="${a(f.type)}">`)
    if (f.url) L.push(`<meta property="og:url" content="${a(f.url)}">`)
    L.push(`<meta property="og:title" content="${a(f.title)}">`, `<meta property="og:description" content="${a(f.desc)}">`)
    if (f.image) L.push(`<meta property="og:image" content="${a(f.image)}">`, '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">')
    if (f.site) L.push(`<meta property="og:site_name" content="${a(f.site)}">`)
    if (f.locale) L.push(`<meta property="og:locale" content="${a(f.locale)}">`)
    L.push('', '<!-- X (Twitter) -->', `<meta name="twitter:card" content="${f.card}">`)
    if (f.twitter) L.push(`<meta name="twitter:site" content="${a(f.twitter.startsWith('@') ? f.twitter : '@' + f.twitter)}">`)
    L.push(`<meta name="twitter:title" content="${a(f.title)}">`, `<meta name="twitter:description" content="${a(f.desc)}">`)
    if (f.image) L.push(`<meta name="twitter:image" content="${a(f.image)}">`)
    return L.join('\n')
  }, [f])
  const host = (() => { try { return new URL(f.url).host } catch { return f.url } })()
  const tLen = f.title.length, dLen = f.desc.length
  const img = f.image ? <img src={f.image} alt="" className="aspect-[1.91/1] w-full bg-surface-2 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden' }} /> : <div className="grid aspect-[1.91/1] w-full place-items-center bg-surface-2 text-sm text-muted">No image</div>

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="space-y-3">
        <div><Label hint={<span className={tLen > 60 ? 'text-warn' : ''}>{tLen}/60</span>}>Title</Label><Input value={f.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div><Label hint={<span className={dLen > 160 ? 'text-warn' : ''}>{dLen}/160</span>}>Description</Label><Textarea value={f.desc} onChange={(e) => set('desc', e.target.value)} className="min-h-20 font-sans text-sm" /></div>
        <div><Label>Page URL</Label><Input aria-label="Page URL" value={f.url} onChange={(e) => set('url', e.target.value)} /></div>
        <div><Label>Image URL (1200 × 630)</Label><Input aria-label="Image URL (1200 × 630)" value={f.image} onChange={(e) => set('image', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Site name</Label><Input aria-label="Site name" value={f.site} onChange={(e) => set('site', e.target.value)} /></div>
          <label className="block"><Label>Type</Label><Select value={f.type} onChange={(v) => set('type', v)} options={['website', 'article', 'product', 'profile', 'video.other', 'book']} /></label>
          <div><Label>X handle</Label><Input aria-label="X handle" value={f.twitter} onChange={(e) => set('twitter', e.target.value)} placeholder="@you" /></div>
          <label className="block"><Label>X card</Label><Select value={f.card} onChange={(v) => set('card', v)} options={[{ value: 'summary_large_image', label: 'Large image' }, { value: 'summary', label: 'Small' }]} /></label>
          <div><Label>Author</Label><Input aria-label="Author" value={f.author} onChange={(e) => set('author', e.target.value)} /></div>
          <div><Label>Theme color</Label><div className="flex gap-2"><input type="color" value={/^#[0-9a-f]{6}$/i.test(f.theme) ? f.theme : '#000000'} onChange={(e) => set('theme', e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-transparent" aria-label="Theme color" /><Input value={f.theme} onChange={(e) => set('theme', e.target.value)} /></div></div>
          <div><Label>Locale</Label><Input aria-label="Locale" value={f.locale} onChange={(e) => set('locale', e.target.value)} /></div>
          <label className="block"><Label>Robots</Label><Select value={f.robots} onChange={(v) => set('robots', v)} options={['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow']} /></label>
        </div>
        <div><Label>Keywords</Label><Input aria-label="Keywords" value={f.keywords} onChange={(e) => set('keywords', e.target.value)} /></div>
        <Switch checked={f.canonical} onChange={(v) => set('canonical', v)} label="Add canonical link" />
      </div>
      <div className="min-w-0 space-y-4">
        <Segmented value={preview} onChange={setPreview} options={[{ value: 'google', label: 'Google' }, { value: 'facebook', label: 'Facebook' }, { value: 'x', label: 'X' }, { value: 'linkedin', label: 'LinkedIn' }]} />
        <div className="rounded-2xl border border-border bg-surface p-5">
          {preview === 'google' && (
            <div className="max-w-xl space-y-1 font-sans">
              <div className="flex items-center gap-2 text-sm"><span className="grid size-7 place-items-center rounded-full bg-surface-2"><Globe className="size-4 text-muted" /></span><div><div className="text-fg">{f.site || host}</div><div className="text-xs text-muted">{f.url}</div></div></div>
              <div className="text-xl text-sky hover:underline">{f.title.length > 60 ? f.title.slice(0, 58) + '…' : f.title}</div>
              <div className="text-sm text-muted">{f.desc.length > 160 ? f.desc.slice(0, 157) + '…' : f.desc}</div>
            </div>
          )}
          {preview !== 'google' && (
            <div className={preview === 'x' ? 'max-w-md overflow-hidden rounded-2xl border border-border' : 'max-w-md overflow-hidden border border-border'}>
              {(preview !== 'x' || f.card === 'summary_large_image') && img}
              <div className="space-y-0.5 bg-surface-2/60 p-3">
                {preview === 'facebook' && <div className="text-xs uppercase text-muted">{host}</div>}
                <div className="font-semibold leading-snug">{f.title}</div>
                {preview !== 'linkedin' && <div className="line-clamp-2 text-sm text-muted">{f.desc}</div>}
                {preview !== 'facebook' && <div className="text-xs text-muted">{host}</div>}
              </div>
            </div>
          )}
        </div>
        <Pane title="HTML for your <head>" actions={<><CopyButton text={html} variant="ghost" /><DownloadButton text={html} filename="meta-tags.html" mime="text/html" /></>}>
          <CodeView code={html} className="max-h-[420px]" />
        </Pane>
      </div>
    </div>
  )
}

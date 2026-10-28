import { useMemo, useState } from 'react'
import { Plus, Trash2, ArrowUp } from 'lucide-react'
import { Button, Input, Label, Segmented, Textarea, ToolGrid, Dropzone } from '@/components/ui'
import { DlButton } from '@/lib/bcat/kit'

interface Link { title: string; url: string }
const THEMES = { gold: { bg: '#0a0a0a', card: '#171717', fg: '#fafaf9', accent: '#F5A524', on: '#000' }, teal: { bg: '#031716', card: '#0b2a28', fg: '#f0fdfa', accent: '#2DD4BF', on: '#022c22' }, sky: { bg: '#04131f', card: '#0c2333', fg: '#f0f9ff', accent: '#38BDF8', on: '#082f49' }, paper: { bg: '#FFFBEB', card: '#ffffff', fg: '#1c1917', accent: '#C2410C', on: '#fff' }, lime: { bg: '#0d1a03', card: '#1a2e05', fg: '#f7fee7', accent: '#A3E635', on: '#1a2e05' } }
type Theme = keyof typeof THEMES
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const safeUrl = (u: string) => (/^(https?:|mailto:|tel:)/i.test(u.trim()) ? u.trim() : u.trim() ? 'https://' + u.trim() : '#')

export function buildPage(o: { name: string; bio: string; avatar: string | null; links: Link[]; theme: Theme; style: 'pill' | 'card'; footer: string }) {
  const t = THEMES[o.theme], r = o.style === 'pill' ? '999px' : '14px'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.name)}</title><meta name="description" content="${esc(o.bio.slice(0, 150))}"><meta property="og:title" content="${esc(o.name)}"><meta property="og:description" content="${esc(o.bio.slice(0, 150))}">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;background:${t.bg};color:${t.fg};font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;justify-content:center}main{width:100%;max-width:560px;padding:56px 20px 40px;text-align:center}img.a{width:104px;height:104px;border-radius:50%;object-fit:cover;border:3px solid ${t.accent}}.ph{width:104px;height:104px;border-radius:50%;margin:0 auto;display:grid;place-items:center;background:${t.accent};color:${t.on};font-size:40px;font-weight:800}h1{font-size:24px;margin:16px 0 6px}p.b{opacity:.75;margin:0 0 28px;white-space:pre-line}a.l{display:block;margin:12px 0;padding:16px 20px;border-radius:${r};background:${t.card};color:${t.fg};text-decoration:none;font-weight:600;border:1px solid ${t.accent}33;transition:transform .15s,background .15s}a.l:hover{transform:translateY(-2px);background:${t.accent};color:${t.on}}footer{margin-top:36px;font-size:12px;opacity:.5}@media (prefers-reduced-motion:reduce){a.l{transition:none}}</style></head>
<body><main>${o.avatar ? `<img class="a" src="${o.avatar}" alt="${esc(o.name)}">` : `<div class="ph">${esc(o.name.trim()[0]?.toUpperCase() ?? '?')}</div>`}<h1>${esc(o.name)}</h1><p class="b">${esc(o.bio)}</p>
${o.links.filter((l) => l.title.trim()).map((l) => `<a class="l" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join('\n')}
<footer>${esc(o.footer)}</footer></main></body></html>`
}

export default function LinkInBioBuilder() {
  const [name, setName] = useState('Your Name')
  const [bio, setBio] = useState('Designer and maker. Sharing what I learn every week.')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [links, setLinks] = useState<Link[]>([{ title: 'My portfolio', url: 'example.com' }, { title: 'Newsletter', url: 'example.com/news' }, { title: 'Book a call', url: 'example.com/call' }])
  const [theme, setTheme] = useState<Theme>('gold')
  const [style, setStyle] = useState<'pill' | 'card'>('pill')
  const [footer, setFooter] = useState('Made with OpenFile')
  const html = useMemo(() => buildPage({ name, bio, avatar, links, theme, style, footer }), [name, bio, avatar, links, theme, style, footer])
  const setAv = async (f: File) => { const bmp = await createImageBitmap(f); const s = 256 / Math.min(bmp.width, bmp.height); const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d')!.drawImage(bmp, (256 - bmp.width * s) / 2, (256 - bmp.height * s) / 2, bmp.width * s, bmp.height * s); setAvatar(c.toDataURL('image/jpeg', 0.85)) }

  return (
    <ToolGrid
      main={
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-3">{avatar ? <img src={avatar} alt="Avatar" className="size-16 rounded-full object-cover" /> : null}<Dropzone compact accept="image/*" onFiles={(f) => setAv(f[0])} label={avatar ? 'Change photo' : 'Add a photo'} className="flex-1" /></div>
            <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Bio</Label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-20 font-sans" /></div>
            <Label>Links</Label>
            {links.map((l, i) => (
              <div key={i} className="flex gap-1.5">
                <Input value={l.title} onChange={(e) => setLinks((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" aria-label={`Link ${i + 1} title`} />
                <Input value={l.url} onChange={(e) => setLinks((p) => p.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="example.com" aria-label={`Link ${i + 1} address`} />
                <Button variant="ghost" size="sm" aria-label="Move up" disabled={!i} onClick={() => setLinks((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })} icon={<ArrowUp className="size-4" />} />
                <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => setLinks((p) => p.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" />} />
              </div>
            ))}
            <Button variant="outline" size="sm" icon={<Plus className="size-4" />} onClick={() => setLinks((p) => [...p, { title: '', url: '' }])}>Add link</Button>
          </div>
          <iframe title="Preview" srcDoc={html} sandbox="" className="h-[620px] w-full rounded-[2rem] border-8 border-surface-2 bg-bg" />
        </div>
      }
      side={
        <>
          <div><Label>Theme</Label><Segmented value={theme} onChange={setTheme} options={(Object.keys(THEMES) as Theme[]).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))} /></div>
          <div><Label>Buttons</Label><Segmented value={style} onChange={setStyle} options={[{ value: 'pill', label: 'Rounded' }, { value: 'card', label: 'Cards' }]} /></div>
          <div><Label>Footer</Label><Input value={footer} onChange={(e) => setFooter(e.target.value)} /></div>
          <DlButton variant="primary" className="w-full" name="index.html" mime="text/html" data={() => html}>Download page (index.html)</DlButton>
          <p className="text-xs text-muted">One small HTML file with your photo built in. Host it free on GitHub Pages, Netlify, Cloudflare Pages or any web space, then put the link in your bio.</p>
        </>
      }
    />
  )
}

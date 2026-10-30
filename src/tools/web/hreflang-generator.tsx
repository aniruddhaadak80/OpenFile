import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Card, Input, Label, Segmented } from '@/components/ui'
import { hreflangHeader, hreflangSitemap, hreflangTags, validLang, type HrefAlt } from '@/lib/cf/web'
import { OutBox } from '@/lib/cf/ui'

export default function HreflangGenerator() {
  const [alts, setAlts] = useState<HrefAlt[]>([{ lang: 'en', url: 'https://example.com/' }, { lang: 'en-GB', url: 'https://example.com/uk/' }, { lang: 'hi-IN', url: 'https://example.com/hi/' }, { lang: 'es', url: 'https://example.com/es/' }, { lang: 'x-default', url: 'https://example.com/' }])
  const [fmt, setFmt] = useState<'html' | 'sitemap' | 'header'>('html')
  const issues = useMemo(() => {
    const out: string[] = []; const langs = alts.map((a) => a.lang)
    alts.forEach((a) => { if (!validLang(a.lang)) out.push(`"${a.lang}" is not a valid code. Use a language like "en" or language plus region like "en-GB".`); try { new URL(a.url) } catch { out.push(`"${a.url}" must be a full URL starting with https://`) } })
    const dup = langs.filter((l, i) => langs.indexOf(l) !== i); if (dup.length) out.push(`Listed twice: ${[...new Set(dup)].join(', ')}.`)
    if (!langs.includes('x-default')) out.push('No x-default. Add one for visitors whose language you do not have.')
    if (alts.some((a) => /^[a-z]{2}-[a-z]{2}$/.test(a.lang))) out.push('Region codes should be upper case, like en-GB.')
    return out
  }, [alts])
  const out = fmt === 'html' ? hreflangTags(alts) : fmt === 'sitemap' ? hreflangSitemap(alts) : hreflangHeader(alts)
  const upd = (i: number, p: Partial<HrefAlt>) => setAlts(alts.map((a, k) => (k === i ? { ...a, ...p } : a)))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-2">
        <Label>Every language or country version of this page</Label>
        {alts.map((a, i) => <div key={i} className="grid grid-cols-[7rem_1fr_auto] gap-2"><Input value={a.lang} onChange={(e) => upd(i, { lang: e.target.value.trim() })} aria-label="Language code" className={validLang(a.lang) ? '' : 'border-danger'} /><Input value={a.url} onChange={(e) => upd(i, { url: e.target.value })} aria-label="URL" /><button aria-label="Remove" onClick={() => setAlts(alts.filter((_, k) => k !== i))} className="text-muted hover:text-danger cursor-pointer"><X className="size-4" /></button></div>)}
        <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setAlts([...alts, { lang: '', url: '' }])}>Add version</Button>
        {issues.map((x, i) => <p key={i} className="text-sm text-warn">{x}</p>)}
      </Card>
      <div className="space-y-3">
        <Segmented value={fmt} onChange={setFmt} options={[{ value: 'html', label: 'HTML head' }, { value: 'sitemap', label: 'Sitemap' }, { value: 'header', label: 'HTTP header' }]} />
        <OutBox title="Code" text={out} filename={fmt === 'sitemap' ? 'hreflang-sitemap.xml' : 'hreflang.txt'} rows={12} />
        <p className="text-xs text-muted">Put the same full set on every version, including a link to itself. Pages must link back to each other or search engines ignore the tags.</p>
      </div>
    </div>
  )
}

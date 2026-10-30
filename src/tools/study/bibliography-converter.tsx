import { useMemo, useState } from 'react'
import { Card, Dropzone, Label, Segmented, Textarea, ErrorNote } from '@/components/ui'
import { cite, detectRefFormat, parseBibtex, parseCslJson, parseRis, plainCite, toBibtex, toCslJson, toRis, type Style } from '@/lib/cf/study'
import { OutBox, CiteText } from '@/lib/cf/ui'

const SAMPLE = `@article{verma2024,
  author = {Verma, Rahul and Chen, Li},
  title = {Fast {PDF} rendering on low end phones},
  journal = {Mobile Systems Review},
  year = {2024}, volume = {8}, number = {2}, pages = {101--117},
  doi = {10.5555/msr.2024.101}
}
@book{knuth1997,
  author = {Knuth, Donald E.},
  title = {The Art of Computer Programming},
  publisher = {Addison-Wesley}, address = {Boston}, year = {1997}, edition = {3}
}`

export default function BibliographyConverter() {
  const [text, setText] = useState(SAMPLE)
  const [to, setTo] = useState<'ris' | 'bibtex' | 'csl' | Style>('ris')
  const parsed = useMemo(() => { const f = detectRefFormat(text); try { if (!f) return { refs: [], f, e: text.trim() ? 'Could not tell the format. Paste BibTeX (@article{...}), RIS (TY  - JOUR) or CSL JSON.' : null }; const refs = f === 'bibtex' ? parseBibtex(text) : f === 'ris' ? parseRis(text) : parseCslJson(text); return { refs, f, e: refs.length ? null : 'No references found.' } } catch (e: any) { return { refs: [], f, e: e.message } } }, [text])
  const out = to === 'ris' ? toRis(parsed.refs) : to === 'bibtex' ? toBibtex(parsed.refs) : to === 'csl' ? toCslJson(parsed.refs) : parsed.refs.map((r, i) => plainCite(cite(r, to, i + 1))).join('\n\n')
  const ext = to === 'ris' ? 'ris' : to === 'bibtex' ? 'bib' : to === 'csl' ? 'json' : 'txt'
  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <div><Label hint={parsed.f ? `${parsed.f.toUpperCase()}, ${parsed.refs.length} references` : ''}>Paste BibTeX, RIS or CSL JSON</Label><Textarea aria-label="Paste BibTeX, RIS or CSL JSON" value={text} onChange={(e) => setText(e.target.value)} className="min-h-56" /></div>
        <Dropzone compact multiple accept=".bib,.ris,.json,.txt,.enw" onFiles={async (fs) => setText((await Promise.all(fs.map((f) => f.text()))).join('\n\n'))} label="Or drop .bib, .ris or .json files" sub="From Zotero, Mendeley, EndNote, Google Scholar" />
      </div>
      <ErrorNote error={parsed.e} />
      <div><Label>Convert to</Label><Segmented value={to} onChange={setTo} options={[{ value: 'ris', label: 'RIS' }, { value: 'bibtex', label: 'BibTeX' }, { value: 'csl', label: 'CSL JSON' }, { value: 'apa', label: 'APA list' }, { value: 'mla', label: 'MLA list' }, { value: 'chicago', label: 'Chicago list' }, { value: 'harvard', label: 'Harvard list' }, { value: 'ieee', label: 'IEEE list' }]} /></div>
      <OutBox title={`${parsed.refs.length} references`} text={out} filename={`references.${ext}`} />
      {['apa', 'mla', 'chicago', 'harvard', 'ieee', 'vancouver'].includes(to) && parsed.refs.length > 0 && <Card className="space-y-2 font-serif text-[15px]">{parsed.refs.map((r, i) => <p key={i} className="pl-8 -indent-8"><CiteText text={cite(r, to as Style, i + 1)} /></p>)}</Card>}
    </div>
  )
}

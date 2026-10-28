import { useEffect, useMemo, useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { Button, Segmented, Input, Switch, CopyButton } from '@/components/ui'
import { Bar, Status, Pane, CodeArea, CodeView, OpenFileButton, DownloadButton, useStored, useDebounced, Chip, Stat } from '../dev/_b5/shell'

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns:dc="http://purl.org/dc/elements/1.1/"><book id="bk101" lang="en"><dc:title>XML Developer's Guide</dc:title><author>Gambardella, Matthew</author><price currency="USD">44.95</price><published>2000-10-01</published></book><book id="bk102" lang="fr"><dc:title>Midnight Rain</dc:title><author>Ralls, Kim</author><price currency="EUR">5.95</price><published>2000-12-16</published></book><!-- more books soon --></catalog>`

type Mode = 'format' | 'minify' | 'xpath'

function parseXml(src: string) {
  const doc = new DOMParser().parseFromString(src, 'application/xml')
  const pe = doc.getElementsByTagName('parsererror')[0]
  if (pe) {
    const msg = (pe.textContent || 'Parse error').replace(/\s+/g, ' ').trim()
    const m = msg.match(/line\s*(?:number\s*)?(\d+)/i)
    return { doc: null, err: msg.replace(/^This page contains the following errors:/i, '').replace(/Below is a rendering.*$/i, '').trim(), line: m ? Number(m[1]) : null }
  }
  return { doc, err: null, line: null }
}

function stats(doc: Document) {
  let elements = 0, attrs = 0, depth = 0, text = 0, comments = 0
  const ns = new Set<string>()
  const walk = (n: Node, d: number) => {
    if (n.nodeType === 1) { elements++; depth = Math.max(depth, d); const el = n as Element; attrs += el.attributes.length; if (el.namespaceURI) ns.add(el.namespaceURI); for (const a of Array.from(el.attributes)) if (a.name.startsWith('xmlns')) ns.add(a.value) }
    else if (n.nodeType === 3 && n.nodeValue?.trim()) text++
    else if (n.nodeType === 8) comments++
    n.childNodes.forEach((c) => walk(c, d + 1))
  }
  walk(doc.documentElement, 1)
  return { elements, attrs, depth, text, comments, ns: [...ns], root: doc.documentElement.nodeName }
}

function nsResolver(doc: Document): XPathNSResolver {
  const map: Record<string, string> = {}
  doc.querySelectorAll('*').forEach((el) => { for (const a of Array.from(el.attributes)) if (a.name.startsWith('xmlns:')) map[a.name.slice(6)] = a.value })
  return { lookupNamespaceURI: (p: string | null) => (p ? map[p] ?? null : doc.documentElement.namespaceURI) } as any
}

function runXPath(doc: Document, expr: string): { kind: string; items: string[] } {
  const r = doc.evaluate(expr, doc, nsResolver(doc), XPathResult.ANY_TYPE, null)
  switch (r.resultType) {
    case XPathResult.NUMBER_TYPE: return { kind: 'number', items: [String(r.numberValue)] }
    case XPathResult.STRING_TYPE: return { kind: 'string', items: [r.stringValue] }
    case XPathResult.BOOLEAN_TYPE: return { kind: 'boolean', items: [String(r.booleanValue)] }
    default: {
      const items: string[] = []; const ser = new XMLSerializer(); let n: Node | null
      while ((n = r.iterateNext())) { items.push(n.nodeType === 2 ? `${(n as Attr).name}="${(n as Attr).value}"` : n.nodeType === 3 ? n.nodeValue ?? '' : ser.serializeToString(n)); if (items.length > 5000) break }
      return { kind: 'nodes', items }
    }
  }
}

export default function XmlTools() {
  const [src, setSrc] = useStored('b5:xml:src', SAMPLE)
  const [mode, setMode] = useState<Mode>('format')
  const [indent, setIndent] = useState<'2' | '4' | 'tab'>('2')
  const [collapse, setCollapse] = useState(true)
  const [keepComments, setKeepComments] = useState(true)
  const [xp, setXp] = useState('//book[price > 10]/*[local-name()="title"]')
  const [fmtLib, setFmtLib] = useState<any>(null)
  const d = useDebounced(src, 200)
  useEffect(() => { import('xml-formatter').then((m) => setFmtLib(() => m.default)) }, [])

  const parsed = useMemo(() => (d.trim() ? parseXml(d) : null), [d])
  const info = useMemo(() => (parsed?.doc ? stats(parsed.doc) : null), [parsed])
  const out = useMemo(() => {
    if (!parsed?.doc || !fmtLib) return ''
    try {
      if (mode === 'minify') return fmtLib.minify(d, { collapseContent: true, filter: keepComments ? undefined : (n: any) => n.type !== 'Comment' })
      if (mode === 'format') return fmtLib(d, { indentation: indent === 'tab' ? '\t' : ' '.repeat(Number(indent)), collapseContent: collapse, lineSeparator: '\n', filter: keepComments ? undefined : (n: any) => n.type !== 'Comment' })
    } catch (e: any) { return '' }
    return ''
  }, [parsed, fmtLib, d, mode, indent, collapse, keepComments])
  const xres = useMemo(() => { if (mode !== 'xpath' || !parsed?.doc || !xp.trim()) return null; try { return runXPath(parsed.doc, xp) } catch (e: any) { return { err: e.message as string } } }, [mode, parsed, xp])

  return (
    <div className="space-y-4">
      <Bar>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'format', label: 'Format' }, { value: 'minify', label: 'Minify' }, { value: 'xpath', label: 'XPath tester' }]} />
        {mode === 'format' && <><Segmented value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }, { value: 'tab', label: 'Tabs' }]} /><Switch checked={collapse} onChange={setCollapse} label="Keep short text inline" /></>}
        {mode !== 'xpath' && <Switch checked={keepComments} onChange={setKeepComments} label="Keep comments" />}
        <div className="ml-auto"><Button size="sm" variant="ghost" icon={<FileCode2 className="size-4" />} onClick={() => setSrc(SAMPLE)}>Sample</Button></div>
      </Bar>
      {!parsed ? <Status kind="info">Paste XML or open a file.</Status> : parsed.err ? <Status kind="err">Not well-formed: {parsed.err}</Status> : <Status kind="ok">Well-formed XML. Root element &lt;{info?.root}&gt;</Status>}
      {info && <div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Stat label="Elements" value={info.elements} /><Stat label="Attributes" value={info.attrs} /><Stat label="Max depth" value={info.depth} /><Stat label="Text nodes" value={info.text} /><Stat label="Namespaces" value={info.ns.length} sub={info.ns[0]} /></div>}
      {mode === 'xpath' && (
        <div className="space-y-2">
          <Input value={xp} onChange={(e) => setXp(e.target.value)} className="h-11 font-mono" placeholder="XPath expression" aria-label="XPath expression" spellCheck={false} />
          <div className="flex flex-wrap gap-1.5">{['//book/@id', 'count(//book)', '//author/text()', 'sum(//price)', '//*[@lang="fr"]', 'name(/*)'].map((e) => <Chip key={e} active={xp === e} onClick={() => setXp(e)}>{e}</Chip>)}</div>
          <p className="text-xs text-muted">Prefixes declared in the document (like dc:) work in expressions. Elements in a default namespace match with *[local-name()="name"].</p>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="XML" className="h-[480px]" actions={<><OpenFileButton accept=".xml,.svg,.xsd,.xsl,.xslt,.rss,.atom,.plist,.kml,.gpx,text/xml,application/xml" onText={(t) => setSrc(t)} /><Button size="sm" variant="ghost" onClick={() => setSrc('')}>Clear</Button></>}>
          <CodeArea value={src} onChange={setSrc} errorLine={parsed?.line} />
        </Pane>
        {mode === 'xpath' ? (
          <Pane title={xres && 'items' in xres ? `${xres.kind === 'nodes' ? `${xres.items.length} node${xres.items.length === 1 ? '' : 's'}` : xres.kind}` : 'Result'} className="h-[480px]" actions={xres && 'items' in xres ? <CopyButton text={xres.items.join('\n')} variant="ghost" /> : null}>
            {xres && 'err' in xres ? <div className="p-4 text-sm text-danger">{xres.err}</div> : xres ? (
              <div className="scrollbar-thin h-full space-y-1.5 overflow-auto p-3">{xres.items.length ? xres.items.map((it, i) => <pre key={i} className="whitespace-pre-wrap break-all rounded-lg bg-surface-2/50 px-3 py-2 font-mono text-[12px]">{it}</pre>) : <div className="text-sm text-muted">No nodes matched.</div>}</div>
            ) : <div className="grid h-full place-items-center text-sm text-muted">Results appear here</div>}
          </Pane>
        ) : (
          <Pane title={mode === 'format' ? 'Formatted' : 'Minified'} className="h-[480px]" actions={out ? <><CopyButton text={out} variant="ghost" /><DownloadButton text={out} filename={mode === 'format' ? 'formatted.xml' : 'minified.xml'} mime="application/xml" /></> : null}>
            {out ? <CodeView code={out} className="h-full" /> : <div className="grid h-full place-items-center text-sm text-muted">Output appears here</div>}
          </Pane>
        )}
      </div>
    </div>
  )
}

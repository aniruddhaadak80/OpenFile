import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownUp, Search } from 'lucide-react'
import { Button, Input, Segmented, Switch, CopyButton, cn } from '@/components/ui'
import { copyText } from '@/lib/files'
import { toast } from '@/components/toast'
import { CodeArea, Pane } from './_dev/kit'

// Latin-1 (160–255) entity names in code-point order
const LATIN1 = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ')
const EXTRA: [string, number][] = [
  ['quot', 34], ['amp', 38], ['apos', 39], ['lt', 60], ['gt', 62], ['OElig', 338], ['oelig', 339], ['Scaron', 352], ['scaron', 353], ['Yuml', 376], ['fnof', 402], ['circ', 710], ['tilde', 732],
  ['Alpha', 913], ['Beta', 914], ['Gamma', 915], ['Delta', 916], ['Theta', 920], ['Lambda', 923], ['Pi', 928], ['Sigma', 931], ['Phi', 934], ['Psi', 936], ['Omega', 937],
  ['alpha', 945], ['beta', 946], ['gamma', 947], ['delta', 948], ['epsilon', 949], ['theta', 952], ['lambda', 955], ['mu', 956], ['pi', 960], ['sigma', 963], ['tau', 964], ['phi', 966], ['omega', 969],
  ['ensp', 8194], ['emsp', 8195], ['thinsp', 8201], ['zwnj', 8204], ['zwj', 8205], ['ndash', 8211], ['mdash', 8212], ['lsquo', 8216], ['rsquo', 8217], ['sbquo', 8218], ['ldquo', 8220], ['rdquo', 8221], ['bdquo', 8222],
  ['dagger', 8224], ['Dagger', 8225], ['bull', 8226], ['hellip', 8230], ['permil', 8240], ['prime', 8242], ['Prime', 8243], ['lsaquo', 8249], ['rsaquo', 8250], ['euro', 8364], ['trade', 8482], ['larr', 8592], ['uarr', 8593],
  ['rarr', 8594], ['darr', 8595], ['harr', 8596], ['lArr', 8656], ['rArr', 8658], ['hArr', 8660], ['forall', 8704], ['part', 8706], ['exist', 8707], ['empty', 8709], ['nabla', 8711], ['isin', 8712], ['notin', 8713], ['prod', 8719], ['sum', 8721],
  ['minus', 8722], ['radic', 8730], ['infin', 8734], ['and', 8743], ['or', 8744], ['cap', 8745], ['cup', 8746], ['int', 8747], ['there4', 8756], ['asymp', 8776], ['ne', 8800], ['equiv', 8801], ['le', 8804], ['ge', 8805],
  ['sub', 8834], ['sup', 8835], ['loz', 9674], ['spades', 9824], ['clubs', 9827], ['hearts', 9829], ['diams', 9830], ['check', 10003], ['cross', 10007], ['star', 9734], ['starf', 9733], ['rupee', 8377],
]
const NAMES: [string, number][] = [...EXTRA.slice(0, 5), ...LATIN1.map((n, i) => [n, 160 + i] as [string, number]), ...EXTRA.slice(5)]
const BY_CODE = new Map<number, string>(NAMES.map(([n, c]) => [c, n]))
const DESC: Record<string, string> = { quot: 'double quote', amp: 'ampersand', apos: 'apostrophe', lt: 'less than', gt: 'greater than', nbsp: 'non-breaking space', copy: 'copyright', reg: 'registered', trade: 'trademark', euro: 'euro', pound: 'pound', yen: 'yen', cent: 'cent', rupee: 'Indian rupee', deg: 'degree', plusmn: 'plus-minus', times: 'multiply', divide: 'divide', mdash: 'em dash', ndash: 'en dash', hellip: 'ellipsis', bull: 'bullet', larr: 'left arrow', rarr: 'right arrow', uarr: 'up arrow', darr: 'down arrow', laquo: 'left guillemet', raquo: 'right guillemet', ldquo: 'left double quote', rdquo: 'right double quote', lsquo: 'left single quote', rsquo: 'right single quote', sect: 'section', para: 'pilcrow', infin: 'infinity', ne: 'not equal', le: 'less or equal', ge: 'greater or equal', hearts: 'heart', check: 'check mark', shy: 'soft hyphen', middot: 'middle dot', frac12: 'one half', micro: 'micro', sum: 'summation', radic: 'square root' }

type Fmt = 'named' | 'decimal' | 'hex'
type Scope = 'unsafe' | 'nonascii' | 'all'

function encode(s: string, fmt: Fmt, scope: Scope, nbsp: boolean) {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    const unsafe = c === 38 || c === 60 || c === 62 || c === 34 || c === 39
    const need = scope === 'all' ? !(c === 10 || c === 13 || c === 9) : unsafe || (scope === 'nonascii' && c > 126) || (nbsp && c === 160)
    if (!need) { out += ch; continue }
    const name = BY_CODE.get(c)
    if (fmt === 'named' && name && !(name === 'apos')) out += `&${name};`
    else if (fmt === 'hex' || (fmt === 'named' && c > 255)) out += `&#x${c.toString(16).toUpperCase()};`
    else out += `&#${c};`
  }
  return out
}
function decode(s: string) {
  const ta = document.createElement('textarea')
  // textarea RCDATA parsing decodes entities without executing anything
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]{1,31});?/gi, (m) => { ta.innerHTML = m.endsWith(';') ? m : m + ';'; const v = ta.value; return v === (m.endsWith(';') ? m : m + ';') ? m : v })
}

export default function HtmlEntities() {
  const [dir, setDir] = useState<'encode' | 'decode'>('encode')
  const [input, setInput] = useState('<p class="note">Fish & Chips, £4.99 © 2026 “OpenFile” → café</p>')
  const [fmt, setFmt] = useState<Fmt>('named')
  const [scope, setScope] = useState<Scope>('nonascii')
  const [nbsp, setNbsp] = useState(true)
  const [q, setQ] = useState('')

  const out = useMemo(() => (dir === 'encode' ? encode(input, fmt, scope, nbsp) : decode(input)), [input, dir, fmt, scope, nbsp])
  const table = useMemo(() => NAMES.filter(([n, c]) => !q || n.toLowerCase().includes(q.toLowerCase()) || (DESC[n] ?? '').includes(q.toLowerCase()) || String.fromCodePoint(c) === q || String(c) === q), [q])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={dir} onChange={setDir} options={[{ value: 'encode', label: 'Escape (encode)' }, { value: 'decode', label: 'Unescape (decode)' }]} />
        {dir === 'encode' && <>
          <Segmented value={fmt} onChange={setFmt} options={[{ value: 'named', label: '&name;' }, { value: 'decimal', label: '&#123;' }, { value: 'hex', label: '&#x7B;' }]} />
          <Segmented value={scope} onChange={setScope} options={[{ value: 'unsafe', label: 'Only < > & " \'' }, { value: 'nonascii', label: '+ non-ASCII' }, { value: 'all', label: 'Everything' }]} />
          {scope === 'unsafe' && <Switch checked={nbsp} onChange={setNbsp} label="Also nbsp" />}
        </>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <Pane title={dir === 'encode' ? 'Text / HTML' : 'Escaped HTML'} className="h-72"><CodeArea value={input} onChange={setInput} lineNumbers={false} /></Pane>
        <div className="flex items-center justify-center"><Button variant="outline" size="sm" icon={<ArrowDownUp className="size-4 lg:-rotate-90" />} onClick={() => { setInput(out); setDir(dir === 'encode' ? 'decode' : 'encode') }}>Swap</Button></div>
        <Pane title={dir === 'encode' ? 'Escaped' : 'Decoded'} className="h-72" actions={<CopyButton text={out} variant="ghost" />}><CodeArea value={out} readOnly lineNumbers={false} /></Pane>
      </div>

      <Pane title="Entity reference" actions={<div className="relative"><Search className="absolute left-2.5 top-2 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: arrow, euro, ©…" className="h-8 w-56 pl-8 text-xs" /></div>}>
        <div className="scrollbar-thin grid max-h-[420px] grid-cols-2 gap-px overflow-auto bg-border sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {table.map(([n, c]) => (
            <motion.button key={n} whileTap={{ scale: 0.97 }} onClick={async () => { if (await copyText(`&${n};`)) toast(`Copied &${n};`) }} title="Click to copy"
              className="flex items-center gap-3 bg-surface px-3 py-2 text-left hover:bg-surface-2 cursor-pointer">
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-lg', c === 160 || c === 173 || (c >= 8194 && c <= 8205) ? 'text-xs text-muted' : '')}>{c === 160 ? 'nbsp' : c === 173 ? 'shy' : c >= 8194 && c <= 8205 ? '␣' : String.fromCodePoint(c)}</span>
              <span className="min-w-0"><span className="block truncate font-mono text-xs text-accent">&amp;{n};</span><span className="block truncate font-mono text-[10px] text-muted">&amp;#{c}; · {DESC[n] ?? `U+${c.toString(16).toUpperCase().padStart(4, '0')}`}</span></span>
            </motion.button>
          ))}
          {table.length === 0 && <div className="col-span-full bg-surface p-6 text-center text-sm text-muted">No entity matches “{q}”.</div>}
        </div>
      </Pane>
    </div>
  )
}

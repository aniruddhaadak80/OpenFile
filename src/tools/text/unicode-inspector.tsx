import { useMemo, useState } from 'react'
import { Segmented, Switch, Button, Badge } from '@/components/ui'
import { Bar, Pane, CodeArea, OpenFileButton, useStored, useDebounced, Stat, DataTable, Status } from '../dev/_b5/shell'

const NAMED: Record<number, string> = {
  0x0009: 'CHARACTER TABULATION', 0x000a: 'LINE FEED', 0x000d: 'CARRIAGE RETURN', 0x0020: 'SPACE', 0x00a0: 'NO-BREAK SPACE', 0x00ad: 'SOFT HYPHEN', 0x034f: 'COMBINING GRAPHEME JOINER',
  0x061c: 'ARABIC LETTER MARK', 0x115f: 'HANGUL CHOSEONG FILLER', 0x1160: 'HANGUL JUNGSEONG FILLER', 0x180e: 'MONGOLIAN VOWEL SEPARATOR', 0x2000: 'EN QUAD', 0x2001: 'EM QUAD', 0x2002: 'EN SPACE', 0x2003: 'EM SPACE', 0x2004: 'THREE-PER-EM SPACE',
  0x2005: 'FOUR-PER-EM SPACE', 0x2006: 'SIX-PER-EM SPACE', 0x2007: 'FIGURE SPACE', 0x2008: 'PUNCTUATION SPACE', 0x2009: 'THIN SPACE', 0x200a: 'HAIR SPACE', 0x200b: 'ZERO WIDTH SPACE', 0x200c: 'ZERO WIDTH NON-JOINER',
  0x200d: 'ZERO WIDTH JOINER', 0x200e: 'LEFT-TO-RIGHT MARK', 0x200f: 'RIGHT-TO-LEFT MARK', 0x2028: 'LINE SEPARATOR', 0x2029: 'PARAGRAPH SEPARATOR', 0x202a: 'LEFT-TO-RIGHT EMBEDDING', 0x202b: 'RIGHT-TO-LEFT EMBEDDING',
  0x202c: 'POP DIRECTIONAL FORMATTING', 0x202d: 'LEFT-TO-RIGHT OVERRIDE', 0x202e: 'RIGHT-TO-LEFT OVERRIDE', 0x202f: 'NARROW NO-BREAK SPACE', 0x205f: 'MEDIUM MATHEMATICAL SPACE', 0x2060: 'WORD JOINER', 0x2061: 'FUNCTION APPLICATION',
  0x2062: 'INVISIBLE TIMES', 0x2063: 'INVISIBLE SEPARATOR', 0x2064: 'INVISIBLE PLUS', 0x2066: 'LEFT-TO-RIGHT ISOLATE', 0x2067: 'RIGHT-TO-LEFT ISOLATE', 0x2068: 'FIRST STRONG ISOLATE', 0x2069: 'POP DIRECTIONAL ISOLATE',
  0x3000: 'IDEOGRAPHIC SPACE', 0x3164: 'HANGUL FILLER', 0xfeff: 'ZERO WIDTH NO-BREAK SPACE (BOM)', 0xfffc: 'OBJECT REPLACEMENT CHARACTER', 0xfffd: 'REPLACEMENT CHARACTER', 0xffa0: 'HALFWIDTH HANGUL FILLER',
  0x2013: 'EN DASH', 0x2014: 'EM DASH', 0x2018: 'LEFT SINGLE QUOTATION MARK', 0x2019: 'RIGHT SINGLE QUOTATION MARK', 0x201c: 'LEFT DOUBLE QUOTATION MARK', 0x201d: 'RIGHT DOUBLE QUOTATION MARK', 0x2026: 'HORIZONTAL ELLIPSIS',
}
const INVISIBLE = new Set([0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0x3164, 0xfeff, 0xffa0])
const ODD_SPACE = new Set([0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f, 0x3000])
// Common look-alikes: Cyrillic and Greek letters that look like Latin ones
const HOMO: Record<string, string> = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'һ': 'h', 'ӏ': 'l', 'ո': 'n', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y', 'Ι': 'I', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'ο': 'o', 'ν': 'v', 'α': 'a' }

function category(ch: string): string {
  const tests: [RegExp, string][] = [[/\p{Lu}/u, 'Letter, upper'], [/\p{Ll}/u, 'Letter, lower'], [/\p{Lt}/u, 'Letter, title'], [/\p{Lm}/u, 'Letter, modifier'], [/\p{Lo}/u, 'Letter, other'], [/\p{Mn}/u, 'Mark, nonspacing'], [/\p{Mc}/u, 'Mark, spacing'], [/\p{Me}/u, 'Mark, enclosing'], [/\p{Nd}/u, 'Number, digit'], [/\p{Nl}/u, 'Number, letter'], [/\p{No}/u, 'Number, other'], [/\p{Pc}/u, 'Punctuation, connector'], [/\p{Pd}/u, 'Punctuation, dash'], [/\p{Ps}/u, 'Punctuation, open'], [/\p{Pe}/u, 'Punctuation, close'], [/\p{Pi}/u, 'Punctuation, initial quote'], [/\p{Pf}/u, 'Punctuation, final quote'], [/\p{Po}/u, 'Punctuation, other'], [/\p{Sm}/u, 'Symbol, math'], [/\p{Sc}/u, 'Symbol, currency'], [/\p{Sk}/u, 'Symbol, modifier'], [/\p{So}/u, 'Symbol, other'], [/\p{Zs}/u, 'Separator, space'], [/\p{Zl}/u, 'Separator, line'], [/\p{Zp}/u, 'Separator, paragraph'], [/\p{Cc}/u, 'Control'], [/\p{Cf}/u, 'Format'], [/\p{Co}/u, 'Private use'], [/\p{Cn}/u, 'Unassigned']]
  for (const [re, n] of tests) if (re.test(ch)) return n
  return 'Other'
}
function script(ch: string): string {
  const s = ['Latin', 'Greek', 'Cyrillic', 'Armenian', 'Hebrew', 'Arabic', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Thai', 'Georgian', 'Hangul', 'Hiragana', 'Katakana', 'Han', 'Ethiopic', 'Khmer', 'Sinhala']
  for (const x of s) { try { if (new RegExp(`\\p{Script=${x}}`, 'u').test(ch)) return x } catch { /* old engine */ } }
  if (/\p{Extended_Pictographic}/u.test(ch)) return 'Emoji'
  return 'Common'
}
const hexcp = (c: number) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')
const utf8 = (ch: string) => Array.from(new TextEncoder().encode(ch), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
const utf16 = (ch: string) => Array.from({ length: ch.length }, (_, i) => ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')).join(' ')

type Norm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD'

export default function UnicodeInspector() {
  const [text, setText] = useStored('b10:uni:text', 'Hello\u200b wоrld\u00a0\u2014 café 👋🏽 Ｆｕｌｌ\u202eTXT.exe')
  const [norm, setNorm] = useState<Norm>('NFC')
  const [onlyOdd, setOnlyOdd] = useState(false)
  const t = useDebounced(text, 150)
  const chars = useMemo(() => [...t].slice(0, 20000), [t])
  const info = useMemo(() => {
    let invisible = 0, spaces = 0, homo = 0, nonAscii = 0, bidi = 0
    const rows: string[][] = []
    chars.forEach((ch, i) => {
      const c = ch.codePointAt(0)!
      const isInv = INVISIBLE.has(c) || (/\p{Cf}/u.test(ch) && c !== 0x200d)
      const isSp = ODD_SPACE.has(c)
      const h = HOMO[ch]
      if (isInv) invisible++
      if (isSp) spaces++
      if (h) homo++
      if (c > 127) nonAscii++
      if (c >= 0x202a && c <= 0x202e || c >= 0x2066 && c <= 0x2069) bidi++
      const flag = isInv ? 'invisible' : isSp ? 'unusual space' : h ? `looks like "${h}"` : c < 32 && c !== 10 && c !== 9 ? 'control' : ''
      if (onlyOdd && !flag) return
      rows.push([String(i), c < 32 || isInv || isSp ? '' : ch, hexcp(c), NAMED[c] ?? '', category(ch), script(ch), utf8(ch), utf16(ch), `&#x${c.toString(16)};`, flag])
    })
    return { rows, invisible, spaces, homo, nonAscii, bidi }
  }, [chars, onlyOdd])
  const normalized = useMemo(() => t.normalize(norm), [t, norm])
  const visible = useMemo(() => chars.map((ch) => {
    const c = ch.codePointAt(0)!
    if (INVISIBLE.has(c) || (/\p{Cf}/u.test(ch) && c !== 0x200d)) return { ch: '\u00b7', kind: 'inv', title: `${hexcp(c)} ${NAMED[c] ?? ''}` }
    if (ODD_SPACE.has(c)) return { ch: '\u2423', kind: 'sp', title: `${hexcp(c)} ${NAMED[c] ?? ''}` }
    if (HOMO[ch]) return { ch, kind: 'homo', title: `${hexcp(c)} looks like ${HOMO[ch]}` }
    return { ch, kind: '', title: '' }
  }), [chars])
  const clean = () => setText([...text].filter((ch) => { const c = ch.codePointAt(0)!; return !(INVISIBLE.has(c) || (/\p{Cf}/u.test(ch) && c !== 0x200d)) }).map((ch) => (ODD_SPACE.has(ch.codePointAt(0)!) ? ' ' : ch)).join(''))
  const fixHomo = () => setText([...text].map((ch) => HOMO[ch] ?? ch).join(''))

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Pane title="Text" className="h-64" actions={<OpenFileButton accept="text/*" onText={(x) => setText(x)} />}><CodeArea value={text} onChange={setText} lineNumbers={false} /></Pane>
        <Pane title="What is really there" className="h-64">
          <div className="scrollbar-thin h-full overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[15px] leading-7">
            {visible.map((v, i) => v.kind ? <mark key={i} title={v.title} className={v.kind === 'inv' ? 'rounded bg-danger/25 px-0.5 text-danger' : v.kind === 'sp' ? 'rounded bg-warn/25 px-0.5 text-warn' : 'rounded bg-accent/25 px-0.5'}>{v.ch}</mark> : <span key={i}>{v.ch}</span>)}
          </div>
        </Pane>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Stat label="Characters" value={chars.length.toLocaleString()} sub={`${t.length} UTF-16 units`} />
        <Stat label="UTF-8 bytes" value={new TextEncoder().encode(t).length.toLocaleString()} />
        <Stat label="Invisible" value={info.invisible} />
        <Stat label="Odd spaces" value={info.spaces} />
        <Stat label="Look-alikes" value={info.homo} />
        <Stat label="Non-ASCII" value={info.nonAscii} />
      </div>
      {info.bidi > 0 && <Status kind="err">This text has {info.bidi} direction override character{info.bidi > 1 ? 's' : ''}. They can make a file name or code read differently from how it runs.</Status>}
      <Bar>
        <Button size="sm" onClick={clean} disabled={!info.invisible && !info.spaces}>Remove invisible and fix spaces</Button>
        <Button size="sm" variant="outline" onClick={fixHomo} disabled={!info.homo}>Replace look-alikes with Latin</Button>
        <span className="ml-auto text-sm text-muted">Normalize</span>
        <Segmented value={norm} onChange={setNorm} options={['NFC', 'NFD', 'NFKC', 'NFKD']} />
        <Button size="sm" variant="outline" onClick={() => setText(normalized)} disabled={normalized === t}>Apply {norm}</Button>
        <Badge>{normalized === t ? 'Already ' + norm : `${[...normalized].length} chars after ${norm}`}</Badge>
      </Bar>
      <div className="flex items-center gap-3"><Switch checked={onlyOdd} onChange={setOnlyOdd} label="Only show suspicious characters" />{chars.length >= 20000 && <span className="text-xs text-muted">Showing the first 20,000 characters</span>}</div>
      <DataTable className="max-h-[480px]" columns={['#', 'Char', 'Code point', 'Name', 'Category', 'Script', 'UTF-8', 'UTF-16', 'HTML', 'Note']} rows={info.rows} max={2000} />
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, ImageDown } from 'lucide-react'
import { Button, Field, Input, Segmented, Select, Slider, Switch, Textarea, ToolGrid, CopyButton } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { toast } from '@/components/toast'
import { CODE_THEMES, tokenColor } from '@/lib/b14/design'
import { OpenButton } from '@/lib/b14/ui'

/** True when the file is binary (a photo, audio, an archive), so it is not loaded as text. */
async function isBinaryFile(f: File): Promise<boolean> {
  const b = new Uint8Array(await f.slice(0, 4096).arrayBuffer())
  if ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return false
  let ctrl = 0
  for (const c of b) { if (c === 0) return true; if (c < 9 || (c > 13 && c < 32)) ctrl++ }
  return b.length > 0 && ctrl / b.length > 0.1
}

const SAMPLE = `// Debounce: wait until the user stops typing
export function debounce<T extends (...a: any[]) => void>(fn: T, ms = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

const search = debounce((q: string) => console.log('Searching', q), 300)
search('open file')`

const BACKS = [
  { id: 'gold', css: 'linear-gradient(135deg,#F5A524 0%,#F97316 100%)' },
  { id: 'teal', css: 'linear-gradient(135deg,#14B8A6 0%,#38BDF8 100%)' },
  { id: 'lime', css: 'linear-gradient(135deg,#84CC16 0%,#10B981 100%)' },
  { id: 'sunset', css: 'linear-gradient(135deg,#FBBF24 0%,#F97316 55%,#EF4444 100%)' },
  { id: 'night', css: 'linear-gradient(135deg,#1F2937 0%,#0B0D10 100%)' },
  { id: 'paper', css: '#EDE7DA' },
  { id: 'none', css: 'transparent' },
]
const LANGS = ['auto', 'typescript', 'javascript', 'python', 'java', 'go', 'rust', 'c', 'cpp', 'csharp', 'php', 'ruby', 'kotlin', 'swift', 'sql', 'bash', 'json', 'yaml', 'xml', 'css', 'markdown', 'plaintext']

type Tok = { text: string; color: string | null }
/** Split highlight.js output (only <span class> tags and escaped text) into coloured tokens per line.
 * Read with a small scanner, so the code is never handed to an HTML parser. */
const unesc = (t: string) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
function tokenize(html: string, theme: (typeof CODE_THEMES)[number]): Tok[][] {
  const lines: Tok[][] = [[]]
  const stack: (string | null)[] = [null]
  for (const m of html.matchAll(/<span class="([^"]*)">|<\/span>|([^<]+)/g)) {
    if (m[1] !== undefined) stack.push(tokenColor(m[1], theme) ?? stack[stack.length - 1])
    else if (m[2] !== undefined) unesc(m[2]).split('\n').forEach((p, k) => { if (k > 0) lines.push([]); if (p) lines[lines.length - 1].push({ text: p, color: stack[stack.length - 1] }) })
    else if (stack.length > 1) stack.pop()
  }
  return lines
}

export default function CodeToImage() {
  const [code, setCode] = useState(SAMPLE)
  const [lang, setLang] = useState('auto')
  const [themeId, setThemeId] = useState('gold')
  const [back, setBack] = useState('gold')
  const [pad, setPad] = useState(56)
  const [font, setFont] = useState(15)
  const [nums, setNums] = useState(true)
  const [chrome, setChrome] = useState<'mac' | 'win' | 'none'>('mac')
  const [title, setTitle] = useState('debounce.ts')
  const [width, setWidth] = useState(720)
  const [scale, setScale] = useState(2)
  const [hl, setHl] = useState<{ html: string; lang: string }>({ html: '', lang: '' })
  const node = useRef<HTMLDivElement>(null)
  const theme = CODE_THEMES.find((t) => t.id === themeId)!
  useEffect(() => {
    let dead = false
    import('highlight.js/lib/common').then(({ default: hljs }) => {
      if (dead) return
      const r = lang === 'auto' || !hljs.getLanguage(lang) ? hljs.highlightAuto(code) : hljs.highlight(code, { language: lang, ignoreIllegals: true })
      setHl({ html: r.value, lang: r.language || lang })
    })
    return () => { dead = true }
  }, [code, lang])
  const lines = useMemo(() => tokenize(hl.html || code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), theme), [hl, themeId])
  const save = async (fmt: 'png' | 'svg' | 'jpg') => {
    if (!node.current) return
    try {
      await document.fonts.ready
      const H = await import('html-to-image')
      const o = { pixelRatio: scale, cacheBust: true, backgroundColor: back === 'none' && fmt !== 'jpg' ? undefined : fmt === 'jpg' && back === 'none' ? theme.bg : undefined }
      const name = (title.replace(/\.[^.]+$/, '') || 'code').replace(/[^\w-]+/g, '-')
      if (fmt === 'svg') { const u = await H.toSvg(node.current, o); downloadBlob(await (await fetch(u)).blob(), `${name}.svg`) }
      else { const b = fmt === 'png' ? await H.toBlob(node.current, o) : await (await fetch(await H.toJpeg(node.current, { ...o, quality: 0.94 }))).blob(); if (b) downloadBlob(b, `${name}.${fmt}`) }
    } catch (e: any) { toast(e?.message || 'Could not save the picture.', 'error') }
  }
  const copy = async () => {
    try { const H = await import('html-to-image'); const b = await H.toBlob(node.current!, { pixelRatio: scale }); if (b) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Picture copied', 'success') } }
    catch { toast('Copying pictures is not allowed in this browser. Use Download instead.', 'error') }
  }
  const bgCss = BACKS.find((b) => b.id === back)!.css
  const digits = String(lines.length).length
  return (
    <ToolGrid
      main={<>
        <div className="scrollbar-thin overflow-auto rounded-2xl border border-border p-4 checker">
          <div ref={node} style={{ background: bgCss, padding: pad, width: width + pad * 2, boxSizing: 'border-box' }} className="mx-auto">
            <div style={{ background: theme.bg, borderRadius: 12, boxShadow: back === 'none' ? 'none' : '0 20px 60px rgba(0,0,0,.45)', overflow: 'hidden', border: `1px solid ${theme.dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'}` }}>
              {chrome !== 'none' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${theme.dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'}` }}>
                  {chrome === 'mac' && ['#EF4444', '#F5A524', '#10B981'].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 99, background: c, display: 'inline-block' }} />)}
                  <span style={{ flex: 1, textAlign: chrome === 'mac' ? 'center' : 'left', color: theme.comment, font: `500 13px Inter, system-ui, sans-serif`, marginRight: chrome === 'mac' ? 52 : 0 }}>{title}</span>
                  {chrome === 'win' && <span style={{ color: theme.comment, font: '13px Inter, sans-serif', letterSpacing: 10 }}>_ □ ✕</span>}
                </div>
              )}
              <pre style={{ margin: 0, padding: '18px 20px', font: `${font}px/1.6 "JetBrains Mono", ui-monospace, monospace`, color: theme.fg, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {lines.map((l, i) => (
                  <div key={i} style={{ display: 'flex' }}>
                    {nums && <span style={{ color: theme.comment, opacity: 0.6, width: `${digits + 1.5}ch`, flexShrink: 0, userSelect: 'none', textAlign: 'right', paddingRight: '1.5ch' }}>{i + 1}</span>}
                    <span style={{ flex: 1, minWidth: 0 }}>{l.length ? l.map((t, j) => <span key={j} style={t.color ? { color: t.color } : undefined}>{t.text}</span>) : ' '}</span>
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
        <Textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="Code" className="min-h-48" />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <OpenButton accept=".js,.ts,.tsx,.jsx,.py,.java,.go,.rs,.c,.h,.cpp,.cs,.php,.rb,.kt,.swift,.sql,.sh,.json,.yaml,.yml,.xml,.css,.html,.md,.txt" onFiles={async (f) => { if (await isBinaryFile(f[0])) { toast(`${f[0].name} is not a code or text file. Choose a source file such as .js, .py or .txt.`, 'error'); return } setCode((await f[0].text()).slice(0, 20000)); setTitle(f[0].name) }} label="Open code file" />
          <span>Detected: {hl.lang || 'plain text'} · {lines.length} lines</span>
        </div>
      </>}
      side={<>
        <Field label="Language"><Select value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l, label: l === 'auto' ? 'Detect automatically' : l }))} /></Field>
        <Field label="Theme"><Select value={themeId} onChange={setThemeId} options={CODE_THEMES.map((t) => ({ value: t.id, label: t.name }))} /></Field>
        <Field label="Background"><div className="flex flex-wrap gap-1.5">{BACKS.map((b) => <button key={b.id} aria-label={`Background ${b.id}`} aria-pressed={back === b.id} onClick={() => setBack(b.id)} className={`size-8 cursor-pointer rounded-lg border-2 ${back === b.id ? 'border-accent' : 'border-border'} ${b.id === 'none' ? 'checker' : ''}`} style={{ background: b.id === 'none' ? undefined : b.css }} />)}</div></Field>
        <Field label="Window"><Segmented value={chrome} onChange={setChrome} options={[{ value: 'mac', label: 'Mac' }, { value: 'win', label: 'Windows' }, { value: 'none', label: 'None' }]} /></Field>
        {chrome !== 'none' && <Field label="File name"><Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} /></Field>}
        <Slider label="Padding" value={pad} onChange={setPad} min={0} max={128} suffix=" px" />
        <Slider label="Code width" value={width} onChange={setWidth} min={360} max={1400} step={10} suffix=" px" />
        <Slider label="Font size" value={font} onChange={setFont} min={11} max={24} suffix=" px" />
        <Switch checked={nums} onChange={setNums} label="Line numbers" />
        <Field label="Export size"><Segmented value={String(scale)} onChange={(v) => setScale(+v)} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v + 'x' }))} /></Field>
        <Button size="lg" className="w-full" icon={<ImageDown className="size-5" />} onClick={() => save('png')}>Download PNG</Button>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => save('svg')}>SVG</Button>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} onClick={() => save('jpg')}>JPG</Button>
          <Button size="sm" variant="outline" onClick={copy}>Copy picture</Button>
          <CopyButton text={code} label="Copy code" />
        </div>
      </>}
    />
  )
}

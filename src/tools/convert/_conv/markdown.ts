/* Markdown → sanitised HTML with a tiny dependency-free syntax highlighter, plus print themes. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const KW = 'abstract|and|as|async|await|break|case|catch|class|const|continue|def|default|del|do|elif|else|enum|except|export|extends|false|final|finally|fn|for|from|func|function|go|if|impl|import|in|instanceof|interface|is|lambda|let|loop|match|mod|module|mut|new|nil|none|None|not|null|or|package|pass|private|protected|pub|public|raise|return|self|static|struct|super|switch|this|throw|throws|true|True|False|try|type|typeof|undefined|use|var|void|where|while|with|yield|select|insert|update|delete|create|table|values|into|join|on|group|by|order|limit|having|echo|then|fi|done|esac'
const RULES: [string, RegExp][] = [
  ['c', /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#(?![{\[])[^\n]*|--[^\n]*|<!--[\s\S]*?-->/y],
  ['s', /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y],
  ['n', /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[-+]?\d+)?)\b/y],
  ['k', new RegExp(`\\b(?:${KW})\\b`, 'iy')],
  ['f', /\b[A-Za-z_$][\w$]*(?=\s*\()/y],
  ['t', /<\/?[A-Za-z][\w-]*|\/?>/y],
]

/** Very small multi-language highlighter (comments, strings, numbers, keywords, calls, tags). */
export function highlight(code: string, lang = ''): string {
  if (/^(text|plain|txt)$/i.test(lang)) return esc(code)
  const isMarkup = /^(html|xml|svg|vue)$/i.test(lang)
  const rules = RULES.filter(([k]) => (isMarkup ? ['c', 's', 't'].includes(k) : k !== 't')).filter(([k]) => !(k === 'c' && /^(css|scss|json)$/i.test(lang) && false))
  let out = '', i = 0, plain = ''
  while (i < code.length) {
    let matched = false
    for (const [cls, re] of rules) {
      re.lastIndex = i
      const m = re.exec(code)
      if (m && m[0].length) {
        // '#' comments only for shell/python/ruby/yaml style languages
        if (cls === 'c' && m[0].startsWith('#') && !/^(py|python|sh|bash|shell|zsh|rb|ruby|yaml|yml|toml|r|perl|pl|conf|ini|dockerfile|makefile|)$/i.test(lang)) continue
        if (cls === 'c' && m[0].startsWith('--') && !/^(sql|lua|haskell|hs)$/i.test(lang)) continue
        out += esc(plain); plain = ''
        out += `<span class="hl-${cls}">${esc(m[0])}</span>`
        i += m[0].length; matched = true; break
      }
    }
    if (!matched) { plain += code[i]; i++ }
  }
  return out + esc(plain)
}

export async function renderMarkdown(md: string): Promise<string> {
  const [{ Marked }, DOMPurify] = await Promise.all([import('marked'), import('dompurify')])
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const l = (lang || '').trim().split(/\s+/)[0]
        return `<pre class="code"><code class="language-${esc(l)}">${highlight(text.replace(/\n$/, ''), l)}</code>${l ? `<span class="lang">${esc(l)}</span>` : ''}</pre>\n`
      },
    },
  })
  // page break markers
  const src = md.replace(/^\s*(\\pagebreak|\\newpage|<!--\s*pagebreak\s*-->|---\s*pagebreak\s*---)\s*$/gim, '\n<div class="page-break"></div>\n')
  const raw = await marked.parse(src)
  const purify = (DOMPurify as any).default ?? DOMPurify
  return purify.sanitize(raw, { ADD_ATTR: ['target', 'class', 'id', 'align', 'start'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'] })
}

const HL_LIGHT = '.hl-c{color:#6a737d;font-style:italic}.hl-s{color:#032f62}.hl-n{color:#005cc5}.hl-k{color:#ef4444;font-weight:600}.hl-f{color:#14b8a6}.hl-t{color:#22863a}'
const HL_DARK = '.hl-c{color:#8b949e;font-style:italic}.hl-s{color:#a5d6ff}.hl-n{color:#79c0ff}.hl-k{color:#ff7b72;font-weight:600}.hl-f{color:#5eead4}.hl-t{color:#7ee787}'
const BASE = '.page-break{break-before:page;height:0;}pre.code{position:relative;}pre.code .lang{position:absolute;top:6px;right:10px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;opacity:.55;font-family:Arial,sans-serif;}img{max-width:100%;height:auto;}table{border-collapse:collapse;}input[type=checkbox]{margin:0 .4em 0 0;vertical-align:middle;}li:has(> input[type=checkbox]){list-style:none;margin-left:-1.3em;}'

export const THEMES = {
  github: {
    label: 'GitHub', page: '#ffffff',
    css: `${BASE}${HL_LIGHT}body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1f2328;background:#fff;}
h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:.3em;}h1{font-size:2em;margin:.2em 0 .6em;}h2{font-size:1.5em;margin:1.4em 0 .6em;}h3{font-size:1.25em;margin:1.2em 0 .5em;}h1,h2,h3,h4{font-weight:600;line-height:1.25;}
p,ul,ol,table,blockquote,pre{margin:0 0 1em;}a{color:#0969da;text-decoration:none;}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:85%;background:#eff1f3;padding:.2em .4em;border-radius:6px;}
pre{background:#f6f8fa;padding:14px 16px;border-radius:6px;font-size:9pt;line-height:1.45;white-space:pre-wrap;word-break:break-word;}pre code{background:none;padding:0;font-size:100%;}
blockquote{color:#59636e;border-left:.25em solid #d1d9e0;padding:0 1em;margin-left:0;}table{width:auto;}th,td{border:1px solid #d1d9e0;padding:6px 13px;}tr:nth-child(2n){background:#f6f8fa;}th{font-weight:600;}hr{border:0;height:.25em;background:#d1d9e0;margin:1.5em 0;}`,
  },
  academic: {
    label: 'Academic', page: '#ffffff',
    css: `${BASE}${HL_LIGHT}body{font-family:'Charter','Georgia','Times New Roman',Tinos,serif;font-size:11.5pt;line-height:1.55;color:#111;background:#fff;text-align:justify;hyphens:auto;}
h1{font-size:20pt;text-align:center;margin:0 0 .3em;font-weight:700;}h1+p{text-align:center;font-style:italic;color:#444;}h2{font-size:14pt;margin:1.5em 0 .5em;font-variant:small-caps;letter-spacing:.03em;}h3{font-size:12pt;font-style:italic;margin:1.2em 0 .4em;}
p{margin:0 0 .65em;text-indent:0;}a{color:#1a4f8b;}code{font-family:'Courier New',monospace;font-size:90%;}pre{border-top:1px solid #999;border-bottom:1px solid #999;padding:8px 4px;font-size:9pt;white-space:pre-wrap;text-align:left;}
blockquote{margin:.8em 2em;font-size:10.5pt;color:#333;}table{margin:1em auto;border-top:1.5px solid #000;border-bottom:1.5px solid #000;}th{border-bottom:1px solid #000;padding:4px 10px;}td{padding:3px 10px;}ul,ol{margin:0 0 .8em;}hr{border:0;text-align:center;margin:1.5em 0;}hr:after{content:'* * *';color:#666;}`,
  },
  minimal: {
    label: 'Minimal', page: '#ffffff',
    css: `${BASE}${HL_LIGHT}body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10.5pt;line-height:1.7;color:#27272a;background:#fff;}
h1{font-size:24pt;font-weight:800;letter-spacing:-.02em;margin:0 0 .5em;color:#09090b;}h2{font-size:15pt;font-weight:700;margin:1.6em 0 .5em;color:#09090b;}h3{font-size:12pt;font-weight:600;margin:1.3em 0 .4em;}
p,ul,ol,pre,table,blockquote{margin:0 0 1em;}a{color:#f5a524;}code{font-family:'JetBrains Mono',Menlo,monospace;font-size:88%;color:#f5a524;}pre{background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px;font-size:9pt;white-space:pre-wrap;}pre code{color:inherit;}
blockquote{border-left:3px solid #f5a524;padding-left:1em;color:#52525b;margin-left:0;}th,td{border-bottom:1px solid #e4e4e7;padding:6px 12px;text-align:left;}th{font-size:9pt;text-transform:uppercase;letter-spacing:.05em;color:#71717a;}hr{border:0;border-top:1px solid #e4e4e7;margin:2em 0;}`,
  },
  dark: {
    label: 'Dark', page: '#0d1117',
    css: `${BASE}${HL_DARK}html,body{background:#0d1117!important;}body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#e6edf3;}
h1,h2{border-bottom:1px solid #30363d;padding-bottom:.3em;}h1{font-size:2em;margin:.2em 0 .6em;color:#fff;}h2{font-size:1.5em;margin:1.4em 0 .6em;color:#fff;}h3{font-size:1.25em;color:#fff;}
p,ul,ol,table,blockquote,pre{margin:0 0 1em;}a{color:#4493f8;}code{font-family:ui-monospace,Menlo,monospace;font-size:85%;background:#262c36;padding:.2em .4em;border-radius:6px;}pre{background:#161b22;border:1px solid #30363d;padding:14px 16px;border-radius:6px;font-size:9pt;white-space:pre-wrap;}pre code{background:none;padding:0;}
blockquote{color:#9198a1;border-left:.25em solid #3d444d;padding:0 1em;margin-left:0;}th,td{border:1px solid #3d444d;padding:6px 13px;}tr:nth-child(2n){background:#151b23;}hr{border:0;height:.25em;background:#3d444d;margin:1.5em 0;}`,
  },
} as const
export type ThemeKey = keyof typeof THEMES

export const SAMPLE_MD = `# OpenFile Markdown to PDF

*Write on the left, see a print-accurate preview on the right, export a real paginated PDF.*

## Why it's nice

- **Private**, everything happens in your browser
- Four themes: *GitHub*, *Academic*, *Minimal* and *Dark*
- Smart page breaks: lines, code blocks, tables and images are never cut in half
- [x] Task lists
- [ ] Footnotes (coming soon)

> "Simplicity is prerequisite for reliability." (Edsger W. Dijkstra)

## Code

\`\`\`ts
// Syntax highlighting works for most languages
export async function convert(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer()
  return new Blob([bytes], { type: 'application/pdf' }) // 100% local
}
\`\`\`

## Tables

| Format   | Input | Output | Notes            |
| -------- | :---: | :----: | ---------------- |
| Markdown |  ✓    |   ✓    | GFM supported    |
| HTML     |  ✓    |   ✓    | Sanitised        |
| PDF      |       |   ✓    | Paginated A4/US  |

## Images

![Placeholder](data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='200'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='%236d4aff'/><stop offset='1' stop-color='%2306b6d4'/></linearGradient></defs><rect width='640' height='200' rx='16' fill='url(%23g)'/><text x='320' y='112' font-family='Arial' font-size='34' fill='white' text-anchor='middle'>OpenFile</text></svg>)

\\pagebreak

## A new page

Use \`\\pagebreak\` (or \`<!-- pagebreak -->\`) on its own line to force a page break.

1. Ordered lists
2. With **bold**, _italic_, ~~strike~~ and \`inline code\`
3. And [links](https://github.com/aniruddhaadak80/OpenFile)

---

That's it, hit **Export PDF**.
`

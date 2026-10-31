const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/marked.esm-Bxf5oh5x.js","assets/rolldown-runtime-BCiCTKAo.js","assets/purify.es-Cm0RpNuY.js"])))=>i.map(i=>d[i]);
import{o as e}from"./rolldown-runtime-BCiCTKAo.js";import{o as t,z as n}from"./files-DFsEDWi8.js";import{C as r,O as i,S as a,Ut as o,Vt as s,c,d as l,f as ee,g as u,h as d,m as f,n as p,p as te,r as m,s as ne,v as re}from"./ui-BnOkXGVZ.js";import{n as ie,t as h}from"./italic-DT0xHtYB.js";import{t as ae}from"./code-xml-ieDbzYZu.js";import{t as oe}from"./file-code-corner-xj9WqU_Q.js";import{t as se}from"./file-down-BYsLbxic.js";import{t as ce}from"./file-text-CYMRj2Dk.js";import{t as le}from"./heading-2-BHZCUqAB.js";import{t as g}from"./link-2-C5VOuWqu.js";import{t as _}from"./list-ordered-F-odMtL_.js";import{t as v}from"./list-LgEukbXR.js";import{t as y}from"./quote-BBcTzBWA.js";import{t as b}from"./scissors-CuzHybTM.js";import{t as x}from"./sparkles-DjYB7mUV.js";import{t as ue}from"./table-C8NINXKd.js";import{Nt as S}from"./index--rrWVhH1.js";import{addPageNumbers as de,htmlDoc as fe,pdfToBlob as pe,renderHtmlToPdf as me}from"./htmlPdf-DcuWd3JP.js";import{c as he,g as ge,i as _e,m as ve,o as ye,p as be,s as xe}from"./shared-CYUqfbNU.js";var C=e(n(),1),w=e=>e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`),T=[[`c`,/\/\/[^\n]*|\/\*[\s\S]*?\*\/|#(?![{\[])[^\n]*|--[^\n]*|<!--[\s\S]*?-->/y],[`s`,/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/y],[`n`,/\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[-+]?\d+)?)\b/y],[`k`,RegExp(`\\b(?:abstract|and|as|async|await|break|case|catch|class|const|continue|def|default|del|do|elif|else|enum|except|export|extends|false|final|finally|fn|for|from|func|function|go|if|impl|import|in|instanceof|interface|is|lambda|let|loop|match|mod|module|mut|new|nil|none|None|not|null|or|package|pass|private|protected|pub|public|raise|return|self|static|struct|super|switch|this|throw|throws|true|True|False|try|type|typeof|undefined|use|var|void|where|while|with|yield|select|insert|update|delete|create|table|values|into|join|on|group|by|order|limit|having|echo|then|fi|done|esac)\\b`,`iy`)],[`f`,/\b[A-Za-z_$][\w$]*(?=\s*\()/y],[`t`,/<\/?[A-Za-z][\w-]*|\/?>/y]];function E(e,t=``){if(/^(text|plain|txt)$/i.test(t))return w(e);let n=/^(html|xml|svg|vue)$/i.test(t),r=T.filter(([e])=>n?[`c`,`s`,`t`].includes(e):e!==`t`).filter(([e])=>!(e===`c`&&/^(css|scss|json)$/i.test(t)&&0)),i=``,a=0,o=``;for(;a<e.length;){let n=!1;for(let[s,c]of r){c.lastIndex=a;let r=c.exec(e);if(r&&r[0].length){if(s===`c`&&r[0].startsWith(`#`)&&!/^(py|python|sh|bash|shell|zsh|rb|ruby|yaml|yml|toml|r|perl|pl|conf|ini|dockerfile|makefile|)$/i.test(t)||s===`c`&&r[0].startsWith(`--`)&&!/^(sql|lua|haskell|hs)$/i.test(t))continue;i+=w(o),o=``,i+=`<span class="hl-${s}">${w(r[0])}</span>`,a+=r[0].length,n=!0;break}}n||(o+=e[a],a++)}return i+w(o)}async function D(e){let[{Marked:t},n]=await Promise.all([S(()=>import(`./marked.esm-Bxf5oh5x.js`).then(e=>e.n),__vite__mapDeps([0,1])),S(()=>import(`./purify.es-Cm0RpNuY.js`).then(e=>e.n),__vite__mapDeps([2,1]))]),r=new t({gfm:!0,breaks:!1});r.use({renderer:{code({text:e,lang:t}){let n=(t||``).trim().split(/\s+/)[0];return`<pre class="code"><code class="language-${w(n)}">${E(e.replace(/\n$/,``),n)}</code>${n?`<span class="lang">${w(n)}</span>`:``}</pre>\n`}}});let i=e.replace(/^\s*(\\pagebreak|\\newpage|<!--\s*pagebreak\s*-->|---\s*pagebreak\s*---)\s*$/gim,`
<div class="page-break"></div>
`),a=await r.parse(i);return(n.default??n).sanitize(a,{ADD_ATTR:[`target`,`class`,`id`,`align`,`start`],FORBID_TAGS:[`script`,`iframe`,`object`,`embed`,`form`]})}var O=`.hl-c{color:#6a737d;font-style:italic}.hl-s{color:#032f62}.hl-n{color:#005cc5}.hl-k{color:#ef4444;font-weight:600}.hl-f{color:#14b8a6}.hl-t{color:#22863a}`,k=`.hl-c{color:#8b949e;font-style:italic}.hl-s{color:#a5d6ff}.hl-n{color:#79c0ff}.hl-k{color:#ff7b72;font-weight:600}.hl-f{color:#5eead4}.hl-t{color:#7ee787}`,A=`.page-break{break-before:page;height:0;}pre.code{position:relative;}pre.code .lang{position:absolute;top:6px;right:10px;font-size:9px;text-transform:uppercase;letter-spacing:.08em;opacity:.55;font-family:Arial,sans-serif;}img{max-width:100%;height:auto;}table{border-collapse:collapse;}input[type=checkbox]{margin:0 .4em 0 0;vertical-align:middle;}li:has(> input[type=checkbox]){list-style:none;margin-left:-1.3em;}`,j={github:{label:`GitHub`,page:`#ffffff`,css:`${A}${O}body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1f2328;background:#fff;}
h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:.3em;}h1{font-size:2em;margin:.2em 0 .6em;}h2{font-size:1.5em;margin:1.4em 0 .6em;}h3{font-size:1.25em;margin:1.2em 0 .5em;}h1,h2,h3,h4{font-weight:600;line-height:1.25;}
p,ul,ol,table,blockquote,pre{margin:0 0 1em;}a{color:#0969da;text-decoration:none;}code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:85%;background:#eff1f3;padding:.2em .4em;border-radius:6px;}
pre{background:#f6f8fa;padding:14px 16px;border-radius:6px;font-size:9pt;line-height:1.45;white-space:pre-wrap;word-break:break-word;}pre code{background:none;padding:0;font-size:100%;}
blockquote{color:#59636e;border-left:.25em solid #d1d9e0;padding:0 1em;margin-left:0;}table{width:auto;}th,td{border:1px solid #d1d9e0;padding:6px 13px;}tr:nth-child(2n){background:#f6f8fa;}th{font-weight:600;}hr{border:0;height:.25em;background:#d1d9e0;margin:1.5em 0;}`},academic:{label:`Academic`,page:`#ffffff`,css:`${A}${O}body{font-family:'Charter','Georgia','Times New Roman',Tinos,serif;font-size:11.5pt;line-height:1.55;color:#111;background:#fff;text-align:justify;hyphens:auto;}
h1{font-size:20pt;text-align:center;margin:0 0 .3em;font-weight:700;}h1+p{text-align:center;font-style:italic;color:#444;}h2{font-size:14pt;margin:1.5em 0 .5em;font-variant:small-caps;letter-spacing:.03em;}h3{font-size:12pt;font-style:italic;margin:1.2em 0 .4em;}
p{margin:0 0 .65em;text-indent:0;}a{color:#1a4f8b;}code{font-family:'Courier New',monospace;font-size:90%;}pre{border-top:1px solid #999;border-bottom:1px solid #999;padding:8px 4px;font-size:9pt;white-space:pre-wrap;text-align:left;}
blockquote{margin:.8em 2em;font-size:10.5pt;color:#333;}table{margin:1em auto;border-top:1.5px solid #000;border-bottom:1.5px solid #000;}th{border-bottom:1px solid #000;padding:4px 10px;}td{padding:3px 10px;}ul,ol{margin:0 0 .8em;}hr{border:0;text-align:center;margin:1.5em 0;}hr:after{content:'* * *';color:#666;}`},minimal:{label:`Minimal`,page:`#ffffff`,css:`${A}${O}body{font-family:'Inter','Helvetica Neue',Arial,sans-serif;font-size:10.5pt;line-height:1.7;color:#27272a;background:#fff;}
h1{font-size:24pt;font-weight:800;letter-spacing:-.02em;margin:0 0 .5em;color:#09090b;}h2{font-size:15pt;font-weight:700;margin:1.6em 0 .5em;color:#09090b;}h3{font-size:12pt;font-weight:600;margin:1.3em 0 .4em;}
p,ul,ol,pre,table,blockquote{margin:0 0 1em;}a{color:#f5a524;}code{font-family:'JetBrains Mono',Menlo,monospace;font-size:88%;color:#f5a524;}pre{background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:14px;font-size:9pt;white-space:pre-wrap;}pre code{color:inherit;}
blockquote{border-left:3px solid #f5a524;padding-left:1em;color:#52525b;margin-left:0;}th,td{border-bottom:1px solid #e4e4e7;padding:6px 12px;text-align:left;}th{font-size:9pt;text-transform:uppercase;letter-spacing:.05em;color:#71717a;}hr{border:0;border-top:1px solid #e4e4e7;margin:2em 0;}`},dark:{label:`Dark`,page:`#0d1117`,css:`${A}${k}html,body{background:#0d1117!important;}body{font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#e6edf3;}
h1,h2{border-bottom:1px solid #30363d;padding-bottom:.3em;}h1{font-size:2em;margin:.2em 0 .6em;color:#fff;}h2{font-size:1.5em;margin:1.4em 0 .6em;color:#fff;}h3{font-size:1.25em;color:#fff;}
p,ul,ol,table,blockquote,pre{margin:0 0 1em;}a{color:#4493f8;}code{font-family:ui-monospace,Menlo,monospace;font-size:85%;background:#262c36;padding:.2em .4em;border-radius:6px;}pre{background:#161b22;border:1px solid #30363d;padding:14px 16px;border-radius:6px;font-size:9pt;white-space:pre-wrap;}pre code{background:none;padding:0;}
blockquote{color:#9198a1;border-left:.25em solid #3d444d;padding:0 1em;margin-left:0;}th,td{border:1px solid #3d444d;padding:6px 13px;}tr:nth-child(2n){background:#151b23;}hr{border:0;height:.25em;background:#3d444d;margin:1.5em 0;}`}},M=`# OpenFile Markdown to PDF

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

![Placeholder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='640'%20height='200'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0'%20x2='1'%3E%3Cstop%20offset='0'%20stop-color='%230ea5e9'/%3E%3Cstop%20offset='1'%20stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='640'%20height='200'%20rx='16'%20fill='url%28%23g%29'/%3E%3Ctext%20x='320'%20y='112'%20font-family='Arial'%20font-size='34'%20fill='white'%20text-anchor='middle'%3EOpenFile%3C/text%3E%3C/svg%3E)

\\pagebreak

## A new page

Use \`\\pagebreak\` (or \`<!-- pagebreak -->\`) on its own line to force a page break.

1. Ordered lists
2. With **bold**, _italic_, ~~strike~~ and \`inline code\`
3. And [links](https://github.com/aniruddhaadak80/OpenFile)

---

That's it, hit **Export PDF**.
`,N=s(),P=`openfile:md2pdf`;function F(){let[e,n]=(0,C.useState)(()=>{try{return localStorage.getItem(P)||`# OpenFile Markdown to PDF

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

![Placeholder](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='640'%20height='200'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0'%20x2='1'%3E%3Cstop%20offset='0'%20stop-color='%230ea5e9'/%3E%3Cstop%20offset='1'%20stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='640'%20height='200'%20rx='16'%20fill='url%28%23g%29'/%3E%3Ctext%20x='320'%20y='112'%20font-family='Arial'%20font-size='34'%20fill='white'%20text-anchor='middle'%3EOpenFile%3C/text%3E%3C/svg%3E)

\\pagebreak

## A new page

Use \`\\pagebreak\` (or \`<!-- pagebreak -->\`) on its own line to force a page break.

1. Ordered lists
2. With **bold**, _italic_, ~~strike~~ and \`inline code\`
3. And [links](https://github.com/aniruddhaadak80/OpenFile)

---

That's it, hit **Export PDF**.
`}catch{return M}}),[s,S]=(0,C.useState)(``),[w,T]=(0,C.useState)(`github`),[E,O]=(0,C.useState)(`a4`),[k,A]=(0,C.useState)(`portrait`),[F,Se]=(0,C.useState)(18),[I,Ce]=(0,C.useState)(!0),[L,we]=(0,C.useState)(100),[R,Te]=(0,C.useState)(`document`),[z,Ee]=(0,C.useState)(`edit`),[B,V]=(0,C.useState)(null),H=(0,C.useRef)(null),U=(0,C.useRef)(null),W=ge(e,180),{busy:G,progress:De,error:Oe,run:ke}=r();(0,C.useEffect)(()=>{let e=!1;D(W).then(t=>{e||S(t)});try{localStorage.setItem(P,W)}catch{}return()=>{e=!0}},[W]),(0,C.useEffect)(()=>{let e=W.match(/^#\s+(.+)$/m);e&&Te(e[1].replace(/[^\w\- ]+/g,``).trim().replace(/\s+/g,`-`).toLowerCase().slice(0,60)||`document`)},[W]),(0,C.useEffect)(()=>V(null),[W,w,E,k,F,I,L]);let K=j[w],Ae=parseFloat(/body\{[^}]*?font-size:([\d.]+)pt/.exec(K.css)?.[1]??`11`),q=K.css+(L===100?``:`body{font-size:${(L/100*Ae).toFixed(2)}pt!important;}`),J=ve(E,k),Y=be(F),X=(t,r=t,i=`text`)=>{let a=H.current;if(!a)return;let{selectionStart:o,selectionEnd:s}=a,c=e.slice(o,s)||i,l=e.slice(0,o)+t+c+r+e.slice(s);n(l),requestAnimationFrame(()=>{a.focus(),a.setSelectionRange(o+t.length,o+t.length+c.length)})},Z=t=>{let r=H.current;if(!r)return;let{selectionStart:i,selectionEnd:a}=r,o=e.lastIndexOf(`
`,i-1)+1,s=e.slice(o,a).split(`
`).map((e,n)=>(t===`1. `?`${n+1}. `:t)+e).join(`
`);n(e.slice(0,o)+s+e.slice(a)),requestAnimationFrame(()=>r.focus())},Q=t=>{let r=H.current;if(!r)return;let i=r.selectionStart;n(e.slice(0,i)+t+e.slice(r.selectionEnd)),requestAnimationFrame(()=>{r.focus(),r.setSelectionRange(i+t.length,i+t.length)})},je=e=>{e.key===`Tab`&&(e.preventDefault(),Q(`  `)),(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()===`b`&&(e.preventDefault(),X(`**`)),(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()===`i`&&(e.preventDefault(),X(`_`))},Me=()=>ke(async t=>{let n=await D(e),r=I?Math.max(Y,34):Y,{pdf:a,pages:o}=await me(fe(n,q,R),{pageWidth:J.w,pageHeight:J.h,margin:{top:Y,right:Y,bottom:r,left:Y},pageBackground:K.page===`#ffffff`?void 0:K.page,onProgress:e=>t(e)});I&&de(a,{bottom:Math.min(r/2,22),color:w===`dark`?`#8b949e`:`#8a8f9c`}),a.setProperties({title:R,creator:`OpenFile`}),V({blob:pe(a),pages:o}),i(`PDF exported`,`success`)}),Ne=async()=>{let n=await D(e),r=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${R}</title><style>${K.css}body{max-width:820px;margin:40px auto;padding:0 24px;}</style></head><body>${n}</body></html>`;t(new Blob([r],{type:`text/html;charset=utf-8`}),`${R}.html`)},$=async e=>{e&&(!/\.(md|markdown|mdown|mkd|txt)$/i.test(e.name)&&!/^text\//.test(e.type)?i(`${e.name} is not a Markdown or text file. Choose a .md or .txt file.`,`error`):(n(await e.text()),i(`Loaded ${e.name}`,`success`)))},Pe=[[(0,N.jsx)(ie,{className:`size-4`}),`Bold (Ctrl+B)`,()=>X(`**`)],[(0,N.jsx)(h,{className:`size-4`}),`Italic (Ctrl+I)`,()=>X(`_`)],[(0,N.jsx)(le,{className:`size-4`}),`Heading`,()=>Z(`## `)],[(0,N.jsx)(g,{className:`size-4`}),`Link`,()=>X(`[`,`](https://)`,`link text`)],[(0,N.jsx)(ae,{className:`size-4`}),`Code block`,()=>X("\n```js\n","\n```\n",`code`)],[(0,N.jsx)(y,{className:`size-4`}),`Quote`,()=>Z(`> `)],[(0,N.jsx)(v,{className:`size-4`}),`Bullet list`,()=>Z(`- `)],[(0,N.jsx)(_,{className:`size-4`}),`Numbered list`,()=>Z(`1. `)],[(0,N.jsx)(ue,{className:`size-4`}),`Table`,()=>Q(`
| Column A | Column B |
| -------- | -------- |
| Value    | Value    |
`)],[(0,N.jsx)(b,{className:`size-4`}),`Page break`,()=>Q(`

\\pagebreak

`)]];return(0,N.jsxs)(`div`,{className:`space-y-4`,children:[(0,N.jsxs)(m,{className:`flex flex-wrap items-end gap-x-5 gap-y-3 p-4`,children:[(0,N.jsxs)(`div`,{children:[(0,N.jsx)(l,{children:`Theme`}),(0,N.jsx)(`div`,{className:`flex flex-wrap gap-1.5`,children:Object.keys(j).map(e=>(0,N.jsx)(xe,{active:w===e,onClick:()=>T(e),children:j[e].label},e))})]}),(0,N.jsx)(c,{label:`Page`,className:`w-28`,children:(0,N.jsx)(d,{value:E,onChange:O,options:[{value:`a4`,label:`A4`},{value:`letter`,label:`Letter`},{value:`legal`,label:`Legal`},{value:`a5`,label:`A5`}]})}),(0,N.jsxs)(`div`,{children:[(0,N.jsx)(l,{children:`Orientation`}),(0,N.jsx)(f,{value:k,onChange:A,options:[{value:`portrait`,label:`Portrait`},{value:`landscape`,label:`Landscape`}]})]}),(0,N.jsx)(u,{className:`w-36`,label:`Margins`,value:F,onChange:Se,min:5,max:35,suffix:` mm`}),(0,N.jsx)(u,{className:`w-32`,label:`Text size`,value:L,onChange:we,min:80,max:130,step:5,suffix:`%`}),(0,N.jsx)(`div`,{className:`pb-2`,children:(0,N.jsx)(re,{checked:I,onChange:Ce,label:`Page numbers`})})]}),(0,N.jsx)(`div`,{className:`flex gap-1 lg:hidden`,children:(0,N.jsx)(f,{value:z,onChange:Ee,options:[{value:`edit`,label:`Editor`},{value:`preview`,label:`Preview`}]})}),(0,N.jsxs)(`div`,{className:`grid gap-4 lg:grid-cols-2`,children:[(0,N.jsxs)(`div`,{className:a(`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface`,z!==`edit`&&`hidden lg:flex`),children:[(0,N.jsxs)(`div`,{className:`flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-2/40 px-2 py-1.5`,children:[Pe.map(([e,t,n])=>(0,N.jsx)(`button`,{title:t,"aria-label":t,onClick:n,className:`rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-fg cursor-pointer`,children:e},t)),(0,N.jsxs)(`div`,{className:`ml-auto flex gap-1`,children:[(0,N.jsx)(`input`,{ref:U,type:`file`,accept:`.md,.markdown,.txt,text/markdown,text/plain`,hidden:!0,onChange:e=>{$(e.target.files?.[0]),e.target.value=``}}),(0,N.jsx)(p,{size:`sm`,variant:`ghost`,icon:(0,N.jsx)(o,{className:`size-3.5`}),onClick:()=>U.current?.click(),children:`Open`}),(0,N.jsx)(p,{size:`sm`,variant:`ghost`,icon:(0,N.jsx)(x,{className:`size-3.5`}),onClick:()=>n(M),children:`Sample`})]})]}),(0,N.jsx)(`textarea`,{ref:H,value:e,onChange:e=>n(e.target.value),onKeyDown:je,spellCheck:!1,placeholder:`# Start writing Markdown…`,onDragOver:e=>e.preventDefault(),onDrop:e=>{let t=e.dataTransfer.files[0];t&&(e.preventDefault(),$(t))},className:`h-[72vh] w-full resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-fg outline-none scrollbar-thin`}),(0,N.jsxs)(`div`,{className:`flex justify-between border-t border-border px-3 py-1.5 font-mono text-[10px] text-muted`,children:[(0,N.jsxs)(`span`,{children:[e.length.toLocaleString(),` chars · `,(e.match(/\S+/g)??[]).length.toLocaleString(),` words`]}),(0,N.jsx)(`span`,{children:`autosaved locally`})]})]}),(0,N.jsx)(`div`,{className:a(`min-w-0`,z!==`preview`&&`hidden lg:block`),children:(0,N.jsx)(_e,{css:q,body:s,pageWidthPt:J.w,marginPt:Y,pageBg:K.page,desk:w===`dark`?`#1c2128`:void 0,height:`calc(72vh + 82px)`})})]}),(0,N.jsxs)(m,{className:`flex flex-wrap items-center gap-3 p-4`,children:[(0,N.jsx)(p,{size:`lg`,loading:G,icon:(0,N.jsx)(se,{className:`size-5`}),onClick:Me,disabled:!e.trim(),children:`Export PDF`}),(0,N.jsx)(p,{variant:`outline`,icon:(0,N.jsx)(oe,{className:`size-4`}),onClick:Ne,disabled:!e.trim(),children:`Download .html`}),(0,N.jsx)(p,{variant:`outline`,icon:(0,N.jsx)(ce,{className:`size-4`}),onClick:()=>t(new Blob([e],{type:`text/markdown;charset=utf-8`}),`${R}.md`),disabled:!e.trim(),children:`Download .md`}),G&&(0,N.jsx)(`div`,{className:`min-w-48 flex-1`,children:(0,N.jsx)(ee,{value:De,label:`Rendering pages`})}),(0,N.jsx)(ne,{error:Oe})]}),B&&(0,N.jsxs)(he,{k:`res`,className:`space-y-3`,children:[(0,N.jsx)(te,{blob:B.blob,filename:`${R}.pdf`,title:`PDF ready · ${B.pages} page${B.pages>1?`s`:``}`}),(0,N.jsx)(ye,{blob:B.blob,height:600})]})]})}export{F as default};
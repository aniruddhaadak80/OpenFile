/* Print stylesheets used by the HTML-based converters (all colours are plain hex so html2canvas can render them). */
export const WORD_CSS = (font: string, size: number) => `
body{font-family:${font};font-size:${size}pt;line-height:1.5;color:#1a1a1a;background:#fff;word-wrap:break-word;}
h1,h2,h3,h4,h5,h6{font-weight:700;line-height:1.25;margin:1.1em 0 .45em;color:#111;}
h1{font-size:${size * 1.9}pt;}h2{font-size:${size * 1.55}pt;}h3{font-size:${size * 1.3}pt;}h4{font-size:${size * 1.12}pt;}h5,h6{font-size:${size}pt;}
p{margin:0 0 .7em;}ul,ol{margin:0 0 .7em;padding-left:2em;}li{margin:.15em 0;}
table{border-collapse:collapse;width:100%;margin:.6em 0 1em;font-size:${size * 0.95}pt;}
td,th{border:1px solid #b8bcc6;padding:4px 7px;vertical-align:top;text-align:left;}th{background:#f1f3f7;}
td p,th p{margin:0;}img{max-width:100%;height:auto;}a{color:#1d4ed8;text-decoration:underline;}
blockquote{margin:.6em 0;padding:.2em 1em;border-left:3px solid #c7cbd6;color:#444;}
sup,sub{font-size:.75em;}hr{border:0;border-top:1px solid #ccc;margin:1em 0;}
`

/* Friendly syntax for the math notebook, turned into mathjs syntax (pure). */
export function prep(line: string): string {
  let s = line.replace(/\/\/.*$|#.*$/, '').trim()
  if (!s) return ''
  s = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\^/g, '^')
  s = s.replace(/(\d)\s*,\s*(?=\d{3}\b)/g, '$1') // 1,234 -> 1234
  // "20% of 150" -> (20/100)*150
  s = s.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s+/gi, '($1/100)*')
  // "150 + 20%" / "150 - 20%" -> 150*(1+0.2)
  s = s.replace(/^(.+?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%\s*$/, (_, a, op, p) => `(${a})*(1${op}${p}/100)`)
  // "50 as % of 200" / "50 is what % of 200"
  s = s.replace(/^(.+?)\s+(?:as|is what)\s*%\s*of\s+(.+)$/i, '($1)/($2)*100')
  // remaining bare percents: 15% -> 0.15
  s = s.replace(/(\d+(?:\.\d+)?)\s*%(?!\s*\w)/g, '($1/100)')
  s = s.replace(/\bin\s+(?=[a-zA-Z])/g, 'to ')
  return s
}

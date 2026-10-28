export function pigLatin(t: string): string {
  return t.replace(/[A-Za-z]+/g, (w) => {
    const m = w.match(/^([^aeiouAEIOU]*)(.*)$/)!
    const lead = m[1], rest = m[2]
    let out = rest === '' ? w + 'ay' : lead === '' ? w + 'way' : rest + lead + 'ay'
    if (w[0] === w[0].toUpperCase() && lead !== '' && rest !== '') out = out[0].toUpperCase() + out.slice(1).toLowerCase()
    return out
  })
}
const NATO: Record<string, string> = { A:'Alfa',B:'Bravo',C:'Charlie',D:'Delta',E:'Echo',F:'Foxtrot',G:'Golf',H:'Hotel',I:'India',J:'Juliett',K:'Kilo',L:'Lima',M:'Mike',N:'November',O:'Oscar',P:'Papa',Q:'Quebec',R:'Romeo',S:'Sierra',T:'Tango',U:'Uniform',V:'Victor',W:'Whiskey',X:'Xray',Y:'Yankee',Z:'Zulu','0':'Zero','1':'One','2':'Two','3':'Three','4':'Four','5':'Five','6':'Six','7':'Seven','8':'Eight','9':'Niner' }
export function nato(t: string): string {
  return t.split('\n').map((l) => [...l].map((c) => c === ' ' ? '/' : NATO[c.toUpperCase()] ?? c).join(' ')).join('\n')
}
const UP: Record<string, string> = { a:'ɐ',b:'q',c:'ɔ',d:'p',e:'ǝ',f:'ɟ',g:'ƃ',h:'ɥ',i:'ᴉ',j:'ɾ',k:'ʞ',l:'l',m:'ɯ',n:'u',o:'o',p:'d',q:'b',r:'ɹ',s:'s',t:'ʇ',u:'n',v:'ʌ',w:'ʍ',x:'x',y:'ʎ',z:'z','1':'⇂','2':'ᄅ','3':'Ɛ','4':'ㄣ','5':'ϛ','6':'9','7':'ㄥ','8':'8','9':'6','0':'0','.':'˙',',':"'",'?':'¿','!':'¡','(':')',')':'(' }
export function upsideDown(t: string): string {
  return t.split('\n').map((l) => [...l.toLowerCase()].map((c) => UP[c] ?? c).reverse().join('')).join('\n')
}
export function removeVowels(t: string, keepFirst = false): string {
  return t.replace(/\b[A-Za-z]+\b/g, (w) => keepFirst ? w[0] + w.slice(1).replace(/[aeiou]/gi, '') : w.replace(/[aeiou]/gi, ''))
}
const LEET: Record<string, string> = { a:'4',e:'3',i:'1',o:'0',s:'5',t:'7',l:'1',b:'8',g:'9' }
export function leet(t: string): string { return [...t].map((c) => LEET[c.toLowerCase()] ?? c).join('') }

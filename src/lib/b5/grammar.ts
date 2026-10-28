/* Light rule-based style and grammar checks (pure). */
export type Issue = { start: number; end: number; msg: string; kind: 'spelling' | 'grammar' | 'style'; fix?: string[] }

const CONFUSED: [RegExp, string, string[]][] = [
  [/\b(could|would|should|must|might) of\b/gi, 'Use “have”, not “of”, after this word.', ['$1 have']],
  [/\balot\b/gi, '“A lot” is two words.', ['a lot']],
  [/\bthere(?= (?:is|are|was|were)\b)/g, '', []],
  [/\byour (?=(?:welcome|right|wrong|going|not)\b)/gi, 'Did you mean “you’re” (you are)?', ["you're "]],
  [/\bits (?=(?:a|an|the|been|not|going|very|so|time)\b)/gi, 'Did you mean “it’s” (it is)?', ["it's "]],
  [/\bthen (?=(?:I|me|him|her|us|them|you)\b(?! (?:went|said|did)))/g, '', []],
  [/\b(more|less|better|worse|bigger|smaller|faster|slower|rather) then\b/gi, 'Use “than” for comparisons.', ['$1 than']],
  [/\bloose (?=(?:weight|the game|my|your|his|her|our|their)\b)/gi, 'Did you mean “lose”?', ['lose ']],
  [/\beffect (?=(?:the|my|your|our|their|his|her)\b)/gi, 'As a verb, “affect” is usually right.', ['affect ']],
  [/\bsuppose to\b/gi, 'Use “supposed to”.', ['supposed to']],
  [/\bfor all intensive purposes\b/gi, 'The phrase is “for all intents and purposes”.', ['for all intents and purposes']],
  [/\bi\b/g, 'Capitalise “I”.', ['I']],
]

export function checkGrammar(text: string): Issue[] {
  const out: Issue[] = []
  // repeated words
  for (const m of text.matchAll(/\b(\w+)\s+\1\b/gi)) if (!/^(that|had|bye|ha|no)$/i.test(m[1])) out.push({ start: m.index!, end: m.index! + m[0].length, msg: `“${m[1]}” is repeated.`, kind: 'grammar', fix: [m[1]] })
  // a / an
  for (const m of text.matchAll(/\b(a|an)\s+([A-Za-z][\w-]*)/gi)) {
    const w = m[2].toLowerCase(); const vowel = /^[aeiou]/.test(w)
    const anEx = /^(hour|honest|honou?r|heir|herb(?!al)|mba|fbi|faq|html|sql|mri|x-?ray|f\d|s\b|l\b|m\b|n\b|r\b|x\b)/.test(w)
    const aEx = /^(uni|use|usu|uti|one|once|euro|eu|ewe|ufo|url|uk\b|us\b|ui\b)/.test(w)
    const needAn = (vowel && !aEx) || anEx
    if (m[1].toLowerCase() === 'a' && needAn) out.push({ start: m.index!, end: m.index! + m[1].length, msg: `Use “an” before “${m[2]}”.`, kind: 'grammar', fix: [m[1] === 'A' ? 'An' : 'an'] })
    if (m[1].toLowerCase() === 'an' && !needAn) out.push({ start: m.index!, end: m.index! + m[1].length, msg: `Use “a” before “${m[2]}”.`, kind: 'grammar', fix: [m[1] === 'An' ? 'A' : 'a'] })
  }
  // capital after sentence end
  for (const m of text.matchAll(/([.!?])\s+([a-z])/g)) { const before = text.slice(Math.max(0, m.index! - 4), m.index!); if (/\b(e\.g|i\.e|etc|vs|approx|no|fig)$/i.test(before + m[1]) || /\d$/.test(before)) continue; const p = m.index! + m[0].length - 1; out.push({ start: p, end: p + 1, msg: 'Start the sentence with a capital letter.', kind: 'grammar', fix: [m[2].toUpperCase()] }) }
  for (const [re, msg, fix] of CONFUSED) { if (!msg) continue; for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length, msg, kind: 'grammar', fix: fix.map((f) => m[0].replace(re, f)) }) }
  // double spaces, space before punctuation
  for (const m of text.matchAll(/(?<=\S) {2,}(?=\S)/g)) out.push({ start: m.index!, end: m.index! + m[0].length, msg: 'Extra spaces.', kind: 'style', fix: [' '] })
  for (const m of text.matchAll(/ +([,.;:!?])(?!\w)/g)) out.push({ start: m.index!, end: m.index! + m[0].length, msg: 'No space before punctuation.', kind: 'style', fix: [m[1]] })
  for (const m of text.matchAll(/([,;:])(?=[A-Za-z])/g)) out.push({ start: m.index!, end: m.index! + 1, msg: 'Add a space after the punctuation.', kind: 'style', fix: [m[1] + ' '] })
  // style: wordy phrases
  const WORDY: [RegExp, string][] = [[/\bin order to\b/gi, 'to'], [/\bat this point in time\b/gi, 'now'], [/\bdue to the fact that\b/gi, 'because'], [/\bin spite of the fact that\b/gi, 'although'], [/\bvery unique\b/gi, 'unique'], [/\bin the event that\b/gi, 'if']]
  for (const [re, f] of WORDY) for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length, msg: `Wordy. Try “${f}”.`, kind: 'style', fix: [f] })
  return out.sort((a, b) => a.start - b.start)
}

/** Words to spell-check with their offsets. Skips URLs, emails, code and numbers. */
export function words(text: string): { w: string; start: number }[] {
  const skip: [number, number][] = []
  for (const m of text.matchAll(/https?:\/\/\S+|\S+@\S+\.\S+|`[^`]*`|\b[A-Z0-9_]{2,}\b|\w*\d\w*/g)) skip.push([m.index!, m.index! + m[0].length])
  const out: { w: string; start: number }[] = []
  for (const m of text.matchAll(/[\p{L}][\p{L}'’-]*[\p{L}]|[\p{L}]/gu)) {
    const s = m.index!; if (skip.some(([a, b]) => s >= a && s < b)) continue
    out.push({ w: m[0].replace(/’/g, "'").replace(/^'+|'+$/g, ''), start: s })
  }
  return out
}

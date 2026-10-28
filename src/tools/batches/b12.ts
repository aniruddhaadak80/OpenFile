import type { ToolMeta } from '../registry'

export const BATCH_12: ToolMeta[] = [
  { slug: 'pig-latin', name: 'Pig Latin Translator', desc: 'Translate English text into Pig Latin.', category: 'text', icon: 'Languages', badge: 'NEW', tags: ['pig', 'latin'], inputs: ['Text'], outputs: ['Text'],
    how: 'Each character or word is mapped by fixed rules as you type. Nothing leaves your device.',
    steps: ['Paste or open your text.', 'Read the result.', 'Copy or download it.'],
    related: ['case-converter','line-sorter'] },
  { slug: 'nato-alphabet', name: 'NATO Alphabet Speller', desc: 'Spell text with Alfa, Bravo, Charlie and the rest.', category: 'text', icon: 'Radio', badge: 'NEW', tags: ['nato', 'phonetic', 'spelling'], inputs: ['Text'], outputs: ['Text'],
    how: 'Each character or word is mapped by fixed rules as you type. Nothing leaves your device.',
    steps: ['Paste or open your text.', 'Read the result.', 'Copy or download it.'],
    related: ['case-converter','line-sorter'] },
  { slug: 'upside-down-text', name: 'Upside Down Text', desc: 'Flip text upside down with look-alike characters.', category: 'text', icon: 'FlipVertical', badge: 'NEW', tags: ['flip', 'upside', 'down'], inputs: ['Text'], outputs: ['Text'],
    how: 'Each character or word is mapped by fixed rules as you type. Nothing leaves your device.',
    steps: ['Paste or open your text.', 'Read the result.', 'Copy or download it.'],
    related: ['case-converter','line-sorter'] },
  { slug: 'vowel-remover', name: 'Vowel Remover', desc: 'Remove the vowels from every word.', category: 'text', icon: 'Eraser', badge: 'NEW', tags: ['vowels', 'remove'], inputs: ['Text'], outputs: ['Text'],
    how: 'Each character or word is mapped by fixed rules as you type. Nothing leaves your device.',
    steps: ['Paste or open your text.', 'Read the result.', 'Copy or download it.'],
    related: ['case-converter','line-sorter'] },
  { slug: 'leet-speak', name: 'Leet Speak Converter', desc: 'Turn text into 1337 speak.', category: 'text', icon: 'Binary', badge: 'NEW', tags: ['leet', '1337'], inputs: ['Text'], outputs: ['Text'],
    how: 'Each character or word is mapped by fixed rules as you type. Nothing leaves your device.',
    steps: ['Paste or open your text.', 'Read the result.', 'Copy or download it.'],
    related: ['case-converter','line-sorter'] },
]

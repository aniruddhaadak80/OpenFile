// quicktype-core options used by json-to-types work in Node.
import assert from 'node:assert'
import * as qt from 'quicktype-core'
for (const lang of ['typescript', 'typescript-zod', 'go', 'rust', 'python', 'java', 'csharp', 'swift', 'kotlin', 'dart', 'cpp', 'php', 'ruby', 'elm', 'schema']) {
  const input = qt.jsonInputForTargetLanguage(lang)
  await input.addSource({ name: 'Root', samples: ['{"a":1,"b":[{"c":"x"}],"d":true}'] })
  const data = new qt.InputData(); data.addInput(input)
  const res = await qt.quicktype({ inputData: data, lang, rendererOptions: lang === 'typescript' ? { 'just-types': 'true', 'prefer-unions': 'true' } : {} })
  assert.ok(res.lines.join('\n').length > 20, lang)
}
console.log('ok quicktype 15 languages')

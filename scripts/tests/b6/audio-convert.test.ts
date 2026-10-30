// Runs the Audio Converter's real ffmpeg arguments against the ffmpeg.wasm core the browser uses.
// Run: npx tsx scripts/tests/b6/audio-convert.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { convertArgs } from '../../../src/tools/audio/convert-args'
// @ts-ignore
import { ffmpeg } from '../b3/ffwasm.mjs'

const S = new URL('../../../../samples/', import.meta.url)
const inputs: Record<string, Uint8Array> = {
  'in.wav': fs.readFileSync(new URL('sample.wav', S)),
  'in.mp3': fs.readFileSync(new URL('sample.mp3', S)),
}
const fmts = ['mp3', 'opus', 'aiff', 'flac', 'm4a', 'wav', 'ogg', 'aac', 'alac', 'weba', 'wma', 'ac3', 'caf', 'au', 'mp2', 'voc'] as const
let hasProbe = true
try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }) } catch { hasProbe = false }
let fails = 0
for (const [input, data] of Object.entries(inputs)) {
  for (const f of fmts) {
    const { ext, args } = convertArgs(f as any, 192)
    const out = `out.${ext}`
    const full = ['-i', input, '-vn', '-map', '0:a:0', ...args, out]
    try {
      const r = await ffmpeg(full, { [input]: data }, [out])
      assert.equal(r.code, 0, r.logs.slice(-4).join('\n'))
      const bytes = r.out[out] as Uint8Array
      assert.ok(bytes && bytes.length > 1000, 'empty output')
      let info = ''
      if (hasProbe) {
        const tmp = `/tmp/ac-test.${ext}`; fs.writeFileSync(tmp, bytes)
        info = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration', '-of', 'csv=p=0', tmp]).toString().trim().replace(/\n/g, ' ')
        const dur = parseFloat(info.split(' ').pop()!)
        assert.ok(dur > 2.5, `duration ${dur}`)
      }
      console.log('ok  ', input, '->', f, bytes.length, info)
    } catch (e: any) { fails++; console.log('FAIL', input, '->', f, e.message.split('\n')[0]) }
  }
}
// Vorbis in bitrate mode refused 320k mono and 192k at 22 kHz; quality mode takes every mix
for (const [br, extra] of [[320, ['-ac', '1']], [192, ['-ar', '22050']], [256, ['-ar', '16000', '-ac', '1']]] as const) {
  const { ext, args } = convertArgs('ogg', br)
  const r = await ffmpeg(['-i', 'in.mp3', ...extra, ...args, `out.${ext}`], inputs, [`out.${ext}`])
  if (r.code !== 0 || !r.out[`out.${ext}`]?.length) { fails++; console.log('FAIL ogg', br, extra.join(' ')) } else console.log('ok   ogg', br, extra.join(' '), r.out[`out.${ext}`].length)
}
assert.equal(fails, 0, `${fails} conversions failed`)
console.log('all audio conversions passed')

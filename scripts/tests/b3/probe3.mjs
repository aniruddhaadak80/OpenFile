import { ffmpeg } from './ffwasm.mjs'
import fs from 'node:fs'
const font = fs.readFileSync('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf')
const srt = new TextEncoder().encode('1\n00:00:00,000 --> 00:00:01,500\nHello world\n')
for (const vf of ["subtitles=s.srt:fontsdir=/fonts:force_style='FontName=Liberation Sans'", "subtitles=s.srt:fontsdir=/fonts:force_style='FontName=Liberation Sans,Bold=1'"]) {
let r = await ffmpeg(['-f','lavfi','-i','color=black:size=320x240:rate=10:duration=1','-vf',vf,'-frames:v','1','o.png'], {'s.srt':srt,'/fonts/LiberationSans-Bold.ttf':font}, ['o.png'])
console.log(r.code, r.out['o.png']?.length, r.logs.filter(l=>/font|glyph/i.test(l)&&!/configuration/.test(l)).slice(0,6))
}

import { ffmpeg } from './ffwasm.mjs'
import fs from 'node:fs'
const font = fs.readFileSync('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf')
const srt = new TextEncoder().encode('1\n00:00:00,000 --> 00:00:01,500\nHello world\n')
let r = await ffmpeg(['-f','lavfi','-i','color=black:size=320x240:rate=10:duration=1','-vf','subtitles=s.srt:fontsdir=/fonts','-frames:v','1','o.png'], {'s.srt':srt,'/fonts/LiberationSans-Bold.ttf':font}, ['o.png'])
console.log('subs png', r.code, r.out['o.png']?.length, r.logs.filter(l=>/font|libass|glyph/i.test(l)).slice(0,6))
r = await ffmpeg(['-f','lavfi','-i','testsrc=size=160x120:rate=10:duration=1','-f','apng','-plays','0','a.apng'],{},['a.apng'])
const apng = r.out['a.apng']
r = await ffmpeg(['-i','a.apng','-c:v','libwebp_anim','-loop','0','-lossless','0','-q:v','75','o.webp'],{'a.apng':apng},['o.webp'])
console.log('apng->webp', r.code, r.out['o.webp']?.length)
const webp = r.out['o.webp']; fs.writeFileSync('/tmp/b3t/anim.webp', webp); fs.writeFileSync('/tmp/b3t/anim.apng', apng)
r = await ffmpeg(['-i','o.webp','o.mp4'],{'o.webp':webp},['o.mp4'])
console.log('webp decode', r.code, r.logs.slice(-3).join('|').slice(0,300))
r = await ffmpeg(['-f','lavfi','-i','testsrc=size=160x120:rate=10:duration=1','-vf','split[a][b];[a]palettegen[p];[b][p]paletteuse','o.gif'],{},['o.gif'])
fs.writeFileSync('/tmp/b3t/anim.gif', r.out['o.gif']); console.log('gif', r.code)

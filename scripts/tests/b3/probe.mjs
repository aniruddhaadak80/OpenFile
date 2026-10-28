import { ffmpeg } from './ffwasm.mjs'
import fs from 'node:fs'
const font = fs.readFileSync('../../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf')
const srt = new TextEncoder().encode('1\n00:00:00,000 --> 00:00:01,500\nHello world\n')
const tests = {
  subs: [['-f','lavfi','-i','testsrc=size=320x240:rate=10:duration=2','-vf','subtitles=s.srt:fontsdir=/fonts:force_style=\'FontName=Liberation Sans\'','-c:v','libx264','-preset','ultrafast','o.mp4'], {'s.srt':srt,'/fonts/LiberationSans-Bold.ttf':font}, ['o.mp4']],
  deshake: [['-f','lavfi','-i','testsrc=size=160x120:rate=10:duration=1','-vf','deshake','-c:v','libx264','-preset','ultrafast','o.mp4'],{},['o.mp4']],
  mint: [['-f','lavfi','-i','testsrc=size=160x120:rate=10:duration=1','-vf','minterpolate=fps=20:mi_mode=blend','-c:v','libx264','-preset','ultrafast','o.mp4'],{},['o.mp4']],
  xfade: [['-f','lavfi','-i','testsrc=size=160x120:rate=10:duration=2','-f','lavfi','-i','smptebars=size=160x120:rate=10:duration=2','-filter_complex','[0][1]xfade=transition=fade:duration=0.5:offset=1.5,format=yuv420p','-c:v','libx264','-preset','ultrafast','o.mp4'],{},['o.mp4']],
  apng2webp: [['-f','lavfi','-i','testsrc=size=160x120:rate=10:duration=1','-f','apng','-plays','0','a.apng'],{},['a.apng']],
  reverse: [['-f','lavfi','-i','testsrc=size=160x120:rate=10:duration=1','-vf','reverse,tpad=stop_mode=clone:stop_duration=1,delogo=x=10:y=10:w=40:h=30,chromakey=0x00ff00:0.1:0.05','-c:v','libx264','-preset','ultrafast','o.mp4'],{},['o.mp4']],
}
for (const [k,[a,f,o]] of Object.entries(tests)) {
  const r = await ffmpeg(a,f,o)
  console.log(k, r.code, Object.fromEntries(Object.entries(r.out).map(([n,d])=>[n,d?.length])), r.code? r.logs.slice(-4).join(' | ').slice(0,400):'')
}

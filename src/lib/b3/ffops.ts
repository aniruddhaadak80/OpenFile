/* ffmpeg argument builders for the Batch 3 video tools.
 * Pure functions (no DOM, no ffmpeg instance) so every recipe is unit-tested against the same
 * ffmpeg.wasm core the browser loads. Video is encoded as H.264 (yuv420p) in MP4 unless noted. */

export const H264 = (crf = 21) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p']
export const AAC = ['-c:a', 'aac', '-b:a', '160k']
export const FASTSTART = ['-movflags', '+faststart']
/** even dimensions are required by yuv420p */
export const EVEN = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

export interface Op { args: string[]; output: string }
const mp4 = (inArgs: string[], vf: string | null, audio: 'copy' | 'aac' | 'none' | string[], out = 'out.mp4', extra: string[] = []): Op => ({
  output: out,
  args: [...inArgs, ...(vf ? ['-vf', vf] : []), ...H264(), ...(audio === 'none' ? ['-an'] : audio === 'copy' ? ['-c:a', 'copy'] : audio === 'aac' ? AAC : audio), ...extra, ...FASTSTART, out],
})
const n = (v: number) => String(Math.round(v))
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString()

/* ------------------------------------------------------------------ geometry */

export function cropOp(input: string, r: { x: number; y: number; w: number; h: number }, hasAudio: boolean): Op {
  const w = Math.max(2, Math.floor(r.w / 2) * 2), h = Math.max(2, Math.floor(r.h / 2) * 2)
  return mp4(['-i', input], `crop=${w}:${h}:${n(r.x)}:${n(r.y)}`, hasAudio ? 'copy' : 'none')
}

export type Rotation = 0 | 90 | 180 | 270
export function rotateOp(input: string, deg: Rotation, flipH: boolean, flipV: boolean, hasAudio: boolean): Op {
  const f: string[] = []
  if (deg === 90) f.push('transpose=1'); else if (deg === 180) f.push('transpose=1,transpose=1'); else if (deg === 270) f.push('transpose=2')
  if (flipH) f.push('hflip'); if (flipV) f.push('vflip')
  return mp4(['-i', input], f.join(',') || 'null', hasAudio ? 'copy' : 'none')
}

/** Lossless rotation: only the display matrix changes (MP4/MOV with H.264/HEVC). */
export function rotateMetaOp(input: string, deg: Rotation, ext = 'mp4'): Op {
  const out = `out.${ext}`
  return { output: out, args: ['-i', input, '-map', '0', '-c', 'copy', '-metadata:s:v:0', `rotate=${deg}`, ...FASTSTART, out] }
}

export type FillMode = 'fit' | 'fill' | 'stretch'
export function resizeOp(input: string, w: number, h: number, mode: FillMode, pad: 'color' | 'blur', color: string, hasAudio: boolean): Op {
  w = Math.max(2, Math.round(w / 2) * 2); h = Math.max(2, Math.round(h / 2) * 2)
  if (mode === 'stretch') return mp4(['-i', input], `scale=${w}:${h},setsar=1`, hasAudio ? 'copy' : 'none')
  if (mode === 'fill') return mp4(['-i', input], `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`, hasAudio ? 'copy' : 'none')
  if (pad === 'blur') {
    const fc = `[0:v]split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=20:2[bg];[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`
    return { output: 'out.mp4', args: ['-i', input, '-filter_complex', fc, '-map', '[v]', ...(hasAudio ? ['-map', '0:a:0?', '-c:a', 'copy'] : ['-an']), ...H264(), ...FASTSTART, 'out.mp4'] }
  }
  const c = color.replace('#', '0x')
  return mp4(['-i', input], `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:${c},setsar=1`, hasAudio ? 'copy' : 'none')
}

/* ------------------------------------------------------------------ time */

export function reverseOp(input: string, mode: 'reverse' | 'boomerang', hasAudio: boolean, reverseAudio: boolean): Op {
  if (mode === 'boomerang') {
    const fc = `[0:v]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,${EVEN}[v]`
    return { output: 'out.mp4', args: ['-i', input, '-filter_complex', fc, '-map', '[v]', '-an', ...H264(), ...FASTSTART, 'out.mp4'] }
  }
  return mp4(['-i', input], `reverse,${EVEN}`, hasAudio ? (reverseAudio ? ['-af', 'areverse', ...AAC] : 'none') : 'none')
}

export function loopOp(input: string, times: number, hasAudio: boolean, ext = 'mp4'): Op {
  // stream copy loop: fast and lossless
  const out = `out.${ext}`
  return { output: out, args: ['-stream_loop', String(Math.max(0, times - 1)), '-i', input, '-c', 'copy', ...(hasAudio ? [] : ['-an']), ...(ext === 'mp4' || ext === 'mov' ? FASTSTART : []), out] }
}

export function loopToDurationOp(input: string, seconds: number, hasAudio: boolean): Op {
  return { output: 'out.mp4', args: ['-stream_loop', '-1', '-i', input, '-t', f3(seconds), ...H264(), ...(hasAudio ? AAC : ['-an']), ...FASTSTART, 'out.mp4'] }
}

export type FpsMode = 'convert' | 'smooth' | 'slowmo' | 'timelapse' | 'stopmotion'
export function fpsOp(input: string, mode: FpsMode, fps: number, factor: number, hasAudio: boolean): Op {
  switch (mode) {
    case 'convert': return mp4(['-i', input], `fps=${fps},${EVEN}`, hasAudio ? 'aac' : 'none')
    case 'smooth': return mp4(['-i', input], `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1,${EVEN}`, hasAudio ? 'aac' : 'none')
    case 'slowmo': return mp4(['-i', input], `setpts=${f3(factor)}*PTS,minterpolate=fps=${fps}:mi_mode=blend,${EVEN}`, 'none')
    case 'timelapse': return mp4(['-i', input], `setpts=PTS/${f3(factor)},fps=${fps},${EVEN}`, 'none')
    case 'stopmotion': return mp4(['-i', input], `fps=${fps},${EVEN}`, 'none', 'out.mp4', ['-r', '30'])
  }
}

export function freezeOp(input: string, at: number, hold: number, hasAudio: boolean): Op {
  // split at `at`, hold the frame at the cut for `hold` seconds, then continue
  const v = `[0:v]split[v1][v2];[v1]trim=0:${f3(at)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${f3(hold)}[a];[v2]trim=start=${f3(at)},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,${EVEN}[v]`
  const a = hasAudio ? `;[0:a]atrim=0:${f3(at)},asetpts=PTS-STARTPTS,apad=pad_dur=${f3(hold)}[aa];[0:a]atrim=start=${f3(at)},asetpts=PTS-STARTPTS[ab];[aa][ab]concat=n=2:v=0:a=1[au]` : ''
  return { output: 'out.mp4', args: ['-i', input, '-filter_complex', v + a, '-map', '[v]', ...(hasAudio ? ['-map', '[au]', ...AAC] : ['-an']), ...H264(), ...FASTSTART, 'out.mp4'] }
}

/* ------------------------------------------------------------------ overlays */

export type Corner = 'tl' | 'tr' | 'bl' | 'br' | 'c' | 'tc' | 'bc'
export function cornerXY(c: Corner, margin: number) {
  const m = n(margin)
  return ({ tl: [m, m], tr: [`W-w-${m}`, m], bl: [m, `H-h-${m}`], br: [`W-w-${m}`, `H-h-${m}`], c: ['(W-w)/2', '(H-h)/2'], tc: ['(W-w)/2', m], bc: ['(W-w)/2', `H-h-${m}`] } as Record<Corner, [string, string]>)[c]
}

/** Overlay a PNG (logo, rendered text, sticker) at x/y expressions, optionally only between t0 and t1. */
export function overlayPngOp(input: string, png: string, x: string, y: string, hasAudio: boolean, opts: { opacity?: number; scaleW?: number; t0?: number; t1?: number } = {}): Op {
  const parts: string[] = []
  let ov = '[1:v]'
  const pre: string[] = []
  if (opts.scaleW) pre.push(`scale=${n(opts.scaleW)}:-1`)
  if (opts.opacity != null && opts.opacity < 1) pre.push(`format=rgba,colorchannelmixer=aa=${f3(opts.opacity)}`)
  if (pre.length) { parts.push(`[1:v]${pre.join(',')}[ov]`); ov = '[ov]' }
  const en = opts.t0 != null && opts.t1 != null ? `:enable='between(t,${f3(opts.t0)},${f3(opts.t1)})'` : ''
  parts.push(`[0:v]${ov}overlay=${x}:${y}${en},${EVEN}[v]`)
  return { output: 'out.mp4', args: ['-i', input, '-loop', '1', '-i', png, '-filter_complex', parts.join(';'), '-map', '[v]', ...(hasAudio ? ['-map', '0:a:0?', '-c:a', 'copy'] : ['-an']), '-shortest', ...H264(), ...FASTSTART, 'out.mp4'] }
}

/** Several timed PNG overlays (captions, stickers, progress bar frames). Each covers the full frame. */
export function timedOverlaysOp(input: string, pngs: { name: string; t0: number; t1: number }[], hasAudio: boolean, duration: number, bar?: { color: string; height: number; top: boolean; width: number }): Op {
  const ins: string[] = ['-i', input]
  const chain: string[] = []
  let last = '[0:v]'
  pngs.forEach((p, i) => {
    ins.push('-loop', '1', '-t', f3(duration), '-i', p.name)
    const out = `[v${i}]`
    chain.push(`${last}[${i + 1}:v]overlay=0:0:enable='between(t,${f3(p.t0)},${f3(p.t1)})'${out}`)
    last = out
  })
  if (bar) {
    // a solid strip that slides in from the left as the video plays
    chain.push(`color=c=${bar.color.replace('#', '0x')}:s=${n(bar.width)}x${n(Math.max(2, bar.height))}:r=30[bar]`)
    chain.push(`${last}[bar]overlay=x='-w+w*t/${f3(Math.max(0.1, duration))}':y=${bar.top ? 0 : 'H-h'}:shortest=1[vb]`)
    last = '[vb]'
  }
  chain.push(`${last}${EVEN}[v]`)
  return { output: 'out.mp4', args: [...ins, '-filter_complex', chain.join(';'), '-map', '[v]', ...(hasAudio ? ['-map', '0:a:0?', '-c:a', 'copy'] : ['-an']), '-t', f3(duration), ...H264(), ...FASTSTART, 'out.mp4'] }
}

export function pipOp(input: string, second: string, secondIsImage: boolean, r: { x: number; y: number; w: number }, hasAudio: boolean, opts: { border?: number; borderColor?: string; mixAudio?: boolean; secondHasAudio?: boolean } = {}): Op {
  const b = opts.border ?? 0
  const fg = `[1:v]scale=${n(r.w)}:-2${b ? `,pad=iw+${b * 2}:ih+${b * 2}:${b}:${b}:${(opts.borderColor ?? '#ffffff').replace('#', '0x')}` : ''}[pip]`
  const fc = `${fg};[0:v][pip]overlay=${n(r.x)}:${n(r.y)}:shortest=${secondIsImage ? 0 : 1}:eof_action=pass,${EVEN}[v]`
  const audio = hasAudio && opts.mixAudio && opts.secondHasAudio ? ';[0:a][1:a]amix=inputs=2:duration=first[a]' : ''
  return {
    output: 'out.mp4', args: ['-i', input, ...(secondIsImage ? ['-loop', '1'] : []), '-i', second, '-filter_complex', fc + audio, '-map', '[v]',
      ...(audio ? ['-map', '[a]', ...AAC] : hasAudio ? ['-map', '0:a:0?', '-c:a', 'copy'] : ['-an']), ...(secondIsImage ? ['-shortest'] : []), ...H264(), ...FASTSTART, 'out.mp4'],
  }
}

export function backgroundOp(input: string, w: number, h: number, bg: { color?: string; image?: string }, scale: number, hasAudio: boolean): Op {
  w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2
  const sw = Math.round(w * scale / 2) * 2
  const fc = bg.image
    ? `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bg];[0:v]scale=${sw}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1[v]`
    : `color=c=${(bg.color ?? '#000000').replace('#', '0x')}:s=${w}x${h}[bg];[0:v]scale=${sw}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1[v]`
  return { output: 'out.mp4', args: ['-i', input, ...(bg.image ? ['-loop', '1', '-i', bg.image] : []), '-filter_complex', fc, '-map', '[v]', ...(hasAudio ? ['-map', '0:a:0?', '-c:a', 'copy'] : ['-an']), ...H264(), ...FASTSTART, 'out.mp4'] }
}

export function zoomPanOp(input: string, zoomTo: number, duration: number, fps: number, w: number, h: number, hasAudio: boolean): Op {
  w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2
  const frames = Math.max(1, Math.round(duration * fps))
  const vf = `scale=${w * 2}:-2,zoompan=z='min(1+(${f3(zoomTo - 1)})*on/${frames},${f3(zoomTo)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${fps},setsar=1`
  return mp4(['-i', input], vf, hasAudio ? 'copy' : 'none')
}

/* ------------------------------------------------------------------ audio */

export type AudioMode = 'replace' | 'mix' | 'add'
export function addAudioOp(video: string, audio: string, mode: AudioMode, o: { offset?: number; volume?: number; originalVolume?: number; loop?: boolean; fit?: 'video' | 'shortest' | 'longest' ; videoHasAudio: boolean }): Op {
  const delay = Math.max(0, o.offset ?? 0), adv = Math.max(0, -(o.offset ?? 0))
  const music = `[1:a]${adv ? `atrim=start=${f3(adv)},asetpts=PTS-STARTPTS,` : ''}volume=${f3(o.volume ?? 1)}${delay ? `,adelay=${n(delay * 1000)}|${n(delay * 1000)}` : ''}[m]`
  const inputs = ['-i', video, ...(o.loop ? ['-stream_loop', '-1'] : []), '-i', audio]
  const fit = o.fit ?? 'video'
  const tail = fit === 'shortest' ? ['-shortest'] : []
  if (mode === 'mix' && o.videoHasAudio) {
    const fc = `${music};[0:a]volume=${f3(o.originalVolume ?? 1)}[o];[o][m]amix=inputs=2:duration=${fit === 'longest' ? 'longest' : 'first'}:dropout_transition=0,volume=2[a]`
    return { output: 'out.mp4', args: [...inputs, '-filter_complex', fc, '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', ...AAC, ...tail, ...FASTSTART, 'out.mp4'] }
  }
  if (mode === 'add' && o.videoHasAudio) {
    return { output: 'out.mp4', args: [...inputs, '-filter_complex', music, '-map', '0:v:0', '-map', '0:a:0', '-map', '[m]', '-c:v', 'copy', ...AAC, ...(fit !== 'longest' ? ['-shortest'] : []), ...FASTSTART, 'out.mp4'] }
  }
  // replace (or the video had no sound)
  const cut = fit === 'longest' ? [] : ['-shortest']
  return { output: 'out.mp4', args: [...inputs, '-filter_complex', music, '-map', '0:v:0', '-map', '[m]', '-c:v', 'copy', ...AAC, ...cut, ...FASTSTART, 'out.mp4'] }
}

/* ------------------------------------------------------------------ layouts */

export type SplitLayout = 'h' | 'v' | 'grid' | 'h3' | 'v3'
export function splitScreenOp(inputs: string[], layout: SplitLayout, cellW: number, cellH: number, gap: number, color: string, audioFrom: number | 'mix' | 'none', audioFlags: boolean[], fit: 'fill' | 'fit' = 'fill'): Op {
  cellW = Math.round(cellW / 2) * 2; cellH = Math.round(cellH / 2) * 2
  const c = color.replace('#', '0x')
  const scale = (i: number) => fit === 'fill'
    ? `[${i}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=increase,crop=${cellW}:${cellH},setsar=1,fps=30[s${i}]`
    : `[${i}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:${c},setsar=1,fps=30[s${i}]`
  const k = inputs.length
  const parts = inputs.map((_, i) => scale(i))
  const pos: [number, number][] = []
  let W = 0, H = 0
  if (layout === 'h' || layout === 'h3') { for (let i = 0; i < k; i++) pos.push([i * (cellW + gap), 0]); W = k * cellW + (k - 1) * gap; H = cellH }
  else if (layout === 'v' || layout === 'v3') { for (let i = 0; i < k; i++) pos.push([0, i * (cellH + gap)]); W = cellW; H = k * cellH + (k - 1) * gap }
  else { for (let i = 0; i < k; i++) pos.push([(i % 2) * (cellW + gap), Math.floor(i / 2) * (cellH + gap)]); W = 2 * cellW + gap; H = Math.ceil(k / 2) * cellH + (Math.ceil(k / 2) - 1) * gap }
  W = Math.round(W / 2) * 2; H = Math.round(H / 2) * 2
  parts.push(`color=c=${c}:s=${W}x${H}:r=30[bg0]`)
  let last = '[bg0]'
  inputs.forEach((_, i) => { const o = i === k - 1 ? '[v]' : `[bg${i + 1}]`; parts.push(`${last}[s${i}]overlay=${pos[i][0]}:${pos[i][1]}:shortest=1${o}`); last = o })
  const ins = inputs.flatMap((x) => ['-i', x])
  let amap: string[] = ['-an']
  const withAudio = audioFlags.map((h, i) => (h ? i : -1)).filter((i) => i >= 0)
  if (audioFrom === 'mix' && withAudio.length > 1) { parts.push(`${withAudio.map((i) => `[${i}:a]`).join('')}amix=inputs=${withAudio.length}:duration=shortest[a]`); amap = ['-map', '[a]', ...AAC] }
  else if (typeof audioFrom === 'number' && audioFlags[audioFrom]) amap = ['-map', `${audioFrom}:a:0`, ...AAC]
  else if (audioFrom === 'mix' && withAudio.length === 1) amap = ['-map', `${withAudio[0]}:a:0`, ...AAC]
  return { output: 'out.mp4', args: [...ins, '-filter_complex', parts.join(';'), '-map', '[v]', ...amap, '-shortest', ...H264(), ...FASTSTART, 'out.mp4'] }
}

/* ------------------------------------------------------------------ filters */

export interface FilterSettings { brightness: number; contrast: number; saturation: number; gamma: number; hue: number; sharpen: number; blur: number; vignette: number; temperature: number; denoise: boolean; grayscale: boolean; sepia: boolean; invert: boolean; lut?: string }
export const NEUTRAL: FilterSettings = { brightness: 0, contrast: 1, saturation: 1, gamma: 1, hue: 0, sharpen: 0, blur: 0, vignette: 0, temperature: 0, denoise: false, grayscale: false, sepia: false, invert: false }

export function filterChain(s: FilterSettings): string {
  const f: string[] = []
  if (s.denoise) f.push('hqdn3d=3:3:6:6')
  if (s.brightness || s.contrast !== 1 || s.saturation !== 1 || s.gamma !== 1) f.push(`eq=brightness=${f3(s.brightness)}:contrast=${f3(s.contrast)}:saturation=${f3(s.saturation)}:gamma=${f3(s.gamma)}`)
  if (s.hue) f.push(`hue=h=${f3(s.hue)}`)
  if (s.temperature) {
    const t = s.temperature / 100 // -1 cool .. 1 warm
    f.push(`colorchannelmixer=rr=${f3(1 + 0.12 * t)}:bb=${f3(1 - 0.12 * t)}`)
  }
  if (s.lut) f.push(`lut3d=file=${s.lut}`)
  if (s.grayscale) f.push('hue=s=0')
  if (s.sepia) f.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131')
  if (s.invert) f.push('negate')
  if (s.sharpen) f.push(`unsharp=5:5:${f3(s.sharpen)}:5:5:0`)
  if (s.blur) f.push(`boxblur=${f3(s.blur)}:1`)
  if (s.vignette) f.push(`vignette=angle=${f3(Math.PI / 5 + (s.vignette / 100) * (Math.PI / 4))}`)
  f.push(EVEN)
  return f.join(',')
}

export function filtersOp(input: string, s: FilterSettings, hasAudio: boolean): Op {
  return mp4(['-i', input], filterChain(s), hasAudio ? 'copy' : 'none')
}

/** CSS filter string that previews (roughly) the same look in the browser. */
export function cssPreview(s: FilterSettings): string {
  const parts = [`brightness(${1 + s.brightness})`, `contrast(${s.contrast})`, `saturate(${s.saturation})`]
  if (s.hue) parts.push(`hue-rotate(${s.hue}deg)`)
  if (s.grayscale) parts.push('grayscale(1)')
  if (s.sepia) parts.push('sepia(1)')
  if (s.invert) parts.push('invert(1)')
  if (s.blur) parts.push(`blur(${s.blur / 2}px)`)
  return parts.join(' ')
}

export function stabilizeOp(input: string, strength: 'light' | 'normal' | 'strong', zoom: boolean, hasAudio: boolean): Op {
  const rx = { light: 16, normal: 32, strong: 64 }[strength]
  const vf = `deshake=rx=${rx}:ry=${rx}:edge=mirror${zoom ? ',scale=iw*1.06:ih*1.06,crop=iw/1.06:ih/1.06' : ''},${EVEN}`
  return mp4(['-i', input], vf, hasAudio ? 'copy' : 'none')
}

/* ------------------------------------------------------------------ regions */

export interface Region { x: number; y: number; w: number; h: number }
const even = (v: number) => Math.max(2, Math.floor(v / 2) * 2)

export function delogoOp(input: string, r: Region, W: number, H: number, hasAudio: boolean, t?: [number, number]): Op {
  // delogo needs the box to sit at least 1px inside the frame
  const x = Math.max(1, Math.min(W - 3, Math.round(r.x))), y = Math.max(1, Math.min(H - 3, Math.round(r.y)))
  const w = Math.max(2, Math.min(W - x - 1, Math.round(r.w))), h = Math.max(2, Math.min(H - y - 1, Math.round(r.h)))
  const en = t ? `:enable='between(t,${f3(t[0])},${f3(t[1])})'` : ''
  return mp4(['-i', input], `delogo=x=${x}:y=${y}:w=${w}:h=${h}${en},${EVEN}`, hasAudio ? 'copy' : 'none')
}

export function blurRegionOp(input: string, regions: Region[], style: 'blur' | 'pixelate' | 'black', amount: number, hasAudio: boolean, t?: [number, number]): Op {
  const parts: string[] = []
  const k = regions.length
  parts.push(`[0:v]split=${k + 1}[base]${regions.map((_, i) => `[c${i}]`).join('')}`)
  let last = '[base]'
  regions.forEach((r, i) => {
    const w = even(r.w), h = even(r.h), x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y))
    const fx = style === 'blur'
      ? `boxblur=${Math.max(1, Math.min(Math.floor(Math.min(w, h) / 2) - 1, Math.round(amount)))}:3`
      : style === 'pixelate'
        ? `scale=${Math.max(1, Math.round(w / Math.max(2, amount)))}:-1:flags=neighbor,scale=${w}:${h}:flags=neighbor`
        : 'drawbox=c=black:t=fill'
    const en = t ? `:enable='between(t,${f3(t[0])},${f3(t[1])})'` : ''
    const out = i === k - 1 ? '[vo]' : `[b${i}]`
    parts.push(`[c${i}]crop=${w}:${h}:${x}:${y},${fx}[r${i}]`)
    parts.push(`${last}[r${i}]overlay=${x}:${y}${en}${out}`)
    last = out
  })
  parts.push(`[vo]${EVEN}[v]`)
  return { output: 'out.mp4', args: ['-i', input, '-filter_complex', parts.join(';'), '-map', '[v]', ...(hasAudio ? ['-map', '0:a:0?', '-c:a', 'copy'] : ['-an']), ...H264(), ...FASTSTART, 'out.mp4'] }
}

/* ------------------------------------------------------------------ keying */

export function chromaKeyOp(input: string, key: string, similarity: number, blend: number, bg: { color?: string; image?: string; video?: string; transparent?: boolean }, hasAudio: boolean, W: number, H: number): Op {
  const k = key.replace('#', '0x')
  const w = even(W), h = even(H)
  const keyed = `[0:v]chromakey=${k}:${f3(similarity)}:${f3(blend)}[fg]`
  if (bg.transparent) {
    return { output: 'out.webm', args: ['-i', input, '-filter_complex', `${keyed};[fg]format=yuva420p[v]`, '-map', '[v]', ...(hasAudio ? ['-map', '0:a:0?', '-c:a', 'libvorbis'] : ['-an']), '-c:v', 'libvpx', '-auto-alt-ref', '0', '-b:v', '2M', '-deadline', 'realtime', '-cpu-used', '8', 'out.webm'] }
  }
  const ins = ['-i', input]
  let bgChain: string
  if (bg.image) { ins.push('-loop', '1', '-i', bg.image); bgChain = `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bg]` }
  else if (bg.video) { ins.push('-stream_loop', '-1', '-i', bg.video); bgChain = `[1:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}[bg]` }
  else bgChain = `color=c=${(bg.color ?? '#000000').replace('#', '0x')}:s=${w}x${h}[bg]`
  const fc = `${keyed};${bgChain};[bg][fg]overlay=0:0:shortest=1,${EVEN}[v]`
  return { output: 'out.mp4', args: [...ins, '-filter_complex', fc, '-map', '[v]', ...(hasAudio ? ['-map', '0:a:0?', ...AAC] : ['-an']), ...H264(), ...FASTSTART, 'out.mp4'] }
}

/* ------------------------------------------------------------------ subtitles */

export function burnSubsOp(input: string, subs: string, fontsDir: string, style: { font: string; size: number; color: string; outline: string; outlineW: number; box: boolean; position: 'bottom' | 'top' | 'middle'; margin: number } | null, hasAudio: boolean): Op {
  const assColor = (hex: string) => { const h = hex.replace('#', ''); return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase() }
  let force = ''
  if (style) {
    const align = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2
    const fields = [`FontName=${style.font}`, `FontSize=${n(style.size)}`, `PrimaryColour=${assColor(style.color)}`, `OutlineColour=${assColor(style.outline)}`, `Outline=${n(style.outlineW)}`, `BorderStyle=${style.box ? 3 : 1}`, `Alignment=${align}`, `MarginV=${n(style.margin)}`]
    if (style.box) fields.push(`BackColour=&H80000000`)
    force = `:force_style='${fields.join(',')}'`
  }
  return mp4(['-i', input], `subtitles=${subs}:fontsdir=${fontsDir}${force},${EVEN}`, hasAudio ? 'copy' : 'none')
}

export function softSubsOp(input: string, subs: string, container: 'mp4' | 'mkv', lang: string): Op {
  const out = `out.${container}`
  return { output: out, args: ['-i', input, '-i', subs, '-map', '0:v', '-map', '0:a?', '-map', '1:0', '-c:v', 'copy', '-c:a', 'copy', '-c:s', container === 'mp4' ? 'mov_text' : 'srt', '-metadata:s:s:0', `language=${lang}`, '-disposition:s:0', 'default', ...(container === 'mp4' ? FASTSTART : []), out] }
}

/* ------------------------------------------------------------------ repair */

export function remuxOp(input: string, ext: string, opts: { genpts?: boolean; ignoreErrors?: boolean } = {}): Op {
  const out = `out.${ext}`
  return { output: out, args: [...(opts.genpts ? ['-fflags', '+genpts+discardcorrupt'] : []), ...(opts.ignoreErrors ? ['-err_detect', 'ignore_err'] : []), '-i', input, '-map', '0:v?', '-map', '0:a?', '-c', 'copy', ...(ext === 'mp4' || ext === 'mov' ? FASTSTART : []), out] }
}

export function reencodeRepairOp(input: string): Op {
  return { output: 'out.mp4', args: ['-fflags', '+genpts+discardcorrupt', '-err_detect', 'ignore_err', '-i', input, '-map', '0:v:0?', '-map', '0:a:0?', '-vf', EVEN, ...H264(22), ...AAC, '-max_muxing_queue_size', '4096', ...FASTSTART, 'out.mp4'] }
}

/* ------------------------------------------------------------------ slideshow & transitions */

export interface Slide { name: string; duration: number }
export type Transition = 'none' | 'fade' | 'fadeblack' | 'wipeleft' | 'wiperight' | 'slideleft' | 'slideright' | 'slideup' | 'circleopen' | 'dissolve' | 'zoomin' | 'pixelize' | 'radial' | 'smoothleft'

export function slideshowOp(slides: Slide[], o: { w: number; h: number; fps: number; transition: Transition; td: number; kenBurns: boolean; fit: 'fit' | 'fill'; bg: string; audio?: string; audioFade?: boolean }): Op {
  const w = even(o.w), h = even(o.h), fps = o.fps
  const td = o.transition === 'none' ? 0 : Math.min(o.td, ...slides.map((s) => s.duration / 2))
  const ins: string[] = []
  const parts: string[] = []
  const bg = o.bg.replace('#', '0x')
  slides.forEach((s, i) => {
    ins.push('-loop', '1', '-t', f3(s.duration), '-i', s.name)
    const base = o.fit === 'fill'
      ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
      : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:${bg}`
    const frames = Math.max(1, Math.round(s.duration * fps))
    const kb = o.kenBurns
      ? `,scale=${w * 2}:${h * 2},zoompan=z='min(1+0.12*on/${frames},1.12)':x='${i % 2 ? 'iw/2-(iw/zoom/2)' : '(iw-iw/zoom)*on/' + frames}':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${fps}`
      : `,fps=${fps}`
    parts.push(`[${i}:v]${base},setsar=1${kb},format=yuv420p,trim=duration=${f3(s.duration)},setpts=PTS-STARTPTS[s${i}]`)
  })
  let last = '[s0]'
  if (slides.length === 1) last = '[s0]'
  else if (!td) { parts.push(`${slides.map((_, i) => `[s${i}]`).join('')}concat=n=${slides.length}:v=1:a=0[cat]`); last = '[cat]' }
  else {
    let acc = slides[0].duration
    for (let i = 1; i < slides.length; i++) {
      const off = acc - td
      const out = `[x${i}]`
      parts.push(`${last}[s${i}]xfade=transition=${o.transition}:duration=${f3(td)}:offset=${f3(off)}${out}`)
      last = out; acc = off + slides[i].duration
    }
  }
  const total = slides.reduce((s, x) => s + x.duration, 0) - td * (slides.length - 1)
  parts.push(`${last}format=yuv420p[v]`)
  let amap: string[] = []
  if (o.audio) {
    ins.push('-stream_loop', '-1', '-i', o.audio)
    const ai = slides.length
    parts.push(`[${ai}:a]atrim=0:${f3(total)}${o.audioFade ? `,afade=t=in:d=1,afade=t=out:st=${f3(Math.max(0, total - 2))}:d=2` : ''}[a]`)
    amap = ['-map', '[a]', ...AAC]
  }
  return { output: 'out.mp4', args: [...ins, '-filter_complex', parts.join(';'), '-map', '[v]', ...amap, '-t', f3(total), '-r', String(fps), ...H264(20), ...FASTSTART, 'out.mp4'] }
}

/** Join clips with crossfades. Every clip is normalised to the same size, fps and audio layout. */
export function xfadeJoinOp(clips: { name: string; duration: number; hasAudio: boolean }[], o: { w: number; h: number; fps: number; transition: Transition; td: number }): Op {
  const w = even(o.w), h = even(o.h)
  const td = Math.min(o.td, ...clips.map((c) => c.duration / 2 - 0.05))
  const ins = clips.flatMap((c) => ['-i', c.name])
  const parts: string[] = []
  clips.forEach((c, i) => {
    parts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${o.fps},format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v${i}]`)
    parts.push(c.hasAudio ? `[${i}:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]` : `anullsrc=r=44100:cl=stereo,atrim=0:${f3(c.duration)}[a${i}]`)
  })
  let lv = '[v0]', la = '[a0]', acc = clips[0].duration
  for (let i = 1; i < clips.length; i++) {
    const off = acc - td
    parts.push(`${lv}[v${i}]xfade=transition=${o.transition === 'none' ? 'fade' : o.transition}:duration=${f3(td)}:offset=${f3(off)}[xv${i}]`)
    parts.push(`${la}[a${i}]acrossfade=d=${f3(td)}[xa${i}]`)
    lv = `[xv${i}]`; la = `[xa${i}]`; acc = off + clips[i].duration
  }
  return { output: 'out.mp4', args: [...ins, '-filter_complex', parts.join(';'), '-map', lv, '-map', la, ...H264(), ...AAC, ...FASTSTART, 'out.mp4'] }
}

/* ffmpeg filter graphs for the Music Visualizer layer. Pure, run through the real ffmpeg.wasm core in
 * scripts/tests/b3/media-fixes.test.ts. */
export type Viz = 'waves' | 'line' | 'bars' | 'spectrum' | 'circle'

/** The visualizer layer as [viz], and the y position to overlay it at.
 *  showfreqs and avectorscope are not followed by an fps filter: in the ffmpeg 5.1 wasm core that pair never
 *  reaches the end of the stream (it runs out of memory or hangs), so avectorscope sets its own rate and the
 *  bars layer is sampled by the overlay at the background frame rate. */
export function vizFilter(viz: Viz, w: number, h: number, color: string, fps: number): { graph: string; y: string } {
  const c = '0x' + color.replace('#', '')
  const vw = w, vh = Math.round(h * (viz === 'spectrum' ? 0.32 : 0.28))
  const base = `[1:a]aformat=channel_layouts=stereo,`
  switch (viz) {
    case 'waves': return { graph: `${base}showwaves=s=${vw}x${vh}:mode=cline:colors=${c}:rate=${fps}:scale=sqrt,format=rgba[viz]`, y: `H-h-${Math.round(h * 0.06)}` }
    case 'line': return { graph: `${base}showwaves=s=${vw}x${vh}:mode=line:colors=${c}:rate=${fps}:draw=full,format=rgba[viz]`, y: `H-h-${Math.round(h * 0.06)}` }
    // one colour per channel, so the right channel is not drawn in the default white
    case 'bars': return { graph: `${base}showfreqs=s=${vw}x${vh}:mode=bar:ascale=sqrt:fscale=log:colors=${c}|${c}:win_size=2048,format=rgba,colorkey=black:0.1:0.0[viz]`, y: `H-h-${Math.round(h * 0.04)}` }
    case 'spectrum': return { graph: `${base}showspectrum=s=${vw}x${vh}:mode=combined:color=fire:scale=log:slide=scroll,fps=${fps},format=rgba[viz]`, y: `H-h` }
    case 'circle': { const s = Math.round(Math.min(w, h) * 0.5); return { graph: `${base}avectorscope=s=${s}x${s}:r=${fps}:zoom=1.5:rc=${parseInt(color.slice(1, 3), 16)}:gc=${parseInt(color.slice(3, 5), 16)}:bc=${parseInt(color.slice(5, 7), 16)}:rf=15:gf=15:bf=15:draw=line,format=rgba,colorkey=black:0.1:0.0[viz]`, y: `(H-h)/2` } }
  }
}

/** The whole render graph: background still as input 0, audio as input 1. */
export function vizGraph(viz: Viz, w: number, h: number, color: string, fps: number): string {
  const f = vizFilter(viz, w, h, color, fps)
  return `${f.graph};[0:v][viz]overlay=(W-w)/2:${f.y}:shortest=1,format=yuv420p[v]`
}

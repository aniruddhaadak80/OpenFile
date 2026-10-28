/* ffmpeg argument builders for animation output (pure, unit-tested against the wasm core). */
export function webpArgs(input: string, output: string, loop: number, quality: number, lossless: boolean) {
  return ['-i', input, '-c:v', 'libwebp_anim', ...(lossless ? ['-lossless', '1'] : ['-lossless', '0', '-q:v', String(Math.round(quality))]), '-compression_level', '4', '-loop', String(Math.max(0, loop)), '-an', '-vsync', 'passthrough', '-enc_time_base', '1:1000', output]
}

export function animVideoArgs(input: string, output: string, fmt: 'mp4' | 'webm') {
  const pad = 'pad=ceil(iw/2)*2:ceil(ih/2)*2'
  return fmt === 'mp4'
    ? ['-i', input, '-vf', `${pad},format=yuv420p`, '-vsync', 'cfr', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', output]
    : ['-i', input, '-vf', `${pad},format=yuva420p`, '-vsync', 'cfr', '-r', '30', '-c:v', 'libvpx', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '12', '-deadline', 'realtime', '-cpu-used', '8', output]
}


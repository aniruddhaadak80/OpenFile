/* Pure ffmpeg codec arguments for audio outputs. No imports, so Node tests can load it. */

/** Opus uses FFmpeg's native encoder: the libopus build inside ffmpeg.wasm 0.12 crashes
 * (memory access out of bounds) on stereo input. The native encoder only runs at 48 kHz. */
export const opusArgs = (bitrate: number) => ['-c:a', 'opus', '-strict', '-2', '-b:a', `${Math.min(Math.max(bitrate, 32), 256)}k`, '-ar', '48000']

/** Vorbis quality for a bitrate. libvorbis refuses many bitrate, sample rate and channel mixes in bitrate mode
 * (320k mono, 192k at 22 kHz), while quality mode works for all of them. Stereo 44.1 kHz lands near the bitrate. */
export function vorbisQuality(kbps: number): string {
  const steps: [number, number][] = [[64, 0], [80, 1], [96, 2], [112, 3], [128, 4], [160, 5], [192, 6], [224, 7], [256, 8], [320, 9], [500, 10]]
  let q = 0
  for (const [k, v] of steps) if (kbps >= k) q = v
  return String(q)
}

export function audioCodecArgs(fmt: string, bitrate: number): string[] {
  switch (fmt) {
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', `${bitrate}k`]
    case 'ogg': return ['-c:a', 'libvorbis', '-q:a', vorbisQuality(bitrate)]
    case 'aac': return ['-c:a', 'aac', '-b:a', `${bitrate}k`, '-f', 'adts']
    case 'm4a': return ['-c:a', 'aac', '-b:a', `${bitrate}k`, '-movflags', '+faststart']
    case 'flac': return ['-c:a', 'flac', '-compression_level', '5']
    case 'opus': return opusArgs(bitrate)
    default: return ['-c:a', 'pcm_s16le']
  }
}

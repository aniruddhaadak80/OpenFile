/* Output formats of the Audio Converter: file extension and ffmpeg codec arguments. Pure, unit tested. */
import { audioCodecArgs, opusArgs } from '../video/_media/codec-args'

export type Fmt = 'mp3' | 'wav' | 'ogg' | 'aac' | 'flac' | 'm4a' | 'opus' | 'aiff' | 'alac' | 'wma' | 'ac3' | 'caf' | 'au' | 'm4b' | 'm4r' | 'mp2' | 'weba' | 'voc'
/** File extension and codec arguments for every output format. Pure, unit tested. */
export function convertArgs(fmt: Fmt, bitrate: number): { ext: string; args: string[] } {
  switch (fmt) {
    case 'opus': return { ext: 'opus', args: opusArgs(bitrate) }
    case 'aiff': return { ext: 'aiff', args: ['-c:a', 'pcm_s16be', '-f', 'aiff'] }
    case 'alac': return { ext: 'm4a', args: ['-c:a', 'alac', '-f', 'ipod'] }
    case 'wma': return { ext: 'wma', args: ['-c:a', 'wmav2', '-b:a', `${bitrate}k`, '-f', 'asf'] }
    case 'ac3': return { ext: 'ac3', args: ['-c:a', 'ac3', '-b:a', `${Math.max(bitrate, 192)}k`] }
    case 'caf': return { ext: 'caf', args: ['-c:a', 'pcm_s16le', '-f', 'caf'] }
    case 'au': return { ext: 'au', args: ['-c:a', 'pcm_s16be', '-f', 'au'] }
    case 'm4b': return { ext: 'm4b', args: ['-c:a', 'aac', '-b:a', `${bitrate}k`, '-f', 'ipod'] }
    case 'm4r': return { ext: 'm4r', args: ['-c:a', 'aac', '-b:a', `${bitrate}k`, '-t', '40', '-f', 'ipod'] }
    case 'mp2': return { ext: 'mp2', args: ['-c:a', 'mp2', '-b:a', `${Math.max(bitrate, 128)}k`] }
    case 'weba': return { ext: 'weba', args: [...opusArgs(bitrate), '-f', 'webm'] }
    case 'voc': return { ext: 'voc', args: ['-c:a', 'pcm_u8', '-ar', '22050', '-ac', '1', '-f', 'voc'] }
    default: return { ext: fmt, args: audioCodecArgs(fmt, bitrate) }
  }
}

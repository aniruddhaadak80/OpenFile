import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { coreURLs } from './ffmpeg-core'

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

/** Lazily load the single-threaded ffmpeg.wasm core (~30MB, cached by the browser after first use). */
export function getFFmpeg(): Promise<FFmpeg> {
  if (instance) return Promise.resolve(instance)
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg()
      await ff.load(await coreURLs())
      instance = ff
      return ff
    })().catch((e) => { loading = null; throw e })
  }
  return loading
}

export interface RunOptions {
  inputs: { name: string; file: Blob | string }[]
  args: string[]
  output: string
  onProgress?: (ratio: number) => void
  onLog?: (line: string) => void
}

/** Run ffmpeg with given inputs/args and return output as Blob. */
export async function runFFmpeg({ inputs, args, output, onProgress, onLog }: RunOptions): Promise<Blob> {
  const ff = await getFFmpeg()
  const prog = ({ progress }: { progress: number }) => onProgress?.(Math.max(0, Math.min(1, progress)))
  const log = ({ message }: { message: string }) => onLog?.(message)
  ff.on('progress', prog); ff.on('log', log)
  try {
    for (const i of inputs) await ff.writeFile(i.name, await fetchFile(i.file))
    const code = await ff.exec(args)
    if (code !== 0) throw new Error('ffmpeg exited with code ' + code + '. The format or settings may not be supported.')
    const data = await ff.readFile(output)
    const ext = output.split('.').pop() || ''
    const mime = ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4', flac: 'audio/flac', png: 'image/png', jpg: 'image/jpeg' } as Record<string, string>)[ext] || 'application/octet-stream'
    return new Blob([data as BlobPart], { type: mime })
  } finally {
    ff.off('progress', prog); ff.off('log', log)
    for (const i of inputs) await ff.deleteFile(i.name).catch(() => {})
    await ff.deleteFile(output).catch(() => {})
  }
}

export const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase()

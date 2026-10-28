// The demo loop shown on the device screens: a file drops in, the tool runs, a result appears, next tool.
import { useCallback, useEffect, useState } from 'react'
import { toolBySlug, type ToolMeta } from '@/tools/registry'

export type Visual = 'pdf' | 'cutout' | 'video' | 'photo' | 'gif' | 'pages'
export interface Demo {
  tool: ToolMeta
  files: { name: string; size: string }[]
  step: string
  out: { name: string; size: string; note: string }
  before?: string
  visual: Visual
}

const RAW: (Omit<Demo, 'tool'> & { slug: string })[] = [
  { slug: 'merge-pdf', files: [{ name: 'report.pdf', size: '1.2 MB' }, { name: 'invoice.pdf', size: '240 KB' }, { name: 'notes.pdf', size: '610 KB' }], step: 'Merging 3 files', out: { name: 'merged.pdf', size: '2.0 MB', note: '3 files, 14 pages' }, visual: 'pdf' },
  { slug: 'background-remover', files: [{ name: 'portrait.jpg', size: '3.4 MB' }], step: 'Removing background with on-device AI', out: { name: 'portrait.png', size: '1.1 MB', note: 'Transparent background' }, visual: 'cutout' },
  { slug: 'video-compressor', files: [{ name: 'trip.mp4', size: '84 MB' }], step: 'Compressing to 1080p', out: { name: 'trip-small.mp4', size: '19 MB', note: '77% smaller' }, before: '84 MB', visual: 'video' },
  { slug: 'heic-converter', files: [{ name: 'IMG_2041.heic', size: '2.8 MB' }, { name: 'IMG_2042.heic', size: '3.1 MB' }], step: 'Converting to JPG', out: { name: 'IMG_2041.jpg', size: '1.9 MB', note: '2 photos converted' }, visual: 'photo' },
  { slug: 'compress-pdf', files: [{ name: 'scan.pdf', size: '18 MB' }], step: 'Shrinking images and streams', out: { name: 'scan-small.pdf', size: '3.6 MB', note: '80% smaller' }, before: '18 MB', visual: 'pdf' },
  { slug: 'image-converter', files: [{ name: 'logo.png', size: '820 KB' }, { name: 'banner.webp', size: '1.4 MB' }], step: 'Converting to AVIF', out: { name: 'banner.avif', size: '410 KB', note: '2 images, 64% smaller' }, before: '1.4 MB', visual: 'photo' },
  { slug: 'video-to-gif', files: [{ name: 'clip.mov', size: '22 MB' }], step: 'Encoding GIF frames', out: { name: 'clip.gif', size: '4.2 MB', note: '12 fps, 480 px wide' }, visual: 'gif' },
  { slug: 'pdf-to-image', files: [{ name: 'slides.pdf', size: '6.1 MB' }], step: 'Rendering pages at 150 DPI', out: { name: 'slides-01.png', size: '12 images', note: 'Every page as PNG' }, visual: 'pages' },
]

/** Demo tools that exist in the registry, with their real names, icons and categories. */
export const DEMOS: Demo[] = RAW.flatMap(({ slug, ...rest }) => {
  const tool = toolBySlug(slug)
  return tool ? [{ ...rest, tool }] : []
})

export type Phase = 'idle' | 'drop' | 'run' | 'done'
const DUR: Record<Phase, number> = { idle: 900, drop: 1200, run: 2100, done: 2400 }
export const RUN_MS = DUR.run - 200
const NEXT: Record<Phase, Phase> = { idle: 'drop', drop: 'run', run: 'done', done: 'idle' }

export interface DemoState { index: number; phase: Phase; demo: Demo; play: (i: number) => void; next: () => void }

/** Drives the loop. Stops advancing while `active` is false; with `reduced` it shows finished results only. */
export function useDemoLoop(active: boolean, reduced: boolean, start = 0): DemoState {
  const [index, setIndex] = useState(start)
  const [phase, setPhase] = useState<Phase>(reduced ? 'done' : 'idle')
  useEffect(() => { if (reduced) setPhase('done') }, [reduced])
  useEffect(() => {
    if (!active || reduced) return
    const t = setTimeout(() => {
      if (phase === 'done') setIndex((i) => (i + 1) % DEMOS.length)
      setPhase(NEXT[phase])
    }, DUR[phase])
    return () => clearTimeout(t)
  }, [active, reduced, phase, index])
  const play = useCallback((i: number) => { setIndex(((i % DEMOS.length) + DEMOS.length) % DEMOS.length); setPhase(reduced ? 'done' : 'drop') }, [reduced])
  const next = useCallback(() => play(index + 1), [play, index])
  return { index, phase, demo: DEMOS[index] ?? DEMOS[0], play, next }
}

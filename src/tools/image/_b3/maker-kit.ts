export { ThumbGrid, useImageList, ColorInput } from '@/tools/image/_img/kit'
import { hexToRgba } from '@/lib/b3/anim/core'
export const hexToRgbaSafe = (hex: string): [number, number, number, number] => { const c = hexToRgba(hex); return [c[0], c[1], c[2], 255] }

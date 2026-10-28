export type Tool = 'select' | 'hand' | 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line' | 'freedraw' | 'text' | 'sticky' | 'image' | 'eraser' | 'laser' | 'frame'
export type ShapeKind = 'rectangle' | 'diamond' | 'ellipse' | 'pill' | 'document' | 'parallelogram' | 'cylinder' | 'hexagon'
export type ElType = 'shape' | 'line' | 'arrow' | 'freedraw' | 'text' | 'sticky' | 'image' | 'icon' | 'table' | 'frame'
export type FillStyle = 'none' | 'solid' | 'hachure' | 'cross'
export type StrokeStyle = 'solid' | 'dashed' | 'dotted'
export type FontFamily = 'hand' | 'normal' | 'code'
export type Head = 'none' | 'arrow' | 'triangle' | 'dot' | 'bar'

export interface El {
  id: string
  type: ElType
  kind?: ShapeKind
  x: number; y: number; w: number; h: number
  stroke: string; fill: string; fillStyle: FillStyle
  strokeWidth: number; strokeStyle: StrokeStyle
  opacity: number          // 0..100
  rough: number            // 0 clean · 1 artist · 2 cartoonist
  roundness: number        // 0 sharp · 1 round
  seed: number
  groupIds: string[]
  locked?: boolean
  // text
  text?: string; fontSize?: number; fontFamily?: FontFamily; align?: 'left' | 'center' | 'right'
  // lines / freedraw (relative to x,y)
  points?: number[][]
  startHead?: Head; endHead?: Head
  startBind?: string | null; endBind?: string | null
  // misc
  src?: string; icon?: string; rows?: string[]; name?: string
}

export interface Style {
  stroke: string; fill: string; fillStyle: FillStyle; strokeWidth: number; strokeStyle: StrokeStyle
  opacity: number; rough: number; roundness: number; fontSize: number; fontFamily: FontFamily; align: 'left' | 'center' | 'right'
  startHead: Head; endHead: Head
}

export interface Board { id: string; name: string; elements: El[]; bg?: string; updated: number }
export type Cam = { x: number; y: number; z: number } // screen = world * z + (x, y)

export const FONT: Record<FontFamily, string> = {
  hand: '"Caveat", "Virgil", "Segoe Print", "Comic Sans MS", cursive',
  normal: 'Inter, ui-sans-serif, system-ui, sans-serif',
  code: '"JetBrains Mono", ui-monospace, Menlo, monospace',
}
export const STICKY_COLORS = [
  { name: 'Yellow', fill: '#fff3a3' }, { name: 'Pink', fill: '#ffc9de' }, { name: 'Blue', fill: '#bfe3ff' },
  { name: 'Green', fill: '#c6f2c3' }, { name: 'Purple', fill: '#dcd0ff' },
]
export const STROKES = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#0c8599', '#868e96']
export const FILLS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99', '#eebefa', '#99e9f2', '#e9ecef']
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

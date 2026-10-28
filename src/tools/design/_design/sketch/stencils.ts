import { El, ShapeKind, Style, STICKY_COLORS, uid } from './types'
import { STENCIL_ICONS } from './icons'
import { tableHeight } from './render'

export type Stencil = { id: string; label: string; group: 'Flowchart' | 'Data' | 'Sticky notes' | 'Tech & cloud'; preview: string; make: (x: number, y: number, s: Style) => El[] }

const base = (s: Style, over: Partial<El>): El => ({
  id: uid(), type: 'shape', x: 0, y: 0, w: 100, h: 100, stroke: s.stroke, fill: s.fill, fillStyle: s.fillStyle, strokeWidth: s.strokeWidth, strokeStyle: s.strokeStyle,
  opacity: s.opacity, rough: s.rough, roundness: s.roundness, seed: Math.floor(Math.random() * 2 ** 31), groupIds: [], fontSize: 20, fontFamily: s.fontFamily, align: 'center', ...over,
})

const FLOW: { kind: ShapeKind; label: string; w: number; h: number; text: string; preview: string; fill: string }[] = [
  { kind: 'rectangle', label: 'Process', w: 180, h: 90, text: 'Process', fill: '#a5d8ff', preview: '<rect x="3" y="6" width="18" height="12" rx="1"/>' },
  { kind: 'diamond', label: 'Decision', w: 170, h: 120, text: 'Decision?', fill: '#ffec99', preview: '<path d="M12 3l9 9-9 9-9-9z"/>' },
  { kind: 'pill', label: 'Start / End', w: 170, h: 70, text: 'Start', fill: '#b2f2bb', preview: '<rect x="2" y="7" width="20" height="10" rx="5"/>' },
  { kind: 'document', label: 'Document', w: 170, h: 100, text: 'Document', fill: '#e9ecef', preview: '<path d="M3 5h18v11c-3-2-6 2-9 0s-6-2-9 0z"/>' },
  { kind: 'parallelogram', label: 'Data (I/O)', w: 180, h: 80, text: 'Input / Output', fill: '#ccfbf1', preview: '<path d="M7 6h14l-4 12H3z"/>' },
  { kind: 'cylinder', label: 'Database', w: 120, h: 130, text: 'DB', fill: '#99e9f2', preview: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>' },
  { kind: 'hexagon', label: 'Preparation', w: 180, h: 90, text: 'Prepare', fill: '#ffc9c9', preview: '<path d="M7 5h10l5 7-5 7H7l-5-7z"/>' },
  { kind: 'ellipse', label: 'Connector', w: 70, h: 70, text: 'A', fill: '#ffffff', preview: '<circle cx="12" cy="12" r="8"/>' },
]

export const STENCILS: Stencil[] = [
  ...FLOW.map((f): Stencil => ({
    id: 'flow-' + f.kind, label: f.label, group: 'Flowchart', preview: f.preview,
    make: (x, y, s) => [base(s, { kind: f.kind, x: x - f.w / 2, y: y - f.h / 2, w: f.w, h: f.h, text: f.text, fill: s.fill === 'transparent' ? f.fill : s.fill, fillStyle: s.fillStyle === 'none' ? 'solid' : s.fillStyle, roundness: f.kind === 'rectangle' ? 1 : s.roundness })],
  })),
  {
    id: 'er-table', label: 'ER table', group: 'Data', preview: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 13h6M7 16h8"/>',
    make: (x, y, s) => { const el = base(s, { type: 'table', w: 240, text: 'users', rows: ['id  uuid PK', 'email  varchar', 'name  varchar', 'team_id  uuid FK', 'created_at  timestamp'], fill: '#a5d8ff', fontFamily: 'normal', fontSize: 16, roundness: 1, rough: s.rough, fillStyle: 'solid' }); el.h = tableHeight(el); el.x = x - el.w / 2; el.y = y - el.h / 2; return [el] },
  },
  {
    id: 'er-relation', label: 'Relation (1→N)', group: 'Data', preview: '<path d="M3 12h15M15 8l4 4-4 4M3 8v8"/>',
    make: (x, y, s) => [base(s, { type: 'arrow', x: x - 90, y, w: 180, h: 0, points: [[0, 0], [180, 0]], startHead: 'bar', endHead: 'triangle', fill: 'transparent', fillStyle: 'none' })],
  },
  ...STICKY_COLORS.map((c): Stencil => ({
    id: 'sticky-' + c.name.toLowerCase(), label: `${c.name} sticky`, group: 'Sticky notes', preview: `<rect x="4" y="4" width="16" height="16" rx="1.5" fill="${c.fill}" stroke="${c.fill}"/>`,
    make: (x, y, s) => [base(s, { type: 'sticky', x: x - 100, y: y - 100, w: 200, h: 200, fill: c.fill, fillStyle: 'solid', stroke: '#1e1e1e', text: '', fontFamily: 'hand', fontSize: 22, rough: 0 })],
  })),
  ...STENCIL_ICONS.map((ic): Stencil => ({
    id: 'icon-' + ic.id, label: ic.label, group: 'Tech & cloud', preview: `<path d="${ic.d}"/>`,
    make: (x, y, s) => [base(s, { type: 'icon', icon: ic.id, x: x - 50, y: y - 55, w: 100, h: 110, text: ic.label, fontFamily: 'normal', fontSize: 15, fill: 'transparent', fillStyle: 'none', strokeWidth: 2, rough: 0, stroke: s.stroke })],
  })),
]

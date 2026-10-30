/* Ready-made recipes for the gallery. Each has a short motion preview in public/media/workspace/<id>.mp4
 * (rendered by scripts/workspace-media/make_ws_media.py) and a set of sample files to try it on. */
import { IN, OUT, linearGraph, newId, cleanParams, type Graph, type GNode, type Recipe } from './recipe'

type S = { step: string; params?: Record<string, any> }
export type Builtin = { id: string; name: string; desc: string; tag: string; color: string; samples: string[]; graph: () => Graph }

/** Branches that leave the input side by side, optionally joining into shared closing steps. */
export function branchGraph(branches: S[][], join: S[] = []): Graph {
  const nodes: GNode[] = [{ id: IN, step: IN, params: {}, enabled: true, x: 0, y: 60 + ((branches.length - 1) * 150) / 2 }]
  const edges: [string, string][] = []
  const longest = Math.max(...branches.map((b) => b.length))
  const tails: string[] = []
  branches.forEach((b, bi) => {
    let prev = IN
    b.forEach((s, i) => { const id = newId(); nodes.push({ id, step: s.step, params: cleanParams(s.step, s.params), enabled: true, x: 240 * (i + 1), y: 60 + bi * 150 }); edges.push([prev, id]); prev = id })
    tails.push(prev)
  })
  let x = 240 * (longest + 1), prev: string[] = tails
  for (const s of join) { const id = newId(); nodes.push({ id, step: s.step, params: cleanParams(s.step, s.params), enabled: true, x, y: nodes[0].y }); prev.forEach((p) => edges.push([p, id])); prev = [id]; x += 240 }
  nodes.push({ id: OUT, step: OUT, params: {}, enabled: true, x, y: nodes[0].y })
  prev.forEach((p) => edges.push([p, OUT]))
  return { nodes, edges }
}
const line = (s: S[]) => () => linearGraph(s)

const PHOTOS = ['photo-dunes.jpg', 'photo-lagoon.jpg', 'photo-city.png']
export const BUILTINS: Builtin[] = [
  { id: 'web-photos', name: 'Web-ready photos', desc: 'Resize to 1920 px, convert to WEBP, strip camera data.', tag: 'Image', color: '#F5A524', samples: PHOTOS,
    graph: line([{ step: 'img-resize', params: { maxW: 1920, maxH: 1920 } }, { step: 'img-convert', params: { format: 'webp', quality: 80 } }]) },
  { id: 'product-catalog', name: 'Product catalog', desc: 'Square crop, watermark, JPG and numbered names.', tag: 'Image', color: '#F5A524', samples: PHOTOS,
    graph: line([{ step: 'img-crop', params: { ratio: '1:1' } }, { step: 'img-resize', params: { maxW: 1200, maxH: 1200 } }, { step: 'img-watermark' }, { step: 'img-convert', params: { format: 'jpeg', quality: 85 } }, { step: 'file-rename', params: { pattern: 'product-{n}' } }]) },
  { id: 'social-avatars', name: 'Social avatars', desc: 'Square crop, 512 px, fully rounded PNG.', tag: 'Image', color: '#F5A524', samples: PHOTOS,
    graph: line([{ step: 'img-crop', params: { ratio: '1:1' } }, { step: 'img-resize', params: { maxW: 512, maxH: 512 } }, { step: 'img-round', params: { radius: 50 } }]) },
  { id: 'photo-kit', name: 'Photo kit, big and thumbs', desc: 'Branches into full size WEBP and square thumbnails, then one ZIP.', tag: 'Branch', color: '#22D3EE', samples: PHOTOS,
    graph: () => branchGraph([[{ step: 'img-resize', params: { maxW: 1920, maxH: 1920 } }, { step: 'img-convert', params: { format: 'webp', quality: 80 } }], [{ step: 'img-crop', params: { ratio: '1:1' } }, { step: 'img-resize', params: { maxW: 320, maxH: 320 } }, { step: 'file-rename', params: { pattern: '{name}-thumb' } }]], [{ step: 'zip-all', params: { name: 'photo-kit' } }]) },
  { id: 'privacy-clean', name: 'Privacy clean-up', desc: 'Strip photo and PDF metadata, tidy names, add checksums.', tag: 'Mixed', color: '#10B981', samples: ['photo-dunes.jpg', 'report.pdf', 'notes.txt'],
    graph: line([{ step: 'img-strip' }, { step: 'pdf-meta' }, { step: 'file-rename', params: { pattern: '{name}', case: 'kebab' } }, { step: 'checksum' }]) },
  { id: 'pdf-pack', name: 'Share-safe PDF pack', desc: 'Merge every PDF, number pages, clean metadata.', tag: 'PDF', color: '#14B8A6', samples: ['report.pdf', 'invoice.pdf'],
    graph: line([{ step: 'pdf-merge', params: { name: 'pack' } }, { step: 'pdf-numbers' }, { step: 'pdf-meta' }]) },
  { id: 'confidential', name: 'Confidential drafts', desc: 'Diagonal watermark on every page, metadata removed.', tag: 'PDF', color: '#14B8A6', samples: ['report.pdf', 'invoice.pdf'],
    graph: line([{ step: 'pdf-watermark' }, { step: 'pdf-meta' }]) },
  { id: 'scan-to-pdf', name: 'Photos to one PDF', desc: 'Images onto A4 pages in one PDF with page numbers.', tag: 'PDF', color: '#14B8A6', samples: PHOTOS,
    graph: line([{ step: 'img-resize', params: { maxW: 2000, maxH: 2000 } }, { step: 'pdf-from-images', params: { page: 'A4', name: 'photos' } }, { step: 'pdf-numbers' }]) },
  { id: 'pdf-to-png', name: 'PDF pages to images', desc: 'Render every page, resize, pack into a ZIP.', tag: 'PDF', color: '#14B8A6', samples: ['report.pdf'],
    graph: line([{ step: 'pdf-to-images', params: { format: 'png', dpi: '150' } }, { step: 'img-resize', params: { maxW: 1600, maxH: 1600 } }, { step: 'zip-all', params: { name: 'pages' } }]) },
  { id: 'shrink-scans', name: 'Shrink scans', desc: 'Grayscale then rasterize. Never bigger than before.', tag: 'PDF', color: '#14B8A6', samples: ['report.pdf'],
    graph: line([{ step: 'pdf-gray' }, { step: 'pdf-compress' }]) },
  { id: 'clip-to-gif', name: 'Clip to GIF', desc: 'Trim the first seconds and turn them into a looping GIF.', tag: 'Video', color: '#38BDF8', samples: ['clip.mp4'],
    graph: line([{ step: 'av-trim', params: { start: 0, length: 3 } }, { step: 'vid-gif', params: { fps: 12, width: 360, length: 3 } }]) },
  { id: 'video-split', name: 'Video plus sound track', desc: 'Branches into a smaller MP4 and an MP3 of its audio.', tag: 'Branch', color: '#22D3EE', samples: ['clip.mp4'],
    graph: () => branchGraph([[{ step: 'vid-compress', params: { preset: 'small' } }], [{ step: 'av-extract-audio', params: { format: 'mp3' } }]]) },
  { id: 'audio-batch', name: 'Audio to MP3', desc: 'Convert any audio to MP3, tidy names, add checksums.', tag: 'Audio', color: '#38BDF8', samples: ['tone.wav'],
    graph: line([{ step: 'av-convert', params: { audio: 'mp3' } }, { step: 'file-rename', params: { pattern: 'track-{n}' } }, { step: 'checksum' }]) },
  { id: 'data-formats', name: 'Data in every format', desc: 'CSV and JSON branch into JSON and XLSX copies.', tag: 'Data', color: '#10B981', samples: ['cities.csv', 'stock.json'],
    graph: () => branchGraph([[{ step: 'data-convert', params: { to: 'json' } }], [{ step: 'data-convert', params: { to: 'xlsx' } }]]) },
  { id: 'find-replace', name: 'Fix a word everywhere', desc: 'Find and replace across text and CSV files.', tag: 'Data', color: '#10B981', samples: ['notes.txt', 'cities.csv'],
    graph: line([{ step: 'text-replace', params: { find: 'Calcutta', replace: 'Kolkata', caseSensitive: false } }]) },
  { id: 'zip-repack', name: 'Repack a ZIP smaller', desc: 'Unzip, compress the images inside, zip it back.', tag: 'Archive', color: '#22D3EE', samples: ['bundle.zip'],
    graph: line([{ step: 'unzip' }, { step: 'img-compress', params: { quality: 70 } }, { step: 'zip-all', params: { name: 'repacked' } }]) },
]

export const builtinRecipe = (b: Builtin): Recipe => ({ v: 1, name: b.name, desc: b.desc, graph: b.graph() })

/** Sample files shipped in public/media/workspace/samples. */
export const SAMPLE_FILES = ['photo-dunes.jpg', 'photo-lagoon.jpg', 'photo-city.png', 'report.pdf', 'invoice.pdf', 'clip.mp4', 'tone.wav', 'cities.csv', 'stock.json', 'notes.txt', 'bundle.zip']

import type { Stats } from './three-viewer'

const n = (v: number) => v.toLocaleString()
export function ModelStatsGrid({ stats, format }: { stats: Stats; format?: string }) {
  const rows: [string, string][] = [
    ...(format ? [['Format', format.toUpperCase()] as [string, string]] : []),
    ['Meshes', n(stats.meshes)], ['Triangles', n(stats.triangles)], ['Vertices', n(stats.vertices)],
    ...(stats.points ? [['Points', n(stats.points)] as [string, string]] : []),
    ['Materials', n(stats.materials)], ['Textures', n(stats.textures)],
    ...(stats.animations ? [['Animations', n(stats.animations)] as [string, string]] : []),
    ['Size (units)', `${+stats.size.x.toPrecision(4)} × ${+stats.size.y.toPrecision(4)} × ${+stats.size.z.toPrecision(4)}`],
  ]
  return (
    <div className="grid grid-cols-2 gap-1.5 text-xs">
      {rows.map(([k, v]) => <div key={k} className={k.startsWith('Size') ? 'col-span-2 rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5' : 'rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5'}><div className="text-muted">{k}</div><div className="truncate font-medium">{v}</div></div>)}
    </div>
  )
}

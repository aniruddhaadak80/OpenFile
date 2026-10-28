// Generated cover art for blog posts: pure SVG in the brand palette, no image files.
import type { CoverKind } from './meta'
import { cn } from '@/components/ui'

const PAL: Record<CoverKind, [string, string]> = {
  privacy: ['#F5A524', '#10B981'], pdf: ['#F5A524', '#F97316'], image: ['#10B981', '#84CC16'], video: ['#38BDF8', '#22D3EE'],
  pipeline: ['#F5A524', '#14B8A6'], sketch: ['#60A5FA', '#22D3EE'], formats: ['#F97316', '#F5A524'], dev: ['#22D3EE', '#14B8A6'], voice: ['#14B8A6', '#F5A524'],
}

function Motif({ kind, a, b }: { kind: CoverKind; a: string; b: string }) {
  switch (kind) {
    case 'privacy': return <g fill="none" strokeWidth="3"><path d="M200 70 L260 92 V140 C260 178 232 200 200 212 C168 200 140 178 140 140 V92 Z" stroke={a} /><rect x="182" y="128" width="36" height="30" rx="6" stroke={b} /><path d="M188 128 v-10 a12 12 0 0 1 24 0 v10" stroke={b} /></g>
    case 'pdf': return <g fill="none" strokeWidth="3">{[0, 1, 2].map((i) => <g key={i} transform={`translate(${150 + i * 26} ${80 - i * 8})`}><path d="M0 0h48l18 18v86H0Z" stroke={i === 2 ? a : b} strokeOpacity={0.4 + i * 0.3} fill="#000" /><path d="M10 40h44M10 54h44M10 68h30" stroke={i === 2 ? a : b} strokeOpacity={0.5 + i * 0.25} /></g>)}</g>
    case 'image': return <g fill="none" strokeWidth="3"><rect x="130" y="70" width="140" height="110" rx="10" stroke={a} /><circle cx="170" cy="105" r="12" stroke={b} /><path d="M130 165 l45-40 30 25 25-20 40 35" stroke={a} />{Array.from({ length: 6 }).map((_, i) => <rect key={i} x={200 + (i % 3) * 23} y={70 + Math.floor(i / 3) * 23} width="23" height="23" fill={b} fillOpacity={0.08 + i * 0.03} stroke="none" />)}</g>
    case 'video': return <g fill="none" strokeWidth="3"><rect x="120" y="78" width="160" height="96" rx="12" stroke={a} /><path d="M188 104 l28 22 -28 22 Z" fill={b} stroke="none" /><path d="M120 194 h160" stroke={b} strokeOpacity=".5" /><path d="M120 194 h96" stroke={a} /><circle cx="216" cy="194" r="6" fill={a} stroke="none" /></g>
    case 'pipeline': return <g fill="none" strokeWidth="3">{[0, 1, 2, 3].map((i) => <g key={i}><rect x={100 + i * 56} y="110" width="40" height="40" rx="10" stroke={i % 2 ? b : a} />{i < 3 && <path d={`M${140 + i * 56} 130 h16`} stroke={b} strokeDasharray="4 4" />}</g>)}<path d="M120 100 v-20 h168 v20" stroke={a} strokeOpacity=".4" /></g>
    case 'sketch': return <g fill="none" strokeWidth="3" strokeLinecap="round"><rect x="120" y="80" width="70" height="50" rx="8" stroke={a} /><circle cx="250" cy="105" r="28" stroke={b} /><path d="M190 105 C 205 105, 210 105, 222 105" stroke={a} /><path d="M140 170 c20 -18 40 18 60 0 s40 18 60 0" stroke={b} /></g>
    case 'formats': return <g fontFamily="ui-monospace, monospace" fontSize="15" fontWeight="700">{['PDF', 'PNG', 'MP4', 'JSON', 'WEBP', 'MP3', 'CSV', 'SVG', 'ZIP'].map((f, i) => <g key={f} transform={`translate(${118 + (i % 3) * 60} ${78 + Math.floor(i / 3) * 42})`}><rect width="52" height="30" rx="7" fill="none" stroke={i % 2 ? b : a} strokeWidth="2" strokeOpacity=".8" /><text x="26" y="20" textAnchor="middle" fill={i % 2 ? b : a}>{f}</text></g>)}</g>
    case 'dev': return <g fill="none" strokeWidth="3" strokeLinecap="round" fontFamily="ui-monospace, monospace"><path d="M170 96 l-30 34 30 34" stroke={a} /><path d="M230 96 l30 34 -30 34" stroke={a} /><path d="M212 88 l-24 84" stroke={b} /></g>
    case 'voice': return <g fill="none" strokeWidth="4" strokeLinecap="round">{Array.from({ length: 15 }).map((_, i) => { const h = 12 + Math.abs(Math.sin(i * 0.9)) * 70; return <path key={i} d={`M${123 + i * 11} ${130 - h / 2} v${h}`} stroke={i % 3 ? a : b} strokeOpacity={0.5 + (i % 4) * 0.15} /> })}</g>
  }
}

export function Cover({ kind, className, title }: { kind: CoverKind; className?: string; title?: string }) {
  const [a, b] = PAL[kind]
  const id = `cv-${kind}`
  return (
    <svg viewBox="0 0 400 250" className={cn('block h-auto w-full bg-black', className)} role="img" aria-label={title ?? `${kind} cover art`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${id}-g`} cx="70%" cy="20%" r="80%"><stop offset="0" stopColor={a} stopOpacity=".35" /><stop offset=".6" stopColor={b} stopOpacity=".06" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <pattern id={`${id}-p`} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#fff" fillOpacity=".07" /></pattern>
      </defs>
      <rect width="400" height="250" fill="#000" />
      <rect width="400" height="250" fill={`url(#${id}-p)`} />
      <rect width="400" height="250" fill={`url(#${id}-g)`} />
      <circle cx="330" cy="40" r="70" fill="none" stroke={a} strokeOpacity=".25" strokeWidth="1.5" />
      <circle cx="330" cy="40" r="46" fill="none" stroke={a} strokeOpacity=".5" strokeWidth="2" />
      <Motif kind={kind} a={a} b={b} />
    </svg>
  )
}

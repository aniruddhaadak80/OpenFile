// Friendly empty states with small SVG illustrations in the OpenFile palette (gold, teal, cyan, emerald, sky).
import React from 'react'
import { motion } from 'framer-motion'
import { cn } from './ui'

export type EmptyKind = 'search' | 'star' | 'clock' | 'lost' | 'offline' | 'files' | 'compare'

const G = '#F5A524', T = '#14B8A6', C = '#22D3EE', E = '#10B981', S = '#38BDF8'

function Art({ kind }: { kind: EmptyKind }) {
  const common = { fill: 'none', strokeWidth: 2.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" aria-hidden="true" className="overflow-visible">
      <defs>
        <radialGradient id="es-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={G} stopOpacity=".28" /><stop offset="1" stopColor={G} stopOpacity="0" /></radialGradient>
        <linearGradient id="es-gold" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#FFD27A" /><stop offset="1" stopColor={G} /></linearGradient>
      </defs>
      <ellipse cx="80" cy="62" rx="70" ry="50" fill="url(#es-glow)" />
      {/* back sheets */}
      <rect x="38" y="26" width="52" height="66" rx="8" transform="rotate(-10 64 59)" fill="var(--surface-2)" stroke={T} strokeOpacity=".55" strokeWidth="2" />
      <rect x="66" y="22" width="52" height="66" rx="8" transform="rotate(8 92 55)" fill="var(--surface-2)" stroke={S} strokeOpacity=".55" strokeWidth="2" />
      <rect x="52" y="20" width="56" height="72" rx="9" fill="var(--surface)" stroke="url(#es-gold)" strokeWidth="2.5" />
      <path d="M62 36h30M62 46h36M62 56h22" stroke="var(--muted)" strokeOpacity=".5" {...common} strokeWidth={3} />
      {kind === 'search' && <g {...common}><circle cx="104" cy="74" r="15" stroke={G} fill="var(--bg)" /><path d="M115 85l12 12" stroke={G} strokeWidth={5} /><path d="M98 74h12" stroke={C} /></g>}
      {kind === 'star' && <path d="M106 60l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L106 88.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" {...common} fill={G} fillOpacity=".18" stroke={G} />}
      {kind === 'clock' && <g {...common}><circle cx="106" cy="78" r="17" stroke={T} fill="var(--bg)" /><path d="M106 68v10l7 5" stroke={G} /></g>}
      {kind === 'lost' && <g {...common}><circle cx="106" cy="78" r="18" stroke={S} fill="var(--bg)" /><path d="M112 70l-4 10-10 4 4-10z" stroke={G} fill={G} fillOpacity=".25" /><path d="M106 56v4M106 96v4M84 78h4M124 78h4" stroke={S} /></g>}
      {kind === 'offline' && <g {...common}><path d="M86 74a28 28 0 0 1 40 0M93 82a17 17 0 0 1 26 0" stroke={T} /><circle cx="106" cy="90" r="3" fill={G} stroke="none" /><path d="M88 62l36 36" stroke={G} /></g>}
      {kind === 'files' && <g {...common}><rect x="92" y="64" width="30" height="30" rx="8" fill="var(--bg)" stroke={E} /><path d="M107 72v14M100 79h14" stroke={E} /></g>}
      {kind === 'compare' && <g {...common}><rect x="88" y="62" width="16" height="30" rx="4" fill="var(--bg)" stroke={G} /><rect x="110" y="62" width="16" height="30" rx="4" fill="var(--bg)" stroke={C} /></g>}
      <circle cx="30" cy="30" r="3" fill={C} /><circle cx="134" cy="24" r="2.5" fill={E} /><circle cx="140" cy="96" r="2" fill={G} /><circle cx="22" cy="90" r="2" fill={S} />
    </svg>
  )
}

export function EmptyState({ kind = 'search', title, children, actions, className, compact }: { kind?: EmptyKind; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; className?: string; compact?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className={cn('flex flex-col items-center rounded-3xl border border-dashed border-border bg-surface/40 text-center', compact ? 'gap-2 p-6' : 'gap-3 p-10', className)}>
      <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} className={compact ? 'scale-75' : undefined}><Art kind={kind} /></motion.div>
      <div className="font-display text-lg font-semibold">{title}</div>
      {children && <div className="max-w-md text-sm leading-relaxed text-muted">{children}</div>}
      {actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>}
    </motion.div>
  )
}

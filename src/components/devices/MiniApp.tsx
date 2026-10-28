// A miniature, real-looking OpenFile UI drawn at full design size and scaled down by its screen.
// Real tool names, icons and categories come from the registry. Pure markup, no images.
import { useEffect } from 'react'
import { motion, animate, useMotionValue, useTransform, AnimatePresence } from 'framer-motion'
import { Search, Upload, Check, Download, ShieldCheck, Menu, Play, FileText, Image as ImageIcon, Film, Cpu } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { getIcon } from '@/components/icons'
import { CATEGORIES, TOOLS } from '@/tools/registry'
import { DEMOS, RUN_MS, type Demo, type Phase } from './demo'

export type ScreenTheme = 'dark' | 'light'
export const SCREEN_VARS: Record<ScreenTheme, React.CSSProperties> = {
  dark: { ['--s-bg' as string]: '#0B0D10', ['--s-surface' as string]: '#111418', ['--s-surface2' as string]: '#181C21', ['--s-border' as string]: '#252A31', ['--s-fg' as string]: '#ECEEF1', ['--s-muted' as string]: '#8B929C', ['--s-accent' as string]: '#F5A524' },
  light: { ['--s-bg' as string]: '#FAFAF7', ['--s-surface' as string]: '#FFFFFF', ['--s-surface2' as string]: '#F2F1EB', ['--s-border' as string]: '#E5E2D8', ['--s-fg' as string]: '#16140F', ['--s-muted' as string]: '#67645B', ['--s-accent' as string]: '#D98A00' },
}
const catOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0]
const CHIP_IDS = ['pdf', 'image', 'video', 'convert', 'audio', 'ai', 'dev']
const CHIPS = CHIP_IDS.map((id) => CATEGORIES.find((c) => c.id === id)).filter(Boolean) as typeof CATEGORIES

export interface MiniAppProps {
  layout: 'wide' | 'phone'
  cols?: number
  theme: ScreenTheme
  index: number
  phase: Phase
  /** animate entrances and progress */
  motionOn?: boolean
  interactive?: boolean
  onHover?: (i: number | null) => void
  onPick?: (i: number) => void
  /** hide the small hero line on short screens */
  hero?: boolean
}

export function MiniApp({ layout, cols = 3, theme, index, phase, motionOn = true, interactive = true, onHover, onPick, hero = true }: MiniAppProps) {
  const demo = DEMOS[index] ?? DEMOS[0]
  const phone = layout === 'phone'
  const cards = phone ? DEMOS.slice(0, 6) : DEMOS
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--s-bg)] text-[var(--s-fg)]" style={{ ...SCREEN_VARS[theme], fontFamily: 'inherit' }}>
      {/* header */}
      <div className={phone ? 'flex items-center gap-2.5 px-5 pb-3 pt-2' : 'flex items-center gap-3 border-b border-[var(--s-border)] px-7 py-4'}>
        <Logo size={phone ? 30 : 34} />
        <span className={phone ? 'text-[19px] font-bold' : 'text-[21px] font-bold'}>OpenFile</span>
        {!phone && <nav className="ml-8 flex gap-6 text-[15px] text-[var(--s-muted)]"><span className="text-[var(--s-fg)]">Tools</span><span>Workspace</span><span>Install</span></nav>}
        {phone ? <Menu className="ml-auto size-6 text-[var(--s-muted)]" /> : <SearchBox demo={demo} phase={phase} className="ml-auto w-[340px]" />}
      </div>
      {phone && <div className="px-5"><SearchBox demo={demo} phase={phase} className="w-full" /></div>}
      {hero && !phone && (
        <div className="px-7 pt-5">
          <div className="text-[30px] font-bold leading-tight tracking-tight">Every file tool. <span className="text-gradient">One private tab.</span></div>
          <div className="mt-1 text-[15px] text-[var(--s-muted)]">{TOOLS.length} tools that run on your device. No uploads.</div>
        </div>
      )}
      {/* chips */}
      <div className={phone ? 'mt-3 flex gap-2 overflow-hidden px-5' : 'mt-4 flex gap-2 px-7'}>
        <Chip active={false} label="All" color="var(--s-accent)" phone={phone} />
        {CHIPS.slice(0, phone ? 4 : 7).map((c) => <Chip key={c.id} active={c.id === demo.tool.category} label={c.name.replace(' Tools', '')} color={c.color} phone={phone} />)}
      </div>
      {/* body */}
      {phone ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-6 pt-3">
          <Panel demo={demo} phase={phase} motionOn={motionOn} phone />
          <div className="text-[13px] font-semibold uppercase tracking-wider text-[var(--s-muted)]">Popular tools</div>
          <div className="grid grid-cols-2 gap-2.5">{cards.map((d, i) => <ToolTile key={d.tool.slug} d={d} active={i === index} i={i} phone interactive={interactive} onHover={onHover} onPick={onPick} />)}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-5 px-7 pb-6 pt-4">
          <div className="grid min-w-0 flex-1 content-start gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {cards.map((d, i) => <ToolTile key={d.tool.slug} d={d} active={i === index} i={i} interactive={interactive} onHover={onHover} onPick={onPick} />)}
          </div>
          <div className="flex w-[44%] shrink-0 flex-col"><Panel demo={demo} phase={phase} motionOn={motionOn} /></div>
        </div>
      )}
    </div>
  )
}

function SearchBox({ demo, phase, className }: { demo: Demo; phase: Phase; className?: string }) {
  const typed = phase !== 'idle'
  return (
    <div className={`flex h-11 items-center gap-2.5 rounded-xl border border-[var(--s-border)] bg-[var(--s-surface)] px-3.5 text-[15px] ${className ?? ''}`}>
      <Search className="size-[18px] text-[var(--s-muted)]" />
      {typed ? <span className="truncate">{demo.tool.name}</span> : <span className="truncate text-[var(--s-muted)]">Search {TOOLS.length} tools</span>}
      {typed && <motion.span className="h-5 w-[2px] bg-[var(--s-accent)]" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} />}
      <span className="ml-auto rounded-md border border-[var(--s-border)] px-1.5 text-[12px] text-[var(--s-muted)]">/</span>
    </div>
  )
}

function Chip({ active, label, color, phone }: { active: boolean; label: string; color: string; phone?: boolean }) {
  return (
    <span className={`shrink-0 rounded-full border font-medium transition-colors duration-300 ${phone ? 'px-3.5 py-1.5 text-[14px]' : 'px-3.5 py-1.5 text-[14px]'}`}
      style={active ? { borderColor: color, background: `color-mix(in oklab, ${color} 18%, transparent)`, color } : { borderColor: 'var(--s-border)', color: 'var(--s-muted)' }}>{label}</span>
  )
}

function ToolTile({ d, i, active, phone, interactive, onHover, onPick }: { d: Demo; i: number; active: boolean; phone?: boolean; interactive?: boolean; onHover?: (i: number | null) => void; onPick?: (i: number) => void }) {
  const Icon = getIcon(d.tool.icon)
  const cat = catOf(d.tool.category)
  return (
    <button type="button" tabIndex={interactive ? 0 : -1} aria-label={`Play the ${d.tool.name} demo`}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onHover?.(i) }} onPointerLeave={() => onHover?.(null)}
      onClick={(e) => { e.stopPropagation(); onPick?.(i) }}
      className={`relative flex min-w-0 items-center gap-3 rounded-2xl border bg-[var(--s-surface)] text-left transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 ${phone ? 'p-3' : 'p-3.5'} ${interactive ? 'cursor-pointer' : 'pointer-events-none'}`}
      style={{ borderColor: active ? cat.color : 'var(--s-border)', boxShadow: active ? `0 0 0 3px color-mix(in oklab, ${cat.color} 22%, transparent), 0 10px 30px -12px ${cat.color}` : undefined }}>
      <span className={`grid shrink-0 place-items-center rounded-xl ${phone ? 'size-10' : 'size-11'}`} style={{ background: `color-mix(in oklab, ${cat.color} 16%, transparent)`, color: cat.color }}><Icon className={phone ? 'size-5' : 'size-[22px]'} /></span>
      <span className="min-w-0">
        <span className={`block truncate font-semibold ${phone ? 'text-[14px]' : 'text-[16px]'}`}>{d.tool.name}</span>
        <span className="block truncate text-[13px]" style={{ color: cat.color }}>{cat.name.replace(' Tools', '')}{d.tool.badge === 'AI' ? ' · AI' : ''}</span>
      </span>
    </button>
  )
}

function Panel({ demo, phase, motionOn, phone }: { demo: Demo; phase: Phase; motionOn: boolean; phone?: boolean }) {
  const Icon = getIcon(demo.tool.icon)
  const cat = catOf(demo.tool.category)
  return (
    <div className={`flex min-h-0 flex-col rounded-2xl border border-[var(--s-border)] bg-[var(--s-surface)] ${phone ? 'p-4' : 'flex-1 p-5'}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${cat.color} 18%, transparent)`, color: cat.color }}><Icon className="size-[22px]" /></span>
        <div className="min-w-0"><div className="truncate text-[18px] font-bold">{demo.tool.name}</div><div className="truncate text-[13px] text-[var(--s-muted)]">{demo.tool.desc}</div></div>
      </div>
      <div className={`relative mt-4 ${phone ? 'h-[248px]' : 'min-h-0 flex-1'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${demo.tool.slug}-${phase === 'drop' || phase === 'idle' ? 'in' : phase}`} className="absolute inset-0 flex flex-col"
            initial={motionOn ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} exit={motionOn ? { opacity: 0, y: -8 } : undefined} transition={{ duration: 0.28 }}>
            {phase === 'idle' || phase === 'drop' ? <DropZone demo={demo} active={phase === 'drop'} color={cat.color} motionOn={motionOn} />
              : phase === 'run' ? <Running demo={demo} color={cat.color} motionOn={motionOn} />
              : <Result demo={demo} color={cat.color} motionOn={motionOn} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--s-muted)]"><ShieldCheck className="size-4 text-emerald" /> Processed on this device. 0 bytes uploaded.</div>
    </div>
  )
}

const fileIcon = (n: string) => (/\.(mp4|mov|webm)$/i.test(n) ? Film : /\.(pdf|docx?)$/i.test(n) ? FileText : ImageIcon)

function DropZone({ demo, active, color, motionOn }: { demo: Demo; active: boolean; color: string; motionOn: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-4 text-center transition-colors duration-300"
      style={{ borderColor: active ? color : 'var(--s-border)', background: active ? `color-mix(in oklab, ${color} 8%, transparent)` : 'var(--s-surface2)' }}>
      {!active ? (
        <>
          <span className="grid size-14 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}><Upload className="size-7" /></span>
          <div className="text-[17px] font-semibold">Drop files here</div>
          <div className="text-[13px] text-[var(--s-muted)]">or click to choose. {(demo.tool.inputs ?? []).slice(0, 4).join(', ')}</div>
        </>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {demo.files.map((f, i) => {
            const FI = fileIcon(f.name)
            return (
              <motion.div key={f.name} className="flex items-center gap-3 rounded-xl border border-[var(--s-border)] bg-[var(--s-surface)] px-3 py-2.5 text-left"
                initial={motionOn ? { opacity: 0, y: -60, rotate: -6, scale: 0.9 } : false} animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }} transition={{ delay: 0.12 + i * 0.18, type: 'spring', stiffness: 260, damping: 20 }}>
                <FI className="size-5 shrink-0" style={{ color }} /><span className="min-w-0 flex-1 truncate text-[15px] font-medium">{f.name}</span><span className="text-[13px] text-[var(--s-muted)]">{f.size}</span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Running({ demo, color, motionOn }: { demo: Demo; color: string; motionOn: boolean }) {
  const p = useMotionValue(motionOn ? 0 : 100)
  const pct = useTransform(p, (v) => `${Math.round(v)}%`)
  const width = useTransform(p, (v) => `${v}%`)
  useEffect(() => {
    if (!motionOn) { p.set(100); return }
    const c = animate(p, 100, { duration: RUN_MS / 1000, ease: [0.4, 0, 0.2, 1] })
    return () => c.stop()
  }, [motionOn, p])
  return (
    <div className="flex h-full flex-col justify-center gap-4 rounded-2xl bg-[var(--s-surface2)] p-5">
      <div className="flex items-center gap-2 text-[14px] text-[var(--s-muted)]"><Cpu className="size-4" style={{ color }} /> {demo.step}</div>
      <div className="flex flex-wrap gap-2">{demo.files.map((f) => <span key={f.name} className="rounded-lg border border-[var(--s-border)] bg-[var(--s-surface)] px-2.5 py-1 text-[13px]">{f.name}</span>)}</div>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--s-border)]">
        <motion.div className="relative h-full rounded-full" style={{ width, background: `linear-gradient(90deg, ${color}, #F5A524)` }}>
          <span className="absolute inset-0 animate-pulse bg-white/20" />
        </motion.div>
      </div>
      <div className="flex items-center justify-between text-[14px]"><span className="text-[var(--s-muted)]">Working on your device</span><motion.span className="font-mono font-semibold" style={{ color }}>{pct}</motion.span></div>
    </div>
  )
}

function Result({ demo, color, motionOn }: { demo: Demo; color: string; motionOn: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--s-border)]"><Visual demo={demo} color={color} motionOn={motionOn} /></div>
      <div className="flex items-center gap-3">
        <motion.span initial={motionOn ? { scale: 0 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }} className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald text-black"><Check className="size-5" /></motion.span>
        <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-semibold">{demo.out.name}</div><div className="truncate text-[13px] text-[var(--s-muted)]">{demo.out.size} · {demo.out.note}</div></div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--s-accent)] px-3.5 py-2 text-[14px] font-semibold text-black"><Download className="size-4" /> Save</span>
      </div>
    </div>
  )
}

const CHECKER = 'repeating-conic-gradient(color-mix(in oklab, var(--s-fg) 10%, transparent) 0% 25%, transparent 0% 50%) 50% / 22px 22px'

function Visual({ demo, color, motionOn }: { demo: Demo; color: string; motionOn: boolean }) {
  const pop = (i: number) => (motionOn ? { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i, duration: 0.35 } } : {})
  switch (demo.visual) {
    case 'pdf':
      return (
        <div className="grid h-full place-items-center bg-[var(--s-surface2)]">
          <div className="relative h-[78%] aspect-[3/4]">
            {[2, 1, 0].map((k) => (
              <motion.div key={k} {...pop(2 - k)} className="absolute inset-0 rounded-lg border border-[var(--s-border)] bg-[var(--s-surface)] p-[9%] shadow-lg" style={{ transform: `translate(${k * 10}px, ${-k * 10}px) rotate(${k * 3}deg)` }}>
                <div className="h-[8%] w-1/2 rounded" style={{ background: color }} />
                {[90, 75, 85, 60, 80, 50].map((w, j) => <div key={j} className="mt-[8%] h-[4%] rounded bg-[var(--s-border)]" style={{ width: `${w}%` }} />)}
              </motion.div>
            ))}
          </div>
          {demo.before && <SizeBars before={demo.before} after={demo.out.size} color={color} />}
        </div>
      )
    case 'cutout':
      return (
        <div className="relative grid h-full grid-cols-2">
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #38BDF8 0%, #14B8A6 60%, #84CC16 100%)' }}><Person /><Tag>Before</Tag></div>
          <motion.div className="relative overflow-hidden" style={{ background: CHECKER }} initial={motionOn ? { clipPath: 'inset(0 100% 0 0)' } : false} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 0.8, ease: 'easeOut' }}><Person /><Tag>After</Tag></motion.div>
        </div>
      )
    case 'video':
    case 'gif':
      return (
        <div className="flex h-full flex-col justify-center gap-3 bg-[var(--s-surface2)] p-4">
          <div className="flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => (
            <motion.div key={i} {...pop(i)} className="relative aspect-video flex-1 overflow-hidden rounded-md" style={{ background: `linear-gradient(${120 + i * 25}deg, #F97316, #F5A524 45%, #38BDF8)` }}>
              <div className="absolute bottom-0 h-1/3 w-full bg-black/25" style={{ clipPath: 'polygon(0 100%, 0 40%, 30% 0, 55% 50%, 75% 20%, 100% 60%, 100% 100%)' }} />
            </motion.div>
          ))}</div>
          <div className="flex items-center gap-2 text-[13px] text-[var(--s-muted)]"><Play className="size-4" style={{ color }} />{demo.visual === 'gif' ? 'Looping GIF preview' : '00:42 · 1920 x 1080'}</div>
          {demo.before && <SizeBars before={demo.before} after={demo.out.size} color={color} inline />}
        </div>
      )
    case 'photo':
      return (
        <div className="relative h-full overflow-hidden" style={{ background: 'linear-gradient(180deg, #38BDF8 0%, #FDE68A 70%, #F5A524 100%)' }}>
          <motion.div className="absolute right-[18%] top-[16%] size-[18%] max-h-16 max-w-16 rounded-full bg-[#FFF7E0]" initial={motionOn ? { y: 30, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }} />
          <div className="absolute inset-x-0 bottom-0 h-[55%] bg-[#0F766E]" style={{ clipPath: 'polygon(0 100%, 0 45%, 22% 10%, 42% 50%, 62% 18%, 82% 55%, 100% 30%, 100% 100%)' }} />
          <div className="absolute inset-x-0 bottom-0 h-[30%] bg-[#065F46]" style={{ clipPath: 'polygon(0 100%, 0 40%, 30% 0, 60% 45%, 100% 10%, 100% 100%)' }} />
          <Tag>{demo.out.name.split('.').pop()?.toUpperCase()}</Tag>
        </div>
      )
    case 'pages':
      return (
        <div className="grid h-full grid-cols-3 gap-2 bg-[var(--s-surface2)] p-3">{[0, 1, 2, 3, 4, 5].map((i) => (
          <motion.div key={i} {...pop(i)} className="rounded-md border border-[var(--s-border)] bg-[var(--s-surface)] p-2">
            <div className="h-[22%] w-2/3 rounded" style={{ background: i % 2 ? '#14B8A6' : color }} />
            <div className="mt-2 h-1.5 w-full rounded bg-[var(--s-border)]" /><div className="mt-1.5 h-1.5 w-3/4 rounded bg-[var(--s-border)]" />
          </motion.div>
        ))}</div>
      )
  }
}

function SizeBars({ before, after, color, inline }: { before: string; after: string; color: string; inline?: boolean }) {
  return (
    <div className={inline ? 'space-y-1.5 text-[12px]' : 'absolute inset-x-4 bottom-3 space-y-1.5 rounded-xl bg-[var(--s-surface)]/90 p-2.5 text-[12px] shadow'}>
      <div className="flex items-center gap-2"><span className="w-12 text-[var(--s-muted)]">Before</span><span className="h-2 flex-1 rounded-full bg-[var(--s-border)]" /><span className="w-14 text-right">{before}</span></div>
      <div className="flex items-center gap-2"><span className="w-12 text-[var(--s-muted)]">After</span><span className="h-2 flex-1"><motion.span className="block h-full rounded-full" style={{ background: color }} initial={{ width: '100%' }} animate={{ width: '24%' }} transition={{ duration: 0.9, delay: 0.2 }} /></span><span className="w-14 text-right font-semibold">{after}</span></div>
    </div>
  )
}

const Tag = ({ children }: { children: React.ReactNode }) => <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">{children}</span>
const Person = () => (
  <div className="absolute bottom-0 left-1/2 h-[82%] w-[56%] -translate-x-1/2">
    <div className="mx-auto aspect-square w-[42%] rounded-full" style={{ background: 'linear-gradient(160deg, #FDE68A, #F5A524)' }} />
    <div className="mx-auto mt-[4%] h-[60%] w-full rounded-t-[45%]" style={{ background: 'linear-gradient(160deg, #F97316, #B45309)' }} />
  </div>
)

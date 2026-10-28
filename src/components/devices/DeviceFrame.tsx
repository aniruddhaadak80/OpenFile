// Hardware around a screen. The body morphs (size, corners, bezel) between devices with a spring,
// while device-only parts (laptop base, monitor stand, tablet camera) fade in and out.
import { AnimatePresence, motion } from 'framer-motion'
import { DEVICES, type DeviceId, type Geometry } from './devices'

const SPRING = { type: 'spring', stiffness: 170, damping: 24, mass: 0.9 } as const

export function DeviceFrame({ device, g, animated = true, children }: { device: DeviceId; g: Geometry; animated?: boolean; children: React.ReactNode }) {
  const spec = DEVICES[device]
  const t = animated ? SPRING : { duration: 0 }
  const metal = spec.kind === 'laptop' && device !== 'linux' && device !== 'chromeos'
  const bodyBg = spec.kind === 'window' ? 'transparent' : spec.kind === 'phone' || spec.kind === 'tablet' ? 'linear-gradient(145deg, #2a2e35, #0d0f12 40%, #1b1e23)' : metal ? 'linear-gradient(180deg, #23262b, #0e1013)' : 'linear-gradient(180deg, #1c1d20, #0b0b0c)'
  return (
    <motion.div className="relative" initial={false} animate={{ width: g.bodyW, height: g.total }} transition={t}>
      <motion.div className="absolute inset-x-0 top-0 shadow-[0_40px_80px_-30px_rgba(0,0,0,.7)]" initial={false}
        animate={{ height: g.bodyH, borderRadius: spec.kind === 'laptop' || spec.kind === 'monitor' ? `${g.radius}px ${g.radius}px ${g.radius * 0.4}px ${g.radius * 0.4}px` : `${g.radius}px`, padding: g.pad }} transition={t}
        style={{ background: bodyBg, boxShadow: spec.kind === 'window' ? '0 30px 60px -20px rgba(0,0,0,.6), 0 0 0 1px rgba(127,127,127,.3)' : 'inset 0 0 0 1px rgba(255,255,255,.08), 0 40px 80px -30px rgba(0,0,0,.7)' }}>
        <motion.div className="relative h-full w-full overflow-hidden bg-black" initial={false} animate={{ borderRadius: g.screenRadius }} transition={t}>
          {children}
          {/* glass reflection */}
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,0) 38%)' }} />
        </motion.div>
        <AnimatePresence>
          {(spec.kind === 'laptop' || spec.kind === 'monitor') && (
            <motion.span key="cam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-1/2 top-[30%] size-[5px] -translate-x-1/2 rounded-full bg-[#2b2f36]" style={{ top: Math.max(2, g.pad * 0.35) }} />
          )}
          {device === 'atab' && <motion.span key="tabcam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-[#2b2f36]" style={{ top: g.pad * 0.4 }} />}
          {device === 'ipad' && <motion.span key="ipadcam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-[#2b2f36]" style={{ top: g.pad * 0.4 }} />}
        </AnimatePresence>
        {spec.kind === 'phone' && <><span className="absolute -left-[3px] top-[22%] h-[9%] w-[3px] rounded-l bg-[#2a2e35]" /><span className="absolute -right-[3px] top-[28%] h-[13%] w-[3px] rounded-r bg-[#2a2e35]" /></>}
      </motion.div>
      <AnimatePresence>
        {spec.kind === 'laptop' && (
          <motion.div key={`base-${device}`} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: animated ? 0.35 : 0 }} className="absolute left-1/2 -translate-x-1/2" style={{ top: g.bodyH - 1, width: g.bodyW * 1.16, height: g.below }}>
            <div className="h-full w-full rounded-b-[40%_100%] rounded-t-[3px]" style={{ background: metal ? 'linear-gradient(180deg, #3a3e45, #1a1c20 70%, #0c0d0f)' : 'linear-gradient(180deg, #2a2b2f, #121315 70%, #08090a)' }} />
            {metal && <div className="absolute left-1/2 top-0 h-[38%] w-[16%] -translate-x-1/2 rounded-b-md bg-[#1b1d21]" />}
          </motion.div>
        )}
        {spec.kind === 'monitor' && (
          <motion.div key="stand" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: animated ? 0.35 : 0 }} className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: g.bodyH, height: g.below, width: g.bodyW * 0.3 }}>
            <div className="w-[34%] flex-1" style={{ background: 'linear-gradient(90deg, #15171a, #2a2d33, #15171a)' }} />
            <div className="h-[16%] w-full rounded-t-md rounded-b-sm" style={{ background: 'linear-gradient(180deg, #2a2d33, #121417)' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

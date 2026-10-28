// Small, still preview of a device running OpenFile, used on the Install platform cards.
// Renders only once it scrolls near the viewport, and never takes focus or clicks.
import { useLayoutEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import { fit, type DeviceId } from './devices'
import { DeviceFrame } from './DeviceFrame'
import { OsScreen } from './OsScreen'

export function DevicePreview({ device, demo = 0, className }: { device: DeviceId; demo?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, margin: '200px' })
  const [s, setS] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => setS({ w: el.clientWidth, h: el.clientHeight })
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const g = s.w ? fit(device, s.w, s.h, 0.86) : null
  return (
    <div ref={ref} aria-hidden="true" inert className={`pointer-events-none relative flex items-center justify-center overflow-hidden ${className ?? ''}`}>
      {seen && g && (
        <DeviceFrame device={device} g={g} animated={false}>
          <div className="absolute inset-0"><OsScreen device={device} theme="dark" app={{ index: demo, phase: 'done', motionOn: false, interactive: false }} /></div>
        </DeviceFrame>
      )}
    </div>
  )
}

// What each device's screen shows: the operating system's own chrome (menu bar, taskbar, status bar,
// Dynamic Island, punch-hole camera) around the live OpenFile UI. Drawn at design size, then scaled.
import { useLayoutEffect, useRef, useState } from 'react'
import { Apple, Wifi, BatteryFull, Signal, Minus, Square, X, Search, Volume2, Power, Lock } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { DEVICES, type DeviceId } from './devices'
import { MiniApp, SCREEN_VARS, type MiniAppProps, type ScreenTheme } from './MiniApp'

/** Scales a fixed-width design canvas to fill its box, keeping the box's own aspect ratio. */
export function Scaled({ design, children, className }: { design: number; children: (h: number) => React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const s = box.w ? box.w / design : 0
  const h = s ? box.h / s : design * 0.6
  return (
    <div ref={ref} className={`relative h-full w-full overflow-hidden ${className ?? ''}`}>
      {s > 0 && <div className="absolute left-0 top-0 origin-top-left" style={{ width: design, height: h, transform: `scale(${s})` }}>{children(h)}</div>}
    </div>
  )
}

type AppProps = Omit<MiniAppProps, 'layout' | 'cols' | 'theme'>

const WALL: Record<ScreenTheme, Record<string, string>> = {
  dark: {
    mac: 'radial-gradient(120% 90% at 20% 10%, #7C4A03 0%, transparent 55%), radial-gradient(90% 80% at 90% 90%, #0F766E 0%, transparent 60%), #0A0A0A',
    win: 'radial-gradient(70% 90% at 50% 120%, #0369A1 0%, transparent 60%), radial-gradient(60% 60% at 80% 10%, #0E7490 0%, transparent 60%), #05070A',
    linux: 'radial-gradient(90% 90% at 10% 100%, #9A3412 0%, transparent 60%), radial-gradient(80% 80% at 100% 0%, #115E59 0%, transparent 60%), #0B0B0B',
    chromeos: 'radial-gradient(90% 90% at 80% 100%, #3F6212 0%, transparent 60%), radial-gradient(80% 80% at 0% 0%, #0C4A6E 0%, transparent 60%), #0A0A0A',
  },
  light: {
    mac: 'radial-gradient(120% 90% at 20% 10%, #FDE68A 0%, transparent 55%), radial-gradient(90% 80% at 90% 90%, #99F6E4 0%, transparent 60%), #F5F2EA',
    win: 'radial-gradient(70% 90% at 50% 120%, #7DD3FC 0%, transparent 60%), radial-gradient(60% 60% at 80% 10%, #A5F3FC 0%, transparent 60%), #EEF6FA',
    linux: 'radial-gradient(90% 90% at 10% 100%, #FDBA74 0%, transparent 60%), radial-gradient(80% 80% at 100% 0%, #99F6E4 0%, transparent 60%), #F6F1EA',
    chromeos: 'radial-gradient(90% 90% at 80% 100%, #D9F99D 0%, transparent 60%), radial-gradient(80% 80% at 0% 0%, #BAE6FD 0%, transparent 60%), #F3F5EE',
  },
}

/** The screen of one device, sized to its parent. */
export function OsScreen({ device, theme, app }: { device: DeviceId; theme: ScreenTheme; app: AppProps }) {
  const spec = DEVICES[device]
  return (
    <Scaled design={spec.design}>
      {(h) => <ScreenBody device={device} theme={theme} app={app} h={h} />}
    </Scaled>
  )
}

function ScreenBody({ device, theme, app, h }: { device: DeviceId; theme: ScreenTheme; app: AppProps; h: number }) {
  const dark = theme === 'dark'
  const ink = dark ? 'text-white' : 'text-[#16140F]'
  const glass = dark ? 'bg-black/45' : 'bg-white/60'
  const winShadow = '0 30px 80px -20px rgba(0,0,0,.55), 0 0 0 1px rgba(127,127,127,.25)'
  const shortWide = h < 660
  switch (device) {
    case 'mac':
      return (
        <div className="relative h-full w-full" style={{ background: WALL[theme].mac }}>
          <div className={`flex h-[30px] items-center gap-5 px-4 text-[14px] backdrop-blur ${glass} ${ink}`}>
            <Apple className="size-4" /><b>OpenFile</b>{['File', 'Edit', 'View', 'Window', 'Help'].map((x) => <span key={x} className="opacity-80">{x}</span>)}
            <span className="ml-auto flex items-center gap-4 opacity-90"><BatteryFull className="size-[18px]" /><Wifi className="size-4" /><Search className="size-4" /><span>Thu 9:41</span></span>
          </div>
          <div className="absolute inset-x-[36px] bottom-[86px] top-[52px] flex flex-col overflow-hidden rounded-[14px]" style={{ boxShadow: winShadow }}>
            <div className="flex h-[40px] shrink-0 items-center gap-2 border-b px-4" style={{ ...SCREEN_VARS[theme], background: 'var(--s-surface2)', borderColor: 'var(--s-border)' }}>
              <i className="size-[13px] rounded-full bg-[#FF5F57]" /><i className="size-[13px] rounded-full bg-[#FEBC2E]" /><i className="size-[13px] rounded-full bg-[#28C840]" />
              <span className="flex-1 text-center text-[14px] font-medium" style={{ color: 'var(--s-muted)' }}>OpenFile</span><span className="w-[55px]" />
            </div>
            <div className="min-h-0 flex-1"><MiniApp layout="wide" cols={2} theme={theme} hero={!shortWide} {...app} /></div>
          </div>
          <Dock theme={theme} />
        </div>
      )
    case 'win':
      return (
        <div className="relative h-full w-full" style={{ background: WALL[theme].win }}>
          <div className="absolute inset-x-[28px] bottom-[70px] top-[22px] flex flex-col overflow-hidden rounded-[10px]" style={{ boxShadow: winShadow }}>
            <div className="flex h-[38px] shrink-0 items-center gap-2.5 pl-3.5" style={{ ...SCREEN_VARS[theme], background: 'var(--s-surface2)', color: 'var(--s-fg)' }}>
              <Logo size={18} /><span className="text-[13px]">OpenFile</span>
              <span className="ml-auto flex h-full">{[Minus, Square, X].map((I, i) => <span key={i} className="grid h-full w-[46px] place-items-center opacity-80"><I className={i === 1 ? 'size-3' : 'size-4'} /></span>)}</span>
            </div>
            <div className="min-h-0 flex-1"><MiniApp layout="wide" cols={2} theme={theme} hero={!shortWide} {...app} /></div>
          </div>
          <div className={`absolute inset-x-0 bottom-0 flex h-[52px] items-center justify-center gap-2 backdrop-blur-xl ${dark ? 'bg-[#111418]/85' : 'bg-white/75'} ${ink}`}>
            <span className="grid size-10 place-items-center"><span className="grid grid-cols-2 gap-[2px]">{[0, 1, 2, 3].map((i) => <i key={i} className="size-[9px] rounded-[1px] bg-[#38BDF8]" />)}</span></span>
            <span className={`flex h-9 w-[200px] items-center gap-2 rounded-full px-3 text-[13px] ${dark ? 'bg-white/10' : 'bg-black/5'}`}><Search className="size-4 opacity-70" /><span className="opacity-70">Search</span></span>
            {['#F5A524', '#14B8A6', '#0EA5E9'].map((c) => <span key={c} className="grid size-10 place-items-center"><i className="size-6 rounded-md opacity-80" style={{ background: c }} /></span>)}
            <span className="relative grid size-10 place-items-center rounded-md bg-white/10"><Logo size={26} /><i className="absolute bottom-0.5 h-[3px] w-4 rounded-full bg-[#38BDF8]" /></span>
            <span className="absolute right-4 flex items-center gap-3 text-[12px]"><Wifi className="size-4" /><Volume2 className="size-4" /><span className="text-right leading-tight">9:41 AM<br />29-10-2026</span></span>
          </div>
        </div>
      )
    case 'linux':
    case 'chromeos': {
      const cros = device === 'chromeos'
      return (
        <div className="relative h-full w-full" style={{ background: WALL[theme][device] }}>
          {!cros && (
            <div className="flex h-[32px] items-center bg-black px-4 text-[14px] text-white">
              <span className="rounded-full bg-white/15 px-3 py-0.5">Activities</span>
              <span className="absolute left-1/2 -translate-x-1/2 font-semibold">Thu 29 Oct 9:41</span>
              <span className="ml-auto flex items-center gap-3 opacity-90"><Wifi className="size-4" /><Volume2 className="size-4" /><Power className="size-4" /></span>
            </div>
          )}
          <div className={`absolute inset-x-[34px] flex flex-col overflow-hidden ${cros ? 'bottom-[72px] top-[22px] rounded-[12px]' : 'bottom-[26px] top-[56px] rounded-[14px]'}`} style={{ boxShadow: winShadow }}>
            <div className="relative flex h-[42px] shrink-0 items-center justify-center px-3" style={{ ...SCREEN_VARS[theme], background: 'var(--s-surface2)', color: 'var(--s-fg)' }}>
              <span className="text-[14px] font-semibold">OpenFile</span>
              <span className="absolute right-3 flex items-center gap-2">{cros ? [Minus, Square, X].map((I, i) => <I key={i} className="size-4 opacity-70" />) : <span className="grid size-6 place-items-center rounded-full bg-[var(--s-border)]"><X className="size-3.5" /></span>}</span>
            </div>
            <div className="min-h-0 flex-1"><MiniApp layout="wide" cols={2} theme={theme} hero={!shortWide} {...app} /></div>
          </div>
          {cros && (
            <div className={`absolute inset-x-0 bottom-0 flex h-[52px] items-center justify-center gap-3 backdrop-blur ${dark ? 'bg-black/50' : 'bg-white/60'} ${ink}`}>
              <span className="absolute left-4 size-8 rounded-full border-2 border-current opacity-70" />
              {['#38BDF8', '#10B981', '#F97316'].map((c) => <i key={c} className="size-8 rounded-full opacity-80" style={{ background: c }} />)}
              <span className="relative"><Logo size={32} /><i className="absolute -bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-current" /></span>
              <span className="absolute right-4 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[13px]"><span>9:41</span><Wifi className="size-4" /><BatteryFull className="size-4" /></span>
            </div>
          )}
        </div>
      )
    }
    case 'browser':
      return (
        <div className="flex h-full w-full flex-col" style={{ ...SCREEN_VARS[theme], background: 'var(--s-surface2)' }}>
          <div className="flex h-[40px] items-end gap-2 px-3" style={{ color: 'var(--s-fg)' }}>
            <span className="mb-3 flex gap-1.5"><i className="size-3 rounded-full bg-[#FF5F57]" /><i className="size-3 rounded-full bg-[#FEBC2E]" /><i className="size-3 rounded-full bg-[#28C840]" /></span>
            <span className="ml-3 flex h-[32px] w-[220px] items-center gap-2 rounded-t-xl px-3 text-[13px]" style={{ background: 'var(--s-bg)' }}><Logo size={16} /> OpenFile <X className="ml-auto size-3.5 opacity-60" /></span>
          </div>
          <div className="flex h-[44px] items-center gap-3 px-4" style={{ background: 'var(--s-bg)', borderBottom: '1px solid var(--s-border)', color: 'var(--s-muted)' }}>
            <span className="flex h-[30px] flex-1 items-center gap-2 rounded-full px-4 text-[13px]" style={{ background: 'var(--s-surface2)' }}><Lock className="size-3.5" /> aniruddhaadak80.github.io/OpenFile</span>
          </div>
          <div className="min-h-0 flex-1"><MiniApp layout="wide" cols={2} theme={theme} hero={!shortWide} {...app} /></div>
        </div>
      )
    case 'ipad':
    case 'atab': {
      const apple = device === 'ipad'
      return (
        <div className="flex h-full w-full flex-col" style={{ ...SCREEN_VARS[theme], background: 'var(--s-bg)', color: 'var(--s-fg)' }}>
          <div className="flex h-[30px] shrink-0 items-center px-6 text-[14px] font-semibold">
            <span>{apple ? '9:41  Thu 29 Oct' : '9:41'}</span>
            <span className="ml-auto flex items-center gap-2">{!apple && <Signal className="size-4" />}<Wifi className="size-4" /><span className="text-[13px]">{apple ? '100%' : ''}</span><BatteryFull className="size-5" /></span>
          </div>
          <div className="min-h-0 flex-1"><MiniApp layout="wide" cols={2} theme={theme} hero={!shortWide} {...app} /></div>
          <div className="flex h-[22px] shrink-0 items-center justify-center"><i className={`h-[5px] rounded-full ${apple ? 'w-[180px]' : 'w-[120px]'}`} style={{ background: 'var(--s-fg)', opacity: 0.6 }} /></div>
        </div>
      )
    }
    case 'iphone':
    case 'aphone': {
      const apple = device === 'iphone'
      return (
        <div className="relative flex h-full w-full flex-col" style={{ ...SCREEN_VARS[theme], background: 'var(--s-bg)', color: 'var(--s-fg)' }}>
          <div className={`relative flex shrink-0 items-center px-8 font-semibold ${apple ? 'h-[56px] text-[17px]' : 'h-[40px] px-6 text-[14px]'}`}>
            <span>9:41</span>
            {apple ? <span className="absolute left-1/2 top-[11px] h-[36px] w-[124px] -translate-x-1/2 rounded-full bg-black" />
              : <span className="absolute left-1/2 top-[10px] size-[20px] -translate-x-1/2 rounded-full bg-black ring-2 ring-[#1f2329]" />}
            <span className="ml-auto flex items-center gap-1.5"><Signal className="size-4" /><Wifi className="size-4" /><BatteryFull className="size-5" /></span>
          </div>
          <div className="min-h-0 flex-1"><MiniApp layout="phone" theme={theme} {...app} /></div>
          <div className="absolute inset-x-0 bottom-2 flex justify-center"><i className={`h-[5px] rounded-full ${apple ? 'w-[134px]' : 'w-[110px]'}`} style={{ background: 'var(--s-fg)', opacity: 0.7 }} /></div>
        </div>
      )
    }
  }
}

function Dock({ theme }: { theme: ScreenTheme }) {
  const dark = theme === 'dark'
  return (
    <div className="absolute bottom-[12px] left-1/2 flex -translate-x-1/2 items-end gap-2.5 rounded-[20px] px-3 py-2.5 backdrop-blur-xl" style={{ background: dark ? 'rgba(30,30,30,.55)' : 'rgba(255,255,255,.55)', boxShadow: '0 0 0 1px rgba(127,127,127,.25)' }}>
      {['#38BDF8', '#14B8A6', '#F97316', '#84CC16', '#22D3EE'].map((c) => <i key={c} className="size-[48px] rounded-[12px] opacity-85" style={{ background: `linear-gradient(160deg, ${c}, color-mix(in oklab, ${c} 50%, #000))` }} />)}
      <span className="relative grid size-[48px] place-items-center rounded-[12px] bg-black"><Logo size={36} /><i className={`absolute -bottom-2 size-1 rounded-full ${dark ? 'bg-white' : 'bg-black'}`} /></span>
    </div>
  )
}

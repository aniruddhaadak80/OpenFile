// Small drawn screens for the install guide. Each shows one moment of an install and pulses where to click.
// Pure markup and Tailwind, no images, so they stay sharp at any size and theme.
import { motion } from 'framer-motion'
import { MousePointer2, Share, Plus, Download, ShieldAlert, Folder, Search, Terminal, MoreVertical, Check, Trash2, RefreshCw, Lock, Hand, ChevronRight } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { cn } from '@/components/ui'
import type { MockKind } from './data'

/** Pulsing ring + pointer over the thing to click. */
function Hot({ children, className, pointer = true, tap = false }: { children: React.ReactNode; className?: string; pointer?: boolean; tap?: boolean }) {
  return (
    <span className={cn('relative inline-flex', className)}>
      {children}
      <motion.span aria-hidden="true" className="pointer-events-none absolute -inset-1.5 rounded-[inherit] rounded-lg border-2 border-accent" initial={{ opacity: 0.9, scale: 0.9 }} animate={{ opacity: [0.9, 0, 0.9], scale: [0.92, 1.18, 0.92] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
      {pointer && (
        <motion.span aria-hidden="true" className="pointer-events-none absolute -bottom-5 -right-3 z-10 text-fg drop-shadow" initial={{ x: 22, y: 18, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}>
          {tap ? <Hand className="size-5 fill-surface" /> : <MousePointer2 className="size-5 fill-surface" />}
        </motion.span>
      )}
    </span>
  )
}

function Desk({ title, os = 'mac', children, className }: { title?: string; os?: 'mac' | 'win' | 'linux' | 'cros'; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-surface shadow-2xl', className)}>
      <div className="flex h-8 items-center gap-2 border-b border-border bg-surface-2 px-3">
        {os === 'mac' ? <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-[#ef4444]" /><i className="size-2.5 rounded-full bg-[#f5a524]" /><i className="size-2.5 rounded-full bg-[#10b981]" /></span> : null}
        <span className="flex-1 truncate text-center text-[11px] text-muted">{title}</span>
        {os !== 'mac' ? <span className="flex gap-3 text-[10px] text-muted"><span>_</span><span>[ ]</span><span>x</span></span> : null}
      </div>
      <div className="relative">{children}</div>
    </div>
  )
}

function Phone({ children, className, bar = true }: { children: React.ReactNode; className?: string; bar?: boolean }) {
  return (
    <div className={cn('mx-auto w-[210px] rounded-[2.2rem] border-[6px] border-[#1f2329] bg-black p-1.5 shadow-2xl', className)}>
      <div className="relative h-[380px] overflow-hidden rounded-[1.7rem] bg-bg">
        {bar && <div className="flex h-6 items-center justify-between px-5 text-[9px] font-semibold text-fg"><span>9:41</span><span className="h-4 w-16 rounded-full bg-black" /><span>100%</span></div>}
        {children}
      </div>
    </div>
  )
}

const AppIcon = ({ size = 44, label = true }: { size?: number; label?: boolean }) => (
  <span className="flex flex-col items-center gap-1"><span className="grid place-items-center rounded-[22%] bg-black ring-1 ring-accent/40" style={{ width: size, height: size }}><Logo size={size * 0.72} /></span>{label && <span className="text-[9px] text-fg">OpenFile</span>}</span>
)
const Dummy = ({ c }: { c: string }) => <span className="flex flex-col items-center gap-1"><span className="size-11 rounded-[22%]" style={{ background: c, opacity: 0.55 }} /><span className="h-1.5 w-8 rounded bg-border" /></span>
const Lines = ({ n = 3 }: { n?: number }) => <div className="space-y-1.5">{Array.from({ length: n }, (_, i) => <div key={i} className="h-2 rounded bg-surface-2" style={{ width: `${90 - i * 18}%` }} />)}</div>

function AddressBar({ hot }: { hot?: boolean }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <span className="flex h-7 flex-1 items-center gap-2 rounded-full bg-surface-2 px-3 text-[11px] text-muted"><Lock className="size-3" /> openfile app</span>
      {hot ? <Hot><span className="grid size-7 place-items-center rounded-full bg-accent/15 text-accent" title="Install"><Download className="size-3.5" /></span></Hot> : <span className="grid size-7 place-items-center rounded-full text-muted"><Download className="size-3.5" /></span>}
      <span className="grid size-7 place-items-center text-muted"><MoreVertical className="size-3.5" /></span>
    </div>
  )
}

function SitePreview() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2"><Logo size={18} /><span className="text-xs font-bold">OpenFile</span><span className="ml-auto rounded-md border border-accent/50 px-2 py-0.5 text-[10px] font-semibold text-accent">Install</span></div>
      <div className="mt-4 text-sm font-bold leading-tight">Every file tool.<br /><span className="text-gradient">One private tab.</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2">{['#F5A524', '#14B8A6', '#22D3EE', '#10B981', '#38BDF8', '#F97316'].map((c) => <div key={c} className="h-9 rounded-lg border border-border bg-surface-2"><span className="m-1.5 block size-3 rounded" style={{ background: c }} /></div>)}</div>
    </div>
  )
}

export function Mock({ kind }: { kind: MockKind }) {
  switch (kind) {
    case 'browser-bar':
      return <Desk title="OpenFile"><AddressBar hot /><SitePreview /></Desk>
    case 'browser-menu':
      return (
        <Desk title="OpenFile"><AddressBar /><SitePreview />
          <div className="absolute right-3 top-9 w-48 rounded-lg border border-border bg-surface p-1 text-[11px] shadow-2xl">
            {['New tab', 'History', 'Downloads'].map((x) => <div key={x} className="rounded px-2 py-1.5 text-muted">{x}</div>)}
            <div className="flex items-center justify-between rounded px-2 py-1.5 text-muted">Cast, save and share <ChevronRight className="size-3" /></div>
            <Hot className="w-full"><div className="flex w-full items-center gap-2 rounded bg-accent/15 px-2 py-1.5 font-semibold text-accent"><Download className="size-3" /> Install OpenFile</div></Hot>
          </div>
        </Desk>
      )
    case 'install-dialog':
      return (
        <Desk title="OpenFile"><AddressBar /><div className="opacity-40"><SitePreview /></div>
          <motion.div initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute right-3 top-10 w-56 rounded-xl border border-border bg-surface p-3 shadow-2xl">
            <div className="text-xs font-semibold">Install app?</div>
            <div className="mt-2 flex items-center gap-2"><AppIcon size={28} label={false} /><div className="text-[11px]"><div className="font-semibold">OpenFile</div><div className="text-muted">openfile app</div></div></div>
            <div className="mt-3 flex justify-end gap-2 text-[11px]"><span className="rounded-md px-2 py-1 text-muted">Cancel</span><Hot><span className="rounded-md bg-accent px-3 py-1 font-semibold text-on-accent">Install</span></Hot></div>
          </motion.div>
        </Desk>
      )
    case 'app-window':
      return <Desk title="OpenFile" os="win"><SitePreview /><div className="absolute bottom-2 right-3 flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-1 text-[10px]"><Check className="size-3 text-success" /> Offline ready</div></Desk>
    case 'update-bar':
      return (
        <Desk title="OpenFile"><div className="opacity-50"><SitePreview /></div>
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute inset-x-4 bottom-3 flex items-center gap-2 rounded-xl border border-accent/50 bg-surface p-2 text-[11px] shadow-2xl">
            <span className="grid size-7 place-items-center rounded-lg bg-gradient-brand"><RefreshCw className="size-3.5" /></span><span className="flex-1 font-semibold">New version ready, reload</span><Hot><span className="rounded-md bg-accent px-2.5 py-1 font-semibold text-on-accent">Reload</span></Hot>
          </motion.div>
        </Desk>
      )
    case 'release-page':
      return (
        <Desk title="Releases"><div className="space-y-2 p-4 text-[11px]"><div className="text-sm font-bold">OpenFile v1.1</div><span className="inline-block rounded-full border border-success/50 px-2 text-[10px] text-success">Latest</span>
          {['OpenFile-windows-x64-setup.exe', 'OpenFile-macos-universal.dmg', 'OpenFile-linux-x86_64.AppImage', 'OpenFile-android.apk'].map((f, i) => i === 0 ? <Hot key={f} className="w-full"><div className="flex w-full items-center gap-2 rounded-md bg-accent/10 px-2 py-1.5 text-accent"><Download className="size-3" />{f}</div></Hot> : <div key={f} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted"><Download className="size-3" />{f}</div>)}
        </div></Desk>
      )
    case 'phone-share':
      return (
        <Phone><div className="px-3"><SitePreview /></div>
          <div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-around border-t border-border bg-surface text-muted"><span>{'<'}</span><span>{'>'}</span><Hot tap><span className="grid size-8 place-items-center rounded-lg text-sky"><Share className="size-4" /></span></Hot><span className="text-xs">[ ]</span></div>
        </Phone>
      )
    case 'phone-sheet':
      return (
        <Phone><div className="px-3 opacity-40"><SitePreview /></div>
          <motion.div initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }} className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-surface p-3 text-[11px]">
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-border" />
            {['Copy', 'Add to Reading List', 'Add Bookmark'].map((x) => <div key={x} className="border-b border-border py-2 text-muted">{x}</div>)}
            <Hot tap className="w-full"><div className="flex w-full items-center justify-between rounded-md bg-accent/10 px-2 py-2 font-semibold text-accent">Add to Home Screen <Plus className="size-3.5" /></div></Hot>
            <div className="py-2 text-muted">Find on Page</div>
          </motion.div>
        </Phone>
      )
    case 'phone-add':
      return (
        <Phone><div className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px]"><span className="text-sky">Cancel</span><span className="font-semibold">Add to Home Screen</span><Hot tap><span className="font-semibold text-sky">Add</span></Hot></div>
          <div className="flex items-center gap-3 p-4"><AppIcon size={48} label={false} /><div className="flex-1 text-[11px]"><div className="border-b border-border pb-1 font-semibold">OpenFile</div><div className="mt-1 text-muted">openfile app</div></div></div>
          <div className="mx-4 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-[11px]">Open as Web App <span className="h-4 w-7 rounded-full bg-success" /></div>
        </Phone>
      )
    case 'phone-home':
    case 'android-home':
      return (
        <Phone><div className="grid grid-cols-4 gap-x-2 gap-y-4 p-4">{['#14B8A6', '#38BDF8', '#F97316', '#84CC16', '#22D3EE', '#10B981'].map((c) => <Dummy key={c} c={c} />)}<Hot tap pointer><AppIcon /></Hot><Dummy c="#F5A524" /></div>
          {kind === 'phone-home' ? <div className="absolute inset-x-6 bottom-24 rounded-xl border border-border bg-surface p-2 text-[11px] shadow-2xl"><div className="py-1 text-muted">Share App</div><div className="flex items-center gap-1.5 py-1 text-danger"><Trash2 className="size-3" /> Remove App</div></div>
            : <div className="absolute inset-x-6 bottom-24 rounded-xl border border-border bg-surface p-2 text-[11px] shadow-2xl"><div className="py-1 text-muted">App info</div><div className="flex items-center gap-1.5 py-1 text-danger"><Trash2 className="size-3" /> Uninstall</div></div>}
        </Phone>
      )
    case 'android-menu':
      return (
        <Phone><div className="flex items-center gap-2 border-b border-border px-2 py-1.5"><span className="h-6 flex-1 rounded-full bg-surface-2" /><Hot tap pointer={false}><MoreVertical className="size-4 text-fg" /></Hot></div><div className="px-3 opacity-50"><SitePreview /></div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute right-2 top-14 w-40 rounded-lg border border-border bg-surface p-1 text-[11px] shadow-2xl">
            {['New tab', 'Bookmarks', 'Downloads', 'Share'].map((x) => <div key={x} className="px-2 py-1.5 text-muted">{x}</div>)}
            <Hot tap className="w-full"><div className="flex w-full items-center gap-2 rounded bg-accent/15 px-2 py-1.5 font-semibold text-accent"><Download className="size-3" /> Install app</div></Hot>
          </motion.div>
        </Phone>
      )
    case 'android-install':
      return (
        <Phone><div className="px-3 opacity-30"><SitePreview /></div>
          <div className="absolute inset-x-3 top-28 rounded-2xl border border-border bg-surface p-4 text-center text-[11px] shadow-2xl"><AppIcon size={40} label={false} /><div className="mt-2 font-semibold">Do you want to install this app?</div><div className="mt-1 text-muted">OpenFile</div><div className="mt-3 flex justify-end gap-3"><span className="text-muted">Cancel</span><Hot tap><span className="font-semibold text-success">Install</span></Hot></div></div>
        </Phone>
      )
    case 'android-unknown':
      return (
        <Phone><div className="p-4 text-[11px]"><div className="text-sm font-semibold">Install unknown apps</div><div className="mt-3 flex items-center gap-2"><span className="size-8 rounded-lg bg-sky/40" /><span>Chrome</span></div>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">Allow from this source <Hot tap><span className="flex h-4 w-8 items-center justify-end rounded-full bg-success px-0.5"><i className="size-3 rounded-full bg-white" /></span></Hot></div>
          <div className="mt-3 text-muted">Your phone and personal data are more vulnerable to attack by unknown apps.</div></div>
        </Phone>
      )
    case 'win-download':
      return (
        <Desk title="Downloads" os="win"><div className="p-4"><Lines /><div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2 text-[11px]"><span className="grid size-8 place-items-center rounded bg-sky/20 text-sky"><Download className="size-4" /></span><div className="flex-1"><div className="font-semibold">OpenFile-windows-x64-setup.exe</div><div className="text-muted">Done</div></div><Hot><span className="rounded-md bg-accent px-2.5 py-1 font-semibold text-on-accent">Open file</span></Hot></div></div></Desk>
      )
    case 'win-smartscreen':
      return (
        <div className="overflow-hidden rounded-xl border border-border bg-[#0b3a5b] p-5 text-[11px] text-white shadow-2xl">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="size-5" /> Windows protected your PC</div>
          <p className="mt-2 text-white/80">Microsoft Defender SmartScreen prevented an unrecognised app from starting.</p>
          <Hot className="mt-2"><span className="underline">More info</span></Hot>
          <p className="mt-3 text-white/70">App: OpenFile-windows-x64-setup.exe<br />Publisher: Unknown publisher</p>
          <div className="mt-4 flex justify-end gap-2"><Hot pointer={false}><span className="rounded border border-white/60 px-3 py-1">Run anyway</span></Hot><span className="rounded bg-white/15 px-3 py-1">Don't run</span></div>
        </div>
      )
    case 'win-installer':
      return (
        <Desk title="OpenFile Setup" os="win"><div className="flex gap-4 p-4"><AppIcon size={40} label={false} /><div className="flex-1 text-[11px]"><div className="text-sm font-semibold">Install OpenFile</div><div className="mt-1 text-muted">Choose where to install, then click Install.</div><div className="mt-3 h-6 rounded border border-border bg-surface-2 px-2 py-1 text-muted">C:\Users\you\AppData\Local\OpenFile</div><div className="mt-4 flex justify-end gap-2"><span className="rounded border border-border px-3 py-1">Back</span><Hot><span className="rounded bg-accent px-3 py-1 font-semibold text-on-accent">Install</span></Hot></div></div></div></Desk>
      )
    case 'win-start':
      return (
        <div className="overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-2xl">
          <div className="flex h-8 items-center gap-2 rounded-full bg-surface-2 px-3 text-[11px] text-muted"><Search className="size-3" /> openfile</div>
          <div className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">Best match</div>
          <Hot className="mt-2 w-full"><div className="flex w-full items-center gap-3 rounded-lg bg-accent/10 p-2"><AppIcon size={32} label={false} /><div className="text-[11px]"><div className="font-semibold">OpenFile</div><div className="text-muted">App</div></div></div></Hot>
          <div className="mt-4 flex justify-center gap-2">{['#38BDF8', '#14B8A6', '#F5A524', '#84CC16'].map((c) => <span key={c} className="size-7 rounded-md" style={{ background: c, opacity: 0.5 }} />)}</div>
        </div>
      )
    case 'win-settings':
      return (
        <Desk title="Settings" os="win"><div className="flex text-[11px]"><div className="w-24 space-y-2 border-r border-border p-3 text-muted"><div>System</div><div className="font-semibold text-fg">Apps</div><div>Accounts</div></div>
          <div className="flex-1 p-3"><div className="text-sm font-semibold">Installed apps</div><div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-2 p-2"><AppIcon size={24} label={false} /><span className="flex-1">OpenFile</span><MoreVertical className="size-3" /></div>
            <div className="ml-auto mt-1 w-28 rounded-lg border border-border bg-surface p-1 shadow-xl"><div className="px-2 py-1 text-muted">Modify</div><Hot className="w-full"><div className="w-full rounded bg-accent/15 px-2 py-1 font-semibold text-accent">Uninstall</div></Hot></div></div></div></Desk>
      )
    case 'mac-dmg':
      return (
        <Desk title="OpenFile"><div className="relative flex h-40 items-center justify-around px-6">
          <AppIcon size={52} />
          <motion.span aria-hidden="true" className="absolute left-[34%] top-[38%] text-accent" animate={{ x: [0, 70, 70, 0], opacity: [0, 1, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}><MousePointer2 className="size-5 fill-surface" /></motion.span>
          <span className="text-2xl text-muted">{'>'}</span>
          <Hot pointer={false}><span className="flex flex-col items-center gap-1"><span className="grid size-[52px] place-items-center rounded-xl bg-sky/20 text-sky"><Folder className="size-7" /></span><span className="text-[9px]">Applications</span></span></Hot>
        </div></Desk>
      )
    case 'mac-gatekeeper':
      return (
        <Desk title="Applications"><div className="flex gap-6 p-5"><div className="relative"><AppIcon size={48} />
          <div className="absolute left-12 top-6 z-10 w-36 rounded-lg border border-border bg-surface p-1 text-[11px] shadow-2xl"><Hot className="w-full"><div className="w-full rounded bg-accent/15 px-2 py-1 font-semibold text-accent">Open</div></Hot><div className="px-2 py-1 text-muted">Show Package Contents</div><div className="px-2 py-1 text-muted">Move to Bin</div><div className="px-2 py-1 text-muted">Get Info</div></div></div>
          <div className="ml-auto mt-24 text-[10px] text-muted">Right-click or Control-click</div></div></Desk>
      )
    case 'mac-settings':
      return (
        <Desk title="Privacy and Security"><div className="p-4 text-[11px]"><div className="text-sm font-semibold">Security</div><div className="mt-2 text-muted">Allow applications from App Store and identified developers</div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface-2 p-2"><span className="flex-1">OpenFile was blocked to protect your Mac.</span><Hot><span className="rounded-md border border-border bg-surface px-2 py-1 font-semibold">Open Anyway</span></Hot></div></div></Desk>
      )
    case 'mac-launchpad':
      return <div className="rounded-xl border border-border bg-surface p-5 shadow-2xl"><div className="grid grid-cols-4 gap-4">{['#14B8A6', '#38BDF8', '#F97316', '#84CC16', '#22D3EE', '#10B981', '#F5A524'].map((c) => <Dummy key={c} c={c} />)}<Hot><AppIcon /></Hot></div><div className="mx-auto mt-5 flex w-max gap-2 rounded-2xl border border-border bg-surface-2 p-2">{['#38BDF8', '#14B8A6', '#F97316'].map((c) => <span key={c} className="size-7 rounded-lg" style={{ background: c, opacity: 0.5 }} />)}<AppIcon size={28} label={false} /></div></div>
    case 'mac-trash':
      return (
        <Desk title="Applications"><div className="relative flex h-36 items-center justify-around"><AppIcon size={48} />
          <motion.span aria-hidden="true" className="absolute left-[30%] top-[40%] text-accent" animate={{ x: [0, 90, 90, 0], opacity: [0, 1, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity }}><MousePointer2 className="size-5 fill-surface" /></motion.span>
          <Hot pointer={false}><span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-muted"><Trash2 className="size-6" /></span></Hot></div></Desk>
      )
    case 'linux-terminal':
      return (
        <Desk title="Terminal" os="linux"><div className="bg-black p-4 font-mono text-[11px] leading-relaxed text-[#e5e7eb]">
          <div><span className="text-emerald">you@linux</span>:<span className="text-sky">~/Downloads</span>$ chmod +x OpenFile-linux-x86_64.AppImage</div>
          <div><span className="text-emerald">you@linux</span>:<span className="text-sky">~/Downloads</span>$ ./OpenFile-linux-x86_64.AppImage</div>
          <div className="text-muted">Starting OpenFile</div>
          <div className="flex items-center"><span className="text-emerald">you@linux</span>:<span className="text-sky">~/Downloads</span>$ <motion.span className="ml-1 inline-block h-3.5 w-2 bg-accent" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} /></div>
          <Terminal className="absolute right-3 top-3 size-4 text-muted" />
        </div></Desk>
      )
    case 'linux-launcher':
      return <div className="rounded-xl border border-border bg-surface p-5 shadow-2xl"><div className="flex h-8 items-center gap-2 rounded-full bg-surface-2 px-3 text-[11px] text-muted"><Search className="size-3" /> open</div><div className="mt-4 grid grid-cols-4 gap-4"><Hot><AppIcon /></Hot>{['#F97316', '#84CC16', '#38BDF8'].map((c) => <Dummy key={c} c={c} />)}</div></div>
    case 'chromeos-shelf':
      return <div className="rounded-xl border border-border bg-surface p-4 shadow-2xl"><div className="h-28 rounded-lg bg-surface-2" /><div className="mx-auto mt-3 flex w-max items-center gap-3 rounded-full border border-border bg-surface-2 px-3 py-1.5">{['#38BDF8', '#10B981', '#F97316'].map((c) => <span key={c} className="size-6 rounded-full" style={{ background: c, opacity: 0.6 }} />)}<Hot><AppIcon size={26} label={false} /></Hot></div></div>
    case 'chromeos-uninstall':
      return <div className="rounded-xl border border-border bg-surface p-4 shadow-2xl"><div className="grid grid-cols-4 gap-4">{['#38BDF8', '#10B981', '#F97316'].map((c) => <Dummy key={c} c={c} />)}<div className="relative"><AppIcon /><div className="absolute left-8 top-10 z-10 w-32 rounded-lg border border-border bg-surface p-1 text-[11px] shadow-2xl"><div className="px-2 py-1 text-muted">Pin to shelf</div><Hot className="w-full"><div className="w-full rounded bg-accent/15 px-2 py-1 font-semibold text-accent">Uninstall</div></Hot></div></div></div></div>
    default:
      return null
  }
}

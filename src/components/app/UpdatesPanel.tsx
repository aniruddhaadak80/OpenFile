// Settings, Updates: current version, last check, channel, how often to check, auto install, Wi-Fi only,
// hybrid web mode, skipped versions, rollback and What's new. Adapts to desktop, Android, iOS and the web app.
import { useEffect, useState } from 'react'
import { ArrowDownToLine, BellOff, Globe, History, Loader2, RefreshCw, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { Button, Segmented, Switch, cn } from '@/components/ui'
import { relTime, savePrefs, setState, useUpdates, type Channel, type Frequency, type WebMode } from '@/lib/app/updateCore'
import { checkNow, rollback, setWebMode, startUpdates, unskip, backToBundled, loadHosted } from '@/lib/app/updateManager'
import { applyUpdate, usePwa } from '@/lib/app/pwa'

const PLATFORM: Record<string, string> = { desktop: 'Desktop app', android: 'Android app', ios: 'iOS app', web: 'Web app' }

export function UpdatesPanel({ Row }: { Row: (p: { title: string; sub?: string; children: React.ReactNode }) => React.ReactElement }) {
  const s = useUpdates()
  const pwa = usePwa()
  const [, tick] = useState(0)
  useEffect(() => { void startUpdates() }, [])
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30e3); return () => clearInterval(t) }, [])
  const p = s.prefs
  const native = s.platform !== 'web'
  const appUpdates = s.platform === 'desktop' || s.platform === 'android'
  const busy = s.phase === 'checking'
  const last = s.platform === 'web' ? Math.max(p.lastChecked, pwa.checkedAt) : p.lastChecked

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="max-w-md">
          <div className="flex items-center gap-2 font-medium">Current version
            <span className="rounded-md bg-amber-400/15 px-2 py-0.5 font-mono text-xs text-amber-300">{s.current ? `v${s.current}` : 'unknown'}</span>
            {s.hosted && <span className="rounded-md bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-300">latest web version</span>}
          </div>
          <p className="text-sm text-muted">{PLATFORM[s.platform]}{s.build ? ` · build ${s.build}` : ''} · last checked {relTime(last).toLowerCase()}</p>
          {s.message && <p className="mt-1 text-sm text-emerald-400">{s.message}</p>}
          {s.error && s.error !== 'metered' && <p className="mt-1 text-sm text-orange-400">{s.error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={busy} icon={<RefreshCw className="size-4" />} onClick={() => void checkNow(true)}>Check now</Button>
          {s.offer && appUpdates && <Button icon={<ArrowDownToLine className="size-4" />} onClick={() => setState({ sheet: 'release' })}>Install v{s.offer.version}</Button>}
          {s.platform === 'web' && pwa.waiting && <Button icon={<RefreshCw className="size-4" />} onClick={applyUpdate}>Reload to update</Button>}
          <Button variant="ghost" icon={<Sparkles className="size-4" />} onClick={() => setState({ sheet: 'whatsnew' })}>What's new</Button>
        </div>
      </div>

      {appUpdates && (
        <>
          <Row title="Update channel" sub={p.channel === 'beta' ? 'Beta gets prereleases first (for example 1.3.0-beta.1). They are tested less.' : 'Stable gets tested releases only.'}>
            <Segmented value={p.channel} onChange={(v: Channel) => void savePrefs({ channel: v })} options={[{ value: 'stable', label: 'Stable' }, { value: 'beta', label: 'Beta' }]} />
          </Row>
          <Row title="Check for updates" sub={p.frequency === 'off' ? 'Only when you press Check now.' : p.frequency === 'launch' ? 'Every time OpenFile starts, and every 6 hours while it is open.' : p.frequency === 'daily' ? 'Once a day.' : 'Once a week.'}>
            <Segmented value={p.frequency} onChange={(v: Frequency) => void savePrefs({ frequency: v })} options={[{ value: 'launch', label: 'On launch' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'off', label: 'Off' }]} />
          </Row>
          <Row title={s.platform === 'android' ? 'Download updates automatically' : 'Auto install updates'} sub={s.platform === 'android' ? 'Downloads in the background. Android always asks before installing.' : p.autoInstall ? 'Downloads in the background and installs when you quit OpenFile.' : 'Off: OpenFile asks before downloading and installing.'}>
            <Switch checked={p.autoInstall} onChange={(v) => void savePrefs({ autoInstall: v })} />
          </Row>
          {s.platform === 'android' && (
            <Row title="Only on Wi-Fi" sub="Download updates only on Wi-Fi or another unmetered connection. You can still choose to download on mobile data.">
              <Switch checked={p.wifiOnly} onChange={(v) => void savePrefs({ wifiOnly: v })} />
            </Row>
          )}
          {(p.skipVersion || (p.snoozeVersion && p.snoozeUntil > Date.now())) && (
            <Row title="Skipped or snoozed" sub={[p.skipVersion && `Skipped v${p.skipVersion}.`, p.snoozeVersion && p.snoozeUntil > Date.now() && `v${p.snoozeVersion} snoozed until ${new Date(p.snoozeUntil).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`].filter(Boolean).join(' ')}>
              <Button variant="outline" icon={<BellOff className="size-4" />} onClick={() => void unskip()}>Show it again</Button>
            </Row>
          )}
          {s.platform === 'desktop' && s.rollback && (
            <Row title="Roll back" sub={`Reinstall v${s.rollback}, the version you had before the last update. It comes from its own signed release.`}>
              <Button variant="outline" loading={s.phase === 'installing'} icon={<RotateCcw className="size-4" />} onClick={() => void rollback()}>Roll back to v{s.rollback}</Button>
            </Row>
          )}
          <div className="flex items-start gap-2 py-3 text-xs text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            {s.platform === 'desktop' ? 'Every update is signed. OpenFile checks the signature against its built-in key before installing and refuses anything else.' : 'Every APK is checked to be OpenFile, newer than this one and signed with the same key before the Android installer opens.'}
          </div>
        </>
      )}

      {native && (
        <Row title="Use latest web version" sub={s.hosted ? 'You are using the hosted web version inside the app. The built-in copy is the offline fallback.' : 'New tools ship to the website between app releases. Ask offers them when they appear, Always loads them on start when online, Never keeps the built-in copy.'}>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={p.webMode} onChange={(v: WebMode) => void setWebMode(v)} options={[{ value: 'ask', label: 'Ask' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }]} />
            {s.hosted ? <Button size="sm" variant="ghost" icon={<History className="size-3.5" />} onClick={backToBundled}>Use built-in copy</Button>
              : s.web ? <Button size="sm" variant="outline" icon={<Globe className="size-3.5" />} onClick={() => loadHosted()}>Load {s.web.remoteTools} tools</Button> : null}
          </div>
        </Row>
      )}

      {s.platform === 'web' && (
        <Row title="Automatic updates" sub={pwa.supported ? 'The web app checks every 30 minutes and whenever you come back to it, downloads in the background and asks before reloading. On iPhone and iPad this works from the home screen too.' : 'This browser has no service worker, so each visit loads the newest version.'}>
          <span className={cn('rounded-full px-3 py-1 text-xs font-medium', pwa.waiting ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/10 text-emerald-400')}>{pwa.waiting ? 'Update waiting' : pwa.ready ? 'On' : 'Starting'}</span>
        </Row>
      )}
      {s.platform === 'ios' && (
        <Row title="App Store updates" sub="The iOS app is not on the App Store yet, so it cannot update itself. The home screen web app updates automatically.">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <span />}
        </Row>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Settings as SettingsIcon, Sun, Sparkles, Image as ImageIcon, FileSignature, ShieldCheck, Database, Download, Upload, RotateCcw, Trash2, HardDrive, History as HistoryIcon, Star, Check, WifiOff } from 'lucide-react'
import { TOOLS } from '@/tools/registry'
import { Button, Input, Segmented, Slider, Switch, cn } from '@/components/ui'
import { toast } from '@/components/toast'
import { downloadBlob, formatBytes } from '@/lib/files'
import { applyNaming, DEFAULT_PREFS, FONTS, type FontPref } from '@/lib/prefs'
import { AccentSwatches, ThemeModes } from '@/components/ThemeSwitcher'
import { useSettings, useFavorites, useRecent, useHistory, exportData, importData, clearFavorites, clearRecents, clearHistory, restoreFavorites, restoreRecents, restoreHistory } from '@/lib/store'
import { overlayBus, setFlag, useInstall, useOnline } from '@/lib/ux'
import { Keyboard, Compass, Smartphone } from 'lucide-react'
import { setPageMeta } from '@/lib/seo'
import { RefreshCw } from 'lucide-react'
import { UpdatesPanel } from '@/components/app/UpdatesPanel'

const SECTIONS = [['appearance', 'Appearance'], ['output', 'Files & output'], ['app', 'App & shortcuts'], ['updates', 'Updates'], ['privacy', 'Privacy & data'], ['backup', 'Backup']] as const
const TOKENS: [string, string][] = [['{name}', 'original name'], ['{tool}', 'tool slug'], ['{date}', 'YYYY-MM-DD'], ['{time}', 'HHMMSS']]
const PRESETS = ['{name}', '{name}-openfile', '{date}-{name}', '{name}-{tool}', '{name}-{date}-{time}']

export default function Settings() {
  useEffect(() => { setPageMeta('Settings | OpenFile', 'Theme, accent, motion, default image quality, download names and backup of your OpenFile settings.') }, [])
  const { prefs, update, reset } = useSettings()
  const { fav, rows: favRows } = useFavorites()
  const { recent, rows: recentRows } = useRecent()
  const install = useInstall()
  const online = useOnline()
  const history = useHistory()
  const [naming, setNaming] = useState(prefs.outputNaming)
  const [withHistory, setWithHistory] = useState(false)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [cacheSize, setCacheSize] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => setNaming(prefs.outputNaming), [prefs.outputNaming])
  useEffect(() => { const id = location.hash.slice(1); if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150) }, [])

  const refreshStorage = async () => {
    try { const e = await navigator.storage?.estimate?.(); if (e) setStorage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }) } catch { /* ignore */ }
    try { const keys = await caches.keys(); setCacheSize(keys.length) } catch { setCacheSize(null) }
  }
  useEffect(() => { void refreshStorage() }, [])

  const saveNaming = (v: string) => { const val = v.trim() || '{name}'; void update({ outputNaming: val }); setNaming(val); toast('Download naming saved') }
  const doExport = async () => {
    const data = await exportData(withHistory)
    downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `openfile-settings-${new Date().toISOString().slice(0, 10)}.json`)
    toast('Settings exported')
  }
  const doImport = async (f: File) => {
    try {
      const json = JSON.parse(await f.text())
      const r = await importData(json, new Set(TOOLS.map((t) => t.slug)))
      toast(`Imported settings · ${r.favorites} favorites · ${r.recents} recents${r.history ? ` · ${r.history} history entries` : ''}${r.recipes ? ` · ${r.recipes} recipes` : ''}`)
    } catch (e: any) { toast(e?.message?.includes('JSON') ? 'That file is not valid JSON.' : e?.message || 'Import failed', 'error') }
  }
  const clearCaches = async () => {
    try { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); toast('Offline cache cleared. Engines will download again when needed.'); void refreshStorage() } catch { toast('Could not clear the cache in this browser', 'error') }
  }

  const sample = applyNaming('invoice.pdf', 'merge-pdf', naming || '{name}')
  const pct = storage && storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 opacity-60" style={{ background: 'radial-gradient(600px 220px at 20% 0%, color-mix(in oklab, var(--accent-2) 16%, transparent), transparent)' }} />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-24 space-y-1 text-sm">
            {SECTIONS.map(([id, l]) => <a key={id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="block rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg">{l}</a>)}
            <Link to="/history" className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-fg"><HistoryIcon className="size-4" /> History</Link>
            <Link to="/docs/local-data" className="block rounded-lg px-3 py-2 text-xs text-muted hover:text-fg">How local data works</Link>
          </nav>
        </aside>

        <div className="min-w-0">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid size-14 place-items-center rounded-2xl bg-gradient-brand text-on-accent shadow-lg shadow-accent/25"><SettingsIcon className="size-7" /></motion.div>
          <h1 className="mt-4 font-display text-4xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1.5 max-w-xl text-muted">Preferences are saved instantly in this browser’s local database. Nothing is synced or uploaded.</p>

          <div className="mt-10 space-y-6">
            <Section id="appearance" icon={Sun} title="Appearance" sub="How OpenFile looks and moves. Changes apply instantly.">
              <div className="py-4">
                <div className="mb-3"><div className="font-medium">Theme</div><p className="text-sm text-muted">Black is true black for OLED screens. Sun is a warm light theme. System follows your operating system.</p></div>
                <div className="max-w-md"><ThemeModes value={prefs.theme} onChange={(v) => void update({ theme: v })} /></div>
              </div>
              <Row title="Accent color" sub="Used for buttons, links, focus rings and highlights.">
                <AccentSwatches value={prefs.accent} onChange={(a) => void update({ accent: a })} />
              </Row>
              <Row title="Density" sub="Compact fits more on screen by tightening spacing.">
                <Segmented value={prefs.density} onChange={(v) => void update({ density: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
              </Row>
              <Row title="Corners" sub="Rounded or sharp corners on cards, buttons and inputs.">
                <Segmented value={prefs.radius} onChange={(v) => void update({ radius: v })} options={[{ value: 'rounded', label: 'Rounded' }, { value: 'sharp', label: 'Sharp' }]} />
              </Row>
              <Row title="Font" sub="Interface font. Code always uses a monospace font.">
                <Segmented value={prefs.font} onChange={(v) => void update({ font: v })} options={(Object.keys(FONTS) as FontPref[]).map((k) => ({ value: k, label: <span style={{ fontFamily: FONTS[k].stack }}>{FONTS[k].name}</span> }))} />
              </Row>
              <Row title="Motion" sub="Reduced turns off animations and transitions everywhere.">
                <Segmented value={prefs.reducedMotion} onChange={(v) => void update({ reducedMotion: v })} options={[{ value: 'system', label: 'System' }, { value: 'reduce', label: 'Reduced' }, { value: 'full', label: <span className="flex items-center gap-1.5"><Sparkles className="size-3.5" />Full</span> }]} />
              </Row>
            </Section>

            <Section id="output" icon={ImageIcon} title="Files & output" sub="Defaults applied to what you export.">
              <div className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-md"><div className="font-medium">Default image quality</div><p className="text-sm text-muted">Used when a tool exports JPG, WebP or AVIF without choosing its own quality, and as the starting quality for new image steps in the Workspace.</p></div>
                  <div className="font-display text-3xl font-bold tabular-nums">{prefs.imageQuality}<span className="text-base text-muted">%</span></div>
                </div>
                <Slider className="mt-3" ariaLabel="Default image quality" value={prefs.imageQuality} min={10} max={100} onChange={(v) => void update({ imageQuality: v })} />
                <div className="mt-2 flex justify-between gap-3 text-[11px] text-muted"><span className="shrink-0">Smaller files</span><span className="min-w-0 text-center">{prefs.imageQuality >= 90 ? 'Near-lossless' : prefs.imageQuality >= 75 ? 'Visually lossless for most photos' : prefs.imageQuality >= 50 ? 'Good for web' : 'Very compressed'}</span><span>Best quality</span></div>
              </div>
              <div className="border-t border-border py-4">
                <div className="flex items-center gap-2 font-medium"><FileSignature className="size-4 text-accent" /> Download file names</div>
                <p className="text-sm text-muted">A pattern applied to every download. The file extension is always kept.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveNaming(naming) }} onBlur={() => naming !== prefs.outputNaming && saveNaming(naming)} className="font-mono" aria-label="Download file name pattern" />
                  <Button variant="outline" onClick={() => saveNaming(naming)} icon={<Check className="size-4" />}>Save</Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {TOKENS.map(([t, d]) => <button key={t} onClick={() => setNaming((n) => (n.includes(t) ? n : `${n}${n ? '-' : ''}${t}`))} title={d} className="rounded-md border border-border bg-surface-2/60 px-2 py-0.5 font-mono text-[11px] text-muted hover:border-accent hover:text-fg cursor-pointer">{t}</button>)}
                  <span className="mx-1 text-border">|</span>
                  {PRESETS.map((p) => <button key={p} onClick={() => saveNaming(p)} className={cn('rounded-md px-2 py-0.5 font-mono text-[11px] cursor-pointer', prefs.outputNaming === p ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg')}>{p}</button>)}
                </div>
                <div className="mt-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2 font-mono text-xs"><span className="text-muted">invoice.pdf to </span><span className="text-success">{sample}</span></div>
              </div>
            </Section>

            <Section id="app" icon={Smartphone} title="App & shortcuts" sub="Install OpenFile, replay the tour and learn the keys.">
              <Row title="Install as an app" sub={install.installed ? 'OpenFile is installed on this device.' : install.canPrompt ? 'Opens in its own window, works offline and accepts files shared from other apps.' : install.iosHint ? 'On iPhone or iPad: tap Share, then Add to Home Screen.' : 'Use your browser menu to install. The option appears after a short visit in supported browsers.'}>
                <Button variant="outline" disabled={!install.canPrompt || install.installed} icon={<Download className="size-4" />} onClick={async () => { const r = await install.prompt(); if (r === 'accepted') toast('Installed') }}>{install.installed ? 'Installed' : 'Install'}</Button>
              </Row>
              <Row title="Keyboard shortcuts" sub="Press ? anywhere to see them. G then a letter jumps between pages.">
                <Button variant="outline" icon={<Keyboard className="size-4" />} onClick={() => overlayBus.emit('shortcuts')}>Show shortcuts</Button>
              </Row>
              <Row title="Quick tour" sub="A short walk through search, Drop anything, categories and themes.">
                <Link to="/" onClick={() => { setFlag('tour-done', false); setTimeout(() => overlayBus.emit('tour'), 600) }}><Button variant="outline" icon={<Compass className="size-4" />}>Replay tour</Button></Link>
              </Row>
              <Row title="Connection" sub={online ? 'Online. Tools download their engines the first time you use them.' : 'Offline. Tools you used before keep working from the cache.'}>
                <span className={cn('rounded-full px-3 py-1 text-xs font-medium', online ? 'bg-success/10 text-success' : 'bg-warn/10 text-warn')}>{online ? 'Online' : 'Offline'}</span>
              </Row>
            </Section>

            <Section id="updates" icon={RefreshCw} title="Updates" sub="Version, update checks and release notes. Safe by default: OpenFile asks before installing.">
              <UpdatesPanel Row={Row} />
            </Section>

            <Section id="privacy" icon={ShieldCheck} title="Privacy & data" sub="Everything below lives only on this device.">
              <Row title="Record activity" sub="Log opened tools and downloads on the History page.">
                <Switch checked={prefs.historyEnabled} onChange={(v) => { void update({ historyEnabled: v }); toast(v ? 'Activity recording on' : 'Activity recording paused') }} />
              </Row>
              <div className="grid gap-3 border-t border-border py-4 sm:grid-cols-3">
                <DataTile icon={Star} label="Favorites" value={fav.length} onClear={() => { const keep = favRows; void clearFavorites(); toast('Favorites cleared', 'info', { undo: () => void restoreFavorites(keep) }) }} />
                <DataTile icon={HistoryIcon} label="Recent tools" value={recent.length} onClear={() => { const keep = recentRows; void clearRecents(); toast('Recent tools cleared', 'info', { undo: () => void restoreRecents(keep) }) }} />
                <DataTile icon={Database} label="History entries" value={history.length} onClear={() => { const keep = history; void clearHistory(); toast('History cleared', 'info', { undo: () => void restoreHistory(keep) }) }} />
              </div>
              <div className="border-t border-border py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><div className="flex items-center gap-2 font-medium"><HardDrive className="size-4 text-accent" /> Storage used by OpenFile</div><p className="text-sm text-muted">Includes cached engines and AI models, local database and Sketch boards.</p></div>
                  <div className="text-right text-sm"><div className="font-semibold">{storage ? formatBytes(storage.usage) : 'Unknown'}</div>{storage?.quota ? <div className="text-xs text-muted">of {formatBytes(storage.quota)} available</div> : null}</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(pct, storage?.usage ? 1 : 0)}%` }} className="h-full rounded-full bg-gradient-brand" /></div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" icon={<WifiOff className="size-3.5" />} onClick={clearCaches}>Clear offline cache{cacheSize ? ` (${cacheSize})` : ''}</Button>
                  <span className="text-xs text-muted">Engines download again the next time a tool needs them.</span>
                </div>
              </div>
            </Section>

            <Section id="backup" icon={Database} title="Backup" sub="Move your setup to another browser or device.">
              <div className="grid gap-4 py-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface-2/30 p-4">
                  <div className="flex items-center gap-2 font-medium"><Download className="size-4 text-accent" /> Export settings</div>
                  <p className="mt-1 text-sm text-muted">Preferences, favorites, recent tools and Workspace recipes as JSON.</p>
                  <div className="mt-3"><Switch checked={withHistory} onChange={setWithHistory} label={<span className="text-sm">Include activity history</span>} /></div>
                  <Button className="mt-4" onClick={doExport} icon={<Download className="size-4" />}>Export JSON</Button>
                </div>
                <div className="rounded-2xl border border-border bg-surface-2/30 p-4">
                  <div className="flex items-center gap-2 font-medium"><Upload className="size-4 text-accent" /> Import settings</div>
                  <p className="mt-1 text-sm text-muted">Merges an OpenFile export into this browser. Unknown tools are skipped.</p>
                  <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = '' }} />
                  <Button className="mt-4" variant="outline" onClick={() => fileRef.current?.click()} icon={<Upload className="size-4" />}>Choose file…</Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4">
                <div><div className="font-medium">Reset preferences</div><p className="text-sm text-muted">Restore theme, accent, layout, motion, quality ({DEFAULT_PREFS.imageQuality}%) and naming defaults. Favorites and history are kept.</p></div>
                <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { void reset(); toast('Preferences reset') }}>Reset</Button>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ id, icon: I, title, sub, children }: { id: string; icon: typeof Sun; title: string; sub: string; children: React.ReactNode }) {
  return (
    <motion.section id={id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.3 }} className="scroll-mt-24 rounded-3xl border border-border bg-surface px-5 pt-5 sm:px-7 sm:pt-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent"><I className="size-5" /></div>
        <div><h2 className="font-display text-lg font-semibold">{title}</h2><p className="text-sm text-muted">{sub}</p></div>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </motion.section>
  )
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="max-w-md"><div className="font-medium">{title}</div>{sub && <p className="text-sm text-muted">{sub}</p>}</div>
      {children}
    </div>
  )
}

function DataTile({ icon: I, label, value, onClear }: { icon: typeof Sun; label: string; value: number; onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/30 p-4">
      <div className="flex items-center justify-between"><I className="size-4 text-accent" /><button disabled={!value} onClick={onClear} className="flex items-center gap-1 text-xs text-muted hover:text-danger disabled:opacity-40 cursor-pointer"><Trash2 className="size-3.5" /> Clear</button></div>
      <div className="mt-2 font-display text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Input, Label, Select, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { buildIcs, monthGrid, MONTHS, ymd, parseYmd } from '@/lib/cf/time'
import { toCsvText } from '@/lib/cf/sheet'

interface Post { id: string; date: string; time: string; platform: string; title: string; notes: string; status: 'idea' | 'draft' | 'ready' | 'posted' }
const PLATFORMS = ['YouTube', 'Instagram', 'TikTok', 'LinkedIn', 'X', 'Threads', 'Blog', 'Newsletter', 'Podcast', 'Pinterest']
const COLORS: Record<string, string> = { YouTube: '#F97316', Instagram: '#F5A524', TikTok: '#22D3EE', LinkedIn: '#0EA5E9', X: '#A8A29E', Threads: '#D6D3D1', Blog: '#10B981', Newsletter: '#84CC16', Podcast: '#14B8A6', Pinterest: '#FB923C' }
const STATUS: Record<Post['status'], string> = { idea: 'Idea', draft: 'Drafting', ready: 'Ready', posted: 'Posted' }
const KEY = 'of-content-calendar'
const uid = () => Math.random().toString(36).slice(2, 10)

export default function ContentCalendar() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [posts, setPosts] = useState<Post[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } })
  const [sel, setSel] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(posts)) }, [posts])
  const grid = useMemo(() => monthGrid(ym.y, ym.m, 1), [ym])
  const shown = posts.filter((p) => filter === 'all' || p.platform === filter)
  const byDay = useMemo(() => { const m = new Map<string, Post[]>(); for (const p of shown) { if (!m.has(p.date)) m.set(p.date, []); m.get(p.date)!.push(p) } for (const v of m.values()) v.sort((a, b) => a.time.localeCompare(b.time)); return m }, [shown])
  const cur = posts.find((p) => p.id === sel)
  const add = (date: string) => { const p: Post = { id: uid(), date, time: '18:00', platform: 'Instagram', title: '', notes: '', status: 'idea' }; setPosts([...posts, p]); setSel(p.id) }
  const upd = (patch: Partial<Post>) => setPosts(posts.map((p) => (p.id === sel ? { ...p, ...patch } : p)))
  const move = (d: number) => setYm(({ y, m }) => { const t = new Date(y, m + d, 1); return { y: t.getFullYear(), m: t.getMonth() } })
  const month = posts.filter((p) => p.date.startsWith(`${ym.y}-${String(ym.m + 1).padStart(2, '0')}`))
  const exportIcs = () => downloadBlob(new Blob([buildIcs(posts.filter((p) => p.status !== 'posted').map((p) => { const d = parseYmd(p.date)!; const [h, mi] = p.time.split(':').map(Number); d.setHours(h || 0, mi || 0); return { uid: `${p.id}@openfile-content`, summary: `${p.platform}: ${p.title || 'Post'}`, start: d, end: new Date(+d + 30 * 60000), description: `${STATUS[p.status]}${p.notes ? '\n' + p.notes : ''}`, alarmMin: 60 } }), { name: 'Content calendar' })], { type: 'text/calendar' }), 'content-calendar.ics')
  const exportCsv = () => downloadBlob(new Blob(['\ufeff' + toCsvText([['Date', 'Time', 'Platform', 'Title', 'Status', 'Notes'], ...[...posts].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((p) => [p.date, p.time, p.platform, p.title, STATUS[p.status], p.notes])])], { type: 'text/csv' }), 'content-calendar.csv')
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="min-w-0 space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
          <div className="min-w-40 text-center font-display text-lg font-bold">{MONTHS[ym.m]} {ym.y}</div>
          <Button variant="ghost" size="sm" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
          <span className="ml-auto text-xs text-muted">{month.length} posts this month, {month.filter((p) => p.status === 'posted').length} posted</span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-muted">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d}>{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">{grid.map((dn, i) => {
          if (!dn) return <div key={i} />
          const d = new Date(ym.y, ym.m, dn), k = ymd(d), list = byDay.get(k) ?? [], today = k === ymd(now)
          return <div key={i} className={`group min-h-24 rounded-lg border p-1 ${today ? 'border-accent' : 'border-border'} bg-surface-2/30`}>
            <div className="flex items-center justify-between text-[11px]"><span className={today ? 'font-bold text-accent' : 'text-muted'}>{d.getDate()}</span><button aria-label={`Add post on ${k}`} onClick={() => add(k)} className="rounded p-0.5 text-muted opacity-60 hover:text-accent group-hover:opacity-100 cursor-pointer"><Plus className="size-3" /></button></div>
            <div className="mt-0.5 space-y-0.5">{list.map((p) => <button key={p.id} onClick={() => setSel(p.id)} className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] cursor-pointer ${p.id === sel ? 'ring-1 ring-accent' : ''} ${p.status === 'posted' ? 'line-through opacity-60' : ''}`} style={{ background: COLORS[p.platform] + '33', borderLeft: `3px solid ${COLORS[p.platform]}` }}>{p.time} {p.title || p.platform}</button>)}</div>
          </div>
        })}</div>
      </Card>
      <Card className="space-y-3 self-start">
        {cur ? <>
          <div className="flex items-center justify-between"><Label className="mb-0">Post</Label><button className="text-xs text-muted hover:text-fg cursor-pointer" onClick={() => setSel(null)}>Close</button></div>
          <Input value={cur.title} onChange={(e) => upd({ title: e.target.value })} placeholder="What is the post about" aria-label="Title" autoFocus />
          <div className="grid grid-cols-2 gap-2"><Input type="date" value={cur.date} onChange={(e) => upd({ date: e.target.value })} aria-label="Date" /><Input type="time" value={cur.time} onChange={(e) => upd({ time: e.target.value })} aria-label="Time" /></div>
          <div className="grid grid-cols-2 gap-2"><Select aria-label="Platform" value={cur.platform} onChange={(v) => upd({ platform: v })} options={PLATFORMS} /><Select aria-label="Status" value={cur.status} onChange={(v) => upd({ status: v as Post['status'] })} options={Object.entries(STATUS).map(([value, label]) => ({ value, label }))} /></div>
          <Textarea value={cur.notes} onChange={(e) => upd({ notes: e.target.value })} placeholder="Hook, caption, links, hashtags" className="min-h-28 font-sans text-sm" aria-label="Notes" />
          <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => { setPosts(posts.filter((p) => p.id !== sel)); setSel(null) }}>Delete post</Button>
        </> : <>
          <Button className="w-full" icon={<Plus className="size-4" />} onClick={() => add(ymd(now))}>Add a post today</Button>
          <div><Label>Show</Label><Select aria-label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All platforms' }, ...PLATFORMS]} /></div>
          <div className="flex flex-wrap gap-2 text-[11px]">{PLATFORMS.map((p) => <span key={p} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: COLORS[p] }} />{p}</span>)}</div>
        </>}
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!posts.length} onClick={exportIcs}>Calendar (.ics)</Button>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!posts.length} onClick={exportCsv}>CSV</Button>
        </div>
        <p className="text-xs text-muted">Plans are saved in this browser only. The calendar file adds each planned post to Google, Apple or Outlook calendar with a reminder an hour before.</p>
      </Card>
    </div>
  )
}

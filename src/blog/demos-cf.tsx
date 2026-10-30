// Interactive demos for the Study & Classroom, Web & SEO and Calendar & Time posts (categories fill round).
import { useMemo, useState } from 'react'
import { neededOnFinal, letter } from '@/lib/cf/study'
import { robotsAllowed } from '@/lib/cf/web'
import { parseRrule, expandRrule, describeRule, ymd, WEEKDAYS } from '@/lib/cf/time'

const box = 'not-prose my-6 rounded-2xl border border-border bg-surface p-4'
const input = 'min-h-10 w-full rounded-xl border border-border bg-bg px-3 text-sm'

/** What score do I need on the final? */
export function FinalExamDemo() {
  const [cur, setCur] = useState('78')
  const [target, setTarget] = useState('85')
  const [weight, setWeight] = useState('30')
  const res = useMemo(() => {
    try {
      const need = neededOnFinal(Number(cur), Number(target), Number(weight))
      if (!Number.isFinite(need)) return { err: 'Type numbers in all three boxes.' }
      return { need }
    } catch (e: any) { return { err: String(e.message) } }
  }, [cur, target, weight])
  return (
    <div className={box}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">Grade so far (%)<input className={input} inputMode="decimal" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label className="text-xs text-muted">Grade you want (%)<input className={input} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <label className="text-xs text-muted">Final exam weight (%)<input className={input} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
      </div>
      {res.err ? <p className="mt-3 text-sm text-warn">{res.err}</p> : (
        <p className="mt-3 text-sm">You need <strong className="font-mono">{res.need!.toFixed(1)}%</strong> on the final ({letter(Math.max(0, Math.min(100, res.need!)))}).{' '}
          {res.need! > 100 ? 'That is above 100, so this target is out of reach with the final alone.' : res.need! <= 0 ? 'You already have it, even with a zero on the final.' : 'Change the boxes to try other targets.'}</p>
      )}
    </div>
  )
}

const ROBOTS = `User-agent: *
Disallow: /admin/
Disallow: /search
Allow: /admin/help

User-agent: GPTBot
Disallow: /

Sitemap: https://example.com/sitemap.xml`

/** Test a URL against a robots.txt the way crawlers do. */
export function RobotsTesterDemo() {
  const [txt, setTxt] = useState(ROBOTS)
  const [agent, setAgent] = useState('Googlebot')
  const [path, setPath] = useState('/admin/help')
  const res = useMemo(() => robotsAllowed(txt, agent, path.startsWith('/') ? path : '/' + path), [txt, agent, path])
  return (
    <div className={box}>
      <textarea aria-label="robots.txt" value={txt} onChange={(e) => setTxt(e.target.value)} className="h-40 w-full rounded-xl border border-border bg-bg p-2 font-mono text-[12px]" spellCheck={false} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted">Crawler<select className={input} value={agent} onChange={(e) => setAgent(e.target.value)}>{['Googlebot', 'Bingbot', 'GPTBot', 'ClaudeBot'].map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="text-xs text-muted">Path<input className={input + ' font-mono'} value={path} onChange={(e) => setPath(e.target.value)} /></label>
      </div>
      <p className="mt-3 text-sm"><strong className={res.allowed ? 'text-success' : 'text-warn'}>{res.allowed ? 'Allowed' : 'Blocked'}</strong>{res.rule ? <> by <code className="font-mono text-xs">{res.rule}</code></> : ' (no rule matches, so it is allowed)'}</p>
    </div>
  )
}

const RULES = ['FREQ=MONTHLY;BYDAY=-1FR', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=3']

/** Explain a repeat rule and list the next dates. */
export function RepeatRuleDemo() {
  const [rule, setRule] = useState(RULES[0])
  const res = useMemo(() => {
    try {
      const r = parseRrule(rule.trim())
      const start = new Date(2026, 10, 1, 9, 0)
      return { text: describeRule(r), dates: expandRrule(r, start, 6) }
    } catch (e: any) { return { err: String(e.message) } }
  }, [rule])
  return (
    <div className={box}>
      <div className="mb-2 flex flex-wrap gap-1.5">{RULES.map((r) => <button key={r} type="button" onClick={() => setRule(r)} className={`min-h-9 cursor-pointer rounded-full border px-3 font-mono text-[11px] ${r === rule ? 'border-accent bg-accent/10' : 'border-border text-muted'}`}>{r}</button>)}</div>
      <input aria-label="Repeat rule" className={input + ' font-mono'} value={rule} onChange={(e) => setRule(e.target.value)} spellCheck={false} />
      {res.err ? <p className="mt-3 text-sm text-warn">{res.err}</p> : <>
        <p className="mt-3 text-sm"><strong>{res.text}</strong></p>
        <p className="mt-1 text-xs text-muted">Next dates from 1 November 2026:</p>
        <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">{res.dates!.map((d) => <li key={+d} className="font-mono text-xs">{ymd(d)} {WEEKDAYS[d.getDay()]}</li>)}</ul>
      </>}
    </div>
  )
}

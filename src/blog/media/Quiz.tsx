// "Check yourself" card at the end of a post: two quick questions, then links to try the tools.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X, Sparkles, ArrowRight, RotateCcw } from 'lucide-react'
import { cn } from '@/components/ui'
import { toolBySlug } from '@/tools/registry'
import { QUIZZES } from './quizzes'

export function PostQuiz({ slug, tools }: { slug: string; tools: string[] }) {
  const qs = QUIZZES[slug] ?? []
  const [picked, setPicked] = useState<(number | null)[]>(() => qs.map(() => null))
  const done = picked.every((p) => p !== null)
  const score = picked.filter((p, i) => p === qs[i]?.a).length
  const try1 = tools.map(toolBySlug).filter((t): t is NonNullable<typeof t> => !!t).slice(0, 3)
  if (!qs.length && !try1.length) return null
  return (
    <section className="not-prose my-10 overflow-hidden rounded-2xl border border-border bg-surface" aria-labelledby="quiz-title">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
        <Sparkles className="size-3.5 text-accent" /> <span id="quiz-title">Check yourself, then try it</span>
      </div>
      <div className="grid gap-5 p-4 sm:p-5">
        {qs.map((q, i) => (
          <fieldset key={i}>
            <legend className="mb-2 text-sm font-semibold">{i + 1}. {q.q}</legend>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {q.options.map((o, j) => {
                const sel = picked[i] === j, show = picked[i] !== null, right = j === q.a
                return (
                  <button key={j} disabled={show} onClick={() => setPicked((p) => p.map((x, k) => (k === i ? j : x)))}
                    className={cn('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition', !show && 'border-border hover:border-accent cursor-pointer',
                      show && right && 'border-success bg-success/10', show && sel && !right && 'border-danger bg-danger/10', show && !sel && !right && 'border-border opacity-60')}>
                    {show && right ? <Check className="size-4 shrink-0 text-success" /> : show && sel ? <X className="size-4 shrink-0 text-danger" /> : <span className="size-4 shrink-0 rounded-full border border-border" />}
                    {o}
                  </button>
                )
              })}
            </div>
            {picked[i] !== null && <p className="mt-2 text-xs text-muted">{q.why}</p>}
          </fieldset>
        ))}
        {done && qs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
            <span>{score === qs.length ? 'All correct. You got the main ideas.' : `${score} of ${qs.length} correct. The answers above explain why.`}</span>
            <button onClick={() => setPicked(qs.map(() => null))} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg cursor-pointer"><RotateCcw className="size-3.5" /> Try again</button>
          </div>
        )}
        {try1.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {try1.map((t) => <Link key={t.slug} to={`/${t.slug}`} className="group inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent">Try {t.name} <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" /></Link>)}
          </div>
        )}
      </div>
    </section>
  )
}

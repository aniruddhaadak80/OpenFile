import { useMemo, useState } from 'react'
import { Check, Download, FileDown, Play, X } from 'lucide-react'
import { Button, Card, Input, Label, Segmented, Switch, Textarea } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { escapeHtml } from '@/lib/safe'
import { gradeAnswer, parseQuiz, shuffle, rng, type Question } from '@/lib/cf/study'
import { newPdf } from '@/lib/cf/ui'

const SAMPLE = `1. Which planet is closest to the Sun?
a) Venus
*b) Mercury
c) Mars
> Mercury orbits the Sun every 88 days.

2. Pick the prime numbers.
*a) 2
*b) 7
c) 9
d) 15

3. What is the chemical symbol for gold?
= Au

4. Light travels faster than sound.
*a) True
b) False`

/** A standalone quiz page: questions as JSON (escaped so it cannot close the script tag) and a tiny player. */
function quizHtml(title: string, qs: Question[], shuffleOpts: boolean) {
  const data = JSON.stringify({ title, qs, shuffleOpts }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#0B0D10;color:#F5F3EE;max-width:720px;margin:0 auto;padding:24px}h1{color:#F5A524}.q{background:#15181d;border:1px solid #2a2f36;border-radius:14px;padding:16px;margin:14px 0}label{display:block;padding:6px 8px;border-radius:8px;cursor:pointer}label:hover{background:#1f242b}input[type=text]{width:100%;padding:8px;border-radius:8px;border:1px solid #2a2f36;background:#0B0D10;color:inherit}button{background:#F5A524;color:#111;border:0;border-radius:10px;padding:10px 18px;font-weight:700;cursor:pointer}.ok{color:#10B981}.no{color:#F97316}.ex{color:#9ca3af;font-size:14px}</style></head>
<body><h1></h1><form id="f"></form><p><button id="b" type="button">Check answers</button></p><h2 id="s"></h2>
<script>const D=${data};const t=(e,c)=>{const x=document.createElement(e);if(c)x.textContent=c;return x};document.querySelector('h1').textContent=D.title;const f=document.getElementById('f');
D.qs.forEach((q,i)=>{const d=t('div');d.className='q';d.appendChild(t('b',(i+1)+'. '+q.q));if(q.kind==='text'){const n=t('input');n.type='text';n.name='q'+i;d.appendChild(n)}else{let o=q.options.map((x,k)=>[x,k]);if(D.shuffleOpts&&q.kind!=='tf')o.sort(()=>Math.random()-.5);o.forEach(([x,k])=>{const l=t('label'),n=t('input');n.type=q.kind==='multi'?'checkbox':'radio';n.name='q'+i;n.value=k;l.appendChild(n);l.appendChild(document.createTextNode(' '+x));d.appendChild(l)})}const r=t('div');r.className='r';d.appendChild(r);f.appendChild(d)});
document.getElementById('b').onclick=()=>{let s=0;D.qs.forEach((q,i)=>{const d=f.children[i],r=d.querySelector('.r');let ok;if(q.kind==='text'){const g=d.querySelector('input').value.trim().toLowerCase();ok=q.options.some(o=>o.toLowerCase().split('|').map(x=>x.trim()).includes(g))}else{const g=[...d.querySelectorAll('input:checked')].map(x=>+x.value).sort().join();ok=g===[...q.answer].sort().join()}if(ok)s++;r.textContent='';const m=t('p',ok?'Correct':'Answer: '+q.answer.map(k=>q.options[k]).join(', '));m.className=ok?'ok':'no';r.appendChild(m);if(q.explain){const e=t('p',q.explain);e.className='ex';r.appendChild(e)}});document.getElementById('s').textContent='Score: '+s+' of '+D.qs.length+' ('+Math.round(s/D.qs.length*100)+'%)'}</script></body></html>`
}

async function quizPdf(title: string, qs: Question[], key: boolean) {
  const { doc, W, H } = await newPdf(); const m = 50; let y = m
  const line = (t: string, size = 11, bold = false, x = m) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); for (const l of doc.splitTextToSize(t, W - x - m)) { if (y > H - m) { doc.addPage(); y = m } doc.text(l, x, y); y += size * 1.35 } }
  line(title, 18, true); line('Name: ________________________   Date: ____________', 10); y += 8
  qs.forEach((q, i) => { y += 6; line(`${i + 1}. ${q.q}`, 11, true); if (q.kind === 'text') line('Answer: ______________________________', 11, false, m + 14); else q.options.forEach((o, k) => line(`${q.kind === 'multi' ? '[ ]' : '( )'} ${String.fromCharCode(97 + k)}) ${o}`, 11, false, m + 14)) })
  if (key) { doc.addPage(); y = m; line(`${title}: answer key`, 16, true); qs.forEach((q, i) => line(`${i + 1}. ${q.kind === 'text' ? q.options.join(' or ') : q.answer.map((k) => `${String.fromCharCode(97 + k)}) ${q.options[k]}`).join(', ')}${q.explain ? `  (${q.explain})` : ''}`)) }
  return doc.output('blob')
}

export default function QuizMaker() {
  const [text, setText] = useState(SAMPLE), [title, setTitle] = useState('Science quiz')
  const [mode, setMode] = useState<'write' | 'take'>('write'), [shuf, setShuf] = useState(true)
  const qs = useMemo(() => parseQuiz(text), [text])
  const [order, setOrder] = useState<number[]>([]), [ans, setAns] = useState<Record<number, number[] | string>>({}), [done, setDone] = useState(false)
  const take = () => { setOrder(shuf ? shuffle(qs.map((_, i) => i), rng(Date.now())) : qs.map((_, i) => i)); setAns({}); setDone(false); setMode('take') }
  const score = done ? qs.filter((q, i) => gradeAnswer(q, ans[i] ?? (q.kind === 'text' ? '' : []))).length : 0
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><Segmented value={mode} onChange={(v) => (v === 'take' ? take() : setMode(v))} options={[{ value: 'write', label: 'Write quiz' }, { value: 'take', label: 'Try it' }]} /><span className="text-sm text-muted">{qs.length} questions</span></div>
      {mode === 'write' ? <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-2"><div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Questions: number each one, list options with a), mark right ones with *, use = for typed answers and &gt; for an explanation</Label><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-96 font-sans text-sm" /></div></div>
        <Card className="space-y-3 self-start">
          <div className="space-y-1 text-xs text-muted">{qs.map((q, i) => <div key={i} className="truncate"><b className="text-fg">{i + 1}.</b> {q.q} <span className="text-accent">({q.kind === 'tf' ? 'true or false' : q.kind === 'text' ? 'typed' : q.kind === 'multi' ? 'several right' : 'one right'})</span>{!q.answer.length && <span className="text-danger"> no answer marked</span>}</div>)}</div>
          <Switch checked={shuf} onChange={setShuf} label="Shuffle questions and options" />
          <Button className="w-full" icon={<Play className="size-4" />} disabled={!qs.length} onClick={take}>Try the quiz</Button>
          <Button className="w-full" variant="outline" icon={<Download className="size-4" />} disabled={!qs.length} onClick={() => downloadBlob(new Blob([quizHtml(title, qs, shuf)], { type: 'text/html' }), `${title.replace(/\W+/g, '-').toLowerCase() || 'quiz'}.html`)}>Quiz as one HTML page</Button>
          <Button className="w-full" variant="outline" icon={<FileDown className="size-4" />} disabled={!qs.length} onClick={async () => downloadBlob(await quizPdf(title, qs, true), `${title.replace(/\W+/g, '-').toLowerCase() || 'quiz'}.pdf`)}>Printable PDF with answer key</Button>
          <p className="text-xs text-muted">The HTML quiz works offline in any browser: email it, put it on a class site or open it on a phone. It checks answers by itself.</p>
        </Card>
      </div> : <div className="mx-auto max-w-2xl space-y-3">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        {order.map((i, n) => { const q = qs[i], a = ans[i], ok = done && gradeAnswer(q, a ?? (q.kind === 'text' ? '' : [])); return (
          <Card key={i} className="space-y-2"><div className="font-medium">{n + 1}. {q.q}</div>
            {q.kind === 'text' ? <Input value={(a as string) ?? ''} onChange={(e) => setAns({ ...ans, [i]: e.target.value })} disabled={done} aria-label="Your answer" /> :
              q.options.map((o, k) => { const sel = ((a as number[]) ?? []).includes(k); return <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 ${done && q.answer.includes(k) ? 'text-success' : ''}`}><input type={q.kind === 'multi' ? 'checkbox' : 'radio'} name={'q' + i} checked={sel} disabled={done} onChange={() => setAns({ ...ans, [i]: q.kind === 'multi' ? (sel ? (a as number[]).filter((x) => x !== k) : [...((a as number[]) ?? []), k]) : [k] })} />{o}</label> })}
            {done && <p className={`flex items-center gap-1 text-sm ${ok ? 'text-success' : 'text-warn'}`}>{ok ? <Check className="size-4" /> : <X className="size-4" />}{ok ? 'Correct' : `Answer: ${q.answer.map((k) => q.options[k]).join(', ')}`}{q.explain ? `. ${q.explain}` : ''}</p>}
          </Card>) })}
        {done ? <Card className="text-center"><div className="font-display text-4xl font-bold text-accent">{score} / {qs.length}</div><div className="text-muted">{Math.round((score / Math.max(1, qs.length)) * 100)}%</div><Button className="mt-3" onClick={take}>Try again</Button></Card> : <Button className="w-full" size="lg" onClick={() => setDone(true)}>Check my answers</Button>}
      </div>}
    </div>
  )
}

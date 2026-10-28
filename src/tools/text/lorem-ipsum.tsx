import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Code2, Eye } from 'lucide-react'
import { Button, Card, Segmented, Slider, Switch, CopyButton, Field, Select } from '@/components/ui'
import { DownloadButton, randInt } from '@/tools/dev/_dev/kit'

const LISTS: Record<string, { label: string; words: string[]; classic?: string }> = {
  latin: {
    label: 'Classic Latin', classic: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
    words: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc pulvinar sapien ligula mattis vulputate mauris blandit aliquet porta lectus faucibus viverra accumsan risus tortor dignissim convallis aenean vel turpis quam nisl suscipit egestas integer feugiat scelerisque varius morbi'.split(' '),
  },
  hipster: {
    label: 'Hipster', classic: 'Artisan cold-pressed sriracha, vinyl chillwave fixie',
    words: 'artisan cold-pressed sriracha vinyl chillwave fixie kombucha selvage tote bag sustainable letterpress succulents mumblecore normcore pour-over typewriter fingerstache meditation kale chips craft beer gastropub vaporware polaroid echo park lumbersexual small batch farm-to-table locavore cronut fanny pack hashtag williamsburg brooklyn authentic biodiesel austin portland gluten-free activated charcoal raw denim tattooed bespoke flannel ethical single-origin coffee matcha hammock vegan banjo knausgaard listicle microdosing pinterest ramps shoreditch synth taxidermy tofu trust fund umami vexillologist woke yr wolf yuccie plaid air plant'.split(' '),
  },
  office: {
    label: 'Corporate', classic: 'Leverage agile frameworks to provide a robust synopsis',
    words: 'leverage agile frameworks synergy paradigm shift circle back deep dive bandwidth stakeholder alignment deliverables roadmap scalable holistic value-add touch base low-hanging fruit move the needle actionable insights best practices core competencies key performance indicators onboarding ecosystem disruptive innovation thought leadership mission-critical growth hacking omnichannel streamline optimize proactive drill down quarterly offline robust bleeding-edge cross-functional empower benchmark visibility pipeline incentivize monetize ideate pivot wheelhouse runway granular north star alignment cadence tiger team vertical'.split(' '),
  },
  bacon: {
    label: 'Bacon', classic: 'Bacon ipsum dolor amet pork belly brisket',
    words: 'bacon pork belly brisket tri-tip short ribs pancetta sirloin chuck jowl ham hock andouille kielbasa tenderloin capicola picanha porchetta biltong burgdoggen meatball prosciutto ribeye flank turducken frankfurter shankle cupim drumstick pastrami salami spare ribs beef ribs boudin chislic doner filet mignon ground round hamburger landjaeger leberkas meatloaf pig rump strip steak swine t-bone tail venison alcatra shoulder corned beef bresaola turkey chicken sausage'.split(' '),
  },
  space: {
    label: 'Space', classic: 'Nebula orbit cosmic drift across the event horizon',
    words: 'nebula orbit cosmic drift event horizon galaxy quasar pulsar supernova asteroid comet meteor satellite telescope gravity wormhole stardust astronaut lunar solar eclipse constellation interstellar redshift exoplanet singularity spacetime rover launchpad payload booster thruster capsule module zenith aurora meridian perihelion aphelion parsec light-year magnetar cluster void dark matter photon plasma celestial voyager mission control countdown liftoff'.split(' '),
  },
}

type Unit = 'paragraphs' | 'sentences' | 'words' | 'list'

function makeSentence(words: string[], min = 6, max = 15) {
  const n = min + randInt(max - min + 1); const out: string[] = []
  for (let i = 0; i < n; i++) { let w = words[randInt(words.length)]; while (out.length && w === out[out.length - 1]) w = words[randInt(words.length)]; out.push(w) }
  if (n > 8 && randInt(3) === 0) out[2 + randInt(n - 5)] += ','
  const s = out.join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1) + (randInt(12) === 0 ? '?' : '.')
}
const makeParagraph = (words: string[]) => Array.from({ length: 4 + randInt(4) }, () => makeSentence(words)).join(' ')

export default function LoremIpsum() {
  const [unit, setUnit] = useState<Unit>('paragraphs')
  const [count, setCount] = useState(4)
  const [list, setList] = useState('latin')
  const [classic, setClassic] = useState(true)
  const [html, setHtml] = useState(false)
  const [ordered, setOrdered] = useState(false)
  const [view, setView] = useState<'preview' | 'code'>('preview')
  const [seed, setSeed] = useState(0)
  const [items, setItems] = useState<string[]>([])

  useEffect(() => {
    const L = LISTS[list]; let out: string[]
    if (unit === 'words') {
      const w = Array.from({ length: count }, () => L.words[randInt(L.words.length)])
      if (classic && L.classic) { const c = L.classic.replace(/[,.]/g, '').split(' '); for (let i = 0; i < Math.min(c.length, count); i++) w[i] = c[i].toLowerCase() }
      const s = w.join(' '); out = [s.charAt(0).toUpperCase() + s.slice(1)]
    } else if (unit === 'sentences') out = Array.from({ length: count }, () => makeSentence(L.words))
    else if (unit === 'list') out = Array.from({ length: count }, () => makeSentence(L.words, 3, 8).replace(/[.?]$/, ''))
    else out = Array.from({ length: count }, () => makeParagraph(L.words))
    if (classic && L.classic && unit !== 'words') out[0] = unit === 'list' ? L.classic : unit === 'sentences' ? L.classic + '.' : `${L.classic}. ${out[0]}`
    setItems(out)
  }, [unit, count, list, classic, seed])

  const text = useMemo(() => {
    if (unit === 'list') return html ? `<${ordered ? 'ol' : 'ul'}>\n${items.map((i) => `  <li>${i}</li>`).join('\n')}\n</${ordered ? 'ol' : 'ul'}>` : items.map((i, k) => (ordered ? `${k + 1}. ` : '• ') + i).join('\n')
    if (unit === 'sentences') return html ? `<p>${items.join(' ')}</p>` : items.join(' ')
    return html ? items.map((p) => `<p>${p}</p>`).join('\n\n') : items.join('\n\n')
  }, [items, unit, html, ordered])
  const words = text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  const max = unit === 'words' ? 1000 : unit === 'sentences' ? 100 : unit === 'list' ? 50 : 30

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={view} onChange={setView} options={[{ value: 'preview', label: <span className="flex items-center gap-1.5"><Eye className="size-3.5" />Preview</span> }, { value: 'code', label: <span className="flex items-center gap-1.5"><Code2 className="size-3.5" />Raw</span> }]} />
          <span className="text-xs text-muted">{words.toLocaleString()} words · {text.length.toLocaleString()} chars</span>
          <div className="ml-auto flex gap-1"><Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => setSeed((s) => s + 1)}>Regenerate</Button><CopyButton text={text} /><DownloadButton text={text} filename={html ? 'lorem.html' : 'lorem.txt'} /></div>
        </div>
        <motion.div key={seed + unit + list} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} className="min-h-[420px] rounded-2xl border border-border bg-surface p-6">
          {view === 'code' ? <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed">{text}</pre>
            : unit === 'list' ? (ordered ? <ol className="list-decimal space-y-1 pl-6 leading-relaxed">{items.map((i, k) => <li key={k}>{i}</li>)}</ol> : <ul className="list-disc space-y-1 pl-6 leading-relaxed">{items.map((i, k) => <li key={k}>{i}</li>)}</ul>)
            : <div className="space-y-4 text-[15px] leading-relaxed">{unit === 'paragraphs' ? items.map((p, k) => <p key={k}>{p}</p>) : <p>{items.join(' ')}</p>}</div>}
        </motion.div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-5">
          <Field label="Generate"><Segmented value={unit} onChange={(u) => { setUnit(u); setCount(u === 'words' ? 50 : u === 'sentences' ? 5 : u === 'list' ? 6 : 4) }} options={[{ value: 'paragraphs', label: 'Paragraphs' }, { value: 'sentences', label: 'Sentences' }, { value: 'words', label: 'Words' }, { value: 'list', label: 'List' }]} /></Field>
          <Slider label="Amount" value={Math.min(count, max)} onChange={setCount} min={1} max={max} />
          <Field label="Flavor"><Select value={list} onChange={setList} options={Object.entries(LISTS).map(([v, l]) => ({ value: v, label: l.label }))} /></Field>
          <Switch checked={classic} onChange={setClassic} label={`Start with “${LISTS[list].classic?.split(' ').slice(0, 3).join(' ')}…”`} />
          <Switch checked={html} onChange={setHtml} label="Wrap in HTML tags" />
          {unit === 'list' && <Switch checked={ordered} onChange={setOrdered} label="Numbered list" />}
        </Card>
      </aside>
    </div>
  )
}

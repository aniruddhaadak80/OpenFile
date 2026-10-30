import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, ImageDown, Maximize2 } from 'lucide-react'
import { Button, Field, Segmented, Select, Textarea, ToolGrid, CopyButton } from '@/components/ui'
import { downloadBlob } from '@/lib/files'
import { toast } from '@/components/toast'
import { OpenButton, useBlobUrl } from '@/lib/b14/ui'
import { safeBlobUrl } from '../../lib/safe'

const TEMPLATES: Record<string, { label: string; code: string }> = {
  flow: { label: 'Flowchart', code: 'flowchart TD\n  A[Drop a file] --> B{Is it a PDF?}\n  B -- Yes --> C[Open PDF tools]\n  B -- No --> D[Pick a converter]\n  C --> E[Download result]\n  D --> E' },
  seq: { label: 'Sequence', code: 'sequenceDiagram\n  participant U as You\n  participant B as Browser\n  participant W as Worker\n  U->>B: Drop file\n  B->>W: Process on device\n  W-->>B: Result\n  B-->>U: Download\n  Note over B,W: Nothing is uploaded' },
  class: { label: 'Class', code: 'classDiagram\n  class Tool {\n    +string slug\n    +string name\n    +run(file) Blob\n  }\n  class Converter\n  class Viewer\n  Tool <|-- Converter\n  Tool <|-- Viewer' },
  state: { label: 'State', code: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working: file dropped\n  Working --> Done: finished\n  Working --> Error: failed\n  Error --> Idle: try again\n  Done --> [*]' },
  er: { label: 'Database (ER)', code: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  ORDER ||--|{ LINE_ITEM : contains\n  PRODUCT ||--o{ LINE_ITEM : "is in"\n  CUSTOMER {\n    int id\n    string name\n  }' },
  gantt: { label: 'Gantt', code: 'gantt\n  title Launch plan\n  dateFormat YYYY-MM-DD\n  section Build\n  Design      :a1, 2026-11-02, 5d\n  Code        :a2, after a1, 10d\n  section Ship\n  Testing     :after a2, 4d\n  Release     :milestone, 2026-11-23, 0d' },
  pie: { label: 'Pie', code: 'pie title Where time goes\n  "Meetings" : 30\n  "Deep work" : 45\n  "Email" : 15\n  "Breaks" : 10' },
  mind: { label: 'Mind map', code: 'mindmap\n  root((OpenFile))\n    PDF\n      Merge\n      Split\n    Media\n      Video\n      Audio\n    Data\n      CSV\n      JSON' },
  time: { label: 'Timeline', code: 'timeline\n  title Project history\n  2024 : Idea : First tools\n  2025 : 100 tools : Desktop app\n  2026 : 400 tools : Mobile app' },
  git: { label: 'Git graph', code: 'gitGraph\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout main\n  merge feature\n  commit' },
  journey: { label: 'User journey', code: 'journey\n  title Converting a file\n  section Find\n    Search tool: 5: You\n  section Use\n    Drop file: 4: You\n    Wait: 3: You\n    Download: 5: You' },
  quad: { label: 'Quadrant', code: 'quadrantChart\n  title Effort vs value\n  x-axis Low effort --> High effort\n  y-axis Low value --> High value\n  quadrant-1 Plan\n  quadrant-2 Do now\n  quadrant-3 Skip\n  quadrant-4 Delegate\n  Dark mode: [0.3, 0.8]\n  Rewrite: [0.9, 0.6]\n  Typos: [0.1, 0.2]' },
}
const THEMES = {
  gold: { darkMode: true, background: '#0B0D10', primaryColor: '#1C2A2A', primaryBorderColor: '#F5A524', primaryTextColor: '#F5F3EE', secondaryColor: '#10262C', tertiaryColor: '#171A1F', lineColor: '#9AA0A6', textColor: '#F5F3EE', mainBkg: '#1C2A2A', nodeBorder: '#F5A524', clusterBkg: '#14171C', clusterBorder: '#2A2F37', actorBkg: '#1C2A2A', actorBorder: '#F5A524', actorTextColor: '#F5F3EE', signalColor: '#9AA0A6', signalTextColor: '#F5F3EE', noteBkgColor: '#10262C', noteBorderColor: '#22D3EE', noteTextColor: '#F5F3EE', pie1: '#F5A524', pie2: '#14B8A6', pie3: '#38BDF8', pie4: '#84CC16', pie5: '#F97316', pie6: '#22D3EE', git0: '#F5A524', git1: '#14B8A6', git2: '#38BDF8', git3: '#84CC16', cScale0: '#F5A524', cScale1: '#14B8A6', cScale2: '#38BDF8', cScale3: '#84CC16', cScale4: '#F97316', cScale5: '#22D3EE' },
  light: { darkMode: false, background: '#FFFFFF', primaryColor: '#CCFBF1', primaryBorderColor: '#0F766E', primaryTextColor: '#0B1D1C', secondaryColor: '#E0F2FE', tertiaryColor: '#FEF3C7', lineColor: '#4B5563', textColor: '#111827', mainBkg: '#CCFBF1', nodeBorder: '#0F766E', clusterBkg: '#F8FAFC', clusterBorder: '#CBD5E1', actorBkg: '#CCFBF1', actorBorder: '#0F766E', noteBkgColor: '#FEF3C7', noteBorderColor: '#F5A524', pie1: '#F5A524', pie2: '#14B8A6', pie3: '#38BDF8', pie4: '#84CC16', pie5: '#F97316', pie6: '#22D3EE', git0: '#0F766E', git1: '#F5A524', git2: '#0284C7', git3: '#65A30D', cScale0: '#FDE68A', cScale1: '#99F6E4', cScale2: '#BAE6FD', cScale3: '#D9F99D', cScale4: '#FED7AA', cScale5: '#A5F3FC' },
  mono: { darkMode: false, background: '#FFFFFF', primaryColor: '#F3F4F6', primaryBorderColor: '#111827', primaryTextColor: '#111827', secondaryColor: '#E5E7EB', tertiaryColor: '#F9FAFB', lineColor: '#111827', textColor: '#111827', mainBkg: '#F3F4F6', nodeBorder: '#111827', pie1: '#111827', pie2: '#4B5563', pie3: '#9CA3AF', pie4: '#D1D5DB', pie5: '#6B7280', pie6: '#E5E7EB', cScale0: '#E5E7EB', cScale1: '#D1D5DB', cScale2: '#F3F4F6', git0: '#111827', git1: '#4B5563', git2: '#9CA3AF' },
} as const
type ThemeId = keyof typeof THEMES
let seq = 0

export default function DiagramRenderer() {
  const [tpl, setTpl] = useState('flow')
  const [code, setCode] = useState(TEMPLATES.flow.code)
  const [theme, setTheme] = useState<ThemeId>('gold')
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [scale, setScale] = useState(2)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let dead = false
    const id = setTimeout(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', htmlLabels: false, flowchart: { htmlLabels: false }, fontFamily: 'Inter, Arial, sans-serif', themeVariables: { ...THEMES[theme], fontFamily: 'Inter, Arial, sans-serif' } } as any)
        await mermaid.parse(code)
        const { svg } = await mermaid.render(`of-diagram-${++seq}`, code)
        if (!dead) { setSvg(svg); setErr(null) }
      } catch (e: any) {
        document.querySelectorAll('[id^="dof-diagram-"]').forEach((n) => n.remove())
        if (!dead) setErr(String(e?.message || e).split('\n').slice(0, 4).join('\n'))
      }
    }, 350)
    return () => { dead = true; clearTimeout(id) }
  }, [code, theme])
  // memoised: a new Blob per render looped through new object URLs and revoked the one the picture was loading
  const svgBlob = useMemo(() => (svg ? new Blob([svg], { type: 'image/svg+xml' }) : null), [svg])
  const url = useBlobUrl(svgBlob)
  const png = async (type: 'image/png' | 'image/jpeg') => {
    if (!svgBlob) return
    const u = URL.createObjectURL(svgBlob)
    const img = new Image()
    try { img.src = u; await img.decode() } catch { URL.revokeObjectURL(u); toast('Could not draw the picture.', 'error'); return }
    const vb = svg.match(/viewBox="([-\d.\s]+)"/)?.[1]?.split(/\s+/).map(Number)
    const w = (vb?.[2] || img.naturalWidth || 800), h = (vb?.[3] || img.naturalHeight || 600)
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale)
    const ctx = c.getContext('2d')!
    if (type === 'image/jpeg' || theme === 'gold') { ctx.fillStyle = THEMES[theme].background; ctx.fillRect(0, 0, c.width, c.height) }
    ctx.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(u)
    c.toBlob((b) => (b ? downloadBlob(b, `diagram.${type === 'image/png' ? 'png' : 'jpg'}`) : toast('Could not save the picture.', 'error')), type, 0.93)
  }
  return (
    <ToolGrid
      main={<>
        <div ref={box} className="grid min-h-80 place-items-center overflow-auto rounded-2xl border border-border p-4" style={{ background: THEMES[theme].background }}>
          {url && <img src={safeBlobUrl(url)} alt="Diagram" className="max-h-[60vh] max-w-full" />}
          {!url && !err && <span className="text-sm text-muted">Drawing</span>}
        </div>
        {err && <pre className="whitespace-pre-wrap rounded-xl border border-danger/40 bg-danger/5 p-3 text-xs text-danger">{err}</pre>}
        <Textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="Diagram code" className="min-h-60" />
        <div className="flex flex-wrap gap-2"><OpenButton accept=".mmd,.mermaid,.md,.txt" onFiles={async (f) => { const t = await f[0].text(); setCode(t.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? t) }} label="Open .mmd file" /><CopyButton text={code} label="Copy code" /></div>
      </>}
      side={<>
        <Field label="Start from"><Select value={tpl} onChange={(v) => { setTpl(v); setCode(TEMPLATES[v].code) }} options={Object.entries(TEMPLATES).map(([value, t]) => ({ value, label: t.label }))} /></Field>
        <Field label="Colours"><Segmented value={theme} onChange={setTheme} options={[{ value: 'gold', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'mono', label: 'Print' }]} /></Field>
        <Field label="Picture size"><Segmented value={String(scale)} onChange={(v) => setScale(+v)} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v + 'x' }))} /></Field>
        <Button size="lg" className="w-full" icon={<ImageDown className="size-5" />} disabled={!svg} onClick={() => png('image/png')}>Download PNG</Button>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!svg} onClick={() => downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'diagram.svg')}>SVG</Button>
          <Button size="sm" variant="outline" icon={<Download className="size-4" />} disabled={!svg} onClick={() => png('image/jpeg')}>JPG</Button>
          <Button size="sm" variant="outline" icon={<Maximize2 className="size-4" />} disabled={!url} onClick={() => box.current?.requestFullscreen?.()}>Full screen</Button>
        </div>
        <p className="text-xs text-muted">Write diagrams as text with Mermaid syntax. The picture redraws as you type, and the same code works in GitHub, GitLab and Notion.</p>
      </>}
    />
  )
}

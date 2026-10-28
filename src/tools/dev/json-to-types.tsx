import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, Field, Input, Label, Select, Switch, Textarea, ToolGrid, ErrorNote, CopyButton, Spinner } from '@/components/ui'
import { downloadBlob } from '@/lib/files'

const LANGS: { id: string; label: string; ext: string; justTypes?: boolean }[] = [
  { id: 'typescript', label: 'TypeScript', ext: 'ts', justTypes: true },
  { id: 'typescript-zod', label: 'TypeScript + Zod', ext: 'ts' },
  { id: 'go', label: 'Go', ext: 'go', justTypes: true },
  { id: 'rust', label: 'Rust (serde)', ext: 'rs' },
  { id: 'python', label: 'Python (dataclasses)', ext: 'py', justTypes: true },
  { id: 'java', label: 'Java', ext: 'java', justTypes: true },
  { id: 'csharp', label: 'C#', ext: 'cs' },
  { id: 'swift', label: 'Swift (Codable)', ext: 'swift', justTypes: true },
  { id: 'kotlin', label: 'Kotlin', ext: 'kt', justTypes: true },
  { id: 'dart', label: 'Dart', ext: 'dart', justTypes: true },
  { id: 'cpp', label: 'C++', ext: 'hpp', justTypes: true },
  { id: 'php', label: 'PHP', ext: 'php' },
  { id: 'ruby', label: 'Ruby', ext: 'rb', justTypes: true },
  { id: 'elm', label: 'Elm', ext: 'elm' },
  { id: 'schema', label: 'JSON Schema', ext: 'json' },
]
const SAMPLE = `{
  "id": 1024,
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "active": true,
  "roles": ["admin", "editor"],
  "address": { "city": "London", "zip": "N1 9GU" },
  "projects": [
    { "title": "Engine notes", "stars": 42, "tags": ["math"] },
    { "title": "Poetry", "stars": 7, "tags": [], "archived": true }
  ]
}`

export default function JsonToTypes() {
  const [json, setJson] = useState(SAMPLE)
  const [lang, setLang] = useState('typescript')
  const [name, setName] = useState('Root')
  const [justTypes, setJustTypes] = useState(true)
  const [optional, setOptional] = useState(false)
  const [out, setOut] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const L = LANGS.find((l) => l.id === lang)!

  useEffect(() => {
    let dead = false
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        try { JSON.parse(json) } catch (e: any) { throw new Error('Invalid JSON: ' + e.message) }
        const qt = await import('quicktype-core')
        const input = qt.jsonInputForTargetLanguage(lang as any)
        await input.addSource({ name: name.trim() || 'Root', samples: [json] })
        const data = new qt.InputData(); data.addInput(input)
        const opts: Record<string, string> = {}
        if (L.justTypes && justTypes) opts['just-types'] = 'true'
        if (lang === 'typescript' || lang === 'typescript-zod') opts['prefer-unions'] = 'true'
        if (lang === 'rust') { opts['derive-debug'] = 'true'; opts.density = 'dense' }
        const res = await qt.quicktype({ inputData: data, lang: lang as any, rendererOptions: opts, inferEnums: false, inferDateTimes: true, allPropertiesOptional: optional, inferUuids: true, inferIntegerStrings: false })
        if (!dead) { setOut(res.lines.join('\n')); setErr(null) }
      } catch (e: any) { if (!dead) setErr(e?.message || String(e)) }
      finally { if (!dead) setBusy(false) }
    }, 300)
    return () => { dead = true; clearTimeout(t) }
  }, [json, lang, name, justTypes, optional])

  return (
    <ToolGrid
      main={<div className="grid gap-4 xl:grid-cols-2">
        <div><Label hint={<span className="flex gap-2"><button className="underline cursor-pointer" onClick={() => { try { setJson(JSON.stringify(JSON.parse(json), null, 2)) } catch { /* keep */ } }}>Format</button><button className="underline cursor-pointer" onClick={() => setJson('')}>Clear</button></span>}>JSON input</Label><Textarea value={json} onChange={(e) => setJson(e.target.value)} className="min-h-[60vh]" spellCheck={false} aria-label="JSON input" /></div>
        <div><Label hint={<span className="flex items-center gap-2">{busy && <Spinner />}<CopyButton text={out} /></span>}>{L.label}</Label><pre className="min-h-[60vh] overflow-auto rounded-xl border border-border bg-surface-2/50 p-3 font-mono text-[13px] leading-relaxed scrollbar-thin">{out}</pre></div>
      </div>}
      side={<>
        <Field label="Language"><Select value={lang} onChange={setLang} options={LANGS.map((l) => ({ value: l.id, label: l.label }))} /></Field>
        <Field label="Top-level type name"><Input value={name} onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))} /></Field>
        {L.justTypes && <Switch checked={justTypes} onChange={setJustTypes} label="Types only (no parse helpers)" />}
        <Switch checked={optional} onChange={setOptional} label="Make every field optional" />
        <p className="text-xs text-muted">Paste an array of several objects for better results: fields missing in some items become optional.</p>
        <ErrorNote error={err} />
        <Button size="lg" className="w-full" disabled={!out} icon={<Download className="size-4" />} onClick={() => downloadBlob(new Blob([out], { type: 'text/plain' }), `${name || 'types'}.${L.ext}`)}>Download .{L.ext}</Button>
      </>}
    />
  )
}

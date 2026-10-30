import { useEffect, useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { Button, Segmented, Input, Label } from '@/components/ui'
import { Bar, Status, TwoPane, useStored, useDebounced } from './_b5/shell'

const SAMPLE = `docker run -d --name web -p 8080:80 -v ./site:/usr/share/nginx/html:ro --restart unless-stopped nginx:alpine
docker run -d --name db -e POSTGRES_USER=app -e POSTGRES_PASSWORD=secret -v pgdata:/var/lib/postgresql/data --health-cmd "pg_isready -U app" postgres:16`

/** Join shell line continuations and split into separate docker commands. */
function splitCommands(src: string) {
  return src.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ').replace(/`\r?\n/g, ' ').split(/\r?\n|&&|;/).map((l) => l.trim()).filter((l) => /^(sudo\s+)?(docker|podman)\s/.test(l)).map((l) => l.replace(/^sudo\s+/, ''))
}

export default function DockerComposeConverter() {
  const [input, setInput] = useStored('b5:compose:input', SAMPLE)
  const [indent, setIndent] = useState<'2' | '4'>('2')
  const [project, setProject] = useState('my-app')
  const [out, setOut] = useState<{ yaml?: string; err?: string; n?: number }>({})
  const di = useDebounced(input, 250)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const cmds = splitCommands(di)
      if (!di.trim()) return setOut({})
      if (!cmds.length) return setOut({ err: 'No docker run (or podman run) command found. Each command should start with docker or podman.' })
      try {
        const mod: any = await import('composerize'); const composerize = mod.default ?? mod
        let yaml = ''
        for (const c of cmds) yaml = composerize(c, yaml || undefined, 'latest', Number(indent))
        yaml = yaml.replace(/^name: <your project name>/m, `name: ${project || 'my-app'}`)
        if (alive) setOut({ yaml, n: cmds.length })
      } catch (e: any) { if (alive) setOut({ err: e?.message || String(e) }) }
    })()
    return () => { alive = false }
  }, [di, indent, project])
  return (
    <div className="space-y-4">
      <Bar>
        <label className="flex items-center gap-2"><Label className="mb-0">Project name</Label><Input aria-label="Project name" value={project} onChange={(e) => setProject(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())} className="h-9 w-40" /></label>
        <Segmented value={indent} onChange={setIndent} options={[{ value: '2', label: '2 spaces' }, { value: '4', label: '4 spaces' }]} />
        <Button size="sm" variant="ghost" className="ml-auto" icon={<FileCode2 className="size-4" />} onClick={() => setInput(SAMPLE)}>Sample</Button>
      </Bar>
      {out.err ? <Status kind="err">{out.err}</Status> : out.yaml ? <Status kind="ok">{out.n} command{out.n === 1 ? '' : 's'} converted into {out.n === 1 ? 'one service' : `${out.n} services`}. Named volumes may need a top-level volumes section.</Status> : <Status kind="info">Paste one or more docker run commands. Lines ending in \ are joined.</Status>}
      <TwoPane input={input} setInput={setInput} inputTitle="docker run commands" outputTitle="compose.yaml" output={out.yaml ?? ''} outName="compose.yaml" outMime="application/yaml" accept=".sh,.txt,text/*" height="h-[460px]" />
    </div>
  )
}

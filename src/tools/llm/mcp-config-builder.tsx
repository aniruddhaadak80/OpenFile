import { useMemo, useState } from 'react'
import { Plus, Trash2, Upload } from 'lucide-react'
import { Button, Input, Label, Select, Textarea, ToolGrid, Segmented, Switch, ErrorNote } from '@/components/ui'
import { OutBox } from '@/lib/cf/ui'
import { buildMcp, parseMcp, mcpWarnings, shellSplit, MCP_TARGETS, type McpServer, type McpTarget } from '@/lib/r15/llm'
import { Panel } from '@/lib/r15/ui'

const PRESETS: { label: string; s: McpServer }[] = [
  { label: 'Filesystem', s: { name: 'filesystem', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/me/Documents'] } },
  { label: 'Memory', s: { name: 'memory', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] } },
  { label: 'Fetch', s: { name: 'fetch', transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'] } },
  { label: 'Git', s: { name: 'git', transport: 'stdio', command: 'uvx', args: ['mcp-server-git', '--repository', '/path/to/repo'] } },
  { label: 'Playwright', s: { name: 'playwright', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] } },
  { label: 'Remote server', s: { name: 'remote', transport: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'Bearer YOUR_TOKEN' } } },
]
const kv = (o?: Record<string, string>) => Object.entries(o ?? {}).map(([k, v]) => `${k}=${v}`).join('\n')
const unkv = (s: string, sep = '=') => Object.fromEntries(s.split('\n').map((l) => l.trim()).filter((l) => l.includes(sep)).map((l) => { const i = l.indexOf(sep); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const argLine = (a?: string[]) => (a ?? []).map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ')

export default function McpConfigBuilder() {
  const [servers, setServers] = useState<McpServer[]>([PRESETS[0].s, PRESETS[1].s])
  const [target, setTarget] = useState<McpTarget>('claude-desktop'), [inputs, setInputs] = useState(true), [cli, setCli] = useState(false)
  const [imp, setImp] = useState(''), [impErr, setImpErr] = useState<string | null>(null)
  const set = (i: number, p: Partial<McpServer>) => setServers((a) => a.map((s, k) => (k === i ? { ...s, ...p } : s)))
  const out = useMemo(() => buildMcp(servers, target, { inputs: target === 'vscode' ? inputs : target === 'claude-code' ? !cli : undefined }), [servers, target, inputs, cli])
  const warns = useMemo(() => mcpWarnings(servers), [servers])
  const t = MCP_TARGETS.find((x) => x.value === target)!
  const where: Record<McpTarget, string> = {
    'claude-desktop': 'Settings, Developer, Edit Config. On macOS ~/Library/Application Support/Claude/claude_desktop_config.json, on Windows %APPDATA%\\Claude\\claude_desktop_config.json. Restart Claude after saving.',
    cursor: '.cursor/mcp.json in your project, or ~/.cursor/mcp.json for every project.',
    vscode: '.vscode/mcp.json in your workspace. Secrets become inputs that VS Code asks for once and stores safely.',
    windsurf: '~/.codeium/windsurf/mcp_config.json, then press Refresh in the MCP panel.',
    'claude-code': cli ? 'Run these commands in a terminal inside your project.' : '.mcp.json at the root of your project, shared with your team through git.',
    gemini: 'The mcpServers block in ~/.gemini/settings.json or .gemini/settings.json in a project.',
  }
  const doImport = () => { setImpErr(null); try { setServers(parseMcp(imp)); setImp('') } catch (e: any) { setImpErr(e?.message || String(e)) } }
  return (
    <ToolGrid
      main={<>
        <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <Button key={p.label} size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => { let n = p.s.name, k = 2; while (servers.some((s) => s.name === n)) n = `${p.s.name}-${k++}`; setServers([...servers, { ...structuredClone(p.s), name: n }]) }}>{p.label}</Button>)}</div>
        {servers.map((s, i) => (
          <Panel key={i} title={<span className="font-mono">{s.name || 'unnamed'}</span>} hint={s.transport === 'stdio' ? 'runs on your computer' : 'remote server'}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div><Label>Name</Label><Input aria-label="Server name" value={s.name} onChange={(e) => set(i, { name: e.target.value })} /></div>
              <div><Label>Type</Label><Segmented value={s.transport} onChange={(v) => set(i, { transport: v })} options={[{ value: 'stdio', label: 'Command' }, { value: 'http', label: 'HTTP' }, { value: 'sse', label: 'SSE' }]} /></div>
            </div>
            {s.transport === 'stdio' ? <div className="mt-3 grid gap-3">
              <div><Label hint="paste a whole command line to split it">Command and arguments</Label><Input aria-label="Command and arguments" className="font-mono text-[13px]" value={[s.command ?? '', argLine(s.args)].join(' ').trim()} onChange={(e) => { const w = shellSplit(e.target.value); set(i, { command: w[0] ?? '', args: w.slice(1) }) }} placeholder="npx -y @modelcontextprotocol/server-filesystem /path" /></div>
              <div><Label hint="one KEY=value per line">Environment variables</Label><Textarea aria-label="Environment variables" className="min-h-16 font-mono text-[12.5px]" defaultValue={kv(s.env)} onBlur={(e) => set(i, { env: unkv(e.target.value) })} placeholder="GITHUB_TOKEN=..." /></div>
            </div> : <div className="mt-3 grid gap-3">
              <div><Label>URL</Label><Input aria-label="Server URL" className="font-mono text-[13px]" value={s.url ?? ''} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://example.com/mcp" /></div>
              <div><Label hint="one Name: value per line">Headers</Label><Textarea aria-label="Headers" className="min-h-16 font-mono text-[12.5px]" defaultValue={Object.entries(s.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n')} onBlur={(e) => set(i, { headers: unkv(e.target.value, ':') })} placeholder="Authorization: Bearer ..." /></div>
            </div>}
            <Button className="mt-3" size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setServers(servers.filter((_, k) => k !== i))}>Remove</Button>
          </Panel>))}
        <Button variant="outline" icon={<Plus className="size-4" />} onClick={() => setServers([...servers, { name: `server-${servers.length + 1}`, transport: 'stdio', command: '', args: [] }])}>Add a server</Button>
        {warns.length > 0 && <ul className="space-y-1 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{warns.map((w) => <li key={w}>{w}</li>)}</ul>}
        <OutBox title={`${t.label}: ${cli && target === 'claude-code' ? 'commands' : t.file}`} text={out} filename={cli && target === 'claude-code' ? 'add-mcp-servers.sh' : t.file.split('/').pop()} mime={cli && target === 'claude-code' ? 'text/x-shellscript' : 'application/json'} />
        <p className="text-sm text-muted">{where[target]}</p>
      </>}
      side={<>
        <div><Label>App</Label><Select aria-label="App" value={target} onChange={(v) => setTarget(v as McpTarget)} options={MCP_TARGETS.map((x) => ({ value: x.value, label: x.label }))} /></div>
        {target === 'vscode' && <Switch checked={inputs} onChange={setInputs} label="Turn secrets into VS Code inputs" />}
        {target === 'claude-code' && <Switch checked={cli} onChange={setCli} label="Show as claude mcp add commands" />}
        {target === 'claude-desktop' && servers.some((s) => s.transport !== 'stdio') && <p className="text-xs text-muted">Claude Desktop config files start local commands, so remote servers are wrapped with the mcp-remote bridge.</p>}
        <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="text-sm font-semibold">Import a config</div>
          <Textarea aria-label="Config to import" className="min-h-24 font-mono text-[12px]" value={imp} onChange={(e) => setImp(e.target.value)} placeholder='{"mcpServers": {...}}' />
          <Button size="sm" className="w-full" icon={<Upload className="size-4" />} disabled={!imp.trim()} onClick={doImport}>Import and convert</Button>
          <ErrorNote error={impErr} />
          <p className="text-xs text-muted">Paste a config from any of these apps to move your servers to another one.</p>
        </div>
      </>}
    />
  )
}

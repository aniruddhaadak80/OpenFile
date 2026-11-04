import { useMemo, useState } from 'react'
import { Label, Textarea, ToolGrid, Dropzone, Select, Empty } from '@/components/ui'
import { OutBox, Stat, Stats } from '@/lib/cf/ui'
import { readStream } from '@/lib/r15/llm'
import { Panel, fmtNum } from '@/lib/r15/ui'

const SAMPLES: Record<string, string> = {
  openai: [
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":"The weather "}}]}',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"tool will check Pune for you."}}]}',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_7","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":"}}]}}]}',
    'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Pune\\",\\"unit\\":\\"c\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":61,"completion_tokens":24,"total_tokens":85}}',
    'data: [DONE]'].join('\n\n'),
  anthropic: [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5","usage":{"input_tokens":42,"output_tokens":1}}}',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Here are three names: "}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Fernleaf, Mossway and Pebble."}}',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":18}}',
    'event: message_stop\ndata: {"type":"message_stop"}'].join('\n\n'),
  gemini: 'data: {"candidates":[{"content":{"parts":[{"text":"Sure. "}],"role":"model"}}],"modelVersion":"gemini-2.5-flash"}\n\ndata: {"candidates":[{"content":{"parts":[{"text":"Water the plant once a week."}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":11,"totalTokenCount":20},"modelVersion":"gemini-2.5-flash"}',
  ollama: '{"model":"llama3.2","created_at":"2026-01-01T10:00:00Z","message":{"role":"assistant","content":"Hello"},"done":false}\n{"model":"llama3.2","created_at":"2026-01-01T10:00:01Z","message":{"role":"assistant","content":" there."},"done":true,"done_reason":"stop","prompt_eval_count":12,"eval_count":3}',
}

const pretty = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s } }
export default function LlmStreamViewer() {
  const [text, setText] = useState(SAMPLES.openai), [sample, setSample] = useState('openai')
  const r = useMemo(() => readStream(text), [text])
  return (
    <ToolGrid
      main={<>
        <div><Label hint="data: lines, NDJSON or a JSON response">Raw response</Label><Textarea aria-label="Raw response" value={text} onChange={(e) => setText(e.target.value)} className="min-h-44 font-mono text-[12px]" spellCheck={false} /></div>
        <Dropzone compact accept=".txt,.json,.jsonl,.ndjson,.sse,.log,.har" onFiles={async (f) => f[0] && setText(await f[0].text())} label="Or drop a saved response or log" sub="Read on your device." />
        {r.events ? <>
          <Stats cols={4}>
            <Stat label="API" value={<span className="text-base">{r.provider}</span>} sub={r.model} />
            <Stat label="Chunks" value={fmtNum(r.events)} />
            <Stat label="Tokens in / out" value={<span className="text-base">{r.usage.input ?? '-'} / {r.usage.output ?? '-'}</span>} sub={r.usage.cached ? `${r.usage.cached} cached` : r.usage.total != null ? `${r.usage.total} total` : 'no usage sent'} />
            <Stat label="Stop reason" value={<span className="text-base">{r.stop ?? '-'}</span>} />
          </Stats>
          {r.errors.length > 0 && <ul className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{r.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
          <OutBox title="Text" text={r.text} filename="response.txt" />
          {r.reasoning && <OutBox title="Reasoning or thinking" text={r.reasoning} filename="reasoning.txt" />}
          {r.tools.length > 0 && <Panel title="Tool calls" hint={`${r.tools.length}`}>
            <ul className="space-y-2">{r.tools.map((t, i) => <li key={i} className="rounded-xl border border-border p-2.5"><div className="text-sm"><b className="font-mono">{t.name || '(no name)'}</b>{t.id && <span className="ml-2 text-xs text-muted">{t.id}</span>}</div><pre className="mt-1 overflow-auto font-mono text-[12px] whitespace-pre-wrap break-all">{pretty(t.args)}</pre></li>)}</ul>
          </Panel>}
        </> : <Empty>Paste a streamed or plain response from an LLM API to see the full text.</Empty>}
      </>}
      side={<>
        <div><Label>Example</Label><Select aria-label="Example" value={sample} onChange={(v) => { setSample(v); setText(SAMPLES[v]) }} options={[{ value: 'openai', label: 'OpenAI chat stream with a tool call' }, { value: 'anthropic', label: 'Anthropic messages stream' }, { value: 'gemini', label: 'Gemini stream' }, { value: 'ollama', label: 'Ollama NDJSON' }]} /></div>
        <p className="text-xs text-muted">Reads OpenAI Chat Completions and Responses, Anthropic Messages, Google Gemini and Ollama, plus any OpenAI compatible server such as Groq, Mistral, DeepSeek, OpenRouter, vLLM or LM Studio. Tool call arguments that arrive in pieces are joined back together.</p>
        <p className="text-xs text-muted">Copy a stream from your browser's network panel (the EventStream or Response tab) or from curl with -N.</p>
      </>}
    />
  )
}

import{o as e}from"./rolldown-runtime-BCiCTKAo.js";import{z as t}from"./files-DFsEDWi8.js";import{Vt as n,a as r,b as i,d as a,h as o,o as s,x as c}from"./ui-DzFkf8NZ.js";import{E as l}from"./llm-wjRJlSjh.js";import{c as u,i as d,l as f}from"./ui-BR2w0jXg.js";import{i as p,u as m}from"./ui-DiKxC14-.js";var h=e(t(),1),g=n(),_={openai:`data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":"The weather "}}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"content":"tool will check Pune for you."}}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_7","type":"function","function":{"name":"get_weather","arguments":"{\\"city\\":"}}]}}]}

data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4o-mini","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Pune\\",\\"unit\\":\\"c\\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":61,"completion_tokens":24,"total_tokens":85}}

data: [DONE]`,anthropic:`event: message_start
data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5","usage":{"input_tokens":42,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Here are three names: "}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Fernleaf, Mossway and Pebble."}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":18}}

event: message_stop
data: {"type":"message_stop"}`,gemini:`data: {"candidates":[{"content":{"parts":[{"text":"Sure. "}],"role":"model"}}],"modelVersion":"gemini-2.5-flash"}

data: {"candidates":[{"content":{"parts":[{"text":"Water the plant once a week."}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":11,"totalTokenCount":20},"modelVersion":"gemini-2.5-flash"}`,ollama:`{"model":"llama3.2","created_at":"2026-01-01T10:00:00Z","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"llama3.2","created_at":"2026-01-01T10:00:01Z","message":{"role":"assistant","content":" there."},"done":true,"done_reason":"stop","prompt_eval_count":12,"eval_count":3}`},v=e=>{try{return JSON.stringify(JSON.parse(e),null,2)}catch{return e}};function y(){let[e,t]=(0,h.useState)(_.openai),[n,y]=(0,h.useState)(`openai`),b=(0,h.useMemo)(()=>l(e),[e]);return(0,g.jsx)(c,{main:(0,g.jsxs)(g.Fragment,{children:[(0,g.jsxs)(`div`,{children:[(0,g.jsx)(a,{hint:`data: lines, NDJSON or a JSON response`,children:`Raw response`}),(0,g.jsx)(i,{"aria-label":`Raw response`,value:e,onChange:e=>t(e.target.value),className:`min-h-44 font-mono text-[12px]`,spellCheck:!1})]}),(0,g.jsx)(r,{compact:!0,accept:`.txt,.json,.jsonl,.ndjson,.sse,.log,.har`,onFiles:async e=>e[0]&&t(await e[0].text()),label:`Or drop a saved response or log`,sub:`Read on your device.`}),b.events?(0,g.jsxs)(g.Fragment,{children:[(0,g.jsxs)(f,{cols:4,children:[(0,g.jsx)(u,{label:`API`,value:(0,g.jsx)(`span`,{className:`text-base`,children:b.provider}),sub:b.model}),(0,g.jsx)(u,{label:`Chunks`,value:m(b.events)}),(0,g.jsx)(u,{label:`Tokens in / out`,value:(0,g.jsxs)(`span`,{className:`text-base`,children:[b.usage.input??`-`,` / `,b.usage.output??`-`]}),sub:b.usage.cached?`${b.usage.cached} cached`:b.usage.total==null?`no usage sent`:`${b.usage.total} total`}),(0,g.jsx)(u,{label:`Stop reason`,value:(0,g.jsx)(`span`,{className:`text-base`,children:b.stop??`-`})})]}),b.errors.length>0&&(0,g.jsx)(`ul`,{className:`rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger`,children:b.errors.slice(0,10).map((e,t)=>(0,g.jsx)(`li`,{children:e},t))}),(0,g.jsx)(d,{title:`Text`,text:b.text,filename:`response.txt`}),b.reasoning&&(0,g.jsx)(d,{title:`Reasoning or thinking`,text:b.reasoning,filename:`reasoning.txt`}),b.tools.length>0&&(0,g.jsx)(p,{title:`Tool calls`,hint:`${b.tools.length}`,children:(0,g.jsx)(`ul`,{className:`space-y-2`,children:b.tools.map((e,t)=>(0,g.jsxs)(`li`,{className:`rounded-xl border border-border p-2.5`,children:[(0,g.jsxs)(`div`,{className:`text-sm`,children:[(0,g.jsx)(`b`,{className:`font-mono`,children:e.name||`(no name)`}),e.id&&(0,g.jsx)(`span`,{className:`ml-2 text-xs text-muted`,children:e.id})]}),(0,g.jsx)(`pre`,{className:`mt-1 overflow-auto font-mono text-[12px] whitespace-pre-wrap break-all`,children:v(e.args)})]},t))})})]}):(0,g.jsx)(s,{children:`Paste a streamed or plain response from an LLM API to see the full text.`})]}),side:(0,g.jsxs)(g.Fragment,{children:[(0,g.jsxs)(`div`,{children:[(0,g.jsx)(a,{children:`Example`}),(0,g.jsx)(o,{"aria-label":`Example`,value:n,onChange:e=>{y(e),t(_[e])},options:[{value:`openai`,label:`OpenAI chat stream with a tool call`},{value:`anthropic`,label:`Anthropic messages stream`},{value:`gemini`,label:`Gemini stream`},{value:`ollama`,label:`Ollama NDJSON`}]})]}),(0,g.jsx)(`p`,{className:`text-xs text-muted`,children:`Reads OpenAI Chat Completions and Responses, Anthropic Messages, Google Gemini and Ollama, plus any OpenAI compatible server such as Groq, Mistral, DeepSeek, OpenRouter, vLLM or LM Studio. Tool call arguments that arrive in pieces are joined back together.`}),(0,g.jsx)(`p`,{className:`text-xs text-muted`,children:`Copy a stream from your browser's network panel (the EventStream or Response tab) or from curl with -N.`})]})})}export{y as default};
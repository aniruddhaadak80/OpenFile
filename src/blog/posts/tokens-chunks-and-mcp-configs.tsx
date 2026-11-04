import { H2, H3, Note, Tip, T } from '../prose'
import { ChunkDemo } from '../demos-r15'

export default function TokensChunksMcp() {
  return <>
    <p>Building something with a language model means dealing with a handful of small, fussy things that have nothing to do with the clever part: how many tokens a prompt costs, how to cut documents into pieces for search, whether a training file is valid, what is inside a model file, and how to tell an app about your MCP servers. I kept opening random websites for each of these and pasting private prompts into them. So I built a set of tools for it, the <T to="category/llm">AI Builder</T> studio, and every one of them runs in your browser.</p>
    <H2>Tokens are not words</H2>
    <p>Models do not read letters or words. They read tokens, which are pieces of text from a fixed vocabulary of about 100,000 to 200,000 entries. Common English words are usually one token, longer or rarer words split into two or three, and spaces are often glued to the start of the next word. Prices, context limits and rate limits are all counted in tokens, so the count matters.</p>
    <ul>
      <li>English prose is about 4 characters or three quarters of a word per token.</li>
      <li>Code, numbers and non English text use more tokens for the same length.</li>
      <li>Each model family has its own tokenizer, so the same text gives different counts.</li>
    </ul>
    <p><T to="token-counter">Token Counter</T> loads the real tokenizer file for the model you pick (GPT-4o, GPT-4, Llama 3, Mistral, Qwen, Gemma or DeepSeek), which is only 1 to 8 MB, and encodes your text exactly as the model would. It colours each token, shows how much of the context window you are using, and works out the cost from the prices you type in. I left prices out on purpose, because they change every few months.</p>
    <H2>Chunking documents for RAG</H2>
    <p>Retrieval augmented generation, or RAG, means finding the few passages of your documents that answer a question and putting only those into the prompt. To do that the documents are cut into chunks, each chunk is turned into an embedding, and the question is matched against them. Bad chunks are the most common reason a RAG system gives poor answers: cut in the middle of a sentence and neither half makes sense.</p>
    <p>A recursive splitter tries the biggest natural break first. In Markdown that is a heading, then a blank line between paragraphs, then a line, a sentence and finally a word. Overlap repeats the end of one chunk at the start of the next, so a fact that sits on a boundary is not lost. Try it here:</p>
    <ChunkDemo />
    <p><T to="rag-chunker">RAG Text Chunker</T> does the same on whole documents, measures size in characters, words or real tokens, and exports JSONL with the source and position of each chunk. To see why chunks that mean the same thing end up close together, paste a few sentences into <T to="embedding-playground">Embedding Playground</T>. It runs a small embedding model on your device and draws a meaning map.</p>
    <H3>A sensible starting point</H3>
    <p>For question answering over help pages or notes, 256 to 512 tokens with 10 to 20 percent overlap works well. Short, precise answers like product specs prefer smaller chunks. Long reasoning over reports prefers bigger ones. Measure with real questions before you tune further.</p>
    <H2>Fine-tuning files</H2>
    <p>Fine-tuning services want JSONL: one JSON object per line, usually a list of messages with a role and content. A single broken line can fail a whole training job, after you have waited in a queue. <T to="finetune-dataset-checker">Fine-tune Dataset Checker</T> reads every line and lists problems by line number:</p>
    <ul>
      <li>Lines that are not valid JSON, often a missing quote or a trailing comma.</li>
      <li>Rows with no assistant reply, or an empty one, so there is nothing to learn.</li>
      <li>Unknown roles, system messages in the middle, and weights other than 0 or 1.</li>
      <li>Exact repeats of an earlier row, and rows over your token limit.</li>
    </ul>
    <p>It then gives you the clean rows and a shuffled train and validation split with a fixed seed, so you can repeat it. If your data is in another shape, such as Alpaca, ShareGPT or a spreadsheet of questions and answers, <T to="dataset-converter">Dataset Format Converter</T> moves it between them.</p>
    <H2>What is inside a model file</H2>
    <p>Local models come as GGUF files for llama.cpp, Ollama and LM Studio, or as safetensors files from Hugging Face. Both start with a header that describes everything else: the architecture, the context length, how the weights were quantized, the tokenizer, and a list of every tensor with its shape. <T to="model-file-inspector">GGUF and Safetensors Inspector</T> reads only that header, so a 40 GB model opens in a second. Bits per weight, the file size divided by the parameter count, tells you quickly how heavily a model was compressed.</p>
    <H2>MCP configs without the guesswork</H2>
    <p>The Model Context Protocol lets an assistant use tools you run, such as a file system, a browser or a database. Each app wants the same information in a slightly different file: Claude Desktop and Cursor use mcpServers, VS Code uses servers with a type field and can store secrets as inputs, Windsurf calls the address serverUrl, and Claude Code has its own command. <T to="mcp-config-builder">MCP Config Builder</T> keeps one list of servers and writes it for each app. Paste an existing config into Import to move it from one app to another.</p>
    <Tip>When a server will not start, check two things first: add -y after npx so it does not stop to ask before installing, and use full paths, because apps start servers from their own folder.</Tip>
    <p>And when you are debugging the model calls themselves, <T to="llm-stream-viewer">LLM Stream Viewer</T> turns a pasted stream of data lines back into the full text, the reasoning, the tool calls with their arguments joined together, and the token usage.</p>
    <Note title="Nothing leaves the tab">Prompts, datasets, configs with API keys and model files are read in your browser. The only download is the tokenizer or embedding model the first time you use one, and your browser keeps it for next time.</Note>
  </>
}

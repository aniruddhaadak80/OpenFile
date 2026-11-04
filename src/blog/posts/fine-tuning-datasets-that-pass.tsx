import { H2, H3, Note, Tip, T } from '../prose'
import { DatasetDemo } from '../demos-r15'

export default function FineTuningDatasetsThatPass() {
  return <>
    <p>A fine-tuning job that fails after twenty minutes because one line in the file has a trailing comma is a very common story. So is a job that runs fine and gives a model that answers with nothing, because a few hundred rows had an empty reply. None of this is hard to fix. It is just easy to miss when the file has thousands of lines. Here is how I check a dataset before it costs anything, and all of it runs in the browser.</p>
    <H2>What a fine-tuning file is</H2>
    <p>Almost every trainer reads JSONL: plain text with one JSON object per line. Each line is one example. There is no outer list and no comma between lines, which is why a single stray comma or a line break inside a string breaks the whole file. The object on each line comes in one of a few shapes:</p>
    <ul>
      <li><strong>Chat messages</strong>: a list of messages with a role (system, user, assistant, tool) and content. This is what OpenAI, Mistral and most chat models expect.</li>
      <li><strong>Prompt and completion</strong>: the older two field shape, still used for simple text models.</li>
      <li><strong>Alpaca</strong>: instruction, an optional input, and output. Common in open source training scripts.</li>
      <li><strong>ShareGPT</strong>: a conversations list where each turn has from (human or gpt) and value. Axolotl and LLaMA Factory read it.</li>
      <li><strong>Preference pairs</strong>: a prompt with a chosen and a rejected reply, for DPO.</li>
    </ul>
    <H2>The mistakes that fail a job</H2>
    <p>Most failures come from a short list. A line that is not valid JSON. A role spelled wrong, like bot or human in a chat file. An assistant message with no content. A chat with no assistant message at all, so there is nothing to learn from. A system message in the middle of a conversation. And rows that are much longer than the model's context, which trainers either cut or reject. Try a few here:</p>
    <DatasetDemo />
    <p><T to="finetune-dataset-checker">Fine-tune Dataset Checker</T> runs these rules on every line of a real file and lists each problem with its line number, so you can jump straight to it. It also finds duplicate rows by comparing the conversation text, which matters more than it sounds: a few hundred copies of the same example teach the model to repeat that one answer.</p>
    <H3>Tokens and the bill</H3>
    <p>Training is priced by tokens: the tokens in your file, times the number of epochs, times the price per million. The checker counts tokens for each row, with a quick estimate or with the real tokenizer of the model you train, and flags rows over your limit. For a single prompt, <T to="token-counter">Token Counter</T> shows exactly how the text is split and how much of the context it fills.</p>
    <Tip>Look at the longest five percent of rows first. They are usually the ones with pasted logs or whole documents that should have been cut.</Tip>
    <H2>Converting between formats</H2>
    <p>Datasets you find online rarely come in the shape your trainer wants. <T to="dataset-converter">Dataset Format Converter</T> reads each row into a neutral conversation (system, user, assistant and tool turns) and writes it back as OpenAI chat, ShareGPT, Alpaca or prompt and completion. It can add one system prompt to every row. It also reads CSV, so a spreadsheet of questions and answers becomes a training file once you pick which column is which.</p>
    <p>Tool turns only survive in formats that have a place for them. Alpaca has no tool role, so a chat with tool calls loses them on the way. The converter tells you when that happens instead of dropping them quietly.</p>
    <H2>Making many examples from one template</H2>
    <p>A lot of good training data starts as a template and a table: the same instruction with a different product, customer or question on each row. <T to="prompt-template-filler">Prompt Template Filler</T> finds the variables in a prompt, such as {'{{name}}'} or {'{{tone|friendly}}'}, and fills them from a CSV, one prompt per row. It saves the result as JSONL for a batch job, which is also a cheap way to generate replies you can then review and keep.</p>
    <H2>Split, then check again</H2>
    <p>Keep part of the data back to see whether the model really learned something. The checker makes a train and validation split with a seeded shuffle, so the same seed always gives the same split and you can repeat a run exactly. Ten percent for validation is a common start. Run the check once more on both files after any edit, because fixing one line by hand is exactly how the next trailing comma gets in.</p>
    <p>When the model is trained and you download it, <T to="model-file-inspector">GGUF and Safetensors Inspector</T> reads the header of the file and shows its architecture, quantization, context length and every tensor, without loading the weights.</p>
    <Note title="Why in the browser">Training data is often the most private thing in a project: real support chats, internal documents, customer names. These tools read the file inside your tab. Nothing is uploaded, and closing the tab clears it.</Note>
  </>
}

import { H2, H3, Note, Tip, T, Table } from '../prose'
import { AiReadinessDemo } from '../demos-more'

export default function AiInBrowser() {
  return <>
    <p>A few of the most popular tools in OpenFile use neural networks: the background remover, the image upscaler, the audio transcriber, the magic eraser and a couple more. People are often surprised that these run inside a browser tab with no server behind them. This post explains how that works, what happens the first time you use one, and why the experience is different on different devices.</p>
    <H2>A model is just a big file</H2>
    <p>A trained AI model is a file full of numbers, called weights, plus a description of the math that combines them. To run it you need two things: the file, and a runtime that can do that math quickly. On a server the runtime is usually PyTorch on a big GPU. In the browser, OpenFile uses ONNX Runtime Web, mostly through the Transformers.js library. It can run the same kind of model with WebAssembly on your CPU, or with WebGPU on your graphics card.</p>
    <p>So when you press a button in an AI tool, three things happen: the model file is fetched (once), the runtime loads it into memory, and your image or audio is pushed through it on your own hardware.</p>
    <H2>Check your device</H2>
    <p>The panel below shows what this browser offers to AI tools: whether WebGPU is available, how many CPU cores the WebAssembly path can use, how much storage the site may use for models, and whether any OpenFile model files are already cached on this device.</p>
    <AiReadinessDemo />
    <H2>The models behind each tool</H2>
    <Table head={['Tool', 'Model', 'First download']} rows={[
      [<T to="background-remover">Background Remover</T>, 'ISNet through @imgly/background-removal, in a Best quality and a Faster version', 'about 40 MB'],
      [<T to="image-upscaler">Image Upscaler</T>, 'Swin2SR, a 2x super-resolution transformer', 'a few tens of MB'],
      [<T to="audio-transcriber">Audio Transcriber</T>, 'Whisper by OpenAI, tiny or base', 'about 40 MB or 80 MB'],
      [<T to="subtitle-translator">Subtitle Translator</T>, 'NLLB-200 distilled, 200 languages', 'about 900 MB'],
    ]} />
    <p>Sizes are approximate and depend on the exact variant, but they give you a feel. A background remover costs about as much data as a short video clip. The translation model is a real download and worth doing on Wi-Fi.</p>
    <H2>Why the first run is slow and the second is fast</H2>
    <p>The first time, the tool shows a progress bar that says something like Downloading AI model (first run only). Once the file arrives, the OpenFile service worker stores it in a cache called openfile-models-v1. Every later run reads it from that cache instead of the network, so it starts in a second or two, and it works with no connection at all.</p>
    <p>Browsers can evict caches when a device runs very low on storage. If that ever happens, the next run simply downloads the model again. Nothing breaks.</p>
    <H2>Workers keep the page responsive</H2>
    <p>Running a neural network is heavy. If it ran on the same thread that draws the page, the tab would freeze, buttons would stop responding, and the browser might offer to kill the page. So each AI tool runs its model in a Web Worker, a background thread with its own memory. The page only sends the input and receives progress messages and the result.</p>
    <p>The upscaler goes one step further and cuts big images into tiles. Each tile goes through the model on its own, with a little overlap so the seams do not show, and the progress bar counts tiles. This keeps memory use flat even for large photos and means you see real progress instead of a spinner that might be stuck.</p>
    <H2>WebGPU first, WebAssembly as the safety net</H2>
    <p>WebGPU lets a web page use the graphics card for general math, and neural networks are mostly the kind of math GPUs are built for. When it is available, the upscaler and the transcriber try it first, and the background remover can use it too. On a laptop with a decent GPU this is often several times faster than the CPU path.</p>
    <p>But WebGPU is new, and real devices are messy. Some browsers expose <code>navigator.gpu</code> but cannot give a working adapter. Some drivers fail halfway through a model. So OpenFile does not trust the flag alone:</p>
    <ul>
      <li>It asks for a real adapter before choosing the GPU path.</li>
      <li>If the GPU path fails during a run, the worker retries once on WebAssembly before giving up.</li>
      <li>If AI upscaling still fails, the upscaler falls back to a compatibility mode with careful multi-step resampling and sharpening, so you still get a usable bigger image instead of an error message.</li>
    </ul>
    <Note title="Good to know">The tool always tells you which path it is on. The upscaler label reads Upscaling on GPU or Upscaling on CPU, so you know what speed to expect.</Note>
    <H2>What speed to expect</H2>
    <H3>On a recent laptop</H3>
    <p>Background removal of a phone photo takes a few seconds. Transcribing a ten minute recording with Whisper tiny takes a minute or two on the CPU and less on a GPU. Upscaling a 1000 pixel image 2x takes seconds on a GPU and noticeably longer on CPU.</p>
    <H3>On a phone</H3>
    <p>Phones work, but they have less memory and slow down when they get warm. Pick the Faster background model, keep images under about 2000 pixels on the long edge, and use Whisper tiny for transcripts. If a tool reports that it ran out of memory, a smaller input almost always fixes it.</p>
    <Tip>Keep the tab in the foreground while a long job runs. Browsers throttle background tabs, and on phones they may pause them entirely.</Tip>
    <H2>Why bother doing it this way</H2>
    <p>Cloud AI tools are fast because they run on expensive servers, and someone pays for those servers. Usually that someone is you, through a subscription, a watermark, or your data. Running the model locally costs a one-time download and some battery. In exchange your photos, voice memos and documents never leave your device, the tool keeps working offline, and it does not stop working when a company changes its pricing.</p>
    <p>If you want to try it, the <T to="background-remover">Background Remover</T> is the gentlest start: small model, quick result, and an easy way to see the first run and second run difference for yourself. The <T to="object-remover">Magic Eraser</T> and the <T to="photo-enhancer">Photo Enhancer</T> use the same approach.</p>
  </>
}

// Blog post bodies. Written in plain words. Headings with an id feed the table of contents.
// Writing rule: no em dashes, no exclamation marks.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LocalHashDemo, PageRangeDemo, BeforeAfterDemo, CapabilityDemo, PipelineDemo, ShortcutTrainer, FormatExplorer, JsonDemo, VoiceCheckDemo } from './demos'
// Newer posts live in their own files under ./posts/
import InstallAnywhere from './posts/install-openfile-on-any-device'
import AiInBrowser from './posts/ai-models-in-your-browser'
import ShrinkPdfForEmail from './posts/shrink-a-pdf-for-email'
import PhotoFormats from './posts/heic-jpg-avif-jpeg-xl'
import GifFromVideo from './posts/make-a-gif-from-a-video'
import SignAndFill from './posts/sign-and-fill-pdfs-privately'
import Ebooks from './posts/ebook-formats-and-conversion'
import CadInBrowser from './posts/open-dxf-cad-files-in-a-browser'
import Dicom from './posts/view-dicom-images-privately'
import Midi from './posts/midi-files-explained'
import DataFormats from './posts/csv-json-parquet-excel'
import Subtitles from './posts/subtitles-srt-vtt-ass-guide'
import BankStatementFiles from './posts/bank-statement-files-explained'
import InsideFitFile from './posts/what-is-inside-a-fit-file'
import ScanReceipts from './posts/scan-receipts-privately'

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const H2 = ({ children }: { children: string }) => <h2 id={slugify(children)}>{children}</h2>
const H3 = ({ children }: { children: string }) => <h3 id={slugify(children)}>{children}</h3>
const Note = ({ title = 'Note', children }: { title?: string; children: ReactNode }) => <div className="callout callout-note"><div className="callout-title">{title}</div><p>{children}</p></div>
const Tip = ({ children }: { children: ReactNode }) => <div className="callout callout-tip"><div className="callout-title">Tip</div><p>{children}</p></div>
const T = ({ to, children }: { to: string; children: ReactNode }) => <Link to={`/${to}`}>{children}</Link>

function Privacy() {
  return <>
    <p>People ask me one question more than any other: "Where do my files go?" The honest answer is that they stay in the browser tab you have open. This post explains what that means, how it works, and how you can check it yourself without trusting me.</p>
    <H2>The short version</H2>
    <p>When you drop a file into an OpenFile tool, the browser reads it into memory in that tab. The tool does its work with JavaScript, WebAssembly and the Canvas API on your own CPU or GPU. The result is turned into a download link that points at memory in the same tab. At no point is the file sent to a server.</p>
    <p>There is no account, no upload queue and no "processing on our side". There is not even a backend that could receive your files. The site is a set of static files on a CDN.</p>
    <H2>What actually happens to a file</H2>
    <ol>
      <li><strong>Reading.</strong> The browser gives the page a <code>File</code> object. Reading it with <code>arrayBuffer()</code> copies the bytes into the tab's memory.</li>
      <li><strong>Processing.</strong> A library does the work locally. For PDFs that is pdf-lib and PDF.js. For video it is ffmpeg compiled to WebAssembly. For background removal it is a small neural network running with WebAssembly or WebGPU.</li>
      <li><strong>Output.</strong> The result becomes a <code>Blob</code>. The page creates an object URL for it and your browser saves it like any other download.</li>
      <li><strong>Cleanup.</strong> Close the tab and the memory is gone. Nothing is written to a server, and the only things kept on your device are your settings, favorites and history, which you can clear in Settings.</li>
    </ol>
    <H2>Try it yourself</H2>
    <p>The demo below reads a file and computes its SHA-256 fingerprint. It also counts how many network requests the page made while it worked. Pick something large to make the point.</p>
    <LocalHashDemo />
    <H2>What does get downloaded</H2>
    <p>Some tools need a heavy engine the first time you use them. Video tools download ffmpeg (about 30 MB). OCR downloads Tesseract and a language file. AI tools download a model. These are downloads <em>to</em> your device, not uploads <em>from</em> it, and the service worker caches them so later runs work offline.</p>
    <Note title="Good to know">If you want to be sure, load a tool once, switch on airplane mode, and use it. Most tools keep working with no connection at all.</Note>
    <H2>The few things that are not local</H2>
    <p>I want to be precise here. The fonts on the site come from a font CDN. The Status page calls a tiny health check endpoint. Neither of these ever sees your files. If you self host OpenFile you can remove both.</p>
    <H2>Why I built it this way</H2>
    <p>Most free file tools on the web upload your document to a server, process it there, and ask you to trust that it gets deleted. For a payslip, a contract or a passport scan, that trust is a lot to ask. Browsers today are fast enough that the upload step is simply not needed for most jobs, so I removed it.</p>
    <p>The code is open source under the MIT license. If you want to read exactly what a tool does, every tool lives in its own file in the repository.</p>
  </>
}

function PdfTips() {
  return <>
    <p>I handle a lot of PDFs: forms, invoices, scanned notes, slides people export without thinking about size. Over time I picked up a few habits that make this work quick. Here are the ten I use the most.</p>
    <H2>1. Learn the page range syntax</H2>
    <p>Almost every PDF tool in OpenFile accepts ranges like <code>1-3, 7, 10-</code>. A dash with no end means "to the last page". Once this is in your fingers, splitting and extracting takes seconds.</p>
    <PageRangeDemo />
    <H2>2. Organize before you merge</H2>
    <p>Merging and then fixing the order is slower than getting each file right first. Open <T to="organize-pdf">Organize PDF</T>, drag pages into place, delete the blank ones, then <T to="merge-pdf">merge</T>.</p>
    <H2>3. Compress last</H2>
    <p>Compression works best on the final document. If you compress, then add pages, then compress again, you lose quality twice. Make <T to="compress-pdf">Compress PDF</T> your final step.</p>
    <H2>4. Scans are images, treat them that way</H2>
    <p>A scanned PDF is mostly pictures of pages. That is why scans are big and why compression helps them the most. Lowering image resolution to 150 DPI is usually invisible on screen.</p>
    <H2>5. Run OCR to make scans searchable</H2>
    <p><T to="ocr-pdf">OCR PDF</T> adds an invisible text layer on top of each scanned page. The page looks the same, but now you can search it, select text and copy it.</p>
    <H2>6. Sign without printing</H2>
    <p><T to="sign-pdf">Sign PDF</T> lets you draw, type or upload a signature and place it on any page. Nothing is uploaded, which matters a lot for contracts.</p>
    <H2>7. Redact properly</H2>
    <p>Drawing a black box over text in most viewers does not remove the text underneath. The redaction tool rasterizes the area so the original text is really gone.</p>
    <H2>8. Split big files by size for email</H2>
    <p>Many mail servers reject attachments over 20 or 25 MB. Splitting into chunks by page count is usually the fastest way under the limit.</p>
    <H2>9. Keep the original</H2>
    <p>Every tool gives you a new file and never changes the one you dropped in. I still keep a copy of the original in a folder called "source" before I start.</p>
    <H2>10. Chain it in the Workspace</H2>
    <p>If you do the same steps every week, the <Link to="/workspace">Workspace</Link> can run them as one recipe on a whole batch.</p>
    <Tip>Press Ctrl K (or Cmd K) anywhere on the site to jump straight to a tool by name.</Tip>
  </>
}

function ImageCompression() {
  return <>
    <p>Image compression sounds technical, but the idea is simple: store a picture using fewer bytes. The trick is deciding what to throw away. This post explains the main ideas in plain words, and there is a slider you can drag to see the result for yourself.</p>
    <H2>Lossless and lossy</H2>
    <p><strong>Lossless</strong> compression keeps every pixel exactly. PNG works this way. It is like zipping a file: smaller, but you get back exactly what you put in.</p>
    <p><strong>Lossy</strong> compression throws away detail your eyes are unlikely to notice. JPG, WebP and AVIF can all work this way. The quality setting decides how much gets thrown away.</p>
    <H2>Drag the slider</H2>
    <p>The image below is drawn in your browser and encoded with your browser's own JPG and WebP encoders. Lower the quality and watch the fine lines and the small text first. Then try one of your own photos.</p>
    <BeforeAfterDemo />
    <H2>What gets thrown away first</H2>
    <ul>
      <li><strong>Color detail.</strong> Eyes are more sensitive to brightness than to color, so encoders store color at lower resolution.</li>
      <li><strong>Fine texture.</strong> The image is split into small blocks and each block is described with a few wave patterns. High quality keeps more of them.</li>
      <li><strong>Sharp edges.</strong> Text and thin lines get soft halos at low quality. That is why screenshots look bad as JPG.</li>
    </ul>
    <H2>Which format should I use</H2>
    <ul>
      <li><strong>Photos for the web:</strong> WebP at quality 75 to 82. AVIF if you want the smallest files and can wait for slower encoding.</li>
      <li><strong>Screenshots, logos, text:</strong> PNG, or lossless WebP.</li>
      <li><strong>Maximum compatibility:</strong> JPG at quality 80 to 85.</li>
    </ul>
    <H2>Resize before you compress</H2>
    <p>The biggest saving is often not the quality setting at all. A 4000 pixel photo shown at 1200 pixels wastes most of its bytes. Run <T to="image-resizer">Image Resizer</T> first, then <T to="image-compressor">Image Compressor</T>.</p>
    <Tip>Set a default image quality in Settings. Every tool that does not choose its own quality will use it.</Tip>
  </>
}

function VideoWasm() {
  return <>
    <p>Editing video in a browser tab used to sound like a joke. Today it works well for most everyday jobs: trimming a clip, shrinking a file for chat, making a GIF. Here is how it works in OpenFile and how to get the best speed out of it.</p>
    <H2>ffmpeg, compiled for the browser</H2>
    <p>ffmpeg is the open-source tool behind a huge share of the world's video software. It is written in C. With a compiler called Emscripten, that C code becomes WebAssembly, a compact binary format that browsers run at close to native speed.</p>
    <p>So when you trim a video in OpenFile, real ffmpeg is running inside your tab. Your file is placed in a small in-memory file system, ffmpeg reads it, writes the result, and the page hands it back to you.</p>
    <H2>Why the first run is slower</H2>
    <p>The ffmpeg engine is about 30 MB. The first time you open a video tool, your browser downloads it once. After that it is cached, and the service worker keeps it available offline.</p>
    <H2>Check your browser</H2>
    <p>Speed depends on a few browser features. The demo below checks them on your device.</p>
    <CapabilityDemo />
    <H2>Tips for faster jobs</H2>
    <ul>
      <li><strong>Trim first.</strong> Every second you cut is a second ffmpeg does not have to encode.</li>
      <li><strong>Copy streams when you can.</strong> If you only cut a clip and keep the format, the trimmer can copy the streams without re-encoding. That is nearly instant.</li>
      <li><strong>Lower the resolution.</strong> 720p encodes roughly twice as fast as 1080p.</li>
      <li><strong>Keep the tab visible.</strong> Browsers slow down background tabs to save power.</li>
      <li><strong>Plug in your laptop.</strong> Power saving modes reduce CPU speed a lot.</li>
    </ul>
    <H2>Where it falls short</H2>
    <p>Very long 4K videos are still better handled by a desktop app. A tab has less memory to work with, and WebAssembly cannot yet use every hardware trick a native app can. For clips up to a few minutes, the browser is more than enough.</p>
  </>
}

function Pipeline() {
  return <>
    <p>Last month a friend who runs a small online store sent me 200 product photos. Each one needed the same treatment: resize, add a small watermark, remove location data, convert to WebP, and bundle them up. Doing that one by one would take an afternoon. With the Workspace it took a couple of minutes.</p>
    <H2>Plan the steps</H2>
    <p>I start by writing the steps down in order. Order matters. Resizing first makes every later step faster because there are fewer pixels to work on.</p>
    <ol>
      <li>Resize so the long edge is 1600 pixels.</li>
      <li>Add a small text watermark in the corner.</li>
      <li>Strip EXIF data, which can include GPS location.</li>
      <li>Convert to WebP at quality 80.</li>
      <li>Download everything as one ZIP.</li>
    </ol>
    <H2>Try the flow</H2>
    <p>Toggle steps on and off, then run it. This is a simulation, but the real Workspace looks and behaves the same way.</p>
    <PipelineDemo />
    <H2>Build it in the Workspace</H2>
    <p>Open the <Link to="/workspace">Workspace</Link>, drop the folder of photos, and add the steps from the list on the left. Each step has its own options. I run it on two or three test photos first, check the results, and only then run the whole batch.</p>
    <H2>Save it as a recipe</H2>
    <p>Once it looks right, save the pipeline as a recipe. Next month, when the next batch arrives, load the recipe, drop the files, press run. Recipes are stored in your browser and are included when you export your settings.</p>
    <Tip>Name recipes after the job, not the steps. "Store photos" is easier to find later than "resize watermark webp".</Tip>
    <H2>Why it is fast</H2>
    <p>There is no upload. 200 photos at 5 MB each is a gigabyte, which would take a long time to send to a server. Here the bytes never leave the machine, so the only limit is how fast your CPU can encode images.</p>
  </>
}

function Sketch() {
  return <>
    <p>The Sketch board is the tool I open most when I am thinking. It is an infinite canvas for boxes, arrows, sticky notes and quick drawings, and it autosaves in your browser. These tips help you draw diagrams much faster.</p>
    <H2>Use the number keys</H2>
    <p>Every drawing tool has a key. 1 is select, 2 is rectangle, 3 is diamond, 4 is ellipse, 5 is arrow, 6 is line, 7 is pencil, 8 is text. Once you stop reaching for the toolbar, diagrams come together quickly.</p>
    <ShortcutTrainer />
    <H2>Lock a tool with Q</H2>
    <p>Normally a tool switches back to select after you draw one shape. Press Q to keep it active, so you can draw ten boxes in a row. Press Q again to turn it off.</p>
    <H2>Connect shapes with arrows</H2>
    <p>Start an arrow on one shape and end it on another. The arrow binds to both, so when you move a box the arrow follows. This keeps diagrams tidy while you rearrange them.</p>
    <H2>Snap to the grid</H2>
    <p>Alt S turns snapping on. Shapes line up neatly and arrow keys move them by one grid step when you hold Shift.</p>
    <H2>Use frames for slides</H2>
    <p>Draw a frame around a part of the board and it becomes a slide. Alt P starts presenting, and arrow keys move between frames. It is a quick way to walk someone through an idea.</p>
    <H2>Export what you need</H2>
    <p>Export the whole board or only the selection as PNG or SVG. SVG stays sharp at any size, which is great for docs and READMEs.</p>
    <Tip>Press ? on the board to see every shortcut at once.</Tip>
  </>
}

function Formats() {
  return <>
    <p>File formats can feel like alphabet soup. PDF, DOCX, WebP, HEIC, MKV. Each one exists for a reason, and picking the right one saves space, time and headaches. This guide covers the formats I see most often, with an explorer you can click through.</p>
    <H2>Container and codec</H2>
    <p>For video and audio it helps to know two words. A <strong>container</strong> is the box: MP4, MKV, WebM, MOV. A <strong>codec</strong> is how the picture or sound inside is compressed: H.264, VP9, AV1, AAC, Opus. Two MP4 files can contain very different codecs, which is why one plays and the other does not.</p>
    <H2>Explore the formats</H2>
    <FormatExplorer />
    <H2>Quick rules of thumb</H2>
    <H3>Documents</H3>
    <ul><li>Sending something that must look the same everywhere: PDF.</li><li>Something people will edit: DOCX, or Markdown for technical docs.</li><li>Tables of data: CSV for exchange, XLSX when you need formulas.</li></ul>
    <H3>Images</H3>
    <ul><li>Photos: WebP or JPG.</li><li>Screenshots and logos: PNG or SVG.</li><li>iPhone photos to share with Windows users: convert HEIC to JPG with <T to="heic-converter">HEIC Converter</T>.</li></ul>
    <H3>Video and audio</H3>
    <ul><li>Sharing video: MP4 with H.264. It plays nearly everywhere.</li><li>Web video with small files: WebM.</li><li>Music to keep: FLAC. Music to share: AAC or MP3.</li></ul>
    <H2>When to convert</H2>
    <p>Convert at the end of your work, not in the middle. Every lossy conversion throws away a bit of quality, so going JPG to WebP to JPG makes things worse each time. Keep an original in a lossless format if you plan to edit it later.</p>
  </>
}

function DevTools() {
  return <>
    <p>I write code every day, and a handful of small tools save me from opening random websites and pasting secrets into them. These all run locally, so pasting a production token is safe.</p>
    <H2>JSON formatter</H2>
    <p>The one I use the most. Paste messy JSON, get it formatted, validated and searchable. Errors point to the exact line and column. Try a small version here.</p>
    <JsonDemo />
    <p>The full <T to="json-formatter">JSON Formatter</T> adds a tree view, path copying and conversion to other formats.</p>
    <H2>JWT decoder</H2>
    <p><T to="jwt-decoder">JWT Decoder</T> splits a token into header, payload and signature, shows expiry times in your time zone, and can verify HMAC signatures if you give it the secret. Since nothing leaves the tab, it is fine for real tokens.</p>
    <H2>Regex builder</H2>
    <p><T to="regex-builder">Regex Builder</T> highlights matches as you type, explains each part of the pattern, and lists capture groups. I use it to test patterns before they go into code.</p>
    <H2>Hashes</H2>
    <p><T to="hash-generator">Hash Generator</T> computes MD5, SHA-1, SHA-256 and SHA-512 for text or files. Handy for checking a download against a published checksum.</p>
    <H2>cURL to code</H2>
    <p>Copy a request as cURL from your browser's network panel, paste it into <T to="curl-to-code">cURL to Code</T>, and get fetch, Python requests, Go and more.</p>
    <H2>Cron parser</H2>
    <p><T to="cron-parser">Cron Parser</T> turns <code>*/15 9-17 * * 1-5</code> into plain words and lists the next run times. It has saved me from more than one job that ran at 3 AM by mistake.</p>
    <Tip>All developer tools keep their last input in memory while the tab is open, so you can jump between them without losing work.</Tip>
  </>
}

function Voice() {
  return <>
    <p>Text to speech is useful for proofreading, for accessibility, and for turning notes into something you can listen to on a walk. Most online options send your text to a cloud service. OpenFile does it on your device.</p>
    <H2>System voices first</H2>
    <p>Every major browser has a Speech Synthesis API that uses the voices installed on your operating system. On Windows, macOS, Android and iOS these voices are often very good, and they cost nothing to load.</p>
    <VoiceCheckDemo />
    <H2>When there are no voices</H2>
    <p>Some setups have no voices at all. Many Linux desktops and some privacy focused browsers report zero. Before, the tool simply showed "Voice 0 of 0", which was not helpful.</p>
    <p>Now, when no system voice is available, <T to="text-to-speech">Text to Speech</T> switches to a neural voice engine that runs in the tab. It is based on the open Kokoro model and runs with WebAssembly, or WebGPU when your browser has it. The model downloads once (around 90 MB), shows its progress, and is cached for next time.</p>
    <H2>Pick an engine</H2>
    <p>You can also choose the engine yourself. System voices start instantly. The neural engine sounds more natural with some voices and lets you download the result as a WAV file, which the system engine cannot do because browsers do not expose its audio.</p>
    <H2>Going the other way</H2>
    <p>If you need speech turned into text, <T to="audio-transcriber">Audio Transcriber</T> runs the Whisper model locally. Same idea: the audio never leaves your device.</p>
  </>
}

export const POST_BODIES: Record<string, () => ReactNode> = {
  'how-openfile-keeps-files-private': Privacy,
  'pdf-tips-that-save-time': PdfTips,
  'image-compression-explained': ImageCompression,
  'video-in-the-browser-with-webassembly': VideoWasm,
  'building-a-batch-pipeline': Pipeline,
  'sketch-board-tips': Sketch,
  'file-formats-guide': Formats,
  'developer-tools-roundup': DevTools,
  'private-text-to-speech': Voice,
  'install-openfile-on-any-device': InstallAnywhere,
  'ai-models-in-your-browser': AiInBrowser,
  'shrink-a-pdf-for-email': ShrinkPdfForEmail,
  'heic-jpg-avif-jpeg-xl': PhotoFormats,
  'make-a-gif-from-a-video': GifFromVideo,
  'sign-and-fill-pdfs-privately': SignAndFill,
  'ebook-formats-and-conversion': Ebooks,
  'open-dxf-cad-files-in-a-browser': CadInBrowser,
  'view-dicom-images-privately': Dicom,
  'midi-files-explained': Midi,
  'csv-json-parquet-excel': DataFormats,
  'subtitles-srt-vtt-ass-guide': Subtitles,
  'bank-statement-files-explained': BankStatementFiles,
  'what-is-inside-a-fit-file': InsideFitFile,
  'scan-receipts-privately': ScanReceipts,
}

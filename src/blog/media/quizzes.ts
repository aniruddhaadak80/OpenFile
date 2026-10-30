// Two quick check questions per post, shown in the "Check yourself" card at the end. Answers come from the post text.
// Writing rule: plain words, no em dashes, no exclamation marks. Add questions here when a new post is written.
export interface QuizQ { q: string; options: string[]; a: number; why: string }

export const QUIZZES: Record<string, QuizQ[]> = {
  'install-openfile-on-any-device': [
    { q: 'Which install option updates itself the moment a fix is published?', options: ['The installed web app', 'The Linux .deb package', 'A downloaded zip of the site'], a: 0, why: 'The web app picks up the new build on its next load, so it is always current.' },
    { q: 'Do settings sync between your phone and your laptop?', options: ['Yes, through an account', 'No, but you can export and import them', 'Only on iPhone'], a: 1, why: 'There is no server to sync through. Export your settings on one device and import them on the other.' },
  ],
  'how-openfile-keeps-files-private': [
    { q: 'Where does a file go when you drop it into an OpenFile tool?', options: ['To a processing server', 'Into memory in the open browser tab', 'Into a cloud folder'], a: 1, why: 'The browser reads it into the tab, the work happens on your device and the result is a local download.' },
    { q: 'What is the quickest way to check that a tool works without the network?', options: ['Read the terms', 'Load the tool, switch on airplane mode and use it', 'Clear the cache'], a: 1, why: 'Most tools keep working with no connection at all once their engine is cached.' },
  ],
  'ai-models-in-your-browser': [
    { q: 'Why is the first run of an AI tool slower than the second?', options: ['The model downloads once, then it is cached', 'The server warms up', 'The browser compiles your photo'], a: 0, why: 'The model file is downloaded the first time and kept in the cache, so later runs start right away.' },
    { q: 'What happens if your browser has no WebGPU?', options: ['The tool refuses to run', 'It falls back to WebAssembly on the CPU', 'It uploads the file instead'], a: 1, why: 'WebAssembly is the safety net. It is slower, but it works almost everywhere.' },
  ],
  'pdf-tips-that-save-time': [
    { q: 'What does the page range 10- mean?', options: ['Page 10 only', 'Pages 1 to 10', 'Page 10 to the last page'], a: 2, why: 'A dash with no end means up to the last page.' },
    { q: 'When should you compress a PDF?', options: ['First, before anything else', 'Last, on the final document', 'Never with scans'], a: 1, why: 'Compression works best on the finished document, after merging and editing.' },
  ],
  'shrink-a-pdf-for-email': [
    { q: 'Why leave headroom under the email size limit?', options: ['Attachments grow when they are encoded for sending', 'Mail servers round up', 'It makes the PDF load faster'], a: 0, why: 'Email encoding makes attachments about a third bigger, so a file right at the limit can still bounce.' },
    { q: 'What is the first step in the routine?', options: ['Split the file', 'Find out what is making it big', 'Turn it grayscale'], a: 1, why: 'Knowing whether images, fonts or scans are the heavy part tells you which fix will work.' },
  ],
  'image-compression-explained': [
    { q: 'What does lossless compression keep?', options: ['Every pixel exactly', 'Only the colours', 'Only the edges'], a: 0, why: 'Lossless formats rebuild the exact same pixels. Lossy ones throw away detail you are unlikely to notice.' },
    { q: 'What is often the biggest saving of all?', options: ['A lower quality setting', 'Resizing before you compress', 'Renaming the file'], a: 1, why: 'A photo shown at 1200 pixels wide does not need 4000 pixels, so resize first.' },
  ],
  'heic-jpg-avif-jpeg-xl': [
    { q: 'Which format does the post suggest for sending a photo to someone?', options: ['HEIC', 'JPG', 'JPEG XL'], a: 1, why: 'Every device and app opens JPG, so it is the safe choice for sharing.' },
    { q: 'Which habit causes quality loss?', options: ['Keeping the original', 'Converting back and forth between lossy formats', 'Using WebP for the web'], a: 1, why: 'Each lossy save throws away a little more detail.' },
  ],
  'video-in-the-browser-with-webassembly': [
    { q: 'About how big is the ffmpeg engine the first run downloads?', options: ['About 30 MB', 'About 3 GB', 'About 300 KB'], a: 0, why: 'The engine is about 30 MB and is cached after the first time.' },
    { q: 'What is the first tip for faster video jobs?', options: ['Trim first', 'Use the highest quality', 'Close the tab'], a: 0, why: 'Every second you cut is a second the engine does not have to process.' },
  ],
  'make-a-gif-from-a-video': [
    { q: 'Why does halving the width help so much?', options: ['Pixels grow with the square of the width', 'GIFs ignore width', 'It removes colours'], a: 0, why: 'Half the width means a quarter of the pixels in every frame.' },
    { q: 'When the site accepts video, what is usually better than a GIF?', options: ['A short MP4', 'A BMP', 'A ZIP of frames'], a: 0, why: 'A short MP4 is often a tenth of the size with full colour and smooth motion.' },
  ],
  'building-a-batch-pipeline': [
    { q: 'What do you do once a pipeline looks right?', options: ['Save it as a recipe', 'Upload it', 'Print it'], a: 0, why: 'A recipe lets you run the same steps on the next batch with one press.' },
    { q: 'Why is a batch in the Workspace fast?', options: ['There is no upload', 'It skips steps', 'It lowers quality'], a: 0, why: 'The photos never leave the device, so there is no waiting on a network.' },
  ],
  'sign-and-fill-pdfs-privately': [
    { q: 'What is the difference between a signature image and a certificate signature?', options: ['There is none', 'A certificate signature can prove the file was not changed', 'An image is always more secure'], a: 1, why: 'A certificate signature is cryptographic and breaks if the document is edited afterwards.' },
    { q: 'In what order should you fill, sign and flatten?', options: ['Flatten, sign, fill', 'Fill, sign, then flatten', 'Sign, flatten, fill'], a: 1, why: 'Fill the fields while they are editable, sign, then flatten so nothing can be changed by accident.' },
  ],
  'sketch-board-tips': [
    { q: 'What does Q do on the Sketch board?', options: ['Quits the board', 'Locks the current tool so you can draw several shapes', 'Adds a frame'], a: 1, why: 'Normally a tool switches back to select after one shape. Q keeps it active.' },
    { q: 'How do you turn part of the board into a slide?', options: ['Draw a frame around it', 'Press Delete', 'Export as SVG'], a: 0, why: 'A frame becomes a slide you can present or export.' },
  ],
  'ebook-formats-and-conversion': [
    { q: 'Which family does EPUB belong to?', options: ['Reflowable', 'Fixed layout', 'Audio'], a: 0, why: 'EPUB text reflows to fit the screen, like a web page in a ZIP file.' },
    { q: 'Why is PDF to EPUB the hard direction?', options: ['PDF stores positioned text on pages, not a flowing story', 'EPUB has no text', 'PDFs are always encrypted'], a: 0, why: 'The converter has to guess the reading order and paragraphs from positions on a page.' },
  ],
  'file-formats-guide': [
    { q: 'What should you send when a document must look the same everywhere?', options: ['PDF', 'TXT', 'DOCX'], a: 0, why: 'PDF fixes the layout, fonts and page size.' },
    { q: 'When is the best time to convert?', options: ['At the end of your work', 'After every edit', 'Before you start'], a: 0, why: 'Converting in the middle can lose editing features or quality you still need.' },
  ],
  'open-dxf-cad-files-in-a-browser': [
    { q: 'What is the most common form of a DXF file?', options: ['Plain text in pairs of lines', 'A compressed image', 'A database'], a: 0, why: 'Each value is a group code line followed by a value line, readable in any text editor.' },
    { q: 'Does the DXF Viewer open DWG files?', options: ['Yes, always', 'No, DWG is a closed binary format', 'Only on Windows'], a: 1, why: 'DWG is AutoCAD native and closed. Save as DXF from the CAD program first.' },
  ],
  'developer-tools-roundup': [
    { q: 'What does the Cron Parser do with */15 9-17 * * 1-5?', options: ['Turns it into plain words and lists the next runs', 'Runs it on a server', 'Converts it to JSON'], a: 0, why: 'It explains the schedule and shows when it fires next.' },
    { q: 'Where do you copy a request from to use cURL to Code?', options: ['The network panel of your browser', 'The address bar', 'A screenshot'], a: 0, why: 'Copy as cURL in the network panel, then paste it to get fetch, Python or Go code.' },
  ],
  'view-dicom-images-privately': [
    { q: 'What do the pixels in a CT scan store?', options: ['Numbers that window and level turn into greys', 'Plain RGB colours', 'Compressed JPG blocks only'], a: 0, why: 'They hold measurement values, and window and level pick which range you see.' },
    { q: 'Why treat DICOM files with care when sharing?', options: ['They carry names and dates of birth inside', 'They are always huge', 'They contain passwords'], a: 0, why: 'Patient details live in the file metadata, so strip or blur them before sharing.' },
  ],
  'private-text-to-speech': [
    { q: 'Which voices does OpenFile try first?', options: ['The voices installed on your system', 'A cloud voice', 'A recorded actor'], a: 0, why: 'The Speech Synthesis API uses your operating system voices.' },
    { q: 'What happens when a setup has no voices at all?', options: ['It falls back to a small neural model in the tab', 'It gives up', 'It uploads the text'], a: 0, why: 'A small neural voice model runs locally as a fallback.' },
  ],
  'midi-files-explained': [
    { q: 'What note number is middle C?', options: ['60', '69', '127'], a: 0, why: 'Middle C is 60. The A at 440 Hz is 69.' },
    { q: 'Why does the same MIDI file sound different on different devices?', options: ['It holds instructions, and each synth has its own sounds', 'It is compressed differently', 'It has random notes'], a: 0, why: 'MIDI is sheet music for machines. The instrument sounds come from whatever plays it.' },
  ],
  'csv-json-parquet-excel': [
    { q: 'When does JSON to CSV convert cleanly?', options: ['When every record has the same shape', 'Always', 'Only for numbers'], a: 0, why: 'Nested or uneven records do not fit neatly into rows and columns.' },
    { q: 'What is CSV at heart?', options: ['One line per row with commas between cells', 'A binary column store', 'A spreadsheet with formulas'], a: 0, why: 'It is the oldest and simplest format, with no types or formulas.' },
  ],
  'subtitles-srt-vtt-ass-guide': [
    { q: 'What usually causes strange characters in old subtitle files?', options: ['A regional encoding instead of UTF-8', 'Wrong frame rate', 'Too many lines'], a: 0, why: 'Older files were often saved in a regional encoding. Convert them to UTF-8.' },
    { q: 'Where are subtitles often hidden inside MKV files?', options: ['As text tracks you can extract', 'In the file name', 'In the thumbnail'], a: 0, why: 'Extract Subtitles pulls the text tracks out as SRT, VTT or ASS.' },
  ],
  'what-is-inside-a-fit-file': [
    { q: 'How does a FIT file store GPS positions?', options: ['As semicircles, a 32 bit number where 2 to the 31 means 180 degrees', 'As plain decimal degrees in text', 'As street addresses'], a: 0, why: 'Semicircles save space. A reader converts them back to degrees.' },
    { q: 'Why can 30 minutes of intervals score more training load than an hour of easy jogging?', options: ['TRIMP weights each minute more heavily the closer you are to your max', 'Intervals use more GPS points', 'Short workouts are counted twice'], a: 0, why: 'The Banister TRIMP curve grows quickly at high heart rates.' },
  ],
  'bank-statement-files-explained': [
    { q: 'Why is OFX a good choice for importing into a money app?', options: ['Each transaction has a unique id, so importing twice does not double it', 'It is the smallest format', 'It always has categories'], a: 0, why: 'The FITID lets the app skip rows it has already imported.' },
    { q: 'What can you do when your bank only gives a PDF statement?', options: ['Convert it with PDF Statement to CSV, then check the totals', 'Nothing', 'Rename it to .csv'], a: 0, why: 'The tool rebuilds rows from the text positions on each page.' },
  ],
  'scan-receipts-privately': [
    { q: 'Why does the scanner turn the photo grey and stretch the contrast first?', options: ['OCR reads dark text on a light background more accurately', 'To make the file prettier', 'To hide the shop name'], a: 0, why: 'Faded thermal paper reads much better after a contrast stretch.' },
    { q: 'Where does the OCR model run?', options: ['In a Web Worker on your device, no GPU needed', 'On a cloud server', 'Only on phones with a GPU'], a: 0, why: 'Tesseract runs as WebAssembly in a background worker on the CPU.' },
  ],
  'make-flashcards-and-quizzes-that-stick': [
    { q: 'In the Leitner system, what happens to a card you get wrong?', options: ['It goes back to box 1, so it comes back soon', 'It moves up a box', 'It is deleted from the deck'], a: 0, why: 'Missed cards return to the first box, which is reviewed most often.' },
    { q: 'Why does testing yourself beat rereading?', options: ['Recalling an answer rebuilds the memory and makes it stronger', 'Rereading takes longer', 'Tests are always shorter'], a: 0, why: 'The effort of recall is what strengthens the memory. This is the testing effect.' },
  ],
  'robots-txt-sitemaps-and-redirects': [
    { q: 'A robots.txt has Disallow: /admin/ and Allow: /admin/help. Is /admin/help allowed?', options: ['Yes, the longest matching rule wins', 'No, Disallow always wins', 'Only if Allow comes first in the file'], a: 0, why: 'Under RFC 9309 the longest match decides, and order in the file does not matter.' },
    { q: 'Which redirect code should you use for a page that moved for good?', options: ['301', '302', '404'], a: 0, why: 'A 301 is a permanent move, so search engines carry the old page over to the new address.' },
  ],
  'calendar-files-and-repeat-rules': [
    { q: 'What does BYDAY=-1FR mean in a monthly repeat rule?', options: ['The last Friday of the month', 'Every Friday except the first', 'The day before Friday'], a: 0, why: 'A negative number counts from the end of the month, so -1FR is the last Friday.' },
    { q: 'Why do calendar files store times in UTC?', options: ['So everyone sees the event in their own local time', 'Because UTC files are smaller', 'Only Outlook needs it'], a: 0, why: 'A time ending in Z is UTC, and each calendar app converts it to the reader\'s time zone.' },
  ],
}

import { H2, H3, Note, Tip, Warn, T } from '../prose'
import { EmailFitDemo } from '../demos-more'

export default function ShrinkPdfForEmail() {
  return <>
    <p>You finish a document, attach it, press send, and the mail app says the file is too large. It happens to me most often with scanned forms and slide decks exported from presentation apps. This post is a practical routine for getting a PDF under an email or upload limit without making it unreadable.</p>
    <H2>Know your limit, then leave headroom</H2>
    <p>The common limits are easy to remember. Gmail lets you attach up to 25 MB per message. Outlook.com allows 20 MB. Many company mail servers are set lower, often 10 MB, and job portals and government forms frequently cap uploads at 2 or 5 MB.</p>
    <p>There is a catch. Email is a text system, so attachments are encoded as text on the way out, which makes them roughly a third bigger in transit. Some servers count the encoded size. That is why a 24 MB file can bounce from a server that says 25 MB. I aim for about 85 percent of the stated limit and never have the problem.</p>
    <EmailFitDemo />
    <H2>Step 1: find out what is making it big</H2>
    <p>A PDF is a container. Text, fonts and vector drawings are tiny. Images are almost always the heavy part. A 40 page report of plain text might be 300 KB. The same report with a full-page photo on every page can be 60 MB.</p>
    <p>Two quick ways to check:</p>
    <ul>
      <li>Try selecting text in the PDF. If you cannot, each page is a picture, which means it is a scan, and scans compress very well.</li>
      <li>Open <T to="extract-pdf-images">Extract PDF Images</T>. If it finds a handful of huge images, those are your target.</li>
    </ul>
    <H2>Step 2: compress with the right preset</H2>
    <p><T to="compress-pdf">Compress PDF</T> has four presets. Under the hood, the smart method finds every raster image in the file, downsamples it to a target resolution and recompresses it as JPEG, while leaving text and vector graphics exactly as they were.</p>
    <ul>
      <li><strong>Low</strong>, about 150 DPI and quality 82: best quality, light savings. Good for photo books and anything that may be printed.</li>
      <li><strong>Medium</strong>, about 120 DPI and quality 70: the recommended balance. Text in scans stays crisp on screen.</li>
      <li><strong>High</strong>, about 96 DPI and quality 56: smaller, softer images. Fine for reading on a laptop.</li>
      <li><strong>Extreme</strong>, about 72 DPI and quality 42: smallest, with visible loss. Use it when a form insists on 1 or 2 MB.</li>
    </ul>
    <p>If none of the presets are quite right, open Fine-tune DPI and quality and set them yourself. The tool also keeps the original whenever recompressing would make an image bigger, so it never makes things worse.</p>
    <H3>When smart compression is not enough</H3>
    <p>Some PDFs are big for reasons other than images: embedded fonts, thousands of tiny vector shapes from a CAD export, or layers of annotations. For those, switch the method to Rasterize. Every page is rendered to an image at the DPI you choose and the PDF is rebuilt from those images. The file becomes predictable in size, but the text is no longer selectable, so run <T to="ocr-pdf">OCR PDF</T> afterwards if you need search.</p>
    <Warn>Rasterizing removes form fields, links and selectable text. Keep the original, and only send the rasterized copy when size matters more than those features.</Warn>
    <H2>Step 3: more tricks that help</H2>
    <ul>
      <li><strong>Go grayscale.</strong> A scanned black and white letter saved in color wastes space. <T to="pdf-grayscale">PDF to Grayscale</T> often cuts a scan by a third before you even compress.</li>
      <li><strong>Remove pages nobody needs.</strong> Blank pages, duplicate cover sheets and appendices add up. <T to="remove-blank-pages">Remove Blank Pages</T> finds the empty ones for you.</li>
      <li><strong>Fix it at the source.</strong> If you are building the PDF from phone photos, shrink the photos first with <T to="compress-to-size">Compress Image to Size</T>, then combine them with <T to="image-to-pdf">Image to PDF</T>. That gives you far more control than compressing afterwards.</li>
    </ul>
    <H2>Step 4: split when you must</H2>
    <p>Sometimes a document is just big. A 300 page manual with diagrams will not become 10 MB without becoming useless. In that case, split it. <T to="split-pdf">Split PDF</T> has a By size mode: you enter the maximum size per file and it works out where to cut, so each part fits. Then send them as Part 1 of 3, Part 2 of 3 and so on.</p>
    <Tip>If you have many parts, put them in one ZIP only when the recipient asked for it. Many mail filters treat ZIP attachments with suspicion, and a ZIP of PDFs is barely smaller than the PDFs themselves because they are already compressed.</Tip>
    <H2>The order I use</H2>
    <ol>
      <li>Delete pages I do not need.</li>
      <li>Grayscale, if the document has no meaningful color.</li>
      <li>Compress on Medium. Check the result.</li>
      <li>If still too big, High, then Extreme.</li>
      <li>If still too big, split by size.</li>
    </ol>
    <p>Each step is a separate tool, so I check the output after each one. The page thumbnails and the before and after sizes make that quick.</p>
    <Note title="Privacy">Most online PDF compressors upload your file to a server. Contracts, payslips and medical letters are exactly the documents that end up being too big for email, so I built these tools to do all of the above inside your browser. The file never leaves your device, and you can confirm it by turning off Wi-Fi after the page loads.</Note>
    <H2>A word on cloud links</H2>
    <p>For really large files, the honest answer is often a link instead of an attachment. Gmail does this automatically with Drive for big files. That works, but it means uploading the document to a cloud service. When the document is sensitive, I prefer to compress and split locally, so the only copy that travels is the one I meant to send.</p>
  </>
}

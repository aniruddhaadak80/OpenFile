import { H2, H3, Note, Tip, T, Table } from '../prose'
import { ReflowDemo } from '../demos-more'

export default function Ebooks() {
  return <>
    <p>I read a lot on a phone and an old e-reader, and the files come from everywhere: EPUBs from publishers that sell DRM-free books, MOBI files from an old Kindle library, PDFs of papers, and comic archives from friends. Each format behaves differently on a small screen. This post explains the main ebook formats, the one idea that matters most, and how to convert between them without uploading your library anywhere.</p>
    <H2>The one idea: reflowable or fixed</H2>
    <p>Every ebook format falls into one of two families.</p>
    <ul>
      <li><strong>Reflowable</strong> books store text and its structure (chapters, headings, paragraphs) but not where each line falls on a page. The reader app lays out the text for your screen and your font size. EPUB, MOBI, AZW3 and FB2 work this way.</li>
      <li><strong>Fixed layout</strong> files store exact pages. A PDF page looks the same on a 27 inch monitor and on a phone, which means on the phone you zoom and scroll sideways. PDF and comic archives work this way.</li>
    </ul>
    <p>Drag the width slider below down to phone size and you will see the difference in a second.</p>
    <ReflowDemo />
    <p>For novels and most non-fiction, reflowable wins. For anything where layout matters, such as comics, cookbooks with photos next to steps, or academic papers with equations and figures, fixed layout is usually the better choice.</p>
    <H2>The formats you will meet</H2>
    <Table head={['Format', 'What it is', 'Where it shows up']} rows={[
      ['EPUB', 'an open standard: a ZIP of HTML chapters, CSS, images and a contents file', 'Kobo, Apple Books, Google Play Books, most reader apps, and Kindle through Send to Kindle'],
      ['MOBI, AZW, AZW3', "Amazon's older formats, AZW3 also called KF8", 'older Kindle libraries and downloads'],
      ['FB2', 'FictionBook, a single XML file', 'popular in Eastern Europe and Russia'],
      ['CBZ, CBR, CB7', 'a ZIP, RAR or 7z archive of page images', 'comics and manga'],
      ['PDF', 'fixed pages', 'papers, manuals, textbooks'],
    ]} />
    <H3>Why EPUB is the safe choice</H3>
    <p>EPUB is an open format maintained as a web standard, and under the hood it is just a website in a ZIP file. That makes it easy to repair, easy to edit and likely to stay readable for decades. Amazon also moved towards it: Send to Kindle accepts EPUB and converts it for the device, and Amazon has phased out MOBI uploads there. So when someone asks me which format to convert a book into, the answer is nearly always EPUB.</p>
    <H2>Converting books</H2>
    <p><T to="ebook-converter">E-book Converter</T> reads EPUB, MOBI, AZW, AZW3, FB2, CBZ, DOCX, RTF, ODT, TXT, HTML, Markdown and PDF, and writes EPUB, PDF, Word, HTML, plain text, Markdown or FB2. It reads Kindle and EPUB files with foliate-js, the engine behind the Foliate reader, collects chapters, images and metadata into one book model on your device, and writes a fresh EPUB 3 or whichever output you picked.</p>
    <p>Some conversions I do regularly:</p>
    <ul>
      <li><strong>Old MOBI or AZW3 to EPUB</strong> before moving a library to a Kobo or to Apple Books.</li>
      <li><strong>EPUB to PDF</strong> when I want to print a chapter or annotate it with a stylus. <T to="epub-to-pdf">EPUB to PDF</T> does just that.</li>
      <li><strong>EPUB to Markdown or plain text</strong> to quote passages in notes, or to run a long text through other tools.</li>
      <li><strong>Word to EPUB</strong> for friends who write and want to read their own draft on an e-reader.</li>
    </ul>
    <Note title="DRM">Books bought from most big stores are protected with DRM, which locks them to an account. OpenFile does not remove DRM and cannot open protected files. Everything here is for DRM-free books, which many publishers, bundles and public domain libraries offer.</Note>
    <H2>Going from PDF to EPUB</H2>
    <p>This is the hard direction, and it is worth understanding why. A PDF does not know what a paragraph is. It knows that a word sits at a certain position on a page. To make a reflowable book, <T to="pdf-to-epub">PDF to EPUB</T> has to rebuild the structure: it groups text into headings, paragraphs, lists and tables, splits chapters at headings (or every few pages if there are none), and packs the result as an EPUB 3 with a contents list and a cover.</p>
    <p>On a clean, text-based PDF such as a report or a novel exported from a word processor, the result reads well. On a two column scientific paper or a magazine layout, expect some oddities. Footnotes, page headers and figures placed in the margin are the usual troublemakers. In those cases I just keep the PDF.</p>
    <Tip>If the PDF is a scan, there is no text to rebuild. Run <T to="ocr-pdf">OCR PDF</T> first, then convert.</Tip>
    <H2>Fixing a book without converting it</H2>
    <p>Sometimes the file is fine but the details are wrong: a missing cover, the author's name in the title field, a series number nobody filled in. <T to="epub-editor">EPUB Editor</T> changes the cover, title, author, series and tags. It edits the EPUB package in place, so chapters, fonts and styles are left untouched. It can also shrink oversized images, which helps old e-readers that struggle with 5 MB cover pictures, and it can merge several books into one with a combined table of contents. I use that for short story collections that were sold as separate files.</p>
    <H2>Comics</H2>
    <p>Comic archives are just folders of images in a ZIP (CBZ), RAR (CBR) or 7z (CB7). <T to="comic-converter">Comic Converter</T> sorts pages in natural order, so page 10 comes after page 9 and not after page 1, and turns them into a PDF or a CBZ. It can also resize and recompress pages, which can take a 300 MB scan down to something a tablet opens without stuttering.</p>
    <H2>Just reading</H2>
    <p>You do not have to convert at all if you only want to read. <T to="ebook-reader">E-book Reader</T> opens EPUB, MOBI, AZW3, FB2 and CBZ in the browser, with themes, search and a table of contents. Your reading position is saved on this device only. On a laptop it is a pleasant way to read a long document without installing anything, and installed as an app it works offline on a flight.</p>
  </>
}

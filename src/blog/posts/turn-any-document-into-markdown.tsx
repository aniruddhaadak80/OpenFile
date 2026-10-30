import { H2, H3, Note, Tip, T, Table } from '../prose'

export default function AnyDocumentToMarkdown() {
  return <>
    <p>Markdown has quietly become the format everything speaks. Notes apps like Obsidian and Logseq store it, GitHub and GitLab render it, wikis import it, and AI chat tools read it far better than a PDF or a Word file. The trouble is that most of what we have is not Markdown: reports in PDF, slides in PowerPoint, budgets in Excel, saved web pages and old notebooks. So I built <T to="any-to-markdown">Anything to Markdown</T>, which takes almost any document and gives back clean Markdown, without uploading the file.</p>
    <H2>Why Markdown is worth the trouble</H2>
    <p>A Markdown file is plain text with a few marks for structure: a hash for a heading, a dash for a list item, pipes for a table. That makes it small, easy to search, easy to compare with a diff, and easy to keep for decades. It also keeps the structure that matters, so a heading stays a heading and a table stays a table when you paste it somewhere else.</p>
    <p>For AI chats this matters more than people think. A model reads tokens, not pages. A PDF pasted as raw text loses its headings and turns tables into a jumble of numbers. The same content as Markdown keeps the shape of the document, so the answers you get back are better, and the token count shown in the tool tells you if it fits.</p>
    <H2>How each kind of file is read</H2>
    <p>Every format needs its own reader. All of them run inside the browser tab:</p>
    <Table head={['File', 'How it is read', 'What you get']} rows={[
      ['PDF', 'PDF.js reads the text and its position on the page', 'Headings from font size, lists, tables rebuilt from columns'],
      ['Word, ODT, RTF', 'mammoth and small readers turn them into HTML first', 'Headings, bold, lists, links and tables'],
      ['PowerPoint', 'The slide XML inside the PPTX zip', 'One section per slide, bullets and speaker notes'],
      ['Excel, CSV', 'SheetJS reads every sheet', 'One Markdown table per sheet'],
      ['Email (.eml)', 'postal-mime reads the message', 'Subject, sender, date and the body'],
      ['Notebook (.ipynb)', 'The notebook JSON, cell by cell', 'Text cells, code blocks and saved outputs'],
    ]} />
    <p>After reading, HTML is turned into Markdown with turndown, using GitHub flavoured rules so tables come through as real tables.</p>
    <H3>Many files at once</H3>
    <p>You can drop a whole folder of mixed files. Each one gets its own Markdown, and you can view them all as one document with a divider between files, which is handy when you want to give an AI the full picture of a project in one paste. Download one combined file or a ZIP with one file each.</p>
    <Tip>Scanned PDFs are pictures of text, so they have nothing to read. Run them through <T to="ocr-pdf">PDF OCR</T> first, then convert.</Tip>
    <H2>Saved web pages and old pictures</H2>
    <p>Two more tools fill gaps I kept running into. <T to="mhtml-viewer">MHTML Viewer</T> opens the single file web archives that browsers save, splits them into the page, its pictures and its styles, and shows the page in a locked frame with every script removed. You can save it as one normal HTML file or pull out all the pictures as a ZIP.</p>
    <p><T to="emf-wmf-converter">EMF and WMF Converter</T> is for old Windows drawings: clip art, charts copied out of Office and diagrams from Visio. These metafiles are lists of drawing commands, so they are played back into an SVG and saved as SVG, PNG, JPG or a vector PDF.</p>
    <H2>Notebooks without Jupyter</H2>
    <p>A Jupyter notebook is JSON with code, text and the outputs from the last run. <T to="notebook-converter">Jupyter Notebook Converter</T> shows it as a clean page with coloured code and charts, then saves it as HTML, PDF, Markdown or a Python script with cell markers. It also works the other way: a script with cell markers turns back into a notebook. Nothing is run, so you see exactly what was saved.</p>
    <H2>Privacy</H2>
    <p>Documents are often the most private files we have: contracts, payslips, medical letters. Every reader here runs in your browser and the result is a download on your device. Nothing is uploaded and nothing is kept after you close the tab.</p>
    <Note title="Check tables in PDFs">PDFs do not store tables, only text at positions. Simple tables come back well, but merged cells and tables that flow over two pages may need a quick tidy by hand.</Note>
  </>
}

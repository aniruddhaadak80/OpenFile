import { DocConvert } from './_b4/DocConvert'
export default function DocxToMarkdown() {
  return <DocConvert accept=".docx,.odt,.rtf,.html,.htm" dropLabel="Drop a Word document" dropSub="Convert DOCX to clean Markdown with headings, lists, links and tables. Images are embedded." defaultOut="md" outs={['md', 'html', 'txt']} />
}

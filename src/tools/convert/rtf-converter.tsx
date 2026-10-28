import { DocConvert } from './_b4/DocConvert'
export default function RtfConverter() {
  return <DocConvert accept=".rtf,.docx,.odt,.html,.htm,.md,.txt" dropLabel="Drop an RTF file" dropSub="View RTF files (with fonts, colors, tables and WMF/EMF pictures) and convert them to PDF, Word, HTML or text. Or turn other documents into RTF." defaultOut="pdf" outs={['pdf', 'docx', 'html', 'txt', 'md', 'rtf']} />
}

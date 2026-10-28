import { DocConvert } from './_b4/DocConvert'
const SAMPLE = `# Project notes\n\nWrite **Markdown** here and download a real Word file.\n\n## What works\n\n- Headings, *italic* and **bold**\n- Bullet and numbered lists\n  1. Nested items\n- [Links](https://example.com) and \`inline code\`\n\n| Feature | Kept |\n| --- | --- |\n| Tables | Yes |\n| Code blocks | Yes |\n\n\`\`\`js\nconsole.log('hello')\n\`\`\`\n\n> Block quotes become indented paragraphs.\n`
export default function MarkdownToDocx() {
  return <DocConvert accept=".md,.markdown,.txt" dropLabel="Drop a Markdown file" dropSub="Turn .md files into Word documents with headings, lists, tables and code." defaultOut="docx" outs={['docx', 'pdf', 'html', 'rtf', 'epub']} paste="md" pasteSample={SAMPLE} />
}

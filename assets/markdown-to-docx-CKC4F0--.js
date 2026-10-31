import{Vt as e}from"./ui-BnOkXGVZ.js";import{t}from"./DocConvert-SOQCsGG4.js";var n=e(),r=`# Project notes

Write **Markdown** here and download a real Word file.

## What works

- Headings, *italic* and **bold**
- Bullet and numbered lists
  1. Nested items
- [Links](https://example.com) and \`inline code\`

| Feature | Kept |
| --- | --- |
| Tables | Yes |
| Code blocks | Yes |

\`\`\`js
console.log('hello')
\`\`\`

> Block quotes become indented paragraphs.
`;function i(){return(0,n.jsx)(t,{accept:`.md,.markdown,.txt`,dropLabel:`Drop a Markdown file`,dropSub:`Turn .md files into Word documents with headings, lists, tables and code.`,defaultOut:`docx`,outs:[`docx`,`pdf`,`html`,`rtf`,`epub`],paste:`md`,pasteSample:r})}export{i as default};
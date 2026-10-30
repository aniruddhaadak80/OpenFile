import { H2, H3, Note, Tip, T } from '../prose'

export default function DiagramsFromText() {
  return <>
    <p>Most of the pictures in my slides and docs are not photos. They are flowcharts, bar charts, code snippets and the odd decorative wave at the top of a page. Drawing those by hand in a design app takes longer than the thinking behind them. These days I write them as text and let a tool draw them. Here are the five tools I use for that, all of which run in the browser.</p>
    <H2>Diagrams with Mermaid</H2>
    <p>Mermaid is a small language for diagrams. You write lines like <code>A --&gt; B</code> and it draws boxes and arrows, laid out for you. <T to="diagram-renderer">Diagram Maker</T> redraws the picture each time you stop typing and comes with templates for flowcharts, sequence diagrams, class and state diagrams, database diagrams, Gantt charts, mind maps, timelines, git graphs, journeys and quadrant charts.</p>
    <p>The big win is that the diagram is now text. It fits in a code review, it can be compared with a diff, and the same code renders on GitHub, GitLab and Notion. When you need a picture, download SVG for sharp slides or PNG for chat apps. Labels are drawn as plain SVG text, so the PNG looks the same as the preview.</p>
    <H3>A tiny example</H3>
    <p>Three lines are enough for a useful flowchart: one line names the direction, the next two connect steps. Add a curly brace around a step to make it a decision diamond, and text between dashes to label an arrow. Mistakes show up as a short error under the picture with the line number.</p>
    <H2>Charts from a pasted table</H2>
    <p><T to="chart-maker">Chart Maker</T> takes data straight from a spreadsheet. Copy a range, paste it, and the first column becomes the labels while each next column becomes a series. Bars, stacked bars, sideways bars, lines, areas, pies, donuts and dots are one click apart. The axis numbers are rounded to steps of 1, 2, 2.5 or 5, which is what makes a chart easy to read.</p>
    <p>The chart is built as SVG, so it stays sharp at any size and opens in any vector app if you want to adjust it further.</p>
    <Tip>A pie chart only uses the first number column. If you have more than five or six slices, a sideways bar chart is easier to read.</Tip>
    <H2>Code as a picture</H2>
    <p>Sometimes code has to be a picture: a slide, a social post, a printed handout. <T to="code-to-image">Code to Image</T> colours the code with highlight.js, detects the language, and wraps it in a window frame on a background. Padding, width, font size, line numbers and export size up to four times are all adjustable. It saves PNG, SVG or JPG, or copies the picture to paste straight into a chat.</p>
    <H2>Shapes and paper</H2>
    <p><T to="svg-blob-wave">Blob and Wave Generator</T> makes organic blobs, layered section waves and scattered shapes. Each shape comes from a seed number, so the same seed always gives the same shape, and you can copy the SVG or a ready CSS background.</p>
    <p><T to="printable-paper">Printable Paper</T> is the one I use most at home: graph, dot grid, lined, isometric, hexagon, music staff, handwriting and calligraphy paper. The lines are worked out in millimetres and written into the PDF as vectors, so they print crisp on any printer. Print at actual size and the spacing stays true.</p>
    <H2>Why text first works</H2>
    <p>Writing a picture as text sounds odd until you try it. You think about the content, not about nudging boxes. Changes take seconds. And the text keeps working later: you can search it, copy it into a new document, or ask someone to fix a typo without sending them a design file.</p>
    <Note title="Everything stays on your device">Your diagrams, data and code are drawn in your browser. Nothing is uploaded, so pasting internal numbers or unreleased code is safe.</Note>
  </>
}

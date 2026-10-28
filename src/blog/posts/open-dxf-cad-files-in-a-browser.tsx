import { H2, H3, Note, Tip, T } from '../prose'
import { DxfMiniDemo } from '../demos-more'

export default function CadInBrowser() {
  return <>
    <p>A friend who is an architect once sent me a floor plan as a DXF file and asked me to check one measurement. I did not have AutoCAD, and the free viewers I found either wanted an account or an upload. That annoyance turned into two OpenFile tools: a DXF viewer and a CAD converter. This post explains what DXF actually is, how the tools read it, and the jobs they are good for.</p>
    <H2>DWG and DXF</H2>
    <p>AutoCAD has two file formats. <strong>DWG</strong> is its native format: compact, binary and closed. Other programs read it by reverse engineering, and its details change between AutoCAD versions. <strong>DXF</strong>, the Drawing Exchange Format, was introduced by Autodesk in the early 1980s precisely so other programs could exchange drawings with AutoCAD. Its specification is published, and nearly every CAD, laser cutting, CNC and GIS program can import and export it.</p>
    <p>So the practical advice is simple: if someone sends you a DWG, ask for a DXF, or save one yourself from AutoCAD, LibreCAD, FreeCAD, QCAD or any other CAD program. Save As, then pick DXF.</p>
    <H2>A DXF file is just text</H2>
    <p>The most common form of DXF is plain text made of pairs of lines. The first line of each pair is a <strong>group code</strong>, a number that says what the next line means. The second is the value. A few codes you will see everywhere:</p>
    <ul>
      <li><code>0</code> starts a new entity and names its type, such as LINE, CIRCLE, ARC, LWPOLYLINE or TEXT.</li>
      <li><code>8</code> is the layer name.</li>
      <li><code>10</code> and <code>20</code> are the X and Y of the first point, <code>11</code> and <code>21</code> the second point of a line.</li>
      <li><code>40</code> is a radius for circles and arcs, or the height for text.</li>
    </ul>
    <p>Below is a tiny but real DXF entities section: a rectangle on a WALLS layer, a circle on FIXTURES and a dimension line. Change a number on the left and the drawing updates. Click a layer name to hide it.</p>
    <DxfMiniDemo />
    <p>A real drawing has thousands of entities plus a header with units and settings, a tables section that defines layers, line types and text styles, and blocks, which are reusable groups of entities such as a door or a chair placed many times. But the principle is exactly what you see above.</p>
    <H2>Viewing a drawing</H2>
    <p><T to="dxf-viewer">DXF Viewer</T> parses the file with the open source dxf library, which expands blocks, arcs, splines and polylines into plain line work. Then it draws everything with Canvas 2D, grouped by layer.</p>
    <ul>
      <li>Drag to pan, scroll to zoom, and press 0 to fit the whole drawing on screen.</li>
      <li>Toggle layers in the side panel. Floor plans often have separate layers for walls, furniture, electrical and dimensions, and hiding the clutter makes them far easier to read.</li>
      <li>Use the ruler to measure the distance between two points in the drawing's own units.</li>
      <li>Save the visible layers as SVG, which you can drop into a document or a web page.</li>
    </ul>
    <H3>Units matter</H3>
    <p>A DXF stores coordinates as plain numbers. Whether 1 means a millimetre, an inch or a metre is a drawing setting, and older files sometimes do not say. If a measurement looks a thousand times too big or too small, the drawing is probably in millimetres and you were expecting metres. Check what the sender intended before you order materials based on it.</p>
    <H2>Converting for people without CAD</H2>
    <p>Most people who receive a drawing just want to look at it or print it. <T to="cad-converter">CAD to PDF, SVG and PNG</T> handles that:</p>
    <ul>
      <li><strong>PDF</strong> output is real vector paths, built with jsPDF and svg2pdf, so lines stay sharp at any zoom and print cleanly. You pick the page size.</li>
      <li><strong>SVG</strong> is grouped by layer, which is handy if you want to restyle it later.</li>
      <li><strong>PNG and JPG</strong> are rendered at the width you choose, good for chat or email.</li>
    </ul>
    <p>Two options I use a lot: hiding layers before export, so a client gets the plan without the construction notes, and print-friendly black lines. CAD drawings often use light colours meant for a dark screen, and yellow lines on white paper are nearly invisible. The black lines option turns everything dark for printing.</p>
    <Tip>For a laser cutter or a vinyl cutter, export SVG with only the cut layer visible. Most cutter software imports SVG directly, and you avoid cutting your own dimension lines.</Tip>
    <H2>What it does not do</H2>
    <ul>
      <li>It does not open DWG. That would mean shipping a large reverse engineered library, and DXF covers the need.</li>
      <li>It is a viewer and converter, not an editor. You can hide, measure and export, but not move walls.</li>
      <li>3D solids inside a DXF are shown as their edges. For real 3D models, use <T to="3d-viewer">3D Model Viewer</T>, which opens STL, OBJ, GLB, 3MF, FBX and many more.</li>
    </ul>
    <Note title="Why local matters here">Drawings are often confidential: unreleased buildings, product designs, the layout of someone's home. With these tools the file is parsed in your browser tab and never uploaded, so you can open a client drawing on a laptop at a site visit without wondering where a copy ended up.</Note>
  </>
}

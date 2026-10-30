import { H2, H3, Note, Tip, T, Table } from '../prose'

export default function PrintingFilesInBrowser() {
  return <>
    <p>A 3D printing project passes through a surprising number of files. A logo starts as an SVG, becomes a mesh, gets sliced into G-code, and if it turns out well you want a nice spinning video of it. Scanners and drones add point clouds to the mix. I wanted to handle all of that in a browser tab, so OpenFile now has four tools for it.</p>
    <H2>From a flat logo to a solid</H2>
    <p><T to="extrude-to-3d">SVG and Image to 3D</T> takes a flat shape and pushes it out into a solid. SVG paths are read with their holes, so the inside of an O or an A stays open. A photo or a scan of a drawing is first traced into black and white shapes. You set the width in millimetres, the thickness, a rounded edge and an optional base plate, then download STL for printing or GLB for the web.</p>
    <p>This is how I make keychains, name tags, cookie cutter outlines and wall signs. A clean SVG gives the best result, but a sharp, high contrast photo of a drawing works too.</p>
    <Tip>Flat parts print best when they are at least 1.2 mm thick. Below that, small details can lift or break when you take them off the bed.</Tip>
    <H2>Reading G-code</H2>
    <p>G-code is the list of moves your printer, CNC router or laser actually runs. Each line is a command like G1 X10 Y20 E1.5, which means move to that point while pushing 1.5 mm of filament. <T to="gcode-viewer">G-code Viewer</T> reads every move and draws the toolpath in 3D, coloured by height. Drag the layer slider to watch the print build up and spot problems before they cost an hour of printing.</p>
    <H3>What the numbers mean</H3>
    <Table head={['Value', 'Where it comes from']} rows={[
      ['Print time', 'The length of every move divided by its speed, plus pauses'],
      ['Filament', 'The sum of the E values, in metres, and roughly in grams'],
      ['Size', 'The smallest box around all printing moves'],
      ['Layers', 'A new layer starts each time printing happens at a new height'],
    ]} />
    <p>The time does not include acceleration, so slicers often show a little more. Arcs (G2 and G3), relative moves and inch units are all handled, so CNC and laser files work too.</p>
    <H2>A turntable video of the result</H2>
    <p><T to="3d-turntable">3D Turntable Video</T> loads a model and films it from a camera that circles it once or more, at the height you choose. Pick a size for a product page, a square for social posts or a vertical clip for short videos. It saves MP4, a looping GIF, or WebM with a clear background for video editors.</p>
    <H2>Point clouds from scanners and drones</H2>
    <p>A point cloud is a list of points in space, often with colours, from a LiDAR scanner, a phone scanning app or drone photos. They come in many formats, and the file you get is rarely the one your next app wants. <T to="point-cloud-converter">Point Cloud Converter</T> reads PLY, LAS, PCD, XYZ, PTS and CSV, shows the cloud in 3D, and writes it back in any of those formats.</p>
    <p>Clouds are often far too dense. Thinning keeps every Nth point, or one point per grid cell, which keeps the shape even while cutting the size. Survey files often use huge coordinates, so there is also a switch to move the cloud to the origin, which avoids wobbly previews.</p>
    <H2>Privacy</H2>
    <p>Designs for products, scans of rooms and drone surveys of private land are not things I want on a stranger's server. Each of these tools runs in the browser with three.js and the ffmpeg engine, and the results are downloads on your device.</p>
    <Note title="Big files">G-code files over a few hundred megabytes and point clouds with tens of millions of points can be too much for a phone. The preview draws up to 1.5 million points, but the saved file keeps them all.</Note>
  </>
}

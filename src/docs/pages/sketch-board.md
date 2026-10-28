# Sketch board

The [Sketch whiteboard](/sketch-board) is an infinite canvas for diagrams, wireframes, flowcharts, notes and quick presentations. It renders with Canvas 2D, supports a hand-drawn or clean style, and saves automatically in your browser. There is no server and no account. Boards and share links live entirely on your device.

## Tools

| Tool | Key | What it does |
| --- | --- | --- |
| Hand | <kbd>H</kbd> | Pan the canvas |
| Select | <kbd>V</kbd> or <kbd>1</kbd> | Select, move, resize and rotate elements |
| Rectangle | <kbd>R</kbd> or <kbd>2</kbd> | Boxes and cards |
| Diamond | <kbd>D</kbd> or <kbd>3</kbd> | Decisions in flowcharts |
| Ellipse | <kbd>O</kbd> or <kbd>4</kbd> | Circles and ovals |
| Arrow | <kbd>A</kbd> or <kbd>5</kbd> | Connectors that bind to shapes and follow them |
| Line | <kbd>L</kbd> or <kbd>6</kbd> | Straight lines |
| Pencil | <kbd>P</kbd> or <kbd>7</kbd> | Freehand drawing |
| Text | <kbd>T</kbd> or <kbd>8</kbd> | Free text |
| Image | <kbd>9</kbd> | Insert images (you can also paste or drop them) |
| Eraser | <kbd>E</kbd> or <kbd>0</kbd> | Delete what you drag over |
| Sticky note | <kbd>S</kbd> | Colored notes |
| Frame | <kbd>F</kbd> | Frames group content and become slides |
| Laser pointer | <kbd>K</kbd> | A fading pointer for presenting |
| Keep tool active | <kbd>Q</kbd> | Stay on the current tool after drawing |

## Styling

Select one or more elements to open the properties panel: stroke color, fill color and fill style, stroke width and style, roughness (hand-drawn vs. clean), corner roundness, opacity, font family and size. Use the panel's actions to align, distribute, group, lock and change stacking order.

## Stencil library

Open the **library** from the toolbar for ready-made stencils: flowchart shapes (process, decision, start/end and more), data-modeling blocks (ER tables and relations), colored sticky notes and a set of tech and cloud icons. Search the library and click a stencil to drop it at the center of the view.

## Boards

Use the board name at the top-left to manage **multiple boards**: create, rename, duplicate and delete. Every board autosaves to your browser's local storage as you draw.

> [!WARNING]
> Browser storage can be cleared by the browser or by you. Press <kbd>Ctrl</kbd> + <kbd>S</kbd> regularly to save a `.openfile.json` backup, especially for boards with large images.

## Saving, opening and exporting

- **Save to file** (<kbd>Ctrl</kbd> + <kbd>S</kbd>) downloads the board as `<name>.openfile.json`.
- **Open file** (<kbd>Ctrl</kbd> + <kbd>O</kbd>) opens a saved scene as a new board; the menu can also merge one into the current board.
- **Export** (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd>) produces PNG (at 1×, 2× or 3× scale), SVG, or copies a PNG to the clipboard. Options include *only selected*, *include background*, *dark mode* and padding.

## Sharing a board

**Copy share link** compresses the whole drawing (with fflate) into the link itself, after `#sketch=`. Whoever opens the link gets their own copy of the board, saved into their boards list. Nothing is uploaded; the drawing travels inside the URL, so very large boards produce very long links, so use a `.openfile.json` file for those.

## Presenting

Add **frames** (<kbd>F</kbd>) around the content of each slide, then press **Present** (<kbd>Alt</kbd> + <kbd>P</kbd>). Frames are shown in order as slides; without frames, the whole board is presented.

| Action | Keys |
| --- | --- |
| Next slide | <kbd>→</kbd> <kbd>↓</kbd> <kbd>Space</kbd> <kbd>Page Down</kbd> <kbd>Enter</kbd> |
| Previous slide | <kbd>←</kbd> <kbd>↑</kbd> <kbd>Page Up</kbd> <kbd>Backspace</kbd> |
| Laser pointer / pan | <kbd>K</kbd> / <kbd>H</kbd> |
| Exit | <kbd>Esc</kbd> |

## Keyboard shortcuts

### View

| Action | Shortcut |
| --- | --- |
| Pan | <kbd>Space</kbd> + drag · mouse wheel · middle mouse |
| Zoom | <kbd>Ctrl</kbd> + wheel · pinch |
| Zoom in / out | <kbd>Ctrl</kbd> + <kbd>=</kbd> / <kbd>Ctrl</kbd> + <kbd>−</kbd> |
| Reset zoom | <kbd>Ctrl</kbd> + <kbd>0</kbd> |
| Fit to content | <kbd>Shift</kbd> + <kbd>1</kbd> |
| Zoom to selection | <kbd>Shift</kbd> + <kbd>2</kbd> |
| Toggle grid | <kbd>Ctrl</kbd> + <kbd>'</kbd> |
| Toggle snap to grid | <kbd>Alt</kbd> + <kbd>S</kbd> |
| Dark / light canvas | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> |
| Fullscreen | <kbd>Alt</kbd> + <kbd>Enter</kbd> |
| Present | <kbd>Alt</kbd> + <kbd>P</kbd> |

### Edit

| Action | Shortcut |
| --- | --- |
| Undo | <kbd>Ctrl</kbd> + <kbd>Z</kbd> |
| Redo | <kbd>Ctrl</kbd> + <kbd>Y</kbd> · <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> |
| Copy / cut / paste | <kbd>Ctrl</kbd> + <kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> |
| Duplicate | <kbd>Ctrl</kbd> + <kbd>D</kbd> · <kbd>Alt</kbd> + drag |
| Delete | <kbd>Delete</kbd> · <kbd>Backspace</kbd> |
| Select all | <kbd>Ctrl</kbd> + <kbd>A</kbd> |
| Group / ungroup | <kbd>Ctrl</kbd> + <kbd>G</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>G</kbd> |
| Lock / unlock | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd> |
| Bring forward / send backward | <kbd>Ctrl</kbd> + <kbd>]</kbd> / <kbd>Ctrl</kbd> + <kbd>[</kbd> |
| Bring to front / send to back | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>]</kbd> / <kbd>[</kbd> |
| Nudge | Arrow keys (<kbd>Shift</kbd> = 10px) |
| Edit text or label | <kbd>Enter</kbd> · double-click |
| Constrain proportions / snap angle | Hold <kbd>Shift</kbd> while drawing |
| Save / open file | <kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>Ctrl</kbd> + <kbd>O</kbd> |
| Export image | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>E</kbd> |
| Show shortcuts | <kbd>?</kbd> |
| Deselect, back to Select tool | <kbd>Esc</kbd> |

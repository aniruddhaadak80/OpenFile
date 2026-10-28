# Using tools

Every tool follows the same shape: a drop area, options on the side, a preview, and a download button. Learn it once and all {{TOOL_COUNT}} tools feel familiar.

## Drop zones

- **Drag and drop** files onto the drop area, or click it to open the file picker. With the keyboard, focus the drop area and press <kbd>Enter</kbd> or <kbd>Space</kbd>.
- Each drop area knows which formats it takes. Files it cannot use are skipped and a short message tells you how many were left out.
- **Drop anywhere.** Drag a file onto any page, not just a tool. OpenFile checks the file's real type from its first bytes, so a wrong extension cannot fool it, and suggests the tools that fit. Pick one and the file opens there already loaded.

## Many files at once

Tools that accept several files show **Any number of files** on the drop area. Results for a batch download one by one or together as a single ZIP. For the same chain of steps on lots of files, the [Workspace](/docs/workspace) is faster: {{PIPELINE_TOOL_COUNT}} tools are also available as Workspace steps.

## Page ranges

PDF tools that work on some pages take a page range. The same syntax works everywhere:

| You type | Pages you get |
| --- | --- |
| `1-3` | 1, 2 and 3 |
| `1-3, 5, 8` | 1, 2, 3, 5 and 8 |
| `8-` | 8 to the last page |
| `-4` | the first page to 4 |
| `2 4 6` | 2, 4 and 6 (spaces work like commas) |

Pages outside the document are ignored and duplicates are removed, so `1-3, 2` gives 1, 2 and 3.

## Presets and defaults

Many tools offer **presets** for common jobs, for example a size for social posts or a quality level for email, so you can get a good result in one click and then fine tune. Your own defaults live in [Settings](/settings):

- **Default image quality** starts at {{DEFAULT_QUALITY}} and is used by image tools and Workspace steps that encode images.
- **Download names** follow a pattern. The default is `{{DEFAULT_NAMING}}`. You can use the tokens `{name}`, `{tool}`, `{date}` and `{time}`, and the original extension is always kept.

## After you download

When a file is saved, a small card asks **What next?** and lists tools that can take that file further, for example compressing a PDF you just merged. Your file goes straight into the next tool without a new upload or a trip through your downloads folder.

## Favorites, recent tools and history

- Press <kbd>F</kbd> on a tool page, or click the star on a tool card, to save it as a favorite.
- <kbd>Alt</kbd> + <kbd>1</kbd> to <kbd>9</kbd> opens one of your recently used tools.
- [History](/history) shows the tools you opened and the files you downloaded (names and sizes only, never the files). It keeps the newest {{HISTORY_LIMIT}} entries and can be switched off in Settings.

All of this stays in this browser. See [Favorites, history and settings](/docs/local-data).

## Undo

- Clearing favorites, recent tools or history in Settings shows a toast with **Undo** for a few seconds.
- Editors with a canvas or timeline support <kbd>Ctrl</kbd> + <kbd>Z</kbd> to undo and <kbd>Ctrl</kbd> + <kbd>Y</kbd> to redo, for example the Sketch board and the audio editor. See the [tool shortcuts](/docs/keyboard-shortcuts#tool-specific-shortcuts).
- Your original file is never changed, so the simplest undo is to start over with it. Every tool has a **Start over** button.

## On a phone

Tools work the same on phones. When the main button scrolls out of view, a sticky bar at the bottom mirrors it, so you never have to scroll back up. Very large files need more memory than most phones give a single tab, so split huge jobs there.

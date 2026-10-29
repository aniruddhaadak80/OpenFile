# Blog media generator

Every post in `src/blog/meta.ts` gets, automatically:

| What | Files | Where it is served from |
| --- | --- | --- |
| Cover loop, 8 s, 800x500, muted, seamless | `loop.mp4` (H.264), `loop.webm` (AV1), `cover.webp` poster | `public/media/blog/<slug>/` |
| Explainer film, 60 to 120 s, 1920x1080, 24 fps, narration + music | `<slug>.mp4` (H.264 + AAC), `<slug>.webm` (AV1 + Opus) | GitHub Release `media-v1` |
| Film captions and poster | `captions.vtt`, `video-poster.webp` | `public/media/blog/<slug>/` |
| Illustrations, 1600x900 WebP | `map.webp`, `flow.webp`, `scene-1.webp`, `scene-2.webp` | `public/media/blog/<slug>/` |
| Read-aloud narration, 2 voices (Lessac female, Ryan male) | `<slug>-<voice>.mp3` (48 kbps), `.opus` (24 kbps) | GitHub Release `media-v1` |
| Word timings for highlight sync | `read-<voice>.json` | `public/media/blog/<slug>/` |
| Manifest read by the UI | `src/blog/media/manifest.json` | bundled |

## Run

```bash
# once per round, after posts are written (only missing or changed posts are rendered)
PYTHONPATH=/workspace/work/video/pylib python3 scripts/blog-media/make.py
bash scripts/blog-media/push-release.sh       # publish new release files (runs a temporary branch workflow)
```

Steps can be run on their own: `extract.mjs` (post text and cover SVG), `loop.py <slug>`, `video.py <slug>`
(`--sheet out.png` for a contact sheet, `--still 12.5 out.png` for one frame), `images.py <slug>`, `narrate.py`.

## How it works

* `extract.mjs` bundles the post bodies with esbuild (live demos stubbed), renders them with React to static HTML and
  keeps the readable blocks: h2, h3, p, li and blockquote outside `.not-prose`, figures, tables and code. The browser
  player uses the same rule (`src/blog/media/readable.ts`), so narration words line up with the words on the page.
* `narrate.py` uses Piper (MIT, offline neural TTS) with phoneme alignments. Phoneme words are mapped back to the
  source words, which gives real per-word timings. Audio is loudness normalised to -17 LUFS.
* `video.py` plans the film from the post: title, description, up to four chapters (heading + first sentence, with a
  diagram picked from the chapter's list items, key terms or sentences), a UI sequence of the first tool, and an end card.
  Narration is Kokoro (Apache-2.0), music is the procedural bed from `scripts/media-lib`, ducked under the voice.
* `loop.py` splits the cover SVG into background and motif and animates both with motion that is periodic in 8 s.
* `images.py` draws the route map and the tools diagram, and reuses two chapter frames from the film.

Writing rule for anything on screen or spoken: plain words, no em dashes, no exclamation marks. Palette: gold, amber,
teal, cyan, emerald, sky, orange, lime, warm white on black. Never purple, violet, pink, magenta or fuchsia.

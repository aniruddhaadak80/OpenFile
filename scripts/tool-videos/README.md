# OpenFile media generators

All media is rendered with open-source tools only: cairocffi + Pillow + numpy (graphics and procedural music),
cairosvg (lucide icons from `node_modules/lucide-react`), kokoro-onnx (Kokoro-82M neural TTS, Apache-2.0) and ffmpeg.

Shared code lives in `scripts/media-lib/ofmedia.py` (palette, drawing helpers, music synth, TTS, mixing).
Fonts (Inter, Space Grotesk, JetBrains Mono, all SIL OFL) are in `scripts/media-lib/fonts/`.

## Setup (once)

```bash
pip install numpy pillow cairocffi cairosvg kokoro-onnx soundfile
# Kokoro model files (~120 MB) are downloaded automatically into $OF_TTS_DIR
# (default /workspace/work/video/tts): kokoro-v1.0.int8.onnx + voices-v1.0.bin
```

## Per-tool preview videos

```bash
python3 scripts/tool-videos/make_tool_videos.py                    # only tools without a video yet
python3 scripts/tool-videos/make_tool_videos.py --only slug1,slug2 # (re)render these
python3 scripts/tool-videos/make_tool_videos.py --force            # re-render everything
python3 scripts/tool-videos/make_tool_videos.py --still merge-pdf 4 /tmp/f.png   # preview one frame
```

Reads `src/tools/registry.ts` and the batch files it spreads into `TOOLS` (`src/tools/batches/*.ts`).
Writes `public/media/tools/<slug>.mp4` (960x540, 30 fps, H.264 yuv420p + AAC mono 48k, faststart),
`public/media/tools/<slug>.jpg` (480x270) and `public/media/tools/index.json`.
Uses every core (`--jobs N` to change). About 6 to 7 s per tool on 2 cores.

Demo animation is picked per slug (merge, split, compress, convert, page actions, image actions, video timeline,
waveforms, code editor, text, design, plus templates for data, AI, 3D, archives, eBooks, fonts, CAD, subtitles).
New tools fall back to their category template automatically. Colours, layout and motion are seeded by the slug.

Voices: Kokoro English voices rotated US female / US male / UK female / UK male (first lap pure voices,
later laps light blends with another voice of the same group so every tool sounds different).
Music: procedural pad + plucked/piano/marimba/bell lead + sub bass + soft drums, key/tempo/timbre seeded by slug,
ducked under the voice and loudness-normalised (-16 LUFS for previews).

## Launch film and social card

```bash
python3 scripts/launch-video/make.py     # public/media/launch.mp4 + public/media/poster.jpg (-14 LUFS)
python3 scripts/launch-video/og.py       # public/og.png (1200x630)
```

Writing rule for every on-screen line and voice script: no em dashes, no exclamation marks, plain words.
Palette: black #050505 / #0B0D10, gold #F5A524 (glow #FFB224), teal #14B8A6, cyan #22D3EE, emerald #10B981,
sky #38BDF8, off-white #F5F3EE. No purple, violet, magenta or pink.

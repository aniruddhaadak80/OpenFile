#!/usr/bin/env bash
# Builds the README GIF teasers from the real films in public/media.
# GitHub does not play mp4 files linked from a README, so the README shows these GIFs
# inline and links each one to the full mp4 on GitHub Pages.
#
#   bash scripts/readme/make-gifs.sh
#
# Needs ffmpeg. Two passes per GIF (palettegen, then paletteuse) for clean colors.
# Each clip is a few short highlights joined together, about 14 to 15 seconds.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=docs/assets/readme
TMP=$(mktemp -d)
mkdir -p "$OUT"
WIDTH=${WIDTH:-760}
FPS=${FPS:-12}

# make_gif <input> <output> <segments "start-end start-end ...">
make_gif() {
  local in=$1 out=$2 segs=$3 i=0 parts="" chain=""
  for s in $segs; do
    local a=${s%-*} b=${s#*-}
    chain+="[0:v]trim=start=$a:end=$b,setpts=PTS-STARTPTS,fps=$FPS,scale=$WIDTH:-2:flags=lanczos[v$i];"
    parts+="[v$i]"
    i=$((i+1))
  done
  local base="${chain}${parts}concat=n=$i:v=1:a=0"
  ffmpeg -v error -y -i "$in" -filter_complex "${base},palettegen=max_colors=192:stats_mode=diff" -frames:v 1 -update 1 "$TMP/palette.png"
  ffmpeg -v error -y -i "$in" -i "$TMP/palette.png" -filter_complex "${base}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 "$out"
  if command -v gifsicle >/dev/null; then gifsicle -O3 --lossy=40 -b "$out" 2>/dev/null || gifsicle -O3 -b "$out"; fi
  echo "$out $(du -h "$out" | cut -f1)"
}

# Launch film: personal files, the studios, 0 bytes uploaded, end card.
make_gif public/media/launch.mp4 "$OUT/launch-teaser.gif" "3.5-6.5 17-23 40-42.5 52-54.5"
# Apps film: every screen, install in three clicks, works offline, end card.
make_gif public/media/apps.mp4 "$OUT/apps-teaser.gif" "8-12 16-22 34-37 40-42"
rm -rf "$TMP"

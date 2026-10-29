#!/usr/bin/env bash
# Launches the OpenFile Linux build on a virtual X display, checks it stays alive, takes a screenshot.
# Usage: tests/apps/linux-smoke.sh appimage OpenFile-linux-x86_64.AppImage [out-dir] [wait-seconds]
#        tests/apps/linux-smoke.sh deb      OpenFile-linux-amd64.deb       [out-dir] [wait-seconds]
set -euo pipefail
KIND="$1"; PKG="$(realpath "$2")"; OUT="${3:-app-smoke}"; WAIT="${4:-20}"
mkdir -p "$OUT"
. /etc/os-release; echo "OS: $PRETTY_NAME  kernel $(uname -r)"

# WebKitGTK on a headless X server: software rendering, no DMA-BUF.
export WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 NO_AT_BRIDGE=1
export DISPLAY=:99
Xvfb :99 -screen 0 1440x900x24 >/dev/null 2>&1 &
XVFB=$!
sleep 2

if [ "$KIND" = deb ]; then
  DEB_NAME=$(dpkg-deb -f "$PKG" Package)
  echo "Package name: $DEB_NAME"
  sudo apt-get install -y "$PKG"
  BIN=$(dpkg -L "$DEB_NAME" 2>/dev/null | grep -E '/bin/[^/]+$' | head -n1 || true)
  [ -n "$BIN" ] || BIN=$(command -v openfile)
  echo "Installed binary: $BIN"
  CMD=("$BIN")
else
  chmod +x "$PKG"
  # Like other Tauri/WebKitGTK AppImages, this one uses the host's Mesa EGL/GL drivers (they are on the AppImage
  # exclude list on purpose). Every Ubuntu desktop has them; the minimal runner image does not, so add them here.
  sudo apt-get install -y -qq libegl1 libgl1 libgles2 libgbm1 >/dev/null
  # Runs without FUSE (ubuntu-24.04 ships no libfuse2 by default).
  export APPIMAGE_EXTRACT_AND_RUN=1
  CMD=("$PKG")
fi

"${CMD[@]}" >"$OUT/openfile-$KIND.log" 2>&1 &
PID=$!
echo "Launched PID $PID, waiting ${WAIT}s"
sleep "$WAIT"
if command -v import >/dev/null; then import -display :99 -window root "$OUT/openfile-$KIND.png" || true
else ffmpeg -loglevel error -f x11grab -video_size 1440x900 -i :99 -frames:v 1 "$OUT/openfile-$KIND.png" || true; fi

FAILED=0
if kill -0 "$PID" 2>/dev/null; then echo "OpenFile is running, PID $PID"
else wait "$PID" && CODE=0 || CODE=$?; echo "::error::OpenFile exited early with code $CODE"; FAILED=1; fi
echo "---- app output"; tail -n 80 "$OUT/openfile-$KIND.log" || true
if grep -Eqi 'segmentation fault|panicked at|core dumped' "$OUT/openfile-$KIND.log"; then echo "::error::Crash text in app output"; FAILED=1; fi

kill "$PID" 2>/dev/null || true
pkill -x openfile 2>/dev/null || true
sleep 1
kill "$XVFB" 2>/dev/null || true
if [ "$KIND" = deb ]; then sudo apt-get remove -y "$DEB_NAME" || { echo "::error::apt remove failed"; FAILED=1; }; fi
[ "$FAILED" = 0 ] && echo "PASS: $KIND launch (${WAIT}s alive, no crash)"
exit "$FAILED"

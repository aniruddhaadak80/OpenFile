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

main_window() { xwininfo -display :99 -root -tree 2>/dev/null | grep -E '"OpenFile": \(.*\) +[0-9]{3,}x[0-9]{3,}' | head -n3 || true; }

# attempt <label> <command...>: launch, wait, then report whether the process is alive and the main window is mapped
attempt() {
  local label="$1"; shift
  local log="$OUT/openfile-$KIND-$label.log"
  "$@" >"$log" 2>&1 &
  PID=$!
  echo "[$label] launched PID $PID: $*  (waiting ${WAIT}s)"
  sleep "$WAIT"
  if command -v import >/dev/null; then import -display :99 -window root "$OUT/openfile-$KIND-$label.png" || true
  else ffmpeg -loglevel error -f x11grab -video_size 1440x900 -i :99 -frames:v 1 "$OUT/openfile-$KIND-$label.png" || true; fi
  ALIVE=0; kill -0 "$PID" 2>/dev/null && ALIVE=1
  WIN=$(main_window)
  echo "[$label] alive=$ALIVE window=${WIN:-none}"
  echo "[$label] processes:"; ps -eo pid,ppid,stat,etime,args | grep -iE 'openfile|WebKit|dbus' | grep -v grep || true
  echo "[$label] app output:"; tail -n 60 "$log" || true
  if [ "$ALIVE" = 0 ]; then wait "$PID" && CODE=0 || CODE=$?; echo "[$label] exited with code $CODE"; fi
  if grep -Eqi 'segmentation fault|panicked at|core dumped' "$log"; then echo "::error::[$label] crash text in app output"; CRASH=1; fi
  [ "$ALIVE" = 1 ] && [ -n "$WIN" ]
}
stop_app() { kill "$PID" 2>/dev/null || true; pkill -x openfile 2>/dev/null || true; pkill -f WebKitWebProcess 2>/dev/null || true; sleep 2; }

FAILED=0; CRASH=0
if attempt plain "${CMD[@]}"; then
  echo "Main window is up"
else
  stop_app
  # A desktop session always has a D-Bus session bus; the runner has none. Retry inside one to tell the two apart.
  if command -v dbus-run-session >/dev/null && attempt dbus dbus-run-session -- "${CMD[@]}"; then
    echo "::warning::$KIND: the main window only appeared with a D-Bus session bus (present on every Linux desktop, absent on the runner)"
  else
    echo "::error::$KIND: OpenFile did not show its main window within ${WAIT}s"; FAILED=1
    xwininfo -display :99 -root -tree 2>/dev/null | grep -v '(has no name)' | head -n 30
  fi
fi
[ "$CRASH" = 1 ] && FAILED=1

stop_app
kill "$XVFB" 2>/dev/null || true
if [ "$KIND" = deb ]; then sudo apt-get remove -y "$DEB_NAME" || { echo "::error::apt remove failed"; FAILED=1; }; fi
[ "$FAILED" = 0 ] && echo "PASS: $KIND launch (${WAIT}s alive, no crash)"
exit "$FAILED"

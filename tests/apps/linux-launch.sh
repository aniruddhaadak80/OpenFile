#!/usr/bin/env bash
# Starts the OpenFile Linux app the way a user would (no WEBKIT_* workarounds set), on X11 (Xvfb) or on Wayland
# (cage, a wlroots compositor, with its headless backend), inside a D-Bus session. After WAIT seconds it takes a
# screenshot and checks that the app is alive, that its window is not blank, and that its output has no startup error.
# Usage: tests/apps/linux-launch.sh <x11|wayland> <appimage|deb|rpm|bin> <package-or-binary> <label> [out-dir] [wait]
#   appimage  runs the AppImage (without FUSE, like a minimal system)
#   deb, rpm  installs the package first, runs /usr/bin/openfile, removes the package at the end
#   bin       runs the given binary as it is
# Exit code 0 means PASS. Needs the tools from tests/apps/linux-deps.sh.
set -uo pipefail
MODE="$1"; KIND="$2"; PKG="$(realpath "$3")"; LABEL="$4"; OUT="$(mkdir -p "${5:-app-start}" && realpath "${5:-app-start}")"; WAIT="${6:-25}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
. /etc/os-release
echo "== $LABEL: $PRETTY_NAME, kernel $(uname -r), $MODE, $KIND"
unset WEBKIT_DISABLE_DMABUF_RENDERER WEBKIT_DISABLE_COMPOSITING_MODE LIBGL_ALWAYS_SOFTWARE OPENFILE_SAFE_GPU OPENFILE_GPU
export NO_AT_BRIDGE=1
LOG="$OUT/$LABEL.log"; SHOT="$OUT/$LABEL.png"; : >"$LOG"
# a clean profile, like a first start
export HOME="$(mktemp -d /tmp/openfile-home.XXXX)"
export XDG_RUNTIME_DIR="$(mktemp -d /tmp/openfile-xdg.XXXX)"; chmod 700 "$XDG_RUNTIME_DIR"

case "$KIND" in
  deb)
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$PKG" >/dev/null || { echo "::error::$LABEL: deb install failed"; exit 1; }
    CMD=(/usr/bin/openfile) ;;
  rpm)
    if command -v dnf >/dev/null; then $SUDO dnf -y -q install "$PKG" >/dev/null; else $SUDO rpm -i "$PKG"; fi || { echo "::error::$LABEL: rpm install failed"; exit 1; }
    CMD=(/usr/bin/openfile) ;;
  appimage)
    chmod +x "$PKG"; export APPIMAGE_EXTRACT_AND_RUN=1; CMD=("$PKG") ;;
  bin) CMD=("$PKG") ;;
esac
echo "Command: ${CMD[*]}"
[ -x /usr/bin/openfile ] && { echo "Linked libraries (webkit, wayland, EGL):"; ldd /usr/bin/openfile | grep -E 'webkit|wayland|EGL|gtk-3' || true; }

COMP_PID=""
if [ "$MODE" = x11 ]; then
  Xvfb :99 -screen 0 1440x900x24 -nolisten tcp >"$OUT/$LABEL.xvfb.log" 2>&1 & COMP_PID=$!
  export DISPLAY=:99 GDK_BACKEND=x11; unset WAYLAND_DISPLAY
  sleep 2
  dbus-run-session -- "${CMD[@]}" >"$LOG" 2>&1 & APP_PID=$!
else
  export GDK_BACKEND=wayland WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 WLR_HEADLESS_OUTPUTS=1; unset DISPLAY
  # cage runs the app as its only client; the app's own output goes to $LOG
  dbus-run-session -- cage -- sh -c 'exec "$@" >"$0" 2>&1' "$LOG" "${CMD[@]}" >"$OUT/$LABEL.cage.log" 2>&1 & COMP_PID=$!; APP_PID=$COMP_PID
fi
echo "Started, waiting ${WAIT}s"
sleep "$WAIT"

if [ "$MODE" = x11 ]; then
  import -display :99 -window root "$SHOT" 2>/dev/null || echo "screenshot failed"
  WIN=$(xwininfo -display :99 -root -tree 2>/dev/null | grep -E '"OpenFile": \(.*\) +[0-9]{3,}x[0-9]{3,}' | head -n1 || true)
else
  SOCK=$(ls "$XDG_RUNTIME_DIR" | grep -E '^wayland-[0-9]+$' | head -n1)
  WAYLAND_DISPLAY="$SOCK" grim "$SHOT" || echo "screenshot failed (socket ${SOCK:-none})"
  WIN="wayland:${SOCK:-none}"
  echo "cage output:"; tail -n 15 "$OUT/$LABEL.cage.log" || true
fi

ALIVE=0
# the app process is named openfile for every package kind (the AppImage runs it from its extracted copy)
if pgrep -x openfile >/dev/null || pgrep -f 'AppRun.wrapped|/usr/bin/openfile' >/dev/null; then ALIVE=1; fi
echo "alive=$ALIVE window=${WIN:-none}"
ps -eo pid,ppid,stat,etime,args | grep -iE 'openfile|AppRun|WebKit|cage' | grep -v grep | head -n 12 || true
echo "---- app output ($LOG)"; tail -n 40 "$LOG" || true; echo "----"

FAILED=0
[ "$ALIVE" = 1 ] || { echo "::error::$LABEL: OpenFile is not running ${WAIT}s after start"; FAILED=1; }
[ -n "$WIN" ] || { echo "::error::$LABEL: no OpenFile window"; FAILED=1; }
python3 "$HERE/screen-check.py" "$SHOT" "$LOG" "$LABEL" || FAILED=1

pkill -x openfile 2>/dev/null; pkill -f 'AppRun.wrapped|/usr/bin/openfile' 2>/dev/null; pkill -f WebKitWebProcess 2>/dev/null; sleep 1
kill "$COMP_PID" 2>/dev/null; pkill -x cage 2>/dev/null; pkill -x Xvfb 2>/dev/null; sleep 1
case "$KIND" in
  deb) $SUDO apt-get remove -y -qq open-file >/dev/null || true ;;
  rpm) if command -v dnf >/dev/null; then $SUDO dnf -y -q remove open-file openfile >/dev/null 2>&1; else $SUDO rpm -e open-file openfile 2>/dev/null; fi || true ;;
esac
[ "$FAILED" = 0 ] && echo "PASS: $LABEL" || echo "FAIL: $LABEL"
exit "$FAILED"

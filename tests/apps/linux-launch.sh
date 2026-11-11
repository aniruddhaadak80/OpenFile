#!/usr/bin/env bash
# Starts the OpenFile Linux app the way a user would (no WEBKIT_* workarounds set), on X11 (Xvfb) or on Wayland
# (cage, a wlroots compositor, with its headless backend), inside a D-Bus session. After WAIT seconds it takes a
# screenshot and checks that the app is alive, that its window is not blank, and that its output has no startup error.
# Usage: tests/apps/linux-launch.sh <x11|wayland> <appimage|deb|rpm|bin> <package-or-binary> <label> [out-dir] [wait]
#   appimage  runs the AppImage (without FUSE, like a minimal system)
#   deb, rpm  installs the package first, runs /usr/bin/openfile, removes the package at the end
#   bin       runs the given binary as it is
# Exit code 0 means PASS. Needs the tools from tests/apps/linux-deps.sh. On a failure it starts the app again with
# other graphics settings and prints DIAG lines saying which one draws (NO_DIAG=1 skips that).
# SOFTWARE_CHECK=1 also starts it in software graphics mode (OPENFILE_SAFE_GPU=2, the mode nouveau systems start in,
# issue #10) and fails when that window is blank. OF_REQUIRE_FRAME=1 (read by screen-check.py) requires the
# "first frame drawn" line the Linux start check waits for.
set -uo pipefail
MODE="$1"; KIND="$2"; PKG="$(realpath "$3")"; LABEL="$4"; OUT="$(mkdir -p "${5:-app-start}" && realpath "${5:-app-start}")"; WAIT="${6:-25}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SUDO=""; [ "$(id -u)" = 0 ] || SUDO="sudo"
. /etc/os-release
echo "== $LABEL: $PRETTY_NAME, kernel $(uname -r), $MODE, $KIND"
unset WEBKIT_DISABLE_DMABUF_RENDERER WEBKIT_DISABLE_COMPOSITING_MODE LIBGL_ALWAYS_SOFTWARE WEBKIT_SKIA_ENABLE_CPU_RENDERING OPENFILE_SAFE_GPU OPENFILE_GPU
export NO_AT_BRIDGE=1
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

# run_once <label> [VAR=value ...]: start the app with the extra variables, wait, screenshot, check, stop it.
# Sets FAILED_ONCE=1 when the check fails.
run_once() {
  local label="$1"; shift
  local log="$OUT/$label.log" shot="$OUT/$label.png" comp app win sock alive=0
  : >"$log"; FAILED_ONCE=0
  if [ "$MODE" = x11 ]; then
    Xvfb :99 -screen 0 1440x900x24 -nolisten tcp >"$OUT/$label.xvfb.log" 2>&1 & comp=$!
    sleep 2
    env -u WAYLAND_DISPLAY DISPLAY=:99 GDK_BACKEND=x11 "$@" dbus-run-session -- "${CMD[@]}" >"$log" 2>&1 & app=$!
  else
    # cage runs the app as its only client; the app's own output goes to $log
    env -u DISPLAY GDK_BACKEND=wayland WLR_BACKENDS=headless WLR_RENDERER=pixman WLR_LIBINPUT_NO_DEVICES=1 WLR_HEADLESS_OUTPUTS=1 "$@" \
      dbus-run-session -- cage -- sh -c 'exec "$@" >"$0" 2>&1' "$log" "${CMD[@]}" >"$OUT/$label.cage.log" 2>&1 & comp=$!
  fi
  echo "[$label] started${*:+ with $*}, waiting ${WAIT}s"
  sleep "$WAIT"
  if [ "$MODE" = x11 ]; then
    import -display :99 -window root "$shot" 2>/dev/null || echo "screenshot failed"
    win=$(xwininfo -display :99 -root -tree 2>/dev/null | grep -E '"OpenFile": \(.*\) +[0-9]{3,}x[0-9]{3,}' | head -n1 || true)
  else
    sock=$(ls "$XDG_RUNTIME_DIR" | grep -E '^wayland-[0-9]+$' | head -n1)
    WAYLAND_DISPLAY="$sock" grim "$shot" || echo "screenshot failed (socket ${sock:-none})"
    win="wayland:${sock:-none}"
    echo "cage output:"; tail -n 8 "$OUT/$label.cage.log" || true
  fi
  # the app process is named openfile for every package kind (the AppImage runs it from its extracted copy)
  if pgrep -x openfile >/dev/null || pgrep -f 'AppRun.wrapped|/usr/bin/openfile' >/dev/null; then alive=1; fi
  echo "[$label] alive=$alive window=${win:-none}"
  ps -eo pid,ppid,stat,etime,args | grep -iE 'openfile|AppRun|WebKit|cage' | grep -v grep | head -n 12 || true
  echo "---- app output ($log)"; tail -n 40 "$log" || true; echo "----"
  [ "$alive" = 1 ] || { echo "::error::$label: OpenFile is not running ${WAIT}s after start"; FAILED_ONCE=1; }
  [ -n "$win" ] || { echo "::error::$label: no OpenFile window"; FAILED_ONCE=1; }
  python3 "$HERE/screen-check.py" "$shot" "$log" "$label" || FAILED_ONCE=1
  pkill -x openfile 2>/dev/null; pkill -f 'AppRun.wrapped|/usr/bin/openfile' 2>/dev/null; pkill -f WebKitWebProcess 2>/dev/null; sleep 1
  kill "$comp" 2>/dev/null; pkill -x cage 2>/dev/null; pkill -x Xvfb 2>/dev/null; sleep 1
}

run_once "$LABEL"
FAILED=$FAILED_ONCE
if [ -n "${SOFTWARE_CHECK:-}" ]; then
  # a fresh profile, so the run above cannot have left a remembered mode behind
  HOME_MAIN="$HOME"; export HOME="$(mktemp -d /tmp/openfile-home.XXXX)"
  export OF_EXPECT_MODE=software
  run_once "$LABEL-software" OPENFILE_SAFE_GPU=2
  unset OF_EXPECT_MODE
  [ "$FAILED_ONCE" = 0 ] || FAILED=1
  echo "SOFTWARE $LABEL: software graphics mode $([ "$FAILED_ONCE" = 0 ] && echo draws || echo 'does not draw')"
  export HOME="$HOME_MAIN"
fi
if [ "$FAILED" = 1 ] && [ -z "${NO_DIAG:-}" ]; then
  # Diagnostics only (they never change the result): which setting makes the window draw on this system
  echo "::group::Diagnostics for $LABEL"
  run_once "$LABEL-diag-safe-gpu" OPENFILE_SAFE_GPU=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1
  echo "DIAG $LABEL: safe graphics mode $([ "$FAILED_ONCE" = 0 ] && echo draws || echo 'does not draw')"
  if [ "$KIND" = appimage ]; then
    HOSTWL=$(for l in libwayland-client.so.0 libwayland-egl.so.1 libwayland-cursor.so.0 libwayland-server.so.0; do ldconfig -p | awk -v l="$l" '$1==l{print $NF; exit}'; done | paste -sd: -)
    run_once "$LABEL-diag-host-wayland" "LD_PRELOAD=$HOSTWL"
    echo "DIAG $LABEL: host libwayland preloaded ($HOSTWL) $([ "$FAILED_ONCE" = 0 ] && echo draws || echo 'does not draw')"
  fi
  echo "::endgroup::"
fi

case "$KIND" in
  deb) $SUDO apt-get remove -y -qq open-file >/dev/null || true ;;
  rpm) if command -v dnf >/dev/null; then $SUDO dnf -y -q remove open-file openfile >/dev/null 2>&1; else $SUDO rpm -e open-file openfile 2>/dev/null; fi || true ;;
esac
[ "$FAILED" = 0 ] && echo "PASS: $LABEL" || echo "FAIL: $LABEL"
exit "$FAILED"

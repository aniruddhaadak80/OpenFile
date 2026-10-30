#!/usr/bin/env bash
# Mounts the OpenFile .dmg, copies the .app out, clears quarantine (the app is unsigned), launches it with `open`,
# checks it stays alive with no crash report, takes a screenshot, then quits and removes it.
# Usage: tests/apps/macos-smoke.sh OpenFile-macos-universal.dmg [out-dir] [wait-seconds]
set -euo pipefail
DMG="$1"; OUT="${2:-app-smoke}"; WAIT="${3:-20}"
mkdir -p "$OUT"
sw_vers; uname -m
MARK=$(mktemp /tmp/openfile-start.XXXX)

MNT=$(mktemp -d /tmp/openfile-dmg.XXXX)
hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "$DMG"
APP_SRC=$(find "$MNT" -maxdepth 1 -name '*.app' | head -n1)
[ -n "$APP_SRC" ] || { echo "::error::No .app inside $DMG"; exit 1; }
DEST="$HOME/Applications"; mkdir -p "$DEST"
cp -R "$APP_SRC" "$DEST/"
# Detach can report "Resource busy" while Spotlight or diskimages-helper still holds the disk, and a second try then
# fails because the volume is already gone. The app is copied out by now, so retry a few times and never fail on it.
mounted() { mount | grep -qF "/$(basename "$MNT") ("; }  # macOS lists /tmp mounts under /private/tmp
for i in 1 2 3 4 5; do
  mounted || break
  hdiutil detach "$MNT" 2>/dev/null || hdiutil detach -force "$MNT" 2>/dev/null || sleep 2
done
mounted && echo "warning: $MNT still mounted, continuing" || true
APP="$DEST/$(basename "$APP_SRC")"
xattr -dr com.apple.quarantine "$APP" || true
BIN=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")
echo "App: $APP  executable: $BIN"
lipo -info "$APP/Contents/MacOS/$BIN" || true

open "$APP"
sleep "$WAIT"
screencapture -x "$OUT/openfile-macos.png" || echo "::warning::screencapture failed"

FAILED=0
PID=$(pgrep -f "$APP/Contents/MacOS/$BIN" | head -n1 || true)
if [ -n "$PID" ]; then echo "OpenFile is running, PID $PID"; else echo "::error::OpenFile is not running ${WAIT}s after launch"; FAILED=1; fi
CRASH=$(find "$HOME/Library/Logs/DiagnosticReports" /Library/Logs/DiagnosticReports -newer "$MARK" -iname "*${BIN}*" 2>/dev/null || true)
if [ -n "$CRASH" ]; then
  echo "::error::Crash report(s) found: $CRASH"; FAILED=1
  for f in $CRASH; do cp "$f" "$OUT/" 2>/dev/null || true; head -n 60 "$f" || true; done
fi

osascript -e 'tell application "OpenFile" to quit' 2>/dev/null || true
sleep 2
pkill -f "$APP/Contents/MacOS/$BIN" 2>/dev/null || true
rm -rf "$APP"
[ "$FAILED" = 0 ] && echo "PASS: dmg mount, copy, launch (${WAIT}s alive, no crash report)"
exit "$FAILED"

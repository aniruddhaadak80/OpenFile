#!/usr/bin/env bash
# Installs the OpenFile APK on a running emulator, launches it, checks the process stays alive with no
# fatal exception in logcat, and saves a screenshot. Called from reactivecircus/android-emulator-runner.
# Usage: tests/apps/android-smoke.sh OpenFile-android.apk [out-dir] [wait-seconds]
set -euo pipefail
APK="$1"; OUT="${2:-app-smoke}"; WAIT="${3:-25}"
PKG=com.aniruddhaadak.openfile
mkdir -p "$OUT"
adb wait-for-device
echo "Android $(adb shell getprop ro.build.version.release | tr -d '\r') API $(adb shell getprop ro.build.version.sdk | tr -d '\r') $(adb shell getprop ro.product.cpu.abi | tr -d '\r')"
adb logcat -c || true
adb install -r -g "$APK"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep "$WAIT"
adb exec-out screencap -p > "$OUT/openfile-android.png" || true
adb logcat -d > "$OUT/logcat.txt" || true

FAILED=0
APP_PID=$(adb shell pidof "$PKG" | tr -d '\r' || true)
if [ -n "$APP_PID" ]; then echo "OpenFile is running, PID $APP_PID"; else echo "::error::OpenFile is not running ${WAIT}s after launch"; FAILED=1; fi
if grep -E "FATAL EXCEPTION|ANR in $PKG" -A20 "$OUT/logcat.txt" | grep -q "$PKG"; then
  echo "::error::Crash or ANR for $PKG in logcat"; grep -E "FATAL EXCEPTION|ANR in" -A30 "$OUT/logcat.txt" | head -n 80; FAILED=1
fi
# Uncaught errors in the web layer (Capacitor forwards them to logcat).
WV=$(adb shell dumpsys webviewupdate 2>/dev/null | grep -m1 -E 'Current WebView package' | tr -d '\r' || true)
echo "WebView: ${WV:-unknown}"
WV_MAJOR=$(echo "$WV" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 | cut -d. -f1)
# Ignored: Capacitor 8 SystemBars logs (and catches) "Error injecting safe area CSS" when its native script runs
# before document.documentElement exists. Framework bug, https://github.com/ionic-team/capacitor/issues/8530;
# the app reads env(safe-area-inset-*) and does not depend on the injected variables.
JS_ERR=$(grep -E 'Capacitor: JavaScript Error|Capacitor/Console.*(Uncaught|SyntaxError|TypeError|ReferenceError)' "$OUT/logcat.txt" | grep -v 'Error injecting safe area CSS' || true)
if [ -n "$JS_ERR" ]; then
  echo "$JS_ERR" | head -n 20
  if [ -n "$WV_MAJOR" ] && [ "$WV_MAJOR" -lt "${MIN_WEBVIEW:-100}" ]; then
    echo "::warning::JavaScript errors on WebView $WV_MAJOR. This emulator image ships a frozen WebView older than ${MIN_WEBVIEW:-100}; real devices update it from Google Play. Not counted as a failure."
  else
    echo "::error::JavaScript errors in the app web layer on WebView ${WV_MAJOR:-unknown}"; FAILED=1
  fi
fi
FOCUS=$(adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | head -n2 || true)
echo "Window focus: $FOCUS"
grep -i "Capacitor\|chromium" "$OUT/logcat.txt" | tail -n 30 || true
adb uninstall "$PKG" || true
[ "$FAILED" = 0 ] && echo "PASS: APK install and launch (${WAIT}s alive, no fatal exception)"
exit "$FAILED"

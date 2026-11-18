#!/usr/bin/env python3
"""Checks a screenshot of the OpenFile window and, when given, the app's output.

Usage: screen-check.py <screenshot.png> [app-output.log|-] [label]

Looks at the middle of the screen (half the width and half the height), which the centred OpenFile window always
covers. A blank window (one flat colour, like the black window in issue #10) or a window still showing only the
start-up splash has one colour on nearly every pixel there. The real interface has text, icons and gradients.
The app output fails the check when it has a known start-up error from WebKitGTK, Mesa, Wayland or a crash.
With OF_REQUIRE_FRAME=1 the output must also say "OpenFile: first frame drawn" (the page told the app it drew, which
is what the Linux start check in desktop/src-tauri/src/main.rs waits for) and, with OF_EXPECT_MODE=<mode>, name the
graphics mode it started in (standard, safe, software).
Prints one result line and exits 1 on failure. Needs Pillow.
"""
import os
import re
import sys
from collections import Counter

from PIL import Image

FATAL = [
    r"\*\* \(.*\): ERROR \*\*",
    r"WebProcess didn't exit as expected",
    r"EGL_BAD_",
    r"Could not create default EGL display",
    r"Error 71 \(Protocol error\)",
    r"AcceleratedSurfaceDMABuf was unable",
    r"GBM-DRV error",
    r"Failed to create GBM buffer",
    r"Failed to create EGL images",
    r"panicked at",
    r"Segmentation fault",
    r"core dumped",
    r"OpenFile could not open its window",
    r"restarting in \w+ graphics mode",
    r"could not draw its window",
    r"drew nothing",
]


def main() -> int:
    shot = sys.argv[1]
    log = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "-" else None
    label = sys.argv[3] if len(sys.argv) > 3 else shot
    problems = []
    stats = ""
    try:
        img = Image.open(shot).convert("RGB")
        w, h = img.size
        mid = img.crop((w // 4, h // 4, w - w // 4, h - h // 4))
        mid.thumbnail((480, 300))
        raw = mid.tobytes()
        px = [tuple(raw[i:i + 3]) for i in range(0, len(raw), 3)]
        # group close colours (16 levels per channel) so anti-aliasing does not count as content
        counts = Counter((r >> 4, g >> 4, b >> 4) for r, g, b in px)
        top = counts.most_common(1)[0][1] / len(px)
        lum = [0.299 * r + 0.587 * g + 0.114 * b for r, g, b in px]
        mean = sum(lum) / len(lum)
        std = (sum((v - mean) ** 2 for v in lum) / len(lum)) ** 0.5
        stats = f"{w}x{h}, main colour covers {top:.0%} of the middle, {len(counts)} colour groups, brightness spread {std:.1f}"
        if top > 0.92 or std < 4 or len(counts) < 12:
            problems.append("the window looks blank (one flat colour or only the start-up splash)")
    except Exception as e:  # no screenshot is a failure too
        problems.append(f"no usable screenshot ({e})")
    if log:
        try:
            text = open(log, encoding="utf-8", errors="replace").read()
            for pat in FATAL:
                m = re.search(pat, text)
                if m:
                    line = text[max(0, text.rfind("\n", 0, m.start()) + 1):].split("\n", 1)[0]
                    msg = f"start-up error in the app output: {line.strip()[:200]}"
                    if msg not in problems:
                        problems.append(msg)
            if os.environ.get("OF_REQUIRE_FRAME") == "1" and "OpenFile: first frame drawn" not in text:
                problems.append("the page never told the app it drew a frame (no 'OpenFile: first frame drawn')")
            mode = os.environ.get("OF_EXPECT_MODE")
            if mode and f"OpenFile: {mode} graphics mode" not in text:
                problems.append(f"the app did not start in {mode} graphics mode")
        except OSError as e:
            problems.append(f"app output not readable ({e})")
    if problems:
        for p in problems:
            print(f"::error::{label}: {p}")
        print(f"FAIL {label}: {stats}")
        return 1
    print(f"OK {label}: {stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

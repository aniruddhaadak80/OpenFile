#!/usr/bin/env python3
"""
OpenFile apps film: OpenFile installed on every device (web, Windows, macOS, Linux, Android, iPhone), the install
steps, and the offline and private message. Music bed only, no voice.

Outputs: public/media/apps.mp4 (1920x1080), public/media/apps-vertical.mp4 (1080x1920), public/media/apps-poster.webp
Same open-source stack as make.py (cairocffi + Pillow + numpy + ffmpeg), see scripts/media-lib/ofmedia.py.

Render in chunks (each call stays short), then mux:
  python3 scripts/launch-video/apps.py --orient h --frames 0 240      # writes a segment
  python3 scripts/launch-video/apps.py --orient h --mux               # concat segments + music -> apps.mp4
  python3 scripts/launch-video/apps.py --orient h --still 12.0 out.png
On-screen text rule: no em dashes, no exclamation marks, plain words.
"""
import math, os, sys, json, subprocess, argparse, glob
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'media-lib'))
from ofmedia import *  # noqa

ap = argparse.ArgumentParser()
ap.add_argument('--orient', default='h', choices=['h', 'v'])
ap.add_argument('--frames', nargs=2, type=int)
ap.add_argument('--still', nargs=2)
ap.add_argument('--mux', action='store_true')
ap.add_argument('--audio', action='store_true')
A = ap.parse_args()

V = A.orient == 'v'
W, H, FPS = (1080, 1920, 30) if V else (1920, 1080, 30)
OUT = os.path.join(REPO, 'public', 'media')
WORK = os.path.join(CACHE_DIR, 'apps-' + A.orient)
os.makedirs(WORK, exist_ok=True)

SCENES = [('intro', 4.6), ('devices', 9.4), ('install', 10.4), ('phone', 6.8), ('offline', 6.6), ('end', 6.2)]
T0 = {}
_t = 0.0
for k, d in SCENES:
    T0[k] = _t
    _t += d
DUR = _t
LINES = ['Now an app on every device.', 'Web. Windows. macOS. Linux. Android. iPhone.', 'Install in three clicks.',
         'Open OpenFile', 'Click Install', 'Use it like any app', 'On iPhone: Share, then Add to Home Screen.',
         'Works offline.', 'Your files never leave your device.', '0 bytes uploaded', 'Install OpenFile', 'Free. Open source. Private.']
for s in LINES:
    assert '\u2014' not in s and '!' not in s

BG = make_background(W, H, glow_pos=(0.5, 0.42), glow2=(0.85, 0.9))
BG2 = make_background(W, H, glow_pos=(0.3, 0.5), glow2=(0.8, 0.2), c2=CYAN)
PART = Particles(120 if not V else 110, W, H, seed=11, speed=12)
PART2 = Particles(50, W, H, seed=5, colors=(TEAL, CYAN, GOLD), speed=8, size=(0.8, 1.8))
ORANGE = hexrgb('#F97316')
LIME = hexrgb('#84CC16')
WHITE = hexrgb('#E5E7EB')
RED = hexrgb('#EF4444')
TILE = [GOLD, TEAL, CYAN, EMERALD, SKY, ORANGE, LIME, hexrgb('#FFD27A')]


# ----------------------------------------------------------------------------- device drawing
def mini_ui(c, x, y, w, h, t, alpha=1.0, compact=False, title='OpenFile'):
    """The OpenFile home screen in miniature: logo, headline bars, tool grid."""
    rrect(c, x, y, w, h, 6, fill=BLACK, alpha=alpha)
    s = min(w, h)
    pad = max(6, w * 0.05)
    # logo dot + name
    circle(c, x + pad + s * 0.035, y + pad + s * 0.035, s * 0.03, stroke=GOLD, lw=max(1.5, s * 0.012), alpha=alpha)
    f = font(SANS, max(9, int(s * 0.06)), 'Bold')
    text(c, title, f, x + pad + s * 0.08, y + pad + s * 0.035, alpha=alpha, anchor='lm')
    # headline
    rrect(c, x + pad, y + pad + s * 0.12, w * 0.55, s * 0.05, s * 0.02, fill=TEXT, alpha=alpha * 0.9)
    linear_fill(c, x + pad, 0, x + pad + w * 0.45, 0, [(0, GOLD), (1, TEAL)], alpha)
    rrect_path(c, x + pad, y + pad + s * 0.2, w * 0.45, s * 0.05, s * 0.02); c.fill()
    cols = 2 if compact else 4
    rows = 3 if compact else 2
    gy = y + pad + s * (0.32 if not compact else 0.3)
    gw = (w - pad * 2 - (cols - 1) * pad * 0.6) / cols
    gh = min((y + h - pad - gy - (rows - 1) * pad * 0.6) / rows, gw * 0.75)
    for i in range(cols * rows):
        k = ease_out_back(clamp(t * 2.2 - i * 0.12), 1.4)
        if k <= 0:
            continue
        cx = x + pad + (i % cols) * (gw + pad * 0.6)
        cy = gy + (i // cols) * (gh + pad * 0.6)
        rrect(c, cx, cy, gw, gh, 4, fill=SURF, stroke=LINE, lw=1, alpha=alpha * clamp(k))
        rrect(c, cx + gw * 0.12, cy + gh * 0.15, gw * 0.22, gw * 0.22, 3, fill=TILE[i % 8], alpha=alpha * clamp(k) * 0.9)
        rrect(c, cx + gw * 0.12, cy + gh * 0.68, gw * 0.6, max(2, gh * 0.09), 2, fill=LINE, alpha=alpha * clamp(k))


def window_bar(c, x, y, w, os_, alpha):
    bh = max(14, w * 0.045)
    rrect(c, x, y, w, bh, 6, fill=SURF2, alpha=alpha)
    if os_ == 'mac':
        for i, col in enumerate([RED, GOLD, EMERALD]):
            circle(c, x + bh * 0.7 + i * bh * 0.55, y + bh / 2, bh * 0.17, fill=col, alpha=alpha)
    elif os_ == 'linux':
        circle(c, x + w - bh * 0.7, y + bh / 2, bh * 0.2, fill=ORANGE, alpha=alpha)
        for i in range(2):
            circle(c, x + w - bh * (1.3 + i * 0.6), y + bh / 2, bh * 0.16, fill=MUTED, alpha=alpha * 0.7)
    else:
        for i in range(3):
            line(c, x + w - bh * (0.6 + i * 0.9), y + bh * 0.5 - 3, x + w - bh * (0.6 + i * 0.9) - bh * 0.35, y + bh * 0.5 - 3, MUTED, 1.5, alpha)
    return bh


def laptop(c, cx, cy, w, t, os_='win', alpha=1.0, title='OpenFile'):
    h = w * 0.62
    x, y = cx - w / 2, cy - h / 2
    rrect(c, x - w * 0.025, y - w * 0.025, w * 1.05, h + w * 0.05, w * 0.03, fill=hexrgb('#1A1D22'), stroke=hexrgb('#2B3038'), lw=2, alpha=alpha)
    bh = window_bar(c, x, y, w, os_, alpha)
    mini_ui(c, x, y + bh, w, h - bh, t, alpha, title=title)
    # base
    c.move_to(cx - w * 0.6, y + h + w * 0.03); c.line_to(cx + w * 0.6, y + h + w * 0.03)
    c.line_to(cx + w * 0.55, y + h + w * 0.075); c.line_to(cx - w * 0.55, y + h + w * 0.075); c.close_path()
    c.set_source_rgba(*rgbf(hexrgb('#2A2E35'), alpha)); c.fill()
    rrect(c, cx - w * 0.08, y + h + w * 0.03, w * 0.16, w * 0.012, 3, fill=hexrgb('#16181C'), alpha=alpha)


def monitor(c, cx, cy, w, t, alpha=1.0):
    h = w * 0.6
    x, y = cx - w / 2, cy - h / 2
    rrect(c, x - w * 0.025, y - w * 0.025, w * 1.05, h + w * 0.09, w * 0.03, fill=hexrgb('#D9DCE1'), alpha=alpha)
    rrect(c, x, y, w, h, 4, fill=BLACK, alpha=alpha)
    bh = window_bar(c, x, y, w, 'mac', alpha)
    mini_ui(c, x, y + bh, w, h - bh, t, alpha)
    c.move_to(cx - w * 0.07, y + h + w * 0.065); c.line_to(cx + w * 0.07, y + h + w * 0.065)
    c.line_to(cx + w * 0.1, y + h + w * 0.19); c.line_to(cx - w * 0.1, y + h + w * 0.19); c.close_path()
    c.set_source_rgba(*rgbf(hexrgb('#BFC3C9'), alpha)); c.fill()
    rrect(c, cx - w * 0.16, y + h + w * 0.185, w * 0.32, w * 0.02, 4, fill=hexrgb('#AEB2B8'), alpha=alpha)


def browser(c, x, y, w, h, t, alpha=1.0, install_hot=0.0, glow=None):
    rrect(c, x, y, w, h, 14, fill=SURF, stroke=LINE, lw=2, alpha=alpha)
    bh = h * 0.12
    rrect(c, x, y, w, bh, 14, fill=SURF2, alpha=alpha)
    for i, col in enumerate([RED, GOLD, EMERALD]):
        circle(c, x + 22 + i * 18, y + bh / 2, 5.5, fill=col, alpha=alpha)
    rrect(c, x + 90, y + bh * 0.22, w - 200, bh * 0.56, bh * 0.28, fill=BLACK, alpha=alpha)
    text(c, 'openfile app', font(SANS, int(bh * 0.3), 'Medium'), x + 115, y + bh / 2, color=MUTED, alpha=alpha, anchor='lm')
    ix, iy = x + w - 80, y + bh / 2
    circle(c, ix, iy, bh * 0.3, fill=GOLD if install_hot > 0 else SURF, alpha=alpha * (0.25 + 0.75 * install_hot) if install_hot > 0 else alpha)
    draw_sprite(c, icon_sprite('Download', int(bh * 0.36), BLACK if install_hot > 0.5 else GOLD), ix, iy, alpha)
    if install_hot > 0 and glow is not None:
        circle(glow, ix, iy, bh * 0.6, fill=GLOW, alpha=install_hot * 0.9)
    mini_ui(c, x + 2, y + bh, w - 4, h - bh - 2, t, alpha)
    return ix, iy


def phone(c, cx, cy, h, t, kind='ios', alpha=1.0, content=None):
    w = h * 0.48
    x, y = cx - w / 2, cy - h / 2
    rrect(c, x - 7, y - 7, w + 14, h + 14, w * 0.17, fill=hexrgb('#1F2329'), stroke=hexrgb('#30353D'), lw=2, alpha=alpha)
    rrect(c, x, y, w, h, w * 0.14, fill=BLACK, alpha=alpha)
    if kind == 'ios':
        rrect(c, cx - w * 0.17, y + h * 0.018, w * 0.34, h * 0.03, h * 0.015, fill=hexrgb('#000000'), stroke=hexrgb('#22262c'), lw=1, alpha=alpha)
    else:
        circle(c, cx, y + h * 0.03, h * 0.012, fill=hexrgb('#16181c'), alpha=alpha)
    if content is None:
        mini_ui(c, x + w * 0.04, y + h * 0.07, w * 0.92, h * 0.86, t, alpha, compact=True)
    else:
        content(c, x, y, w, h)
    return x, y, w, h


def cursor(c, x, y, alpha=1.0, press=0.0, s=1.0):
    c.save(); c.translate(x, y); c.scale(s * (1 - 0.12 * press), s * (1 - 0.12 * press))
    c.move_to(0, 0); c.line_to(0, 34); c.line_to(9, 26); c.line_to(16, 41); c.line_to(22, 38); c.line_to(15, 24); c.line_to(26, 24); c.close_path()
    c.set_source_rgba(*rgbf(TEXT, alpha)); c.fill_preserve(); c.set_source_rgba(0, 0, 0, alpha); c.set_line_width(2); c.stroke()
    c.restore()


def tap_ring(c, g, x, y, k, color=GOLD):
    if 0 < k < 1:
        circle(c, x, y, 14 + 46 * ease_out(k), stroke=color, lw=3, alpha=(1 - k))
        if g is not None:
            circle(g, x, y, 30, fill=GLOW, alpha=(1 - k) * 0.8)


# ----------------------------------------------------------------------------- scenes
def sc_intro(c, g, t, d):
    cy = H * (0.36 if not V else 0.36)
    p = ease_in_out(t / 1.4)
    logo_mark(c, g, W / 2, cy, 250 if not V else 300, t, progress=p)
    GL.dirty = True
    for i in range(3):
        k = clamp((t - 1.3 - i * 0.18) / 1.4)
        if 0 < k < 1:
            arc(c, W / 2, cy, 150 + 520 * ease_out(k), 0, 2 * math.pi, GOLD, 2, (1 - k) * 0.55)
    if t > 0.9:
        tt = t - 0.9
        f = font(DISPLAY, 140 if not V else 150, 'Bold')
        s = 'OpenFile'
        x = W / 2 - text_width(s, f) / 2
        yy = cy + (300 if not V else 340)
        for i, ch in enumerate(s):
            k = ease_out((tt - i * 0.05) / 0.6)
            if k > 0:
                text(c, ch, f, x, yy + (1 - k) * 50, gradient=GOLD_GRAD, anchor='lm', alpha=k)
            x += f.getlength(ch)
        if V:
            kinetic_words(c, 'Now an app on', font(SANS, 62, 'SemiBold'), W / 2, yy + 160, tt - 0.8)
            kinetic_words(c, 'every device.', font(SANS, 62, 'SemiBold'), W / 2, yy + 240, tt - 1.0, gradient=GOLD_TEAL)
        else:
            kinetic_words(c, 'Now an app on every device.', font(SANS, 56, 'SemiBold'), W / 2, yy + 130, tt - 0.8)


DEVICES = [('Web', 'browser', SKY), ('Windows', 'win', SKY), ('macOS', 'mac', WHITE), ('Linux', 'linux', ORANGE), ('Android', 'android', EMERALD), ('iPhone', 'ios', CYAN)]


def draw_device(c, g, kind, cx, cy, s, t, alpha):
    if kind == 'browser':
        browser(c, cx - s * 0.62, cy - s * 0.4, s * 1.24, s * 0.8, t, alpha)
    elif kind == 'win':
        laptop(c, cx, cy - s * 0.03, s * 1.12, t, 'win', alpha)
    elif kind == 'mac':
        monitor(c, cx, cy - s * 0.1, s * 1.05, t, alpha)
    elif kind == 'linux':
        laptop(c, cx, cy - s * 0.03, s * 1.12, t, 'linux', alpha)
    else:
        phone(c, cx, cy, s * 1.05, t, 'ios' if kind == 'ios' else 'android', alpha)


def sc_devices(c, g, t, d):
    if V:
        kinetic_words(c, 'One app.', font(DISPLAY, 92, 'Bold'), W / 2, 200, t - 0.1)
        kinetic_words(c, 'Every screen.', font(DISPLAY, 92, 'Bold'), W / 2, 310, t - 0.3, gradient=GOLD_TEAL)
        pos = [(W * 0.27, 600), (W * 0.73, 600), (W * 0.27, 1050), (W * 0.73, 1050), (W * 0.27, 1500), (W * 0.73, 1500)]
        s = 320
    else:
        kinetic_words(c, 'One app. Every screen.', font(DISPLAY, 84, 'Bold'), W / 2, 150, t - 0.1)
        pos = [(W * (0.1 + i * 0.16), 600) for i in range(6)]
        s = 240
    for i, (lab, kind, ac) in enumerate(DEVICES):
        k = ease_out_back((t - 0.5 - i * 0.32) / 0.7, 1.3)
        if k <= 0:
            continue
        x, y = pos[i]
        y += (1 - clamp(k)) * 120 + math.sin(t * 1.6 + i) * 6
        ss = s * (0.85 + 0.15 * clamp(k))
        if kind in ('android', 'ios'):
            ss *= 1.25 if not V else 0.95
        lt = max(0, t - 0.7 - i * 0.32)
        draw_device(c, g, kind, x, y, ss, lt, clamp(k))
        ly = y + (ss * 0.68 if kind in ('android', 'ios') else ss * 0.55) + 30
        text(c, lab, font(SANS, 40 if not V else 44, 'SemiBold'), x, ly, alpha=clamp(k))
        rrect(c, x - 26, ly + 34, 52, 5, 3, fill=ac, alpha=clamp(k))
    # the platform line at the bottom
    k = ease_out((t - 3.0) / 0.8)
    if k > 0 and not V:
        text(c, 'Web. Windows. macOS. Linux. Android. iPhone.', font(MONO, 34, 'Medium'), W / 2, 960 + (1 - k) * 20, color=MUTED, alpha=k)
    # sweeping light ring around the active device
    act = int(((t - 3.2) * 1.4)) % 6 if t > 3.2 else -1
    if act >= 0:
        x, y = pos[act]
        gold_ring(c, g, x, y, s * (0.85 if not V else 0.7), t, alpha=0.25, orbit=False)
        GL.dirty = True


STEPS = [('1', 'Open OpenFile', 'In any modern browser'), ('2', 'Click Install', 'In the header or address bar'), ('3', 'Use it like any app', 'In its own window, offline too')]


def sc_install(c, g, t, d):
    title_y = 130 if not V else 190
    kinetic_words(c, 'Install in three clicks.', font(DISPLAY, 80 if not V else 76, 'Bold'), W / 2, title_y, t - 0.1)
    if V:
        bx, by, bw, bh = 90, 330, 900, 640
    else:
        bx, by, bw, bh = 120, 250, 1020, 700
    k = ease_out((t - 0.3) / 0.7)
    # phases: 0-2.6 browse, 2.6-4.6 cursor to install, 4.6 click, dialog, 6.4 click Install, app window
    hot = clamp((t - 3.6) / 0.4) * (0.6 + 0.4 * math.sin(t * 8) ** 2) if t < 6.6 else 0
    c.save(); c.translate(0, (1 - k) * 60)
    ix, iy = browser(c, bx, by, bw, bh, t - 0.5, k, install_hot=hot, glow=g)
    # install dialog
    dk = ease_out_back((t - 4.8) / 0.5, 1.3) if t < 7.0 else 1 - ease_in_out((t - 7.0) / 0.35)
    if dk > 0 and t > 4.8:
        dw, dh = (440, 230) if not V else (480, 250)
        dx, dy = ix - dw + 40, iy + 40
        rrect(c, dx + 10, dy + 16, dw, dh, 22, fill=(0, 0, 0), alpha=0.5 * clamp(dk))
        rrect(c, dx, dy, dw, dh, 22, fill=SURF, stroke=LINE, lw=2, alpha=clamp(dk))
        text(c, 'Install app?', font(SANS, 30, 'SemiBold'), dx + 30, dy + 46, alpha=clamp(dk), anchor='lm')
        rrect(c, dx + 30, dy + 80, 64, 64, 16, fill=BLACK, stroke=GOLD, lw=2, alpha=clamp(dk))
        circle(c, dx + 62, dy + 112, 14, stroke=GOLD, lw=4, alpha=clamp(dk))
        text(c, 'OpenFile', font(SANS, 28, 'SemiBold'), dx + 112, dy + 100, alpha=clamp(dk), anchor='lm')
        text(c, 'openfile app', font(SANS, 22, 'Regular'), dx + 112, dy + 132, color=MUTED, alpha=clamp(dk), anchor='lm')
        bxx, byy = dx + dw - 170, dy + dh - 66
        rrect(c, bxx, byy, 140, 48, 12, fill=GOLD, alpha=clamp(dk))
        text(c, 'Install', font(SANS, 24, 'Bold'), bxx + 70, byy + 24, color=BLACK, alpha=clamp(dk))
        text(c, 'Cancel', font(SANS, 24, 'Medium'), bxx - 70, byy + 24, color=MUTED, alpha=clamp(dk))
        tap_ring(c, g, bxx + 70, byy + 24, (t - 6.4) / 0.6)
    # app window springs out
    ak = ease_out_back((t - 7.1) / 0.7, 1.2)
    if ak > 0:
        aw, ah = bw * 0.8, bh * 0.78
        ax, ay = bx + bw / 2 - aw / 2, by + bh / 2 - ah / 2 + (1 - clamp(ak)) * 50
        rrect(g, ax, ay, aw, ah, 16, stroke=GOLD, lw=10, alpha=0.6 * clamp(ak))
        rrect(c, ax - 3, ay - 3, aw + 6, ah + 6, 16, fill=SURF2, stroke=GOLD, lw=2, alpha=clamp(ak))
        wb = window_bar(c, ax, ay, aw, 'win', clamp(ak))
        text(c, 'OpenFile', font(SANS, int(wb * 0.45), 'SemiBold'), ax + aw / 2, ay + wb / 2, color=MUTED, alpha=clamp(ak))
        mini_ui(c, ax, ay + wb, aw, ah - wb, t - 7.2, clamp(ak))
        GL.dirty = True
    # cursor path
    if 1.0 < t < 7.2:
        p1 = ease_in_out((t - 2.4) / 1.2)
        p2 = ease_in_out((t - 5.4) / 0.9)
        sx, sy = bx + bw * 0.45, by + bh * 0.62
        x = lerp(sx, ix - 6, p1); y = lerp(sy, iy - 4, p1)
        if t > 5.4:
            dw = 440 if not V else 480
            tx, ty = ix - dw + 40 + dw - 100, iy + 40 + (230 if not V else 250) - 42
            x = lerp(ix - 6, tx, p2); y = lerp(iy - 4, ty, p2)
        press = max(math.exp(-abs(t - 4.6) * 10), math.exp(-abs(t - 6.4) * 10))
        cursor(c, x, y, 1.0, press, 1.2)
        tap_ring(c, g, ix, iy, (t - 4.6) / 0.6)
    c.restore()
    # step list
    for i, (n, lab, sub) in enumerate(STEPS):
        on = (t < 3.6 and i == 0) or (3.6 <= t < 7.1 and i == 1) or (t >= 7.1 and i == 2)
        done = (i == 0 and t >= 3.6) or (i == 1 and t >= 7.1)
        kk = ease_out((t - 0.6 - i * 0.25) / 0.5)
        if kk <= 0:
            continue
        if V:
            x0, y0 = 120, 1120 + i * 200
        else:
            x0, y0 = 1250, 360 + i * 200
        col = GOLD if on else (EMERALD if done else LINE)
        circle(c, x0 + 40, y0, 40, fill=col if (on or done) else SURF, stroke=col, lw=3, alpha=kk)
        if on:
            circle(g, x0 + 40, y0, 46, fill=GLOW, alpha=0.6); GL.dirty = True
        if done:
            c.move_to(x0 + 24, y0 + 2); c.line_to(x0 + 36, y0 + 14); c.line_to(x0 + 58, y0 - 12)
            c.set_source_rgba(*rgbf(BLACK, kk)); c.set_line_width(6); c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND); c.stroke()
        else:
            text(c, n, font(DISPLAY, 38, 'Bold'), x0 + 40, y0 + 2, color=BLACK if on else MUTED, alpha=kk)
        text(c, lab, font(SANS, 44, 'SemiBold'), x0 + 110 + (1 - kk) * 30, y0 - 18, color=TEXT if (on or done) else MUTED, alpha=kk, anchor='lm')
        text(c, sub, font(SANS, 28, 'Regular'), x0 + 110 + (1 - kk) * 30, y0 + 28, color=MUTED, alpha=kk, anchor='lm')
        if i < 2:
            line(c, x0 + 40, y0 + 48, x0 + 40, y0 + 152, EMERALD if done else LINE, 3, kk)


def sc_phone(c, g, t, d):
    ph = 1180 if V else 760
    cx, cy = (W / 2, H * 0.47) if V else (W * 0.33, H * 0.53)
    k = ease_out((t - 0.1) / 0.6)
    stage = 0 if t < 1.9 else (1 if t < 3.8 else 2)

    def content(c2, x, y, w, h):
        if stage < 2:
            mini_ui(c2, x + w * 0.04, y + h * 0.07, w * 0.92, h * 0.78, t, k, compact=True)
            rrect(c2, x, y + h * 0.9, w, h * 0.1, 0, fill=SURF, alpha=k)
            sx, sy = x + w * 0.5, y + h * 0.945
            draw_sprite(c2, icon_sprite('Share', int(h * 0.04), SKY), sx, sy, k)
            if stage == 0:
                tap_ring(c2, g, sx, sy, (t - 1.3) / 0.6, SKY)
            if stage == 1:
                sk = ease_out((t - 1.9) / 0.45)
                sh = h * 0.48
                sy0 = y + h - sh * sk
                rrect(c2, x, sy0, w, sh + 40, 30, fill=SURF2, alpha=k)
                rows = ['Copy', 'Add Bookmark', 'Add to Home Screen', 'Find on Page']
                for i, r in enumerate(rows):
                    ry = sy0 + 60 + i * sh * 0.2
                    hot = r == 'Add to Home Screen'
                    if hot:
                        rrect(c2, x + 20, ry - 30, w - 40, 60, 14, fill=GOLD, alpha=0.18 * k)
                        draw_sprite(c2, icon_sprite('SquarePlus', int(h * 0.03), GOLD), x + w - 54, ry, k)
                    text(c2, r, font(SANS, int(h * 0.026), 'SemiBold' if hot else 'Regular'), x + 40, ry, color=GOLD if hot else MUTED, alpha=k, anchor='lm')
                    if hot:
                        tap_ring(c2, g, x + w * 0.45, ry, (t - 3.0) / 0.6)
        else:
            # home screen with the new icon popping in
            cols = 4
            iw = w * 0.17
            gap = (w - cols * iw) / (cols + 1)
            for i in range(11):
                ix = x + gap + (i % cols) * (iw + gap)
                iy = y + h * 0.1 + (i // cols) * (iw + h * 0.05)
                if i == 10:
                    pk = ease_out_back((t - 4.1) / 0.6, 1.8)
                    if pk > 0:
                        c2.save(); c2.translate(ix + iw / 2, iy + iw / 2); c2.scale(clamp(pk, 0, 1.3), clamp(pk, 0, 1.3))
                        rrect(c2, -iw / 2, -iw / 2, iw, iw, iw * 0.24, fill=BLACK, stroke=GOLD, lw=2, alpha=k)
                        circle(c2, 0, iw * 0.06, iw * 0.16, stroke=GOLD, lw=max(2, iw * 0.06), alpha=k)
                        c2.restore()
                        text(c2, 'OpenFile', font(SANS, int(h * 0.02), 'Medium'), ix + iw / 2, iy + iw + h * 0.018, alpha=k * clamp(pk))
                        circle(g, ix + iw / 2, iy + iw / 2, iw * 0.9, fill=GLOW, alpha=0.7 * (1 - clamp((t - 4.6) / 1.2)))
                        GL.dirty = True
                else:
                    rrect(c2, ix, iy, iw, iw, iw * 0.24, fill=TILE[i % 8], alpha=k * 0.45)
                    rrect(c2, ix + iw * 0.2, iy + iw + h * 0.012, iw * 0.6, h * 0.008, 3, fill=LINE, alpha=k)

    c.save(); c.translate(0, (1 - k) * 80)
    phone(c, cx, cy, ph, t, 'ios', k, content)
    c.restore()
    # captions
    caps = ['Tap Share', 'Add to Home Screen', 'Done. It opens full screen.']
    if V:
        kinetic_words(c, 'On iPhone and iPad', font(DISPLAY, 70, 'Bold'), W / 2, 150, t - 0.1, gradient=GOLD_TEAL)
        text(c, caps[stage], font(SANS, 54, 'SemiBold'), W / 2, 1720, alpha=ease_out((t - [0.4, 1.9, 4.0][stage]) / 0.4))
    else:
        kinetic_words(c, 'On iPhone and iPad', font(DISPLAY, 76, 'Bold'), W * 0.69, 300, t - 0.1, gradient=GOLD_TEAL)
        for i, cap in enumerate(caps):
            kk = ease_out((t - [0.4, 1.9, 4.0][i]) / 0.4)
            if kk <= 0:
                continue
            y = 460 + i * 130
            on = i == stage
            circle(c, W * 0.52, y, 30, fill=GOLD if on else SURF, stroke=GOLD if on else LINE, lw=3, alpha=kk)
            text(c, str(i + 1), font(DISPLAY, 30, 'Bold'), W * 0.52, y + 1, color=BLACK if on else MUTED, alpha=kk)
            text(c, cap, font(SANS, 46, 'SemiBold'), W * 0.52 + 60, y, color=TEXT if on else MUTED, alpha=kk, anchor='lm')
        k2 = ease_out((t - 4.6) / 0.6)
        text(c, 'Android: Chrome menu, then Install app.', font(SANS, 34, 'Medium'), W * 0.52 - 30, 900, color=EMERALD, alpha=k2, anchor='lm')


def sc_offline(c, g, t, d):
    cx, cy = W / 2, (H * 0.38 if not V else H * 0.36)
    k = ease_out(t / 0.7)
    # laptop with files being processed inside a shield ring
    laptop(c, cx, cy, 440 if not V else 600, t, 'mac', k)
    p = ease_in_out((t - 0.3) / 1.2)
    R = 320 if not V else 450
    gold_ring(c, g, cx, cy + 20, R, t, alpha=k, progress=p, lw=8)
    GL.dirty = True
    # wifi off badge
    wk = ease_out_back((t - 1.0) / 0.5, 1.6)
    if wk > 0:
        bx, by = cx + R * 0.72, cy - R * 0.72
        circle(c, bx, by, 58, fill=SURF, stroke=TEAL, lw=3, alpha=clamp(wk))
        draw_sprite(c, icon_sprite('WifiOff', 56, TEAL), bx, by, clamp(wk), scale=clamp(wk, 0, 1.2))
    # packets that try to leave bounce off the ring
    if t > 1.4:
        for i in range(12):
            ph_ = ((t * 0.7 + i * 0.137) % 1.0)
            ang = -math.pi / 2 + (i - 5.5) * 0.3
            dist = 60 + (R - 60) * (ph_ if ph_ < 0.8 else 0.8 - (ph_ - 0.8) * 2)
            x, y = cx + math.cos(ang) * dist, cy + 20 + math.sin(ang) * dist
            circle(c, x, y, 6, fill=CYAN, alpha=0.8)
            if 0.76 < ph_ < 0.86:
                circle(g, cx + math.cos(ang) * R, cy + 20 + math.sin(ang) * R, 26, fill=GLOW, alpha=0.9)
    ty = cy + R + (95 if not V else 150)
    kinetic_words(c, 'Works offline.', font(DISPLAY, 78 if not V else 84, 'Bold'), W / 2, ty, t - 0.8)
    if V:
        kinetic_words(c, 'Your files never leave', font(SANS, 54, 'Medium'), W / 2, ty + 110, t - 1.4, color=MUTED)
        kinetic_words(c, 'your device.', font(SANS, 54, 'Medium'), W / 2, ty + 180, t - 1.6, color=MUTED)
        text(c, '0 bytes uploaded', font(DISPLAY, 76, 'Bold'), W / 2, ty + 330, gradient=GOLD_GRAD, alpha=ease_out((t - 2.4) / 0.6))
    else:
        kinetic_words(c, 'Your files never leave your device.', font(SANS, 46, 'Medium'), W / 2, ty + 88, t - 1.4, color=MUTED)
        labs = [('No uploads', EMERALD), ('No accounts', SKY), ('0 bytes uploaded', GOLD), ('Offline ready', TEAL)]
        for i, (lab, col) in enumerate(labs):
            kk = ease_out((t - 2.2 - i * 0.35) / 0.5)
            if kk <= 0:
                continue
            side = -1 if i % 2 == 0 else 1
            x = cx + side * 690
            y = 330 + (i // 2) * 200
            f = font(SANS, 34, 'SemiBold')
            tw = f.getlength(lab) + 64
            rrect(c, x - tw / 2 + side * (1 - kk) * 60, y - 32, tw, 64, 32, fill=col, stroke=col, lw=2, alpha=kk, falpha=0.12, salpha=0.6)
            text(c, lab, f, x + side * (1 - kk) * 60, y, alpha=kk)


def sc_end(c, g, t, d):
    cy = H * (0.3 if not V else 0.3)
    p = ease_in_out(t / 1.3)
    logo_mark(c, g, W / 2, cy, 260 if not V else 300, t, progress=p)
    GL.dirty = True
    k = ease_out((t - 0.5) / 0.8)
    ty = cy + (250 if not V else 300)
    text(c, 'Install OpenFile', font(DISPLAY, 120 if not V else 110, 'Bold'), W / 2, ty + (1 - k) * 30, gradient=GOLD_GRAD, alpha=k)
    words = ['Free.', 'Open source.', 'Private.']
    f = font(SANS, 50, 'Medium')
    total = sum(f.getlength(w) for w in words) + 40 * 2
    x = W / 2 - total / 2
    for i, w_ in enumerate(words):
        kk = ease_out((t - 1.0 - i * 0.25) / 0.5)
        text(c, w_, f, x, ty + 120 + (1 - kk) * 20, color=[TEXT, TEXT, GOLD][i], alpha=kk, anchor='lm')
        x += f.getlength(w_) + 40
    # platform chips
    plats = [('Web', GOLD), ('Windows', SKY), ('macOS', WHITE), ('Linux', ORANGE), ('Android', EMERALD), ('iPhone', CYAN), ('ChromeOS', LIME)]
    fc = font(SANS, 30, 'SemiBold')
    rows = [plats] if not V else [plats[:4], plats[4:]]
    for r, row in enumerate(rows):
        widths = [fc.getlength(p_[0]) + 48 for p_ in row]
        tot = sum(widths) + 16 * (len(row) - 1)
        x = W / 2 - tot / 2
        y = ty + 230 + r * 80
        for i, (lab, col) in enumerate(row):
            kk = ease_out_back((t - 1.6 - (i + r * 4) * 0.08) / 0.5, 1.4)
            if kk > 0:
                rrect(c, x, y - 26 + (1 - clamp(kk)) * 20, widths[i], 52, 26, fill=col, stroke=col, lw=2, alpha=clamp(kk), falpha=0.12, salpha=0.7)
                text(c, lab, fc, x + widths[i] / 2, y + (1 - clamp(kk)) * 20, alpha=clamp(kk))
            x += widths[i] + 16
    kk = ease_out((t - 2.5) / 0.6)
    if kk > 0:
        fm = font(MONO, 32 if not V else 30, 'Medium')
        s = 'aniruddhaadak80.github.io/OpenFile/install'
        tw = fm.getlength(s) + 80
        y = ty + (360 if not V else 470)
        rrect(c, W / 2 - tw / 2, y - 38, tw, 76, 38, fill=SURF, stroke=GOLD, lw=2, alpha=kk)
        text(c, s, fm, W / 2, y, alpha=kk)


FN = {'intro': sc_intro, 'devices': sc_devices, 'install': sc_install, 'phone': sc_phone, 'offline': sc_offline, 'end': sc_end}
SURF_ = surface(W, H)
C = cairo.Context(SURF_)
GL = GlowLayer(W, H, 4)


def render(tt):
    c = C
    key = next((k for k, d_ in SCENES if T0[k] <= tt < T0[k] + d_), SCENES[-1][0])
    dur = dict(SCENES)[key]
    lt = tt - T0[key]
    c.set_operator(cairo.OPERATOR_SOURCE)
    c.set_source_surface(BG2 if key in ('devices', 'phone') else BG, 0, 0)
    c.paint()
    c.set_operator(cairo.OPERATOR_OVER)
    g = GL.begin()
    PART.draw(c, tt, alpha=0.5)
    if key in ('offline', 'end'):
        PART2.draw(c, tt, alpha=0.5)
    fade_in = ease_in_out(lt / 0.35) if key != 'intro' else ease_in_out(lt / 0.7)
    fade_out = ease_in_out((dur - lt) / 0.35) if key != 'end' else ease_in_out((dur - lt) / 0.8)
    a = min(fade_in, fade_out)
    # gentle push-in per scene
    z = 1.0 + 0.02 * ease_in_out(lt / dur)
    c.push_group()
    c.translate(W / 2, H / 2); c.scale(z, z); c.translate(-W / 2, -H / 2)
    FN[key](c, g, lt, dur)
    c.pop_group_to_source()
    c.paint_with_alpha(a)
    GL.apply(c, radius=7, strength=0.9 * a, passes=2)
    return SURF_


def music():
    out = os.path.join(CACHE_DIR, 'apps-mix.wav')
    if os.path.exists(out):
        return out
    m, info = make_music(DUR + 0.6, seed=4242, bpm=96, key=2, lead='marimba', pad_bright=5, beat=True, intro=2.4, outro=3.4,
                         density=0.75, beat_start=T0['devices'] - 0.2, beat_end=DUR - 2.8)
    raw = os.path.join(CACHE_DIR, 'apps-raw.wav')
    write_wav(raw, m * 0.6)
    loudnorm_two_pass(raw, out, I=-16, TP=-1.5)
    print('music', info)
    return out


def main():
    if A.still:
        render(float(A.still[0])).write_to_png(A.still[1]); return
    if A.audio:
        print(music()); return
    if A.frames:
        a, b = A.frames
        b = min(b, int(DUR * FPS))
        seg = os.path.join(WORK, f'seg_{a:05d}.mp4')
        pipe = FFPipe(seg, W, H, FPS, crf=21, preset='veryfast', tune='animation', extra=['-g', '60'])
        for i in range(a, b):
            pipe.write(render(i / FPS))
        pipe.close()
        print('segment', seg, b - a, 'frames of', int(DUR * FPS)); return
    if A.mux:
        segs = sorted(glob.glob(os.path.join(WORK, 'seg_*.mp4')))
        lst = os.path.join(WORK, 'list.txt')
        open(lst, 'w').write(''.join(f"file '{s}'\n" for s in segs))
        name = 'apps-vertical.mp4' if V else 'apps.mp4'
        os.makedirs(OUT, exist_ok=True)
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-i', music(), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
                        '-shortest', '-movflags', '+faststart', os.path.join(OUT, name)], check=True)
        print('wrote', os.path.join(OUT, name), f'{DUR:.1f}s')
        if not V:
            p = os.path.join(WORK, 'poster.png')
            render(T0['end'] + 4.6).write_to_png(p)
            Image.open(p).convert('RGB').save(os.path.join(OUT, 'apps-poster.webp'), quality=86)
            Image.open(p).convert('RGB').resize((1280, 720), Image.LANCZOS).save(os.path.join(REPO, 'docs', 'assets', 'apps-poster.jpg'), quality=86)
        return
    print(f'{DUR:.1f}s, {int(DUR * FPS)} frames. Use --frames A B, then --mux.')


main()

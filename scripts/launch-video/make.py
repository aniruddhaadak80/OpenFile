#!/usr/bin/env python3
"""
OpenFile launch film (1920x1080, 30 fps, H.264 + AAC) -> public/media/launch.mp4 (+ poster.jpg)

Open-source stack: cairocffi + Pillow + numpy + kokoro-onnx (TTS) + ffmpeg. See scripts/media-lib/ofmedia.py.
Run:   python3 scripts/launch-video/make.py            (full render, ~2-3 min on 2 cores)
       python3 scripts/launch-video/make.py --still 12.5 out.png   (single frame)
Writing rule for on-screen text and voiceover: no em dashes, no exclamation marks, plain words, human tone.
"""
import math, os, sys, json, subprocess, argparse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'media-lib'))
from ofmedia import *  # noqa
from ofmedia import _add

W, H, FPS = 1920, 1080, 30
OUT = os.path.join(REPO, 'public', 'media')
WORK = os.path.join(CACHE_DIR, 'launch')
os.makedirs(WORK, exist_ok=True)

TOOLS = load_registry()
N = len(TOOLS)
BYCAT = {k: [] for k in ['pdf', 'convert', 'image', 'video', 'audio', 'dev', 'text', 'design']}
for t in TOOLS:
    BYCAT.setdefault(t['category'], []).append(t)

VOICE = ('af_heart', None, 1.0)   # warm US female
VO = [
    ('personal', "Your files are personal. Contracts, photos, recordings, code."),
    ('upload', "So why do so many online tools ask you to upload them?"),
    ('meet', "Meet OpenFile. Over three hundred free tools that run right in your browser."),
    ('cats', "Merge, split and sign PDFs. Convert documents. Compress and resize images. "
             "Trim video, edit audio, format code, compare text, and work with color."),
    ('soon', "Now with 3D models, archives, fonts, eBooks and AI that runs on your device."),
    ('private', "And your files never leave your device. No uploads, no accounts, no watermarks. It even works offline."),
    ('flow', "Chain tools into one flow, and run it on hundreds of files at once."),
    ('end', "OpenFile. Free, open source, and private."),
]
for _, s in VO:
    assert '—' not in s and '!' not in s


# ----------------------------------------------------------------------------- voiceover + timeline
def build_vo():
    meta_p = os.path.join(WORK, 'vo.json')
    if os.path.exists(meta_p):
        meta = json.load(open(meta_p))
        if meta.get('lines') == [s for _, s in VO]:
            return meta
    import soundfile as sf
    tts = TTS()
    durs = []
    for i, (k, s) in enumerate(VO):
        a = tts.say(s, VOICE, speed=0.94)
        sf.write(os.path.join(WORK, f'vo_{i}.wav'), a, SR)
        durs.append(len(a) / SR)
    meta = dict(lines=[s for _, s in VO], durs=durs)
    json.dump(meta, open(meta_p, 'w'))
    return meta


META = build_vo()
# scene length = voice line + breathing room (minimums keep the visuals readable)
PADS = {'personal': (0.9, 1.1), 'upload': (0.3, 1.0), 'meet': (0.5, 1.3), 'cats': (0.4, 0.9), 'soon': (0.3, 0.9),
        'private': (0.5, 1.2), 'flow': (0.3, 1.0), 'end': (0.6, 3.2)}
SCENES = []
t = 0.0
for (k, s), d in zip(VO, META['durs']):
    pre, post = PADS[k]
    SCENES.append(dict(key=k, start=t, vo_at=t + pre, dur=pre + d + post))
    t += pre + d + post
DUR = t

BG = make_background(W, H, glow_pos=(0.5, 0.45), glow2=(0.88, 0.92))
BG2 = make_background(W, H, glow_pos=(0.25, 0.5), glow2=(0.8, 0.2), c2=CYAN)
PART = Particles(140, W, H, seed=7, speed=14)
PART2 = Particles(60, W, H, seed=9, colors=(TEAL, CYAN, GOLD), speed=8, size=(0.8, 1.8))


# ----------------------------------------------------------------------------- building blocks
def file_card(c, g, x, y, w, h, label, ext, accent, alpha=1.0, rot=0.0, scale=1.0, glow=0.0):
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(scale, scale)
    rrect(c, -w / 2 + 8, -h / 2 + 14, w, h, 18, fill=(0, 0, 0), alpha=alpha * 0.45)
    rrect(c, -w / 2, -h / 2, w, h, 18, fill=SURF, stroke=mix(LINE, accent, 0.35), lw=2, alpha=alpha)
    rrect(c, -w / 2 + 22, -h / 2 + 24, 86, 40, 10, fill=accent, alpha=alpha * 0.18)
    text(c, ext, font(MONO, 22, 'Bold'), -w / 2 + 65, -h / 2 + 44, color=accent, alpha=alpha)
    for i in range(4):
        ww = (w - 44) * (0.9 - 0.18 * (i % 3))
        rrect(c, -w / 2 + 22, -h / 2 + 90 + i * 26, ww, 10, 5, fill=LINE, alpha=alpha)
    text(c, label, font(SANS, 24, 'SemiBold'), -w / 2 + 22, h / 2 - 34, color=TEXT, alpha=alpha, anchor='lm')
    c.restore()
    if glow > 0 and g is not None:
        rrect(g, x - w / 2, y - h / 2, w, h, 18, stroke=accent, lw=10, alpha=glow)


def tool_card(c, x, y, w, h, tool, accent, alpha=1.0, scale=1.0):
    if alpha <= 0.01:
        return
    c.save(); c.translate(x, y); c.scale(scale, scale)
    rrect(c, -w / 2, -h / 2, w, h, 20, fill=SURF, stroke=mix(LINE, accent, 0.45), lw=2, alpha=alpha)
    rrect(c, -w / 2 + 20, -h / 2 + 20, 64, 64, 16, fill=accent, alpha=alpha * 0.14)
    draw_sprite(c, icon_sprite(tool['icon'], 40, accent), -w / 2 + 52, -h / 2 + 52, alpha)
    name = tool['name']
    f = font(SANS, 26, 'SemiBold')
    while f.getlength(name) > w - 120 and len(name) > 4:
        name = name[:-2].rstrip() + '…' if not name.endswith('…') else name[:-3] + '…'
    text(c, name, f, -w / 2 + 102, -h / 2 + 52, alpha=alpha, anchor='lm')
    desc = tool['desc']
    fd = font(SANS, 19, 'Regular')
    lines, cur = [], ''
    for wd in desc.split():
        if fd.getlength(cur + ' ' + wd) > w - 44:
            lines.append(cur); cur = wd
        else:
            cur = (cur + ' ' + wd).strip()
    lines.append(cur)
    for i, ln in enumerate(lines[:2]):
        if i == 1 and len(lines) > 2:
            ln = ln.rstrip('.,') + '…'
        text(c, ln, fd, -w / 2 + 22, -h / 2 + 112 + i * 28, color=MUTED, alpha=alpha, anchor='lm')
    c.restore()


def chip(c, x, y, label, accent, alpha=1.0, f=None, anchor='m', fill_a=0.12):
    f = f or font(SANS, 30, 'SemiBold')
    tw = f.getlength(label) + 64
    x0 = x - tw / 2 if anchor == 'm' else x
    rrect(c, x0, y - 32, tw, 64, 32, fill=accent, stroke=accent, lw=2, alpha=alpha, falpha=fill_a, salpha=0.6)
    text(c, label, f, x0 + tw / 2, y, alpha=alpha)
    return tw


# ----------------------------------------------------------------------------- scenes
def sc_personal(c, g, t, d):
    a_in = ease_out(t / 1.0)
    gold_ring(c, g, W / 2, H / 2, 260 + 20 * ease_out(t / 3), t, alpha=0.35 * a_in, progress=ease_in_out(t / 2.0), orbit=False)
    files = [('Contract.pdf', 'PDF', GOLD), ('Beach.jpg', 'JPG', EMERALD), ('Interview.wav', 'WAV', TEAL),
             ('app.ts', 'TS', CYAN), ('Taxes.xlsx', 'XLSX', SKY), ('Clip.mp4', 'MP4', CYAN)]
    for i, (lab, ext, ac) in enumerate(files):
        k = ease_out((t - 0.25 - i * 0.18) / 0.9)
        if k <= 0:
            continue
        ang = -math.pi / 2 + i * 2 * math.pi / len(files) + t * 0.12
        rx, ry = 640, 300
        x = W / 2 + math.cos(ang) * rx * (0.6 + 0.4 * k)
        y = H / 2 + math.sin(ang) * ry * (0.6 + 0.4 * k) + 10 * math.sin(t * 1.3 + i)
        file_card(c, g, x, y, 250, 270, lab, ext, ac, alpha=k * 0.95, rot=math.sin(t * 0.7 + i) * 0.05, scale=0.82, glow=0.25 * k)
    f = font(DISPLAY, 96, 'Bold')
    kinetic_words(c, 'Your files are', f, W / 2, H / 2 - 50, t - 0.5)
    kinetic_words(c, 'personal.', font(DISPLAY, 120, 'Bold'), W / 2, H / 2 + 60, t - 0.95, gradient=GOLD_GRAD, rise=60)
    g and setattr(GL, 'dirty', True)


def sc_upload(c, g, t, d):
    # files get pulled up toward a cloud; then everything halts with a gold strike-through
    cx, cy = W / 2, 250
    k = ease_out(t / 0.8)
    draw_sprite(c, icon_sprite('CloudUpload', 220, MUTED, 1.5), cx, cy, 0.85 * k)
    pull = clamp((t - 0.3) / (d * 0.55))
    for i in range(5):
        x0 = W / 2 + (i - 2) * 300
        y0 = 820
        ph = clamp(pull * 1.4 - i * 0.08)
        y = lerp(y0, cy + 80, ease_in_out(ph))
        x = lerp(x0, cx, ease_in_out(ph))
        # dotted tether
        c.set_dash([6, 12], -t * 40)
        line(c, x, y, cx, cy + 90, DIM, 2, 0.6 * k * (1 - ph))
        c.set_dash([])
        file_card(c, None, x, y, 170, 190, '', ['PDF', 'JPG', 'DOCX', 'MP3', 'PNG'][i], [GOLD, EMERALD, SKY, TEAL, CYAN][i],
                  alpha=k * (1 - 0.7 * ph), scale=0.75 * (1 - 0.5 * ph))
    q = clamp((t - 0.6) / 0.5)
    kinetic_words(c, 'Why upload them at all?', font(DISPLAY, 84, 'Bold'), W / 2, 600, t - 0.6)
    s = ease_out((t - 2.0) / 0.5)
    if s > 0:
        x0 = W / 2 - 520; x1 = x0 + 1040 * s
        line(c, x0, 604, x1, 604, GOLD, 8, 1)
        line(g, x0, 604, x1, 604, GLOW, 22, 0.9); GL.dirty = True


def sc_meet(c, g, t, d):
    p = ease_in_out(t / 1.3)
    r = 170
    flash = math.exp(-max(0, t - 1.25) * 3) * (t > 1.25)
    if flash > 0:
        radial_glow(g, W / 2, 360, 520, GLOW, flash * 0.6)
    logo_mark(c, g, W / 2, 360, r * 2, t, progress=p)
    GL.dirty = True
    # expanding shock rings
    for i in range(3):
        k = clamp((t - 1.25 - i * 0.18) / 1.4)
        if 0 < k < 1:
            arc(c, W / 2, 360, r + 420 * ease_out(k), 0, 2 * math.pi, GOLD, 2, (1 - k) * 0.6)
    if t > 1.0:
        tt = t - 1.0
        f = font(DISPLAY, 150, 'Bold')
        s = 'OpenFile'
        x = W / 2 - text_width(s, f) / 2
        for i, ch in enumerate(s):
            k = ease_out((tt - i * 0.05) / 0.6)
            if k > 0:
                text(c, ch, f, x, 680 + (1 - k) * 50, gradient=GOLD_GRAD, anchor='lm', alpha=k)
            x += f.getlength(ch)
        k2 = ease_out((tt - 0.7) / 0.6)
        text(c, '300+ free tools. All in your browser.', font(SANS, 46, 'Medium'), W / 2, 800 + (1 - k2) * 20, color=TEXT, alpha=k2 * 0.85)


CAT_ORDER = ['pdf', 'convert', 'image', 'video', 'audio', 'dev', 'text', 'design']
CAT_LINE = {'pdf': 'Merge, split and sign.', 'convert': 'Move between formats.', 'image': 'Compress, resize, clean up.',
            'video': 'Trim, compress, convert.', 'audio': 'Edit, record, transcribe.', 'dev': 'Format, decode, generate.',
            'text': 'Compare, count, clean.', 'design': 'Color, CSS, icons, SVG.'}
CAT_ICON = {'pdf': 'FileText', 'convert': 'ArrowLeftRight', 'image': 'Image', 'video': 'Film', 'audio': 'AudioWaveform',
            'dev': 'Braces', 'text': 'CaseSensitive', 'design': 'Palette'}


def sc_cats(c, g, t, d):
    seg = d / len(CAT_ORDER)
    i = min(len(CAT_ORDER) - 1, int(t / seg))
    lt = t - i * seg
    cat = CAT_ORDER[i]
    ac = CAT_COLORS[cat]
    # top progress chips
    f = font(SANS, 22, 'SemiBold')
    widths = [f.getlength(CAT_NAMES[k]) + 40 for k in CAT_ORDER]
    total = sum(widths) + 12 * 7
    x = W / 2 - total / 2
    for j, k in enumerate(CAT_ORDER):
        on = j == i
        done = j < i
        col = CAT_COLORS[k]
        rrect(c, x, 64, widths[j], 44, 22, fill=col if on else SURF, stroke=col if (on or done) else LINE, lw=2,
              falpha=0.9 if on else 1.0)
        text(c, CAT_NAMES[k], f, x + widths[j] / 2, 86, color=BLACK if on else (TEXT if done else MUTED))
        x += widths[j] + 12
    # left: category title
    k_in = ease_out(lt / 0.45)
    k_out = 1 - ease_in_out((lt - (seg - 0.25)) / 0.25) if i < len(CAT_ORDER) - 1 else 1
    al = k_in * k_out
    gold_ring(c, g, 250, 560, 110, t * 1.2 + i, alpha=al * 0.9, orbit=True)
    draw_sprite(c, icon_sprite(CAT_ICON[cat], 100, ac, 1.6), 250, 560, al)
    GL.dirty = True
    text(c, CAT_NAMES[cat], font(DISPLAY, 92, 'Bold'), 410 - (1 - k_in) * 40, 500, alpha=al, anchor='lm')
    text(c, CAT_LINE[cat], font(SANS, 36, 'Medium'), 412 - (1 - k_in) * 20, 590, color=ac, alpha=al, anchor='lm')
    # right: fanned stack of tool cards flying in
    tl = BYCAT[cat]
    show = tl[:6]
    for j, tool in enumerate(show):
        kk = ease_out_back((lt - 0.1 - j * 0.07) / 0.5, 1.2)
        if kk <= 0:
            continue
        col, row = j % 2, j // 2
        tx = 1250 + col * 430 + (1 - clamp(kk)) * 500
        ty = 300 + row * 230 + math.sin(t * 1.5 + j) * 4
        tool_card(c, tx, ty, 410, 190, tool, ac, alpha=clamp(kk) * k_out, scale=0.9 + 0.1 * clamp(kk))
    # bottom marquee of every tool name in this category
    fm = font(MONO, 22, 'Medium')
    names = '   ·   '.join(t_['name'] for t_ in tl) + '   ·   '
    sp = text_sprite(names, fm, DIM, 'lm')
    off = (t * 140) % max(1, sp.w)
    for rep in range(3):
        draw_sprite(c, sp, -off + rep * sp.w, 1000, 0.9)


def cube(c, g, cx, cy, s, t, color, alpha):
    pts = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
    a, b = t * 0.8, 0.5 + 0.2 * math.sin(t * 0.6)
    P = []
    for x, y, z in pts:
        x, z = x * math.cos(a) - z * math.sin(a), x * math.sin(a) + z * math.cos(a)
        y, z = y * math.cos(b) - z * math.sin(b), y * math.sin(b) + z * math.cos(b)
        f = 4 / (4 + z)
        P.append((cx + x * s * f, cy + y * s * f))
    for e0, e1 in [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)]:
        line(c, *P[e0], *P[e1], color, 3, alpha)
        line(g, *P[e0], *P[e1], color, 8, alpha * 0.7)
    for p in P:
        circle(c, *p, 5, fill=TEXT, alpha=alpha)


def sc_soon(c, g, t, d):
    items = [('3D', 'Box', CYAN), ('Archives', 'FileArchive', GOLD), ('Fonts', 'Type', EMERALD)]
    kinetic_words(c, 'Now included', font(DISPLAY, 72, 'Bold'), W / 2, 210, t - 0.1)
    for i, (lab, ic, ac) in enumerate(items):
        k = ease_out_back((t - 0.3 - i * 0.18) / 0.6, 1.3)
        if k <= 0:
            continue
        x = W / 2 + (i - 1) * 470
        y = 560 + (1 - clamp(k)) * 80
        rrect(c, x - 200, y - 200, 400, 400, 36, fill=SURF, stroke=mix(LINE, ac, 0.6), lw=2, alpha=clamp(k))
        rrect(g, x - 200, y - 200, 400, 400, 36, stroke=ac, lw=6, alpha=0.35 * clamp(k))
        if lab == '3D':
            cube(c, g, x, y - 55, 58, t, ac, clamp(k))
        elif lab == 'Archives':
            for j in range(3):
                yy = y - 120 + j * 46 + math.sin(t * 2 + j) * 4
                rrect(c, x - 90, yy, 180, 38, 8, fill=mix(SURF, ac, 0.25 + j * 0.15), stroke=ac, lw=2, alpha=clamp(k))
        else:
            text(c, 'Aa', font(DISPLAY, 150, 'Bold'), x, y - 60 + math.sin(t * 1.5) * 6, gradient=(hexrgb('#9FF5D5'), EMERALD), alpha=clamp(k))
        text(c, lab, font(SANS, 40, 'SemiBold'), x, y + 100, alpha=clamp(k))
        text(c, 'NOW LIVE', font(MONO, 20, 'Bold'), x, y + 150, color=ac, alpha=clamp(k), tracking=3)
    GL.dirty = True


def sc_private(c, g, t, d):
    cx, cy = W / 2, 470
    k = ease_out(t / 0.8)
    # device (laptop) outline
    sw, sh = 560, 340
    rrect(c, cx - sw / 2, cy - sh / 2, sw, sh, 24, fill=NEAR, stroke=MUTED, lw=4, alpha=k)
    rrect(c, cx - sw / 2 - 70, cy + sh / 2, sw + 140, 26, 13, fill=SURF2, stroke=MUTED, lw=3, alpha=k)
    # file processing inside
    for i in range(3):
        kk = ease_out((t - 0.5 - i * 0.2) / 0.5)
        file_card(c, None, cx - 150 + i * 150, cy, 120, 150, '', ['PDF', 'JPG', 'WAV'][i], [GOLD, EMERALD, TEAL][i],
                  alpha=kk * k, scale=0.8, rot=math.sin(t * 2 + i) * 0.04)
    # shield ring
    p = ease_in_out((t - 0.4) / 1.2)
    gold_ring(c, g, cx, cy + 10, 400, t, alpha=k, progress=p, lw=8)
    GL.dirty = True
    # packets trying to leave bounce off the ring
    for i in range(10):
        ph = ((t * 0.7 + i * 0.137) % 1.0)
        if t < 1.4:
            break
        ang = -math.pi / 2 + (i - 4.5) * 0.28
        dist = 60 + 340 * (ph if ph < 0.8 else 0.8 - (ph - 0.8) * 2)
        x, y = cx + math.cos(ang) * dist, cy + 10 + math.sin(ang) * dist
        circle(c, x, y, 6, fill=CYAN, alpha=0.8)
        if 0.76 < ph < 0.86:
            circle(g, cx + math.cos(ang) * 400, cy + 10 + math.sin(ang) * 400, 26, fill=GLOW, alpha=0.9)
    # counter
    text(c, '0 bytes uploaded', font(DISPLAY, 70, 'Bold'), W / 2, 960, gradient=GOLD_GRAD, alpha=ease_out((t - 1.0) / 0.6))
    # chips appear with the voice
    labs = ['No uploads', 'No accounts', 'No watermarks', 'Works offline']
    for i, lab in enumerate(labs):
        kk = ease_out((t - 2.6 - i * 0.55) / 0.5)
        if kk <= 0:
            continue
        side = -1 if i % 2 == 0 else 1
        x = cx + side * 690
        y = 330 + (i // 2) * 210
        chip(c, x + side * (1 - kk) * 60, y, lab, [EMERALD, SKY, GOLD, TEAL][i], alpha=kk, f=font(SANS, 34, 'SemiBold'))


def sc_flow(c, g, t, d):
    kinetic_words(c, 'One flow. Hundreds of files.', font(DISPLAY, 76, 'Bold'), W / 2, 170, t - 0.1)
    steps = [('Resize', 'Scaling', EMERALD), ('Watermark', 'Droplets', SKY), ('Strip EXIF', 'ShieldCheck', TEAL),
             ('To WebP', 'RefreshCw', CYAN), ('Download ZIP', 'FileArchive', GOLD)]
    n = len(steps)
    xs = [W / 2 + (i - (n - 1) / 2) * 350 for i in range(n)]
    y = 520
    # connecting line with flowing dots
    k0 = ease_in_out((t - 0.3) / 1.0)
    line(c, xs[0], y, lerp(xs[0], xs[-1], k0), y, LINE, 4, 1)
    for i in range(n):
        k = ease_out_back((t - 0.2 - i * 0.12) / 0.5, 1.4)
        if k <= 0:
            continue
        lab, ic, ac = steps[i]
        active = ((t - 1.0) * 1.6) % n
        on = int(active) == i and t > 1.0
        rrect(c, xs[i] - 135, y - 110, 270, 220, 28, fill=SURF, stroke=ac if on else mix(LINE, ac, 0.4), lw=3 if on else 2, alpha=clamp(k))
        if on:
            rrect(g, xs[i] - 135, y - 110, 270, 220, 28, stroke=ac, lw=12, alpha=0.8)
        draw_sprite(c, icon_sprite(ic, 70, ac), xs[i], y - 25, clamp(k))
        text(c, lab, font(SANS, 30, 'SemiBold'), xs[i], y + 62, alpha=clamp(k))
    if t > 1.0:
        for j in range(26):
            ph = (t * 0.35 + j / 26) % 1
            x = lerp(xs[0], xs[-1], ph)
            circle(c, x, y + 128 + (j % 3) * 10, 4, fill=[GOLD, TEAL, CYAN][j % 3], alpha=0.85)
    cnt = int(248 * ease_in_out((t - 1.0) / max(1, d - 2)))
    text(c, f'{cnt} files', font(MONO, 64, 'Bold'), W / 2, 830, color=TEXT, alpha=ease_out((t - 0.8) / 0.5))
    text(c, 'processed on this device', font(SANS, 34, 'Medium'), W / 2, 900, color=MUTED, alpha=ease_out((t - 1.0) / 0.5))
    GL.dirty = True


def sc_end(c, g, t, d):
    p = ease_in_out(t / 1.4)
    logo_mark(c, g, W / 2, 340, 300, t, progress=p)
    GL.dirty = True
    k = ease_out((t - 0.6) / 0.8)
    text(c, 'OpenFile', font(DISPLAY, 140, 'Bold'), W / 2, 600 + (1 - k) * 30, gradient=GOLD_GRAD, alpha=k)
    words = ['Free.', 'Open source.', 'Private.']
    f = font(SANS, 52, 'Medium')
    total = sum(f.getlength(w) for w in words) + 40 * 2
    x = W / 2 - total / 2
    for i, w_ in enumerate(words):
        kk = ease_out((t - 1.1 - i * 0.3) / 0.5)
        text(c, w_, f, x, 720 + (1 - kk) * 20, color=[TEXT, TEXT, GOLD][i], alpha=kk, anchor='lm')
        x += f.getlength(w_) + 40
    kk = ease_out((t - 2.2) / 0.6)
    if kk > 0:
        fm = font(MONO, 34, 'Medium')
        s = 'openfile-studio.vercel.app'
        tw = fm.getlength(s) + 90
        rrect(c, W / 2 - tw / 2, 820, tw, 76, 38, fill=SURF, stroke=GOLD, lw=2, alpha=kk)
        text(c, s, fm, W / 2, 858, alpha=kk)
        text(c, 'github.com/aniruddhaadak80/OpenFile', font(MONO, 26, 'Regular'), W / 2, 950, color=MUTED, alpha=kk)


FN = {'personal': sc_personal, 'upload': sc_upload, 'meet': sc_meet, 'cats': sc_cats, 'soon': sc_soon,
      'private': sc_private, 'flow': sc_flow, 'end': sc_end}

SURF_ = surface(W, H)
C = cairo.Context(SURF_)
GL = GlowLayer(W, H, 4)


def render(tt):
    c = C
    sc = next((s for s in SCENES if s['start'] <= tt < s['start'] + s['dur']), SCENES[-1])
    lt = tt - sc['start']
    c.set_operator(cairo.OPERATOR_SOURCE)
    c.set_source_surface(BG2 if sc['key'] in ('cats', 'flow') else BG, 0, 0)
    c.paint()
    c.set_operator(cairo.OPERATOR_OVER)
    g = GL.begin()
    PART.draw(c, tt, alpha=0.55)
    if sc['key'] in ('private', 'flow'):
        PART2.draw(c, tt, alpha=0.5)
    # scene content on its own group for fade transitions
    fade_in = ease_in_out(lt / 0.35) if sc['key'] != 'personal' else ease_in_out(lt / 0.8)
    fade_out = ease_in_out((sc['dur'] - lt) / 0.35) if sc['key'] != 'end' else ease_in_out((sc['dur'] - lt) / 0.9)
    a = min(fade_in, fade_out)
    c.push_group()
    FN[sc['key']](c, g, lt, sc['dur'])
    c.pop_group_to_source()
    # subtle push-in transition
    c.paint_with_alpha(a)
    GL.apply(c, radius=7, strength=0.95 * a, passes=2)
    return SURF_


def make_audio():
    import soundfile as sf
    n = int(DUR * SR) + SR
    voice = np.zeros(n, np.float32)
    for i, sc in enumerate(SCENES):
        a, _ = sf.read(os.path.join(WORK, f'vo_{i}.wav'), dtype='float32')
        _add(voice, sc['vo_at'] * SR, a)
    beat_start = next(s['start'] for s in SCENES if s['key'] == 'meet') + 1.2
    music, info = make_music(DUR + 0.5, seed=2026, bpm=88, key=9, lead='rhodes', pad_bright=4, beat=True, intro=3.0, outro=3.5,
                             density=0.7, beat_start=beat_start, beat_end=DUR - 3.0)
    mix_ = duck_mix(music, voice[:music.shape[1]], voice_gain=1.0, music_gain=0.5, duck=0.55)
    raw = os.path.join(WORK, 'mix_raw.wav')
    write_wav(raw, mix_)
    out = os.path.join(WORK, 'mix.wav')
    js = loudnorm_two_pass(raw, out, I=-14, TP=-1.0)
    return out, info, js


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--still', nargs=2)
    ap.add_argument('--video-only', action='store_true')
    ap.add_argument('--audio-only', action='store_true')
    a = ap.parse_args()
    if a.still:
        render(float(a.still[0])).write_to_png(a.still[1]); return
    print(f'duration {DUR:.2f}s, scenes:', [(s["key"], round(s["start"], 2), round(s["dur"], 2)) for s in SCENES])
    vid = os.path.join(WORK, 'video.mp4')
    if not a.audio_only:
        pipe = FFPipe(vid, W, H, FPS, crf=22, preset='medium', maxrate='1500k', tune='animation', extra=['-g', '60'])
        for i in range(int(DUR * FPS)):
            pipe.write(render(i / FPS))
        pipe.close()
    if a.video_only:
        return
    wav, info, js = make_audio()
    print('music', info, 'input loudness', js['input_i'])
    os.makedirs(OUT, exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', vid, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
                    '-shortest', '-movflags', '+faststart', os.path.join(OUT, 'launch.mp4')], check=True)
    # poster: the end card
    end = next(s for s in SCENES if s['key'] == 'end')
    render(end['start'] + end['dur'] - 1.2).write_to_png(os.path.join(WORK, 'poster.png'))
    Image.open(os.path.join(WORK, 'poster.png')).convert('RGB').save(os.path.join(OUT, 'poster.jpg'), quality=88)
    print('wrote', os.path.join(OUT, 'launch.mp4'))


if __name__ == '__main__':
    main()

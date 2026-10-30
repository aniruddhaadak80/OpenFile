#!/usr/bin/env python3
"""
OpenFile per-tool preview videos.

Reads every tool from src/tools/registry.ts and renders, for each slug:
  public/media/tools/<slug>.mp4   960x540, 30 fps, H.264 yuv420p + AAC, faststart, 8-12 s, target <= 350 KB
  public/media/tools/<slug>.jpg   480x270 poster
and writes public/media/tools/index.json  (slug -> {video, poster, duration, voice}).

Each video: animated title, a motion-graphic demo of what the tool does (per-category templates with a
per-tool action, varied by a seed taken from the slug), a voiceover of the one-sentence description with a
different voice per tool (Kokoro TTS, rotating US/UK female/male voices, then light 80/20 blends), and a
procedural music bed seeded by the slug (key, tempo, lead timbre, pad brightness, groove).

Usage:
  python3 scripts/tool-videos/make_tool_videos.py                 # render tools that are missing
  python3 scripts/tool-videos/make_tool_videos.py --force         # re-render everything
  python3 scripts/tool-videos/make_tool_videos.py --only merge-pdf,json-formatter
  python3 scripts/tool-videos/make_tool_videos.py --still merge-pdf 4.0 /tmp/f.png   # one frame, no audio
  options: --jobs N (default: all cores)

Writing rule for on-screen text and voice scripts: no em dashes, no exclamation marks, plain words.
Palette: gold-on-black with teal / cyan / emerald / sky accents. No purple, violet, magenta or pink.
"""
import argparse, json, math, os, re, subprocess, sys, time, traceback
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'media-lib'))
from ofmedia import *  # noqa
from ofmedia import _add

W, H, FPS = 960, 540, 30
OUT = os.path.join(REPO, 'public', 'media', 'tools')
TMP = os.path.join(CACHE_DIR, 'tools')
PAPER = hexrgb('#F2EFE8')
PAPER_LINE = hexrgb('#CFC9BD')
INK = hexrgb('#1A1C20')


def short_desc(s, limit=105):
    """One short spoken/caption sentence from a registry description: drop parentheses, shorten long format lists."""
    s = clean_copy(s)
    if len(s) <= limit:
        return s
    s = re.sub(r'\s*\([^)]*\)', '', s)
    s = re.split(r'(?<=[.])\s', s)[0]
    head, sep, tail = s.partition(': ')
    s = head if sep and len(head) >= 25 else (f'{head}, like {tail}' if sep else s)

    def lists(m):
        items = [x.strip() for x in re.split(r',\s*|\s+(?:and|or)\s+', m.group(0)) if x.strip() and x.strip() != 'more']
        return ', '.join(items[:3]) + ' and more' if len(items) > 4 else m.group(0)
    item = r"[A-Za-z0-9][\w.+-]*(?:\s(?!and\b|or\b|with\b)[A-Za-z0-9][\w.+-]*)?"
    s = re.sub(rf"{item}(?:,\s*{item}){{3,}}(?:,?\s+(?:and|or)\s+(?:{item}|more))?", lists, s)
    s = s.replace('and more and more', 'and more')
    if len(s) > limit:
        cut = max(s.rfind(', ', 0, limit), s.rfind(' with ', 0, limit))
        if cut > 40:
            s = s[:cut]
    s = s.rstrip(' ,.') + '.'
    return s


def clean_copy(s):
    s = s.replace('—', ', ').replace('–', ' to ').replace('!', '.')
    return re.sub(r'\s+', ' ', s).strip()


# ============================================================================= primitives
def page(c, x, y, w, h, alpha=1.0, accent=GOLD, rot=0.0, lines=7, gray=0.0, seed=0, header=True, img=False, scale=1.0):
    """Light document page centred at x,y."""
    if alpha <= 0.01:
        return
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(scale, scale)
    rrect(c, -w / 2 + 4, -h / 2 + 8, w, h, 6, fill=(0, 0, 0), alpha=alpha * 0.5)
    rrect(c, -w / 2, -h / 2, w, h, 6, fill=PAPER, alpha=alpha)
    ac = mix(accent, (150, 150, 150), gray)
    pad = w * 0.12
    yy = -h / 2 + pad
    if header:
        rrect(c, -w / 2 + pad, yy, w * 0.45, h * 0.06, 2, fill=ac, alpha=alpha)
        yy += h * 0.12
    if img:
        rrect(c, -w / 2 + pad, yy, w - 2 * pad, h * 0.22, 3, fill=mix(mix(TEAL, (140, 140, 140), gray), PAPER, 0.35), alpha=alpha)
        yy += h * 0.27
    rnd = (seed * 7919) % 97
    for i in range(lines):
        if yy > h / 2 - pad:
            break
        ww = (w - 2 * pad) * (0.55 + 0.45 * (((rnd + i * 37) % 10) / 10))
        rrect(c, -w / 2 + pad, yy, ww, max(2, h * 0.025), 1.5, fill=PAPER_LINE, alpha=alpha)
        yy += h * 0.07
    c.restore()


_PHOTOS = {}


def photo_img(seed, w=320, h=220):
    key = (seed % 6, w, h)
    if key in _PHOTOS:
        return _PHOTOS[key]
    rng = np.random.default_rng(seed % 6)
    y = np.linspace(0, 1, h)[:, None]
    top = np.array(mix(hexrgb('#0E3B44'), hexrgb('#123a5a'), rng.random()), np.float32)
    bot = np.array(mix(GOLD, hexrgb('#F7C46C'), rng.random()), np.float32)
    sky = top * (1 - y ** 1.4) + bot * (y ** 1.4)
    img = np.repeat(sky[:, None, :] if sky.ndim == 2 else sky, w, axis=1) if False else np.broadcast_to(sky[:, None, :], (h, w, 3)).copy()
    im = Image.fromarray(img.astype(np.uint8), 'RGB')
    d = ImageDraw.Draw(im)
    sx, sy = w * rng.uniform(0.3, 0.7), h * rng.uniform(0.45, 0.6)
    sr = h * 0.13
    glow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(glow).ellipse((sx - sr * 2.4, sy - sr * 2.4, sx + sr * 2.4, sy + sr * 2.4), fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(sr))
    im.paste(Image.new('RGB', (w, h), hexrgb('#FFE2A0')), (0, 0), glow)
    d.ellipse((sx - sr, sy - sr, sx + sr, sy + sr), fill=hexrgb('#FFF1CF'))
    for li, col in enumerate([hexrgb('#0F4C4C'), hexrgb('#0B3437'), hexrgb('#06191B')]):
        base = h * (0.6 + li * 0.13)
        pts = [(0, h)]
        ph = rng.random() * 6
        for xx in range(0, w + 8, 8):
            pts.append((xx, base - h * 0.12 * (math.sin(xx / w * (3 + li) + ph) * 0.6 + math.sin(xx / w * 9 + ph * 2) * 0.25)))
        pts.append((w, h))
        d.polygon(pts, fill=col)
    _PHOTOS[key] = im
    return im


_PSPR = {}


def photo_sprite(seed, w, h, gray=0.0, pixel=0, hue=0.0, bright=1.0):
    key = (seed % 6, int(w), int(h), round(gray, 2), int(pixel), round(hue, 2), round(bright, 2))
    sp = _PSPR.get(key)
    if sp:
        return sp
    im = photo_img(seed).resize((max(2, int(w)), max(2, int(h))), Image.LANCZOS)
    if pixel > 1:
        sm = im.resize((max(1, int(w / pixel)), max(1, int(h / pixel))), Image.BILINEAR)
        im = sm.resize(im.size, Image.NEAREST)
    a = np.asarray(im, np.float32)
    if hue:
        # rotate within the warm/teal family only (swap towards cyan), never towards magenta
        a = a * (1 - hue) + a[..., [2, 1, 0]] * hue * np.array([0.6, 1.0, 1.1])
    if gray:
        g = a.mean(axis=2, keepdims=True)
        a = a * (1 - gray) + g * gray
    a = np.clip(a * bright, 0, 255)
    im = Image.fromarray(a.astype(np.uint8)).convert('RGBA')
    sp = Sprite(pil_to_surface(im), w / 2, h / 2)
    if len(_PSPR) > 400:
        _PSPR.clear()
    _PSPR[key] = sp
    return sp


def photo(c, x, y, w, h, seed, alpha=1.0, r=8, gray=0.0, pixel=0, hue=0.0, bright=1.0, stroke=None):
    sp = photo_sprite(seed, w, h, gray, pixel, hue, bright)
    c.save()
    rrect_path(c, x - w / 2, y - h / 2, w, h, r)
    c.clip()
    draw_sprite(c, sp, x, y, alpha)
    c.restore()
    if stroke:
        rrect(c, x - w / 2, y - h / 2, w, h, r, stroke=stroke, lw=2, alpha=alpha)


def filmstrip(c, x, y, w, h, seed, offset=0.0, alpha=1.0, n=6, accent=CYAN):
    rrect(c, x, y, w, h, 6, fill=hexrgb('#0A0C0E'), stroke=mix(LINE, accent, 0.3), lw=1.5, alpha=alpha)
    c.save(); rrect_path(c, x, y, w, h, 6); c.clip()
    fw = w / n
    hole = h * 0.09
    off = (offset % 1.0) * fw
    for i in range(-1, n + 1):
        fx = x + i * fw - off
        photo(c, fx + fw / 2, y + h / 2, fw - 8, h - hole * 4.2, seed + i, alpha, r=3)
    for i in range(int(w / 14) + 2):
        hx = x + i * 14 - (offset * fw) % 14
        rrect(c, hx + 3, y + hole * 0.6, 7, hole, 1.5, fill=hexrgb('#3A3F46'), alpha=alpha)
        rrect(c, hx + 3, y + h - hole * 1.6, 7, hole, 1.5, fill=hexrgb('#3A3F46'), alpha=alpha)
    c.restore()


def wave_vals(seed, n):
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, n)
    env = 0.35 + 0.65 * np.abs(np.sin(x * math.pi * rng.uniform(2, 5) + rng.random() * 3)) ** 0.7
    return np.clip(env * (0.45 + 0.55 * rng.random(n)), 0.06, 1)


def waveform(c, x, y, w, h, seed, color=TEAL, alpha=1.0, progress=1.0, n=64, t=0.0, live=False, gain=1.0, play=None, dim_out=None):
    vals = wave_vals(seed, n)
    bw = w / n
    for i, v in enumerate(vals):
        if i / n > progress:
            break
        if live:
            v = v * (0.6 + 0.4 * math.sin(t * 8 + i * 0.7) ** 2)
        hh = max(2, v * h * gain)
        col = color
        a = alpha
        if play is not None and i / n > play:
            col = mix(color, DIM, 0.6)
        if dim_out and not (dim_out[0] <= i / n <= dim_out[1]):
            a *= 0.25
        rrect(c, x + i * bw + bw * 0.2, y - hh / 2, bw * 0.6, hh, bw * 0.3, fill=col, alpha=a)


def window(c, x, y, w, h, title='', alpha=1.0, accent=GOLD):
    rrect(c, x + 4, y + 8, w, h, 12, fill=(0, 0, 0), alpha=alpha * 0.5)
    rrect(c, x, y, w, h, 12, fill=hexrgb('#0E1115'), stroke=mix(LINE, accent, 0.35), lw=1.5, alpha=alpha)
    c.save(); rrect_path(c, x, y, w, 30, 12); c.clip()
    c.rectangle(x, y, w, 30); c.set_source_rgba(*rgbf(SURF2, alpha)); c.fill()
    c.restore()
    for i, col in enumerate((GOLD, TEAL, EMERALD)):
        circle(c, x + 18 + i * 16, y + 15, 4.5, fill=col, alpha=alpha * 0.9)
    if title:
        text(c, title, font(MONO, 13, 'Medium'), x + w / 2, y + 15, color=MUTED, alpha=alpha)
    return x + 16, y + 44


TOK = re.compile(r'("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(\b\d[\w.]*\b)|(\b(?:true|false|null|SELECT|FROM|WHERE|JOIN|ON|AND|ORDER|BY|GROUP|const|let|await|fetch|import|def|return|curl|requests)\b)|([{}\[\]():,;=<>/|*+.-])')


def code_line(c, s, x, y, alpha=1.0, size=15, base=TEXT):
    f = font(MONO, size, 'Medium')
    pos = 0
    xx = x
    for m in TOK.finditer(s):
        if m.start() > pos:
            seg = s[pos:m.start()]
            text(c, seg, f, xx, y, color=base, alpha=alpha, anchor='lm'); xx += f.getlength(seg)
        seg = m.group(0)
        col = SKY if m.group(1) else EMERALD if m.group(2) else GOLD if m.group(3) else CYAN if m.group(4) else MUTED
        text(c, seg, f, xx, y, color=col, alpha=alpha, anchor='lm'); xx += f.getlength(seg)
        pos = m.end()
    if pos < len(s):
        text(c, s[pos:], f, xx, y, color=base, alpha=alpha, anchor='lm'); xx += f.getlength(s[pos:])
    return xx


def typed_lines(c, lines, x, y, t, cps=38, lh=22, size=15, alpha=1.0, cursor=True):
    budget = int(max(0, t) * cps)
    last = (x, y)
    for i, ln in enumerate(lines):
        if budget <= 0:
            break
        part = ln[:budget]
        budget -= len(ln) + 4
        xx = code_line(c, part, x, y + i * lh, alpha, size)
        last = (xx, y + i * lh)
    if cursor and int(t * 2.5) % 2 == 0:
        rrect(c, last[0] + 2, last[1] - size * 0.6, 8, size * 1.2, 1, fill=GOLD, alpha=alpha)


def arrow(c, x0, y, x1, color, alpha=1.0, t=0.0, lw=3):
    c.set_dash([8, 8], -t * 30)
    line(c, x0, y, x1 - 10, y, color, lw, alpha)
    c.set_dash([])
    c.move_to(x1, y); c.line_to(x1 - 14, y - 9); c.line_to(x1 - 14, y + 9); c.close_path()
    c.set_source_rgba(*rgbf(color, alpha)); c.fill()


def badge(c, x, y, label, color, alpha=1.0, size=16, dark=True, anchor='m'):
    f = font(SANS, size, 'Bold')
    tw = f.getlength(label) + size * 1.4
    hh = size * 1.9
    x0 = x - tw / 2 if anchor == 'm' else x
    rrect(c, x0, y - hh / 2, tw, hh, hh / 2, fill=color, alpha=alpha)
    text(c, label, f, x0 + tw / 2, y, color=BLACK if dark else TEXT, alpha=alpha)
    return tw


def fmt_card(c, x, y, label, color, alpha=1.0, kind='doc', seed=0, scale=1.0, w=150, h=190):
    c.save(); c.translate(x, y); c.scale(scale, scale)
    if kind == 'img':
        photo(c, 0, 0, w, h * 0.8, seed, alpha, r=10, stroke=color)
    elif kind == 'film':
        filmstrip(c, -w / 2 - 20, -h * 0.3, w + 40, h * 0.6, seed, 0, alpha, n=3, accent=color)
    elif kind == 'audio':
        rrect(c, -w / 2, -h * 0.35, w, h * 0.7, 12, fill=SURF, stroke=color, lw=2, alpha=alpha)
        waveform(c, -w / 2 + 12, 0, w - 24, h * 0.45, seed, color, alpha, n=20)
    elif kind == 'data':
        rrect(c, -w / 2, -h / 2, w, h, 10, fill=SURF, stroke=color, lw=2, alpha=alpha)
        for r_ in range(5):
            for col in range(3):
                rrect(c, -w / 2 + 12 + col * (w - 24) / 3, -h / 2 + 18 + r_ * 30, (w - 24) / 3 - 6, 20, 3,
                      fill=mix(SURF2, color, 0.35 if r_ == 0 else 0.1), alpha=alpha)
    else:
        page(c, 0, 0, w, h, alpha, color, seed=seed)
    badge(c, 0, h / 2 + 4, label, color, alpha, 15)
    c.restore()


def size_str(kb):
    return f'{kb / 1024:.1f} MB' if kb >= 1024 else f'{int(kb)} KB'


# ============================================================================= demo templates
# Every demo draws inside the stage (x 40..920, y 100..440) given local time t (s), length d and params P.
SX, SY, SW, SH = 40, 100, 880, 340
CX, CY = W / 2, SY + SH / 2


def d_merge(c, g, t, d, P):
    kind = P['kind']
    n = 3 + P['r'] % 2
    colors = P['cols']
    k = ease_in_out((t - 0.6) / 1.6)
    for i in range(n):
        sx = CX + (i - (n - 1) / 2) * 190
        sy = CY - 10
        tx = CX - 190 + i * 6
        ty = CY - 6 - i * 6
        x, y = lerp(sx, tx, k), lerp(sy, ty, k)
        a = ease_out((t - i * 0.15) / 0.4)
        if kind == 'doc':
            page(c, x, y, 120, 160, a, colors[i % 3], rot=(1 - k) * (i - 1) * 0.08, seed=i + P['seed'])
        elif kind == 'img':
            photo(c, x, y, 140, 100, P['seed'] + i, a, stroke=colors[i % 3])
        elif kind == 'film':
            filmstrip(c, x - 80, y - 32, 160, 64, P['seed'] + i * 3, 0, a, n=3, accent=colors[i % 3])
        else:
            rrect(c, x - 80, y - 32, 160, 64, 10, fill=SURF, stroke=colors[i % 3], lw=2, alpha=a)
            waveform(c, x - 70, y, 140, 44, P['seed'] + i, colors[i % 3], a, n=18)
    if t > 2.0:
        kk = ease_out_back((t - 2.0) / 0.6)
        x = CX + 40
        arrow(c, CX - 90, CY, x - 20, GOLD, clamp(kk), t)
        if kind in ('doc', 'img'):
            page(c, x + 80, CY, 140, 186, clamp(kk), GOLD, seed=P['seed'], img=(kind == 'img'), scale=0.85 + 0.15 * clamp(kk))
            badge(c, x + 80, CY + 112, f'{n} in 1', GOLD, clamp(kk))
        elif kind == 'film':
            filmstrip(c, x, CY - 40, 260, 80, P['seed'], t * 0.6, clamp(kk), n=4, accent=GOLD)
            badge(c, x + 130, CY + 66, f'{n} clips joined', GOLD, clamp(kk))
        else:
            rrect(c, x, CY - 40, 260, 80, 12, fill=SURF, stroke=GOLD, lw=2, alpha=clamp(kk))
            waveform(c, x + 10, CY, 240, 56, P['seed'] + 9, GOLD, clamp(kk), n=40, play=(t - 2) / 3)
            badge(c, x + 130, CY + 66, 'one track', GOLD, clamp(kk))
        circle(g, x + 90, CY, 110, fill=GLOW, alpha=0.10 * clamp(kk))


def d_split(c, g, t, d, P):
    kind = P['kind']
    k = ease_out((t - 1.0) / 1.2)
    if kind == 'grid':      # image splitter
        n = 3
        tw, th = 240 / n, 240 / n
        for r_ in range(n):
            for cc in range(n):
                gap = 14 * k
                x = CX - 120 + cc * (tw + gap) - gap
                y = CY - 120 + r_ * (th + gap) - gap
                c.save(); c.rectangle(x, y, tw, th); c.clip()
                draw_sprite(c, photo_sprite(P['seed'], 240, 240), CX - 120 + 120 + cc * gap - gap, CY - 120 + 120 + r_ * gap - gap, 1)
                c.restore()
                rrect(c, x, y, tw, th, 2, stroke=GOLD, lw=1.5, alpha=k)
        badge(c, CX, CY + 150, '3 x 3 tiles', GOLD, ease_out((t - 1.6) / 0.4))
        return
    if kind == 'frames':
        filmstrip(c, SX + 40, CY - 120, SW - 80, 90, P['seed'], t * 0.4, 1)
        for i in range(5):
            kk = ease_out_back((t - 0.8 - i * 0.3) / 0.5)
            if kk > 0:
                photo(c, SX + 120 + i * 165, CY + 70 + (1 - clamp(kk)) * -60, 140, 90, P['seed'] + i, clamp(kk), stroke=P['cols'][i % 3])
                text(c, f'frame_{i + 1:03d}.png', font(MONO, 12), SX + 120 + i * 165, CY + 130, color=MUTED, alpha=clamp(kk))
        return
    n = P['n']
    # single doc splits into n pages fanning out
    for i in range(n):
        x = lerp(CX, CX + (i - (n - 1) / 2) * 150, k)
        rot = lerp(0, (i - (n - 1) / 2) * 0.06, k)
        a = 1 if kind != 'extract' or i in (1, 3) or k < 0.5 else 1 - 0.7 * ease_out((t - 2) / 0.6)
        page(c, x, CY - 10 + (i % 2) * 8 * k, 118, 156, a, P['cols'][i % 3], rot=rot, seed=i + P['seed'])
        if k > 0.95:
            text(c, str(i + 1), font(MONO, 14, 'Bold'), x, CY + 86, color=MUTED, alpha=a)
    # scissor sweep
    sx = lerp(SX, SX + SW, clamp((t - 0.2) / 0.9))
    if t < 1.3:
        line(c, sx, SY + 20, sx, SY + SH - 20, GOLD, 2, 0.9)
        line(g, sx, SY + 20, sx, SY + SH - 20, GLOW, 10, 0.8)
        draw_sprite(c, icon_sprite('Scissors', 34, GOLD), sx, SY + 14)
    lab = {'extract': 'pages 2, 4 to new PDF', 'delete': 'pages removed'}.get(kind, f'{n} files in a ZIP')
    badge(c, CX, SY + SH - 14, lab, GOLD, ease_out((t - 2.2) / 0.4))


def d_compress(c, g, t, d, P):
    kind = P['kind']
    before, after = P['kb']
    k = ease_in_out((t - 0.8) / 2.0)
    sc = lerp(1.0, 0.62, k)
    x = CX - 150
    if kind == 'img':
        photo(c, x, CY - 10, 260 * sc, 180 * sc, P['seed'], 1, stroke=GOLD)
    elif kind == 'film':
        filmstrip(c, x - 140 * sc, CY - 10 - 50 * sc, 280 * sc, 100 * sc, P['seed'], t * 0.5, 1, n=3)
    else:
        page(c, x, CY - 10, 170, 220, 1, P['cols'][0], seed=P['seed'], img=True, scale=sc)
    # compress clamps
    for s in (-1, 1):
        off = lerp(170, 170 * 0.62, k)
        line(c, x + s * off, CY - 80, x + s * off, CY + 60, GOLD, 4, 0.9)
        line(g, x + s * off, CY - 80, x + s * off, CY + 60, GLOW, 12, 0.6)
    # counter + ring
    kb = lerp(before, after, k)
    rx = CX + 190
    arc(c, rx, CY - 20, 80, 0, 2 * math.pi, LINE, 10)
    arc(c, rx, CY - 20, 80, -math.pi / 2, -math.pi / 2 + 2 * math.pi * k * (1 - after / before), EMERALD, 10)
    arc(g, rx, CY - 20, 80, -math.pi / 2, -math.pi / 2 + 2 * math.pi * k * (1 - after / before), EMERALD, 18, 0.7)
    text(c, f'-{int(round(100 * k * (1 - after / before)))}%', font(DISPLAY, 40, 'Bold'), rx, CY - 22, color=TEXT)
    text(c, size_str(kb), font(MONO, 24, 'Bold'), rx, CY + 92, color=GOLD)
    text(c, f'from {size_str(before)}', font(MONO, 14, 'Medium'), rx, CY + 120, color=MUTED)


FMT_KIND = {'PDF': 'doc', 'WORD': 'doc', 'DOCX': 'doc', 'TXT': 'doc', 'TEXT': 'doc', 'MD': 'doc', 'HTML': 'doc', 'EPUB': 'doc',
            'PPTX': 'doc', 'IMAGE': 'img', 'RAW': 'img', 'TIFF': 'img', 'JXL': 'img', 'SVG': 'img', 'ICO': 'img', 'ICNS': 'img', 'CUR': 'img', 'JPG': 'img', 'PNG': 'img', 'WEBP': 'img', 'HEIC': 'img', 'AVIF': 'img', 'GIF': 'img',
            'XLSX': 'data', 'CSV': 'data', 'JSON': 'data', 'MP4': 'film', 'WEBM': 'film', 'MOV': 'film', 'MKV': 'film',
            'MP3': 'audio', 'WAV': 'audio', 'OGG': 'audio', 'FLAC': 'audio', 'AAC': 'audio', 'M4A': 'audio'}


def d_convert(c, g, t, d, P):
    seq = P['fmts']
    a_in = ease_out(t / 0.5)
    fx, tx = CX - 220, CX + 220
    src = seq[0]
    fmt_card(c, fx, CY - 16, src, P['cols'][0], a_in, FMT_KIND.get(src, 'doc'), P['seed'])
    # cycling targets
    targets = seq[1:]
    per = max(1.1, (d - 1.6) / max(1, len(targets)))
    idx = min(len(targets) - 1, int(max(0, t - 1.0) / per))
    lt = max(0, t - 1.0) - idx * per
    arrow(c, fx + 100, CY - 16, tx - 100, GOLD, a_in, t)
    # particles travelling
    for i in range(6):
        ph = (t * 0.9 + i / 6) % 1
        circle(c, lerp(fx + 100, tx - 100, ph), CY - 16 + math.sin(ph * 6.28 + i) * 10, 3.5, fill=GLOW, alpha=0.9 * a_in)
        circle(g, lerp(fx + 100, tx - 100, ph), CY - 16, 8, fill=GLOW, alpha=0.6)
    if t > 1.0:
        tg = targets[idx]
        kk = ease_out_back(lt / 0.5)
        fmt_card(c, tx, CY - 16, tg, P['cols'][1 + idx % 2], clamp(kk), FMT_KIND.get(tg, 'doc'), P['seed'] + 3, scale=0.85 + 0.15 * clamp(kk))
        rrect(g, tx - 90, CY - 120, 180, 220, 20, fill=GLOW, alpha=0.12 * clamp(kk))
    if len(targets) > 1:
        f = font(MONO, 14, 'Bold')
        x = CX - (len(targets) * 64) / 2
        for i, tg in enumerate(targets):
            on = i == idx and t > 1.0
            rrect(c, x + i * 64, SY + SH - 22, 56, 24, 12, fill=GOLD if on else SURF, stroke=GOLD if on else LINE, lw=1)
            text(c, tg, f, x + i * 64 + 28, SY + SH - 10, color=BLACK if on else MUTED)


def d_doc(c, g, t, d, P):
    """Single big page with a tool-specific action."""
    act = P['act']
    px, py, pw, ph = CX - (110 if P['mirror'] else -110) * 0 , CY, 210, 290
    if act in ('compare',):
        for s, xx in ((-1, CX - 130), (1, CX + 130)):
            page(c, xx, CY, 200, 280, 1, GOLD, seed=P['seed'] + (s > 0), lines=0, header=True)
            for i in range(9):
                y = CY - 95 + i * 22
                diff = i in (2, 5, 6)
                col = (EMERALD if s > 0 else GOLD) if diff else PAPER_LINE
                k = ease_out((t - 1.0 - i * 0.12) / 0.4) if diff else 1
                if diff:
                    rrect(c, xx - 88, y - 7, 176 * k, 16, 3, fill=col, alpha=0.35)
                rrect(c, xx - 76, y - 2, 120 + (i * 13) % 30, 5, 2, fill=INK if diff else PAPER_LINE, alpha=0.8 if diff else 1)
        badge(c, CX, SY + SH - 6, '3 changes found', GOLD, ease_out((t - 2.4) / 0.4))
        return
    if act in ('organize', 'delete', 'insert', 'nup', 'rotate_grid'):
        n = 6
        order = list(range(n))
        k = ease_in_out((t - 1.0) / 1.0)
        for i in range(n):
            col, row = i % 3, i // 3
            x = CX - 170 + col * 170
            y = CY - 75 + row * 150
            j = i
            if act == 'organize' and i in (1, 4):
                o = 4 if i == 1 else 1
                x2, y2 = CX - 170 + (o % 3) * 170, CY - 75 + (o // 3) * 150
                x, y = lerp(x, x2, k), lerp(y, y2, k) - math.sin(k * math.pi) * 30
            a = 1.0
            sc = 1.0
            if act == 'delete' and i == 2:
                a = 1 - k; sc = 1 - 0.3 * k
            if act == 'insert' and i >= 3:
                pass
            if act == 'nup':
                x = lerp(x, CX - 50 + col * 50, k); y = lerp(y, CY - 40 + row * 70, k); sc = lerp(1, 0.38, k)
            page(c, x, y, 100, 130, a, P['cols'][i % 3], seed=i + P['seed'], scale=sc)
            if act == 'delete' and i == 2 and 0 < k < 1:
                draw_sprite(c, icon_sprite('Trash2', 40, GOLD), x, y, 1 - k)
            if act != 'nup':
                text(c, str(i + 1), font(MONO, 13, 'Bold'), x, y + 78, color=MUTED, alpha=a)
        if act == 'nup':
            k2 = ease_out((t - 2.2) / 0.5)
            rrect(c, CX - 105, CY - 105, 210, 200, 6, stroke=GOLD, lw=2, alpha=k2)
            badge(c, CX, CY + 130, '6 pages on 1 sheet', GOLD, k2)
        if act == 'insert':
            k2 = ease_out_back((t - 1.6) / 0.6)
            page(c, CX + 170 + 120, CY - 75, 100, 130, clamp(k2), GOLD, lines=0, header=False)
            rrect(c, CX + 170 + 70, CY - 140, 100, 130, 6, stroke=GOLD, lw=2, alpha=clamp(k2))
            badge(c, CX + 290, CY + 10, 'blank page', GOLD, clamp(k2), 13)
        return
    rot = 0.0
    if act == 'rotate':
        rot = ease_in_out((t - 1.0) / 0.8) * math.pi / 2 + ease_in_out((t - 2.6) / 0.8) * math.pi / 2
    gray = ease_in_out((t - 1.0) / 1.2) if act == 'grayscale' else 0
    page(c, CX, CY, pw, ph, 1, P['cols'][0], rot=rot, seed=P['seed'], img=act in ('grayscale', 'crop', 'flatten'), gray=gray)
    x0, y0 = CX - pw / 2, CY - ph / 2
    if act == 'rotate':
        draw_sprite(c, icon_sprite('RotateCw', 40, GOLD), CX + 170, CY - 120)
    elif act == 'grayscale':
        badge(c, CX + 200, CY, 'Grayscale', TEXT, gray)
    elif act == 'sign':
        # handwritten signature drawn progressively
        k = clamp((t - 0.8) / 1.8)
        pts = [(x0 + 30 + i * 2.6, y0 + 230 + 14 * math.sin(i * 0.33) * math.exp(-i / 70) - (i % 23) * 0.6) for i in range(int(60 * k))]
        if len(pts) > 1:
            c.move_to(*pts[0])
            for p in pts[1:]:
                c.line_to(*p)
            c.set_source_rgba(*rgbf(hexrgb('#0F3F6E'))); c.set_line_width(3); c.stroke()
        line(c, x0 + 24, y0 + 252, x0 + 190, y0 + 252, PAPER_LINE, 1.5)
        if pts:
            draw_sprite(c, icon_sprite('PenTool', 30, GOLD), pts[-1][0] + 12, pts[-1][1] - 14)
        text(c, 'Signed  28 Oct 2026', font(SANS, 11, 'Medium'), x0 + 30, y0 + 268, color=INK, alpha=ease_out((t - 2.8) / 0.4), anchor='lm')
    elif act == 'edit':
        k = ease_out((t - 0.8) / 0.6)
        rrect(c, x0 + 22, y0 + 84, 150 * k, 14, 2, fill=GOLD, alpha=0.45)
        k2 = ease_out((t - 1.5) / 0.5)
        rrect(c, x0 + 110, y0 + 160, 80, 60, 6, stroke=TEAL, lw=3, alpha=k2)
        k3 = ease_out((t - 2.1) / 0.5)
        text(c, 'Looks good', font(SANS, 16, 'Bold'), x0 + 28, y0 + 245, color=hexrgb('#0F6E64'), alpha=k3, anchor='lm')
        for i, ic in enumerate(['Type', 'Square', 'Highlighter', 'Image', 'PenLine']):
            on = int(t * 1.2) % 5 == i
            rrect(c, CX + 150, CY - 120 + i * 50, 42, 42, 10, fill=GOLD if on else SURF, stroke=LINE, lw=1)
            draw_sprite(c, icon_sprite(ic, 22, BLACK if on else TEXT), CX + 171, CY - 99 + i * 50)
    elif act == 'watermark':
        k = ease_out((t - 1.0) / 0.8)
        for r_ in range(3):
            text(c, 'CONFIDENTIAL', font(DISPLAY, 22, 'Bold'), CX, y0 + 70 + r_ * 80, color=GOLD, alpha=0.55 * k, rot=-0.5)
    elif act == 'numbers':
        for i in range(3):
            xx = CX + (i - 1) * 70
            page(c, xx, CY, 120, 160, 1, P['cols'][i % 3], seed=i, scale=1)
            k = ease_out_back((t - 1.0 - i * 0.3) / 0.4)
            if k > 0:
                text(c, f'{i + 1} / 3', font(MONO, 12, 'Bold'), xx, CY + 66, color=hexrgb('#8A5A0B'), alpha=clamp(k))
    elif act == 'header':
        k = ease_out((t - 0.9) / 0.6)
        rrect(c, x0 + 14, y0 + 8, (pw - 28) * k, 16, 3, fill=GOLD, alpha=0.3)
        text(c, 'Q3 Report', font(SANS, 10, 'Bold'), x0 + 20, y0 + 16, color=INK, alpha=k, anchor='lm')
        k2 = ease_out((t - 1.4) / 0.6)
        rrect(c, x0 + 14, y0 + ph - 22, (pw - 28) * k2, 14, 3, fill=TEAL, alpha=0.3)
        text(c, 'Page 1 of 12', font(SANS, 9, 'Bold'), x0 + pw - 20, y0 + ph - 15, color=INK, alpha=k2, anchor='rm')
    elif act == 'protect' or act == 'unlock':
        k = ease_in_out((t - 1.0) / 0.7)
        closed = k if act == 'protect' else 1 - k
        circle(g, CX, CY, 70, fill=GLOW, alpha=0.5)
        rrect(c, CX - 46, CY - 10, 92, 74, 12, fill=GOLD)
        c.new_sub_path(); c.arc(CX, CY - 10 - 14 * (1 - closed), 30, math.pi, 2 * math.pi)
        c.set_source_rgba(*rgbf(GOLD)); c.set_line_width(10); c.stroke()
        if closed < 0.98:
            pass
        circle(c, CX, CY + 22, 9, fill=BLACK)
        lab = 'AES-256 encrypted' if act == 'protect' else 'Password removed'
        badge(c, CX, CY + 160, lab, GOLD, ease_out((t - 1.8) / 0.4))
        for i in range(8 if act == 'protect' else 0):
            text(c, '•', font(SANS, 30, 'Bold'), CX - 84 + i * 24, CY - 100, color=GOLD, alpha=ease_out((t - 0.3 - i * 0.08) / 0.2))
    elif act == 'redact':
        for i in range(4):
            k = ease_out((t - 1.0 - i * 0.25) / 0.4)
            rrect(c, x0 + 24, y0 + 70 + i * 40, (120 + (i * 31) % 50) * k, 16, 2, fill=INK)
        badge(c, CX + 200, CY - 60, 'email', GOLD, ease_out((t - 1.0) / 0.3), 13)
        badge(c, CX + 200, CY - 20, 'phone', TEAL, ease_out((t - 1.3) / 0.3), 13)
        badge(c, CX + 200, CY + 20, 'card no.', EMERALD, ease_out((t - 1.6) / 0.3), 13)
    elif act == 'crop':
        k = ease_in_out((t - 0.9) / 1.0)
        m = 30 * k
        c.save(); c.rectangle(x0, y0, pw, ph); c.rectangle(x0 + m, y0 + m * 1.2, pw - 2 * m, ph - 2.4 * m); c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD)
        c.set_source_rgba(0, 0, 0, 0.55); c.fill(); c.restore()
        rrect(c, x0 + m, y0 + m * 1.2, pw - 2 * m, ph - 2.4 * m, 2, stroke=GOLD, lw=2)
        for cx_, cy_ in ((x0 + m, y0 + m * 1.2), (x0 + pw - m, y0 + m * 1.2), (x0 + m, y0 + ph - m * 1.2), (x0 + pw - m, y0 + ph - m * 1.2)):
            rrect(c, cx_ - 6, cy_ - 6, 12, 12, 3, fill=GOLD)
    elif act == 'flatten':
        for i in range(3):
            k = ease_in_out((t - 0.9) / 1.0)
            off = (1 - k) * (i + 1) * 26
            rrect(c, x0 + 30 + off, y0 + 120 - off, 130, 30, 5, fill=[GOLD, TEAL, SKY][i], alpha=0.45, stroke=[GOLD, TEAL, SKY][i], lw=2)
        badge(c, CX + 210, CY, 'one layer', GOLD, ease_out((t - 2) / 0.4))
    elif act in ('metadata', 'form', 'resume', 'invoice'):
        fields = {'metadata': [('Title', 'Annual Report'), ('Author', 'A. Adak'), ('Subject', 'Finance'), ('Keywords', 'q3, plan')],
                  'form': [('Name', 'Riya Sen'), ('Email', 'riya@mail.com'), ('City', 'Kolkata'), ('Agree', '✓')],
                  'resume': [('Name', 'Riya Sen'), ('Role', 'Frontend Dev'), ('Skills', 'React, TS'), ('Template', 'Clean')],
                  'invoice': [('Design work', '12,000'), ('Hosting', '2,400'), ('GST 18%', '2,592'), ('Total', '16,992')]}[act]
        wx, wy = CX + 20, CY - 120
        window(c, wx, wy, 330, 250, {'metadata': 'properties', 'form': 'form fields', 'resume': 'details', 'invoice': 'invoice'}[act])
        page(c, CX - 170, CY, 170, 230, 1, P['cols'][0], seed=P['seed'], scale=1)
        for i, (k_, v) in enumerate(fields):
            y = wy + 60 + i * 44
            text(c, k_, font(SANS, 14, 'Medium'), wx + 18, y, color=MUTED, anchor='lm')
            rrect(c, wx + 120, y - 14, 190, 28, 6, fill=SURF2, stroke=LINE, lw=1)
            s = typed(v, t - 0.8 - i * 0.55, 18)
            hot = act == 'invoice' and i == 3
            text(c, s, font(MONO if act == 'invoice' else SANS, 14, 'Bold' if hot else 'Medium'), wx + 130 if act != 'invoice' else wx + 300, y,
                 color=GOLD if hot else TEXT, anchor='lm' if act != 'invoice' else 'rm')
    elif act == 'ocr':
        k = clamp((t - 0.6) / 1.6)
        y = y0 + ph * k
        line(c, x0 - 10, y, x0 + pw + 10, y, CYAN, 2)
        line(g, x0 - 10, y, x0 + pw + 10, y, CYAN, 14, 0.8)
        for i in range(6):
            yy = y0 + 60 + i * 30
            if yy < y:
                rrect(c, x0 + 22, yy - 6, 150, 14, 3, fill=CYAN, alpha=0.28)
        if t > 2.0:
            window(c, CX + 140, CY - 90, 200, 170, 'text')
            typed_lines(c, ['Invoice No. 2041', 'Date 12/09/2026', 'Total 4,560.00'], CX + 156, CY - 40, t - 2.1, size=13, cps=30)
    elif act == 'reader':
        k = ease_in_out((t - 1.0) / 1.2)
        rrect(c, x0 + 22, y0 + 116, 90, 14, 3, fill=GOLD, alpha=0.5 * k)
        window(c, CX + 140, CY - 130, 220, 44, '')
        text(c, typed('budget', t - 0.6, 10), font(SANS, 15, 'Medium'), CX + 160, CY - 100, anchor='lm')
        text(c, '3 matches', font(MONO, 12), CX + 340, CY - 100, color=GOLD, anchor='rm', alpha=k)
        for i in range(4):
            page(c, CX - 200, CY - 105 + i * 70, 50, 64, 1 if i else 1, GOLD if i == 1 else LINE, seed=i, lines=3)
    elif act == 'repair':
        k = ease_out((t - 1.0) / 1.0)
        c.save()
        for i, (dx, dy, r) in enumerate([(-30, -20, -0.2), (30, 10, 0.15), (0, 40, 0.1)]):
            pass
        c.restore()
        if k < 1:
            for i in range(5):
                rrect(c, x0 + 10 + (i * 37) % 160 + (1 - k) * (i - 2) * 30, y0 + 40 + i * 45 + (1 - k) * ((i % 2) * 2 - 1) * 20, 60, 30, 3,
                      fill=hexrgb('#3A2A10'), alpha=0.6 * (1 - k))
        draw_sprite(c, icon_sprite('Wrench', 40, GOLD), CX + 170, CY - 60, 1, rot=math.sin(t * 6) * 0.3 * (1 - k))
        badge(c, CX + 170, CY + 20, 'Rebuilt', EMERALD, ease_out((t - 2) / 0.4))


def d_image(c, g, t, d, P):
    act = P['act']
    s = P['seed']
    pw, ph = 330, 220
    if act == 'resize':
        k = ease_in_out((t - 0.8) / 1.4)
        w_, h_ = lerp(380, 220, k), lerp(250, 146, k)
        photo(c, CX - 80, CY, w_, h_, s, 1, stroke=GOLD)
        for sx_ in (-1, 1):
            for sy_ in (-1, 1):
                rrect(c, CX - 80 + sx_ * w_ / 2 - 6, CY + sy_ * h_ / 2 - 6, 12, 12, 3, fill=GOLD)
        text(c, f'{int(lerp(3840, 1080, k))} x {int(lerp(2560, 720, k))}', font(MONO, 26, 'Bold'), CX + 250, CY - 10, color=TEXT)
        text(c, 'pixels', font(SANS, 14), CX + 250, CY + 20, color=MUTED)
    elif act == 'crop':
        photo(c, CX, CY, 400, 260, s, 1)
        k = ease_in_out((t - 0.8) / 1.0)
        circ = P['r'] % 2 == 0
        bw, bh = lerp(400, 200, k), lerp(260, 200, k)
        c.save(); c.rectangle(CX - 200, CY - 130, 400, 260)
        if circ and k > 0.99:
            c.new_sub_path(); c.arc(CX, CY, 100, 0, 2 * math.pi)
        else:
            c.rectangle(CX - bw / 2, CY - bh / 2, bw, bh)
        c.set_fill_rule(cairo.FILL_RULE_EVEN_ODD); c.set_source_rgba(0, 0, 0, 0.6); c.fill(); c.restore()
        rrect(c, CX - bw / 2, CY - bh / 2, bw, bh, 2, stroke=GOLD, lw=2)
        badge(c, CX, CY + 150, '1 : 1', GOLD, ease_out((t - 1.6) / 0.4))
    elif act == 'rotate':
        k = ease_in_out((t - 0.8) / 0.8)
        k2 = ease_in_out((t - 2.0) / 0.6)
        c.save(); c.translate(CX, CY); c.rotate(k * math.pi / 2); c.scale(1 - 2 * k2, 1); c.translate(-CX, -CY)
        photo(c, CX, CY, 300, 200, s, 1, stroke=GOLD)
        c.restore()
        draw_sprite(c, icon_sprite('RotateCw', 36, GOLD), CX + 220, CY - 80, ease_out(t / 0.5))
        draw_sprite(c, icon_sprite('FlipHorizontal', 36, TEAL), CX + 220, CY + 20, ease_out((t - 1.6) / 0.5))
    elif act == 'bgremove':
        k = ease_in_out((t - 0.9) / 1.3)
        x0, y0 = CX - pw / 2, CY - ph / 2
        # checkerboard on the revealed side
        c.save(); c.rectangle(x0, y0, pw * k, ph); c.clip()
        for i in range(0, pw, 16):
            for j in range(0, ph, 16):
                c.rectangle(x0 + i, y0 + j, 16, 16)
                v = 0.17 if (i // 16 + j // 16) % 2 else 0.11
                c.set_source_rgb(v, v, v); c.fill()
        c.restore()
        c.save(); c.rectangle(x0 + pw * k, y0, pw * (1 - k) + 1, ph); c.clip()
        photo(c, CX, CY, pw, ph, s, 1, r=0)
        c.restore()
        # subject (a simple portrait silhouette)
        circle(c, CX, CY - 30, 42, fill=hexrgb('#E9C9A0'))
        c.new_sub_path(); c.arc(CX, CY + 110, 90, math.pi, 2 * math.pi); c.set_source_rgba(*rgbf(TEAL)); c.fill()
        line(c, x0 + pw * k, y0, x0 + pw * k, y0 + ph, GOLD, 3)
        line(g, x0 + pw * k, y0, x0 + pw * k, y0 + ph, GLOW, 12)
        rrect(c, x0, y0, pw, ph, 4, stroke=LINE, lw=1.5)
        badge(c, CX + 250, CY, 'on-device AI', GOLD, ease_out((t - 0.4) / 0.4), 13)
    elif act == 'compare':
        x0 = CX - pw / 2
        k = 0.5 + 0.38 * math.sin((t - 0.6) * 1.5) if t > 0.6 else 0.5
        photo(c, CX, CY, pw, ph, s, 1, gray=0.85)
        c.save(); c.rectangle(x0, CY - ph / 2, pw * k, ph); c.clip(); photo(c, CX, CY, pw, ph, s, 1); c.restore()
        line(c, x0 + pw * k, CY - ph / 2, x0 + pw * k, CY + ph / 2, GOLD, 3)
        circle(c, x0 + pw * k, CY, 14, fill=GOLD)
        text(c, 'before', font(SANS, 13, 'SemiBold'), x0 + 30, CY + ph / 2 + 18, color=MUTED)
        text(c, 'after', font(SANS, 13, 'SemiBold'), x0 + pw - 30, CY + ph / 2 + 18, color=MUTED)
    elif act == 'upscale':
        k = clamp((t - 0.9) / 1.4)
        x0 = CX - pw / 2
        photo(c, CX, CY, pw, ph, s, 1, pixel=12)
        c.save(); c.rectangle(x0, CY - ph / 2, pw * ease_in_out(k), ph); c.clip(); photo(c, CX, CY, pw, ph, s, 1); c.restore()
        line(c, x0 + pw * ease_in_out(k), CY - ph / 2, x0 + pw * ease_in_out(k), CY + ph / 2, GOLD, 3)
        text(c, f'{1 + 3 * ease_in_out(k):.1f}x', font(DISPLAY, 40, 'Bold'), CX + 260, CY, gradient=GOLD_GRAD)
    elif act in ('watermark', 'text', 'meme'):
        photo(c, CX, CY, 380, 250, s, 1)
        k = ease_out_back((t - 1.0) / 0.6)
        if act == 'watermark':
            for i in range(3):
                text(c, '© your brand', font(DISPLAY, 22, 'Bold'), CX - 110 + i * 110, CY - 60 + i * 60, color=TEXT, alpha=0.5 * clamp(k), rot=-0.35)
        elif act == 'text':
            text(c, 'Golden hour', font(DISPLAY, 46, 'Bold'), CX, CY - 70, color=TEXT, alpha=clamp(k), scale=0.8 + 0.2 * clamp(k), shadow=(4, (0, 0, 0), 0.8))
        else:
            text(c, 'ME, FIXING ONE BUG', font(DISPLAY, 30, 'Bold'), CX, CY - 100, alpha=clamp(k), shadow=(2, (0, 0, 0), 1))
            text(c, 'NOW THERE ARE NINE', font(DISPLAY, 30, 'Bold'), CX, CY + 100, alpha=ease_out_back((t - 1.6) / 0.6) if t > 1.6 else 0, shadow=(2, (0, 0, 0), 1))
    elif act == 'rounded':
        k = ease_in_out((t - 0.8) / 1.4)
        size = 230
        rad = lerp(0, size / 2, k)
        c.save(); rrect_path(c, CX - size / 2, CY - size / 2, size, size, rad); c.clip()
        photo(c, CX, CY, size, size, s, 1, r=0)
        c.restore()
        rrect(c, CX - size / 2, CY - size / 2, size, size, rad, stroke=GOLD, lw=2)
        text(c, f'radius {int(rad)} px', font(MONO, 20, 'Bold'), CX + 250, CY, color=TEXT)
    elif act == 'filters':
        k = 0.5 + 0.5 * math.sin((t - 0.8) * 1.6) if t > 0.8 else 0.5
        photo(c, CX - 120, CY, 340, 230, s, 1, bright=round(0.75 + 0.5 * k, 2), hue=round(0.4 * (1 - k), 2))
        for i, lab in enumerate(['Brightness', 'Contrast', 'Saturation', 'Warmth']):
            y = CY - 75 + i * 50
            v = [k, 1 - k * 0.6, 0.3 + 0.5 * k, 0.6][i]
            text(c, lab, font(SANS, 13, 'Medium'), CX + 110, y - 12, color=MUTED, anchor='lm')
            rrect(c, CX + 110, y, 230, 6, 3, fill=LINE)
            rrect(c, CX + 110, y, 230 * v, 6, 3, fill=P['cols'][i % 3])
            circle(c, CX + 110 + 230 * v, y + 3, 8, fill=TEXT)
    elif act in ('blur', 'exif'):
        photo(c, CX - 90, CY, 340, 230, s, 1)
        if act == 'blur':
            k = ease_out((t - 1.0) / 0.6)
            rx, ry = CX - 90 + 30, CY - 20
            c.save(); rrect_path(c, rx - 50, ry - 50, 100, 100, 10); c.clip()
            draw_sprite(c, photo_sprite(s, 340, 230, pixel=int(1 + 15 * k)), CX - 90, CY)
            c.restore()
            rrect(c, rx - 50, ry - 50, 100, 100, 10, stroke=GOLD, lw=2, alpha=k)
            badge(c, CX + 190, CY, 'face detected', GOLD, k, 13)
        else:
            wx = CX + 110
            window(c, wx, CY - 110, 230, 220, 'metadata')
            rows = ['Camera  Pixel 9', 'GPS  22.42, 87.32', 'Date  2026:10:12', 'Lens  24mm f/1.8']
            for i, r_ in enumerate(rows):
                y = CY - 50 + i * 36
                text(c, r_, font(MONO, 12, 'Medium'), wx + 16, y, anchor='lm')
                k = ease_out((t - 1.2 - i * 0.3) / 0.4)
                line(c, wx + 14, y, wx + 14 + 200 * k, y, GOLD, 2)
            badge(c, wx + 115, CY + 140, 'Stripped', EMERALD, ease_out((t - 2.6) / 0.4))
    elif act == 'svg':
        k = ease_in_out((t - 0.8) / 1.5)
        photo(c, CX - 160, CY, 240, 180, s, 1)
        arrow(c, CX - 30, CY, CX + 40, GOLD, 1, t)
        # vector rendition: layered polygons + nodes
        bx = CX + 160
        pts = [(bx - 120 + i * 20, CY + 30 - 40 * math.sin(i * 0.7 + 1)) for i in range(13)]
        for li, col in enumerate([TEAL, hexrgb('#0F4C4C')]):
            c.move_to(bx - 120, CY + 90)
            for x, y in pts:
                c.line_to(x, y + li * 30)
            c.line_to(bx + 120, CY + 90); c.close_path()
            c.set_source_rgba(*rgbf(col, k)); c.fill()
        circle(c, bx, CY - 40, 26, fill=GOLD, alpha=k)
        for x, y in pts:
            rrect(c, x - 3, y - 3, 6, 6, 1, fill=TEXT, alpha=k)
        rrect(c, bx - 120, CY - 90, 240, 180, 8, stroke=GOLD, lw=2, alpha=k)
    elif act == 'screenshot':
        k = ease_in_out((t - 0.8) / 1.2)
        pad = 40 * k
        linear_fill(c, CX - 220, CY - 150, CX + 220, CY + 150, [(0, hexrgb('#0F4C4C'), k), (1, GOLD_DEEP, k)])
        rrect_path(c, CX - 220, CY - 150, 440, 300, 18); c.fill()
        window(c, CX - 220 + pad, CY - 150 + pad, 440 - 2 * pad, 300 - 2 * pad, 'app.tsx')
        typed_lines(c, ['const app = createApp()', 'app.mount("#root")'], CX - 200 + pad, CY - 90 + pad, t, size=13)
    elif act == 'collage':
        k = ease_in_out((t - 0.6) / 1.4)
        cells = [(-150, -60, 150, 160), (20, -60, 130, 75), (20, 25, 130, 75), (170, -60, 110, 160)]
        rng_ = np.random.default_rng(s)
        for i, (x, y, w_, h_) in enumerate(cells):
            sx_, sy_ = rng_.uniform(-300, 300), rng_.uniform(-150, 150)
            photo(c, lerp(CX + sx_, CX + x + w_ / 2 - 60, k), lerp(CY + sy_, CY + y + h_ / 2 - 10, k), w_, h_, s + i, 1, r=6, stroke=TEXT if k > 0.98 else None)
    elif act == 'gif':
        frames = 4
        i = int(t * 6) % frames
        for j in range(frames):
            photo(c, CX - 240 + j * 80, CY + 120, 70, 48, s + j, 1 if j == i else 0.4, r=4, stroke=GOLD if j == i else None)
        photo(c, CX, CY - 30, 300, 190, s + i, 1, stroke=GOLD)
        badge(c, CX + 210, CY - 110, 'GIF', GOLD, 1)
    elif act == 'base64':
        photo(c, CX - 200, CY, 200, 140, s, 1)
        arrow(c, CX - 80, CY, CX - 10, GOLD, 1, t)
        window(c, CX, CY - 100, 260, 200, 'data URI')
        rng_ = np.random.default_rng(s)
        al = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        lines_ = ['data:image/png;base64,'] + [''.join(al[k_] for k_ in rng_.integers(0, 64, 26)) for _ in range(5)]
        typed_lines(c, lines_, CX + 16, CY - 50, t - 0.6, cps=60, size=12, lh=20)
    elif act == 'splitter':
        d_split(c, g, t, d, dict(P, kind='grid'))
    elif act == 'picker':
        photo(c, CX - 80, CY, 380, 250, s, 1)
        px_ = CX - 80 + math.sin(t * 0.9) * 120
        py_ = CY + math.cos(t * 1.1) * 60
        col = photo_img(s).resize((380, 250)).getpixel((int(px_ - (CX - 80) + 190), int(py_ - CY + 125)))
        circle(c, px_, py_, 34, fill=col[:3], stroke=TEXT, lw=3)
        circle(c, px_, py_, 3, fill=TEXT)
        rrect(c, CX + 160, CY - 40, 140, 80, 12, fill=col[:3], stroke=TEXT, lw=2)
        text(c, '#%02X%02X%02X' % col[:3], font(MONO, 18, 'Bold'), CX + 230, CY + 64, color=TEXT)
    else:
        photo(c, CX, CY, pw, ph, s, 1, stroke=GOLD)


def d_video(c, g, t, d, P):
    act = P['act']
    s = P['seed']
    if act in ('record', 'webcam'):
        window(c, CX - 260, SY + 10, 520, 300, 'screen' if act == 'record' else 'camera')
        if act == 'record':
            typed_lines(c, ['function launch() {', '  return "OpenFile"', '}'], CX - 240, SY + 80, t * 1.2, size=16)
            circle(c, CX + 190, SY + 240, 44, fill=SURF2, stroke=GOLD, lw=3)
            circle(c, CX + 190, SY + 230, 14, fill=hexrgb('#E9C9A0')); c.new_sub_path(); c.arc(CX + 190, SY + 268, 24, math.pi, 2 * math.pi)
            c.set_source_rgba(*rgbf(TEAL)); c.fill()
        else:
            photo(c, CX, SY + 170, 500, 260, s, 1, r=4)
            n = 3 - int(t - 0.6)
            if 0 < n <= 3 and t > 0.6:
                text(c, str(n), font(DISPLAY, 90, 'Bold'), CX, SY + 170, color=TEXT, alpha=1 - ((t - 0.6) % 1))
        on = int(t * 2) % 2 == 0
        circle(c, CX - 220, SY + 52, 7, fill=GOLD, alpha=1 if on else 0.3)
        text(c, f'REC  00:{int(max(0, t - 1)):02d}', font(MONO, 14, 'Bold'), CX - 205, SY + 52, color=TEXT, anchor='lm')
        return
    # timeline with filmstrip
    fx, fw = SX + 60, SW - 120
    sp = 0.15
    if act == 'speed':
        sp = 0.15 * (1 + 3 * ease_in_out((t - 1.0) / 1.5))
    filmstrip(c, fx, CY - 110, fw, 100, s, t * sp, 1, n=6)
    ty = CY + 40
    rrect(c, fx, ty, fw, 8, 4, fill=LINE)
    if act == 'trim':
        k = ease_in_out((t - 0.8) / 1.2)
        a_, b_ = lerp(0, 0.22, k), lerp(1, 0.7, k)
        c.save(); c.rectangle(fx, CY - 110, fw * a_, 100); c.rectangle(fx + fw * b_, CY - 110, fw * (1 - b_), 100)
        c.set_source_rgba(0, 0, 0, 0.6); c.fill(); c.restore()
        rrect(c, fx + fw * a_, CY - 114, fw * (b_ - a_), 108, 6, stroke=GOLD, lw=3)
        for xx in (a_, b_):
            rrect(c, fx + fw * xx - 6, CY - 114, 12, 108, 4, fill=GOLD)
        rrect(c, fx + fw * a_, ty, fw * (b_ - a_), 8, 4, fill=GOLD)
        text(c, f'00:{int(lerp(0, 12, k)):02d} to 00:{int(lerp(54, 38, k)):02d}', font(MONO, 18, 'Bold'), CX, ty + 50, color=TEXT)
    elif act == 'speed':
        mult = 1 + 3 * ease_in_out((t - 1.0) / 1.5)
        cx_, cy_ = CX, ty + 70
        arc(c, cx_, cy_, 50, math.pi, 2 * math.pi, LINE, 8)
        arc(c, cx_, cy_, 50, math.pi, math.pi + math.pi * (mult - 0.25) / 3.75, GOLD, 8)
        text(c, f'{mult:.2f}x', font(MONO, 20, 'Bold'), cx_, cy_ - 8, color=TEXT)
    elif act in ('extract', 'mute'):
        k = ease_in_out((t - 1.0) / 1.0)
        yy = lerp(ty, ty + 70, k) if act == 'extract' else ty + 40
        gain = 1.0 if act == 'extract' else 1 - 0.95 * k
        waveform(c, fx + 40, yy, fw - 80, 50, s, TEAL, 1, n=70, gain=gain)
        ic = 'Music' if act == 'extract' else ('VolumeX' if k > 0.5 else 'Volume2')
        draw_sprite(c, icon_sprite(ic, 30, GOLD), fx + 10, yy)
        if act == 'extract':
            badge(c, fx + fw - 40, yy + 46, 'MP3', GOLD, k, 13)
    elif act == 'upscale':
        k = ease_in_out((t - 0.8) / 1.4)
        labels = ['720p', '1080p', '1440p', '4K']
        i = min(3, int(k * 3.99))
        for j, lab in enumerate(labels):
            badge(c, CX - 180 + j * 120, ty + 60, lab, GOLD if j == i else SURF2, 1, 15, dark=j == i)
    elif act == 'gif':
        k = ease_out((t - 1.0) / 0.6)
        photo(c, CX, ty + 70, 150, 90, s + int(t * 6) % 3, k, stroke=GOLD)
        badge(c, CX + 120, ty + 70, 'GIF  1.2 MB', GOLD, k, 13)
    elif act == 'merge':
        k = ease_in_out((t - 0.8) / 1.2)
        for i in range(3):
            x = lerp(fx + i * (fw / 3) + i * 30 - 30, fx + i * (fw / 3), k)
            rrect(c, x, ty - 4, fw / 3 - 4, 16, 6, fill=P['cols'][i], alpha=0.9)
    else:
        play = (t / d) % 1
        rrect(c, fx, ty, fw * play, 8, 4, fill=GOLD)
        circle(c, fx + fw * play, ty + 4, 9, fill=TEXT)
    # playhead
    if act not in ('trim',):
        x = fx + fw * ((t * 0.18) % 1)
        line(c, x, CY - 118, x, ty + 14, GOLD, 2, 0.9)


def d_audio(c, g, t, d, P):
    act = P['act']
    s = P['seed']
    wx, ww = SX + 60, SW - 120
    if act == 'record':
        n = 60
        prog = clamp(t / (d * 0.8))
        waveform(c, wx, CY - 10, ww, 150, s, TEAL, 1, progress=prog, n=n, t=t, live=True)
        circle(c, CX, CY + 120, 22, fill=GOLD)
        circle(g, CX, CY + 120, 34 + 6 * math.sin(t * 6), fill=GLOW, alpha=0.8)
        draw_sprite(c, icon_sprite('Mic', 24, BLACK), CX, CY + 120)
        text(c, f'00:{int(t):02d}', font(MONO, 18, 'Bold'), CX + 70, CY + 120, color=TEXT, anchor='lm')
    elif act == 'transcribe':
        waveform(c, wx, CY - 80, ww, 90, s, TEAL, 1, n=70, play=clamp(t / (d - 1)))
        lines_ = ['00:01  Welcome back to the show.', '00:04  Today we talk about privacy', '00:07  and tools that run offline.']
        for i, ln in enumerate(lines_):
            text(c, typed(ln, t - 0.8 - i * 1.0, 24), font(MONO, 16, 'Medium'), wx + 40, CY + 30 + i * 32, color=TEXT if i < 2 else MUTED, anchor='lm')
        badge(c, wx + ww - 60, CY + 120, 'SRT', GOLD, ease_out((t - 3) / 0.4))
    elif act == 'tts':
        s_ = 'Hello, this is your text read aloud.'
        text(c, typed(s_, t - 0.4, 22), font(SANS, 24, 'Medium'), CX, CY - 80, color=TEXT)
        k = ease_out((t - 1.2) / 0.8)
        waveform(c, wx + 100, CY + 40, ww - 200, 100 * k, s, GOLD, 1, n=50, t=t, live=True)
    elif act == 'eq':
        bands = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']
        for i, b in enumerate(bands):
            x = CX - 270 + i * 60
            v = 0.5 + 0.35 * math.sin(t * 1.4 + i * 0.7) * ease_out((t - 0.5) / 0.8)
            line(c, x, CY - 110, x, CY + 90, LINE, 4)
            line(c, x, CY + 90, x, CY + 90 - 200 * v, P['cols'][i % 3], 4)
            rrect(c, x - 14, CY + 90 - 200 * v - 7, 28, 14, 4, fill=TEXT)
            text(c, b, font(MONO, 12, 'Medium'), x, CY + 112, color=MUTED)
    elif act == 'midi':
        rows = 12
        for r_ in range(rows):
            y = SY + 20 + r_ * 24
            black = r_ % 12 in (1, 3, 6, 8, 10)
            rrect(c, SX + 60, y, 50, 22, 3, fill=INK if black else PAPER)
        rng = np.random.default_rng(s)
        notes = [(rng.uniform(0, 12), int(rng.integers(0, rows)), rng.uniform(0.4, 1.4)) for _ in range(26)]
        ph = SX + 130 + 120
        for st, r_, ln in notes:
            x = SX + 130 + (st - t * 1.2) * 70 + 120
            if x + ln * 70 < SX + 120 or x > SX + SW:
                continue
            on = x <= ph <= x + ln * 70
            rrect(c, max(SX + 120, x), SY + 22 + r_ * 24, ln * 70, 18, 4, fill=GOLD if on else P['cols'][r_ % 3], alpha=1 if on else 0.75)
        line(c, ph, SY + 14, ph, SY + 14 + rows * 24 + 6, GOLD, 2)
    elif act == 'speed':
        k = ease_in_out((t - 0.9) / 1.2)
        waveform(c, wx + ww * 0.1 * k, CY - 30, ww * (1 - 0.2 * k), 120, s, TEAL, 1, n=64)
        text(c, f'{1 + 0.5 * k:.2f}x speed', font(MONO, 22, 'Bold'), CX - 120, CY + 100, color=GOLD)
        text(c, f'{"+" if k > 0.5 else ""}{int(round(3 * k)) if k > 0.5 else 0} semitones', font(MONO, 22, 'Bold'), CX + 120, CY + 100, color=TEXT)
    elif act == 'merge':
        k = ease_in_out((t - 0.9) / 1.2)
        waveform(c, lerp(wx - 40, wx, k), CY - 30, ww / 2, 90, s, TEAL, 1, n=32)
        waveform(c, lerp(wx + ww / 2 + 40, wx + ww / 2, k), CY - 30, ww / 2, 90, s + 1, GOLD, 1, n=32)
        badge(c, CX, CY + 90, 'one track', GOLD, ease_out((t - 2.2) / 0.4))
    elif act == 'convert':
        waveform(c, wx, CY - 40, ww, 120, s, TEAL, 1, n=64, play=clamp(t / (d - 1)))
        fm = ['MP3', 'WAV', 'OGG', 'AAC', 'FLAC', 'M4A']
        i = int(max(0, t - 0.8) / 0.9) % len(fm)
        for j, f_ in enumerate(fm):
            badge(c, CX - 225 + j * 90, CY + 100, f_, GOLD if j == i else SURF2, 1, 14, dark=j == i)
    else:  # editor
        k = ease_in_out((t - 0.8) / 1.2)
        a_, b_ = lerp(0, 0.15, k), lerp(1, 0.8, k)
        waveform(c, wx, CY - 20, ww, 160, s, TEAL, 1, n=80, dim_out=(a_, b_))
        rrect(c, wx + ww * a_, CY - 110, ww * (b_ - a_), 180, 8, stroke=GOLD, lw=2)
        # fade envelope
        c.move_to(wx + ww * a_, CY + 70); c.line_to(wx + ww * (a_ + 0.08), CY - 110)
        c.line_to(wx + ww * (b_ - 0.08), CY - 110); c.line_to(wx + ww * b_, CY + 70)
        c.set_source_rgba(*rgbf(GOLD, 0.9 * k)); c.set_line_width(2); c.stroke()
        text(c, 'fade in', font(SANS, 12, 'Medium'), wx + ww * a_ + 30, CY + 95, color=MUTED, alpha=k)
        text(c, 'fade out', font(SANS, 12, 'Medium'), wx + ww * b_ - 30, CY + 95, color=MUTED, alpha=k)


DEV_SNIPPETS = {
    'json-formatter': (['{', '  "name": "OpenFile",', '  "tools": 117,', '  "private": true,', '  "tags": ["pdf", "image"]', '}'], 'formatted'),
    'jwt-decoder': (['header  {"alg": "HS256"}', 'payload {"sub": "42",', '         "exp": 1798000000}', 'expires in 3 days'], 'decoded'),
    'hash-generator': (['input  "hello world"', 'MD5    5eb63bbbe01eeed0', 'SHA1   2aae6c35c94fcfb4', 'SHA256 b94d27b9934d3e08'], 'hashed'),
    'uuid-generator': (['0193f1c2-7a4e-7b1d-9c3e-2f4a', '0193f1c2-7a4f-71a0-8e11-9b2c', '0193f1c2-7a50-7d5e-a0c4-11de', '0193f1c2-7a51-7f02-b7a9-3c8f'], 'v7'),
    'url-encoder': (['in   name=Riya Sen&city=Kolkata', 'out  name=Riya%20Sen&city=Kolkata', '', 'name  Riya Sen', 'city  Kolkata'], 'encoded'),
    'base64': (['text   OpenFile is free', 'base64 T3BlbkZpbGUgaXMgZnJlZQ==', '', 'decode -> OpenFile is free'], 'base64'),
    'curl-to-code': (['curl -X POST api.dev/v1/files \\', '  -H "Auth: token"', '', 'await fetch("api.dev/v1/files", {', '  method: "POST" })'], 'JavaScript'),
    'timestamp-converter': (['1798000000', '-> Fri, 21 Dec 2026 09:46 UTC', '-> 15:16 IST', '-> 2 months from now'], 'epoch'),
    'cron-parser': (['*/15 9-17 * * 1-5', '', 'Every 15 minutes, 9:00 to 17:59,', 'Monday to Friday', 'next  Thu 09:15'], 'explained'),
    'yaml-json': (['name: OpenFile', 'private: true', 'tools: 117', '', '{"name": "OpenFile", "private": true}'], 'converted'),
    'sql-formatter': (['SELECT name, size', 'FROM files', 'WHERE size > 1024', 'ORDER BY size DESC;'], 'formatted'),
    'html-entities': (['<p>Fish & Chips</p>', '', '&lt;p&gt;Fish &amp; Chips&lt;/p&gt;'], 'escaped'),
    'number-base': (['dec  2026', 'hex  0x7EA', 'oct  0o3752', 'bin  0b11111101010'], 'converted'),
    'regex-tester': (['/(\\w+)@(\\w+)\\.com/g', '', 'riya@mail.com, dev@open.com', '2 matches, 4 groups'], 'matched'),
    'regex-builder': (['starts with  "INV-"', 'then digits  4 times', 'end of line', '', '/^INV-\\d{4}$/'], 'built'),
    'password-generator': (['k7#Qm2!vRz9&Lp4x', '', 'amber-river-candle-north'], 'strong'),
    'json-to-types': (['{"id": 7, "name": "Riya"}', '', 'interface User {', '  id: number', '  name: string', '}'], 'TypeScript'),
    'mock-data-generator': (['[{"name": "Riya Sen",', '  "email": "riya@mail.com",', '  "city": "Kolkata"},', ' {"name": "Arjun Das", ...}]'], 'JSON'),
}


def d_dev(c, g, t, d, P):
    slug = P['slug']
    if slug in ('qr-generator', 'qr-scanner'):
        rng = np.random.default_rng(P['seed'])
        n = 21
        cell = 11
        x0, y0 = CX - n * cell / 2 - (120 if slug == 'qr-generator' else 0), CY - n * cell / 2
        m = rng.random((n, n)) > 0.52
        for (fx, fy) in ((0, 0), (n - 7, 0), (0, n - 7)):
            m[fy:fy + 7, fx:fx + 7] = False
            for i in range(7):
                for j in range(7):
                    if i in (0, 6) or j in (0, 6) or (2 <= i <= 4 and 2 <= j <= 4):
                        m[fy + i, fx + j] = True
        rrect(c, x0 - 14, y0 - 14, n * cell + 28, n * cell + 28, 10, fill=PAPER)
        prog = clamp((t - 0.4) / 1.6) if slug == 'qr-generator' else 1
        for i in range(n):
            for j in range(n):
                if m[i, j] and (i + j) / (2 * n) <= prog:
                    c.rectangle(x0 + j * cell, y0 + i * cell, cell - 0.5, cell - 0.5)
        c.set_source_rgba(*rgbf(INK)); c.fill()
        if slug == 'qr-scanner':
            y = y0 + (n * cell) * (0.5 + 0.5 * math.sin(t * 2.4))
            line(c, x0 - 20, y, x0 + n * cell + 20, y, CYAN, 3)
            line(g, x0 - 20, y, x0 + n * cell + 20, y, CYAN, 14)
            for (cx_, cy_, sx_, sy_) in ((x0 - 24, y0 - 24, 1, 1), (x0 + n * cell + 24, y0 - 24, -1, 1), (x0 - 24, y0 + n * cell + 24, 1, -1), (x0 + n * cell + 24, y0 + n * cell + 24, -1, -1)):
                line(c, cx_, cy_, cx_ + 24 * sx_, cy_, GOLD, 4); line(c, cx_, cy_, cx_, cy_ + 24 * sy_, GOLD, 4)
            badge(c, CX, y0 + n * cell + 60, 'openfile-studio.vercel.app', GOLD, ease_out((t - 1.8) / 0.4), 13)
        else:
            for i, (lab, col) in enumerate([('Link', GOLD), ('Wi-Fi', TEAL), ('vCard', SKY)]):
                badge(c, CX + 150, CY - 60 + i * 50, lab, col, ease_out((t - 0.3 - i * 0.2) / 0.4), 15, anchor='l')
        return
    if slug == 'barcode-generator':
        rng = np.random.default_rng(P['seed'])
        x = CX - 180
        prog = clamp((t - 0.4) / 1.5)
        rrect(c, CX - 210, CY - 100, 420, 200, 10, fill=PAPER)
        widths = rng.integers(1, 5, 70)
        xx = x
        for i, w_ in enumerate(widths):
            if xx > x + 360 * prog:
                break
            if i % 2 == 0:
                c.rectangle(xx, CY - 70, w_ * 1.3, 120)
            xx += w_ * 1.3 + 1
        c.set_source_rgba(*rgbf(INK)); c.fill()
        text(c, typed('OPENFILE-2026', t - 1.2, 18), font(MONO, 18, 'Bold'), CX, CY + 72, color=INK)
        return
    if slug == 'erd-diagram':
        tables = [('users', ['id', 'email', 'name'], CX - 280, CY - 100), ('files', ['id', 'user_id', 'size'], CX - 40, CY - 40), ('tools', ['slug', 'category'], CX + 200, CY - 110)]
        for i, (nm, cols, x, y) in enumerate(tables):
            k = ease_out_back((t - 0.3 - i * 0.3) / 0.5)
            if k <= 0:
                continue
            rrect(c, x, y, 160, 34 + 26 * len(cols), 8, fill=SURF, stroke=P['cols'][i], lw=2, alpha=clamp(k))
            rrect(c, x, y, 160, 30, 8, fill=P['cols'][i], alpha=0.25 * clamp(k))
            text(c, nm, font(MONO, 15, 'Bold'), x + 12, y + 15, alpha=clamp(k), anchor='lm')
            for j, col in enumerate(cols):
                text(c, col, font(MONO, 13), x + 12, y + 46 + j * 26, color=MUTED, alpha=clamp(k), anchor='lm')
        k = ease_in_out((t - 1.4) / 0.8)
        if k > 0:
            c.move_to(CX - 120, CY - 20); c.curve_to(CX - 80, CY - 20, CX - 80, CY + 20, CX - 40 * k - 40 * (1 - k), CY + 18)
            c.set_source_rgba(*rgbf(GOLD, k)); c.set_line_width(2); c.stroke()
        badge(c, CX, SY + SH - 10, 'export SQL, Prisma, Drizzle', GOLD, ease_out((t - 2.2) / 0.4), 13)
        return
    if slug in DEV_SNIPPETS:
        lines_, tag = DEV_SNIPPETS[slug]
    else:
        words, cur, wrapped = P.get('desc', '').split(), '', []
        for w_ in words:
            if len(cur) + len(w_) + 1 > 44:
                wrapped.append(cur); cur = w_
            else:
                cur = (cur + ' ' + w_).strip()
        if cur:
            wrapped.append(cur)
        lines_ = [f'$ openfile {slug}', ''] + ['# ' + w_ for w_ in wrapped[:3]] + ['', 'done on this device']
        tag = 'local'
    wx, wy, ww, wh = CX - 300, SY + 4, 600, 300
    ox, oy = window(c, wx, wy, ww, wh, P['slug'] + ('.json' if 'json' in slug else ''))
    typed_lines(c, lines_, ox + 8, oy + 14, t - 0.4, cps=34, lh=32, size=18)
    if slug == 'password-generator':
        k = ease_out((t - 1.0) / 1.2)
        rrect(c, ox + 8, oy + 130, 400, 10, 5, fill=LINE)
        rrect(c, ox + 8, oy + 130, 400 * k, 10, 5, fill=EMERALD)
        text(c, 'Very strong', font(SANS, 15, 'Bold'), ox + 420, oy + 135, color=EMERALD, anchor='lm', alpha=k)
    done = sum(len(l) + 4 for l in lines_) / 34 + 0.6
    badge(c, wx + ww - 70, wy + wh - 26, tag, GOLD, ease_out((t - done) / 0.4), 13)


def d_text(c, g, t, d, P):
    slug = P['slug']
    if slug == 'diff-checker':
        L = ['const size = 42', 'const name = "doc"', 'export default size', 'console.log(size)']
        R = ['const size = 64', 'const name = "doc"', 'export { size, name }', 'console.log(size)']
        for side, (lines_, xx) in enumerate(((L, CX - 300), (R, CX + 10))):
            ox, oy = window(c, xx, SY + 20, 290, 240, ['before', 'after'][side])
            for i, ln in enumerate(lines_):
                diff = i in (0, 2)
                k = ease_out((t - 0.8 - i * 0.2) / 0.4)
                if diff:
                    rrect(c, xx + 4, oy + 8 + i * 40 - 14, 282 * k, 28, 4, fill=GOLD if side == 0 else EMERALD, alpha=0.22)
                    text(c, '-' if side == 0 else '+', font(MONO, 14, 'Bold'), xx + 12, oy + 8 + i * 40, color=GOLD if side == 0 else EMERALD, alpha=k)
                code_line(c, ln, ox + 14, oy + 8 + i * 40, size=13)
        return
    if slug == 'word-counter':
        para = 'Plain words win. Short lines help readers move fast and remember more.'
        ox, oy = window(c, CX - 320, SY + 20, 360, 250, 'draft.txt')
        shown = typed(para, t - 0.3, 26)
        words = shown.split(' ')
        ln, y = '', oy + 10
        for w_ in words:
            if font(SANS, 17).getlength(ln + ' ' + w_) > 320:
                text(c, ln, font(SANS, 17, 'Medium'), ox + 4, y, anchor='lm'); y += 28; ln = w_
            else:
                ln = (ln + ' ' + w_).strip()
        text(c, ln, font(SANS, 17, 'Medium'), ox + 4, y, anchor='lm')
        stats = [('words', len([w_ for w_ in words if w_])), ('characters', len(shown)), ('sentences', shown.count('.')), ('read time', '1 min')]
        for i, (lab, v) in enumerate(stats):
            x, y = CX + 90 + (i % 2) * 140, SY + 60 + (i // 2) * 110
            rrect(c, x, y, 128, 92, 12, fill=SURF, stroke=mix(LINE, P['cols'][i % 3], 0.5), lw=1.5)
            text(c, str(v), font(DISPLAY, 30, 'Bold'), x + 64, y + 38, color=P['cols'][i % 3])
            text(c, lab, font(SANS, 13, 'Medium'), x + 64, y + 70, color=MUTED)
        return
    if slug == 'case-converter':
        forms = ['open file studio', 'OPEN FILE STUDIO', 'Open File Studio', 'openFileStudio', 'open_file_studio', 'open-file-studio']
        i = int(max(0, t - 0.6) / 0.9) % len(forms)
        lt = (max(0, t - 0.6)) % 0.9
        k = ease_out(lt / 0.3)
        text(c, forms[i], font(MONO, 40, 'Bold'), CX, CY - 30 + (1 - k) * 16, color=TEXT, alpha=k)
        x = CX - 3 * 110 + 55
        for j, lab in enumerate(['lower', 'UPPER', 'Title', 'camel', 'snake', 'kebab']):
            badge(c, x + j * 110, CY + 70, lab, GOLD if j == i else SURF2, 1, 14, dark=j == i)
        return
    if slug == 'date-calculator':
        x0, y0 = CX - 260, SY + 20
        ox, oy = window(c, x0, y0, 300, 280, 'October 2026')
        for i in range(31):
            col, row = (i + 3) % 7, (i + 3) // 7
            x, y = ox + 8 + col * 38, oy + 10 + row * 38
            inr = 5 <= i <= 5 + int(clamp((t - 0.8) / 1.5) * 16)
            if inr:
                rrect(c, x - 2, y - 14, 34, 28, 6, fill=GOLD, alpha=0.85 if i in (5, 21) else 0.25)
            text(c, str(i + 1), font(SANS, 13, 'Medium'), x + 15, y, color=BLACK if i in (5, 21) and inr else TEXT)
        k = clamp((t - 0.8) / 1.5)
        text(c, f'{int(16 * k)} days', font(DISPLAY, 46, 'Bold'), CX + 180, CY - 30, gradient=GOLD_GRAD)
        text(c, f'{int(12 * k)} business days', font(SANS, 18, 'Medium'), CX + 180, CY + 20, color=MUTED)
        return
    if slug == 'unit-converter':
        rows = [('Length', 5, 'km', 3.107, 'mi'), ('Weight', 70, 'kg', 154.3, 'lb'), ('Temp', 37, '°C', 98.6, '°F')]
        for i, (lab, a_, ua, b_, ub) in enumerate(rows):
            y = SY + 60 + i * 95
            k = ease_out((t - 0.5 - i * 0.4) / 0.8)
            rrect(c, CX - 320, y - 34, 640, 70, 14, fill=SURF, stroke=LINE, lw=1, alpha=clamp(k * 2))
            text(c, lab, font(SANS, 15, 'Medium'), CX - 296, y, color=MUTED, anchor='lm', alpha=clamp(k * 2))
            text(c, f'{a_} {ua}', font(MONO, 24, 'Bold'), CX - 110, y, alpha=clamp(k * 2))
            arrow(c, CX - 20, y, CX + 50, P['cols'][i % 3], clamp(k * 2), t)
            text(c, f'{b_ * k:.1f} {ub}', font(MONO, 24, 'Bold'), CX + 170, y, color=P['cols'][i % 3], alpha=clamp(k * 2))
        return
    if slug == 'text-cleaner':
        lines_ = ['banana', '  apple ', 'cherry', 'apple', 'banana', 'date']
        k = ease_in_out((t - 1.0) / 1.2)
        res = ['apple', 'banana', 'cherry', 'date']
        ox, oy = window(c, CX - 320, SY + 20, 260, 260, 'input')
        for i, ln in enumerate(lines_):
            dup = i in (3, 4)
            text(c, ln, font(MONO, 16, 'Medium'), ox + 6, oy + 10 + i * 34, color=MUTED if dup else TEXT, anchor='lm', alpha=1 - 0.6 * k if dup else 1)
            if dup:
                line(c, ox + 4, oy + 10 + i * 34, ox + 4 + 80 * k, oy + 10 + i * 34, GOLD, 2)
        arrow(c, CX - 40, CY, CX + 40, GOLD, 1, t)
        ox2, oy2 = window(c, CX + 60, SY + 20, 260, 260, 'clean')
        for i, ln in enumerate(res):
            kk = ease_out((t - 1.8 - i * 0.2) / 0.4)
            text(c, ln, font(MONO, 16, 'Medium'), ox2 + 6, oy2 + 10 + i * 34, color=EMERALD, anchor='lm', alpha=kk)
        return
    if slug in ('markdown-editor', 'lorem-ipsum'):
        if slug == 'lorem-ipsum':
            ox, oy = window(c, CX - 300, SY + 10, 600, 300, 'placeholder')
            para = ('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore '
                    'et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.')
            shown = typed(para, t - 0.3, 60)
            ln, y = '', oy + 12
            for w_ in shown.split(' '):
                if font(SANS, 18).getlength(ln + ' ' + w_) > 560:
                    text(c, ln, font(SANS, 18, 'Regular'), ox + 4, y, color=TEXT, anchor='lm'); y += 32; ln = w_
                else:
                    ln = (ln + ' ' + w_).strip()
            text(c, ln, font(SANS, 18, 'Regular'), ox + 4, y, color=TEXT, anchor='lm')
            return
        ox, oy = window(c, CX - 320, SY + 10, 310, 300, 'note.md')
        src = ['# Launch notes', '', '- **Free** for all', '- Works offline', '', '> Plain words win.']
        typed_lines(c, src, ox + 4, oy + 10, t - 0.3, cps=30, lh=32, size=15)
        ox2, oy2 = window(c, CX + 10, SY + 10, 310, 300, 'preview')
        k = clamp((t - 0.3) * 30 / 70)
        if k > 0.15:
            text(c, 'Launch notes', font(DISPLAY, 26, 'Bold'), ox2 + 4, oy2 + 14, anchor='lm')
        if k > 0.45:
            text(c, '•  Free for all', font(SANS, 16, 'Medium'), ox2 + 4, oy2 + 74, anchor='lm')
            text(c, '•  Works offline', font(SANS, 16, 'Medium'), ox2 + 4, oy2 + 106, anchor='lm')
        if k > 0.8:
            line(c, ox2 + 4, oy2 + 154, ox2 + 4, oy2 + 182, GOLD, 3)
            text(c, 'Plain words win.', font(SANS, 16, 'Medium'), ox2 + 16, oy2 + 168, color=MUTED, anchor='lm')
        return
    d_dev(c, g, t, d, P)


def d_design(c, g, t, d, P):
    slug = P['slug']
    s = P['seed']
    if slug == 'color-palette':
        photo(c, CX - 170, CY, 300, 210, s, 1)
        im = photo_img(s)
        cols = [im.getpixel((int(im.width * fx), int(im.height * fy)))[:3] for fx, fy in ((0.2, 0.15), (0.5, 0.5), (0.8, 0.7), (0.3, 0.85), (0.5, 0.95))]
        for i, col in enumerate(cols):
            k = ease_out_back((t - 0.8 - i * 0.2) / 0.5)
            if k <= 0:
                continue
            y = SY + 30 + i * 58
            rrect(c, CX + 40, y, 60, 46, 10, fill=col, alpha=clamp(k))
            text(c, '#%02X%02X%02X' % col, font(MONO, 17, 'Bold'), CX + 116, y + 23, alpha=clamp(k), anchor='lm')
        return
    if slug == 'color-converter':
        col = mix(GOLD, TEAL, 0.5 + 0.5 * math.sin(t * 0.8)) if t > 1 else GOLD
        rrect(c, CX - 300, SY + 30, 220, 220, 24, fill=col)
        text(c, 'Aa', font(DISPLAY, 70, 'Bold'), CX - 190, SY + 140, color=BLACK)
        r, g_, b = col
        rows = [('HEX', '#%02X%02X%02X' % col), ('RGB', f'{r}, {g_}, {b}'), ('HSL', 'calc'), ('OKLCH', '0.79 0.15 75')]
        import colorsys
        hh, ll, ss = colorsys.rgb_to_hls(r / 255, g_ / 255, b / 255)
        rows[2] = ('HSL', f'{int(hh * 360)} {int(ss * 100)}% {int(ll * 100)}%')
        for i, (k_, v) in enumerate(rows):
            y = SY + 50 + i * 48
            text(c, k_, font(MONO, 14, 'Bold'), CX - 40, y, color=MUTED, anchor='lm')
            text(c, v, font(MONO, 20, 'Bold'), CX + 50, y, anchor='lm')
        badge(c, CX + 20, SY + 270, 'AA  contrast 9.1 : 1', EMERALD, ease_out((t - 1.4) / 0.4), 14, anchor='l')
        return
    if slug == 'gradient-generator':
        k = t * 0.5
        a_ = 0.15 + 0.1 * math.sin(k)
        b_ = 0.85 - 0.1 * math.sin(k * 1.3)
        linear_fill(c, CX - 320, 0, CX + 320, 0, [(0, GOLD), (a_ + 0.3, TEAL), (b_, CYAN)])
        rrect_path(c, CX - 320, SY + 20, 640, 190, 20); c.fill()
        for p_, col in ((0, GOLD), (a_ + 0.3, TEAL), (b_, CYAN)):
            x = CX - 320 + 640 * p_
            circle(c, x, SY + 240, 12, fill=col, stroke=TEXT, lw=3)
        text(c, f'linear-gradient(90deg, #F5A524, #14B8A6 {int((a_ + 0.3) * 100)}%, #22D3EE)', font(MONO, 14, 'Medium'), CX, SY + 290, color=MUTED)
        return
    if slug == 'css-studio':
        k = 0.5 + 0.5 * math.sin(max(0, t - 0.6) * 1.4)
        blur = 10 + 40 * k
        for i in range(6, 0, -1):
            rrect(c, CX - 110 + i * k * 3, SY + 60 + i * k * 4, 220, 180, 24, fill=(0, 0, 0), alpha=0.06 * (blur / 50))
        rrect(c, CX - 110, SY + 50, 220, 180, 24, fill=SURF2, stroke=mix(LINE, GOLD, k), lw=1.5)
        rrect(g, CX - 110, SY + 50, 220, 180, 24, stroke=GOLD, lw=8, alpha=0.4 * k)
        text(c, f'box-shadow: 0 {int(8 + 16 * k)}px {int(blur)}px', font(MONO, 15, 'Medium'), CX, SY + 280, color=MUTED)
        return
    if slug == 'favicon-generator':
        sizes = [16, 32, 48, 96, 180]
        x = CX - 270
        for i, sz in enumerate(sizes):
            k = ease_out_back((t - 0.4 - i * 0.2) / 0.5)
            if k <= 0:
                x += max(sz, 40) + 50; continue
            box = sz * 0.8 + 10
            rrect(c, x, CY - box / 2, box, box, box * 0.22, fill=GOLD, alpha=clamp(k))
            draw_sprite(c, icon_sprite('FileText', max(10, int(box * 0.6)), BLACK, 2.4), x + box / 2, CY, clamp(k))
            text(c, f'{sz}px', font(MONO, 13, 'Bold'), x + box / 2, CY + 100, color=MUTED, alpha=clamp(k))
            x += box + 50
        return
    if slug == 'svg-optimizer':
        k = ease_in_out((t - 0.8) / 1.4)
        ox, oy = window(c, CX - 320, SY + 10, 300, 280, 'icon.svg')
        lines_ = ['<svg viewBox="0 0 24 24">', '  <!-- editor junk -->', '  <path d="M12.000 2.000', '    L22.000 22.000"/>', '</svg>']
        for i, ln in enumerate(lines_):
            code_line(c, ln, ox, oy + 10 + i * 30, 1 - (0.7 * k if i == 1 else 0), size=12)
        text(c, size_str(lerp(14.2, 3.1, k)), font(DISPLAY, 46, 'Bold'), CX + 160, CY - 30, gradient=GOLD_GRAD)
        text(c, f'-{int(78 * k)}%', font(MONO, 22, 'Bold'), CX + 160, CY + 30, color=EMERALD)
        return
    if slug == 'sketch-board':
        k = clamp((t - 0.4) / 2.0)
        pts = [(CX - 250 + i * 6, CY + 40 * math.sin(i * 0.12)) for i in range(int(70 * k))]
        if len(pts) > 1:
            c.move_to(*pts[0])
            for p in pts[1:]:
                c.line_to(*p)
            c.set_source_rgba(*rgbf(GOLD)); c.set_line_width(4); c.set_line_cap(cairo.LINE_CAP_ROUND); c.stroke()
        kk = ease_out_back((t - 1.0) / 0.5)
        rrect(c, CX + 120, CY - 120, 150, 120, 6, fill=hexrgb('#F7D774'), alpha=clamp(kk))
        text(c, 'ship it', font(SANS, 20, 'Bold'), CX + 195, CY - 60, color=INK, alpha=clamp(kk))
        k3 = ease_out((t - 1.6) / 0.5)
        rrect(c, CX - 80, CY + 60, 160, 70, 12, stroke=TEAL, lw=3, alpha=k3)
        arrow(c, CX + 85, CY + 95, CX + 180, SKY, k3, t)
        return
    if slug == 'placeholder-image':
        k = ease_in_out((t - 0.6) / 1.4)
        w_, h_ = lerp(200, 480, k), lerp(150, 270, k)
        rrect(c, CX - w_ / 2, CY - h_ / 2, w_, h_, 8, fill=SURF2, stroke=LINE, lw=2)
        line(c, CX - w_ / 2, CY - h_ / 2, CX + w_ / 2, CY + h_ / 2, LINE, 1.5)
        line(c, CX - w_ / 2, CY + h_ / 2, CX + w_ / 2, CY - h_ / 2, LINE, 1.5)
        text(c, f'{int(lerp(400, 1200, k))} x {int(lerp(300, 675, k))}', font(MONO, 26, 'Bold'), CX, CY, color=GOLD)
        return
    # generic layers
    for i in range(4):
        k = ease_out((t - 0.4 - i * 0.2) / 0.6)
        c.save(); c.translate(CX, CY + 60 - i * 40 * k); c.scale(1, 0.5); c.rotate(math.pi / 4)
        rrect(c, -110, -110, 220, 220, 20, fill=P['cols'][i % 3], alpha=0.35 * k, stroke=P['cols'][i % 3], lw=2)
        c.restore()


def d_extra(c, g, t, d, P):
    """Templates for the newer categories: data, ai, 3d, archive, ebook, font, cad, subtitle."""
    cat = P['cat']
    s = P['seed']
    cols = P['cols']
    if cat == '3d':
        ang = t * 0.9
        pts = [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1), (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]
        PP = []
        for x, y, z in pts:
            x, z = x * math.cos(ang) - z * math.sin(ang), x * math.sin(ang) + z * math.cos(ang)
            b = 0.5
            y, z = y * math.cos(b) - z * math.sin(b), y * math.sin(b) + z * math.cos(b)
            f = 4 / (4 + z)
            PP.append((CX - 120 + x * 90 * f, CY + y * 90 * f))
        for e0, e1 in [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)]:
            line(c, *PP[e0], *PP[e1], cols[1] if cols[1] != GOLD else CYAN, 2.5)
            line(g, *PP[e0], *PP[e1], CYAN, 8, 0.6)
        for p in PP:
            circle(c, *p, 4, fill=TEXT)
        for i, f_ in enumerate(['GLB', 'OBJ', 'STL']):
            badge(c, CX + 170, CY - 70 + i * 60, f_, GOLD if int(t) % 3 == i else SURF2, ease_out((t - 0.3 - i * 0.2) / 0.4), 15, dark=int(t) % 3 == i, anchor='l')
        return
    if cat == 'archive':
        k = ease_in_out((t - 0.6) / 1.6)
        rrect(c, CX - 90, CY - 20, 180, 130, 14, fill=SURF, stroke=GOLD, lw=2.5)
        rrect(c, CX - 100, CY - 50, 200, 40, 10, fill=mix(SURF, GOLD, 0.35), stroke=GOLD, lw=2.5)
        for i in range(6):
            ph = clamp(k * 1.6 - i * 0.12)
            sx_ = CX + (i - 2.5) * 130
            x, y = lerp(sx_, CX, ease_in_out(ph)), lerp(CY - 120, CY + 10, ease_in_out(ph))
            page(c, x, y, 54, 70, 1 - 0.9 * ease_in_out(clamp((ph - 0.8) / 0.2)), cols[i % 3], seed=i, lines=3, scale=1 - 0.4 * ph)
        text(c, 'ZIP', font(DISPLAY, 30, 'Bold'), CX, CY + 50, color=GOLD)
        badge(c, CX, CY + 140, '6 files packed', GOLD, ease_out((t - 2.2) / 0.4))
        return
    if cat == 'font':
        glyphs = 'Aa Bb Gg Qq 01'
        text(c, 'Aa', font(DISPLAY, 150, 'Bold'), CX - 170, CY - 10, gradient=GOLD_GRAD)
        for i, w_ in enumerate(['Light', 'Regular', 'Medium', 'Bold']):
            k = ease_out((t - 0.4 - i * 0.25) / 0.4)
            text(c, 'The quick brown fox', font(SANS, 26, w_), CX + 20, CY - 90 + i * 52, alpha=k, anchor='lm')
        badge(c, CX - 170, CY + 110, 'TTF  OTF  WOFF2', GOLD, ease_out((t - 1.6) / 0.4), 13)
        return
    if cat == 'ebook':
        k = (t * 0.6) % 1
        c.save(); c.translate(CX, CY)
        rrect(c, -200, -120, 200, 240, 6, fill=PAPER); rrect(c, 0, -120, 200, 240, 6, fill=PAPER)
        for i in range(7):
            rrect(c, -180, -90 + i * 28, 150 - (i * 17) % 40, 6, 3, fill=PAPER_LINE)
            rrect(c, 20, -90 + i * 28, 150 - (i * 23) % 40, 6, 3, fill=PAPER_LINE)
        w_ = 200 * math.cos(k * math.pi)
        rrect(c, min(0, w_), -120, abs(w_), 240, 6, fill=mix(PAPER, PAPER_LINE, 0.4 + 0.4 * abs(math.sin(k * math.pi))))
        line(c, 0, -120, 0, 120, PAPER_LINE, 2)
        c.restore()
        badge(c, CX, CY + 150, 'EPUB to PDF', GOLD, ease_out((t - 0.6) / 0.4), 13)
        return
    if cat == 'subtitle':
        filmstrip(c, SX + 80, CY - 120, SW - 160, 120, s, t * 0.2, 1, n=5)
        cues = [('00:00:01,200', 'Welcome back.'), ('00:00:03,800', 'Let us get started.'), ('00:00:06,100', 'Everything stays on your device.')]
        i = min(2, int(t / 1.4))
        rrect(c, CX - 220, CY + 20, 440, 44, 8, fill=(0, 0, 0), alpha=0.7)
        text(c, cues[i][1], font(SANS, 20, 'SemiBold'), CX, CY + 42)
        text(c, f'{cues[i][0]}  -->  SRT  VTT  ASS', font(MONO, 14, 'Medium'), CX, CY + 100, color=MUTED)
        return
    if cat == 'cad':
        c.set_source_rgba(*rgbf(hexrgb('#0A2235'))); rrect_path(c, CX - 300, SY + 10, 600, 300, 10); c.fill()
        for i in range(0, 600, 30):
            line(c, CX - 300 + i, SY + 10, CX - 300 + i, SY + 310, SKY, 1, 0.12)
        for j in range(0, 300, 30):
            line(c, CX - 300, SY + 10 + j, CX + 300, SY + 10 + j, SKY, 1, 0.12)
        k = clamp((t - 0.3) / 1.8)
        segs = [(-200, 100, -200, -80), (-200, -80, 60, -80), (60, -80, 60, 100), (60, 100, -200, 100), (60, 10, 200, 10), (200, 10, 200, 100)]
        for n_, (x0, y0, x1, y1) in enumerate(segs):
            kk = clamp(k * len(segs) - n_)
            if kk > 0:
                line(c, CX + x0, CY + y0, CX + lerp(x0, x1, kk), CY + lerp(y0, y1, kk), SKY, 2.5)
        text(c, '4200 mm', font(MONO, 14, 'Bold'), CX - 70, CY - 100, color=GOLD, alpha=ease_out((t - 2) / 0.4))
        return
    if cat == 'ai':
        nodes = [[(CX - 220, CY - 80 + i * 80) for i in range(3)], [(CX - 40, CY - 120 + i * 80) for i in range(4)], [(CX + 140, CY - 40 + i * 80) for i in range(2)]]
        for a_, b_ in ((0, 1), (1, 2)):
            for p in nodes[a_]:
                for q in nodes[b_]:
                    ph = (t * 0.8 + p[1] / 300) % 1
                    line(c, *p, *q, LINE, 1.5)
                    circle(c, lerp(p[0], q[0], ph), lerp(p[1], q[1], ph), 2.5, fill=GOLD, alpha=0.8)
        for li, layer in enumerate(nodes):
            for p in layer:
                circle(c, *p, 14, fill=SURF, stroke=[TEAL, GOLD, CYAN][li], lw=3)
                circle(g, *p, 18, fill=[TEAL, GOLD, CYAN][li], alpha=0.5)
        draw_sprite(c, icon_sprite('Sparkles', 46, GOLD), CX + 260, CY, 1, rot=math.sin(t) * 0.1)
        badge(c, CX + 260, CY + 60, 'on-device', GOLD, ease_out((t - 0.8) / 0.4), 13)
        return
    # data (and anything unknown): animated bar chart + table
    vals = wave_vals(s, 8)
    for i, v in enumerate(vals):
        k = ease_out((t - 0.3 - i * 0.08) / 0.6)
        hh = 200 * v * k
        rrect(c, CX - 300 + i * 46, CY + 110 - hh, 32, hh, 6, fill=cols[i % 3])
    window(c, CX + 80, SY + 20, 240, 260, 'data.csv')
    for r_ in range(6):
        for cc in range(3):
            k = ease_out((t - 0.6 - r_ * 0.12) / 0.4)
            rrect(c, CX + 96 + cc * 74, SY + 70 + r_ * 34, 64, 22, 4, fill=mix(SURF2, cols[cc], 0.35 if r_ == 0 else 0.12), alpha=k)


# ----------------------------------------------------------------------------- newer categories (2026-10)
ORANGE_ = hexrgb('#FB923C')
LIME_ = hexrgb('#A3E635')
NEW_AI_VISION = ('image-captioner', 'object-detector', 'depth-map', 'image-segmenter', 'image-tagger', 'similar-photo-finder')
NEW_AI_TEXT = ('sentiment-analyzer', 'text-classifier', 'entity-extractor', 'semantic-file-search')


def _track(seed, n=40, w=520, h=200):
    """A smooth pseudo GPS track inside a w x h box, seeded by the slug."""
    rng = np.random.default_rng(seed)
    ang = rng.uniform(0, math.pi * 2)
    x, y, pts = 0.0, 0.0, []
    for i in range(n):
        ang += rng.normal(0, 0.35)
        x += math.cos(ang); y += math.sin(ang)
        pts.append((x, y))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    sx = w / max(1e-6, max(xs) - min(xs)); sy = h / max(1e-6, max(ys) - min(ys))
    return [((p[0] - min(xs)) * sx - w / 2, (p[1] - min(ys)) * sy - h / 2) for p in pts]


def _poly(c, pts, color, lw, alpha=1.0, upto=1.0):
    n = max(2, int(len(pts) * clamp(upto)))
    c.move_to(*pts[0])
    for p in pts[1:n]:
        c.line_to(*p)
    c.set_source_rgba(*rgbf(color, alpha)); c.set_line_width(lw); c.set_line_cap(cairo.LINE_CAP_ROUND); c.set_line_join(cairo.LINE_JOIN_ROUND); c.stroke()
    return pts[n - 1]


def _grid(c, x, y, w, h, step=28, color=SKY, a=0.10):
    for i in range(0, int(w) + 1, step):
        line(c, x + i, y, x + i, y + h, color, 1, a)
    for j in range(0, int(h) + 1, step):
        line(c, x, y + j, x + w, y + j, color, 1, a)


def _sheet(c, x, y, cols, rows, cw, rh, tint, t0, t, hl=None, title=None):
    if title:
        text(c, title, font(MONO, 13, 'Bold'), x, y - 16, color=MUTED, anchor='lm', alpha=ease_out((t - t0) / 0.4))
    for r_ in range(rows):
        for cc in range(cols):
            k = ease_out((t - t0 - r_ * 0.06 - cc * 0.03) / 0.35)
            fill = mix(SURF2, tint, 0.45 if r_ == 0 else 0.12)
            if hl and (r_, cc) in hl:
                fill = mix(SURF2, hl[(r_, cc)], 0.75)
            rrect(c, x + cc * cw, y + r_ * rh, cw - 4, rh - 4, 3, fill=fill, alpha=k)


def d_new(c, g, t, d, P):
    """Templates for privacy, geo, office, science, creator and the newer on-device AI tools."""
    cat, slug, s, cols = P['cat'], P['slug'], P['seed'], P['cols']
    mono, sans = font(MONO, 15, 'Medium'), font(SANS, 18, 'SemiBold')
    # ------------------------------------------------------------ privacy
    if cat == 'privacy':
        if slug in ('pii-redactor', 'hidden-character-detector'):
            page(c, CX - 120, CY, 260, 300, 1, GOLD, lines=0, seed=s)
            rows = ['Name  Jane Rivera', 'Email jane@mail.com', 'Phone 555 0142', 'Card  4111 ... 1111', 'Notes all good']
            for i, r_ in enumerate(rows):
                y = CY - 105 + i * 46
                text(c, r_, font(MONO, 15, 'Medium'), CX - 225, y, color=INK, anchor='lm')
                k = ease_in_out((t - 0.8 - i * 0.35) / 0.4)
                if i in (1, 2, 3) and k > 0:
                    w_ = 150 * k
                    rrect(c, CX - 165, y - 12, w_, 24, 4, fill=(0, 0, 0)) if slug == 'pii-redactor' else rrect(c, CX - 165, y - 12, w_, 24, 4, fill=GOLD, alpha=0.45)
            lab = ['3 found', 'redacted'] if slug == 'pii-redactor' else ['3 hidden', 'cleaned']
            badge(c, CX + 200, CY - 30, lab[0], GOLD, ease_out((t - 2.2) / 0.4))
            badge(c, CX + 200, CY + 30, lab[1], EMERALD, ease_out((t - 2.8) / 0.4))
            return
        if slug in ('checksum-verifier', 'entropy-analyzer'):
            fmt_card(c, CX - 260, CY, 'FILE', GOLD, 1, seed=s)
            if slug == 'checksum-verifier':
                hx = '9f2c 41e7 b06a 3d58 c1f0 77a2'
                n = int(len(hx) * clamp((t - 0.6) / 1.6))
                rrect(c, CX - 130, CY - 60, 420, 50, 10, fill=SURF, stroke=LINE)
                text(c, 'SHA-256  ' + hx[:n], font(MONO, 17, 'Bold'), CX - 112, CY - 35, color=CYAN, anchor='lm')
                rrect(c, CX - 130, CY + 10, 420, 50, 10, fill=SURF, stroke=LINE, alpha=ease_out((t - 2.2) / 0.4))
                text(c, 'expected ' + hx, font(MONO, 17, 'Medium'), CX - 112, CY + 35, color=MUTED, anchor='lm', alpha=ease_out((t - 2.2) / 0.4))
                badge(c, CX + 80, CY + 110, 'match', EMERALD, ease_out((t - 3.0) / 0.4))
            else:
                vals = wave_vals(s, 24)
                for i, v in enumerate(vals):
                    k = ease_out((t - 0.4 - i * 0.04) / 0.5)
                    hh = 170 * v * k
                    col = EMERALD if v < 0.5 else GOLD if v < 0.8 else ORANGE_
                    rrect(c, CX - 140 + i * 17, CY + 90 - hh, 12, hh, 3, fill=col)
                text(c, 'entropy per block', font(MONO, 14, 'Bold'), CX + 60, CY + 120, color=MUTED, alpha=ease_out((t - 1) / 0.4))
            return
        # metadata-scrubber, steganography, zip-encrypt, self-decrypting-file
        lock = slug in ('zip-encrypt', 'self-decrypting-file')
        if slug == 'steganography':
            photo(c, CX - 140, CY, 300, 210, s, stroke=LINE)
            msg = 'meet at noon'
            n = int(len(msg) * clamp((t - 0.8) / 1.4))
            for i in range(n):
                k = ease_in_out(clamp((t - 0.8 - i * 0.12) / 0.6))
                x = lerp(CX + 210, CX - 140 + (i - 6) * 18, k); y = lerp(CY - 60, CY + (i % 3 - 1) * 30, k)
                text(c, msg[i], font(MONO, 22, 'Bold'), x, y, color=GOLD, alpha=1 - 0.7 * k)
            badge(c, CX + 220, CY + 90, 'hidden in pixels', TEAL, ease_out((t - 2.6) / 0.4), 14, dark=True)
            return
        fmt_card(c, CX - 230, CY, 'JPG' if not lock else 'FILE', GOLD, 1, seed=s)
        if lock:
            k = ease_out_back((t - 0.6) / 0.6)
            circle(c, CX + 40, CY, 70, fill=SURF, stroke=GOLD, lw=3, alpha=clamp(k))
            circle(g, CX + 40, CY, 76, fill=GOLD, alpha=0.4 * clamp(k))
            draw_sprite(c, icon_sprite('Lock', 52, GOLD), CX + 40, CY, clamp(k), scale=max(0.01, k))
            dots = int(clamp((t - 1.4) / 1.2) * 8)
            rrect(c, CX + 140, CY - 22, 200, 44, 10, fill=SURF, stroke=LINE, alpha=ease_out((t - 1.2) / 0.4))
            text(c, '•' * dots, font(MONO, 22, 'Bold'), CX + 158, CY, color=TEXT, anchor='lm')
            badge(c, CX + 240, CY + 80, 'AES-256', EMERALD, ease_out((t - 2.8) / 0.4))
        else:
            rows = ['GPS 48.8566, 2.3522', 'Camera model', 'Owner name', 'Date taken']
            for i, r_ in enumerate(rows):
                y = CY - 90 + i * 56
                a_ = ease_out((t - 0.4 - i * 0.15) / 0.4)
                rrect(c, CX - 120, y - 20, 320, 40, 8, fill=SURF, stroke=LINE, alpha=a_)
                text(c, r_, font(MONO, 15, 'Medium'), CX - 100, y, color=TEXT, anchor='lm', alpha=a_)
                k = ease_in_out((t - 1.6 - i * 0.3) / 0.4)
                if k > 0:
                    line(c, CX - 105, y, CX - 105 + 290 * k, y, ORANGE_, 3)
            badge(c, CX + 290, CY, 'clean copy', EMERALD, ease_out((t - 3.0) / 0.4))
        return
    # ------------------------------------------------------------ geo
    if cat == 'geo':
        mx, my, mw, mh = CX - 330, SY + 15, 660, 300
        c.set_source_rgba(*rgbf(hexrgb('#0A1A26'))); rrect_path(c, mx, my, mw, mh, 12); c.fill()
        _grid(c, mx, my, mw, mh, 30, SKY, 0.10)
        prof = slug in ('gpx-elevation-profile', 'gpx-splits')
        th = 150 if prof else 220
        tcy = my + (95 if prof else mh / 2)
        pts = [(CX + x, tcy + y) for x, y in _track(s, 48, 480, th)]
        k = ease_in_out((t - 0.3) / 2.2)
        if slug == 'route-heatmap':
            for j in range(4):
                pj = [(CX + x, tcy + y) for x, y in _track(s + j * 7, 48, 480, th)]
                _poly(g, pj, ORANGE_, 10, 0.5, k)
                _poly(c, pj, [GOLD, ORANGE_, LIME_, GOLD][j], 3, 0.8, k)
            badge(c, mx + mw - 90, my + 30, '4 routes', GOLD, ease_out((t - 2.4) / 0.4), 13)
            return
        _poly(g, pts, CYAN, 10, 0.6, k)
        end = _poly(c, pts, CYAN if slug != 'gpx-simplifier' else SKY, 3.5, 1, k)
        circle(c, *end, 7, fill=GOLD); circle(g, *end, 12, fill=GOLD, alpha=0.6)
        circle(c, *pts[0], 6, fill=EMERALD)
        if slug == 'gpx-simplifier':
            sp = pts[::6] + [pts[-1]]
            ks = ease_in_out((t - 2.6) / 0.8)
            if ks > 0:
                _poly(c, sp, GOLD, 2.5, ks)
                for p in sp:
                    circle(c, *p, 4, fill=GOLD, alpha=ks)
                badge(c, mx + mw - 110, my + 30, '48 to 9 points', GOLD, ks, 13)
        elif slug == 'gpx-privacy-zone':
            kz = ease_out_back((t - 2.4) / 0.6)
            for p in (pts[0], pts[-1]):
                circle(c, *p, 46 * max(0.01, kz), fill=ORANGE_, stroke=ORANGE_, alpha=0.25 * clamp(kz))
            badge(c, mx + mw - 110, my + 30, 'home hidden', ORANGE_, clamp(kz), 13)
        elif slug == 'photo-location-map':
            for i in range(4):
                p = pts[(i + 1) * 10]
                kp = ease_out_back((t - 1.0 - i * 0.35) / 0.5)
                draw_sprite(c, icon_sprite('MapPin', 30, GOLD), p[0], p[1] - 16 * clamp(kp), clamp(kp))
            badge(c, mx + mw - 90, my + 30, '4 photos', GOLD, ease_out((t - 2.6) / 0.4), 13)
        elif slug == 'geojson-measure':
            badge(c, mx + mw - 120, my + 30, '12.4 km  ·  3.1 km²', GOLD, ease_out((t - 2.4) / 0.4), 13)
        elif slug == 'location-code-converter':
            rrect(c, mx + 20, my + mh - 70, 400, 50, 10, fill=SURF, stroke=LINE, alpha=ease_out((t - 1.6) / 0.4))
            codes = ['51.5007, -0.1246', '9C3XGV3C+8R', 'IO91wm Maidenhead', 'MGRS 30U XC 99']
            text(c, codes[min(3, int(max(0, t - 1.6) / 0.9))], font(MONO, 17, 'Bold'), mx + 40, my + mh - 45, color=CYAN, anchor='lm', alpha=ease_out((t - 1.6) / 0.4))
        elif slug == 'gpx-merge-split':
            for i, f_ in enumerate(['ride-1.gpx', 'ride-2.gpx']):
                badge(c, mx + 90 + i * 140, my + mh - 30, f_, [CYAN, GOLD][i], ease_out((t - 0.4 - i * 0.3) / 0.4), 13)
            badge(c, mx + mw - 100, my + mh - 30, 'one track', EMERALD, ease_out((t - 2.6) / 0.4), 13)
        if prof:
            px0, py0, pw, ph_ = mx + 30, my + mh - 20, mw - 60, 80
            vals = wave_vals(s, 60)
            ep = [(px0 + i * pw / 59, py0 - v * ph_) for i, v in enumerate(vals)]
            kp = ease_in_out((t - 1.0) / 2.0)
            _poly(c, ep, GOLD, 2.5, 1, kp)
            if slug == 'gpx-splits':
                for i in range(1, 5):
                    xk = px0 + i * pw / 5
                    line(c, xk, py0 - ph_ - 6, xk, py0, MUTED, 1, 0.6 * kp)
                    text(c, f'km {i}', font(MONO, 12, 'Bold'), xk, py0 - ph_ - 14, color=MUTED, alpha=kp)
            else:
                text(c, '+412 m', font(MONO, 14, 'Bold'), px0 + pw - 30, py0 - ph_ - 10, color=GOLD, alpha=kp)
        return
    # ------------------------------------------------------------ office
    if cat == 'office':
        if slug in ('xlsx-merger', 'xlsx-splitter'):
            merge = slug == 'xlsx-merger'
            k = ease_in_out((t - 1.0) / 1.4)
            for i in range(3):
                xs_ = CX - 330 + i * 120
                x = lerp(xs_, CX + 40, k) if merge else lerp(CX - 250, CX - 50 + i * 120, k)
                y = lerp(SY + 70 + i * 40, SY + 30 + i * 88, k) if merge else lerp(SY + 90, SY + 60 + i * 50, k)
                _sheet(c, x, y, 3, 4, 34, 22, cols[i % 3], 0.2 + i * 0.15, t)
            badge(c, CX + 250 if merge else CX, CY + 130, '1 workbook' if merge else '3 files', GOLD, ease_out((t - 2.6) / 0.4))
            return
        if slug in ('spreadsheet-compare', 'pivot-table'):
            if slug == 'spreadsheet-compare':
                hl = {(2, 1): GOLD, (4, 2): ORANGE_, (3, 0): EMERALD} if t > 2 else None
                _sheet(c, CX - 330, SY + 50, 4, 7, 70, 36, SKY, 0.2, t, hl, 'before.xlsx')
                _sheet(c, CX + 40, SY + 50, 4, 7, 70, 36, TEAL, 0.5, t, hl, 'after.xlsx')
                badge(c, CX, SY + 330, '3 cells changed', GOLD, ease_out((t - 2.4) / 0.4), 14)
            else:
                _sheet(c, CX - 330, SY + 50, 4, 7, 60, 34, SKY, 0.2, t, None, 'sales.csv')
                arrow(c, CX - 70, CY, CX + 10, GOLD, ease_out((t - 1.2) / 0.4), t)
                vals = wave_vals(s, 5)
                for i, v in enumerate(vals):
                    kk = ease_out((t - 1.6 - i * 0.12) / 0.5)
                    rrect(c, CX + 40, SY + 70 + i * 50, 260 * (0.3 + 0.7 * v) * kk, 34, 6, fill=cols[i % 3])
                    text(c, ['North', 'South', 'East', 'West', 'Online'][i], font(SANS, 14, 'SemiBold'), CX + 50, SY + 87 + i * 50, color=BLACK, anchor='lm', alpha=kk)
            return
        if slug == 'ics-viewer':
            window(c, CX - 250, SY + 10, 500, 310, 'calendar.ics')
            for r_ in range(4):
                for cc in range(7):
                    k = ease_out((t - 0.4 - (r_ * 7 + cc) * 0.03) / 0.3)
                    busy = (seed_of(f'{slug}{r_}{cc}') % 5) == 0
                    rrect(c, CX - 230 + cc * 66, SY + 60 + r_ * 62, 58, 54, 6, fill=mix(SURF2, [GOLD, TEAL, CYAN][cc % 3], 0.6 if busy else 0.08), alpha=k)
                    text(c, str(r_ * 7 + cc + 1), font(MONO, 12, 'Bold'), CX - 222 + cc * 66, SY + 72 + r_ * 62, color=MUTED, anchor='lm', alpha=k)
            return
        if slug == 'vcard-converter':
            k = ease_out((t - 0.3) / 0.5)
            rrect(c, CX - 300, CY - 90, 280, 180, 14, fill=SURF, stroke=GOLD, lw=2, alpha=k)
            circle(c, CX - 245, CY - 35, 30, fill=mix(SURF2, GOLD, 0.4), alpha=k)
            for i, w_ in enumerate((150, 120, 170)):
                rrect(c, CX - 195, CY - 55 + i * 26, w_, 12, 6, fill=LINE, alpha=k)
            text(c, 'VCF', font(MONO, 14, 'Bold'), CX - 270, CY + 60, color=GOLD, alpha=k)
            arrow(c, CX - 5, CY, CX + 70, GOLD, ease_out((t - 1.2) / 0.4), t)
            _sheet(c, CX + 90, CY - 80, 3, 5, 70, 32, TEAL, 1.6, t, None, 'contacts.csv')
            return
        # docx-find-replace, docx-cleaner, office-media-extractor
        page(c, CX - 160, CY, 250, 310, 1, GOLD, lines=0, seed=s)
        words = ['Q3 report', 'draft', 'client', 'budget', 'draft', 'notes']
        for i, w_ in enumerate(words):
            y = CY - 110 + i * 42
            rrect(c, CX - 260, y - 6, 70 + (i * 37) % 60, 12, 6, fill=PAPER_LINE)
            if slug == 'docx-find-replace' and w_ == 'draft':
                k = ease_in_out((t - 1.2 - i * 0.2) / 0.5)
                rrect(c, CX - 180, y - 14, 90, 28, 5, fill=GOLD, alpha=0.5)
                text(c, 'final' if k > 0.5 else 'draft', font(SANS, 16, 'Bold'), CX - 135, y, color=INK)
            else:
                text(c, w_, font(SANS, 15, 'Medium'), CX - 180, y, color=INK, anchor='lm')
        if slug == 'office-media-extractor':
            for i in range(4):
                k = ease_in_out(clamp((t - 1.0 - i * 0.3) / 0.9))
                photo(c, lerp(CX - 160, CX + 120 + (i % 2) * 150, k), lerp(CY, CY - 70 + (i // 2) * 140, k), 130 * (0.4 + 0.6 * k), 90 * (0.4 + 0.6 * k), s + i, stroke=LINE)
        elif slug == 'docx-cleaner':
            for i, r_ in enumerate(['tracked changes', 'comments', 'author name', 'hidden text']):
                y = CY - 80 + i * 54
                a_ = ease_out((t - 0.6 - i * 0.2) / 0.4)
                rrect(c, CX + 60, y - 18, 240, 36, 8, fill=SURF, stroke=LINE, alpha=a_)
                text(c, r_, font(SANS, 15, 'Medium'), CX + 78, y, anchor='lm', alpha=a_)
                kk = ease_in_out((t - 1.8 - i * 0.3) / 0.4)
                if kk > 0:
                    line(c, CX + 75, y, CX + 75 + 210 * kk, y, ORANGE_, 3)
        else:
            badge(c, CX + 160, CY, '2 replaced', GOLD, ease_out((t - 2.6) / 0.4))
        return
    # ------------------------------------------------------------ science
    if cat == 'science':
        if slug == 'function-plotter':
            ox, oy, w_, h_ = CX - 300, CY, 600, 280
            line(c, ox, oy, ox + w_, oy, MUTED, 1.5); line(c, CX, oy - h_ / 2, CX, oy + h_ / 2, MUTED, 1.5)
            _grid(c, ox, oy - h_ / 2, w_, h_, 40, SKY, 0.08)
            for j, (f_, col) in enumerate(((lambda x: math.sin(x), GOLD), (lambda x: 0.25 * x * x - 1.5, CYAN))):
                pts = [(ox + i * w_ / 120, oy - f_((i / 120 - 0.5) * 8) * 60) for i in range(121)]
                pts = [(x, clamp(y, oy - h_ / 2, oy + h_ / 2)) for x, y in pts]
                _poly(c, pts, col, 3, 1, ease_in_out((t - 0.5 - j * 0.9) / 1.6))
            text(c, 'y = sin(x)', font(MONO, 16, 'Bold'), ox + 20, oy - h_ / 2 + 20, color=GOLD, anchor='lm', alpha=ease_out((t - 0.5) / 0.4))
            text(c, 'y = x²/4 - 1.5', font(MONO, 16, 'Bold'), ox + 20, oy - h_ / 2 + 46, color=CYAN, anchor='lm', alpha=ease_out((t - 1.4) / 0.4))
            return
        if slug == 'periodic-table':
            for r_ in range(5):
                for cc in range(14):
                    if r_ == 0 and 0 < cc < 13:
                        continue
                    k = ease_out((t - 0.2 - (r_ + cc) * 0.03) / 0.3)
                    hot = (r_, cc) == (1, 4 + int(t) % 6)
                    rrect(c, CX - 330 + cc * 47, SY + 30 + r_ * 50, 42, 44, 5, fill=mix(SURF2, [TEAL, SKY, EMERALD, GOLD, LIME_][(cc // 3) % 5], 0.8 if hot else 0.22), alpha=k)
            text(c, 'C  Carbon  12.011', font(MONO, 18, 'Bold'), CX, SY + 300, color=GOLD, alpha=ease_out((t - 1.2) / 0.4))
            return
        if slug == 'truth-table-generator':
            text(c, 'A AND (B OR C)', font(MONO, 20, 'Bold'), CX, SY + 30, color=GOLD, alpha=ease_out(t / 0.4))
            for r_ in range(8):
                k = ease_out((t - 0.6 - r_ * 0.15) / 0.3)
                a_, b_, c_ = (r_ >> 2) & 1, (r_ >> 1) & 1, r_ & 1
                out = a_ and (b_ or c_)
                for cc, v in enumerate((a_, b_, c_, out)):
                    rrect(c, CX - 140 + cc * 72, SY + 60 + r_ * 33, 64, 28, 5, fill=mix(SURF2, EMERALD if (cc == 3 and v) else SKY, 0.5 if cc == 3 else 0.12), alpha=k)
                    text(c, str(int(v)), font(MONO, 15, 'Bold'), CX - 108 + cc * 72, SY + 74 + r_ * 33, alpha=k)
            return
        if slug == 'prime-factorizer':
            nodes = [((CX, SY + 40), '360'), ((CX - 90, SY + 120), '2'), ((CX + 90, SY + 120), '180'), ((CX + 10, SY + 200), '2'), ((CX + 170, SY + 200), '90'),
                     ((CX + 100, SY + 280), '2'), ((CX + 240, SY + 280), '45')]
            edges = [(0, 1), (0, 2), (2, 3), (2, 4), (4, 5), (4, 6)]
            for i, (a_, b_) in enumerate(edges):
                k = ease_in_out((t - 0.4 - i * 0.3) / 0.4)
                if k > 0:
                    line(c, *nodes[a_][0], lerp(nodes[a_][0][0], nodes[b_][0][0], k), lerp(nodes[a_][0][1], nodes[b_][0][1], k), LINE, 2)
            for i, (p, lab) in enumerate(nodes):
                k = ease_out_back((t - 0.2 - max(0, i - 0) * 0.15) / 0.4)
                circle(c, *p, 24, fill=SURF, stroke=GOLD if lab == '2' else CYAN, lw=2.5, alpha=clamp(k))
                text(c, lab, font(MONO, 15, 'Bold'), *p, alpha=clamp(k))
            text(c, '360 = 2³ × 3² × 5', font(MONO, 20, 'Bold'), CX - 230, CY + 120, color=GOLD, alpha=ease_out((t - 2.6) / 0.4))
            return
        if slug == 'matrix-calculator':
            def mat(x, vals, col, k):
                line(c, x, CY - 70, x, CY + 70, col, 3, k); line(c, x + 150, CY - 70, x + 150, CY + 70, col, 3, k)
                for i, v in enumerate(vals):
                    text(c, str(v), font(MONO, 22, 'Bold'), x + 40 + (i % 2) * 70, CY - 35 + (i // 2) * 70, alpha=k)
            mat(CX - 330, [2, 1, 0, 3], CYAN, ease_out((t - 0.2) / 0.4))
            text(c, '×', font(SANS, 30, 'Bold'), CX - 150, CY, alpha=ease_out((t - 0.5) / 0.4))
            mat(CX - 120, [1, 4, 2, 1], CYAN, ease_out((t - 0.6) / 0.4))
            text(c, '=', font(SANS, 30, 'Bold'), CX + 60, CY, alpha=ease_out((t - 1.4) / 0.4))
            mat(CX + 90, [4, 9, 6, 3], GOLD, ease_out((t - 1.8) / 0.5))
            return
        # latex-equation, molar-mass-calculator, chemical-equation-balancer
        if slug == 'latex-equation':
            src = r'\frac{-b \pm \sqrt{b^2-4ac}}{2a}'
            n = int(len(src) * clamp((t - 0.3) / 1.6))
            rrect(c, CX - 300, SY + 20, 600, 50, 10, fill=SURF, stroke=LINE)
            text(c, src[:n], font(MONO, 17, 'Medium'), CX - 280, SY + 45, color=CYAN, anchor='lm')
            k = ease_out((t - 2.0) / 0.6)
            text(c, 'x = (-b ± √(b² - 4ac)) / 2a', font(DISPLAY, 34, 'Bold'), CX, CY + 40, gradient=GOLD_GRAD, alpha=k)
            badge(c, CX, CY + 130, 'PNG  SVG  JPG', GOLD, ease_out((t - 2.8) / 0.4), 13)
        elif slug == 'molar-mass-calculator':
            text(c, 'C6H12O6', font(DISPLAY, 54, 'Bold'), CX, CY - 60, gradient=GOLD_GRAD, alpha=ease_out(t / 0.5))
            v = 180.156 * ease_out((t - 0.8) / 1.6)
            text(c, f'{v:7.3f} g/mol', font(MONO, 30, 'Bold'), CX, CY + 30, color=CYAN, alpha=ease_out((t - 0.8) / 0.4))
            for i, (e, p_) in enumerate((('C', 0.40), ('H', 0.07), ('O', 0.53))):
                kk = ease_out((t - 2.0 - i * 0.2) / 0.5)
                rrect(c, CX - 200, CY + 80 + i * 26, 400 * p_ * kk, 18, 5, fill=[GOLD, TEAL, SKY][i])
                text(c, e, font(MONO, 13, 'Bold'), CX - 215, CY + 89 + i * 26, color=MUTED, alpha=kk)
        else:
            k = ease_out((t - 1.6) / 0.5)
            parts = [('2' if k > 0.5 else '', 'H₂'), ('', '+'), ('', 'O₂'), ('', '→'), ('2' if k > 0.5 else '', 'H₂O')]
            x = CX - 230
            for co, sym in parts:
                if co:
                    text(c, co, font(DISPLAY, 46, 'Bold'), x, CY - 20, color=GOLD, alpha=k); x += 30
                text(c, sym, font(DISPLAY, 46, 'Bold'), x + 30, CY - 20, color=TEXT); x += 100
            badge(c, CX, CY + 80, 'balanced', EMERALD, ease_out((t - 2.4) / 0.4))
        return
    # ------------------------------------------------------------ creator
    if cat == 'creator':
        if slug == 'audiogram-maker':
            rrect(c, CX - 150, SY + 10, 300, 300, 18, fill=SURF, stroke=GOLD, lw=2)
            circle(c, CX, SY + 100, 46, fill=mix(SURF2, GOLD, 0.35))
            draw_sprite(c, icon_sprite('Mic', 40, GOLD), CX, SY + 100, 1)
            waveform(c, CX - 120, SY + 170, 240, 70, s, TEAL, 1, n=36, t=t, live=True)
            text(c, 'Episode 12', font(SANS, 18, 'Bold'), CX, SY + 275, alpha=ease_out((t - 0.8) / 0.4))
            badge(c, CX + 260, CY, '1:1  9:16', GOLD, ease_out((t - 2.0) / 0.4), 14)
            return
        if slug == 'video-reframe':
            k = ease_in_out((t - 1.2) / 1.2)
            fw, fh = lerp(480, 160, k), 270
            filmstrip(c, CX - 240, CY - 135, 480, 270, s, t * 0.15, 0.35, n=4)
            photo(c, CX, CY, fw, fh, s, stroke=GOLD)
            badge(c, CX, CY + 170, '16:9 to 9:16' if k > 0.5 else '16:9', GOLD, 1, 14)
            return
        if slug == 'carousel-maker':
            off = ease_in_out((t % 1.6) / 1.6) if t > 1.0 else 0
            for i in range(5):
                x = CX - 220 + (i - off) * 230
                if -400 < x - CX < 400:
                    rrect(c, x - 100, CY - 120, 200, 240, 14, fill=mix(SURF, cols[i % 3], 0.25), stroke=cols[i % 3], lw=2)
                    text(c, f'{i + 1}/5', font(MONO, 14, 'Bold'), x, CY + 95, color=MUTED)
                    text(c, ['Tip', 'Why', 'How', 'Try', 'Save'][i], font(DISPLAY, 34, 'Bold'), x, CY - 10)
            return
        if slug == 'post-length-checker':
            msg = 'Shipped a new feature today. Everything runs on your device.'
            n = int(len(msg) * clamp((t - 0.2) / 2.2))
            rrect(c, CX - 300, SY + 30, 600, 120, 12, fill=SURF, stroke=LINE)
            text(c, msg[:n], font(SANS, 18, 'Medium'), CX - 280, SY + 70, anchor='lm')
            for i, (lab, lim) in enumerate((('X', 280), ('Threads', 500), ('LinkedIn', 3000))):
                y = SY + 190 + i * 44
                text(c, lab, font(SANS, 15, 'SemiBold'), CX - 300, y, anchor='lm', color=MUTED)
                rrect(c, CX - 180, y - 8, 380, 16, 8, fill=SURF2)
                rrect(c, CX - 180, y - 8, 380 * min(1, n / lim * 3), 16, 8, fill=[GOLD, TEAL, SKY][i])
                text(c, f'{n}/{lim}', font(MONO, 14, 'Bold'), CX + 220, y, anchor='lm')
            return
        if slug == 'link-in-bio-builder':
            rrect(c, CX - 110, SY + 5, 220, 330, 26, fill=SURF, stroke=LINE, lw=3)
            circle(c, CX, SY + 60, 28, fill=mix(SURF2, GOLD, 0.5))
            for i in range(4):
                k = ease_out_back((t - 0.6 - i * 0.3) / 0.4)
                rrect(c, CX - 85, SY + 110 + i * 52, 170, 40, 20, fill=cols[i % 3], alpha=clamp(k))
                text(c, ['Portfolio', 'Newsletter', 'Shop', 'Contact'][i], font(SANS, 15, 'Bold'), CX, SY + 130 + i * 52, color=BLACK, alpha=clamp(k))
            badge(c, CX + 230, CY, 'one HTML file', GOLD, ease_out((t - 2.4) / 0.4), 14)
            return
        if slug == 'word-cloud':
            words = [('private', 54, GOLD), ('fast', 40, CYAN), ('browser', 46, TEAL), ('free', 34, EMERALD), ('files', 30, SKY), ('offline', 28, LIME_),
                     ('open', 26, ORANGE_), ('tools', 36, GOLD), ('local', 24, CYAN), ('simple', 22, TEAL)]
            rng = np.random.default_rng(s)
            for i, (w_, sz, col) in enumerate(words):
                k = ease_out_back((t - 0.3 - i * 0.18) / 0.4)
                x = CX + (rng.uniform(-260, 260) if i else 0); y = CY + (rng.uniform(-110, 110) if i else 0)
                text(c, w_, font(DISPLAY, sz, 'Bold'), x, y, color=col, alpha=clamp(k), scale=max(0.01, k), rot=(math.pi / 2 if i % 4 == 3 else 0))
            return
        # chapter-maker
        filmstrip(c, SX + 60, SY + 20, SW - 120, 140, s, t * 0.15, 1, n=6)
        y = SY + 220
        line(c, SX + 60, y, SX + SW - 60, y, LINE, 4)
        line(c, SX + 60, y, SX + 60 + (SW - 120) * clamp(t / 5), y, GOLD, 4)
        for i, lab in enumerate(['Intro', 'Setup', 'Demo', 'Wrap up']):
            x = SX + 60 + (SW - 120) * i / 4
            k = ease_out_back((t - 0.5 - i * 0.4) / 0.4)
            circle(c, x, y, 8, fill=GOLD, alpha=clamp(k))
            text(c, f'0{i}:{(i * 37) % 60:02d}  {lab}', font(MONO, 13, 'Bold'), x, y + 30, color=TEXT, alpha=clamp(k), anchor='lm' if i else 'lm')
        return
    # ------------------------------------------------------------ newer AI tools
    if slug in NEW_AI_VISION:
        if slug == 'similar-photo-finder':
            for i in range(6):
                k = ease_out((t - 0.2 - i * 0.12) / 0.4)
                grp = i % 3
                x = CX - 300 + i * 105
                kk = ease_in_out((t - 1.8) / 1.0)
                x = lerp(x, CX - 280 + grp * 220 + (i // 3) * 80, kk)
                photo(c, x, CY - 20 + (i // 3) * 30 * kk, 110, 80, s + grp, stroke=[GOLD, TEAL, CYAN][grp] if kk > 0.5 else LINE, alpha=k)
            badge(c, CX, CY + 130, '3 groups of look-alikes', GOLD, ease_out((t - 2.8) / 0.4), 14)
            return
        pw, ph_ = 420, 280
        photo(c, CX - 120, CY, pw, ph_, s, stroke=LINE, gray=0.0)
        k = ease_in_out((t - 0.8) / 1.0)
        if slug == 'depth-map':
            c.save(); rrect_path(c, CX - 120 - pw / 2, CY - ph_ / 2, pw * k, ph_, 8); c.clip()
            linear_fill(c, 0, CY - ph_ / 2, 0, CY + ph_ / 2, [(0, hexrgb('#0B0D10')), (0.6, TEAL), (1, GOLD)])
            c.restore()
            line(c, CX - 120 - pw / 2 + pw * k, CY - ph_ / 2, CX - 120 - pw / 2 + pw * k, CY + ph_ / 2, GOLD, 2.5)
            badge(c, CX + 230, CY, 'near to far', GOLD, ease_out((t - 2.2) / 0.4), 14)
            return
        boxes = [(-150, -60, 130, 150, 'person 0.97'), (40, -20, 120, 100, 'dog 0.91'), (-40, 70, 90, 50, 'ball 0.84')]
        for i, (bx, by, bw, bh, lab) in enumerate(boxes if slug in ('object-detector', 'image-segmenter') else []):
            kk = ease_out((t - 0.8 - i * 0.4) / 0.4)
            col = [GOLD, CYAN, EMERALD][i]
            if slug == 'image-segmenter':
                rrect(c, CX - 120 + bx, CY + by, bw, bh, 30, fill=col, alpha=0.35 * kk)
            else:
                rrect(c, CX - 120 + bx, CY + by, bw, bh, 4, stroke=col, lw=3, alpha=kk)
            if slug in ('object-detector', 'image-segmenter'):
                badge(c, CX - 120 + bx + 4, CY + by - 12, lab, col, kk, 11, anchor='l')
        if slug == 'image-captioner':
            cap = 'A person playing with a dog in the park'
            n = int(len(cap) * clamp((t - 1.6) / 1.6))
            text(c, cap[:n], font(SANS, 17, 'SemiBold'), CX + 110, CY, anchor='lm', color=GOLD)
        elif slug == 'image-tagger':
            for i, tg in enumerate(['park', 'dog', 'outdoor', 'summer']):
                badge(c, CX + 110, CY - 90 + i * 55, tg, cols[i % 3], ease_out((t - 1.6 - i * 0.25) / 0.4), 14, anchor='l')
        return
    if slug in NEW_AI_TEXT:
        if slug == 'semantic-file-search':
            rrect(c, CX - 300, SY + 20, 600, 46, 23, fill=SURF, stroke=GOLD, lw=2)
            q = 'invoice from last spring'
            text(c, q[:int(len(q) * clamp((t - 0.2) / 1.2))], font(SANS, 17, 'Medium'), CX - 270, SY + 43, anchor='lm')
            for i, (f_, sc) in enumerate((('march-bill.pdf', 0.92), ('receipt-04.png', 0.81), ('notes.docx', 0.44))):
                k = ease_out((t - 1.6 - i * 0.3) / 0.4)
                y = SY + 110 + i * 64
                rrect(c, CX - 300, y - 24, 600, 50, 10, fill=SURF, stroke=LINE, alpha=k)
                text(c, f_, font(MONO, 15, 'Bold'), CX - 280, y, anchor='lm', alpha=k)
                rrect(c, CX + 80, y - 6, 160 * sc * k, 12, 6, fill=[GOLD, TEAL, SKY][i])
                text(c, f'{sc:.2f}', font(MONO, 14, 'Bold'), CX + 255, y, anchor='lm', alpha=k)
            return
        txt = ['Apple opened a new office', 'in Berlin on 3 May, and', 'staff loved the place.']
        for i, ln in enumerate(txt):
            text(c, ln, font(SANS, 22, 'Medium'), CX - 300, SY + 50 + i * 40, anchor='lm', alpha=ease_out((t - 0.2 - i * 0.2) / 0.4))
        if slug == 'entity-extractor':
            ents = [('Apple', 'ORG', 0, 0), ('Berlin', 'PLACE', 1, 25), ('3 May', 'DATE', 1, 120)]
            for i, (e, lab, row, off) in enumerate(ents):
                k = ease_out((t - 1.2 - i * 0.4) / 0.4)
                ff = font(SANS, 22, 'Medium')
                x0 = CX - 300 + ff.getlength(txt[row][:txt[row].find(e)])
                w_ = ff.getlength(e)
                rrect(c, x0 - 4, SY + 50 + row * 40 - 16, w_ + 8, 32, 6, fill=[GOLD, CYAN, EMERALD][i], alpha=0.35 * k)
                badge(c, CX - 220 + i * 150, SY + 240, f'{lab}  {e}', [GOLD, CYAN, EMERALD][i], k, 14)
        else:
            labs = (['positive', 0.93], ['negative', 0.07]) if slug == 'sentiment-analyzer' else (['business', 0.71], ['travel', 0.19], ['sport', 0.10])
            for i, (lab, v) in enumerate(labs):
                k = ease_out((t - 1.4 - i * 0.2) / 0.6)
                y = SY + 200 + i * 40
                text(c, lab, font(SANS, 16, 'SemiBold'), CX - 300, y, anchor='lm', color=MUTED)
                rrect(c, CX - 180, y - 9, 360 * v * k, 18, 9, fill=[GOLD, TEAL, SKY][i])
                text(c, f'{v * 100:.0f}%', font(MONO, 14, 'Bold'), CX - 170 + 360 * v * k, y, anchor='lm', alpha=k)
        return
    d_extra(c, g, t, d, P)


# ----------------------------------------------------------------------------- per-tool plan
LIME_F = hexrgb('#BEF264')
TEAL_H = hexrgb('#5EEAD4')


def _money_rows(c, x, y, t, t0, rows, w=380, lh=34, cat=None):
    for i, (d_, desc, amt) in enumerate(rows):
        k = ease_out((t - t0 - i * 0.18) / 0.4)
        yy = y + i * lh
        rrect(c, x, yy - lh / 2 + 3, w, lh - 6, 6, fill=SURF, stroke=LINE, alpha=k)
        text(c, d_, font(MONO, 12, 'Medium'), x + 12, yy, color=MUTED, anchor='lm', alpha=k)
        text(c, desc, font(SANS, 14, 'SemiBold'), x + 92, yy, anchor='lm', alpha=k)
        text(c, amt, font(MONO, 14, 'Bold'), x + w - 12, yy, color=EMERALD if not amt.startswith('-') else TEXT, anchor='rm', alpha=k)
        if cat:
            kc = ease_out_back((t - cat[1] - i * 0.22) / 0.4)
            if kc > 0:
                badge(c, x + w + 70, yy, cat[0][i][0], cat[0][i][1], clamp(kc), 12)


ROWS = [('03 Oct', 'Netflix', '-649.00'), ('05 Oct', 'Big Basket', '-1,830.50'), ('10 Oct', 'Uber trip', '-340.00'), ('01 Oct', 'Salary', '52,000.00'), ('13 Oct', 'ATM cash', '-2,000.00')]


def d_r13(c, g, t, d, P):
    """Templates for the Money & Finance and Health & Fitness tools (round 13)."""
    slug, s = P['slug'], P['seed']
    if slug == 'bank-statement-converter':
        fmts = ['OFX', 'QIF', 'CAMT', 'MT940']
        i = int(t / 1.1) % 4
        fmt_card(c, CX - 260, CY, fmts[i], LIME_F, 1, kind='doc', seed=s + i)
        arrow(c, CX - 160, CY, CX - 40, GOLD, 1, t)
        _sheet(c, CX - 20, CY - 110, 4, 7, 72, 32, LIME_F, 0.4, t, title='transactions.xlsx')
        badge(c, CX + 140, CY + 150, ['CSV', 'Excel', 'JSON', 'OFX'][i], GOLD, ease_out((t - 0.8) / 0.4), 14)
        return
    if slug == 'csv-to-ofx':
        _sheet(c, CX - 330, CY - 100, 3, 6, 70, 32, SKY, 0.2, t, title='bank.csv')
        k = ease_in_out((t - 1.0) / 1.2)
        arrow(c, CX - 90, CY, CX + 20, GOLD, 1, t)
        lines_ = ['<STMTTRN>', '  <TRNAMT>-649.00', '  <NAME>Netflix', '</STMTTRN>', '<STMTTRN>', '  <TRNAMT>52000.00']
        rrect(c, CX + 40, CY - 120, 290, 240, 12, fill=SURF, stroke=LIME_F, lw=2, alpha=k)
        for j, ln in enumerate(lines_):
            text(c, ln, font(MONO, 14, 'Medium'), CX + 60, CY - 95 + j * 34, color=LIME_F if '<' in ln[:3] else TEXT, anchor='lm', alpha=ease_out((t - 1.4 - j * 0.15) / 0.3))
        badge(c, CX + 185, CY + 150, 'OFX 2.2', LIME_F, ease_out((t - 2.4) / 0.4), 14)
        return
    if slug == 'statement-analyzer':
        vals = [(0.9, 0.55), (0.85, 0.7), (0.92, 0.6), (0.88, 0.8), (0.95, 0.5)]
        for i, (a, b) in enumerate(vals):
            k = ease_out((t - 0.3 - i * 0.15) / 0.6)
            x = CX - 330 + i * 70
            rrect(c, x, CY + 110 - 200 * a * k, 24, 200 * a * k, 4, fill=TEAL)
            rrect(c, x + 28, CY + 110 - 200 * b * k, 24, 200 * b * k, 4, fill=GOLD)
        cats = [('Groceries', 0.8, EMERALD), ('Bills', 0.6, SKY), ('Eating out', 0.45, GOLD), ('Transport', 0.3, ORANGE_)]
        for i, (lab, v, col) in enumerate(cats):
            y = CY - 80 + i * 50
            k = ease_out((t - 1.4 - i * 0.2) / 0.5)
            text(c, lab, font(SANS, 15, 'SemiBold'), CX + 60, y, anchor='lm', alpha=k)
            rrect(c, CX + 180, y - 8, 160, 16, 8, fill=SURF2, alpha=k)
            rrect(c, CX + 180, y - 8, 160 * v * k, 16, 8, fill=col)
        badge(c, CX + 200, CY + 140, '3 subscriptions found', GOLD, ease_out((t - 2.8) / 0.4), 13)
        return
    if slug == 'transaction-categorizer':
        cats = [('Subscriptions', SKY), ('Groceries', EMERALD), ('Transport', ORANGE_), ('Income', LIME_F), ('Cash', GOLD)]
        _money_rows(c, CX - 330, CY - 120, t, 0.2, ROWS, w=360, lh=58, cat=(cats, 1.2))
        circle(g, CX + 20, CY - 150, 18, fill=GOLD, alpha=0.4 * (0.5 + 0.5 * math.sin(t * 4)))
        draw_sprite(c, icon_sprite('Sparkles', 26, GOLD), CX + 20, CY - 150, 1)
        return
    if slug == 'receipt-scanner':
        page(c, CX - 170, CY, 200, 300, 1, LIME_F, lines=0, seed=s)
        items = ['FRESH MART', 'Milk      62.00', 'Bread     45.00', 'Eggs      96.00', 'GST       10.15', 'TOTAL    213.15']
        for i, it in enumerate(items):
            text(c, it, font(MONO, 13, 'Bold' if i in (0, 5) else 'Medium'), CX - 250, CY - 110 + i * 40, color=INK, anchor='lm')
        sy = CY - 140 + ((t * 120) % 290)
        line(c, CX - 275, sy, CX - 65, sy, CYAN, 3, 0.9 if t < 3.2 else 0)
        rrect(g, CX - 275, sy - 6, 210, 12, 6, fill=CYAN, alpha=0.35 if t < 3.2 else 0)
        fields = [('Shop', 'Fresh Mart'), ('Date', '2026-10-14'), ('Tax', '10.15'), ('Total', '213.15')]
        for i, (k_, v) in enumerate(fields):
            k = ease_out((t - 1.0 - i * 0.4) / 0.4)
            y = CY - 90 + i * 60
            rrect(c, CX + 20, y - 22, 300, 44, 10, fill=SURF, stroke=LINE, alpha=k)
            text(c, k_, font(SANS, 13, 'SemiBold'), CX + 36, y, color=MUTED, anchor='lm', alpha=k)
            text(c, v, font(MONO, 16, 'Bold'), CX + 304, y, color=GOLD if k_ == 'Total' else TEXT, anchor='rm', alpha=k)
        return
    if slug == 'pdf-statement-to-csv':
        page(c, CX - 240, CY, 220, 290, 1, GOLD, lines=0, seed=s)
        for i in range(6):
            y = CY - 100 + i * 36
            line(c, CX - 330, y, CX - 150, y, INK, 2, 0.5)
            k = ease_out((t - 0.6 - i * 0.25) / 0.3)
            rrect(g, CX - 340, y - 12, 200, 24, 4, fill=LIME_F, alpha=0.35 * k * (1 - ease_out((t - 2.8) / 0.5)))
        arrow(c, CX - 100, CY, CX, GOLD, 1, t)
        _sheet(c, CX + 20, CY - 110, 4, 7, 72, 32, LIME_F, 1.0, t, title='statement.csv')
        return
    if slug == 'loan-calculator':
        pts = [(CX - 300 + i * 12, CY + 110 - 220 * (1 - (i / 50) ** 1.6)) for i in range(51)]
        _grid(c, CX - 310, CY - 120, 620, 240, 40, LIME_F, 0.08)
        _poly(c, pts, GOLD, 4, 1, ease_in_out(t / 3.0))
        pts2 = [(CX - 300 + i * 12, CY + 110 - 220 * (1 - min(1, (i / 38)) ** 1.5)) for i in range(51)]
        _poly(c, pts2, TEAL, 3, ease_out((t - 2.0) / 0.5), ease_in_out((t - 2.0) / 1.5))
        badge(c, CX + 200, CY - 110, 'EMI 21,696', GOLD, ease_out((t - 0.6) / 0.4), 15)
        badge(c, CX + 200, CY - 60, 'saves 4.1 lakh', TEAL, ease_out((t - 3.0) / 0.4), 13)
        return
    if slug == 'compound-interest':
        for i in range(12):
            v = (1.12 ** i - 1) / (1.12 ** 11 - 1)
            k = ease_out((t - 0.2 - i * 0.12) / 0.5)
            x = CX - 320 + i * 54
            inv = 30 + i * 12
            rrect(c, x, CY + 120 - inv * k, 38, inv * k, 4, fill=TEAL)
            h2 = 230 * v * k
            rrect(c, x, CY + 120 - inv * k - h2, 38, h2, 4, fill=GOLD)
        text(c, 'growth', font(SANS, 14, 'Bold'), CX - 300, CY - 120, color=GOLD, anchor='lm', alpha=ease_out((t - 1.5) / 0.4))
        text(c, 'invested', font(SANS, 14, 'Bold'), CX - 200, CY - 120, color=TEAL, anchor='lm', alpha=ease_out((t - 1.5) / 0.4))
        return
    if slug == 'gst-vat-calculator':
        n = int(clamp(t / 1.2) * 4)
        text(c, '1,000'[:max(1, n + 1)], font(DISPLAY, 54, 'Bold'), CX - 200, CY - 40)
        k = ease_out_back((t - 1.2) / 0.5)
        badge(c, CX - 20, CY - 40, '+ 18%', GOLD, clamp(k), 20)
        k2 = ease_out((t - 1.8) / 0.5)
        text(c, '= 1,180', font(DISPLAY, 54, 'Bold'), CX + 180, CY - 40, color=LIME_F, alpha=k2)
        for i, (lab, v) in enumerate((('CGST 9%', '90'), ('SGST 9%', '90'), ('IGST 18%', '180'))):
            kk = ease_out((t - 2.4 - i * 0.2) / 0.4)
            x = CX - 220 + i * 220
            rrect(c, x - 90, CY + 50, 180, 70, 12, fill=SURF, stroke=LINE, alpha=kk)
            text(c, lab, font(SANS, 14, 'SemiBold'), x, CY + 72, color=MUTED, alpha=kk)
            text(c, v, font(MONO, 22, 'Bold'), x, CY + 100, alpha=kk)
        return
    if slug == 'expense-splitter':
        ppl = [('Asha', GOLD, -200), ('Ravi', TEAL, 0), ('Meera', SKY, 200)]
        for i, (nm, col, dx) in enumerate(ppl):
            k = ease_out_back((t - 0.2 - i * 0.2) / 0.5)
            circle(c, CX + dx, CY - 60, 44, fill=mix(SURF2, col, 0.35), stroke=col, lw=3, alpha=clamp(k))
            text(c, nm[0], font(DISPLAY, 34, 'Bold'), CX + dx, CY - 60, alpha=clamp(k))
            text(c, nm, font(SANS, 14, 'SemiBold'), CX + dx, CY, color=MUTED, alpha=clamp(k))
        k = ease_in_out((t - 1.4) / 1.0)
        if k > 0:
            for dx0 in (0, 200):
                x = lerp(CX + dx0 - 30, CX - 170, k)
                circle(c, x, CY - 60 + math.sin(k * math.pi) * -50, 14, fill=LIME_F)
                text(c, '₹', font(SANS, 14, 'Bold'), x, CY - 60 + math.sin(k * math.pi) * -50, color=BLACK)
        badge(c, CX, CY + 80, '2 payments settle everyone', LIME_F, ease_out((t - 2.6) / 0.4), 14)
        return
    if slug == 'fit-file-converter':
        rrect(c, CX - 330, CY - 70, 130, 150, 34, fill=SURF, stroke=TEAL_H, lw=3)
        text(c, '5.0', font(DISPLAY, 34, 'Bold'), CX - 265, CY - 10)
        text(c, 'km', font(SANS, 14, 'Bold'), CX - 265, CY + 25, color=MUTED)
        badge(c, CX - 265, CY + 105, '.FIT', TEAL_H, 1, 14)
        arrow(c, CX - 180, CY, CX - 90, GOLD, 1, t)
        pts = [(CX + 10 + x * 0.55, CY - 20 + y * 0.55) for x, y in _track(s, 50, 420, 200)]
        _grid(c, CX - 80, CY - 120, 400, 200, 32, TEAL_H, 0.07)
        head = _poly(c, pts, GOLD, 4, 1, ease_in_out((t - 0.4) / 2.4))
        circle(g, head[0], head[1], 12, fill=GOLD, alpha=0.6)
        for i, lab in enumerate(('CSV', 'GPX', 'Excel')):
            badge(c, CX - 20 + i * 110, CY + 130, lab, [GOLD, TEAL_H, SKY][i], ease_out((t - 2.6 - i * 0.2) / 0.4), 13)
        return
    if slug == 'heart-rate-zones':
        cols_ = [SKY, TEAL, LIME_, GOLD, ORANGE_]
        share = [0.1, 0.35, 0.3, 0.18, 0.07]
        x = CX - 320
        k = ease_in_out((t - 0.3) / 1.6)
        for i, v in enumerate(share):
            w_ = 640 * v * k
            rrect(c, x, CY + 60, max(1, w_), 34, 6, fill=cols_[i])
            x += w_
        pts = [(CX - 320 + i * 8, CY - 20 - 90 * (0.4 + 0.6 * (i / 80) + 0.08 * math.sin(i / 3))) for i in range(81)]
        _poly(c, pts, ORANGE_, 3, 1, ease_in_out(t / 2.2))
        beat = 1 + 0.12 * max(0, math.sin(t * 7))
        draw_sprite(c, icon_sprite('HeartPulse', 40, ORANGE_), CX + 280, CY - 120, 1, scale=beat)
        badge(c, CX + 220, CY + 130, 'load 86', GOLD, ease_out((t - 2.4) / 0.4), 14)
        return
    if slug == 'apple-health-export':
        rrect(c, CX - 330, CY - 90, 140, 180, 18, fill=SURF, stroke=TEAL_H, lw=2)
        draw_sprite(c, icon_sprite('Apple', 54, TEAL_H), CX - 260, CY - 20, 1)
        text(c, 'export.zip', font(MONO, 13, 'Bold'), CX - 260, CY + 55, color=MUTED)
        arrow(c, CX - 170, CY, CX - 80, GOLD, 1, t)
        for i, (lab, col) in enumerate((('steps.csv', GOLD), ('heart-rate.csv', ORANGE_), ('weight.csv', TEAL_H), ('workouts.csv', SKY))):
            k = ease_out_back((t - 0.8 - i * 0.35) / 0.5)
            y = CY - 105 + i * 70
            rrect(c, CX - 50, y - 26, 250, 52, 10, fill=SURF, stroke=col, lw=2, alpha=clamp(k))
            text(c, lab, font(MONO, 15, 'Bold'), CX - 30, y, anchor='lm', alpha=clamp(k))
            vals = wave_vals(s + i, 8)
            for j, v in enumerate(vals):
                rrect(c, CX + 130 + j * 7, y + 14 - 26 * v * clamp(k), 4, 26 * v * clamp(k), 2, fill=col)
        return
    if slug == 'pace-calculator':
        k = clamp(t / 3.2)
        rrect(c, CX - 320, CY + 40, 640, 14, 7, fill=SURF2)
        rrect(c, CX - 320, CY + 40, 640 * k, 14, 7, fill=GOLD)
        for i in range(6):
            x = CX - 320 + i * 128
            line(c, x, CY + 30, x, CY + 64, MUTED, 2, 0.6)
            text(c, f'{i * 2} km', font(MONO, 12, 'Medium'), x, CY + 80, color=MUTED)
        draw_sprite(c, icon_sprite('Footprints', 34, GOLD), CX - 320 + 640 * k, CY + 10, 1)
        text(c, '5:30 /km', font(DISPLAY, 44, 'Bold'), CX - 120, CY - 80)
        badge(c, CX + 170, CY - 100, '10K  55:00', TEAL, ease_out((t - 0.8) / 0.4), 14)
        badge(c, CX + 170, CY - 55, 'Half  2:01:39', SKY, ease_out((t - 1.6) / 0.4), 14)
        return
    if slug == 'bmi-bmr-calculator':
        cols_ = [SKY, EMERALD, GOLD, ORANGE_]
        for i, col in enumerate(cols_):
            rrect(c, CX - 300 + i * 150, CY + 20, 148, 20, 4, fill=col, alpha=0.85)
        k = ease_out_back((t - 0.4) / 1.4)
        x = lerp(CX - 300, CX - 300 + 600 * 0.33, k)
        circle(c, x, CY + 30, 16, fill=TEXT, stroke=BLACK, lw=3)
        text(c, f'BMI {lerp(15, 23.7, clamp(k)):.1f}', font(DISPLAY, 40, 'Bold'), CX, CY - 60)
        badge(c, CX - 150, CY + 100, 'BMR 1,649 kcal', TEAL, ease_out((t - 1.8) / 0.4), 14)
        badge(c, CX + 150, CY + 100, 'Daily 2,267 kcal', GOLD, ease_out((t - 2.4) / 0.4), 14)
        return
    if slug == 'meal-photo-logger':
        photo(c, CX - 180, CY, 260, 220, s, stroke=TEAL_H)
        k = ease_out((t - 0.8) / 0.4)
        if k > 0:
            for b_ in range(3):
                rr = 40 + ((t * 60 + b_ * 30) % 90)
                circle(c, CX - 180, CY, rr, stroke=GOLD, lw=2, alpha=0.5 * (1 - rr / 130) * k)
        guesses = [('biryani', 0.82), ('fried rice', 0.11), ('curry', 0.04)]
        for i, (lab, v) in enumerate(guesses):
            kk = ease_out((t - 1.4 - i * 0.25) / 0.4)
            y = CY - 70 + i * 50
            text(c, lab, font(SANS, 16, 'SemiBold'), CX + 20, y, anchor='lm', alpha=kk)
            rrect(c, CX + 140, y - 8, 160, 16, 8, fill=SURF2, alpha=kk)
            rrect(c, CX + 140, y - 8, 160 * v * kk, 16, 8, fill=[GOLD, TEAL, SKY][i])
        badge(c, CX + 160, CY + 110, 'about 600 kcal', GOLD, ease_out((t - 2.6) / 0.4), 15)
        return
    # any other tool in these categories
    page(c, CX, CY, 260, 300, 1, LIME_F if P['cat'] == 'finance' else TEAL_H, seed=s)



# ----------------------------------------------------------------------------- categories fill round (b-cf)
CF_SPEC = {
    # privacy
    'secret-link': ('code', 'note.txt  ->  link', ['Wi-Fi: HomeNet', 'pass: ************', '', '#v1.k.Q2x...9fA', 'AES-256-GCM'], 'opens in browser', EMERALD),
    'media-metadata-remover': ('tags', 'clip.mp4', ['location +48.85+002.35', 'make Apple', 'model iPhone 15', 'creation_time 2026-10'], 'no re-encode', EMERALD),
    'url-tracking-cleaner': ('code', 'links', ['shop.com/p?id=5', '  &utm_source=mail', '  &fbclid=IwAR2...', '  &gclid=Cj0K...', 'shop.com/p?id=5'], '3 trackers removed', EMERALD),
    'leak-checker': ('tags', 'report.docx', ['Author  J. Rivera', 'Tracked changes 12', 'Comments 4', 'Hidden sheet "Q3"'], '4 serious', ORANGE_),
    'csv-anonymizer': ('sheet', 'customers.csv', 'anon', 'names replaced', EMERALD),
    'voice-anonymizer': ('wave', 'interview.mp3', 'pitch -5', 'voice disguised', TEAL),
    'email-header-analyzer': ('code', 'headers', ['Received: from mail.x', 'spf=softfail', 'dkim=none', 'dmarc=fail', 'Reply-To differs'], 'phishing signs', ORANGE_),
    # geo
    'distance-bearing-calculator': ('calc', 'Delhi -> Mumbai', 1148.0, 'km', '211 deg SSW', SKY),
    'geotag-photos': ('map', 'track.gpx + photos', 'pins', '12 photos tagged', SKY),
    'csv-to-map': ('map', 'places.csv', 'dots', 'KML ready', CYAN),
    'gpx-editor': ('map', 'ride.gpx', 'trim', 'trimmed 400 m', GOLD),
    'gpx-compare': ('map', 'run-a vs run-b', 'two', '92% match', CYAN),
    'geofence-checker': ('map', 'stores.csv', 'zone', '18 inside', EMERALD),
    # office
    'sheet-to-csv-json': ('convert', 'budget.xlsx', ['CSV', 'JSON', 'NDJSON'], 'every sheet', GOLD),
    'csv-to-excel': ('convert', 'export.csv', ['XLSX', 'ODS'], 'numbers as numbers', EMERALD),
    'remove-duplicate-rows': ('sheet', 'contacts.xlsx', 'dedupe', '214 duplicates', GOLD),
    'sort-filter-rows': ('sheet', 'orders.csv', 'sort', 'sorted, 3 filters', SKY),
    'csv-splitter': ('sheet', 'big.csv  1.2 GB', 'split', '12 parts', GOLD),
    'docx-merger': ('merge', 'DOCX', 'merged.docx', 'images kept', SKY),
    'pptx-to-images': ('convert', 'deck.pptx', ['PNG', 'JPG', 'WEBP'], '24 slides', GOLD),
    'sheet-cleaner': ('sheet', 'messy.csv', 'clean', '1,204 cells fixed', EMERALD),
    'sheet-join': ('sheet', 'orders + customers', 'join', 'like VLOOKUP', CYAN),
    'column-splitter': ('sheet', 'names.xlsx', 'columns', 'first, last', GOLD),
    # science
    'significant-figures': ('calc', '0.004050', 4.0, 'sig figs', 'rounded 0.00405', LIME_),
    'scientific-notation': ('calc', '0.0000456', 4.56, 'x 10^-5', 'E, eng, SI', LIME_),
    'physics-formula-solver': ('calc', 'V = I R', 10.0, 'V', 'solved for V', LIME_),
    'ph-calculator': ('calc', '0.1 M acetic acid', 2.87, 'pH', 'acidic', GOLD),
    'solution-calculator': ('calc', '0.5 M NaCl, 250 mL', 7.31, 'g', 'weigh this', CYAN),
    'half-life-calculator': ('curve', 'Carbon-14', 'T = 5730 y', '25% left', LIME_),
    'csv-grapher': ('curve', 'lab-data.csv', 'R2 = 0.998', 'trend line', GOLD),
    # creator
    'caption-styler': ('frame', 'captions', 'SHORT BOLD WORDS', 'burned in', GOLD),
    'hashtag-generator': ('chips', 'caption', ['#MonsoonHike', '#WesternGhats', '#travel', '#hiking', '#roadtrip'], 'on-device AI', GOLD),
    'quote-card-maker': ('frame', 'quote', '"Start where you are."', 'PNG 1080', GOLD),
    'safe-zone-checker': ('frame', 'zones', 'Reels', 'keep text clear', ORANGE_),
    'youtube-preview': ('frame', 'thumb', 'I Tried Every Free PDF Tool', 'A/B compare', GOLD),
    'giveaway-picker': ('chips', 'comments', ['@maya', '@leo', '@ivy', '@arjun', '@zara'], 'fair draw', GOLD),
    'content-calendar': ('cal', 'November', [3, 6, 10, 13, 17, 20, 24, 27], 'export .ics', GOLD),
    # study
    'flashcard-maker': ('card', 'osmosis', 'water moves across a membrane', 'box 2 of 5', hexrgb('#FDE68A')),
    'notes-to-flashcards': ('card', 'Water vapour forms _____', 'clouds', 'on-device AI', hexrgb('#FDE68A')),
    'quiz-maker': ('quiz', 'Closest planet to the Sun?', ['Venus', 'Mercury', 'Mars'], '4 / 4', hexrgb('#FDE68A')),
    'math-worksheet': ('worksheet', 'Practice sheet', ['7 + 5 =', '12 - 4 =', '6 x 3 =', '18 / 2 ='], 'answer key', hexrgb('#FDE68A')),
    'word-search-maker': ('grid', 'Ocean animals', 'SHARK', 'PDF', hexrgb('#FDE68A')),
    'crossword-maker': ('grid', 'Space crossword', 'ORBIT', 'numbered', hexrgb('#FDE68A')),
    'citation-generator': ('code', 'references', ['Smith, J., & Doe, J.', '  (2020). A study of', '  things. Journal of', '  Stuff, 12(3), 45-67.'], 'APA 7', hexrgb('#FDE68A')),
    'bibliography-converter': ('convert', 'refs.bib', ['RIS', 'CSL', 'APA'], 'Zotero ready', hexrgb('#FDE68A')),
    'gpa-calculator': ('calc', '4 courses, 12 credits', 3.58, 'GPA', 'cumulative too', hexrgb('#FDE68A')),
    'grade-calculator': ('calc', 'now 82%, want 90%', 97.5, '% needed', 'on the final', hexrgb('#FDE68A')),
    'typing-test': ('calc', 'typing test', 68.0, 'wpm', '97% accurate', hexrgb('#FDE68A')),
    'cornell-notes': ('worksheet', 'Cornell notes', ['Cues', 'Notes', 'Summary', ''], 'printable', hexrgb('#FDE68A')),
    # web
    'robots-txt-generator': ('code', 'robots.txt', ['User-agent: *', 'Disallow: /admin/', 'User-agent: GPTBot', 'Disallow: /', 'Sitemap: /sitemap.xml'], 'tested', CYAN),
    'sitemap-generator': ('code', 'sitemap.xml', ['<urlset>', '  <url><loc>/</loc>', '  <url><loc>/about</loc>', '  <url><loc>/blog</loc>', '</urlset>'], '5 pages', CYAN),
    'sitemap-checker': ('tags', 'sitemap.xml', ['lastmod 2026-13-40', 'priority 1.5', 'duplicate /about', 'other host'], '4 problems', ORANGE_),
    'redirect-generator': ('code', '.htaccess', ['RewriteEngine On', 'RewriteRule ^old$ /new', '  [R=301,L]', 'chain /a > /b > /c'], 'Nginx, Vercel too', CYAN),
    'hreflang-generator': ('code', 'head', ['hreflang="en"', 'hreflang="en-GB"', 'hreflang="hi-IN"', 'hreflang="x-default"'], 'codes checked', CYAN),
    'security-headers-generator': ('code', 'headers', ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy'], 'grade A', EMERALD),
    'utm-builder': ('code', 'campaign link', ['example.com/pricing', '?utm_source=newsletter', '&utm_medium=email', '&utm_campaign=launch'], 'QR code', CYAN),
    'schema-generator': ('code', 'JSON-LD', ['{"@type": "FAQPage",', ' "mainEntity": [', '  {"@type":"Question",', '   "name": "Is it free?"'], 'rich results', CYAN),
    'llms-txt-generator': ('code', 'llms.txt', ['# OpenFile', '> Free file tools', '## Docs', '- [Start](/docs/start)'], 'for AI assistants', CYAN),
    'seo-audit': ('tags', 'index.html', ['title 42 chars  ok', 'no meta description', 'h2 skipped to h4', '1 image without alt'], 'score 71', GOLD),
    'meta-description-writer': ('code', 'description', ['Free file tools that', 'run in your browser.', 'Merge, split and', 'compress, no upload.'], '148 characters', GOLD),
    'link-extractor': ('tags', 'page.html', ['/about  internal', 'github.com  nofollow', 'mailto:hi@...', '[image] /blog'], '42 links', CYAN),
    'security-txt-generator': ('code', 'security.txt', ['Contact: mailto:sec@', 'Expires: 2027-10-29', 'Policy: /security', 'Canonical: /.well-known'], 'RFC 9116', CYAN),
    # time
    'ics-creator': ('cal', 'Project kickoff', [12], 'Add to calendar', hexrgb('#86EFAC')),
    'ics-merger': ('cal', 'work + home + school', [2, 5, 9, 12, 16, 19, 23, 26, 30], '3 duplicates removed', hexrgb('#86EFAC')),
    'csv-to-ics': ('convert', 'exams.xlsx', ['ICS'], '12 events', hexrgb('#86EFAC')),
    'recurring-dates': ('cal', 'last Friday monthly', [28], 'RRULE', hexrgb('#86EFAC')),
    'age-calculator': ('calc', 'born 2003-02-10', 23.0, 'years', 'next birthday', hexrgb('#86EFAC')),
    'week-number': ('calc', '29 October 2026', 44.0, 'ISO week', 'Mon 26 Oct', hexrgb('#86EFAC')),
    'sunrise-sunset': ('curve', 'Kolkata', 'sunrise 05:42', 'golden hour', GOLD),
    'timesheet-calculator': ('calc', 'Mon to Fri', 40.0, 'hours', '2.5 h overtime', hexrgb('#86EFAC')),
    'shift-rota-planner': ('rota', '4 on 4 off', 'D D N N O O O O', 'calendar each', hexrgb('#86EFAC')),
    'printable-calendar': ('cal', '2027', [1, 26], 'PDF', hexrgb('#86EFAC')),
    'printable-planner': ('worksheet', 'Week planner', ['Mon', 'Tue', 'Wed', 'To do'], 'PDF', hexrgb('#86EFAC')),
    'duration-calculator': ('calc', '1:20 + 45m + 2h15m', 4.33, 'hours', '4:20:00', hexrgb('#86EFAC')),
}


def d_cf(c, g, t, d, P):
    """Templates for the categories fill round: one spec per tool, a few shared scene types."""
    slug, s = P['slug'], P['seed']
    spec = CF_SPEC[slug]
    kind, title, a, b = spec[0], spec[1], spec[2], spec[3]
    col = spec[-1]
    note = spec[4] if kind == 'calc' else b
    mono = font(MONO, 15, 'Medium')
    if kind == 'code':
        rrect(c, CX - 300, CY - 135, 600, 270, 14, fill=SURF, stroke=col, lw=2, alpha=ease_out(t / 0.4))
        text(c, title, font(MONO, 13, 'Bold'), CX - 280, CY - 112, color=MUTED, anchor='lm', alpha=ease_out(t / 0.4))
        for j, ln in enumerate(a):
            n = int(len(ln) * clamp((t - 0.4 - j * 0.45) / 0.45))
            strike = slug == 'url-tracking-cleaner' and ln.strip().startswith('&')
            text(c, ln[:n], font(MONO, 17, 'Medium'), CX - 270, CY - 70 + j * 40, color=col if j in (0, len(a) - 1) else TEXT, anchor='lm')
            if strike and n == len(ln):
                k = ease_in_out((t - 2.6) / 0.4)
                if k > 0:
                    line(c, CX - 270, CY - 70 + j * 40, CX - 270 + 230 * k, CY - 70 + j * 40, ORANGE_, 3)
        badge(c, CX + 190, CY + 160, b, col, ease_out((t - 2.8) / 0.4), 14)
        return
    if kind == 'tags':
        fmt_card(c, CX - 240, CY, title.split('.')[-1].upper()[:5], col, 1, seed=s)
        text(c, title, font(MONO, 13, 'Bold'), CX - 240, CY + 115, color=MUTED, alpha=ease_out(t / 0.4))
        for i, r_ in enumerate(a):
            y = CY - 90 + i * 56
            k = ease_out((t - 0.5 - i * 0.3) / 0.4)
            rrect(c, CX - 120, y - 20, 380, 40, 8, fill=SURF, stroke=LINE, alpha=k)
            text(c, r_, mono, CX - 100, y, color=TEXT, anchor='lm', alpha=k)
            if slug == 'media-metadata-remover':
                kk = ease_in_out((t - 2.0 - i * 0.2) / 0.4)
                if kk > 0:
                    line(c, CX - 105, y, CX - 105 + 340 * kk, y, ORANGE_, 3)
            else:
                circle(c, CX + 235, y, 7, fill=ORANGE_ if i < 2 else GOLD, alpha=k)
        badge(c, CX + 140, CY + 150, b, col, ease_out((t - 2.8) / 0.4), 14)
        return
    if kind in ('sheet', 'convert', 'merge'):
        if kind == 'convert':
            fmt_card(c, CX - 250, CY, title.split('.')[-1].upper()[:5] if '.' in title else 'FILE', GOLD, 1, seed=s)
            text(c, title, font(MONO, 13, 'Bold'), CX - 250, CY + 115, color=MUTED, alpha=ease_out(t / 0.4))
            arrow(c, CX - 150, CY, CX - 30, GOLD, 1, t)
            for i, f in enumerate(a):
                k = ease_out_back((t - 0.8 - i * 0.4) / 0.5)
                fmt_card(c, CX + 60 + i * 110, CY + (i - (len(a) - 1) / 2) * 12, f, col if i == 0 else [SKY, TEAL, EMERALD][i % 3], clamp(k), seed=s + i, scale=0.7)
            badge(c, CX + 160, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
            return
        if kind == 'merge':
            for i in range(3):
                k = ease_in_out((t - 0.4 - i * 0.2) / 1.2)
                fmt_card(c, lerp(CX - 300 + i * 40, CX + 120, k), CY - 30 + i * 30, title, [SKY, GOLD, TEAL][i], 1 - 0.6 * k, seed=s + i, scale=0.75)
            fmt_card(c, CX + 160, CY, 'DOCX', col, ease_out((t - 1.8) / 0.4), seed=s)
            text(c, a, font(MONO, 13, 'Bold'), CX + 160, CY + 115, color=MUTED, alpha=ease_out((t - 2) / 0.4))
            badge(c, CX - 120, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
            return
        x0, y0 = CX - 300, CY - 110
        hl = {}
        act = a
        if act == 'dedupe':
            for r_ in (2, 4, 5):
                if t > 1.4 + r_ * 0.15:
                    for cc in range(5): hl[(r_, cc)] = ORANGE_
        elif act == 'anon':
            for r_ in range(1, 7):
                if t > 1.2 + r_ * 0.2:
                    hl[(r_, 0)] = EMERALD; hl[(r_, 1)] = EMERALD
        elif act == 'join':
            for r_ in range(1, 7):
                if t > 1.6 + r_ * 0.15:
                    hl[(r_, 4)] = CYAN
        elif act == 'columns':
            for r_ in range(1, 7):
                if t > 1.4 + r_ * 0.12:
                    hl[(r_, 3)] = GOLD; hl[(r_, 4)] = GOLD
        elif act == 'clean':
            for r_ in (1, 3, 6):
                if t > 1.2 + r_ * 0.15:
                    hl[(r_, 2)] = EMERALD
        rows = 7
        if act == 'sort':
            k = ease_in_out((t - 1.2) / 1.0)
            order = [0, 4, 2, 6, 1, 5, 3]
            text(c, title, font(MONO, 13, 'Bold'), x0, y0 - 16, color=MUTED, anchor='lm')
            for r_ in range(rows):
                yy = lerp(y0 + order.index(r_) * 34, y0 + r_ * 34, k) if r_ else y0
                for cc in range(5):
                    fill = mix(SURF2, col, 0.45 if r_ == 0 else 0.12 + 0.05 * r_)
                    rrect(c, x0 + cc * 84, yy, 80, 30, 3, fill=fill, alpha=ease_out((t - r_ * 0.05) / 0.3))
        elif act == 'split':
            _sheet(c, x0, y0, 3, rows, 64, 34, col, 0.1, t, title=title)
            for i in range(3):
                k = ease_out_back((t - 1.2 - i * 0.35) / 0.5)
                _sheet(c, CX + 20 + i * 100, y0 + 30 + i * 18, 2, 4, 40, 26, [GOLD, TEAL, SKY][i], 1.2 + i * 0.35, t)
            arrow(c, CX - 90, CY, CX - 10, GOLD, 1, t)
        else:
            _sheet(c, x0, y0, 5, rows, 84, 34, col, 0.1, t, hl=hl, title=title)
        badge(c, CX + 210, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'calc':
        rrect(c, CX - 260, CY - 120, 520, 240, 16, fill=SURF, stroke=col, lw=2, alpha=ease_out(t / 0.4))
        text(c, title, font(MONO, 17, 'Medium'), CX, CY - 80, color=MUTED, alpha=ease_out((t - 0.2) / 0.4))
        k = ease_out((t - 0.6) / 1.6)
        v = a * k
        dec = 0 if float(a).is_integer() and a >= 10 else 2
        text(c, f'{v:,.{dec}f}', font(SANS, 64, 'Bold'), CX - 10, CY + 5, color=col)
        text(c, b, font(SANS, 20, 'SemiBold'), CX, CY + 62, color=TEXT, alpha=ease_out((t - 1.6) / 0.4))
        badge(c, CX + 180, CY + 150, note, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'curve':
        _grid(c, CX - 310, CY - 120, 620, 240, 40, col, 0.08)
        if slug == 'sunrise-sunset':
            pts = [(CX - 300 + i * 12, CY + 40 - 140 * math.sin(math.pi * i / 50)) for i in range(51)]
        elif slug == 'csv-grapher':
            pts = [(CX - 300 + i * 12, CY + 100 - 210 * (i / 50) ** 2) for i in range(51)]
            for i in range(0, 51, 5):
                circle(c, pts[i][0], pts[i][1] + (s * (i + 3) % 13 - 6), 5, fill=CYAN, alpha=ease_out((t - 0.2 - i * 0.02) / 0.3))
        else:
            pts = [(CX - 300 + i * 12, CY + 110 - 220 * 0.5 ** (i / 12)) for i in range(51)]
        _poly(c, pts, col, 4, 1, ease_in_out((t - 0.4) / 2.0))
        text(c, title, font(MONO, 14, 'Bold'), CX - 290, CY - 140, color=MUTED, anchor='lm', alpha=ease_out(t / 0.4))
        badge(c, CX + 200, CY - 100, a, col, ease_out((t - 1.6) / 0.4), 14)
        badge(c, CX + 200, CY + 150, b, GOLD, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'map':
        mx, my, mw, mh = CX - 330, SY + 15, 660, 300
        c.set_source_rgba(*rgbf(hexrgb('#0A1A26'))); rrect_path(c, mx, my, mw, mh, 12); c.fill()
        _grid(c, mx, my, mw, mh, 30, SKY, 0.10)
        pts = [(CX + x, my + mh / 2 + y) for x, y in _track(s, 48, 480, 200)]
        k = ease_in_out((t - 0.3) / 2.0)
        if a == 'zone':
            circle(c, CX - 40, my + mh / 2, 110, fill=EMERALD, alpha=0.15); circle(c, CX - 40, my + mh / 2, 110, stroke=EMERALD, lw=2)
        if a in ('dots', 'zone'):
            for i in range(0, 48, 3):
                x, y = pts[i]
                inside = math.hypot(x - (CX - 40), y - (my + mh / 2)) < 110
                circle(c, x, y + ((i * 37) % 60 - 30), 6, fill=(EMERALD if inside else ORANGE_) if a == 'zone' else [GOLD, CYAN, LIME_][i % 3], alpha=ease_out((t - 0.4 - i * 0.03) / 0.3))
        else:
            if a == 'two':
                p2 = [(x + 6 * math.sin(i / 3), y + 10) for i, (x, y) in enumerate(pts)]
                _poly(c, p2, GOLD, 3, 0.9, k)
            _poly(g, pts, CYAN, 10, 0.6, k)
            upto = k if a != 'trim' else min(k, 0.85)
            _poly(c, pts[3:] if a == 'trim' else pts, CYAN, 3.5, 1, upto)
            if a == 'pins':
                for i in range(6, 48, 8):
                    kk = ease_out_back((t - 1.6 - i * 0.03) / 0.4)
                    if kk > 0:
                        x, y = pts[i]
                        photo(c, x, y - 28, 34, 26, s + i, alpha=clamp(kk), stroke=GOLD)
        text(c, title, font(MONO, 13, 'Bold'), mx + 14, my + 18, color=MUTED, anchor='lm')
        badge(c, mx + mw - 100, my + mh - 26, b, col, ease_out((t - 2.6) / 0.4), 13)
        return
    if kind == 'wave':
        fmt_card(c, CX - 260, CY, 'MP3', col, 1, seed=s)
        vals = wave_vals(s, 36)
        k = ease_in_out((t - 1.0) / 1.2)
        for i, v in enumerate(vals):
            hh = 120 * v * (1 - 0.45 * k)
            rrect(c, CX - 140 + i * 13, CY - hh / 2, 8, hh, 3, fill=mix(GOLD, TEAL, k))
        badge(c, CX + 60, CY - 120, a, GOLD, ease_out((t - 0.8) / 0.4), 14)
        badge(c, CX + 200, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'chips':
        rrect(c, CX - 300, CY - 120, 260, 220, 12, fill=SURF, stroke=LINE)
        for j in range(5):
            line(c, CX - 280, CY - 90 + j * 34, CX - 280 + [210, 180, 200, 150, 120][j], CY - 90 + j * 34, MUTED, 6, 0.4)
        if slug == 'hashtag-generator':
            circle(g, CX - 10, CY - 130, 18, fill=GOLD, alpha=0.4 * (0.5 + 0.5 * math.sin(t * 4)))
            draw_sprite(c, icon_sprite('Sparkles', 26, GOLD), CX - 10, CY - 130, 1)
        for i, ch in enumerate(a):
            k = ease_out_back((t - 0.8 - i * 0.3) / 0.4)
            win = slug == 'giveaway-picker' and i == (s % 5) and t > 2.6
            badge(c, CX + 120, CY - 100 + i * 50, ch, GOLD if win or slug == 'hashtag-generator' else MUTED, clamp(k), 16)
        badge(c, CX + 120, CY + 160, b, col, ease_out((t - 3.0) / 0.4), 13)
        return
    if kind == 'frame':
        fw, fh = (180, 320) if title in ('captions', 'zones') else (320, 180) if title == 'thumb' else (260, 260)
        fx, fy = CX - 150 - fw / 2, CY - fh / 2
        photo(c, fx + fw / 2, CY, fw, fh, s, stroke=LINE)
        if title == 'captions':
            words = a.split()
            wi = int((t * 2) % len(words))
            for i, w in enumerate(words):
                text(c, w, font(SANS, 22, 'Bold'), fx + fw / 2, fy + fh - 90 + i * 26, color=GOLD if i == wi else (255, 255, 255))
        elif title == 'zones':
            k = ease_out((t - 0.8) / 0.5)
            rrect(c, fx, fy, fw, fh * 0.14, 0, fill=ORANGE_, alpha=0.45 * k)
            rrect(c, fx, fy + fh * 0.66, fw, fh * 0.34, 0, fill=ORANGE_, alpha=0.45 * k)
            rrect(c, fx + fw * 0.83, fy + fh * 0.38, fw * 0.17, fh * 0.48, 0, fill=ORANGE_, alpha=0.45 * k)
        elif title == 'thumb':
            text(c, a, font(SANS, 15, 'SemiBold'), fx, fy + fh + 22, color=TEXT, anchor='lm', alpha=ease_out((t - 0.6) / 0.4))
            for i in range(2):
                k = ease_out((t - 1.2 - i * 0.4) / 0.4)
                photo(c, CX + 160, CY - 80 + i * 110, 160, 90, s + 3 + i, alpha=k, stroke=GOLD if i == 0 else LINE)
        else:
            rrect(c, fx, fy, fw, fh, 8, fill=hexrgb('#0B0D10'), alpha=0.7)
            text(c, a, font(SANS, 20, 'Bold'), fx + fw / 2, CY, color=GOLD, alpha=ease_out((t - 0.6) / 0.6))
        badge(c, CX + 200, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'cal':
        gx, gy, cw, ch = CX - 245, CY - 120, 70, 40
        text(c, title, font(SANS, 18, 'Bold'), gx, gy - 18, color=col, anchor='lm', alpha=ease_out(t / 0.4))
        for i in range(35):
            r_, cc = divmod(i, 7)
            k = ease_out((t - 0.2 - i * 0.02) / 0.3)
            day = i - 1
            on = day in a
            rrect(c, gx + cc * cw, gy + r_ * (ch + 6), cw - 6, ch, 6, fill=mix(SURF2, col, 0.6 if on and t > 1.2 + a.index(day) * 0.15 else 0.08), alpha=k)
            if 1 <= day <= 30:
                text(c, str(day), font(MONO, 12, 'Medium'), gx + cc * cw + 8, gy + r_ * (ch + 6) + 12, color=MUTED, anchor='lm', alpha=k)
        badge(c, CX + 200, CY + 160, b, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'card':
        k = ease_in_out((t - 1.4) / 0.6)
        sx = abs(math.cos(math.pi * k))
        back = k > 0.5
        w_ = 360 * max(0.02, sx)
        rrect(c, CX - w_ / 2, CY - 110, w_, 200, 18, fill=SURF, stroke=col, lw=2)
        if sx > 0.3:
            text(c, a if back else title, font(SANS, 24 if not back else 18, 'Bold' if not back else 'Medium'), CX, CY - 10, color=col if not back else TEXT, alpha=sx)
        badge(c, CX + 200, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'quiz':
        text(c, title, font(SANS, 20, 'Bold'), CX, CY - 110, color=TEXT, alpha=ease_out(t / 0.4))
        opts = a
        for i, o in enumerate(opts):
            y = CY - 50 + i * 54
            k = ease_out((t - 0.5 - i * 0.2) / 0.4)
            right = i == 1 and t > 2.0
            rrect(c, CX - 200, y - 20, 400, 42, 10, fill=mix(SURF, EMERALD, 0.5) if right else SURF, stroke=EMERALD if right else LINE, alpha=k)
            text(c, f'{chr(97 + i)})  {o}', font(SANS, 17, 'SemiBold'), CX - 180, y, color=TEXT, anchor='lm', alpha=k)
        badge(c, CX + 200, CY + 160, b, col, ease_out((t - 2.8) / 0.4), 14)
        return
    if kind == 'worksheet':
        page(c, CX - 120, CY, 260, 300, 1, col, lines=0, seed=s)
        text(c, title, font(SANS, 15, 'Bold'), CX - 230, CY - 120, color=INK, anchor='lm')
        for i, it in enumerate(a):
            if not it:
                continue
            k = ease_out((t - 0.5 - i * 0.3) / 0.4)
            text(c, it, font(MONO, 15, 'Medium'), CX - 225, CY - 70 + i * 50, color=INK, anchor='lm', alpha=k)
            line(c, CX - 120 if slug == 'math-worksheet' else CX - 225, CY - 55 + i * 50, CX - 10, CY - 55 + i * 50, INK, 1, 0.4 * k)
        badge(c, CX + 160, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'grid':
        n = 9
        gx, gy, cs = CX - 270, CY - 135, 30
        letters = 'AQWERTYUIOPSDFGHJKLZXCVBNM'
        word = a
        for r_ in range(n):
            for cc in range(n):
                k = ease_out((t - 0.2 - (r_ + cc) * 0.03) / 0.3)
                inword = (r_ == 4 and 2 <= cc < 2 + len(word)) if slug == 'word-search-maker' else (cc == 4 and 2 <= r_ < 2 + len(word)) or (r_ == 2 and 1 <= cc < 6)
                if slug == 'crossword-maker' and not inword:
                    continue
                hit = inword and t > 1.8
                rrect(c, gx + cc * cs, gy + r_ * cs, cs - 3, cs - 3, 3, fill=mix(SURF2, col, 0.5 if hit else 0.08), alpha=k)
                ch = word[cc - 2] if slug == 'word-search-maker' and r_ == 4 and 2 <= cc < 2 + len(word) else word[r_ - 2] if slug == 'crossword-maker' and cc == 4 and 2 <= r_ < 2 + len(word) else letters[(r_ * 7 + cc * 3 + s) % 26]
                if slug == 'word-search-maker' or hit:
                    text(c, ch, font(MONO, 15, 'Bold'), gx + cc * cs + cs / 2 - 1, gy + r_ * cs + cs / 2 - 1, color=TEXT, alpha=k)
        text(c, title, font(SANS, 16, 'Bold'), CX + 70, CY - 100, color=col, anchor='lm', alpha=ease_out(t / 0.4))
        badge(c, CX + 160, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
        return
    if kind == 'rota':
        codes = a.split()
        text(c, title, font(SANS, 16, 'Bold'), CX - 300, CY - 130, color=col, anchor='lm')
        for p in range(4):
            text(c, f'Team {chr(65 + p)}', font(SANS, 13, 'SemiBold'), CX - 300, CY - 90 + p * 48, color=TEXT, anchor='lm')
            for dd in range(14):
                cd = codes[(dd + p * 2) % len(codes)]
                k = ease_out((t - 0.3 - dd * 0.05 - p * 0.1) / 0.3)
                fill = {'D': GOLD, 'N': SKY, 'O': SURF2}.get(cd, TEAL)
                rrect(c, CX - 210 + dd * 36, CY - 106 + p * 48, 32, 32, 5, fill=fill, alpha=k)
                text(c, cd, font(MONO, 12, 'Bold'), CX - 194 + dd * 36, CY - 90 + p * 48, color=INK if cd != 'O' else MUTED, alpha=k)
        badge(c, CX + 180, CY + 150, b, col, ease_out((t - 2.6) / 0.4), 14)
        return




def plan(tool):
    slug, cat, name = tool['slug'], tool['category'], tool['name']
    seed = seed_of(slug)
    rng = np.random.default_rng(seed)
    pal = [GOLD, TEAL, CYAN, EMERALD, SKY]
    cols = [pal[(seed + i * (1 + seed % 3)) % 5] for i in range(3)]
    if cols[0] != GOLD and rng.random() < 0.5:
        cols[0] = GOLD
    P = dict(slug=slug, name=name, cat=cat, desc=short_desc(tool['desc']), seed=seed % 1000, r=seed % 7, cols=cols, mirror=bool(seed & 1), n=3 + seed % 3)
    fn = None
    # ---- action routing (slug first, then category defaults)
    if slug in ('merge-pdf', 'image-to-pdf'):
        fn, P['kind'] = d_merge, ('img' if slug == 'image-to-pdf' else 'doc')
        if slug == 'image-to-pdf':
            fn, P['fmts'] = d_convert, ['JPG', 'PDF']
    elif slug == 'merge-videos':
        fn, P['kind'] = d_merge, 'film'
    elif slug == 'audio-merger':
        fn, P['act'] = d_audio, 'merge'
    elif slug in ('split-pdf',):
        fn, P['kind'] = d_split, 'pages'
    elif slug == 'extract-pdf-pages':
        fn, P['kind'] = d_split, 'extract'
    elif slug in ('compress-pdf', 'image-compressor', 'video-compressor', 'compress-to-size'):
        fn = d_compress
        P['kind'] = {'compress-pdf': 'doc', 'image-compressor': 'img', 'video-compressor': 'film', 'compress-to-size': 'img'}[slug]
        b = int(rng.integers(2400, 9800)) if slug != 'video-compressor' else int(rng.integers(60000, 180000))
        P['kb'] = (b, b * rng.uniform(0.12, 0.3))
    elif cat == 'convert':
        fn = d_convert
    if fn is None:
        doc_acts = {'organize-pdf': 'organize', 'delete-pdf-pages': 'delete', 'rotate-pdf': 'rotate', 'pdf-page-numbers': 'numbers',
                    'pdf-watermark': 'watermark', 'pdf-header-footer': 'header', 'sign-pdf': 'sign', 'edit-pdf': 'edit',
                    'protect-pdf': 'protect', 'unlock-pdf': 'unlock', 'redact-pdf': 'redact', 'pdf-grayscale': 'grayscale',
                    'crop-pdf': 'crop', 'flatten-pdf': 'flatten', 'pdf-metadata': 'metadata', 'fill-pdf-form': 'form',
                    'compare-pdf': 'compare', 'nup-pdf': 'nup', 'ocr-pdf': 'ocr', 'pdf-reader': 'reader', 'add-blank-pages': 'insert',
                    'repair-pdf': 'repair', 'invoice-generator': 'invoice', 'resume-builder': 'resume'}
        img_acts = {'image-resizer': 'resize', 'image-cropper': 'crop', 'background-remover': 'bgremove', 'image-upscaler': 'upscale',
                    'image-rotate-flip': 'rotate', 'image-watermark': 'watermark', 'add-text-to-image': 'text', 'rounded-corners': 'rounded',
                    'image-filters': 'filters', 'blur-faces': 'blur', 'image-metadata-remover': 'exif', 'image-to-svg': 'svg',
                    'screenshot-studio': 'screenshot', 'collage-maker': 'collage', 'meme-generator': 'meme', 'gif-maker': 'gif',
                    'image-to-base64': 'base64', 'image-splitter': 'splitter', 'color-picker-image': 'picker',
                    'passport-photo': 'crop', 'image-compare': 'compare'}
        vid_acts = {'video-trimmer': 'trim', 'video-to-gif': 'gif', 'extract-audio': 'extract', 'mute-video': 'mute', 'video-speed': 'speed',
                    'video-upscaler': 'upscale', 'screen-recorder': 'record', 'webcam-recorder': 'webcam'}
        aud_acts = {'audio-editor': 'editor', 'audio-converter': 'convert', 'voice-recorder': 'record', 'audio-transcriber': 'transcribe',
                    'text-to-speech': 'tts', 'audio-speed-pitch': 'speed', 'audio-equalizer': 'eq', 'midi-player': 'midi',
                    'pdf-to-speech': 'tts', 'audio-mixer': 'merge', 'music-visualizer': 'record', 'waveform-image': 'convert'}
        img_acts.update({'photo-effects': 'filters', 'hdr-exr-viewer': 'filters', 'halftone-generator': 'compare', 'pixel-art-converter': 'compare',
                         'dicom-viewer': 'filters', 'exif-editor': 'exif', 'html-to-image': 'screenshot', 'color-blindness-simulator': 'compare',
                         'card-maker': 'text', 'social-image-maker': 'text', 'mockup-generator': 'screenshot'})
        doc_acts.update({'resize-pdf-pages': 'crop', 'flip-pdf': 'rotate', 'overlay-pdf': 'flatten', 'alternate-mix-pdf': 'organize',
                         'pdf-bookmarks': 'reader', 'pdf-link-editor': 'edit', 'create-pdf-form': 'form', 'pdf-viewer-preferences': 'metadata',
                         'remove-annotations': 'flatten', 'sanitize-pdf': 'redact', 'pdf-inspector': 'metadata', 'remove-blank-pages': 'delete',
                         'pdf-adjust-colors': 'grayscale', 'search-pdfs': 'reader', 'validate-pdfa': 'ocr', 'pdf-accessibility-check': 'ocr'})
        if cat == 'pdf' and slug not in doc_acts:
            # keyword routing for PDF tools added later
            for kw, act in (('merge', 'organize'), ('combine', 'organize'), ('rotate', 'rotate'), ('flip', 'rotate'), ('crop', 'crop'),
                            ('sign', 'sign'), ('unlock', 'unlock'), ('protect', 'protect'), ('encrypt', 'protect'), ('watermark', 'watermark'),
                            ('remove', 'delete'), ('delete', 'delete'), ('check', 'ocr'), ('valid', 'ocr'), ('ocr', 'ocr'), ('scan', 'ocr'),
                            ('edit', 'edit'), ('form', 'form'), ('meta', 'metadata'), ('inspect', 'metadata'), ('color', 'grayscale'),
                            ('gray', 'grayscale'), ('redact', 'redact'), ('compare', 'compare'), ('number', 'numbers'), ('header', 'header')):
                if kw in slug:
                    doc_acts[slug] = act
                    break
        if slug in ('split-page-halves', 'pdf-attachments', 'extract-pdf-images', 'pdf-poster'):
            fn, P['kind'] = d_split, {'split-page-halves': 'pages', 'pdf-attachments': 'extract', 'extract-pdf-images': 'frames', 'pdf-poster': 'grid'}[slug]
            if slug == 'split-page-halves':
                P['n'] = 2
        elif slug in ('rasterize-pdf', 'pdf-to-pdfa'):
            fn, P['fmts'] = d_convert, (['PDF', 'PNG', 'PDF'] if slug == 'rasterize-pdf' else ['PDF', 'PDF/A'])
        elif slug == 'linearize-pdf':
            fn, P['kind'] = d_compress, 'doc'
            P['kb'] = (4200.0, 1500.0)
        elif slug in doc_acts:
            fn, P['act'] = d_doc, doc_acts[slug]
        img_acts.update({'gif-optimizer': 'gif', 'gif-editor': 'gif', 'gif-transform': 'rotate', 'gif-speed-reverse': 'gif',
                         'gif-overlay': 'watermark', 'gif-effects': 'filters', 'gif-combine': 'collage', 'gif-splitter': 'splitter',
                         'static-to-gif': 'gif', 'gif-analyzer': 'exif', 'gif-repair': 'gif', 'sprite-sheet': 'splitter',
                         'gif-to-bitmap': 'gif', 'webp-maker': 'gif', 'apng-maker': 'gif', 'jxl-maker': 'gif',
                         'motion-photo-extractor': 'gif', 'video-crop': 'crop', 'video-rotate': 'rotate', 'video-watermark': 'watermark',
                         'add-text-to-video': 'text', 'video-filters': 'filters', 'blur-video': 'blur', 'video-delogo': 'blur',
                         'split-screen-video': 'collage', 'video-overlay': 'watermark', 'video-background-remover': 'bgremove'})
        vid_acts.update({'video-reverse': 'speed', 'video-resize': 'upscale', 'video-fps': 'speed', 'add-audio-to-video': 'extract',
                         'images-to-video': 'merge', 'pdf-to-video': 'merge', 'teleprompter': 'record', 'device-test': 'webcam',
                         'video-stabilizer': 'play', 'freeze-frame': 'frames'})
        if slug == 'burn-subtitles':
            fn = d_extra; P['cat'] = 'subtitle'
        elif slug in ('gif-optimizer',):
            fn, P['kind'] = d_compress, 'img'
            P['kb'] = (5200.0, 1300.0)
        elif slug in ('animated-converter', 'lottie-converter', 'aseprite-converter', 'legacy-anim-converter', 'data-converter', 'geo-converter'):
            fn, P['fmts'] = d_convert, convert_formats(tool)
        elif slug == 'freeze-frame':
            fn, P['kind'] = d_split, 'frames'
        elif slug in img_acts:
            fn, P['act'] = d_image, img_acts[slug]
        elif cat == 'audio':
            fn, P['act'] = d_audio, aud_acts.get(slug, ['editor', 'record', 'convert'][seed % 3] if slug not in aud_acts else aud_acts[slug])
        elif slug == 'video-frames':
            fn, P['kind'] = d_split, 'frames'
        elif slug in vid_acts:
            fn, P['act'] = d_video, vid_acts[slug]
        elif slug in aud_acts:
            fn, P['act'] = d_audio, aud_acts[slug]
        elif slug in ('image-converter', 'video-converter', 'heic-converter', 'raw-converter', 'pro-image-converter', 'svg-converter', 'icon-converter'):
            fn = d_convert
        elif cat == 'dev':
            fn = d_dev
        elif cat == 'text':
            fn = d_text
        elif cat == 'design':
            fn = d_design
        elif slug in CF_SPEC:
            fn = d_cf
        elif cat in ('finance', 'health'):
            fn = d_r13
        elif cat in ('privacy', 'geo', 'office', 'science', 'creator') or slug in NEW_AI_VISION or slug in NEW_AI_TEXT:
            fn = d_new
        elif cat in ('data', 'ai', '3d', 'archive', 'ebook', 'font', 'cad', 'subtitle'):
            fn = d_extra
        elif cat == 'image':
            fn, P['act'] = d_image, 'plain'
        elif cat == 'video':
            fn, P['act'] = d_video, 'play'
        elif cat == 'audio':
            fn, P['act'] = d_audio, 'editor'
        else:
            fn, P['act'] = d_doc, 'reader'
    if fn is d_convert and 'fmts' not in P:
        P['fmts'] = convert_formats(tool)
    return fn, P


def convert_formats(tool):
    slug, name = tool['slug'], tool['name']
    fixed = {'image-converter': ['PNG', 'JPG', 'WEBP', 'AVIF', 'GIF'], 'video-converter': ['MP4', 'WEBM', 'MOV', 'MKV'],
             'heic-converter': ['HEIC', 'JPG', 'PNG', 'WEBP'], 'raw-converter': ['RAW', 'JPG', 'PNG', 'TIFF'],
             'pro-image-converter': ['PNG', 'JPG', 'WEBP', 'AVIF', 'JXL'], 'svg-converter': ['SVG', 'PNG', 'PDF'],
             'icon-converter': ['PNG', 'ICO', 'ICNS', 'CUR'], 'table-converter': ['CSV', 'XLSX', 'JSON', 'MD'],
             'pdf-to-image': ['PDF', 'PNG', 'JPG', 'WEBP'], 'pdf-to-text': ['PDF', 'TXT'], 'pdf-to-word': ['PDF', 'DOCX'],
             'word-to-pdf': ['DOCX', 'PDF'], 'pdf-to-ppt': ['PDF', 'PPTX'], 'excel-to-pdf': ['XLSX', 'PDF'], 'pdf-to-excel': ['PDF', 'XLSX'],
             'markdown-to-pdf': ['MD', 'PDF'], 'html-to-pdf': ['HTML', 'PDF'], 'text-to-pdf': ['TXT', 'PDF'], 'epub-to-pdf': ['EPUB', 'PDF']}
    if slug in fixed:
        return fixed[slug]
    fixed2 = {'document-converter': ['DOCX', 'PDF', 'MD', 'HTML'], 'office-viewer': ['DOCX', 'XLSX', 'PPTX'],
              'rtf-converter': ['RTF', 'PDF', 'DOCX'], 'email-viewer': ['EML', 'MSG', 'PDF']}
    if slug in fixed2:
        return fixed2[slug]
    alias = {'MARKDOWN': 'MD', 'POWERPOINT': 'PPTX', 'EXCEL': 'XLSX', 'WORD': 'DOCX', 'IMAGE': 'PNG', 'TEXT': 'TXT', 'PHOTO': 'JPG'}
    m = re.match(r'(\w+) to (\w+)', name)
    if m:
        return [alias.get(m.group(1).upper(), m.group(1).upper()[:5]), alias.get(m.group(2).upper(), m.group(2).upper()[:5])]
    toks = []
    for tk in re.findall(r'\b[A-Z][A-Z0-9]{1,4}\b', tool.get('desc') or ''):
        if tk not in toks and tk not in ('PDF', 'AI', 'CSS', 'API'):
            toks.append(tk)
    return (toks[:4] if len(toks) >= 2 else ['FILE', 'PDF'])


# ----------------------------------------------------------------------------- frame composition
class Renderer:
    def __init__(self, tool, dur, vo_at):
        self.tool = tool
        self.dur = dur
        self.vo_at = vo_at
        self.fn, self.P = plan(tool)
        seed = seed_of(tool['slug'])
        self.seed = seed
        self.acc = CAT_COLORS[tool['category']]
        gp = ((0.2 + (seed % 7) / 10), 0.25 + (seed % 5) / 20)
        self.bg = make_background(W, H, glow_pos=gp, glow2=(1 - gp[0], 0.95), c1=GOLD, c2=self.P['cols'][1] if self.P['cols'][1] != GOLD else TEAL, strength=0.9)
        self.parts = Particles(40, W, H, seed=seed % 997, speed=8, size=(0.6, 1.6))
        self.surf = surface(W, H)
        self.ctx = cairo.Context(self.surf)
        self.gl = GlowLayer(W, H, 4)
        self.demo_start = 1.7
        self.outro = dur - 1.5
        self.desc = short_desc(tool['desc'])

    def caption_lines(self):
        f = font(SANS, 18, 'Medium')
        out, cur = [], ''
        for w_ in self.desc.split():
            if f.getlength(cur + ' ' + w_) > 760:
                out.append(cur); cur = w_
            else:
                cur = (cur + ' ' + w_).strip()
        out.append(cur)
        return out[:2]

    def frame(self, t):
        c = self.ctx
        c.set_operator(cairo.OPERATOR_SOURCE); c.set_source_surface(self.bg, 0, 0); c.paint(); c.set_operator(cairo.OPERATOR_OVER)
        g = self.gl.begin(); self.gl.dirty = True
        self.parts.draw(c, t, 0.45)
        tool = self.tool
        # ---- title: big centred intro -> header
        k_move = ease_in_out((t - 1.15) / 0.6)
        out_k = ease_in_out((t - self.outro) / 0.5)
        # icon ring
        ix, iy = lerp(W / 2, 52, k_move), lerp(205, 50, k_move)
        ir = lerp(54, 24, k_move)
        a_ring = ease_out(t / 0.6) * (1 - out_k)
        gold_ring(c, g, ix, iy, ir, t, alpha=a_ring, progress=ease_in_out(t / 0.8), lw=lerp(4.5, 2.6, k_move), orbit=k_move < 0.5)
        draw_sprite(c, icon_sprite(tool['icon'] or 'File', int(lerp(56, 26, k_move)), self.acc, 2.0), ix, iy, ease_out((t - 0.3) / 0.4) * (1 - out_k))
        # name
        if k_move < 1:
            a_ = (1 - k_move)
            sz_ = 58 if len(tool['name']) < 20 else 46
            while font(DISPLAY, sz_, 'Bold').getlength(tool['name']) > 860 and sz_ > 26:
                sz_ -= 2
            fs = font(DISPLAY, sz_, 'Bold')
            kinetic_words(c, tool['name'], fs, W / 2, 320, t - 0.35, gradient=GOLD_GRAD, rise=26, alpha=a_)
            chip_a = ease_out((t - 0.7) / 0.4) * a_
            if chip_a > 0:
                lab = CAT_NAMES[tool['category']].upper() + (f'  ·  {tool["badge"]}' if tool.get('badge') else '')
                text(c, lab, font(MONO, 15, 'Bold'), W / 2, 380, color=self.acc, alpha=chip_a, tracking=3)
        if k_move > 0:
            a_ = k_move * (1 - out_k)
            hs = 28
            while font(DISPLAY, hs, 'Bold').getlength(tool['name']) > 640 and hs > 18:
                hs -= 1
            text(c, tool['name'], font(DISPLAY, hs, 'Bold'), 90, 50, color=TEXT, alpha=a_, anchor='lm')
            lab = CAT_NAMES[tool['category']]
            f = font(SANS, 14, 'SemiBold')
            tw = f.getlength(lab) + 28
            rrect(c, W - 40 - tw, 36, tw, 28, 14, fill=self.acc, stroke=self.acc, lw=1.5, falpha=0.12, salpha=0.7, alpha=a_)
            text(c, lab, f, W - 40 - tw / 2, 50, alpha=a_)
            line(c, 40, 84, W - 40, 84, LINE, 1, a_ * 0.8)
        # ---- demo stage
        if t > self.demo_start - 0.2:
            dt = t - self.demo_start
            a_ = ease_out((dt + 0.2) / 0.5) * (1 - out_k)
            if a_ > 0.01:
                c.push_group()
                try:
                    self.fn(c, g, max(0, dt), self.outro - self.demo_start, self.P)
                except Exception:
                    traceback.print_exc()
                    raise
                c.pop_group_to_source()
                c.paint_with_alpha(a_)
        # ---- caption (description) in sync with the voice
        ca = ease_out((t - self.vo_at - 0.1) / 0.5) * (1 - out_k)
        if ca > 0:
            lines_ = self.caption_lines()
            y0 = 478 if len(lines_) == 2 else 492
            for i, ln in enumerate(lines_):
                text(c, ln, font(SANS, 18, 'Medium'), W / 2, y0 + i * 27, color=hexrgb('#D9D5CC'), alpha=ca)
        # ---- outro
        if out_k > 0:
            ot = t - self.outro
            logo_mark(c, g, W / 2, 220, 120, t, alpha=out_k, progress=ease_in_out(ot / 0.8))
            text(c, 'OpenFile', font(DISPLAY, 54, 'Bold'), W / 2, 340, gradient=GOLD_GRAD, alpha=ease_out((ot - 0.2) / 0.5))
            text(c, 'Free. Private. Runs in your browser.', font(SANS, 20, 'Medium'), W / 2, 392, color=MUTED, alpha=ease_out((ot - 0.4) / 0.5))
        self.gl.apply(c, radius=5, strength=0.9, passes=1)
        # global fade in / out
        fade = min(ease_in_out(t / 0.25), ease_in_out((self.dur - t) / 0.35))
        if fade < 1:
            c.set_source_rgba(0, 0, 0, 1 - fade); c.paint()
        return self.surf


# ----------------------------------------------------------------------------- one tool
_TTS = None


def get_tts(threads):
    global _TTS
    if _TTS is None:
        _TTS = TTS(threads=threads)
    return _TTS


def render_tool(job):
    tool, voice_spec, threads = job['tool'], tuple(job['voice']), job['threads']
    slug = tool['slug']
    t0 = time.time()
    try:
        os.makedirs(TMP, exist_ok=True)
        tts = get_tts(threads)
        vo_text = f"{re.sub(r'\s*\([^)]*\)', '', tool['name'])}. {short_desc(tool['desc'])}"
        speed = 1.0
        voice = tts.say(vo_text, voice_spec, speed)
        if len(voice) / SR > 8.0:
            speed = min(1.25, len(voice) / SR / 7.6)
            voice = tts.say(vo_text, voice_spec, speed)
        vo_at = 0.55
        dur = clamp(vo_at + len(voice) / SR + 2.2, 8.0, 12.0)
        dur = round(dur * FPS) / FPS
        seed = seed_of(slug)
        music, info = make_music(dur, seed=seed, intro=1.2, outro=1.6, beat_start=1.6, beat_end=dur - 1.4)
        vbuf = np.zeros(int(dur * SR), np.float32)
        _add(vbuf, vo_at * SR, voice)
        mixed = duck_mix(music, vbuf, 1.0, 0.42, 0.55)[:, :int(dur * SR)]
        raw = os.path.join(TMP, f'{slug}_raw.wav')
        write_wav(raw, mixed)
        norm = os.path.join(TMP, f'{slug}.wav')
        loudnorm_two_pass(raw, norm, I=-16, TP=-1.5)
        # video
        R = Renderer(tool, dur, vo_at)
        vtmp = os.path.join(TMP, f'{slug}_v.mp4')
        pipe = FFPipe(vtmp, W, H, FPS, crf=28, preset='medium', maxrate='300k', tune='animation', extra=['-g', '90', '-threads', '1'])
        nfr = int(round(dur * FPS))
        for i in range(nfr):
            pipe.write(R.frame(i / FPS))
        pipe.close()
        out = os.path.join(OUT, f'{slug}.mp4')
        part = out + '.part.mp4'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', vtmp, '-i', norm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                        '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-ar', '44100', '-shortest', '-movflags', '+faststart', part], check=True)
        # hard size cap (target <= 350 KB): re-encode the video track tighter when a busy demo overshoots
        tries = 0
        while os.path.getsize(part) > 340 * 1024 and tries < 3:
            tries += 1
            kbps = int((330 * 1024 * 8 / dur - 52000) / 1000 * (0.92 ** (tries - 1)))
            v2 = os.path.join(TMP, f'{slug}_v2.mp4')
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', vtmp, '-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation',
                            '-crf', str(28 + 3 * tries), '-maxrate', f'{kbps}k', '-bufsize', f'{kbps}k', '-g', '90', '-pix_fmt', 'yuv420p',
                            '-threads', '1', '-an', v2], check=True)
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', v2, '-i', norm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                            '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-ar', '44100', '-shortest', '-movflags', '+faststart', part], check=True)
            os.remove(v2)
        os.replace(part, out)
        # poster: mid-demo frame
        pt = min(R.outro - 0.4, R.demo_start + 2.6)
        img = Image.frombuffer('RGBA', (W, H), bytes(R.frame(pt).get_data()), 'raw', 'BGRA', 0, 1).convert('RGB')
        img.resize((480, 270), Image.LANCZOS).save(os.path.join(OUT, f'{slug}.jpg'), quality=84, optimize=True, progressive=True)
        for f in (raw, norm, vtmp):
            try:
                os.remove(f)
            except OSError:
                pass
        size = os.path.getsize(out)
        return dict(slug=slug, ok=True, duration=round(dur, 2), voice=voice_name(voice_spec), size=size, music=info, secs=round(time.time() - t0, 1))
    except Exception as e:
        traceback.print_exc()
        return dict(slug=slug, ok=False, error=repr(e))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--still', nargs=3, metavar=('SLUG', 'T', 'PNG'))
    a = ap.parse_args()
    tools = load_registry()
    voices = voice_sequence(max(len(tools) * 2, 400))
    vmap = {t['slug']: v for t, v in zip(tools, voices)}
    if a.still:
        tool = next(t for t in tools if t['slug'] == a.still[0])
        R = Renderer(tool, 9.0, 0.55)
        R.frame(float(a.still[1])).write_to_png(a.still[2])
        return
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, 'index.json')
    index = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    only = set(s for s in a.only.split(',') if s)
    todo = []
    for t in tools:
        if only and t['slug'] not in only:
            continue
        exists = os.path.exists(os.path.join(OUT, t['slug'] + '.mp4')) and os.path.exists(os.path.join(OUT, t['slug'] + '.jpg'))
        if exists and not a.force and not only:
            if t['slug'] not in index:   # rendered earlier but the index was not written: backfill the entry
                pth = os.path.join(OUT, t['slug'] + '.mp4')
                dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', pth],
                                           capture_output=True, text=True).stdout.strip() or 0)
                index[t['slug']] = dict(video=f"media/tools/{t['slug']}.mp4", poster=f"media/tools/{t['slug']}.jpg",
                                        duration=round(dur, 2), voice=voice_name(vmap.get(t['slug'], voices[0])), bytes=os.path.getsize(pth))
            continue
        spec = vmap.get(t['slug'])
        used = {e.get('voice') for k_, e in index.items() if k_ != t['slug']} | {voice_name(tuple(j['voice'])) for j in todo}
        if spec is None or voice_name(spec) in used:
            spec = next((v for v in voices if voice_name(v) not in used), spec or voices[-1])
        todo.append(dict(tool=t, voice=list(spec), threads=1 if a.jobs > 1 else None))
    print(f'{len(tools)} tools in registry, rendering {len(todo)} with {a.jobs} jobs', flush=True)
    results = []
    if a.jobs > 1 and len(todo) > 1:
        import multiprocessing as mp
        with mp.get_context('fork').Pool(a.jobs, maxtasksperchild=12) as pool:
            for r in pool.imap_unordered(render_tool, todo):
                print(json.dumps({k: r.get(k) for k in ('slug', 'ok', 'size', 'duration', 'voice', 'secs', 'error')}), flush=True)
                results.append(r)
                _update_index(index, r, idx_path)
    else:
        for j in todo:
            r = render_tool(j)
            print(json.dumps({k: r.get(k) for k in ('slug', 'ok', 'size', 'duration', 'voice', 'secs', 'error')}), flush=True)
            results.append(r)
            _update_index(index, r, idx_path)
    # prune removed tools from the index, keep registry order
    slugs = [t['slug'] for t in tools]
    index = {s: index[s] for s in slugs if s in index}
    json.dump(index, open(idx_path, 'w'), indent=2)
    bad = [r['slug'] for r in results if not r['ok']]
    print('done', len(results) - len(bad), 'ok', ('failed: ' + ','.join(bad)) if bad else '')


def _update_index(index, r, path):
    if not r.get('ok'):
        return
    s = r['slug']
    index[s] = dict(video=f'media/tools/{s}.mp4', poster=f'media/tools/{s}.jpg', duration=r['duration'], voice=r['voice'],
                    bytes=r['size'], music=f"{r['music']['key']} {r['music']['bpm']} bpm {r['music']['lead']}")
    json.dump(index, open(path, 'w'), indent=2)


if __name__ == '__main__':
    main()

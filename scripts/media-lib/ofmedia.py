"""
OpenFile media kit: shared helpers for the launch film and the per-tool preview videos.

Open-source stack only:
  * cairocffi (vector drawing, anti-aliased shapes)   * Pillow (text rasterising, blur)
  * numpy (procedural music synth, mixing)             * cairosvg (lucide icon rendering)
  * kokoro-onnx + onnxruntime (neural TTS, Apache-2.0)  * ffmpeg (encode, loudnorm)

Brand palette (gold-on-black). No purple / violet / magenta / pink anywhere.
"""
from __future__ import annotations

import io
import json
import math
import os
import re
import subprocess
import hashlib
from functools import lru_cache

import numpy as np
import cairocffi as cairo
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
FONT_DIR = os.environ.get('OF_FONTS', os.path.join(HERE, 'fonts'))
TTS_DIR = os.environ.get('OF_TTS_DIR', '/workspace/work/video/tts')
CACHE_DIR = os.environ.get('OF_CACHE', os.path.join(HERE, '.cache'))
os.makedirs(CACHE_DIR, exist_ok=True)

# ----------------------------------------------------------------------------- palette
def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

BLACK = hexrgb('#050505')
NEAR = hexrgb('#0B0D10')
SURF = hexrgb('#12151A')
SURF2 = hexrgb('#191D23')
LINE = hexrgb('#262B33')
GOLD = hexrgb('#F5A524')
GLOW = hexrgb('#FFB224')
GOLD_DEEP = hexrgb('#B8741A')
TEAL = hexrgb('#14B8A6')
CYAN = hexrgb('#22D3EE')
EMERALD = hexrgb('#10B981')
SKY = hexrgb('#38BDF8')
TEXT = hexrgb('#F5F3EE')
MUTED = hexrgb('#9A968C')
DIM = hexrgb('#5E5B55')

ACCENTS = [GOLD, TEAL, CYAN, EMERALD, SKY]
CAT_COLORS = {
    'pdf': GOLD, 'convert': SKY, 'image': EMERALD, 'video': CYAN,
    'audio': TEAL, 'dev': CYAN, 'text': GOLD, 'design': SKY,
    'data': SKY, 'ai': GOLD, '3d': CYAN, 'archive': GOLD, 'ebook': EMERALD, 'font': GOLD, 'cad': SKY, 'subtitle': TEAL,
    'privacy': EMERALD, 'geo': SKY, 'office': GOLD, 'science': hexrgb('#A3E635'), 'creator': hexrgb('#FB923C'),
}
CAT_NAMES = {
    'pdf': 'PDF', 'convert': 'Convert', 'image': 'Image', 'video': 'Video', 'audio': 'Audio',
    'dev': 'Developer', 'text': 'Text & Data', 'design': 'Design',
    'data': 'Data', 'ai': 'AI', '3d': '3D', 'archive': 'Archives', 'ebook': 'eBooks', 'font': 'Fonts', 'cad': 'CAD', 'subtitle': 'Subtitles',
    'privacy': 'Security & Privacy', 'geo': 'Maps & GPS', 'office': 'Office & Sheets', 'science': 'Science & Education', 'creator': 'Creator Studio',
}


def rgbf(c, a=1.0):
    return (c[0] / 255.0, c[1] / 255.0, c[2] / 255.0, a)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def assert_palette_safe(rgb):
    """True if a colour is NOT in the purple/magenta/pink family (hue 255..345 with chroma)."""
    r, g, b = [v / 255 for v in rgb[:3]]
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 0.12:
        return True
    if mx == r:
        h = (60 * ((g - b) / (mx - mn)) + 360) % 360
    elif mx == g:
        h = 60 * ((b - r) / (mx - mn)) + 120
    else:
        h = 60 * ((r - g) / (mx - mn)) + 240
    return not (255 <= h <= 345)


# ----------------------------------------------------------------------------- easing
def clamp(t, a=0.0, b=1.0):
    return a if t < a else b if t > b else t

def ease_out(t):
    t = clamp(t); return 1 - (1 - t) ** 3

def ease_in_out(t):
    t = clamp(t); return t * t * (3 - 2 * t)

def ease_out_back(t, s=1.6):
    t = clamp(t) - 1
    return t * t * ((s + 1) * t + s) + 1

def ease_out_expo(t):
    t = clamp(t); return 1 if t >= 1 else 1 - 2 ** (-10 * t)

def lerp(a, b, t):
    return a + (b - a) * t

def win(t, a, b, fade=0.3):
    """1 inside [a,b] with eased fades of `fade` seconds at both ends."""
    return ease_in_out((t - a) / fade) * ease_in_out((b - t) / fade)


# ----------------------------------------------------------------------------- fonts / text sprites
@lru_cache(maxsize=256)
def font(name, size, weight='Bold'):
    f = ImageFont.truetype(os.path.join(FONT_DIR, name), int(size))
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f

DISPLAY = 'SpaceGrotesk.ttf'
SANS = 'Inter.ttf'
MONO = 'JetBrainsMono.ttf'


def pil_to_surface(img):
    """PIL RGBA -> cairo ARGB32 (premultiplied)."""
    a = np.asarray(img.convert('RGBA'), dtype=np.uint16)
    al = a[..., 3:4]
    pm = (a[..., :3] * al // 255).astype(np.uint8)
    bgra = np.empty(a.shape, np.uint8)
    bgra[..., 0] = pm[..., 2]; bgra[..., 1] = pm[..., 1]; bgra[..., 2] = pm[..., 0]
    bgra[..., 3] = al[..., 0]
    h, w = bgra.shape[:2]
    buf = bytearray(bgra.tobytes())
    s = cairo.ImageSurface.create_for_data(buf, cairo.FORMAT_ARGB32, w, h, w * 4)
    s._keep = buf  # keep buffer alive
    return s


class Sprite:
    __slots__ = ('surf', 'ax', 'ay', 'w', 'h')

    def __init__(self, surf, ax, ay):
        self.surf, self.ax, self.ay = surf, ax, ay
        self.w, self.h = surf.get_width(), surf.get_height()


_SPRITES: dict = {}


def text_sprite(s, fnt, color=TEXT, anchor='mm', gradient=None, tracking=0, shadow=None):
    key = (s, id(fnt), color, anchor, gradient, tracking, shadow)
    sp = _SPRITES.get(key)
    if sp is not None:
        return sp
    pad = 6 + (int(shadow[0]) * 3 if shadow else 0)
    if tracking:
        widths = [fnt.getlength(ch) for ch in s]
        total = sum(widths) + tracking * (len(s) - 1)
        asc, desc = fnt.getmetrics()
        W, H = int(total + pad * 2 + 4), int(asc + desc + pad * 2)
        mask = Image.new('L', (W, H), 0)
        md = ImageDraw.Draw(mask)
        x = pad
        for ch, cw in zip(s, widths):
            md.text((x, pad), ch, font=fnt, fill=255)
            x += cw + tracking
        # anchor
        axm = {'l': pad, 'm': pad + total / 2, 'r': pad + total}[anchor[0]]
        aym = {'a': pad, 't': pad, 'm': pad + (asc + desc) / 2, 's': pad + asc, 'b': pad + asc + desc, 'd': pad + asc + desc}[anchor[1]]
    else:
        bb = fnt.getbbox(s, anchor=anchor)
        W, H = int(bb[2] - bb[0] + pad * 2), int(bb[3] - bb[1] + pad * 2)
        W, H = max(W, 2), max(H, 2)
        mask = Image.new('L', (W, H), 0)
        axm, aym = pad - bb[0], pad - bb[1]
        ImageDraw.Draw(mask).text((axm, aym), s, font=fnt, fill=255, anchor=anchor)
    if gradient:
        grad = gradient_image(W, H, gradient)
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        img.paste(grad, (0, 0), mask)
    else:
        img = Image.new('RGBA', (W, H), color + (0,))
        img.putalpha(mask)
        solid = Image.new('RGBA', (W, H), color + (255,))
        img = Image.composite(solid, img, mask)
        img.putalpha(mask)
    if shadow:
        r, sc, sa = shadow
        sh = Image.new('RGBA', (W, H), sc + (0,))
        sh.putalpha(mask.filter(ImageFilter.GaussianBlur(r)).point(lambda v: int(v * sa)))
        sh.alpha_composite(img)
        img = sh
    sp = Sprite(pil_to_surface(img), axm, aym)
    _SPRITES[key] = sp
    return sp


def gradient_image(w, h, stops):
    """Horizontal gradient through colour stops (tuple of rgb tuples)."""
    x = np.linspace(0, 1, w)
    n = len(stops) - 1
    out = np.zeros((h, w, 3), np.float32)
    seg = np.minimum((x * n).astype(int), n - 1)
    f = x * n - seg
    st = np.array(stops, np.float32)
    row = st[seg] * (1 - f)[:, None] + st[seg + 1] * f[:, None]
    out[:] = row[None]
    return Image.fromarray(out.astype(np.uint8), 'RGB').convert('RGBA')


GOLD_GRAD = (hexrgb('#FFD27A'), GOLD, hexrgb('#E08A10'))
GOLD_TEAL = (hexrgb('#FFD27A'), GOLD, CYAN)


def draw_sprite(ctx, sp, x, y, alpha=1.0, scale=1.0, rot=0.0, sx=None, sy=None):
    if alpha <= 0.003:
        return
    ctx.save()
    ctx.translate(x, y)
    if rot:
        ctx.rotate(rot)
    ctx.scale(sx if sx is not None else scale, sy if sy is not None else scale)
    ctx.set_source_surface(sp.surf, -sp.ax, -sp.ay)
    ctx.get_source().set_filter(cairo.FILTER_GOOD)
    if alpha >= 0.999:
        ctx.paint()
    else:
        ctx.paint_with_alpha(alpha)
    ctx.restore()


def text(ctx, s, fnt, x, y, color=TEXT, alpha=1.0, anchor='mm', scale=1.0, rot=0.0, gradient=None, tracking=0, shadow=None):
    sp = text_sprite(s, fnt, color, anchor, gradient, tracking, shadow)
    draw_sprite(ctx, sp, x, y, alpha, scale, rot)
    return sp


def text_width(s, fnt, tracking=0):
    return fnt.getlength(s) + tracking * max(0, len(s) - 1)


def kinetic_words(ctx, s, fnt, cx, y, t, color=TEXT, stagger=0.07, dur=0.55, rise=40, gradient=None, anchor_x='m', gap=None, alpha=1.0):
    """Word-by-word rise + fade + slight scale reveal. t = local time (s)."""
    words = s.split(' ')
    sp_w = fnt.getlength(' ') if gap is None else gap
    widths = [fnt.getlength(w) for w in words]
    total = sum(widths) + sp_w * (len(words) - 1)
    x = {'l': cx, 'm': cx - total / 2, 'r': cx - total}[anchor_x]
    for i, (w, ww) in enumerate(zip(words, widths)):
        k = (t - i * stagger) / dur
        if k > 0:
            e = ease_out(k)
            sp = text_sprite(w, fnt, color, 'lm', gradient)
            draw_sprite(ctx, sp, x, y + (1 - e) * rise, alpha * clamp(k * 1.6), 0.92 + 0.08 * e)
        x += ww + sp_w
    return total


def typed(s, t, cps=28):
    n = int(max(0, t) * cps)
    return s[:n]


# ----------------------------------------------------------------------------- cairo primitives
def surface(w, h):
    return cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)


def rrect_path(ctx, x, y, w, h, r):
    r = max(0, min(r, w / 2, h / 2))
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 1.5 * math.pi)
    ctx.close_path()


def rrect(ctx, x, y, w, h, r, fill=None, stroke=None, lw=2, alpha=1.0, falpha=None, salpha=None):
    rrect_path(ctx, x, y, w, h, r)
    if fill is not None:
        ctx.set_source_rgba(*rgbf(fill, alpha if falpha is None else falpha * alpha))
        if stroke is not None:
            ctx.fill_preserve()
        else:
            ctx.fill()
    if stroke is not None:
        ctx.set_source_rgba(*rgbf(stroke, alpha if salpha is None else salpha * alpha))
        ctx.set_line_width(lw)
        ctx.stroke()


def circle(ctx, x, y, r, fill=None, stroke=None, lw=2, alpha=1.0):
    ctx.new_sub_path()
    ctx.arc(x, y, max(0.01, r), 0, 2 * math.pi)
    if fill is not None:
        ctx.set_source_rgba(*rgbf(fill, alpha))
        if stroke is not None:
            ctx.fill_preserve()
        else:
            ctx.fill()
    if stroke is not None:
        ctx.set_source_rgba(*rgbf(stroke, alpha))
        ctx.set_line_width(lw)
        ctx.stroke()


def arc(ctx, x, y, r, a0, a1, color, lw=3, alpha=1.0, cap=cairo.LINE_CAP_ROUND):
    if a1 <= a0:
        return
    ctx.new_sub_path()
    ctx.arc(x, y, r, a0, a1)
    ctx.set_source_rgba(*rgbf(color, alpha))
    ctx.set_line_width(lw)
    ctx.set_line_cap(cap)
    ctx.stroke()


def line(ctx, x0, y0, x1, y1, color, lw=2, alpha=1.0, cap=cairo.LINE_CAP_ROUND):
    ctx.move_to(x0, y0); ctx.line_to(x1, y1)
    ctx.set_source_rgba(*rgbf(color, alpha))
    ctx.set_line_width(lw); ctx.set_line_cap(cap)
    ctx.stroke()


def linear_fill(ctx, x0, y0, x1, y1, stops, alpha=1.0):
    g = cairo.LinearGradient(x0, y0, x1, y1)
    for off, c, *a in stops:
        g.add_color_stop_rgba(off, *rgbf(c, (a[0] if a else 1.0) * alpha))
    ctx.set_source(g)


def radial_glow(ctx, x, y, r, color, alpha=1.0):
    g = cairo.RadialGradient(x, y, 0, x, y, r)
    g.add_color_stop_rgba(0, *rgbf(color, alpha))
    g.add_color_stop_rgba(0.35, *rgbf(color, alpha * 0.35))
    g.add_color_stop_rgba(1, *rgbf(color, 0))
    ctx.set_source(g)
    ctx.arc(x, y, r, 0, 2 * math.pi)
    ctx.fill()


class GlowLayer:
    """Draw glowing shapes at reduced resolution, blur, then add on top of the frame."""

    def __init__(self, W, H, down=4):
        self.W, self.H, self.down = W, H, down
        self.w, self.h = W // down, H // down
        self.surf = surface(self.w, self.h)
        self.ctx = cairo.Context(self.surf)
        self.ctx.scale(1 / down, 1 / down)
        self.dirty = False

    def begin(self):
        c = self.ctx
        c.save(); c.set_operator(cairo.OPERATOR_CLEAR); c.paint(); c.restore()
        self.dirty = False
        return c

    def apply(self, ctx, radius=6, strength=1.0, passes=1):
        if not self.dirty:
            return
        self.surf.flush()
        img = Image.frombuffer('RGBA', (self.w, self.h), bytes(self.surf.get_data()), 'raw', 'BGRa', 0, 1)
        out = None
        for i in range(passes):
            b = img.filter(ImageFilter.GaussianBlur(radius * (2 ** i)))
            out = b if out is None else Image.blend(out, b, 0.5)
        s = pil_to_surface(out)
        ctx.save()
        ctx.scale(self.down, self.down)
        ctx.set_source_surface(s, 0, 0)
        ctx.get_source().set_filter(cairo.FILTER_BILINEAR)
        ctx.set_operator(cairo.OPERATOR_ADD)
        ctx.paint_with_alpha(min(1.0, strength))
        ctx.restore()


# ----------------------------------------------------------------------------- backgrounds
def make_background(W, H, seed=0, glow_pos=(0.5, 0.42), glow2=(0.85, 0.9), c1=GOLD, c2=TEAL, grid=True, strength=1.0):
    s = surface(W, H)
    c = cairo.Context(s)
    c.set_source_rgb(*rgbf(BLACK)[:3]); c.paint()
    g = cairo.RadialGradient(W * glow_pos[0], H * glow_pos[1], 0, W * glow_pos[0], H * glow_pos[1], W * 0.62)
    g.add_color_stop_rgba(0, *rgbf(c1, 0.16 * strength))
    g.add_color_stop_rgba(0.45, *rgbf(c1, 0.05 * strength))
    g.add_color_stop_rgba(1, *rgbf(c1, 0))
    c.set_source(g); c.paint()
    g = cairo.RadialGradient(W * glow2[0], H * glow2[1], 0, W * glow2[0], H * glow2[1], W * 0.5)
    g.add_color_stop_rgba(0, *rgbf(c2, 0.09 * strength))
    g.add_color_stop_rgba(1, *rgbf(c2, 0))
    c.set_source(g); c.paint()
    if grid:
        step = max(24, W // 32)
        c.set_line_width(1)
        for x in range(0, W + 1, step):
            c.move_to(x + 0.5, 0); c.line_to(x + 0.5, H)
        for y in range(0, H + 1, step):
            c.move_to(0, y + 0.5); c.line_to(W, y + 0.5)
        lg = cairo.RadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6)
        lg.add_color_stop_rgba(0, 1, 1, 1, 0.045)
        lg.add_color_stop_rgba(1, 1, 1, 1, 0.0)
        c.set_source(lg); c.stroke()
    # vignette
    v = cairo.RadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75)
    v.add_color_stop_rgba(0, 0, 0, 0, 0)
    v.add_color_stop_rgba(1, 0, 0, 0, 0.65)
    c.set_source(v); c.paint()
    return s


# ----------------------------------------------------------------------------- particles
class Particles:
    def __init__(self, n, W, H, seed=1, colors=(GOLD, GLOW, TEXT), speed=12, size=(0.8, 2.4)):
        rng = np.random.default_rng(seed)
        self.p = rng.random((n, 2)) * [W, H]
        self.v = (rng.random((n, 2)) - 0.5) * speed
        self.v[:, 1] -= speed * 0.35
        self.r = rng.uniform(*size, n)
        self.ph = rng.random(n) * 6.28
        self.ci = rng.integers(0, len(colors), n)
        self.colors = colors
        self.W, self.H = W, H

    def draw(self, ctx, t, alpha=1.0, glow=None):
        pos = (self.p + self.v * t) % [self.W, self.H]
        tw = 0.45 + 0.55 * np.sin(self.ph + t * 1.7) ** 2
        for (x, y), r, a, ci in zip(pos, self.r, tw, self.ci):
            col = self.colors[ci]
            circle(ctx, x, y, r, fill=col, alpha=alpha * a * 0.8)
            if glow is not None and r > 1.8:
                circle(glow, x, y, r * 2.5, fill=col, alpha=alpha * a)
        if glow is not None:
            pass


# ----------------------------------------------------------------------------- the gold ring mark
def gold_ring(ctx, glow, cx, cy, r, t, alpha=1.0, progress=1.0, lw=None, orbit=True, glow_ctx_layer=None):
    """Signature mark: glowing gold ring with orbiting sparks."""
    lw = lw or max(2.0, r * 0.075)
    a0 = -math.pi / 2
    a1 = a0 + 2 * math.pi * clamp(progress)
    # faint full track
    arc(ctx, cx, cy, r, 0, 2 * math.pi, GOLD, lw * 0.35, alpha * 0.18)
    # bright ring with conic-ish shading: draw in segments
    segs = 48
    for i in range(segs):
        s0 = a0 + (a1 - a0) * i / segs
        s1 = a0 + (a1 - a0) * (i + 1) / segs + 0.01
        shade = 0.72 + 0.28 * math.cos(s0 - t * 0.9 - 0.6)
        arc(ctx, cx, cy, r, s0, s1, mix(GOLD_DEEP, hexrgb('#FFE2A0'), shade), lw, alpha, cairo.LINE_CAP_BUTT)
    if glow is not None:
        arc(glow, cx, cy, r, a0, a1, GLOW, lw * 2.6, alpha * 0.9)
        glow_ctx_layer and setattr(glow_ctx_layer, 'dirty', True)
    if orbit and progress >= 1:
        for k, (rr, sp, sz) in enumerate(((1.0, 0.9, 1.0), (1.22, -0.55, 0.7), (0.78, 1.3, 0.6))):
            ang = t * sp + k * 2.1
            x, y = cx + math.cos(ang) * r * rr, cy + math.sin(ang) * r * rr
            circle(ctx, x, y, lw * 0.55 * sz, fill=hexrgb('#FFE7B0'), alpha=alpha)
            if glow is not None:
                circle(glow, x, y, lw * 1.6 * sz, fill=GLOW, alpha=alpha)
        if rr:
            arc(ctx, cx, cy, r * 1.22, t * -0.55, t * -0.55 + 1.2, GOLD, max(1, lw * 0.18), alpha * 0.5)
            arc(ctx, cx, cy, r * 0.78, t * 1.3 + 2, t * 1.3 + 2.9, TEAL, max(1, lw * 0.16), alpha * 0.55)


def logo_mark(ctx, glow, cx, cy, size, t, alpha=1.0, progress=1.0):
    """OpenFile mark: a document glyph inside the glowing gold ring."""
    r = size / 2
    gold_ring(ctx, glow, cx, cy, r, t, alpha, progress)
    k = ease_out((progress - 0.6) / 0.4) * alpha
    if k > 0:
        w, h = r * 0.78, r * 1.0
        x0, y0 = cx - w / 2, cy - h / 2
        fold = w * 0.32
        ctx.move_to(x0, y0); ctx.line_to(x0 + w - fold, y0); ctx.line_to(x0 + w, y0 + fold)
        ctx.line_to(x0 + w, y0 + h); ctx.line_to(x0, y0 + h); ctx.close_path()
        ctx.set_source_rgba(*rgbf(TEXT, k)); ctx.fill()
        ctx.move_to(x0 + w - fold, y0); ctx.line_to(x0 + w - fold, y0 + fold); ctx.line_to(x0 + w, y0 + fold); ctx.close_path()
        ctx.set_source_rgba(*rgbf(hexrgb('#CFC9BC'), k)); ctx.fill()
        for i in range(3):
            line(ctx, x0 + w * 0.18, y0 + h * (0.5 + i * 0.15), x0 + w * (0.82 if i < 2 else 0.6), y0 + h * (0.5 + i * 0.15), GOLD_DEEP, max(1.5, r * 0.06), k)


# ----------------------------------------------------------------------------- lucide icons
_LUCIDE = os.path.join(REPO, 'node_modules', 'lucide-react', 'dist', 'esm')


@lru_cache(maxsize=1)
def _lucide_exports():
    m = {}
    p = os.path.join(_LUCIDE, 'lucide-react.mjs')
    if not os.path.exists(p):
        return m
    for ln in open(p, encoding='utf8'):
        f = re.search(r"from '\./icons/([\w-]+)\.mjs'", ln)
        if not f:
            continue
        for name in re.findall(r'default as (\w+)', ln):
            m[name] = f.group(1)
    return m


def lucide_svg(name, color='#F5A524', stroke=2.0):
    file = _lucide_exports().get(name)
    if not file:
        return None
    src = open(os.path.join(_LUCIDE, 'icons', file + '.mjs'), encoding='utf8').read()
    parts = []
    for tag, attrs in re.findall(r'\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]', src):
        kv = re.findall(r'(\w+):\s*"([^"]*)"', attrs)
        a = ' '.join(f'{k}="{v}"' for k, v in kv if k != 'key')
        parts.append(f'<{tag} {a}/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
            f'stroke="{color}" stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round">'
            + ''.join(parts) + '</svg>')


_ICONS: dict = {}


def icon_sprite(name, px, color=GOLD, stroke=2.0):
    key = (name, px, color, stroke)
    if key in _ICONS:
        return _ICONS[key]
    hexc = '#%02x%02x%02x' % color
    svg = lucide_svg(name, hexc, stroke)
    if svg is None:
        img = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((px * .15, px * .15, px * .85, px * .85), px * .18, outline=color + (255,), width=max(2, px // 12))
    else:
        import cairosvg
        png = cairosvg.svg2png(bytestring=svg.encode(), output_width=px, output_height=px)
        img = Image.open(io.BytesIO(png)).convert('RGBA')
    sp = Sprite(pil_to_surface(img), px / 2, px / 2)
    _ICONS[key] = sp
    return sp


# ----------------------------------------------------------------------------- registry
def _parse_objects(src):
    """Find every `{ slug: '...' ... }` object literal (single or multi-line) by brace matching."""
    out = []
    for m in re.finditer(r"\{\s*slug\s*:", src):
        i, depth, q = m.start(), 0, None
        j = i
        while j < len(src):
            ch = src[j]
            if q:
                if ch == '\\':
                    j += 2; continue
                if ch == q:
                    q = None
            elif ch in "'\"`":
                q = ch
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    break
            j += 1
        blob = src[i:j + 1]

        def g(k):
            mm = re.search(r"\b" + k + r"\s*:\s*(['\"`])((?:(?!\1)[^\\]|\\.)*)\1", blob)
            return mm.group(2).replace("\\'", "'").replace('\\"', '"') if mm else None
        out.append(dict(slug=g('slug'), name=g('name'), desc=g('desc'), category=g('category'), icon=g('icon'), badge=g('badge')))
    return out


def load_registry(path=None):
    """All tools in src/tools/registry.ts plus the batch files it spreads into TOOLS (src/tools/batches/*.ts)."""
    path = path or os.path.join(REPO, 'src', 'tools', 'registry.ts')
    base = os.path.dirname(path)
    src = open(path, encoding='utf8').read()
    tools = _parse_objects(src[src.find('const CORE_TOOLS') if 'const CORE_TOOLS' in src else src.index('export const TOOLS'):])
    imports = dict((name, rel) for name, rel in re.findall(r"import\s*\{\s*(\w+)\s*\}\s*from\s*'(\./batches/[\w-]+)'", src))
    m = re.search(r'export const TOOLS[^=]*=\s*\[([^\]]*)\]', src)
    order = re.findall(r'\.\.\.(\w+)', m.group(1)) if m else []
    for name in order:
        rel = imports.get(name)
        if not rel:
            continue
        f = os.path.normpath(os.path.join(base, rel + '.ts'))
        if os.path.exists(f):
            tools += _parse_objects(open(f, encoding='utf8').read())
    seen, res = set(), []
    for t in tools:
        if t['slug'] and t['name'] and t['category'] and t['slug'] not in seen:
            t['desc'] = t['desc'] or t['name']
            t['name'] = t['name'].replace('⇄', '↔')   # the brand fonts have no glyph for ⇄
            seen.add(t['slug']); res.append(t)
    return res


def seed_of(s):
    return int(hashlib.sha1(s.encode()).hexdigest()[:8], 16)


# ----------------------------------------------------------------------------- frame pipe
class FFPipe:
    """Stream cairo BGRA frames into ffmpeg (video only; audio muxed separately)."""

    def __init__(self, path, W, H, fps, crf=20, preset='veryfast', maxrate=None, extra=None, tune=None):
        cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
               '-c:v', 'libx264', '-preset', preset, '-crf', str(crf), '-pix_fmt', 'yuv420p']
        if tune:
            cmd += ['-tune', tune]
        if maxrate:
            cmd += ['-maxrate', maxrate, '-bufsize', str(int(maxrate.rstrip('k')) * 2) + 'k']
        cmd += (extra or []) + ['-an', path]
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    def write(self, surf):
        surf.flush()
        self.p.stdin.write(bytes(surf.get_data()))

    def close(self):
        self.p.stdin.close()
        rc = self.p.wait()
        if rc:
            raise RuntimeError('ffmpeg failed')


# ============================================================================= AUDIO
SR = 44100
NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def _env(n, a, r, sr=SR):
    e = np.ones(n, np.float32)
    na, nr = max(1, int(a * sr)), max(1, int(r * sr))
    na, nr = min(na, n), min(nr, n)
    e[:na] = np.linspace(0, 1, na) ** 1.5
    e[n - nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


def _add(buf, start, sig):
    s = int(start)
    if s >= buf.shape[-1]:
        return
    e = min(buf.shape[-1], s + sig.shape[-1])
    buf[..., s:e] += sig[..., :e - s]


TIMBRES = {
    # name: (partials [(ratio, amp, decay_mult)], base decay seconds, attack)
    'piano': ([(1, 1, 1), (2, .5, 1.6), (3, .28, 2.2), (4, .16, 2.8), (5, .1, 3.4), (6, .06, 4)], 1.6, 0.004),
    'rhodes': ([(1, 1, 1), (2, .25, 1.4), (3, .05, 2), (14, .05, 9)], 1.8, 0.003),
    'marimba': ([(1, 1, 1), (3.93, .35, 3.5), (9.2, .12, 6)], 0.7, 0.002),
    'kalimba': ([(1, 1, 1), (5.4, .22, 4), (11.3, .06, 7)], 1.0, 0.002),
    'bell': ([(1, 1, 1), (2.76, .5, 1.6), (5.4, .25, 2.4), (8.93, .12, 3.2)], 2.2, 0.002),
    'harp': ([(1, 1, 1), (2, .6, 1.5), (3, .35, 2.1), (4, .2, 2.7), (5, .12, 3.5)], 1.2, 0.002),
    'glass': ([(1, 1, 1), (2.01, .4, 1.3), (4.02, .15, 2)], 2.6, 0.01),
}


def tone(freq, dur, timbre='piano', vel=1.0, sr=SR, rng=None):
    parts, dec, att = TIMBRES[timbre]
    n = int(sr * (dur + dec * 1.2))
    t = np.arange(n, dtype=np.float32) / sr
    out = np.zeros(n, np.float32)
    for ratio, amp, dm in parts:
        f = freq * ratio * (1 + 0.0004 * ratio * ratio)  # slight inharmonicity
        if f > sr * 0.45:
            continue
        out += amp * np.sin(2 * np.pi * f * t + (rng.random() * 6.28 if rng is not None else 0)) * np.exp(-t * dm / dec)
    a = max(1, int(att * sr))
    out[:a] *= np.linspace(0, 1, a)
    # release after note length
    rel_start = int(dur * sr)
    if rel_start < n:
        out[rel_start:] *= np.exp(-np.arange(n - rel_start) / (0.25 * sr))
    return out * vel * 0.25


def pad_voice(freq, n, sr=SR, bright=4, detune=0.004, rng=None):
    t = np.arange(n, dtype=np.float32) / sr
    out = np.zeros((2, n), np.float32)
    for side, d in ((0, -detune), (1, detune)):
        for dd in (d, -d * 0.5, 0):
            f = freq * (1 + dd)
            ph = rng.random() * 6.28 if rng is not None else 0
            for h in range(1, bright + 1):
                out[side] += np.sin(2 * np.pi * f * h * t + ph * h) / (h ** 1.35)
    lfo = 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t + (rng.random() * 6 if rng is not None else 0))
    return out * lfo * 0.06


def lowpass(x, cutoff, sr=SR):
    """Simple FFT brick-ish low pass with smooth roll-off."""
    n = x.shape[-1]
    X = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(n, 1 / sr)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, n, axis=-1).astype(np.float32)


def highpass(x, cutoff, sr=SR):
    n = x.shape[-1]
    X = np.fft.rfft(x, axis=-1)
    f = np.fft.rfftfreq(n, 1 / sr)
    X *= 1 - 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, n, axis=-1).astype(np.float32)


def reverb(x, rng, decay=1.8, mix_=0.28, sr=SR):
    n_ir = int(sr * decay * 1.5)
    t = np.arange(n_ir) / sr
    out = np.zeros_like(x)
    N = 1 << int(np.ceil(np.log2(x.shape[-1] + n_ir)))
    for ch in range(x.shape[0]):
        ir = rng.standard_normal(n_ir).astype(np.float32) * np.exp(-t * 6.9 / decay)
        ir = lowpass(ir[None], 6000, sr)[0]
        ir[: int(0.012 * sr)] = 0
        ir /= np.sqrt((ir ** 2).sum()) + 1e-9
        y = np.fft.irfft(np.fft.rfft(x[ch], N) * np.fft.rfft(ir, N), N)[: x.shape[-1]]
        out[ch] = y
    return x * (1 - mix_) + out * mix_ * 1.4


PROGRESSIONS = [
    [0, 5, 3, 4],      # I vi IV V   (degrees index into scale)
    [5, 3, 0, 4],      # vi IV I V
    [0, 2, 3, 4],      # I iii IV V
    [0, 3, 5, 4],      # I IV vi V
    [3, 4, 2, 5],      # IV V iii vi
    [0, 4, 5, 3],      # I V vi IV
    [1, 4, 0, 5],      # ii V I vi
]
MAJOR = [0, 2, 4, 5, 7, 9, 11]


def chord_notes(root_midi, degree, ext=True):
    sc = [root_midi + s for s in MAJOR] + [root_midi + 12 + s for s in MAJOR] + [root_midi + 24 + s for s in MAJOR]
    notes = [sc[degree], sc[degree + 2], sc[degree + 4]]
    if ext:
        notes.append(sc[degree + 6])  # 7th
    return notes


def make_music(duration, seed=0, bpm=None, key=None, lead=None, pad_bright=None, beat=True, intro=2.0, outro=2.5,
               density=None, beat_start=None, beat_end=None, swell=None):
    """Procedural ambient-pop bed: pads + plucked/piano arpeggio + sub bass + soft drums + reverb. Returns (2,n) float32."""
    rng = np.random.default_rng(seed)
    bpm = bpm or int(rng.integers(72, 108))
    key = key if key is not None else int(rng.integers(0, 12))
    lead = lead or rng.choice(list(TIMBRES))
    pad_bright = pad_bright or int(rng.integers(3, 7))
    density = density if density is not None else rng.choice([0.5, 0.75, 1.0])
    prog = PROGRESSIONS[int(rng.integers(len(PROGRESSIONS)))]
    root = 48 + key  # C3 + key
    if root > 54:
        root -= 12
    n = int(SR * duration)
    out = np.zeros((2, n), np.float32)
    beat_s = 60 / bpm
    bar = beat_s * 4
    chord_len = bar * (2 if bpm < 84 else 2)
    # --- pads
    t0 = 0.0
    ci = 0
    while t0 < duration:
        notes = chord_notes(root + 12, prog[ci % 4])
        ln = int(SR * (chord_len + 1.2))
        seg = np.zeros((2, ln), np.float32)
        for m in notes:
            seg += pad_voice(midi_hz(m), ln, bright=pad_bright, rng=rng)
        seg *= _env(ln, 0.9, 1.4)
        _add(out, t0 * SR, seg * 0.8)
        # bass
        bf = midi_hz(notes[0] - 12)
        for b in range(int(chord_len / beat_s / 2)):
            bt = t0 + b * beat_s * 2
            bl = int(SR * beat_s * 1.9)
            tt = np.arange(bl) / SR
            bs = (np.sin(2 * np.pi * bf * tt) + 0.25 * np.sin(4 * np.pi * bf * tt)) * np.exp(-tt * 1.6) * _env(bl, 0.02, 0.2)
            _add(out, bt * SR, np.stack([bs, bs]) * 0.16)
        # arpeggio / piano
        pattern = rng.permutation(8)
        steps = int(chord_len / (beat_s / 2))
        arp_notes = notes + [notes[0] + 12, notes[1] + 12]
        for s in range(steps):
            if rng.random() > density:
                continue
            nt = t0 + s * beat_s / 2 + rng.normal(0, 0.006)
            if nt < intro * 0.4:
                continue
            m = arp_notes[pattern[s % 8] % len(arp_notes)] + 12
            vel = 0.55 + 0.35 * rng.random() * (1.0 if s % 2 == 0 else 0.7)
            sig = tone(midi_hz(m), beat_s * 0.45, lead, vel, rng=rng)
            pan = 0.5 + 0.35 * math.sin(s * 1.3 + ci)
            _add(out, nt * SR, np.stack([sig * (1 - pan) * 1.4, sig * pan * 1.4]))
        t0 += chord_len
        ci += 1
    # --- drums
    if beat:
        bs_ = intro if beat_start is None else beat_start
        be_ = duration - outro if beat_end is None else beat_end
        kl = int(SR * 0.35)
        tt = np.arange(kl) / SR
        kick = np.sin(2 * np.pi * (48 * tt + 60 * (1 - np.exp(-tt * 30)) / 30)) * np.exp(-tt * 9)
        hl = int(SR * 0.06)
        hat = highpass(rng.standard_normal(hl).astype(np.float32)[None], 7000)[0] * np.exp(-np.arange(hl) / SR * 70)
        sl = int(SR * 0.18)
        snare = highpass(rng.standard_normal(sl).astype(np.float32)[None], 1800)[0] * np.exp(-np.arange(sl) / SR * 22)
        bt = bs_
        i = 0
        while bt < be_:
            k = ease_in_out((bt - bs_) / 1.5) * ease_in_out((be_ - bt) / 1.5)
            if i % 4 in (0,) or (i % 8 == 6 and rng.random() < 0.5):
                _add(out, bt * SR, np.stack([kick, kick]) * 0.42 * k)
            if i % 4 == 2:
                _add(out, bt * SR, np.stack([snare * 0.8, snare]) * 0.07 * k)
            for hh in (0, 0.5):
                _add(out, (bt + hh * beat_s + rng.normal(0, 0.004)) * SR, np.stack([hat, hat * 0.7]) * (0.05 if hh else 0.035) * k)
            bt += beat_s
            i += 1
    out = reverb(out, rng, decay=2.2, mix_=0.3)
    # master fade + soft clip
    t = np.arange(n) / SR
    fade = np.minimum(1, t / min(1.5, intro)) * np.minimum(1, (duration - t) / outro)
    out *= fade
    if swell is not None:
        out *= swell(t)
    out = np.tanh(out * 1.3) / 1.3
    peak = np.abs(out).max() + 1e-9
    return (out / peak * 0.7).astype(np.float32), dict(bpm=bpm, key=list(NOTE)[key], lead=str(lead), pad=pad_bright)


def envelope_follow(x, sr=SR, attack=0.02, release=0.35):
    """Smoothed amplitude envelope for ducking (vectorised approximation)."""
    a = np.abs(x)
    win = int(sr * 0.03)
    k = np.ones(win) / win
    e = np.convolve(a, k, mode='same')
    # release smoothing via max filter + moving average
    rw = int(sr * release)
    from numpy.lib.stride_tricks import sliding_window_view
    step = 256
    ds = e[::step]
    pad = rw // step + 1
    dsp = np.concatenate([np.zeros(pad), ds])
    mx = sliding_window_view(dsp, pad + 1).max(axis=1)[: len(ds)]
    sm = np.convolve(mx, np.ones(pad) / pad, mode='same')
    env = np.interp(np.arange(len(a)), np.arange(len(ds)) * step, sm)
    return env / (env.max() + 1e-9)


def duck_mix(music, voice, voice_gain=1.0, music_gain=0.55, duck=0.6):
    """music (2,n), voice (n,) -> stereo mix with music ducked under the voice."""
    n = max(music.shape[1], len(voice))
    m = np.zeros((2, n), np.float32); m[:, :music.shape[1]] = music
    v = np.zeros(n, np.float32); v[:len(voice)] = voice
    env = envelope_follow(v) if np.abs(v).max() > 0 else np.zeros(n)
    g = 1 - duck * np.clip(env * 2.5, 0, 1)
    out = m * music_gain * g + v[None] * voice_gain
    return out


def write_wav(path, stereo, sr=SR):
    import soundfile as sf
    sf.write(path, stereo.T if stereo.ndim == 2 else stereo, sr, subtype='PCM_16')


def loudnorm_two_pass(src, dst, I=-14, TP=-1.0, LRA=11, extra=()):
    """Two-pass EBU R128 loudnorm with ffmpeg -> dst (wav)."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', f'loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True)
    js = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    af = (f"loudnorm=I={I}:TP={TP}:LRA={LRA}:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
          f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-af', af, '-ar', '44100', *extra, dst], check=True)
    return js


# ----------------------------------------------------------------------------- TTS
PRON = [
    (r'⇄', ' to and from '), (r'↔', ' to and from '), (r'→', ' to '), (r'(\d)\s*×', r'\1 times'), (r'×', 'x'),
    (r'(\d+)\s*KB\b', r'\1 kilobytes'), (r'(\d+)\s*MB\b', r'\1 megabytes'), (r'@font-face', 'font face'),
    (r'\bWOFF2\b', 'woff 2'), (r'\bWOFF\b', 'woff'), (r'\b[Gg][Ll][Tt][Ff]\b', 'G L T F'), (r'\bSVGZ\b', 'S V G Z'),
    (r'\bZ-up\b', 'Z up'), (r'\bJPEG\b', 'jay peg'), (r'\bTIFF\b', 'tiff'), (r'\bRAW\b', 'raw'),
    (r'\b(GLB|OBJ|STL|PLY|USDZ|PSD|PSB|TTF|OTF|EOT|ICNS|CUR|ANI|PSNR|DNG|QOI|TGA)\b', lambda m: ' '.join(m.group(1))),
    (r'\bcURL\b', 'curl'), (r'\bJSON\b', 'Jason'), (r'\bYAML\b', 'yammel'), (r'\bSQL\b', 'sequel'),
    (r'\bJWTs?\b', 'J W T'), (r'\bUUIDs?\b', 'U U I Ds'), (r'\bEXIF\b', 'exif'), (r'\bHEIC\b', 'heek'), (r'\bHEIF\b', 'heef'),
    (r'\bWEBP\b', 'web P'), (r'\bWEBM\b', 'web M'), (r'\bAVIF\b', 'ay vif'), (r'\bDOCX\b', 'Word'), (r'\bXLSX\b', 'Excel'),
    (r'\bPPTX\b', 'PowerPoint'), (r'\bOKLCH\b', 'O K L C H'), (r'\bWCAG\b', 'W C A G'), (r'\bEPUB\b', 'E-pub'),
    (r'\bMP4\b', 'M P 4'), (r'\bMOV\b', 'M O V'), (r'\bMKV\b', 'M K V'), (r'\bAVI\b', 'A V I'), (r'\bFLAC\b', 'flack'),
    (r'\bM4A\b', 'M 4 A'), (r'\bSRT\b', 'S R T'), (r'\bICO\b', 'I C O'), (r'\bSHA-(\d+)', r'shah \1'), (r'\bMD5\b', 'M D 5'),
    (r'\bv(\d)\b', r'version \1'), (r'\bCODE(\d+)', r'Code \1'), (r'\bEAN-13\b', 'E A N 13'), (r'\bGST\b', 'G S T'),
    (r'\bVAT\b', 'V A T'), (r'\bERD\b', 'E R D'), (r'\bJSX\b', 'J S X'), (r'\bSVGs\b', 'S V Gs'), (r'\bSVG\b', 'S V G'),
    (r'\bPDFs\b', 'P D Fs'), (r'\bPDF\b', 'P D F'), (r'\bCSV\b', 'C S V'), (r'\bTSV\b', 'T S V'), (r'\bHTML\b', 'H T M L'),
    (r'\bCSS\b', 'C S S'), (r'\bPNG\b', 'P N G'), (r'\bJPG\b', 'J P G'), (r'\bGIFs?\b', 'gif'), (r'\bBMP\b', 'B M P'),
    (r'\bOCR\b', 'O C R'), (r'\bATS\b', 'A T S'), (r'\bAAC\b', 'A A C'), (r'\bWAV\b', 'wave'), (r'\bOGG\b', 'ogg'),
    (r'\bMP3\b', 'M P 3'), (r'\bUPC\b', 'U P C'), (r'\bGPS\b', 'G P S'), (r'\bAI\b', 'A I'), (r'\bZIP\b', 'zip'),
    (r'\bN-up\b', 'N up'), (r'\bBase64\b', 'base 64'), (r'\bURLs?\b', 'U R L'), (r'\bQR\b', 'Q R'), (r'\b4K\b', '4 K'),
    (r'(\d+)\+', r'more than \1'), (r'0\.25', 'a quarter'), (r'(\d)p\b', r'\1 P'), (r'\bWi-Fi\b', 'wifi'),
    (r'\s*/\s*', ' or '), (r'&', 'and'), (r'\bvCards\b', 'v cards'), (r'\bPrisma\b', 'Prizma'),
]


def speakable(s):
    for a, b in PRON:
        s = re.sub(a, b, s)
    return re.sub(r'\s+', ' ', s).strip()


# English voices of Kokoro v1.0, grouped by gender + accent (am_adam / *_santa excluded on quality grounds)
VOICE_GROUPS = {
    'af': ['af_heart', 'af_bella', 'af_nicole', 'af_aoede', 'af_kore', 'af_sarah', 'af_nova', 'af_alloy', 'af_sky', 'af_jessica', 'af_river'],
    'am': ['am_michael', 'am_fenrir', 'am_puck', 'am_echo', 'am_eric', 'am_liam', 'am_onyx'],
    'bf': ['bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily'],
    'bm': ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel'],
}
VOICE_LABEL = {'af': 'US female', 'am': 'US male', 'bf': 'UK female', 'bm': 'UK male'}
# strongest voice per group, used as the 20% colour in blends
VOICE_ANCHOR = {'af': ['af_heart', 'af_bella', 'af_nicole'], 'am': ['am_michael', 'am_fenrir', 'am_puck'],
                'bf': ['bf_emma', 'bf_isabella'], 'bm': ['bm_george', 'bm_fable']}


def voice_sequence(n):
    """Deterministic list of n distinct voice specs (voice, other, weight). First every pure English Kokoro voice,
    round-robin across US/UK x female/male; then blends of each voice with another voice of the same group
    (80/20, 70/30, 60/40, 50/50) in the same interleaved order, so every tool gets its own timbre."""
    groups = ['af', 'am', 'bf', 'bm', 'af', 'am']
    idx = {g: 0 for g in VOICE_GROUPS}
    pure, used = [], set()
    total = sum(len(v) for v in VOICE_GROUPS.values())
    while len(pure) < total:
        for g in groups:
            lst = VOICE_GROUPS[g]
            while idx[g] < len(lst) and lst[idx[g]] in used:
                idx[g] += 1
            if idx[g] < len(lst):
                pure.append(lst[idx[g]]); used.add(lst[idx[g]]); idx[g] += 1
    order = [(v, None, 1.0) for v in pure]
    seen = set()
    for w in (0.8, 0.7, 0.6, 0.5):
        for k in range(max(len(x) for x in VOICE_GROUPS.values())):
            for v in pure:
                grp = VOICE_GROUPS[v[:2]]
                others = [a for a in VOICE_ANCHOR[v[:2]] if a != v] + [o for o in grp if o != v and o not in VOICE_ANCHOR[v[:2]]]
                if k >= len(others):
                    continue
                o = others[k]
                key = frozenset((v, o)) if w == 0.5 else (v, o, w)
                if key in seen:
                    continue
                seen.add(key)
                order.append((v, o, w))
                if len(order) >= n:
                    return order
    return order[:n]


def voice_name(spec):
    v, o, w = spec
    return v if not o else f'{v} {int(w * 100)}% + {o} {int(round((1 - w) * 100))}%'


class TTS:
    def __init__(self, threads=None):
        from kokoro_onnx import Kokoro
        import onnxruntime as ort
        model = os.path.join(TTS_DIR, 'kokoro-v1.0.int8.onnx')
        voices = os.path.join(TTS_DIR, 'voices-v1.0.bin')
        if not (os.path.exists(model) and os.path.exists(voices)):
            os.makedirs(TTS_DIR, exist_ok=True)
            base = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
            for f in (model, voices):
                if not os.path.exists(f):
                    subprocess.run(['curl', '-sSL', '-o', f, base + os.path.basename(f)], check=True)
        so = ort.SessionOptions()
        if threads:
            so.intra_op_num_threads = threads
            so.inter_op_num_threads = 1
        sess = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])
        self.k = Kokoro.from_session(sess, voices)

    def style(self, spec):
        v, o, w = spec
        if not o:
            return v
        return (self.k.get_voice_style(v) * w + self.k.get_voice_style(o) * (1 - w)).astype(np.float32)

    def say(self, textstr, spec=('af_heart', None, 1.0), speed=1.0):
        lang = 'en-gb' if spec[0].startswith('b') else 'en-us'
        a, sr = self.k.create(speakable(textstr), voice=self.style(spec), speed=speed, lang=lang)
        a = a.astype(np.float32)
        if sr != SR:
            x = np.arange(int(len(a) * SR / sr)) * (sr / SR)
            a = np.interp(x, np.arange(len(a)), a).astype(np.float32)
        # gentle presence: tiny high-shelf via mixing a highpassed copy
        a = a + 0.15 * highpass(a[None], 3000)[0]
        a /= (np.abs(a).max() + 1e-9)
        return a * 0.9

#!/usr/bin/env python3
"""
Short seamless cover loop per post (8 s, 800x500, 24 fps, muted): the post's SVG cover art brought to life with a
slow drift, breathing motif, glow pulse, orbiting rings, rising sparks and a light sweep. Every motion is periodic in
8 s, so the clip loops without a seam. Played behind the cover on the blog index and post header.

Input : scripts/blog-media/.cache/cover/<slug>.svg (from extract.mjs)
Output: public/media/blog/<slug>/loop.mp4 (H.264) + loop.webm (AV1) + cover.webp (poster, first frame)
Run:   python3 scripts/blog-media/loop.py <slug> [<slug> ...]
"""
import io, math, os, re, subprocess, sys
HERE_ = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_, '..', 'media-lib'))
from ofmedia import *  # noqa

LW, LH, LFPS, LOOP = 800, 500, 24, 8.0
CACHE = os.path.join(HERE_, '.cache')
PUB = os.path.join(REPO, 'public', 'media', 'blog')
HEX = {'#F5A524': GOLD, '#10B981': EMERALD, '#F97316': hexrgb('#F97316'), '#84CC16': hexrgb('#84CC16'), '#38BDF8': SKY, '#22D3EE': CYAN, '#14B8A6': TEAL, '#60A5FA': SKY}


def split_svg(svg):
    """-> (background-only svg, motif-only svg). The motif is everything after the second decorative ring."""
    i = svg.find('r="46"')
    j = svg.find('>', i) + 1
    if svg[j:j + 9] == '</circle>':
        j += 9
    end = svg.rfind('</svg>')
    head = svg[:svg.find('>', svg.find('<svg')) + 1]
    defs = re.search(r'<defs>.*?</defs>', svg, re.S)
    bg = svg[:j] + '</svg>'
    motif = head + (defs.group(0) if defs else '') + svg[j:end] + '</svg>'
    return bg, motif


def raster(svg, w, h):
    import cairosvg
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=w, output_height=h)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def make(slug):
    svg = open(os.path.join(CACHE, 'cover', slug + '.svg')).read()
    cols = re.findall(r'stop-color="(#[0-9A-Fa-f]{6})"', svg)
    a = HEX.get(cols[0].upper(), GOLD) if cols else GOLD
    b = HEX.get(cols[1].upper(), TEAL) if len(cols) > 1 else TEAL
    bg_svg, mo_svg = split_svg(svg)
    S = 1.12  # overscan for the drift
    bw, bh = int(LW * S), int(LH * S)
    bg = pil_to_surface(raster(bg_svg, bw, bh))
    mo_img = raster(mo_svg, bw, bh)
    mo = pil_to_surface(mo_img)
    glow_img = mo_img.filter(ImageFilter.GaussianBlur(10))
    glow = pil_to_surface(glow_img)
    surf = surface(LW, LH)
    c = cairo.Context(surf)
    rng = np.random.default_rng(seed_of(slug) % 10000)
    sparks = [(rng.random() * LW, rng.random(), rng.uniform(0.8, 2.2), rng.integers(1, 3)) for _ in range(46)]
    out = os.path.join(PUB, slug)
    os.makedirs(out, exist_ok=True)
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', f'{LW}x{LH}', '-r', str(LFPS), '-i', '-',
           '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-g', str(int(LOOP * LFPS)), '-movflags', '+faststart', os.path.join(out, 'loop.mp4'),
           '-an', '-c:v', 'libsvtav1', '-preset', '8', '-crf', '40', '-g', str(int(LOOP * LFPS)), '-pix_fmt', 'yuv420p', os.path.join(out, 'loop.webm')]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = int(LOOP * LFPS)
    for f in range(n):
        ph = 2 * math.pi * f / n           # one full cycle per loop
        c.set_operator(cairo.OPERATOR_SOURCE); c.set_source_rgb(0, 0, 0); c.paint(); c.set_operator(cairo.OPERATOR_OVER)
        # background drift
        dx, dy = math.sin(ph) * 16, math.cos(ph) * 9
        c.save(); c.translate(LW / 2 + dx, LH / 2 + dy); c.translate(-bw / 2, -bh / 2); c.set_source_surface(bg, 0, 0); c.paint(); c.restore()
        # orbiting arcs around the ring at (330, 40) of the 400x250 art
        rx, ry = (330 / 400) * bw - (bw - LW) / 2 + dx, (40 / 250) * bh - (bh - LH) / 2 + dy
        arc(c, rx, ry, 118 * S, ph, ph + 1.1, a, 2.2, 0.55)
        arc(c, rx, ry, 150 * S, -ph * 2, -ph * 2 + 0.7, b, 1.6, 0.45)
        arc(c, rx, ry, 76 * S, ph * 3 + 1, ph * 3 + 1.6, TEXT, 1.4, 0.35)
        # sparks rising (wrap seamlessly)
        for (x, y0, r, sp) in sparks:
            y = LH * (1 - ((y0 + sp * f / n) % 1.0))
            tw = 0.35 + 0.65 * math.sin(ph * sp + x) ** 2
            circle(c, x + math.sin(ph + y0 * 6) * 6, y, r, fill=a if r > 1.6 else TEXT, alpha=0.5 * tw)
        # motif: float and breathe, with a glow pulse
        sc = 1.0 + 0.025 * math.sin(ph)
        my = math.sin(ph * 2) * 4
        c.save(); c.translate(LW / 2 + dx * 0.4, LH / 2 + my + dy * 0.4); c.scale(sc, sc); c.translate(-bw / 2, -bh / 2)
        c.set_source_surface(glow, 0, 0); c.paint_with_alpha(0.35 + 0.35 * (0.5 + 0.5 * math.sin(ph * 2)))
        c.set_source_surface(mo, 0, 0); c.paint()
        c.restore()
        # diagonal light sweep, once per loop
        k = (f / n) * 1.6 - 0.3
        g = cairo.LinearGradient(LW * (k - 0.25), 0, LW * (k + 0.05), LH)
        g.add_color_stop_rgba(0, 1, 1, 1, 0); g.add_color_stop_rgba(0.5, *rgbf(hexrgb('#FFE7B0'), 0.07)); g.add_color_stop_rgba(1, 1, 1, 1, 0)
        c.set_source(g); c.paint()
        surf.flush()
        p.stdin.write(bytes(surf.get_data()))
        if f == 0:
            surf.write_to_png(os.path.join(CACHE, f'loop0-{slug}.png'))
    p.stdin.close()
    if p.wait():
        raise RuntimeError('ffmpeg failed')
    Image.open(os.path.join(CACHE, f'loop0-{slug}.png')).convert('RGB').save(os.path.join(out, 'cover.webp'), quality=80, method=6)
    os.remove(os.path.join(CACHE, f'loop0-{slug}.png'))
    print(f'loop {slug}: mp4 {os.path.getsize(os.path.join(out, "loop.mp4")) // 1024} KB, webm {os.path.getsize(os.path.join(out, "loop.webm")) // 1024} KB', flush=True)


if __name__ == '__main__':
    for s in sys.argv[1:]:
        make(s)

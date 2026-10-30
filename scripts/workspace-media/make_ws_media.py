"""
Workspace studio media: recipe preview loops, the hero loop, the "how it works" explainer and the sample files.
Same open-source stack and gold-on-black palette as scripts/media-lib (cairocffi, Pillow, numpy, ffmpeg).
No purple, violet, pink or magenta anywhere.

  python3 scripts/workspace-media/make_ws_media.py samples
  python3 scripts/workspace-media/make_ws_media.py loops [id ...]
  python3 scripts/workspace-media/make_ws_media.py hero
  python3 scripts/workspace-media/make_ws_media.py explainer <scene 0-4 | join>
Output: public/media/workspace/
"""
import io, json, math, os, subprocess, sys, zipfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'media-lib'))
import ofmedia as M  # noqa: E402
import cairocffi as cairo  # noqa: E402
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402
import numpy as np  # noqa: E402

OUT = os.path.join(M.REPO, 'public', 'media', 'workspace')
SMP = os.path.join(OUT, 'samples')
os.makedirs(SMP, exist_ok=True)
FPS = 30
CAT = {'image': M.GOLD, 'pdf': M.TEAL, 'media': M.SKY, 'data': M.EMERALD, 'archive': M.CYAN, 'file': M.hexrgb('#FBBF24')}

# step id -> (label, lucide icon, category)
STEP = {
    'img-resize': ('Resize', 'Scaling', 'image'), 'img-convert': ('Convert', 'RefreshCw', 'image'), 'img-compress': ('Compress', 'Shrink', 'image'),
    'img-crop': ('Crop', 'Crop', 'image'), 'img-watermark': ('Watermark', 'Stamp', 'image'), 'img-round': ('Round', 'Squircle', 'image'),
    'img-strip': ('Strip EXIF', 'ShieldCheck', 'image'), 'pdf-merge': ('Merge', 'Combine', 'pdf'), 'pdf-numbers': ('Numbers', 'Hash', 'pdf'),
    'pdf-meta': ('Clean', 'ShieldCheck', 'pdf'), 'pdf-watermark': ('Watermark', 'Stamp', 'pdf'), 'pdf-from-images': ('To PDF', 'FileImage', 'pdf'),
    'pdf-to-images': ('To images', 'Images', 'pdf'), 'pdf-gray': ('Grayscale', 'Contrast', 'pdf'), 'pdf-compress': ('Compress', 'Shrink', 'pdf'),
    'av-trim': ('Trim', 'Scissors', 'media'), 'vid-gif': ('To GIF', 'Film', 'media'), 'vid-compress': ('Compress', 'Shrink', 'media'),
    'av-extract-audio': ('Audio', 'Music', 'media'), 'av-convert': ('To MP3', 'RefreshCw', 'media'), 'data-convert': ('Convert', 'Table', 'data'),
    'text-replace': ('Replace', 'Replace', 'data'), 'zip-all': ('ZIP', 'FileArchive', 'archive'), 'unzip': ('Unzip', 'PackageOpen', 'archive'),
    'file-rename': ('Rename', 'TextCursorInput', 'file'), 'checksum': ('Checksum', 'Fingerprint', 'file'),
}
# recipe id -> (title, branches, join, input kind colors)
RECIPES = {
    'web-photos': ('Web-ready photos', [['img-resize', 'img-convert']], [], [M.GOLD]),
    'product-catalog': ('Product catalog', [['img-crop', 'img-resize', 'img-watermark', 'img-convert', 'file-rename']], [], [M.GOLD]),
    'social-avatars': ('Social avatars', [['img-crop', 'img-resize', 'img-round']], [], [M.GOLD]),
    'photo-kit': ('Photo kit, big and thumbs', [['img-resize', 'img-convert'], ['img-crop', 'img-resize', 'file-rename']], ['zip-all'], [M.GOLD]),
    'privacy-clean': ('Privacy clean-up', [['img-strip', 'pdf-meta', 'file-rename', 'checksum']], [], [M.GOLD, M.TEAL, M.EMERALD]),
    'pdf-pack': ('Share-safe PDF pack', [['pdf-merge', 'pdf-numbers', 'pdf-meta']], [], [M.TEAL]),
    'confidential': ('Confidential drafts', [['pdf-watermark', 'pdf-meta']], [], [M.TEAL]),
    'scan-to-pdf': ('Photos to one PDF', [['img-resize', 'pdf-from-images', 'pdf-numbers']], [], [M.GOLD]),
    'pdf-to-png': ('PDF pages to images', [['pdf-to-images', 'img-resize', 'zip-all']], [], [M.TEAL]),
    'shrink-scans': ('Shrink scans', [['pdf-gray', 'pdf-compress']], [], [M.TEAL]),
    'clip-to-gif': ('Clip to GIF', [['av-trim', 'vid-gif']], [], [M.SKY]),
    'video-split': ('Video plus sound track', [['vid-compress'], ['av-extract-audio']], [], [M.SKY]),
    'audio-batch': ('Audio to MP3', [['av-convert', 'file-rename', 'checksum']], [], [M.SKY]),
    'data-formats': ('Data in every format', [['data-convert'], ['data-convert']], [], [M.EMERALD]),
    'find-replace': ('Fix a word everywhere', [['text-replace']], [], [M.EMERALD]),
    'zip-repack': ('Repack a ZIP smaller', [['unzip', 'img-compress', 'zip-all']], [], [M.CYAN]),
}


def bez(p0, p1, t):
    (x1, y1), (x2, y2) = p0, p1
    dx = max(30, abs(x2 - x1) / 2)
    c1, c2 = (x1 + dx, y1), (x2 - dx, y2)
    u = 1 - t
    return (u ** 3 * x1 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * x2, u ** 3 * y1 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * y2)


def edge(ctx, a, b, color, alpha=0.5, lw=2):
    (x1, y1), (x2, y2) = a, b
    dx = max(30, abs(x2 - x1) / 2)
    ctx.move_to(x1, y1); ctx.curve_to(x1 + dx, y1, x2 - dx, y2, x2, y2)
    ctx.set_source_rgba(*M.rgbf(color, alpha)); ctx.set_line_width(lw); ctx.stroke()


class Layout:
    """Places input, step nodes (one row per branch), join nodes and output."""

    def __init__(self, W, H, branches, join, scale=1.0, top=0.0):
        self.W, self.H, self.s = W, H, scale
        cols = max(len(b) for b in branches) + len(join) + 2
        self.nw, self.nh = 78 * scale, 74 * scale
        gap = (W - 40 * scale - cols * self.nw) / max(1, cols - 1)
        gap = max(10 * scale, min(gap, 80 * scale))
        total = cols * self.nw + (cols - 1) * gap
        x0 = (W - total) / 2
        rows = len(branches)
        rh = 100 * scale
        cy = H * 0.56 + top
        ys = [cy + (i - (rows - 1) / 2) * rh for i in range(rows)]
        X = lambda c: x0 + c * (self.nw + gap)
        self.nodes = [('in', X(0), cy, None)]
        self.edges = []
        tails = []
        for bi, b in enumerate(branches):
            prev = 0
            for i, sid in enumerate(b):
                self.nodes.append((sid, X(i + 1), ys[bi], bi)); k = len(self.nodes) - 1
                self.edges.append((prev, k)); prev = k
            tails.append(prev)
        c = max(len(b) for b in branches) + 1
        for sid in join:
            self.nodes.append((sid, X(c), cy, None)); k = len(self.nodes) - 1
            for t in tails: self.edges.append((t, k))
            tails = [k]; c += 1
        self.nodes.append(('out', X(c), cy, None)); ko = len(self.nodes) - 1
        for t in tails: self.edges.append((t, ko))
        # paths from input to output for travelling files
        self.paths = []
        def walk(k, acc):
            acc = acc + [k]
            nxt = [b for a, b in self.edges if a == k]
            if not nxt: self.paths.append(acc); return
            for n in nxt: walk(n, acc)
        walk(0, [])

    def port_out(self, k):
        _, x, y, _ = self.nodes[k]; return (x + self.nw, y)

    def port_in(self, k):
        _, x, y, _ = self.nodes[k]; return (x, y)

    def center(self, k):
        _, x, y, _ = self.nodes[k]; return (x + self.nw / 2, y)


def draw_node(ctx, glow, L, k, t, active=0.0, appear=1.0):
    sid, x, y, _ = L.nodes[k]
    s = L.s
    if appear <= 0: return
    if sid == 'in': label, icon, col = 'Files', 'Upload', M.GOLD
    elif sid == 'out': label, icon, col = 'Results', 'Download', M.EMERALD
    else: label, icon, cat = STEP[sid]; col = CAT[cat]
    w, h = L.nw, L.nh
    sc = M.ease_out_back(min(1, appear))
    ctx.save(); ctx.translate(x + w / 2, y); ctx.scale(sc, sc); ctx.translate(-(x + w / 2), -y)
    M.rrect(ctx, x, y - h / 2, w, h, 14 * s, fill=M.SURF, stroke=M.mix(M.LINE, col, 0.35 + 0.65 * active), lw=1.6 * s + 1.2 * active * s)
    if active > 0.01 and glow is not None:
        M.rrect(glow, x - 4, y - h / 2 - 4, w + 8, h + 8, 16 * s, fill=col, alpha=0.55 * active); 
    M.rrect(ctx, x + w / 2 - 16 * s, y - 28 * s, 32 * s, 32 * s, 9 * s, fill=col, alpha=0.16)
    M.draw_sprite(ctx, M.icon_sprite(icon, int(19 * s), col), x + w / 2, y - 12 * s)
    M.text(ctx, label, M.font(M.SANS, 11.5 * s, 'SemiBold'), x + w / 2, y + 20 * s, color=M.TEXT, anchor='mm')
    # ports
    if sid != 'in': M.circle(ctx, x, y, 4 * s, fill=col)
    if sid != 'out': M.circle(ctx, x + w, y, 4 * s, fill=col)
    ctx.restore()


def file_card(ctx, x, y, col, s=1.0, alpha=1.0, shrink=1.0, kind='doc'):
    w, h = 18 * s * shrink, 22 * s * shrink
    M.rrect(ctx, x - w / 2, y - h / 2, w, h, 3.5 * s, fill=M.mix(M.SURF2, col, 0.25), stroke=col, lw=1.4 * s, alpha=alpha)
    M.line(ctx, x - w * 0.28, y - h * 0.12, x + w * 0.28, y - h * 0.12, col, 1.2 * s, alpha * 0.8)
    M.line(ctx, x - w * 0.28, y + h * 0.12, x + w * 0.12, y + h * 0.12, col, 1.2 * s, alpha * 0.6)


def scene_pipeline(W, H, branches, join, cols, t, T, title=None, scale=1.0, nfiles=5, bg=None, glow=None, extra=None):
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    ctx = cairo.Context(s)
    ctx.set_source_surface(bg, 0, 0); ctx.paint()
    g = glow.begin()
    L = Layout(W, H, branches, join, scale, top=(10 * scale if title else 0))
    ph = (t % T) / T
    for a, b in L.edges:
        p0, p1 = L.port_out(a), L.port_in(b)
        edge(ctx, p0, p1, M.GOLD, 0.35, 2 * scale)
        for k in range(3):  # flowing particles
            u = (ph * 2 + k / 3) % 1
            px, py = bez(p0, p1, u)
            M.circle(ctx, px, py, 2.2 * scale, fill=M.GLOW if k != 1 else M.CYAN, alpha=0.9)
            M.circle(g, px, py, 5 * scale, fill=M.GLOW, alpha=0.6)
    # files travelling along every path, staggered, periodic in T
    hops = [(L.port_out(p[i]), L.port_in(p[i + 1]), p[i + 1]) for p in L.paths for i in range(len(p) - 1)]
    active = {}
    for pi, path in enumerate(L.paths):
        segs = len(path) - 1
        for f in range(nfiles):
            u = (ph + f / nfiles + pi * 0.13) % 1
            pos = u * segs
            i = int(pos); fr = pos - i
            a, b = path[i], path[min(i + 1, segs)]
            p0, p1 = L.port_out(a), L.port_in(b)
            x, y = bez(p0, p1, M.ease_in_out(fr))
            col = cols[f % len(cols)] if i == 0 else M.mix(cols[f % len(cols)], CAT.get(STEP.get(L.nodes[a][0], ('', '', 'image'))[2], M.GOLD), 0.7)
            shrink = 1.0 - 0.06 * i
            file_card(ctx, x, y, col, scale, alpha=M.clamp(min(u, 1 - u) * 12), shrink=shrink)
            if fr > 0.85: active[b] = max(active.get(b, 0), (fr - 0.85) / 0.15)
            if fr < 0.15 and i > 0: active[a] = max(active.get(a, 0), 1 - fr / 0.15)
    for k in range(len(L.nodes)):
        draw_node(ctx, g, L, k, t, active=active.get(k, 0))
    glow.dirty = True
    glow.apply(ctx, radius=5, strength=0.9)
    if title:
        M.text(ctx, title, M.font(M.DISPLAY, 22 * scale, 'Bold'), 26 * scale, 34 * scale, color=M.TEXT, anchor='lm')
        M.text(ctx, 'OpenFile Workspace', M.font(M.SANS, 11 * scale, 'Medium'), 26 * scale, 58 * scale, color=M.GOLD, anchor='lm')
    if extra: extra(ctx, t)
    return s


def render_loop(rid, W=640, H=360, T=4.0):
    title, br, join, cols = RECIPES[rid]
    bg = M.make_background(W, H, seed=M.seed_of(rid), c2=M.CYAN if len(br) > 1 else M.TEAL)
    glow = M.GlowLayer(W, H, 3)
    path = os.path.join(OUT, rid + '.mp4')
    pipe = M.FFPipe(path, W, H, FPS, crf=24, preset='medium', maxrate='600k', extra=['-movflags', '+faststart'])
    n = int(T * FPS)
    mid = None
    for i in range(n):
        s = scene_pipeline(W, H, br, join, cols, i / FPS, T, title=title, scale=0.92 if max(len(b) for b in br) + len(join) > 3 else 1.0, bg=bg, glow=glow)
        pipe.write(s)
        if i == n // 3: mid = s
    pipe.close()
    poster(mid, os.path.join(OUT, rid + '.jpg'), W, H)


def poster(surf, path, W, H, q=82):
    surf.flush()
    img = Image.frombuffer('RGBA', (W, H), bytes(surf.get_data()), 'raw', 'BGRA', 0, 1).convert('RGB')
    img.save(path, quality=q, optimize=True, progressive=True)


def render_hero():
    W, H, T = 1280, 720, 6.0
    bg = M.make_background(W, H, seed=7, glow_pos=(0.3, 0.4), c2=M.CYAN)
    glow = M.GlowLayer(W, H, 4)
    parts = M.Particles(70, W, H, seed=3, colors=(M.GOLD, M.GLOW, M.CYAN, M.TEAL), speed=10)
    br = [['img-resize', 'img-watermark', 'img-convert'], ['pdf-merge', 'pdf-numbers'], ['vid-compress']]
    def extra(ctx, t):
        parts.draw(ctx, t % T, alpha=0.5)
        ph = (t % T) / T
        v = M.clamp(ph / 0.85)
        cx, cy, r = W - 92, 88, 44
        M.circle(ctx, cx, cy, r, stroke=M.LINE, lw=7)
        M.arc(ctx, cx, cy, r, -math.pi / 2, -math.pi / 2 + 2 * math.pi * v, M.GOLD, lw=7, alpha=1 - M.clamp((ph - 0.9) / 0.1))
        M.text(ctx, f'{int(v * 100)}%', M.font(M.DISPLAY, 22, 'Bold'), cx, cy, color=M.TEXT)
        M.text(ctx, f'{int(v * 248)} / 248 files', M.font(M.SANS, 14, 'Medium'), cx, cy + r + 22, color=M.TEXT, alpha=0.7)
    pipe = M.FFPipe(os.path.join(OUT, 'hero.mp4'), W, H, FPS, crf=24, preset='medium', maxrate='1400k', extra=['-movflags', '+faststart'])
    n = int(T * FPS)
    for i in range(n):
        s = scene_pipeline(W, H, br, ['zip-all'], [M.GOLD, M.TEAL, M.SKY, M.EMERALD], i / FPS, T, scale=1.45, nfiles=6, bg=bg, glow=glow, extra=extra)
        pipe.write(s)
        if i == int(n * 0.6): poster(s, os.path.join(OUT, 'hero.jpg'), W, H)
    pipe.close()


# ---------------------------------------------------------------- explainer, five scenes of 8 s
SCENES = [
    ('Your files stay in this tab', 'Nothing is uploaded. No server, no account.'),
    ('A graph of steps', 'Each step takes the files it understands. Branches copy, merges join.'),
    ('A worker pool runs it', 'Image steps run side by side in Web Workers. Video takes one at a time.'),
    ('Never bigger', 'If a result is bigger than your file, you get your original back.'),
    ('One ZIP, done', 'Grab every result at once, or save the recipe for next time.'),
]
SD = 8.0


def caption(ctx, W, H, i, t):
    a = M.win(t, 0.2, SD - 0.2, 0.4)
    M.text(ctx, f'{i + 1} / 5', M.font(M.MONO, 16, 'Bold'), 70, 70, color=M.GOLD, anchor='lm', alpha=a)
    M.kinetic_words(ctx, SCENES[i][0], M.font(M.DISPLAY, 46, 'Bold'), W / 2, 120, t - 0.2, color=M.TEXT)
    M.text(ctx, SCENES[i][1], M.font(M.SANS, 22, 'Regular'), W / 2, H - 70, color=M.TEXT, alpha=0.75 * M.win(t, 0.8, SD - 0.2, 0.5))


def render_scene(i):
    W, H = 1280, 720
    bg = M.make_background(W, H, seed=40 + i, c2=[M.TEAL, M.CYAN, M.SKY, M.EMERALD, M.TEAL][i])
    glow = M.GlowLayer(W, H, 4)
    pipe = M.FFPipe(os.path.join(OUT, f'.scene{i}.mp4'), W, H, FPS, crf=22, preset='medium', maxrate='1600k')
    n = int(SD * FPS)
    for f in range(n):
        t = f / FPS
        if i == 1:
            s = scene_pipeline(W, H, [['img-resize', 'img-convert'], ['img-crop', 'file-rename']], ['zip-all'], [M.GOLD, M.TEAL], t, 4.0, scale=1.4, bg=bg, glow=glow)
            ctx = cairo.Context(s)
        else:
            s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H); ctx = cairo.Context(s)
            ctx.set_source_surface(bg, 0, 0); ctx.paint()
            g = glow.begin()
            [scene0, None, scene2, scene3, scene4][i](ctx, g, W, H, t)
            glow.dirty = True; glow.apply(ctx, radius=6, strength=0.9)
        caption(ctx, W, H, i, t)
        fade = M.clamp(min(t / 0.35, (SD - t) / 0.35))
        if fade < 1:
            ctx.set_source_rgba(0, 0, 0, 1 - fade); ctx.paint()
        pipe.write(s)
        if f == int(n * 0.55): poster(s, os.path.join(OUT, f'.scene{i}.jpg'), W, H)
    pipe.close()


def scene0(ctx, g, W, H, t):
    x, y, w, h = 340, 220, 600, 340
    M.rrect(ctx, x, y, w, h, 22, fill=M.NEAR, stroke=M.LINE, lw=2)
    M.rrect(ctx, x, y, w, 40, 22, fill=M.SURF)
    for k, c in enumerate([M.GOLD, M.TEAL, M.EMERALD]): M.circle(ctx, x + 26 + k * 20, y + 20, 6, fill=c, alpha=0.8)
    M.text(ctx, 'openfile / workspace', M.font(M.MONO, 14, 'Medium'), x + w / 2, y + 20, color=M.TEXT, alpha=0.6)
    for k in range(9):
        st = 0.6 + k * 0.45
        u = M.clamp((t - st) / 0.9)
        if u <= 0: continue
        fx = x + 90 + (k % 5) * 105
        fy = M.lerp(y - 160, y + 130 + (k // 5) * 110, M.ease_out_back(u))
        file_card(ctx, fx, fy, [M.GOLD, M.TEAL, M.SKY, M.EMERALD, M.CYAN][k % 5], 2.2)
    lk = M.clamp((t - 4.8) / 0.6)
    if lk > 0:
        cx, cy = x + w - 70, y + h - 60
        M.circle(ctx, cx, cy, 34 * M.ease_out_back(lk), fill=M.GOLD)
        M.draw_sprite(ctx, M.icon_sprite('Lock', 36, M.BLACK, 2.4), cx, cy, alpha=lk)
        M.circle(g, cx, cy, 50, fill=M.GOLD, alpha=0.7 * lk)
    # the cloud is crossed out
    cu = M.clamp((t - 5.6) / 0.6)
    if cu > 0:
        M.draw_sprite(ctx, M.icon_sprite('CloudOff', 64, M.TEXT, 2.0), 1080, 300, alpha=0.7 * cu)


def scene2(ctx, g, W, H, t):
    lanes = 4
    x0, x1 = 220, 1060
    for l in range(lanes):
        y = 250 + l * 95
        M.rrect(ctx, x0 - 120, y - 30, 100, 60, 14, fill=M.SURF, stroke=M.SKY if l < 3 else M.LINE, lw=2)
        M.text(ctx, f'Worker {l + 1}' if l < 3 else 'ffmpeg', M.font(M.SANS, 14, 'SemiBold'), x0 - 70, y, color=M.TEXT)
        M.line(ctx, x0, y, x1, y, M.LINE, 2)
        speed = 1.6 if l < 3 else 0.55
        for k in range(4 if l < 3 else 1):
            u = ((t * speed / 3) + k / 4 + l * 0.17) % 1
            fx = M.lerp(x0, x1, u)
            col = [M.GOLD, M.TEAL, M.EMERALD, M.SKY][l]
            file_card(ctx, fx, y, col, 1.8, alpha=M.clamp(min(u, 1 - u) * 10))
            M.circle(g, fx, y, 16, fill=col, alpha=0.4)
        v = (t / SD) * (1 if l < 3 else 0.6)
        cx = x1 + 60
        M.circle(ctx, cx, y, 22, stroke=M.LINE, lw=5)
        M.arc(ctx, cx, y, 22, -math.pi / 2, -math.pi / 2 + 2 * math.pi * min(1, v * 1.1), M.GOLD, lw=5)
    m = 0.45 + 0.3 * M.clamp((t - 3) / 3)
    M.text(ctx, f'Memory guard  {int(m * 100)}%', M.font(M.MONO, 16, 'Medium'), W / 2, 640 - 40, color=M.EMERALD if m < 0.8 else M.GOLD, alpha=0.85)


def scene3(ctx, g, W, H, t):
    bx, base = 430, 560
    def bar(x, hgt, col, label, sub, a=1.0):
        M.rrect(ctx, x, base - hgt, 150, hgt, 14, fill=col, alpha=0.85 * a)
        M.text(ctx, label, M.font(M.SANS, 18, 'SemiBold'), x + 75, base + 28, color=M.TEXT, alpha=a)
        M.text(ctx, sub, M.font(M.MONO, 16, 'Medium'), x + 75, base - hgt - 22, color=M.TEXT, alpha=0.8 * a)
    u = M.ease_out(M.clamp((t - 0.6) / 1.2))
    bar(bx, 260 * u, M.TEAL, 'Your file', '2.4 MB')
    r = M.ease_out(M.clamp((t - 2.0) / 1.2))
    swap = M.clamp((t - 4.4) / 0.6)
    bar(bx + 260, 300 * r * (1 - swap) + 260 * swap * r, M.mix(M.GOLD, M.EMERALD, swap), 'Result', '2.8 MB' if swap < 0.5 else '2.4 MB, original kept')
    if swap > 0:
        cx, cy = bx + 335, base - 330
        M.circle(ctx, cx, cy, 26 * M.ease_out_back(swap), fill=M.EMERALD)
        M.draw_sprite(ctx, M.icon_sprite('Check', 30, M.BLACK, 3), cx, cy, alpha=swap)
        M.circle(g, cx, cy, 44, fill=M.EMERALD, alpha=0.6 * swap)


def scene4(ctx, g, W, H, t):
    cx, cy = W / 2, 380
    for k in range(12):
        a = k / 12 * 2 * math.pi
        u = M.ease_in_out(M.clamp((t - 0.8 - k * 0.12) / 1.4))
        r = 260 * (1 - u)
        file_card(ctx, cx + math.cos(a) * r, cy + math.sin(a) * r * 0.6, [M.GOLD, M.TEAL, M.SKY, M.EMERALD][k % 4], 2.0, alpha=1 - u * 0.9)
    z = M.clamp((t - 3.0) / 0.7)
    if z > 0:
        M.rrect(ctx, cx - 70, cy - 85, 140, 170, 22, fill=M.GOLD, alpha=z)
        M.draw_sprite(ctx, M.icon_sprite('FileArchive', 72, M.BLACK, 2.2), cx, cy - 10, alpha=z)
        M.text(ctx, 'pipeline.zip', M.font(M.MONO, 16, 'Bold'), cx, cy + 60, color=M.BLACK, alpha=z)
        M.circle(g, cx, cy, 140, fill=M.GOLD, alpha=0.45 * z)
    b = M.clamp((t - 4.4) / 0.6)
    if b > 0:
        M.rrect(ctx, cx - 140, cy + 130, 280, 56, 16, fill=M.SURF, stroke=M.GOLD, lw=2, alpha=b)
        M.text(ctx, 'Download all as ZIP', M.font(M.SANS, 20, 'SemiBold'), cx, cy + 158, color=M.TEXT, alpha=b)


def join_explainer():
    lst = os.path.join(OUT, '.scenes.txt')
    with open(lst, 'w') as f:
        for i in range(5): f.write(f"file '.scene{i}.mp4'\n")
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', os.path.join(OUT, 'how-it-works.mp4')], check=True)
    os.replace(os.path.join(OUT, '.scene1.jpg'), os.path.join(OUT, 'how-it-works.jpg'))
    for i in range(5):
        for e in ('mp4', 'jpg'):
            p = os.path.join(OUT, f'.scene{i}.{e}')
            if os.path.exists(p): os.remove(p)
    os.remove(lst)
    ts = lambda s: f'00:00:{int(s):02d}.{int((s % 1) * 1000):03d}'
    vtt = ['WEBVTT', '']
    for i, (a, b) in enumerate(SCENES):
        vtt += [f'{ts(i * SD + 0.3)} --> {ts(i * SD + SD - 0.3)}', f'{a}. {b}', '']
    open(os.path.join(OUT, 'how-it-works.vtt'), 'w').write('\n'.join(vtt))


# ---------------------------------------------------------------- sample files (all made here, no third-party content)
def landscape(W, H, sky, sand, sun, seed):
    rng = np.random.default_rng(seed)
    img = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        c = tuple(int(sky[0][i] * (1 - t) + sky[1][i] * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=c)
    d.ellipse((W * 0.62, H * 0.18, W * 0.62 + H * 0.22, H * 0.4), fill=sun)
    for k in range(4):
        pts = [(0, H)]
        base = H * (0.55 + k * 0.1)
        for x in range(0, W + 40, 40):
            pts.append((x, base + math.sin(x / (160 + k * 60) + seed + k) * 40 + rng.normal(0, 4)))
        pts.append((W, H))
        col = tuple(int(sand[i] * (0.55 + 0.15 * k)) for i in range(3))
        d.polygon(pts, fill=col)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def make_samples():
    landscape(1800, 1200, ((14, 22, 40), (245, 165, 36)), (180, 120, 60), (255, 214, 140), 1).save(os.path.join(SMP, 'photo-dunes.jpg'), quality=86)
    landscape(1600, 1067, ((8, 30, 46), (34, 211, 238)), (20, 120, 110), (230, 250, 255), 2).save(os.path.join(SMP, 'photo-lagoon.jpg'), quality=86)
    city = Image.new('RGB', (1200, 800), (5, 5, 5)); d = ImageDraw.Draw(city)
    rng = np.random.default_rng(5)
    for y in range(800): d.line([(0, y), (1200, y)], fill=(int(10 + 30 * y / 800), int(10 + 20 * y / 800), int(16 + 10 * y / 800)))
    x = 0
    while x < 1200:
        w = int(rng.integers(50, 120)); h = int(rng.integers(180, 560))
        d.rectangle((x, 800 - h, x + w, 800), fill=(18, 21, 26))
        for wy in range(800 - h + 14, 790, 22):
            for wx in range(x + 8, x + w - 8, 16):
                if rng.random() < 0.45: d.rectangle((wx, wy, wx + 7, wy + 10), fill=[(245, 165, 36), (56, 189, 248), (16, 185, 129)][int(rng.integers(0, 3))])
        x += w + int(rng.integers(4, 14))
    city.save(os.path.join(SMP, 'photo-city.png'), optimize=True)
    open(os.path.join(SMP, 'cities.csv'), 'w').write('city,state,population,founded\nCalcutta,West Bengal,4496694,1690\nMumbai,Maharashtra,12442373,1507\nPune,Maharashtra,3124458,847\nJhargram,West Bengal,61712,1800\nDelhi,Delhi,11034555,1052\n')
    json.dump([{'sku': 'OF-100', 'name': 'Notebook', 'stock': 42, 'price': 120.5}, {'sku': 'OF-101', 'name': 'Pen', 'stock': 300, 'price': 15}, {'sku': 'OF-102', 'name': 'Bag', 'stock': 7, 'price': 899, 'tags': ['travel', 'canvas']}], open(os.path.join(SMP, 'stock.json'), 'w'), indent=2)
    open(os.path.join(SMP, 'notes.txt'), 'w').write('Trip notes\n\nTrain from Calcutta at 6:10 in the morning.\nMeet at the Calcutta office before lunch.\nSend the photos as WEBP, under 500 KB each.\n')
    # bundle.zip: two photos and the CSV
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_STORED) as z:
        for n, img in (('trip/dunes.png', landscape(900, 600, ((14, 22, 40), (245, 165, 36)), (180, 120, 60), (255, 214, 140), 3)), ('trip/lagoon.png', landscape(900, 600, ((8, 30, 46), (34, 211, 238)), (20, 120, 110), (230, 250, 255), 4))):
            b = io.BytesIO(); img.save(b, 'PNG'); z.writestr(n, b.getvalue())
        z.write(os.path.join(SMP, 'cities.csv'), 'trip/cities.csv')
    open(os.path.join(SMP, 'bundle.zip'), 'wb').write(buf.getvalue())
    # tone.wav: 3 s, two notes, mono 22 kHz
    sr = 22050; tt = np.arange(int(sr * 3)) / sr
    sig = 0.3 * np.sin(2 * np.pi * 440 * tt) * np.exp(-tt * 0.6) + 0.2 * np.sin(2 * np.pi * 659.25 * tt) * (tt > 1.0) * np.exp(-(tt - 1) * 0.8)
    import wave
    with wave.open(os.path.join(SMP, 'tone.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(sig, -1, 1) * 32767).astype('<i2').tobytes())
    # clip.mp4: 5 s 640x360 with a moving gold ring and a tone
    W, H = 640, 360
    bg = M.make_background(W, H, seed=9)
    glow = M.GlowLayer(W, H, 3)
    tmp = os.path.join(SMP, '.clip-v.mp4')
    pipe = M.FFPipe(tmp, W, H, 24, crf=30, preset='medium')
    for f in range(5 * 24):
        t = f / 24
        s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H); c = cairo.Context(s); c.set_source_surface(bg, 0, 0); c.paint()
        g = glow.begin(); M.gold_ring(c, g, W / 2 + math.sin(t * 1.3) * 120, H / 2, 70, t); glow.dirty = True; glow.apply(c, 5)
        M.text(c, f'{t:4.1f}s', M.font(M.MONO, 20, 'Bold'), 40, 40, anchor='lm')
        pipe.write(s)
    pipe.close()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', tmp, '-f', 'lavfi', '-i', 'sine=frequency=330:duration=5', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-shortest', '-movflags', '+faststart', os.path.join(SMP, 'clip.mp4')], check=True)
    os.remove(tmp)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'loops'
    if cmd == 'samples': make_samples()
    elif cmd == 'loops':
        for rid in (sys.argv[2:] or list(RECIPES)): render_loop(rid); print('loop', rid, flush=True)
    elif cmd == 'hero': render_hero()
    elif cmd == 'explainer':
        arg = sys.argv[2]
        join_explainer() if arg == 'join' else render_scene(int(arg))
    for c in (M.GOLD, M.TEAL, M.CYAN, M.EMERALD, M.SKY): M.assert_palette_safe(c)

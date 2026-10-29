#!/usr/bin/env python3
"""
Explainer film per blog post (1920x1080, 24 fps): kinetic typography, animated diagrams built from the post's own
headings, lists and key terms, a UI sequence of the tool flow, Kokoro narration, a procedural music bed and WebVTT captions.

Input : scripts/blog-media/.cache/text/<slug>.json + cover/<slug>.svg (from extract.mjs), src/tools registry
Output: .cache/release/<slug>.mp4 (H.264 + AAC) and <slug>.webm (AV1 + Opus)     -> GitHub Release media-v1
        public/media/blog/<slug>/captions.vtt, video-poster.webp, video.json (scenes, chapters, duration)
        .cache/video/<slug>/still-<n>.png (section frames reused as post illustrations by images.py)
Run:   python3 scripts/blog-media/video.py <slug> [--still 12.5 out.png]
Same open-source stack as scripts/launch-video (cairocffi, Pillow, numpy, kokoro-onnx, ffmpeg).
On-screen text and narration rule: no em dashes, no exclamation marks, plain words.
"""
import argparse, io, json, math, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'media-lib'))
from ofmedia import *  # noqa
from ofmedia import _add

W, H, FPS = 1920, 1080, 24
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
PUB = os.path.join(REPO, 'public', 'media', 'blog')
REL = os.path.join(CACHE, 'release')
ORANGE, LIME = hexrgb('#F97316'), hexrgb('#84CC16')
HEX = {'#F5A524': GOLD, '#10B981': EMERALD, '#F97316': ORANGE, '#84CC16': LIME, '#38BDF8': SKY, '#22D3EE': CYAN, '#14B8A6': TEAL, '#60A5FA': SKY}
VOICES = [('af_heart', None, 1.0), ('am_michael', None, 1.0), ('bf_emma', None, 1.0), ('bm_george', None, 1.0), ('af_bella', None, 1.0), ('am_fenrir', None, 1.0)]
SKIP_HEADINGS = re.compile(r'^(try it|play with it|try the|demo|the short version|wrapping up|in short)', re.I)


def clean(s):
    s = s.replace('—', ', ').replace('–', ' to ').replace('!', '.')
    return re.sub(r'\s+', ' ', s).strip()


def sentences(text):
    return [x.strip() for x in re.split(r'(?<=[.?])\s+(?=[A-Z0-9"])', text) if x.strip()]


def summary(text, maxw=30):
    s = sentences(text)[0] if sentences(text) else text
    words = s.split()
    if len(words) > maxw:
        cut = ' '.join(words[:maxw])
        m = max(cut.rfind(', '), cut.rfind('; '), cut.rfind(': '))
        s = cut[:m] if m > 40 else cut
        s = s.rstrip(',;:') + '.'
    if not s.endswith(('.', '?')):
        s += '.'
    return clean(s)


def short_label(s, maxc=44):
    s = clean(s)
    for sep in (': ', '. ', ', ', ' (', ' - '):
        i = s.find(sep)
        if 6 < i <= maxc + 6:
            s = s[:i]; break
    if len(s) > maxc:
        s = s[:maxc].rsplit(' ', 1)[0]
    return s.rstrip('.,;:')


def ext_for(slug):
    rules = [('heic', 'HEIC'), ('midi', 'MID'), ('dicom', 'DCM'), ('dxf', 'DXF'), ('cad', 'DXF'), ('epub', 'EPUB'), ('ebook', 'EPUB'),
             ('comic', 'CBZ'), ('subtitle', 'SRT'), ('csv', 'CSV'), ('data', 'CSV'), ('parquet', 'PARQUET'), ('sqlite', 'DB'), ('json', 'JSON'),
             ('jwt', 'JWT'), ('regex', 'TXT'), ('curl', 'SH'), ('cron', 'TXT'), ('hash', 'ZIP'), ('pdf', 'PDF'), ('gif', 'MP4'),
             ('video', 'MP4'), ('audio', 'WAV'), ('speech', 'TXT'), ('transcriber', 'MP3'), ('sketch', 'SVG'), ('3d', 'GLB'),
             ('archive', 'ZIP'), ('jxl', 'PNG'), ('image', 'JPG'), ('photo', 'JPG'), ('background', 'PNG'), ('upscaler', 'PNG'),
             ('faces', 'JPG'), ('svg', 'SVG'), ('table', 'CSV'), ('object', 'JPG'), ('webp', 'MP4')]
    for k, e in rules:
        if k in slug:
            return e
    return 'FILE'


def wrap(s, fnt, maxw):
    lines, cur = [], ''
    for w in s.split():
        if cur and fnt.getlength(cur + ' ' + w) > maxw:
            lines.append(cur); cur = w
        else:
            cur = (cur + ' ' + w).strip()
    if cur:
        lines.append(cur)
    return lines


def fit_font(s, name, weight, size, maxw, max_lines):
    while size > 20:
        f = font(name, size, weight)
        ls = wrap(s, f, maxw)
        if len(ls) <= max_lines:
            return f, ls
        size -= 4
    f = font(name, size, weight)
    return f, wrap(s, f, maxw)[:max_lines]


# ============================================================================= plan
def plan(slug):
    d = json.load(open(os.path.join(CACHE, 'text', slug + '.json')))
    reg = {t['slug']: t for t in load_registry()}
    tools = [reg[s] for s in d['tools'] if s in reg]
    secs, cur = [], None
    for b in d['blocks']:
        if b['tag'] == 'h2':
            cur = dict(h=b['text'], id=b['id'], paras=[], lis=[], terms=[]); secs.append(cur)
        elif cur is not None:
            if b['tag'] == 'li':
                cur['lis'].append(b['text'])
            elif b['tag'] in ('p', 'blockquote'):
                cur['paras'].append(b['text'])
            for t in b.get('terms', []):
                if t not in cur['terms'] and len(t) <= 28 and not t.startswith('http'):
                    cur['terms'].append(t)
        for t in b.get('terms', []) if cur and b['tag'] == 'h3' else []:
            pass
        if cur is not None and b['tag'] == 'h3' and b['text'] not in cur['lis']:
            cur.setdefault('h3s', []).append(b['text'])
    good = [s for s in secs if s['paras'] and not SKIP_HEADINGS.match(s['h'])]
    if len(good) > 4:
        idx = sorted({round(i * (len(good) - 1) / 3) for i in range(4)})
        good = [good[i] for i in idx]
    kinds, prev = [], None
    for s in good:
        opts = []
        if len(s['lis']) >= 2 or len(s.get('h3s', [])) >= 2:
            opts.append('steps')
        if len(s['terms']) >= 3:
            opts.append('terms')
        opts += ['flow', 'stack'] if len(s['terms']) + len(s['lis']) >= 2 else ['flow']
        k = next((o for o in opts if o != prev), opts[0])
        kinds.append(k); prev = k
    scenes = [dict(key='intro', vo=clean(d['title']) + '.', pre=0.9, post=1.1)]
    scenes.append(dict(key='problem', vo=clean(d['description']), pre=0.4, post=1.0))
    for i, (s, k) in enumerate(zip(good, kinds)):
        labels = (s.get('h3s') if len(s.get('h3s', [])) >= 2 and len(s['lis']) < 2 else s['lis'])
        labels = [short_label(x) for x in labels][:4]
        if len(labels) < 2:
            extra = [x for p_ in s['paras'] for x in sentences(p_)][1:]
            labels = (labels + [short_label(x) for x in extra if 3 <= len(x.split())])[:4]
        if k == 'flow' and i % 2 == 1 and len(labels) >= 3:
            k = 'stack'
        scenes.append(dict(key='section', vo=clean(s['h']).rstrip('.?') + '. ' + summary(s['paras'][0]), n=i + 1, h=clean(s['h']), id=s['id'],
                           sum=summary(s['paras'][0]), kind=k, labels=labels, terms=[clean(t) for t in s['terms'][:6]], pre=0.4, post=0.9))
    if tools:
        t0 = tools[0]
        scenes.append(dict(key='tool', vo=f"To try it, open {clean(t0['name'])} in OpenFile. Drop in a file, adjust the settings and press the button. "
                                          "It all runs on your device, so nothing is uploaded.", tool=t0, others=tools[1:5], ext=ext_for(t0['slug']), pre=0.4, post=1.2, min=13.0))
    scenes.append(dict(key='outro', vo='Read the full post, with live demos, on the OpenFile blog.', pre=0.5, post=2.8))
    for s in scenes:
        assert '—' not in s['vo'] and '!' not in s['vo'], s['vo']
    return d, tools, scenes


def build_vo(slug, scenes, voice):
    work = os.path.join(CACHE, 'video', slug)
    os.makedirs(work, exist_ok=True)
    mp = os.path.join(work, 'vo.json')
    lines = [s['vo'] for s in scenes]
    if os.path.exists(mp):
        m = json.load(open(mp))
        if m.get('lines') == lines and m.get('voice') == voice[0]:
            return m['durs'], work
    import soundfile as sf
    tts = TTS()
    durs = []
    for i, s in enumerate(lines):
        a = tts.say(s, voice, speed=0.98)
        sf.write(os.path.join(work, f'vo_{i}.wav'), a, SR)
        durs.append(len(a) / SR)
    json.dump(dict(lines=lines, voice=voice[0], durs=durs), open(mp, 'w'))
    return durs, work


# ============================================================================= drawing helpers
def chip(c, x, y, label, accent, alpha=1.0, f=None, anchor='m', fill_a=0.12, h=56):
    f = f or font(SANS, 26, 'SemiBold')
    tw = f.getlength(label) + 52
    x0 = x - tw / 2 if anchor == 'm' else x
    rrect(c, x0, y - h / 2, tw, h, h / 2, fill=accent, stroke=accent, lw=2, alpha=alpha, falpha=fill_a, salpha=0.6)
    text(c, label, f, x0 + tw / 2, y, alpha=alpha)
    return tw


def file_card(c, x, y, w, h, ext, accent, alpha=1.0, rot=0.0, scale=1.0, label='your file'):
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(scale, scale)
    rrect(c, -w / 2 + 6, -h / 2 + 12, w, h, 16, fill=(0, 0, 0), alpha=alpha * 0.45)
    rrect(c, -w / 2, -h / 2, w, h, 16, fill=SURF, stroke=mix(LINE, accent, 0.5), lw=2, alpha=alpha)
    fe = font(MONO, 20, 'Bold')
    bw = fe.getlength(ext) + 26
    rrect(c, -w / 2 + 18, -h / 2 + 18, bw, 36, 9, fill=accent, alpha=alpha * 0.18)
    text(c, ext, fe, -w / 2 + 18 + bw / 2, -h / 2 + 36, color=accent, alpha=alpha)
    for i in range(3):
        rrect(c, -w / 2 + 18, -h / 2 + 72 + i * 20, (w - 36) * (0.9 - 0.2 * (i % 2)), 8, 4, fill=LINE, alpha=alpha)
    text(c, label, font(SANS, 18, 'Medium'), -w / 2 + 18, h / 2 - 24, color=MUTED, alpha=alpha, anchor='lm')
    c.restore()


def cursor(c, x, y, alpha=1.0, press=0.0):
    c.save(); c.translate(x, y); s = 1.2 * (1 - 0.12 * press); c.scale(s, s)
    c.move_to(0, 0); c.line_to(0, 34); c.line_to(9, 26); c.line_to(16, 41); c.line_to(22, 38); c.line_to(15, 24); c.line_to(26, 24); c.close_path()
    c.set_source_rgba(*rgbf(TEXT, alpha)); c.fill_preserve(); c.set_source_rgba(0, 0, 0, alpha); c.set_line_width(2); c.stroke()
    c.restore()


def arrow(c, x0, y0, x1, y1, color, k, lw=3, alpha=1.0):
    if k <= 0:
        return
    xe, ye = x0 + (x1 - x0) * k, y0 + (y1 - y0) * k
    line(c, x0, y0, xe, ye, color, lw, alpha)
    if k > 0.9:
        ang = math.atan2(y1 - y0, x1 - x0)
        for s in (-1, 1):
            line(c, xe, ye, xe - 16 * math.cos(ang + s * 0.5), ye - 16 * math.sin(ang + s * 0.5), color, lw, alpha)


def dashed_rrect(c, x, y, w, h, r, color, alpha, lw=2, dash=(12, 10), off=0.0):
    c.save(); rrect_path(c, x, y, w, h, r); c.set_dash(dash, off); c.set_line_width(lw)
    c.set_source_rgba(*rgbf(color, alpha)); c.stroke(); c.restore()


class Film:
    def __init__(self, slug):
        self.slug = slug
        self.d, self.tools, self.scenes = plan(slug)
        i = seed_of(slug)
        self.voice = VOICES[i % len(VOICES)]
        svg = open(os.path.join(CACHE, 'cover', slug + '.svg')).read()
        cols = re.findall(r'stop-color="(#[0-9A-Fa-f]{6})"', svg)
        self.a = HEX.get(cols[0].upper(), GOLD) if cols else GOLD
        self.b = HEX.get(cols[1].upper(), TEAL) if len(cols) > 1 else TEAL
        import cairosvg
        png = cairosvg.svg2png(bytestring=svg.encode(), output_width=800, output_height=500)
        img = Image.open(io.BytesIO(png)).convert('RGBA')
        # rounded corners
        m = Image.new('L', img.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), 28, fill=255)
        img.putalpha(m)
        self.cover = Sprite(pil_to_surface(img), 400, 250)
        durs, self.work = build_vo(slug, self.scenes, self.voice)
        for rnd in range(2):
            t = 0.0
            for s, dv in zip(self.scenes, durs):
                s['start'] = t; s['vo_at'] = t + s['pre']; s['vo_dur'] = dv
                s['dur'] = max(s.get('min', 0), s['pre'] + dv + s['post'])
                t += s['dur']
            if t >= 62:
                break
            # films run at least a minute: give the chapters more time to breathe
            secs = [s for s in self.scenes if s['key'] in ('section', 'problem')]
            for s in secs:
                s['post'] += (62.5 - t) / len(secs)
        self.DUR = t
        self.BG = make_background(W, H, glow_pos=(0.72, 0.3), glow2=(0.15, 0.9), c1=self.a, c2=self.b)
        self.BG2 = make_background(W, H, glow_pos=(0.3, 0.5), glow2=(0.85, 0.2), c1=self.b, c2=self.a)
        self.P = Particles(110, W, H, seed=i % 1000, colors=(self.a, GLOW, TEXT), speed=12)
        self.S = surface(W, H)
        self.C = cairo.Context(self.S)
        self.GL = GlowLayer(W, H, 4)

    # ------------------------------------------------------------------ scenes
    def sc_intro(self, c, g, t, d, s):
        k = ease_out(t / 0.8)
        text(c, 'OPENFILE BLOG', font(SANS, 24, 'Bold'), 150, 250, color=self.a, alpha=k, anchor='lm', tracking=6)
        f, ls = fit_font(self.d['title'], DISPLAY, 'Bold', 84, 820, 4)
        lh = f.size * 1.12
        y0 = 330
        for i, ln in enumerate(ls):
            kinetic_words(c, ln, f, 150, y0 + i * lh + lh / 2, t - 0.25 - i * 0.25, anchor_x='l', gradient=GOLD_TEAL if i == len(ls) - 1 else None)
        ka = ease_out((t - 1.4) / 0.8)
        meta = f"By Aniruddha Adak   |   {self.d['minutes']} minute read"
        text(c, meta, font(SANS, 28, 'Medium'), 150, y0 + len(ls) * lh + 50, color=MUTED, alpha=ka, anchor='lm')
        for j, tg in enumerate(self.d['tags'][:3]):
            pass
        kc = ease_out_back(clamp((t - 0.4) / 1.0), 1.2)
        fl = math.sin(t * 1.3) * 10
        gold_ring(c, g, 1430, 540, 330, t, alpha=0.25 * kc, orbit=True)
        self.GL.dirty = True
        rrect(g, 1430 - 400, 540 - 250 + fl, 800, 500, 28, stroke=self.a, lw=14, alpha=0.5 * kc)
        draw_sprite(c, self.cover, 1430, 540 + fl, alpha=clamp(kc), scale=0.86 + 0.14 * clamp(kc))
        rrect(c, 1430 - 400, 540 - 250 + fl, 800, 500, 28, stroke=mix(LINE, self.a, 0.6), lw=2, alpha=clamp(kc))

    def sc_problem(self, c, g, t, d, s):
        k = ease_out(t / 0.6)
        text(c, 'IN THIS POST', font(SANS, 24, 'Bold'), W / 2, 230, color=self.a, alpha=k, tracking=6)
        f, ls = fit_font(s['vo'], DISPLAY, 'Medium', 64, 1400, 5)
        lh = f.size * 1.25
        y0 = 540 - (len(ls) - 1) * lh / 2 - 30
        self.karaoke(c, ls, f, W / 2, y0, lh, t - s['pre'], s['vo_dur'], center=True)
        tg = self.d['tags'][:4]
        x = W / 2 - sum(font(SANS, 26, 'SemiBold').getlength('#' + x) + 52 + 20 for x in tg) / 2
        for j, tag in enumerate(tg):
            kk = ease_out_back(clamp((t - 0.8 - j * 0.15) / 0.6), 1.4)
            w_ = chip(c, x, y0 + len(ls) * lh + 70, '#' + tag, [self.a, self.b, TEAL, SKY][j % 4], alpha=clamp(kk), anchor='l')
            x += w_ + 20
        # floating file cards in the corners
        for j, (cx, cy, rot) in enumerate(((210, 860, -0.12), (1710, 250, 0.1), (1730, 880, -0.06))):
            kk = ease_out(clamp((t - 0.3 - j * 0.2) / 0.9))
            file_card(c, cx, cy + math.sin(t * 1.1 + j) * 8, 220, 170, ['PDF', 'JPG', 'MP4', 'CSV', 'EPUB', 'SRT'][(seed_of(self.slug) + j) % 6],
                      [self.a, self.b, SKY][j], alpha=0.55 * kk, rot=rot)

    def karaoke(self, c, lines, f, x, y0, lh, vt, vdur, center=False, color_dim=None):
        """Draw text lines; words light up in step with the narration."""
        allw = sum(len(l.split()) for l in lines)
        lit = clamp(vt / max(0.5, vdur * 0.95)) * allw
        n = 0
        sp = f.getlength(' ')
        for i, ln in enumerate(lines):
            words = ln.split()
            widths = [f.getlength(w) for w in words]
            total = sum(widths) + sp * (len(words) - 1)
            xx = x - total / 2 if center else x
            yy = y0 + i * lh
            ka = ease_out(clamp((vt + 0.6 - i * 0.12) / 0.5))
            for w, ww in zip(words, widths):
                on = clamp(lit - n)
                col = mix(DIM if color_dim is None else color_dim, TEXT, on)
                text(c, w, f, xx, yy + (1 - ka) * 20, color=col if on in (0, 1) else (TEXT if on > 0.5 else DIM), alpha=ka, anchor='lm')
                xx += ww + sp; n += 1

    def sc_section(self, c, g, t, d, s):
        k = ease_out(t / 0.6)
        num = f'{s["n"]:02d}'
        text(c, num, font(DISPLAY, 120, 'Bold'), 140, 215, color=self.a, alpha=0.9 * k, anchor='lm', gradient=GOLD_TEAL)
        text(c, 'CHAPTER', font(SANS, 22, 'Bold'), 300, 196, color=MUTED, alpha=k, anchor='lm', tracking=5)
        line(c, 300, 226, 300 + 320 * ease_out(t / 1.0), 226, self.a, 2, k)
        fh, lh_ = fit_font(s['h'], DISPLAY, 'Bold', 64, 760, 3)
        hy = 330
        for i, ln in enumerate(lh_):
            kinetic_words(c, ln, fh, 140, hy + i * fh.size * 1.12, t - 0.1 - i * 0.15, anchor_x='l')
        fs, ls = fit_font(s['sum'], SANS, 'Medium', 38, 760, 7)
        y0 = hy + len(lh_) * fh.size * 1.12 + 60
        self.karaoke(c, ls, fs, 140, y0, fs.size * 1.42, t - s['pre'] - (s['vo_dur'] * len(s['h']) / max(1, len(s['vo']))), s['vo_dur'] * (1 - len(s['h']) / max(1, len(s['vo']))))
        # diagram panel
        px, py, pw, ph = 1010, 150, 790, 780
        kp = ease_out(clamp((t - 0.2) / 0.8))
        rrect(c, px, py + (1 - kp) * 30, pw, ph, 32, fill=SURF, stroke=LINE, lw=2, alpha=0.75 * kp)
        getattr(self, 'dg_' + s['kind'])(c, g, t - 0.5, s, px, py + (1 - kp) * 30, pw, ph, kp)

    def dg_steps(self, c, g, t, s, px, py, pw, ph, ka):
        labels = s['labels'] if len(s['labels']) >= 2 else s['terms'][:4]
        if len(labels) < 2:
            return self.dg_flow(c, g, t, s, px, py, pw, ph, ka)
        n = len(labels)
        gap = (ph - 120) / max(1, n)
        f = font(SANS, 30, 'SemiBold')
        for i, lab in enumerate(labels):
            kk = ease_out_back(clamp((t - 0.3 - i * 0.55) / 0.6), 1.3)
            y = py + 60 + gap * i + gap / 2
            col = [self.a, self.b, TEAL, SKY][i % 4]
            if i < n - 1:
                arrow(c, px + 110, y + 46, px + 110, y + gap - 46, col, ease_in_out(clamp((t - 0.6 - i * 0.55) / 0.5)), 3, ka)
            circle(c, px + 110, y, 40, fill=col, alpha=0.16 * ka * clamp(kk))
            circle(c, px + 110, y, 40, stroke=col, lw=3, alpha=ka * clamp(kk))
            text(c, str(i + 1), font(DISPLAY, 34, 'Bold'), px + 110, y, color=col, alpha=ka * clamp(kk))
            rrect(c, px + 180, y - 44, pw - 240, 88, 20, fill=BLACK, stroke=mix(LINE, col, 0.4), lw=2, alpha=ka * clamp(kk) * 0.9)
            ff, ll = fit_font(lab, SANS, 'SemiBold', 30, pw - 300, 2)
            for j, l in enumerate(ll):
                text(c, l, ff, px + 210, y + (j - (len(ll) - 1) / 2) * ff.size * 1.15, alpha=ka * clamp(kk), anchor='lm')
        # travelling pulse
        if n > 1:
            tt = (t * 0.5) % 1
            y = py + 60 + gap / 2 + tt * gap * (n - 1)
            circle(g, px + 110, y, 18, fill=GLOW, alpha=0.9 * ka); self.GL.dirty = True

    def dg_terms(self, c, g, t, s, px, py, pw, ph, ka):
        cx, cy = px + pw / 2, py + ph / 2
        terms = s['terms'][:6]
        kc = ease_out_back(clamp(t / 0.8), 1.3)
        gold_ring(c, g, cx, cy, 90 * clamp(kc) + 1, t, alpha=ka, orbit=True); self.GL.dirty = True
        draw_sprite(c, self.cover, cx, cy, alpha=ka * clamp(kc), scale=0.2)
        R = 270
        f = font(MONO, 26, 'Bold')
        for i, tm in enumerate(terms):
            ang = -math.pi / 2 + i * 2 * math.pi / len(terms) + math.sin(t * 0.3) * 0.05
            kk = ease_out(clamp((t - 0.4 - i * 0.3) / 0.6))
            x, y = cx + math.cos(ang) * R * (0.6 + 0.4 * kk), cy + math.sin(ang) * R * 0.95 * (0.6 + 0.4 * kk)
            line(c, cx + math.cos(ang) * 105, cy + math.sin(ang) * 105, x - math.cos(ang) * 40, y - math.sin(ang) * 40, self.b, 2, ka * kk * 0.6)
            label = tm if f.getlength(tm) < 330 else tm[:18] + '..'
            chip(c, x, y, label, [self.a, self.b, TEAL, SKY, LIME, ORANGE][i % 6], alpha=ka * kk, f=f, fill_a=0.16)

    def dg_flow(self, c, g, t, s, px, py, pw, ph, ka):
        terms = (s['terms'] + s['labels'])[:3]
        mid = terms[0] if terms else 'Your browser'
        out = terms[1] if len(terms) > 1 else 'Result'
        cy = py + ph / 2 - 40
        k1 = ease_out(clamp(t / 0.6))
        file_card(c, px + 150, cy, 200, 160, ext_for(self.d['tools'][0] if self.d['tools'] else self.slug), self.a, alpha=ka * k1)
        arrow(c, px + 265, cy, px + 320, cy, self.a, ease_in_out(clamp((t - 0.5) / 0.4)), 3, ka)
        k2 = ease_out_back(clamp((t - 0.7) / 0.6), 1.3)
        cx = px + pw / 2
        circle(c, cx, cy, 92, fill=self.b, alpha=0.12 * ka * clamp(k2))
        arc(c, cx, cy, 92, t * 1.5, t * 1.5 + 4.4, self.b, 6, ka * clamp(k2))
        arc(c, cx, cy, 70, -t * 2, -t * 2 + 2.5, self.a, 4, ka * clamp(k2))
        circle(g, cx, cy, 70, fill=self.b, alpha=0.35 * ka * clamp(k2)); self.GL.dirty = True
        fm, lm = fit_font(mid, SANS, 'Bold', 26, 220, 2)
        for j, l in enumerate(lm):
            text(c, l, fm, cx, cy + 140 + j * 32, alpha=ka * clamp(k2))
        arrow(c, cx + 105, cy, cx + 160, cy, self.b, ease_in_out(clamp((t - 1.3) / 0.4)), 3, ka)
        k3 = ease_out_back(clamp((t - 1.6) / 0.6), 1.3)
        ox = px + pw - 150
        rrect(c, ox - 100, cy - 80, 200, 160, 18, fill=SURF2, stroke=EMERALD, lw=3, alpha=ka * clamp(k3))
        line(c, ox - 30, cy, ox - 6, cy + 24, EMERALD, 6, ka * clamp(k3)); line(c, ox - 6, cy + 24, ox + 38, cy - 26, EMERALD, 6, ka * clamp(k3))
        fo, lo = fit_font(out, SANS, 'Bold', 26, 230, 2)
        for j, l in enumerate(lo):
            text(c, l, fo, ox, cy + 140 + j * 32, alpha=ka * clamp(k3))
        kk = ease_out(clamp((t - 2.2) / 0.6))
        dashed_rrect(c, px + 40, py + 120, pw - 80, ph - 200, 26, self.a, 0.6 * ka * kk, off=-t * 30)
        text(c, 'Inside your browser tab', font(SANS, 24, 'SemiBold'), px + pw / 2, py + ph - 50, color=self.a, alpha=ka * kk)

    def dg_stack(self, c, g, t, s, px, py, pw, ph, ka):
        labels = (s['labels'] + s['terms'])[:4]
        if len(labels) < 2:
            return self.dg_flow(c, g, t, s, px, py, pw, ph, ka)
        n = len(labels)
        cx = px + pw / 2
        for i in range(n):
            j = n - 1 - i
            kk = ease_out_back(clamp((t - 0.2 - j * 0.35) / 0.6), 1.2)
            y = py + 170 + j * 140 + (1 - clamp(kk)) * -60
            col = [self.a, self.b, TEAL, SKY][j % 4]
            c.save(); c.translate(cx, y); c.transform(cairo.Matrix(1, 0, -0.35, 1, 0, 0))
            rrect(c, -280, -50, 560, 100, 18, fill=SURF2, stroke=col, lw=3, alpha=ka * clamp(kk))
            c.restore()
            rrect(g, cx - 280, y - 50, 560, 100, 18, stroke=col, lw=10, alpha=0.25 * ka * clamp(kk)); self.GL.dirty = True
            ff, ll = fit_font(labels[j], SANS, 'SemiBold', 28, 470, 2)
            for q, l in enumerate(ll):
                text(c, l, ff, cx, y + (q - (len(ll) - 1) / 2) * ff.size * 1.12, alpha=ka * clamp(kk))
            text(c, f'{j + 1}', font(DISPLAY, 28, 'Bold'), cx - 330, y, color=col, alpha=ka * clamp(kk))

    def sc_tool(self, c, g, t, d, s):
        tool = s['tool']
        col = CAT_COLORS.get(tool['category'], self.a)
        k = ease_out(t / 0.7)
        bx, by, bw, bh = 230, 120 + (1 - k) * 40, 1460, 780
        rrect(c, bx, by, bw, bh, 22, fill=BLACK, stroke=LINE, lw=2, alpha=k)
        rrect(c, bx, by, bw, 64, 22, fill=SURF2, alpha=k)
        for i, cc in enumerate([hexrgb('#EF4444'), GOLD, EMERALD]):
            circle(c, bx + 34 + i * 26, by + 32, 8, fill=cc, alpha=k)
        rrect(c, bx + 130, by + 14, bw - 260, 36, 18, fill=BLACK, alpha=k)
        text(c, f"openfile  /  {tool['slug']}", font(SANS, 20, 'Medium'), bx + 160, by + 32, color=MUTED, alpha=k, anchor='lm')
        # header
        rrect(c, bx + 50, by + 100, 84, 84, 20, fill=col, alpha=0.15 * k)
        draw_sprite(c, icon_sprite(tool['icon'] or 'File', 46, col), bx + 92, by + 142, k)
        text(c, tool['name'], font(DISPLAY, 46, 'Bold'), bx + 160, by + 126, alpha=k, anchor='lm')
        fd, ld = fit_font(tool['desc'], SANS, 'Regular', 24, 1150, 1)
        text(c, ld[0] if ld else '', fd, bx + 160, by + 168, color=MUTED, alpha=k, anchor='lm')
        # dropzone
        dx, dy, dw, dh = bx + 50, by + 230, 760, 470
        dropped = t > 3.4
        dashed_rrect(c, dx, dy, dw, dh, 22, col if not dropped else LINE, (0.9 if 1.6 < t < 3.4 else 0.55) * k, lw=3, off=-t * 25)
        if not dropped:
            draw_sprite(c, icon_sprite('Upload', 64, col), dx + dw / 2, dy + dh / 2 - 50, k)
            text(c, 'Drop a file here', font(SANS, 32, 'SemiBold'), dx + dw / 2, dy + dh / 2 + 30, alpha=k)
            text(c, 'It stays on this device', font(SANS, 22, 'Regular'), dx + dw / 2, dy + dh / 2 + 72, color=MUTED, alpha=k)
        # dragged file + cursor
        fx0, fy0, fx1, fy1 = 1900, 980, dx + dw / 2, dy + dh / 2
        kd = ease_in_out(clamp((t - 1.2) / 2.0))
        if t < 3.6:
            fx, fy = lerp(fx0, fx1, kd), lerp(fy0, fy1, kd) - math.sin(kd * math.pi) * 120
            file_card(c, fx, fy, 200, 160, s['ext'], col, alpha=clamp((t - 1.0) / 0.3) * (1 - clamp((t - 3.4) / 0.2)), rot=-0.08 * (1 - kd), label='my-file.' + s['ext'].lower())
            cursor(c, fx + 60, fy + 50, alpha=clamp((t - 1.0) / 0.3))
        if dropped:
            kr = ease_out(clamp((t - 3.4) / 0.5))
            for i in range(2):
                yy = dy + 40 + i * 96
                rrect(c, dx + 30, yy, dw - 60, 80, 16, fill=SURF, stroke=LINE, lw=2, alpha=k * kr)
                rrect(c, dx + 50, yy + 18, 70, 44, 10, fill=col, alpha=0.18 * k * kr)
                text(c, s['ext'], font(MONO, 18, 'Bold'), dx + 85, yy + 40, color=col, alpha=k * kr)
                text(c, f"my-file{'' if i == 0 else '-2'}.{s['ext'].lower()}", font(SANS, 24, 'SemiBold'), dx + 145, yy + 30, alpha=k * kr, anchor='lm')
                text(c, ['2.4 MB', '880 KB'][i], font(SANS, 20, 'Regular'), dx + 145, yy + 58, color=MUTED, alpha=k * kr, anchor='lm')
            # progress
            kp = ease_in_out(clamp((t - 6.6) / 2.6))
            if t > 6.4:
                yy = dy + 250
                text(c, 'Working on your device' if kp < 1 else 'Done', font(SANS, 26, 'SemiBold'), dx + 30, yy, alpha=k, anchor='lm', color=TEXT if kp < 1 else EMERALD)
                text(c, f'{int(kp * 100)}%', font(MONO, 24, 'Bold'), dx + dw - 30, yy, color=col, alpha=k, anchor='rm')
                rrect(c, dx + 30, yy + 30, dw - 60, 14, 7, fill=SURF2, alpha=k)
                if kp > 0:
                    rrect(c, dx + 30, yy + 30, (dw - 60) * kp, 14, 7, fill=col, alpha=k)
                    circle(g, dx + 30 + (dw - 60) * kp, yy + 37, 16, fill=GLOW, alpha=0.8 * k); self.GL.dirty = True
            if t > 9.3:
                kb = ease_out_back(clamp((t - 9.3) / 0.5), 1.4)
                rrect(c, dx + 30, dy + 330, 330, 74, 18, fill=EMERALD, alpha=k * clamp(kb))
                draw_sprite(c, icon_sprite('Download', 30, BLACK), dx + 75, dy + 367, k * clamp(kb))
                text(c, 'Download result', font(SANS, 26, 'Bold'), dx + 105, dy + 367, color=BLACK, alpha=k * clamp(kb), anchor='lm')
                rrect(g, dx + 30, dy + 330, 330, 74, 18, fill=EMERALD, alpha=0.5 * k * clamp(kb)); self.GL.dirty = True
        # settings panel
        sx, sy, sw = bx + 850, by + 230, 560
        rrect(c, sx, sy, sw, 470, 22, fill=SURF, stroke=LINE, lw=2, alpha=k)
        text(c, 'Settings', font(SANS, 28, 'Bold'), sx + 30, sy + 44, alpha=k, anchor='lm')
        for i, (lab, v0, v1) in enumerate((('Quality', 0.8, 0.62), ('Size', 0.5, 0.74))):
            yy = sy + 110 + i * 100
            kv = ease_in_out(clamp((t - 4.0 - i * 0.8) / 0.9))
            v = lerp(v0, v1, kv)
            text(c, lab, font(SANS, 22, 'Medium'), sx + 30, yy, color=MUTED, alpha=k, anchor='lm')
            text(c, f'{int(v * 100)}', font(MONO, 22, 'Bold'), sx + sw - 30, yy, color=col, alpha=k, anchor='rm')
            rrect(c, sx + 30, yy + 30, sw - 60, 10, 5, fill=SURF2, alpha=k)
            rrect(c, sx + 30, yy + 30, (sw - 60) * v, 10, 5, fill=col, alpha=k)
            circle(c, sx + 30 + (sw - 60) * v, yy + 35, 15, fill=TEXT, alpha=k)
        # segmented
        yy = sy + 320
        opts = ['Fast', 'Balanced', 'Best']
        sel = 1 if t < 5.6 else 2
        for i, o in enumerate(opts):
            ox = sx + 30 + i * (sw - 60) / 3
            rrect(c, ox + 4, yy, (sw - 60) / 3 - 8, 50, 14, fill=col if i == sel else SURF2, alpha=k * (0.9 if i == sel else 1))
            text(c, o, font(SANS, 22, 'SemiBold'), ox + (sw - 60) / 6, yy + 25, color=BLACK if i == sel else MUTED, alpha=k)
        # run button
        press = clamp(1 - abs(t - 6.3) / 0.25)
        rrect(c, sx + 30, sy + 395, sw - 60, 58, 16, fill=GOLD, alpha=k * (1 - 0.25 * press))
        text(c, 'Run on this device', font(SANS, 24, 'Bold'), sx + sw / 2, sy + 424, color=BLACK, alpha=k)
        if 4.0 < t < 6.6:
            cx_ = lerp(sx + 300, sx + sw / 2 + 40, ease_in_out(clamp((t - 5.6) / 0.6)))
            cy_ = lerp(sy + 200, sy + 430, ease_in_out(clamp((t - 5.6) / 0.6)))
            cursor(c, cx_, cy_, alpha=k * win(t, 4.0, 6.6, 0.3), press=press)
        # other tools
        if s['others'] and t > 10.0:
            x = W / 2 - sum(font(SANS, 24, 'SemiBold').getlength(o['name']) + 52 + 18 for o in s['others']) / 2 - 80
            ka = ease_out(clamp((t - 10.0) / 0.6))
            text(c, 'Also try', font(SANS, 24, 'Bold'), x, 975, color=MUTED, alpha=ka, anchor='lm')
            x += 120
            for j, o in enumerate(s['others']):
                kk = ease_out_back(clamp((t - 10.2 - j * 0.15) / 0.5), 1.4)
                x += chip(c, x, 975, o['name'], CAT_COLORS.get(o['category'], self.a), alpha=clamp(kk), f=font(SANS, 24, 'SemiBold'), anchor='l', h=52) + 18

    def sc_outro(self, c, g, t, d, s):
        logo_mark(c, g, W / 2, 330, 180, t, alpha=1, progress=ease_in_out(t / 1.2)); self.GL.dirty = True
        kinetic_words(c, 'Read the full post', font(DISPLAY, 80, 'Bold'), W / 2, 540, t - 0.4, gradient=GOLD_TEAL)
        k = ease_out(clamp((t - 1.0) / 0.6))
        text(c, 'With live demos, on the OpenFile blog', font(SANS, 34, 'Medium'), W / 2, 625, color=MUTED, alpha=k)
        text(c, 'aniruddhaadak80.github.io/OpenFile/blog', font(MONO, 28, 'Medium'), W / 2, 690, color=self.a, alpha=k)
        x = W / 2 - 330
        for j, lab in enumerate(('Free', 'Open source', 'Private', 'Offline')):
            kk = ease_out_back(clamp((t - 1.4 - j * 0.12) / 0.5), 1.4)
            x += chip(c, x, 800, lab, [GOLD, TEAL, EMERALD, SKY][j], alpha=clamp(kk), anchor='l') + 22
        text(c, 'By Aniruddha Adak', font(SANS, 24, 'Medium'), W / 2, 900, color=DIM, alpha=k)

    # ------------------------------------------------------------------ frame
    def scene_at(self, tt):
        return next((s for s in self.scenes if s['start'] <= tt < s['start'] + s['dur']), self.scenes[-1])

    def render(self, tt):
        c = self.C
        s = self.scene_at(tt)
        lt = tt - s['start']
        c.set_operator(cairo.OPERATOR_SOURCE)
        c.set_source_surface(self.BG2 if s['key'] in ('problem', 'tool') else self.BG, 0, 0)
        c.paint()
        c.set_operator(cairo.OPERATOR_OVER)
        g = self.GL.begin()
        self.P.draw(c, tt, alpha=0.5)
        fin = ease_in_out(lt / 0.4) if s['key'] != 'intro' else ease_in_out(lt / 0.7)
        fout = ease_in_out((s['dur'] - lt) / 0.4) if s['key'] != 'outro' else ease_in_out((s['dur'] - lt) / 1.0)
        a = min(fin, fout)
        c.push_group()
        getattr(self, 'sc_' + s['key'])(c, g, lt, s['dur'], s)
        c.pop_group_to_source()
        c.paint_with_alpha(a)
        self.GL.apply(c, radius=7, strength=0.9 * a, passes=2)
        # progress line along the bottom
        rrect(c, 0, H - 6, W * tt / self.DUR, 6, 0, fill=self.a, alpha=0.7)
        return self.S

    # ------------------------------------------------------------------ outputs
    def captions(self):
        def ts(x):
            h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60
            return f'{h:02d}:{m:02d}:{s:06.3f}'
        out = ['WEBVTT', '']
        n = 1
        for s in self.scenes:
            words = s['vo'].split()
            chunks, cur = [], []
            for w in words:
                cur.append(w)
                if len(' '.join(cur)) > 70 or (w.endswith(('.', '?')) and len(' '.join(cur)) > 30):
                    chunks.append(' '.join(cur)); cur = []
            if cur:
                chunks.append(' '.join(cur))
            total = sum(len(x) for x in chunks)
            t = s['vo_at']
            for ch in chunks:
                dur = s['vo_dur'] * len(ch) / total
                out += [str(n), f'{ts(t)} --> {ts(t + dur)}', ch, '']
                t += dur; n += 1
        return '\n'.join(out)

    def audio(self):
        import soundfile as sf
        n = int((self.DUR + 1) * SR)
        voice = np.zeros(n, np.float32)
        for i, s in enumerate(self.scenes):
            a, _ = sf.read(os.path.join(self.work, f'vo_{i}.wav'), dtype='float32')
            _add(voice, s['vo_at'] * SR, a)
        i = seed_of(self.slug)
        music, info = make_music(self.DUR + 0.5, seed=i % 100000, bpm=78 + i % 20, key=i % 12, beat=True, intro=2.5, outro=3.0, density=0.6,
                                 beat_start=self.scenes[1]['start'], beat_end=self.DUR - 3.0)
        mix_ = duck_mix(music, voice[:music.shape[1]], voice_gain=1.0, music_gain=0.42, duck=0.6)
        raw = os.path.join(self.work, 'mix_raw.wav')
        write_wav(raw, mix_)
        out = os.path.join(self.work, 'mix.wav')
        loudnorm_two_pass(raw, out, I=-16, TP=-1.5)
        return out

    def make(self):
        os.makedirs(REL, exist_ok=True)
        pub = os.path.join(PUB, self.slug)
        os.makedirs(pub, exist_ok=True)
        wav = self.audio()
        mp4 = os.path.join(REL, self.slug + '.mp4')
        webm = os.path.join(REL, self.slug + '.webm')
        cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-i', wav,
               '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'animation', '-crf', '27', '-maxrate', '700k', '-bufsize', '1400k',
               '-g', '96', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '80k', '-ac', '2', '-movflags', '+faststart', '-shortest', mp4,
               '-map', '0:v', '-map', '1:a', '-c:v', 'libsvtav1', '-preset', '11', '-crf', '44', '-g', '240', '-pix_fmt', 'yuv420p',
               '-svtav1-params', 'tune=0:lp=1', '-c:a', 'libopus', '-b:a', '56k', '-shortest', webm]
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        stills, si = [], 0
        nfr = int(self.DUR * FPS)
        marks = {int((s['start'] + min(s['dur'] - 1.0, max(s['pre'] + s['vo_dur'] * 0.85, 4.5))) * FPS): s for s in self.scenes if s['key'] in ('section', 'tool')}
        poster_f = int(min(self.scenes[0]['dur'] - 0.3, 3.2) * FPS)
        for i in range(nfr):
            surf = self.render(i / FPS)
            surf.flush()
            p.stdin.write(bytes(surf.get_data()))
            if i == poster_f:
                surf.write_to_png(os.path.join(self.work, 'poster.png'))
            if i in marks:
                fn = os.path.join(self.work, f'still-{si}.png'); surf.write_to_png(fn)
                s = marks[i]
                stills.append(dict(file=fn, key=s['key'], h=s.get('h') or s['tool']['name'], sum=s.get('sum', ''), id=s.get('id', ''), kind=s.get('kind', 'tool')))
                si += 1
        p.stdin.close()
        if p.wait():
            raise RuntimeError('ffmpeg failed')
        Image.open(os.path.join(self.work, 'poster.png')).convert('RGB').resize((1280, 720), Image.LANCZOS).save(os.path.join(pub, 'video-poster.webp'), quality=78, method=6)
        open(os.path.join(pub, 'captions.vtt'), 'w').write(self.captions())
        chapters = [dict(t=round(s['start'], 2), label={'intro': 'Intro', 'problem': 'In this post', 'tool': 'Try the tool', 'outro': 'Read more'}.get(s['key'], s.get('h', ''))) for s in self.scenes]
        info = dict(dur=round(self.DUR, 2), voice=self.voice[0], chapters=chapters, stills=stills,
                    mp4=os.path.getsize(mp4), webm=os.path.getsize(webm), lines=[s['vo'] for s in self.scenes])
        json.dump(info, open(os.path.join(self.work, 'video.json'), 'w'), indent=1)
        print(f'video {self.slug}: {self.DUR:.1f}s mp4 {os.path.getsize(mp4) / 1e6:.2f} MB webm {os.path.getsize(webm) / 1e6:.2f} MB', flush=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('slug')
    ap.add_argument('--still', nargs=2)
    ap.add_argument('--sheet', help='contact sheet png of one frame per scene')
    a = ap.parse_args()
    f = Film(a.slug)
    if a.still:
        f.render(float(a.still[0])).write_to_png(a.still[1])
    elif a.sheet:
        ims = []
        for s in f.scenes:
            for frac in (0.55,):
                f.render(s['start'] + s['dur'] * frac).write_to_png('/tmp/_s.png')
                ims.append(Image.open('/tmp/_s.png').convert('RGB').resize((640, 360)))
        cols = 3
        sheet = Image.new('RGB', (640 * cols, 360 * ((len(ims) + cols - 1) // cols)))
        for i, im in enumerate(ims):
            sheet.paste(im, ((i % cols) * 640, (i // cols) * 360))
        sheet.save(a.sheet)
        print(json.dumps([(s['key'], s.get('kind'), round(s['start'], 1), round(s['dur'], 1)) for s in f.scenes]), f.DUR)
    else:
        f.make()

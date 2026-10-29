#!/usr/bin/env python3
"""
Illustrations per post (WebP, 1600x900), rendered with cairo in the brand palette, no photos, no faces, no logos:
  map.webp      a route map of the post: every chapter heading as a numbered stop
  flow.webp     how the post's tools fit together: your file, the tools, the result, all inside the browser tab
  scene-N.webp  one or two chapter diagrams taken from the explainer film (video.py writes the frames)
Writes public/media/blog/<slug>/*.webp and .cache/images/<slug>.json (alt text and captions for the manifest).
Run: python3 scripts/blog-media/images.py <slug> [<slug> ...]
"""
import json, math, os, re, sys
HERE_ = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE_, '..', 'media-lib'))
from ofmedia import *  # noqa
sys.path.insert(0, HERE_)

IW, IH = 1600, 900
CACHE = os.path.join(HERE_, '.cache')
PUB = os.path.join(REPO, 'public', 'media', 'blog')
ORANGE, LIME = hexrgb('#F97316'), hexrgb('#84CC16')
HEX = {'#F5A524': GOLD, '#10B981': EMERALD, '#F97316': ORANGE, '#84CC16': LIME, '#38BDF8': SKY, '#22D3EE': CYAN, '#14B8A6': TEAL, '#60A5FA': SKY}


def wrap(s, fnt, maxw):
    lines, cur = [], ''
    for w in s.split():
        if cur and fnt.getlength(cur + ' ' + w) > maxw:
            lines.append(cur); cur = w
        else:
            cur = (cur + ' ' + w).strip()
    return lines + ([cur] if cur else [])


def save(surf, path):
    surf.flush()
    img = Image.frombuffer('RGBA', (surf.get_width(), surf.get_height()), bytes(surf.get_data()), 'raw', 'BGRa', 0, 1).convert('RGB')
    img.save(path, quality=80, method=6)


def colors(slug):
    svg = open(os.path.join(CACHE, 'cover', slug + '.svg')).read()
    cols = re.findall(r'stop-color="(#[0-9A-Fa-f]{6})"', svg)
    return (HEX.get(cols[0].upper(), GOLD) if cols else GOLD), (HEX.get(cols[1].upper(), TEAL) if len(cols) > 1 else TEAL)


def img_map(d, a, b, path):
    heads = [x['text'] for x in d['blocks'] if x['tag'] == 'h2']
    s = surface(IW, IH); c = cairo.Context(s)
    c.set_source_surface(make_background(IW, IH, glow_pos=(0.2, 0.15), glow2=(0.9, 0.9), c1=a, c2=b), 0, 0); c.paint()
    text(c, 'ROUTE MAP OF THIS POST', font(SANS, 22, 'Bold'), 90, 80, color=a, anchor='lm', tracking=5)
    ft = font(DISPLAY, 46, 'Bold')
    for i, l in enumerate(wrap(d['title'], ft, 1400)[:2]):
        text(c, l, ft, 90, 140 + i * 54, anchor='lm')
    n = len(heads)
    cols = 2 if n > 5 else 1
    per = math.ceil(n / cols)
    gap = min(110, (IH - 290 - 60) / max(1, per))
    top = 290 + max(0, ((IH - 290 - 40) - per * gap) / 2) + gap / 2 - 30
    for i, h in enumerate(heads):
        col, row = divmod(i, per)
        x = 130 + col * 740
        y = top + row * gap
        cc = [a, b, TEAL, SKY, LIME, ORANGE][i % 6]
        if row < per - 1 and i < n - 1:
            c.save(); c.set_dash((6, 8)); line(c, x, y + 32, x, y + gap - 32, mix(LINE, cc, 0.6), 3, 1); c.restore()
        circle(c, x, y, 30, fill=cc, alpha=0.16); circle(c, x, y, 30, stroke=cc, lw=3)
        text(c, str(i + 1), font(DISPLAY, 28, 'Bold'), x, y, color=cc)
        fh = font(SANS, 30, 'SemiBold')
        ls = wrap(h, fh, 600)
        for j, l in enumerate(ls[:2]):
            text(c, l, fh, x + 60, y + (j - (min(2, len(ls)) - 1) / 2) * 34, anchor='lm')
    save(s, path)
    return dict(src='map.webp', alt=f'Route map of the post with {n} chapters: ' + '; '.join(heads) + '.',
                caption='The route through this post. Every stop is a chapter you can jump to.')


def img_flow(d, tools, a, b, path):
    from video import ext_for
    s = surface(IW, IH); c = cairo.Context(s)
    c.set_source_surface(make_background(IW, IH, glow_pos=(0.5, 0.5), glow2=(0.1, 0.1), c1=a, c2=b), 0, 0); c.paint()
    text(c, 'HOW THE TOOLS FIT TOGETHER', font(SANS, 22, 'Bold'), IW / 2, 80, color=a, tracking=5)
    c.save(); rrect_path(c, 300, 170, 1000, 640, 34); c.set_dash((14, 10)); c.set_line_width(3); c.set_source_rgba(*rgbf(a, 0.7)); c.stroke(); c.restore()
    text(c, 'Inside your browser tab, on your device', font(SANS, 26, 'SemiBold'), IW / 2, 845, color=a)
    ext = ext_for(tools[0]['slug']) if tools else 'FILE'
    # input file
    rrect(c, 70, 360, 170, 220, 18, fill=SURF, stroke=mix(LINE, a, 0.6), lw=2)
    rrect(c, 90, 380, 90, 40, 10, fill=a, alpha=0.18)
    text(c, ext, font(MONO, 22, 'Bold'), 135, 400, color=a)
    for i in range(4):
        rrect(c, 90, 440 + i * 24, 130 - 30 * (i % 2), 9, 4, fill=LINE)
    text(c, 'Your file', font(SANS, 24, 'SemiBold'), 155, 620)
    line(c, 245, 470, 330, 470, a, 3)
    ts = tools[:5]
    n = max(1, len(ts))
    for i, t in enumerate(ts):
        col = CAT_COLORS.get(t['category'], a)
        y = 230 + i * (520 / n) + (520 / n - 90) / 2
        rrect(c, 360, y, 880, 90, 20, fill=SURF, stroke=mix(LINE, col, 0.5), lw=2)
        rrect(c, 380, y + 15, 60, 60, 14, fill=col, alpha=0.15)
        draw_sprite(c, icon_sprite(t['icon'] or 'File', 34, col), 410, y + 45)
        text(c, t['name'], font(SANS, 28, 'SemiBold'), 465, y + 32, anchor='lm')
        fd = font(SANS, 20, 'Regular')
        dl = wrap(t['desc'], fd, 740)
        text(c, dl[0] + (' ..' if len(dl) > 1 else ''), fd, 465, y + 64, color=MUTED, anchor='lm')
        line(c, 330, 470, 360, y + 45, mix(LINE, a, 0.5), 2, 0.8)
        line(c, 1240, y + 45, 1270, 470, mix(LINE, EMERALD, 0.5), 2, 0.8)
    line(c, 1270, 470, 1355, 470, EMERALD, 3)
    rrect(c, 1360, 360, 170, 220, 18, fill=SURF2, stroke=EMERALD, lw=3)
    line(c, 1410, 470, 1438, 498, EMERALD, 7); line(c, 1438, 498, 1488, 438, EMERALD, 7)
    text(c, 'Result', font(SANS, 24, 'SemiBold'), 1445, 620)
    # no upload badge
    rrect(c, 1290, 110, 260, 60, 30, fill=SURF2, stroke=ORANGE, lw=2)
    text(c, 'No upload step', font(SANS, 22, 'SemiBold'), 1420, 140, color=ORANGE)
    save(s, path)
    names = ', '.join(t['name'] for t in ts)
    return dict(src='flow.webp', alt=f'Diagram: your {ext} file goes through {names}, all inside the browser tab on your device, and comes out as the result. Nothing is uploaded.',
                caption='The tools from this post. Everything runs inside the tab, so the file never leaves your device.')


def make(slug):
    d = json.load(open(os.path.join(CACHE, 'text', slug + '.json')))
    reg = {t['slug']: t for t in load_registry()}
    tools = [reg[s] for s in d['tools'] if s in reg]
    a, b = colors(slug)
    out = os.path.join(PUB, slug); os.makedirs(out, exist_ok=True)
    imgs = [img_map(d, a, b, os.path.join(out, 'map.webp')), img_flow(d, tools, a, b, os.path.join(out, 'flow.webp'))]
    imgs[0]['after'] = 0; imgs[1]['after'] = 'end'
    vj = os.path.join(CACHE, 'video', slug, 'video.json')
    if os.path.exists(vj):
        st = [x for x in json.load(open(vj))['stills'] if x['key'] == 'section']
        pick = [st[1], st[-1]] if len(st) >= 3 else st[:2]
        for i, x in enumerate(pick):
            if not os.path.exists(x['file']):
                continue
            Image.open(x['file']).convert('RGB').resize((IW, IH), Image.LANCZOS).save(os.path.join(out, f'scene-{i + 1}.webp'), quality=78, method=6)
            kind = {'steps': 'Step by step diagram', 'terms': 'Key terms diagram', 'flow': 'Flow diagram', 'stack': 'Layer diagram'}.get(x['kind'], 'Diagram')
            imgs.append(dict(src=f'scene-{i + 1}.webp', alt=f'{kind} for the chapter "{x["h"]}". {x["sum"]}', caption=f'From the explainer film: {x["h"]}.', heading=x['id']))
    json.dump(imgs, open(os.path.join(CACHE, 'images', slug + '.json'), 'w'), indent=1)
    print(f'images {slug}: {len(imgs)}', flush=True)


if __name__ == '__main__':
    os.makedirs(os.path.join(CACHE, 'images'), exist_ok=True)
    for s in sys.argv[1:]:
        make(s)

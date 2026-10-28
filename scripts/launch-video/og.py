#!/usr/bin/env python3
"""Social card -> public/og.png (1200x630), gold-on-black brand palette."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'media-lib'))
from ofmedia import *  # noqa

W, H = 1200, 630
s = make_background(W, H, glow_pos=(0.26, 0.5), glow2=(0.92, 0.95), strength=1.25)
c = cairo.Context(s)
gl = GlowLayer(W, H, 3)
g = gl.begin(); gl.dirty = True
Particles(70, W, H, seed=3, speed=0).draw(c, 0.0, 0.6)
logo_mark(c, g, 300, 315, 300, 1.1)
gl.apply(c, radius=8, strength=1.0, passes=2)
text(c, 'OpenFile', font(DISPLAY, 112, 'Bold'), 510, 235, gradient=GOLD_GRAD, anchor='lm')
text(c, 'Free file tools that run in your browser.', font(SANS, 34, 'Medium'), 514, 320, color=TEXT, anchor='lm')
text(c, 'Your files never leave your device.', font(SANS, 30, 'Regular'), 514, 368, color=MUTED, anchor='lm')
x = 514
for lab, col in (('PDF', GOLD), ('Image', EMERALD), ('Video', CYAN), ('Audio', TEAL), ('Dev', SKY)):
    f = font(SANS, 22, 'SemiBold')
    tw = f.getlength(lab) + 36
    rrect(c, x, 430, tw, 44, 22, fill=col, stroke=col, lw=1.5, falpha=0.12, salpha=0.7)
    text(c, lab, f, x + tw / 2, 452)
    x += tw + 12
text(c, '100+ tools  ·  open source  ·  no sign-up', font(MONO, 20, 'Medium'), 514, 528, color=MUTED, anchor='lm')
s.write_to_png(os.path.join(REPO, 'public', 'og.png'))
print('wrote public/og.png')

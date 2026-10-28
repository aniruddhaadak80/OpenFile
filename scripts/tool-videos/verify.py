#!/usr/bin/env python3
"""Check public/media/tools: ffprobe specs, sizes, durations, palette (no purple/pink pixels) and a poster contact sheet."""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, '..', '..', 'public', 'media', 'tools')
idx = json.load(open(os.path.join(D, 'index.json')))
bad, total, sizes = [], 0, []
for slug, e in idx.items():
    p = os.path.join(D, slug + '.mp4')
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,channels',
                        '-show_entries', 'format=duration', '-of', 'json', p], capture_output=True, text=True)
    js = json.loads(r.stdout)
    v = next(s for s in js['streams'] if s['codec_name'] == 'h264')
    a = [s for s in js['streams'] if s['codec_name'] == 'aac']
    dur = float(js['format']['duration'])
    sz = os.path.getsize(p)
    sizes.append(sz)
    total += sz + os.path.getsize(os.path.join(D, slug + '.jpg'))
    problems = []
    if (v['width'], v['height'], v['pix_fmt'], v['r_frame_rate']) != (960, 540, 'yuv420p', '30/1'):
        problems.append('video spec')
    if not a:
        problems.append('no audio')
    if not (7.9 <= dur <= 12.1):
        problems.append(f'duration {dur:.2f}')
    if sz > 350 * 1024:
        problems.append(f'size {sz // 1024} KB')
    im = np.asarray(Image.open(os.path.join(D, slug + '.jpg')).convert('HSV'), np.float32)
    h, s_, val = im[..., 0] * 360 / 255, im[..., 1] / 255, im[..., 2] / 255
    purple = ((h > 255) & (h < 345) & (s_ > 0.35) & (val > 0.3)).mean()
    if purple > 0.002:
        problems.append(f'purple {purple:.3%}')
    if problems:
        bad.append((slug, problems))
print(f'{len(idx)} videos, total public/media/tools = {total / 1048576:.2f} MB, video size min/avg/max = '
      f'{min(sizes) // 1024}/{sum(sizes) // len(sizes) // 1024}/{max(sizes) // 1024} KB')
print('voices used:', len(set(e['voice'] for e in idx.values())), 'distinct')
print('problems:', bad or 'none')
if len(sys.argv) > 1:
    slugs = list(idx)
    cols = 8
    rows = (len(slugs) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 240, rows * 135))
    for i, s in enumerate(slugs):
        sheet.paste(Image.open(os.path.join(D, s + '.jpg')).resize((240, 135)), ((i % cols) * 240, (i // cols) * 135))
    sheet.save(sys.argv[1])

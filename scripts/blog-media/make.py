#!/usr/bin/env python3
"""
Blog media, one command: generates whatever is missing or out of date for every post in src/blog/meta.ts.

  python3 scripts/blog-media/make.py                 # everything that is missing or stale
  python3 scripts/blog-media/make.py --only slug     # one post
  python3 scripts/blog-media/make.py --manifest      # only rewrite src/blog/media/manifest.json
  bash    scripts/blog-media/upload.sh               # push new release assets (long videos, narration) to tag media-v1

Per post it makes:
  * cover loop      public/media/blog/<slug>/loop.mp4, loop.webm, cover.webp           (loop.py)
  * explainer film  release <slug>.mp4 + <slug>.webm, public .../captions.vtt, video-poster.webp   (video.py)
  * illustrations   public .../map.webp, flow.webp, scene-1.webp, scene-2.webp         (images.py)
  * narration       release <slug>-<voice>.mp3 + .opus, public .../read-<voice>.json word timings  (narrate.py)
  * manifest        src/blog/media/manifest.json, read by the blog UI
Staleness: a post is redone when the hash of its extracted text changes (stored in the manifest).
Python deps: see scripts/tool-videos/README.md (kokoro stack) plus piper-tts + onnx for narration.
In the Hark sandbox: PYTHONPATH=/workspace/work/video/pylib for loop/video/images and /workspace/work/video/piperlib for narrate.
"""
import argparse, hashlib, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(HERE, '.cache')
PUB = os.path.join(REPO, 'public', 'media', 'blog')
REL = os.path.join(CACHE, 'release')
MANIFEST = os.path.join(REPO, 'src', 'blog', 'media', 'manifest.json')
RELEASE_TAG = 'media-v1'
RELEASE_BASE = f'https://github.com/aniruddhaadak80/OpenFile/releases/download/{RELEASE_TAG}/'
PYLIB = os.environ.get('OF_PYLIB', '/workspace/work/video/pylib')
PIPERLIB = os.environ.get('OF_PIPERLIB', '/workspace/work/video/piperlib')
VOICES = os.environ.get('OF_VOICES', 'lessac,ryan')


def run(args, lib):
    env = dict(os.environ)
    env['PYTHONPATH'] = lib + (':' + env['PYTHONPATH'] if env.get('PYTHONPATH') else '')
    print('+', ' '.join(args[1:]), flush=True)
    subprocess.run(args, cwd=REPO, env=env, check=True)


def text_hash(slug):
    d = json.load(open(os.path.join(CACHE, 'text', slug + '.json')))
    return hashlib.sha1(json.dumps([d['title'], d['description'], d['tools'], d['cover'], d['blocks']]).encode()).hexdigest()[:12]


def exists(*p):
    return all(os.path.exists(x) for x in p)


def manifest(posts):
    old = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    out = {'release': RELEASE_BASE, 'posts': {}}
    for p in posts:
        slug = p['slug']
        pub = os.path.join(PUB, slug)
        m = {'hash': (old.get('posts', {}).get(slug) or {}).get('hash')}
        if exists(os.path.join(pub, 'loop.mp4'), os.path.join(pub, 'loop.webm')):
            m['loop'] = True
        vj = os.path.join(CACHE, 'video', slug, 'video.json')
        if exists(vj, os.path.join(pub, 'captions.vtt')):
            v = json.load(open(vj))
            m['video'] = {'dur': v['dur'], 'chapters': v['chapters'], 'mp4': v['mp4'], 'webm': v['webm']}
        elif (old.get('posts', {}).get(slug) or {}).get('video'):
            m['video'] = old['posts'][slug]['video']
        ij = os.path.join(CACHE, 'images', slug + '.json')
        if os.path.exists(ij):
            m['images'] = json.load(open(ij))
        elif (old.get('posts', {}).get(slug) or {}).get('images'):
            m['images'] = old['posts'][slug]['images']
        voices = []
        for vid in VOICES.split(','):
            tj = os.path.join(pub, f'read-{vid}.json')
            if os.path.exists(tj):
                t = json.load(open(tj))
                mp3 = os.path.join(REL, f'{slug}-{vid}.mp3')
                voices.append({'id': vid, 'label': t['label'], 'gender': t['gender'], 'accent': t['accent'], 'dur': t['dur'],
                               'words': sum(len(b[2]) for b in t['b']), 'mp3': os.path.getsize(mp3) if os.path.exists(mp3) else None})
        if voices:
            m['voices'] = voices
        out['posts'][slug] = m
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    json.dump(out, open(MANIFEST, 'w'), indent=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--manifest', action='store_true')
    ap.add_argument('--skip', default='', help='comma list of steps to skip: loop,video,images,narrate')
    ap.add_argument('--jobs', type=int, default=2)
    a = ap.parse_args()
    subprocess.run(['node', 'scripts/blog-media/extract.mjs'], cwd=REPO, check=True)
    posts = json.load(open(os.path.join(CACHE, 'posts.json')))
    if a.manifest:
        manifest(posts); return
    only = set(filter(None, a.only.split(',')))
    skip = set(filter(None, a.skip.split(',')))
    old = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {'posts': {}}
    todo = [p['slug'] for p in posts if not only or p['slug'] in only]
    stale = {s for s in todo if (old['posts'].get(s) or {}).get('hash') != text_hash(s)}
    py = sys.executable

    def need_loop(s):
        return s in stale or not exists(os.path.join(PUB, s, 'loop.mp4'), os.path.join(PUB, s, 'cover.webp'))

    def need_video(s):
        return s in stale or not exists(os.path.join(REL, s + '.mp4'), os.path.join(CACHE, 'video', s, 'video.json'), os.path.join(PUB, s, 'captions.vtt'))

    if 'loop' not in skip:
        ls = [s for s in todo if need_loop(s)]
        if ls:
            run([py, 'scripts/blog-media/loop.py', *ls], PYLIB)
    if 'video' not in skip:
        vs = [s for s in todo if need_video(s)]
        with ThreadPoolExecutor(a.jobs) as ex:
            list(ex.map(lambda s: run([py, 'scripts/blog-media/video.py', s], PYLIB), vs))
    if 'images' not in skip:
        ims = [s for s in todo if s in stale or not os.path.exists(os.path.join(CACHE, 'images', s + '.json'))
               or os.path.getmtime(os.path.join(CACHE, 'images', s + '.json')) < os.path.getmtime(os.path.join(CACHE, 'video', s, 'video.json'))]
        if ims:
            run([py, 'scripts/blog-media/images.py', *ims], PYLIB)
    if 'narrate' not in skip:
        run([py, 'scripts/blog-media/narrate.py', '--voices', VOICES] + (['--only', ','.join(todo)] if only else []), PIPERLIB)
    m = manifest(posts)
    for s in todo:
        m['posts'][s]['hash'] = text_hash(s)
    json.dump(m, open(MANIFEST, 'w'), indent=1)
    print(f'make: {len(todo)} posts checked, {len(stale)} were new or changed. Next: bash scripts/blog-media/push-release.sh', flush=True)


if __name__ == '__main__':
    main()

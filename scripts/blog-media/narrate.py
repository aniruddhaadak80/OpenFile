#!/usr/bin/env python3
"""
Read-aloud narration for blog posts: Piper neural TTS (MIT, runs locally) with real phoneme alignments,
turned into word timings that match the words the browser player wraps in the article.

Input : scripts/blog-media/.cache/text/<slug>.json   (from extract.mjs)
Output: public/media/blog/<slug>/read-<voice>.json     word timings  { v, voice, dur, hash, b: [[s, e, [[ws, we], ...]], ...] }
        scripts/blog-media/.cache/release/<slug>-<voice>.mp3 and .opus  (uploaded as GitHub Release assets)

Run:  python3 scripts/blog-media/narrate.py [--only slug1,slug2] [--voices lessac,ryan] [--force]
Needs: piper-tts (+ onnx for alignments), soundfile, numpy. In the Hark sandbox: PYTHONPATH=/workspace/work/video/piperlib
Voice models (*.onnx + *.onnx.json) are read from $OF_PIPER_DIR (default /workspace/work/video/piper) and downloaded if missing.
"""
import argparse, hashlib, json, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
CACHE = os.path.join(HERE, '.cache')
PIPER_DIR = os.environ.get('OF_PIPER_DIR', '/workspace/work/video/piper')
PUB = os.path.join(REPO, 'public', 'media', 'blog')
REL = os.path.join(CACHE, 'release')

# id -> (model file, label, gender, accent)
VOICES = {
    'lessac': ('en_US-lessac-medium', 'Lessac', 'female', 'US English'),
    'ryan': ('en_US-ryan-medium', 'Ryan', 'male', 'US English'),
    'alan': ('en_GB-alan-medium', 'Alan', 'male', 'UK English'),
    'amy': ('en_US-amy-medium', 'Amy', 'female', 'US English'),
}
HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/'

# light pronunciation fixes, applied per word so word counts stay aligned
PRON = [
    (r'^JSON', 'Jason'), (r'^YAML', 'yammel'), (r'^SQLite', 'sequel light'), (r'^cURL', 'curl'), (r'^HEIC', 'heek'), (r'^HEIF', 'heef'),
    (r'^AVIF', 'ay vif'), (r'^WebP', 'web P'), (r'^WEBP', 'web P'), (r'^WebM', 'web M'), (r'^EPUB', 'E pub'), (r'^GIFs', 'gifs'), (r'^GIF', 'gif'),
    (r'^JPEG', 'jay peg'), (r'^JPG', 'jay peg'), (r'^WASM', 'wasm'), (r'^WebGPU', 'web G P U'), (r'^WebAssembly', 'web assembly'),
    (r'^DICOM', 'dye com'), (r'^MIDI', 'middy'), (r'^DXF', 'D X F'), (r'^DWG', 'D W G'), (r'^OCR', 'O C R'), (r'^PDFs', 'P D Fs'),
    (r'^e\.g\.', 'for example'), (r'^i\.e\.', 'that is'), (r'^vs\.?$', 'versus'), (r'^&$', 'and'), (r'^/$', 'or'),
    (r'^->$', 'to'), (r'^→$', 'to'), (r'^×$', 'times'),
]


def say_word(w):
    core = w
    for a, b in PRON:
        core = re.sub(a, b, core)
    core = core.replace('/', ' or ') if re.fullmatch(r'[A-Za-z]+/[A-Za-z]+', w) else core
    core = re.sub(r'(\d+)\s*KB\b', r'\1 kilobytes', core)
    core = re.sub(r'(\d+)\s*MB\b', r'\1 megabytes', core)
    core = re.sub(r'(\d+)\s*GB\b', r'\1 gigabytes', core)
    return core


def ensure_model(name):
    p = os.path.join(PIPER_DIR, name + '.onnx')
    if not os.path.exists(p):
        os.makedirs(PIPER_DIR, exist_ok=True)
        lang, rest = name.split('-', 1)
        spk, q = rest.rsplit('-', 1)
        url = f'{HF}{lang.split("_")[0]}/{lang}/{spk}/{q}/{name}.onnx'
        for ext in ('', '.json'):
            subprocess.run(['curl', '-sSL', '-o', p + ext, url + ext], check=True)
    return p


def phone_words(alignments):
    """Split one chunk's phoneme alignments into word spans [(start_sample, end_sample), ...] relative to the chunk."""
    spans, pos, cur = [], 0, None
    for al in alignments:
        n = int(al.num_samples)
        ph = al.phoneme
        if ph == ' ' or ph in '^$':
            if cur is not None:
                spans.append(cur); cur = None
        elif ph in ',.;:?!—…"()':
            pass  # punctuation pause belongs to no word
        else:
            if cur is None:
                cur = [pos, pos + n]
            else:
                cur[1] = pos + n
        pos += n
    if cur is not None:
        spans.append(cur)
    return spans


def synth_block(voice, text, cfg, pcache):
    """-> (audio float32, [(ws, we) per source word] in seconds relative to block start)"""
    from piper import SynthesisConfig  # noqa
    words = text.split(' ')
    spoken = [say_word(w) for w in words]
    # how many phoneme words espeak makes for each source word
    ks = []
    for s in spoken:
        if s not in pcache:
            ph = voice.phonemize(s)
            flat = ''.join(''.join(x) for x in ph)
            pcache[s] = max(1, len([t for t in flat.split(' ') if re.search(r'\w', t)]))
        ks.append(pcache[s])
    audio, spans, off = [], [], 0
    sr = voice.config.sample_rate
    pause = np.zeros(int(sr * 0.22), np.float32)
    for ci, ch in enumerate(voice.synthesize(' '.join(spoken), syn_config=cfg, include_alignments=True)):
        a = ch.audio_float_array.astype(np.float32)
        if ch.phoneme_alignments:
            for s0, s1 in phone_words(ch.phoneme_alignments):
                spans.append((off + s0, off + s1))
        audio.append(a); off += len(a)
        audio.append(pause); off += len(pause)
    audio = np.concatenate(audio) if audio else np.zeros(1, np.float32)
    # map phoneme words back to source words
    K = sum(ks)
    N = len(spans)
    out = []
    if N == 0:
        dur = len(audio)
        tot = sum(len(w) + 1 for w in words)
        c = 0
        for w in words:
            out.append((c / tot * dur / sr, (c + len(w)) / tot * dur / sr)); c += len(w) + 1
        return audio, out
    cum = 0
    for k in ks:
        a0 = int(round(cum * N / K)); cum += k
        a1 = max(a0 + 1, int(round(cum * N / K)))
        a0 = min(a0, N - 1); a1 = min(a1, N)
        out.append((spans[a0][0] / sr, spans[a1 - 1][1] / sr))
    return audio, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--voices', default='lessac,ryan')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    from piper import PiperVoice, SynthesisConfig
    import soundfile as sf
    os.makedirs(REL, exist_ok=True)
    posts = json.load(open(os.path.join(CACHE, 'posts.json')))
    only = set(filter(None, args.only.split(',')))
    for vid in args.voices.split(','):
        model, label, gender, accent = VOICES[vid]
        voice = None
        pcache = {}
        for p in posts:
            slug = p['slug']
            if only and slug not in only:
                continue
            d = json.load(open(os.path.join(CACHE, 'text', slug + '.json')))
            blocks = [{'tag': 'h1', 'text': d['title']}] + d['blocks']
            h = hashlib.sha1((vid + '\n' + '\n'.join(b['text'] for b in blocks)).encode()).hexdigest()[:12]
            outj = os.path.join(PUB, slug, f'read-{vid}.json')
            mp3 = os.path.join(REL, f'{slug}-{vid}.mp3')
            if not args.force and os.path.exists(outj) and os.path.exists(mp3) and json.load(open(outj)).get('hash') == h:
                continue
            if voice is None:
                voice = PiperVoice.load(ensure_model(model), include_alignments=True)
                sr = voice.config.sample_rate
            cfg = SynthesisConfig(length_scale=1.0, noise_scale=0.6, noise_w_scale=0.7)
            parts, B, t = [], [], 0.0
            lead = np.zeros(int(sr * 0.3), np.float32); parts.append(lead); t += len(lead) / sr
            for b in blocks:
                gap_before = 0.35 if b['tag'] in ('h2', 'h3') else 0.0
                if gap_before:
                    z = np.zeros(int(sr * gap_before), np.float32); parts.append(z); t += gap_before
                a, ws = synth_block(voice, b['text'], cfg, pcache)
                B.append([round(t, 2), round(t + len(a) / sr, 2), [[round(t + x, 2), round(t + y, 2)] for x, y in ws]])
                parts.append(a); t += len(a) / sr
                gap = {'h1': 0.7, 'h2': 0.45, 'h3': 0.4}.get(b['tag'], 0.3)
                z = np.zeros(int(sr * gap), np.float32); parts.append(z); t += gap
            audio = np.concatenate(parts)
            audio = audio / (np.abs(audio).max() + 1e-9) * 0.89
            wav = os.path.join(CACHE, f'{slug}-{vid}.wav')
            sf.write(wav, audio, sr, subtype='PCM_16')
            title = d['title'].replace('"', '')
            meta = ['-metadata', f'title={title}', '-metadata', 'artist=Aniruddha Adak', '-metadata', 'album=OpenFile blog', '-metadata', f'comment=Read by {label} (Piper neural voice)']
            af = 'loudnorm=I=-17:TP=-1.5:LRA=11,aresample=24000'
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-af', af, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', *meta, mp3], check=True)
            subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', wav, '-af', af, '-ac', '1', '-c:a', 'libopus', '-b:a', '24k', '-application', 'voip', *meta, mp3[:-4] + '.opus'], check=True)
            os.remove(wav)
            os.makedirs(os.path.join(PUB, slug), exist_ok=True)
            json.dump({'v': 1, 'voice': vid, 'label': label, 'gender': gender, 'accent': accent, 'dur': round(t, 2), 'hash': h, 'b': B},
                      open(outj, 'w'), separators=(',', ':'))
            print(f'narrate {vid} {slug}: {t:.0f}s, {sum(len(x[2]) for x in B)} words', flush=True)


if __name__ == '__main__':
    main()

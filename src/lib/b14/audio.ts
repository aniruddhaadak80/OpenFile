/* Audio maths for the round 14 audio tools: tone synthesis, pitch detection, tempo detection and EBU R128 loudness.
 * Pure TypeScript (Float32Array in, numbers out), unit tested in Node. */

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle'
export type Noise = 'white' | 'pink' | 'brown'

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Frequency to nearest note with cents offset. a4 is the reference pitch (440 by default). */
export function noteOf(freq: number, a4 = 440) {
  const n = 12 * Math.log2(freq / a4) + 69
  const midi = Math.round(n)
  const cents = Math.round((n - midi) * 100)
  return { midi, name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1, cents, target: a4 * Math.pow(2, (midi - 69) / 12) }
}
export const freqOfMidi = (midi: number, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12)

/** YIN pitch detector. Returns Hz or 0 when there is no clear pitch. */
export function detectPitch(buf: Float32Array, sampleRate: number, opts: { minHz?: number; maxHz?: number; threshold?: number } = {}): { freq: number; clarity: number } {
  const minHz = opts.minHz ?? 40, maxHz = opts.maxHz ?? 2000, thr = opts.threshold ?? 0.12
  let rms = 0; for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / buf.length)
  if (rms < 0.008) return { freq: 0, clarity: 0 }
  const maxTau = Math.min(Math.floor(sampleRate / minHz), Math.floor(buf.length / 2))
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz))
  const W = buf.length - maxTau
  const d = new Float32Array(maxTau + 1)
  for (let tau = 1; tau <= maxTau; tau++) { let s = 0; for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x } d[tau] = s }
  const cmnd = new Float32Array(maxTau + 1); cmnd[0] = 1
  let run = 0
  for (let tau = 1; tau <= maxTau; tau++) { run += d[tau]; cmnd[tau] = run ? (d[tau] * tau) / run : 1 }
  let tau = -1
  for (let t = minTau; t <= maxTau; t++) { if (cmnd[t] < thr) { while (t + 1 <= maxTau && cmnd[t + 1] < cmnd[t]) t++; tau = t; break } }
  if (tau < 0) { let best = minTau; for (let t = minTau; t <= maxTau; t++) if (cmnd[t] < cmnd[best]) best = t; if (cmnd[best] > 0.35) return { freq: 0, clarity: 0 }; tau = best }
  // parabolic interpolation
  const a = cmnd[tau - 1] ?? cmnd[tau], b = cmnd[tau], c = cmnd[tau + 1] ?? cmnd[tau]
  const denom = a + c - 2 * b
  const shift = denom ? (a - c) / (2 * denom) : 0
  return { freq: sampleRate / (tau + shift), clarity: Math.max(0, 1 - b) }
}

/** Instrument presets: open strings as MIDI numbers. */
export const TUNINGS: Record<string, { label: string; notes: number[] }> = {
  chromatic: { label: 'Chromatic (any note)', notes: [] },
  guitar: { label: 'Guitar (E A D G B E)', notes: [40, 45, 50, 55, 59, 64] },
  dropd: { label: 'Guitar drop D (D A D G B E)', notes: [38, 45, 50, 55, 59, 64] },
  bass: { label: 'Bass (E A D G)', notes: [28, 33, 38, 43] },
  ukulele: { label: 'Ukulele (G C E A)', notes: [67, 60, 64, 69] },
  violin: { label: 'Violin (G D A E)', notes: [55, 62, 69, 76] },
  viola: { label: 'Viola (C G D A)', notes: [48, 55, 62, 69] },
  cello: { label: 'Cello (C G D A)', notes: [36, 43, 50, 57] },
  mandolin: { label: 'Mandolin (G D A E)', notes: [55, 62, 69, 76] },
  banjo: { label: 'Banjo (G D G B D)', notes: [67, 50, 55, 59, 62] },
}
export const midiName = (m: number) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
/** Closest string of a tuning to a frequency, with cents off. */
export function closestString(freq: number, notes: number[], a4 = 440) {
  let best = notes[0], bc = Infinity
  for (const n of notes) { const c = 1200 * Math.log2(freq / freqOfMidi(n, a4)); if (Math.abs(c) < Math.abs(bc)) { bc = c; best = n } }
  return { midi: best, cents: Math.round(bc) }
}

/* ---------------- synthesis ---------------- */
export function osc(wave: Wave, phase: number) {
  const p = phase - Math.floor(phase)
  switch (wave) {
    case 'sine': return Math.sin(2 * Math.PI * p)
    case 'square': return p < 0.5 ? 1 : -1
    case 'sawtooth': return 2 * p - 1
    case 'triangle': return 1 - 4 * Math.abs(p - 0.5)
  }
}

export interface ToneSpec {
  kind: 'tone' | 'sweep' | 'noise' | 'binaural' | 'dtmf'
  wave: Wave; freq: number; freq2: number; seconds: number; volume: number; sampleRate: number
  noise?: Noise; sweepLog?: boolean; beat?: number; digits?: string; fade?: number
}

const DTMF: Record<string, [number, number]> = { '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], 'A': [697, 1633], '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], 'B': [770, 1633], '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], 'C': [852, 1633], '*': [941, 1209], '0': [941, 1336], '#': [941, 1477], 'D': [941, 1633] }

/** Render a test signal into stereo channels. */
export function synth(s: ToneSpec, seed = 1): [Float32Array, Float32Array] {
  const sr = s.sampleRate
  const digits = (s.digits ?? '').toUpperCase().replace(/[^0-9A-D*#]/g, '')
  const dur = s.kind === 'dtmf' ? Math.max(0.1, digits.length * 0.2) : s.seconds
  const n = Math.max(1, Math.round(dur * sr))
  const L = new Float32Array(n), R = new Float32Array(n)
  let rnd = seed >>> 0 || 1
  const rand = () => { rnd ^= rnd << 13; rnd ^= rnd >>> 17; rnd ^= rnd << 5; return ((rnd >>> 0) / 4294967296) * 2 - 1 }
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0
  let ph = 0, ph2 = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let l = 0, r = 0
    if (s.kind === 'tone') { ph += s.freq / sr; l = r = osc(s.wave, ph) }
    else if (s.kind === 'sweep') {
      const k = t / dur
      const f = s.sweepLog ? s.freq * Math.pow(s.freq2 / s.freq, k) : s.freq + (s.freq2 - s.freq) * k
      ph += f / sr; l = r = osc(s.wave, ph)
    } else if (s.kind === 'binaural') { ph += s.freq / sr; ph2 += (s.freq + (s.beat ?? 10)) / sr; l = Math.sin(2 * Math.PI * ph); r = Math.sin(2 * Math.PI * ph2) }
    else if (s.kind === 'dtmf') {
      const idx = Math.floor(t / 0.2), within = t - idx * 0.2
      const pair = DTMF[digits[idx]]
      if (pair && within < 0.15) l = r = 0.5 * (Math.sin(2 * Math.PI * pair[0] * t) + Math.sin(2 * Math.PI * pair[1] * t))
    } else {
      const w = rand()
      if (s.noise === 'white') l = w * 0.5
      else if (s.noise === 'pink') { // Paul Kellet's filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898
        l = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926
      } else { brown = (brown + 0.02 * w) / 1.02; l = brown * 3.5 }
      r = l
    }
    L[i] = l; R[i] = r
  }
  // fade in and out to avoid clicks, then volume
  const f = Math.min(n / 2, Math.round((s.fade ?? 0.01) * sr))
  for (let i = 0; i < n; i++) { const g = s.volume * Math.min(1, i / Math.max(1, f), (n - 1 - i) / Math.max(1, f)); L[i] *= g; R[i] *= g }
  return [L, R]
}

/** 16-bit PCM WAV. */
export function wav16(chans: Float32Array[], sampleRate: number): Uint8Array {
  const n = chans[0].length, ch = chans.length
  const buf = new ArrayBuffer(44 + n * ch * 2), v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true)
  let o = 44
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2 }
  return new Uint8Array(buf)
}

/** Metronome click track: accent on beat 1, optional subdivisions. */
export function clickTrack(bpm: number, beatsPerBar: number, bars: number, sampleRate: number, sub = 1, accents?: boolean[]): Float32Array {
  const spb = 60 / bpm
  const total = Math.round(bars * beatsPerBar * spb * sampleRate)
  const out = new Float32Array(total)
  const click = (at: number, freq: number, amp: number) => {
    const len = Math.round(0.03 * sampleRate)
    for (let i = 0; i < len && at + i < total; i++) out[at + i] += amp * Math.sin(2 * Math.PI * freq * (i / sampleRate)) * Math.exp(-i / (0.006 * sampleRate))
  }
  for (let b = 0; b < bars * beatsPerBar; b++) {
    const beat = b % beatsPerBar
    const acc = accents ? accents[beat] : beat === 0
    for (let s = 0; s < sub; s++) {
      const at = Math.round((b + s / sub) * spb * sampleRate)
      if (s === 0) click(at, acc ? 1600 : 1000, acc ? 0.9 : 0.6)
      else click(at, 800, 0.35)
    }
  }
  return out
}

/** Average BPM from tap times (ms). Uses the last few taps. */
export function tapBpm(taps: number[]): number {
  if (taps.length < 2) return 0
  const t = taps.slice(-8)
  const iv: number[] = []
  for (let i = 1; i < t.length; i++) iv.push(t[i] - t[i - 1])
  const avg = iv.reduce((a, b) => a + b, 0) / iv.length
  return avg > 0 ? 60000 / avg : 0
}

/* ---------------- tempo ---------------- */
/** Onset strength envelope (spectral flux of a coarse energy band split) at hop resolution. */
export function onsetEnvelope(x: Float32Array, sampleRate: number, hop = 512): { env: Float32Array; rate: number } {
  const frames = Math.floor((x.length - 1024) / hop)
  if (frames < 8) return { env: new Float32Array(0), rate: sampleRate / hop }
  const env = new Float32Array(frames)
  // three bands via simple one pole filters: low, mid, high energy per frame
  let lp = 0, lp2 = 0
  const aL = Math.exp(-2 * Math.PI * 200 / sampleRate), aM = Math.exp(-2 * Math.PI * 2000 / sampleRate)
  const bands = [new Float32Array(frames), new Float32Array(frames), new Float32Array(frames)]
  let f = 0, acc = [0, 0, 0], cnt = 0
  for (let i = 0; i < frames * hop; i++) {
    const s = x[i]
    lp = aL * lp + (1 - aL) * s
    lp2 = aM * lp2 + (1 - aM) * s
    const lo = lp, mid = lp2 - lp, hi = s - lp2
    acc[0] += lo * lo; acc[1] += mid * mid; acc[2] += hi * hi; cnt++
    if (cnt === hop) { for (let k = 0; k < 3; k++) { bands[k][f] = Math.log1p(1000 * acc[k] / hop); acc[k] = 0 } cnt = 0; f++ }
  }
  for (let i = 1; i < frames; i++) { let s = 0; for (let k = 0; k < 3; k++) { const d = bands[k][i] - bands[k][i - 1]; if (d > 0) s += d } env[i] = s }
  // remove local mean
  const w = 16, out = new Float32Array(frames)
  for (let i = 0; i < frames; i++) { let m = 0, c = 0; for (let j = Math.max(0, i - w); j < Math.min(frames, i + w); j++) { m += env[j]; c++ } out[i] = Math.max(0, env[i] - m / c) }
  return { env: out, rate: sampleRate / hop }
}

/** Tempo from an onset envelope by autocorrelation with a preference around 120 BPM. Returns top candidates. */
export function tempoFromEnvelope(env: Float32Array, rate: number, minBpm = 60, maxBpm = 200): { bpm: number; confidence: number; candidates: { bpm: number; score: number }[] } {
  if (env.length < 16) return { bpm: 0, confidence: 0, candidates: [] }
  const minLag = Math.floor((60 / maxBpm) * rate), maxLag = Math.ceil((60 / minBpm) * rate)
  const ac = new Float32Array(maxLag + 2)
  for (let lag = minLag; lag <= maxLag + 1; lag++) { let s = 0; for (let i = 0; i + lag < env.length; i++) s += env[i] * env[i + lag]; ac[lag] = s / (env.length - lag) }
  const scores: { lag: number; score: number }[] = []
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      // add harmonics so the true beat beats its double and half
      const h = ac[lag] + 0.5 * (ac[Math.round(lag * 2)] ?? 0) + 0.25 * (ac[Math.round(lag / 2)] ?? 0)
      const bpm = (60 * rate) / lag
      const pref = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2))
      scores.push({ lag, score: h * pref })
    }
  }
  scores.sort((a, b) => b.score - a.score)
  if (!scores.length) return { bpm: 0, confidence: 0, candidates: [] }
  const refine = (lag: number) => { const a = ac[lag - 1], b = ac[lag], c = ac[lag + 1]; const d = a + c - 2 * b; return lag + (d ? (a - c) / (2 * d) : 0) }
  const cand = scores.slice(0, 4).map((s) => ({ bpm: Math.round(((60 * rate) / refine(s.lag)) * 10) / 10, score: s.score }))
  const total = scores.reduce((a, b) => a + b.score, 0)
  return { bpm: cand[0].bpm, confidence: Math.min(1, scores[0].score / Math.max(1e-9, total) * 3), candidates: cand }
}

export function detectBpm(x: Float32Array, sampleRate: number, minBpm = 60, maxBpm = 200) {
  const { env, rate } = onsetEnvelope(x, sampleRate)
  return tempoFromEnvelope(env, rate, minBpm, maxBpm)
}

/** Simple key estimate from a chromagram (Krumhansl profiles). */
export function estimateKey(x: Float32Array, sampleRate: number): { key: string; score: number } {
  const chroma = new Float64Array(12)
  const N = 4096, hop = 8192
  const maxFrames = 200
  const frames = Math.min(maxFrames, Math.floor((x.length - N) / hop))
  if (frames < 1) return { key: '', score: 0 }
  // Goertzel per semitone in 3 octaves (C3..B5)
  const freqs: { f: number; pc: number }[] = []
  for (let m = 48; m < 84; m++) freqs.push({ f: freqOfMidi(m), pc: m % 12 })
  const step = Math.max(1, Math.floor((x.length - N) / hop / frames))
  for (let fr = 0; fr < frames; fr++) {
    const off = fr * hop * step
    if (off + N > x.length) break
    for (const { f, pc } of freqs) {
      const k = (2 * Math.PI * f) / sampleRate, c = 2 * Math.cos(k)
      let s1 = 0, s2 = 0
      for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)); const s0 = x[off + i] * w + c * s1 - s2; s2 = s1; s1 = s0 }
      chroma[pc] += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))
    }
  }
  const major = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
  const minor = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
  const corr = (a: number[], b: number[]) => { const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 } return n / Math.sqrt(da * db || 1) }
  const ch = Array.from(chroma)
  let best = { key: '', score: -2 }
  for (let r = 0; r < 12; r++) {
    const rot = ch.slice(r).concat(ch.slice(0, r))
    const a = corr(rot, major), b = corr(rot, minor)
    if (a > best.score) best = { key: `${NOTE_NAMES[r]} major`, score: a }
    if (b > best.score) best = { key: `${NOTE_NAMES[r]} minor`, score: b }
  }
  return best
}

/* ---------------- loudness (ITU-R BS.1770-4 / EBU R128) ---------------- */
interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }
/** K-weighting coefficients for any sample rate (pre filter shelf + RLB high pass). */
export function kWeighting(fs: number): [Biquad, Biquad] {
  // stage 1: high shelf
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196
  let K = Math.tan((Math.PI * f0) / fs)
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416)
  let a0 = 1 + K / Q + K * K
  const s1: Biquad = { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 }
  // stage 2: high pass
  f0 = 38.13547087602444; Q = 0.5003270373238773
  K = Math.tan((Math.PI * f0) / fs)
  a0 = 1 + K / Q + K * K
  const s2: Biquad = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 }
  return [s1, s2]
}
function filt(x: Float32Array, q: Biquad): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) { const v = q.b0 * x[i] + q.b1 * x1 + q.b2 * x2 - q.a1 * y1 - q.a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v }
  return y
}

export interface Loudness { integrated: number; range: number; shortMax: number; momentaryMax: number; samplePeak: number; truePeak: number; short: number[]; rms: number }

/** Integrated loudness (LUFS), loudness range (LU), max short-term and momentary, sample and true peak (dBTP, 4x oversampling). */
export function measureLoudness(chans: Float32Array[], fs: number, onProgress?: (p: number) => void): Loudness {
  const [k1, k2] = kWeighting(fs)
  const weights = chans.map((_, i) => (chans.length >= 5 && (i === 3 || i === 4) ? 1.41 : 1)) // surround channels get +1.5 dB
  const kw = chans.map((c) => filt(filt(c, k1), k2))
  onProgress?.(0.3)
  const blockPower = (start: number, len: number) => { let sum = 0; for (let c = 0; c < kw.length; c++) { let s = 0; const d = kw[c]; const end = Math.min(d.length, start + len); for (let i = start; i < end; i++) s += d[i] * d[i]; sum += weights[c] * (s / len) } return sum }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p)
  // momentary 400 ms blocks, 75% overlap
  const mLen = Math.round(0.4 * fs), mHop = Math.round(0.1 * fs)
  const blocks: number[] = []
  for (let s = 0; s + mLen <= kw[0].length; s += mHop) blocks.push(blockPower(s, mLen))
  onProgress?.(0.6)
  const abs = blocks.filter((p) => lufs(p) > -70)
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  let integrated = -Infinity
  if (abs.length) { const rel = lufs(mean(abs)) - 10; const g = abs.filter((p) => lufs(p) > rel); integrated = g.length ? lufs(mean(g)) : -Infinity }
  // short term 3 s, 1 s hop (for display and LRA)
  const sLen = Math.round(3 * fs), sHop = Math.round(1 * fs)
  const short: number[] = []
  for (let s = 0; s + sLen <= kw[0].length; s += sHop) short.push(lufs(blockPower(s, sLen)))
  if (!short.length && kw[0].length) short.push(lufs(blockPower(0, kw[0].length)))
  // LRA: short term blocks, absolute -70, relative -20, 10th to 95th percentile
  const sa = short.filter((v) => v > -70)
  let range = 0
  if (sa.length > 1) {
    const relS = 10 * Math.log10(mean(sa.map((v) => Math.pow(10, (v + 0.691) / 10)))) - 0.691 - 20
    const g = sa.filter((v) => v > relS).sort((a, b) => a - b)
    if (g.length > 1) { const q = (p: number) => g[Math.min(g.length - 1, Math.max(0, Math.round(p * (g.length - 1))))]; range = q(0.95) - q(0.1) }
  }
  onProgress?.(0.75)
  let sp = 0, sq = 0, n = 0
  for (const c of chans) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > sp) sp = v; sq += c[i] * c[i]; n++ }
  const tp = truePeak(chans)
  onProgress?.(1)
  return { integrated, range, shortMax: short.length ? Math.max(...short) : -Infinity, momentaryMax: blocks.length ? lufs(Math.max(...blocks)) : -Infinity, samplePeak: 20 * Math.log10(sp || 1e-12), truePeak: 20 * Math.log10(Math.max(sp, tp) || 1e-12), short, rms: 20 * Math.log10(Math.sqrt(sq / Math.max(1, n)) || 1e-12) }
}

/** 4x oversampled peak with a short windowed sinc interpolator (close to the BS.1770 true peak). */
export function truePeak(chans: Float32Array[]): number {
  const taps = 12
  const phases = [0.25, 0.5, 0.75].map((f) => { const k: number[] = []; for (let j = -taps + 1; j <= taps; j++) { const x = j - f; const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / taps); k.push(sinc * w) } return k })
  let peak = 0
  for (const c of chans) {
    for (let i = taps; i < c.length - taps; i++) {
      // only refine around loud samples to keep it fast
      if (Math.abs(c[i]) < peak * 0.85 && Math.abs(c[i + 1]) < peak * 0.85) continue
      for (const k of phases) { let s = 0; for (let j = 0; j < k.length; j++) s += k[j] * c[i + j - taps + 1]; const v = Math.abs(s); if (v > peak) peak = v }
      const v = Math.abs(c[i]); if (v > peak) peak = v
    }
  }
  return peak
}

export const PLATFORMS: { name: string; lufs: number; tp: number }[] = [
  { name: 'Spotify', lufs: -14, tp: -1 }, { name: 'YouTube', lufs: -14, tp: -1 }, { name: 'Apple Music', lufs: -16, tp: -1 }, { name: 'Amazon Music', lufs: -14, tp: -2 },
  { name: 'Tidal', lufs: -14, tp: -1 }, { name: 'Deezer', lufs: -15, tp: -1 }, { name: 'SoundCloud', lufs: -14, tp: -1 }, { name: 'Podcasts (Apple)', lufs: -16, tp: -1 }, { name: 'Broadcast EBU R128', lufs: -23, tp: -1 },
]

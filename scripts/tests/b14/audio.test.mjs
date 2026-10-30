import assert from 'node:assert/strict'
import * as A from '../../../src/lib/b14/audio.ts'

// pitch
const sr = 44100
const sine = (f, n = 4096, a = 0.5) => Float32Array.from({ length: n }, (_, i) => a * Math.sin(2 * Math.PI * f * i / sr))
for (const f of [82.41, 110, 440, 659.25]) { const r = A.detectPitch(sine(f), sr); assert.ok(Math.abs(r.freq - f) / f < 0.005, `${f} -> ${r.freq}`) }
assert.equal(A.detectPitch(new Float32Array(4096), sr).freq, 0)
const n = A.noteOf(440); assert.equal(n.name, 'A'); assert.equal(n.octave, 4); assert.equal(n.cents, 0)
assert.equal(A.noteOf(261.63).name, 'C')
assert.equal(A.closestString(83, A.TUNINGS.guitar.notes).midi, 40)

// loudness: 1 kHz sine at -20 dBFS peak (mono) is about -23 LUFS
const tone = Float32Array.from({ length: sr * 5 }, (_, i) => 0.1 * Math.sin(2 * Math.PI * 1000 * i / sr))
const L = A.measureLoudness([tone], sr)
assert.ok(Math.abs(L.integrated - -23) < 0.2, String(L.integrated))
assert.ok(Math.abs(L.samplePeak - -20) < 0.05)
assert.ok(L.truePeak >= L.samplePeak - 0.01)
assert.ok(L.range < 0.5)

// tempo: clicks at 128 BPM
const dur = 20, click = new Float32Array(sr * dur)
for (let b = 0; b * 60 / 128 < dur; b++) { const at = Math.round(b * 60 / 128 * sr); for (let i = 0; i < 800 && at + i < click.length; i++) click[at + i] = Math.sin(i * 0.3) * Math.exp(-i / 150) }
const t = A.detectBpm(click, sr)
assert.ok(Math.abs(t.bpm - 128) < 1.5, JSON.stringify(t))
assert.ok(Math.abs(A.tapBpm([0, 500, 1000, 1500]) - 120) < 0.01)

// synth and wav
const [l] = A.synth({ kind: 'tone', wave: 'sine', freq: 440, freq2: 0, seconds: 1, volume: 0.5, sampleRate: 8000 })
assert.equal(l.length, 8000)
const w = A.wav16([l], 8000); assert.equal(w.length, 44 + 16000); assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF')
const d = A.synth({ kind: 'dtmf', wave: 'sine', freq: 0, freq2: 0, seconds: 0, volume: 1, sampleRate: 8000, digits: '12#' }); assert.equal(d[0].length, Math.round(0.6 * 8000))
const ct = A.clickTrack(120, 4, 2, 8000); assert.equal(ct.length, 8 * 0.5 * 8000)
console.log('b14 audio ok')

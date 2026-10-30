/* Progress for jobs that run ffmpeg several times in a row (chunked reverse). */

/** One progress bar for every part of a chunked job.
 *  ffmpeg's own time readings are not usable inside a reverse part: the reverse filter holds every frame until the
 *  part ends, and the browser reports the part as nearly done right when it starts. So after the first part the bar
 *  moves by elapsed time against the speed measured on the parts already done (never past 95% of a part), and it
 *  never moves backwards. Steps marked `byTime: false` (the join) follow ffmpeg's readings, held under 90% until done. */
export function progressMeter(all: number, set: (p: number) => void, now = () => Date.now()) {
  let done = 0, shown = 0, rate = 0
  let cur: { w: number; t0: number; byTime: boolean } | null = null
  const push = (abs: number) => { const v = Math.min(0.995, abs / all); if (v > shown) { shown = v; set(v) } }
  return {
    start(w: number, byTime = true) { cur = { w, t0: now(), byTime } },
    report(p: number) {
      if (!cur || (cur.byTime && rate)) return
      push(done + Math.min(0.9, Math.max(0, Math.min(1, p))) * cur.w)
    },
    tick() {
      if (!cur || !cur.byTime || !rate) return
      push(done + Math.min(0.95, (now() - cur.t0) / 1000 / (rate * cur.w)) * cur.w)
    },
    end() {
      if (!cur) return
      if (cur.byTime && cur.w > 0) { const r = (now() - cur.t0) / 1000 / cur.w; rate = rate ? rate * 0.6 + r * 0.4 : r }
      done += cur.w; cur = null; push(done)
    },
    get shown() { return shown },
  }
}

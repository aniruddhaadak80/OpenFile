/* Time zone helpers on top of Intl (pure). */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000)
}

/** Wall-clock time in a zone → real instant. */
export function zonedToDate(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  let off = tzOffsetMinutes(tz, new Date(guess))
  let t = guess - off * 60000
  const off2 = tzOffsetMinutes(tz, new Date(t))
  if (off2 !== off) t = guess - off2 * 60000
  return new Date(t)
}

export function fmtOffset(min: number) { const s = min < 0 ? '-' : '+'; const a = Math.abs(min); return `UTC${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}` }

export function wallParts(tz: string, at: Date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]))
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: p.weekday }
}

export function allZones(): string[] {
  try { return (Intl as any).supportedValuesOf('timeZone') as string[] } catch { return ['UTC', 'Europe/London', 'America/New_York', 'Asia/Kolkata', 'Asia/Tokyo'] }
}

export const zoneCity = (tz: string) => tz.split('/').pop()!.replace(/_/g, ' ')

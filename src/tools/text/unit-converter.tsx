import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeftRight, Ruler, Square, Beaker, Weight, Thermometer, Gauge, Timer, HardDrive, Wind, Zap, Plug, Compass, Fuel, Search } from 'lucide-react'
import { Button, Card, Input, Select, CopyButton, Switch, cn } from '@/components/ui'
import { copyText } from '@/lib/files'
import { toast } from '@/components/toast'

type U = { id: string; name: string; sym: string; f?: number; to?: (v: number) => number; from?: (v: number) => number }
type Cat = { id: string; name: string; icon: any; units: U[]; def: [string, string] }

const lin = (id: string, name: string, sym: string, f: number): U => ({ id, name, sym, f })
const CATS: Cat[] = [
  { id: 'length', name: 'Length', icon: Ruler, def: ['m', 'ft'], units: [lin('nm', 'Nanometre', 'nm', 1e-9), lin('um', 'Micrometre', 'µm', 1e-6), lin('mm', 'Millimetre', 'mm', 1e-3), lin('cm', 'Centimetre', 'cm', 1e-2), lin('m', 'Metre', 'm', 1), lin('km', 'Kilometre', 'km', 1e3), lin('in', 'Inch', 'in', 0.0254), lin('ft', 'Foot', 'ft', 0.3048), lin('yd', 'Yard', 'yd', 0.9144), lin('mi', 'Mile', 'mi', 1609.344), lin('nmi', 'Nautical mile', 'nmi', 1852), lin('au', 'Astronomical unit', 'au', 149597870700), lin('ly', 'Light-year', 'ly', 9.4607304725808e15)] },
  { id: 'area', name: 'Area', icon: Square, def: ['m2', 'ft2'], units: [lin('mm2', 'Square millimetre', 'mm²', 1e-6), lin('cm2', 'Square centimetre', 'cm²', 1e-4), lin('m2', 'Square metre', 'm²', 1), lin('ha', 'Hectare', 'ha', 1e4), lin('km2', 'Square kilometre', 'km²', 1e6), lin('in2', 'Square inch', 'in²', 0.00064516), lin('ft2', 'Square foot', 'ft²', 0.09290304), lin('yd2', 'Square yard', 'yd²', 0.83612736), lin('ac', 'Acre', 'ac', 4046.8564224), lin('mi2', 'Square mile', 'mi²', 2589988.110336), lin('bigha', 'Bigha (West Bengal)', 'bigha', 1337.8)] },
  { id: 'volume', name: 'Volume', icon: Beaker, def: ['l', 'galus'], units: [lin('ml', 'Millilitre', 'mL', 1e-3), lin('l', 'Litre', 'L', 1), lin('m3', 'Cubic metre', 'm³', 1000), lin('cm3', 'Cubic centimetre', 'cm³', 1e-3), lin('tsp', 'Teaspoon (US)', 'tsp', 0.00492892159375), lin('tbsp', 'Tablespoon (US)', 'tbsp', 0.01478676478125), lin('floz', 'Fluid ounce (US)', 'fl oz', 0.0295735295625), lin('cup', 'Cup (US)', 'cup', 0.2365882365), lin('pt', 'Pint (US)', 'pt', 0.473176473), lin('qt', 'Quart (US)', 'qt', 0.946352946), lin('galus', 'Gallon (US)', 'gal', 3.785411784), lin('galuk', 'Gallon (UK)', 'gal UK', 4.54609), lin('in3', 'Cubic inch', 'in³', 0.016387064), lin('ft3', 'Cubic foot', 'ft³', 28.316846592)] },
  { id: 'mass', name: 'Weight', icon: Weight, def: ['kg', 'lb'], units: [lin('mg', 'Milligram', 'mg', 1e-6), lin('g', 'Gram', 'g', 1e-3), lin('kg', 'Kilogram', 'kg', 1), lin('t', 'Tonne', 't', 1000), lin('oz', 'Ounce', 'oz', 0.028349523125), lin('lb', 'Pound', 'lb', 0.45359237), lin('st', 'Stone', 'st', 6.35029318), lin('ton', 'US ton', 'ton', 907.18474), lin('ct', 'Carat', 'ct', 0.0002), lin('tola', 'Tola', 'tola', 0.0116638038)] },
  { id: 'temp', name: 'Temperature', icon: Thermometer, def: ['c', 'f'], units: [
    { id: 'c', name: 'Celsius', sym: '°C', to: (v) => v, from: (v) => v }, { id: 'f', name: 'Fahrenheit', sym: '°F', to: (v) => (v - 32) * 5 / 9, from: (v) => v * 9 / 5 + 32 },
    { id: 'k', name: 'Kelvin', sym: 'K', to: (v) => v - 273.15, from: (v) => v + 273.15 }, { id: 'r', name: 'Rankine', sym: '°R', to: (v) => (v - 491.67) * 5 / 9, from: (v) => (v + 273.15) * 9 / 5 }] },
  { id: 'speed', name: 'Speed', icon: Gauge, def: ['kmh', 'mph'], units: [lin('ms', 'Metres / second', 'm/s', 1), lin('kmh', 'Kilometres / hour', 'km/h', 1 / 3.6), lin('mph', 'Miles / hour', 'mph', 0.44704), lin('kn', 'Knot', 'kn', 0.514444444), lin('fts', 'Feet / second', 'ft/s', 0.3048), lin('mach', 'Mach (sea level)', 'Ma', 340.29), lin('c', 'Speed of light', 'c', 299792458)] },
  { id: 'time', name: 'Time', icon: Timer, def: ['h', 'min'], units: [lin('ns', 'Nanosecond', 'ns', 1e-9), lin('us', 'Microsecond', 'µs', 1e-6), lin('ms', 'Millisecond', 'ms', 1e-3), lin('s', 'Second', 's', 1), lin('min', 'Minute', 'min', 60), lin('h', 'Hour', 'h', 3600), lin('d', 'Day', 'd', 86400), lin('wk', 'Week', 'wk', 604800), lin('mo', 'Month (avg)', 'mo', 2629746), lin('yr', 'Year (365.2425 d)', 'yr', 31556952), lin('dec', 'Decade', 'dec', 315569520), lin('cen', 'Century', 'c', 3155695200)] },
  { id: 'data', name: 'Data', icon: HardDrive, def: ['MB', 'MiB'], units: [lin('bit', 'Bit', 'b', 1 / 8), lin('B', 'Byte', 'B', 1), lin('kb', 'Kilobit', 'kb', 125), lin('KB', 'Kilobyte (SI)', 'KB', 1e3), lin('KiB', 'Kibibyte (IEC)', 'KiB', 1024), lin('Mb', 'Megabit', 'Mb', 125000), lin('MB', 'Megabyte (SI)', 'MB', 1e6), lin('MiB', 'Mebibyte (IEC)', 'MiB', 1048576), lin('Gb', 'Gigabit', 'Gb', 1.25e8), lin('GB', 'Gigabyte (SI)', 'GB', 1e9), lin('GiB', 'Gibibyte (IEC)', 'GiB', 1073741824), lin('TB', 'Terabyte (SI)', 'TB', 1e12), lin('TiB', 'Tebibyte (IEC)', 'TiB', 1099511627776), lin('PB', 'Petabyte (SI)', 'PB', 1e15), lin('PiB', 'Pebibyte (IEC)', 'PiB', 1125899906842624)] },
  { id: 'pressure', name: 'Pressure', icon: Wind, def: ['bar', 'psi'], units: [lin('pa', 'Pascal', 'Pa', 1), lin('kpa', 'Kilopascal', 'kPa', 1e3), lin('mpa', 'Megapascal', 'MPa', 1e6), lin('bar', 'Bar', 'bar', 1e5), lin('mbar', 'Millibar', 'mbar', 100), lin('atm', 'Atmosphere', 'atm', 101325), lin('psi', 'Pound / sq inch', 'psi', 6894.757293168), lin('mmhg', 'mm of mercury', 'mmHg', 133.322387415), lin('inhg', 'Inch of mercury', 'inHg', 3386.389), lin('torr', 'Torr', 'Torr', 133.322368421)] },
  { id: 'energy', name: 'Energy', icon: Zap, def: ['kcal', 'kj'], units: [lin('j', 'Joule', 'J', 1), lin('kj', 'Kilojoule', 'kJ', 1e3), lin('cal', 'Calorie', 'cal', 4.184), lin('kcal', 'Kilocalorie', 'kcal', 4184), lin('wh', 'Watt-hour', 'Wh', 3600), lin('kwh', 'Kilowatt-hour', 'kWh', 3.6e6), lin('ev', 'Electronvolt', 'eV', 1.602176634e-19), lin('btu', 'BTU', 'BTU', 1055.05585262), lin('ftlb', 'Foot-pound', 'ft·lbf', 1.3558179483)] },
  { id: 'power', name: 'Power', icon: Plug, def: ['kw', 'hp'], units: [lin('w', 'Watt', 'W', 1), lin('kw', 'Kilowatt', 'kW', 1e3), lin('mw', 'Megawatt', 'MW', 1e6), lin('hp', 'Horsepower (mech.)', 'hp', 745.69987158227), lin('ps', 'Metric horsepower', 'PS', 735.49875), lin('btuh', 'BTU / hour', 'BTU/h', 0.29307107), lin('kcalh', 'kcal / hour', 'kcal/h', 1.163)] },
  { id: 'angle', name: 'Angle', icon: Compass, def: ['deg', 'rad'], units: [lin('deg', 'Degree', '°', Math.PI / 180), lin('rad', 'Radian', 'rad', 1), lin('grad', 'Gradian', 'gon', Math.PI / 200), lin('arcmin', 'Arcminute', '′', Math.PI / 10800), lin('arcsec', 'Arcsecond', '″', Math.PI / 648000), lin('turn', 'Turn', 'turn', 2 * Math.PI), lin('mil', 'Milliradian', 'mrad', 1e-3)] },
  { id: 'fuel', name: 'Fuel economy', icon: Fuel, def: ['kml', 'mpgus'], units: [ // base: km per litre
    { id: 'kml', name: 'Kilometres / litre', sym: 'km/L', to: (v) => v, from: (v) => v }, { id: 'l100', name: 'Litres / 100 km', sym: 'L/100km', to: (v) => 100 / v, from: (v) => 100 / v },
    { id: 'mpgus', name: 'Miles / gallon (US)', sym: 'mpg', to: (v) => v * 1.609344 / 3.785411784, from: (v) => v * 3.785411784 / 1.609344 }, { id: 'mpguk', name: 'Miles / gallon (UK)', sym: 'mpg UK', to: (v) => v * 1.609344 / 4.54609, from: (v) => v * 4.54609 / 1.609344 }] },
]

const toBase = (u: U, v: number) => (u.f !== undefined ? v * u.f : u.to!(v))
const fromBase = (u: U, v: number) => (u.f !== undefined ? v / u.f : u.from!(v))
function fmt(n: number, sig: number) {
  if (!Number.isFinite(n)) return '-'
  if (n === 0) return '0'
  const a = Math.abs(n)
  if (a >= 1e15 || a < 1e-6) return n.toExponential(Math.min(sig - 1, 10)).replace(/\.?0+e/, 'e')
  return Number(n.toPrecision(sig)).toLocaleString(undefined, { maximumFractionDigits: 12 })
}

export default function UnitConverter() {
  const [cat, setCat] = useState('length')
  const C = CATS.find((c) => c.id === cat)!
  const [from, setFrom] = useState(C.def[0]); const [to, setTo] = useState(C.def[1])
  const [val, setVal] = useState('1')
  const [sig, setSig] = useState(true)
  const [q, setQ] = useState('')

  const pick = (id: string) => { const c = CATS.find((x) => x.id === id)!; setCat(id); setFrom(c.def[0]); setTo(c.def[1]); setQ('') }
  const U = (id: string) => C.units.find((u) => u.id === id) ?? C.units[0]
  const n = Number(val.replace(/,/g, ''))
  const base = Number.isFinite(n) && val.trim() !== '' ? toBase(U(from), n) : NaN
  const res = fromBase(U(to), base)
  const P = sig ? 10 : 6
  const factor = useMemo(() => { const one = fromBase(U(to), toBase(U(from), 1)); const two = fromBase(U(to), toBase(U(from), 2)); return Math.abs(two - 2 * one) < 1e-9 * Math.max(1, Math.abs(one)) ? one : null }, [from, to, cat])
  const filtered = q ? CATS.flatMap((c) => c.units.filter((u) => (u.name + ' ' + u.sym).toLowerCase().includes(q.toLowerCase())).map((u) => ({ c, u }))) : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="scrollbar-thin -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1">
          {CATS.map((c) => (
            <button key={c.id} onClick={() => pick(c.id)} className={cn('flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition cursor-pointer', cat === c.id ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface text-muted hover:text-fg')}><c.icon className="size-4" />{c.name}</button>
          ))}
        </div>
        <div className="relative w-full sm:w-56"><Search className="absolute left-3 top-2.5 size-4 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a unit…" className="pl-9" />
          {filtered.length > 0 && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface p-1 shadow-xl">{filtered.slice(0, 20).map(({ c, u }) => <button key={c.id + u.id} onClick={() => { setCat(c.id); setFrom(u.id); setTo(c.def[0] === u.id ? c.def[1] : c.def[0]); setQ('') }} className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"><span>{u.name}</span><span className="text-xs text-muted">{c.name}</span></button>)}</div>}
        </div>
      </div>

      <Card className="space-y-4">
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-2">
            <Select aria-label="From unit" value={from} onChange={setFrom} options={C.units.map((u) => ({ value: u.id, label: `${u.name} (${u.sym})` }))} />
            <Input value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" className="h-16 font-display text-3xl font-semibold" />
          </div>
          <Button variant="outline" className="md:mb-3" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setFrom(to); setTo(from); if (Number.isFinite(res)) setVal(String(Number(res.toPrecision(12)))) }} aria-label="Swap" />
          <div className="space-y-2">
            <Select aria-label="To unit" value={to} onChange={setTo} options={C.units.map((u) => ({ value: u.id, label: `${u.name} (${u.sym})` }))} />
            <motion.div key={res + to} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="flex h-16 items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3">
              <span className="min-w-0 flex-1 truncate font-display text-3xl font-semibold text-accent">{fmt(res, P)}</span><span className="text-muted">{U(to).sym}</span>
              <CopyButton text={Number.isFinite(res) ? String(Number(res.toPrecision(P))) : ''} label="" variant="ghost" />
            </motion.div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {Number.isFinite(res) && <span><b className="text-fg">{fmt(n, P)} {U(from).sym}</b> = <b className="text-fg">{fmt(res, P)} {U(to).sym}</b></span>}
          {factor !== null && <span className="font-mono text-xs">1 {U(from).sym} = {fmt(factor, 10)} {U(to).sym}</span>}
          {val.trim() && !Number.isFinite(n) && <span className="text-danger">Enter a number</span>}
          <div className="ml-auto"><Switch checked={sig} onChange={setSig} label={<span className="text-xs">High precision</span>} /></div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border bg-surface-2/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{fmt(n, P)} {U(from).name.toLowerCase()} in every {C.name.toLowerCase()} unit</div>
        <div className="grid sm:grid-cols-2">
          {C.units.map((u) => { const v = fromBase(u, base); return (
            <button key={u.id} onClick={async () => { if (Number.isFinite(v) && (await copyText(String(Number(v.toPrecision(P)))))) toast(`Copied ${fmt(v, P)} ${u.sym}`) }}
              className={cn('flex items-center gap-3 border-b border-border px-4 py-2.5 text-left transition hover:bg-surface-2 sm:odd:border-r', u.id === to && 'bg-accent/5')}>
              <span className="min-w-0 flex-1"><span className="block text-sm">{u.name}</span><span className="text-[11px] text-muted">{u.sym}</span></span>
              <span className="font-mono text-sm tabular-nums">{fmt(v, P)}</span>
            </button>
          ) })}
        </div>
      </div>
    </div>
  )
}

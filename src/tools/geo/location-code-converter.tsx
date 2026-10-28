import { useMemo, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { Button, Input, Label, Slider, ToolGrid, ErrorNote, CopyButton } from '@/components/ui'
import { parseLatLon, toDMS } from '@/lib/b5/geo'
import { geohashEncode, geohashDecode, plusEncode, plusDecode, maidenhead, maidenheadDecode } from '@/lib/bcat/geo2'
import { TrackMap } from '@/lib/bcat/geoui'

/** Work out what kind of code the user typed. Pure. */
export function detect(s: string): { lat: number; lon: number; kind: string } | null {
  const t = s.trim()
  if (!t) return null
  if (/^[23456789CFGHJMPQRVWX]{2,8}0*\+[23456789CFGHJMPQRVWX]*$/i.test(t)) { const r = plusDecode(t); return { ...r, kind: 'Plus code' } }
  if (/^[A-Ra-r]{2}\d\d([A-Xa-x]{2})?$/.test(t)) { const r = maidenheadDecode(t); return { ...r, kind: 'Maidenhead locator' } }
  if (/^[0-9bcdefghjkmnpqrstuvwxyz]{3,12}$/i.test(t) && /[a-z]/i.test(t)) { const r = geohashDecode(t); return { ...r, kind: 'Geohash' } }
  const ll = parseLatLon(t); if (ll) return { lat: ll[0], lon: ll[1], kind: 'Latitude, longitude' }
  return null
}

export default function LocationCodeConverter() {
  const [input, setInput] = useState('48.8584, 2.2945')
  const [gh, setGh] = useState(9)
  const [pc, setPc] = useState(10)
  const [geoErr, setErr] = useState<string | null>(null)
  const { res, err: parseErr } = useMemo(() => { try { const r = detect(input); return { res: r, err: !r && input.trim() ? 'Type coordinates, a plus code, a geohash or a Maidenhead locator.' : null } } catch (e: any) { return { res: null, err: e?.message as string } } }, [input])
  const err = parseErr ?? geoErr
  const pcLen = pc < 10 && pc % 2 ? pc - 1 : pc

  const rows = res ? [
    { k: 'Decimal degrees', v: `${res.lat.toFixed(6)}, ${res.lon.toFixed(6)}` },
    { k: 'Degrees minutes seconds', v: `${toDMS(res.lat, true)} ${toDMS(res.lon, false)}` },
    { k: `Plus code (${pcLen} digits)`, v: plusEncode(res.lat, res.lon, pcLen) },
    { k: `Geohash (${gh} chars)`, v: geohashEncode(res.lat, res.lon, gh) },
    { k: 'Maidenhead locator', v: maidenhead(res.lat, res.lon, 3) },
    { k: 'geo: link', v: `geo:${res.lat.toFixed(6)},${res.lon.toFixed(6)}` },
  ] : []

  return (
    <ToolGrid
      main={
        <div className="space-y-3">
          <Label>Coordinates or code</Label>
          <div className="flex gap-2">
            <Input value={input} onChange={(e) => { setInput(e.target.value); setErr(null) }} placeholder="48.8584, 2.2945 or 8FW4V75V+8Q or u09tunq or JN18du" aria-label="Location" className="font-mono" />
            <Button variant="outline" icon={<LocateFixed className="size-4" />} onClick={() => navigator.geolocation?.getCurrentPosition((p) => setInput(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`), () => setErr('Location permission was refused.'))}>Me</Button>
          </div>
          <ErrorNote error={err} />
          {res && <p className="text-xs text-muted">Read as: {res.kind}</p>}
          {res && (
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {rows.map((r) => <div key={r.k} className="flex items-center gap-3 px-3 py-2"><span className="w-44 shrink-0 text-xs text-muted">{r.k}</span><span className="min-w-0 flex-1 break-all font-mono text-sm">{r.v}</span><CopyButton text={r.v} /></div>)}
            </div>
          )}
          {res && <TrackMap layers={[]} marker={{ lat: res.lat, lon: res.lon }} circles={[{ lat: res.lat, lon: res.lon, r: 2000, color: '#F5A524' }]} onPick={(lat, lon) => setInput(`${lat.toFixed(6)}, ${lon.toFixed(6)}`)} height={300} />}
        </div>
      }
      side={
        <>
          <Slider label="Geohash length" value={gh} onChange={setGh} min={3} max={12} />
          <Slider label="Plus code length" value={pc} onChange={setPc} min={8} max={15} step={1} />
          <div className="space-y-1 text-xs text-muted">
            <p>Plus codes: 10 digits is about 14 m, 11 is about 3 m.</p>
            <p>Geohash: 7 chars is about 150 m, 9 is about 5 m.</p>
            <p>Maidenhead: used by radio amateurs, 6 chars is about 5 km.</p>
          </div>
        </>
      }
    />
  )
}

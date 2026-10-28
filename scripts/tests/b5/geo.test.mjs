import assert from 'node:assert/strict'
import * as g from '../../../src/lib/b5/geo.ts'
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`)
// Eiffel tower
const u = g.toUTM(48.8584, 2.2945)
assert.equal(u.zone, 31); assert.equal(u.band, 'U')
near(u.easting, 448252.0014, 0.01, 'E'); near(u.northing, 5411954.9103, 0.01, 'N')
const [la, lo] = g.fromUTM(31, 'N', u.easting, u.northing); near(la, 48.8584, 1e-6, 'lat'); near(lo, 2.2945, 1e-6, 'lon')
// southern hemisphere
const s = g.toUTM(-33.8568, 151.2153); const back = g.fromUTM(s.zone, 'S', s.easting, s.northing); near(back[0], -33.8568, 1e-6, 'syd lat')
// MGRS: known: 48.8584,2.2945 -> 31U DQ 48251 11932
assert.equal(g.toMGRS(48.8584, 2.2945), '31U DQ 48252 11954')
assert.equal(g.toMGRS(-33.8568, 151.2153), '56H LH 34900 52288')
assert.equal(g.toMGRS(64.1466, -21.9426), '27W VM 54138 13689')
assert.equal(g.toMGRS(-54.8, -68.3), '19F EV 45000 27239')
const m = g.fromMGRS('31U DQ 48252 11954'); near(m[0], 48.8584, 1e-4, 'mgrs lat'); near(m[1], 2.2945, 1e-4, 'mgrs lon')
for (const [lat, lon] of [[-33.8568, 151.2153], [40.7128, -74.006], [64.1466, -21.9426], [-54.8, -68.3], [1.29, 103.85]]) { const r = g.fromMGRS(g.toMGRS(lat, lon)); near(r[0], lat, 2e-5, 'rt lat ' + lat); near(r[1], lon, 2e-5, 'rt lon ' + lon) }
assert.deepEqual(g.parseLatLon(`40°26'46"N 79°58'56"W`).map((x) => +x.toFixed(4)), [40.4461, -79.9822])
assert.deepEqual(g.parseLatLon('48.8584, 2.2945'), [48.8584, 2.2945])
near(g.haversine([2.2945, 48.8584], [-0.1276, 51.5072]), 340600, 1500, 'paris-london')
const gpx = g.toGPX({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [1, 2] } }] })
assert.match(gpx, /<wpt lat="2" lon="1"><name>A<\/name><\/wpt>/)
console.log('geo ok')

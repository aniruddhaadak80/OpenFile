import assert from 'node:assert/strict'
import shpwrite from '@mapbox/shp-write'
import shp from 'shpjs'
const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'A', n: 1 }, geometry: { type: 'Point', coordinates: [88.36, 22.57] } }, { type: 'Feature', properties: { name: 'L' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }] }
const ab = await shpwrite.zip(fc, { folder: 'x', outputType: 'arraybuffer' })
const back = await shp(ab)
const all = (Array.isArray(back) ? back : [back]).flatMap((c) => c.features)
assert.equal(all.length, 2)
assert.ok(all.some((f) => f.properties.name === 'A' && f.geometry.type === 'Point'))
console.log('shp roundtrip ok')

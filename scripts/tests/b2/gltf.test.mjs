// gltf-transform pipeline used by gltf-optimizer (Node).
import assert from 'node:assert'
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import * as fn from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer'
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready])
const doc = new Document(); const buf = doc.createBuffer()
// a grid mesh 40x40
const N = 40, pos = [], idx = []
for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) pos.push(x / N, Math.sin(x / 5) * 0.1, y / N)
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = y * (N + 1) + x; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2) }
const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf)).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(idx)).setBuffer(buf))
doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const before = await io.writeBinary(doc)
await doc.transform(fn.dedup(), fn.prune(), fn.weld(), fn.simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.01 }))
await doc.transform(fn.reorder({ encoder: MeshoptEncoder }), fn.quantize(), fn.meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
const after = await io.writeBinary(doc)
assert.ok(after.byteLength < before.byteLength, `${after.byteLength} < ${before.byteLength}`)
const back = await io.readBinary(after)
assert.ok(back.getRoot().listMeshes().length === 1)
console.log('ok gltf', before.byteLength, '->', after.byteLength, 'bytes')

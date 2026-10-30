// node --experimental-strip-types scripts/tests/b2/upscale-plan.test.mjs
import assert from 'node:assert'
const U = await import('../../../src/lib/b2/upscale-plan.ts')
assert.equal(U.tileCount(640, 427), 12)
assert.equal(U.tileCount(192, 192), 1)
assert.equal(U.tileCount(1600, 1067), 54)
assert.notEqual(U.MODEL_CPU, U.MODEL_GPU)
// estimate names the tile count and the device, and is a range on the CPU
const e = U.estimateText(640, 427, false)
assert.match(e, /^12 tiles, roughly .+ to .+ on this device's CPU$/, e)
assert.equal(U.estimateText(100, 100, true), '1 tile, under a minute on the GPU')
// remaining time uses the measured rate
assert.equal(U.remainingText(0, 12, 5000), '')
assert.equal(U.remainingText(12, 12, 5000), '')
assert.equal(U.remainingText(2, 12, 60000), 'about 5 minutes left')
assert.equal(U.remainingText(6, 12, 30000), 'about 30 seconds left')
// errors are plain words
assert.match(U.friendlyUpscaleError(new Error('failed to allocate a buffer of size 1234')), /ran out of memory/)
assert.match(U.friendlyUpscaleError('Failed to fetch'), /could not be downloaded/)
assert.match(U.friendlyUpscaleError('no available backend found'), /could not start/)
assert.match(U.friendlyUpscaleError('weird thing'), /Turn off AI upscale.*Details: weird thing/)
assert.equal(U.fmtDuration(58), 'about a minute')
assert.equal(U.fmtDuration(52), '50 seconds')
assert.equal(U.estimateText(100, 100, false), "1 tile, under a minute on this device's CPU")
console.log('upscale-plan ok')

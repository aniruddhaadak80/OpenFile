import assert from 'node:assert/strict'
import * as c from '../../../src/lib/b5/ciphers.ts'
const s = 'Attack at Dawn, 1944!'
assert.equal(c.rot13(c.rot13(s)), s); assert.equal(c.rot47(c.rot47(s)), s); assert.equal(c.atbash(c.atbash(s)), s)
assert.equal(c.vigenere('ATTACKATDAWN', 'LEMON'), 'LXFOPVEFRNHR'); assert.equal(c.vigenere('LXFOPVEFRNHR', 'LEMON', true), 'ATTACKATDAWN')
assert.equal(c.fromMorse(c.toMorse('SOS help 2')), 'SOS HELP 2')
assert.equal(c.toMorse('SOS'), '... --- ...')
assert.equal(c.bacon('ab'), 'AAAAA AAAAB'); assert.equal(c.bacon(c.bacon('HELLO'), true), 'HELLO')
assert.equal(c.railFence('WEAREDISCOVEREDFLEEATONCE', 3), 'WECRLTEERDSOEEFEAOCAIVDEN')
assert.equal(c.railFence('WECRLTEERDSOEEFEAOCAIVDEN', 3, true), 'WEAREDISCOVEREDFLEEATONCE')
assert.equal(c.fromNato(c.toNato('Hi 5')), 'HI 5')
assert.equal(c.fromBraille(c.toBraille('hello world')), 'hello world')
assert.equal(c.fromBin(c.toBin('héllo')), 'héllo')
assert.equal(c.fromA1Z26(c.toA1Z26('Hello World')), 'HELLO WORLD')
assert.equal(c.xorHex(c.xorHex('abc', 'k'), 'k', true), 'abc')
assert.equal(c.affine(c.affine('Affine', 5, 8), 5, 8, true), 'Affine')
console.log('ciphers ok')

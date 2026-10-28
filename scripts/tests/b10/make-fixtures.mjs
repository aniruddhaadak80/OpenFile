import * as D from '../../../src/lib/b10/dev.ts'
import { writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
const dir = new URL('./fixtures/', import.meta.url).pathname
const junk = new Uint8Array(512).map((_, i) => (i * 37) & 0xff)
const parts = [junk, D.minimalFile('png', 2000), junk, D.minimalFile('zip', 3000), junk, D.minimalFile('pdf', 4000), junk, D.minimalFile('wav', 5000), junk]
const len = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
writeFileSync(dir + 'embedded-files.bin', out)
writeFileSync(dir + 'russian-cp1251.txt', Uint8Array.from([0xcf,0xf0,0xe8,0xe2,0xe5,0xf2,0x2c,0x20,0xec,0xe8,0xf0,0x21,0x20,0xdd,0xf2,0xee,0x20,0xf2,0xe5,0xf1,0xf2,0xee,0xe2,0xfb,0xe9,0x20,0xf4,0xe0,0xe9,0xeb,0x2e,0x0d,0x0a]))
writeFileSync(dir + 'french-cp1252.txt', Uint8Array.from(Buffer.from('Café, crème brûlée et déjà vu. Ça marche très bien.\r\n', 'latin1')))
const env = 'DATABASE_URL=postgres://admin:s3cretPass99@db.internal.example:5432/app\nAWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\napi_key = "abcd1234efgh5678ijkl"\n'
writeFileSync(dir + 'leaky-project.zip', zipSync({ 'project/.env': strToU8(env), 'project/src/app.js': strToU8('const ok = 1\n// nothing secret here\n'), 'project/keys/id_rsa': strToU8('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n'), 'project/node_modules/x/index.js': strToU8(env) }))
const now = Date.parse('2026-10-28T10:00:00Z')
const entry = (i, url, method, status, mime, ms, body, extra = {}) => ({ startedDateTime: new Date(now + i * 120).toISOString(), time: ms, request: { method, url, httpVersion: 'HTTP/2', headers: [{ name: 'accept', value: '*/*' }, { name: 'authorization', value: 'Bearer secret-token-123' }, { name: 'cookie', value: 'sid=abc123' }], queryString: [...new URL(url).searchParams].map(([name, value]) => ({ name, value })), cookies: [], headersSize: -1, bodySize: 0, ...(extra.post ? { postData: { mimeType: 'application/json', text: extra.post } } : {}) }, response: { status, statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error', httpVersion: 'HTTP/2', headers: [{ name: 'content-type', value: mime }, { name: 'set-cookie', value: 'sid=abc123; HttpOnly' }], cookies: [], content: { size: body.length, mimeType: mime, text: body }, redirectURL: '', headersSize: -1, bodySize: body.length, _transferSize: body.length + 200 }, cache: {}, timings: { blocked: 1, dns: 5, connect: 10, ssl: 8, send: 1, wait: ms - 40, receive: 15 }, _resourceType: extra.type ?? 'fetch' })
const har = { log: { version: '1.2', creator: { name: 'OpenFile test', version: '1' }, pages: [], entries: [
  entry(0, 'https://shop.example.com/', 'GET', 200, 'text/html', 180, '<!doctype html><title>Shop</title>', { type: 'document' }),
  entry(1, 'https://shop.example.com/app.js', 'GET', 200, 'application/javascript', 90, 'console.log(1)', { type: 'script' }),
  entry(2, 'https://shop.example.com/style.css', 'GET', 200, 'text/css', 70, 'body{}', { type: 'stylesheet' }),
  entry(3, 'https://api.example.com/v1/cart?token=abc123&page=1', 'GET', 200, 'application/json', 240, '{"items":[{"id":1,"qty":2}]}'),
  entry(4, 'https://api.example.com/v1/checkout', 'POST', 500, 'application/json', 600, '{"error":"payment failed"}', { post: '{"cart":1,"card":"tok_visa"}' }),
  entry(5, 'https://cdn.example.com/missing.png', 'GET', 404, 'text/plain', 60, 'not found', { type: 'image' }),
] } }
writeFileSync(dir + 'sample.har', JSON.stringify(har, null, 1))
writeFileSync(dir + 'people.csv', 'id,Full Name,joined,active,score\n1,Ana Silva,2024-01-02,true,9.5\n2,"O\'Neil, Pat",2024-02-10,false,7\n3,Mei Lin,,true,8.25\n')

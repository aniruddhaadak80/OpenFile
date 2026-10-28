// Writes .br and .gz copies next to compressible files so the server can send them without
// compressing on every request. Run once at image build time: node precompress.mjs <dir>
// Skips files under 1 KB and files that would not shrink by at least 10 percent.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'

const dir = process.argv[2] || 'dist'
const EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.wasm', '.svg', '.txt', '.xml', '.xsl', '.webmanifest', '.map', '.ico', '.data', '.wav', '.ttf', '.otf'])
let files = 0, before = 0, after = 0

function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    const st = statSync(p)
    if (st.isDirectory()) { walk(p); continue }
    if (!EXT.has(extname(name).toLowerCase()) || st.size < 1024) continue
    const buf = readFileSync(p)
    const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: st.size > 512 << 10 ? 8 : 11, [constants.BROTLI_PARAM_SIZE_HINT]: st.size } })
    if (br.length < buf.length * 0.9) { writeFileSync(p + '.br', br); after += br.length } else after += buf.length
    const gz = gzipSync(buf, { level: 9 })
    if (gz.length < buf.length * 0.9) writeFileSync(p + '.gz', gz)
    files++; before += buf.length
  }
}
walk(dir)
console.log(`precompress: ${files} files, ${(before / 1048576).toFixed(1)} MB to ${(after / 1048576).toFixed(1)} MB with brotli`)

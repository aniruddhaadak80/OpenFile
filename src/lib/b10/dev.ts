/* Batch 10 pure developer logic: hash and ID analysis, SQL DDL inference, secret scanning, file carving,
   Shamir secret sharing, dummy files, text encoding detection. No DOM access, so it runs in Node tests. */

// ---------------- Hash and ID analysis ----------------
export interface HashGuess { name: string; hashcat?: number; john?: string; note?: string }

const HEX_BY_LEN: Record<number, HashGuess[]> = {
  8: [{ name: 'CRC-32', hashcat: 11500 }, { name: 'Adler-32' }, { name: 'FNV-1a 32' }],
  16: [{ name: 'MySQL 3.23 (old)', hashcat: 200, john: 'mysql' }, { name: 'CRC-64' }, { name: 'xxHash64' }, { name: 'FNV-1a 64' }, { name: 'Half MD5', hashcat: 5100 }],
  32: [{ name: 'MD5', hashcat: 0, john: 'raw-md5' }, { name: 'NTLM', hashcat: 1000, john: 'nt' }, { name: 'MD4', hashcat: 900, john: 'raw-md4' }, { name: 'LM', hashcat: 3000, john: 'lm' }, { name: 'RIPEMD-128' }, { name: 'xxHash128 / XXH3-128' }, { name: 'MD2' }],
  40: [{ name: 'SHA-1', hashcat: 100, john: 'raw-sha1' }, { name: 'RIPEMD-160', hashcat: 6000, john: 'ripemd-160' }, { name: 'MySQL 4.1+ (without *)', hashcat: 300 }, { name: 'HAS-160' }],
  48: [{ name: 'Tiger-192', john: 'tiger' }],
  56: [{ name: 'SHA-224', hashcat: 1300, john: 'raw-sha224' }, { name: 'SHA3-224', hashcat: 17300 }, { name: 'SHA-512/224' }],
  64: [{ name: 'SHA-256', hashcat: 1400, john: 'raw-sha256' }, { name: 'SHA3-256', hashcat: 17400 }, { name: 'Keccak-256', hashcat: 17800 }, { name: 'BLAKE2s-256' }, { name: 'BLAKE3' }, { name: 'RIPEMD-256' }, { name: 'GOST R 34.11-94', hashcat: 6900 }, { name: 'SHA-512/256' }],
  80: [{ name: 'RIPEMD-320' }],
  96: [{ name: 'SHA-384', hashcat: 10800, john: 'raw-sha384' }, { name: 'SHA3-384', hashcat: 17500 }, { name: 'Keccak-384' }],
  128: [{ name: 'SHA-512', hashcat: 1700, john: 'raw-sha512' }, { name: 'SHA3-512', hashcat: 17600 }, { name: 'Keccak-512', hashcat: 18000 }, { name: 'BLAKE2b-512', hashcat: 600 }, { name: 'Whirlpool', hashcat: 6100, john: 'whirlpool' }],
}

const PREFIXED: { re: RegExp; g: HashGuess }[] = [
  { re: /^\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}$/, g: { name: 'bcrypt', hashcat: 3200, john: 'bcrypt' } },
  { re: /^\$argon2(id|i|d)\$v=\d+\$m=\d+,t=\d+,p=\d+\$/, g: { name: 'Argon2', hashcat: 34000, john: 'argon2' } },
  { re: /^\$scrypt\$|^\$7\$/, g: { name: 'scrypt', hashcat: 8900 } },
  { re: /^\$1\$[^$]{0,8}\$[./A-Za-z0-9]{22}$/, g: { name: 'MD5 crypt', hashcat: 500, john: 'md5crypt' } },
  { re: /^\$apr1\$/, g: { name: 'Apache MD5 (apr1)', hashcat: 1600 } },
  { re: /^\$5\$/, g: { name: 'SHA-256 crypt', hashcat: 7400, john: 'sha256crypt' } },
  { re: /^\$6\$/, g: { name: 'SHA-512 crypt', hashcat: 1800, john: 'sha512crypt' } },
  { re: /^\$y\$/, g: { name: 'yescrypt', note: 'Default on recent Debian, Ubuntu and Fedora' } },
  { re: /^\$P\$|^\$H\$/, g: { name: 'phpass (WordPress, phpBB)', hashcat: 400, john: 'phpass' } },
  { re: /^\$pbkdf2-sha256\$/, g: { name: 'PBKDF2-SHA256 (passlib)', hashcat: 20300 } },
  { re: /^pbkdf2_sha256\$\d+\$/, g: { name: 'Django PBKDF2-SHA256', hashcat: 10000, john: 'django' } },
  { re: /^sha1\$[^$]+\$[a-f0-9]{40}$/i, g: { name: 'Django SHA-1', hashcat: 124 } },
  { re: /^\{SSHA\}/i, g: { name: 'LDAP salted SHA-1 (SSHA)', hashcat: 111 } },
  { re: /^\{SHA\}/i, g: { name: 'LDAP SHA-1', hashcat: 101 } },
  { re: /^\{SSHA512\}/i, g: { name: 'LDAP SSHA-512', hashcat: 1711 } },
  { re: /^\*[A-F0-9]{40}$/i, g: { name: 'MySQL 4.1+ / 5', hashcat: 300, john: 'mysql-sha1' } },
  { re: /^0x0100[a-f0-9]{48}$/i, g: { name: 'MSSQL 2005', hashcat: 132 } },
  { re: /^0x0200[a-f0-9]{136}$/i, g: { name: 'MSSQL 2012+', hashcat: 1731 } },
  { re: /^md5[a-f0-9]{32}$/i, g: { name: 'PostgreSQL MD5', hashcat: 12 } },
  { re: /^SCRAM-SHA-256\$/, g: { name: 'PostgreSQL SCRAM-SHA-256', hashcat: 28600 } },
  { re: /^\$krb5tgs\$/, g: { name: 'Kerberos 5 TGS-REP', hashcat: 13100 } },
  { re: /^\$ethereum\$/, g: { name: 'Ethereum wallet', hashcat: 15700 } },
  { re: /^[a-f0-9]{32}:[a-f0-9]{32}$/i, g: { name: 'LM:NTLM pair (pwdump)', hashcat: 1000 } },
  { re: /^[a-f0-9]{32}:.{1,32}$/i, g: { name: 'Salted MD5 (hash:salt)', hashcat: 10 } },
  { re: /^[a-f0-9]{40}:.{1,40}$/i, g: { name: 'Salted SHA-1 (hash:salt)', hashcat: 110 } },
  { re: /^[a-f0-9]{64}:.{1,64}$/i, g: { name: 'Salted SHA-256 (hash:salt)', hashcat: 1410 } },
]

export interface IdInfo { kind: string; fields: [string, string][] }

const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function analyzeId(raw: string): IdInfo | null {
  const s = raw.trim()
  const uuid = s.replace(/^urn:uuid:/i, '').replace(/^\{|\}$/g, '')
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    const h = uuid.replace(/-/g, '').toLowerCase()
    const ver = parseInt(h[12], 16)
    const vb = parseInt(h[16], 16)
    const variant = vb < 8 ? 'NCS (reserved)' : vb < 12 ? 'RFC 9562' : vb < 14 ? 'Microsoft (reserved)' : 'Future (reserved)'
    const fields: [string, string][] = [['Version', String(ver)], ['Variant', variant]]
    if (h === '0'.repeat(32)) return { kind: 'Nil UUID', fields }
    if (h === 'f'.repeat(32)) return { kind: 'Max UUID', fields }
    if (ver === 1 || ver === 6) {
      const t = ver === 1 ? BigInt('0x' + h.slice(13, 16) + h.slice(8, 12) + h.slice(0, 8)) : BigInt('0x' + h.slice(0, 12) + h.slice(13, 16))
      const ms = Number((t - 122192928000000000n) / 10000n)
      fields.push(['Time', new Date(ms).toISOString()], ['Clock sequence', String(parseInt(h.slice(16, 20), 16) & 0x3fff)], ['Node (MAC)', h.slice(20).match(/../g)!.join(':')])
    }
    if (ver === 7) { const ms = parseInt(h.slice(0, 12), 16); fields.push(['Time', new Date(ms).toISOString()], ['Unix ms', String(ms)]) }
    if (ver === 4) fields.push(['Meaning', '122 random bits'])
    if (ver === 3 || ver === 5) fields.push(['Meaning', ver === 3 ? 'MD5 hash of a name in a namespace' : 'SHA-1 hash of a name in a namespace'])
    return { kind: `UUID v${ver}`, fields }
  }
  if (/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(s)) {
    let ms = 0
    for (const c of s.slice(0, 10).toUpperCase()) ms = ms * 32 + CROCK.indexOf(c)
    return { kind: 'ULID', fields: [['Time', new Date(ms).toISOString()], ['Unix ms', String(ms)], ['Random part', s.slice(10)]] }
  }
  if (/^[0-9a-f]{24}$/i.test(s)) {
    const sec = parseInt(s.slice(0, 8), 16)
    return { kind: 'MongoDB ObjectId', fields: [['Time', new Date(sec * 1000).toISOString()], ['Random / machine', s.slice(8, 18)], ['Counter', String(parseInt(s.slice(18), 16))]] }
  }
  if (/^[0-9a-v]{20}$/.test(s)) {
    // xid: base32hex of 12 bytes, first 4 bytes are a timestamp
    const bits = [...s].map((c) => parseInt(c, 32).toString(2).padStart(5, '0')).join('')
    const sec = parseInt(bits.slice(0, 32), 2)
    if (sec > 1.2e9 && sec < 4.1e9) return { kind: 'xid', fields: [['Time', new Date(sec * 1000).toISOString()]] }
  }
  if (/^\d{15,20}$/.test(s)) {
    const n = BigInt(s)
    const out: [string, string][] = []
    const disc = Number((n >> 22n) + 1420070400000n)
    const tw = Number((n >> 22n) + 1288834974657n)
    if (disc > 1.42e12 && disc < 2.5e12) out.push(['Discord time', new Date(disc).toISOString()])
    if (tw > 1.28e12 && tw < 2.5e12) out.push(['X (Twitter) time', new Date(tw).toISOString()])
    out.push(['Worker / machine', String((n >> 12n) & 0x3ffn)], ['Sequence', String(n & 0xfffn)])
    return { kind: 'Snowflake ID', fields: out }
  }
  if (/^[A-Za-z0-9_-]{21}$/.test(s) && /[_-]|[A-Z]/.test(s)) return { kind: 'Nano ID (likely)', fields: [['Length', '21'], ['Meaning', 'About 126 random bits, no time inside']] }
  if (/^c[a-z0-9]{24}$/.test(s)) return { kind: 'CUID (likely)', fields: [] }
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(s) && s.startsWith('eyJ')) return { kind: 'JSON Web Token', fields: [['Tip', 'Open it in the JWT Decoder for the full payload']] }
  return null
}

export function identifyHash(raw: string): { guesses: HashGuess[]; encoding: string; bits?: number } {
  const s = raw.trim()
  for (const p of PREFIXED) if (p.re.test(s)) return { guesses: [p.g], encoding: 'Modular crypt / prefixed' }
  if (/^[a-f0-9]+$/i.test(s)) {
    const g = HEX_BY_LEN[s.length]
    return { guesses: g ?? [], encoding: 'Hex', bits: s.length * 4 }
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(s) && s.length % 4 === 0) {
    const bytes = (s.length / 4) * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0)
    const g = HEX_BY_LEN[bytes * 2]
    return { guesses: g ? g.map((x) => ({ ...x, note: 'Base64 encoded' })) : [], encoding: 'Base64', bits: bytes * 8 }
  }
  return { guesses: [], encoding: 'Unknown' }
}

// ---------------- SQL DDL ----------------
export type SqlDialect = 'postgres' | 'mysql' | 'sqlite' | 'sqlserver'
type ColType = 'int' | 'bigint' | 'decimal' | 'bool' | 'date' | 'datetime' | 'uuid' | 'json' | 'text'

export interface ColInfo { name: string; type: ColType; nullable: boolean; maxLen: number; unique: boolean }

export function inferColumns(header: string[], rows: unknown[][]): ColInfo[] {
  return header.map((name, ci) => {
    const vals = rows.map((r) => r[ci]).filter((v) => v !== null && v !== undefined && v !== '')
    const strs = vals.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
    const nullable = vals.length < rows.length
    const maxLen = Math.max(0, ...strs.map((s) => s.length))
    const all = (re: RegExp) => strs.length > 0 && strs.every((s) => re.test(s))
    let type: ColType = 'text'
    if (vals.length && vals.every((v) => typeof v === 'object')) type = 'json'
    else if (all(/^(true|false|yes|no|t|f|y|n)$/i)) type = 'bool'
    else if (all(/^[-+]?\d+$/)) type = strs.every((s) => Math.abs(Number(s)) <= 2147483647) ? 'int' : 'bigint'
    else if (all(/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i)) type = 'decimal'
    else if (all(/^\d{4}-\d{2}-\d{2}$/)) type = 'date'
    else if (all(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/)) type = 'datetime'
    else if (all(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) type = 'uuid'
    return { name, type, nullable, maxLen, unique: new Set(strs).size === strs.length && strs.length === rows.length }
  })
}

export function quoteIdent(name: string, d: SqlDialect): string {
  if (d === 'mysql') return '`' + name.replace(/`/g, '``') + '`'
  if (d === 'sqlserver') return '[' + name.replace(/]/g, ']]') + ']'
  return '"' + name.replace(/"/g, '""') + '"'
}

export function snake(s: string): string {
  return s.trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'col'
}

function sqlType(c: ColInfo, d: SqlDialect): string {
  const v = Math.max(1, Math.min(c.maxLen <= 0 ? 255 : Math.ceil(c.maxLen * 1.25 / 8) * 8, 4000))
  switch (c.type) {
    case 'int': return d === 'sqlite' ? 'INTEGER' : 'INT'
    case 'bigint': return d === 'sqlite' ? 'INTEGER' : 'BIGINT'
    case 'decimal': return d === 'sqlite' ? 'REAL' : d === 'postgres' ? 'NUMERIC' : 'DECIMAL(18,6)'
    case 'bool': return d === 'sqlite' ? 'INTEGER' : d === 'sqlserver' ? 'BIT' : 'BOOLEAN'
    case 'date': return d === 'sqlite' ? 'TEXT' : 'DATE'
    case 'datetime': return d === 'sqlite' ? 'TEXT' : d === 'postgres' ? 'TIMESTAMPTZ' : d === 'sqlserver' ? 'DATETIME2' : 'DATETIME'
    case 'uuid': return d === 'postgres' ? 'UUID' : d === 'sqlserver' ? 'UNIQUEIDENTIFIER' : d === 'sqlite' ? 'TEXT' : 'CHAR(36)'
    case 'json': return d === 'postgres' ? 'JSONB' : d === 'mysql' ? 'JSON' : d === 'sqlserver' ? 'NVARCHAR(MAX)' : 'TEXT'
    default: return d === 'sqlite' ? 'TEXT' : c.maxLen > 4000 ? (d === 'sqlserver' ? 'NVARCHAR(MAX)' : 'TEXT') : (d === 'sqlserver' ? `NVARCHAR(${v})` : `VARCHAR(${v})`)
  }
}

function sqlValue(v: unknown, c: ColInfo, d: SqlDialect): string {
  if (v === null || v === undefined || v === '') return 'NULL'
  if (c.type === 'int' || c.type === 'bigint' || c.type === 'decimal') return String(v)
  if (c.type === 'bool') { const t = /^(true|yes|t|y|1)$/i.test(String(v)); return d === 'postgres' || d === 'mysql' ? (t ? 'TRUE' : 'FALSE') : t ? '1' : '0' }
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return (d === 'sqlserver' ? 'N' : '') + "'" + s.replace(/'/g, "''") + "'"
}

export function buildSql(table: string, header: string[], rows: unknown[][], d: SqlDialect, opts: { snakeCase?: boolean; primaryKey?: string; inserts?: boolean; batch?: number; dropFirst?: boolean } = {}): string {
  const cols = inferColumns(header, rows)
  const names = cols.map((c) => (opts.snakeCase ? snake(c.name) : c.name))
  const t = quoteIdent(opts.snakeCase ? snake(table) : table, d)
  const out: string[] = []
  if (opts.dropFirst) out.push(d === 'sqlserver' ? `IF OBJECT_ID(N'${table.replace(/'/g, "''")}', N'U') IS NOT NULL DROP TABLE ${t};` : `DROP TABLE IF EXISTS ${t};`)
  const lines = cols.map((c, i) => `  ${quoteIdent(names[i], d)} ${sqlType(c, d)}${c.nullable ? '' : ' NOT NULL'}${opts.primaryKey === c.name ? ' PRIMARY KEY' : ''}`)
  out.push(`CREATE TABLE ${t} (\n${lines.join(',\n')}\n);`)
  if (opts.inserts !== false && rows.length) {
    const b = Math.max(1, opts.batch ?? 100)
    const colList = names.map((n) => quoteIdent(n, d)).join(', ')
    for (let i = 0; i < rows.length; i += b) {
      const chunk = rows.slice(i, i + b).map((r) => '  (' + cols.map((c, j) => sqlValue(r[j], c, d)).join(', ') + ')')
      out.push(`INSERT INTO ${t} (${colList}) VALUES\n${chunk.join(',\n')};`)
    }
  }
  return out.join('\n\n') + '\n'
}

/** Turn a JSON array of objects into header + rows. */
export function jsonToRows(data: unknown): { header: string[]; rows: unknown[][] } {
  const arr = Array.isArray(data) ? data : (data && typeof data === 'object' ? (Object.values(data as object).find(Array.isArray) as unknown[] | undefined) ?? [data] : [])
  const header: string[] = []
  for (const o of arr) if (o && typeof o === 'object' && !Array.isArray(o)) for (const k of Object.keys(o)) if (!header.includes(k)) header.push(k)
  if (!header.length) throw new Error('Expected a JSON array of objects, like [{"id": 1, "name": "A"}]')
  return { header, rows: arr.map((o) => header.map((k) => (o as Record<string, unknown>)?.[k] ?? null)) }
}

// ---------------- Secret scanning ----------------
export interface SecretRule { id: string; name: string; re: RegExp; severity: 'high' | 'medium' | 'low' }
export const SECRET_RULES: SecretRule[] = [
  { id: 'private-key', name: 'Private key block', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, severity: 'high' },
  { id: 'aws-access-key', name: 'AWS access key ID', re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g, severity: 'high' },
  { id: 'aws-secret', name: 'AWS secret access key', re: /aws(.{0,20})?(secret|private)?.{0,20}['"=:\s]([A-Za-z0-9/+=]{40})\b/gi, severity: 'high' },
  { id: 'github-token', name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b/g, severity: 'high' },
  { id: 'gitlab-token', name: 'GitLab token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, severity: 'high' },
  { id: 'slack-token', name: 'Slack token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, severity: 'high' },
  { id: 'slack-webhook', name: 'Slack webhook URL', re: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/g, severity: 'high' },
  { id: 'discord-webhook', name: 'Discord webhook URL', re: /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g, severity: 'high' },
  { id: 'google-api-key', name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, severity: 'high' },
  { id: 'google-oauth', name: 'Google OAuth client secret', re: /\bGOCSPX-[A-Za-z0-9_-]{28}\b/g, severity: 'high' },
  { id: 'stripe-key', name: 'Stripe secret key', re: /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{20,}\b/g, severity: 'high' },
  { id: 'openai-key', name: 'OpenAI API key', re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{40,}\b/g, severity: 'high' },
  { id: 'anthropic-key', name: 'Anthropic API key', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}\b/g, severity: 'high' },
  { id: 'hf-token', name: 'Hugging Face token', re: /\bhf_[A-Za-z0-9]{34,}\b/g, severity: 'high' },
  { id: 'npm-token', name: 'npm token', re: /\bnpm_[A-Za-z0-9]{36}\b/g, severity: 'high' },
  { id: 'pypi-token', name: 'PyPI token', re: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/g, severity: 'high' },
  { id: 'twilio-key', name: 'Twilio API key', re: /\bSK[0-9a-fA-F]{32}\b/g, severity: 'medium' },
  { id: 'sendgrid-key', name: 'SendGrid API key', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, severity: 'high' },
  { id: 'mailgun-key', name: 'Mailgun API key', re: /\bkey-[0-9a-zA-Z]{32}\b/g, severity: 'medium' },
  { id: 'telegram-bot', name: 'Telegram bot token', re: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g, severity: 'high' },
  { id: 'azure-storage', name: 'Azure storage connection string', re: /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{60,}/g, severity: 'high' },
  { id: 'jwt', name: 'JSON Web Token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: 'medium' },
  { id: 'db-url', name: 'Database URL with password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|mssql):\/\/[^:\s/@]+:[^@\s/]{3,}@[^\s'"]+/gi, severity: 'high' },
  { id: 'basic-auth-url', name: 'URL with user and password', re: /\bhttps?:\/\/[^:\s/@]{1,64}:[^@\s/]{3,64}@[^\s'"]+/gi, severity: 'medium' },
  { id: 'generic-secret', name: 'Assigned secret or password', re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*['"]([^'"\s]{8,})['"]/gi, severity: 'low' },
]

export interface SecretHit { rule: SecretRule; file: string; line: number; col: number; match: string; preview: string }

export function maskSecret(s: string): string {
  if (s.length <= 8) return '*'.repeat(s.length)
  return s.slice(0, 4) + '*'.repeat(Math.min(24, s.length - 8)) + s.slice(-4)
}

export function shannonEntropy(s: string): number {
  if (!s) return 0
  const m = new Map<string, number>()
  for (const c of s) m.set(c, (m.get(c) || 0) + 1)
  let e = 0
  for (const v of m.values()) { const p = v / s.length; e -= p * Math.log2(p) }
  return e
}

export function scanSecrets(text: string, file: string, opts: { entropy?: boolean } = {}): SecretHit[] {
  const hits: SecretHit[] = []
  const lineStarts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1)
  const pos = (idx: number) => {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1 }
    return { line: lo + 1, col: idx - lineStarts[lo] + 1, start: lineStarts[lo] }
  }
  const seen = new Set<string>()
  for (const rule of SECRET_RULES) {
    rule.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.re.exec(text))) {
      const val = m[3] ?? m[1] ?? m[0]
      const key = m.index + ':' + val
      if (seen.has(key)) continue
      seen.add(key)
      const p = pos(m.index)
      const end = text.indexOf('\n', p.start)
      const line = text.slice(p.start, end < 0 ? undefined : end)
      hits.push({ rule, file, line: p.line, col: p.col, match: val, preview: line.replace(val, maskSecret(val)).slice(0, 200) })
      if (m[0].length === 0) rule.re.lastIndex++
    }
  }
  if (opts.entropy) {
    const re = /['"=:]\s*['"]?([A-Za-z0-9+/_=-]{32,})/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const v = m[1]
      if (shannonEntropy(v) < 4.3 || hits.some((h) => h.match.includes(v) || v.includes(h.match))) continue
      const p = pos(m.index)
      const end = text.indexOf('\n', p.start)
      hits.push({ rule: { id: 'entropy', name: 'High-entropy string', re, severity: 'low' }, file, line: p.line, col: p.col, match: v, preview: text.slice(p.start, end < 0 ? undefined : end).replace(v, maskSecret(v)).slice(0, 200) })
    }
  }
  return hits.sort((a, b) => a.line - b.line)
}

// ---------------- File carving ----------------
export interface Signature { name: string; ext: string; magic: number[]; offset?: number; footer?: number[]; findEnd?: (b: Uint8Array, start: number) => number | null }

function u32le(b: Uint8Array, i: number) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 }
function u32be(b: Uint8Array, i: number) { return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0 }
function indexOfBytes(b: Uint8Array, pat: number[], from: number, to = b.length): number {
  outer: for (let i = from; i <= to - pat.length; i++) { for (let j = 0; j < pat.length; j++) if (b[i + j] !== pat[j]) continue outer; return i }
  return -1
}

export const SIGNATURES: Signature[] = [
  { name: 'PNG image', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], findEnd: (b, s) => {
    let i = s + 8
    while (i + 12 <= b.length) { const len = u32be(b, i); const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]); i += 12 + len; if (type === 'IEND') return i; if (len > b.length) return null }
    return null } },
  { name: 'JPEG image', ext: 'jpg', magic: [0xff, 0xd8, 0xff], findEnd: (b, s) => {
    let i = s + 2
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null
      const m = b[i + 1]
      if (m === 0xd9) return i + 2
      if (m === 0xda) { // scan data until next marker that is not RST or stuffed
        let j = i + 2 + ((b[i + 2] << 8) | b[i + 3])
        while (j + 1 < b.length) { if (b[j] === 0xff && b[j + 1] !== 0 && !(b[j + 1] >= 0xd0 && b[j + 1] <= 0xd7)) break; j++ }
        i = j; continue
      }
      if (m >= 0xd0 && m <= 0xd8 || m === 0x01) { i += 2; continue }
      i += 2 + ((b[i + 2] << 8) | b[i + 3])
    }
    return null } },
  { name: 'GIF image', ext: 'gif', magic: [0x47, 0x49, 0x46, 0x38], footer: [0x00, 0x3b] },
  { name: 'PDF document', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d], findEnd: (b, s) => {
    let last = -1, i = s
    for (;;) { const k = indexOfBytes(b, [0x25, 0x25, 0x45, 0x4f, 0x46], i); if (k < 0) break; last = k + 5; i = k + 5; const next = indexOfBytes(b, [0x25, 0x50, 0x44, 0x46, 0x2d], i); if (next >= 0 && next < indexOfBytes(b, [0x25, 0x25, 0x45, 0x4f, 0x46], i)) break }
    if (last < 0) return null
    while (last < b.length && (b[last] === 0x0d || b[last] === 0x0a)) last++
    return last } },
  { name: 'ZIP archive (or DOCX, XLSX, APK, JAR)', ext: 'zip', magic: [0x50, 0x4b, 0x03, 0x04], findEnd: (b, s) => {
    const k = indexOfBytes(b, [0x50, 0x4b, 0x05, 0x06], s)
    if (k < 0 || k + 22 > b.length) return null
    return k + 22 + (b[k + 20] | (b[k + 21] << 8)) } },
  { name: 'GZIP data', ext: 'gz', magic: [0x1f, 0x8b, 0x08] },
  { name: '7-Zip archive', ext: '7z', magic: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], findEnd: (b, s) => { const off = Number(BigInt.asUintN(64, (BigInt(u32le(b, s + 16)) << 0n) | (BigInt(u32le(b, s + 20)) << 32n))); const sz = u32le(b, s + 24); const e = s + 32 + off + sz; return e <= b.length && e > s ? e : null } },
  { name: 'RAR archive', ext: 'rar', magic: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { name: 'BMP image', ext: 'bmp', magic: [0x42, 0x4d], findEnd: (b, s) => { const sz = u32le(b, s + 2); const reserved = u32le(b, s + 6); const off = u32le(b, s + 10); return reserved === 0 && off >= 26 && off < sz && sz > 54 && s + sz <= b.length ? s + sz : null } },
  { name: 'WebP image', ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46], findEnd: (b, s) => (b[s + 8] === 0x57 && b[s + 9] === 0x45 && b[s + 10] === 0x42 && b[s + 11] === 0x50 ? Math.min(b.length, s + 8 + u32le(b, s + 4)) : null) },
  { name: 'WAV audio', ext: 'wav', magic: [0x52, 0x49, 0x46, 0x46], findEnd: (b, s) => (b[s + 8] === 0x57 && b[s + 9] === 0x41 && b[s + 10] === 0x56 && b[s + 11] === 0x45 ? Math.min(b.length, s + 8 + u32le(b, s + 4)) : null) },
  { name: 'OGG media', ext: 'ogg', magic: [0x4f, 0x67, 0x67, 0x53, 0x00, 0x02] },
  { name: 'FLAC audio', ext: 'flac', magic: [0x66, 0x4c, 0x61, 0x43] },
  { name: 'MP3 with ID3 tag', ext: 'mp3', magic: [0x49, 0x44, 0x33, 0x03] },
  { name: 'MP4 / MOV video', ext: 'mp4', magic: [0x66, 0x74, 0x79, 0x70], offset: 4, findEnd: (b, s) => {
    let i = s
    while (i + 8 <= b.length) { const sz = u32be(b, i); const t = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]); if (!/^[a-zA-Z0-9 ©]{4}$/.test(t) || sz < 8) break; i += sz }
    return i > s + 8 ? Math.min(i, b.length) : null } },
  { name: 'SQLite database', ext: 'sqlite', magic: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00], findEnd: (b, s) => { let ps = (b[s + 16] << 8) | b[s + 17]; if (ps === 1) ps = 65536; const pages = u32be(b, s + 28); const e = s + ps * pages; return pages && e <= b.length ? e : null } },
  { name: 'ELF executable', ext: 'elf', magic: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'Windows executable (MZ)', ext: 'exe', magic: [0x4d, 0x5a, 0x90, 0x00] },
  { name: 'TIFF image (little endian)', ext: 'tif', magic: [0x49, 0x49, 0x2a, 0x00] },
  { name: 'TIFF image (big endian)', ext: 'tif', magic: [0x4d, 0x4d, 0x00, 0x2a] },
  { name: 'Windows icon', ext: 'ico', magic: [0x00, 0x00, 0x01, 0x00], findEnd: (b, s) => {
    const n = b[s + 4] | (b[s + 5] << 8)
    if (n < 1 || n > 64 || s + 6 + n * 16 > b.length) return null
    let end = 0
    for (let i = 0; i < n; i++) { const e = s + 6 + i * 16; if (b[e + 3] !== 0 || (b[e + 4] | (b[e + 5] << 8)) > 1) return null; const size = u32le(b, e + 8), off = u32le(b, e + 12); if (!size || off < 6 + n * 16 || s + off + size > b.length) return null; end = Math.max(end, s + off + size) }
    return end } },
  { name: 'XZ data', ext: 'xz', magic: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00] },
  { name: 'BZIP2 data', ext: 'bz2', magic: [0x42, 0x5a, 0x68] },
  { name: 'Zstandard data', ext: 'zst', magic: [0x28, 0xb5, 0x2f, 0xfd] },
  { name: 'WOFF2 font', ext: 'woff2', magic: [0x77, 0x4f, 0x46, 0x32], findEnd: (b, s) => { const l = u32be(b, s + 8); return s + l <= b.length && l > 48 ? s + l : null } },
  { name: 'WOFF font', ext: 'woff', magic: [0x77, 0x4f, 0x46, 0x46], findEnd: (b, s) => { const l = u32be(b, s + 8); return s + l <= b.length && l > 44 ? s + l : null } },
  { name: 'OpenPGP armored block', ext: 'asc', magic: [...'-----BEGIN PGP'].map((c) => c.charCodeAt(0)), footer: [...'-----END PGP'].map((c) => c.charCodeAt(0)) },
  { name: 'PEM certificate', ext: 'pem', magic: [...'-----BEGIN CERTIFICATE-----'].map((c) => c.charCodeAt(0)), footer: [...'-----END CERTIFICATE-----'].map((c) => c.charCodeAt(0)) },
]

export interface Carved { sig: Signature; start: number; end: number; exact: boolean }

export function carve(b: Uint8Array, opts: { skipFirst?: boolean; maxHits?: number; maxUnknownSize?: number } = {}): Carved[] {
  const out: Carved[] = []
  const max = opts.maxHits ?? 500
  const cap = opts.maxUnknownSize ?? 16 * 1024 * 1024
  const firstBytes = new Map<number, Signature[]>()
  for (const s of SIGNATURES) { const k = s.magic[0]; if (!firstBytes.has(k)) firstBytes.set(k, []); firstBytes.get(k)!.push(s) }
  for (let i = 0; i < b.length && out.length < max; i++) {
    const cands = firstBytes.get(b[i])
    if (!cands) continue
    for (const sig of cands) {
      const off = sig.offset ?? 0
      const start = i - off
      if (start < 0) continue
      let ok = true
      for (let j = 0; j < sig.magic.length; j++) if (b[i + j] !== sig.magic[j]) { ok = false; break }
      if (!ok) continue
      if (opts.skipFirst && start === 0) continue
      // Skip hits inside a region we already carved exactly (for example a thumbnail JPEG inside a JPEG is still reported, but not ZIP local headers inside a ZIP)
      if (out.some((c) => c.exact && start > c.start && start < c.end && !(c.sig.ext === 'jpg' && sig.ext === 'jpg'))) continue
      let end: number | null = null, exact = false
      if (sig.findEnd) { end = sig.findEnd(b, start); exact = end !== null }
      else if (sig.footer) { const k = indexOfBytes(b, sig.footer, start + sig.magic.length, Math.min(b.length, start + cap)); if (k >= 0) { end = k + sig.footer.length; exact = true } }
      if (sig.findEnd && end === null) { if (sig.ext === 'ico' || sig.ext === 'bmp' || sig.ext === 'webp' || sig.ext === 'wav' || sig.ext === 'mp4' || sig.ext === 'sqlite' || sig.ext === 'woff' || sig.ext === 'woff2') continue }
      if (end === null) end = Math.min(b.length, start + cap)
      if (end <= start) continue
      out.push({ sig, start, end, exact })
      break
    }
  }
  return out
}

// ---------------- Shamir secret sharing over GF(256) ----------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256)
;(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x ^= x << 1; if (x & 0x100) x ^= 0x11b } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] })()
const gmul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0)
const gdiv = (a: number, b: number) => { if (!b) throw new Error('Division by zero'); return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0 }

export function shamirSplit(secret: Uint8Array, n: number, k: number, rand: (len: number) => Uint8Array): Uint8Array[] {
  if (k < 2 || n < k || n > 255) throw new Error('Pick a threshold of at least 2 and no more shares than 255')
  const shares = Array.from({ length: n }, (_, i) => { const s = new Uint8Array(secret.length + 1); s[0] = i + 1; return s })
  for (let byte = 0; byte < secret.length; byte++) {
    const coef = rand(k - 1)
    for (let i = 0; i < n; i++) {
      const x = i + 1
      let y = 0
      for (let c = k - 2; c >= 0; c--) y = gmul(y ^ coef[c], x)
      shares[i][byte + 1] = y ^ secret[byte]
    }
  }
  return shares
}

export function shamirCombine(shares: Uint8Array[]): Uint8Array {
  if (shares.length < 2) throw new Error('Add at least two shares')
  const len = shares[0].length
  if (shares.some((s) => s.length !== len)) throw new Error('These shares come from different secrets (their lengths differ)')
  const xs = shares.map((s) => s[0])
  if (new Set(xs).size !== xs.length) throw new Error('The same share was added twice')
  const out = new Uint8Array(len - 1)
  for (let byte = 1; byte < len; byte++) {
    let acc = 0
    for (let i = 0; i < shares.length; i++) {
      let num = 1, den = 1
      for (let j = 0; j < shares.length; j++) if (i !== j) { num = gmul(num, xs[j]); den = gmul(den, xs[i] ^ xs[j]) }
      acc ^= gmul(shares[i][byte], gdiv(num, den))
    }
    out[byte - 1] = acc
  }
  return out
}

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
export function fromHex(s: string): Uint8Array {
  const h = s.replace(/[^0-9a-f]/gi, '')
  if (h.length % 2) throw new Error('A share must have an even number of hex digits')
  return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16))
}

// ---------------- Dummy files ----------------
export function crc32(b: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) }
  return ~c >>> 0
}

/** A minimal valid file of a type, padded to the target size where the format allows. */
export function minimalFile(kind: 'pdf' | 'png' | 'zip' | 'txt' | 'json' | 'csv' | 'svg' | 'html' | 'bmp' | 'wav', size: number): Uint8Array {
  const enc = new TextEncoder()
  const pad = (base: Uint8Array, fill = 0x20) => { if (base.length >= size) return base; const o = new Uint8Array(size).fill(fill); o.set(base); return o }
  switch (kind) {
    case 'txt': { const line = 'OpenFile test data. The quick brown fox jumps over the lazy dog.\n'; return enc.encode(line.repeat(Math.ceil(Math.max(1, size) / line.length)).slice(0, Math.max(1, size))) }
    case 'csv': { let s = 'id,name,value\n'; let i = 1; while (s.length < size) s += `${i},item ${i},${(i * 3.7).toFixed(2)}\n`, i++; return enc.encode(s) }
    case 'json': { const items: string[] = []; let len = 2, i = 1; while (len < size - 30) { const it = `{"id":${i},"name":"item ${i}"}`; items.push(it); len += it.length + 1; i++ } return enc.encode('[' + items.join(',') + ']') }
    case 'svg': { const head = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#F5A524"/>'; const tail = '</svg>'; const fill = Math.max(0, size - head.length - tail.length - 7); return enc.encode(head + (fill > 0 ? '<!--' + ' '.repeat(fill) + '-->' : '') + tail) }
    case 'html': { const head = '<!doctype html><html><head><meta charset="utf-8"><title>Test</title></head><body><p>OpenFile test page</p>'; const tail = '</body></html>'; const fill = Math.max(0, size - head.length - tail.length - 7); return enc.encode(head + (fill > 0 ? '<!--' + 'x'.repeat(fill) + '-->' : '') + tail) }
    case 'pdf': {
      const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>']
      const text = 'BT /F1 24 Tf 72 700 Td (OpenFile test PDF) Tj ET'
      objs.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
      let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
      const offs: number[] = []
      objs.forEach((o, i) => { offs.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n` })
      // pad with a comment before xref so offsets stay valid
      const xrefLen = 6 + 21 * (objs.length + 1) + 60
      const fill = size - body.length - xrefLen - 40
      if (fill > 4) body += '%' + 'x'.repeat(fill - 2) + '\n'
      const xref = body.length
      body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
      body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
      return Uint8Array.from(body, (c) => c.charCodeAt(0) & 0xff)
    }
    case 'bmp': {
      const side = Math.max(1, Math.floor(Math.sqrt(Math.max(0, size - 54) / 4)))
      const w = side, h = side, data = w * h * 4
      const o = new Uint8Array(54 + data); const dv = new DataView(o.buffer)
      o[0] = 0x42; o[1] = 0x4d; dv.setUint32(2, o.length, true); dv.setUint32(10, 54, true); dv.setUint32(14, 40, true)
      dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 32, true); dv.setUint32(34, data, true)
      for (let i = 0; i < w * h; i++) { const x = i % w, y = Math.floor(i / w); o[54 + i * 4] = (x * 255 / w) | 0; o[55 + i * 4] = 0xa5; o[56 + i * 4] = (y * 255 / h) | 0; o[57 + i * 4] = 255 }
      return o
    }
    case 'wav': {
      const samples = Math.max(1, Math.floor((size - 44) / 2))
      const o = new Uint8Array(44 + samples * 2); const dv = new DataView(o.buffer)
      const w = (s: string, at: number) => [...s].forEach((c, i) => (o[at + i] = c.charCodeAt(0)))
      w('RIFF', 0); dv.setUint32(4, 36 + samples * 2, true); w('WAVE', 8); w('fmt ', 12); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
      dv.setUint32(24, 44100, true); dv.setUint32(28, 88200, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w('data', 36); dv.setUint32(40, samples * 2, true)
      for (let i = 0; i < samples; i++) dv.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / 44100) * 8000), true)
      return o
    }
    case 'png': {
      const chunk = (type: string, data: Uint8Array) => { const o = new Uint8Array(12 + data.length); const dv = new DataView(o.buffer); dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i); o.set(data, 8); dv.setUint32(8 + data.length, crc32(o.subarray(4, 8 + data.length))); return o }
      const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, 1); dv.setUint32(4, 1); ihdr[8] = 8; ihdr[9] = 2
      // zlib stored block with one scanline: filter 0 + RGB
      const raw = Uint8Array.of(0, 0xf5, 0xa5, 0x24)
      const z = new Uint8Array(2 + 5 + raw.length + 4); z[0] = 0x78; z[1] = 0x01; z[2] = 1; z[3] = raw.length; z[4] = 0; z[5] = ~raw.length & 0xff; z[6] = 0xff; z.set(raw, 7)
      let a = 1, bb = 0; for (const x of raw) { a = (a + x) % 65521; bb = (bb + a) % 65521 }
      new DataView(z.buffer).setUint32(7 + raw.length, ((bb << 16) | a) >>> 0)
      const sig = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
      const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', z)]
      const base = parts.reduce((s, p) => s + p.length, 0) + 12
      if (size > base + 12) parts.push(chunk('teXt', new Uint8Array(size - base - 12).map((_, i) => (i === 0 ? 0x43 : i === 1 ? 0 : 0x20))))
      parts.push(chunk('IEND', new Uint8Array(0)))
      const o = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let off = 0; for (const p of parts) { o.set(p, off); off += p.length }
      return o
    }
    case 'zip': {
      const name = enc.encode('readme.txt')
      const dataLen = Math.max(1, size - 22 - 30 - 46 - name.length * 2)
      const data = minimalFile('txt', dataLen)
      const crc = crc32(data)
      const o = new Uint8Array(30 + name.length + data.length + 46 + name.length + 22); const dv = new DataView(o.buffer)
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 10, true); dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true)
      o.set(name, 30); o.set(data, 30 + name.length)
      const cd = 30 + name.length + data.length
      dv.setUint32(cd, 0x02014b50, true); dv.setUint16(cd + 4, 20, true); dv.setUint16(cd + 6, 10, true); dv.setUint32(cd + 16, crc, true); dv.setUint32(cd + 20, data.length, true); dv.setUint32(cd + 24, data.length, true); dv.setUint16(cd + 28, name.length, true)
      o.set(name, cd + 46)
      const end = cd + 46 + name.length
      dv.setUint32(end, 0x06054b50, true); dv.setUint16(end + 8, 1, true); dv.setUint16(end + 10, 1, true); dv.setUint32(end + 12, 46 + name.length, true); dv.setUint32(end + 16, cd, true)
      return o
    }
  }
  return pad(new Uint8Array(0))
}

// ---------------- Text encoding detection ----------------
export const ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'windows-1252', 'iso-8859-1', 'iso-8859-2', 'iso-8859-15', 'windows-1250', 'windows-1251', 'koi8-r', 'windows-1253', 'windows-1254', 'windows-1255', 'windows-1256', 'windows-1257', 'windows-874', 'shift_jis', 'euc-jp', 'iso-2022-jp', 'gbk', 'gb18030', 'big5', 'euc-kr', 'ibm866', 'macintosh'] as const

export function detectBom(b: Uint8Array): string | null {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8'
  if (b[0] === 0xff && b[1] === 0xfe) return 'utf-16le'
  if (b[0] === 0xfe && b[1] === 0xff) return 'utf-16be'
  return null
}

/** Score decoded text: fewer replacement chars, control chars and odd mixes means more likely right. */
export function scoreDecoded(t: string, enc: string): number {
  let bad = 0, letters = 0, ctrl = 0, cjk = 0, cyr = 0, latinExt = 0, greek = 0, arabic = 0, hebrew = 0, thai = 0, kana = 0, hangul = 0, symbols = 0
  for (const ch of t) {
    const c = ch.codePointAt(0)!
    if (c === 0xfffd) bad++
    else if (c < 32 && c !== 9 && c !== 10 && c !== 13) ctrl++
    else if (c >= 0x80 && c < 0xa0) ctrl++
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) letters++
    else if (c >= 0xc0 && c <= 0x24f) latinExt++
    else if (c >= 0x370 && c <= 0x3ff) greek++
    else if (c >= 0x400 && c <= 0x4ff) cyr++
    else if (c >= 0x590 && c <= 0x5ff) hebrew++
    else if (c >= 0x600 && c <= 0x6ff) arabic++
    else if (c >= 0xe00 && c <= 0xe7f) thai++
    else if (c >= 0x3040 && c <= 0x30ff) kana++
    else if (c >= 0xac00 && c <= 0xd7a3) hangul++
    else if (c >= 0x4e00 && c <= 0x9fff) cjk++
    else if ((c >= 0xa1 && c <= 0xbf) || (c >= 0x2500 && c <= 0x25ff)) symbols++
  }
  const n = Math.max(1, [...t].length)
  // A real script tends to be consistent: reward the biggest non-ASCII script group, punish symbol soup.
  const groups = [latinExt, greek, cyr, hebrew, arabic, thai, kana + cjk, hangul, cjk]
  const main = Math.max(...groups)
  const spread = groups.reduce((a, b) => a + b, 0) - main
  let s = 1 - (bad * 20 + ctrl * 5 + symbols * 1.5 + spread * 1.2) / n + (main / n) * 0.3
  // In Latin-script languages accented letters are a minority among plain letters. Words made mostly of them suggest a wrong code page.
  if (latinExt + letters > 0) s -= Math.max(0, latinExt / (latinExt + letters) - 0.25) * 2
  // Words that mix plain Latin letters with another script are almost always a wrong guess.
  const ws = t.match(/[^\s\d.,;:!?()"'-]+/gu) || []
  const mixed = ws.filter((w) => /[A-Za-z\u00C0-\u024F]/.test(w) && /[\u0370-\u03FF\u0400-\u04FF\u0590-\u06FF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]/.test(w)).length
  if (ws.length) s -= (mixed / ws.length) * 3
  if (enc === 'utf-8' && bad === 0) s += 0.5
  if (enc.startsWith('utf-16')) { const nul = (t.match(/\u0000/g) || []).length; s -= nul / n * 10 }
  return s
}

export function detectEncoding(b: Uint8Array, candidates: readonly string[] = ENCODINGS): { encoding: string; confidence: number; ranked: { encoding: string; score: number }[] } {
  const bom = detectBom(b)
  if (bom) return { encoding: bom, confidence: 1, ranked: [{ encoding: bom, score: 1 }] }
  const sample = b.subarray(0, 256 * 1024)
  // ASCII only
  if (sample.every((x) => x < 0x80 && x !== 0)) return { encoding: 'utf-8', confidence: 0.99, ranked: [{ encoding: 'utf-8', score: 1 }] }
  try { new TextDecoder('utf-8', { fatal: true }).decode(sample.length === b.length ? sample : sample.subarray(0, sample.length - 4)); return { encoding: 'utf-8', confidence: 0.98, ranked: [{ encoding: 'utf-8', score: 1 }] } } catch { /* not utf-8 */ }
  // UTF-16 without BOM: many zero bytes at odd or even positions
  let evenZero = 0, oddZero = 0
  for (let i = 0; i < Math.min(sample.length, 4096); i++) if (sample[i] === 0) (i % 2 ? oddZero++ : evenZero++)
  const half = Math.min(sample.length, 4096) / 2
  if (oddZero > half * 0.3 && evenZero < half * 0.05) return { encoding: 'utf-16le', confidence: 0.9, ranked: [{ encoding: 'utf-16le', score: 1 }] }
  if (evenZero > half * 0.3 && oddZero < half * 0.05) return { encoding: 'utf-16be', confidence: 0.9, ranked: [{ encoding: 'utf-16be', score: 1 }] }
  const ranked: { encoding: string; score: number }[] = []
  for (const enc of candidates) {
    if (enc === 'utf-8' || enc.startsWith('utf-16')) continue
    try { ranked.push({ encoding: enc, score: scoreDecoded(new TextDecoder(enc).decode(sample), enc) }) } catch { /* not supported here */ }
  }
  ranked.sort((a, b2) => b2.score - a.score)
  const top = ranked[0]
  const second = ranked[1]
  const confidence = top ? Math.max(0.2, Math.min(0.95, 0.5 + (top.score - (second?.score ?? 0)) * 2)) : 0
  return { encoding: top?.encoding ?? 'windows-1252', confidence, ranked }
}

/** Repair classic mojibake: UTF-8 bytes that were read as Windows-1252 or Latin-1. */
export function fixMojibake(t: string): string {
  const cp1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f }
  let cur = t
  for (let pass = 0; pass < 3; pass++) {
    const bytes: number[] = []
    let ok = true
    for (const ch of cur) { const c = ch.codePointAt(0)!; if (c < 256) bytes.push(c); else if (cp1252[c] !== undefined) bytes.push(cp1252[c]); else { ok = false; break } }
    if (!ok) break
    try {
      const next = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
      if (next === cur) break
      cur = next
    } catch { break }
  }
  return cur
}

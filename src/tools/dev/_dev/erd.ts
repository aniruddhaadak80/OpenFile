/** ERD Studio model: types, sample, SQL import, exporters (SQL/Prisma/Drizzle), auto-layout. */
export interface Col { id: string; name: string; type: string; pk?: boolean; nullable?: boolean; unique?: boolean; def?: string }
export interface Table { id: string; name: string; x: number; y: number; color: string; cols: Col[]; note?: string }
export type Kind = '1:1' | '1:N' | 'N:M'
/** from = referencing side (FK / "many" side), to = referenced side (usually the PK) */
export interface Rel { id: string; from: { t: string; c: string }; to: { t: string; c: string }; kind: Kind; onDelete?: string }
export interface Model { tables: Table[]; rels: Rel[] }

export const COLORS = ['#f5a524', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#f97316', '#3b82f6', '#14b8a6', '#84cc16', '#64748b']
export const TYPES = ['serial', 'bigserial', 'int', 'bigint', 'smallint', 'uuid', 'varchar(255)', 'text', 'char(10)', 'boolean', 'date', 'time', 'timestamp', 'timestamptz', 'decimal(10,2)', 'numeric', 'real', 'double precision', 'json', 'jsonb', 'bytea', 'enum']
let n = 0
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`

export const ROW = 26, HEAD = 34, MINW = 200
export const tableWidth = (t: Table) => Math.max(MINW, Math.max(t.name.length * 9 + 50, ...t.cols.map((c) => (c.name.length + c.type.length) * 7.4 + 76)))
export const tableHeight = (t: Table) => HEAD + Math.max(1, t.cols.length) * ROW + 6

export function sample(): Model {
  const c = (name: string, type: string, o: Partial<Col> = {}): Col => ({ id: uid('c'), name, type, ...o })
  const users: Table = { id: uid('t'), name: 'users', x: 60, y: 80, color: COLORS[0], cols: [c('id', 'serial', { pk: true }), c('email', 'varchar(255)', { unique: true }), c('name', 'varchar(120)'), c('avatar_url', 'text', { nullable: true }), c('created_at', 'timestamptz', { def: 'now()' })] }
  const profiles: Table = { id: uid('t'), name: 'profiles', x: 60, y: 330, color: COLORS[6], cols: [c('id', 'serial', { pk: true }), c('user_id', 'int', { unique: true }), c('bio', 'text', { nullable: true }), c('website', 'varchar(255)', { nullable: true })] }
  const posts: Table = { id: uid('t'), name: 'posts', x: 400, y: 60, color: COLORS[1], cols: [c('id', 'serial', { pk: true }), c('author_id', 'int'), c('title', 'varchar(200)'), c('body', 'text'), c('published', 'boolean', { def: 'false' }), c('published_at', 'timestamptz', { nullable: true })] }
  const comments: Table = { id: uid('t'), name: 'comments', x: 740, y: 40, color: COLORS[3], cols: [c('id', 'bigserial', { pk: true }), c('post_id', 'int'), c('user_id', 'int'), c('content', 'text'), c('created_at', 'timestamptz', { def: 'now()' })] }
  const tags: Table = { id: uid('t'), name: 'tags', x: 740, y: 320, color: COLORS[2], cols: [c('id', 'serial', { pk: true }), c('name', 'varchar(50)', { unique: true })] }
  const pk = (t: Table) => t.cols[0].id, col = (t: Table, nm: string) => t.cols.find((x) => x.name === nm)!.id
  return {
    tables: [users, profiles, posts, comments, tags],
    rels: [
      { id: uid('r'), from: { t: profiles.id, c: col(profiles, 'user_id') }, to: { t: users.id, c: pk(users) }, kind: '1:1', onDelete: 'CASCADE' },
      { id: uid('r'), from: { t: posts.id, c: col(posts, 'author_id') }, to: { t: users.id, c: pk(users) }, kind: '1:N', onDelete: 'CASCADE' },
      { id: uid('r'), from: { t: comments.id, c: col(comments, 'post_id') }, to: { t: posts.id, c: pk(posts) }, kind: '1:N', onDelete: 'CASCADE' },
      { id: uid('r'), from: { t: comments.id, c: col(comments, 'user_id') }, to: { t: users.id, c: pk(users) }, kind: '1:N' },
      { id: uid('r'), from: { t: posts.id, c: pk(posts) }, to: { t: tags.id, c: pk(tags) }, kind: 'N:M' },
    ],
  }
}

// ---------------- SQL import ----------------
const unq = (s: string) => s.trim().replace(/^[`"[]|[`"\]]$/g, '').split('.').pop()!.replace(/^[`"[]|[`"\]]$/g, '')
function splitTop(s: string, sep = ','): string[] {
  const out: string[] = []; let depth = 0, cur = '', q: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { cur += ch; if (ch === q) q = null; continue }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; cur += ch; continue }
    if (ch === '(') depth++; if (ch === ')') depth--
    if (ch === sep && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map((x) => x.trim()).filter(Boolean)
}
const idList = (s: string) => s.replace(/^\(|\)$/g, '').split(',').map(unq)

export function importSql(sqlRaw: string): Model {
  const sql = sqlRaw.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const tables: Table[] = []; const pending: { ft: string; fc: string; tt: string; tc: string; onDelete?: string }[] = []
  const reTable = /create\s+(?:or\s+replace\s+)?(?:temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?([`"[\]\w.]+)\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = reTable.exec(sql))) {
    // find matching paren
    let depth = 1, i = reTable.lastIndex, q: string | null = null
    for (; i < sql.length && depth > 0; i++) { const ch = sql[i]; if (q) { if (ch === q) q = null; continue } if (ch === "'" || ch === '"' || ch === '`') q = ch; else if (ch === '(') depth++; else if (ch === ')') depth-- }
    const body = sql.slice(reTable.lastIndex, i - 1)
    const tname = unq(m[1])
    const t: Table = { id: uid('t'), name: tname, x: 0, y: 0, color: COLORS[tables.length % COLORS.length], cols: [] }
    for (const def of splitTop(body)) {
      const d = def.trim()
      let mm: RegExpExecArray | null
      if ((mm = /^(?:constraint\s+\S+\s+)?primary\s+key\s*(\([^)]*\))/i.exec(d))) { idList(mm[1]).forEach((cn) => { const c = t.cols.find((x) => x.name === cn); if (c) { c.pk = true; c.nullable = false } }); continue }
      if ((mm = /^(?:constraint\s+\S+\s+)?foreign\s+key\s*(\([^)]*\))\s*references\s+([`"[\]\w.]+)\s*(\([^)]*\))?(.*)$/i.exec(d))) { const fc = idList(mm[1]), tc = mm[3] ? idList(mm[3]) : ['id']; fc.forEach((c, k) => pending.push({ ft: tname, fc: c, tt: unq(mm![2]), tc: tc[k] ?? tc[0], onDelete: /on\s+delete\s+(cascade|set\s+null|restrict|no\s+action)/i.exec(mm![4])?.[1]?.toUpperCase() })); continue }
      if ((mm = /^(?:constraint\s+\S+\s+)?unique\s*(?:key|index)?\s*\S*\s*(\([^)]*\))/i.exec(d))) { const ids = idList(mm[1]); if (ids.length === 1) { const c = t.cols.find((x) => x.name === ids[0]); if (c) c.unique = true } continue }
      if (/^(key|index|check|constraint|fulltext|spatial|exclude)\b/i.test(d)) continue
      const cm = /^([`"[\]\w]+)\s+(.+)$/s.exec(d); if (!cm) continue
      const name = unq(cm[1]); const rest = cm[2]
      const tm = /^([a-z_][\w ]*?(?:\s*\([^)]*\))?(?:\s*\[\])?)(?=\s+(?:not|null|primary|unique|default|references|auto_increment|autoincrement|generated|check|constraint|collate|comment|on|unsigned|identity)\b|\s*$)/i.exec(rest)
      let type = (tm ? tm[1] : rest.split(/\s+/)[0]).trim().toLowerCase().replace(/\s+/g, ' ')
      const after = rest.slice(tm ? tm[1].length : type.length)
      const c: Col = { id: uid('c'), name, type, nullable: !/not\s+null/i.test(after) && !/primary\s+key/i.test(after) }
      if (/primary\s+key/i.test(after)) c.pk = true
      if (/\bunique\b/i.test(after)) c.unique = true
      if (/auto_increment|autoincrement|generated\s+(always|by\s+default)\s+as\s+identity/i.test(after)) c.type = /big/.test(type) ? 'bigserial' : 'serial'
      if (/unsigned/i.test(after) && !/serial/.test(c.type)) c.type += ' unsigned'
      const dm = /default\s+('(?:[^']|'')*'|\([^)]*\)|[\w.:()-]+(?:\(\))?)/i.exec(after); if (dm) c.def = dm[1]
      if (c.pk) c.nullable = false
      if (!c.nullable) delete c.nullable
      const rm = /references\s+([`"[\]\w.]+)\s*(\(\s*([`"[\]\w]+)\s*\))?/i.exec(after)
      if (rm) pending.push({ ft: tname, fc: name, tt: unq(rm[1]), tc: rm[3] ? unq(rm[3]) : 'id', onDelete: /on\s+delete\s+(cascade|set\s+null|restrict|no\s+action)/i.exec(after)?.[1]?.toUpperCase() })
      t.cols.push(c)
    }
    tables.push(t)
    reTable.lastIndex = i
  }
  const reAlter = /alter\s+table\s+(?:only\s+)?([`"[\]\w.]+)\s+add\s+(?:constraint\s+\S+\s+)?foreign\s+key\s*(\([^)]*\))\s*references\s+([`"[\]\w.]+)\s*(\([^)]*\))([^;]*)/gi
  while ((m = reAlter.exec(sql))) { const fc = idList(m[2]), tc = idList(m[4]); fc.forEach((c, k) => pending.push({ ft: unq(m![1]), fc: c, tt: unq(m![3]), tc: tc[k] ?? tc[0], onDelete: /on\s+delete\s+(cascade|set\s+null|restrict|no\s+action)/i.exec(m![5])?.[1]?.toUpperCase() })) }
  if (!tables.length) throw new Error('No CREATE TABLE statements found.')
  const rels: Rel[] = []
  for (const p of pending) {
    const ft = tables.find((t) => t.name.toLowerCase() === p.ft.toLowerCase()), tt = tables.find((t) => t.name.toLowerCase() === p.tt.toLowerCase())
    const fc = ft?.cols.find((c) => c.name.toLowerCase() === p.fc.toLowerCase()), tc = tt?.cols.find((c) => c.name.toLowerCase() === p.tc.toLowerCase()) ?? tt?.cols.find((c) => c.pk)
    if (ft && tt && fc && tc) rels.push({ id: uid('r'), from: { t: ft.id, c: fc.id }, to: { t: tt.id, c: tc.id }, kind: fc.unique || (fc.pk && ft.cols.filter((x) => x.pk).length === 1) ? '1:1' : '1:N', onDelete: p.onDelete })
  }
  return autoLayout({ tables, rels })
}

// ---------------- layout ----------------
export function autoLayout(m: Model): Model {
  const level = new Map<string, number>()
  const refs = (id: string) => m.rels.filter((r) => r.from.t === id && r.to.t !== id && r.kind !== 'N:M').map((r) => r.to.t)
  const lv = (id: string, seen = new Set<string>()): number => {
    if (level.has(id)) return level.get(id)!
    if (seen.has(id)) return 0
    seen.add(id)
    const r = refs(id); const v = r.length ? 1 + Math.max(...r.map((x) => lv(x, seen))) : 0
    level.set(id, v); return v
  }
  m.tables.forEach((t) => lv(t.id))
  const cols = new Map<number, Table[]>()
  m.tables.forEach((t) => { const l = level.get(t.id) ?? 0; cols.set(l, [...(cols.get(l) ?? []), t]) })
  let x = 60
  const tables = m.tables.map((t) => ({ ...t }))
  const byId = new Map(tables.map((t) => [t.id, t]))
  ;[...cols.keys()].sort((a, b) => a - b).forEach((l) => {
    const list = cols.get(l)!.map((t) => byId.get(t.id)!)
    let y = 60; let w = 0
    for (const t of list) { t.x = x; t.y = y; y += tableHeight(t) + 50; w = Math.max(w, tableWidth(t)) }
    x += w + 110
  })
  return { tables, rels: m.rels }
}

// ---------------- exporters ----------------
const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase()
const camel = (s: string) => s.replace(/[_\s-]+(\w)/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, (c) => c.toLowerCase())
const pascal = (s: string) => { const c = camel(s); return c[0]?.toUpperCase() + c.slice(1) }
const singular = (s: string) => s.replace(/ies$/, 'y').replace(/(ss|us)$/, '$1').replace(/([^s])s$/, '$1')

function junctions(m: Model) {
  return m.rels.filter((r) => r.kind === 'N:M').map((r) => {
    const a = m.tables.find((t) => t.id === r.from.t)!, b = m.tables.find((t) => t.id === r.to.t)!
    const apk = a.cols.find((c) => c.pk) ?? a.cols[0], bpk = b.cols.find((c) => c.pk) ?? b.cols[0]
    const baseType = (t: string) => t.replace(/^bigserial$/, 'bigint').replace(/^serial$/, 'int')
    return { name: `${snake(singular(a.name))}_${snake(b.name)}`, a, b, apk, bpk, ac: `${snake(singular(a.name))}_${apk.name}`, bc: `${snake(singular(b.name))}_${bpk.name}`, at: baseType(apk.type), bt: baseType(bpk.type) }
  }).filter((j) => j.a && j.b)
}

function mysqlType(t: string) {
  const s = t.toLowerCase()
  if (s === 'serial') return 'INT AUTO_INCREMENT'; if (s === 'bigserial') return 'BIGINT AUTO_INCREMENT'
  if (s === 'uuid') return 'CHAR(36)'; if (s === 'timestamptz') return 'TIMESTAMP'; if (s === 'jsonb') return 'JSON'; if (s === 'bytea') return 'BLOB'
  if (s === 'boolean') return 'TINYINT(1)'; if (s === 'double precision') return 'DOUBLE'; if (s === 'text[]') return 'JSON'
  if (s === 'enum') return "ENUM('a','b')"
  return t.toUpperCase()
}
function pgType(t: string) { const s = t.toLowerCase(); if (s === 'int unsigned') return 'INTEGER'; if (s === 'tinyint(1)') return 'BOOLEAN'; if (s === 'datetime') return 'TIMESTAMP'; if (s === 'enum') return 'TEXT'; if (/^int\b/.test(s)) return s.replace(/^int/, 'INTEGER').toUpperCase(); return t.toUpperCase() }

export function toSql(m: Model, dialect: 'postgres' | 'mysql'): string {
  const Q = (s: string) => (dialect === 'mysql' ? `\`${s}\`` : `"${s}"`)
  const T = dialect === 'mysql' ? mysqlType : pgType
  const out: string[] = [`-- Generated by OpenFile ERD Studio (${dialect === 'mysql' ? 'MySQL' : 'PostgreSQL'})`, '']
  for (const t of m.tables) {
    const pks = t.cols.filter((c) => c.pk)
    const lines = t.cols.map((c) => {
      let l = `  ${Q(c.name)} ${T(c.type)}`
      if (c.pk && pks.length === 1) l += ' PRIMARY KEY'
      else if (!c.nullable) l += ' NOT NULL'
      if (c.unique && !c.pk) l += ' UNIQUE'
      if (c.def) l += ` DEFAULT ${dialect === 'mysql' && c.def === 'now()' ? 'CURRENT_TIMESTAMP' : c.def}`
      return l
    })
    if (pks.length > 1) lines.push(`  PRIMARY KEY (${pks.map((c) => Q(c.name)).join(', ')})`)
    out.push(`CREATE TABLE ${Q(t.name)} (\n${lines.join(',\n')}\n)${dialect === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : ''};`, '')
  }
  for (const j of junctions(m)) {
    out.push(`CREATE TABLE ${Q(j.name)} (\n  ${Q(j.ac)} ${T(j.at)} NOT NULL,\n  ${Q(j.bc)} ${T(j.bt)} NOT NULL,\n  PRIMARY KEY (${Q(j.ac)}, ${Q(j.bc)}),\n  FOREIGN KEY (${Q(j.ac)}) REFERENCES ${Q(j.a.name)} (${Q(j.apk.name)}) ON DELETE CASCADE,\n  FOREIGN KEY (${Q(j.bc)}) REFERENCES ${Q(j.b.name)} (${Q(j.bpk.name)}) ON DELETE CASCADE\n)${dialect === 'mysql' ? ' ENGINE=InnoDB' : ''};`, '')
  }
  for (const r of m.rels.filter((r) => r.kind !== 'N:M')) {
    const ft = m.tables.find((t) => t.id === r.from.t), tt = m.tables.find((t) => t.id === r.to.t)
    const fc = ft?.cols.find((c) => c.id === r.from.c), tc = tt?.cols.find((c) => c.id === r.to.c)
    if (!ft || !tt || !fc || !tc) continue
    out.push(`ALTER TABLE ${Q(ft.name)} ADD CONSTRAINT ${Q(`fk_${ft.name}_${fc.name}`)} FOREIGN KEY (${Q(fc.name)}) REFERENCES ${Q(tt.name)} (${Q(tc.name)})${r.onDelete ? ` ON DELETE ${r.onDelete}` : ''};`)
    if (r.kind === '1:1' && !fc.unique && !fc.pk) out.push(`ALTER TABLE ${Q(ft.name)} ADD CONSTRAINT ${Q(`uq_${ft.name}_${fc.name}`)} UNIQUE (${Q(fc.name)});`)
  }
  return out.join('\n').trim() + '\n'
}

function prismaType(c: Col): { t: string; attrs: string[] } {
  const s = c.type.toLowerCase(); const attrs: string[] = []
  let t = 'String'
  if (s === 'serial' || s === 'bigserial') { t = s === 'bigserial' ? 'BigInt' : 'Int'; attrs.push('@default(autoincrement())') }
  else if (/^(int|integer|smallint|tinyint(?!\(1\)))/.test(s)) t = 'Int'
  else if (/^bigint/.test(s)) t = 'BigInt'
  else if (/^(boolean|bool|tinyint\(1\))/.test(s)) t = 'Boolean'
  else if (/^(timestamp|timestamptz|datetime|date|time)/.test(s)) t = 'DateTime'
  else if (/^(decimal|numeric|money)/.test(s)) t = 'Decimal'
  else if (/^(real|float|double)/.test(s)) t = 'Float'
  else if (/^jsonb?/.test(s)) t = 'Json'
  else if (/^(bytea|blob|binary)/.test(s)) t = 'Bytes'
  else if (s === 'uuid') { t = 'String'; attrs.push('@db.Uuid') }
  const vm = /^varchar\((\d+)\)/.exec(s); if (vm) attrs.push(`@db.VarChar(${vm[1]})`)
  if (c.def && !attrs.some((a) => a.startsWith('@default'))) {
    const d = c.def.toLowerCase()
    attrs.push(d === 'now()' || d === 'current_timestamp' ? '@default(now())' : /gen_random_uuid|uuid_generate/.test(d) ? '@default(uuid())' : /^'.*'$/.test(c.def) ? `@default("${c.def.slice(1, -1)}")` : `@default(${c.def})`)
  }
  return { t, attrs }
}

export function toPrisma(m: Model): string {
  const name = (t: Table) => pascal(singular(t.name))
  const out = ['// Generated by OpenFile ERD Studio', 'generator client {', '  provider = "prisma-client-js"', '}', '', 'datasource db {', '  provider = "postgresql"', '  url      = env("DATABASE_URL")', '}', '']
  const pairCount = new Map<string, number>()
  m.rels.forEach((r) => { const k = [r.from.t, r.to.t].sort().join(); pairCount.set(k, (pairCount.get(k) ?? 0) + 1) })
  for (const t of m.tables) {
    const lines: string[][] = []
    const pks = t.cols.filter((c) => c.pk)
    for (const c of t.cols) {
      const { t: ty, attrs } = prismaType(c)
      if (c.pk && pks.length === 1) attrs.unshift('@id')
      if (c.unique && !c.pk) attrs.push('@unique')
      const field = camel(c.name)
      if (field !== c.name) attrs.push(`@map("${c.name}")`)
      lines.push([field, ty + (c.nullable && !c.pk ? '?' : ''), ...attrs])
    }
    for (const r of m.rels) {
      const other = (id: string) => m.tables.find((x) => x.id === id)!
      const multi = (pairCount.get([r.from.t, r.to.t].sort().join()) ?? 0) > 1
      const relName = multi ? `"${t.name}_${r.id.slice(-4)}"` : ''
      if (r.kind === 'N:M') {
        if (r.from.t === t.id) lines.push([camel(other(r.to.t).name), `${name(other(r.to.t))}[]`, ...(multi ? [`@relation("${r.id}")`] : [])])
        if (r.to.t === t.id && r.from.t !== r.to.t) lines.push([camel(other(r.from.t).name), `${name(other(r.from.t))}[]`, ...(multi ? [`@relation("${r.id}")`] : [])])
        continue
      }
      void relName
      const rn = multi ? `"${r.id}", ` : ''
      if (r.from.t === t.id) {
        const ref = other(r.to.t); const fc = t.cols.find((c) => c.id === r.from.c); const tc = ref.cols.find((c) => c.id === r.to.c)
        if (!fc || !tc) continue
        const fname = camel(fc.name.replace(/_?id$/i, '')) || camel(singular(ref.name))
        lines.push([fname === camel(fc.name) ? fname + 'Rel' : fname, name(ref) + (fc.nullable ? '?' : ''), `@relation(${rn}fields: [${camel(fc.name)}], references: [${camel(tc.name)}]${r.onDelete ? `, onDelete: ${({ CASCADE: 'Cascade', 'SET NULL': 'SetNull', RESTRICT: 'Restrict', 'NO ACTION': 'NoAction' } as Record<string, string>)[r.onDelete] ?? 'NoAction'}` : ''})`])
      }
      if (r.to.t === t.id) {
        const src = other(r.from.t)
        lines.push([r.kind === '1:1' ? camel(singular(src.name)) : camel(src.name) + (multi ? r.id.slice(-3) : ''), r.kind === '1:1' ? `${name(src)}?` : `${name(src)}[]`, ...(multi ? [`@relation("${r.id}")`] : [])])
      }
    }
    const w0 = Math.max(...lines.map((l) => l[0].length)), w1 = Math.max(...lines.map((l) => l[1].length))
    out.push(`model ${name(t)} {`, ...lines.map((l) => `  ${l[0].padEnd(w0)} ${l[1].padEnd(w1)} ${l.slice(2).join(' ')}`.trimEnd()))
    if (pks.length > 1) out.push(`\n  @@id([${pks.map((c) => camel(c.name)).join(', ')}])`)
    if (name(t).toLowerCase() !== t.name.toLowerCase() || /[A-Z_]/.test(t.name)) out.push(`  @@map("${t.name}")`)
    out.push('}', '')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

function drizzleCol(c: Col): string {
  const s = c.type.toLowerCase(); const n = `'${c.name}'`
  let e: string
  const vm = /^(?:varchar|character varying)\((\d+)\)/.exec(s), cm = /^char\((\d+)\)/.exec(s), dm = /^(?:decimal|numeric)\((\d+),\s*(\d+)\)/.exec(s)
  if (s === 'serial') e = `serial(${n})`; else if (s === 'bigserial') e = `bigserial(${n}, { mode: 'number' })`
  else if (/^(int|integer)/.test(s)) e = `integer(${n})`; else if (/^bigint/.test(s)) e = `bigint(${n}, { mode: 'number' })`; else if (/^smallint/.test(s)) e = `smallint(${n})`
  else if (vm) e = `varchar(${n}, { length: ${vm[1]} })`; else if (cm) e = `char(${n}, { length: ${cm[1]} })`; else if (/^varchar/.test(s)) e = `varchar(${n})`
  else if (/^(boolean|bool)/.test(s)) e = `boolean(${n})`; else if (s === 'timestamptz') e = `timestamp(${n}, { withTimezone: true })`; else if (/^(timestamp|datetime)/.test(s)) e = `timestamp(${n})`
  else if (s === 'date') e = `date(${n})`; else if (s === 'time') e = `time(${n})`; else if (dm) e = `numeric(${n}, { precision: ${dm[1]}, scale: ${dm[2]} })`; else if (/^(decimal|numeric)/.test(s)) e = `numeric(${n})`
  else if (s === 'real') e = `real(${n})`; else if (/^double/.test(s)) e = `doublePrecision(${n})`; else if (s === 'jsonb') e = `jsonb(${n})`; else if (s === 'json') e = `json(${n})`
  else if (s === 'uuid') e = `uuid(${n})`; else e = `text(${n})`
  return e
}
export function toDrizzle(m: Model): string {
  const v = (t: Table) => camel(t.name)
  const used = new Set<string>()
  const body: string[] = []
  for (const t of m.tables) {
    const pks = t.cols.filter((c) => c.pk)
    const lines = t.cols.map((c) => {
      let e = drizzleCol(c); used.add(e.split('(')[0])
      if (c.pk && pks.length === 1) e += '.primaryKey()'
      if (!c.nullable && !c.pk) e += '.notNull()'
      if (c.unique && !c.pk) e += '.unique()'
      if (c.def) { const d = c.def.toLowerCase(); e += d === 'now()' || d === 'current_timestamp' ? '.defaultNow()' : /gen_random_uuid/.test(d) ? '.defaultRandom()' : `.default(${/^'.*'$/.test(c.def) ? c.def : /^(true|false|-?\d+(\.\d+)?)$/.test(d) ? d : `sql\`${c.def}\``})` }
      const r = m.rels.find((r) => r.kind !== 'N:M' && r.from.t === t.id && r.from.c === c.id)
      if (r) { const tt = m.tables.find((x) => x.id === r.to.t); const tc = tt?.cols.find((x) => x.id === r.to.c); if (tt && tc) e += `.references(() => ${v(tt)}.${camel(tc.name)}${r.onDelete ? `, { onDelete: '${r.onDelete.toLowerCase()}' }` : ''})` }
      return `  ${camel(c.name)}: ${e},`
    })
    const extra = pks.length > 1 ? `, (t) => [primaryKey({ columns: [${pks.map((c) => `t.${camel(c.name)}`).join(', ')}] })]` : ''
    if (extra) used.add('primaryKey')
    body.push(`export const ${v(t)} = pgTable('${t.name}', {\n${lines.join('\n')}\n}${extra})`, '')
  }
  for (const j of junctions(m)) {
    used.add('integer'); used.add('primaryKey')
    const ty = (x: string) => (/big/.test(x) ? "bigint('$', { mode: 'number' })" : x === 'uuid' ? "uuid('$')" : "integer('$')")
    if (/big/.test(j.at + j.bt)) used.add('bigint'); if ((j.at + j.bt).includes('uuid')) used.add('uuid')
    body.push(`export const ${camel(j.name)} = pgTable('${j.name}', {\n  ${camel(j.ac)}: ${ty(j.at).replace('$', j.ac)}.notNull().references(() => ${v(j.a)}.${camel(j.apk.name)}, { onDelete: 'cascade' }),\n  ${camel(j.bc)}: ${ty(j.bt).replace('$', j.bc)}.notNull().references(() => ${v(j.b)}.${camel(j.bpk.name)}, { onDelete: 'cascade' }),\n}, (t) => [primaryKey({ columns: [t.${camel(j.ac)}, t.${camel(j.bc)}] })])`, '')
  }
  const needsSql = body.some((b) => b.includes('sql`'))
  return `// Generated by OpenFile ERD Studio, drizzle-orm (PostgreSQL)\nimport { pgTable, ${[...used].sort().join(', ')} } from 'drizzle-orm/pg-core'\n${needsSql ? "import { sql } from 'drizzle-orm'\n" : ''}\n${body.join('\n').trim()}\n`
}

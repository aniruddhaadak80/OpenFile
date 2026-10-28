/** cURL command parser + code generators. */
export interface FormPart { name: string; value: string; file?: boolean; type?: string }
export interface Req {
  method: string; url: string; headers: [string, string][]; body: string | null; bodyKind: 'none' | 'raw' | 'json' | 'urlencoded' | 'multipart'
  form: FormPart[]; auth: { user: string; pass: string } | null; insecure: boolean; compressed: boolean; follow: boolean; timeout: number | null; warnings: string[]
}

export function tokenize(cmd: string): string[] {
  const s = cmd.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ').replace(/`\r?\n/g, ' ')
  const out: string[] = []; let cur = '', has = false, i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false } i++; continue }
    has = true
    if (c === "'") { const e = s.indexOf("'", i + 1); if (e < 0) throw new Error('Unclosed single quote'); cur += s.slice(i + 1, e); i = e + 1; continue }
    if (c === '$' && s[i + 1] === "'") {
      i += 2
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\') { const n = s[i + 1]; const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0' }; if (n === 'x') { cur += String.fromCharCode(parseInt(s.slice(i + 2, i + 4), 16)); i += 4; continue } cur += map[n] ?? n; i += 2 } else cur += s[i++]
      }
      i++; continue
    }
    if (c === '"') {
      i++
      while (i < s.length && s[i] !== '"') { if (s[i] === '\\' && '"\\$`\n'.includes(s[i + 1])) { cur += s[i + 1]; i += 2 } else cur += s[i++] }
      if (i >= s.length) throw new Error('Unclosed double quote'); i++; continue
    }
    if (c === '\\') { cur += s[i + 1] ?? ''; i += 2; continue }
    cur += c; i++
  }
  if (has) out.push(cur)
  return out
}

const WITH_ARG = new Set(['-X', '-H', '-d', '-u', '-F', '-b', '-A', '-e', '-o', '-m', '-x', '-T', '-c', '-w', '-r', '-E', '-U'])
export function parseCurl(cmd: string): Req {
  const t = tokenize(cmd.trim())
  if (!t.length || !/^curl(\.exe)?$/.test(t[0])) throw new Error('Command must start with "curl"')
  const r: Req = { method: '', url: '', headers: [], body: null, bodyKind: 'none', form: [], auth: null, insecure: false, compressed: false, follow: false, timeout: null, warnings: [] }
  const data: string[] = []; let get = false, head = false, json = false, dataUrlenc = false
  const args: [string, string | null][] = []
  for (let i = 1; i < t.length; i++) {
    let a = t[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq > 0 && /^--[\w-]+=/.test(a)) { args.push([a.slice(0, eq), a.slice(eq + 1)]); continue }
      const needs = ['--request', '--header', '--data', '--data-raw', '--data-ascii', '--data-binary', '--data-urlencode', '--json', '--user', '--form', '--form-string', '--cookie', '--user-agent', '--referer', '--url', '--output', '--max-time', '--connect-timeout', '--proxy', '--upload-file', '--cookie-jar', '--write-out', '--oauth2-bearer', '--retry', '--cert', '--key', '--cacert', '--resolve'].includes(a)
      args.push([a, needs ? t[++i] ?? '' : null]); continue
    }
    if (a.startsWith('-') && a.length > 1) {
      // combined short flags: -sSLk or -XPOST / -HValue
      a = a.slice(1)
      for (let k = 0; k < a.length; k++) {
        const f = '-' + a[k]
        if (WITH_ARG.has(f)) { const rest = a.slice(k + 1); args.push([f, rest || (t[++i] ?? '')]); break }
        args.push([f, null])
      }
      continue
    }
    if (!r.url) r.url = a; else r.warnings.push(`Ignored extra argument: ${a}`)
  }
  for (const [k, v] of args) {
    switch (k) {
      case '-X': case '--request': r.method = (v ?? '').toUpperCase(); break
      case '-H': case '--header': { const c = (v ?? '').indexOf(':'); if (c > 0) { const name = v!.slice(0, c).trim(), val = v!.slice(c + 1).trim(); if (val || !v!.trimEnd().endsWith(';')) r.headers.push([name, val]) } break }
      case '-d': case '--data': case '--data-ascii': data.push((v ?? '').replace(/[\r\n]/g, '')); break
      case '--data-raw': case '--data-binary': data.push(v ?? ''); break
      case '--data-urlencode': { dataUrlenc = true; const val = v ?? ''; const eq = val.indexOf('='); data.push(eq >= 0 ? val.slice(0, eq + 1) + encodeURIComponent(val.slice(eq + 1)) : encodeURIComponent(val)); break }
      case '--json': json = true; data.push(v ?? ''); break
      case '-u': case '--user': { const val = v ?? ''; const c = val.indexOf(':'); r.auth = { user: c >= 0 ? val.slice(0, c) : val, pass: c >= 0 ? val.slice(c + 1) : '' }; break }
      case '--oauth2-bearer': r.headers.push(['Authorization', `Bearer ${v}`]); break
      case '-F': case '--form': case '--form-string': {
        const val = v ?? ''; const eq = val.indexOf('='); const name = val.slice(0, eq); let value = val.slice(eq + 1)
        const file = k !== '--form-string' && value.startsWith('@'); let type: string | undefined
        const tm = /;type=([^;]+)/.exec(value); if (tm) { type = tm[1]; value = value.replace(/;type=[^;]+/, '') }
        if (k !== '--form-string' && value.startsWith('<')) value = value.slice(1)
        r.form.push({ name, value: file ? value.slice(1).replace(/;filename=.*$/, '') : value, file, type }); break
      }
      case '-b': case '--cookie': if (v && !v.includes('=')) r.warnings.push('Cookie file reading is not supported; pass cookies inline.'); else r.headers.push(['Cookie', v ?? '']); break
      case '-A': case '--user-agent': r.headers.push(['User-Agent', v ?? '']); break
      case '-e': case '--referer': r.headers.push(['Referer', v ?? '']); break
      case '-k': case '--insecure': r.insecure = true; break
      case '--compressed': r.compressed = true; break
      case '-L': case '--location': r.follow = true; break
      case '-G': case '--get': get = true; break
      case '-I': case '--head': head = true; break
      case '--url': r.url = v ?? ''; break
      case '-m': case '--max-time': r.timeout = Number(v) || null; break
      case '-T': case '--upload-file': r.warnings.push('--upload-file is shown as a raw body placeholder.'); data.push(`<contents of ${v}>`); if (!r.method) r.method = 'PUT'; break
      case '-s': case '--silent': case '-S': case '--show-error': case '-v': case '--verbose': case '-i': case '--include': case '-o': case '--output': case '-f': case '--fail': case '-#': case '--progress-bar': case '-w': case '--write-out': case '-c': case '--cookie-jar': break
      default: r.warnings.push(`Unsupported option ignored: ${k}${v != null ? ' ' + v : ''}`)
    }
  }
  if (!r.url) throw new Error('No URL found in the command')
  if (!/^[a-z]+:\/\//i.test(r.url)) r.url = 'http://' + r.url
  if (get && data.length) { const u = new URL(r.url); const q = data.join('&'); r.url = u.toString() + (u.search ? '&' : '?') + q; data.length = 0 }
  if (data.length) {
    r.body = data.join('&')
    const ct = hdr(r, 'content-type')
    if (json) { if (!ct) r.headers.push(['Content-Type', 'application/json']); if (!hdr(r, 'accept')) r.headers.push(['Accept', 'application/json']); r.bodyKind = 'json' }
    else if (ct?.includes('json') || (!ct && /^\s*[[{]/.test(r.body) && isJson(r.body))) { r.bodyKind = 'json'; if (!ct) r.headers.push(['Content-Type', 'application/json']) }
    else { r.bodyKind = ct && !ct.includes('x-www-form-urlencoded') ? 'raw' : 'urlencoded'; if (!ct) r.headers.push(['Content-Type', 'application/x-www-form-urlencoded']) }
    void dataUrlenc
  }
  if (r.form.length) r.bodyKind = 'multipart'
  if (!r.method) r.method = head ? 'HEAD' : r.body !== null || r.form.length ? 'POST' : 'GET'
  if (r.compressed && !hdr(r, 'accept-encoding')) r.headers.push(['Accept-Encoding', 'gzip, deflate, br'])
  return r
}
const isJson = (s: string) => { try { JSON.parse(s); return true } catch { return false } }
export const hdr = (r: Req, name: string) => r.headers.find(([k]) => k.toLowerCase() === name)?.[1]
const hdrsNoCT = (r: Req) => r.headers.filter(([k]) => !(r.bodyKind === 'multipart' && k.toLowerCase() === 'content-type'))
const q = (s: string) => JSON.stringify(s)
const sq = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const pyStr = (s: string) => (s.includes('\n') ? `"""${s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')}"""` : q(s))
const ind = (s: string, n: number) => s.split('\n').map((l, i) => (i ? ' '.repeat(n) + l : l)).join('\n')
const prettyJson = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return null } }
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))
const urlParams = (s: string) => s.split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); const dec = (x: string) => { try { return decodeURIComponent(x.replace(/\+/g, ' ')) } catch { return x } }; return [dec(i >= 0 ? p.slice(0, i) : p), dec(i >= 0 ? p.slice(i + 1) : '')] as [string, string] })

// ---------------- generators ----------------
function jsFetch(r: Req) {
  const h = hdrsNoCT(r).slice(); if (r.auth) h.push(['Authorization', `Basic ${b64(`${r.auth.user}:${r.auth.pass}`)}`])
  const L: string[] = []
  let body = ''
  if (r.bodyKind === 'multipart') { L.push('const form = new FormData()'); r.form.forEach((f) => L.push(f.file ? `form.append(${q(f.name)}, fileInput.files[0]) // ${f.value}` : `form.append(${q(f.name)}, ${q(f.value)})`)); L.push(''); body = 'form' }
  else if (r.bodyKind === 'json') { const p = prettyJson(r.body!); body = p ? `JSON.stringify(${ind(p, 2)})` : q(r.body!) }
  else if (r.bodyKind === 'urlencoded') body = `new URLSearchParams(${ind(JSON.stringify(Object.fromEntries(urlParams(r.body!)), null, 2), 2)})`
  else if (r.body !== null) body = q(r.body)
  const opts: string[] = [`  method: ${q(r.method)}`]
  if (h.length) opts.push(`  headers: {\n${h.map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n')}\n  }`)
  if (body) opts.push(`  body: ${body}`)
  if (r.timeout) opts.push(`  signal: AbortSignal.timeout(${r.timeout * 1000})`)
  L.push(`const res = await fetch(${q(r.url)}, {\n${opts.join(',\n')}\n})`, '', 'if (!res.ok) throw new Error(`HTTP ${res.status}`)', `const data = await res.${hdr(r, 'accept')?.includes('json') || r.bodyKind === 'json' ? 'json' : 'text'}()`, 'console.log(data)')
  return L.join('\n')
}

function nodeAxios(r: Req) {
  const L = ["import axios from 'axios'"]
  if (r.bodyKind === 'multipart') L.push("import FormData from 'form-data'", "import fs from 'node:fs'")
  if (r.insecure) L.push("import https from 'node:https'")
  L.push('')
  let data = ''
  if (r.bodyKind === 'multipart') { L.push('const form = new FormData()'); r.form.forEach((f) => L.push(f.file ? `form.append(${sq(f.name)}, fs.createReadStream(${sq(f.value)}))` : `form.append(${sq(f.name)}, ${sq(f.value)})`)); L.push(''); data = 'form' }
  else if (r.bodyKind === 'json') { const p = prettyJson(r.body!); data = p ? ind(p, 2) : sq(r.body!) }
  else if (r.bodyKind === 'urlencoded') data = `new URLSearchParams(${ind(JSON.stringify(Object.fromEntries(urlParams(r.body!)), null, 2), 2)})`
  else if (r.body !== null) data = sq(r.body)
  const o: string[] = [`  method: ${sq(r.method.toLowerCase())}`, `  url: ${sq(r.url)}`]
  const h = hdrsNoCT(r)
  if (h.length || r.bodyKind === 'multipart') o.push(`  headers: {\n${[...h.map(([k, v]) => `    ${sq(k)}: ${sq(v)}`), ...(r.bodyKind === 'multipart' ? ['    ...form.getHeaders()'] : [])].join(',\n')}\n  }`)
  if (r.auth) o.push(`  auth: { username: ${sq(r.auth.user)}, password: ${sq(r.auth.pass)} }`)
  if (data) o.push(`  data: ${data}`)
  if (r.timeout) o.push(`  timeout: ${r.timeout * 1000}`)
  if (r.insecure) o.push('  httpsAgent: new https.Agent({ rejectUnauthorized: false })')
  L.push(`const { data } = await axios({\n${o.join(',\n')}\n})`, '', 'console.log(data)')
  return L.join('\n')
}

function python(r: Req) {
  const L = ['import requests', '']
  const h = hdrsNoCT(r).filter(([k]) => !(r.bodyKind === 'json' && k.toLowerCase() === 'content-type'))
  const args: string[] = [q(r.url)]
  if (h.length) { L.push('headers = {', ...h.map(([k, v]) => `    ${q(k)}: ${q(v)},`), '}', ''); args.push('headers=headers') }
  if (r.bodyKind === 'json') { const p = prettyJson(r.body!); if (p) { L.push(`json_data = ${toPy(JSON.parse(r.body!), 0)}`, ''); args.push('json=json_data') } else { L.push(`data = ${pyStr(r.body!)}`, ''); args.push('data=data') } }
  else if (r.bodyKind === 'urlencoded') { L.push('data = {', ...urlParams(r.body!).map(([k, v]) => `    ${q(k)}: ${q(v)},`), '}', ''); args.push('data=data') }
  else if (r.bodyKind === 'raw') { L.push(`data = ${pyStr(r.body!)}`, ''); args.push('data=data.encode()') }
  else if (r.bodyKind === 'multipart') {
    const files = r.form.filter((f) => f.file), fields = r.form.filter((f) => !f.file)
    if (fields.length) { L.push('data = {', ...fields.map((f) => `    ${q(f.name)}: ${q(f.value)},`), '}'); args.push('data=data') }
    if (files.length) { L.push('files = {', ...files.map((f) => `    ${q(f.name)}: open(${q(f.value)}, "rb"),`), '}'); args.push('files=files') }
    L.push('')
  }
  if (r.auth) args.push(`auth=(${q(r.auth.user)}, ${q(r.auth.pass)})`)
  if (r.insecure) args.push('verify=False')
  if (r.timeout) args.push(`timeout=${r.timeout}`)
  const m = r.method.toLowerCase()
  const fn = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(m) ? `requests.${m}(` : `requests.request(${q(r.method)}, `
  L.push(`response = ${fn}${args.length > 2 ? '\n    ' + args.join(',\n    ') + ',\n' : args.join(', ')})`, 'response.raise_for_status()', r.bodyKind === 'json' || hdr(r, 'accept')?.includes('json') ? 'print(response.json())' : 'print(response.text)')
  return L.join('\n')
}
function toPy(v: any, d: number): string {
  const pad = '    '.repeat(d + 1), end = '    '.repeat(d)
  if (v === null) return 'None'; if (v === true) return 'True'; if (v === false) return 'False'
  if (typeof v === 'string') return q(v); if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + toPy(x, d + 1)).join(',\n')},\n${end}]` : '[]'
  const e = Object.entries(v); return e.length ? `{\n${e.map(([k, x]) => `${pad}${q(k)}: ${toPy(x, d + 1)}`).join(',\n')},\n${end}}` : '{}'
}

function goHttp(r: Req) {
  const imports = new Set(['fmt', 'io', 'net/http', 'log'])
  const L: string[] = []
  let bodyVar = 'nil'
  if (r.bodyKind === 'multipart') {
    imports.add('bytes'); imports.add('mime/multipart'); if (r.form.some((f) => f.file)) imports.add('os')
    L.push('\tbody := &bytes.Buffer{}', '\tw := multipart.NewWriter(body)')
    r.form.forEach((f, i) => { if (f.file) L.push(`\tf${i}, _ := os.Open(${q(f.value)})`, `\tdefer f${i}.Close()`, `\tpart${i}, _ := w.CreateFormFile(${q(f.name)}, ${q(f.value.split('/').pop() || f.value)})`, `\tio.Copy(part${i}, f${i})`); else L.push(`\tw.WriteField(${q(f.name)}, ${q(f.value)})`) })
    L.push('\tw.Close()', ''); bodyVar = 'body'
  } else if (r.body !== null) { imports.add('strings'); L.push(`\tbody := strings.NewReader(${r.body.includes('`') ? q(r.body) : '`' + r.body + '`'})`); bodyVar = 'body' }
  L.push(`\treq, err := http.NewRequest(${q(r.method)}, ${q(r.url)}, ${bodyVar})`, '\tif err != nil {', '\t\tlog.Fatal(err)', '\t}')
  hdrsNoCT(r).forEach(([k, v]) => L.push(`\treq.Header.Set(${q(k)}, ${q(v)})`))
  if (r.bodyKind === 'multipart') L.push('\treq.Header.Set("Content-Type", w.FormDataContentType())')
  if (r.auth) L.push(`\treq.SetBasicAuth(${q(r.auth.user)}, ${q(r.auth.pass)})`)
  L.push('')
  const client: string[] = []
  if (r.timeout) { imports.add('time'); client.push(`\t\tTimeout: ${r.timeout} * time.Second,`) }
  if (r.insecure) { imports.add('crypto/tls'); client.push('\t\tTransport: &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}},') }
  L.push(client.length ? `\tclient := &http.Client{\n${client.join('\n')}\n\t}` : '\tclient := &http.Client{}')
  L.push('\tresp, err := client.Do(req)', '\tif err != nil {', '\t\tlog.Fatal(err)', '\t}', '\tdefer resp.Body.Close()', '', '\tdata, err := io.ReadAll(resp.Body)', '\tif err != nil {', '\t\tlog.Fatal(err)', '\t}', '\tfmt.Printf("%s\\n", data)')
  return `package main\n\nimport (\n${[...imports].sort().map((i) => `\t${q(i)}`).join('\n')}\n)\n\nfunc main() {\n${L.join('\n')}\n}`
}

function rust(r: Req) {
  const L = ['use reqwest::header::{HeaderMap, HeaderValue};', '', '#[tokio::main]', 'async fn main() -> Result<(), Box<dyn std::error::Error>> {']
  const b: string[] = ['    let client = reqwest::Client::builder()']
  if (r.insecure) b.push('        .danger_accept_invalid_certs(true)')
  if (r.timeout) b.push(`        .timeout(std::time::Duration::from_secs(${r.timeout}))`)
  b.push('        .build()?;'); L.push(...b, '')
  const h = hdrsNoCT(r)
  if (h.length) { L.push('    let mut headers = HeaderMap::new();'); h.forEach(([k, v]) => L.push(`    headers.insert(${q(k.toLowerCase())}, HeaderValue::from_static(${q(v)}));`)); L.push('') }
  if (r.bodyKind === 'multipart') { L.push('    let form = reqwest::multipart::Form::new()'); r.form.forEach((f) => L.push(f.file ? `        .file(${q(f.name)}, ${q(f.value)}).await?` : `        .text(${q(f.name)}, ${q(f.value)})`)); L[L.length - 1] += ';'; L.push('') }
  const m = r.method.toLowerCase()
  const std = ['get', 'post', 'put', 'patch', 'delete', 'head'].includes(m)
  const chain = [std ? `    let res = client.${m}(${q(r.url)})` : `    let res = client.request(reqwest::Method::from_bytes(b${q(r.method)})?, ${q(r.url)})`]
  if (h.length) chain.push('        .headers(headers)')
  if (r.auth) chain.push(`        .basic_auth(${q(r.auth.user)}, Some(${q(r.auth.pass)}))`)
  if (r.bodyKind === 'multipart') chain.push('        .multipart(form)')
  else if (r.body !== null) { const hs = '#'.repeat(((r.body.match(/"#+/g) ?? []).reduce((m, x) => Math.max(m, x.length), 0)) || 1); chain.push(`        .body(r${hs}"${r.body}"${hs})`) }
  chain.push('        .send()', '        .await?;')
  L.push(...chain, '', '    println!("{}", res.text().await?);', '    Ok(())', '}')
  return '// Cargo.toml: reqwest = { version = "0.12", features = ["json", "multipart"] }, tokio = { version = "1", features = ["full"] }\n' + L.join('\n')
}

function php(r: Req) {
  const L = ['<?php', '', '$ch = curl_init();', `curl_setopt($ch, CURLOPT_URL, ${sq(r.url)});`, 'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);']
  if (r.method !== 'GET') L.push(`curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${sq(r.method)});`)
  const h = hdrsNoCT(r)
  if (h.length) L.push('curl_setopt($ch, CURLOPT_HTTPHEADER, [', ...h.map(([k, v]) => `    ${sq(`${k}: ${v}`)},`), ']);')
  if (r.auth) L.push(`curl_setopt($ch, CURLOPT_USERPWD, ${sq(`${r.auth.user}:${r.auth.pass}`)});`)
  if (r.bodyKind === 'multipart') L.push('curl_setopt($ch, CURLOPT_POSTFIELDS, [', ...r.form.map((f) => `    ${sq(f.name)} => ${f.file ? `new CURLFile(${sq(f.value)})` : sq(f.value)},`), ']);')
  else if (r.body !== null) L.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${sq(r.body)});`)
  if (r.follow) L.push('curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);')
  if (r.insecure) L.push('curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);', 'curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);')
  if (r.compressed) L.push("curl_setopt($ch, CURLOPT_ENCODING, '');")
  if (r.timeout) L.push(`curl_setopt($ch, CURLOPT_TIMEOUT, ${r.timeout});`)
  L.push('', '$response = curl_exec($ch);', 'if ($response === false) {', '    die(curl_error($ch));', '}', 'curl_close($ch);', '', 'echo $response;')
  return L.join('\n')
}

function java(r: Req) {
  const L = ['import java.net.URI;', 'import java.net.http.HttpClient;', 'import java.net.http.HttpRequest;', 'import java.net.http.HttpResponse;']
  if (r.timeout) L.push('import java.time.Duration;')
  if (r.auth) L.push('import java.util.Base64;')
  L.push('', 'public class Main {', '    public static void main(String[] args) throws Exception {')
  L.push(`        HttpClient client = HttpClient.newBuilder()${r.follow ? '\n                .followRedirects(HttpClient.Redirect.NORMAL)' : ''}${r.timeout ? `\n                .connectTimeout(Duration.ofSeconds(${r.timeout}))` : ''}\n                .build();`, '')
  const body = r.bodyKind === 'multipart' ? null : r.body
  if (r.bodyKind === 'multipart') L.push('        // Multipart bodies need a helper (e.g. Apache HttpClient MultipartEntityBuilder);', `        // fields: ${r.form.map((f) => `${f.name}=${f.file ? '@' + f.value : f.value}`).join(', ')}`)
  const chain = [`        HttpRequest request = HttpRequest.newBuilder()`, `                .uri(URI.create(${q(r.url)}))`]
  hdrsNoCT(r).forEach(([k, v]) => chain.push(`                .header(${q(k)}, ${q(v)})`))
  if (r.auth) chain.push(`                .header("Authorization", "Basic " + Base64.getEncoder().encodeToString(${q(`${r.auth.user}:${r.auth.pass}`)}.getBytes()))`)
  chain.push(`                .method(${q(r.method)}, ${body !== null ? `HttpRequest.BodyPublishers.ofString(${q(body)})` : 'HttpRequest.BodyPublishers.noBody()'})`, '                .build();')
  L.push(...chain, '', '        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());', '        System.out.println(response.statusCode());', '        System.out.println(response.body());', '    }', '}')
  if (r.insecure) L.unshift('// Note: -k (insecure) requires a custom SSLContext with a trust-all TrustManager in Java.')
  return L.join('\n')
}

function csharp(r: Req) {
  const L = ['using System.Net.Http;', 'using System.Net.Http.Headers;', 'using System.Text;', '']
  const handler: string[] = []
  if (r.insecure) handler.push('    ServerCertificateCustomValidationCallback = (_, _, _, _) => true')
  if (r.compressed) handler.push('    AutomaticDecompression = System.Net.DecompressionMethods.All')
  if (handler.length) L.push('var handler = new HttpClientHandler', '{', handler.join(',\n'), '};', 'using var client = new HttpClient(handler);')
  else L.push('using var client = new HttpClient();')
  if (r.timeout) L.push(`client.Timeout = TimeSpan.FromSeconds(${r.timeout});`)
  L.push('', `var request = new HttpRequestMessage(new HttpMethod(${q(r.method)}), ${q(r.url)});`)
  const ct = hdr(r, 'content-type')
  hdrsNoCT(r).filter(([k]) => k.toLowerCase() !== 'content-type').forEach(([k, v]) => L.push(`request.Headers.TryAddWithoutValidation(${q(k)}, ${q(v)});`))
  if (r.auth) L.push(`request.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(${q(`${r.auth.user}:${r.auth.pass}`)})));`)
  if (r.bodyKind === 'multipart') { L.push('var form = new MultipartFormDataContent();'); r.form.forEach((f) => L.push(f.file ? `form.Add(new ByteArrayContent(File.ReadAllBytes(${q(f.value)})), ${q(f.name)}, ${q(f.value.split('/').pop() ?? f.value)});` : `form.Add(new StringContent(${q(f.value)}), ${q(f.name)});`)); L.push('request.Content = form;') }
  else if (r.body !== null) L.push(`request.Content = new StringContent(${q(r.body)}, Encoding.UTF8, ${q((ct ?? 'text/plain').split(';')[0])});`)
  L.push('', 'var response = await client.SendAsync(request);', 'response.EnsureSuccessStatusCode();', 'var body = await response.Content.ReadAsStringAsync();', 'Console.WriteLine(body);')
  return L.join('\n')
}

function dart(r: Req) {
  const L = ["import 'package:http/http.dart' as http;"]
  if (r.auth) L.push("import 'dart:convert';")
  L.push('', 'void main() async {')
  const h = hdrsNoCT(r).slice()
  if (r.auth) L.push(`  final basic = 'Basic ' + base64Encode(utf8.encode(${sq(`${r.auth.user}:${r.auth.pass}`)}));`)
  if (r.bodyKind === 'multipart') {
    L.push(`  final req = http.MultipartRequest(${sq(r.method)}, Uri.parse(${sq(r.url)}));`)
    h.forEach(([k, v]) => L.push(`  req.headers[${sq(k)}] = ${sq(v)};`)); if (r.auth) L.push("  req.headers['Authorization'] = basic;")
    r.form.forEach((f) => L.push(f.file ? `  req.files.add(await http.MultipartFile.fromPath(${sq(f.name)}, ${sq(f.value)}));` : `  req.fields[${sq(f.name)}] = ${sq(f.value)};`))
    L.push('  final res = await http.Response.fromStream(await req.send());')
  } else {
    L.push(`  final req = http.Request(${sq(r.method)}, Uri.parse(${sq(r.url)}));`)
    h.forEach(([k, v]) => L.push(`  req.headers[${sq(k)}] = ${sq(v)};`)); if (r.auth) L.push("  req.headers['Authorization'] = basic;")
    if (r.body !== null) L.push(`  req.body = ${sq(r.body)};`)
    L.push('  final res = await http.Response.fromStream(await req.send());')
  }
  L.push('  if (res.statusCode >= 400) throw Exception(\'HTTP ${res.statusCode}\');', '  print(res.body);', '}')
  return L.join('\n')
}

function ruby(r: Req) {
  const L = ["require 'net/http'", "require 'uri'"]
  if (r.insecure) L.push("require 'openssl'")
  L.push('', `uri = URI(${q(r.url)})`)
  const cls = ({ GET: 'Get', POST: 'Post', PUT: 'Put', PATCH: 'Patch', DELETE: 'Delete', HEAD: 'Head', OPTIONS: 'Options' } as Record<string, string>)[r.method]
  L.push(cls ? `req = Net::HTTP::${cls}.new(uri)` : `req = Net::HTTPGenericRequest.new(${q(r.method)}, true, true, uri)`)
  hdrsNoCT(r).forEach(([k, v]) => L.push(`req[${q(k)}] = ${q(v)}`))
  if (r.auth) L.push(`req.basic_auth(${q(r.auth.user)}, ${q(r.auth.pass)})`)
  if (r.bodyKind === 'multipart') L.push(`req.set_form([${r.form.map((f) => f.file ? `[${q(f.name)}, File.open(${q(f.value)})]` : `[${q(f.name)}, ${q(f.value)}]`).join(', ')}], 'multipart/form-data')`)
  else if (r.body !== null) L.push(`req.body = ${q(r.body)}`)
  const o = ['use_ssl: uri.scheme == "https"']; if (r.insecure) o.push('verify_mode: OpenSSL::SSL::VERIFY_NONE'); if (r.timeout) o.push(`read_timeout: ${r.timeout}`)
  L.push('', `res = Net::HTTP.start(uri.hostname, uri.port, ${o.join(', ')}) do |http|`, '  http.request(req)', 'end', '', 'puts res.code', 'puts res.body')
  return L.join('\n')
}

function swift(r: Req) {
  const L = ['import Foundation', '', `var request = URLRequest(url: URL(string: ${q(r.url)})!)`, `request.httpMethod = ${q(r.method)}`]
  if (r.timeout) L.push(`request.timeoutInterval = ${r.timeout}`)
  hdrsNoCT(r).forEach(([k, v]) => L.push(`request.setValue(${q(v)}, forHTTPHeaderField: ${q(k)})`))
  if (r.auth) L.push(`let cred = Data(${q(`${r.auth.user}:${r.auth.pass}`)}.utf8).base64EncodedString()`, 'request.setValue("Basic \\(cred)", forHTTPHeaderField: "Authorization")')
  if (r.bodyKind === 'multipart') {
    L.push('', 'let boundary = UUID().uuidString', 'request.setValue("multipart/form-data; boundary=\\(boundary)", forHTTPHeaderField: "Content-Type")', 'var body = Data()')
    r.form.forEach((f) => { if (f.file) L.push(`body.append("--\\(boundary)\\r\\nContent-Disposition: form-data; name=\\"${f.name}\\"; filename=\\"${f.value.split('/').pop()}\\"\\r\\n\\r\\n".data(using: .utf8)!)`, `body.append(try! Data(contentsOf: URL(fileURLWithPath: ${q(f.value)})))`, 'body.append("\\r\\n".data(using: .utf8)!)'); else L.push(`body.append("--\\(boundary)\\r\\nContent-Disposition: form-data; name=\\"${f.name}\\"\\r\\n\\r\\n${f.value.replace(/"/g, '\\"')}\\r\\n".data(using: .utf8)!)`) })
    L.push('body.append("--\\(boundary)--\\r\\n".data(using: .utf8)!)', 'request.httpBody = body')
  } else if (r.body !== null) L.push(`request.httpBody = ${r.body.includes('\n') || r.body.includes('"') ? `"""\n${r.body}\n"""` : q(r.body)}.data(using: .utf8)`)
  L.push('', 'let (data, response) = try await URLSession.shared.data(for: request)', 'if let http = response as? HTTPURLResponse { print(http.statusCode) }', 'print(String(decoding: data, as: UTF8.self))')
  if (r.insecure) L.unshift('// Note: -k (insecure) needs a URLSessionDelegate that trusts the server certificate.')
  return L.join('\n')
}

export const LANGS = [
  { id: 'js', label: 'JavaScript fetch', ext: 'js', gen: jsFetch },
  { id: 'axios', label: 'Node axios', ext: 'mjs', gen: nodeAxios },
  { id: 'python', label: 'Python requests', ext: 'py', gen: python },
  { id: 'go', label: 'Go net/http', ext: 'go', gen: goHttp },
  { id: 'rust', label: 'Rust reqwest', ext: 'rs', gen: rust },
  { id: 'php', label: 'PHP cURL', ext: 'php', gen: php },
  { id: 'java', label: 'Java HttpClient', ext: 'java', gen: java },
  { id: 'csharp', label: 'C# HttpClient', ext: 'cs', gen: csharp },
  { id: 'dart', label: 'Dart http', ext: 'dart', gen: dart },
  { id: 'ruby', label: 'Ruby net/http', ext: 'rb', gen: ruby },
  { id: 'swift', label: 'Swift URLSession', ext: 'swift', gen: swift },
] as const

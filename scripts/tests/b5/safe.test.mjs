import assert from 'node:assert/strict'
import { escapeHtml, escapeAttr, safeUrl } from '../../../src/lib/safe.ts'

// escapeHtml / escapeAttr
assert.equal(escapeHtml('"><script>alert(1)</script>'), '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
assert.equal(escapeHtml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &#39; f')
assert.equal(escapeHtml('&lt;'), '&amp;lt;') // already-escaped text stays visible as typed
assert.equal(escapeHtml(null), ''); assert.equal(escapeHtml(42), '42')
assert.equal(escapeAttr('x" onerror="alert(1)'), 'x&quot; onerror=&quot;alert(1)')
assert.equal(escapeAttr("x' onmouseover='a`"), 'x&#39; onmouseover=&#39;a&#96;')
assert.equal(escapeAttr('C:\\path\\file'), 'C:\\path\\file') // backslashes have no meaning in HTML
assert.ok(!/[<>"'`]/.test(escapeAttr('<>"\'`')))

// safeUrl: blocked
for (const bad of [
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)',
  '\u0000javascript:alert(1)', 'javascript\u0001:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', 'data:application/javascript,alert(1)', 'file:///etc/passwd',
  'livescript:x', 'jar:http://x!/', '', '   ', null, undefined, 42, {},
]) assert.equal(safeUrl(bad), '', JSON.stringify(bad))
assert.equal(safeUrl('javascript:alert(1)', '#'), '#')

// safeUrl: allowed and unchanged
for (const ok of [
  'https://example.com/a?b=1#c', 'http://localhost:5173/', 'HTTPS://EXAMPLE.COM', 'blob:https://openfile-studio.vercel.app/1234-5678',
  'mailto:a@b.co', 'tel:+911234567890', 'data:image/png;base64,iVBORw0KGgo=', 'data:image/svg+xml;charset=utf-8,%3Csvg%3E',
  'data:image/jpeg,abc', 'data:audio/mpeg;base64,AAAA', 'data:video/mp4;base64,AAAA', 'data:application/pdf;base64,JVBERi0=',
  '/docs/pdf', './a.png', '../b/c.html', 'images/img1.png', '#section-2', '?q=1', 'chapter2.xhtml#p3', '//cdn.example.com/x.css',
]) assert.equal(safeUrl(ok), ok, ok)
// a relative path that merely contains a colon later is still relative
assert.equal(safeUrl('a/b:c'), 'a/b:c')
// entity-looking text is not decoded (it stays literal once escapeAttr is applied)
assert.equal(escapeAttr(safeUrl('javascript&colon;alert(1)')), 'javascript&amp;colon;alert(1)')
// backslash prefix is a relative path, never a scheme
assert.equal(safeUrl('\\javascript:alert(1)'), '\\javascript:alert(1)')
assert.ok(!/^javascript:/i.test(new URL(safeUrl('\\javascript:alert(1)'), 'https://x.test/').href))
// trims outer whitespace
assert.equal(safeUrl('  https://a.b/  '), 'https://a.b/')

console.log('safe helpers ok')

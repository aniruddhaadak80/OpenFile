import assert from 'node:assert/strict'
import { htmlToText, decodeEntities, DEFAULT_STRIP } from '../../../src/lib/b5/htmltext.ts'
const html = `<!DOCTYPE html><html><head><title>x</title><style>p{}</style></head><body>
<h1>Hello &amp; welcome</h1><p>Fish &lt;b&gt; chips,   <b>bold</b> <a href="https://a.dev/x">link</a>.</p>
<script>alert(1)</script><ul><li>One</li><li>Two &#8364; &#x1F600;</li></ul><p>A<br>B <img src=x alt="cat"></p>
<pre>  keep   this
  indent</pre><table><tr><td>a</td><td>b</td></tr></table><!-- hidden --></body></html>`
const t = htmlToText(html)
assert.equal(t, 'Hello & welcome\n\nFish <b> chips, bold link (https://a.dev/x).\n\n- One\n- Two € 😀\n\nA\nB [cat]\n\n  keep   this\n  indent\n\na\tb')
const flat = htmlToText(html, { ...DEFAULT_STRIP, blocks: false, links: 'drop', images: false })
assert.ok(!flat.includes('\n\n\n')); assert.ok(!flat.includes('https')); assert.ok(!flat.includes('alert'))
assert.equal(decodeEntities('&amp;lt; &foo; &#65;'), '&lt; &foo; A')
assert.equal(decodeEntities('&eacute;', new Map([['eacute', 233]])), 'é')
console.log('htmltext ok')

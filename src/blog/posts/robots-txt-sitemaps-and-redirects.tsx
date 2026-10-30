import { H2, H3, Note, Tip, Warn, T } from '../prose'
import { RobotsTesterDemo } from '@/blog/demos-cf'

export default function RobotsSitemapsRedirects() {
  return <>
    <p>Every website has a handful of small text files that most visitors never see. They tell search engines what to crawl, where the pages are, and where old pages have moved. Get them right and nobody notices. Get one wrong and a whole site can drop out of search. Here is what each file does, the mistakes I see most, and how the new Web &amp; SEO tools in OpenFile help. They work from what you type or paste, so nothing is fetched from or sent to your site.</p>
    <H2>robots.txt: a polite request to crawlers</H2>
    <p>robots.txt sits at the root of your site, for example example.com/robots.txt. It holds groups of rules. Each group starts with one or more User-agent lines naming a crawler, then Allow and Disallow lines with paths. A crawler uses the group that names it, or the group for * if none does.</p>
    <p>The part that trips people up is how rules are matched. Under the standard (RFC 9309), the longest matching rule wins, and if an Allow and a Disallow are the same length, Allow wins. Order in the file does not matter. Try it below: /admin/ is blocked, but /admin/help is allowed because its rule is longer.</p>
    <RobotsTesterDemo />
    <H3>Blocking AI crawlers</H3>
    <p>Many AI companies use their own crawlers, such as GPTBot, ClaudeBot, Google-Extended and CCBot. <T to="robots-txt-generator">robots.txt Generator &amp; Tester</T> can add a group that blocks the common ones in a single tick, and its tester shows which rule decides any URL.</p>
    <Warn title="Not a lock">robots.txt is a request, not security. Well behaved crawlers follow it, but anyone can still open the pages. A Disallow line also tells people where your private areas are, so protect them with a login instead.</Warn>
    <H2>Sitemaps: a list of pages you want found</H2>
    <p>An XML sitemap lists the pages you want search engines to know about, each in a loc tag with an optional lastmod date. A single file can hold up to 50,000 URLs and 50 MB. Bigger sites split it into several files and list those in a sitemap index.</p>
    <ul>
      <li><T to="sitemap-generator">XML Sitemap Generator</T> builds one from a list of URLs and escapes characters like the ampersand that break XML.</li>
      <li><T to="sitemap-checker">Sitemap Checker</T> finds broken dates, out of range priorities, duplicates and URLs on the wrong host, and can compare the sitemap with a list of your pages to find the ones missing from it.</li>
    </ul>
    <Tip>Add a Sitemap line to robots.txt with the full address of your sitemap. Crawlers read robots.txt first, so they find it straight away.</Tip>
    <H2>Redirects: moving pages without losing visitors</H2>
    <p>When a page moves, the old address should answer with a redirect to the new one. Use 301 for a permanent move, so search engines carry the old page's standing over, and 302 for a short term change. <T to="redirect-generator">Redirect Rules Generator</T> turns a two column list of old and new URLs into rules for Apache, Nginx, Netlify, Vercel, Cloudflare, IIS or Caddy.</p>
    <p>It also looks for chains and loops. A chain is A to B to C: every extra hop is slower, and crawlers give up after a few. A loop is A to B to A, which never ends. Point every old URL straight at the final page.</p>
    <H2>Other small files worth having</H2>
    <ul>
      <li><strong>Security headers</strong>: <T to="security-headers-generator">Security Headers Generator</T> builds a Content Security Policy, HSTS and the rest, grades them, and writes them for your server. Start the policy in report only mode so you can see what it would block before it blocks anything.</li>
      <li><strong>Structured data</strong>: <T to="schema-generator">Schema Markup Generator</T> writes JSON-LD for FAQ, Article, Product, Event, Recipe and more, flags fields that rich results need, and escapes the output so it is safe inside a script tag.</li>
      <li><strong>hreflang</strong>: <T to="hreflang-generator">Hreflang Tag Generator</T> links the language versions of a page so each reader gets the right one.</li>
      <li><strong>security.txt and llms.txt</strong>: one tells security researchers how to report a problem, the other gives AI assistants a clean map of your docs.</li>
    </ul>
    <H2>Check the page itself</H2>
    <p>Once the files are in place, check the pages. <T to="seo-audit">On-page SEO Checker</T> reads the HTML you paste and looks at the title, description, headings, image alt text, canonical link, Open Graph tags and structured data. If a description is missing, <T to="meta-description-writer">AI Meta Description Writer</T> picks the sentences from your page that best match the title and keyword, with a small model on your device, and fits them to about 155 characters with a search preview.</p>
    <Note title="Works on staging sites too">Because nothing is fetched from your site, these tools work just as well on a staging copy or on pages behind a login. Test changes there first, then copy the files to the live site.</Note>
  </>
}

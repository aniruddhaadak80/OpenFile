<?xml version="1.0" encoding="UTF-8"?>
<!-- Renders the OpenFile blog RSS feed as a readable page when opened in a browser. Feed readers ignore this file. -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" version="5.0" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat" />
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title><xsl:value-of select="/rss/channel/title" /> (RSS feed)</title>
        <style>
          :root { color-scheme: dark; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #0B0D10; color: #ECEEF1; font: 16px/1.65 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
          .wrap { max-width: 760px; margin: 0 auto; padding: 48px 20px 72px; }
          .kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #F5A524; }
          .dot { width: 8px; height: 8px; border-radius: 50%; background: #F5A524; }
          h1 { margin: 10px 0 6px; font: 700 2.2rem/1.15 "Space Grotesk", Inter, sans-serif; color: #F5A524; }
          .lead { margin: 0 0 18px; color: #B6BCC5; }
          .note { margin: 0 0 32px; padding: 14px 16px; border: 1px solid #F5A52440; border-radius: 14px; background: #F5A5240F; font-size: 14px; color: #D6DAE0; }
          .note code { padding: 2px 6px; border-radius: 6px; background: #000; color: #FBBF24; word-break: break-all; }
          ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
          li { padding: 18px 20px; border: 1px solid #23272E; border-radius: 16px; background: #111418; transition: border-color .15s; }
          li:hover { border-color: #F5A52480; }
          li a.t { color: #FBBF24; font-weight: 600; font-size: 1.1rem; text-decoration: none; }
          li a.t:hover { text-decoration: underline; }
          .meta { margin-top: 2px; font-size: 13px; color: #8B929C; }
          .desc { margin: 8px 0 0; color: #C9CED6; }
          .tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
          .tag { padding: 2px 9px; border: 1px solid #2DD4BF40; border-radius: 999px; font-size: 12px; color: #5EEAD4; }
          .foot { margin-top: 40px; font-size: 13px; color: #8B929C; }
          .foot a { color: #F5A524; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <span class="kicker"><span class="dot"></span>RSS feed</span>
          <h1><xsl:value-of select="/rss/channel/title" /></h1>
          <p class="lead"><xsl:value-of select="/rss/channel/description" /></p>
          <p class="note">This is a feed. Copy this address into your feed reader to get new posts: <code><xsl:value-of select="/rss/channel/atom:link/@href" /></code></p>
          <ol>
            <xsl:for-each select="/rss/channel/item">
              <li>
                <a class="t" href="{link}"><xsl:value-of select="title" /></a>
                <div class="meta"><xsl:value-of select="substring(pubDate, 1, 16)" /></div>
                <p class="desc"><xsl:value-of select="description" /></p>
                <xsl:if test="category">
                  <div class="tags"><xsl:for-each select="category"><span class="tag"><xsl:value-of select="." /></span></xsl:for-each></div>
                </xsl:if>
              </li>
            </xsl:for-each>
          </ol>
          <p class="foot"><a href="{/rss/channel/link}">Read the blog on OpenFile</a></p>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>

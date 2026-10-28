// SPA fallback for GitHub Pages: serve index.html for deep links
import { copyFileSync, writeFileSync, existsSync } from 'node:fs'
if (existsSync('dist/index.html')) {
  copyFileSync('dist/index.html', 'dist/404.html')
  writeFileSync('dist/.nojekyll', '')
  console.log('postbuild: wrote 404.html + .nojekyll')
}

# Self-hosting

OpenFile builds to a **static site** in `dist/`. Any host that serves files works; the only requirement for a perfect experience is that deep links such as `/merge-pdf` return the app. The build takes care of that for you:

- `npm run build` runs `vite build` and then `scripts/postbuild.mjs`, which writes a real `index.html` for **every route** (`dist/merge-pdf/index.html`, `dist/docs/api/index.html`, …) with a route-specific title, description and canonical URL, plus `sitemap.xml`, `robots.txt`, a `404.html` SPA fallback and `.nojekyll`.
- Because every route has its own file, deep links return **HTTP 200** even on hosts without rewrite rules (like GitHub Pages).

## Requirements

- Node.js 20 or newer (CI uses Node 22)
- npm

```bash
git clone https://github.com/aniruddhaadak80/OpenFile.git
cd OpenFile
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ locally
```

## Build options

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_BASE` | `/` | Public base path. Set to `/OpenFile/` (or your repo name) when serving from a sub-path. |
| `SITE_URL` | `https://openfile-studio.vercel.app` at `/`, `https://aniruddhaadak80.github.io/OpenFile` at `/OpenFile/` | Absolute origin used in `sitemap.xml`, `robots.txt` and canonical links. Set it to your own domain. |

The post-build script detects the base path from the built `index.html`, so it works whether or not `VITE_BASE` is still set when it runs. You can also point it at another output folder:

```bash
SITE_URL=https://files.example.com node scripts/postbuild.mjs dist
```

## Vercel (recommended)

Vercel serves the static site **and** the optional [API routes](/docs/api) in `api/`.

1. Import the repository on Vercel. `vercel.json` sets the framework (Vite), the build command (`npm run build`) and the output directory (`dist`).
2. Deploy. SPA rewrites, `/api/*` functions, immutable caching for `/assets/*` and security headers are configured in `vercel.json`.

```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/((?!api/|assets/|media/).*)", "destination": "/index.html" }]
}
```

## GitHub Pages

The repository ships a workflow at `.github/workflows/deploy-pages.yml` that builds with `npm run build:pages` and publishes `dist/` to the `gh-pages` branch.

1. Fork the repository and push to `main`.
2. In **Settings → Pages**, choose **Deploy from a branch → `gh-pages` / root** (one time).
3. Your copy is live at `https://<you>.github.io/OpenFile/`.

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build:pages
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          force_orphan: true
```

> [!NOTE]
> Renamed the repository? Change `VITE_BASE=/OpenFile/` in the `build:pages` script in `package.json` to your repository name, and set `SITE_URL` if you use a custom domain.

GitHub Pages cannot run serverless functions, so the [API routes](/docs/api) are unavailable there. Every tool still works; only the *fetch from URL* mode of HTML to PDF needs the API (paste HTML instead), and the [Status](/status) page reports *static mode*.

## Any static host

Netlify, Cloudflare Pages, Render, S3 + CloudFront, Firebase Hosting or your own server:

```bash
npm run build          # outputs dist/
npx serve -s dist      # quick local check with SPA fallback
```

Upload `dist/`. Thanks to the pre-rendered route files, deep links work even without rewrites. If your host supports it, add an SPA fallback anyway so unknown URLs show the in-app 404 page:

| Host | SPA fallback |
| --- | --- |
| Netlify | `dist/_redirects` containing `/*  /index.html  200` |
| Cloudflare Pages | Served automatically when there is no `404.html`; otherwise add `/* /index.html 200` to `_redirects` |
| Firebase Hosting | `"rewrites": [{ "source": "**", "destination": "/index.html" }]` |
| Apache | `FallbackResource /index.html` |

For a sub-path, build with `VITE_BASE=/your-path/ npm run build`.

## Docker (nginx)

`Dockerfile`:

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf`:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  # long-lived caching for hashed assets
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  # the service worker must always be revalidated
  location = /sw.js {
    add_header Cache-Control "no-cache";
  }

  # pre-rendered routes first, then the SPA shell
  location / {
    try_files $uri $uri/index.html /index.html;
  }

  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy strict-origin-when-cross-origin;
  add_header Permissions-Policy "camera=(self), microphone=(self), display-capture=(self)";

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml application/wasm;
}
```

```bash
docker build -t openfile .
docker run --rm -p 8080:80 openfile   # http://localhost:8080
```

> [!TIP]
> The camera, microphone and screen-capture tools need a **secure context**: serve over HTTPS (or use `localhost`) or browsers will block those permissions.

# Self-hosting OpenFile

OpenFile is a static web app. Every tool runs in the visitor's browser, so a server only hands out files: nothing is uploaded, stored or processed on it. You can run it three ways.

| Way | Best for | Command |
| --- | --- | --- |
| Container image | Servers, home labs, Kubernetes | `docker run -p 8080:8080 ghcr.io/aniruddhaadak80/openfile` |
| npm CLI | One laptop, offline use, quick demos | `npx @aniruddhaadak80/openfile` |
| Static files | Any static host or CDN | `npm run build`, then upload `dist/` |

## Container image

`ghcr.io/aniruddhaadak80/openfile` is built from the [Dockerfile](../Dockerfile) in two stages: Node builds the app, then a small [Caddy](https://caddyserver.com) server serves it. The image:

- runs as user `10001`, not root, and works with a read-only root file system and all Linux capabilities dropped
- listens on port `8080`
- is published for `linux/amd64` and `linux/arm64` (Intel and AMD servers, Raspberry Pi 4 and 5, Apple silicon, AWS Graviton)
- ships brotli and gzip copies of every large text and wasm file, so the 30 MB video engine downloads as a fraction of that
- has a health check at `/healthz`
- is signed with cosign (keyless, GitHub OIDC) and carries an SBOM and SLSA build provenance

### Run

```bash
docker run -d --name openfile --restart unless-stopped -p 8080:8080 \
  --read-only --tmpfs /data:uid=10001,gid=10001 --tmpfs /config:uid=10001,gid=10001 --cap-drop ALL --security-opt no-new-privileges \
  ghcr.io/aniruddhaadak80/openfile:latest
```

Open `http://localhost:8080`.

### Compose

The repo has a ready [docker-compose.yml](../docker-compose.yml) with the same hardening:

```bash
docker compose up -d
docker compose ps          # STATUS shows (healthy) after a few seconds
```

### Tags

| Tag | Moves when |
| --- | --- |
| `latest` | every stable release |
| `1` | every 1.x release |
| `1.2` | every 1.2.x release |
| `1.2.0` | never, it is one release |
| `sha-abc1234` | never, it is one commit |

For production, pin a full version or a digest (`ghcr.io/aniruddhaadak80/openfile@sha256:...`). Dependabot or Renovate can bump it for you.

### Settings

| Variable | Default | Effect |
| --- | --- | --- |
| `PORT` | `8080` | Port inside the container |
| `OPENFILE_CROSS_ORIGIN_ISOLATION` | `false` | `true` adds `Cross-Origin-Embedder-Policy: credentialless`. The page becomes cross-origin isolated, which lets on-device AI use several CPU threads. Safari ignores `credentialless`, so it keeps working there in single-thread mode. |

### Headers the server sends

| Path | Cache-Control |
| --- | --- |
| `/assets/*`, `/fonts/*`, `/ffmpeg/*` (file names carry a content hash) | `public, max-age=31536000, immutable` |
| HTML pages, `/sw.js`, `/manifest.webmanifest` | `no-cache` (always revalidated, so updates show up) |
| `/media/*` | 30 days |
| everything else | 1 hour |

Every response also carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` and a `Permissions-Policy` that allows camera, microphone and screen capture for this site only. `.wasm` is served as `application/wasm`, `.mjs` as `text/javascript` and `.webmanifest` as `application/manifest+json`.

Unknown routes return the app shell (`index.html`), so deep links like `/merge-pdf` work. Missing files under `/assets/` and other static folders return a real `404`.

### Behind a reverse proxy

TLS is required for the service worker, the install prompt and the camera tools on anything other than `localhost`. Terminate TLS at your proxy and forward to port 8080.

Caddy:

```
files.example.com {
	reverse_proxy openfile:8080
}
```

nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name files.example.com;
    # ssl_certificate ...; ssl_certificate_key ...;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Traefik labels for Compose:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.openfile.rule=Host(`files.example.com`)
  - traefik.http.routers.openfile.tls.certresolver=letsencrypt
  - traefik.http.services.openfile.loadbalancer.server.port=8080
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openfile
spec:
  replicas: 2
  selector:
    matchLabels: { app: openfile }
  template:
    metadata:
      labels: { app: openfile }
    spec:
      securityContext: { runAsNonRoot: true, runAsUser: 10001, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: openfile
          image: ghcr.io/aniruddhaadak80/openfile:1
          ports: [{ containerPort: 8080 }]
          readinessProbe: { httpGet: { path: /healthz, port: 8080 } }
          livenessProbe: { httpGet: { path: /healthz, port: 8080 } }
          resources:
            requests: { cpu: 10m, memory: 32Mi }
            limits: { memory: 128Mi }
          securityContext:
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
          volumeMounts:
            - { name: data, mountPath: /data }
            - { name: config, mountPath: /config }
      volumes:
        - { name: data, emptyDir: {} }
        - { name: config, emptyDir: {} }
---
apiVersion: v1
kind: Service
metadata:
  name: openfile
spec:
  selector: { app: openfile }
  ports: [{ port: 80, targetPort: 8080 }]
```

### Verify what you run

```bash
# signature from this repo's release workflow
cosign verify ghcr.io/aniruddhaadak80/openfile:latest \
  --certificate-identity-regexp '^https://github.com/aniruddhaadak80/OpenFile/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

# build provenance (needs the GitHub CLI)
gh attestation verify oci://ghcr.io/aniruddhaadak80/openfile:latest -R aniruddhaadak80/OpenFile

# SBOM
docker buildx imagetools inspect ghcr.io/aniruddhaadak80/openfile:latest --format '{{ json .SBOM }}'
```

### Build the image yourself

```bash
git clone https://github.com/aniruddhaadak80/OpenFile.git && cd OpenFile
docker build -t openfile .
docker run --rm -p 8080:8080 openfile
# multi-arch
docker buildx build --platform linux/amd64,linux/arm64 -t you/openfile:dev --push .
```

## npm CLI

`@aniruddhaadak80/openfile` bundles the built app and a tiny server with no dependencies. After the first run it works with no network at all.

GitHub's npm registry needs a token even for public packages. Create a personal access token (classic) with only the `read:packages` scope at https://github.com/settings/tokens/new?scopes=read:packages, then add to `~/.npmrc`:

```ini
@aniruddhaadak80:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

```bash
npx @aniruddhaadak80/openfile                  # http://localhost:5173, opens your browser
npx @aniruddhaadak80/openfile --port 8080 --no-open
npx @aniruddhaadak80/openfile --host 0.0.0.0   # reachable from other devices on your network
npx @aniruddhaadak80/openfile --isolate        # cross-origin isolation for multi-threaded AI
npm install -g @aniruddhaadak80/openfile && openfile
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `-p`, `--port` | `5173` (or `PORT`) | Port. If 5173 is busy and you did not pick one, the next free port is used. |
| `-H`, `--host` | `127.0.0.1` | Interface to bind |
| `--open` / `--no-open` | open in a terminal | Open the browser after start |
| `--isolate` | off | Send `Cross-Origin-Embedder-Policy: credentialless` |
| `--dir` | bundled app | Serve another build folder |

Requires Node.js 18.17 or newer. Tool demo videos are left out of the npm package to keep it small; tools show a poster image instead. The container image has everything.

## Static files

```bash
npm ci
npm run build          # outputs dist/
```

Upload `dist/` to any static host and rewrite unknown routes to `/index.html`. Copy the cache rules above: long cache for `/assets/`, `no-cache` for HTML, `sw.js` and the manifest. For a sub-path, build with `VITE_BASE=/your-path/`.

## Releases

Pushing a tag `v*` (or publishing a GitHub Release) runs [publish-packages.yml](../.github/workflows/publish-packages.yml). It builds and pushes the image, signs it, publishes the npm package, then pulls both back and tests them: container health, headers, a tool route, the manifest, a wasm file and the service worker, plus the CLI on Linux, macOS and Windows. A manual run (Actions, Publish packages, Run workflow) publishes the version in `package.json`.

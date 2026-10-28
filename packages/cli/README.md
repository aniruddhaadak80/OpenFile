# @aniruddhaadak80/openfile

Run [OpenFile](https://github.com/aniruddhaadak80/OpenFile) on your own machine: 300+ free tools for PDF, images, video, audio and developers. Every tool runs in your browser. Files never leave your device, and after the first run it works with no network.

```bash
npx @aniruddhaadak80/openfile
```

That serves the app at http://localhost:5173 and opens your browser.

## Setup

This package lives on GitHub Packages. GitHub's npm registry needs a token even for public packages:

1. Create a personal access token (classic) with only the `read:packages` scope: https://github.com/settings/tokens/new?scopes=read:packages
2. Add two lines to `~/.npmrc`:

```ini
@aniruddhaadak80:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

## Usage

```bash
npx @aniruddhaadak80/openfile                  # http://localhost:5173
npx @aniruddhaadak80/openfile --port 8080 --no-open
npx @aniruddhaadak80/openfile --host 0.0.0.0   # reachable from other devices on your network
npm install -g @aniruddhaadak80/openfile && openfile
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `-p`, `--port <n>` | `5173` (or `PORT`) | Port. If 5173 is busy and you did not pick one, the next free port is used. |
| `-H`, `--host <name>` | `127.0.0.1` | Interface to bind |
| `--open` / `--no-open` | open when run in a terminal | Open the browser after start |
| `--isolate` | off | Send `Cross-Origin-Embedder-Policy: credentialless` for multi-threaded on-device AI |
| `--dir <path>` | bundled app | Serve another build folder |
| `-v`, `--version` | | Print the version |
| `-h`, `--help` | | Print help |

The server has no dependencies. It sends the right MIME types for `.wasm`, `.mjs` and `.webmanifest`, long cache headers for hashed assets, `no-cache` for pages and the service worker, security headers, and falls back to the app for deep links like `/merge-pdf`.

Requires Node.js 18.17 or newer. Tool demo videos are left out to keep the package small; tools show a poster image instead.

## Other ways to run OpenFile

- Hosted: https://openfile-studio.vercel.app
- Container: `docker run -p 8080:8080 ghcr.io/aniruddhaadak80/openfile`
- Self-hosting guide: https://github.com/aniruddhaadak80/OpenFile/blob/main/docs/SELF_HOSTING.md

MIT License.

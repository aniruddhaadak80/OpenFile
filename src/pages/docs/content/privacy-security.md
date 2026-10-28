# Privacy and security

OpenFile has one rule: **your files never leave your device**. Every one of the {{TOOL_COUNT}} tools reads files into the memory of your browser tab, processes them there, and gives you a download. There is no upload endpoint to send them to.

## What OpenFile downloads

| What | From where | Contains your data |
| --- | --- | --- |
| The app itself (pages, scripts, styles, fonts) | The site you opened | No |
| Engines such as the ffmpeg core | The same site | No |
| AI models and OCR language data | Public model hosts and CDNs, once, then cached | No |
| Nothing else | | |

A few developer tools look things up on purpose, for example DNS lookup over HTTPS or fetching a web page by URL. They say so in the tool, and they send only what you typed, never a file.

## Verify it yourself

You do not have to take my word for it. It takes a minute:

:::tabs browser
@tab Chrome and Edge
1. Open a tool, for example Merge PDF.
2. Press <kbd>F12</kbd> (or <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd> on a Mac) and open the **Network** tab.
3. Click the clear button so the list is empty.
4. Drop your files and run the tool.
5. Look at the list. You will see no request carrying your file. Filter by **Fetch/XHR** to make it obvious.
@tab Firefox
1. Open a tool.
2. Press <kbd>F12</kbd> and open the **Network** tab.
3. Click the bin icon to clear it.
4. Drop your files and run the tool.
5. No request sends your file. Click any request to see its size and where it went.
@tab Safari
1. Turn on the Develop menu: Safari, **Settings**, **Advanced**, **Show features for web developers**.
2. Open a tool, then **Develop**, **Show Web Inspector**, **Network**.
3. Clear the list, drop your files and run the tool.
4. No request carries your file.
:::

> [!TIP]
> For the strongest test, load a tool once, then turn on airplane mode or set DevTools to **Offline**, and run it. It still works, because nothing needs the network.

## What is stored on your device

| Where | What |
| --- | --- |
| IndexedDB | Favorites, recent tools, activity history (tool names, file names and sizes only), settings |
| Local storage | Small flags, Workspace recipes, Sketch boards |
| Cache storage | The offline app, engines and AI models |

None of it is sent anywhere. Clear it any time in [Settings](/settings), see [Offline and PWA](/docs/offline#clearing-data).

## Headers and permissions

The production deploy sends these security headers on every page:

::security-headers

- **Camera, microphone and screen capture** are allowed only for OpenFile's own origin, and only after you grant permission in the browser prompt. They are used by the recorders and the QR scanner.
- There is no Content Security Policy header yet. OpenFile loads its engines and models from a known list of hosts (the same ones the service worker caches), and a strict CSP that allows exactly those hosts is a sensible next step. Until then, the zero-upload design is what protects your files: there is simply no code path that sends them.

## No tracking

There are no analytics, ads, trackers or third-party cookies. There is no account. The optional API routes (health check, page fetch, link preview) only run when you use the few tools that need them, and never receive files.

## Open source

Every line is on [GitHub](https://github.com/aniruddhaadak80/OpenFile) under the MIT license, and every release is built in public by GitHub Actions. Found a problem? Report it privately through [GitHub security advisories](https://github.com/aniruddhaadak80/OpenFile/security/advisories/new).

# FAQ

## Privacy

### Are my files uploaded anywhere?

No. Every tool processes files inside your browser with JavaScript, WebAssembly and Canvas. There is no upload endpoint. You can even disconnect from the internet after the page has loaded. See [How OpenFile works](/docs/how-it-works).

### What does OpenFile download from the internet?

The app itself and, the first time you use certain tools, an open-source engine such as ffmpeg.wasm, Tesseract language data or an AI model. Those downloads contain **only the engine**; nothing about your file is sent.

### What do the server API routes see?

Only on the Vercel deployment, and only a **URL you type** (for example the page you want to convert with HTML to PDF). They never receive files. See the [API reference](/docs/api).

### Do you use cookies, analytics or trackers?

No accounts, no advertising cookies and no third-party trackers. Favorites, history and settings are stored only in your browser's IndexedDB. See [Favorites, history & settings](/docs/local-data).

## Usage

### Is OpenFile really free?

Yes. It is free and open source under the MIT license, with no premium tier, file-size caps, daily quotas or watermarks.

### Why is a tool slow the first time?

It is downloading its engine (for example ffmpeg.wasm, about 30 MB). The engine is cached, so later runs start immediately. The tool shows download progress while this happens.

### Is there a file size limit?

No artificial limit. The practical limit is your device's memory. Desktop browsers handle large PDFs and long videos well; on phones, split very large jobs.

### Can I process many files at once?

Most image tools accept batches and download a ZIP. For multi-step batches, use the [Workspace](/docs/workspace).

### Does it work offline?

Yes. After the first visit, the service worker serves the app from cache. Tools whose engine you have already used keep working offline.

### Can I install OpenFile as an app?

Yes, it is a Progressive Web App. Use your browser's **Install** option (Chrome, Edge) or **Share → Add to Home Screen** (iOS).

### Where are my favorites and history?

On the [History](/history) page and at the top of the home page. They are stored in this browser only. To move them to another device, use **Export** and **Import** in [Settings](/settings).

## Troubleshooting

### A tool says my PDF is encrypted

Open it with [Unlock PDF](/unlock-pdf) first (you need the password), then use the tool on the unlocked copy.

### Video processing fails or the tab crashes

The file is probably too large for the memory available. Trim it first, choose a lower resolution, or try a desktop browser.

### The AI tools are slow

They are fastest on browsers with WebGPU. Without it, they fall back to WebAssembly on the CPU, which works everywhere but takes longer. Smaller images and shorter audio help.

### The screen recorder is missing system audio

System audio capture depends on the browser and OS. In Chromium, share a **tab** and tick *Share tab audio*. Safari and mobile browsers do not support it.

### I cleared my browser data and lost my favorites

Favorites, history, Sketch boards and Workspace recipes live in browser storage, which clearing site data removes. Export your settings and save Sketch boards to files to keep backups.

## Project

### Can I self-host OpenFile?

Yes. It is a static site, so you can deploy it to Vercel, GitHub Pages, any static host or Docker. See [Self-hosting](/docs/self-hosting).

### How do I request a tool or report a bug?

Open an issue on [GitHub](https://github.com/aniruddhaadak80/OpenFile/issues). Pull requests are welcome, see [Contributing](/docs/contributing).

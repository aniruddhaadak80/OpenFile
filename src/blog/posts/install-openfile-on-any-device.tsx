import { Link } from 'react-router-dom'
import { H2, H3, Note, Tip, Table } from '../prose'
import { InstallCheckDemo } from '../demos-more'

export default function InstallAnywhere() {
  return <>
    <p>OpenFile started as a website, and it still is one. You can open a tool, drop a file and leave without installing anything. But a lot of people asked for an app they can pin to the taskbar, open from the dock, or launch on a train with no signal. With release v1.1.0 that now exists on every platform I could reach: a web app for any modern browser, desktop apps for Windows, macOS and Linux, an Android APK, and a home screen app for iPhone and iPad.</p>
    <p>This post walks through each option, explains what is actually different between them, and helps you pick one in about a minute.</p>
    <H2>Start with the check</H2>
    <p>The box below reads your browser's user agent and display mode and suggests the best fit. It also tells you whether the service worker, the piece that makes offline use possible, is already active on this device.</p>
    <InstallCheckDemo />
    <H2>Option one: the web app</H2>
    <p>For most people this is the right answer. A web app (also called a PWA, progressive web app) is the same site you already use, saved by your browser as an app. It gets its own window, its own icon, and a place in your app list. It weighs a few megabytes at first and grows only with the engines you actually use.</p>
    <H3>How to install it</H3>
    <ul>
      <li><strong>Chrome, Edge, Brave or Opera on a computer:</strong> click the Install button in the OpenFile header, or the small install icon at the right end of the address bar.</li>
      <li><strong>Safari on a Mac:</strong> File, then Add to Dock. This works on macOS Sonoma and later.</li>
      <li><strong>Android:</strong> open the browser menu (three dots) and choose Install app or Add to Home screen.</li>
      <li><strong>iPhone and iPad:</strong> open the site in Safari, tap Share, then Add to Home Screen. It opens full screen with no browser bars.</li>
    </ul>
    <p>Updates are automatic. When a new build is ready you see a small bar that says New version ready, reload. Click it and you are on the latest version. The app also checks for a new build when it starts and every half hour while it is open.</p>
    <Note title="Open with OpenFile">On desktop Chrome and Edge, the installed web app registers itself as a handler for common file types such as PDF. Once installed, you can right-click a file in your file manager and choose Open with, OpenFile. On Android the app also appears in the share sheet, so you can share a photo or a PDF straight into it.</Note>
    <H2>Option two: the desktop apps</H2>
    <p>Some people want a classic installer, or need the app on machines where browser installs are blocked by policy. For them there are native desktop builds on the GitHub releases page. They are made with Tauri, which wraps the same web build in a small native shell that uses the operating system's own web view.</p>
    <p>The big difference is what ships inside. The desktop apps bundle every engine (ffmpeg, OCR, the PDF engines, 7-Zip and the rest), so they work offline from the very first launch. The web app downloads each engine the first time you use a tool that needs it. Large AI models are the exception in both cases: they download once, the first time you use an AI tool, because bundling hundreds of megabytes of models nobody asked for would be rude.</p>
    <Table head={['Platform', 'What to download', 'About this big']} rows={[
      ['Windows 10 and 11', '.exe setup (recommended) or .msi for managed PCs', '70 to 90 MB'],
      ['macOS', 'one universal .dmg for Apple silicon and Intel', '160 to 180 MB'],
      ['Linux', 'AppImage for any distro, or .deb and .rpm', 'AppImage 160 to 180 MB, packages about 90 MB'],
      ['Android', 'APK from the latest release', 'about 100 MB'],
    ]} />
    <H3>The first launch warnings</H3>
    <p>I want to be upfront about this. The apps are not code signed or notarised yet, because both cost money every year and OpenFile is a free project. So the first launch shows a warning:</p>
    <ul>
      <li><strong>Windows</strong> may say Windows protected your PC. Click More info, then Run anyway.</li>
      <li><strong>macOS</strong> blocks a double-click on an app that is not notarised. In Applications, right-click OpenFile, choose Open, then Open again. You only do this once. If it still refuses, go to System Settings, Privacy and Security, and click Open Anyway.</li>
      <li><strong>Android</strong> asks you to allow installs from your browser or file manager the first time you open an APK.</li>
    </ul>
    <p>If those steps make you uneasy, use the web app instead. It runs in the browser sandbox you already trust and needs no warnings at all.</p>
    <H2>Option three: no install at all</H2>
    <p>This is still a perfectly good choice. Every tool works in a normal browser tab, there is no account and no extension. If you only need to merge two PDFs once a month, bookmarking the site is enough. Installing mostly buys you a separate window, an icon, and the comfort of knowing it works offline.</p>
    <H2>What stays the same everywhere</H2>
    <p>Whichever option you choose, the code doing the work is the same build. Files are processed on your device, never uploaded. Your settings, favorites and history live in local browser storage on that device. They do not sync between your phone and your laptop, because there is no server to sync through, but you can export your settings from the Settings page and import them on another device.</p>
    <H2>Updating and uninstalling</H2>
    <ul>
      <li><strong>Web app:</strong> updates itself. To remove it, open the menu in the app window and choose Uninstall, or remove it like any other app on your phone. To wipe everything, clear site data for OpenFile in your browser settings.</li>
      <li><strong>Windows:</strong> run the newest installer over the old one. Your settings stay. Uninstall from Settings, Apps, Installed apps.</li>
      <li><strong>macOS:</strong> drag the new version into Applications and choose Replace. To remove it, drag it to the Bin.</li>
      <li><strong>Linux:</strong> install the new package with the same command, or replace the AppImage file.</li>
      <li><strong>Android APK:</strong> install the new APK over the old one.</li>
    </ul>
    <Tip>On a shared or work computer, the web app is the lightest choice. It installs per user, needs no admin rights, and removing it leaves nothing behind.</Tip>
    <H2>Which one I use</H2>
    <p>On my laptop I use the installed web app from Chrome, because it updates the moment I push a fix. On my phone I use the Android web app for quick jobs like converting a HEIC photo before sending it. I keep the Windows desktop app on an old machine that rarely sees the internet, which is exactly the case it was built for.</p>
    <p>The full step by step guide, with pictures of where to click on each platform, lives on the <Link to="/install">Install page</Link>. If something does not work on your device, open an issue on GitHub and tell me the device and browser. That is the fastest way to get it fixed.</p>
  </>
}

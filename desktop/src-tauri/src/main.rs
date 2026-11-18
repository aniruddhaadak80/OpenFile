// OpenFile desktop: a native window around the same web build that runs at openfile-studio.vercel.app.
// Every tool runs locally inside the window; nothing is uploaded.
//
// Updates (src/lib/app/updateDesktop.ts drives these commands):
//  - of_update_check:    asks the signed update feed (latest.json on GitHub Releases, or a beta feed) for a newer build
//  - of_update_download: downloads it in the background, progress readable through of_update_progress
//  - of_update_install:  installs the downloaded bundle and relaunches OpenFile
//  - of_update_on_exit:  when "Auto install updates" is on and the user picks Later, install when the app quits
//  - of_prefs_get/set:   update preferences in the app config folder, so they are the same for the bundled
//                        copy and for the hosted web version loaded inside the window (hybrid mode)
// Every bundle is verified against the public key in tauri.conf.json before it is installed (the updater refuses
// unsigned or tampered files).
//
// Rollback: before an update is installed the running version is recorded. The new version counts its starts
// until the interface reports it is healthy (of_mark_healthy). If it fails to get there three times in a row,
// OpenFile offers to reinstall the previous signed release. Settings also has a one-click "Roll back" while the
// previous version is known (of_rollback_info, of_rollback).
//
// Navigation stays inside the bundled app or the hosted copy at aniruddhaadak80.github.io/OpenFile/.
// Every other web link opens in the default browser.
//
// Start up on Linux (issue #10, a black window on Fedora 44 GNOME Wayland): WebKitGTK 2.42 and newer draws pages
// through a DMA-BUF renderer that fails on many GPU, driver and compositor mixes (NVIDIA most often, also some
// Mesa and Wayland setups), and on some drivers (nouveau on older NVIDIA cards) any GPU drawing hangs the web
// process. The page never paints and the window stays the colour of its background. See linux_gpu.rs: OpenFile
// picks a graphics level (standard, safe, software) before GTK starts, starts nouveau-only systems in software
// mode, and the page tells the shell when its first frame is on screen (of_boot_ok, sent from index.html). If no
// frame arrives within BOOT_TIMEOUT, OpenFile restarts one level up and remembers it. At the last level it offers
// to open the same tools in the web browser instead of leaving an empty window.
//   OPENFILE_SAFE_GPU=1   start in safe graphics mode right away (2 or software: software mode)
//   OPENFILE_GPU=1        keep the WebKitGTK defaults and ignore the remembered mode
// Any WEBKIT_* or LIBGL_* variable you set yourself always wins.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, RunEvent, State, Url};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

const HOSTED_HOST: &str = "aniruddhaadak80.github.io";
const HOSTED_PATH: &str = "/OpenFile";
const RELEASES: &str = "https://github.com/aniruddhaadak80/OpenFile/releases";
/// starts without reaching a healthy interface before OpenFile offers a rollback
const FAILED_STARTS: u32 = 3;
/// how long the first frame may take to reach the screen before Linux restarts OpenFile one graphics level up
#[cfg(target_os = "linux")]
const BOOT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const TROUBLESHOOTING: &str = "https://aniruddhaadak80.github.io/OpenFile/docs/troubleshooting";

#[cfg(target_os = "linux")]
mod linux_gpu;

/// Set once the page reports its first frame on screen (of_boot_ok) or, for the log, once the first page loaded.
#[derive(Default)]
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
struct Boot {
    drawn: AtomicBool,
    loaded: AtomicBool,
}

#[derive(Default)]
struct Updates {
    pending: Mutex<Option<Update>>,
    bytes: Mutex<Option<Vec<u8>>>,
    downloaded: AtomicU64,
    total: AtomicU64,
    downloading: AtomicBool,
    install_on_exit: AtomicBool,
}

#[derive(Serialize)]
struct UpdateMeta {
    version: String,
    current: String,
    date: Option<String>,
    notes: Option<String>,
    /// staged rollout: share of installs (0 to 100) that get this release from automatic checks, from latest.json
    rollout: Option<u64>,
}

#[derive(Serialize)]
struct Progress {
    downloaded: u64,
    total: u64,
    downloading: bool,
    ready: bool,
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    os: String,
    arch: String,
}

/// update-health.json in the app config folder
#[derive(Serialize, Deserialize, Default, Clone)]
struct Health {
    /// version this record is about
    version: String,
    /// starts of that version that have not reached a healthy interface yet
    starts: u32,
    healthy: bool,
    /// the version that was running before the last update was installed
    previous: Option<String>,
}

fn config_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(name))
}

fn read_health(app: &AppHandle) -> Health {
    config_file(app, "update-health.json")
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_health(app: &AppHandle, h: &Health) {
    if let Some(p) = config_file(app, "update-health.json") {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(s) = serde_json::to_string_pretty(h) {
            let _ = std::fs::write(p, s);
        }
    }
}

fn current_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

/// only the project's own release feeds are accepted as an update source
fn feed_url(ep: &str) -> Result<Url, String> {
    let url = Url::parse(ep).map_err(|e| e.to_string())?;
    if url.scheme() != "https" || url.host_str() != Some("github.com") || !url.path().starts_with("/aniruddhaadak80/OpenFile/releases/") {
        return Err("update feed not allowed".into());
    }
    Ok(url)
}

#[tauri::command]
fn of_app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: current_version(&app),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

#[tauri::command]
async fn of_update_check(app: AppHandle, state: State<'_, Updates>, endpoint: Option<String>) -> Result<Option<UpdateMeta>, String> {
    let mut builder = app.updater_builder();
    if let Some(ep) = endpoint.filter(|e| !e.is_empty()) {
        builder = builder.endpoints(vec![feed_url(&ep)?]).map_err(|e| e.to_string())?;
    }
    let updater = builder.build().map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?;
    let meta = found.as_ref().map(|u| UpdateMeta {
        version: u.version.clone(),
        current: u.current_version.clone(),
        date: u.date.map(|d| d.to_string()),
        notes: u.body.clone(),
        rollout: u.raw_json.get("rollout").and_then(|v| v.as_u64()).map(|v| v.min(100)),
    });
    store_pending(&state, found);
    Ok(meta)
}

fn store_pending(state: &Updates, found: Option<Update>) {
    let mut pending = state.pending.lock().unwrap();
    let same = match (pending.as_ref(), found.as_ref()) {
        (Some(a), Some(b)) => a.version == b.version,
        _ => false,
    };
    if !same {
        *state.bytes.lock().unwrap() = None;
        state.downloaded.store(0, Ordering::SeqCst);
        state.total.store(0, Ordering::SeqCst);
        *pending = found;
    }
}

#[tauri::command]
async fn of_update_download(state: State<'_, Updates>) -> Result<(), String> {
    download(&state).await
}

async fn download(state: &Updates) -> Result<(), String> {
    let have = state.bytes.lock().unwrap().is_some();
    if have {
        return Ok(());
    }
    if state.downloading.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let update = state.pending.lock().unwrap().clone();
    let Some(update) = update else {
        state.downloading.store(false, Ordering::SeqCst);
        return Err("no update to download".into());
    };
    state.downloaded.store(0, Ordering::SeqCst);
    let result = update
        .download(
            |chunk, total| {
                state.downloaded.fetch_add(chunk as u64, Ordering::SeqCst);
                if let Some(t) = total {
                    state.total.store(t, Ordering::SeqCst);
                }
            },
            || {},
        )
        .await;
    state.downloading.store(false, Ordering::SeqCst);
    let bytes = result.map_err(|e| e.to_string())?;
    *state.bytes.lock().unwrap() = Some(bytes);
    Ok(())
}

#[tauri::command]
fn of_update_progress(state: State<'_, Updates>) -> Progress {
    Progress {
        downloaded: state.downloaded.load(Ordering::SeqCst),
        total: state.total.load(Ordering::SeqCst),
        downloading: state.downloading.load(Ordering::SeqCst),
        ready: state.bytes.lock().unwrap().is_some(),
    }
}

/// Installs the downloaded bundle. Records the running version first, so a failed start can roll back.
/// `previous` is the version a later rollback returns to (None after a rollback, so nothing older is offered).
fn install_now(app: &AppHandle, state: &Updates, previous: Option<String>) -> Result<bool, String> {
    let update = state.pending.lock().unwrap().clone();
    let bytes = state.bytes.lock().unwrap().take();
    match (update, bytes) {
        (Some(u), Some(b)) => {
            let before = read_health(app);
            write_health(app, &Health { version: u.version.clone(), starts: 0, healthy: false, previous });
            if let Err(e) = u.install(b) {
                write_health(app, &before); // nothing changed on disk, keep the old record
                return Err(e.to_string());
            }
            Ok(true)
        }
        _ => Ok(false),
    }
}

#[tauri::command]
async fn of_update_install(app: AppHandle, state: State<'_, Updates>) -> Result<(), String> {
    download(&state).await?;
    if install_now(&app, &state, Some(current_version(&app)))? {
        app.restart();
    }
    Err("the update was not downloaded".into())
}

#[tauri::command]
fn of_update_on_exit(state: State<'_, Updates>, enabled: bool) {
    state.install_on_exit.store(enabled, Ordering::SeqCst);
}

/// The interface calls this once it has rendered: this version starts fine.
#[tauri::command]
fn of_mark_healthy(app: AppHandle) {
    let mut h = read_health(&app);
    let current = current_version(&app);
    if h.version != current {
        h = Health { version: current, starts: 0, healthy: true, previous: h.previous };
    }
    h.starts = 0;
    h.healthy = true;
    write_health(&app, &h);
}

#[derive(Serialize)]
struct RollbackInfo {
    previous: Option<String>,
    current: String,
}

#[tauri::command]
fn of_rollback_info(app: AppHandle) -> RollbackInfo {
    let h = read_health(&app);
    let current = current_version(&app);
    RollbackInfo { previous: h.previous.filter(|p| *p != current), current }
}

/// Reinstalls the previous version from its own signed release feed (releases/download/v<previous>/latest.json).
async fn rollback(app: &AppHandle, state: &Updates) -> Result<(), String> {
    let h = read_health(app);
    let current = current_version(app);
    let prev = h.previous.clone().filter(|p| *p != current).ok_or("no previous version is known")?;
    let url = feed_url(&format!("{RELEASES}/download/v{prev}/latest.json"))?;
    let want = prev.clone();
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        // a rollback is a downgrade: accept exactly the recorded previous version
        .version_comparator(move |_current, remote| remote.version.to_string() == want)
        .build()
        .map_err(|e| e.to_string())?;
    let found = updater.check().await.map_err(|e| e.to_string())?.ok_or(format!("v{prev} is not available to reinstall"))?;
    *state.pending.lock().unwrap() = Some(found);
    *state.bytes.lock().unwrap() = None;
    download(state).await?;
    // after a rollback, nothing older is offered again
    if install_now(app, state, None)? {
        app.restart();
    }
    Err("the previous version could not be installed".into())
}

#[tauri::command]
async fn of_rollback(app: AppHandle, state: State<'_, Updates>) -> Result<(), String> {
    rollback(&app, &state).await
}

#[tauri::command]
fn of_prefs_get(app: AppHandle) -> String {
    config_file(&app, "update-prefs.json").and_then(|p| std::fs::read_to_string(p).ok()).unwrap_or_else(|| "{}".into())
}

#[tauri::command]
fn of_prefs_set(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let p = config_file(&app, "update-prefs.json").ok_or("no config folder")?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, json).map_err(|e| e.to_string())
}

/// Counts this start. After FAILED_STARTS starts without a healthy interface, offers to roll back.
fn startup_health(app: &AppHandle) {
    let current = current_version(app);
    let mut h = read_health(app);
    if h.version != current {
        // first start of a version that was not installed through the updater: nothing to roll back to
        h = Health { version: current.clone(), starts: 0, healthy: false, previous: if h.version.is_empty() { None } else { h.previous } };
    }
    if h.healthy {
        h.starts = 0;
        h.healthy = false;
    }
    h.starts += 1;
    write_health(app, &h);
    let Some(prev) = h.previous.clone().filter(|p| *p != current) else { return };
    if h.starts < FAILED_STARTS {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let yes = app
            .dialog()
            .message(format!(
                "OpenFile {current} did not finish starting the last {} times. Roll back to {prev}? The previous signed release is downloaded from GitHub and OpenFile restarts.",
                FAILED_STARTS - 1
            ))
            .title("OpenFile update")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(format!("Roll back to {prev}"), "Keep this version".into()))
            .blocking_show();
        let state = app.state::<Updates>();
        if yes {
            if let Err(e) = tauri::async_runtime::block_on(rollback(&app, &state)) {
                app.dialog().message(format!("Rollback failed: {e}. You can download any version from {RELEASES}")).title("OpenFile update").kind(MessageDialogKind::Error).blocking_show();
            }
        } else {
            let mut h = read_health(&app);
            h.starts = 0;
            write_health(&app, &h);
        }
    });
}

/// The bundled app (tauri://localhost, http(s)://tauri.localhost) and the hosted copy stay in the window.
fn allowed_in_window(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "blob" | "data" => true,
        "http" | "https" => match url.host_str() {
            Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1") => true,
            Some(h) if h == HOSTED_HOST => url.path() == HOSTED_PATH || url.path().starts_with(&format!("{HOSTED_PATH}/")),
            _ => false,
        },
        _ => false,
    }
}

/// The page calls this once its first frame is on screen (index.html, before the app code loads). Linux uses it to
/// tell a window that draws from one that stays empty.
#[tauri::command]
fn of_boot_ok(boot: State<'_, Boot>) {
    if !boot.drawn.swap(true, Ordering::SeqCst) {
        eprintln!("OpenFile: first frame drawn");
    }
}

/// Linux: when no frame has reached the screen after BOOT_TIMEOUT, the web process is stuck or draws nothing
/// (usually in GPU setup). Restart one graphics level up and remember it, instead of leaving an empty window. At the
/// last level (or when OPENFILE_GPU=1 asks for the WebKitGTK defaults) there is nothing safer to restart into, so
/// offer the same tools in the web browser.
#[cfg(target_os = "linux")]
fn boot_watchdog(app: AppHandle, plan: linux_gpu::Plan) {
    std::thread::spawn(move || {
        std::thread::sleep(BOOT_TIMEOUT);
        let boot = app.state::<Boot>();
        if boot.drawn.load(Ordering::SeqCst) {
            return;
        }
        let what = if boot.loaded.load(Ordering::SeqCst) { "loaded but drew nothing" } else { "did not load" };
        if plan.managed && plan.level < linux_gpu::MAX_LEVEL {
            let next = plan.level + 1;
            eprintln!(
                "OpenFile: the window {what} in {} s, restarting in {} graphics mode (OPENFILE_GPU=1 turns this off)",
                BOOT_TIMEOUT.as_secs(),
                linux_gpu::level_name(next, true)
            );
            linux_gpu::remember_level(next);
            match linux_gpu::relaunch(next) {
                Ok(()) => app.exit(0),
                Err(e) => eprintln!("OpenFile: could not restart: {e}. Start it with OPENFILE_SAFE_GPU={next}, see {TROUBLESHOOTING}"),
            }
            return;
        }
        eprintln!(
            "OpenFile: the window {what} in {} s in {} graphics mode. See {TROUBLESHOOTING}#desktop-app-does-not-start",
            BOOT_TIMEOUT.as_secs(),
            linux_gpu::level_name(plan.level, plan.managed)
        );
        let open = app
            .dialog()
            .message(format!(
                "OpenFile could not draw its window with this graphics driver. The same tools work in your web browser and still run on your device, nothing is uploaded.\n\nThe troubleshooting guide has more fixes: {TROUBLESHOOTING}"
            ))
            .title("OpenFile")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Open in browser".into(), "Keep waiting".into()))
            .blocking_show();
        // the page may have drawn while the question was open
        if open && !app.state::<Boot>().drawn.load(Ordering::SeqCst) {
            let _ = app.opener().open_url(format!("https://{HOSTED_HOST}{HOSTED_PATH}/"), None::<&str>);
            app.exit(0);
        }
    });
}

/// The window could not be created (Windows without the WebView2 runtime, Linux without WebKitGTK or a display).
/// Say what to do instead of exiting silently.
fn startup_failed(err: tauri::Error) -> ! {
    eprintln!("OpenFile could not open its window: {err}");
    #[cfg(target_os = "windows")]
    {
        eprintln!("OpenFile needs the Microsoft Edge WebView2 Runtime. Install it from https://developer.microsoft.com/microsoft-edge/webview2/ and start OpenFile again.");
        let _ = std::process::Command::new("explorer.exe").arg(format!("{TROUBLESHOOTING}#desktop-app-does-not-start")).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        eprintln!("Try OPENFILE_SAFE_GPU=1 openfile, and make sure WebKitGTK 4.1 (libwebkit2gtk-4.1) is installed.");
    }
    eprintln!("Help: {TROUBLESHOOTING}");
    std::process::exit(1);
}

fn main() {
    #[cfg(target_os = "linux")]
    let gpu = linux_gpu::prepare();

    let navigation = tauri::plugin::Builder::<tauri::Wry>::new("of-navigation")
        .on_navigation(|webview, url| {
            if allowed_in_window(url) {
                return true;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = webview.app_handle().opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(navigation)
        .manage(Updates::default())
        .manage(Boot::default())
        .on_page_load(|webview, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                webview.app_handle().state::<Boot>().loaded.store(true, Ordering::SeqCst);
            }
        })
        .setup(move |app| {
            startup_health(app.handle());
            #[cfg(target_os = "linux")]
            boot_watchdog(app.handle().clone(), gpu);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            of_boot_ok,
            of_app_info,
            of_update_check,
            of_update_download,
            of_update_progress,
            of_update_install,
            of_update_on_exit,
            of_mark_healthy,
            of_rollback_info,
            of_rollback,
            of_prefs_get,
            of_prefs_set
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| startup_failed(e))
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let state = app.state::<Updates>();
                if state.install_on_exit.load(Ordering::SeqCst) {
                    let _ = install_now(app, &state, Some(current_version(app)));
                }
            }
        });
}

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

fn main() {
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
        .setup(|app| {
            startup_health(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
        .expect("error while running OpenFile")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let state = app.state::<Updates>();
                if state.install_on_exit.load(Ordering::SeqCst) {
                    let _ = install_now(app, &state, Some(current_version(app)));
                }
            }
        });
}

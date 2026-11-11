//! WebKitGTK graphics settings for Linux (issue #10: a black or empty window on first start).
//!
//! `prepare()` runs in main() before GTK or any thread starts, because changing the environment is only safe then.
//! It picks one of three graphics levels and sets the matching WebKitGTK variables, never overriding a variable the
//! user set:
//!
//!   0 standard  the DMA-BUF renderer is off (it fails with many GPU, driver and compositor mixes); pages still use
//!               the GPU through the older path
//!   1 safe      also no GPU compositing (WEBKIT_DISABLE_COMPOSITING_MODE=1)
//!   2 software  also no GPU at all: Mesa draws on the CPU (LIBGL_ALWAYS_SOFTWARE=1) and Skia rasterises on the CPU
//!               (WEBKIT_SKIA_ENABLE_CPU_RENDERING=1). For drivers whose OpenGL hangs or crashes the web process,
//!               such as nouveau on older NVIDIA cards (a GeForce GT 730 on Fedora 44 in issue #10), where levels 0
//!               and 1 still leave the window empty.
//!
//! Systems whose only GPU driver is nouveau start at level 2. Every other system starts at level 0 and the boot
//! watchdog in main.rs moves one level up (and remembers it) when the first frame has not been drawn in time.
//!
//!   OPENFILE_SAFE_GPU=1          start at level 1 (2 for level 2, also `software`)
//!   OPENFILE_GPU=1               keep the WebKitGTK defaults and ignore the remembered level and the driver check
//!   WEBKIT_* and LIBGL_* you set yourself always win.

use std::env;
use std::path::{Path, PathBuf};

const IDENTIFIER: &str = "com.aniruddhaadak.openfile";
const MARKER: &str = "safe-graphics";
/// the highest level; the watchdog does not restart past it
pub const MAX_LEVEL: u8 = 2;

fn flag(name: &str) -> bool {
    matches!(env::var(name).as_deref(), Ok("1") | Ok("true") | Ok("yes"))
}

/// sets a variable only when the user has not set it already
fn set_default(name: &str, value: &str) {
    if env::var_os(name).is_none() {
        env::set_var(name, value);
    }
}

/// OPENFILE_SAFE_GPU as a level: unset or off is 0, `software` or 2 and up is 2, any other value that turns it on is 1
pub fn parse_level_var(value: Option<&str>) -> u8 {
    let Some(v) = value.map(|v| v.trim().to_ascii_lowercase()) else { return 0 };
    match v.as_str() {
        "" | "0" | "false" | "no" | "off" => 0,
        "software" | "cpu" => MAX_LEVEL,
        _ => v.parse::<u8>().map(|n| n.min(MAX_LEVEL)).unwrap_or(1),
    }
}

/// The level stored in the marker file. Files written by earlier builds hold only a sentence, which meant safe mode.
pub fn parse_marker(content: &str) -> u8 {
    content
        .lines()
        .find_map(|l| l.trim().strip_prefix("level="))
        .and_then(|n| n.trim().parse::<u8>().ok())
        .map(|n| n.clamp(1, MAX_LEVEL))
        .unwrap_or(1)
}

/// Drivers that are not real GPUs: firmware framebuffers that sit beside the real driver during boot.
fn is_framebuffer(driver: &str) -> bool {
    matches!(driver, "simple-framebuffer" | "simpledrm" | "efi-framebuffer" | "efifb" | "vesafb" | "vesa-framebuffer")
}

/// True when nouveau drives every real GPU, so Mesa has no other GPU to draw with. A laptop with an Intel or AMD
/// GPU beside a nouveau one draws with the other GPU by default and keeps hardware drawing.
pub fn nouveau_only<S: AsRef<str>>(drivers: &[S]) -> bool {
    let real: Vec<&str> = drivers.iter().map(|d| d.as_ref()).filter(|d| !is_framebuffer(d)).collect();
    !real.is_empty() && real.iter().all(|d| *d == "nouveau")
}

/// The kernel drivers behind /sys/class/drm/cardN (connector entries such as card0-HDMI-A-1 are skipped).
fn gpu_drivers(drm: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(drm) else { return Vec::new() };
    let mut out = Vec::new();
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let Some(rest) = name.strip_prefix("card") else { continue };
        if rest.is_empty() || !rest.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if let Ok(target) = std::fs::read_link(e.path().join("device").join("driver")) {
            if let Some(d) = target.file_name() {
                out.push(d.to_string_lossy().into_owned());
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

/// What to start with, from the user's switches, the remembered level and the GPU drivers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Plan {
    pub level: u8,
    /// false when OPENFILE_GPU=1 asks for the WebKitGTK defaults
    pub managed: bool,
    pub nouveau: bool,
}

pub fn plan(keep_gpu: bool, asked: u8, remembered: u8, nouveau: bool) -> Plan {
    if keep_gpu {
        return Plan { level: 0, managed: false, nouveau };
    }
    let floor = if nouveau { MAX_LEVEL } else { 0 };
    Plan { level: asked.max(remembered).max(floor).min(MAX_LEVEL), managed: true, nouveau }
}

/// The WebKitGTK and Mesa variables for a level, in the order they are set.
pub fn vars_for(level: u8) -> Vec<(&'static str, &'static str)> {
    let mut v = vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1")];
    if level >= 1 {
        v.push(("WEBKIT_DISABLE_COMPOSITING_MODE", "1"));
    }
    if level >= 2 {
        v.push(("LIBGL_ALWAYS_SOFTWARE", "1"));
        v.push(("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1"));
    }
    v
}

pub fn level_name(level: u8, managed: bool) -> &'static str {
    match (managed, level) {
        (false, _) => "full GPU",
        (true, 0) => "standard",
        (true, 1) => "safe",
        _ => "software",
    }
}

/// the app config folder (the same one Tauri uses), found without starting Tauri
pub fn config_dir() -> Option<PathBuf> {
    let base = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
        .or_else(|| env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join(IDENTIFIER))
}

fn marker() -> Option<PathBuf> {
    config_dir().map(|d| d.join(MARKER))
}

fn remembered_level() -> u8 {
    marker().and_then(|p| std::fs::read_to_string(p).ok()).map(|s| parse_marker(&s)).unwrap_or(0)
}

/// remembers a graphics level for the next starts
pub fn remember_level(level: u8) {
    if let Some(p) = marker() {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let level = level.clamp(1, MAX_LEVEL);
        let _ = std::fs::write(
            p,
            format!(
                "level={level}\nOpenFile starts in {} graphics mode. Delete this file, or start once with OPENFILE_GPU=1, to try the faster mode again.\n",
                level_name(level, true)
            ),
        );
    }
}

/// Sets the graphics variables for this start and returns the plan it runs with.
pub fn prepare() -> Plan {
    let keep_gpu = flag("OPENFILE_GPU");
    let nouveau = !keep_gpu && nouveau_only(&gpu_drivers(Path::new("/sys/class/drm")));
    let p = plan(keep_gpu, parse_level_var(env::var("OPENFILE_SAFE_GPU").ok().as_deref()), remembered_level(), nouveau);
    if p.managed {
        for (name, value) in vars_for(p.level) {
            set_default(name, value);
        }
    }
    // NVIDIA on Wayland: explicit sync in older WebKitGTK builds ends in "Error 71 (Protocol error)"
    let wayland = env::var_os("WAYLAND_DISPLAY").is_some() || env::var("XDG_SESSION_TYPE").as_deref() == Ok("wayland");
    if wayland && Path::new("/proc/driver/nvidia/version").exists() {
        set_default("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }
    let show = |n: &str| env::var(n).unwrap_or_else(|_| "unset".into());
    eprintln!(
        "OpenFile: {} graphics mode{} (WEBKIT_DISABLE_DMABUF_RENDERER={}, WEBKIT_DISABLE_COMPOSITING_MODE={}, LIBGL_ALWAYS_SOFTWARE={})",
        level_name(p.level, p.managed),
        if p.nouveau { ", nouveau driver" } else { "" },
        show("WEBKIT_DISABLE_DMABUF_RENDERER"),
        show("WEBKIT_DISABLE_COMPOSITING_MODE"),
        show("LIBGL_ALWAYS_SOFTWARE"),
    );
    p
}

/// Starts a new OpenFile at the given graphics level. For an AppImage this is the AppImage file itself, because the
/// running copy lives in a mount that goes away when this process exits.
pub fn relaunch(level: u8) -> std::io::Result<()> {
    let appimage = env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.exists());
    let exe = match appimage.clone() {
        Some(p) => p,
        None => env::current_exe()?,
    };
    let mut cmd = std::process::Command::new(exe);
    if appimage.is_some() {
        // the new AppImage mounts itself again; paths into this copy's mount stop working when it exits
        cmd.env_remove("APPDIR");
    }
    cmd.args(env::args_os().skip(1)).env("OPENFILE_SAFE_GPU", level.to_string());
    // this process already holds the user's own values and this level's defaults; add only what the new level needs
    for (name, value) in vars_for(level) {
        if env::var_os(name).is_none() {
            cmd.env(name, value);
        }
    }
    cmd.spawn().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_var() {
        assert_eq!(parse_level_var(None), 0);
        assert_eq!(parse_level_var(Some("0")), 0);
        assert_eq!(parse_level_var(Some("off")), 0);
        assert_eq!(parse_level_var(Some("1")), 1);
        assert_eq!(parse_level_var(Some("true")), 1);
        assert_eq!(parse_level_var(Some("yes")), 1);
        assert_eq!(parse_level_var(Some("2")), 2);
        assert_eq!(parse_level_var(Some("9")), 2);
        assert_eq!(parse_level_var(Some("Software")), 2);
    }

    #[test]
    fn marker_levels() {
        // a marker written by the earlier build (one sentence, no level) still means safe mode
        assert_eq!(parse_marker("OpenFile starts in safe graphics mode. Delete this file...\n"), 1);
        assert_eq!(parse_marker("level=2\nOpenFile starts in software graphics mode.\n"), 2);
        assert_eq!(parse_marker("level=7\n"), 2);
        assert_eq!(parse_marker("level=0\n"), 1);
        assert_eq!(parse_marker(""), 1);
    }

    #[test]
    fn nouveau_detection() {
        assert!(nouveau_only(&["nouveau"]));
        assert!(nouveau_only(&["nouveau", "simple-framebuffer"]));
        assert!(!nouveau_only(&["i915", "nouveau"]));
        assert!(!nouveau_only(&["amdgpu"]));
        assert!(!nouveau_only(&["nvidia"]));
        assert!(!nouveau_only::<&str>(&[]));
        assert!(!nouveau_only(&["simpledrm"]));
    }

    #[test]
    fn plans() {
        assert_eq!(plan(false, 0, 0, false), Plan { level: 0, managed: true, nouveau: false });
        assert_eq!(plan(false, 0, 1, false).level, 1);
        assert_eq!(plan(false, 1, 0, false).level, 1);
        assert_eq!(plan(false, 0, 0, true).level, 2);
        assert_eq!(plan(false, 2, 1, false).level, 2);
        // OPENFILE_GPU=1 wins over everything
        assert_eq!(plan(true, 2, 2, true), Plan { level: 0, managed: false, nouveau: true });
    }

    #[test]
    fn variables() {
        assert_eq!(vars_for(0), vec![("WEBKIT_DISABLE_DMABUF_RENDERER", "1")]);
        assert_eq!(vars_for(1).len(), 2);
        let v = vars_for(2);
        assert!(v.contains(&("LIBGL_ALWAYS_SOFTWARE", "1")));
        assert!(v.contains(&("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1")));
        assert!(v.contains(&("WEBKIT_DISABLE_COMPOSITING_MODE", "1")));
    }

    #[test]
    fn drivers_from_sysfs() {
        let root = std::env::temp_dir().join(format!("openfile-drm-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let mk = |card: &str, driver: &str| {
            let dev = root.join(card).join("device");
            std::fs::create_dir_all(&dev).unwrap();
            let target = root.join("drivers").join(driver);
            std::fs::create_dir_all(&target).unwrap();
            std::os::unix::fs::symlink(&target, dev.join("driver")).unwrap();
        };
        mk("card0", "simple-framebuffer");
        mk("card1", "nouveau");
        mk("card1-HDMI-A-1", "ignored");
        std::fs::create_dir_all(root.join("renderD128")).unwrap();
        assert_eq!(gpu_drivers(&root), vec!["nouveau".to_string(), "simple-framebuffer".to_string()]);
        assert!(nouveau_only(&gpu_drivers(&root)));
        mk("card2", "i915");
        assert!(!nouveau_only(&gpu_drivers(&root)));
        assert!(gpu_drivers(&root.join("missing")).is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }
}

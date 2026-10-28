// OpenFile desktop: a native window around the same web build that runs at openfile-studio.vercel.app.
// Every tool runs locally inside the window; nothing is uploaded.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running OpenFile");
}

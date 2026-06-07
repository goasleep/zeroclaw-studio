//! ZeroClaw Workspace — application library.
//!
//! Phase 0: minimum viable Tauri builder. Connection management, gateway
//! client, and workspace capabilities land in Phase 1+.

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

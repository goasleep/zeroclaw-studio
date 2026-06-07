//! ZeroClaw Workspace — Tauri entry point.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    zeroclaw_workspace_lib::run();
}

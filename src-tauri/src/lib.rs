//! ZeroClaw Workspace — application library.

pub mod commands;
pub mod connection;
pub mod gateway;
pub mod process_io;
pub mod runtime;
pub mod workspace;

use commands::fs::WatcherHandle;
use connection::ssh::TunnelRegistry;
use connection::store::ConnectionBook;
use runtime::supervisor::Supervisor;
use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, RunEvent};
use workspace::fs::WorkspaceState;

const MENU_FOCUS_CHAT: &str = "menu_focus_chat";
const MENU_FOCUS_CODE: &str = "menu_focus_code";
const MENU_OPEN_PROJECT: &str = "menu_open_project";
const MENU_NEW_SESSION: &str = "menu_new_session";
const MENU_REFRESH_SESSIONS: &str = "menu_refresh_sessions";
const MENU_RETRY_CONNECTION: &str = "menu_retry_connection";
const MENU_OPEN_SETTINGS: &str = "menu_open_settings";
const MENU_OPEN_LOGS: &str = "menu_open_logs";
const MENU_OPEN_DOCTOR: &str = "menu_open_doctor";
const TRAY_SHOW_HIDE: &str = "tray_show_hide";
const TRAY_FOCUS_CHAT: &str = "tray_focus_chat";
const TRAY_RETRY_CONNECTION: &str = "tray_retry_connection";
const TRAY_OPEN_SETTINGS: &str = "tray_open_settings";
const TRAY_OPEN_LOGS: &str = "tray_open_logs";
const TRAY_QUIT: &str = "tray_quit";

pub fn run() {
    let book = ConnectionBook::new();
    let tunnels = TunnelRegistry::new();
    let supervisor = Supervisor::new();
    let workspace_state = Arc::new(WorkspaceState::default());
    let watcher: Arc<WatcherHandle> = Arc::new(WatcherHandle::default());
    let chat_manager = commands::chat::ChatSessionManager::new();

    // App-wide HTTP client. `reqwest::Client` is cheap to clone (the
    // connection pool is reference-counted) and reusing one keeps HTTP
    // keep-alive / TLS sessions alive across all gateway traffic: the
    // frontend's `gateway_request` IPC and the background health poller.
    let http_client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .expect("failed to build app-wide reqwest client");

    // Stash clones for the RunEvent handler below — they need to outlive
    // the Builder closures.
    let supervisor_for_exit = supervisor.clone();
    let tunnels_for_exit = tunnels.clone();

    // tauri-specta: collects every `#[specta::specta]` command into both the
    // invoke handler and the TypeScript bindings. In debug builds we also write
    // `src/api/bindings.ts` so the frontend types stay in lockstep with Rust.
    // Run `cargo test export_bindings` to regenerate without booting the app.
    let specta = specta_builder();
    #[cfg(debug_assertions)]
    specta
        .export(typescript_bindings(), "../src/api/bindings.ts")
        .expect("failed to export TypeScript bindings");

    let app = tauri::Builder::default()
        // Single-instance guard: a second launch focuses the existing window
        // instead of starting a second gateway supervisor / spawning a
        // conflicting child process. Registered first so it short-circuits
        // the duplicate before any other plugin initialises.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // Log plugin so plugin init and command output are captured.
        // Stdout mirrors to the terminal; LogDir writes a rotating file under
        // the OS app-data dir for post-mortem. Level is Info in release, Debug
        // in debug builds (see LevelFilter below).
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(book.clone())
        .manage(tunnels.clone())
        .manage(supervisor.clone())
        .manage(workspace_state.clone())
        .manage(watcher.clone())
        .manage(chat_manager.clone())
        .manage(http_client.clone())
        .invoke_handler(specta.invoke_handler())
        .on_menu_event(|app, event| handle_app_menu_event(app, event.id().as_ref()))
        .setup({
            let book = book.clone();
            let supervisor = supervisor.clone();
            move |app| {
                let app_handle = app.handle().clone();
                let book_for_setup = book.clone();
                let supervisor_for_setup = supervisor.clone();
                install_app_menu(app.handle())?;
                install_tray(app.handle())?;
                // Load saved connections, then auto-onboard (first-run only)
                // and auto-activate the persisted active one — the
                // "open the app, it just works" path:
                //   1. load disk state
                //   2. if no connections AND a local zeroclaw is detectable,
                //      synthesise + persist a Local connection (idempotent)
                //   3. if there's an active connection, run the activator
                //      (probe → spawn local if needed → wait healthy → pair)
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = book_for_setup.load(&app_handle).await {
                        log::error!("failed to load connections: {e}");
                        return;
                    }
                    match connection::bootstrap::try_auto_onboard(&app_handle, &book_for_setup)
                        .await
                    {
                        Ok(outcome) => {
                            log::info!("[bootstrap] auto-onboard outcome: {outcome:?}");
                        }
                        Err(e) => {
                            log::warn!("[bootstrap] auto-onboard failed: {e}");
                        }
                    }
                    if book_for_setup.prefer_usable_local_active().await
                        && let Err(e) = book_for_setup.save(&app_handle).await
                    {
                        log::error!("[bootstrap] failed to persist active migration: {e}");
                    }
                    if let Some(conn) = book_for_setup.active().await {
                        connection::activator::activate(
                            &app_handle,
                            &conn,
                            &book_for_setup,
                            &supervisor_for_setup,
                        )
                        .await;
                    }
                });
                gateway::health::spawn_health_poller(
                    app.handle().clone(),
                    book.clone(),
                    http_client,
                );
                Ok(())
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Drive the event loop ourselves so we can hook RunEvent::Exit — on
    // macOS Cmd-Q the WindowEvent::Destroyed path either doesn't fire
    // (Tauri tears down before window events propagate) or fires after
    // the supervisor has been dropped; using RunEvent::Exit / ExitRequested
    // guarantees we get a final chance to kill the spawned gateway.
    app.run(move |_app_handle, event| {
        if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
            // Block here so the process doesn't exit until cleanup is done.
            // tokio::runtime::Handle::block_on inside async_runtime works
            // because Tauri's runloop is on the main thread but the async
            // runtime is still spinning.
            let supervisor = supervisor_for_exit.clone();
            let tunnels = tunnels_for_exit.clone();
            tauri::async_runtime::block_on(async move {
                runtime::supervisor::shutdown_on_exit(supervisor).await;
                tunnels.shutdown_all().await;
            });
        }
    });
}

/// Collect every command for tauri-specta. This single list drives both the
/// Tauri invoke handler and the generated TypeScript bindings — adding a
/// command (annotated `#[specta::specta]`) here is the only place the
/// frontend surface changes. Generic commands are monomorphised to `Wry`.
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        commands::chat::chat_connect::<tauri::Wry>,
        commands::chat::chat_send,
        commands::chat::chat_disconnect,
        commands::chat::prepare_chat_attachments,
        commands::connection::list_connections,
        commands::connection::get_active_connection,
        commands::connection::upsert_connection::<tauri::Wry>,
        commands::connection::remove_connection::<tauri::Wry>,
        commands::connection::set_active_connection::<tauri::Wry>,
        commands::connection::reactivate::<tauri::Wry>,
        commands::connection::connection_probe,
        commands::gateway::discover_local_gateway,
        commands::gateway::ensure_token::<tauri::Wry>,
        commands::gateway::pair_with_code::<tauri::Wry>,
        commands::gateway_client::gateway_request::<tauri::Wry>,
        commands::runtime::detect_local_binary,
        commands::runtime::install_instructions,
        commands::runtime::runtime_start,
        commands::runtime::runtime_stop,
        commands::runtime::runtime_status,
        commands::ssh::ssh_open_tunnel::<tauri::Wry>,
        commands::ssh::ssh_close_tunnel,
        commands::fs::workspace_open_root,
        commands::fs::workspace_get_root,
        commands::fs::workspace_list_dir,
        commands::fs::workspace_read_file,
        commands::fs::workspace_write_file,
        commands::fs::workspace_watch_start::<tauri::Wry>,
        commands::fs::workspace_watch_stop,
        commands::fs::workspace_git_status,
    ])
}

fn install_app_menu(app: &tauri::AppHandle<tauri::Wry>) -> tauri::Result<()> {
    let focus_chat = MenuItemBuilder::with_id(MENU_FOCUS_CHAT, "Focus Chat")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let focus_code = MenuItemBuilder::with_id(MENU_FOCUS_CODE, "Focus Code")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let open_project = MenuItemBuilder::with_id(MENU_OPEN_PROJECT, "Open Project...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let new_session = MenuItemBuilder::with_id(MENU_NEW_SESSION, "New Session")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let refresh_sessions = MenuItemBuilder::with_id(MENU_REFRESH_SESSIONS, "Refresh Sessions")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    let retry_connection =
        MenuItemBuilder::with_id(MENU_RETRY_CONNECTION, "Retry Active Connection")
            .accelerator("CmdOrCtrl+Shift+R")
            .build(app)?;
    let settings = MenuItemBuilder::with_id(MENU_OPEN_SETTINGS, "Settings")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let logs = MenuItemBuilder::with_id(MENU_OPEN_LOGS, "Logs").build(app)?;
    let doctor = MenuItemBuilder::with_id(MENU_OPEN_DOCTOR, "Doctor").build(app)?;

    let workspace = SubmenuBuilder::new(app, "Workspace")
        .item(&focus_chat)
        .item(&focus_code)
        .separator()
        .item(&open_project)
        .separator()
        .item(&new_session)
        .item(&refresh_sessions)
        .separator()
        .item(&retry_connection)
        .build()?;

    let diagnostics = SubmenuBuilder::new(app, "Diagnostics")
        .item(&settings)
        .separator()
        .item(&logs)
        .item(&doctor)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&workspace)
        .item(&edit)
        .item(&diagnostics)
        .item(&window)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

fn install_tray(app: &tauri::AppHandle<tauri::Wry>) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(TRAY_SHOW_HIDE, "Show/Hide Window")
        .text(TRAY_FOCUS_CHAT, "Focus Chat")
        .separator()
        .text(TRAY_RETRY_CONNECTION, "Retry Active Connection")
        .text(TRAY_OPEN_SETTINGS, "Open Settings")
        .text(TRAY_OPEN_LOGS, "Open Logs")
        .separator()
        .text(TRAY_QUIT, "Quit")
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("ZeroClaw Workspace")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW_HIDE => {
                if let Some(window) = app.get_webview_window("main") {
                    let visible = window.is_visible().unwrap_or(false);
                    if visible {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            TRAY_FOCUS_CHAT => {
                focus_main_window(app);
                let _ = app.emit("zeroclaw://quick-invoke", ());
            }
            TRAY_RETRY_CONNECTION => {
                let _ = app.emit("zeroclaw://tray-action", "retry-active-connection");
            }
            TRAY_OPEN_SETTINGS => {
                focus_main_window(app);
                let _ = app.emit("zeroclaw://open-settings", "app");
            }
            TRAY_OPEN_LOGS => {
                focus_main_window(app);
                let _ = app.emit("zeroclaw://open-settings", "logs");
            }
            TRAY_QUIT => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    let _ = tray.build(app)?;
    Ok(())
}

fn handle_app_menu_event(app: &tauri::AppHandle<tauri::Wry>, id: &str) {
    match id {
        MENU_FOCUS_CHAT => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://focus-chat", ());
        }
        MENU_FOCUS_CODE => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://focus-code", ());
        }
        MENU_OPEN_PROJECT => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://open-project", ());
        }
        MENU_NEW_SESSION => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://new-session", ());
        }
        MENU_REFRESH_SESSIONS => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://refresh-sessions", ());
        }
        MENU_RETRY_CONNECTION => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://tray-action", "retry-active-connection");
        }
        MENU_OPEN_SETTINGS => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://open-settings", "app");
        }
        MENU_OPEN_LOGS => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://open-settings", "logs");
        }
        MENU_OPEN_DOCTOR => {
            focus_main_window(app);
            let _ = app.emit("zeroclaw://open-settings", "doctor");
        }
        _ => {}
    }
}

fn focus_main_window(app: &tauri::AppHandle<tauri::Wry>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// TypeScript export configuration. BigInt types (e.g. `DirEntry.size: u64`)
/// are emitted as JS `number` — file sizes fit well within
/// `Number.MAX_SAFE_INTEGER` and serde already serializes them as JSON numbers.
fn typescript_bindings() -> specta_typescript::Typescript {
    specta_typescript::Typescript::default()
        .bigint(specta_typescript::BigIntExportBehavior::Number)
        // The generated globals (event helpers, Channel import) are unused until
        // we register typed events; `@ts-nocheck` keeps this generated file out
        // of the project's `noUnusedLocals` check. Types are still validated at
        // every import site.
        .header("// @ts-nocheck")
}

#[cfg(test)]
mod specta_tests {
    use super::specta_builder;

    /// Write the frontend TypeScript bindings so they can be committed and
    /// shipped without a dev run. `pnpm tauri dev` regenerates them on every
    /// startup via the `#[cfg(debug_assertions)]` export in `run()`.
    #[test]
    fn export_bindings() {
        specta_builder()
            .export(super::typescript_bindings(), "../src/api/bindings.ts")
            .expect("failed to export TypeScript bindings");
    }
}

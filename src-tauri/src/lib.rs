//! ZeroClaw Workspace — application library.

pub mod chat;
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
use workspace::local_state::LocalStateStore;

const COMMAND_EVENT: &str = "zeroclaw://command";
const CMD_WORKSPACE_FOCUS_CHAT: &str = "workspace.focusChat";
const CMD_WORKSPACE_FOCUS_CODE: &str = "workspace.focusCode";
const CMD_WORKSPACE_OPEN_PROJECT: &str = "workspace.openProject";
const CMD_WORKSPACE_NEW_CHAT: &str = "workspace.newChat";
const CMD_WORKSPACE_REFRESH_CHATS: &str = "workspace.refreshChats";
const CMD_WORKSPACE_RETRY_CONNECTION: &str = "workspace.retryConnection";
const CMD_SETTINGS_OPEN: &str = "settings.open";
const CMD_SETTINGS_OPEN_SETUP_CENTER: &str = "settings.openSetupCenter";
const CMD_SETTINGS_OPEN_GATEWAY_OVERVIEW: &str = "settings.openGatewayOverview";
const CMD_SETTINGS_OPEN_MODELS_PROVIDERS: &str = "settings.openModelsProviders";
const CMD_SETTINGS_OPEN_AGENTS: &str = "settings.openAgents";
const CMD_SETTINGS_OPEN_RUNTIME_SAFETY: &str = "settings.openRuntimeSafety";
const CMD_SETTINGS_OPEN_TOOLS_SKILLS: &str = "settings.openToolsSkills";
const CMD_DIAGNOSTICS_OPEN_LOGS: &str = "diagnostics.openLogs";
const CMD_DIAGNOSTICS_OPEN_DOCTOR: &str = "diagnostics.openDoctor";
const CMD_DIAGNOSTICS_OPEN_DEVICES: &str = "diagnostics.openDevices";
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
    let local_state = LocalStateStore::new();
    let watcher: Arc<WatcherHandle> = Arc::new(WatcherHandle::default());
    let chat_manager = chat::ChatSessionManager::new();

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
        .manage(local_state.clone())
        .manage(watcher.clone())
        .manage(chat_manager.clone())
        .manage(http_client.clone())
        .invoke_handler(specta.invoke_handler())
        .on_menu_event(|app, event| handle_app_menu_event(app, event.id().as_ref()))
        .setup({
            let book = book.clone();
            let supervisor = supervisor.clone();
            let workspace_state = workspace_state.clone();
            let local_state = local_state.clone();
            move |app| {
                let app_handle = app.handle().clone();
                let book_for_setup = book.clone();
                let supervisor_for_setup = supervisor.clone();
                let workspace_state_for_setup = workspace_state.clone();
                let local_state_for_setup = local_state.clone();
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
                    if let Err(e) = local_state_for_setup.load(&app_handle).await {
                        log::error!("failed to load workspace state: {e}");
                    } else if let Some(root) = local_state_for_setup.snapshot().await.current_root {
                        workspace_state_for_setup
                            .set_root(std::path::PathBuf::from(root))
                            .await;
                    }
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
        commands::chat::chat_capabilities,
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
        commands::setup::setup_get_status,
        commands::setup::setup_run_action,
        commands::ssh::ssh_open_tunnel::<tauri::Wry>,
        commands::ssh::ssh_close_tunnel,
        commands::fs::workspace_open_root::<tauri::Wry>,
        commands::fs::workspace_get_state,
        commands::fs::workspace_import_legacy_state::<tauri::Wry>,
        commands::fs::workspace_get_root,
        commands::fs::workspace_list_dir,
        commands::fs::workspace_read_file,
        commands::fs::workspace_write_file,
        commands::fs::workspace_watch_start::<tauri::Wry>,
        commands::fs::workspace_watch_stop,
        commands::fs::workspace_git_status,
        commands::local_state::chat_local_get_selected_session,
        commands::local_state::chat_local_set_selected_session::<tauri::Wry>,
        commands::local_state::chat_local_list_session_workspaces,
        commands::local_state::chat_local_assign_session_workspace::<tauri::Wry>,
        commands::local_state::chat_local_get_transcript,
        commands::local_state::chat_local_set_transcript::<tauri::Wry>,
        commands::local_state::chat_local_clear_transcript::<tauri::Wry>,
    ])
}

fn install_app_menu(app: &tauri::AppHandle<tauri::Wry>) -> tauri::Result<()> {
    let focus_chat = MenuItemBuilder::with_id(CMD_WORKSPACE_FOCUS_CHAT, "Focus Chat")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;
    let focus_code = MenuItemBuilder::with_id(CMD_WORKSPACE_FOCUS_CODE, "Focus Code")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;
    let open_project = MenuItemBuilder::with_id(CMD_WORKSPACE_OPEN_PROJECT, "Open Project...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    let new_chat = MenuItemBuilder::with_id(CMD_WORKSPACE_NEW_CHAT, "New Chat")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let refresh_chats = MenuItemBuilder::with_id(CMD_WORKSPACE_REFRESH_CHATS, "Refresh Chats")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    let retry_connection =
        MenuItemBuilder::with_id(CMD_WORKSPACE_RETRY_CONNECTION, "Retry Active Connection")
            .accelerator("CmdOrCtrl+Shift+R")
            .build(app)?;
    let settings_open = MenuItemBuilder::with_id(CMD_SETTINGS_OPEN, "Open Settings")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let setup_center =
        MenuItemBuilder::with_id(CMD_SETTINGS_OPEN_SETUP_CENTER, "Setup Center").build(app)?;
    let gateway_overview =
        MenuItemBuilder::with_id(CMD_SETTINGS_OPEN_GATEWAY_OVERVIEW, "Gateway Overview")
            .build(app)?;
    let models_providers =
        MenuItemBuilder::with_id(CMD_SETTINGS_OPEN_MODELS_PROVIDERS, "Models & Providers")
            .build(app)?;
    let agents = MenuItemBuilder::with_id(CMD_SETTINGS_OPEN_AGENTS, "Agents").build(app)?;
    let runtime_safety =
        MenuItemBuilder::with_id(CMD_SETTINGS_OPEN_RUNTIME_SAFETY, "Runtime & Safety")
            .build(app)?;
    let tools_skills =
        MenuItemBuilder::with_id(CMD_SETTINGS_OPEN_TOOLS_SKILLS, "Tools & Skills").build(app)?;
    let logs = MenuItemBuilder::with_id(CMD_DIAGNOSTICS_OPEN_LOGS, "Logs").build(app)?;
    let doctor = MenuItemBuilder::with_id(CMD_DIAGNOSTICS_OPEN_DOCTOR, "Doctor").build(app)?;
    let devices = MenuItemBuilder::with_id(CMD_DIAGNOSTICS_OPEN_DEVICES, "Devices").build(app)?;

    let workspace = SubmenuBuilder::new(app, "Workspace")
        .item(&focus_chat)
        .item(&focus_code)
        .separator()
        .item(&open_project)
        .separator()
        .item(&new_chat)
        .item(&refresh_chats)
        .separator()
        .item(&retry_connection)
        .build()?;

    let settings = SubmenuBuilder::new(app, "Settings")
        .item(&settings_open)
        .separator()
        .item(&setup_center)
        .separator()
        .item(&gateway_overview)
        .item(&models_providers)
        .item(&agents)
        .item(&runtime_safety)
        .item(&tools_skills)
        .build()?;

    let diagnostics = SubmenuBuilder::new(app, "Diagnostics")
        .item(&logs)
        .item(&doctor)
        .item(&devices)
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
        .item(&settings)
        .item(&diagnostics)
        .item(&edit)
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
                emit_command(app, CMD_WORKSPACE_FOCUS_CHAT);
            }
            TRAY_RETRY_CONNECTION => {
                emit_command(app, CMD_WORKSPACE_RETRY_CONNECTION);
            }
            TRAY_OPEN_SETTINGS => {
                emit_command(app, CMD_SETTINGS_OPEN);
            }
            TRAY_OPEN_LOGS => {
                emit_command(app, CMD_DIAGNOSTICS_OPEN_LOGS);
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
        CMD_WORKSPACE_FOCUS_CHAT
        | CMD_WORKSPACE_FOCUS_CODE
        | CMD_WORKSPACE_OPEN_PROJECT
        | CMD_WORKSPACE_NEW_CHAT
        | CMD_WORKSPACE_REFRESH_CHATS
        | CMD_WORKSPACE_RETRY_CONNECTION
        | CMD_SETTINGS_OPEN
        | CMD_SETTINGS_OPEN_SETUP_CENTER
        | CMD_SETTINGS_OPEN_GATEWAY_OVERVIEW
        | CMD_SETTINGS_OPEN_MODELS_PROVIDERS
        | CMD_SETTINGS_OPEN_AGENTS
        | CMD_SETTINGS_OPEN_RUNTIME_SAFETY
        | CMD_SETTINGS_OPEN_TOOLS_SKILLS
        | CMD_DIAGNOSTICS_OPEN_LOGS
        | CMD_DIAGNOSTICS_OPEN_DOCTOR
        | CMD_DIAGNOSTICS_OPEN_DEVICES => emit_command(app, id),
        _ => {}
    }
}

fn emit_command(app: &tauri::AppHandle<tauri::Wry>, command: &str) {
    focus_main_window(app);
    let _ = app.emit(COMMAND_EVENT, command);
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

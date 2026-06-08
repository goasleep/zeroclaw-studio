//! ZeroClaw Workspace — application library.

pub mod commands;
pub mod connection;
pub mod gateway;
pub mod runtime;
pub mod workspace;

use commands::fs::WatcherHandle;
use connection::ssh::TunnelRegistry;
use connection::store::ConnectionBook;
use runtime::supervisor::Supervisor;
use std::sync::Arc;
use tauri::RunEvent;
use workspace::fs::WorkspaceState;

pub fn run() {
    let book = ConnectionBook::new();
    let tunnels = TunnelRegistry::new();
    let supervisor = Supervisor::new();
    let workspace_state = Arc::new(WorkspaceState::default());
    let watcher: Arc<WatcherHandle> = Arc::new(WatcherHandle::default());

    // Stash clones for the RunEvent handler below — they need to outlive
    // the Builder closures.
    let supervisor_for_exit = supervisor.clone();
    let tunnels_for_exit = tunnels.clone();

    let app = tauri::Builder::default()
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
        .invoke_handler(tauri::generate_handler![
            commands::connection::list_connections,
            commands::connection::get_active_connection,
            commands::connection::upsert_connection,
            commands::connection::remove_connection,
            commands::connection::set_active_connection,
            commands::connection::reactivate,
            commands::gateway::discover_local_gateway,
            commands::gateway::ensure_token,
            commands::gateway::pair_with_code,
            commands::runtime::detect_local_binary,
            commands::runtime::install_instructions,
            commands::runtime::runtime_start,
            commands::runtime::runtime_stop,
            commands::runtime::runtime_status,
            commands::ssh::ssh_open_tunnel,
            commands::ssh::ssh_close_tunnel,
            commands::fs::workspace_open_root,
            commands::fs::workspace_get_root,
            commands::fs::workspace_list_dir,
            commands::fs::workspace_read_file,
            commands::fs::workspace_write_file,
            commands::fs::workspace_watch_start,
            commands::fs::workspace_watch_stop,
        ])
        .setup({
            let book = book.clone();
            let supervisor = supervisor.clone();
            move |app| {
                let app_handle = app.handle().clone();
                let book_for_setup = book.clone();
                let supervisor_for_setup = supervisor.clone();
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
                        eprintln!("failed to load connections: {e}");
                        return;
                    }
                    match connection::bootstrap::try_auto_onboard(&app_handle, &book_for_setup)
                        .await
                    {
                        Ok(outcome) => {
                            eprintln!("[bootstrap] auto-onboard outcome: {outcome:?}");
                        }
                        Err(e) => {
                            eprintln!("[bootstrap] auto-onboard failed: {e}");
                        }
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
                gateway::health::spawn_health_poller(app.handle().clone(), book.clone());
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

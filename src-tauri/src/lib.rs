//! ZeroClaw Workspace — application library.

pub mod commands;
pub mod connection;
pub mod gateway;
pub mod runtime;

use connection::ssh::TunnelRegistry;
use connection::store::ConnectionBook;
use runtime::supervisor::Supervisor;
use tauri::Manager;

pub fn run() {
    let book = ConnectionBook::new();
    let tunnels = TunnelRegistry::new();
    let supervisor = Supervisor::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(book.clone())
        .manage(tunnels.clone())
        .manage(supervisor.clone())
        .invoke_handler(tauri::generate_handler![
            commands::connection::list_connections,
            commands::connection::get_active_connection,
            commands::connection::upsert_connection,
            commands::connection::remove_connection,
            commands::connection::set_active_connection,
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
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let book_for_setup = book.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = book_for_setup.load(&app_handle).await {
                    eprintln!("failed to load connections: {e}");
                }
            });
            // Health poller for the active connection.
            gateway::health::spawn_health_poller(app.handle().clone(), book.clone());
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // App is exiting — kill any managed gateway process WE spawned.
                let supervisor = supervisor.clone();
                let tunnels = tunnels.clone();
                let _ = window.app_handle().clone();
                tauri::async_runtime::block_on(async move {
                    runtime::supervisor::shutdown_on_exit(supervisor).await;
                    tunnels.shutdown_all().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

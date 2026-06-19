//! Chat domain services used by the Tauri command layer.

pub mod attachments;
pub mod session_manager;
pub mod ws_proxy;

pub use session_manager::ChatSessionManager;

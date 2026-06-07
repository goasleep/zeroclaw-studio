//! Local `zeroclaw` runtime management — binary detection, optional install
//! prompt, and process supervision for `Lifecycle::Managed` connections.
//!
//! IMPORTANT: this module is **never required to succeed**. Workspace
//! supports remote-only users who have no local `zeroclaw` binary at all.

pub mod binary;
pub mod installer;
pub mod supervisor;

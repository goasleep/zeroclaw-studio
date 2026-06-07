# Architecture

> Living document. Updated per phase. See
> [`../README.md`](../README.md) for the user-facing overview and the
> plan at `~/.claude/plans/cryptic-discovering-metcalfe.md` for the
> full roadmap.

## Goals

1. A native desktop workspace for ZeroClaw that exploits the host machine
   (file tree, watch, global shortcuts, clipboard, notifications,
   protocol handler).
2. Treat `zeroclaw` as a **connection target**, not a local dependency.
   Local install must be optional — remote homelab / cloud / Pi users
   should have a first-class experience.
3. Strict superset of the existing `web/` dashboard.
4. Independent release cadence, independent repo. No Rust-level coupling
   to the `zeroclaw-*` crates in the main repo.

## Non-goals

- Replace the gateway. The workspace is a UI; all agent execution still
  happens inside `zeroclaw`.
- Replace `apps/tauri/` in the main repo. That stays as a minimal tray
  launcher; this is a different product targeting a different use case.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│ React + Vite frontend (src/)                                 │
│  features/   workspace/   components/   api/                 │
└────────────────────────────┬─────────────────────────────────┘
                             │ Tauri IPC + HTTP/WS direct
┌────────────────────────────▼─────────────────────────────────┐
│ Tauri Rust backend (src-tauri/src/)                          │
│  commands/   connection/   runtime/   workspace/   platform/ │
└─────┬───────────────────────────────────────────┬────────────┘
      │ tokio::process for managed                │ reqwest / tungstenite
      │ local zeroclaw                            │ to any reachable gateway
      ▼                                           ▼
   `zeroclaw` binary on this host              zeroclaw gateway
   (only if connection.lifecycle = managed)    (local, remote, SSH-tunneled)
```

## Connection model

The unit of "what gateway am I talking to" is a `Connection`:

```rust
struct Connection {
    id: Uuid,
    name: String,
    transport: Transport,   // Local, Http, Ssh, Tailscale
    url: Url,
    ssh: Option<SshConfig>,
    auth: AuthConfig,
    lifecycle: Lifecycle,   // Managed, Attach, Remote
    binary_path: Option<PathBuf>,   // only for Managed
}
```

- `Managed`: workspace spawns and owns the local `zeroclaw` process.
- `Attach`: gateway is already running locally; workspace just connects.
- `Remote`: gateway lives elsewhere, reached via direct URL, SSH tunnel,
  Tailscale, etc.

**Spawn ownership is strict.** The supervisor only kills processes the
workspace itself spawned. Externally-managed gateways are never touched.

## Phase status

- **Phase 0** ✅ scaffold, empty window opens via `pnpm tauri dev`
- **Phase 1** ✅ connection management — local managed/attach, remote http/ssh, welcome wizard
- **Phase 2** ✅ auth + REST plumbing — apiFetch with bearer + 401 dispatch + ApiError, WS chat client, SSE events client
- **Phase 3** ✅ workspace shell + file system pane — three resizable panels, notify-based watch, ignore rules, multi-select files queued for chat
- **Phase 4** ✅ chat parity — streaming WS, frame taxonomy, tool calls, approval banner, markdown render, file-attachment integration
- **Phase 5** ✅ native quick-interaction capabilities — global Cmd+Shift+Space, clipboard paste, native notifications on approval/done, zeroclaw:// deep links
- **Phase 6** – remaining `web/` feature parity
- **Phase 7** – distribution + upstream PRs

See plan file at `~/.claude/plans/cryptic-discovering-metcalfe.md`.

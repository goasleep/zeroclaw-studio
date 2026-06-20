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
    runtime_source: RuntimeSource, // BundledInner, ExternalPath, Attached
    binary_path: Option<PathBuf>,   // only for ExternalPath managed
}
```

- `Managed`: workspace spawns and owns a local `zeroclaw` process.
- `BundledInner`: app-private managed runtime shipped as a sidecar. It uses
  its own config dir under the Tauri app-data directory and never uses port
  `42617`.
- `ExternalPath`: managed runtime using a user-installed or user-selected
  `zeroclaw` binary.
- `Attach`: gateway is already running locally; workspace just connects.
- `Remote`: gateway lives elsewhere, reached via direct URL, SSH tunnel,
  Tailscale, etc.

**Spawn ownership is strict.** The supervisor only kills processes the
workspace itself spawned. Externally-managed gateways are never touched.

## Connection activation (auto-start)

Whenever a connection becomes active — at app startup, when the user picks
it in the picker, or right after it was just created — `connection/
activator.rs` runs the same workflow on the backend:

1. **Probe** `Connection.url` for an existing healthy gateway.
2. If down AND the connection is local-loopback, **spawn** a managed
   `zeroclaw gateway start -p <port>` via `runtime/supervisor.rs`. Bundled
   inner connections use the Tauri sidecar and app-private config dir;
   external managed connections use the stored binary path or re-run
   `runtime::binary::detect` for `$PATH` / well-known install dirs.
3. **Await health** (`/health` poll, 15s timeout, 300ms interval).
4. **Pair** via `gateway::pair::ensure_token` — reuses existing token if
   still valid, otherwise mints a fresh one on localhost (or surfaces
   `needs_manual_pairing` for remote gateways where the admin endpoint is
   unreachable).

Every step emits a `zeroclaw://activation` Tauri event the connection
context subscribes to, so the picker shows live progress ("starting
gateway…", "pairing…", etc.) without polling.

## First-run auto-onboard

`connection/bootstrap.rs::try_auto_onboard` runs once at startup, **before**
the activator. It only fires when the user's saved-connections list is
empty (idempotent — never overwrites existing connections):

- Synthesize an `Inner zeroclaw` bundled connection, choose an app-private
  localhost port outside `42617`, persist, and mark active.

Result: a fresh install brings up a fully-paired app-private gateway and the
workspace UI in one step, without touching the user's `~/.zeroclaw/` or any
gateway already listening on `127.0.0.1:42617`.

## Phase status

- **Phase 0** ✅ scaffold, empty window opens via `pnpm tauri dev`
- **Phase 1** ✅ connection management — local managed/attach, remote http/ssh, welcome wizard
- **Phase 2** ✅ auth + REST plumbing — apiFetch with bearer + 401 dispatch + ApiError, WS chat client, SSE events client
- **Phase 3** ✅ workspace shell + file system pane — three resizable panels, notify-based watch, ignore rules, multi-select files queued for chat
- **Phase 4** ✅ chat parity — streaming WS, frame taxonomy, tool calls, approval banner, markdown render, file-attachment integration
- **Phase 5** ✅ native quick-interaction capabilities — global Cmd+Shift+Space, clipboard paste, native notifications on approval/done, zeroclaw:// deep links
- **Phase 6** ✅ web/ feature parity — memory, config, cron, tools, integrations, channels, logs, doctor, devices panels wired
- **Phase 7** ✅ distribution — release workflow for tag-triggered multi-OS builds (dmg/app/deb/AppImage/msi/nsis), CHANGELOG, CONTRIBUTING

See plan file at `~/.claude/plans/cryptic-discovering-metcalfe.md`.

# 🦀 ZeroClaw Studio

[English](README.md) | [简体中文](README.zh-CN.md)

> A native AI productivity workspace powered by
> [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw). Run agent work where
> your files, machines, tools, memory, and automations already live.

ZeroClaw Studio ships with a pinned, app-private `zeroclaw` runtime, so a
fresh install can start a local gateway without installing the CLI first. When
your work needs to run somewhere else, connect the same desktop app to a local,
attached, or remote ZeroClaw gateway over HTTP, WebSocket, and SSE.

[Download the latest release](https://github.com/goasleep/zeroclaw-studio/releases)
· [Quick start](#quick-start)
· [Runtime modes](#runtime-modes)
· [Security notes](#security-notes)
· [Development](#development)

## What this is

`zeroclaw-studio` is a Tauri 2 desktop app for getting real work done across
local files, remote machines, tools, memory, scheduled jobs, and long-running
agent sessions. It is the product surface for ZeroClaw-powered work: the desktop
app gives you a focused workspace, while `zeroclaw` provides the lightweight
runtime and gateway underneath.

The default path is local and simple: launch the app, use the bundled
app-private runtime, pair the workspace, open a folder, and start a chat. The
same app can also attach to a user-managed local gateway or connect to a remote
gateway over trusted network paths.

Instead of treating AI as a single chat box, the workspace lets you choose
where work should run:

- run quick local tasks on your laptop,
- keep long-running automations on a homelab Pi or NAS,
- use a cloud VM for always-on or heavier jobs,
- reach private resources through SSH, Tailscale, VPN, or an internal host.

ZeroClaw's low deployment cost is the point: AI capabilities can live wherever
your work already lives, while the desktop app gives you one place to connect,
operate, observe, and intervene.

The Studio UI is cross-platform. The bundled inner runtime keeps its own
app-data config directory and never modifies your user-level `~/.zeroclaw/`.

## Built-in ZeroClaw

The bundled runtime is a core part of the product. Release builds include a
pinned `zeroclaw` sidecar that the app can start and supervise as an isolated
inner runtime. That gives first-run users a real local ZeroClaw gateway without
requiring a separate CLI install.

The isolation is intentional:

- the bundled runtime uses an app-private data directory,
- it sets `ZEROCLAW_CONFIG_DIR` and `ZEROCLAW_HOME` for the child process,
- it avoids the default user-level `~/.zeroclaw/`,
- it does not prevent you from connecting to your own gateway later.

The bundled gateway brings ZeroClaw's runtime model into the app: sessions,
tools, memory, cron, logs, doctor checks, pairing, and gateway events where
supported by the pinned runtime.

## Use cases

- **Start local without setup** — download the desktop app, use the bundled
  runtime, open a project folder, and start working.
- **Work across machines** — keep the desktop UI on your laptop while the
  gateway runs on a homelab Pi, NAS, workstation, or cloud VM.
- **Keep long-running tasks close to the resources they need** — run scheduled
  jobs and automations near private files, internal APIs, or always-on hosts.
- **Observe and intervene** — use one native workspace for chat, tool progress,
  memory, cron, logs, doctor checks, config, and approvals.
- **Choose the trust boundary** — use the app-private runtime for local work, or
  connect only to remote gateways you administer and trust.

## Features

- **One native workspace** for local files, remote machines, tools, memory,
  scheduled tasks, and long-running agent work.
- **Built-in `zeroclaw` included** through a pinned sidecar used by the
  app-private inner runtime.
- **Flexible gateway topology** across bundled, local-managed, local-attached,
  and remote gateways.
- **Remote-first networking** through direct HTTP(S), SSH tunnels, Tailscale,
  VPNs, and private network routes.
- **Project-scoped chat sessions** with markdown responses, tool-call progress,
  approval prompts, file attachments, and stable per-session agent/model
  context.
- **Operational panels** for tools, memory, cron, logs, doctor, devices,
  integrations, and config.
- **Native desktop affordances** including folder picker, file watcher, global
  shortcut, clipboard, notifications, and `zeroclaw://` deep links.
- **Independent client, simple gateway contract** with no Rust-level coupling
  to the main `zeroclaw` repo.

## Interface overview

| Area                     | What it shows                                                                                                                                                                             | Preview                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Workspace chat           | A project-scoped chat session connected to the local `zeroclaw` runtime, with runtime status, workspace context, session history, attachments, and agent selection in one desktop window. | ![ZeroClaw Studio desktop chat workspace](images/workspace-chat.png)   |
| Runtime and app settings | Local runtime state, workspace folder context, preferences, native notifications, tray integration, deep-link registration, and the operations/capabilities navigation surface.           | ![ZeroClaw Studio desktop settings panel](images/runtime-settings.png) |

## Runtime modes

| Mode                  | Needs local `zeroclaw` install? | Best for                                                                                             |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Bundled inner runtime | No                              | First run, local project work, and trying the app without CLI setup                                  |
| Local & managed       | Yes                             | Using your own local `zeroclaw` binary while letting the workspace supervise it                      |
| Local & attached      | Already running locally         | Connecting to a gateway managed by launchd, systemd, `zeroclaw service start`, or another supervisor |
| Remote                | No                              | Managing a homelab, server, workstation, or cloud VM from your desktop                               |

## What this is NOT

- Not the system tray launcher at `zeroclaw-labs/zeroclaw` `apps/tauri/`
  (that's `zeroclaw-desktop`, a thin WebView shell of the gateway's web UI).
  This is a separate, fuller client.
- Not a fork of `zeroclaw`. It has no Rust-level coupling to the main repo
  crates; it only depends on the gateway HTTP/WS contract and (optionally,
  for managed connections) the `zeroclaw` binary.

## Install

Prebuilt desktop artifacts are produced by tag-triggered GitHub releases:

- macOS arm64: `.dmg` / `.app`
- Linux: `.deb` / AppImage
- Windows: `.msi` / NSIS `.exe`

Download the latest published build from
[GitHub Releases](https://github.com/goasleep/zeroclaw-studio/releases).

Release builds include the pinned bundled `zeroclaw v0.8.0` sidecar used by the
app-private inner runtime. You can still point the app at your own local or
remote gateway when you want a different runtime.

The built-in runtime stores its ZeroClaw data under the app's per-user Tauri
data directory, in the `inner-zeroclaw/` subdirectory. At launch, the workspace
sets both `ZEROCLAW_CONFIG_DIR` and `ZEROCLAW_HOME` to that directory, keeping
the bundled runtime separate from your user-level `~/.zeroclaw/`.

Current release artifacts are unsigned. On macOS, Gatekeeper may require
removing the quarantine attribute after installation:

```bash
xattr -dr com.apple.quarantine /Applications/ZeroClaw\ Studio.app
```

Signed and notarized builds are planned for a later release.

## Quick start

Fresh installs can start with the bundled app-private `zeroclaw` gateway, so
you can try local workflows without installing `zeroclaw` separately. You can
also connect to gateways on the same machine, on another host, or behind an
SSH/Tailscale/VPN route.

1. Launch ZeroClaw Studio.
2. Use the bundled inner runtime, or choose another connection mode:
   - **Local & managed** — let the workspace find and supervise a local
     user-installed `zeroclaw` binary.
   - **Local & attached** — connect to a gateway you already started.
   - **Remote** — enter a reachable URL or configure an SSH-tunneled target.
3. Pair the workspace with the gateway when prompted.
4. Open a workspace folder, pick an agent, and start a chat.

Each chat session keeps its agent context stable once messages exist. Start a
new session when you want to switch to another agent for the same workspace.

The desktop app does not require a user-installed `zeroclaw` unless you want a
managed external local connection.

## Gateway compatibility

ZeroClaw Studio talks to the gateway over HTTP, WebSocket, and SSE. Gateway
compatibility is not stable yet; gateway contract changes should be tested
against the matching `zeroclaw` build.

## Platform support

The project targets current stable Tauri 2 desktop platforms:

| Platform | Architecture | Status                      |
| -------- | ------------ | --------------------------- |
| macOS    | arm64        | Supported by release builds |
| Linux    | x86_64       | Supported by release builds |
| Windows  | x86_64       | Supported by release builds |

Source builds may work on additional targets when Tauri and a compatible
`zeroclaw` gateway are available, but those targets are not part of the release
matrix yet.

## Development

Requirements:

- Rust stable (pinned in `rust-toolchain.toml`)
- Node 22+ (pinned in `.nvmrc`)
- pnpm
- Tauri 2 system dependencies for your OS

```bash
pnpm install
pnpm desktop:dev
```

Useful checks:

```bash
pnpm check
pnpm rust:check
```

Build a packaged desktop app:

```bash
pnpm desktop:build
```

For formatting, generated Tauri command bindings, and PR workflow, see
[`docs/development.md`](docs/development.md).

## Repository layout

- `src/` — React + Vite frontend.
- `src-tauri/` — Tauri Rust backend, native commands, gateway client, runtime
  supervision, connection storage, and workspace file integration.
- `docs/` — architecture, development guide, and gateway protocol notes.
- `.github/workflows/` — CI and release automation.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — product and technical model.
- [`docs/development.md`](docs/development.md) — local development workflow.
- [`docs/gateway-protocol-notes.md`](docs/gateway-protocol-notes.md) — gateway
  protocol notes.
- [`docs/product-data-boundaries.md`](docs/product-data-boundaries.md) — product
  data ownership between Studio, ZeroClaw, and user resources.
- [`SECURITY.md`](SECURITY.md) — supported versions, vulnerability reporting,
  data boundaries, and security notes.

## Security notes

This is a desktop app with native capabilities. It can connect to remote
gateways, store gateway tokens in per-user app data, open SSH tunnels, read and
write files in the selected workspace, access clipboard text through explicit
features, and spawn a managed local `zeroclaw` process.

Only connect to gateways you administer or trust. See [`SECURITY.md`](SECURITY.md)
before using the app with sensitive repositories, private hosts, or shared
diagnostic logs.

## Data and privacy at a glance

- Gateway tokens are stored in per-user app data, not the OS keychain yet.
- Built-in `zeroclaw` data lives in the app data `inner-zeroclaw/` directory,
  separate from your user-level `~/.zeroclaw/`.
- Workspace file features operate on the folder you open in the app.
- Remote gateways can influence data shown in the UI; connect only to gateways
  you trust.
- Redact tokens, private URLs, hostnames, file paths, and personal data before
  sharing logs or diagnostic archives.

## Known limitations

- Interfaces and gateway compatibility can change before a stable release.
- Release artifacts are not yet signed or notarized.
- Gateway bearer tokens are currently stored in the per-user Tauri store rather
  than the OS keychain.
- Frontend coverage is currently lighter than Rust coverage; run the documented
  checks before opening PRs.
- Some gateway schemas are inferred from upstream source until broader OpenAPI
  coverage lands.

## Contributing

Contributions are welcome while the project is still taking shape. Start with
[`CONTRIBUTING.md`](CONTRIBUTING.md), run the checks above, and update the
relevant docs when changing gateway behavior, native capabilities, or reused
upstream code.

The npm package and Rust crate are intentionally not published. Desktop
releases are distributed through GitHub Releases.

## License

Dual-licensed under MIT or Apache-2.0, matching the upstream `zeroclaw` repo.
See [`LICENSE-MIT`](LICENSE-MIT) and [`LICENSE-APACHE`](LICENSE-APACHE).

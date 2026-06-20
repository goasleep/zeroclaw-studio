# 🦀 zeroclaw-workspace

[English](README.md) | [简体中文](README.zh-CN.md)

> A distributed AI productivity workspace powered by
> [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw).
> Turn any local or remote `zeroclaw` node into part of one native workspace
> for files, chat, tools, memory, scheduled tasks, clipboard, notifications,
> and long-running agent work.

## What this is

`zeroclaw-workspace` is a Tauri 2 desktop app for getting real work done
across local files, remote machines, tools, memory, and automations. The
desktop app is the productivity layer; `zeroclaw` is the lightweight runtime
underneath it.

The app can start its own bundled `zeroclaw` gateway, attach to an existing
local gateway, or connect to a remote gateway over trusted network paths. That
means first-run local use does not require installing the `zeroclaw` CLI first,
while remote and homelab workflows stay first-class.

Instead of treating AI as a single chat box, the workspace lets you choose
where work should run:

- run quick local tasks on your laptop,
- keep long-running automations on a homelab Pi or NAS,
- use a cloud VM for always-on or heavier jobs,
- reach private resources through SSH, Tailscale, VPN, or an internal host.

The app is independent from the main `zeroclaw` repo. It speaks to a
`zeroclaw` gateway over HTTP/WebSocket, and each gateway can be:

- **Local & managed** — workspace spawns and supervises a `zeroclaw` process.
- **Inner runtime** — fresh installs get an app-private bundled `zeroclaw`
  runtime, isolated from your `~/.zeroclaw/` and the default gateway port.
- **Local & attached** — workspace connects to a gateway you already started
  (systemd, launchd, `zeroclaw service start`, …).
- **Remote** — point at any reachable URL (SSH tunnel, Tailscale, VPN, public TLS).
  You don't need `zeroclaw` installed locally at all — manage a homelab Pi
  or a cloud VM from your laptop.

ZeroClaw's low deployment cost is the point: AI capabilities can live wherever
your work already lives, while the desktop app gives you one place to connect,
operate, observe, and intervene.

The workspace UI is cross-platform. The bundled inner runtime keeps its own
app-data config directory and never modifies your user-level `~/.zeroclaw/`.

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
[GitHub Releases](https://github.com/goasleep/zeroclaw-workspace/releases).

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
xattr -dr com.apple.quarantine /Applications/ZeroClaw\ Workspace.app
```

Signed and notarized builds are planned for a later release.

## Quick start

Fresh installs can start with the bundled app-private `zeroclaw` gateway, so
you can try local workflows without installing `zeroclaw` separately. You can
also connect to gateways on the same machine, on another host, or behind an
SSH/Tailscale/VPN route.

1. Launch ZeroClaw Workspace.
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

ZeroClaw Workspace talks to the gateway over HTTP, WebSocket, and SSE. Gateway
compatibility is not stable yet; gateway contract changes should be tested
against the matching `zeroclaw` build.

## Platform support

The project targets current stable Tauri 2 desktop platforms:

| Platform | Architecture | Status |
| --- | --- | --- |
| macOS | arm64 | Supported by release builds |
| Linux | x86_64 | Supported by release builds |
| Windows | x86_64 | Supported by release builds |

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

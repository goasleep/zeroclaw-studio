# 🦀 zeroclaw-workspace

> A distributed AI productivity workspace powered by
> [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw).
> Turn any local or remote `zeroclaw` node into part of one native workspace
> for files, chat, tools, memory, scheduled tasks, clipboard, notifications,
> and long-running agent work.

**Status:** early development. See [`docs/architecture.md`](docs/architecture.md).

## Highlights

- Native Tauri 2 desktop app for macOS, Linux, and Windows.
- Connects to local-managed, local-attached, and remote ZeroClaw gateways.
- Supports direct HTTP(S), SSH tunnels, Tailscale, VPNs, and private network
  routes.
- Provides one workspace for chat, files, tools, memory, cron, logs, doctor,
  devices, integrations, and config.
- Keeps chat sessions project-scoped, with markdown responses, tool-call
  progress, approval prompts, and per-session agent/model context.
- Adds native desktop affordances: folder picker, file watcher, global
  shortcut, clipboard, notifications, and `zeroclaw://` deep links.
- Keeps the workspace client independent from the main `zeroclaw` repo; the
  gateway contract is HTTP/WebSocket/SSE.

## What this is

`zeroclaw-workspace` is a Tauri 2 desktop app for getting real work done
across local files, remote machines, tools, memory, and automations. The
desktop app is the productivity layer; `zeroclaw` is the lightweight runtime
underneath it.

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

The workspace UI itself runs everywhere. The bundled inner runtime keeps its
own app-data config directory and never modifies your user-level `~/.zeroclaw/`.

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

Download the latest draft or published build from
[GitHub Releases](https://github.com/goasleep/zeroclaw-workspace/releases).

Early releases are currently unsigned. On macOS, Gatekeeper may require
removing the quarantine attribute after installation:

```bash
xattr -dr com.apple.quarantine /Applications/ZeroClaw\ Workspace.app
```

Signed and notarized builds are planned for a later release.
Intel macOS builds are paused while the pinned bundled `zeroclaw v0.8.0`
release lacks an `x86_64-apple-darwin` artifact.

## Quick start

You need a reachable ZeroClaw gateway. Fresh installs start with a bundled
app-private gateway, and you can still connect to gateways on the same machine,
on another host, or behind an SSH/Tailscale/VPN route.

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

The desktop app does not require `zeroclaw` to be installed locally unless you
want a managed external local connection.

## Gateway compatibility

ZeroClaw Workspace talks to the gateway over HTTP, WebSocket, and SSE. The
current endpoint map lives in
[`docs/gateway-protocol-notes.md`](docs/gateway-protocol-notes.md).

The project is still before a stable compatibility promise. If a change touches
the gateway contract, update the protocol notes and test against the matching
`zeroclaw` gateway build.

## Platform support

The project targets current stable Tauri 2 desktop platforms:

| Platform | Architecture | Status |
| --- | --- | --- |
| macOS | arm64 | Supported by release builds |
| macOS | x86_64 | Paused until bundled `zeroclaw` artifacts are available |
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
- Tauri 2 system dependencies (see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites))

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
- `docs/` — architecture, development guide, gateway protocol notes, and reuse
  attribution.
- `.github/workflows/` — CI and release automation.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — product and technical model.
- [`docs/development.md`](docs/development.md) — local development workflow.
- [`docs/gateway-protocol-notes.md`](docs/gateway-protocol-notes.md) — gateway
  HTTP/WS/SSE endpoint map.
- [`docs/reuse-attribution.md`](docs/reuse-attribution.md) — copied or ported
  upstream files.
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

## Known limitations

- The project is in early development; interfaces and gateway compatibility can
  change before a stable release.
- Release artifacts are not yet signed or notarized.
- Gateway bearer tokens are currently stored in the per-user Tauri store rather
  than the OS keychain.
- Frontend coverage is currently lighter than Rust coverage; run the documented
  checks before opening PRs.
- Some gateway schemas are inferred from upstream source until broader OpenAPI
  coverage lands.

## Roadmap and governance

Current priorities are tracked through
[GitHub Issues](https://github.com/goasleep/zeroclaw-workspace/issues) and
[GitHub Milestones](https://github.com/goasleep/zeroclaw-workspace/milestones).
Good first contributions include documentation fixes, focused UI polish,
platform-specific build feedback, and small gateway-compatibility improvements.

The repository is source-available and open for contributions, but the npm
package and Rust crate are intentionally not published. Desktop releases are
distributed through GitHub Releases.

## Reuse attribution

Some files are ported from `zeroclaw-labs/zeroclaw` under its dual MIT/Apache-2.0
license. See [`docs/reuse-attribution.md`](docs/reuse-attribution.md) for the
exact list.

## Contributing

Contributions are welcome while the project is still taking shape. Start with
[`CONTRIBUTING.md`](CONTRIBUTING.md), run the checks above, and update the
relevant docs when changing gateway behavior, native capabilities, or reused
upstream code.

## License

Dual-licensed under MIT or Apache-2.0, matching the upstream `zeroclaw` repo.
See [`LICENSE-MIT`](LICENSE-MIT) and [`LICENSE-APACHE`](LICENSE-APACHE).

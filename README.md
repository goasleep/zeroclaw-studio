# 🦀 zeroclaw-workspace

> A distributed AI productivity workspace powered by
> [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw).
> Turn any local or remote `zeroclaw` node into part of one native workspace
> for files, chat, tools, memory, scheduled tasks, clipboard, notifications,
> and long-running agent work.

**Status:** early development. See [`docs/architecture.md`](docs/architecture.md).

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
- **Local & attached** — workspace connects to a gateway you already started
  (systemd, launchd, `zeroclaw service start`, …).
- **Remote** — point at any reachable URL (SSH tunnel, Tailscale, VPN, public TLS).
  You don't need `zeroclaw` installed locally at all — manage a homelab Pi
  or a cloud VM from your laptop.

ZeroClaw's low deployment cost is the point: AI capabilities can live wherever
your work already lives, while the desktop app gives you one place to connect,
operate, observe, and intervene.

The workspace UI itself runs everywhere — installing it never installs or
modifies anything in `~/.zeroclaw/` on machines it doesn't manage.

## What this is NOT

- Not the system tray launcher at `zeroclaw-labs/zeroclaw` `apps/tauri/`
  (that's `zeroclaw-desktop`, a thin WebView shell of the gateway's web UI).
  This is a separate, fuller client.
- Not a fork of `zeroclaw`. It has no Rust-level coupling to the main repo
  crates; it only depends on the gateway HTTP/WS contract and (optionally,
  for managed connections) the `zeroclaw` binary.

## Development

Requirements:

- Rust stable (pinned in `rust-toolchain.toml`)
- Node 22+ (pinned in `.nvmrc`)
- pnpm
- Tauri 2 system dependencies (see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites))

```bash
pnpm install
pnpm tauri dev
```

## Reuse attribution

Some files are ported from `zeroclaw-labs/zeroclaw` under its dual MIT/Apache-2.0
license. See [`docs/reuse-attribution.md`](docs/reuse-attribution.md) for the
exact list.

## License

Dual-licensed under MIT or Apache-2.0, matching the upstream `zeroclaw` repo.
See [`LICENSE-MIT`](LICENSE-MIT) and [`LICENSE-APACHE`](LICENSE-APACHE).
